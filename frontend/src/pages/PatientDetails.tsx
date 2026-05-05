import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PdfModeModal from "../components/PdfModeModal";
import Spinner from "../components/Spinner";
import ZipSizeModal from "../components/ZipSizeModal";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import api from "../services/api";
import { getFolderColor, getFolderIcon } from "../utils/folderVisuals";
import { persistentLogger } from "../utils/persistentLogger";

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
  patientId: string;
  patientName: string;
  remarks?: string;
  folders: Folder[];
  createdAt: string;
}

interface SizeCheckFolder {
  name: string;
  size: number;
  fileCount: number;
}


const PatientDetails: React.FC = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  useDocumentTitle("Patient Details — MyMediVault");
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

  // ─────────────────────────────────────────────────────────────────────────
  // Edit Patient — intentionally mobile-only (CLAUDE.md §11: web is read-mostly
  // for mutations). The code is preserved in comments below; uncomment the
  // state, handlers, button, and modal JSX to re-enable web editing.
  // ─────────────────────────────────────────────────────────────────────────
  // const [editOpen, setEditOpen] = useState(false);
  // const [editForm, setEditForm] = useState({ patientName: "", remarks: "" });
  // const [editSaving, setEditSaving] = useState(false);
  // const [editError, setEditError] = useState<string | null>(null);
  //
  // const openEdit = () => {
  //   if (!patient) return;
  //   setEditForm({
  //     patientName: patient.patientName,
  //     remarks: patient.remarks || "",
  //   });
  //   setEditError(null);
  //   setEditOpen(true);
  // };
  //
  // const saveEdit = async () => {
  //   if (!patient) return;
  //   const name = editForm.patientName.trim();
  //   if (!name) {
  //     setEditError("Patient name cannot be empty.");
  //     return;
  //   }
  //   if (editForm.remarks.length > 500) {
  //     setEditError("Remarks must be 500 characters or less.");
  //     return;
  //   }
  //   setEditSaving(true);
  //   setEditError(null);
  //   try {
  //     const body = {
  //       patientName: name,
  //       remarks: editForm.remarks.trim(),
  //     };
  //     await api.put(`/patients/${patient._id}`, body);
  //     setPatient((p) =>
  //       p ? { ...p, patientName: body.patientName, remarks: body.remarks } : p,
  //     );
  //     setEditOpen(false);
  //   } catch (err: unknown) {
  //     const e = err as { response?: { data?: { message?: string } }; message?: string };
  //     setEditError(
  //       e.response?.data?.message || e.message || "Failed to save patient.",
  //     );
  //   } finally {
  //     setEditSaving(false);
  //   }
  // };

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
      const response = await api.postBlob(`/patients/${patientId}/download/zip`, body, { timeout: 600000 });
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
      const response = await api.postBlob(`/patients/${patientId}/download/pdf`, { mode }, { timeout: 600000 });
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

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-8">
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
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center">
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
  // const patientInitials = patient.patientName
  //   .split(" ")
  //   .map((n) => n[0])
  //   .filter(Boolean)
  //   .slice(0, 2)
  //   .join("")
  //   .toUpperCase();

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg overflow-hidden">
      {/* Decorative primary glow — single element for the whole page */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />
      <header className="relative">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Top row: back + identity + actions */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                onClick={() => navigate("/dashboard")}
                aria-label="Back to dashboard"
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

              {/* Patient initials avatar */}
              {/* <div
                aria-hidden="true"
                className="hidden sm:flex h-12 w-12 shrink-0 rounded-xl bg-gradient-primary text-white font-heading font-bold text-base items-center justify-center shadow-primary ring-2 ring-white"
              >
                {patientInitials || "?"}
              </div> */}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1.5">
                  <h1 className="font-heading text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight truncate">
                    {patient.patientName}
                  </h1>
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
                    {patient.patientId}
                  </span>
                  <button
                    onClick={refreshPatient}
                    disabled={syncing}
                    title="Refresh"
                    aria-label="Refresh patient"
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
                <p className="text-sm text-neutral-500 flex items-center gap-1.5">
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
                  {totalFileCount} file{totalFileCount !== 1 ? "s" : ""} in{" "}
                  {foldersWithFiles} folder{foldersWithFiles !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Edit Patient — mobile-only (CLAUDE.md §11). Uncomment to re-enable.
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-white text-primary-700 border border-neutral-200 hover:bg-primary-50 hover:border-primary-200 text-sm font-semibold shadow-card transition-colors"
              >
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
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Patient
              </button>
              */}
              <button
                type="button"
                onClick={handleDownloadAllPdf}
                disabled={pdfLoading || hasNoFiles}
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
                Download All PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={zipLoading || hasNoFiles}
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
                Download All ZIP
              </button>
            </div>
          </div>

          {/* Remarks — always visible, primary-accented */}
          <div className="mt-5 relative bg-white rounded-xl border border-primary-100 pl-5 pr-5 py-4 overflow-hidden">
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-primary"
            />
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary-700 mb-1.5">
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Clinical Remarks
            </div>
            {patient.remarks ? (
              <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
                {patient.remarks}
              </p>
            ) : (
              <p className="text-sm italic text-neutral-400">
                No remarks added for this patient.
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Folders Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Document Folders</h2>
          <p className="text-sm text-gray-500">{patient.folders.length} folders</p>
        </div>

        {/* Folders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {patient.folders.map((folder, idx) => {
            const color = getFolderColor(idx);
            const iconPath = getFolderIcon(folder.name);
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
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${hasFiles ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400"
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

      {/* Edit Patient modal — mobile-only (CLAUDE.md §11). Uncomment to re-enable on web.
      {editOpen && (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-patient-title"
        >
          <div
            className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm"
            onClick={() => !editSaving && setEditOpen(false)}
          />
          <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
            <div className="relative w-full sm:max-w-md bg-surface-white rounded-2xl shadow-modal ring-1 ring-neutral-200 overflow-hidden">
              <div className="px-6 pt-6 pb-2 flex items-start justify-between">
                <div>
                  <h3
                    id="edit-patient-title"
                    className="font-heading text-lg font-bold text-neutral-900"
                  >
                    Edit Patient
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Update the patient's name or clinical remarks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !editSaving && setEditOpen(false)}
                  aria-label="Close"
                  className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                {editError && (
                  <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                    <span>{editError}</span>
                  </div>
                )}
                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Patient Name</span>
                  <input type="text" value={editForm.patientName} onChange={(e) => setEditForm((f) => ({ ...f, patientName: e.target.value }))} disabled={editSaving} className="w-full bg-surface-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                    <span>Remarks</span>
                    <span className="text-neutral-400 normal-case tracking-normal">{editForm.remarks.length}/500</span>
                  </span>
                  <textarea rows={4} value={editForm.remarks} onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value.slice(0, 500) }))} disabled={editSaving} className="w-full bg-surface-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
                </label>
              </div>
              <div className="px-6 py-4 bg-neutral-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button type="button" onClick={() => !editSaving && setEditOpen(false)} disabled={editSaving} className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 bg-surface-white border border-neutral-200">Cancel</button>
                <button type="button" onClick={saveEdit} disabled={editSaving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-primary">
                  {editSaving && <Spinner variant="heartbeat" size="sm" />}
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      */}
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
      const response = await api.getBlob(url, { timeout: 600000 });
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
      className={`flex-1 text-xs px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 disabled:opacity-50 transition-colors font-medium ${isPdf
        ? "bg-red-50 text-red-600 hover:bg-red-100"
        : "bg-blue-50 text-blue-600 hover:bg-blue-100"
        }`}
    >
      {loading ? (
        <Spinner variant="scan" size="xs" />
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
