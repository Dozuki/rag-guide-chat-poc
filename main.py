import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import inngest
import inngest.fast_api
from dotenv import load_dotenv
import uuid
import os
import datetime
import boto3
import json
from typing import Literal, Optional
from pydantic import BaseModel, Field
from data_loader import load_and_chunk_guide, embed_texts, fetch_guide_list, fetch_guide
from vector_db import QdrantStorage
from custom_types import RAQQueryResult, RAGSearchResult, RAGUpsertResult, RAGChunkAndSrc

load_dotenv()

bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-east-1'
)

inngest_client = inngest.Inngest(
    app_id="rag_app",
    logger=logging.getLogger("uvicorn"),
    is_production=False,
    serializer=inngest.PydanticSerializer()
)

logger = logging.getLogger("rag_app")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    token: Optional[str] = None


def _retrieve_context(question: str, top_k: int) -> RAGSearchResult:
    query_vec = embed_texts([question])[0]
    with QdrantStorage() as store:
        found = store.search(query_vec, top_k)
    return RAGSearchResult(
        contexts=found["contexts"],
        sources=found["sources"],
        guide_ids=found.get("guide_ids", []),
    )


def _collect_source_guides(guide_ids: list[int], token: Optional[str]) -> list[dict]:
    if not guide_ids or not token:
        return []

    source_guides: list[dict] = []
    for gid in guide_ids:
        try:
            guide_data = fetch_guide(gid, token)
            source_guides.append(
                {
                    "guide_id": gid,
                    "title": guide_data.get("title", f"Guide {gid}"),
                    "url": guide_data.get("url", ""),
                }
            )
        except Exception as exc:
            logger.warning("Unable to fetch guide %s: %s", gid, exc)
    return source_guides


def _invoke_claude_with_context(
    question: str,
    contexts: list[str],
    conversation_history: Optional[list[str]] = None
) -> str:
    context_block = "\n\n".join(f"- {c}" for c in contexts)
    prompt_sections = []

    if conversation_history:
        prompt_sections.append(
            "Conversation so far:\n" + "\n".join(conversation_history)
        )

    if context_block:
        prompt_sections.append(
            "Relevant information from documentation:\n" + context_block
        )

    prompt_sections.append(f"User question: {question}")
    user_content = "\n\n".join(prompt_sections)

    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "temperature": 0.1,
            "system": "You are a professional technical assistant. Answer questions precisely and accurately using only the information provided. Do not add general advice or assumptions beyond what is stated in the documentation. Be clear, direct, and specific to the procedures described.",
            "messages": [
                {
                    "role": "user",
                    "content": user_content,
                }
            ],
        }
    )

    response = bedrock_runtime.invoke_model(
        modelId="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        body=body,
        contentType="application/json",
        accept="application/json",
    )

    response_body = json.loads(response["body"].read())
    return response_body["content"][0]["text"].strip()


@inngest_client.create_function(
    fn_id="RAG: Ingest Guide",
    trigger=inngest.TriggerEvent(event="rag/ingest_guide"),
    throttle=inngest.Throttle(
        limit=2, period=datetime.timedelta(minutes=1)
    ),
    rate_limit=inngest.RateLimit(
        limit=1,
        period=datetime.timedelta(hours=4),
        key="event.data.source_id",
    ),
)
async def rag_ingest_guide(ctx: inngest.Context):
    guide_id = ctx.event.data["guide_id"]

    def _load(ctx: inngest.Context) -> RAGChunkAndSrc:
        guide_id = ctx.event.data["guide_id"]
        token = ctx.event.data["token"]
        source_id = ctx.event.data.get("source_id", f"guide_{guide_id}")
        chunks = load_and_chunk_guide(guide_id, token)
        return RAGChunkAndSrc(chunks=chunks, source_id=source_id)

    def _upsert(chunks_and_src: RAGChunkAndSrc, guide_id: int) -> RAGUpsertResult:
        chunks = chunks_and_src.chunks
        source_id = chunks_and_src.source_id
        vecs = embed_texts(chunks)
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL,
                   f"{source_id}:{i}")) for i in range(len(chunks))]
        payloads = [{"source": source_id, "text": chunks[i], "guide_id": guide_id}
                    for i in range(len(chunks))]
        with QdrantStorage() as storage:
            storage.upsert(ids, vecs, payloads)
        return RAGUpsertResult(ingested=len(chunks))

    chunks_and_src = await ctx.step.run("load-and-chunk", lambda: _load(ctx), output_type=RAGChunkAndSrc)
    ingested = await ctx.step.run("embed-and-upsert", lambda: _upsert(chunks_and_src, guide_id), output_type=RAGUpsertResult)
    return ingested.model_dump()


