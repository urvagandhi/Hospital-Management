/**
 * Privacy Policy — static legal page. Placeholder content for review by legal.
 */

import React from "react";
import { useNavigate } from "react-router-dom";

const POLICY_VERSION = "1.0";
const LAST_UPDATED = "2026-04-14";

const Privacy: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-blue-600 hover:underline mb-4"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-500 mb-6">Version {POLICY_VERSION} · Last updated {LAST_UPDATED}</p>

        <section className="prose prose-sm max-w-none text-gray-700 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900 mt-4">1. What we collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account data:</strong> hospital name, email, phone, logo, address</li>
              <li><strong>Auth data:</strong> hashed password, Auth Code, session metadata (IP, user-agent, last-seen)</li>
              <li><strong>Patient files</strong> you upload: documents, images, PDFs stored on Cloudinary</li>
              <li><strong>Audit logs:</strong> login attempts, password changes, file access events</li>
              <li><strong>Device data:</strong> FCM push token (mobile only), biometric public key (mobile only)</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">2. How we use it</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To authenticate you and enforce session limits (2-device mobile cap)</li>
              <li>To deliver the Service — store, retrieve, and organise patient records</li>
              <li>To send you notifications you've opted in to (login alerts, security alerts)</li>
              <li>To detect abuse, rate-limit suspicious activity, and investigate incidents</li>
              <li>To comply with legal obligations (retention, audit trails)</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">3. Who we share with</h2>
            <p>
              We do not sell your data. We share strictly with subprocessors required to
              deliver the Service:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Cloudinary</strong> — encrypted file storage</li>
              <li><strong>MongoDB Atlas</strong> — database hosting</li>
              <li><strong>Firebase Cloud Messaging</strong> — push notifications</li>
              <li><strong>Brevo / SMTP provider</strong> — transactional email (OTPs, alerts)</li>
              <li><strong>Render / Vercel</strong> — application hosting</li>
              <li>Law enforcement when legally compelled</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">4. Where it lives &amp; how it's protected</h2>
            <p>
              Data is stored in cloud regions configured by your hospital administrator.
              In transit, TLS 1.2+ is enforced. At rest, passwords are hashed with bcrypt;
              file access increasingly uses short-lived signed URLs (5-minute TTL).
              Patient files are served privately once signed-URL mode is enabled.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">5. Retention &amp; deletion</h2>
            <p>
              Patient records are retained until you delete them or until automated
              archival runs (currently 90 days by default). If your hospital account is
              deleted, personal identifiers are scrubbed; audit logs may be retained up
              to 3 years to comply with legal obligations.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">6. Your rights</h2>
            <p>Depending on your jurisdiction, you may:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access, correct, or export your data</li>
              <li>Delete your account (see Terms, Section 6)</li>
              <li>Opt out of non-essential notifications in Settings</li>
              <li>Withdraw consent for data processing, subject to legal obligations</li>
              <li>Lodge a complaint with your local data protection authority</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">7. Cookies &amp; sessions</h2>
            <p>
              The web app stores an HTTP-only refresh token cookie and access token
              cookie. No analytics cookies are used. Sessions expire after 365 days of
              inactivity or when revoked.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">8. Children</h2>
            <p>
              The Service is designed for hospital staff; it is not directed at children
              under 18. Patient records about minors are handled under your hospital's
              clinical protocols and applicable law.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">9. Changes</h2>
            <p>
              Material changes to this policy will be communicated via email and by
              bumping the version number. Continued use constitutes acceptance.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">10. Contact</h2>
            <p>
              For privacy requests, contact your hospital administrator or the email
              address listed on the login page. Requests are typically answered within
              30 days.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Privacy;
