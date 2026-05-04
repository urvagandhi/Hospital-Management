# MyMediVault Compression Service — Upgrade Plan

## iLovePDF-Level Pipeline Implementation

---

## CONTEXT & CONSTRAINTS

- **Service:** Python FastAPI sidecar (`compression-service/`)
- **Runtime:** DigitalOcean droplet under Docker Compose for production; local Docker for development
- **Source PDFs:** Always ML Kit JPEG-in-PDF (clean structure, no garbage)
- **Medical floor:** 150 DPI minimum, color preserved unless tier forces gray
- **Existing:** 5 fixed tiers using Ghostscript presets + pikepdf digital fast-path
- **Goal:** Replace fixed tiers with adaptive pipeline matching iLovePDF quality

---

## WHAT CHANGES VS WHAT STAYS

**Stays untouched:**

- Auth middleware (`X-Internal-Secret`)
- Cache layer (`merged_pdf_cache` MongoDB collection)
- Compression audit logging (`compression_audits`)
- Cloudinary upload/download logic
- `_FETCH_CONCURRENCY = 10` semaphore
- All endpoint routes and schemas
- Health check endpoint

**Changes:**

- The entire compression engine inside the pipeline
- How tiers are defined and iterated
- Addition of PDF classifier
- Addition of image pre-processor
- Addition of PDF rebuilder
- Ghostscript flags (presets → explicit flags)
- pikepdf digital fast-path (enhanced)

---

## DEPENDENCIES TO ADD

Add these to `requirements.txt` (check if already present first):

- `Pillow` — image manipulation (resize, grayscale, JPEG re-encode)
- `img2pdf` — lossless JPEG-to-PDF rebuilder (no re-encoding)
- `pikepdf` — already present, but verify version is latest stable
- `pdfminer.six` — for text layer detection (classifier stage)

System dependency in `Dockerfile`:

- `poppler-utils` — provides `pdfimages` CLI tool for image extraction
- Ghostscript is already installed, verify it's version 9.56+

---

## FILE STRUCTURE CHANGES

Inside `compression-service/app/`:

```
app/
  compression/
    __init__.py
    classifier.py       ← NEW
    preprocessor.py     ← NEW
    rebuilder.py        ← NEW
    ghostscript.py      ← REPLACE existing GS logic
    adaptive_loop.py    ← NEW (replaces fixed tier loop)
    digital_path.py     ← REPLACE existing pikepdf fast-path
  pipeline.py           ← NEW (orchestrates all stages)
  merged_cache.py       ← UNCHANGED
  cloudinary_client.py  ← UNCHANGED
  schemas.py            ← UNCHANGED
  main.py               ← Minor change: point to new pipeline.py
```

---

## STAGE-BY-STAGE IMPLEMENTATION PLAN

---

### STAGE 1 — `classifier.py`

**Purpose:** Detect if PDF is digital (has real text layer) or scanned (image-only)

**Logic:**

- Open PDF with pikepdf
- For each page (check first 3 pages max for speed), attempt to extract text using pdfminer
- If total extracted text characters across sampled pages exceeds a threshold (suggest 50 characters), classify as `"digital"`
- Otherwise classify as `"scanned"`
- Return a simple string: `"digital"` or `"scanned"`

**Edge cases to handle:**

- Encrypted PDFs → treat as `"scanned"`, don't crash
- Single page PDFs → sample just that one page
- Mixed PDFs (some text, some image pages) → if ANY page has text, treat whole doc as `"digital"` (safer for medical)

**Output:** `"digital"` | `"scanned"`

---

### STAGE 2 — `preprocessor.py` (Scanned path only)

**Purpose:** Extract every image from the PDF, re-encode intelligently based on target tier, save processed images to a temp directory

**Inputs:** PDF path, tier (0–4), temp working directory path

**Logic:**

Step 1 — Extract images using `pdfimages` CLI:

- Run `pdfimages -all <input.pdf> <tempdir>/img` via subprocess
- This dumps every embedded image as a file into tempdir
- Collect all output files, sort by filename (preserves page order)

Step 2 — Per-image processing using Pillow:

