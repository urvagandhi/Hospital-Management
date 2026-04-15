/**
 * Notification Settings — preferences toggles with optimistic UI + toasty
 * "Saved" feedback. Uses findByIdAndUpdate on the backend so toggling is
 * fast and doesn't re-validate the whole Hospital doc.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { useAuth } from "../hooks/useAuth";
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
    icon: React.ReactNode;
    adminOnly?: boolean;
};

const ROWS: Row[] = [
    {
        key: "newLoginAlert",
        label: "New login alerts",
        desc: "Get notified when a new device signs in to your account",
        icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
        ),
    },
    {
        key: "securityAlerts",
        label: "Security alerts",
        desc: "Password changes, session revocations, and security events",
        icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
        ),
    },
    {
        key: "marketing",
        label: "Product updates",
        desc: "Occasional news, tips, and feature announcements",
        icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
        ),
    },
];

/** iOS-style toggle switch (Tailwind-only, no extra deps). */
const Toggle: React.FC<{ checked: boolean; disabled?: boolean; onChange: () => void }> = ({
    checked, disabled, onChange,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            checked ? "bg-blue-600" : "bg-gray-200"
        }`}
    >
        <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                checked ? "translate-x-5" : "translate-x-0"
            }`}
        />
    </button>
);

const NotificationSettings: React.FC = () => {
    const navigate = useNavigate();
    const { state } = useAuth();
    const isAdmin = state.hospital?.role === "admin";
    const visibleRows = ROWS.filter((r) => !r.adminOnly || isAdmin);

    const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<keyof NotificationPrefs | null>(null);
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

    useEffect(() => { void load(); }, [load]);

    useEffect(() => () => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
    }, []);

    const showSaved = (label: string) => {
        setSavedFlash(label);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setSavedFlash(null), 1600);
    };

    const togglePref = async (k: keyof NotificationPrefs, label: string) => {
        const previous = prefs;
        const next = { ...prefs, [k]: !prefs[k] };
        // Optimistic update
        setPrefs(next);
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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="mb-6 flex items-center justify-between">
                    <Button label="← Back to Dashboard" onClick={() => navigate("/dashboard")} variant="ghost" size="sm" />
                    {savedFlash && (
                        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 animate-fadeIn">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {savedFlash}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-6">
                    <h1 className="text-2xl font-bold text-gray-800 mb-1">Notifications</h1>
                    <p className="text-sm text-gray-500 mb-4">
                        Choose which notifications you'd like to receive. Changes save automatically.
                    </p>

                    {error && <ErrorMessage message={error} type="error" onClose={() => setError(null)} />}

                    <div className="divide-y divide-gray-100">
                        {visibleRows.map(({ key, label, desc, icon }) => (
                            <div key={key} className="flex items-center gap-4 py-4">
                                <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                                    prefs[key] ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"
                                }`}>
                                    {icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {savingKey === key && (
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400" />
                                    )}
                                    <Toggle
                                        checked={prefs[key]}
                                        disabled={savingKey !== null}
                                        onChange={() => togglePref(key, label)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-xs text-gray-400 mt-6 text-center">
                        Notifications are delivered by email and (for mobile users) push.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default NotificationSettings;
