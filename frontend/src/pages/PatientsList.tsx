/**
 * Patients List Page
 * Displays paginated list of patients
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { fetchPatients } from "../services/patientApi";
import { Button } from "../components/Button";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { Toast } from "../components/Toast";
import type { Patient } from "../services/patientApi";

const ITEMS_PER_PAGE = 20;

export const PatientsList: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const skip = (currentPage - 1) * ITEMS_PER_PAGE;

  useEffect(() => {
    loadPatients();
  }, [currentPage, searchTerm]);

  const loadPatients = async () => {
    try {
      setLoading(true);
      const skip = (currentPage - 1) * ITEMS_PER_PAGE;
      const data = (await fetchPatients(ITEMS_PER_PAGE, skip, searchTerm)) as any;
      setPatients(data.patients || []);
      setTotalCount(data.total || 0);
    } catch (error: any) {
      setToast({
        message: error.message || "Failed to load patients",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients; // No need for client-side filtering, server handles it now

  const handlePatientClick = (patientId: string) => {
    navigate(`/patients/${patientId}`);
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Button label="← Back" onClick={handleBack} variant="secondary" size="sm" className="mb-4" />
            <h1 className="text-4xl font-bold text-gray-900">Patients</h1>
            <p className="text-gray-600 mt-2">
              Total: <strong>{totalCount}</strong> patient{totalCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or medical record number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Button label="Search" onClick={() => setCurrentPage(1)} variant="primary" size="sm" />
          </div>
        </div>

        {/* Patients List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-6">
              <SkeletonLoader count={5} />
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-xl font-medium text-gray-900 mb-2">No Patients Found</h3>
              <p className="text-gray-600">{searchTerm ? "No patients match your search criteria" : "No patients available in the system"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Medical Record #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Joined</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPatients.map((patient) => (
                    <tr key={patient._id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handlePatientClick(patient._id)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{patient.patientName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{patient.medicalRecordNumber || "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{patient.email || "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{patient.phone || "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <Button label="View →" onClick={() => handlePatientClick(patient._id)} variant="primary" size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && filteredPatients.length > 0 && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button label="← Previous" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} variant="secondary" size="sm" disabled={currentPage === 1} />

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    page === currentPage ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <Button label="Next →" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} variant="secondary" size="sm" disabled={currentPage === totalPages} />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default PatientsList;
