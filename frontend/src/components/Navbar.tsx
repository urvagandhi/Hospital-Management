/**
 * Navbar — top chrome for MainLayout pages.
 *
 * Layout (3 zones):
 *   LEFT   : app logo + "MediVault" wordmark · vertical divider ·
 *            hospital chip (logo/initial + name + online dot)
 *   CENTER : nav links (Dashboard always, Hospitals admin-only)
 *   RIGHT  : settings gear (opens account dropdown) · avatar
 *            (opens HospitalProfileModal directly)
 *
 * No notifications bell, no search. Inline SVG only. The network status
 * indicator lives as a small dot next to the hospital name; the full
 * NetworkStatusBanner still handles real offline states from MainLayout.
 */

import { Menu, MenuButton, Transition } from "@headlessui/react";
import React, { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import appLogo from "../assets/logo.png";
import { useAuth } from "../hooks/useAuth";
import { getCurrentHospital, Hospital } from "../services/hospitalService";
import {
  getAvatarGradient,
  getInitials,
  isPlaceholderLogo,
} from "../utils/avatar";
import { HospitalProfileModal } from "./HospitalProfileModal";
import { useNetworkStatus } from "./NetworkStatus";

export const Navbar: React.FC = () => {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { hospital: authHospital } = state;
  const [hospitalInfo, setHospitalInfo] = useState<Hospital | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const networkStatus = useNetworkStatus();
  const isOnline = networkStatus === "online";

  useEffect(() => {
    let cancelled = false;

    const hasUsableAuthHospital = Boolean(authHospital?.hospitalName || authHospital?.email || authHospital?.phone);

    if (!state.isAuthenticated) {
      setHospitalInfo(null);
      return () => {
        cancelled = true;
      };
    }

    // Keep local display in sync with auth state; avoid refetching `/hospitals/me`
    // on every mount when auth already has profile data.
    if (hasUsableAuthHospital) {
      setHospitalInfo(authHospital);
      return () => {
        cancelled = true;
      };
    }

    const fetchHospitalInfo = async () => {
      try {
        const data = await getCurrentHospital();
        if (!cancelled) setHospitalInfo(data);
      } catch {
        if (!cancelled) setHospitalInfo(authHospital);
      }
    };

    fetchHospitalInfo();
    return () => {
      cancelled = true;
    };
  }, [state.isAuthenticated, authHospital]);

  const hospital = hospitalInfo || authHospital;
  const isAdmin = hospital?.role === "admin";

  const navItems: Array<{ to: string; label: string; show: boolean }> = [
    { to: "/dashboard", label: "Dashboard", show: true },
    { to: "/hospitals", label: "Hospitals", show: !!isAdmin },
  ];

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  const handleLogoutClick = () => setIsLogoutConfirmOpen(true);
  const confirmLogout = async () => {
    await logout();
    setIsLogoutConfirmOpen(false);
    navigate("/login");
  };

  return (
    <nav className="bg-surface-white/90 backdrop-blur-sm shadow-card border-b border-neutral-200 w-full fixed top-0 z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* LEFT: App brand only */}
          <div className="flex-1 min-w-0 flex items-center">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 shrink-0 hover:opacity-90 transition-opacity"
            >
              <img
                src={appLogo}
                alt="MediVault"
                className="h-8 w-8 rounded-lg object-cover shadow-card"
              />
              <span className="hidden sm:inline font-heading text-base lg:text-lg font-bold tracking-tight bg-gradient-primary bg-clip-text text-transparent">
                MediVault
              </span>
            </Link>
          </div>

          {/* CENTER: Nav links */}
          <div className="hidden md:flex flex-1 items-center justify-center gap-2">
            {navItems
              .filter((item) => item.show)
              .map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={`relative px-4 py-2 text-sm font-semibold transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${active
                      ? "text-primary-700"
                      : "text-neutral-500 hover:text-primary-600 hover:bg-primary-50/60"
                      }`}
                  >
                    {item.label}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-3 right-3 -bottom-[1px] h-[3px] rounded-full bg-gradient-primary"
                      />
                    )}
                  </Link>
                );
              })}
          </div>

          {/* RIGHT: Hospital chip + Settings + Avatar */}
          <div className="flex-1 flex items-center justify-end gap-2 sm:gap-5">
            {/* Hospital chip — generic hospital SVG icon + name + online dot */}
            {hospital && (
              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                title="View hospital profile"
                className="hidden md:flex items-center gap-2 min-w-0 pl-2 pr-3 py-1.5 rounded-full bg-neutral-50 hover:bg-primary-50 border border-neutral-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <span className="h-7 w-7 shrink-0 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path d="M3 10 12 3l9 7" />
                    <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
                    <path d="M10 21v-5h4v5" />
                    <line x1="12" y1="7" x2="12" y2="11" />
                    <line x1="10" y1="9" x2="14" y2="9" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-neutral-700 truncate max-w-[140px] lg:max-w-[220px]">
                  {hospital.hospitalName}
                </span>
                <span
                  title={isOnline ? "Online" : "Offline"}
                  className={`relative ml-1 h-2 w-2 rounded-full shrink-0 ${isOnline ? "bg-success" : "bg-danger"
                    }`}
                >
                  {isOnline && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-success opacity-60 animate-ping"
                    />
                  )}
                </span>
              </button>
            )}

            {/* Settings dropdown */}
            <Menu as="div" className="relative">
              <MenuButton
                aria-label="Account settings"
                className="p-2 rounded-full text-neutral-500 hover:text-primary-600 hover:bg-primary-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </MenuButton>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="origin-top-right absolute right-0 mt-2 w-64 rounded-2xl shadow-modal bg-surface-white ring-1 ring-neutral-200 focus:outline-none z-50 overflow-hidden divide-y divide-neutral-100">
                  {/* ACCOUNT */}
                  <div className="py-1">
                    <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Account
                    </p>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/profile"
                          className={`group flex items-center px-4 py-2 text-sm transition-colors ${active
                            ? "bg-primary-50 text-primary-700"
                            : "text-neutral-700"
                            }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`mr-3 h-5 w-5 ${active ? "text-primary-500" : "text-neutral-400"
                              }`}
                            aria-hidden="true"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          Edit Profile
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/notifications"
                          className={`group flex items-center px-4 py-2 text-sm transition-colors ${active
                            ? "bg-primary-50 text-primary-700"
                            : "text-neutral-700"
                            }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`mr-3 h-5 w-5 ${active ? "text-primary-500" : "text-neutral-400"
                              }`}
                            aria-hidden="true"
                          >
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                          Notifications
                        </Link>
                      )}
                    </Menu.Item>
                  </div>

                  {/* SECURITY */}
                  <div className="py-1">
                    <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Security
                    </p>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/password"
                          className={`group flex items-center px-4 py-2 text-sm transition-colors ${active
                            ? "bg-primary-50 text-primary-700"
                            : "text-neutral-700"
                            }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`mr-3 h-5 w-5 ${active ? "text-primary-500" : "text-neutral-400"
                              }`}
                            aria-hidden="true"
                          >
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          Password
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/sessions"
                          className={`group flex items-center px-4 py-2 text-sm transition-colors ${active
                            ? "bg-primary-50 text-primary-700"
                            : "text-neutral-700"
                            }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`mr-3 h-5 w-5 ${active ? "text-primary-500" : "text-neutral-400"
                              }`}
                            aria-hidden="true"
                          >
                            <rect x="5" y="2" width="14" height="20" rx="2" />
                            <line x1="12" y1="18" x2="12.01" y2="18" />
                          </svg>
                          Sessions &amp; Auth Code
                        </Link>
                      )}
                    </Menu.Item>
                  </div>

                  {/* SIGN OUT */}
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogoutClick}
                          className={`group flex w-full items-center px-4 py-2 text-sm transition-colors ${active
                            ? "bg-danger/5 text-danger"
                            : "text-neutral-700"
                            }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`mr-3 h-5 w-5 ${active ? "text-danger" : "text-neutral-400"
                              }`}
                            aria-hidden="true"
                          >
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                          </svg>
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>

            {/* Avatar → opens HospitalProfileModal directly */}
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              aria-label="Hospital profile"
              className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 transition-shadow"
            >
              <span
                className={`block h-9 w-9 rounded-full ${getAvatarGradient(
                  hospital?.hospitalName,
                )} flex items-center justify-center text-white font-bold overflow-hidden text-xs ring-2 ring-white shadow-card`}
              >
                {hospital?.logoUrl && !isPlaceholderLogo(hospital.logoUrl) ? (
                  <img
                    className="h-full w-full object-cover"
                    src={hospital.logoUrl}
                    alt={hospital.hospitalName}
                  />
                ) : (
                  getInitials(hospital?.hospitalName)
                )}
              </span>
            </button>
          </div>
        </div>
      </div>

      <HospitalProfileModal
        hospital={hospital}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      {/* Logout confirmation modal — MUST portal to document.body. The nav is
          `fixed z-50` which creates its own stacking context; rendering the
          modal inline would trap its backdrop inside the nav region (CLAUDE.md §8). */}
      {isLogoutConfirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
          >
            <div
              className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm"
              onClick={() => setIsLogoutConfirmOpen(false)}
            />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <div className="relative transform overflow-hidden rounded-2xl bg-surface-white text-left shadow-modal ring-1 ring-neutral-200 transition-all sm:my-8 sm:w-full sm:max-w-md">
                <div className="px-6 pt-6 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-6 w-6"
                        aria-hidden="true"
                      >
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <h3
                        id="logout-modal-title"
                        className="font-heading text-lg font-bold text-neutral-900"
                      >
                        Sign out
                      </h3>
                      <p className="mt-1 text-sm text-neutral-500">
                        Are you sure you want to sign out from the system?
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 bg-neutral-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLogoutConfirmOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 bg-surface-white border border-neutral-200 hover:bg-neutral-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmLogout}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-danger hover:bg-danger/90 shadow-danger transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </nav>
  );
};
