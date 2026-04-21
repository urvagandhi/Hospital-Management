/**
 * Forgot Password — 3-step public flow
 *
 * Step 1 (identifier): user enters email or phone → /forgot-password/init
 *                      always shows the "check your email" screen
 * Step 2 (otp):        user enters 6-digit code → /forgot-password/verify
 *                      → stashes PASSWORD_RESET temp token in sessionStorage
 * Step 3 (reset):      user sets new password → /forgot-password/reset
 *                      → sends them to /login on success
 *
 * All three steps live in a single route (/forgot-password) with internal
 * state transitions so the browser back button can abandon the flow cleanly.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { OtpInput } from "../components/OtpInput";
import { TextInput } from "../components/TextInput";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import authService from "../services/authService";

type Step = "identifier" | "otp" | "reset" | "done";

const detectIdentifierType = (value: string): "email" | "phone" | "unknown" => {
  if (value.includes("@")) return "email";
  const cleaned = value.replace(/[\s\-()]/g, "");
  if (/^\+?\d{7,15}$/.test(cleaned)) return "phone";
  return "unknown";
};

const getIdentifierError = (value: string): string | null => {
  if (!value.trim()) return "Email or phone number is required";
  const type = detectIdentifierType(value);
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email format";
  if (type === "phone") {
    const cleaned = value.replace(/[\s\-()]/g, "");
    if (!/^\+?[1-9]\d{6,14}$/.test(cleaned)) return "Invalid phone number";
  }
  if (type === "unknown") return "Please enter a valid email or phone number";
  return null;
};

/** Same ruleset as the backend (/forgot-password/reset) so we fail early. */
const validatePasswordPolicy = (pw: string): string | null => {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain a number";
  if (!/[\W_]/.test(pw)) return "Password must contain a special character";
  return null;
};

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useDocumentTitle("Forgot Password — Hospital Management");

  // Clear any stale reset token on mount to avoid mixing flows.
  useEffect(() => {
    sessionStorage.removeItem("resetToken");
  }, []);

  // Resend cooldown tick
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // ── Step 1: Send OTP ───────────────────────────────────────────────────
  const submitIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const idErr = getIdentifierError(identifier);
    if (idErr) return setError(idErr);

    setLoading(true);
    try {
      await authService.forgotPasswordInit(identifier.trim());
      setInfo("If that account exists, a reset code was sent to the registered email.");
      setResendIn(60);
      setStep("otp");
    } catch (err: any) {
      setError(err?.message || "Unable to send reset code");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (resendIn > 0) return;
    setError(null);
    setLoading(true);
    try {
      await authService.forgotPasswordInit(identifier.trim());
      setInfo("Reset code sent again. Check your email.");
      setResendIn(60);
    } catch (err: any) {
      setError(err?.message || "Unable to resend code");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────
  const submitOtp = async (val: string) => {
    setError(null);
    if (val.length !== 6) return setError("Enter the 6-digit code");
    setLoading(true);
    try {
      await authService.forgotPasswordVerify(identifier.trim(), val);
      setInfo(null);
      setStep("reset");
    } catch (err: any) {
      setError(err?.message || "Invalid or expired code");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  // Auto-verify once the 6 digits are entered
  useEffect(() => {
    if (step === "otp" && otp.length === 6 && !loading) {
      void submitOtp(otp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step]);

  // ── Step 3: Set New Password ───────────────────────────────────────────
  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pwErr = validatePasswordPolicy(newPassword);
    if (pwErr) return setError(pwErr);
    if (newPassword !== confirm) return setError("Passwords do not match");

    setLoading(true);
    try {
      await authService.forgotPasswordReset(newPassword);
      setStep("done");
    } catch (err: any) {
      setError(err?.message || "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
        <LogoHeader subtitle="Reset Your Password" />

        {error && <ErrorMessage message={error} type="error" onClose={() => setError(null)} />}
        {info && !error && (
          <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg p-3">
            {info}
          </div>
        )}

        {/* ── Step 1 ─────────────────────────────────────────────── */}
        {step === "identifier" && (
          <form onSubmit={submitIdentifier} className="space-y-5 mt-6">
            <p className="text-sm text-gray-600">
              Enter your registered email or phone number. We'll email you a 6-digit reset code.
            </p>
            <TextInput
              label="Email or Phone"
              type="text"
              placeholder="admin@hospital.com  or  +91..."
              value={identifier}
              onChange={setIdentifier}
              autoFocus
              required
            />
            <Button
              label={loading ? "Sending..." : "Send Reset Code"}
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading}
              loading={loading}
            />
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full text-sm text-gray-500 hover:text-blue-600 underline underline-offset-2"
            >
              Back to login
            </button>
          </form>
        )}

        {/* ── Step 2 ─────────────────────────────────────────────── */}
        {step === "otp" && (
          <div className="space-y-5 mt-6">
            <p className="text-sm text-gray-600">
              Enter the 6-digit reset code we just emailed you.
            </p>
            <OtpInput length={6} value={otp} onChange={setOtp} disabled={loading} />
            <Button
              label={loading ? "Verifying..." : "Verify Code"}
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => void submitOtp(otp)}
              disabled={loading || otp.length !== 6}
              loading={loading}
            />
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("identifier");
                  setOtp("");
                  setError(null);
                  setInfo(null);
                }}
                className="text-gray-500 hover:text-blue-600 underline underline-offset-2"
              >
                ← Change identifier
              </button>
              <button
                type="button"
                onClick={resendOtp}
                disabled={resendIn > 0 || loading}
                className="text-blue-600 hover:text-blue-800 underline underline-offset-2 disabled:text-gray-400 disabled:no-underline"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ─────────────────────────────────────────────── */}
        {step === "reset" && (
          <form onSubmit={submitReset} className="space-y-5 mt-6">
            <p className="text-sm text-gray-600">
              Choose a new password. This will sign out all other devices.
            </p>
            <TextInput
              label="New Password"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              autoFocus
              required
            />
            <TextInput
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              required
            />
            <ul className="text-xs text-gray-500 space-y-1 pl-5 list-disc">
              <li>At least 8 characters</li>
              <li>Uppercase + lowercase letters</li>
              <li>At least one number and one special character</li>
            </ul>
            <Button
              label={loading ? "Resetting..." : "Reset Password"}
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading}
              loading={loading}
            />
          </form>
        )}

        {/* ── Done ───────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="space-y-5 mt-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Password reset successful</h3>
            <p className="text-sm text-gray-600">
              You can now sign in with your new password. All other sessions have been signed out.
            </p>
            <Button
              label="Go to Login"
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate("/login", { replace: true })}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
