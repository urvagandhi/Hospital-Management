import { Menu, Transition } from "@headlessui/react";
import React, { Fragment } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export const Navbar: React.FC = () => {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const { hospital } = state;

  // Temporary admin check until role field is added
  const isAdmin = hospital?.email === "admin@citymedical.com";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left Side: Logo & Navigation */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              {hospital?.logoUrl ? (
                <img className="h-8 w-auto" src={hospital.logoUrl} alt={hospital.hospitalName} />
              ) : (
                <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">{hospital?.hospitalName?.charAt(0) || "H"}</div>
              )}
              <span className="ml-3 text-xl font-semibold text-gray-900">{hospital?.hospitalName}</span>
            </div>

            {isAdmin && (
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/hospitals"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Hospitals List
                </Link>
              </div>
            )}
          </div>

          {/* Right Side: User Dropdown */}
          <div className="flex items-center">
            <Menu as="div" className="ml-3 relative">
              <div>
                <Menu.Button className="bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  <span className="sr-only">Open user menu</span>
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                    {hospital?.hospitalName?.charAt(0).toUpperCase()}
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
                <Menu.Items className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm text-gray-900 font-medium truncate">{hospital?.hospitalName}</p>
                    <p className="text-xs text-gray-500 truncate">{hospital?.email}</p>
                  </div>

                  <Menu.Item>
                    {({ active }) => (
                      <Link
                        to="/security"
                        className={`${active ? "bg-gray-100" : ""} block px-4 py-2 text-sm text-gray-700`}
                      >
                        Security Settings
                      </Link>
                    )}
                  </Menu.Item>

                  <Menu.Item>
                    {({ active }) => (
                      <button onClick={handleLogout} className={`${active ? "bg-gray-100" : ""} block w-full text-left px-4 py-2 text-sm text-gray-700`}>
                        Sign out
                      </button>
                    )}
                  </Menu.Item>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>
      </div>
    </nav>
  );
};
