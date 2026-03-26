import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { persistentLogger } from "../utils/persistentLogger";
import ZipSizeModal from "../components/ZipSizeModal";
import PdfModeModal from "../components/PdfModeModal";

interface FileItem {
  fileName: string;
  size: number;
  uploadedAt: string;
}

interface Folder {
  _id: string;
  name: string;
  files: FileItem[];
}

interface Patient {
  _id: string;
  patientName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  medicalRecordNumber: string;
  folders: Folder[];
  createdAt: string;
}

interface SizeCheckFolder {
  name: string;
  size: number;
  fileCount: number;
}

const folderIcons: Record<string, string> = {
  id: "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0",
  "claim paper": "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  "hospital bills": "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  "discharge summary": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  "hospital documents": "M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2",
  reports: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  "medical prescription & bills": "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  consent: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};

const folderColors = [
  { bg: "bg-blue-50", icon: "text-blue-500", hover: "hover:border-blue-200" },
  { bg: "bg-emerald-50", icon: "text-emerald-500", hover: "hover:border-emerald-200" },
  { bg: "bg-violet-50", icon: "text-violet-500", hover: "hover:border-violet-200" },
  { bg: "bg-amber-50", icon: "text-amber-500", hover: "hover:border-amber-200" },
  { bg: "bg-rose-50", icon: "text-rose-500", hover: "hover:border-rose-200" },
  { bg: "bg-cyan-50", icon: "text-cyan-500", hover: "hover:border-cyan-200" },
  { bg: "bg-indigo-50", icon: "text-indigo-500", hover: "hover:border-indigo-200" },
  { bg: "bg-teal-50", icon: "text-teal-500", hover: "hover:border-teal-200" },
];

const PatientDetails: React.FC = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  const [zipLoading, setZipLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [zipModal, setZipModal] = useState<{
    open: boolean;
    totalSize: number;
    folders: SizeCheckFolder[];
  }>({ open: false, totalSize: 0, folders: [] });
  const [pdfModal, setPdfModal] = useState(false);

  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchPatient();
  }, [patientId]);

  useEffect(() => {
    const onFocus = () => {
      if (patient && !loading) refreshPatient();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [patient, loading]);

  const fetchPatient = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ success: boolean; data: Patient }>(`/patients/${patientId}`);
      setPatient(response.data.data);
    } catch (error) {
      console.error("Failed to fetch patient:", error);
      persistentLogger.error("PatientDetails", "Failed to fetch patient", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshPatient = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await api.get<{ success: boolean; data: Patient }>(`/patients/${patientId}`);
      setPatient(response.data.data);
    } catch (error) {
      // Silent fail
    } finally {
      setSyncing(false);
    }
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

  const handleDownloadAllZip = async () => {
    if (!patientId) return;
    setZipLoading(true);
    try {
      const check = await api.get<{
        success: boolean;
        overLimit: boolean;
        totalSize: number;
        folders: SizeCheckFolder[];
      }>(`/patients/${patientId}/download/zip/size-check`);

      const { overLimit, totalSize, folders } = check.data;

      if (overLimit) {
        setZipModal({ open: true, totalSize, folders });
        setZipLoading(false);
      } else {
        await triggerZipDownload();
      }
    } catch (error) {
      console.error("ZIP download failed:", error);
      alert("Download failed. Please try again.");
      setZipLoading(false);
    }
  };

  const triggerZipDownload = async (selectedFolders?: string[]) => {
    if (!patientId || !patient) return;
    setZipLoading(true);
    try {
      const body = selectedFolders ? { selectedFolders } : {};
      const response = await api.postBlob(`/patients/${patientId}/download/zip`, body);
      downloadBlob(response.data as Blob, `${patient.patientName.replace(/[^a-z0-9]/gi, "_")}_records.zip`);
    } catch (error) {
      console.error("ZIP download failed:", error);
      alert("Download failed. Please try again.");
    } finally {
      setZipLoading(false);
      setZipModal((prev) => ({ ...prev, open: false }));
    }
  };

  const handleDownloadAllPdf = () => {
    setPdfModal(true);
  };

  const triggerPdfDownload = async (mode: "merged" | "per-folder") => {
    if (!patientId || !patient) return;
    setPdfLoading(true);
    try {
      const response = await api.postBlob(`/patients/${patientId}/download/pdf`, { mode });
      const ext = mode === "per-folder" ? "zip" : "pdf";
      const safeName = patient.patientName.replace(/[^a-z0-9]/gi, "_");
      downloadBlob(response.data as Blob, `${safeName}_records.${ext}`);
    } catch (error) {
      console.error("PDF download failed:", error);
      alert("Download failed. Please try again.");
    } finally {
      setPdfLoading(false);
      setPdfModal(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Skeleton */}
          <div className="animate-pulse space-y-6">
            <div className="h-4 w-40 bg-gray-200 rounded" />
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex gap-5">
                <div className="w-16 h-16 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-6 w-48 bg-gray-200 rounded" />
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium">Patient not found</p>
          <button onClick={() => navigate("/dashboard")} className="mt-3 text-sm text-blue-600 hover:text-blue-700">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const totalFileCount = patient.folders.reduce((sum, f) => sum + f.files.length, 0);
  const hasNoFiles = totalFileCount === 0;
  const foldersWithFiles = patient.folders.filter((f) => f.files.length > 0).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Back button */}
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>

        {/* Patient Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 px-6 sm:px-8 py-5">
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
              <div className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
            </div>
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-white text-lg font-bold">
                  {getInitials(patient.patientName)}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    {patient.patientName}
                    <button
                      onClick={refreshPatient}
                      disabled={syncing}
                      title="Refresh data"
                      className="p-1 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </h1>
                  <p className="text-blue-100 text-sm">MRN: {patient.medicalRecordNumber || "N/A"}</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={handleDownloadAllPdf}
                  disabled={pdfLoading || hasNoFiles}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white/15 text-white rounded-xl hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors backdrop-blur-sm"
                >
                  {pdfLoading ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  )}
                  PDF
                </button>
                <button
                  onClick={handleDownloadAllZip}
                  disabled={zipLoading || hasNoFiles}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white/15 text-white rounded-xl hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors backdrop-blur-sm"
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

          {/* Patient details row */}
          <div className="px-6 sm:px-8 py-4 flex flex-wrap gap-x-8 gap-y-3 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-500">DOB:</span>
              <span className="text-gray-900 font-medium">
                {patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-gray-500">Phone:</span>
              <span className="text-gray-900 font-medium">{patient.phone || "N/A"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-500">Email:</span>
              <span className="text-gray-900 font-medium">{patient.email || "N/A"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm ml-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full ring-1 ring-inset ring-blue-600/20">
                {totalFileCount} file{totalFileCount !== 1 ? "s" : ""} in {foldersWithFiles} folder{foldersWithFiles !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Mobile download buttons */}
          <div className="sm:hidden px-6 py-3 flex gap-2 border-b border-gray-100">
            <button
              onClick={handleDownloadAllPdf}
              disabled={pdfLoading || hasNoFiles}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-40 transition-colors"
            >
              Download PDF
            </button>
            <button
              onClick={handleDownloadAllZip}
              disabled={zipLoading || hasNoFiles}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-40 transition-colors"
            >
              Download ZIP
            </button>
          </div>
        </div>

        {/* Folders Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Document Folders</h2>
          <p className="text-sm text-gray-500">{patient.folders.length} folders</p>
        </div>

        {/* Folders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {patient.folders.map((folder, idx) => {
            const color = folderColors[idx % folderColors.length];
            const iconPath = folderIcons[folder.name] || "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z";
            const hasFiles = folder.files.length > 0;

            return (
              <div
                key={folder._id}
                onClick={() => navigate(`/patients/${patientId}/folders/${folder.name}`)}
                className={`group bg-white rounded-2xl border border-gray-100 ${color.hover} shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl ${color.bg} flex items-center justify-center`}>
                      <svg className={`w-5 h-5 ${color.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
                      </svg>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      hasFiles ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400"
                    }`}>
                      {folder.files.length} file{folder.files.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-gray-900 capitalize group-hover:text-blue-700 transition-colors">
                    {folder.name}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {hasFiles
                      ? `Last updated ${new Date(folder.files[folder.files.length - 1].uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "No files yet"}
                  </p>
                </div>

                {hasFiles && (
                  <div className="px-5 pb-4 pt-0 flex gap-2">
                    <FolderDownloadBtn patientId={patientId!} folderName={folder.name} patientName={patient.patientName} type="pdf" />
                    <FolderDownloadBtn patientId={patientId!} folderName={folder.name} patientName={patient.patientName} type="zip" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      <ZipSizeModal
        isOpen={zipModal.open}
        onClose={() => setZipModal((prev) => ({ ...prev, open: false }))}
        onConfirm={(selected) => triggerZipDownload(selected)}
        totalSize={zipModal.totalSize}
        folders={zipModal.folders}
        loading={zipLoading}
      />
      <PdfModeModal
        isOpen={pdfModal}
        onClose={() => setPdfModal(false)}
        onConfirm={(mode) => triggerPdfDownload(mode)}
        loading={pdfLoading}
      />
    </div>
  );
};

// ─── Folder-level download button ──────────────────────────────

const FolderDownloadBtn: React.FC<{
  patientId: string;
  folderName: string;
  patientName: string;
  type: "pdf" | "zip";
}> = ({ patientId, folderName, patientName, type }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const url = `/patients/${encodeURIComponent(patientId)}/folders/${encodeURIComponent(folderName)}/download/${type}`;
      const response = await api.getBlob(url);
      const safeName = patientName.replace(/[^a-z0-9]/gi, "_");
      const safeFolder = folderName.replace(/[^a-z0-9]/gi, "_");
      const blob = new Blob([response.data as BlobPart]);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeName}_${safeFolder}.${type}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error(`Folder ${type} download failed:`, error);
      alert("Download failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isPdf = type === "pdf";

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex-1 text-xs px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 disabled:opacity-50 transition-colors font-medium ${
        isPdf
          ? "bg-red-50 text-red-600 hover:bg-red-100"
          : "bg-blue-50 text-blue-600 hover:bg-blue-100"
      }`}
    >
      {loading ? (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          {isPdf ? "PDF" : "ZIP"}
        </>
      )}
    </button>
  );
};

export default PatientDetails;
