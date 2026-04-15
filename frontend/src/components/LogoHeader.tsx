/**
 * LogoHeader — used on auth pages (Login, VerifyAuthCode, ForgotPassword, etc.)
 *
 * Modes:
 *  1) real hospital logo  → show hospital logo image
 *  2) hospital name only  → initials avatar (matches app-wide fallback)
 *  3) no identity         → app brand logo (HospitAll platform logo)
 */

import React from "react";
import appLogo from "../assets/logo.png";
import { getAvatarGradient, getInitials, isPlaceholderLogo } from "../utils/avatar";

interface LogoHeaderProps {
  logoUrl?: string;
  hospitalName?: string;
  subtitle?: string;
}

export const LogoHeader: React.FC<LogoHeaderProps> = ({ logoUrl, hospitalName, subtitle }) => {
  const hasRealLogo   = logoUrl && !isPlaceholderLogo(logoUrl);
  const hasHospitalName = !!hospitalName && hospitalName.trim().length > 0;

  return (
    <div className="text-center mb-8 animate-slideIn">
      <div className="flex flex-col items-center justify-center">

        {hasRealLogo ? (
          <>
            {/* Hospital logo from DB */}
            <div className="w-16 h-16 rounded-2xl border-2 border-neutral-100 bg-white flex items-center justify-center overflow-hidden mb-4 mx-auto shadow-sm">
              <img
                src={logoUrl}
                alt="Hospital Logo"
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
            <h1 className="font-heading font-bold text-[26px] text-neutral-900 leading-tight mb-1">
              {hospitalName}
            </h1>
          </>

        ) : hasHospitalName ? (
          <>
            {/* Initials avatar */}
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getAvatarGradient(hospitalName)} flex items-center justify-center mb-4 mx-auto shadow-sm border-2 border-white`}>
              <span className="text-white font-heading font-bold text-xl">
                {getInitials(hospitalName)}
              </span>
            </div>
            <h1 className="font-heading font-bold text-[26px] text-neutral-900 leading-tight mb-1">
              {hospitalName}
            </h1>
          </>

        ) : (
          <>
            {/* Platform / app brand logo */}
            <div className="w-20 h-20 rounded-2xl border-2 border-primary-100 bg-white flex items-center justify-center overflow-hidden mb-4 mx-auto shadow-sm">
              <img src={appLogo} alt="HospitAll" className="w-full h-full object-contain p-1" />
            </div>
            <h1 className="font-heading font-bold text-[26px] text-neutral-900 leading-tight mb-1">
              Hospit<span className="text-primary-500">All</span>
            </h1>
          </>
        )}

      </div>
      {subtitle && (
        <p className="text-[13px] text-neutral-500 font-medium mt-1.5">{subtitle}</p>
      )}
    </div>
  );
};

export default LogoHeader;
