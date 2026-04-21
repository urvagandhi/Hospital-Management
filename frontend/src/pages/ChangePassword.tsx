import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { TextInput } from "../components/TextInput";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import api from "../services/api";
import authService from "../services/authService";

interface ChangePasswordResponse {
  success: boolean;
  message: string;
  data?: {
    accessToken?: string;
    refreshToken?: string;
    hospital?: {
      _id: string;
      hospitalName: string;
      email: string;
      logoUrl?: string;
    };
  };
}

const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  useDocumentTitle("Set New Password — Hospital Management");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (!/[A-Z]/.test(newPassword)) return setError("Must contain an uppercase letter");
    if (!/[a-z]/.test(newPassword)) return setError("Must contain a lowercase letter");
    if (!/[0-9]/.test(newPassword)) return setError("Must contain a number");
    if (!/[\W_]/.test(newPassword)) return setError("Must contain a special character");
    if (newPassword !== confirm) return setError("Passwords do not match");

    setLoading(true);
    try {
      const tempToken = sessionStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post<ChangePasswordResponse>("/auth/change-password", { newPassword }, config);
      const body = response.data;

      // Save hospital data returned from server
      if (body.data?.hospital) {
        localStorage.setItem("hospital", JSON.stringify(body.data.hospital));
      }

      // Store tokens if returned
      if (body.data?.accessToken) {
        authService.storeTokens(body.data.accessToken, body.data.refreshToken || "");
      }

      // Clear temp token — backend already issued a session via cookies
      sessionStorage.removeItem("tempToken");

      // Password changed → land on the dashboard (session was created by the backend)
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || error.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Change Your Password</h2>
        <p className="text-sm text-gray-600 mb-4">You must change your temporary password before continuing.</p>
        {error && <div className="bg-red-50 text-red-800 p-3 rounded mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextInput label="New Password" type="password" value={newPassword} onChange={setNewPassword} required />
          <TextInput label="Confirm Password" type="password" value={confirm} onChange={setConfirm} required />
          <ul className="text-xs text-gray-500 space-y-1 pl-5 list-disc">
            <li>At least 8 characters</li>
            <li>Uppercase + lowercase letters</li>
            <li>At least one number and one special character</li>
          </ul>
          <Button label={loading ? "Updating..." : "Change Password"} type="submit" variant="primary" fullWidth loading={loading} />
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
