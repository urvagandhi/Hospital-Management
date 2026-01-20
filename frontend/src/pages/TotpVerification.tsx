/**
 * TOTP Verification Page
 * For users with 2FA enabled during login
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { OtpInput } from "../components/OtpInput";
import { useAuth } from "../hooks/useAuth";

export const TotpVerification: React.FC = () => {
  const navigate = useNavigate();
  const { state, verifyTotpLogin, verifyRecoveryLogin } = useAuth(); // Destructure new methods

  const [token, setToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Redirect if no tempToken (not coming from login)
  useEffect(() => {
    const tempToken = localStorage.getItem("tempToken");
    if (!tempToken) {
      navigate("/login");
    }
  }, [navigate]);

  // Auto-verify when TOTP is complete
  useEffect(() => {
    if (token.length === 6 && !isVerifying && !showRecovery) {
      handleVerify();
    }
  }, [token]);

  const handleVerify = async () => {
    if (token.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      await verifyTotpLogin(token); // Use hook method
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid code. Please try again.");
      setToken("");

      // Check for attempts remaining (passed through from hook)
      if (err.response?.attemptsRemaining !== undefined) {
        setAttemptsRemaining(err.response.attemptsRemaining);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRecoveryLogin = async () => {
    if (!recoveryCode.trim()) {
      setError("Please enter a backup code");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      // Strip dashes before sending to backend
      const cleanCode = recoveryCode.replace(/-/g, "").trim();
      const data = await verifyRecoveryLogin(cleanCode); // Use hook method

      // Show warning if few codes remaining
      if (data.remainingBackupCodes <= 2) {
        alert(`Warning: You only have ${data.remainingBackupCodes} backup codes remaining. Consider regenerating them in Settings.`);
      }

      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid backup code. Please try again.");
      setRecoveryCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBackToLogin = () => {
    localStorage.removeItem("tempToken");
    navigate("/login");
  };

  return null;
};

export default TotpVerification;
