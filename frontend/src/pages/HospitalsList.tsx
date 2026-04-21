/**
 * Hospitals List — admin-only directory of every registered hospital.
 *
 * Features preserved (unchanged from prior implementation):
 *   • Search across name / email / phone / auth code
 *   • Stat cards (total, active, added this week)
 *   • Card grid with status pill + per-card actions (resend / edit / delete)
 *   • Inline edit modal (multipart PUT /hospitals/:id with optional logo)
 *   • Resend-welcome confirmation (handles both new temp pw + Auth Code modes)
 *   • Admin force-delete modal (password + reason + DELETE confirm)
 */

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import PageLoader from "../components/PageLoader";
import Spinner from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import api from "../services/api";
import { adminForceDeleteHospital } from "../services/hospitalService";
import { getInitials, isPlaceholderLogo } from "../utils/avatar";

interface Hospital {
  _id: string;
  hospitalName: string;
  email: string;
  phone: string;
  authCode?: string;
  address?: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: string;
  role?: "admin" | "hospital";
  mustChangePassword?: boolean;
}

// Shared input styling (focus ring matches Profile / HospitalRegistration)
const INPUT_BASE =
  "w-full px-4 py-2.5 bg-surface-white border rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 transition-all focus:outline-none focus:ring-4";
const inputClass = (hasError: boolean, danger = false) =>
  `${INPUT_BASE} ${
    hasError || danger
      ? "border-danger focus:border-danger focus:ring-danger/10"
      : "border-neutral-200 focus:border-primary-400 focus:ring-primary-100"
  }`;

