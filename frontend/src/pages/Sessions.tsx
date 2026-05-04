/**
 * Sessions & Auth Code — redesigned as a two-column security workspace.
 *
 * Behavior preserved from the previous implementation:
 *   • Reveal-to-view Auth Code (immutable per-hospital, CLAUDE.md §5)
 *   • GET /auth/sessions list, POST revoke single, revoke-all-others
 *   • Current session is always non-revocable
 *
 * Not implemented (intentionally):
 *   • City / geo — backend stores only the raw ipAddress
 *   • Auth Code countdown — the code never refreshes, no timer to show
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorMessage } from "../components/ErrorMessage";
import PageLoader from "../components/PageLoader";
import Spinner from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import authService from "../services/authService";

interface SessionLocation {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  isPrivate?: boolean;
  displayName?: string | null;
}

interface SessionItem {
  id?: string;
  _id?: string;
  sessionKey?: string;
  platform?: string;
  isMobile?: boolean;
  userAgent?: string;
  ipAddress?: string;
  lastSeenIp?: string;
  lastSeenAt?: string;
  createdAt?: string;
  isCurrent?: boolean;
  location?: SessionLocation | null;
  revokedAt?: string | null;
  revokedReason?: string | null;
  authCodeVerifiedAt?: string | null;
  // Backend may compute this server-side; we also derive it client-side as
  // a fallback: mobile session whose Auth Code was verified > 7 days ago is
  // alive but locked behind re-verify on next request.
  requiresAuthCodeReverify?: boolean;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isLockedAuthCode(s: SessionItem): boolean {
  if (s.requiresAuthCodeReverify === true) return true;
  if (!s.isMobile) return false;
  if (!s.authCodeVerifiedAt) return false;
  const verified = new Date(s.authCodeVerifiedAt).getTime();
  if (Number.isNaN(verified)) return false;
  return Date.now() - verified > SEVEN_DAYS_MS;
}

function locationLabel(loc?: SessionLocation | null): string | null {
  if (!loc) return null;
  if (loc.isPrivate) return "Local network";
  return loc.displayName || null;
}

// ── Humanise User-Agent ────────────────────────────────────────────────────

function humanizeUA(ua?: string): string {
  if (!ua) return "Unknown device";
  const ours = ua.match(
    /HospitalHMS-Android\/[\w.+-]+\s*\(Android\s*([\w.]+);\s*([^)]+)\)/i,
  );
  if (ours) return `${ours[2].trim()} (Android ${ours[1]})`;
  let browser = "";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || ua.slice(0, 60);
}

type DeviceKind = "phone" | "tablet" | "laptop";

function deviceKind(s: SessionItem): DeviceKind {
  const ua = s.userAgent || "";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (s.isMobile || /HospitalHMS-Android|iPhone|Android/i.test(ua))
    return "phone";
  return "laptop";
}

const DeviceIcon: React.FC<{ kind: DeviceKind; className?: string }> = ({
  kind,
  className = "w-5 h-5",
}) => {
  if (kind === "phone") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        <rect x="7" y="2" width="10" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    );
  }
  if (kind === "tablet") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="12" rx="2" ry="2" />
      <path d="M1 20h22" />
    </svg>
  );
};

// ── Relative time ──────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "Active now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const getSessionId = (s: SessionItem) => (s.id || s._id || "").trim();

// ── Page ───────────────────────────────────────────────────────────────────

const Sessions: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();

  const [codeRevealed, setCodeRevealed] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  useDocumentTitle("Security & Sessions — MyMediVault");

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  const load = async () => {
    setError(null);
    try {
      const response = await authService.listSessions();
      // Drop sessions that are already dead — manual logout, idle revoke,
      // session-conflict eviction all set revokedAt server-side. They have
      // no actionable state in the UI, so they shouldn't appear in the list.
      const live = (response.data || []).filter((s: SessionItem) => !s.revokedAt);
      setSessions(live);
    } catch (err: any) {
      setError(err?.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (state.isAuthenticated) {
      setLoading(true);
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAuthenticated]);

  const hospital = state.hospital;
  const authCode = (hospital?.authCode || "").toString();
  const codeDigits: string[] = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) =>
        codeRevealed ? authCode[i] || "" : "",
      ),
    [codeRevealed, authCode],
  );

  const revokeOne = async (id: string) => {
    if (!id) return setError("Session ID missing. Please refresh and try again.");
    setRevoking(id);
    try {
      await authService.revokeSession(id);
      setSessions((list) => list.filter((s) => getSessionId(s) !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    setBulkRevoking(true);
    try {
      await authService.revokeAllOtherSessions();
      setConfirmBulkOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to revoke other sessions");
      setConfirmBulkOpen(false);
    } finally {
      setBulkRevoking(false);
    }
  };

  const otherRevocable = sessions.filter(
    (s) => !s.isCurrent && !!getSessionId(s),
  );

  if (loading) return <PageLoader label="Loading sessions…" />;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <header className="mb-10">
          <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-2">
            Security &amp; Sessions
          </h1>
          <p className="text-neutral-500 text-sm md:text-base max-w-2xl leading-relaxed">
            Manage your authentication code and monitor active connections to
            your clinical environment.
          </p>
        </header>

        {error && (
          <div className="mb-6">
            <ErrorMessage
              message={error}
              type="error"
              onClose={() => setError(null)}
            />
          </div>
        )}

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ── Left: Auth Code ──────────────────────────────────── */}
          <section className="lg:col-span-4">
            <div className="relative bg-surface-white rounded-2xl shadow-card border border-neutral-200 p-6 overflow-hidden">
              <div
                aria-hidden="true"
                className="absolute -top-10 -right-10 w-36 h-36 bg-primary-100/40 rounded-full blur-3xl pointer-events-none"
              />
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center ring-1 ring-inset ring-primary-600/15">
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
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                  </span>
                  Auth Code
                </h2>
                <button
                  type="button"
                  onClick={() => setCodeRevealed((v) => !v)}
                  title={codeRevealed ? "Hide code" : "Reveal code"}
                  aria-label={codeRevealed ? "Hide code" : "Reveal code"}
                  className="w-9 h-9 rounded-full bg-surface-bg hover:bg-primary-50 text-neutral-500 hover:text-primary-700 transition-colors flex items-center justify-center ring-1 ring-inset ring-neutral-200"
                >
                  {codeRevealed ? (
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
                      className="w-4 h-4"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="text-sm text-neutral-500 mb-5 leading-relaxed">
                Your permanent clinical access code — required on every login.
                Do not share it.
              </p>

              {/* 6-digit display — matches the VerifyAuthCode cell style:
                  white tile, bold dark digit, neutral border; when revealed
                  the cells adopt the primary outline + soft halo. */}
              <div className="grid grid-cols-6 gap-2 mb-5">
                {codeDigits.map((ch, i) => {
                  const filled = !!ch;
                  return (
                    <div
                      key={i}
                      className={`aspect-[3/4] rounded-xl flex items-center justify-center text-2xl font-mono font-bold border-2 bg-surface-white text-neutral-900 transition-all duration-200 ${filled
                          ? "border-primary-500 ring-2 ring-primary-100"
                          : "border-neutral-200 text-neutral-400"
                        }`}
                    >
                      {ch || "•"}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start gap-2 text-xs text-neutral-500 bg-surface-bg border border-neutral-200 rounded-lg px-3 py-2.5">
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
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span className="leading-relaxed">
                  This code is <span className="font-semibold text-neutral-700">permanent</span> — it doesn't rotate. If lost, contact your administrator to reset it.
                </span>
              </div>
            </div>
          </section>

          {/* ── Right: Active Sessions ─────────────────────────────── */}
          <section className="lg:col-span-8">
            <div className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-6 border-b border-neutral-200">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                    Active Sessions
                  </h2>
                  <p className="text-sm text-neutral-500">
                    Devices currently signed in to your account.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      void load();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50 text-sm font-medium transition-colors"
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
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkOpen(true)}
                    disabled={bulkRevoking || otherRevocable.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    Sign out all others
                  </button>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3 text-neutral-400">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-7 h-7"
                      aria-hidden="true"
                    >
                      <rect x="2" y="4" width="20" height="12" rx="2" ry="2" />
                      <path d="M1 20h22" />
                    </svg>
                  </div>
                  <p className="text-sm text-neutral-500">
                    No active sessions.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {sessions.map((s) => {
                    const id = getSessionId(s);
                    const kind = deviceKind(s);
                    const name = humanizeUA(s.userAgent);
                    const last = relativeTime(s.lastSeenAt || s.createdAt);
                    const isCurrent = !!s.isCurrent;
                    const needsAuthCode = isLockedAuthCode(s);
                    return (
                      <li
                        key={id || `${s.userAgent || "unknown"}-${s.createdAt || ""}`}
                        className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-6"
                      >
                        {isCurrent && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-primary rounded-r-full"
                          />
                        )}
                        <div className="flex items-start sm:items-center gap-4 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isCurrent
                                ? "bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-600/15"
                                : "bg-neutral-100 text-neutral-500"
                              }`}
                          >
                            <DeviceIcon kind={kind} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-0.5">
                              <h3 className="text-sm font-semibold text-neutral-900 truncate">
                                {name}
                              </h3>
                              {isCurrent && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success text-[11px] font-semibold">
                                  <span className="relative w-1.5 h-1.5 rounded-full bg-success">
                                    <span
                                      aria-hidden="true"
                                      className="absolute inset-0 rounded-full bg-success animate-ping opacity-60"
                                    />
                                  </span>
                                  Current session
                                </span>
                              )}
                              {needsAuthCode && !isCurrent && (
                                <span
                                  title="This device hasn't verified its Auth Code in the last 7 days. The session is still alive but the device must re-enter the code on its next request."
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[11px] font-semibold ring-1 ring-inset ring-warning/30"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.25"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="w-3 h-3"
                                    aria-hidden="true"
                                  >
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                  </svg>
                                  Needs Auth Code
                                </span>
                              )}
                              {s.isMobile && !isCurrent && !needsAuthCode && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[11px] font-semibold ring-1 ring-inset ring-primary-600/15">
                                  Mobile
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                              {locationLabel(s.location) && (
                                <span className="inline-flex items-center gap-1">
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  >
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  {locationLabel(s.location)}
                                </span>
                              )}
                              {(s.lastSeenIp || s.ipAddress) && (
                                <span className="inline-flex items-center gap-1 font-mono">
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                  </svg>
                                  {s.lastSeenIp || s.ipAddress}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                {last}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!isCurrent && id && (
                          <button
                            type="button"
                            onClick={() => void revokeOne(id)}
                            disabled={revoking === id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-neutral-600 hover:text-danger hover:bg-danger/5 border border-transparent hover:border-danger/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto shrink-0"
                          >
                            {revoking === id ? (
                              <>
                                <Spinner variant="heartbeat" size="xs" />
                                Revoking…
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
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                >
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                                </svg>
                                Revoke
                              </>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmBulkOpen}
        title="Sign out all other devices?"
        message="This will sign out every other browser and mobile session. Your current session will stay signed in."
        confirmLabel="Yes, sign out others"
        variant="danger"
        loading={bulkRevoking}
        onConfirm={revokeAll}
        onCancel={() => setConfirmBulkOpen(false)}
      />
    </div>
  );
};

export default Sessions;