- Open each extracted image file
- **Estimate current DPI** from the image dimensions vs the page mediabox (use pikepdf to read page dimensions in points, divide image pixel width by page width in inches)
- **Decide whether to downsample:** Only resize if current DPI exceeds target DPI by more than 10%. If already at or below target, skip resize entirely (don't re-encode unnecessarily — this is where most tools make a mistake)
- **Resize** using `LANCZOS` resampling (best quality for downscaling)
- **Color conversion:** Only convert to grayscale at tier 3 and tier 4. Tiers 0–2 stay color.
- **JPEG encode** with these quality values per tier:
  - Tier 0: quality 85, subsampling 4:4:4 (no chroma loss)
  - Tier 1: quality 72, subsampling 4:4:4
  - Tier 2: quality 58, subsampling 4:2:0
  - Tier 3: quality 45, subsampling 4:2:0
  - Tier 4: quality 32, subsampling 4:2:0
- Save each processed image as `.jpg` into tempdir

**DPI targets per tier:**

- Tier 0: 300 DPI
- Tier 1: 200 DPI
- Tier 2: 150 DPI (medical floor)
- Tier 3: 150 DPI (floor, but grayscale)
- Tier 4: 120 DPI (absolute floor — never go below this for medical)

**Important constraint:** Never resize below 150 DPI for tiers 0–3. Only tier 4 is allowed to touch 120 DPI. This is a hard guard in the code.

**Output:** List of processed `.jpg` file paths in page order, in tempdir

---

### STAGE 3 — `rebuilder.py` (Scanned path only)

**Purpose:** Reconstruct a clean PDF from the processed JPEG images

**Why not just pass images into Ghostscript:** `img2pdf` embeds JPEGs into PDF without re-encoding them. Zero quality loss at this stage. Ghostscript then has a clean, simple PDF to work with and doesn't fight against existing compression artifacts.

**Logic:**

- Take the ordered list of processed `.jpg` files from Stage 2
- Use `img2pdf.convert()` to combine them into a single PDF
- Write output to `<tempdir>/rebuilt.pdf`
- If `img2pdf` fails for any image (corrupt extract, weird color space), fall back to Pillow's `img.save(..., format="PDF")` for that specific page then concatenate with pikepdf

**Output:** Path to `rebuilt.pdf` in tempdir

---

### STAGE 4 — `ghostscript.py`

**Purpose:** Apply deep stream-level compression on the rebuilt PDF using explicit Ghostscript flags (not presets)

**Replace all existing preset-based GS calls.**

**Flags to use (explicit, not `/ebook` or `/screen`):**

Base flags always present:

- `-dBATCH -dNOPAUSE -dQUIET -dSAFER`
- `-sDEVICE=pdfwrite`
- `-dCompatibilityLevel=1.4`
- `-dSubsetFonts=true`
- `-dEmbedAllFonts=false`
- `-dCompressPages=true`
- `-dUseFlateCompression=true`
- `-dDetectDuplicateImages=true`
- `-dAutoRotatePages=/None`
- `-dOmitInfoDate=true` (strip metadata)

Image flags (vary by tier):

- `-dDownsampleColorImages=true`
- `-dColorImageDownsampleType=/Bicubic` (tiers 0–2), `/Average` (tier 3), `/Subsample` (tier 4)
- `-dColorImageResolution=<dpi>` — same DPI targets as Stage 2
- `-dAutoFilterColorImages=false` — CRITICAL: forces GS to use your filter, not auto-detect
- `-dColorImageFilter=/DCTEncode` — forces JPEG
- `-dJPEGQ=<quality>` — same quality values as Stage 2
- Same flags mirrored for GrayImage
- Mono image flags: `-dDownsampleMonoImages=true`, resolution 300 for tiers 0–2, 200 for 3–4

Color conversion (tier 3 and 4 only):

- `-sColorConversionStrategy=Gray`
- `-dProcessColorModel=/DeviceGray`

**Why `AutoFilterColorImages=false` is critical:** Without it, Ghostscript detects your images are already JPEG and passes them through untouched. You lose all the gains from Stage 2. This flag forces re-encoding.

**Subprocess execution:**

- Run GS as a subprocess with a timeout of 240 seconds (leave 60s buffer for the 300s backend timeout)
- Capture stderr — if GS prints "Error" or exits non-zero, raise a specific `GhostscriptError` exception
- Log the GS command to the audit log (useful for debugging)

**Output:** Path to GS-compressed PDF

---

### STAGE 5 — `adaptive_loop.py`

**Purpose:** Orchestrate tiers 0–4, stop as soon as target size is hit

**Replaces:** The existing fixed tier cascade

**Inputs:**

- `input_path` — original PDF (after classification, before any processing)
- `target_size_bytes` — from the request
- `pdf_type` — `"digital"` or `"scanned"`
- `temp_dir` — working directory for this request

**Logic for scanned PDFs:**

```
for tier in 0 to 4:
    1. Run preprocessor.py with this tier → processed images
    2. Run rebuilder.py → rebuilt.pdf
    3. Check size of rebuilt.pdf BEFORE Ghostscript
       → If already <= target, skip GS entirely, return rebuilt.pdf
       → This is a fast-path for when image processing alone is enough
    4. Run ghostscript.py with this tier → compressed.pdf
    5. Check size of compressed.pdf
       → If <= target, return compressed.pdf
    6. Clean up temp files from this tier before next iteration
      (RAM management — critical on low-memory deployments)

If no tier hits target: return tier 4 result (best effort)
```

**Logic for digital PDFs:**

- Skip tiers 0–4 entirely
- Go straight to `digital_path.py`
- Digital PDFs are already text/vector, Ghostscript would just bloat them

**RAM guard:**

- Before each tier, check available system memory using `psutil`
- If available RAM < 150MB, skip to the next tier immediately and log a warning
- This prevents OOM on low-memory deployments

**Temp directory management:**

- Each request gets its own UUID-named temp directory under `/tmp/`
- Always clean up in a `finally` block regardless of success or failure

**Output:** Path to the best compressed PDF file

---

### STAGE 6 — `digital_path.py`

**Purpose:** Enhanced pikepdf compression for text-layer PDFs

**Replace** existing simple pikepdf call with:

- Open with pikepdf
- Save with these explicit options:
  - `compress_streams=True`
  - `recompress_flate=True` — re-deflates already-deflated streams, often 10–20% extra gain
  - `object_stream_mode=pikepdf.ObjectStreamMode.generate` — packs PDF objects tightly
  - `linearize=False` — skip linearization, wastes space and time
  - `stream_decode_level=pikepdf.StreamDecodeLevel.generalized`

**Also strip before saving:**

- Remove `/Metadata` stream if present (XMP metadata bloat)
- Remove `/PieceInfo` (Adobe-specific private data)
- Remove `/LastModified` entries

**Output:** Path to compressed digital PDF

---

### STAGE 7 — `pipeline.py` (Orchestrator)

**Purpose:** Single entry point that the FastAPI endpoints call

**Logic:**

1. Receive: list of PDF paths (already fetched from Cloudinary), target size bytes
2. If multiple PDFs → merge with pikepdf first (existing merge logic, unchanged)
3. Call `classifier.py` on merged/single PDF
4. Call `adaptive_loop.py` with the classification result
5. Return final compressed PDF path

**This is what `main.py` endpoints call — they shouldn't change much, just swap the old compression call for `pipeline.run()`**

---

## DOCKERFILE CHANGES

Add to the apt-get install line:

- `poppler-utils` (for `pdfimages` CLI)

Verify already present:

- `ghostscript`
- Python packages installed via pip

---

## TEMP DIRECTORY STRATEGY

- All temp files live under `/tmp/<uuid>/` per request
- Structure inside each request temp dir:
  - `/tmp/<uuid>/extracted/` — raw images from pdfimages
  - `/tmp/<uuid>/processed/` — Pillow-processed JPEGs
  - `/tmp/<uuid>/rebuilt.pdf` — img2pdf output
  - `/tmp/<uuid>/tier_<n>_output.pdf` — GS output per tier
- Always `shutil.rmtree` in a finally block
- Never write to `filesDir` or any persistent location — sidecar is stateless

---

## TESTING PLAN FOR THE AGENT

After implementation, test in this order:

1. **Unit test classifier** — feed it a known digital PDF (any text doc) and a known scanned PDF, verify correct output
2. **Unit test preprocessor** — feed a scanned PDF, verify images extracted, verify DPI estimation is reasonable, verify output JPEGs exist
3. **Unit test rebuilder** — feed processed JPEGs, verify output is valid PDF, verify page count matches
4. **Integration test full pipeline** — use the actual 71MB test file, run through all tiers, log output size at each tier
5. **Test the RAM guard** — mock `psutil` to return low memory, verify tier is skipped gracefully
6. **Test timeout compliance** — entire pipeline must complete in under 240 seconds for a 50-page document on free tier hardware
7. **Test cache still works** — run same file twice, verify second run returns instantly from cache
8. **Test cleanup** — verify `/tmp/` has no leftover directories after each run

---

## WHAT TO TELL THE AGENT EXPLICITLY

- Do not touch `merged_cache.py`, `cloudinary_client.py`, `schemas.py`
- Do not change endpoint routes or auth middleware
- The `_FETCH_CONCURRENCY = 10` semaphore must not be removed
- All new code goes inside `app/compression/` as a new subpackage
- `pipeline.py` is the only new file that `main.py` imports
- Every temp file operation must have a `finally` cleanup
- Use `subprocess.run()` with `timeout=240` for Ghostscript, never `os.system()`
- Log tier number, input size, output size, and time taken for every tier attempt to the existing `compression_audits` collection
- 150 DPI is the hard medical floor — add an assertion that raises if DPI target goes below 120 anywhere