export const HospitalsList: React.FC = () => {
  useDocumentTitle("Hospitals — Hospital Management");
  const navigate = useNavigate();
  const { state, updateHospital } = useAuth();
  const { hospital } = state;
  const isAdmin = hospital?.role === "admin";

  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Server-side pagination state (TD-005).
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totals, setTotals] = useState<{ total: number; active: number; recentWeek: number } | null>(null);

  // Edit modal
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

  // Resend
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<{
    id: string;
    text: string;
    ok: boolean;
  } | null>(null);
  const [resendTarget, setResendTarget] = useState<Hospital | null>(null);

  // Admin force-delete
  const [deletingHospital, setDeletingHospital] = useState<Hospital | null>(
    null,
  );
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Debounce search so we don't spam /hospitals on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // First-page fetch whenever the debounced search changes.
  useEffect(() => {
    loadHospitals({ reset: true, search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const loadHospitals = async ({
    reset,
    search,
    cursor,
  }: {
    reset: boolean;
    search: string;
    cursor?: string | null;
  }) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", "50");
      if (search) params.set("search", search);
      if (cursor) params.set("cursor", cursor);

      const response = await api.get<{
        data: Hospital[];
        nextCursor: string | null;
        totals?: { total: number; active: number; recentWeek: number };
      }>(`/hospitals?${params.toString()}`);

      const rows = response.data.data || [];
      setHospitals((prev) => (reset ? rows : [...prev, ...rows]));
      setNextCursor(response.data.nextCursor || null);
      if (reset && response.data.totals) {
        setTotals(response.data.totals);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to load hospitals",
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!nextCursor || loadingMore) return;
    loadHospitals({ reset: false, search: debouncedSearch, cursor: nextCursor });
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  // Server returns already-filtered results — no client-side filter anymore.
  const filteredHospitals = hospitals;

  // Stat cards prefer server-computed global totals (first-page response).
  // Fall back to currently-loaded rows while totals are in flight.
  const stats = useMemo(() => {
    if (totals) {
      return {
        activeCount: totals.active,
        inactiveCount: totals.total - totals.active,
        recentCount: totals.recentWeek,
        totalCount: totals.total,
      };
    }
    const activeCount = hospitals.filter((h) => h.isActive).length;
    const inactiveCount = hospitals.length - activeCount;
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentCount = hospitals.filter(
      (h) => new Date(h.createdAt).getTime() >= weekAgo,
    ).length;
    return {
      activeCount,
      inactiveCount,
      recentCount,
      totalCount: hospitals.length,
    };
  }, [hospitals, totals]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleEditClick = (h: Hospital) => {
    setEditingHospital(h);
    const barePhone = h.phone.startsWith("+91") ? h.phone.slice(3) : h.phone;
    setEditForm({
      hospitalName: h.hospitalName,
      email: h.email,
      phone: barePhone,
      address: h.address || "",
      isActive: h.isActive,
    });
    setLogoFile(null);
    setLogoPreview(h.logoUrl || null);
    setEditError(null);
    setEditSuccess(null);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHospital) return;

    setEditLoading(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const body = new FormData();
      body.append("hospitalName", editForm.hospitalName);
      body.append("email", editForm.email);
      body.append("phone", editForm.phone.replace(/[^\d]/g, ""));
      body.append("address", editForm.address || "");
      body.append("isActive", editForm.isActive.toString());
      if (logoFile) body.append("logo", logoFile);

      const response = await api.put<{ data: { logoUrl: string } }>(
        `/hospitals/${editingHospital._id}`,
        body,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      setEditSuccess("Hospital updated successfully!");

      const updated = {
        ...editForm,
        logoUrl: response.data.data.logoUrl,
      };
      setHospitals(
        hospitals.map((h) =>
          h._id === editingHospital._id ? { ...h, ...updated } : h,
        ),
      );

      if (editingHospital._id === state.hospital?._id) {
        updateHospital({ ...state.hospital, ...updated });
      }

      setTimeout(() => {
        setEditingHospital(null);
        setEditSuccess(null);
        setLogoFile(null);
        setLogoPreview(null);
      }, 1500);
    } catch (err: any) {
      setEditError(
        err.response?.data?.message || err.message || "Failed to update hospital",
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleResendWelcome = async (h: Hospital) => {
    setResendTarget(null);
    setResendingId(h._id);
    setResendMessage(null);
    try {
      const res = await api.post<{ message?: string }>(
        `/hospitals/${h._id}/resend-welcome`,
      );
      const msg =
        res.data?.message ||
        (h.mustChangePassword
          ? "Welcome email resent successfully."
          : "Auth Code email resent successfully.");
      setResendMessage({ id: h._id, text: msg, ok: true });
    } catch (err: any) {
      setResendMessage({
        id: h._id,
        text:
          err.response?.data?.message ||
          err.message ||
          "Failed to resend welcome email",
        ok: false,
      });
    } finally {
      setResendingId(null);
      setTimeout(
        () => setResendMessage((m) => (m && m.id === h._id ? null : m)),
        4000,
      );
    }
  };

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
      setDeleteError("Please type DELETE to confirm");
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
      await adminForceDeleteHospital(
        deletingHospital._id,
        deletePassword,
        deleteReason.trim(),
      );
      setHospitals((prev) =>
        prev.filter((h) => h._id !== deletingHospital._id),
      );
      // Keep server-computed totals in sync after delete.
      setTotals((prev) =>
        prev
          ? {
              ...prev,
              total: Math.max(0, prev.total - 1),
              active: deletingHospital.isActive
                ? Math.max(0, prev.active - 1)
                : prev.active,
            }
          : prev,
      );
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

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <PageLoader label="Loading hospitals…" />;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
              Registered{" "}
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                Hospitals
              </span>
            </h1>
            <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
              Manage and monitor every hospital in the system.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-primary text-white text-sm font-semibold rounded-xl shadow-primary hover:shadow-card-hover hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none transition-all"
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Register Hospital
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <StatCard
            label="Total Hospitals"
            value={stats.totalCount}
            tone="primary"
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
                aria-hidden="true"
              >
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
                <path d="M9 9h6" />
                <path d="M9 13h6" />
                <path d="M9 17h6" />
              </svg>
            }
          />
          <StatCard
            label="Active"
            value={stats.activeCount}
            tone="success"
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
          />
          <StatCard
            label="Added This Week"
            value={stats.recentCount}
            tone="primary"
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
          />
        </div>

        {/* Search + count */}
        <div className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-neutral-600">
              Showing{" "}
              <span className="font-semibold text-neutral-900">
                {filteredHospitals.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-neutral-900">
                {debouncedSearch ? filteredHospitals.length : stats.totalCount}
              </span>{" "}
              hospital{stats.totalCount !== 1 ? "s" : ""}
              {debouncedSearch && (
                <span className="text-neutral-500"> (matching “{debouncedSearch}”)</span>
              )}
            </p>
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
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
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search by name, email, or phone…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputClass(false)} sm:w-80 pl-9`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors"
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
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6">
            <ErrorMessage
              message={error}
              type="error"
              onClose={() => setError(null)}
            />
          </div>
        )}

        {/* Grid / empty */}
        {filteredHospitals.length === 0 ? (
          <div className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 px-6 py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-8 h-8 text-neutral-400"
                aria-hidden="true"
              >
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
                <path d="M9 9h6" />
                <path d="M9 13h6" />
              </svg>
            </div>
            <p className="text-neutral-900 font-medium">No hospitals found</p>
            <p className="text-sm text-neutral-500 mt-1">
              {searchTerm
                ? "Try adjusting your search terms."
                : "No hospitals registered yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredHospitals.map((h) => {
              const isOwn = h._id === hospital?._id;
              return (
                <div
                  key={h._id}
                  className="group bg-surface-white rounded-2xl border border-neutral-200 shadow-card hover:shadow-card-hover hover:border-primary-200 transition-all overflow-hidden"
                >
                  {/* Gradient header with logo */}
                  <div className="relative h-32 bg-gradient-primary flex items-center justify-center overflow-hidden">
                    <div
                      aria-hidden="true"
                      className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-white/10"
                    />
                    {h.logoUrl && !isPlaceholderLogo(h.logoUrl) ? (
                      <img
                        src={h.logoUrl}
                        alt={h.hospitalName}
                        className="relative w-20 h-20 object-cover rounded-2xl ring-4 ring-white/90 shadow-card group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="relative w-20 h-20 bg-white rounded-2xl flex items-center justify-center ring-4 ring-white/90 shadow-card group-hover:scale-105 transition-transform">
                        <span className="text-2xl font-heading font-bold text-primary-600">
                          {getInitials(h.hospitalName) || "H"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4 gap-2">
                      <h3 className="text-base font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors leading-tight flex-1 break-words">
                        {h.hospitalName}
                        {isOwn && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-700 text-[10px] font-semibold ring-1 ring-inset ring-primary-600/15 align-middle">
                            You
                          </span>
                        )}
                      </h3>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full ${
                          h.isActive
                            ? "bg-success/10 text-success"
                            : "bg-danger/10 text-danger"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            h.isActive ? "bg-success" : "bg-danger"
                          }`}
                          aria-hidden="true"
                        />
                        {h.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {h.authCode && (
                        <Detail
                          icon={
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="w-4 h-4 text-primary-600"
                              aria-hidden="true"
                            >
                              <rect
                                x="3"
                                y="11"
                                width="18"
                                height="11"
                                rx="2"
                                ry="2"
                              />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          }
                          tone="primary"
                        >
                          <span className="font-mono text-xs bg-primary-50 text-primary-700 tracking-[0.18em] font-bold px-2 py-0.5 rounded">
                            {h.authCode}
                          </span>
                        </Detail>
                      )}
                      <Detail
                        icon={
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4 text-neutral-400"
                            aria-hidden="true"
                          >
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                        }
                      >
                        <span className="truncate">{h.email}</span>
                      </Detail>
                      <Detail
                        icon={
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4 text-neutral-400"
                            aria-hidden="true"
                          >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        }
                      >
                        <span className="font-mono">{h.phone}</span>
                      </Detail>
                      <Detail
                        align="start"
                        icon={
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4 text-neutral-400"
                            aria-hidden="true"
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                        }
                      >
                        <span className="flex-1 line-clamp-2">
                          {h.address || "—"}
                        </span>
                      </Detail>
                    </div>

                    {/* Resend status */}
                    {resendMessage?.id === h._id && (
                      <div
                        className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
                          resendMessage.ok
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-danger/10 text-danger border-danger/20"
                        }`}
                      >
                        {resendMessage.text}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between gap-2">
                      <span className="text-xs text-neutral-400">
                        Registered{" "}
                        {new Date(h.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isAdmin && (
                          <ActionButton
                            title={
                              h.mustChangePassword
                                ? "Resend welcome email with new temp password"
                                : "Re-deliver Auth Code email (password unchanged)"
                            }
                            onClick={() => setResendTarget(h)}
                            disabled={resendingId === h._id}
                            tone="warning"
                            loading={resendingId === h._id}
                            icon={
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
                                <rect
                                  x="2"
                                  y="4"
                                  width="20"
                                  height="16"
                                  rx="2"
                                />
                                <polyline points="22,6 12,13 2,6" />
                              </svg>
                            }
                          />
                        )}
                        <ActionButton
                          title="Edit hospital"
                          onClick={() => handleEditClick(h)}
                          tone="primary"
                          icon={
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
                          }
                        />
                        {isAdmin && h.role !== "admin" && !isOwn && (
                          <ActionButton
                            title="Delete hospital (requires admin password)"
                            onClick={() => openDeleteModal(h)}
                            tone="danger"
                            icon={
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
                                <path d="M3 6h18" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                              </svg>
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load-more: server-side cursor pagination (TD-005) */}
        {nextCursor && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-5 py-2.5 rounded-xl border border-neutral-200 bg-surface-white text-sm font-medium text-neutral-700 hover:border-primary-300 hover:bg-primary-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {loadingMore ? (
                <>
                  <Spinner variant="heartbeat" size="sm" />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </button>
          </div>
        )}

        {/* ── Resend confirmation ──────────────────────────────────── */}
        {resendTarget && (
          <ModalShell onClose={() => setResendTarget(null)}>
            <div
              className={`relative h-20 ${resendTarget.mustChangePassword ? "bg-gradient-to-br from-warning to-orange-500" : "bg-gradient-primary"} flex items-center justify-center overflow-hidden`}
            >
              <div
                aria-hidden="true"
                className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10"
              />
              <div
                aria-hidden="true"
                className="absolute -left-3 -bottom-3 w-14 h-14 rounded-full bg-white/10"
              />
              <div className="relative w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-card">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-6 h-6 text-neutral-700"
                  aria-hidden="true"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
            </div>

            <div className="p-6">
              <h3 className="font-heading text-lg font-bold text-neutral-900 text-center">
                {resendTarget.mustChangePassword
                  ? "Resend Welcome Email?"
                  : "Resend Auth Code Email?"}
              </h3>
              <p className="mt-2 text-sm text-neutral-600 text-center leading-relaxed">
                Send to{" "}
                <span className="font-semibold text-neutral-900 break-all">
                  {resendTarget.email}
                </span>
              </p>

              <div
                className={`mt-4 rounded-xl p-3.5 text-sm border ${resendTarget.mustChangePassword ? "bg-warning/10 border-warning/30 text-warning" : "bg-primary-50 border-primary-100 text-primary-700"}`}
              >
                {resendTarget.mustChangePassword ? (
                  <div className="flex gap-2.5">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 mt-0.5 shrink-0"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div>
                      A <strong>new temporary password</strong> will be
                      generated and the current one overwritten. The Auth Code
                      stays the same.
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2.5">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 mt-0.5 shrink-0"
                      aria-hidden="true"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                    <div>
                      The existing <strong>Auth Code</strong> will be
                      re-emailed. The hospital's password will{" "}
                      <strong>NOT</strong> be changed.
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setResendTarget(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-neutral-700 bg-surface-bg border border-neutral-200 hover:bg-neutral-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleResendWelcome(resendTarget)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-primary rounded-xl shadow-primary hover:shadow-card-hover transition-all"
                >
                  Yes, Resend
                </button>
              </div>
            </div>
          </ModalShell>
        )}

        {/* ── Edit modal ───────────────────────────────────────────── */}
        {editingHospital && (
          <ModalShell
            onClose={() => setEditingHospital(null)}
            maxWidthClass="sm:max-w-2xl"
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-heading text-xl font-bold text-neutral-900">
                    Edit Hospital
                  </h2>
                  <p className="text-sm text-neutral-500 mt-0.5">
                    Update hospital information
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingHospital(null)}
                  aria-label="Close"
                  className="w-9 h-9 rounded-xl bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 transition-colors"
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
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {editError && (
                <ErrorMessage
                  message={editError}
                  type="error"
                  onClose={() => setEditError(null)}
                />
              )}
              {editSuccess && (
                <ErrorMessage
                  message={editSuccess}
                  type="success"
                  onClose={() => setEditSuccess(null)}
                />
              )}

              <form
                onSubmit={handleEditSubmit}
                className="space-y-5 mt-4"
                encType="multipart/form-data"
              >
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Hospital Name
                  </label>
                  <input
                    type="text"
                    value={editForm.hospitalName}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        hospitalName: e.target.value,
                      })
                    }
                    className={inputClass(false)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm({ ...editForm, email: e.target.value })
                      }
                      className={inputClass(false)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Phone
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-neutral-200 bg-surface-bg text-neutral-500 text-sm font-medium select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={editForm.phone}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            phone: e.target.value
                              .replace(/[^\d]/g, "")
                              .slice(0, 10),
                          })
                        }
                        className={`${inputClass(false)} rounded-l-none`}
                        required
                        maxLength={10}
                      />
                    </div>
                  </div>
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Hospital Logo
                  </label>
                  {logoPreview ? (
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-20 rounded-xl overflow-hidden ring-2 ring-primary-100 shadow-card bg-primary-50">
                        <img
                          src={logoPreview}
                          alt="Logo Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-neutral-500 mb-2">
                          {logoFile ? "New logo selected" : "Current logo"}
                        </p>
                        <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-lg hover:bg-primary-100 transition-colors">
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
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          Change Logo
                          <input
                            type="file"
                            onChange={handleLogoChange}
                            accept="image/*"
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="block border-2 border-dashed border-neutral-200 rounded-xl p-6 text-center hover:border-primary-300 hover:bg-primary-50/40 transition-colors cursor-pointer">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-10 h-10 text-neutral-300 mx-auto mb-2"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span className="text-sm text-primary-700 hover:text-primary-800 font-semibold">
                        Upload a logo
                      </span>
                      <p className="text-xs text-neutral-400 mt-1">
                        PNG, JPG, GIF up to 2 MB
                      </p>
                      <input
                        type="file"
                        onChange={handleLogoChange}
                        accept="image/*"
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Address
                  </label>
                  <textarea
                    value={editForm.address}
                    onChange={(e) =>
                      setEditForm({ ...editForm, address: e.target.value })
                    }
                    rows={3}
                    className={`${inputClass(false)} resize-none`}
                  />
                </div>

                <label className="flex items-center gap-3 bg-surface-bg border border-neutral-200 rounded-xl px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={editForm.isActive}
                    onChange={(e) =>
                      setEditForm({ ...editForm, isActive: e.target.checked })
                    }
                    className="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-neutral-700">
                    Hospital is Active
                  </span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingHospital(null)}
                    disabled={editLoading}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-neutral-700 bg-surface-bg border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-primary rounded-xl shadow-primary hover:shadow-card-hover transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {editLoading ? (
                      <>
                        <Spinner variant="heartbeat" size="sm" />
                        Updating…
                      </>
                    ) : (
                      "Update Hospital"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </ModalShell>
        )}

        {/* ── Admin Force-Delete modal ─────────────────────────────── */}
        {deletingHospital && (
          <ModalShell onClose={closeDeleteModal}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center shrink-0">
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
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-bold text-neutral-900">
                      Permanently Delete Hospital?
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      This action cannot be undone
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleteLoading}
                  aria-label="Close"
                  className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 transition-colors disabled:opacity-50"
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
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 mb-4 text-sm text-danger">
                You are about to delete{" "}
                <span className="font-semibold">
                  {deletingHospital.hospitalName}
                </span>{" "}
                ({deletingHospital.email}). All sessions will be revoked and
                personal data scrubbed. The audit log is preserved.
              </div>

              {deleteError && (
                <div className="mb-3">
                  <ErrorMessage
                    message={deleteError}
                    type="error"
                    onClose={() => setDeleteError(null)}
                  />
                </div>
              )}

              <form onSubmit={handleForceDelete} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Reason <span className="text-danger">*</span>
                  </label>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Why is this hospital being force-deleted? (min 10 chars; written to audit log)"
                    className={`${inputClass(false, true)} resize-none`}
                    required
                    disabled={deleteLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Your Admin Password <span className="text-danger">*</span>
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Re-enter your password"
                    className={inputClass(false, true)}
                    required
                    disabled={deleteLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Type{" "}
                    <span className="font-mono font-bold text-danger">
                      DELETE
                    </span>{" "}
                    to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className={`${inputClass(false, true)} font-mono tracking-[0.25em]`}
                    required
                    disabled={deleteLoading}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    disabled={deleteLoading}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-neutral-700 bg-surface-bg border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      deleteLoading || deleteConfirmText.trim() !== "DELETE"
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-danger rounded-xl hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_6px_16px_-4px_rgba(239,68,68,0.35)]"
                  >
                    {deleteLoading ? (
                      <>
                        <Spinner variant="heartbeat" size="sm" />
                        Deleting…
                      </>
                    ) : (
                      "Permanently Delete"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </ModalShell>
        )}
      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: number;
  tone: "primary" | "success";
  icon: React.ReactNode;
}> = ({ label, value, tone, icon }) => (
  <div className="relative overflow-hidden bg-surface-white rounded-2xl border border-neutral-200 p-6 shadow-card hover:shadow-card-hover transition-shadow">
    <div className="flex items-center gap-4">
      <div
        className={`shrink-0 flex items-center justify-center w-12 h-12 rounded-xl ring-1 ring-inset ${
          tone === "success"
            ? "bg-success/10 text-success ring-success/20"
            : "bg-primary-50 text-primary-600 ring-primary-600/15"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        <p className="text-2xl font-heading font-bold text-neutral-900">
          {value}
        </p>
      </div>
    </div>
    <div
      aria-hidden="true"
      className={`absolute -right-3 -bottom-3 w-20 h-20 rounded-full ${
        tone === "success" ? "bg-success/5" : "bg-primary-100/40"
      }`}
    />
  </div>
);

const Detail: React.FC<{
  icon: React.ReactNode;
  tone?: "neutral" | "primary";
  align?: "center" | "start";
  children: React.ReactNode;
}> = ({ icon, tone = "neutral", align = "center", children }) => (
  <div
    className={`flex gap-2.5 text-sm text-neutral-600 ${
      align === "start" ? "items-start" : "items-center"
    }`}
  >
    <div
      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        tone === "primary" ? "bg-primary-50" : "bg-neutral-100"
      } ${align === "start" ? "mt-0.5" : ""}`}
    >
      {icon}
    </div>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

const ActionButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "primary" | "warning" | "danger";
  icon: React.ReactNode;
  loading?: boolean;
}> = ({ title, onClick, disabled, tone, icon, loading }) => {
  const tones: Record<string, string> = {
    primary: "text-primary-700 bg-primary-50 hover:bg-primary-100",
    warning: "text-warning bg-warning/10 hover:bg-warning/20",
    danger: "text-danger bg-danger/10 hover:bg-danger/20",
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-wait ${tones[tone]}`}
    >
      {loading ? <Spinner variant="heartbeat" size="xs" /> : icon}
    </button>
  );
};

const ModalShell: React.FC<{
  onClose: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
}> = ({ onClose, maxWidthClass = "sm:max-w-md", children }) =>
  // Portal to body so the backdrop can't be trapped by a page-level stacking
  // context (CLAUDE.md §8 — same rule HospitalProfileModal and ConfirmDialog follow).
  createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
        <div
          className={`relative w-full ${maxWidthClass} bg-surface-white rounded-2xl shadow-modal ring-1 ring-neutral-200 overflow-hidden animate-scale-in`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );

export default HospitalsList;
