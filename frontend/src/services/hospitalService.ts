/**
 * Hospital API Service
 * Handles hospital-related API calls
 */

import api from "./api";

/**
 * Extract a human-readable message from an API error. Prefers
 * response.data.message over axios's generic "Request failed with status
 * code 4xx". Falls back to the provided string.
 */
function apiError(error: unknown, fallback: string): Error {
  let message = fallback;
  if (typeof error === "object" && error !== null && "response" in error) {
    const resp = (error as { response?: { data?: { message?: string } } }).response;
    if (resp?.data?.message) message = resp.data.message;
  } else if (error instanceof Error && error.message && !/^Request failed with status code/i.test(error.message)) {
    message = error.message;
  }
  const e = new Error(message);
  (e as any).response = (error as any)?.response?.data;
  return e;
}

export interface Hospital {
    _id: string;
    hospitalName: string;
    email: string;
    phone: string;
    logoUrl: string;
    role?: "admin" | "hospital";
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

interface HospitalResponse {
    success: boolean;
    data: Hospital;
}

/**
 * Get current authenticated hospital information
 */
export const getCurrentHospital = async (): Promise<Hospital> => {
    try {
        const response = await api.get<HospitalResponse>("/hospitals/me");
        return response.data.data;
    } catch (err) {
        throw apiError(err, "Failed to load hospital");
    }
};

/**
 * Get hospital by ID
 */
export const getHospitalById = async (id: string): Promise<Hospital> => {
    try {
        const response = await api.get<HospitalResponse>(`/hospitals/${id}`);
        return response.data.data;
    } catch (err) {
        throw apiError(err, "Failed to load hospital");
    }
};

/**
 * Update non-sensitive profile fields (name, address, logo).
 * Email/phone changes must go through initContactChange/verifyContactChange.
 */
export const patchProfile = async (
    fields: { hospitalName?: string; address?: string },
    logo?: File | null,
): Promise<Hospital> => {
    try {
        if (logo) {
            const form = new FormData();
            if (fields.hospitalName !== undefined) form.append("hospitalName", fields.hospitalName);
            if (fields.address !== undefined) form.append("address", fields.address);
            form.append("logo", logo);
            const response = await api.patch<HospitalResponse>("/hospitals/me", form, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            return response.data.data;
        }
        const response = await api.patch<HospitalResponse>("/hospitals/me", fields);
        return response.data.data;
    } catch (err) {
        throw apiError(err, "Failed to update profile");
    }
};

/**
 * Start an OTP-gated contact change. Provide exactly one of newEmail / newPhone.
 */
export const initContactChange = async (payload: { newEmail?: string; newPhone?: string }) => {
    try {
        const response = await api.post<{
            success: boolean;
            message: string;
            data: { field: "email" | "phone"; otpChannel: string; otpExpiresInSeconds: number };
        }>("/hospitals/me/change-contact/init", payload);
        return response.data;
    } catch (err) {
        throw apiError(err, "Failed to send verification code");
    }
};

export const resendContactChangeOtp = async () => {
    try {
        const response = await api.post<{
            success: boolean;
            message: string;
            data: {
                field: "email" | "phone";
                otpChannel: string;
                otpExpiresInSeconds: number;
                retryAfterSeconds: number;
            };
        }>("/hospitals/me/change-contact/resend");
        return response.data;
    } catch (err) {
        throw apiError(err, "Failed to resend verification code");
    }
};

export const verifyContactChange = async (otp: string): Promise<Hospital> => {
    try {
        const response = await api.post<HospitalResponse>(
            "/hospitals/me/change-contact/verify",
            { otp },
        );
        return response.data.data;
    } catch (err) {
        throw apiError(err, "Verification failed");
    }
};

// ─────────────────────────────────────────────────────────────
// Notification preferences (B6)
// ─────────────────────────────────────────────────────────────
export interface NotificationPrefs {
    newLoginAlert: boolean;
    securityAlerts: boolean;
    marketing: boolean;
}

export const getNotificationPrefs = async (): Promise<NotificationPrefs> => {
    try {
        const res = await api.get<{ success: boolean; data: NotificationPrefs }>(
            "/hospitals/me/notification-preferences",
        );
        return res.data.data;
    } catch (err) {
        throw apiError(err, "Failed to load preferences");
    }
};

export const updateNotificationPrefs = async (
    prefs: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> => {
    try {
        const res = await api.put<{ success: boolean; data: NotificationPrefs }>(
            "/hospitals/me/notification-preferences",
            prefs,
        );
        return res.data.data;
    } catch (err) {
        throw apiError(err, "Failed to save preferences");
    }
};

/**
 * Admin-initiated forced deletion. Requires the admin's current password
 * plus a reason (min 10 chars). Hard-deletes the hospital record.
 */
export const adminForceDeleteHospital = async (id: string, password: string, reason: string) => {
    try {
        const res = await api.delete(`/hospitals/${id}`, { data: { password, reason } });
        return res.data;
    } catch (err) {
        throw apiError(err, "Failed to delete hospital");
    }
};

// ─────────────────────────────────────────────────────────────
// Signed file URL (B5)
// ─────────────────────────────────────────────────────────────
export const getFileSignedUrl = async (
    patientId: string,
    folderName: string,
    fileId: string,
    download = false,
): Promise<{ url: string; expiresIn: number | null; accessMode: "public" | "signed" }> => {
    try {
        const res = await api.get<{
            success: boolean;
            data: { url: string; expiresIn: number | null; accessMode: "public" | "signed" };
        }>(
            `/patients/${patientId}/files/${encodeURIComponent(folderName)}/${fileId}/signed-url${download ? "?download=true" : ""}`,
        );
        return res.data.data;
    } catch (err) {
        throw apiError(err, "Failed to get file URL");
    }
};

// ─────────────────────────────────────────────────────────────
// Compressed file download (Phase 3B)
// ─────────────────────────────────────────────────────────────
export const downloadFileCompressed = async (
    patientId: string,
    folderName: string,
    fileId: string,
    fileName: string,
    onProgress?: (percent: number) => void,
): Promise<void> => {
    try {
        const res = await api.getBlob(
            `/patients/${patientId}/files/${encodeURIComponent(folderName)}/${fileId}/compressed`,
            { 
                timeout: 300000,
                onDownloadProgress: (progressEvent: any) => {
                    if (onProgress && progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress(percent);
                    }
                }
            },
        );
        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        throw apiError(err, "Failed to download compressed file");
    }
};

export default {
    getCurrentHospital,
    getHospitalById,
    patchProfile,
    initContactChange,
    resendContactChangeOtp,
    verifyContactChange,
    getNotificationPrefs,
    updateNotificationPrefs,
    adminForceDeleteHospital,
    getFileSignedUrl,
    downloadFileCompressed,
};
