import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DocumentViewer from "../components/DocumentViewer";
import Spinner from "../components/Spinner";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import api from "../services/api";
import { buildThumbnailUrl, isImageMime } from "../utils/cloudinary";
import { getFolderColor, getFolderIcon } from "../utils/folderVisuals";
import { persistentLogger } from "../utils/persistentLogger";

interface File {
  fileName: string;
  size: number;
  uploadedAt: string;
  mimeType: string;
  fileUrl: string;
}

interface Folder {
  name: string;
  files: File[];
}

interface PatientInfo {
  patientId: string;
  patientName: string;
  remarks?: string;
}

interface PatientFetchPayload extends PatientInfo {
  folders?: { name: string }[];
}

const fileTypeIcons: Record<string, { color: string; label: string }> = {
  "application/pdf": { color: "text-red-500 bg-red-50", label: "PDF" },
  "image/jpeg": { color: "text-emerald-500 bg-emerald-50", label: "JPG" },
  "image/png": { color: "text-blue-500 bg-blue-50", label: "PNG" },
  "image/gif": { color: "text-violet-500 bg-violet-50", label: "GIF" },
  "application/msword": { color: "text-blue-600 bg-blue-50", label: "DOC" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { color: "text-blue-600 bg-blue-50", label: "DOCX" },
};

const FolderView: React.FC = () => {
  const { patientId, folderName } = useParams<{ patientId: string; folderName: string }>();
  const navigate = useNavigate();
  useDocumentTitle(
    folderName
      ? `${decodeURIComponent(folderName)} — MyMediVault`
      : "Folder — MyMediVault",
  );
  const [folder, setFolder] = useState<Folder | null>(null);
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [folderIndex, setFolderIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [thumbFailed, setThumbFailed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchData();
  }, [patientId, folderName]);

  useEffect(() => {
    const onFocus = () => {
      if (folder && !loading) refreshFolder();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [folder, loading]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [folderRes, patientRes] = await Promise.all([
        api.get<{ success: boolean; data: Folder }>(`/patients/${patientId}/files/${folderName}`),
        api.get<{ success: boolean; data: PatientFetchPayload }>(`/patients/${patientId}`),
      ]);
      setFolder(folderRes.data.data);
      const p = patientRes.data.data;
      setPatientInfo({
        patientId: p.patientId,
        patientName: p.patientName,
        remarks: p.remarks,
      });
      if (Array.isArray(p.folders) && folderName) {
        const needle = decodeURIComponent(folderName).toLowerCase();
        setFolderIndex(
          p.folders.findIndex((f) => f.name.toLowerCase() === needle),
        );
      }
    } catch (error) {
      console.error("Failed to fetch folder:", error);
      persistentLogger.error("FolderView", "Failed to fetch folder", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshFolder = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await api.get<{ success: boolean; data: Folder }>(`/patients/${patientId}/files/${folderName}`);
      setFolder(response.data.data);
    } catch (_) { }
    finally { setSyncing(false); }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const response = await api.getBlob(`/patients/${patientId}/folders/${encodeURIComponent(folderName!)}/download/pdf`);
      downloadBlob(response.data as Blob, `${folderName}.pdf`);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    setZipLoading(true);
    try {
      const response = await api.getBlob(`/patients/${patientId}/folders/${encodeURIComponent(folderName!)}/download/zip`);
      downloadBlob(response.data as Blob, `${folderName}.zip`);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed. Please try again.");
    } finally {
      setZipLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileType = (mimeType: string) => {
    return fileTypeIcons[mimeType] || { color: "text-gray-500 bg-gray-50", label: "FILE" };
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-surface-bg p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-neutral-200" />
              <div className="space-y-2">
                <div className="h-6 w-48 bg-neutral-200 rounded" />
                <div className="h-4 w-32 bg-neutral-100 rounded" />
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-neutral-100 p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-neutral-200 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-neutral-200 rounded" />
                    <div className="h-3 w-24 bg-neutral-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-surface-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p className="text-neutral-900 font-medium">Folder not found</p>
          <button onClick={() => navigate(`/patients/${patientId}`)} className="mt-3 text-sm text-primary-600 hover:text-primary-700">
            Back to Patient
          </button>
        </div>
      </div>
    );
  }

  const totalSize = folder.files.reduce((sum, f) => sum + f.size, 0);
  const lastModified = folder.files.length
    ? folder.files.reduce(
      (latest, f) =>
        new Date(f.uploadedAt).getTime() > new Date(latest).getTime()
          ? f.uploadedAt
          : latest,
      folder.files[0].uploadedAt,
    )
    : null;
  const folderIconPath = getFolderIcon(folder.name);
  const folderColor = folderIndex >= 0 ? getFolderColor(folderIndex) : null;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg overflow-hidden">
      {/* Decorative primary glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />

      <header className="relative">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-6">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm mb-4 min-w-0"
          >
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-neutral-500 hover:text-primary-700 hover:bg-primary-50 font-medium transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path d="M3 12 12 3l9 9" />
                <path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10" />
              </svg>
              Dashboard
            </button>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 text-neutral-300 shrink-0"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <button
              type="button"
              onClick={() => navigate(`/patients/${patientId}`)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-neutral-500 hover:text-primary-700 hover:bg-primary-50 font-medium transition-colors truncate max-w-[40vw]"
            >
              <span className="truncate">
                {patientInfo?.patientName || "Patient"}
              </span>
              {patientInfo?.patientId && (
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-primary-50 text-primary-700 rounded ring-1 ring-inset ring-primary-600/15 shrink-0">
                  {patientInfo.patientId}
                </span>
              )}
            </button>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 text-neutral-300 shrink-0"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span
              aria-current="page"
              className="px-2 py-1 text-primary-700 font-semibold capitalize truncate"
            >
              {folder.name}
            </span>
          </nav>

          {/* Top row: back + identity + actions */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                onClick={() => navigate(`/patients/${patientId}`)}
                aria-label="Back to patient"
                className="w-10 h-10 shrink-0 rounded-full text-neutral-500 hover:text-primary-600 hover:bg-primary-100 flex items-center justify-center transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>

              {/* Folder icon avatar — white tile wraps the colored chip so low-saturation
                  folder colors (blue-50, indigo-50, teal-50) stay readable over the
                  primary-tinted page background. */}
              {folderColor ? (
                <div
                  aria-hidden="true"
                  className="hidden sm:flex h-12 w-12 shrink-0 rounded-xl bg-white shadow-card ring-1 ring-inset ring-neutral-200 items-center justify-center"
                >
                  <div
                    className={`h-9 w-9 rounded-lg flex items-center justify-center ${folderColor.bg} ${folderColor.icon}`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      className="w-5 h-5"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={folderIconPath}
                      />
                    </svg>
                  </div>
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  className="hidden sm:flex h-12 w-12 shrink-0 rounded-xl bg-gradient-primary text-white items-center justify-center shadow-primary ring-2 ring-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    className="w-6 h-6"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={folderIconPath}
                    />
                  </svg>
                </div>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1.5">
                  <h1 className="font-heading text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight capitalize truncate">
                    {folder.name}
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 text-xs font-semibold ring-1 ring-inset ring-primary-600/15">
                    {folder.files.length} file{folder.files.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={refreshFolder}
                    disabled={syncing}
                    title="Refresh"
                    aria-label="Refresh folder"
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
                  <span className="inline-flex items-center gap-1.5">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                      aria-hidden="true"
                    >
                      <path d="M4 4h16v4H4z" />
                      <path d="M4 12h16v8H4z" />
                    </svg>
                    {folder.files.length} file{folder.files.length !== 1 ? "s" : ""}
                  </span>
                  {totalSize > 0 && (
                    <>
                      <span aria-hidden="true" className="text-neutral-300">·</span>
                      <span>{formatFileSize(totalSize)} total</span>
                    </>
                  )}
                  {lastModified && (
                    <>
                      <span aria-hidden="true" className="text-neutral-300">·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Last modified {new Date(lastModified).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading || folder.files.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 hover:border-red-200 text-sm font-semibold shadow-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-50"
              >
                {pdfLoading ? (
                  <Spinner variant="scan" size="sm" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M9 13v5" />
                    <path d="m6.5 15.5 2.5-2.5 2.5 2.5" />
                  </svg>
                )}
                Download PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={zipLoading || folder.files.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-primary text-white font-semibold text-sm shadow-primary hover:shadow-card-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {zipLoading ? (
                  <Spinner variant="scan" size="sm" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M10 7h4" />
                    <path d="M10 11h4" />
                    <path d="M10 15h4" />
                  </svg>
                )}
                Download ZIP
              </button>
            </div>
          </div>

          {/* Patient detail card — primary-tinted, matches PatientDetails remarks style */}
          {patientInfo && (
            <div className="mt-5 relative bg-white rounded-xl border border-primary-100 pl-5 pr-4 py-4 overflow-hidden">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-primary"
              />
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary-700">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Patient
                </div>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/patients/${patientId}`)}
                    className="text-sm font-semibold text-neutral-900 hover:text-primary-700 transition-colors truncate"
                  >
                    {patientInfo.patientName}
                  </button>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 font-mono text-xs font-semibold ring-1 ring-inset ring-primary-600/15 tracking-wider">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3"
                      aria-hidden="true"
                    >
                      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    {patientInfo.patientId}
                  </span>
                </div>
              </div>
              {patientInfo.remarks && (
                <p className="mt-3 text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
                  {patientInfo.remarks}
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-neutral-900">Files</h2>
          {folder.files.length > 0 && (
            <p className="text-sm text-neutral-500">
              Tap any file to preview
            </p>
          )}
        </div>

        {/* Files list card */}
        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
          {folder.files.length === 0 ? (
            <div className="py-16 text-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${folderColor ? `${folderColor.bg} ${folderColor.icon}` : "bg-primary-50 text-primary-500"
                  }`}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={folderIconPath} />
                </svg>
              </div>
              <p className="text-neutral-900 font-medium">No files in this folder</p>
              <p className="text-sm text-neutral-500 mt-1">Files uploaded from the mobile app will appear here</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50/80 border-b border-neutral-100">
                <div className="col-span-6 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">File Name</div>
                <div className="col-span-2 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Type</div>
                <div className="col-span-2 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Size</div>
                <div className="col-span-2 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Uploaded</div>
              </div>

              {folder.files.map((file, index) => {
                const fileType = getFileType(file.mimeType);
                const hasThumbnail = Boolean((file as any).thumbnailUrl);
                const showThumb = (isImageMime(file.mimeType) || hasThumbnail) && !thumbFailed[index];
                return (
                  <div
                    key={index}
                    onClick={() => setViewerIndex(index)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setViewerIndex(index);
                      }
                    }}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-4 hover:bg-primary-50/40 transition-colors border-b border-neutral-100 last:border-b-0 items-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-inset"
                  >
                    {/* File name */}
                    <div className="col-span-6 flex items-center gap-3 min-w-0">
                      {showThumb ? (
                        <img
                          src={(file as any).thumbnailUrl || buildThumbnailUrl(file.fileUrl, 80, 80)}
                          alt=""
                          loading="lazy"
                          onError={() => setThumbFailed((s) => ({ ...s, [index]: true }))}
                          className="flex-shrink-0 w-11 h-11 rounded-xl object-cover bg-neutral-100 ring-1 ring-inset ring-neutral-200"
                        />
                      ) : (
                        <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${fileType.color} flex items-center justify-center ring-1 ring-inset ring-black/5`}>
                          <span className="text-[10px] font-bold">{fileType.label}</span>
                        </div>
                      )}
                      <span className="text-sm font-medium text-neutral-900 truncate">{file.fileName}</span>
                    </div>

                    {/* Type */}
                    <div className="col-span-2 hidden sm:block">
                      <span className="text-xs text-neutral-500 font-mono">{file.mimeType.split("/").pop()?.toUpperCase()}</span>
                    </div>

                    {/* Size */}
                    <div className="col-span-2 hidden sm:block">
                      <span className="text-sm text-neutral-600">{formatFileSize(file.size)}</span>
                    </div>

                    {/* Uploaded date */}
                    <div className="col-span-2 hidden sm:flex items-center justify-between gap-2">
                      <span className="text-sm text-neutral-500">
                        {new Date(file.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-neutral-300 shrink-0"
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>

                    {/* Mobile meta */}
                    <div className="sm:hidden text-xs text-neutral-500 ml-[56px]">
                      {formatFileSize(file.size)} · {new Date(file.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {viewerIndex !== null && folder.files[viewerIndex] && (
        <DocumentViewer
          files={folder.files}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
          patientId={patientId}
          folderName={folderName}
        />
      )}
    </div>
  );
};

export default FolderView;
