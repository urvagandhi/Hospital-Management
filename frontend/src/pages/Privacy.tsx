/**
 * Privacy Policy — static legal page. Placeholder content for review by legal.
 */

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import appLogo from "../assets/logo.png";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const POLICY_VERSION = "1.0";
const LAST_UPDATED = "2026-04-14";

const sections = [
  {
    title: "What we collect",
    content: (
      <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-600">
        <li><span className="font-medium text-gray-700">Account data:</span> hospital name, email, phone, logo, address</li>
        <li><span className="font-medium text-gray-700">Auth data:</span> hashed password, Auth Code, session metadata (IP, user-agent, last-seen)</li>
        <li><span className="font-medium text-gray-700">Patient files</span> you upload: documents, images, PDFs stored on Cloudinary</li>
        <li><span className="font-medium text-gray-700">Audit logs:</span> login attempts, password changes, file access events</li>
        <li><span className="font-medium text-gray-700">Device data:</span> FCM push token (mobile only), biometric public key (mobile only)</li>
      </ul>
    ),
  },
  {
    title: "How we use it",
    content: (
      <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-600">
        <li>To authenticate you and enforce session limits (2-device mobile cap)</li>
        <li>To deliver the Service — store, retrieve, and organise patient records</li>
        <li>To send you notifications you've opted in to (login alerts, security alerts)</li>
        <li>To detect abuse, rate-limit suspicious activity, and investigate incidents</li>
        <li>To comply with legal obligations (retention, audit trails)</li>
      </ul>
    ),
  },
  {
    title: "Who we share with",
    content: (
      <>
        <p className="text-sm text-gray-600 mb-3">
          We do not sell your data. We share strictly with subprocessors required to deliver the Service:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-600">
          <li><span className="font-medium text-gray-700">Cloudinary</span> — encrypted file storage</li>
          <li><span className="font-medium text-gray-700">MongoDB Atlas</span> — database hosting</li>
          <li><span className="font-medium text-gray-700">Firebase Cloud Messaging</span> — push notifications</li>
          <li><span className="font-medium text-gray-700">Brevo / SMTP provider</span> — transactional email (OTPs, alerts)</li>
          <li><span className="font-medium text-gray-700">Render / Vercel</span> — application hosting</li>
          <li>Law enforcement when legally compelled</li>
        </ul>
      </>
    ),
  },
  {
    title: "Where it lives & how it's protected",
    content: (
      <p className="text-sm text-gray-600">
        Data is stored in cloud regions configured by your hospital administrator.
        In transit, TLS 1.2+ is enforced. At rest, passwords are hashed with bcrypt;
        file access increasingly uses short-lived signed URLs (5-minute TTL).
        Patient files are served privately once signed-URL mode is enabled.
      </p>
    ),
  },
  {
    title: "Retention & deletion",
    content: (
      <p className="text-sm text-gray-600">
        Patient records are retained until you delete them or until automated
        archival runs (currently 90 days by default). If your hospital account is
        deleted, personal identifiers are scrubbed; audit logs may be retained up
        to 3 years to comply with legal obligations.
      </p>
    ),
  },
  {
    title: "Your rights",
    content: (
      <>
        <p className="text-sm text-gray-600 mb-3">Depending on your jurisdiction, you may:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-600">
          <li>Access, correct, or export your data</li>
          <li>Delete your account (see Terms, Section 6)</li>
          <li>Opt out of non-essential notifications in Settings</li>
          <li>Withdraw consent for data processing, subject to legal obligations</li>
          <li>Lodge a complaint with your local data protection authority</li>
        </ul>
      </>
    ),
  },
  {
    title: "Cookies & sessions",
    content: (
      <p className="text-sm text-gray-600">
        The web app stores an HTTP-only refresh token cookie and access token
        cookie. No analytics cookies are used. Sessions expire after 365 days of
        inactivity or when revoked.
      </p>
    ),
  },
  {
    title: "Children",
    content: (
      <p className="text-sm text-gray-600">
        The Service is designed for hospital staff; it is not directed at children
        under 18. Patient records about minors are handled under your hospital's
        clinical protocols and applicable law.
      </p>
    ),
  },
  {
    title: "Changes",
    content: (
      <p className="text-sm text-gray-600">
        Material changes to this policy will be communicated via email and by
        bumping the version number. Continued use constitutes acceptance.
      </p>
    ),
  },
  {
    title: "Contact",
    content: (
      <p className="text-sm text-gray-600">
        For privacy requests, contact your hospital administrator or the email
        address listed on the login page. Requests are typically answered within
        30 days.
      </p>
    ),
  },
];

const Privacy: React.FC = () => {
  useDocumentTitle("Privacy Policy — MediVault");
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              Version {POLICY_VERSION}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
              Last updated {LAST_UPDATED}
            </span>
          </div>
          <p className="text-sm text-gray-600 max-w-xl">
            This policy explains what data we collect, how we use it, and your rights as a user of the HospitAll platform.
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

export default Privacy;
