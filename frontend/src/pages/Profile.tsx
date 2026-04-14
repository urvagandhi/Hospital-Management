/**
 * Profile Page
 *
 * Two flows:
 *   • Edit non-sensitive fields (hospitalName, address, logo) via PATCH /me
 *   • Edit sensitive fields (email, phone) via OTP modal:
 *       init → OTP to NEW email (for email change) or current email (phone)
 *       verify → commit
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { OtpInput } from "../components/OtpInput";
import { TextInput } from "../components/TextInput";
import { useAuth } from "../hooks/useAuth";
import { useScrollToHash } from "../hooks/useScrollToHash";
import {
  getCurrentHospital,
  patchProfile,
  initContactChange,
  verifyContactChange,
  Hospital,
} from "../services/hospitalService";

type ContactField = "email" | "phone";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();
  useScrollToHash();

  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile form state
  const [hospitalName, setHospitalName] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Contact-change modal
  const [contactModal, setContactModal] = useState<{
    open: boolean;
    field: ContactField;
    step: "enter" | "otp";
    newValue: string;
    otp: string;
  }>({ open: false, field: "email", step: "enter", newValue: "", otp: "" });
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Profile — Hospital Management";
  }, []);

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentHospital();
        setHospital(me);
        setHospitalName(me.hospitalName || "");
        setAddress(me.address || "");
      } catch (err: any) {
        setError(err?.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be smaller than 2MB");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!hospital) return;
    const fields: { hospitalName?: string; address?: string } = {};
    if (hospitalName.trim() !== hospital.hospitalName) fields.hospitalName = hospitalName.trim();
    if (address.trim() !== (hospital.address || "")) fields.address = address.trim();

    if (!Object.keys(fields).length && !logoFile) {
      setError("Nothing to update");
      return;
    }
    if (fields.hospitalName !== undefined && fields.hospitalName.length < 3) {
      setError("Hospital name must be at least 3 characters");
      return;
    }

    setSaving(true);
    try {
      const updated = await patchProfile(fields, logoFile);
      setHospital(updated);
      setLogoFile(null);
      setLogoPreview(null);
      setSuccess("Profile updated");
    } catch (err: any) {
      setError(err?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // ── Contact-change modal handlers ───────────────────────────────────────
  const openContactModal = (field: ContactField) => {
    setContactModal({ open: true, field, step: "enter", newValue: "", otp: "" });
    setModalError(null);
    setOtpMessage(null);
  };
  const closeContactModal = () => {
    setContactModal((m) => ({ ...m, open: false }));
  };

  const sendContactOtp = async () => {
    setModalError(null);
    const { field, newValue } = contactModal;
    const trimmed = newValue.trim();
    if (!trimmed) return setModalError(`Enter the new ${field}`);

    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return setModalError("Invalid email format");
    }
    if (field === "phone") {
      const digits = trimmed.replace(/[^\d]/g, "");
      if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith("91")))) {
        return setModalError("Phone number must be 10 digits");
      }
    }

    setModalLoading(true);
    try {
      const payload = field === "email" ? { newEmail: trimmed } : { newPhone: trimmed };
      const response = await initContactChange(payload);
      setOtpMessage(response.message);
      setContactModal((m) => ({ ...m, step: "otp" }));
    } catch (err: any) {
      setModalError(err?.message || "Failed to send OTP");
    } finally {
      setModalLoading(false);
    }
  };

  const verifyContactOtp = async () => {
    setModalError(null);
    if (contactModal.otp.length !== 6) return setModalError("Enter the 6-digit code");
    setModalLoading(true);
    try {
      const updated = await verifyContactChange(contactModal.otp);
      setHospital(updated);
      setSuccess(`${contactModal.field === "email" ? "Email" : "Phone number"} updated`);
      closeContactModal();
    } catch (err: any) {
      setModalError(err?.message || "Verification failed");
      setContactModal((m) => ({ ...m, otp: "" }));
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Button
            label="← Back to Dashboard"
            onClick={() => navigate("/dashboard")}
            variant="ghost"
            size="sm"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Profile</h1>
          <p className="text-gray-600 mb-6">Update your hospital's profile information.</p>

          {error && <ErrorMessage message={error} type="error" onClose={() => setError(null)} />}
          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">
              {success}
            </div>
          )}

          {/* ── Profile form ───────────────────────────────────────── */}
          <form onSubmit={saveProfile} className="space-y-5">
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
              <div className="flex items-center gap-4">
                <img
                  src={logoPreview || hospital?.logoUrl || "https://via.placeholder.com/80?text=Logo"}
                  alt="Logo"
                  className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                />
                <label className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 underline underline-offset-2">
                  Choose new logo
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                </label>
                {logoFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview(null);
                    }}
                    className="text-sm text-gray-500 hover:text-red-600 underline underline-offset-2"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">PNG / JPG / WebP, up to 2MB</p>
            </div>

            <TextInput
              label="Hospital Name"
              value={hospitalName}
              onChange={setHospitalName}
              required
            />
            <TextInput label="Address" value={address} onChange={setAddress} />

            <Button
              label={saving ? "Saving..." : "Save Changes"}
              type="submit"
              variant="primary"
              disabled={saving}
              loading={saving}
            />
          </form>
        </div>

        {/* ── Sensitive contact fields (OTP-gated) ───────────────────── */}
        <div id="contact-info" className="bg-white rounded-2xl shadow-xl p-6 scroll-mt-24">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Contact Information</h2>
          <p className="text-sm text-gray-500 mb-4">
            Changing your email or phone requires a one-time code for security.
          </p>

          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-xs text-gray-500 uppercase">Email</p>
                <p className="text-sm font-medium text-gray-800">{hospital?.email}</p>
              </div>
              <Button label="Change" variant="ghost" size="sm" onClick={() => openContactModal("email")} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-xs text-gray-500 uppercase">Phone</p>
                <p className="text-sm font-medium text-gray-800">{hospital?.phone}</p>
              </div>
              <Button label="Change" variant="ghost" size="sm" onClick={() => openContactModal("phone")} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact-change modal ───────────────────────────────────────── */}
      {contactModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md animate-fadeIn">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              Change {contactModal.field === "email" ? "Email" : "Phone Number"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Current: <span className="font-medium">{hospital?.[contactModal.field]}</span>
            </p>

            {modalError && (
              <ErrorMessage message={modalError} type="error" onClose={() => setModalError(null)} />
            )}

            {contactModal.step === "enter" && (
              <div className="space-y-4">
                <TextInput
                  label={`New ${contactModal.field}`}
                  type={contactModal.field === "email" ? "email" : "text"}
                  value={contactModal.newValue}
                  onChange={(v) => setContactModal((m) => ({ ...m, newValue: v }))}
                  autoFocus
                  required
                />
                <p className="text-xs text-gray-500">
                  {contactModal.field === "email"
                    ? "We'll email a verification code to the new address to confirm it."
                    : "We'll email a verification code to your current email (SMS to the new number is coming soon)."}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button label="Cancel" variant="ghost" onClick={closeContactModal} disabled={modalLoading} />
                  <Button
                    label={modalLoading ? "Sending..." : "Send Code"}
                    variant="primary"
                    onClick={sendContactOtp}
                    disabled={modalLoading}
                    loading={modalLoading}
                  />
                </div>
              </div>
            )}

            {contactModal.step === "otp" && (
              <div className="space-y-4">
                {otpMessage && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg p-3">
                    {otpMessage}
                  </div>
                )}
                <OtpInput
                  length={6}
                  value={contactModal.otp}
                  onChange={(v) => setContactModal((m) => ({ ...m, otp: v }))}
                  disabled={modalLoading}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button label="Cancel" variant="ghost" onClick={closeContactModal} disabled={modalLoading} />
                  <Button
                    label={modalLoading ? "Verifying..." : "Verify & Save"}
                    variant="primary"
                    onClick={verifyContactOtp}
                    disabled={modalLoading || contactModal.otp.length !== 6}
                    loading={modalLoading}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
