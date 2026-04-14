/**
 * Security Settings Page
 *
 * Sections:
 *   • Auth Code — view the 6-digit login factor (existing)
 *   • Change Password — modal with current + new password
 *   • Active Sessions — list + individual revoke + revoke-all-others
 *
 * TOTP / 2FA has been removed — the second factor is now a 6-digit Auth Code
 * delivered via the welcome email.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { TextInput } from "../components/TextInput";
import { useAuth } from "../hooks/useAuth";
import authService from "../services/authService";

interface SessionItem {
  id?: string;
  _id?: string;
  sessionKey?: string;
  platform?: string;
  isMobile?: boolean;
  userAgent?: string;
  ipAddress?: string;
  lastSeenAt?: string;
  createdAt?: string;
  isCurrent?: boolean;
}

/** Same ruleset as the backend (/auth/password/change). */
const validatePasswordPolicy = (pw: string): string | null => {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain a number";
  if (!/[\W_]/.test(pw)) return "Password must contain a special character";
  return null;
};

function humanizeUA(ua?: string): string {
  if (!ua) return "Unknown device";
  const ours = ua.match(/HospitalHMS-Android\/[\w.+-]+\s*\(Android\s*([\w.]+);\s*([^)]+)\)/i);
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

function formatTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function getSessionId(session: SessionItem): string {
  return (session.id || session._id || "").trim();
}

function getSessionKey(session: SessionItem): string {
  const explicit = (session.sessionKey || "").trim();
  if (explicit) return explicit;
  const id = getSessionId(session);
  return id ? id.slice(-6).toUpperCase() : "";
}

