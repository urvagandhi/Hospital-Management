/**
 * Network Status Indicator
 *
 * Two parts:
 *   1. <NetworkStatusPill />  — small dot+label, embedded inside the Navbar
 *   2. <NetworkStatusBanner /> — full-width slide-down bar below the navbar when offline
 *
 * Detection: navigator.onLine events + periodic /api/health ping (plain fetch, no auth).
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_URL } from "../config/constants";

type Status = "online" | "offline" | "reconnecting";

const PING_INTERVAL_MS = 30_000;
const RECONNECT_GRACE_MS = 3_000;

/* ─── Shared context so both pill and banner read the same state ─── */
const NetworkCtx = createContext<Status>("online");

export const NetworkStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Status>("online");
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) return false;
      const json = await res.json();
      // Accept both old format { success: true } and new format { status: "ok" }
      return json?.status === "ok" || json?.success === true;
    } catch {
      return false;
    }
  }, []);

  /* Initial check + interval */
  useEffect(() => {
    checkHealth().then((ok) => setStatus(ok ? "online" : navigator.onLine ? "online" : "offline"));

    pingTimer.current = setInterval(async () => {
      const ok = await checkHealth();
      setStatus((prev) => {
        if (ok && prev !== "online") return "online";
        if (!ok && prev === "online") return "offline";
        return prev;
      });
    }, PING_INTERVAL_MS);

    return () => { if (pingTimer.current) clearInterval(pingTimer.current); };
  }, [checkHealth]);

  /* Browser events */
  useEffect(() => {
    const handleOffline = () => setStatus("offline");
    const handleOnline = () => {
      setStatus("reconnecting");
      graceTimer.current = setTimeout(async () => {
        setStatus((await checkHealth()) ? "online" : "offline");
      }, RECONNECT_GRACE_MS);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, [checkHealth]);

  return <NetworkCtx.Provider value={status}>{children}</NetworkCtx.Provider>;
};

export const useNetworkStatus = () => useContext(NetworkCtx);

/* ─── Pill (inline inside Navbar) ─── */
export const NetworkStatusPill: React.FC = () => {
  const status = useNetworkStatus();

  const styles: Record<Status, { dot: string; text: string; label: string; ring?: string }> = {
    online:       { dot: "bg-emerald-500", text: "text-emerald-700", label: "Online", ring: "ring-emerald-500/20" },
    offline:      { dot: "bg-red-500",     text: "text-red-700",     label: "Offline", ring: "ring-red-500/20" },
    reconnecting: { dot: "bg-amber-500 animate-pulse", text: "text-amber-700", label: "Reconnecting...", ring: "ring-amber-500/20" },
  };
  const s = styles[status];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white ring-1 ${s.ring}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      <span className={`text-[11px] font-semibold tracking-wide ${s.text}`}>{s.label}</span>
    </div>
  );
};

/* ─── Banner (rendered in MainLayout, below the navbar) ─── */
export const NetworkStatusBanner: React.FC = () => {
  const status = useNetworkStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const prevStatus = useRef(status);

  useEffect(() => {
    if (prevStatus.current === "offline" && status === "online") {
      setShowBackOnline(true);
      const t = setTimeout(() => setShowBackOnline(false), 3000);
      return () => clearTimeout(t);
    }
    prevStatus.current = status;
  }, [status]);

  if (status === "offline") {
    return (
      <div className="bg-red-600 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-2 shadow-sm">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4m0 4h.01" />
        </svg>
        <span>You are offline. Some features may not be available.</span>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div className="bg-amber-500 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-2 shadow-sm">
        <svg className="h-4 w-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Reconnecting...</span>
      </div>
    );
  }

  if (showBackOnline) {
    return (
      <div className="bg-emerald-600 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-2 shadow-sm transition-all duration-300">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>Back online</span>
      </div>
    );
  }

  return null;
};

export default NetworkStatusPill;
