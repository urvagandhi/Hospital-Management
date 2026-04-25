/**
 * Login Page
 * Supports login via email or phone number (single field auto-detection).
 * Two-step auth: password → AUTH_CODE (or PASSWORD_CHANGE for first login).
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import appLogo from "../assets/logo.png";
import Spinner from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// Change this to your organisation's IT support address.
const SUPPORT_EMAIL = "support@hospitalmanagement.com";

/** Detect input type for client-side validation */
const detectIdentifierType = (value: string): "email" | "phone" | "unknown" => {
  if (value.includes("@")) return "email";
  const cleaned = value.replace(/[\s\-()]/g, "");
  if (/^\+?\d{7,15}$/.test(cleaned)) return "phone";
  return "unknown";
};

const getIdentifierError = (value: string): string | null => {
  if (!value.trim()) return "Email or phone number is required";
  const type = detectIdentifierType(value);
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return "Invalid email format";
  if (type === "phone") {
    const cleaned = value.replace(/[\s\-()]/g, "");
    if (!/^\+?[1-9]\d{6,14}$/.test(cleaned)) return "Invalid phone number";
  }
  if (type === "unknown")
    return "Please enter a valid email or phone number";
  return null;
};

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, state } = useAuth();

  useDocumentTitle("Login - Hospital Management");

  const [formData, setFormData] = useState({ identifier: "", password: "" });
  const [errors, setErrors] = useState({ identifier: "", password: "" });
  const [submitted, setSubmitted] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (state.error) setDisplayError(state.error);
  }, [state.error]);

  // Redirect if already authenticated
  useEffect(() => {
    if (state.isAuthenticated) navigate("/dashboard");
  }, [state.isAuthenticated, navigate]);

  const validateForm = (): boolean => {
    const identifierErr = getIdentifierError(formData.identifier);
    const passwordErr = !formData.password
      ? "Password is required"
      : formData.password.length < 8
        ? "Password must be at least 8 characters"
        : "";

    const newErrors = {
      identifier: identifierErr || "",
      password: passwordErr,
    };
    setErrors(newErrors);
    return !newErrors.identifier && !newErrors.password;
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDisplayError(null);
    if (submitted) {
      if (field === "identifier") {
        setErrors((prev) => ({
          ...prev,
          identifier: getIdentifierError(value) || "",
        }));
      } else if (field === "password") {
        setErrors((prev) => ({
          ...prev,
          password: !value ? "Password is required" : "",
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setDisplayError(null);
    if (!validateForm()) return;

    try {
      const next = await login(formData.identifier.trim(), formData.password);
      if (next === "PASSWORD_CHANGE") navigate("/change-password");
      else navigate("/verify-auth-code"); // next === "AUTH_CODE"
    } catch (error: unknown) {
      const err = error as Error & {
        response?: { status?: number; data?: { lockUntil?: string } };
      };
      if (err.response?.status === 423 && err.response.data?.lockUntil) {
        const lockUntil = new Date(err.response.data.lockUntil);
        setDisplayError(
          `Account locked until ${lockUntil.toLocaleTimeString()}. Please try again later.`,
        );
      } else {
        setDisplayError(err.message || "Login failed");
      }
    }
  };

  const identifierType = useMemo(
    () => (formData.identifier ? detectIdentifierType(formData.identifier) : null),
    [formData.identifier],
  );

  // Prevent flash of login screen while checking auth
  if (state.loading || state.isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center">
        <Spinner variant="heartbeat" size="lg" className="text-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col items-center justify-center px-4 py-10 font-sans text-neutral-900 antialiased selection:bg-primary-100 selection:text-primary-700 relative overflow-hidden">
      {/* Decorative background blurs */}
      <div
        aria-hidden="true"
        className="absolute top-1/4 -left-20 w-80 h-80 bg-primary-100 rounded-full blur-[100px] opacity-60 -z-10"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-200 rounded-full blur-[120px] opacity-30 -z-10"
      />

      {/* Main card */}
      <main className="w-full max-w-[440px] bg-surface-white rounded-2xl p-8 sm:p-10 shadow-modal border border-neutral-200 relative z-10 animate-scale-in">
        {/* Brand header */}
        <header className="mb-8 flex flex-col items-start w-full">
          <div className="flex items-center gap-3 mb-2">
            <img
              src={appLogo}
              alt="HMS"
              className="h-9 w-9 rounded-lg object-cover shadow-card"
            />
            <h1 className="text-[26px] font-bold tracking-tight text-primary-600 font-heading leading-none">
              Hospital Management
            </h1>
          </div>
          <p className="text-neutral-500 text-sm font-medium leading-relaxed max-w-[320px] mt-1">
            Secure access to your clinical workspace.
          </p>
        </header>

        {/* Error banner */}
        {displayError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger animate-fade-in"
          >
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="flex-1 leading-relaxed">{displayError}</span>
            <button
              type="button"
              onClick={() => setDisplayError(null)}
              aria-label="Dismiss error"
              className="text-danger/70 hover:text-danger transition-colors shrink-0"
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full" noValidate>
          {/* Identifier */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="identifier"
              className="text-[11px] font-semibold text-neutral-500 ml-1 tracking-wider uppercase"
            >
              Email or Phone
            </label>
            <div className="relative group">
              <span
                aria-hidden="true"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary-500 transition-colors pointer-events-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                id="identifier"
                name="identifier"
                type="text"
                inputMode="email"
                autoComplete="username"
                autoFocus
                required
                placeholder="admin@hospital.com  or  +91..."
                value={formData.identifier}
                onChange={(e) => handleChange("identifier", e.target.value)}
                aria-invalid={!!errors.identifier}
                aria-describedby={errors.identifier ? "identifier-error" : undefined}
                className={`w-full bg-white text-neutral-900 rounded-xl pl-12 pr-4 py-3.5 text-base shadow-card ring-1 transition-all duration-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:shadow-card-hover ${
                  errors.identifier
                    ? "ring-danger/40 focus:ring-danger"
                    : "ring-neutral-200 focus:ring-primary-500"
                }`}
              />
            </div>
            {errors.identifier ? (
              <p
                id="identifier-error"
                className="text-xs text-danger ml-1 flex items-center gap-1"
              >
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
                {errors.identifier}
              </p>
            ) : identifierType ? (
              <p className="text-xs text-neutral-400 ml-1">
                Detected: {identifierType}
              </p>
            ) : null}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-[11px] font-semibold text-neutral-500 ml-1 tracking-wider uppercase"
            >
              Password
            </label>
            <div className="relative group">
              <span
                aria-hidden="true"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary-500 transition-colors pointer-events-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => handleChange("password", e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                className={`w-full bg-white text-neutral-900 rounded-xl pl-12 pr-12 py-3.5 text-base shadow-card ring-1 transition-all duration-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:shadow-card-hover ${
                  errors.password
                    ? "ring-danger/40 focus:ring-danger"
                    : "ring-neutral-200 focus:ring-primary-500"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-primary-500 hover:bg-neutral-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {showPassword ? (
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
            {errors.password ? (
              <p
                id="password-error"
                className="text-xs text-danger ml-1 flex items-center gap-1"
              >
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
                {errors.password}
              </p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-[13px] font-semibold text-primary-600 hover:text-primary-700 transition-colors py-1 focus:outline-none focus-visible:underline"
              >
                Forgot Password?
              </button>
            </div>
          </div>

          {/* Primary CTA */}
          <button
            type="submit"
            disabled={state.loading}
            className="mt-2 w-full bg-gradient-primary text-white rounded-xl py-3.5 font-semibold text-base shadow-primary hover:shadow-card-hover hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
          >
            {state.loading ? (
              <>
                <Spinner variant="heartbeat" size="sm" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Support / biometric hint */}
        <div className="mt-8 pt-6 border-t border-neutral-200 flex flex-col items-center gap-2 text-center">
          {/* <p className="text-[13px] text-neutral-500 flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 text-primary-500"
              aria-hidden="true"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            Biometric login available on the Android app
          </p> */}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-semibold text-primary-600 hover:text-primary-700 transition-colors flex items-center gap-1.5"
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
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Contact IT Support
          </a>
        </div>
      </main>

      {/* Footer legal links */}
      <footer className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs font-medium text-neutral-400 relative z-0">
        <button
          type="button"
          onClick={() => navigate("/privacy")}
          className="hover:text-neutral-700 transition-colors flex items-center gap-1.5"
        >
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
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Privacy Policy
        </button>
        <button
          type="button"
          onClick={() => navigate("/terms")}
          className="hover:text-neutral-700 transition-colors flex items-center gap-1.5"
        >
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Terms of Service
        </button>
      </footer>
    </div>
  );
};

export default Login;
