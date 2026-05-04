/**
 * Password — authenticated change-password page.
 *
 * Behavior preserved:
 *   • Requires current password.
 *   • Client-side policy check: ≥8 chars + upper + lower + digit + special.
 *   • POST /auth/change-password-settings; backend revokes every other session
 *     and emails a security notice (see CLAUDE.md §5).
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import Spinner from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import authService from "../services/authService";

// ── Dynamic password policy ───────────────────────────────────────────────

interface Rule {
  key: string;
  label: string;
  test: (pw: string) => boolean;
}

const RULES: Rule[] = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "One number", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "One special character", test: (p) => /[\W_]/.test(p) },
];

const firstUnmet = (pw: string): string | null => {
  for (const r of RULES) {
    if (!r.test(pw)) {
      switch (r.key) {
        case "length":
          return "Password must be at least 8 characters";
        case "upper":
          return "Password must contain an uppercase letter";
        case "lower":
          return "Password must contain a lowercase letter";
        case "number":
          return "Password must contain a number";
        case "special":
          return "Password must contain a special character";
      }
    }
  }
  return null;
};

const STRENGTH_LABELS = [
  { label: "Too weak", tone: "text-danger" },
  { label: "Weak", tone: "text-danger" },
  { label: "Fair", tone: "text-warning" },
  { label: "Good", tone: "text-primary-700" },
  { label: "Strong", tone: "text-success" },
  { label: "Very strong", tone: "text-success" },
];

// ── Reusable password-field with show/hide toggle ─────────────────────────

const PasswordField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  mono?: boolean;
}> = ({ id, label, value, onChange, placeholder, autoFocus, mono }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-sm font-medium text-neutral-700 px-1"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={id === "current" ? "current-password" : "new-password"}
          className={`w-full bg-white border-2 border-neutral-200 rounded-lg px-4 py-3 pr-11 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-100 transition-all ${mono ? "font-mono tracking-wide" : ""
            }`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-primary-600 transition-colors"
        >
          {show ? (
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
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
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
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────

const Password: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useDocumentTitle("Change Password — MyMediVault");

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  const ruleState = useMemo(
    () => RULES.map((r) => ({ ...r, ok: newPw ? r.test(newPw) : false })),
    [newPw],
  );
  const satisfiedCount = ruleState.filter((r) => r.ok).length;
  const confirmMatches = confirmPw.length > 0 && newPw === confirmPw;
  const confirmMismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const strengthIdx = Math.min(satisfiedCount, STRENGTH_LABELS.length - 1);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!currentPw) return setError("Current password is required");
    const pwErr = firstUnmet(newPw);
    if (pwErr) return setError(pwErr);
    if (newPw === currentPw)
      return setError("New password must be different from your current one");
    if (newPw !== confirmPw) return setError("Passwords do not match");

    setLoading(true);
    try {
      const response = await authService.changePasswordSettings(
        currentPw,
        newPw,
      );
      setSuccess(response.message || "Password changed successfully");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: any) {
      setError(err?.message || "Password change failed");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Context header */}
        <header className="mb-8">
          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900 mb-2">
            Change Password
          </h1>
          <p className="text-neutral-500 text-sm md:text-base leading-relaxed max-w-2xl">
            Use a long, random password to stay secure. A strong password is
            critical for protecting clinical data.
          </p>
        </header>

        {/* Info banner — backend revokes other sessions on success */}
        <div className="mb-6 flex gap-3 items-start bg-surface-white border border-neutral-200 rounded-xl px-4 py-3 shadow-card">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0 ring-1 ring-inset ring-primary-600/15">
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Session update
            </p>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Changing your password will sign you out of every other signed-in
              device for security.
            </p>
          </div>
        </div>

        {/* Banners */}
        {error && (
          <div className="mb-4">
            <ErrorMessage
              message={error}
              type="error"
              onClose={() => setError(null)}
            />
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success animate-fade-in">
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

        {/* Form card */}
        <form
          onSubmit={submit}
          className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden"
        >
          <div className="p-6 sm:p-8">
            <PasswordField
              id="current"
              label="Current Password"
              value={currentPw}
              onChange={setCurrentPw}
              placeholder="Enter current password"
              autoFocus
            />

            <div className="my-6 border-t border-neutral-100" />

            {/* New/confirm + policy panel */}
            <div className="flex flex-col md:flex-row gap-6 md:items-start">
              <div className="flex-grow flex flex-col gap-5">
                <PasswordField
                  id="new"
                  label="New Password"
                  value={newPw}
                  onChange={setNewPw}
                  placeholder="Enter new password"
                  mono
                />
                <div className="flex flex-col gap-2">
                  <PasswordField
                    id="confirm"
                    label="Confirm Password"
                    value={confirmPw}
                    onChange={setConfirmPw}
                    placeholder="Confirm new password"
                    mono
                  />
                  {confirmMismatch && (
                    <p className="text-xs text-danger flex items-center gap-1.5 pl-1">
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
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Passwords do not match.
                    </p>
                  )}
                  {confirmMatches && (
                    <p className="text-xs text-success flex items-center gap-1.5 pl-1">
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
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Passwords match.
                    </p>
                  )}
                </div>
              </div>

              {/* Policy + strength panel */}
              <aside className="md:w-64 shrink-0 bg-surface-bg border border-neutral-200 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-neutral-900 mb-4">
                  Password Requirements
                </h4>

                <div className="mb-5">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-neutral-500">Strength</span>
                    <span
                      className={`font-semibold ${STRENGTH_LABELS[strengthIdx].tone}`}
                    >
                      {newPw ? STRENGTH_LABELS[strengthIdx].label : "—"}
                    </span>
                  </div>
                  <div className="flex gap-1 h-1.5 w-full">
                    {[0, 1, 2, 3, 4].map((i) => {
                      const active = i < satisfiedCount;
                      let color = "bg-neutral-200";
                      if (active) {
                        if (satisfiedCount <= 1) color = "bg-danger";
                        else if (satisfiedCount === 2) color = "bg-warning";
                        else if (satisfiedCount === 3)
                          color = "bg-primary-400";
                        else if (satisfiedCount === 4)
                          color = "bg-primary-500";
                        else color = "bg-success";
                      }
                      return (
                        <div
                          key={i}
                          className={`h-full flex-1 rounded-full transition-colors duration-200 ${color}`}
                        />
                      );
                    })}
                  </div>
                </div>

                <ul className="flex flex-col gap-2.5 text-sm">
                  {ruleState.map((r) => (
                    <li
                      key={r.key}
                      className={`flex items-center gap-2 transition-colors ${r.ok ? "text-success" : "text-neutral-500"
                        }`}
                    >
                      {r.ok ? (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-[18px] h-[18px] shrink-0"
                          aria-hidden="true"
                        >
                          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1.41 14.59L5.5 11.5l1.41-1.41 3.68 3.67 6.42-6.42 1.41 1.41z" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-[18px] h-[18px] shrink-0 text-neutral-300"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                      )}
                      <span>{r.label}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>

          {/* Action footer */}
          <div className="bg-neutral-50 px-6 sm:px-8 py-4 flex items-center justify-end gap-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={resetForm}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !currentPw ||
                satisfiedCount < RULES.length ||
                !confirmMatches
              }
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-primary shadow-primary hover:shadow-card-hover hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <Spinner variant="heartbeat" size="sm" />
                  <span>Updating…</span>
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
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Update Password
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Password;
