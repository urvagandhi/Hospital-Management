import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Hospital } from "../types/auth";
import { isPlaceholderLogo } from "../utils/avatar";
interface HospitalProfileModalProps {
  hospital: Hospital | null;
  isOpen: boolean;
  onClose: () => void;
}

export const HospitalProfileModal: React.FC<HospitalProfileModalProps> = ({
  hospital,
  isOpen,
  onClose,
}) => {
  // Close on Escape — parity with other modals (Profile contact-change, etc.)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !hospital) return null;

  const joinedDate = hospital.createdAt
    ? new Date(hospital.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const initial = (hospital.hospitalName || "?").charAt(0).toUpperCase();

  // Portal to document.body so the modal escapes the Navbar's stacking context
  // (the fixed <nav> with z-50 creates its own context that would otherwise
  // clip this modal's z-[100] positioning and trap it inside the navbar).
  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      aria-labelledby="hospital-profile-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
        <div className="relative w-full sm:max-w-md bg-surface-white rounded-2xl shadow-modal ring-1 ring-neutral-200 overflow-hidden animate-scale-in">
          {/* Header banner — gradient-primary, matches Save buttons / badges */}
          <div className="relative h-28 bg-gradient-primary">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white text-primary-700 hover:text-primary-800 shadow-card flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
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

          {/* Identity — avatar floats ABOVE the banner. `relative z-10` forces
              it on top of the gradient so the full illustration is visible
              even though its container overlaps the banner vertically. */}
          <div className="relative z-10 px-6 sm:px-8 pb-6 sm:pb-8 flex flex-col items-center -mt-20">
            <div className="w-28 h-28 rounded-full ring-[6px] ring-white shadow-modal overflow-hidden bg-primary-50 flex items-center justify-center">
              {hospital.logoUrl && !isPlaceholderLogo(hospital.logoUrl) ? (
                <img
                  src={hospital.logoUrl}
                  alt={hospital.hospitalName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl font-heading font-bold text-primary-600">
                  {initial}
                </span>
              )}
            </div>

            <h3
              id="hospital-profile-title"
              className="mt-4 font-heading text-xl sm:text-2xl font-bold text-neutral-900 text-center tracking-tight"
            >
              {hospital.hospitalName}
            </h3>
            {joinedDate && (
              <p className="text-sm text-neutral-500 mt-1">
                Joined {joinedDate}
              </p>
            )}

            <span
              className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full text-xs font-semibold ${
                hospital.isActive
                  ? "bg-success/10 text-success"
                  : "bg-danger/10 text-danger"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hospital.isActive ? "bg-success" : "bg-danger"
                }`}
                aria-hidden="true"
              />
              {hospital.isActive ? "Active Account" : "Inactive"}
            </span>

            {/* Divider */}
            <div className="my-6 h-px w-full bg-neutral-100" />

            {/* Info rows */}
            <dl className="w-full divide-y divide-neutral-100">
              {hospital.authCode && (
                <Row
                  label="Auth Code"
                  value={
                    <span className="font-mono text-primary-700 font-bold tracking-[0.25em]">
                      {hospital.authCode}
                    </span>
                  }
                  icon={
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
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  }
                />
              )}

              <Row
                label="Email"
                value={
                  <span className="break-all text-neutral-900">
                    {hospital.email}
                  </span>
                }
                icon={
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
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                }
              />

              <Row
                label="Phone"
                value={
                  <span className="font-mono text-neutral-900">
                    {hospital.phone || "—"}
                  </span>
                }
                icon={
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
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                }
              />

              <Row
                label="Address"
                value={
                  <span className="text-neutral-900">
                    {hospital.address || "N/A"}
                  </span>
                }
                icon={
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
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                }
              />
            </dl>

            {/* Close button — outlined-primary, matches the mockup */}
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border-2 border-primary-200 text-primary-700 bg-surface-white hover:bg-primary-50 hover:border-primary-300 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ── Info row ──────────────────────────────────────────────────────────────

const Row: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}> = ({ label, value, icon }) => (
  <div className="flex items-center gap-4 py-3 text-left">
    <div className="flex items-center gap-2 w-28 shrink-0 text-sm font-medium text-neutral-500">
      <span className="text-primary-600">{icon}</span>
      {label}
    </div>
    <div className="flex-1 min-w-0 text-sm">{value}</div>
  </div>
);

export default HospitalProfileModal;
