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
        setQrCode(response.data.qrCode);
        setSecret(response.data.secret);
      } catch (err: any) {
        setError(err.message || "Failed to setup 2FA. Please try logging in first.");
      } finally {
        setInitialLoading(false);
      }
    };

    // Check if user has a temp token (just registered) or access token (logged in)
    const tempToken = sessionStorage.getItem("tempToken");
    const accessToken = localStorage.getItem("accessToken");

    if (!tempToken && !accessToken) {
      // No auth - redirect to login
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
      setBackupCodes(response.data.backupCodes);
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
    alert("Backup codes copied to clipboard!");
  };

  // Complete setup
  const handleComplete = async () => {
    try {
      setLoading(true);
      // 1. Clear temp token (setup is done)
      sessionStorage.removeItem("tempToken");

      // 2. Refresh session to get updated hospital object (with totpEnabled: true)
      await refreshUser();

      // 3. Navigate directly to dashboard
      console.log("Setup complete, redirecting to dashboard...");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Failed to refresh session after setup:", error);
      // Fallback to login if refresh fails
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

  return null;
};

export default TotpSetupMandatory;
