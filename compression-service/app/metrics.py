from prometheus_client import Counter

CACHE_HITS_TOTAL = Counter(
    "sidecar_cache_hits_total",
    "Total number of cache hits vs misses",
    ["hit"]
)

CACHE_META_MISSING_TOTAL = Counter(
    "sidecar_cache_meta_missing_total",
    "Number of times merged_pdf_cache sidecar row was missing on a cache-hit"
)
