/**
 * ConfirmDialog — reusable confirmation modal that matches the app's
 * existing modal style (see Navbar logout, Profile OTP flow).
 */

import React from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "primary" | "danger";
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "primary",
    loading = false,
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    const iconBg = variant === "danger" ? "bg-red-100" : "bg-blue-100";
    const iconColor = variant === "danger" ? "text-red-600" : "text-blue-600";
    const iconPath =
        variant === "danger"
            ? "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            : "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z";

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto" role="dialog" aria-modal="true">
            <div
                className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity backdrop-blur-sm"
                onClick={loading ? undefined : onCancel}
            />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md">
                    <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className={`mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${iconBg} sm:mx-0 sm:h-10 sm:w-10`}>
                                <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                                </svg>
                            </div>
                            <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                                <h3 className="text-base font-semibold leading-6 text-gray-900">{title}</h3>
                                <div className="mt-2 text-sm text-gray-500">
                                    {typeof message === "string" ? <p>{message}</p> : message}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
                        <Button
                            label={loading ? "Working..." : confirmLabel}
                            variant={variant === "danger" ? "danger" : "primary"}
                            onClick={onConfirm}
                            disabled={loading}
                            loading={loading}
                        />
                        <Button
                            label={cancelLabel}
                            variant="ghost"
                            onClick={onCancel}
                            disabled={loading}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
