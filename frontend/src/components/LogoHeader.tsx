/**
 * Logo Header Component
 * Displays hospital logo and name
 */

import React from "react";
import { getAvatarGradient, getInitials, isPlaceholderLogo } from "../utils/avatar";

interface LogoHeaderProps {
  logoUrl?: string;
  hospitalName?: string;
  subtitle?: string;
}

export const LogoHeader: React.FC<LogoHeaderProps> = ({ logoUrl, hospitalName, subtitle }) => {
  const hasRealLogo = logoUrl && !isPlaceholderLogo(logoUrl);
  const hasHospitalName = !!hospitalName && hospitalName.trim().length > 0;

  // Three modes:
  //  1) real logo  → show logo image
  //  2) hospital name, no logo → initials-in-circle avatar (matches app-wide fallback)
  //  3) no identity → app brand "HospitAll"
  return (
    <div className="text-center mb-8 animate-slideIn">
      <div className="flex flex-col items-center justify-center">
        {hasRealLogo ? (
          <>
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden mb-4 mx-auto">
              <img
                src={logoUrl}
                alt="Hospital Logo"
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{hospitalName}</h1>
          </>
        ) : hasHospitalName ? (
          <>
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getAvatarGradient(hospitalName)} flex items-center justify-center overflow-hidden mb-4 mx-auto shadow-md`}>
              <span className="text-white font-bold text-lg">{getInitials(hospitalName)}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{hospitalName}</h1>
          </>
        ) : (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-md">
              <span className="text-white text-xl font-bold">H</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              Hospit<span className="text-blue-600">All</span>
            </h1>
          </div>
        )}
      </div>
      {subtitle && <p className="text-gray-500 font-medium">{subtitle}</p>}
    </div>
  );
};

export default LogoHeader;
