import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { persistentLogger } from "../utils/persistentLogger";
import DocumentViewer from "../components/DocumentViewer";
import { buildThumbnailUrl, isImageMime } from "../utils/cloudinary";

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
  const [folder, setFolder] = useState<Folder | null>(null);
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
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
        api.get<{ success: boolean; data: PatientInfo }>(`/patients/${patientId}`),
      ]);
      setFolder(folderRes.data.data);
      const p = patientRes.data.data;
      setPatientInfo({
        patientId: p.patientId,
        patientName: p.patientName,
        remarks: p.remarks,
      });
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
    } catch (_) {}
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-8">
        <div className="max-w-7xl mx-auto animate-pulse space-y-5">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
            <div className="h-5 w-48 bg-gray-200 rounded" />
            <div className="h-4 w-64 bg-gray-100 rounded" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-gray-200 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-900 font-medium">Folder not found</p>
          <button onClick={() => navigate(`/patients/${patientId}`)} className="mt-3 text-sm text-blue-600 hover:text-blue-700">
            Back to Patient
          </button>
        </div>
      </div>
    );
  }

  const totalSize = folder.files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <button onClick={() => navigate("/dashboard")} className="hover:text-blue-600 transition-colors">Dashboard</button>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <button onClick={() => navigate(`/patients/${patientId}`)} className="hover:text-blue-600 transition-colors">
            {patientInfo?.patientName || "Patient"}
          </button>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-gray-900 font-medium capitalize">{folder.name}</span>
        </nav>

        {/* Patient context + folder header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          {/* Patient mini-bar */}
          {patientInfo && (
            <div className="px-6 py-3 bg-gray-50/80 border-b border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                  {patientInfo.patientName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <span className="text-sm font-semibold text-gray-900">{patientInfo.patientName}</span>
              </div>
              <span className="text-xs text-gray-400">|</span>
              <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold font-mono bg-blue-50 text-blue-700 rounded-md ring-1 ring-inset ring-blue-600/20">{patientInfo.patientId}</span>
            </div>
          )}

          {/* Folder header */}
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 capitalize flex items-center gap-2">
                  {folder.name}
                  <button
                    onClick={refreshFolder}
                    disabled={syncing}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </h1>
                <p className="text-sm text-gray-500">
                  {folder.files.length} file{folder.files.length !== 1 ? "s" : ""}
                  {totalSize > 0 && ` · ${formatFileSize(totalSize)} total`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading || folder.files.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {pdfLoading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                )}
                PDF
              </button>
              <button
                onClick={handleDownloadZip}
                disabled={zipLoading || folder.files.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {zipLoading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                )}
                ZIP
              </button>
            </div>
          </div>
        </div>

        {/* Files List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {folder.files.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-900 font-medium">No files in this folder</p>
              <p className="text-sm text-gray-500 mt-1">Files uploaded from the mobile app will appear here</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50/80 border-b border-gray-100">
                <div className="col-span-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">File Name</div>
                <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</div>
                <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Size</div>
                <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Uploaded</div>
              </div>

              {folder.files.map((file, index) => {
                const fileType = getFileType(file.mimeType);
                const showThumb = isImageMime(file.mimeType) && !thumbFailed[index];
                return (
                  <div
                    key={index}
                    onClick={() => setViewerIndex(index)}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-4 hover:bg-blue-50/30 transition-colors border-b border-gray-50 last:border-b-0 items-center cursor-pointer"
                  >
                    {/* File name */}
                    <div className="col-span-6 flex items-center gap-3">
                      {showThumb ? (
                        <img
                          src={buildThumbnailUrl(file.fileUrl, 80, 80)}
                          alt=""
                          loading="lazy"
                          onError={() => setThumbFailed((s) => ({ ...s, [index]: true }))}
                          className="flex-shrink-0 w-10 h-10 rounded-xl object-cover bg-gray-100"
                        />
                      ) : (
                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${fileType.color} flex items-center justify-center`}>
                          <span className="text-[10px] font-bold">{fileType.label}</span>
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-900 truncate">{file.fileName}</span>
                    </div>

                    {/* Type */}
                    <div className="col-span-2 hidden sm:block">
                      <span className="text-xs text-gray-500">{file.mimeType.split("/").pop()?.toUpperCase()}</span>
                    </div>

                    {/* Size */}
                    <div className="col-span-2 hidden sm:block">
                      <span className="text-sm text-gray-600">{formatFileSize(file.size)}</span>
                    </div>

                    {/* Uploaded date */}
                    <div className="col-span-2 hidden sm:block">
                      <span className="text-sm text-gray-500">
                        {new Date(file.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>

                    {/* Mobile meta */}
                    <div className="sm:hidden text-xs text-gray-500 ml-[52px]">
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
        />
      )}
    </div>
  );
};

export default FolderView;
