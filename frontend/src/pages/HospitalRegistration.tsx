/**
 * Hospital Registration Page
 * New hospital registration form
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { Navbar } from "../components/Navbar";
import { TextInput } from "../components/TextInput";
import { API_URL } from "../config/constants";
import { getEmailError, getPasswordError } from "../utils/validator";

export const HospitalRegistration: React.FC = () => {
  const navigate = useNavigate();

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
  const [submitted, setSubmitted] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [displaySuccess, setDisplaySuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDisplayError(null);
    setDisplaySuccess(null);

    if (submitted) {
      // Validate field on change after submission
      let error = "";
      switch (field) {
        case "hospitalName":
          error = !value ? "Hospital name is required" : "";
          break;
        case "email":
          error = getEmailError(value) || "";
          break;
        case "password":
          error = getPasswordError(value) || "";
          break;
        case "confirmPassword":
          error = value !== formData.password ? "Passwords do not match" : "";
          break;
        case "phoneNumber":
          error = !value ? "Phone number is required" : !/^[0-9]{10}$/.test(value) ? "Phone number must be 10 digits" : "";
          break;
        case "address":
          error = !value ? "Address is required" : "";
          break;
      }
      setErrors((prev) => ({ ...prev, [field]: error }));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setErrors((prev) => ({ ...prev, logo: "Please select an image file" }));
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, logo: "Logo size must be less than 2MB" }));
        return;
      }

      setLogoFile(file);
      setErrors((prev) => ({ ...prev, logo: "" }));

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setDisplayError(null);
    setDisplaySuccess(null);

    const isValid = validateForm();

    if (!isValid) {
      return;
    }

    setLoading(true);

    try {
      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append("hospitalName", formData.hospitalName);
      formDataToSend.append("email", formData.email);
      formDataToSend.append("password", formData.password);
      formDataToSend.append("phoneNumber", formData.phoneNumber);
      formDataToSend.append("address", formData.address);
      if (logoFile) {
        formDataToSend.append("logo", logoFile);
      }

      const response = await fetch(`${API_URL}/api/auth/register-hospital`, {
        method: "POST",
        body: formDataToSend,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      setDisplaySuccess("Hospital registered successfully! Redirecting to hospitals list...");

      // Redirect to hospitals list after 2 seconds
      setTimeout(() => {
        navigate("/hospitals");
      }, 2000);
    } catch (error: any) {
      setDisplayError(error.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
          <LogoHeader hospitalName="Hospital Registration" subtitle="Register your hospital for secure patient record management" />

          {displayError && <ErrorMessage message={displayError} type="error" onClose={() => setDisplayError(null)} />}

          {displaySuccess && <ErrorMessage message={displaySuccess} type="success" onClose={() => setDisplaySuccess(null)} />}

          <form onSubmit={handleSubmit} className="space-y-5 mt-6">
            <TextInput
              label="Hospital Name"
              type="text"
              placeholder="Enter hospital name"
              value={formData.hospitalName}
              onChange={(value) => handleChange("hospitalName", value)}
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
              onChange={(value) => handleChange("email", value)}
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
                onChange={(value) => handleChange("password", value)}
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
                onChange={(value) => handleChange("confirmPassword", value)}
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
              onChange={(value) => handleChange("phoneNumber", value)}
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
              onChange={(value) => handleChange("address", value)}
              error={errors.address}
              autoComplete="street-address"
              required
              icon={
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              }
            />

            <Button label={loading ? "Registering..." : "Register Hospital"} type="submit" variant="primary" size="lg" fullWidth disabled={loading} loading={loading} />
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <button type="button" onClick={() => navigate("/login")} className="text-blue-600 hover:text-blue-700 font-medium focus:outline-none focus:underline">
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HospitalRegistration;
