/**
 * Mandatory TOTP Setup Page
 * For new users after registration - must complete before first login
 */

import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { LogoHeader } from "../components/LogoHeader";
import { OtpInput } from "../components/OtpInput";
import authService from "../services/authService";

import { useAuth } from "../hooks/useAuth";

export const TotpSetupMandatory: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { refreshUser } = useAuth();

    const [step, setStep] = useState<"qr" | "verify" | "backup">("qr");
    const [qrCode, setQrCode] = useState<string>("");
    const [secret, setSecret] = useState<string>("");
    const [token, setToken] = useState("");
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const hasFetchedRef = React.useRef(false);

    const hospitalName = searchParams.get("hospital") || "Hospital";
    const email = searchParams.get("email") || "";

    // Fetch TOTP setup on mount
    useEffect(() => {
        const fetchTotpSetup = async () => {
            // Prevent double-call in Strict Mode
            if (hasFetchedRef.current) return;
            hasFetchedRef.current = true;

            try {
                const response = await authService.setupTotp();
                setQrCode(response.data.qrCode);
                setSecret(response.data.secret);
            } catch (err: any) {
                setError(err.message || "Failed to setup 2FA. Please try logging in first.");
            } finally {
                setInitialLoading(false);
            }
        };

        // Check if user has a temp token (just registered) or access token (logged in)
        const tempToken = localStorage.getItem("tempToken");
        const accessToken = localStorage.getItem("accessToken");

        if (!tempToken && !accessToken) {
            // No auth - redirect to login
            navigate("/login");
            return;
        }

        fetchTotpSetup();
    }, [navigate]);

    // Verify TOTP code
    const handleVerify = async () => {
        if (token.length !== 6) {
            setError("Please enter a 6-digit code");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const response = await authService.verifyTotpSetup(token);
            setBackupCodes(response.data.backupCodes);
            setStep("backup");
        } catch (err: any) {
            setError(err.message || "Invalid code. Please try again.");
            setToken("");
        } finally {
            setLoading(false);
        }
    };

    // Copy backup codes
    const handleCopyBackupCodes = () => {
        const codesText = backupCodes.join("\n");
        navigator.clipboard.writeText(codesText);
        alert("Backup codes copied to clipboard!");
    };

    // Complete setup
    const handleComplete = async () => {
        try {
            setLoading(true);
            // 1. Clear temp token (setup is done)
            localStorage.removeItem("tempToken");

            // 2. Refresh session to get updated hospital object (with totpEnabled: true)
            await refreshUser();

            // 3. Navigate directly to dashboard
            console.log("Setup complete, redirecting to dashboard...");
            navigate("/dashboard", { replace: true });
        } catch (error) {
            console.error("Failed to refresh session after setup:", error);
            // Fallback to login if refresh fails
            navigate("/login");
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Setting up 2FA...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-6">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fadeIn">
                <LogoHeader
                    hospitalName={hospitalName}
                    subtitle="Setup Two-Factor Authentication"
                />

                {/* Progress indicator */}
                <div className="flex justify-center mb-6">
                    <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === "qr" ? "bg-blue-600 text-white" : "bg-green-500 text-white"
                            }`}>
                            {step === "qr" ? "1" : "✓"}
                        </div>
                        <div className={`w-8 h-1 ${step !== "qr" ? "bg-green-500" : "bg-gray-300"}`}></div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === "verify" ? "bg-blue-600 text-white" : step === "backup" ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"
                            }`}>
                            {step === "backup" ? "✓" : "2"}
                        </div>
                        <div className={`w-8 h-1 ${step === "backup" ? "bg-green-500" : "bg-gray-300"}`}></div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === "backup" ? "bg-blue-600 text-white" : "bg-gray-300 text-gray-600"
                            }`}>
                            3
                        </div>
                    </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800">
                    <p className="font-semibold mb-1">🔐 Mandatory Security Setup</p>
                    <p>
                        Two-factor authentication is required before you can access your account.
                    </p>
                </div>

                {error && (
                    <ErrorMessage message={error} type="error" onClose={() => setError("")} />
                )}

                {/* Step 1: QR Code */}
                {step === "qr" && (
                    <div className="space-y-4">
                        <p className="text-gray-600 text-sm text-center">
                            Scan this QR code with your authenticator app<br />
                            (Google Authenticator, Authy, Microsoft Authenticator)
                        </p>

                        <div className="flex justify-center">
                            <img
                                src={qrCode}
                                alt="TOTP QR Code"
                                className="w-48 h-48 border rounded-lg"
                            />
                        </div>

                        <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs text-gray-500 mb-1">Can't scan? Enter manually:</p>
                            <code className="text-sm font-mono text-gray-800 break-all">{secret}</code>
                        </div>

                        <Button
                            label="I've scanned the code →"
                            onClick={() => setStep("verify")}
                            variant="primary"
                            size="lg"
                            fullWidth
                        />
                    </div>
                )}

                {/* Step 2: Verify */}
                {step === "verify" && (
                    <div className="space-y-4">
                        <p className="text-gray-600 text-sm text-center">
                            Enter the 6-digit code from your authenticator app
                        </p>

                        <div className="flex justify-center">
                            <OtpInput
                                length={6}
                                value={token}
                                onChange={setToken}
                                disabled={loading}
                            />
                        </div>

                        <Button
                            label={loading ? "Verifying..." : "Verify & Continue"}
                            onClick={handleVerify}
                            variant="primary"
                            size="lg"
                            fullWidth
                            disabled={loading || token.length !== 6}
                            loading={loading}
                        />

                        <Button
                            label="← Back to QR"
                            onClick={() => setStep("qr")}
                            variant="ghost"
                            size="sm"
                            fullWidth
                        />
                    </div>
                )}

                {/* Step 3: Backup Codes */}
                {step === "backup" && (
                    <div className="space-y-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <p className="text-green-800 font-medium mb-2">✓ 2FA Enabled!</p>
                            <p className="text-sm text-green-700">
                                Save these backup codes securely. You'll need them if you lose access to your authenticator.
                            </p>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="grid grid-cols-2 gap-2">
                                {backupCodes.map((code, index) => (
                                    <code
                                        key={index}
                                        className="text-sm font-mono text-gray-800 bg-white px-2 py-1 rounded border text-center"
                                    >
                                        {code}
                                    </code>
                                ))}
                            </div>
                        </div>

                        <p className="text-xs text-red-600 font-medium text-center">
                            ⚠️ These codes will only be shown once!
                        </p>

                        <div className="flex gap-2">
                            <Button
                                label="📋 Copy"
                                onClick={handleCopyBackupCodes}
                                variant="secondary"
                                size="md"
                                fullWidth
                            />
                            <Button
                                label="Complete Setup →"
                                onClick={handleComplete}
                                variant="primary"
                                size="md"
                                fullWidth
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TotpSetupMandatory;
