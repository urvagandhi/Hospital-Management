import React, { useEffect, useState } from "react";
import { getFileSignedUrl } from "../services/hospitalService";
import { isImageMime, isPdfMime } from "../utils/cloudinary";

interface FileItem {
  _id?: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  accessMode?: "public" | "signed";
}

interface Props {
  files: FileItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  // B5: when provided, viewer requests short-lived signed URLs before rendering.
  patientId?: string;
  folderName?: string;
}

const DocumentViewer: React.FC<Props> = ({ files, index, onClose, onIndexChange, patientId, folderName }) => {
  const file = files[index];
  const [zoom, setZoom] = useState(1);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  // Resolve signed URL just-in-time (falls back to stored URL for legacy public files).
  useEffect(() => {
    if (!file) { setResolvedUrl(null); return; }
    if (!patientId || !folderName || !file._id) {
      setResolvedUrl(file.fileUrl);
      return;
    }
    let cancelled = false;
    getFileSignedUrl(patientId, folderName, file._id, false)
      .then((r) => { if (!cancelled) setResolvedUrl(r.url); })
      .catch(() => { if (!cancelled) setResolvedUrl(file.fileUrl); });
    return () => { cancelled = true; };
  }, [file, patientId, folderName]);

  // Reset zoom whenever the active file changes.
  useEffect(() => {
    setZoom(1);
  }, [index]);

  // Download the current file with the correct filename.
  // The HTML `download` attribute is ignored for cross-origin URLs (e.g. Cloudinary),
  // so we fetch as a blob and create a same-origin blob URL.
  const handleDownload = async () => {
    const url = resolvedUrl || file.fileUrl;

    // PDFs already have a blob URL ready — reuse it.
    if (isPdfMime(file.mimeType) && pdfBlobUrl) {
      const a = document.createElement("a");
      a.href = pdfBlobUrl;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // For all other types, fetch as blob to force the correct filename.
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in new tab
      window.open(url, "_blank");
    }
  };

  // Build the stream URL for PDF viewing.
  // The backend /stream endpoint proxies the file from Cloudinary and sets:
  //   Content-Disposition: inline; filename="<db fileName>"
  // This means the browser's native PDF viewer download button shows the correct
  // filename instead of a blob UUID.
  //
  // Auth works automatically — the JWT is in the accessToken cookie which the
  // browser sends with all same-origin requests, including iframe src loads.
  //
  // Fall back to the blob-URL workaround when patientId/folderName/fileId are
  // not available (e.g. viewer opened without full context).
  const streamUrl =
    patientId && folderName && file._id
      ? `/api/patients/${patientId}/files/${encodeURIComponent(folderName)}/${file._id}/stream`
      : null;

  // Blob URL fallback — only created when we cannot use the stream endpoint.
  // Also pre-fetches the PDF for our custom Download button so it can reuse the blob.
  useEffect(() => {
    if (!file || !isPdfMime(file.mimeType)) {
      setPdfBlobUrl(null);
      setPdfError(null);
      return;
    }
    // Stream endpoint available — no need for a blob URL for the iframe.
    // Still pre-fetch so handleDownload can reuse the blob (avoids a second network hit).
    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfBlobUrl(null);
    setPdfError(null);
    const pdfUrl = resolvedUrl || file.fileUrl;
    fetch(pdfUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const pdfBlob = new Blob([blob], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(pdfBlob);
        setPdfBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          // Only treat as error when there is no stream URL to fall back to.
          if (!streamUrl) setPdfError(err.message || "Failed to load PDF");
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resolvedUrl, file?.fileUrl, file?.mimeType, streamUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < files.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, files.length, onClose, onIndexChange]);

  if (!file) return null;

  const canPrev = index > 0;
  const canNext = index < files.length - 1;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col" role="dialog" aria-modal="true">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{file.fileName}</p>
          <p className="text-xs text-white/60">
            {index + 1} of {files.length} · {file.mimeType}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {isImageMime(file.mimeType) && (
            <>
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20"
                aria-label="Zoom in"
              >
                +
              </button>
            </>
          )}
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20"
          >
            Download
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20">
            Close
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center relative overflow-auto">
        {canPrev && (
          <button
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white text-xl"
            aria-label="Previous"
          >
            ‹
          </button>
        )}
        {canNext && (
          <button
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white text-xl"
            aria-label="Next"
          >
            ›
          </button>
        )}

        {isImageMime(file.mimeType) ? (
          <img
            src={resolvedUrl || file.fileUrl}
            alt={file.fileName}
            style={{ transform: `scale(${zoom})`, transition: "transform 0.15s" }}
            className="max-w-[90vw] max-h-[80vh] object-contain select-none"
            draggable={false}
          />
        ) : isPdfMime(file.mimeType) ? (
          pdfError ? (
            <div className="text-center text-white/80 px-6">
              <p className="mb-4">Could not load PDF: {pdfError}</p>
              <a
                href={resolvedUrl || file.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 text-sm rounded bg-white text-gray-900 hover:bg-gray-100"
              >
                Open in new tab
              </a>
            </div>
          ) : streamUrl ? (
            // Stream endpoint: serves Content-Disposition: inline; filename="correct.pdf"
            // so the browser PDF viewer's own download button gets the right filename.
            <iframe
              src={`${streamUrl}#zoom=page-width`}
              title={file.fileName}
              className="w-[98vw] h-[90vh] bg-white rounded"
            />
          ) : pdfBlobUrl ? (
            // Fallback blob URL when stream endpoint is unavailable.
            <iframe
              src={`${pdfBlobUrl}#zoom=page-width`}
              title={file.fileName}
              className="w-[98vw] h-[90vh] bg-white rounded"
            />
          ) : (
            <div className="text-white/70 text-sm">Loading PDF…</div>
          )
        ) : (
          <div className="text-center text-white/80 px-6">
            <p className="mb-4">Preview not available for this file type.</p>
            <a
              href={file.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 text-sm rounded bg-white text-gray-900 hover:bg-gray-100"
            >
              Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
