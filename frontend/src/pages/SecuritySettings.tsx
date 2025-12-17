/**
 * Security Settings Page
 * Two-Factor Authentication management for logged-in users
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { BackupCodesModal } from "../components/BackupCodesModal";
import { Button } from "../components/Button";
import { PasswordConfirmModal } from "../components/PasswordConfirmModal";
import { RotationSetupModal } from "../components/RotationSetupModal";
import { TwoFactorSettings } from "../components/TwoFactorSettings";
import { useAuth } from "../hooks/useAuth";
import authService from "../services/authService";

export const SecuritySettings: React.FC = () => {
    const navigate = useNavigate();
    const { state } = useAuth(); // Removed 'status' as it wasn't used/available

    // Redirect if not authenticated
    React.useEffect(() => {
        if (!state.isAuthenticated) {
            navigate("/login");
        }
    }, [state.isAuthenticated, navigate]);

    // Modals State
    const [showResetModal, setShowResetModal] = React.useState(false);
    const [showRotationModal, setShowRotationModal] = React.useState(false);
    const [showBackupModal, setShowBackupModal] = React.useState(false);

    // Data State
    const [resetLoading, setResetLoading] = React.useState(false);
    const [rotationData, setRotationData] = React.useState<{ qrCode: string; secret: string } | null>(null);
    const [newBackupCodes, setNewBackupCodes] = React.useState<string[]>([]);

    // Step 1: Password Confirmed -> Get Rotation QR
    const handleResetPasswordConfirmed = async (password: string) => {
        setResetLoading(true);
        try {
            // resetTotp returns { success, message, data: { qrCode, secret, ... } }
            const response = await authService.resetTotp(password);

            if (response.data && response.data.qrCode) {
                setRotationData({
                    qrCode: response.data.qrCode,
                    secret: response.data.secret
                });
                setShowResetModal(false);     // Close Password Modal
                setShowRotationModal(true);   // Open Rotation Modal
            } else {
                alert("Unexpected response from server: No QR code returned.");
            }

        } catch (error: any) {
            alert(error.message || "Failed to initiate rotation");
        } finally {
            setResetLoading(false);
        }
    };

    // Step 2: Rotation Verified -> Show Backup Codes
    const handleRotationSuccess = (backupCodes: string[]) => {
        setNewBackupCodes(backupCodes);
        setShowRotationModal(false);
        setShowBackupModal(true);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <Button
                        label="← Back to Dashboard"
                        onClick={() => navigate("/dashboard")}
                        variant="ghost"
                        size="sm"
                    />
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Security Settings</h1>
                    <p className="text-gray-600 mb-6">
                        Manage your account security settings
                    </p>

                    {/* Reset Option (only if logged in) */}
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                        <h4 className="font-semibold text-red-900 mb-1">Rotate 2FA Key / Lost Device?</h4>
                        <p className="text-sm text-red-700 mb-3">
                            If you lost your device or want to rotate your security key, click below.
                            You will need to verify with your password and set up a new authenticator immediately.
                        </p>
                        <Button
                            label="Reset / Rotate 2FA"
                            onClick={() => setShowResetModal(true)}
                            variant="danger"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            size="sm"
                        />
                    </div>
                </div>

                {/* Two-Factor Authentication Section (Hidden if enabled) */}
                <TwoFactorSettings
                    isEnabled={state.hospital?.totpEnabled}
                    onStatusChange={(enabled) => {
                        console.log("2FA status changed:", enabled);
                    }}
                />
            </div>

            {/* 1. Password Confirmation Modal */}
            <PasswordConfirmModal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                onConfirm={handleResetPasswordConfirmed}
                title="Verify Password"
                message="Please enter your password to initiate 2FA rotation."
                confirmLabel="Continue"
                loading={resetLoading}
            />

            {/* 2. Rotation Setup Modal (QR Code) */}
            <RotationSetupModal
                isOpen={showRotationModal}
                onClose={() => setShowRotationModal(false)}
                qrCode={rotationData?.qrCode || ""}
                secret={rotationData?.secret || ""}
                onSuccess={handleRotationSuccess}
            />

            {/* 3. Backup Codes Modal */}
            <BackupCodesModal
                isOpen={showBackupModal}
                onClose={() => setShowBackupModal(false)}
                backupCodes={newBackupCodes}
            />
        </div>
    );
};

export default SecuritySettings;