@inngest_client.create_function(
    fn_id="RAG: Ingest Site",
    trigger=inngest.TriggerEvent(event="rag/ingest_site"),
    concurrency=[
        inngest.Concurrency(
            limit=1,
            key="event.data.site_id"
        )
    ]
)
async def rag_ingest_site(ctx: inngest.Context):
    """Ingest all guides from a Dozuki site with progress tracking."""
    token = ctx.event.data["token"]
    site_id = ctx.event.data.get("site_id", "hansaw")
    batch_size = ctx.event.data.get("batch_size", 10)

    # Initialize or retrieve progress state
    progress = await ctx.step.run(
        "init-progress",
        lambda: {
            "total_guides": 0,
            "processed_guides": 0,
            "failed_guides": 0,
            "total_chunks": 0,
            "current_offset": 0,
            "errors": [],
            "status": "running"
        }
    )

    # Fetch all guides to get count (API returns array directly)
    all_guides = []
    offset = 0
    while True:
        batch = await ctx.step.run(
            f"fetch-list-{offset}",
            lambda off=offset: fetch_guide_list(token, offset=off, limit=200)
        )
        if not batch:
            break
        all_guides.extend(batch)
        if len(batch) < 200:
            break
        offset += 200

    total_guides = len(all_guides)

    # Update progress with total count
    await ctx.step.send_event(
        "update-progress",
        [inngest.Event(
            name="rag/site_progress",
            data={
                "site_id": site_id,
                "total_guides": total_guides,
                "processed_guides": 0,
                "status": "fetching"
            }
        )]
    )

    processed = 0
    total_chunks = 0
    errors = []
    resume_offset = ctx.event.data.get("resume_offset", 0)

    # Process guides from resume_offset
    for i in range(resume_offset, len(all_guides)):
        guide_summary = all_guides[i]
        guide_id = guide_summary.get("guideid")

        if not guide_id:
            continue

        # Check for pause event every 5 guides
        if i > 0 and i % 5 == 0:
            pause_check = await ctx.step.wait_for_event(
                f"pause-check-{i}",
                event="rag/pause_site_ingestion",
                timeout=datetime.timedelta(seconds=1),
                if_exp="event.data.site_id"
            )

            if pause_check:
                await ctx.step.send_event(
                    "paused",
                    [inngest.Event(
                        name="rag/site_progress",
                        data={
                            "site_id": site_id,
                            "status": "paused",
                            "processed_guides": processed,
                            "resume_offset": i,
                            "total_guides": total_guides
                        }
                    )]
                )
                return {
                    "status": "paused",
                    "processed_guides": processed,
                    "resume_offset": i,
                    "total_guides": total_guides
                }

        try:
            # Process individual guide
            result = await ctx.step.run(
                f"process-guide-{guide_id}",
                lambda gid=guide_id: process_single_guide(gid, token, site_id)
            )

            processed += 1
            total_chunks += result.get("chunks", 0)

            # Send progress update
            await ctx.step.send_event(
                f"progress-{guide_id}",
                [inngest.Event(
                    name="rag/site_progress",
                    data={
                        "site_id": site_id,
                        "total_guides": total_guides,
                        "processed_guides": processed,
                        "total_chunks": total_chunks,
                        "status": "processing",
                        "current_guide": guide_summary.get("title", f"Guide {guide_id}"),
                        "percentage": round((processed / total_guides) * 100, 1)
                    }
                )]
            )

        except Exception as e:
            errors.append({
                "guide_id": guide_id,
                "title": guide_summary.get("title", f"Guide {guide_id}"),
                "error": str(e)
            })

            # Continue processing even if one guide fails
            await ctx.step.send_event(
                f"error-{guide_id}",
                [inngest.Event(
                    name="rag/site_progress",
                    data={
                        "site_id": site_id,
                        "error": f"Failed to process guide {guide_id}: {str(e)}",
                        "processed_guides": processed,
                        "failed_guides": len(errors)
                    }
                )]
            )

    # Final progress update
    await ctx.step.send_event(
        "completed",
        [inngest.Event(
            name="rag/site_progress",
            data={
                "site_id": site_id,
                "status": "completed",
                "total_guides": total_guides,
                "processed_guides": processed,
                "failed_guides": len(errors),
                "total_chunks": total_chunks,
                "errors": errors
            }
        )]
    )

    return {
        "status": "completed",
        "processed_guides": processed,
        "failed_guides": len(errors),
        "total_chunks": total_chunks,
        "errors": errors
    }


