import React, { useState } from "react";
import authService from "../services/authService";
import { Button } from "./Button";
import { ErrorMessage } from "./ErrorMessage";
import { OtpInput } from "./OtpInput";

interface RotationSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    qrCode: string;
    secret: string;
    onSuccess: (backupCodes: string[]) => void;
}

export const RotationSetupModal: React.FC<RotationSetupModalProps> = ({
    isOpen,
    onClose,
    qrCode,
    secret,
    onSuccess,
}) => {
    const [token, setToken] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const handleVerify = async () => {
        if (token.length !== 6) return;
        setLoading(true);
        setError("");
        try {
            const response = await authService.verifyTotpReset(token);
            onSuccess(response.data.backupCodes);
        } catch (err: any) {
            setError(err.message || "Verification failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Set up New Authenticator</h3>

                {error && <ErrorMessage message={error} type="error" onClose={() => setError("")} />}

                <div className="space-y-4">
                    <p className="text-sm text-gray-600 text-center">
                        Scan this QR code with your new authenticator app.
                    </p>

                    <div className="flex justify-center">
                        <img src={qrCode} alt="QR Code" className="w-40 h-40 border rounded" />
                    </div>

                    <div className="bg-gray-50 p-2 rounded text-center">
                        <code className="text-xs font-mono break-all">{secret}</code>
                    </div>

                    <div className="flex justify-center mt-4">
                        <OtpInput length={6} value={token} onChange={setToken} disabled={loading} />
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        <Button label="Cancel" onClick={onClose} variant="ghost" size="sm" />
                        <Button
                            label={loading ? "Verifying..." : "Verify & Save"}
                            onClick={handleVerify}
                            variant="primary"
                            size="sm"
                            disabled={token.length !== 6 || loading}
                            loading={loading}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
