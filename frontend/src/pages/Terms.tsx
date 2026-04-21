/**
 * Terms & Conditions — static legal page.
 * Content is placeholder "version 1.0" — review with legal counsel before
 * going to production. Matches the `tcVersion` value sent by registration.
 */

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import appLogo from "../assets/logo.png";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const TERMS_VERSION = "1.0";
const LAST_UPDATED = "2026-04-14";

const sections = [
  {
    title: "Acceptance of Terms",
    content: (
      <p className="text-sm text-gray-600">
        By registering for and using the Hospital Management System (the "Service"),
        you ("Hospital", "you") agree to be bound by these Terms &amp; Conditions and
        our Privacy Policy. If you do not agree, do not use the Service.
      </p>
    ),
  },
  {
    title: "Account & Access",
    content: (
      <p className="text-sm text-gray-600">
        Each hospital account is personal to the registering organisation. You are
        responsible for keeping your credentials (password, 6-digit Auth Code) and
        devices secure. You must notify us immediately of any unauthorised access.
        The Service supports up to two concurrent mobile sessions per account; a
        third sign-in will sign out the oldest device.
      </p>
    ),
  },
  {
    title: "Patient Data",
    content: (
      <p className="text-sm text-gray-600">
        You retain ownership of all patient records you upload. We act as a
        processor on your behalf. You are responsible for obtaining the necessary
        consents from patients under applicable law (including the Digital Personal
        Data Protection Act, 2023, or equivalent legislation in your jurisdiction)
        before uploading personal or sensitive health data.
      </p>
    ),
  },
  {
    title: "Acceptable Use",
    content: (
      <>
        <p className="text-sm text-gray-600 mb-3">You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-600">
          <li>Upload content that violates applicable law or another person's rights</li>
          <li>Attempt to reverse-engineer, probe, or circumvent security controls</li>
          <li>Share your Auth Code or login credentials with unauthorised persons</li>
          <li>Use the Service to store data unrelated to legitimate hospital operations</li>
          <li>Resell or sublicense access to the Service without written consent</li>
        </ul>
      </>
    ),
  },
  {
    title: "Service Availability",
    content: (
      <p className="text-sm text-gray-600">
        We make reasonable efforts to keep the Service available but do not
        guarantee uninterrupted access. Scheduled maintenance, emergency fixes,
        and force-update rollouts may cause temporary unavailability. Records older
        than 90 days are subject to automated archival per your hospital's policy.
      </p>
    ),
  },
  {
    title: "Account Deletion",
    content: (
      <p className="text-sm text-gray-600">
        You may request account deletion at any time from the Delete Account
        screen. Deletion requests enter a grace period (default 30 days) during
        which you may cancel. Approved deletions remove your personal data; audit
        logs may be retained for up to 3 years to comply with legal obligations.
      </p>
    ),
  },
  {
    title: "Fees",
    content: (
      <p className="text-sm text-gray-600">
        Use of the Service may be subject to subscription or usage fees as
        communicated separately. Unpaid fees after 30 days may result in account
        suspension.
      </p>
    ),
  },
  {
    title: "Liability",
    content: (
      <p className="text-sm text-gray-600">
        The Service is provided "as is". To the extent permitted by law, we
        disclaim all implied warranties and will not be liable for indirect,
        incidental, or consequential damages, including loss of data. Our total
        liability is capped at the fees paid in the twelve months preceding the
        claim.
      </p>
    ),
  },
  {
    title: "Changes to These Terms",
    content: (
      <p className="text-sm text-gray-600">
        We may update these Terms. Material changes increment the version number;
        continued use after an update constitutes acceptance. If you disagree, you
        may request account deletion as described in Section 6.
      </p>
    ),
  },
  {
    title: "Contact",
    content: (
      <p className="text-sm text-gray-600">
        Questions about these Terms? Contact your system administrator or the
        email address listed on the login page.
      </p>
    ),
  },
];

const Terms: React.FC = () => {
  useDocumentTitle("Terms of Service — Hospital Management");
  const navigate = useNavigate();
  const location = useLocation();

  // Return to the previous page (e.g. /login) rather than always going home.
  // Fall back to "/" when the user opened this URL directly and has no history.
  const handleBack = () => {
    if (location.key && location.key !== "default") navigate(-1);
    else navigate("/");
  };

  return (
    <div className="bg-white min-h-screen">
      {/* Sticky Navbar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={appLogo} alt="HospitAll logo" className="h-7 w-7 rounded-md object-cover" />
            <span className="text-sm font-semibold text-gray-900">HospitAll</span>
          </div>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </button>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="border-b border-gray-100 bg-gray-50 py-10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 mb-4">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Terms &amp; Conditions</h1>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              Version {TERMS_VERSION}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
              Last updated {LAST_UPDATED}
            </span>
          </div>
          <p className="text-sm text-gray-600 max-w-xl">
            Please read these terms carefully before using the HospitAll platform. By using the Service, you agree to be bound by these conditions.
          </p>
        </div>
      </header>

      {/* Sections */}
      <main className="max-w-4xl mx-auto px-6 pb-20">
        {sections.map((section, index) => (
          <div
            key={index}
            className="py-7 border-b border-gray-100 last:border-b-0"
          >
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex-shrink-0">
                {index + 1}
              </span>
              {section.title}
            </h2>
            <div className="pl-8">{section.content}</div>
          </div>
        ))}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 py-6">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} HospitAll. All rights reserved.
          </p>
          <button
            onClick={() => navigate("/")}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Return to landing page &rarr;
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Terms;
