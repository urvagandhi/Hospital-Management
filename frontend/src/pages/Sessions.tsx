/**
 * Sessions & Auth Code — list active sessions, revoke, and view Auth Code.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorMessage } from "../components/ErrorMessage";
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

const formatTime = (iso?: string) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};
const getSessionId = (s: SessionItem) => (s.id || s._id || "").trim();
const getSessionKey = (s: SessionItem) => {
  const explicit = (s.sessionKey || "").trim();
  if (explicit) return explicit;
  const id = getSessionId(s);
  return id ? id.slice(-6).toUpperCase() : "";
};

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

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authService.listSessions();
      setSessions(response.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (state.isAuthenticated) void load(); }, [state.isAuthenticated]);

  const hospital = state.hospital;
  const maskedCode = hospital?.authCode ? `${hospital.authCode.slice(0, 2)}••••` : "";

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
      void load();
    } catch (err: any) {
      setError(err?.message || "Failed to revoke other sessions");
      setConfirmBulkOpen(false);
    } finally {
      setBulkRevoking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Button label="← Back to Dashboard" onClick={() => navigate("/dashboard")} variant="ghost" size="sm" />
        </div>

        {/* Auth Code — shown first, it's what proves the session owner */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
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
        </div>

        {/* Active Sessions */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Active Sessions</h1>
              <p className="text-sm text-gray-500">Devices currently signed in to this account.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button label="Refresh" variant="ghost" size="sm" onClick={() => void load()} disabled={loading} />
              <Button
                label="Sign out all others"
                variant="danger"
                size="sm"
                onClick={() => setConfirmBulkOpen(true)}
                disabled={bulkRevoking || sessions.filter((s) => !s.isCurrent && !!getSessionId(s)).length === 0}
              />
            </div>
          </div>

          {error && <ErrorMessage message={error} type="error" onClose={() => setError(null)} />}

          {loading ? (
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
                      <p className="text-sm font-medium text-gray-800 truncate">{humanizeUA(s.userAgent)}</p>
                      {s.isCurrent && (
                        <span className="text-[10px] uppercase font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded">Current</span>
                      )}
                      {s.isMobile && !s.isCurrent && (
                        <span className="text-[10px] uppercase font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">Mobile</span>
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