def process_single_guide(guide_id: int, token: str, site_id: str) -> dict:
    """Process a single guide and return chunk count."""
    try:
        chunks = load_and_chunk_guide(guide_id, token)
        if not chunks:
            return {"chunks": 0}

        vecs = embed_texts(chunks)
        source_id = f"{site_id}_guide_{guide_id}"
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL,
                   f"{source_id}:{i}")) for i in range(len(chunks))]
        payloads = [{"source": source_id, "text": chunks[i],
                     "guide_id": guide_id} for i in range(len(chunks))]

        with QdrantStorage() as storage:
            storage.upsert(ids, vecs, payloads)
        return {"chunks": len(chunks)}
    except Exception as e:
        raise Exception(f"Failed to process guide {guide_id}: {str(e)}")


@inngest_client.create_function(
    fn_id="RAG: Query Guide",
    trigger=inngest.TriggerEvent(event="rag/query_guide_ai")
)
async def rag_query_guide_ai(ctx: inngest.Context):
    question = ctx.event.data["question"]
    top_k = int(ctx.event.data.get("top_k", 5))
    token = ctx.event.data.get("token")

    found = await ctx.step.run(
        "embed-and-search",
        lambda: _retrieve_context(question, top_k),
        output_type=RAGSearchResult,
    )

    source_guides = []
    if found.guide_ids and token:
        source_guides = await ctx.step.run(
            "fetch-guide-urls", lambda: _collect_source_guides(
                found.guide_ids, token)
        )

    answer = await ctx.step.run(
        "llm-answer",
        lambda: _invoke_claude_with_context(question, found.contexts)
    )

    return {
        "answer": answer,
        "sources": found.sources,
        "num_contexts": len(found.contexts),
        "source_guides": source_guides,
    }


app = FastAPI()

allowed_origins = os.getenv("CHAT_ALLOWED_ORIGINS", "*")
if allowed_origins.strip() == "*" or not allowed_origins.strip():
    cors_origins = ["*"]
else:
    cors_origins = [origin.strip()
                    for origin in allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/chat", response_model=RAQQueryResult)
def chat_endpoint(request: ChatRequest) -> RAQQueryResult:
    latest_user_message = next(
        (msg for msg in reversed(request.messages) if msg.role == "user"),
        None,
    )

    if not latest_user_message:
        raise HTTPException(
            status_code=400, detail="At least one user message is required."
        )

    question = latest_user_message.content.strip()
    if not question:
        raise HTTPException(
            status_code=400, detail="User message content cannot be empty."
        )

    conversation_history = [
        f"{msg.role.capitalize()}: {msg.content.strip()}"
        for msg in request.messages[:-1]
        if msg.role in ("user", "assistant") and msg.content.strip()
    ]

    try:
        search_result = _retrieve_context(question, request.top_k)
    except Exception as exc:
        logger.exception("Vector search failed: %s", exc)
        raise HTTPException(
            status_code=500, detail="Failed to search knowledge base."
        ) from exc

    try:
        answer = _invoke_claude_with_context(
            question,
            search_result.contexts,
            conversation_history if conversation_history else None
        )
    except Exception as exc:
        logger.exception("LLM invocation failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Failed to generate an answer."
        ) from exc

    source_guides = _collect_source_guides(
        search_result.guide_ids, request.token)
    return RAQQueryResult(
        answer=answer,
        sources=search_result.sources,
        num_contexts=len(search_result.contexts),
        source_guides=source_guides,
    )


inngest.fast_api.serve(app, inngest_client, [
                       rag_ingest_guide, rag_ingest_site, rag_query_guide_ai])
