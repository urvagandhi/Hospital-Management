/**
 * Notification Settings — grouped bento preferences with optimistic save.
 *
 * Behavior preserved from the previous version:
 *   • 3 toggles backed by `notificationPrefs` on the Hospital doc
 *   • Each toggle auto-saves via PUT /me/notification-preferences
 *   • Optimistic UI with rollback on failure + a transient "Saved" toast
 *
 * Layout: follows the mockup's two-card grouping (Security + News & Updates)
 * and drops the left-side settings sidebar per project convention.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import PageLoader from "../components/PageLoader";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefs,
} from "../services/hospitalService";

const DEFAULT_PREFS: NotificationPrefs = {
  newLoginAlert: true,
  securityAlerts: true,
  marketing: false,
};

type Row = {
  key: keyof NotificationPrefs;
  label: string;
  desc: string;
};

type Group = {
  id: string;
  title: string;
  description: string;
  tone: "primary" | "neutral";
  icon: React.ReactNode;
  rows: Row[];
};

const GROUPS: Group[] = [
  {
    id: "security",
    title: "Security Alerts",
    description:
      "Critical updates regarding account access and data integrity. Clinical alerts are always delivered regardless of these settings.",
    tone: "primary",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <rect x="9" y="10" width="6" height="6" rx="1" />
        <path d="M10 10V8a2 2 0 1 1 4 0v2" />
      </svg>
    ),
    rows: [
      {
        key: "newLoginAlert",
        label: "New login alerts",
        desc: "Email you immediately when a new device signs in to your account.",
      },
      {
        key: "securityAlerts",
        label: "Security alerts",
        desc: "Password changes, session revocations, and account-security events.",
      },
    ],
  },
  {
    id: "news",
    title: "News & Updates",
    description: "Information to help you get the most out of MediVault.",
    tone: "neutral",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M3 11l18-8v18l-18-8z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    ),
    rows: [
      {
        key: "marketing",
        label: "Product updates",
        desc: "Occasional news, tips, and feature announcements.",
      },
    ],
  },
];

// ── Toggle ──────────────────────────────────────────────────────────────────

const Toggle: React.FC<{
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}> = ({ checked, disabled, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${checked ? "bg-gradient-primary shadow-primary" : "bg-neutral-200"
      }`}
  >
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-1 ring-black/5 transition duration-200 ease-in-out absolute top-0.5 ${checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
    />
  </button>
);

// ── Page ───────────────────────────────────────────────────────────────────

const NotificationSettings: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();

  useDocumentTitle("Notifications — Hospital Management");

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] =
    useState<keyof NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getNotificationPrefs();
      setPrefs({ ...DEFAULT_PREFS, ...data });
    } catch (e: any) {
      setError(e.message || "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const showSaved = (msg: string) => {
    setSavedFlash(msg);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(null), 1800);
  };

  const togglePref = async (k: keyof NotificationPrefs, label: string) => {
    const previous = prefs;
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next); // optimistic
    setSavingKey(k);
    setError(null);
    try {
      const res = await updateNotificationPrefs({ [k]: next[k] });
      setPrefs({ ...DEFAULT_PREFS, ...res });
      showSaved(`${label} ${next[k] ? "enabled" : "disabled"}`);
    } catch (e: any) {
      setPrefs(previous);
      setError(e.message || "Failed to save. Please try again.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <PageLoader label="Loading notification settings…" />;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <header className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900 mb-2">
              Notification Preferences
            </h1>
            <p className="text-neutral-500 text-sm md:text-base leading-relaxed max-w-xl">
              Manage how we contact you. Critical clinical alerts are always
              delivered regardless of these settings.
            </p>
          </div>
          {/* Saved flash */}
          <div
            className={`self-start sm:self-end transition-all duration-200 ${savedFlash
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-1 pointer-events-none"
              }`}
          >
            {savedFlash && (
              <div className="inline-flex items-center gap-2 text-sm font-medium text-success bg-success/10 border border-success/20 rounded-full px-3 py-1.5">
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
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {savedFlash}
              </div>
            )}
          </div>
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

        {/* Grouped bento cards */}
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <section
              key={group.id}
              className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden"
            >
              {/* Group header */}
              <div className="p-6 border-b border-neutral-100">
                <div className="flex items-start gap-3">
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset ${group.tone === "primary"
                        ? "bg-primary-50 text-primary-600 ring-primary-600/15"
                        : "bg-neutral-100 text-neutral-600 ring-neutral-300/40"
                      }`}
                  >
                    {group.icon}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-neutral-900 mb-0.5">
                      {group.title}
                    </h2>
                    <p className="text-sm text-neutral-500 leading-relaxed">
                      {group.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-neutral-100">
                {group.rows.map(({ key, label, desc }) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-5 px-6 py-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 mb-0.5">
                        {label}
                      </p>
                      <p className="text-sm text-neutral-500 leading-relaxed">
                        {desc}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {savingKey === key && (
                        <span
                          aria-hidden="true"
                          className="w-3 h-3 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin"
                        />
                      )}
                      <Toggle
                        checked={!!prefs[key]}
                        disabled={savingKey !== null}
                        onChange={() => togglePref(key, label)}
                        label={label}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="text-xs text-neutral-400 mt-8 text-center">
          Notifications are delivered by email · mobile push when signed in on
          Android. Changes save automatically.
        </p>
      </div>
    </div>
  );
};

export default NotificationSettings;
