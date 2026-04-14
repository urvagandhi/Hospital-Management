import React, { useEffect, useState } from "react";
import { isImageMime, isPdfMime } from "../utils/cloudinary";

interface FileItem {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

interface Props {
  files: FileItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

const DocumentViewer: React.FC<Props> = ({ files, index, onClose, onIndexChange }) => {
  const file = files[index];
  const [zoom, setZoom] = useState(1);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Reset zoom whenever the active file changes.
  useEffect(() => {
    setZoom(1);
  }, [index]);

  // Cloudinary stores PDFs as resource_type=raw, which serves them with
  // Content-Disposition: attachment. Browsers download instead of rendering.
  // Fetch as blob and create a blob URL — blob URLs use the `type` parameter
  // rather than the server's disposition header, so the browser's native PDF
  // viewer picks them up.
  useEffect(() => {
    if (!file || !isPdfMime(file.mimeType)) {
      setPdfBlobUrl(null);
      setPdfError(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfBlobUrl(null);
    setPdfError(null);
    fetch(file.fileUrl)
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
        if (!cancelled) setPdfError(err.message || "Failed to load PDF");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file?.fileUrl, file?.mimeType]);

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
          <a
            href={file.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={file.fileName}
            className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20"
          >
            Download
          </a>
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
            src={file.fileUrl}
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
                href={file.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 text-sm rounded bg-white text-gray-900 hover:bg-gray-100"
              >
                Open in new tab
              </a>
            </div>
          ) : pdfBlobUrl ? (
            <iframe
              src={pdfBlobUrl}
              title={file.fileName}
              className="w-[95vw] h-[85vh] bg-white rounded"
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
