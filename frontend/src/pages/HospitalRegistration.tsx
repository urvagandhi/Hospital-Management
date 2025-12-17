/**
 * Hospital Registration Page
 * New hospital registration form with Mandatory TOTP Setup
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { Navbar } from "../components/Navbar";
import { OtpInput } from "../components/OtpInput";
import { TextInput } from "../components/TextInput";
import api from "../services/api";
import { getEmailError, getPasswordError } from "../utils/validator";

export const HospitalRegistration: React.FC = () => {
  const navigate = useNavigate();

  // Step 1: Registration Details
  // Step 2: TOTP Verification
  // Step 3: Success & Backup Codes
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [formData, setFormData] = useState({
    hospitalName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    address: "",
  });

  const [errors, setErrors] = useState({
    hospitalName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    address: "",
    logo: "",
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Registration Response Data (for Step 2)
  const [registrationData, setRegistrationData] = useState<{
    registrationToken: string;
    qrCode: string;
    secret: string;
    otpauthUrl: string;
  } | null>(null);

  // TOTP Input (for Step 2)
  const [totpCode, setTotpCode] = useState("");

  // Success Data (for Step 3)
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const [submitted, setSubmitted] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [displaySuccess, setDisplaySuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Step 1 Handlers ---

  const validateForm = (): boolean => {
    const newErrors = {
      hospitalName: !formData.hospitalName ? "Hospital name is required" : "",
      email: getEmailError(formData.email) || "",
      password: getPasswordError(formData.password) || "",
      confirmPassword: formData.password !== formData.confirmPassword ? "Passwords do not match" : "",
      phoneNumber: !formData.phoneNumber ? "Phone number is required" : !/^[0-9]{10}$/.test(formData.phoneNumber) ? "Phone number must be 10 digits" : "",
      address: !formData.address ? "Address is required" : "",
      logo: !logoFile ? "Hospital logo is required" : "",
    };

    setErrors(newErrors);
    return Object.values(newErrors).every((error) => !error);
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev: typeof formData) => ({ ...prev, [field]: value }));
    setDisplayError(null);
    setDisplaySuccess(null);

    if (submitted) {
      let error = "";
      switch (field) {
        case "hospitalName": error = !value ? "Hospital name is required" : ""; break;
        case "email": error = getEmailError(value) || ""; break;
        case "password": error = getPasswordError(value) || ""; break;
        case "confirmPassword": error = value !== formData.password ? "Passwords do not match" : ""; break;
        case "phoneNumber": error = !value ? "Phone number is required" : !/^[0-9]{10}$/.test(value) ? "Phone number must be 10 digits" : ""; break;
        case "address": error = !value ? "Address is required" : ""; break;
      }
      setErrors((prev: typeof errors) => ({ ...prev, [field]: error }));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setErrors((prev: typeof errors) => ({ ...prev, logo: "Please select an image file" }));
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setErrors((prev: typeof errors) => ({ ...prev, logo: "Logo size must be less than 2MB" }));
        return;
      }
      setLogoFile(file);
      setErrors((prev: typeof errors) => ({ ...prev, logo: "" }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setDisplayError(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("hospitalName", formData.hospitalName);
      formDataToSend.append("email", formData.email);
      formDataToSend.append("password", formData.password);
      formDataToSend.append("phoneNumber", formData.phoneNumber);
      formDataToSend.append("address", formData.address);
      if (logoFile) formDataToSend.append("logo", logoFile);

      const response = await api.post("/auth/register-hospital", formDataToSend, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = response.data?.data || response.data;

      // Save data for Step 2
      setRegistrationData({
        registrationToken: data.registrationToken,
        qrCode: data.qrCode,
        secret: data.secret,
        otpauthUrl: data.otpauthUrl,
      });

      // Move to Step 2
      setStep(2);
      setDisplaySuccess("Details accepted. Please complete 2FA setup.");

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Registration failed";
      setDisplayError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // --- Step 2 Handlers (Verify TOTP) ---

  const handleVerifyTotp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!totpCode || totpCode.length !== 6) return;
    if (!registrationData) {
      setDisplayError("Session expired. Please refresh and try again.");
      return;
    }

    setLoading(true);
    setDisplayError(null);

    try {
      const response = await api.post("/auth/verify-registration", {
        registrationToken: registrationData.registrationToken,
        totpCode,
      });

      const data = response.data?.data || response.data;

      // Store tokens
      if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
      if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);

      // Store backup codes to show
      setBackupCodes(data.backupCodes || []);

      // Move to Step 3 (Success)
      setStep(3);
      setDisplaySuccess("Registration complete!");

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Verification failed";
      setDisplayError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // --- Step 3 Handlers (Finish) ---

  const handleFinish = () => {
    navigate("/dashboard"); // Redirect to dashboard or login
  };

  // --- Renders ---

  const renderStep1 = () => (
    <form onSubmit={handleInitialSubmit} className="space-y-5 mt-6">
      <TextInput
        label="Hospital Name"
        type="text"
        placeholder="Enter hospital name"
        value={formData.hospitalName}
        onChange={(value: string) => handleChange("hospitalName", value)}
        error={errors.hospitalName}
        autoFocus
        required
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
        }
      />

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Hospital Logo <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-4">
          {logoPreview && (
            <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200 flex-shrink-0">
              <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1">
            <label className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
              <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.413V13H5.5z" />
                <path d="M9 13h2v5a1 1 0 11-2 0v-5z" />
              </svg>
              <span className="text-sm text-gray-600">{logoFile ? logoFile.name : "Choose logo image"}</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
            </label>
            <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 2MB</p>
          </div>
        </div>
        {errors.logo && <p className="text-red-500 text-sm mt-1">{errors.logo}</p>}
      </div>

      <TextInput
        label="Email Address"
        type="email"
        placeholder="hospital@example.com"
        value={formData.email}
        onChange={(value: string) => handleChange("email", value)}
        error={errors.email}
        autoComplete="email"
        required
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TextInput
          label="Password"
          type="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={(value: string) => handleChange("password", value)}
          error={errors.password}
          autoComplete="new-password"
          required
          icon={
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" />
            </svg>
          }
        />

        <TextInput
          label="Confirm Password"
          type="password"
          placeholder="••••••••"
          value={formData.confirmPassword}
          onChange={(value: string) => handleChange("confirmPassword", value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
          required
          icon={
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" />
            </svg>
          }
        />
      </div>

      <TextInput
        label="Phone Number"
        type="tel"
        placeholder="10-digit phone number"
        value={formData.phoneNumber}
        onChange={(value: string) => handleChange("phoneNumber", value)}
        error={errors.phoneNumber}
        autoComplete="tel"
        required
        maxLength={10}
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
        }
      />

      <TextInput
        label="Address"
        type="text"
        placeholder="Hospital address"
        value={formData.address}
        onChange={(value: string) => handleChange("address", value)}
        error={errors.address}
        autoComplete="street-address"
        required
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        }
      />

      <Button label={loading ? "Processing..." : "Next: Verify & Register"} type="submit" variant="primary" size="lg" fullWidth disabled={loading} loading={loading} />
    </form>
  );

  const renderStep2 = () => (
    <div className="space-y-6 mt-6 animate-fadeIn">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-semibold">Step 2 of 3: Secure your account</p>
        <p>Scan the QR code below with your Authenticator App (Google Authenticator, Authy, etc.).</p>
      </div>

      <div className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        {registrationData?.qrCode ? (
          <img src={registrationData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
        ) : (
          <div className="w-48 h-48 bg-gray-100 animate-pulse rounded"></div>
        )}
        <p className="mt-4 text-xs text-gray-500 font-mono bg-gray-100 px-3 py-1 rounded">
          {registrationData?.secret || "Loading secret..."}
        </p>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700 text-center">
          Enter 6-digit Code from Authenticator App
        </label>
        <div className="flex justify-center">
          <OtpInput
            length={6}
            value={totpCode}
            onChange={setTotpCode}
            disabled={loading}
          />
        </div>
      </div>

      <Button
        label={loading ? "Verifying..." : "Complete Registration"}
        onClick={() => handleVerifyTotp()}
        disabled={loading || totpCode.length !== 6}
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
      />

      <div className="text-center">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Back to Details
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 mt-6 animate-fadeIn">
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-green-800">Registration Successful!</h3>
        <p className="text-green-700 mt-2">Your hospital has been verified and registered.</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
        <h4 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Save your Backup Codes
        </h4>
        <p className="text-sm text-yellow-800 mb-4">
          If you lose access to your authenticator device, you can use these codes to log in.
          <strong> These will only be shown once.</strong>
        </p>

        <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded border border-yellow-100">
          {backupCodes.map((code, index) => (
            <div key={index} className="text-center font-mono text-xs py-1 bg-gray-50 rounded select-all border border-gray-100">
              {code}
            </div>
          ))}
        </div>
      </div>

      <Button
        label="Go to Dashboard"
        onClick={handleFinish}
        variant="primary"
        size="lg"
        fullWidth
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
          <LogoHeader hospitalName="Hospital Registration" subtitle={step === 1 ? "Register your hospital" : step === 2 ? "Setup 2FA Verification" : "Registration Complete"} />

          {displayError && <ErrorMessage message={displayError} type="error" onClose={() => setDisplayError(null)} />}
          {displaySuccess && <ErrorMessage message={displaySuccess} type="success" onClose={() => setDisplaySuccess(null)} />}

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}

          {step === 1 && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <button type="button" onClick={() => navigate("/login")} className="text-blue-600 hover:text-blue-700 font-medium focus:outline-none focus:underline">
                  Sign In
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HospitalRegistration;
