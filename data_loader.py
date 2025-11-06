import boto3
import json
from llama_index.core.node_parser import SentenceSplitter
from dotenv import load_dotenv
import requests
from typing import List, Dict, Optional, Tuple, TypedDict

load_dotenv()

bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-east-1'
)
EMBED_MODEL = "amazon.titan-embed-text-v2:0"
EMBED_DIM = 1024

splitter = SentenceSplitter(chunk_size=1000, chunk_overlap=200)

DOZUKI_BASE_URL = "https://hansaw.dozuki.com"
DOZUKI_APP_ID = "9c9e0e7ae61d3a70bfe4debb87ad145a"


def authenticate_dozuki(email: str, password: str) -> Optional[str]:
    """Authenticate with Dozuki API and return the token."""
    url = f"{DOZUKI_BASE_URL}/api/2.0/user/token"
    headers = {
        "X-App-Id": DOZUKI_APP_ID,
        "Content-Type": "application/json"
    }
    data = {
        "email": email,
        "password": password
    }

    response = requests.post(url, headers=headers, json=data)

    if response.status_code == 201:
        return response.json().get("authToken")
    else:
        raise Exception(
            f"Authentication failed: {response.status_code} - {response.text}")


def fetch_guide(guide_id: int, token: str) -> Dict:
    """Fetch a guide from Dozuki API."""
    url = f"{DOZUKI_BASE_URL}/api/2.0/guides/{guide_id}"
    headers = {
        "X-App-Id": DOZUKI_APP_ID,
        "Authorization": f"api {token}"
    }

    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(
            f"Failed to fetch guide: {response.status_code} - {response.text}")


def extract_guide_text(guide_data: Dict) -> List[str]:
    """Extract text content from guide data structure."""
    text_chunks = []

    # Extract title and basic info
    title = guide_data.get("title", "")
    summary = guide_data.get("summary", "")
    difficulty = guide_data.get("difficulty", "")
    category = guide_data.get("category", "")

    # Create header chunk
    header_text = f"Guide: {title}\nCategory: {category}\nDifficulty: {difficulty}\nSummary: {summary}"
    text_chunks.append(header_text)

    # Extract introduction if present
    intro = guide_data.get("introduction_rendered", "").strip()
    if intro:
        text_chunks.append(f"Introduction:\n{intro}")

    # Extract steps
    steps = guide_data.get("steps", [])
    for step in steps:
        step_title = step.get("title", "")
        step_lines = step.get("lines", [])

        step_text = f"Step {step.get('orderby', '')}: {step_title}\n"
        for line in step_lines:
            line_text = line.get("text_rendered", "")
            if line_text:
                step_text += f"- {line_text}\n"

        if step_text.strip():
            text_chunks.append(step_text)

    # Extract conclusion if present
    conclusion = guide_data.get("conclusion_rendered", "").strip()
    if conclusion:
        text_chunks.append(f"Conclusion:\n{conclusion}")

    # Extract parts if present
    parts = guide_data.get("parts", [])
    if parts:
        parts_text = "Required Parts:\n"
        for part in parts:
            parts_text += f"- {part.get('text', '')}\n"
        text_chunks.append(parts_text)

    # Extract tools if present
    tools = guide_data.get("tools", [])
    if tools:
        tools_text = "Required Tools:\n"
        for tool in tools:
            tools_text += f"- {tool.get('text', '')}\n"
        text_chunks.append(tools_text)

    return text_chunks


