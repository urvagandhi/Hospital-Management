import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
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

const FolderView: React.FC = () => {
    const { patientId, folderName } = useParams<{ patientId: string; folderName: string }>();
    const navigate = useNavigate();
    const [folder, setFolder] = useState<Folder | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFolder();
    }, [patientId, folderName]);

    const fetchFolder = async () => {
        try {
            setLoading(true);
            const response = await api.get<{ success: boolean; data: Folder }>(
                `/patients/${patientId}/files/${folderName}`
            );
            setFolder(response.data.data);
        } catch (error) {
            console.error("Failed to fetch folder:", error);
            persistentLogger.error("FolderView", "Failed to fetch folder", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPdf = async () => {
        try {
            const response = await api.getBlob(`/patients/${patientId}/folders/${folderName}/pdf`);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `${folderName}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Download failed:", error);
        }
    };

    const handleDownloadZip = async () => {
        try {
            const response = await api.getBlob(`/patients/${patientId}/folders/${folderName}/zip`);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `${folderName}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Download failed:", error);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    if (loading) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    if (!folder) {
        return <div className="p-8 text-center">Folder not found</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <button
                        onClick={() => navigate(`/patients/${patientId}`)}
                        className="text-blue-600 hover:text-blue-800 mb-4 flex items-center"
                    >
                        &larr; Back to Patient Details
                    </button>
                    <div className="flex justify-between items-center">
                        <h1 className="text-3xl font-bold text-gray-900 capitalize">{folder.name}</h1>
                        <div className="space-x-4">
                            <button
                                onClick={handleDownloadPdf}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Download Folder PDF
                            </button>
                            <button
                                onClick={handleDownloadZip}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Download Folder ZIP
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {folder.files.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">No files in this folder</div>
                    ) : (
                        <ul className="divide-y divide-gray-200">
                            {folder.files.map((file, index) => (
                                <li key={index} className="p-6 hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <svg
                                                className="w-8 h-8 text-gray-400"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                />
                                            </svg>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{file.fileName}</p>
                                                <p className="text-xs text-gray-500">
                                                    {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        {/* View/Download individual file if needed (requires signed URL from backend) */}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FolderView;
