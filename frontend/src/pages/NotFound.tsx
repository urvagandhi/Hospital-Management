/**
 * 404 — Not Found page. Rendered for any route that does not match.
 * Primary CTA routes the user to their dashboard if authenticated,
 * otherwise back to the landing page.
 */

import React, { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import appLogo from "../assets/logo.png";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// Synchronous best-guess of session state so the primary CTA is correct on the
// very first paint. `useAuth` starts with `isAuthenticated=false` while it
// refreshes the session asynchronously, which would otherwise flash
// "Back to Home" for a logged-in doctor before flipping to "Back to Dashboard".
const hasStoredSession = (): boolean => {
  try {
    if (sessionStorage.getItem("tempToken")) return false; // mid-login flow
    return !!localStorage.getItem("hospital");
  } catch {
    return false;
  }
};

const NotFound: React.FC = () => {
  useDocumentTitle("Page Not Found — MediVault");
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const likelyLoggedIn = isAuthenticated || hasStoredSession();

  const attemptedPath = `${location.pathname}${location.search}`;

  const timestamp = useMemo(
    () =>
      new Date().toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    [],
  );

  const primary = likelyLoggedIn
    ? { to: "/dashboard", label: "Back to Dashboard" }
    : { to: "/", label: "Back to Home" };

  return (
    <div className="min-h-screen bg-surface-bg text-neutral-900 flex flex-col antialiased selection:bg-primary-100 selection:text-primary-700 font-sans">
      {/* Top bar — centered brand only */}
      <header className="sticky top-0 z-40 bg-surface-white/90 backdrop-blur-sm border-b border-neutral-200 shadow-card">
        <div className="flex justify-center items-center px-6 md:px-8 py-4 max-w-[1440px] mx-auto w-full">
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img
              src={appLogo}
              alt="HMS"
              className="h-8 w-8 rounded-lg object-cover"
            />
            <span className="font-heading font-semibold text-lg tracking-tight text-neutral-900">
              MediVault
            </span>
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow flex flex-col items-center justify-center p-6 md:p-12 lg:p-24 w-full max-w-[1440px] mx-auto relative overflow-hidden">
        {/* Decorative background blurs */}
        <div
          className="absolute top-1/4 left-10 w-64 h-64 bg-primary-100 rounded-full blur-[80px] opacity-60 -z-10"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-1/4 right-10 w-96 h-96 bg-primary-200 rounded-full blur-[100px] opacity-30 -z-10"
          aria-hidden="true"
        />

        <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-20 w-full max-w-5xl">
          {/* Illustration */}
          <div className="w-full md:w-1/2 flex justify-center order-2 md:order-1">
            <div className="relative w-64 h-64 md:w-96 md:h-96">
              <div className="absolute inset-0 bg-gradient-to-br from-surface-white to-surface-bg rounded-[40px] rotate-3 opacity-90 shadow-card" />
              <div className="absolute inset-4 bg-surface-white rounded-3xl -rotate-2 flex items-center justify-center border border-neutral-200 shadow-card-hover overflow-hidden">
                <div className="w-full h-full relative">
                  {/* Soft backdrop */}
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-100/40 to-transparent" />

                  {/* Large 404 watermark */}
                  <div
                    aria-hidden="true"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-heading font-bold text-[120px] md:text-[140px] tracking-tighter select-none pointer-events-none bg-gradient-to-br from-primary-200 to-primary-400 bg-clip-text text-transparent opacity-60"
                  >
                    404
                  </div>

                  {/* Foreground soft shapes */}
                  <div className="absolute bottom-0 left-0 w-full h-1/3 bg-primary-100 rounded-t-[100px] opacity-60 blur-[1px]" />
                  <div className="absolute bottom-8 right-12 w-24 h-24 bg-primary-400 rounded-full opacity-10 blur-[2px]" />
                  <div className="absolute bottom-16 left-16 w-16 h-16 bg-primary-500 rounded-full opacity-10 blur-[4px]" />
                </div>
              </div>
            </div>
          </div>

          {/* Text + actions */}
          <div className="w-full md:w-1/2 flex flex-col items-start text-left order-1 md:order-2 space-y-6">
            {/* Micro-label */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 text-neutral-500 text-xs font-semibold tracking-wide uppercase border border-neutral-200">
              <span
                className="w-1.5 h-1.5 rounded-full bg-danger shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                aria-hidden="true"
              />
              System Notice
            </div>

            {/* Heading */}
            <div className="space-y-3">
              <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-extrabold text-neutral-900 tracking-tight leading-[1.1]">
                Page not found
              </h1>
              <p className="text-base md:text-lg text-neutral-500 leading-relaxed max-w-md">
                The page you are looking for does not exist in the current
                system. It may have been moved, renamed, or archived.
              </p>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Link
                to={primary.to}
                className="group relative inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-primary text-white font-semibold shadow-primary hover:shadow-card-hover transition-all duration-200 overflow-hidden active:scale-[0.98]"
              >
                <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="relative z-10 w-5 h-5"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="9" rx="1.5" />
                  <rect x="14" y="3" width="7" height="5" rx="1.5" />
                  <rect x="14" y="12" width="7" height="9" rx="1.5" />
                  <rect x="3" y="16" width="7" height="5" rx="1.5" />
                </svg>
                <span className="relative z-10">{primary.label}</span>
              </Link>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-transparent text-neutral-700 font-semibold border-2 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-400 transition-colors duration-200 active:scale-[0.98]"
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
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
                Go Back
              </button>
            </div>

            {/* Request details — readable summary for support */}
            <div className="mt-6 pt-6 border-t border-neutral-200 w-full flex flex-col gap-2 text-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="text-neutral-500 font-medium shrink-0">
                  You tried to open:
                </span>
                <span
                  className="font-mono text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded-md truncate max-w-full"
                  title={attemptedPath}
                >
                  {attemptedPath}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="text-neutral-500 font-medium shrink-0">
                  Time:
                </span>
                <span className="text-neutral-700">{timestamp}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-surface-sidebar border-t border-neutral-200 w-full py-8 px-6 md:px-8 mt-auto">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-medium tracking-wide">
          <div className="text-neutral-500">
            © {new Date().getFullYear()} MediVault. All rights
            reserved.
          </div>
          <nav
            aria-label="Footer Navigation"
            className="flex flex-wrap justify-center gap-x-6 gap-y-2"
          >
            <Link
              to="/terms"
              className="text-neutral-500 hover:text-primary-500 transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-neutral-500 hover:text-primary-500 transition-colors"
            >
              Privacy
            </Link>
            <Link
              to={isAuthenticated ? "/sessions" : "/login"}
              className="text-neutral-500 hover:text-primary-500 transition-colors"
            >
              {isAuthenticated ? "Sessions" : "Sign in"}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default NotFound;