def extract_guide_images(guide_data: Dict) -> List[List[str]]:
    """Extract image URLs aligned with the text sections from extract_guide_text.

    The order mirrors extract_guide_text:
    1) Header (no images)
    2) Optional introduction (no images)
    3) Steps (images from step.media)
    4) Optional conclusion (no images)
    5) Optional parts (no images)
    6) Optional tools (no images)
    """
    sections_images: List[List[str]] = []

    # Header
    sections_images.append([])

    # Introduction (if present)
    intro = guide_data.get("introduction_rendered", "").strip()
    if intro:
        sections_images.append([])

    # Steps media
    steps = guide_data.get("steps", [])
    for step in steps:
        step_images: List[str] = []
        media = step.get("media") or {}
        if isinstance(media, dict) and media.get("type") == "image":
            for item in (media.get("data") or []):
                if isinstance(item, dict):
                    # Prefer stable-size links over signed "original" URLs
                    url = item.get("original")
                    if url:
                        step_images.append(url)
        sections_images.append(step_images)

    # Conclusion (if present)
    conclusion = guide_data.get("conclusion_rendered", "").strip()
    if conclusion:
        sections_images.append([])

    # Parts (if present)
    if guide_data.get("parts", []):
        sections_images.append([])

    # Tools (if present)
    if guide_data.get("tools", []):
        sections_images.append([])

    return sections_images


def fetch_guide_list(token: str, offset: int = 0, limit: int = 200) -> List[Dict]:
    """Fetch a page of guide summaries from the Dozuki site."""
    url = f"{DOZUKI_BASE_URL}/api/2.0/guides"
    headers = {
        "X-App-Id": DOZUKI_APP_ID,
        "Authorization": f"api {token}"
    }
    params = {
        "offset": offset,
        "limit": limit
    }

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        # The API returns an array of guide summaries directly
        return response.json()
    else:
        raise Exception(
            f"Failed to fetch guides: {response.status_code} - {response.text}")


def load_and_chunk_guide(guide_id: int, token: str) -> List[str]:
    """Load a guide from Dozuki API and chunk it for RAG."""
    guide_data = fetch_guide(guide_id, token)
    text_sections = extract_guide_text(guide_data)

    # Split larger sections into smaller chunks
    chunks = []
    for section in text_sections:
        if len(section) > 1000:
            chunks.extend(splitter.split_text(section))
        else:
            chunks.append(section)

    return chunks


class GuideMeta(TypedDict, total=False):
    guide_title: str
    guide_url: str


def load_and_chunk_guide_with_media(guide_id: int, token: str) -> Tuple[List[str], List[List[str]], GuideMeta]:
    """Load a guide and produce (chunks, images_per_chunk).

    For sections that exceed the chunk size, the same set of section images
    is associated with each resulting sub-chunk.
    """
    guide_data = fetch_guide(guide_id, token)
    text_sections = extract_guide_text(guide_data)
    image_sections = extract_guide_images(guide_data)
    meta: GuideMeta = {}
    if isinstance(guide_data, dict):
        if guide_data.get("title"):
            meta["guide_title"] = str(guide_data.get("title"))
        if guide_data.get("url"):
            meta["guide_url"] = str(guide_data.get("url"))

    # Safety: align lengths if they differ for any reason
    max_len = min(len(text_sections), len(image_sections))
    text_sections = text_sections[:max_len]
    image_sections = image_sections[:max_len]

    chunks: List[str] = []
    chunk_images: List[List[str]] = []

    for idx, section in enumerate(text_sections):
        images = image_sections[idx] if idx < len(image_sections) else []
        if len(section) > 1000:
            parts = splitter.split_text(section)
            for part in parts:
                chunks.append(part)
                # Reuse the same images for each split part of the same section
                chunk_images.append(list(images) if images else [])
        else:
            chunks.append(section)
            chunk_images.append(list(images) if images else [])

    return chunks, chunk_images, meta


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for text chunks using AWS Bedrock Titan Embed v2."""
    embeddings = []
    for text in texts:
        body = json.dumps({
            "inputText": text,
            "dimensions": EMBED_DIM,
            "normalize": True
        })

        response = bedrock_runtime.invoke_model(
            modelId=EMBED_MODEL,
            body=body,
            contentType='application/json',
            accept='application/json'
        )

        response_body = json.loads(response['body'].read())
        embeddings.append(response_body['embedding'])

    return embeddings
