/**
 * Text Input Component
 * Reusable input field with validation and error states
 */

import React from "react";

interface TextInputProps {
  label?: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  icon?: React.ReactNode;
  maxLength?: number;
  prefix?: string;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  autoComplete,
  autoFocus = false,
  required = false,
  icon,
  maxLength,
  prefix,
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative flex">
        {prefix && (
          <span className="inline-flex items-center px-3 rounded-l-lg border-2 border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm font-medium select-none">
            {prefix}
          </span>
        )}
        {icon && !prefix && <div className="absolute left-3 top-3 text-gray-400">{icon}</div>}

        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={maxLength}
          className={`
            w-full px-4 py-2.5 border-2 transition-all duration-200
            ${prefix ? "rounded-r-lg" : "rounded-lg"}
            ${icon && !prefix ? "pl-10" : ""}
            ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}
            ${error ? "border-red-500 focus:ring-2 focus:ring-red-200" : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}
          `}
        />
      </div>

      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
};

export default TextInput;
