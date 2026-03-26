import { Menu, Transition } from "@headlessui/react";
import React, { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { HospitalProfileModal } from "./HospitalProfileModal";
import { getCurrentHospital, Hospital } from "../services/hospitalService";
import { NetworkStatusPill } from "./NetworkStatus";

export const Navbar: React.FC = () => {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const { hospital: authHospital } = state;
  const [hospitalInfo, setHospitalInfo] = useState<Hospital | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchHospitalInfo = async () => {
      if (state.isAuthenticated) {
        try {
          const data = await getCurrentHospital();
          if (!cancelled) setHospitalInfo(data);
        } catch {
          if (!cancelled) setHospitalInfo(authHospital);
        }
      }
    };

    fetchHospitalInfo();
    return () => { cancelled = true; };
  }, [state.isAuthenticated, authHospital]);

  // Use fetched hospital info if available, otherwise use auth state
  const hospital = hospitalInfo || authHospital;

  const isAdmin = hospital?.role === "admin";

  const handleLogoutClick = () => {
    setIsLogoutConfirmOpen(true);
  };

  const confirmLogout = async () => {
    await logout();
    setIsLogoutConfirmOpen(false);
    navigate("/login");
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 w-full fixed top-0 z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left Side: Logo & Navigation */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden shadow-sm">
                {hospital?.logoUrl ? (
                  <img className="h-full w-full object-cover" src={hospital.logoUrl} alt={hospital.hospitalName} />
                ) : (
                  <span className="text-white font-bold text-lg">{hospital?.hospitalName?.charAt(0) || "H"}</span>
                )}
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500">{hospital?.hospitalName || "Hospital Manager"}</span>
            </div>

            {isAdmin && (
              <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                <Link
                  to="/dashboard"
                  className="border-transparent text-gray-500 hover:text-blue-600 hover:border-blue-500 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/hospitals"
                  className="border-transparent text-gray-500 hover:text-blue-600 hover:border-blue-500 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors"
                >
                  Hospitals
                </Link>
              </div>
            )}
          </div>

          {/* Right Side: Status + User Dropdown */}
          <div className="flex items-center gap-3">
            <NetworkStatusPill />
            <Menu as="div" className="relative">
              <div className="flex items-center gap-3">
                <span className="hidden md:block text-sm font-medium text-gray-700">{hospital?.email}</span>
                <Menu.Button className="bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-shadow">
                  <span className="sr-only">Open user menu</span>
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold border border-blue-200 overflow-hidden">
                    {hospital?.logoUrl ? (
                      <img className="h-full w-full object-cover" src={hospital.logoUrl} alt={hospital.hospitalName} />
                    ) : (
                      hospital?.hospitalName?.charAt(0).toUpperCase() || "U"
                    )}
                  </div>
                </Menu.Button>
              </div>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="origin-top-right absolute right-0 mt-2 w-56 rounded-xl shadow-xl py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50 divide-y divide-gray-100">
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button onClick={() => setIsProfileOpen(true)} className={`${active ? "bg-gray-50" : ""} w-full text-left px-4 py-3 group`}>
                          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">{hospital?.hospitalName}</p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{hospital?.email}</p>
                          <p className="text-[10px] text-blue-500 mt-1 uppercase font-semibold tracking-wider">View Profile</p>
                        </button>
                      )}
                    </Menu.Item>
                  </div>

                  {/* 
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <Link to="/security" className={`${active ? "bg-gray-50" : ""} group flex items-center px-4 py-2 text-sm text-gray-700`}>
                          <svg className="mr-3 h-5 w-5 text-gray-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Security Settings
                        </Link>
                      )}
                    </Menu.Item>
                  </div>
                  */}

                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button onClick={handleLogoutClick} className={`${active ? "bg-red-50 text-red-700" : "text-gray-700"} group flex w-full items-center px-4 py-2 text-sm`}>
                          <svg className="mr-3 h-5 w-5 text-gray-400 group-hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>
      </div>

      <HospitalProfileModal hospital={hospital} isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {/* Logout Confirmation Modal */}
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity backdrop-blur-sm" onClick={() => setIsLogoutConfirmOpen(false)}></div>

          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">
                      Sign Out
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">Are you sure you want to sign out from the system?</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                  onClick={confirmLogout}
                >
                  Sign Out
                </button>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                  onClick={() => setIsLogoutConfirmOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
