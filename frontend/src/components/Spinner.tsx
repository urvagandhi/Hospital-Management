/**
 * Shared loading spinner with domain-aware variants.
 *
 *   heartbeat  — ECG line draw (default). Domain-fit for clinical actions.
 *   scan       — Document with a scanning line. Use for document upload /
 *                download / export moments.
 *   tri-ring   — Three concentric rings, layered tempos (fallback option).
 *
 * All variants render with `currentColor`, so the caller controls colour via
 * a parent `text-*` class (e.g. `text-primary-600`, `text-white`, etc.).
 *
 * To switch the "normal" spinner to tri-ring everywhere, change the default
 * `variant` below from "heartbeat" to "tri-ring".
 */

import React from "react";

type Variant = "heartbeat" | "scan" | "tri-ring";
type Size = "xs" | "sm" | "md" | "lg";

interface SpinnerProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  label?: string;
}

// Inject keyframes once on first import. Avoids Tailwind config churn.
const STYLE_ID = "hms-spinner-keyframes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    @keyframes hms-ecg-draw {
      0% { stroke-dashoffset: 240; }
      60% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -240; }
    }
    @keyframes hms-ecg-pulse {
      0%, 30%, 70%, 100% { opacity: 0; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.35); }
    }
    @keyframes hms-scan-line {
      0%, 100% { top: 10%; }
      50% { top: 82%; }
    }
  `;
  document.head.appendChild(el);
}

const HEARTBEAT_SIZE: Record<Size, string> = {
  xs: "w-10 h-3",
  sm: "w-14 h-4",
  md: "w-20 h-6",
  lg: "w-32 h-10",
};

const SCAN_SIZE: Record<Size, string> = {
  xs: "w-4 h-5",
  sm: "w-5 h-6",
  md: "w-10 h-12",
  lg: "w-16 h-20",
};

const TRI_RING_SIZE: Record<Size, string> = {
  xs: "w-4 h-4",
  sm: "w-5 h-5",
  md: "w-10 h-10",
  lg: "w-14 h-14",
};

export const Spinner: React.FC<SpinnerProps> = ({
  variant = "heartbeat",
  size = "md",
  className = "",
  label = "Loading",
}) => {
  // ── Heartbeat (ECG line) ────────────────────────────────────────────
  if (variant === "heartbeat") {
    return (
      <svg
        viewBox="0 0 120 40"
        role="status"
        aria-label={label}
        className={`${HEARTBEAT_SIZE[size]} ${className}`}
        preserveAspectRatio="none"
      >
        <polyline
          points="0,20 25,20 33,20 40,8 48,32 56,14 64,20 120,20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="240"
          strokeDashoffset="240"
          style={{ animation: "hms-ecg-draw 1.3s linear infinite" }}
        />
        <circle
          cx="40"
          cy="8"
          r="2.5"
          fill="currentColor"
          style={{ animation: "hms-ecg-pulse 1.3s linear infinite" }}
        />
      </svg>
    );
  }

  // ── Scan (document + scan line) ─────────────────────────────────────
  if (variant === "scan") {
    const rows = size === "lg" ? 6 : size === "md" ? 4 : 3;
    const borderCls = size === "xs" || size === "sm" ? "border" : "border-2";
    return (
      <div
        role="status"
        aria-label={label}
        className={`relative rounded-[3px] ${borderCls} border-current bg-white/40 overflow-hidden shrink-0 ${SCAN_SIZE[size]} ${className}`}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <span
            key={i}
            className="absolute left-[12%] right-[12%] h-px bg-current opacity-30"
            style={{ top: `${(100 / (rows + 1)) * (i + 1)}%` }}
          />
        ))}
        <span
          className="absolute left-0 right-0 bg-current opacity-90"
          style={{
            height: "2px",
            boxShadow: "0 0 6px currentColor",
            animation: "hms-scan-line 1.6s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  // ── Tri-ring (3 concentric arcs) ────────────────────────────────────
  const ringBorder = size === "xs" || size === "sm" ? "border" : "border-[3px]";
  return (
    <div
      role="status"
      aria-label={label}
      className={`relative shrink-0 ${TRI_RING_SIZE[size]} ${className}`}
    >
      <div
        className={`absolute inset-0 rounded-full ${ringBorder} border-transparent border-t-current animate-spin`}
        style={{ animationDuration: "1.2s" }}
      />
      <div
        className={`absolute inset-[22%] rounded-full ${ringBorder} border-transparent border-t-current opacity-70 animate-spin`}
        style={{ animationDuration: "1.8s", animationDirection: "reverse" }}
      />
      <div
        className={`absolute inset-[44%] rounded-full ${ringBorder} border-transparent border-t-current opacity-40 animate-spin`}
        style={{ animationDuration: "2.4s" }}
      />
    </div>
  );
};

export default Spinner;
