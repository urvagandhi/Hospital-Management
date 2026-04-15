/**
 * Hospitals List Page
 * Display all registered hospitals
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";
import { adminForceDeleteHospital } from "../services/hospitalService";
import { isPlaceholderLogo } from "../utils/avatar";

interface Hospital {
  _id: string;
  hospitalName: string;
  email: string;
  phone: string;
  authCode?: string;
  address: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: string;
  role?: "admin" | "hospital";
  // true until the hospital logs in and sets their own password. While true,
  // the admin can resend the welcome email (issues a new temp password).
  mustChangePassword?: boolean;
}

export const HospitalsList: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();
  const { hospital } = state;

  const isAdmin = hospital?.role === "admin";
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [editForm, setEditForm] = useState({
    hospitalName: "",
    email: "",
    phone: "",
    address: "",
    isActive: true,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Admin force-delete modal state
  const [deletingHospital, setDeletingHospital] = useState<Hospital | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDeleteModal = (h: Hospital) => {
    setDeletingHospital(h);
    setDeletePassword("");
    setDeleteReason("");
    setDeleteConfirmText("");
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeletingHospital(null);
    setDeletePassword("");
    setDeleteReason("");
    setDeleteConfirmText("");
    setDeleteError(null);
  };

  const handleForceDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingHospital) return;
    if (deleteConfirmText.trim() !== "DELETE") {
      setDeleteError('Please type DELETE to confirm');
      return;
    }
    if (deleteReason.trim().length < 10) {
      setDeleteError("Reason must be at least 10 characters");
      return;
    }
    if (!deletePassword) {
      setDeleteError("Your admin password is required");
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await adminForceDeleteHospital(deletingHospital._id, deletePassword, deleteReason.trim());
      setHospitals((prev) => prev.filter((h) => h._id !== deletingHospital._id));
      setDeletingHospital(null);
      setDeletePassword("");
      setDeleteReason("");
      setDeleteConfirmText("");
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete hospital");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleResendWelcome = async (h: Hospital) => {
    const confirmMsg = h.mustChangePassword
      ? `Resend welcome email to ${h.email}?\n\nThis generates a NEW temporary password and overwrites the current one. Only use if the hospital hasn't received the original email.`
      : `Resend the Auth Code email to ${h.email}?\n\nThis re-delivers the existing Auth Code. The password will NOT be changed.`;
    if (!window.confirm(confirmMsg)) return;
    setResendingId(h._id);
    setResendMessage(null);
    try {
      await api.post(`/hospitals/${h._id}/resend-welcome`);
      setResendMessage({ id: h._id, text: "Welcome email resent successfully.", ok: true });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Failed to resend welcome email";
      setResendMessage({ id: h._id, text: msg, ok: false });
    } finally {
      setResendingId(null);
      setTimeout(() => setResendMessage((m) => (m && m.id === h._id ? null : m)), 4000);
    }
  };

  useEffect(() => {
    document.title = "Hospitals - Hospital Management";
    loadHospitals();
  }, []);

  const loadHospitals = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<{ data: Hospital[] }>("/hospitals");
      setHospitals(response.data.data || []);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || "Failed to load hospitals";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredHospitals = hospitals.filter(
    (hospital) =>
      hospital.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hospital.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hospital.phone.includes(searchTerm) ||
      (hospital.authCode && hospital.authCode.includes(searchTerm)),
  );

  const stats = useMemo(() => {
    const activeCount = hospitals.filter((h) => h.isActive).length;
    const inactiveCount = hospitals.length - activeCount;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = hospitals.filter((h) => new Date(h.createdAt) >= weekAgo).length;
    return { activeCount, inactiveCount, recentCount };
  }, [hospitals]);

  const handleEditClick = (hospital: Hospital) => {
    setEditingHospital(hospital);
    // Strip +91 prefix for editing (display bare 10 digits)
    const barePhone = hospital.phone.startsWith("+91") ? hospital.phone.slice(3) : hospital.phone;
    setEditForm({
      hospitalName: hospital.hospitalName,
      email: hospital.email,
      phone: barePhone,
      address: hospital.address,
      isActive: hospital.isActive,
    });
    setLogoFile(null);
    setLogoPreview(hospital.logoUrl || null);
    setEditError(null);
    setEditSuccess(null);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setEditError("Please select an image file");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setEditError("Logo size must be less than 2MB");
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHospital) return;

    setEditLoading(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const formData = new FormData();
      formData.append("hospitalName", editForm.hospitalName);
      formData.append("email", editForm.email);
      formData.append("phone", editForm.phone.replace(/[^\d]/g, ""));
      formData.append("address", editForm.address);
      formData.append("isActive", editForm.isActive.toString());
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const response = await api.put<{ data: { logoUrl: string } }>(`/hospitals/${editingHospital._id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setEditSuccess("Hospital updated successfully!");

      const updatedHospital = { ...editForm, logoUrl: response.data.data.logoUrl };
      setHospitals(hospitals.map((h) => (h._id === editingHospital._id ? { ...h, ...updatedHospital } : h)));

      setTimeout(() => {
        setEditingHospital(null);
        setEditSuccess(null);
        setLogoFile(null);
        setLogoPreview(null);
      }, 1500);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || "Failed to update hospital";
      setEditError(errorMessage);
    } finally {
      setEditLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const avatarGradients = [
    "from-blue-500 to-indigo-600",
    "from-emerald-500 to-teal-600",
    "from-violet-500 to-purple-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-cyan-500 to-blue-600",
    "from-indigo-500 to-violet-600",
    "from-teal-500 to-emerald-600",
  ];

  const getAvatarGradient = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatarGradients[Math.abs(hash) % avatarGradients.length];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Registered{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Hospitals
                </span>
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage and monitor all hospitals in the system
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => navigate("/register")}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-blue-500/40 active:scale-[0.98]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Register Hospital
              </button>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Hospitals</p>
                <p className="text-2xl font-bold text-gray-900">{loading ? "-" : hospitals.length}</p>
              </div>
            </div>
            <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-blue-50/50" />
          </div>

          <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Active</p>
                <p className="text-2xl font-bold text-gray-900">{loading ? "-" : stats.activeCount}</p>
              </div>
            </div>
            <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-emerald-50/50" />
          </div>

          <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-violet-50 text-violet-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Added This Week</p>
                <p className="text-2xl font-bold text-gray-900">{loading ? "-" : stats.recentCount}</p>
              </div>
            </div>
            <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-violet-50/50" />
          </div>
        </div>

        {/* Search + Count Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-gray-600">
              {!loading && (
                <>
                  Showing <span className="font-semibold text-gray-900">{filteredHospitals.length}</span> of{" "}
                  <span className="font-semibold text-gray-900">{hospitals.length}</span> hospital{hospitals.length !== 1 ? "s" : ""}
                </>
              )}
            </p>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="w-full sm:w-80 pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && <div className="mb-6"><ErrorMessage message={error} type="error" onClose={() => setError(null)} /></div>}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                <div className="h-36 bg-gradient-to-br from-gray-200 to-gray-100 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-gray-300/50" />
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-36 bg-gray-200 rounded" />
                    <div className="h-5 w-16 bg-gray-200 rounded-full" />
                  </div>
                  <div className="h-4 w-48 bg-gray-100 rounded" />
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-4 w-40 bg-gray-100 rounded" />
                  <div className="h-9 w-full bg-gray-100 rounded-xl mt-4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hospitals Grid */}
        {!loading && (
          <>
            {filteredHospitals.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-16 text-center">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-gray-900 font-medium">No hospitals found</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {searchTerm ? "Try adjusting your search terms" : "No hospitals registered yet"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredHospitals.map((h) => (
                  <div
                    key={h._id}
                    className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-100 transition-all duration-300 overflow-hidden"
                  >
                    {/* Card Header with Logo */}
                    <div className={`relative h-36 bg-gradient-to-br ${getAvatarGradient(h.hospitalName)} flex items-center justify-center`}>
                      <div className="absolute inset-0 bg-black/5" />
                      {/* Decorative circles */}
                      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
                      <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-white/10" />

                      {h.logoUrl && !isPlaceholderLogo(h.logoUrl) ? (
                        <img
                          src={h.logoUrl}
                          alt={h.hospitalName}
                          className="relative w-20 h-20 object-cover rounded-2xl border-4 border-white/90 shadow-lg group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="relative w-20 h-20 bg-white/90 rounded-2xl flex items-center justify-center border-4 border-white/90 shadow-lg group-hover:scale-105 transition-transform duration-300">
                          <span className="text-2xl font-bold text-gray-600">
                            {getInitials(h.hospitalName)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700 transition-colors leading-tight flex-1 mr-2">
                          {h.hospitalName}
                        </h3>
                        <span
                          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
                            h.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                              : "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${h.isActive ? "bg-emerald-500" : "bg-red-500"}`} />
                          {h.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {h.authCode && (
                          <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                            </div>
                            <span className="font-mono text-xs bg-blue-50 text-blue-700 tracking-widest font-semibold px-2 py-0.5 rounded">{h.authCode}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 text-sm text-gray-600">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <span className="truncate">{h.email}</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-sm text-gray-600">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <span>{h.phone}</span>
                        </div>

                        <div className="flex items-start gap-2.5 text-sm text-gray-600">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mt-0.5">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <span className="flex-1 line-clamp-2">{h.address}</span>
                        </div>
                      </div>

                      {/* Resend status message (only for this card) */}
                      {resendMessage?.id === h._id && (
                        <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${resendMessage.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {resendMessage.text}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400">
                          Registered {new Date(h.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* Admin-provisioned (mustChangePassword=true) → resends with a fresh temp password.
                              Self-registered (mustChangePassword=false) → re-delivers the existing Auth Code only. */}
                          {isAdmin && (
                            <button
                              onClick={() => handleResendWelcome(h)}
                              disabled={resendingId === h._id}
                              title={h.mustChangePassword
                                ? "Resend the welcome email with a new temporary password"
                                : "Re-deliver the Auth Code email (password unchanged)"}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors duration-200 disabled:opacity-60 disabled:cursor-wait"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {resendingId === h._id
                                ? "Sending…"
                                : h.mustChangePassword ? "Resend Email" : "Resend Auth Code"}
                            </button>
                          )}
                          <button
                            onClick={() => handleEditClick(h)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors duration-200"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Edit
                          </button>
                          {isAdmin && h.role !== "admin" && h._id !== hospital?._id && (
                            <button
                              onClick={() => openDeleteModal(h)}
                              title="Permanently delete this hospital (requires your admin password)"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors duration-200"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                              </svg>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Edit Modal */}
        {editingHospital && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setEditingHospital(null)}>
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 sm:p-8">
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Edit Hospital</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Update hospital information</p>
                  </div>
                  <button
                    onClick={() => setEditingHospital(null)}
                    className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {editError && <ErrorMessage message={editError} type="error" onClose={() => setEditError(null)} />}
                {editSuccess && <ErrorMessage message={editSuccess} type="success" onClose={() => setEditSuccess(null)} />}

                <form onSubmit={handleEditSubmit} className="space-y-5 mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Hospital Name</label>
                      <input
                        type="text"
                        value={editForm.hospitalName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, hospitalName: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 bg-gray-100 text-gray-500 text-sm font-medium select-none">
                          +91
                        </span>
                        <input
                          type="tel"
                          value={editForm.phone}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, phone: e.target.value.replace(/[^\d]/g, "") })}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                          required
                          maxLength={10}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hospital Logo</label>
                    {logoPreview ? (
                      <div className="flex items-start gap-4">
                        <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-blue-200 shadow-sm">
                          <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-500 mb-2">{logoFile ? "New logo selected" : "Current logo"}</p>
                          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Change Logo
                            <input type="file" onChange={handleLogoChange} accept="image/*" className="hidden" />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-300 transition-colors">
                        <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <label className="cursor-pointer">
                          <span className="text-sm text-blue-600 hover:text-blue-700 font-medium">Upload a logo</span>
                          <input type="file" onChange={handleLogoChange} accept="image/*" className="hidden" />
                        </label>
                        <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF up to 2MB</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                    <textarea
                      value={editForm.address}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                      rows={3}
                      required
                    />
                  </div>

                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={editForm.isActive}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                      Hospital is Active
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingHospital(null)}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
                    >
                      {editLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Updating...
                        </span>
                      ) : (
                        "Update Hospital"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Admin Force-Delete Modal */}
        {deletingHospital && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={closeDeleteModal}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Permanently Delete Hospital?</h2>
                      <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone</p>
                    </div>
                  </div>
                  <button
                    onClick={closeDeleteModal}
                    disabled={deleteLoading}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-800">
                  You are about to delete{" "}
                  <span className="font-semibold">{deletingHospital.hospitalName}</span> ({deletingHospital.email}).
                  All sessions will be revoked and personal data scrubbed. The audit log is preserved.
                </div>

                {deleteError && (
                  <div className="mb-3">
                    <ErrorMessage message={deleteError} type="error" onClose={() => setDeleteError(null)} />
                  </div>
                )}

                <form onSubmit={handleForceDelete} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Why is this hospital being force-deleted? (min 10 chars; written to audit log)"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none"
                      required
                      disabled={deleteLoading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Your Admin Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="Re-enter your password"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                      required
                      disabled={deleteLoading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Type <span className="font-mono font-semibold">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                      required
                      disabled={deleteLoading}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeDeleteModal}
                      disabled={deleteLoading}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={deleteLoading || deleteConfirmText.trim() !== "DELETE"}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/25"
                    >
                      {deleteLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Deleting…
                        </span>
                      ) : (
                        "Permanently Delete"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HospitalsList;
