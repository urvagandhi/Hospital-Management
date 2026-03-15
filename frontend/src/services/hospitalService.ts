/**
 * Hospital API Service
 * Handles hospital-related API calls
 */

import api from "./api";

export interface Hospital {
    _id: string;
    hospitalName: string;
    email: string;
    phone: string;
    logoUrl?: string;
    role?: "admin" | "hospital";
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    department?: string;
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
    const response = await api.get<HospitalResponse>("/hospitals/me");
    return response.data.data;
};

/**
 * Get hospital by ID
 */
export const getHospitalById = async (id: string): Promise<Hospital> => {
    const response = await api.get<HospitalResponse>(`/hospitals/${id}`);
    return response.data.data;
};

export default {
    getCurrentHospital,
    getHospitalById,
};
