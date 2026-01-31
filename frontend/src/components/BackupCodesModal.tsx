import React from "react";
import { Button } from "./Button";

interface BackupCodesModalProps {
    isOpen: boolean;
    onClose: () => void;
    backupCodes: string[];
}

export const BackupCodesModal: React.FC<BackupCodesModalProps> = ({
    isOpen,
    onClose,
    backupCodes,
}) => {
    if (!isOpen) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(backupCodes.join("\n"));
        alert("Copied directly to clipboard!");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <p className="text-green-800 font-medium">✓ Rotation Successful!</p>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                    New backup codes have been generated. Please save them immediately. Old codes are invalid.
                </p>

                <div className="grid grid-cols-2 gap-2 mb-6 bg-gray-50 p-3 rounded">
                    {backupCodes.map((code, i) => (
                        <code key={i} className="text-xs bg-white border p-1 rounded text-center font-mono">
                            {code}
                        </code>
                    ))}
                </div>

                <div className="flex gap-2">
                    <Button label="Copy Codes" onClick={handleCopy} variant="secondary" size="md" fullWidth />
                    <Button label="Done" onClick={onClose} variant="primary" size="md" fullWidth />
                </div>
            </div>
        </div>
    );
};
