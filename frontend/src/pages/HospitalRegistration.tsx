/**
 * Hospital Registration — admin-only, two-step flow.
 *
 * Step 1: capture hospital identity + contact details, optional logo.
 * Step 2: success screen confirming registration + onboarding guide.
 *
 * This route lives OUTSIDE MainLayout (see AppRoutes — only /register mounts
 * AdminRoute without MainLayout), so the page renders its own <Navbar />.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import { Navbar } from "../components/Navbar";
import Spinner from "../components/Spinner";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import api from "../services/api";
import { getEmailError } from "../utils/validator";

export const HospitalRegistration: React.FC = () => {
  useDocumentTitle("Register Hospital — MediVault");
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

  // ── Validation ───────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const phoneDigits = formData.phoneNumber.replace(/[^\d]/g, "");
    const newErrors = {
      hospitalName: !formData.hospitalName ? "Hospital name is required" : "",
      email: getEmailError(formData.email) || "",
      phoneNumber: !formData.phoneNumber
        ? "Phone number is required"
        : phoneDigits.length !== 10
          ? "Phone number must be 10 digits"
          : "",
      address: "",
      logo: "",
    };
    setErrors(newErrors);
    return Object.values(newErrors).every((e) => !e);
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
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
          error = !value
            ? "Phone number is required"
            : digits.length !== 10
              ? "Phone number must be 10 digits"
              : "";
          break;
        }
      }
      setErrors((p) => ({ ...p, [field]: error }));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow the same file to be re-picked after removing
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((p) => ({ ...p, logo: "Please select an image file" }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((p) => ({ ...p, logo: "Logo size must be less than 2MB" }));
      return;
    }
    setLogoFile(file);
    setErrors((p) => ({ ...p, logo: "" }));
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setDisplayError(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const body = new FormData();
      body.append("hospitalName", formData.hospitalName);
      body.append("email", formData.email);
      body.append("phoneNumber", formData.phoneNumber.replace(/[^\d]/g, ""));
      body.append("address", formData.address);
      body.append("tcAccepted", "true");
      body.append("tcVersion", "1.0");
      if (logoFile) body.append("logo", logoFile);

      const response = await api.post("/auth/register-hospital", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = (response.data as any)?.data || response.data;

      setInvitationSent(data.invitationSent || false);
      setRegisteredEmail(formData.email);
      setStep(2);
    } catch (err: any) {
      setDisplayError(
        err.response?.data?.message || err.message || "Registration failed",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Shared input styling ─────────────────────────────────────────────────

  const inputBase =
    "w-full px-4 py-2.5 bg-surface-white border rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 transition-all focus:outline-none focus:ring-4";
  const inputClass = (hasError: boolean) =>
    `${inputBase} ${hasError
      ? "border-danger focus:border-danger focus:ring-danger/10"
      : "border-neutral-200 focus:border-primary-400 focus:ring-primary-100"
    }`;

  // ── Step 1 ───────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <form onSubmit={handleInitialSubmit} className="space-y-6">
      {/* Logo + Hospital Identity grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Logo (left, span-2) */}
        <div className="lg:col-span-2">
          <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Logo{" "}
            <span className="text-neutral-400 normal-case font-medium text-xs">
              (optional)
            </span>
          </h3>
          {logoPreview ? (
            <div className="flex flex-col items-center p-5 bg-surface-bg rounded-2xl border border-neutral-200">
              <div className="w-28 h-28 rounded-2xl overflow-hidden ring-4 ring-white shadow-card mb-3 bg-primary-50">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-neutral-500 mb-3 truncate max-w-full">
                {logoFile?.name}
              </p>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-lg hover:bg-primary-100 transition-colors">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Change
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleLogoChange}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview(null);
                  }}
                  className="text-xs text-neutral-500 hover:text-danger transition-colors px-2 py-1"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="group flex flex-col items-center justify-center p-8 border-2 border-dashed border-neutral-200 rounded-2xl cursor-pointer hover:border-primary-300 hover:bg-primary-50/40 transition-all h-full min-h-[180px]">
              <div className="w-14 h-14 rounded-xl bg-neutral-100 group-hover:bg-primary-100 flex items-center justify-center mb-3 transition-colors">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-7 h-7 text-neutral-400 group-hover:text-primary-600 transition-colors"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-neutral-700 group-hover:text-primary-700 transition-colors">
                Upload logo
              </span>
              <span className="text-xs text-neutral-400 mt-1">
                PNG, JPG, GIF up to 2 MB
              </span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleLogoChange}
              />
            </label>
          )}
          {errors.logo && (
            <p className="text-xs text-danger mt-1.5">{errors.logo}</p>
          )}
        </div>

        {/* Identity (right, span-3) */}
        <div className="lg:col-span-3 space-y-4">
          <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Hospital Identity
          </h3>
          <div>
            <label
              htmlFor="hospitalName"
              className="block text-sm font-medium text-neutral-700 mb-1.5"
            >
              Hospital Name <span className="text-danger">*</span>
            </label>
            <input
              id="hospitalName"
              type="text"
              placeholder="e.g. Apollo Care Institute"
              value={formData.hospitalName}
              onChange={(e) => handleChange("hospitalName", e.target.value)}
              className={inputClass(!!errors.hospitalName)}
              autoFocus
            />
            {errors.hospitalName && (
              <p className="text-xs text-danger mt-1">{errors.hospitalName}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-100" />

      {/* Contact Information */}
      <div>
        <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-3">
          Contact Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-neutral-700 mb-1.5"
            >
              Email Address <span className="text-danger">*</span>
            </label>
            <input
              id="email"
              type="email"
              placeholder="hospital@example.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className={inputClass(!!errors.email)}
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-xs text-danger mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-neutral-700 mb-1.5"
            >
              Phone Number <span className="text-danger">*</span>
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-neutral-200 bg-surface-bg text-neutral-500 text-sm font-medium select-none">
                +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="9876543210"
                value={formData.phoneNumber}
                onChange={(e) =>
                  handleChange(
                    "phoneNumber",
                    e.target.value.replace(/[^\d]/g, "").slice(0, 10),
                  )
                }
                className={`${inputClass(!!errors.phoneNumber)} rounded-l-none`}
                maxLength={10}
                autoComplete="tel"
              />
            </div>
            {errors.phoneNumber && (
              <p className="text-xs text-danger mt-1">{errors.phoneNumber}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="address"
              className="block text-sm font-medium text-neutral-700 mb-1.5"
            >
              Address{" "}
              <span className="text-neutral-400 font-normal text-xs">
                (optional)
              </span>
            </label>
            <input
              id="address"
              type="text"
              placeholder="Full hospital address"
              value={formData.address}
              onChange={(e) => handleChange("address", e.target.value)}
              className={inputClass(false)}
              autoComplete="street-address"
            />
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2.5 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 text-primary-600 mt-0.5 shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p className="text-xs text-primary-700 leading-relaxed">
          A temporary password will be generated and emailed to the hospital.
          They'll be prompted to change it on first login and will use the
          6-digit Auth Code (also sent in the welcome email) on every sign-in.
        </p>
      </div>

      {/* Terms */}
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-neutral-700">
          I confirm the hospital accepts our{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-700 font-semibold hover:underline"
          >
            Terms &amp; Conditions
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-700 font-semibold hover:underline"
          >
            Privacy Policy
          </a>
          .
        </span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !termsAccepted}
        className="w-full py-3 px-4 bg-gradient-primary text-white text-sm font-semibold rounded-xl shadow-primary hover:shadow-card-hover hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-primary flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Spinner variant="heartbeat" size="sm" />
            <span>Registering…</span>
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Register Hospital
          </>
        )}
      </button>
    </form>
  );

  // ── Step 2 (success) ─────────────────────────────────────────────────────

  const renderSuccess = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 flex flex-col items-center justify-center py-8 bg-success/5 rounded-2xl border border-success/20">
          <div className="w-20 h-20 bg-success/15 rounded-full flex items-center justify-center mb-4">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-10 h-10 text-success"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="font-heading text-xl font-bold text-neutral-900">
            All Done!
          </h3>
          <p className="text-sm text-neutral-500 mt-1 text-center px-4">
            Hospital has been successfully registered
          </p>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
            What's Next
          </h3>

          {invitationSent ? (
            <div className="bg-primary-50 border border-primary-100 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center shrink-0 mt-0.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-primary-700">
                    Invitation Email Sent
                  </h4>
                  <p className="text-xs text-primary-700/80 mt-0.5 leading-relaxed break-all">
                    A temporary password has been sent to{" "}
                    <span className="font-semibold">{registeredEmail}</span>.
                    The hospital will be prompted to change it on first login.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-warning/20 text-warning flex items-center justify-center shrink-0 mt-0.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-warning">
                    Email Delivery Failed
                  </h4>
                  <p className="text-xs text-warning/80 mt-0.5 leading-relaxed break-all">
                    Hospital registered but the invitation email could not be
                    sent. Please manually share the credentials with{" "}
                    <span className="font-semibold">{registeredEmail}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-surface-bg border border-neutral-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-neutral-700 mb-3">
              Hospital onboarding steps
            </h4>
            <div className="space-y-2.5">
              {[
                "Sign in with the temporary password",
                "Change password on first login",
                "Enter the 6-digit Auth Code (sent in the welcome email) to finish sign-in",
              ].map((text, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 text-xs text-neutral-600"
                >
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => {
            setStep(1);
            setFormData({
              hospitalName: "",
              email: "",
              phoneNumber: "",
              address: "",
            });
            setLogoFile(null);
            setLogoPreview(null);
            setSubmitted(false);
            setTermsAccepted(false);
          }}
          className="flex-1 py-3 px-4 text-sm font-semibold text-neutral-700 bg-surface-bg border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors flex items-center justify-center gap-2"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Register Another
        </button>
        <button
          type="button"
          onClick={() => navigate("/hospitals")}
          className="flex-1 py-3 px-4 bg-gradient-primary text-white text-sm font-semibold rounded-xl shadow-primary hover:shadow-card-hover transition-all flex items-center justify-center gap-2"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Hospitals
        </button>
      </div>
    </div>
  );

  // ── Page shell ───────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-surface-bg pt-16 overflow-hidden">
      <Navbar />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />

      <div className="relative flex items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl">
          <div className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden">
            {/* Gradient banner */}
            <div className="relative bg-gradient-primary px-6 sm:px-8 py-6 overflow-hidden">
              <div
                aria-hidden="true"
                className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10"
              />
              <div
                aria-hidden="true"
                className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-white/10"
              />
              <div className="relative">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white ring-1 ring-inset ring-white/20">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5"
                      aria-hidden="true"
                    >
                      <path d="M3 21h18" />
                      <path d="M5 21V7l7-4 7 4v14" />
                      <path d="M9 9h6" />
                      <path d="M9 13h6" />
                      <path d="M9 17h6" />
                    </svg>
                  </div>
                  <h1 className="font-heading text-xl font-bold text-white tracking-tight">
                    {step === 1 ? "Register Hospital" : "Registration Complete"}
                  </h1>
                </div>
                <p className="text-white/80 text-sm ml-[52px]">
                  {step === 1
                    ? "Fill in the details to add a new hospital"
                    : "Hospital has been successfully created"}
                </p>

                {/* Progress bars */}
                <div className="flex gap-2 mt-5 ml-[52px]">
                  <div className="h-1 flex-1 rounded-full bg-white" />
                  <div
                    className={`h-1 flex-1 rounded-full transition-colors duration-500 ${step === 2 ? "bg-white" : "bg-white/30"
                      }`}
                  />
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 sm:px-8 py-6">
              {displayError && (
                <div className="mb-5">
                  <ErrorMessage
                    message={displayError}
                    type="error"
                    onClose={() => setDisplayError(null)}
                  />
                </div>
              )}

              {step === 1 ? renderStep1() : renderSuccess()}
            </div>
          </div>

          {step === 1 && (
            <p className="text-center text-xs text-neutral-500 mt-4">
              Only system administrators can register new hospitals from webite.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HospitalRegistration;
