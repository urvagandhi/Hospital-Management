/**
 * Input Validation Utilities
 */

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): string | null => {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Must contain a number";
  if (!/[\W_]/.test(password)) return "Must contain a special character";
  return null;
};

export const validateOtp = (otp: string, length: number = 6): boolean => {
  return /^\d+$/.test(otp) && otp.length === length;
};

export const getPasswordError = (password: string): string | null => {
  if (!password) return "Password is required";
  return validatePassword(password);
};

export const getEmailError = (email: string): string | null => {
  if (!email) return "Email is required";
  if (!validateEmail(email)) return "Invalid email format";
  return null;
};

export const getOtpError = (otp: string, length: number = 6): string | null => {
  if (!otp) return `Enter ${length}-digit OTP`;
  if (!/^\d+$/.test(otp)) return "OTP must contain only digits";
  if (otp.length !== length) return `OTP must be exactly ${length} digits`;
  return null;
};

export default {
  validateEmail,
  validatePassword,
  validateOtp,
  getPasswordError,
  getEmailError,
  getOtpError,
};
