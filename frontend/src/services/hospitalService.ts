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

export default {
    getCurrentHospital,
    getHospitalById,
    patchProfile,
    initContactChange,
    verifyContactChange,
};
