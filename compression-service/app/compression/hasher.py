import hashlib

from app.schemas import SourcePdf


def compute_content_hash(
    source_pdfs: list[SourcePdf],
    target_size_mb: float,
) -> str:
    """Compute a deterministic SHA-256 hash for cache keying.

    Hash input: sorted public_ids with their upload timestamps,
    plus the target size. Same inputs always produce the same hash
    regardless of request array order.
    """
    sorted_pdfs = sorted(source_pdfs, key=lambda p: p.public_id)
    parts = [f"{p.public_id}:{p.uploaded_at}" for p in sorted_pdfs]
    parts.append(f"target_size_mb={target_size_mb}")
    payload = "|".join(parts)
    return hashlib.sha256(payload.encode()).hexdigest()
