/**
 * Button Component
 * Reusable button with different variants and loading states
 */

import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white",
  secondary: "bg-green-600 hover:bg-green-700 text-white",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  ghost: "bg-transparent border-2 border-gray-300 text-gray-700 hover:bg-gray-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export const Button: React.FC<ButtonProps> = ({
  label,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  className = "",
}) => {
  const baseStyles = "font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2";
  const disabledStyles = disabled || loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer";
  const widthStyles = fullWidth ? "w-full" : "";

  const handleClick = () => {
    console.log("[Button] Clicked:", { type, label, disabled, loading });
    // For submit buttons in forms, don't intercept - let the form handle it
    if (type === "submit") {
      console.log("[Button] Submit button - allowing form submission");
      return;
    }
    if (onClick) {
      console.log("[Button] Executing onClick handler");
      onClick();
    }
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${disabledStyles}
        ${widthStyles}
        ${className}
      `}
    >
      {loading && (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {icon && !loading && icon}
      {label}
    </button>
  );
};

export default Button;
