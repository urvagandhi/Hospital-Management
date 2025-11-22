/**
 * Login Page
 * Hospital email and password login with OTP flow initiation
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TextInput } from "../components/TextInput";
import { Button } from "../components/Button";
import { LogoHeader } from "../components/LogoHeader";
import { ErrorMessage } from "../components/ErrorMessage";
import { useAuth } from "../hooks/useAuth";
import { getEmailError, getPasswordError } from "../utils/validator";
import { persistentLogger } from "../utils/persistentLogger";

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, state } = useAuth();

  persistentLogger.log("Login", "Component rendered");
  console.log("[Login Page] Component rendered");
  console.log("[Login Page] login function type:", typeof login);
  console.log("[Login Page] state:", state);

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

  // Show error from auth state
  useEffect(() => {
    if (state.error) {
      setDisplayError(state.error);
      console.log("[Login] Error from state:", state.error);
    }
  }, [state.error]);

  // Redirect if already authenticated
  useEffect(() => {
    if (state.isAuthenticated) {
      console.log("[Login] User already authenticated, redirecting to dashboard");
      navigate("/dashboard", { replace: true });
    }
  }, [state.isAuthenticated, navigate]);

  // Add window-level error logging
  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[Global Error]", event.error);
    };
    window.addEventListener("error", handleError);

    // Test backend connectivity on component mount
    console.log("[Login Page] Testing backend connectivity...");
    fetch("http://localhost:5000/health")
      .then((res) => {
        console.log("[Login Page] Backend health check status:", res.status);
        return res.json();
      })
      .then((data) => console.log("[Login Page] Backend health response:", data))
      .catch((err) => console.error("[Login Page] Backend health check failed:", err));

    return () => window.removeEventListener("error", handleError);
  }, []);

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
    setDisplayError(null); // Clear previous errors

    persistentLogger.log("Login", "Form submitted", { email: formData.email });
    console.log("[Login] Form submitted", { email: formData.email, password: "***" });
    console.log("[Login] Login function exists:", typeof login);

    const isValid = validateForm();
    persistentLogger.log("Login", "Form validation result:", { isValid, errors });
    console.log("[Login] Form validation result:", isValid);
    console.log("[Login] Validation errors:", errors);

    if (!isValid) {
      persistentLogger.log("Login", "Form validation failed, returning early");
      console.log("[Login] Form validation failed, returning early");
      return;
    }

    try {
      persistentLogger.log("Login", "Calling login() with:", { email: formData.email });
      console.log("[Login] Calling login() with:", { email: formData.email });
      await login(formData.email, formData.password);
      persistentLogger.log("Login", "Login successful, navigating to /verify-otp");
      console.log("[Login] Login successful, navigating to /verify-otp");
      navigate("/verify-otp");
    } catch (error: any) {
      persistentLogger.error("Login", "Login error:", error);
      console.error("[Login] Login error:", error);
      console.error("[Login] Error message:", error.message);
      console.error("[Login] Error details:", error);

      if (error.response?.status === 423) {
        const lockUntil = new Date(error.response.data.lockUntil);
        const timeStr = lockUntil.toLocaleTimeString();
        setDisplayError(`Account locked until ${timeStr}. Please try again later.`);
      } else {
        // Error is already set in state by useAuth hook, but we can set it here too for immediate feedback
        setDisplayError(error.message || "Login failed");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
        <LogoHeader hospitalName="Hospital Management" subtitle="Secure Admin Portal" />

        {displayError && <ErrorMessage message={displayError} type="error" onClose={() => setDisplayError(null)} />}

        <form
          onSubmit={(e) => {
            console.log("[DEBUG] Form onSubmit event fired!");
            handleSubmit(e);
          }}
          className="space-y-5 mt-6"
          onSubmitCapture={(e) => {
            console.log("[Form] onSubmitCapture fired (capture phase)");
          }}
          onClick={() => {
            console.log("[Form] Form area clicked");
          }}
        >
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

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Demo credentials: <br />
            <code className="bg-gray-100 px-2 py-1 rounded">admin@citymedical.com</code>
            <br />
            <code className="bg-gray-100 px-2 py-1 rounded">Password123</code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
