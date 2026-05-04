/**
 * Profile Page — redesigned as an editorial bento layout.
 *
 * Two flows preserved from the previous design:
 *   • Edit non-sensitive fields (hospitalName, address, logo) via PATCH /me
 *   • Edit sensitive fields (email, phone) via OTP modal:
 *       init → OTP to NEW email (for email change) or current email (phone)
 *       verify → commit
 *
 * Note: the mockup referenced City/State/ZIP as separate fields, but the
 * `hospitals` schema stores a single `address` string. This file sticks to
 * the two fields the backend actually supports.
 */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import { useNetworkStatus } from "../components/NetworkStatus";
import { OtpInput } from "../components/OtpInput";
import PageLoader from "../components/PageLoader";
import Spinner from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useScrollToHash } from "../hooks/useScrollToHash";
import {
  Hospital,
  getCurrentHospital,
  initContactChange,
  patchProfile,
  resendContactChangeOtp,
  verifyContactChange,
} from "../services/hospitalService";
import {
  getAvatarGradient,
  getInitials,
  isPlaceholderLogo,
} from "../utils/avatar";

type ContactField = "email" | "phone";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { state, updateHospital } = useAuth();
  const networkStatus = useNetworkStatus();
  const isOnline = networkStatus === "online";
  useScrollToHash();
  useDocumentTitle("Profile — MyMediVault");

  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile form state
  const [hospitalName, setHospitalName] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Contact-change modal
  const [contactModal, setContactModal] = useState<{
    open: boolean;
    field: ContactField;
    step: "enter" | "otp";
    newValue: string;
    otp: string;
  }>({ open: false, field: "email", step: "enter", newValue: "", otp: "" });
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Count down the resend cooldown every second
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentHospital();
        setHospital(me);
        setHospitalName(me.hospitalName || "");
        setAddress(me.address || "");
      } catch (err: any) {
        setError(err?.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input value so re-picking the same file still fires onChange
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be smaller than 2MB");
      return;
    }
    setError(null);
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const cancelLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!hospital) return;
    const fields: { hospitalName?: string; address?: string } = {};
    if (hospitalName.trim() !== hospital.hospitalName)
      fields.hospitalName = hospitalName.trim();
    if (address.trim() !== (hospital.address || ""))
      fields.address = address.trim();

    if (!Object.keys(fields).length && !logoFile) {
      setError("Nothing to update");
      return;
    }
    if (fields.hospitalName !== undefined && fields.hospitalName.length < 3) {
      setError("Hospital name must be at least 3 characters");
      return;
    }

    setSaving(true);
    try {
      const updated = await patchProfile(fields, logoFile);
      setHospital(updated);
      updateHospital(updated);
      setLogoFile(null);
      setLogoPreview(null);
      setSuccess("Profile updated");
    } catch (err: any) {
      setError(err?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // ── Contact-change modal handlers ───────────────────────────────────────
  const openContactModal = (field: ContactField) => {
    setContactModal({
      open: true,
      field,
      step: "enter",
      newValue: "",
      otp: "",
    });
    setModalError(null);
    setOtpMessage(null);
    setResendCooldown(0);
    setResending(false);
  };
  const closeContactModal = () => {
    setContactModal((m) => ({ ...m, open: false }));
    setResendCooldown(0);
    setResending(false);
  };

  const sendContactOtp = async () => {
    setModalError(null);
    const { field, newValue } = contactModal;
    const trimmed = newValue.trim();
    if (!trimmed) return setModalError(`Enter the new ${field}`);

    if (field === "email") {
      // Stricter than the cheap "x@y.z" regex: reject spaces, require TLD ≥ 2,
      // cap total length at 254 (RFC 5321) and require non-empty local + domain.
      const emailOk = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
        trimmed,
      );
      if (!emailOk || trimmed.length > 254) {
        return setModalError(
          "Enter a valid email address (e.g. name@example.com).",
        );
      }
    }
    if (field === "phone") {
      // Strict: exactly 10 digits, no letters, no separators the user forgot.
      if (!/^\d{10}$/.test(trimmed)) {
        return setModalError(
          "Phone number must be exactly 10 digits (e.g. 9876543210).",
        );
      }
    }

    setModalLoading(true);
    try {
      const payload =
        field === "email" ? { newEmail: trimmed } : { newPhone: trimmed };
      const response = await initContactChange(payload);
      setOtpMessage(response.message);
      setContactModal((m) => ({ ...m, step: "otp" }));
      // Start the 60-second resend cooldown immediately — a code was just sent.
      setResendCooldown(60);
    } catch (err: any) {
      setModalError(err?.message || "Failed to send OTP");
    } finally {
      setModalLoading(false);
    }
  };

  const handleResendContactOtp = async () => {
    if (resending || resendCooldown > 0) return;
    setModalError(null);
    setResending(true);
    try {
      const response = await resendContactChangeOtp();
      setOtpMessage(response.message);
      setResendCooldown(response.data?.retryAfterSeconds ?? 60);
      // Clear any stale OTP the user typed before pressing Resend
      setContactModal((m) => ({ ...m, otp: "" }));
    } catch (err: any) {
      const retry = err?.data?.retryAfterSeconds;
      if (typeof retry === "number") setResendCooldown(retry);
      setModalError(err?.message || "Failed to resend verification code.");
    } finally {
      setResending(false);
    }
  };

  const formatCooldown = (s: number) => {
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  };

  const verifyContactOtp = async () => {
    setModalError(null);
    if (contactModal.otp.length !== 6)
      return setModalError("Enter the 6-digit code");
    setModalLoading(true);
    try {
      const updated = await verifyContactChange(contactModal.otp);
      setHospital(updated);
      updateHospital(updated);
      setSuccess(
        `${contactModal.field === "email" ? "Email" : "Phone number"} updated`,
      );
      closeContactModal();
    } catch (err: any) {
      setModalError(err?.message || "Verification failed");
      setContactModal((m) => ({ ...m, otp: "" }));
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading profile…" />;
  }

  const logoSrc =
    logoPreview ||
    (hospital?.logoUrl && !isPlaceholderLogo(hospital.logoUrl)
      ? hospital.logoUrl
      : null);

  // Input styling — reused across the General Information card
  const inputBase =
    "w-full bg-white border border-neutral-200 rounded-lg px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-[0_1px_0_rgba(0,0,0,0.02)] focus:outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-100 transition-all";

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg overflow-hidden">
      {/* Decorative primary glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />

      <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Page header — asymmetrical, editorial */}
        <header className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-2">
              Hospital Profile
            </h1>
            <p className="text-neutral-500 text-sm md:text-base max-w-xl leading-relaxed">
              Manage your hospital's operational profile, brand identity, and
              secure contact information.
            </p>
          </div>
          {hospital && (
            <div className="hidden sm:flex items-center gap-3 bg-surface-white border border-neutral-200 shadow-card px-4 py-2 rounded-xl">
              <span
                className={`relative w-2 h-2 rounded-full ${isOnline ? "bg-success" : "bg-danger"}`}
              >
                {isOnline && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-success animate-ping opacity-60"
                  />
                )}
              </span>
              <span className="text-sm font-medium text-neutral-700">
                {isOnline ? "System Online" : "Offline"}
              </span>
            </div>
          )}
        </header>

        {/* Banners */}
        {error && (
          <div className="mb-6">
            <ErrorMessage
              message={error}
              type="error"
              onClose={() => setError(null)}
            />
          </div>
        )}
        {success && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success animate-fade-in">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span className="flex-1 leading-relaxed">{success}</span>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              aria-label="Dismiss"
              className="text-success/70 hover:text-success transition-colors shrink-0"
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
        )}

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8">
          {/* ── Left: Logo / brand identity ───────────────────────── */}
          <aside className="md:col-span-4">
            <div className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5 text-primary-600"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                  <h2 className="text-base font-semibold text-neutral-900">
                    Hospital Logo
                  </h2>
                </div>

                <div className="bg-surface-bg border border-neutral-200 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                  <div
                    className={`w-28 h-28 rounded-full overflow-hidden shadow-card mb-4 transition-all ${logoFile
                        ? "ring-4 ring-primary-300 ring-offset-2 ring-offset-surface-bg"
                        : "ring-4 ring-white"
                      }`}
                  >
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt="Hospital logo"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-full h-full ${getAvatarGradient(hospital?.hospitalName)} flex items-center justify-center`}
                      >
                        <span className="text-white font-bold text-3xl">
                          {getInitials(hospital?.hospitalName)}
                        </span>
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">
                    Primary Logo
                  </h3>
                  <p className="text-xs text-neutral-500 mb-4">
                    PNG / JPG / WebP · up to 2 MB
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-white text-primary-700 border border-neutral-200 hover:bg-primary-50 hover:border-primary-200 text-sm font-semibold shadow-card transition-colors">
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
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      {logoFile ? "Choose different" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoSelect}
                      />
                    </label>
                    {logoFile && (
                      <button
                        type="button"
                        onClick={cancelLogo}
                        className="text-sm text-neutral-500 hover:text-danger transition-colors px-2 py-1"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {logoFile && (
                    <div className="mt-4 w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-left flex items-start gap-2">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-primary-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-primary-700">
                          New logo staged
                        </p>
                        <p className="text-[11px] text-primary-700/80 truncate">
                          {logoFile.name}
                        </p>
                        <p className="text-[11px] text-neutral-600 mt-0.5">
                          Click <span className="font-semibold">Save Changes</span> to apply.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* ── Right: General info + contacts ─────────────────────── */}
          <section className="md:col-span-8 flex flex-col gap-6 lg:gap-8">
            {/* General Information */}
            <form
              onSubmit={saveProfile}
              className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden"
            >
              <div className="p-6 md:p-7 border-b border-neutral-200">
                <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                  General Information
                </h2>
                <p className="text-sm text-neutral-500">
                  Core details associated with this facility's operational
                  record.
                </p>
              </div>

              <div className="p-6 md:p-7 bg-surface-bg/40">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label
                      htmlFor="hospitalName"
                      className="block text-sm font-medium text-neutral-700 mb-2"
                    >
                      Hospital Name
                    </label>
                    <input
                      id="hospitalName"
                      type="text"
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      required
                      minLength={3}
                      className={inputBase}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="address"
                      className="block text-sm font-medium text-neutral-700 mb-2"
                    >
                      Address
                    </label>
                    <input
                      id="address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, city, state, ZIP"
                      className={inputBase}
                    />
                  </div>
                </div>

                <div className="mt-7 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-primary text-white font-semibold text-sm shadow-primary hover:shadow-card-hover hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {saving ? (
                      <>
                        <Spinner variant="heartbeat" size="sm" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <>
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
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* Sensitive Contacts */}
            <div
              id="contact-info"
              className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden scroll-mt-24"
            >
              <div className="p-6 md:p-7 border-b border-neutral-200 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center ring-1 ring-inset ring-primary-600/15 shrink-0">
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
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                    Sensitive Contacts
                  </h2>
                  <p className="text-sm text-neutral-500">
                    Changing your email or phone requires a one-time code for
                    security.
                  </p>
                </div>
              </div>

              <div className="p-4 md:p-6 space-y-3">
                {/* Email row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-surface-bg border border-neutral-200 rounded-xl">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-surface-white border border-neutral-200 flex items-center justify-center text-neutral-500 shrink-0">
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
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">
                        Administrative Email
                      </p>
                      <p className="text-sm text-neutral-500 truncate">
                        {hospital?.email}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openContactModal("email")}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 transition-colors"
                  >
                    Change
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
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>

                {/* Phone row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-surface-bg border border-neutral-200 rounded-xl">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-surface-white border border-neutral-200 flex items-center justify-center text-neutral-500 shrink-0">
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
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">
                        Emergency Contact Line
                      </p>
                      <p className="text-sm text-neutral-500 font-mono truncate">
                        {hospital?.phone}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openContactModal("phone")}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 transition-colors"
                  >
                    Change
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
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Contact-change modal — portaled to body (CLAUDE.md §8) ─── */}
      {contactModal.open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
          >
            <div
              className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm"
              onClick={() => !modalLoading && closeContactModal()}
            />
            <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
              <div className="relative w-full sm:max-w-md bg-surface-white rounded-2xl shadow-modal ring-1 ring-neutral-200 overflow-hidden animate-scale-in">
                <div className="px-6 pt-6 pb-2 flex items-start justify-between gap-4">
                  <div>
                    <h3
                      id="contact-modal-title"
                      className="font-heading text-lg font-bold text-neutral-900"
                    >
                      Change{" "}
                      {contactModal.field === "email" ? "Email" : "Phone Number"}
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      Current:{" "}
                      <span className="font-medium text-neutral-700">
                        {hospital?.[contactModal.field]}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !modalLoading && closeContactModal()}
                    aria-label="Close"
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
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
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-4 space-y-4">
                  {modalError && (
                    <ErrorMessage
                      message={modalError}
                      type="error"
                      onClose={() => setModalError(null)}
                    />
                  )}

                  {contactModal.step === "enter" && (
                    <>
                      <label className="block">
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                          New {contactModal.field}
                        </span>
                        <input
                          type={
                            contactModal.field === "email" ? "email" : "tel"
                          }
                          inputMode={
                            contactModal.field === "phone" ? "numeric" : "email"
                          }
                          value={contactModal.newValue}
                          onChange={(e) => {
                            const v =
                              contactModal.field === "phone"
                                ? e.target.value.replace(/\D/g, "").slice(0, 10)
                                : e.target.value;
                            setContactModal((m) => ({ ...m, newValue: v }));
                          }}
                          placeholder={
                            contactModal.field === "email"
                              ? "name@example.com"
                              : "9876543210 (10 digits, no +91)"
                          }
                          maxLength={
                            contactModal.field === "email" ? 254 : 10
                          }
                          pattern={
                            contactModal.field === "phone"
                              ? "[0-9]{10}"
                              : undefined
                          }
                          autoFocus
                          required
                          className={inputBase}
                        />
                        {contactModal.field === "phone" && (
                          <span className="mt-1 block text-[11px] text-neutral-500">
                            Digits only — country code (+91) is added automatically.
                          </span>
                        )}
                      </label>
                      <p className="text-xs text-neutral-500">
                        {contactModal.field === "email"
                          ? "We'll email a verification code to the new address to confirm it."
                          : "We'll email a verification code to your current email (SMS to the new number is coming soon)."}
                      </p>
                    </>
                  )}

                  {contactModal.step === "otp" && (
                    <>
                      {otpMessage && (
                        <div className="rounded-xl border border-primary-100 bg-primary-50 text-primary-700 text-sm px-4 py-3">
                          {otpMessage}
                        </div>
                      )}
                      <OtpInput
                        length={6}
                        value={contactModal.otp}
                        onChange={(v) =>
                          setContactModal((m) => ({ ...m, otp: v }))
                        }
                        disabled={modalLoading}
                      />
                      <div className="flex items-center justify-center pt-1">
                        <button
                          type="button"
                          onClick={handleResendContactOtp}
                          disabled={resending || resendCooldown > 0 || modalLoading}
                          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-primary-700 disabled:text-neutral-400 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`w-4 h-4 ${resending ? "animate-spin" : ""}`}
                            aria-hidden="true"
                          >
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                          {resending
                            ? "Sending…"
                            : resendCooldown > 0
                              ? `Resend in ${formatCooldown(resendCooldown)}`
                              : "Resend code"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => !modalLoading && closeContactModal()}
                    disabled={modalLoading}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 bg-surface-white border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  {contactModal.step === "enter" ? (
                    <button
                      type="button"
                      onClick={sendContactOtp}
                      disabled={modalLoading}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-primary shadow-primary hover:shadow-card-hover disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    >
                      {modalLoading && <Spinner variant="heartbeat" size="sm" />}
                      {modalLoading ? "Sending…" : "Send Code"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={verifyContactOtp}
                      disabled={modalLoading || contactModal.otp.length !== 6}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-primary shadow-primary hover:shadow-card-hover disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    >
                      {modalLoading && <Spinner variant="heartbeat" size="sm" />}
                      {modalLoading ? "Verifying…" : "Verify & Save"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default Profile;
