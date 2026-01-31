/**
 * OTP Verification Page
 * 6-digit OTP input with resend functionality and auto-verification
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { OtpInput } from "../components/OtpInput";
import { Button } from "../components/Button";
import { LogoHeader } from "../components/LogoHeader";
import { ErrorMessage } from "../components/ErrorMessage";
import { CountdownTimer } from "../components/CountdownTimer";
import { useAuth } from "../hooks/useAuth";
import authService from "../services/authService";
import { getOtpError } from "../utils/validator";
import { OTP_LENGTH } from "../config/constants";

export const OtpVerification: React.FC = () => {
  const navigate = useNavigate();
  const { state, verifyOtp } = useAuth();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Redirect if no tempToken (not coming from login)
  useEffect(() => {
    const tempToken = localStorage.getItem("tempToken");
    if (!tempToken) {
      navigate("/login");
    }
  }, [navigate]);

  // Auto-verify when OTP is complete
  useEffect(() => {
    if (otp.length === OTP_LENGTH && !state.loading) {
      handleVerify();
    }
  }, [otp, state.loading]);

  const handleVerify = async () => {
    const otpError = getOtpError(otp, OTP_LENGTH);
    if (otpError) {
      setError(otpError);
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      await verifyOtp(otp);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "OTP verification failed. Please try again.");
      setOtp("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      // Call resend OTP API
      await authService.resendOtp();
      setOtp("");
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to resend OTP");
    } finally {
      setIsResending(false);
    }
  };

  const hospitalName = state.hospital?.hospitalName || "Hospital";

  return null;
};

export default OtpVerification;
