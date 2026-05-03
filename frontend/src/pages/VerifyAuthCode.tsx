/**
 * Verify Auth Code page (step 2 of login)
 *
 * Reached after POST /login returns requireAuthCode=true. The user enters
 * their hospital's 6-digit authCode; we POST /login/verify-auth-code and,
 * on success, they land on the dashboard.
 */

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
// import { authService } from "../services/authService"; // re-enable for Resend Code

const OTP_LENGTH = 6;

export const VerifyAuthCode: React.FC = () => {
  const navigate = useNavigate();
  const { verifyAuthCode } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Resend-code state — disabled for now, re-enable with the resend UI below.
  // const [info, setInfo] = useState("");
  // const [isResending, setIsResending] = useState(false);
  // const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useDocumentTitle("Enter Auth Code — MediVault");

  // Redirect if no tempToken — user arrived without completing step 1
  useEffect(() => {
    if (!sessionStorage.getItem("tempToken")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Cooldown countdown — disabled with Resend Code
  // useEffect(() => {
  //   if (resendCooldown <= 0) return;
  //   const t = setInterval(
  //     () => setResendCooldown((s) => Math.max(0, s - 1)),
  //     1000,
  //   );
  //   return () => clearInterval(t);
  // }, [resendCooldown]);

  // Auto-focus first cell on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Auto-verify when 6 digits are entered
  useEffect(() => {
    if (code.length === OTP_LENGTH && !isVerifying) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (val: string) => {
    if (val.length !== OTP_LENGTH) {
      setError("Please enter your 6-digit Auth Code");
      return;
    }
    setIsVerifying(true);
    setError("");
    try {
      await verifyAuthCode(val);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Invalid auth code. Please try again.");
      setCode("");
      setActiveIndex(0);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };


  const handleUseDifferentAccount = () => {
    sessionStorage.removeItem("tempToken");
    navigate("/login", { replace: true });
  };

  // --- OTP cell handlers (same semantics as OtpInput component) ---------
  const handleCellChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digit = e.target.value.replace(/\D/g, "");
    if (digit.length > 1) {
      // Bulk paste into a single cell
      const next = (code + digit).slice(0, OTP_LENGTH);
      setCode(next);
      const focusIdx = Math.min(next.length, OTP_LENGTH - 1);
      setActiveIndex(focusIdx);
      inputRefs.current[focusIdx]?.focus();
    } else {
      const next = code.slice(0, index) + digit + code.slice(index + 1);
      setCode(next);
      if (digit && index < OTP_LENGTH - 1) {
        setActiveIndex(index + 1);
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleCellKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = code.slice(0, index) + code.slice(index + 1);
      setCode(next);
      if (index > 0) {
        setActiveIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      setActiveIndex(index - 1);
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      setActiveIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text/plain")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    setCode(pasted);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    setActiveIndex(focusIdx);
    inputRefs.current[focusIdx]?.focus();
  };

  // Cooldown formatter — disabled with Resend Code.
  // const formatCooldown = (s: number) => {
  //   const mm = Math.floor(s / 60);
  //   const ss = s % 60;
  //   return `${mm}:${ss.toString().padStart(2, "0")}`;
  // };

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6 font-sans text-neutral-900 antialiased selection:bg-primary-100 selection:text-primary-700 relative overflow-hidden">
      {/* Ambient background accents */}
      <div
        aria-hidden="true"
        className="absolute -top-32 -right-32 w-80 h-80 bg-primary-100 rounded-full blur-[100px] opacity-70 pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 -left-32 w-96 h-96 bg-primary-200 rounded-full blur-[120px] opacity-30 pointer-events-none"
      />

      {/* Main card */}
      <main className="w-full max-w-[480px] bg-surface-white rounded-2xl shadow-modal border border-neutral-200 p-8 md:p-12 flex flex-col relative z-10 animate-scale-in">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 mb-5 shadow-card">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-[26px] md:text-[28px] leading-tight font-heading font-bold text-neutral-900 mb-2 tracking-tight">
            Secure Verification
          </h1>
          <p className="text-neutral-500 text-sm md:text-base leading-relaxed px-2">
            Enter the <span className="font-semibold text-neutral-700">6-digit Auth Code</span>{" "}
            from your welcome email to finish signing in.
          </p>
        </div>

        {/* Error / success banners */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger animate-fade-in"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="flex-1 leading-relaxed">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="text-danger/70 hover:text-danger transition-colors shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        {/* Success banner — used by Resend Code (disabled for now).
        {info && (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success animate-fade-in"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span className="flex-1 leading-relaxed">{info}</span>
            <button
              type="button"
              onClick={() => setInfo("")}
              aria-label="Dismiss"
              className="text-success/70 hover:text-success transition-colors shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        */}

        {/* OTP input cells */}
        <div
          className="flex justify-between items-center gap-2 sm:gap-3 mb-8 w-full"
          dir="ltr"
        >
          {Array.from({ length: OTP_LENGTH }).map((_, index) => {
            const filled = !!code[index];
            const isActive = index === activeIndex;
            return (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={1}
                value={code[index] || ""}
                disabled={isVerifying}
                aria-label={`Digit ${index + 1}`}
                onChange={(e) => handleCellChange(index, e)}
                onKeyDown={(e) => handleCellKeyDown(index, e)}
                onFocus={() => setActiveIndex(index)}
                onPaste={handleCellPaste}
                className={`
                  w-full h-14 sm:h-16 rounded-xl text-center text-2xl font-heading font-semibold
                  border-2 transition-all duration-150 outline-none
                  disabled:opacity-60 disabled:cursor-not-allowed
                  ${filled || isActive
                    ? `bg-primary-50 border-primary-500 text-primary-700 ${isActive ? "ring-2 ring-primary-100" : ""
                    }`
                    : "bg-surface-white border-neutral-200 text-neutral-900 hover:border-primary-300"
                  }
                `}
              />
            );
          })}
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={() => void submit(code)}
          disabled={isVerifying || code.length !== OTP_LENGTH}
          className="w-full bg-gradient-primary text-white rounded-xl py-3.5 font-semibold text-base shadow-primary hover:shadow-card-hover hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 mb-6"
        >
          {isVerifying ? (
            <>
              <Spinner variant="heartbeat" size="sm" />
              <span>Verifying…</span>
            </>
          ) : (
            <>
              <span>Verify Access</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </>
          )}
        </button>

        {/* Secondary actions */}
        <div className="flex flex-col items-center gap-4">
          {/* Resend Code — disabled for now. Re-enable the button + divider below
              along with the imports, state, effect, handler, and formatter above.
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || resendCooldown > 0}
            className="text-neutral-500 hover:text-primary-600 disabled:text-neutral-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 group text-sm font-medium w-full py-1"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-[18px] h-[18px] transition-transform duration-300 ${isResending ? "animate-spin" : "group-hover:-rotate-45"}`}
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {isResending
              ? "Sending…"
              : resendCooldown > 0
                ? (
                    <>
                      Resend Code{" "}
                      <span className="text-neutral-400 font-mono font-normal ml-1 tracking-wider">
                        {formatCooldown(resendCooldown)}
                      </span>
                    </>
                  )
                : "Resend Code"}
          </button>

          <div
            aria-hidden="true"
            className="w-8 h-[2px] bg-neutral-200 rounded-full my-1"
          />
          */}

          <button
            type="button"
            onClick={handleUseDifferentAccount}
            className="text-neutral-600 hover:text-primary-600 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[18px] h-[18px]"
              aria-hidden="true"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            Use a different account
          </button>
        </div>
      </main>
    </div>
  );
};

export default VerifyAuthCode;
