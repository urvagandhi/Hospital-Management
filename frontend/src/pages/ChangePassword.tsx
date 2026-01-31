import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { TextInput } from "../components/TextInput";
import api from "../services/api";

const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) return setError("Password must be at least 6 characters");
    if (newPassword !== confirm) return setError("Passwords do not match");

    setLoading(true);
    try {
      const tempToken = localStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post("/auth/change-password", { newPassword }, config);
      // Save hospital data returned from server
      const hospital = response.data?.data?.hospital;
      if (hospital) localStorage.setItem("hospital", JSON.stringify(hospital));

      // Store tokens if returned (access/refresh)
      const accessToken = response.data?.data?.accessToken;
      const refreshToken = response.data?.data?.refreshToken;
      if (accessToken || refreshToken) {
        localStorage.setItem("accessToken", accessToken || "");
        localStorage.setItem("refreshToken", refreshToken || "");
      }

      // Clear temp token
      localStorage.removeItem("tempToken");

      // If backend requires TOTP setup, navigate there; otherwise dashboard
      if (response.data?.requireTotpSetup) {
        navigate(`/setup-2fa?email=${encodeURIComponent(hospital?.email || "")}`);
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to change password");
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
          <Button label={loading ? "Updating..." : "Change Password"} type="submit" variant="primary" fullWidth loading={loading} />
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
