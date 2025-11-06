from typing import Optional
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)


class QdrantStorage:
    def __init__(self, url="http://localhost:6333", collection="docs", dim=1024):
        self.client = QdrantClient(url=url, timeout=30)
        self.collection = collection
        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(
                    size=dim, distance=Distance.COSINE),
            )

    def upsert(self, ids, vectors, payloads):
        points = [PointStruct(id=ids[i], vector=vectors[i],
                              payload=payloads[i]) for i in range(len(ids))]
        self.client.upsert(self.collection, points=points)

    def search(
        self,
        query_vector,
        top_k: int = 5,
        guide_id: Optional[int] = None
    ):
        query_filter = None
        if guide_id is not None:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="guide_id",
                        match=MatchValue(value=guide_id)
                    )
                ]
            )

        results = self.client.search(
            collection_name=self.collection,
            query_vector=query_vector,
            query_filter=query_filter,
            with_payload=True,
            limit=top_k
        )
        contexts = []
        sources = set()
        guide_ids = set()
        images_per_context = []
        guide_info = []

        for r in results:
            payload = getattr(r, "payload", None) or {}
            text = payload.get("text", "")
            source = payload.get("source", "")
            guide_id = payload.get("guide_id")
            images = payload.get("images") or []
            if text:
                contexts.append(text)
                sources.add(source)
                if guide_id:
                    guide_ids.add(guide_id)
                # collect per-result guide meta
                guide_info.append({
                    "guide_id": guide_id,
                    "title": payload.get("guide_title"),
                    "url": payload.get("guide_url"),
                    "source": source,
                })
                # ensure list[str]
                if isinstance(images, list):
                    images_per_context.append([str(u) for u in images if u])
                else:
                    images_per_context.append([])

        return {
            "contexts": contexts,
            "sources": list(sources),
            "guide_ids": list(guide_ids),
            "images_per_context": images_per_context,
            "guide_info": guide_info,
        }

    def list_guides(self) -> list[dict]:
        guides: dict[int, dict] = {}
        offset = None

        while True:
            points, offset = self.client.scroll(
                collection_name=self.collection,
                offset=offset,
                with_vectors=False,
                with_payload=True,
                limit=256,
            )

            for point in points:
                payload = getattr(point, "payload", None) or {}
                guide_id = payload.get("guide_id")
                if guide_id is None:
                    continue
                # Preserve first seen payload metadata
                if guide_id not in guides:
                    guides[guide_id] = {
                        "guide_id": guide_id,
                        "source": payload.get("source"),
                    }

            if offset is None:
                break

        return sorted(guides.values(), key=lambda item: item["guide_id"])

    def count(self) -> int:
        collection_info = self.client.get_collection(self.collection)
        return collection_info.points_count

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
