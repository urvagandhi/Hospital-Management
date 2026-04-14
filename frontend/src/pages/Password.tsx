/**
 * Password — change password (its own page).
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { TextInput } from "../components/TextInput";
import { useAuth } from "../hooks/useAuth";
import authService from "../services/authService";

const validatePasswordPolicy = (pw: string): string | null => {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain a number";
  if (!/[\W_]/.test(pw)) return "Password must contain a special character";
  return null;
};

const Password: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuth();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!state.isAuthenticated && !state.loading) navigate("/login");
  }, [state.isAuthenticated, state.loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!currentPw) return setError("Current password is required");
    const pwErr = validatePasswordPolicy(newPw);
    if (pwErr) return setError(pwErr);
    if (newPw === currentPw) return setError("New password must be different");
    if (newPw !== confirmPw) return setError("Passwords do not match");

    setLoading(true);
    try {
      const response = await authService.changePasswordSettings(currentPw, newPw);
      setSuccess(response.message || "Password changed successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      setError(err?.message || "Password change failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <Button label="← Back to Dashboard" onClick={() => navigate("/dashboard")} variant="ghost" size="sm" />
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Password</h1>
          <p className="text-sm text-gray-500 mb-4">
            Change your password. All other signed-in devices will be signed out.
          </p>

          {error && <ErrorMessage message={error} type="error" onClose={() => setError(null)} />}
          {success && (
            <div className="mb-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">
              {success}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <TextInput label="Current Password" type="password" value={currentPw} onChange={setCurrentPw} required autoFocus />
            <TextInput label="New Password" type="password" value={newPw} onChange={setNewPw} required />
            <TextInput label="Confirm New Password" type="password" value={confirmPw} onChange={setConfirmPw} required />
            <ul className="text-xs text-gray-500 space-y-1 pl-5 list-disc">
              <li>At least 8 characters</li>
              <li>Uppercase + lowercase letters</li>
              <li>At least one number and one special character</li>
            </ul>
            <Button
              label={loading ? "Updating..." : "Change Password"}
              type="submit"
              variant="primary"
              disabled={loading}
              loading={loading}
            />
          </form>
        </div>
      </div>
    </div>
  );
};

export default Password;
