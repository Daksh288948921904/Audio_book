import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, FilterSelector,
    PayloadSchemaType,
)
from fastembed import TextEmbedding
from backend.config import QDRANT_URL, QDRANT_API_KEY

VECTOR_DIM = 384  # BAAI/bge-small-en-v1.5 output dim

_client: QdrantClient | None = None
_embedder: TextEmbedding | None = None


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    return _client


def _get_embedder() -> TextEmbedding:
    global _embedder
    if _embedder is None:
        # ONNX-based — ~25 MB download, no PyTorch, fits in free-tier RAM
        _embedder = TextEmbedding("BAAI/bge-small-en-v1.5")
    return _embedder


def collection_name(chapter_number: int) -> str:
    return f"chapter_{chapter_number}"


def ensure_collection(chapter_number: int) -> None:
    client = _get_client()
    name = collection_name(chapter_number)
    existing = [c.name for c in client.get_collections().collections]
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        # Qdrant Cloud requires payload indexes before filtering on those fields
        client.create_payload_index(
            collection_name=name,
            field_name="segment_id",
            field_schema=PayloadSchemaType.INTEGER,
        )


def add_chunk(chapter_number: int, text: str, intent: str, chunk_type: str = "segment", segment_id: int | None = None) -> None:
    """chunk_type: 'segment' for live audio chunks, 'summary' for previous chapter summaries."""
    client = _get_client()
    embedder = _get_embedder()
    ensure_collection(chapter_number)

    vector = next(embedder.embed([text])).tolist()
    point = PointStruct(
        id=str(uuid.uuid4()),
        vector=vector,
        payload={
            "text": text,
            "intent": intent,
            "type": chunk_type,
            "segment_id": segment_id,
        },
    )
    client.upsert(collection_name=collection_name(chapter_number), points=[point])


def retrieve_all_chunks(chapter_number: int) -> list[dict]:
    client = _get_client()
    name = collection_name(chapter_number)
    existing = [c.name for c in client.get_collections().collections]
    if name not in existing:
        return []

    results = client.scroll(collection_name=name, limit=500, with_payload=True, with_vectors=False)
    return [point.payload for point in results[0]]


def delete_chunk_by_segment(chapter_number: int, segment_id: int) -> None:
    client = _get_client()
    name = collection_name(chapter_number)
    existing = [c.name for c in client.get_collections().collections]
    if name not in existing:
        return
    # Scroll all points and match in Python — avoids requiring a payload index
    results, _ = client.scroll(
        collection_name=name, limit=500, with_payload=True, with_vectors=False
    )
    ids_to_delete = [
        p.id for p in results
        if p.payload and p.payload.get("segment_id") == segment_id
    ]
    if ids_to_delete:
        client.delete(collection_name=name, points_selector=ids_to_delete)


def delete_collection(chapter_number: int) -> None:
    client = _get_client()
    name = collection_name(chapter_number)
    existing = [c.name for c in client.get_collections().collections]
    if name in existing:
        client.delete_collection(collection_name=name)
