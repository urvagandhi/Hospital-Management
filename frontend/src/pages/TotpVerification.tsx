/**
 * TOTP Verification Page
 * For users with 2FA enabled during login
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { OtpInput } from "../components/OtpInput";
import { useAuth } from "../hooks/useAuth";

export const TotpVerification: React.FC = () => {
    const navigate = useNavigate();
    const { state, verifyTotpLogin, verifyRecoveryLogin } = useAuth(); // Destructure new methods

    const [token, setToken] = useState("");
    const [recoveryCode, setRecoveryCode] = useState("");
    const [error, setError] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);
    const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

    // Redirect if no tempToken (not coming from login)
    useEffect(() => {
        const tempToken = localStorage.getItem("tempToken");
        if (!tempToken) {
            navigate("/login");
        }
    }, [navigate]);

    // Auto-verify when TOTP is complete
    useEffect(() => {
        if (token.length === 6 && !isVerifying && !showRecovery) {
            handleVerify();
        }
    }, [token]);

    const handleVerify = async () => {
        if (token.length !== 6) {
            setError("Please enter a 6-digit code");
            return;
        }

        setIsVerifying(true);
        setError("");

        try {
            await verifyTotpLogin(token); // Use hook method
            navigate("/dashboard");
        } catch (err: any) {
            setError(err.message || "Invalid code. Please try again.");
            setToken("");

            // Check for attempts remaining (passed through from hook)
            if (err.response?.attemptsRemaining !== undefined) {
                setAttemptsRemaining(err.response.attemptsRemaining);
            }
        } finally {
            setIsVerifying(false);
        }
    };

    const handleRecoveryLogin = async () => {
        if (!recoveryCode.trim()) {
            setError("Please enter a backup code");
            return;
        }

        setIsVerifying(true);
        setError("");

        try {
            // Strip dashes before sending to backend
            const cleanCode = recoveryCode.replace(/-/g, "").trim();
            const data = await verifyRecoveryLogin(cleanCode); // Use hook method

            // Show warning if few codes remaining
            if (data.remainingBackupCodes <= 2) {
                alert(`Warning: You only have ${data.remainingBackupCodes} backup codes remaining. Consider regenerating them in Settings.`);
            }

            navigate("/dashboard");
        } catch (err: any) {
            setError(err.message || "Invalid backup code. Please try again.");
            setRecoveryCode("");
        } finally {
            setIsVerifying(false);
        }
    };

    const handleBackToLogin = () => {
        localStorage.removeItem("tempToken");
        navigate("/login");
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
                <LogoHeader
                    hospitalName={state.hospital?.hospitalName || "Hospital"}
                    subtitle="Two-Factor Authentication"
                />

                {!showRecovery ? (
                    <>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
                            <p className="font-semibold mb-1">Enter Authenticator Code</p>
                            <p>
                                Open your authenticator app and enter the 6-digit code
                            </p>
                        </div>

                        {error && (
                            <ErrorMessage message={error} type="error" onClose={() => setError("")} />
                        )}

                        {attemptsRemaining !== null && attemptsRemaining <= 2 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                                ⚠️ {attemptsRemaining} attempts remaining before lockout
                            </div>
                        )}

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleVerify();
                            }}
                            className="space-y-6 mt-6"
                        >
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-4">
                                    Enter 6-Digit Code
                                </label>
                                <OtpInput
                                    length={6}
                                    value={token}
                                    onChange={setToken}
                                    disabled={isVerifying}
                                    error={error && token.length === 6 ? error : ""}
                                />
                            </div>

                            <Button
                                label={isVerifying ? "Verifying..." : "Verify"}
                                type="submit"
                                variant="primary"
                                size="lg"
                                fullWidth
                                disabled={token.length !== 6 || isVerifying}
                                loading={isVerifying}
                            />
                        </form>

                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowRecovery(true)}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Lost access to authenticator? Use backup code
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800">
                            <p className="font-semibold mb-1">Recovery Login</p>
                            <p>
                                Enter one of your backup codes to login
                            </p>
                        </div>

                        {error && (
                            <ErrorMessage message={error} type="error" onClose={() => setError("")} />
                        )}

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleRecoveryLogin();
                            }}
                            className="space-y-6 mt-6"
                        >
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Backup Code
                                </label>
                                <input
                                    type="text"
                                    value={recoveryCode}
                                    onChange={(e) => {
                                        // 1. Remove non-alphanumeric chars
                                        let val = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

                                        // 2. Limit to 8 characters
                                        if (val.length > 8) val = val.substring(0, 8);

                                        // 3. Add hyphen after 4th char
                                        if (val.length > 4) {
                                            val = val.substring(0, 4) + "-" + val.substring(4);
                                        }

                                        setRecoveryCode(val);
                                    }}
                                    placeholder="XXXX-XXXX"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono text-lg tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    disabled={isVerifying}
                                />
                            </div>

                            <Button
                                label={isVerifying ? "Verifying..." : "Login with Backup Code"}
                                type="submit"
                                variant="primary"
                                size="lg"
                                fullWidth
                                disabled={!recoveryCode.trim() || isVerifying}
                                loading={isVerifying}
                            />
                        </form>

                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowRecovery(false);
                                    setRecoveryCode("");
                                    setError("");
                                }}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                ← Back to authenticator code
                            </button>
                        </div>
                    </>
                )}

                <div className="mt-4 text-center">
                    <Button
                        label="Back to Login"
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleBackToLogin}
                    />
                </div>
            </div>
        </div>
    );
};

export default TotpVerification;
