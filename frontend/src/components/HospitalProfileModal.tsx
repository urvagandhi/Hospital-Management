import React from "react";
import { Hospital } from "../types/auth";
import { Button } from "./Button";

interface HospitalProfileModalProps {
  hospital: Hospital | null;
  isOpen: boolean;
  onClose: () => void;
}

export const HospitalProfileModal: React.FC<HospitalProfileModalProps> = ({ hospital, isOpen, onClose }) => {
  if (!isOpen || !hospital) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      {/* Background backdrop */}
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity backdrop-blur-sm" onClick={onClose}></div>

      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          {/* Decorative Header Background */}
          <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700">
            <div className="absolute top-2 right-2">
              <button onClick={onClose} className="rounded-full bg-black/20 p-1 text-white hover:bg-black/40 transition-colors">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-4 pb-4 pt-0 sm:p-6 sm:pt-0">
            <div className="flex flex-col items-center -mt-16">
              {/* Profile Image */}
              <div className="h-32 w-32 rounded-full border-4 border-white bg-white shadow-lg overflow-hidden flex items-center justify-center">
                {hospital.logoUrl ? (
                  <img src={hospital.logoUrl} alt={hospital.hospitalName} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-blue-100 flex items-center justify-center text-5xl font-bold text-blue-600">{hospital.hospitalName.charAt(0).toUpperCase()}</div>
                )}
              </div>

              <div className="mt-4 text-center">
                <h3 className="text-2xl font-bold text-gray-900 leading-6">{hospital.hospitalName}</h3>
                <p className="text-sm text-gray-500 mt-1">Joined {new Date(hospital.createdAt).toLocaleDateString()}</p>
                {hospital.isActive ? (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 mt-2">
                    Active Account
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20 mt-2">
                    Inactive
                  </span>
                )}
              </div>

              <div className="mt-8 w-full border-t border-gray-100 pt-6">
                <dl className="divide-y divide-gray-100">
                  {hospital.authCode && (
                    <div className="px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 text-left">
                      <dt className="text-sm font-medium leading-6 text-gray-500 flex items-center">
                        <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Auth Code
                      </dt>
                      <dd className="mt-1 text-sm leading-6 text-blue-700 sm:col-span-2 sm:mt-0 font-mono tracking-widest font-semibold">{hospital.authCode}</dd>
                    </div>
                  )}
                  <div className="px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 text-left">
                    <dt className="text-sm font-medium leading-6 text-gray-500 flex items-center">
                      <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      Email
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-gray-900 sm:col-span-2 sm:mt-0 break-all">{hospital.email}</dd>
                  </div>
                  <div className="px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 text-left">
                    <dt className="text-sm font-medium leading-6 text-gray-500 flex items-center">
                      <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      Phone
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-gray-900 sm:col-span-2 sm:mt-0">{hospital.phone}</dd>
                  </div>
                  <div className="px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 text-left">
                    <dt className="text-sm font-medium leading-6 text-gray-500 flex items-center">
                      <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Address
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-gray-900 sm:col-span-2 sm:mt-0">{hospital.address || "N/A"}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6 w-full">
                <Button label="Close" variant="ghost" onClick={onClose} fullWidth />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
