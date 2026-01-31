/**
 * Two-Factor Authentication Settings Component
 * Allows users to enable/disable TOTP 2FA
 */

import React, { useState } from "react";
import authService from "../services/authService";
import { Button } from "./Button";
import { ErrorMessage } from "./ErrorMessage";
import { OtpInput } from "./OtpInput";

interface TwoFactorSettingsProps {
    isEnabled?: boolean;
    onStatusChange?: (enabled: boolean) => void;
}

type SetupStep = "idle" | "qr" | "verify" | "backup" | "disable";

export const TwoFactorSettings: React.FC<TwoFactorSettingsProps> = ({
    isEnabled = false,
    onStatusChange,
}) => {
    const [step, setStep] = useState<SetupStep>("idle");
    const [qrCode, setQrCode] = useState<string>("");
    const [secret, setSecret] = useState<string>("");
    const [token, setToken] = useState<string>("");
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [totpEnabled, setTotpEnabled] = useState(isEnabled);

    // Start 2FA setup - get QR code
    const handleSetupStart = async () => {
        setLoading(true);
        setError("");
        try {
            const response = await authService.setupTotp();
            setQrCode(response.data.qrCode);
            setSecret(response.data.secret);
            setStep("qr");
        } catch (err: any) {
            setError(err.message || "Failed to setup 2FA");
        } finally {
            setLoading(false);
        }
    };

    // Verify first TOTP code
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
            setTotpEnabled(true);
            setStep("backup");
            onStatusChange?.(true);
        } catch (err: any) {
            setError(err.message || "Invalid code. Please try again.");
            setToken("");
        } finally {
            setLoading(false);
        }
    };

    // Start disable flow
    const handleDisableStart = () => {
        setStep("disable");
        setToken("");
        setError("");
    };

    // Confirm disable with TOTP code
    const handleDisableConfirm = async () => {
        if (token.length !== 6) {
            setError("Please enter a 6-digit code");
            return;
        }

        setLoading(true);
        setError("");
        try {
            await authService.disableTotp(token);
            setTotpEnabled(false);
            setStep("idle");
            onStatusChange?.(false);
        } catch (err: any) {
            setError(err.message || "Invalid code. Cannot disable 2FA.");
            setToken("");
        } finally {
            setLoading(false);
        }
    };

    // Copy backup codes to clipboard
    const handleCopyBackupCodes = () => {
        const codesText = backupCodes.join("\n");
        navigator.clipboard.writeText(codesText);
        alert("Backup codes copied to clipboard!");
    };

    // Done with backup codes
    const handleBackupDone = () => {
        setStep("idle");
        setBackupCodes([]);
        setQrCode("");
        setSecret("");
        setToken("");
    };

    // Cancel current operation
    const handleCancel = () => {
        setStep("idle");
        setQrCode("");
        setSecret("");
        setToken("");
        setError("");
    };

    // If 2FA is enabled and we are in idle state, show nothing (Reset is handled by parent, and Disable is not allowed)
    if (totpEnabled && step === "idle") {
        return null;
    }

    return (
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">Two-Factor Authentication</h2>
                <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${totpEnabled
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                        }`}
                >
                    {totpEnabled ? "Enabled" : "Disabled"}
                </span>
            </div>

            {error && (
                <ErrorMessage message={error} type="error" onClose={() => setError("")} />
            )}

            {/* Idle State - Show Enable Button only (Disable is removed as 2FA is mandatory) */}
            {step === "idle" && (
                <div className="space-y-4">
                    <p className="text-gray-600 text-sm">
                        {totpEnabled
                            ? "Your account is protected with two-factor authentication using an authenticator app."
                            : "Add an extra layer of security to your account by enabling two-factor authentication."}
                    </p>

                    {!totpEnabled && (
                        <Button
                            label={loading ? "Setting up..." : "Enable 2FA"}
                            onClick={handleSetupStart}
                            variant="primary"
                            size="lg"
                            fullWidth
                            disabled={loading}
                            loading={loading}
                        />
                    )}
                </div>
            )}

            {/* QR Code Step */}
            {step === "qr" && (
                <div className="space-y-4">
                    <p className="text-gray-600 text-sm">
                        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                    </p>

                    <div className="flex justify-center">
                        <img
                            src={qrCode}
                            alt="TOTP QR Code"
                            className="w-48 h-48 border rounded-lg"
                        />
                    </div>

                    <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">Can't scan? Enter this code manually:</p>
                        <code className="text-sm font-mono text-gray-800 break-all">{secret}</code>
                    </div>

                    <Button
                        label="I've scanned the code"
                        onClick={() => setStep("verify")}
                        variant="primary"
                        size="lg"
                        fullWidth
                    />

                    <Button
                        label="Cancel"
                        onClick={handleCancel}
                        variant="ghost"
                        size="sm"
                        fullWidth
                    />
                </div>
            )}

            {/* Verify Step */}
            {step === "verify" && (
                <div className="space-y-4">
                    <p className="text-gray-600 text-sm">
                        Enter the 6-digit code from your authenticator app to complete setup.
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
                        label={loading ? "Verifying..." : "Verify & Enable"}
                        onClick={handleVerify}
                        variant="primary"
                        size="lg"
                        fullWidth
                        disabled={loading || token.length !== 6}
                        loading={loading}
                    />

                    <Button
                        label="Back"
                        onClick={() => setStep("qr")}
                        variant="ghost"
                        size="sm"
                        fullWidth
                    />
                </div>
            )}

            {/* Backup Codes Step */}
            {step === "backup" && (
                <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-green-800 font-medium mb-2">✓ 2FA Enabled Successfully!</p>
                        <p className="text-sm text-green-700">
                            Save these backup codes in a secure place. You can use them to login if you lose access to your authenticator app.
                        </p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="grid grid-cols-2 gap-2">
                            {backupCodes.map((code, index) => (
                                <code
                                    key={index}
                                    className="text-sm font-mono text-gray-800 bg-white px-2 py-1 rounded border"
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
                            label="Copy Codes"
                            onClick={handleCopyBackupCodes}
                            variant="secondary"
                            size="md"
                            fullWidth
                        />
                        <Button
                            label="Done"
                            onClick={handleBackupDone}
                            variant="primary"
                            size="md"
                            fullWidth
                        />
                    </div>
                </div>
            )}

            {/* Disable Step */}
            {step === "disable" && (
                <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-yellow-800 font-medium mb-2">⚠️ Disable 2FA?</p>
                        <p className="text-sm text-yellow-700">
                            This will remove the extra security from your account. Enter your current authenticator code to confirm.
                        </p>
                    </div>

                    <div className="flex justify-center">
                        <OtpInput
                            length={6}
                            value={token}
                            onChange={setToken}
                            disabled={loading}
                        />
                    </div>

                    <Button
                        label={loading ? "Disabling..." : "Disable 2FA"}
                        onClick={handleDisableConfirm}
                        variant="primary"
                        size="lg"
                        fullWidth
                        disabled={loading || token.length !== 6}
                        loading={loading}
                    />

                    <Button
                        label="Cancel"
                        onClick={handleCancel}
                        variant="ghost"
                        size="sm"
                        fullWidth
                    />
                </div>
            )}
        </div>
    );
};

export default TwoFactorSettings;
