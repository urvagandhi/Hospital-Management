import React, { useState } from "react";
import { Button } from "./Button";

interface PasswordConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string) => void;
    title?: string;
    message?: string;
    confirmLabel?: string;
    loading?: boolean;
}

export const PasswordConfirmModal: React.FC<PasswordConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Password",
    message = "Please enter your password to continue.",
    confirmLabel = "Confirm",
    loading = false,
}) => {
    const [password, setPassword] = useState("");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 mb-4 text-sm">{message}</p>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        onConfirm(password);
                    }}
                >
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        autoFocus
                    />

                    <div className="flex justify-end gap-3">
                        <Button
                            label="Cancel"
                            onClick={onClose}
                            variant="ghost"
                            size="sm"
                            type="button"
                        />
                        <Button
                            label={loading ? "Verifying..." : confirmLabel}
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={!password || loading}
                            loading={loading}
                        />
                    </div>
                </form>
            </div>
        </div>
    );
};
