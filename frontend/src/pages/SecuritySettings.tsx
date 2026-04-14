/**
 * Security Settings Page
 *
 * Displays the hospital's Auth Code (the second factor used during login)
 * and provides entry points for future security actions.
 *
 * TOTP / 2FA has been removed — the second factor is now a 6-digit Auth Code
 * delivered via the welcome email.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";

export const SecuritySettings: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();
  const [codeRevealed, setCodeRevealed] = useState(false);

  React.useEffect(() => {
    if (!state.isAuthenticated) navigate("/login");
  }, [state.isAuthenticated, navigate]);

  const hospital = state.hospital;
  const maskedCode = hospital?.authCode ? `${hospital.authCode.slice(0, 2)}••••` : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
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

          {/* ── Hospital info read-only ─────────────────────────────────── */}
          <div className="border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-1.5">
            <div><span className="text-gray-500">Hospital:</span> <span className="font-medium">{hospital?.hospitalName || "—"}</span></div>
            <div><span className="text-gray-500">Email:</span> <span className="font-medium">{hospital?.email || "—"}</span></div>
            <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{hospital?.phone || "—"}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
