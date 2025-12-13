// Environment configuration
// Ensure API base includes '/api' so frontend requests reach backend route mount point
const getApiUrl = () => {
  const url = import.meta.env.VITE_API_URL;
  if (!url) return "/api";
  // If url already ends with /api, return as is
  if (url.endsWith("/api")) return url;
  // Otherwise append /api (handling potential trailing slash)
  return `${url.replace(/\/$/, "")}/api`;
};

export const API_URL = getApiUrl();
export const APP_NAME = import.meta.env.VITE_APP_NAME || "Hospital Management";
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const RESEND_TIMER_SECONDS = 30;

export default {
  API_URL,
  APP_NAME,
  OTP_LENGTH,
  OTP_EXPIRY_SECONDS,
  RESEND_TIMER_SECONDS,
};