export const SecuritySettings: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();

  const [codeRevealed, setCodeRevealed] = useState(false);

  // Change-password modal state
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [bulkRevoking, setBulkRevoking] = useState(false);

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const response = await authService.listSessions();
      setSessions(response.data || []);
    } catch (err: any) {
      setSessionsError(err?.message || "Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (state.isAuthenticated) void loadSessions();
  }, [state.isAuthenticated]);

  const hospital = state.hospital;
  const maskedCode = hospital?.authCode ? `${hospital.authCode.slice(0, 2)}••••` : "";

  // ── Change password handlers ─────────────────────────────────────────
  const openPwModal = () => {
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setPwError(null);
    setPwSuccess(null);
    setPwModalOpen(true);
  };

  const submitPwChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!currentPw) return setPwError("Current password is required");
    const pwErr = validatePasswordPolicy(newPw);
    if (pwErr) return setPwError(pwErr);
    if (newPw === currentPw) return setPwError("New password must be different from current password");
    if (newPw !== confirmPw) return setPwError("New passwords do not match");

    setPwLoading(true);
    try {
      const response = await authService.changePasswordSettings(currentPw, newPw);
      setPwSuccess(response.message || "Password changed successfully");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      // Other sessions were revoked — refresh the list.
      void loadSessions();
      // Auto-close after a moment
      setTimeout(() => setPwModalOpen(false), 1500);
    } catch (err: any) {
      setPwError(err?.message || "Password change failed");
    } finally {
      setPwLoading(false);
    }
  };

  // ── Session revoke handlers ──────────────────────────────────────────
  const revokeOne = async (id: string) => {
    if (!id) {
      setSessionsError("Session ID missing. Please refresh and try again.");
      return;
    }
    setRevoking(id);
    try {
      await authService.revokeSession(id);
      setSessions((list) => list.filter((s) => getSessionId(s) !== id));
    } catch (err: any) {
      setSessionsError(err?.message || "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm("Sign out all other devices? Your current session will stay signed in.")) return;
    setBulkRevoking(true);
    try {
      await authService.revokeAllOtherSessions();
      void loadSessions();
    } catch (err: any) {
      setSessionsError(err?.message || "Failed to revoke other sessions");
    } finally {
      setBulkRevoking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Button
            label="← Back to Dashboard"
            onClick={() => navigate("/dashboard")}
            variant="ghost"
            size="sm"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Security Settings</h1>
          <p className="text-gray-600 mb-6">Manage your account security settings</p>

          {/* ── Auth Code card ─────────────────────────────────────────── */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wide">Auth Code</h2>
                <p className="text-xs text-blue-700 mt-1">
                  Required every time you log in. Keep it private.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-mono tracking-[0.35em] text-blue-900 font-bold select-all">
                  {codeRevealed ? (hospital?.authCode || "—") : maskedCode}
                </p>
                <button
                  type="button"
                  onClick={() => setCodeRevealed((v) => !v)}
                  className="text-xs text-blue-700 underline underline-offset-2 mt-1 hover:text-blue-900"
                >
                  {codeRevealed ? "Hide" : "Reveal"}
                </button>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              If you've lost your Auth Code, contact your administrator to reset it.
            </p>
          </div>

          {/* ── Change Password card ────────────────────────────────────── */}
          <div className="border border-gray-200 rounded-lg p-5 mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Password</h2>
              <p className="text-xs text-gray-500 mt-1">
                Change your password. All other sessions will be signed out.
              </p>
            </div>
            <Button label="Change Password" variant="primary" size="sm" onClick={openPwModal} />
          </div>

          {/* ── Hospital info read-only ─────────────────────────────────── */}
          <div className="border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-1.5">
            <div><span className="text-gray-500">Hospital:</span> <span className="font-medium">{hospital?.hospitalName || "—"}</span></div>
            <div><span className="text-gray-500">Email:</span> <span className="font-medium">{hospital?.email || "—"}</span></div>
            <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{hospital?.phone || "—"}</span></div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="text-sm text-blue-600 hover:text-blue-800 underline underline-offset-2"
              >
                Edit profile →
              </button>
            </div>
          </div>
        </div>

        {/* ── Active Sessions card ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Active Sessions</h2>
              <p className="text-sm text-gray-500">Devices currently signed in to this account.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                label="Refresh"
                variant="ghost"
                size="sm"
                onClick={() => void loadSessions()}
                disabled={sessionsLoading}
              />
              <Button
                label={bulkRevoking ? "Signing out..." : "Sign out all others"}
                variant="danger"
                size="sm"
                onClick={revokeAll}
                disabled={bulkRevoking || sessions.filter((s) => !s.isCurrent && !!getSessionId(s)).length === 0}
                loading={bulkRevoking}
              />
            </div>
          </div>

          {sessionsError && (
            <ErrorMessage message={sessionsError} type="error" onClose={() => setSessionsError(null)} />
          )}

          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No active sessions found.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sessions.map((s) => (
                <li key={getSessionId(s) || `${s.userAgent || "unknown"}-${s.createdAt || ""}`} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {humanizeUA(s.userAgent)}
                      </p>
                      {s.isCurrent && (
                        <span className="text-[10px] uppercase font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded">
                          Current
                        </span>
                      )}
                      {s.isMobile && !s.isCurrent && (
                        <span className="text-[10px] uppercase font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                          Mobile
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {getSessionKey(s) ? `Session ${getSessionKey(s)} • ` : ""}
                      {s.ipAddress ? `${s.ipAddress} • ` : ""}
                      Last seen {formatTime(s.lastSeenAt || s.createdAt)}
                    </p>
                  </div>
                  {!s.isCurrent && !!getSessionId(s) && (
                    <Button
                      label={revoking === getSessionId(s) ? "Revoking..." : "Revoke"}
                      variant="danger"
                      size="sm"
                      onClick={() => void revokeOne(getSessionId(s))}
                      disabled={revoking === getSessionId(s)}
                      loading={revoking === getSessionId(s)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Change password modal ───────────────────────────────────────── */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md animate-fadeIn">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Change Password</h3>
            <p className="text-sm text-gray-500 mb-4">
              Enter your current password and choose a new one.
            </p>

            {pwError && <ErrorMessage message={pwError} type="error" onClose={() => setPwError(null)} />}
            {pwSuccess && (
              <div className="mb-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">
                {pwSuccess}
              </div>
            )}

            <form onSubmit={submitPwChange} className="space-y-4">
              <TextInput
                label="Current Password"
                type="password"
                value={currentPw}
                onChange={setCurrentPw}
                required
                autoFocus
              />
              <TextInput
                label="New Password"
                type="password"
                value={newPw}
                onChange={setNewPw}
                required
              />
              <TextInput
                label="Confirm New Password"
                type="password"
                value={confirmPw}
                onChange={setConfirmPw}
                required
              />
              <ul className="text-xs text-gray-500 space-y-1 pl-5 list-disc">
                <li>At least 8 characters</li>
                <li>Uppercase + lowercase letters</li>
                <li>At least one number and one special character</li>
              </ul>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  label="Cancel"
                  variant="ghost"
                  onClick={() => setPwModalOpen(false)}
                  disabled={pwLoading}
                />
                <Button
                  label={pwLoading ? "Updating..." : "Change Password"}
                  type="submit"
                  variant="primary"
                  disabled={pwLoading}
                  loading={pwLoading}
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecuritySettings;
