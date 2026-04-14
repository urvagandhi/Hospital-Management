/**
 * Verify Auth Code page (step 2 of login)
 *
 * Reached after POST /login returns requireAuthCode=true. The user enters
 * their hospital's 6-digit authCode; we POST /login/verify-auth-code and,
 * on success, they land on the dashboard.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { OtpInput } from "../components/OtpInput";
import { useAuth } from "../hooks/useAuth";

export const VerifyAuthCode: React.FC = () => {
  const navigate = useNavigate();
  const { verifyAuthCode } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    document.title = "Enter Auth Code — Hospital Management";
  }, []);

  // If user landed here without a tempToken, send them back to login
  useEffect(() => {
    if (!sessionStorage.getItem("tempToken")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Auto-verify as soon as 6 digits are entered
  useEffect(() => {
    if (code.length === 6 && !isVerifying) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (val: string) => {
    if (val.length !== 6) {
      setError("Please enter your 6-digit Auth Code");
      return;
    }
    setIsVerifying(true);
    setError("");
    try {
      await verifyAuthCode(val);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Invalid auth code. Please try again.");
      setCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBackToLogin = () => {
    sessionStorage.removeItem("tempToken");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
        <LogoHeader hospitalName="Hospital Management" subtitle="Enter Auth Code" />

        <p className="text-sm text-gray-600 text-center mt-6 mb-4">
          Enter the <strong>6-digit Auth Code</strong> from your welcome email to finish signing in.
        </p>

        {error && <ErrorMessage message={error} type="error" onClose={() => setError("")} />}

        <div className="mt-6">
          <OtpInput
            length={6}
            value={code}
            onChange={setCode}
            disabled={isVerifying}
          />
        </div>

        <div className="mt-6">
          <Button
            label={isVerifying ? "Verifying…" : "Verify"}
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => void submit(code)}
            disabled={isVerifying || code.length !== 6}
            loading={isVerifying}
          />
        </div>

        <button
          type="button"
          onClick={handleBackToLogin}
          className="mt-5 w-full text-sm text-gray-500 hover:text-blue-600 underline underline-offset-2"
        >
          Back to login
        </button>
      </div>
    </div>
  );
};

export default VerifyAuthCode;
