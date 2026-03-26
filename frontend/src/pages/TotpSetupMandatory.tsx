/**
 * Mandatory TOTP Setup Page
 * For new users after registration - must complete before first login
 */

import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { OtpInput } from "../components/OtpInput";
import authService from "../services/authService";

import { useAuth } from "../hooks/useAuth";

export const TotpSetupMandatory: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState<"qr" | "verify" | "backup">("qr");
  const [qrCode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [token, setToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const hasFetchedRef = React.useRef(false);

  const hospitalName = searchParams.get("hospital") || "Hospital";
  const email = searchParams.get("email") || "";

  // Fetch TOTP setup on mount
  useEffect(() => {
    const fetchTotpSetup = async () => {
      // Prevent double-call in Strict Mode
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;

      try {
        const response = await authService.setupTotp();
        setQrCode(response.data.qrCode || "");
        setSecret(response.data.secret || "");
      } catch (err: any) {
        setError(err.message || "Failed to setup 2FA. Please try logging in first.");
      } finally {
        setInitialLoading(false);
      }
    };

    // Check if user has a temp token (just registered) or access token (logged in)
    const tempToken = sessionStorage.getItem("tempToken");
    const accessToken = sessionStorage.getItem("accessToken");

    if (!tempToken && !accessToken) {
      navigate("/login");
      return;
    }

    fetchTotpSetup();
  }, [navigate]);

  // Verify TOTP code
  const handleVerify = async () => {
    if (token.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await authService.verifyTotpSetup(token);
      setBackupCodes(response.data.backupCodes || []);
      setStep("backup");
    } catch (err: any) {
      setError(err.message || "Invalid code. Please try again.");
      setToken("");
    } finally {
      setLoading(false);
    }
  };

  // Copy backup codes
  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join("\n");
    navigator.clipboard.writeText(codesText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Complete setup
  const handleComplete = async () => {
    try {
      setLoading(true);
      sessionStorage.removeItem("tempToken");
      await refreshUser();
      navigate("/dashboard", { replace: true });
    } catch (error) {
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Setting up 2FA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        <LogoHeader
          hospitalName="Setup Two-Factor Authentication"
          subtitle="Secure your account with an authenticator app"
        />

        {error && (
          <ErrorMessage message={error} onClose={() => setError("")} />
        )}

        {/* Step 1: QR Code */}
        {step === "qr" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>

              {qrCode ? (
                <div className="flex justify-center mb-4">
                  <img
                    src={qrCode}
                    alt="TOTP QR Code"
                    className="w-48 h-48 border rounded-lg"
                  />
                </div>
              ) : (
                <div className="flex justify-center mb-4">
                  <div className="w-48 h-48 border rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                    QR code unavailable
                  </div>
                </div>
              )}

              {secret && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-gray-500 mb-1">
                    Can't scan? Enter this key manually:
                  </p>
                  <code className="text-sm font-mono text-blue-700 select-all break-all">
                    {secret}
                  </code>
                </div>
              )}
            </div>

            <Button
              label="I've scanned the QR code"
              onClick={() => setStep("verify")}
              variant="primary"
              size="lg"
              fullWidth
            />
          </div>
        )}

        {/* Step 2: Verify Code */}
        {step === "verify" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Enter the 6-digit code from your authenticator app to verify setup.
              </p>
            </div>

            <OtpInput
              length={6}
              value={token}
              onChange={setToken}
              onComplete={handleVerify}
            />

            <Button
              label={loading ? "Verifying..." : "Verify & Activate"}
              onClick={handleVerify}
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading || token.length !== 6}
              loading={loading}
            />

            <button
              onClick={() => {
                setStep("qr");
                setToken("");
                setError("");
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Back to QR code
            </button>
          </div>
        )}

        {/* Step 3: Backup Codes */}
        {step === "backup" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">2FA Activated</h3>
              <p className="text-sm text-gray-600 mt-1">
                Save these backup codes in a safe place. Each code can only be used once.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="text-sm font-mono text-gray-800 bg-white rounded px-2 py-1 text-center border"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>

            <button
              onClick={handleCopyBackupCodes}
              className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-2"
            >
              {copied ? "Copied!" : "Copy all codes to clipboard"}
            </button>

            <Button
              label={loading ? "Finishing..." : "Continue to Dashboard"}
              onClick={handleComplete}
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading}
              loading={loading}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TotpSetupMandatory;
