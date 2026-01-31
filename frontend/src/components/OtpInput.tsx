/**
 * OTP Input Component
 * 6 separate input boxes with auto-focus and intelligent cursor movement
 */

import React, { useRef, useEffect } from "react";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

export const OtpInput: React.FC<OtpInputProps> = ({ length = 6, value, onChange, onComplete, disabled = false, error }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Auto-focus first input on mount
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digit = e.target.value.replace(/\D/g, "");

    if (digit.length > 1) {
      // Handle paste
      const newValue = (value + digit).slice(0, length);
      onChange(newValue);
      // Auto focus next empty input
      for (let i = 0; i < length; i++) {
        if (i >= newValue.length) {
          inputRefs.current[i]?.focus();
          break;
        }
      }
    } else {
      // Single digit input
      const newValue = value.slice(0, index) + digit + value.slice(index + 1);
      onChange(newValue);

      // Auto-focus next input
      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const newValue = value.slice(0, index) + value.slice(index + 1);
      onChange(newValue);

      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text/plain").replace(/\D/g, "").slice(0, length);
    onChange(pastedText);
    if (pastedText.length === length && onComplete) {
      onComplete(pastedText);
    }
  };

  useEffect(() => {
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [value, length, onComplete]);

  return (
    <div className="w-full">
      <div className="flex gap-2 sm:gap-3 justify-center">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ""}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={disabled}
            className={`
              w-12 h-12 sm:w-14 sm:h-14 text-center text-2xl font-bold
              border-2 rounded-lg transition-all duration-200
              ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white cursor-text focus:outline-none"}
              ${error ? "border-red-500 focus:ring-2 focus:ring-red-200" : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}
            `}
          />
        ))}
      </div>
      {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
    </div>
  );
};

export default OtpInput;
