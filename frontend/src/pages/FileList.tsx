/**
 * File List Page
 * Displays files in a folder with download options
 */

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchFolderFiles, downloadAllPdf, downloadFolderPdf, downloadAllZip, downloadFolderZip } from "../services/patientApi";
import { Button } from "../components/Button";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { Toast } from "../components/Toast";
import type { Folder } from "../services/patientApi";

export const FileList: React.FC = () => {
  const navigate = useNavigate();
  const { patientId, folderName } = useParams<{ patientId: string; folderName: string }>();

  const [folder, setFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<{ [key: string]: boolean }>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    loadFolder();
  }, [patientId, folderName]);

  const loadFolder = async () => {
    if (!patientId || !folderName) return;

    try {
      setLoading(true);
      const decodedFolderName = decodeURIComponent(folderName);
      const data = (await fetchFolderFiles(patientId, decodedFolderName)) as any;
      setFolder(data);
    } catch (error: any) {
      setToast({
        message: error.message || "Failed to load folder",
        type: "error",
      });
      setTimeout(() => navigate(`/patients/${patientId}`), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (fileName: string) => {
    // Note: Single file download would require additional backend endpoint
    // For now, downloading folder PDF instead
    setToast({
      message: "Use 'Download as PDF' or 'Download as ZIP' to get files",
      type: "info",
    });
  };

  const handleDownloadFolderPdf = async () => {
    if (!patientId || !folderName) return;

    try {
      setDownloading((prev) => ({ ...prev, folderPdf: true }));
      const decodedFolderName = decodeURIComponent(folderName);
      await downloadFolderPdf(patientId, decodedFolderName, `Folder_${decodedFolderName}`);
      setToast({
        message: "Folder downloaded as PDF successfully",
        type: "success",
      });
    } catch (error: any) {
      setToast({
        message: error.message || "Failed to download folder PDF",
        type: "error",
      });
    } finally {
      setDownloading((prev) => ({ ...prev, folderPdf: false }));
    }
  };

  const handleDownloadFolderZip = async () => {
    if (!patientId || !folderName) return;

    try {
      setDownloading((prev) => ({ ...prev, folderZip: true }));
      const decodedFolderName = decodeURIComponent(folderName);
      await downloadFolderZip(patientId, decodedFolderName, `Folder_${decodedFolderName}`);
      setToast({
        message: "Folder downloaded as ZIP successfully",
        type: "success",
      });
    } catch (error: any) {
      setToast({
        message: error.message || "Failed to download folder ZIP",
        type: "error",
      });
    } finally {
      setDownloading((prev) => ({ ...prev, folderZip: false }));
    }
  };

  const handleDownloadAllPdf = async () => {
    if (!patientId || !folderName) return;

    try {
      setDownloading((prev) => ({ ...prev, allPdf: true }));
      const decodedFolderName = decodeURIComponent(folderName);
      await downloadAllPdf(patientId, `Patient_Records_${decodedFolderName}`);
      setToast({
        message: "All records downloaded as PDF successfully",
        type: "success",
      });
    } catch (error: any) {
      setToast({
        message: error.message || "Failed to download all PDF",
        type: "error",
      });
    } finally {
      setDownloading((prev) => ({ ...prev, allPdf: false }));
    }
  };

  const handleDownloadAllZip = async () => {
    if (!patientId || !folderName) return;

    try {
      setDownloading((prev) => ({ ...prev, allZip: true }));
      const decodedFolderName = decodeURIComponent(folderName);
      await downloadAllZip(patientId, `Patient_Records_${decodedFolderName}`);
      setToast({
        message: "All records downloaded as ZIP successfully",
        type: "success",
      });
    } catch (error: any) {
      setToast({
        message: error.message || "Failed to download all ZIP",
        type: "error",
      });
    } finally {
      setDownloading((prev) => ({ ...prev, allZip: false }));
    }
  };

  const handleBack = () => {
    navigate(`/patients/${patientId}`);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getMimeTypeIcon = (mimeType: string): string => {
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("image")) return "🖼️";
    if (mimeType.includes("video")) return "🎬";
    if (mimeType.includes("audio")) return "🎵";
    if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
    if (mimeType.includes("sheet") || mimeType.includes("spreadsheet")) return "📊";
    return "📎";
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <Button label="← Back" onClick={handleBack} variant="secondary" size="sm" className="mb-6" />

        {loading ? (
          <div className="bg-white rounded-lg shadow p-8">
            <SkeletonLoader count={3} />
          </div>
        ) : folder ? (
          <>
            {/* Folder Info */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{folder.name}</h1>
                  <p className="text-gray-600">
                    {folder.files?.length || 0} file{folder.files?.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {/* Download Options */}
              <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Download Options</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Button
                    label={downloading.folderPdf ? "Downloading..." : "📄 Folder as PDF"}
                    onClick={handleDownloadFolderPdf}
                    variant="primary"
                    size="sm"
                    disabled={downloading.folderPdf}
                    fullWidth
                  />
                  <Button
                    label={downloading.folderZip ? "Downloading..." : "📦 Folder as ZIP"}
                    onClick={handleDownloadFolderZip}
                    variant="primary"
                    size="sm"
                    disabled={downloading.folderZip}
                    fullWidth
                  />
                  <Button
                    label={downloading.allPdf ? "Downloading..." : "📋 All Records PDF"}
                    onClick={handleDownloadAllPdf}
                    variant="secondary"
                    size="sm"
                    disabled={downloading.allPdf}
                    fullWidth
                  />
                  <Button
                    label={downloading.allZip ? "Downloading..." : "🗂️ All Records ZIP"}
                    onClick={handleDownloadAllZip}
                    variant="secondary"
                    size="sm"
                    disabled={downloading.allZip}
                    fullWidth
                  />
                </div>
              </div>
            </div>

            {/* Files List */}
            {!folder.files || folder.files.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-xl font-medium text-gray-900 mb-2">No Files</h3>
                <p className="text-gray-600">This folder is empty</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">File Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Size</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Uploaded</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {folder.files?.map((file, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{getMimeTypeIcon(file.mimeType)}</span>
                              <span className="line-clamp-1">{file.fileName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <span className="inline-block px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                              {file.mimeType.split("/")[1] || file.mimeType}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{formatFileSize(file.size)}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : "—"}</td>
                          <td className="px-6 py-4 text-right">
                            <Button label="Preview" onClick={() => handleDownloadFile(file.fileName)} variant="secondary" size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">Folder not found</p>
            <Button label="Back" onClick={handleBack} variant="primary" size="sm" className="mt-4" />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default FileList;
