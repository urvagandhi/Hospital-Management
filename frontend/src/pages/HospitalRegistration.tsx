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
// OtpInput removed — registration no longer requires TOTP verification
import { TextInput } from "../components/TextInput";
import api from "../services/api";
import { getEmailError } from "../utils/validator";

export const HospitalRegistration: React.FC = () => {
  const navigate = useNavigate();

  // Step 1: Registration Details
  // Step 2: Success
  const [step, setStep] = useState<1 | 2>(1);

  const [formData, setFormData] = useState({
    hospitalName: "",
    email: "",
    phoneNumber: "",
    address: "",
  });

  const [errors, setErrors] = useState({
    hospitalName: "",
    email: "",
    phoneNumber: "",
    address: "",
    logo: "",
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Success Data (for Step 2)
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [invitationSent, setInvitationSent] = useState<boolean>(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>("");

  const [submitted, setSubmitted] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Step 1 Handlers ---

  const validateForm = (): boolean => {
    const newErrors = {
      hospitalName: !formData.hospitalName ? "Hospital name is required" : "",
      email: getEmailError(formData.email) || "",
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

    if (submitted) {
      let error = "";
      switch (field) {
        case "hospitalName":
          error = !value ? "Hospital name is required" : "";
          break;
        case "email":
          error = getEmailError(value) || "";
          break;
        case "phoneNumber":
          error = !value ? "Phone number is required" : !/^[0-9]{10}$/.test(value) ? "Phone number must be 10 digits" : "";
          break;
        case "address":
          error = !value ? "Address is required" : "";
          break;
        default:
          error = "";
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
      formDataToSend.append("phoneNumber", formData.phoneNumber);
      formDataToSend.append("address", formData.address);
      if (logoFile) formDataToSend.append("logo", logoFile);

      const response = await api.post("/auth/register-hospital", formDataToSend, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = (response.data as any)?.data || response.data;

      // Store email status and hospital email
      setInvitationSent(data.invitationSent || false);
      setRegisteredEmail(formData.email);

      // Backend now creates hospital immediately (admin registration).
      // If backend returns backupCodes (unlikely now), store them
      if (data.backupCodes) setBackupCodes(data.backupCodes || []);
      setStep(2);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Registration failed";
      setDisplayError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // No TOTP verification step – registration completes immediately.

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

      <Button label={loading ? "Processing..." : "Register Hospital"} type="submit" variant="primary" size="lg" fullWidth disabled={loading} loading={loading} />
    </form>
  );

  // removed TOTP setup UI

  const renderStep3 = () => (
    <div className="space-y-6 mt-6 animate-fadeIn">
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-green-800">Registration Complete</h3>
        <p className="text-green-700 mt-2">Hospital has been successfully registered.</p>
      </div>

      {/* Email Invitation Status */}
      {invitationSent ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 mb-1">Invitation Email Sent</h4>
              <p className="text-sm text-blue-800">
                A temporary password has been sent to <strong>{registeredEmail}</strong>. The hospital admin can use it to sign in and will be prompted to change the password on
                first login.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-yellow-900 mb-1">Email Delivery Failed</h4>
              <p className="text-sm text-yellow-800">
                Hospital registered successfully, but the invitation email could not be sent. Please manually share the temporary password with <strong>{registeredEmail}</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {backupCodes.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
          <h4 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
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
      )}

      <Button label="Back to Hospitals" onClick={() => navigate("/hospitals")} variant="primary" size="lg" fullWidth />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 pt-16">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
          <LogoHeader hospitalName="Hospital Registration" subtitle={step === 1 ? "Register your hospital" : "Registration Complete"} />

          {displayError && <ErrorMessage message={displayError} type="error" onClose={() => setDisplayError(null)} />}

          {step === 1 && renderStep1()}
          {step === 2 && renderStep3()}

          {/* Removed public sign-in prompt; registration is admin-driven */}
        </div>
      </div>
    </div>
  );
};

export default HospitalRegistration;
