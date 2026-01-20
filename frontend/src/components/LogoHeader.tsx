/**
 * Logo Header Component
 * Displays hospital logo and name
 */

import React from "react";

interface LogoHeaderProps {
  logoUrl?: string;
  hospitalName?: string;
  subtitle?: string;
}

export const LogoHeader: React.FC<LogoHeaderProps> = ({ logoUrl, hospitalName = "HospitAll", subtitle }) => {
  // Check if we should use the default "HospitAll" branding
  // This applies if no logo is provided, or if the placeholder is used
  const isDefault = !logoUrl || logoUrl.includes("via.placeholder.com");

  return (
    <div className="text-center mb-8 animate-slideIn">
      <div className="flex flex-col items-center justify-center">
        {isDefault ? (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-md">
              <span className="text-white text-xl font-bold">H</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              Hospit<span className="text-blue-600">All</span>
            </h1>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden mb-4 mx-auto">
              <img
                src={logoUrl}
                alt="Hospital Logo"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{hospitalName}</h1>
          </>
        )}
      </div>
      {subtitle && <p className="text-gray-500 font-medium">{subtitle}</p>}
    </div>
  );
};

export default LogoHeader;
