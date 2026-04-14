/**
 * Hospital Registration Page
 * Admin-only hospital registration form
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import { Navbar } from "../components/Navbar";
import api from "../services/api";
import { getEmailError } from "../utils/validator";

export const HospitalRegistration: React.FC = () => {
  const navigate = useNavigate();

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

  const [invitationSent, setInvitationSent] = useState<boolean>(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>("");

  const [submitted, setSubmitted] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateForm = (): boolean => {
    const phoneDigits = formData.phoneNumber.replace(/[^\d]/g, "");
    const newErrors = {
      hospitalName: !formData.hospitalName ? "Hospital name is required" : "",
      email: getEmailError(formData.email) || "",
      phoneNumber: !formData.phoneNumber ? "Phone number is required" : phoneDigits.length !== 10 ? "Phone number must be 10 digits" : "",
      address: "", // address is optional
      logo: "",    // logo is optional
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
        case "phoneNumber": {
          const digits = value.replace(/[^\d]/g, "");
          error = !value ? "Phone number is required" : digits.length !== 10 ? "Phone number must be 10 digits" : "";
          break;
        }
        case "address":
          error = ""; // optional
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
      formDataToSend.append("phoneNumber", formData.phoneNumber.replace(/[^\d]/g, ""));
      formDataToSend.append("address", formData.address);
      formDataToSend.append("tcAccepted", "true");
      formDataToSend.append("tcVersion", "1.0");
      if (logoFile) formDataToSend.append("logo", logoFile);

      const response = await api.post("/auth/register-hospital", formDataToSend, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = (response.data as any)?.data || response.data;

      setInvitationSent(data.invitationSent || false);
      setRegisteredEmail(formData.email);


      setStep(2);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Registration failed";
      setDisplayError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm transition-all duration-200 focus:outline-none focus:bg-white ${
      hasError
        ? "border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
        : "border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
    }`;

  const renderStep1 = () => (
    <form onSubmit={handleInitialSubmit} className="space-y-6">
      {/* Two-column layout: Logo on left, identity fields on right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column - Logo */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Logo <span className="text-gray-400 normal-case font-normal text-xs">(optional)</span>
          </h3>
          {logoPreview ? (
            <div className="flex flex-col items-center p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-blue-200 shadow-sm mb-3">
                <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
              </div>
              <p className="text-xs text-gray-500 mb-2 truncate max-w-full">{logoFile?.name}</p>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Change
                <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
              </label>
            </div>
          ) : (
            <label className="group flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200 h-full min-h-[180px]">
              <div className="w-14 h-14 rounded-xl bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                <svg className="w-7 h-7 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors">Upload logo</span>
              <span className="text-xs text-gray-400 mt-1">PNG, JPG, GIF up to 2MB</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
            </label>
          )}
          {errors.logo && <p className="text-red-500 text-xs mt-1.5">{errors.logo}</p>}
        </div>

        {/* Right column - Name*/}
        <div className="lg:col-span-3 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Hospital Identity</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Hospital Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Apollo Care Institute"
              value={formData.hospitalName}
              onChange={(e) => handleChange("hospitalName", e.target.value)}
              className={inputClass(!!errors.hospitalName)}
              autoFocus
            />
            {errors.hospitalName && <p className="text-red-500 text-xs mt-1">{errors.hospitalName}</p>}
          </div>

        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* Contact Information - full width grid */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              placeholder="hospital@example.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className={inputClass(!!errors.email)}
              autoComplete="email"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 bg-gray-100 text-gray-500 text-sm font-medium select-none">
                +91
              </span>
              <input
                type="tel"
                placeholder="9876543210"
                value={formData.phoneNumber}
                onChange={(e) => handleChange("phoneNumber", e.target.value.replace(/[^\d]/g, ""))}
                className={`${inputClass(!!errors.phoneNumber)} rounded-l-none`}
                maxLength={10}
                autoComplete="tel"
              />
            </div>
            {errors.phoneNumber && <p className="text-red-500 text-xs mt-1">{errors.phoneNumber}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Address <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Full hospital address"
              value={formData.address}
              onChange={(e) => handleChange("address", e.target.value)}
              className={inputClass(!!errors.address)}
              autoComplete="street-address"
            />
            {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="flex items-start gap-2.5 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-700">
          A temporary password will be generated and emailed to the hospital. They will be asked to change it on first login and set up two-factor authentication.
        </p>
      </div>

      {/* T&C */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-gray-700">
          I confirm the hospital accepts our{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Terms &amp; Conditions
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Privacy Policy
          </a>.
        </span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !termsAccepted}
        className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-blue-500/40 active:scale-[0.99] flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Registering...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Register Hospital
          </>
        )}
      </button>
    </form>
  );

  const renderSuccess = () => (
    <div className="space-y-6">
      {/* Two-column success layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left - Success visual */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center py-8 bg-emerald-50/50 rounded-2xl border border-emerald-100">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900">All Done!</h3>
          <p className="text-sm text-gray-500 mt-1 text-center px-4">Hospital has been successfully registered</p>
        </div>

        {/* Right - Status details */}
        <div className="lg:col-span-3 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">What's Next</h3>

          {/* Email Status */}
          {invitationSent ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900">Invitation Email Sent</h4>
                  <p className="text-xs text-blue-700 mt-0.5">
                    A temporary password has been sent to <span className="font-medium">{registeredEmail}</span>. The hospital will be prompted to change it on first login.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-amber-900">Email Delivery Failed</h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Hospital registered but the invitation email could not be sent. Please manually share the credentials with <span className="font-medium">{registeredEmail}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Steps the hospital will go through */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Hospital onboarding steps</h4>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-[10px]">1</span>
                Sign in with the temporary password
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-[10px]">2</span>
                Change password on first login
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-[10px]">3</span>
                Enter the 6-digit Auth Code (sent in the welcome email) to finish sign-in
              </div>
            </div>
          </div>
        </div>
      </div>



      <div className="flex gap-3">
        <button
          onClick={() => { setStep(1); setFormData({ hospitalName: "", email: "", phoneNumber: "", address: "" }); setLogoFile(null); setLogoPreview(null); setSubmitted(false); }}
          className="flex-1 py-3 px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Register Another
        </button>
        <button
          onClick={() => navigate("/hospitals")}
          className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-blue-500/40 active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Hospitals
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 pt-16">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 px-6 sm:px-8 py-6">
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
              </div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h1 className="text-xl font-bold text-white">
                    {step === 1 ? "Register Hospital" : "Registration Complete"}
                  </h1>
                </div>
                <p className="text-blue-100 text-sm ml-[52px]">
                  {step === 1 ? "Fill in the details to add a new hospital" : "Hospital has been successfully created"}
                </p>
              </div>

              {/* Progress indicator */}
              <div className="flex gap-2 mt-5 ml-[52px]">
                <div className="h-1 flex-1 rounded-full bg-white" />
                <div className={`h-1 flex-1 rounded-full transition-colors duration-500 ${step === 2 ? "bg-white" : "bg-white/30"}`} />
              </div>
            </div>

            {/* Body */}
            <div className="px-6 sm:px-8 py-6">
              {displayError && (
                <div className="mb-5">
                  <ErrorMessage message={displayError} type="error" onClose={() => setDisplayError(null)} />
                </div>
              )}

              {step === 1 && renderStep1()}
              {step === 2 && renderSuccess()}
            </div>
          </div>

          {/* Footer hint */}
          {step === 1 && (
            <p className="text-center text-xs text-gray-400 mt-4">
              Only system administrators can register new hospitals
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HospitalRegistration;
