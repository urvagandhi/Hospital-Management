/**
 * Login Page
 * Supports login via email or phone number (single field auto-detection)
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { TextInput } from "../components/TextInput";
import { useAuth } from "../hooks/useAuth";

/** Detect input type for client-side validation */
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

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, state } = useAuth();

  useEffect(() => {
    document.title = "Login - Hospital Management";
  }, []);

  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });

  const [errors, setErrors] = useState({
    identifier: "",
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
      navigate("/dashboard");
    }
  }, [state.isAuthenticated, navigate]);

  const validateForm = (): boolean => {
    const identifierErr = getIdentifierError(formData.identifier);
    const passwordErr = !formData.password ? "Password is required" : formData.password.length < 8 ? "Password must be at least 8 characters" : "";

    const newErrors = {
      identifier: identifierErr || "",
      password: passwordErr,
    };

    setErrors(newErrors);
    return !newErrors.identifier && !newErrors.password;
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDisplayError(null);
    if (submitted) {
      if (field === "identifier") {
        setErrors((prev) => ({ ...prev, identifier: getIdentifierError(value) || "" }));
      } else if (field === "password") {
        setErrors((prev) => ({ ...prev, password: !value ? "Password is required" : "" }));
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
      const next = await login(formData.identifier.trim(), formData.password);
      if (next === "PASSWORD_CHANGE") {
        navigate("/change-password");
      } else {
        // next === "AUTH_CODE"
        navigate("/verify-auth-code");
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

  // Prevent flash of login screen while checking auth
  if (state.loading || state.isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Detect type for dynamic placeholder hint
  const identifierType = formData.identifier ? detectIdentifierType(formData.identifier) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
        <LogoHeader hospitalName="Hospital Management" subtitle="Secure Admin Portal" />

        {displayError && <ErrorMessage message={displayError} type="error" onClose={() => setDisplayError(null)} />}

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <TextInput
            label="Email or Phone"
            type="text"
            placeholder="admin@hospital.com  or  +91..."
            value={formData.identifier}
            onChange={(value) => handleChange("identifier", value)}
            error={errors.identifier}
            autoComplete="username"
            autoFocus
            required
            icon={
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            }
          />
          {identifierType && (
            <p className="text-xs text-gray-400 -mt-3 ml-1">
              Detected: {identifierType}
            </p>
          )}

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

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => navigate("/forgot-password")}
            className="text-sm text-blue-600 hover:text-blue-800 underline underline-offset-2"
          >
            Forgot password?
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Biometric login available on the Android app
        </p>
      </div>
    </div>
  );
};

export default Login;
