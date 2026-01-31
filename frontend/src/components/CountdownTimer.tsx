/**
 * Countdown Timer Component
 * Displays countdown for OTP resend with resend button
 */

import React, { useState, useEffect } from "react";

interface CountdownTimerProps {
  initialSeconds?: number;
  onResendClick: () => Promise<void>;
  isResending?: boolean;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ initialSeconds = 30, onResendClick, isResending = false }) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prev) => prev - 1);
      }, 1000);
    } else if (seconds === 0) {
      setIsActive(false);
    }

    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const handleResend = async () => {
    try {
      await onResendClick();
      setSeconds(initialSeconds);
      setIsActive(true);
    } catch (error) {
      console.error("Resend failed:", error);
    }
  };

  if (isActive) {
    return (
      <p className="text-center text-gray-600 text-sm">
        Resend OTP in <span className="font-semibold text-blue-600">{String(seconds).padStart(2, "0")}s</span>
      </p>
    );
  }

  return (
    <button
      onClick={handleResend}
      disabled={isResending}
      className="
        text-center text-sm font-semibold text-blue-600 hover:text-blue-700
        disabled:opacity-60 disabled:cursor-not-allowed transition-colors
        w-full
      "
    >
      {isResending ? "Resending OTP..." : "Resend OTP"}
    </button>
  );
};

export default CountdownTimer;
