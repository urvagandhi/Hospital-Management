/**
 * Login Page
 * Hospital email and password login with OTP flow initiation
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { TextInput } from "../components/TextInput";
import { useAuth } from "../hooks/useAuth";
import { getEmailError, getPasswordError } from "../utils/validator";

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, logout, state } = useAuth();

  useEffect(() => {
    document.title = "Login - Hospital Management";
  }, []);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({
    email: "",
    password: "",
  });

  const [submitted, setSubmitted] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);

  useEffect(() => {
    if (state.error) {
      setDisplayError(state.error);
    }
  }, [state.error]);

  // Redirect if already authenticated
  useEffect(() => {
    if (state.isAuthenticated) {
      // Direct redirect to dashboard if authenticated
      // Ignoring logic about TOTP enabled/disabled since we are bypassing it
      navigate("/dashboard");
    }
  }, [state.isAuthenticated, navigate]);

  /*
  // If already authenticated, show Welcome Back screen instead of login form
  if (state.isAuthenticated && state.hospital?.totpEnabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
          <LogoHeader hospitalName={state.hospital.hospitalName} subtitle="Secure Admin Portal" />

          <div className="mt-8 text-center space-y-6">
            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm">
              <p className="font-medium">Welcome back!</p>
              <p>
                You are already signed in as <strong>{state.hospital.email}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <Button label="Continue to Dashboard" onClick={() => navigate("/dashboard")} variant="primary" fullWidth />
              <Button label="Sign Out" onClick={logout} variant="ghost" fullWidth />
            </div>
          </div>
        </div>
      </div>
    );
  }
  */


  const validateForm = (): boolean => {
    const newErrors = {
      email: getEmailError(formData.email) || "",
      password: getPasswordError(formData.password) || "",
    };

    setErrors(newErrors);
    return !newErrors.email && !newErrors.password;
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDisplayError(null); // Clear error when user starts typing
    if (submitted) {
      if (field === "email") {
        setErrors((prev) => ({ ...prev, email: getEmailError(value) || "" }));
      } else if (field === "password") {
        setErrors((prev) => ({ ...prev, password: getPasswordError(value) || "" }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setDisplayError(null);

    const isValid = validateForm();
    if (!isValid) return;

    try {
      const loginComplete = await login(formData.email, formData.password);

      if (loginComplete === true) {
        navigate("/dashboard");
      } else if (loginComplete === "SETUP_NEEDED") {
        navigate("/setup-2fa");
      } else if (loginComplete === "PASSWORD_CHANGE") {
        navigate("/change-password");
      } else if (loginComplete === false) {
        // TOTP required
        navigate("/verify-otp");
      } else {
        navigate("/dashboard");
      }
    } catch (error: unknown) {
      const err = error as Error & { response?: { status?: number; data?: { lockUntil?: string } } };
      if (err.response?.status === 423 && err.response.data?.lockUntil) {
        const lockUntil = new Date(err.response.data.lockUntil);
        setDisplayError(`Account locked until ${lockUntil.toLocaleTimeString()}. Please try again later.`);
      } else {
        setDisplayError(err.message || "Login failed");
      }
    }
  };

  // Prevent flash of login screen while checking auth or if already authenticated
  if (state.loading || state.isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
        <LogoHeader hospitalName="Hospital Management" subtitle="Secure Admin Portal" />

        {displayError && <ErrorMessage message={displayError} type="error" onClose={() => setDisplayError(null)} />}

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <TextInput
            label="Email Address"
            type="email"
            placeholder="your-email@hospital.com"
            value={formData.email}
            onChange={(value) => handleChange("email", value)}
            error={errors.email}
            autoComplete="email"
            autoFocus
            required
            icon={
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
            }
          />

          <TextInput
            label="Password"
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={(value) => handleChange("password", value)}
            error={errors.password}
            autoComplete="current-password"
            required
            icon={
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" />
              </svg>
            }
          />

          <Button label={state.loading ? "Signing in..." : "Sign In"} type="submit" variant="primary" size="lg" fullWidth disabled={state.loading} loading={state.loading} />
        </form>

      </div>
    </div>
  );
};

export default Login;
