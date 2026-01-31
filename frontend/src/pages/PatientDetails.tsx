import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { persistentLogger } from "../utils/persistentLogger";

interface File {
  fileName: string;
  size: number;
  uploadedAt: string;
}

interface Folder {
  _id: string;
  name: string;
  files: File[];
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

const PatientDetails: React.FC = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatient();
  }, [patientId]);

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

  const handleDownloadAllPdf = async () => {
    try {
      const response = await api.getBlob(`/patients/${patientId}/download/pdf`);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${patient?.patientName}_records.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleDownloadAllZip = async () => {
    try {
      const response = await api.getBlob(`/patients/${patientId}/download/zip`);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${patient?.patientName}_records.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!patient) {
    return <div className="p-8 text-center">Patient not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-blue-600 hover:text-blue-800 mb-4 flex items-center"
          >
            &larr; Back to Dashboard
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{patient.patientName}</h1>
              <div className="mt-2 text-gray-600 space-y-1">
                <p>MRN: {patient.medicalRecordNumber || "N/A"}</p>
                <p>DOB: {patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : "N/A"}</p>
                <p>Phone: {patient.phone || "N/A"}</p>
                <p>Email: {patient.email || "N/A"}</p>
              </div>
            </div>
            <div className="space-x-4">
              <button
                onClick={handleDownloadAllPdf}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Download All PDF
              </button>
              <button
                onClick={handleDownloadAllZip}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Download All ZIP
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {patient.folders.map((folder) => (
            <div
              key={folder._id}
              onClick={() => navigate(`/patients/${patientId}/folders/${folder.name}`)}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <svg
                    className="w-8 h-8 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 capitalize">{folder.name}</h3>
                </div>
                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                  {folder.files.length} files
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {folder.files.length > 0
                  ? `Last updated: ${new Date(
                    folder.files[folder.files.length - 1].uploadedAt
                  ).toLocaleDateString()}`
                  : "Empty folder"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PatientDetails;
