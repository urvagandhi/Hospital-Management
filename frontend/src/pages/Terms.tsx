/**
 * Terms & Conditions — static legal page.
 * Content is placeholder "version 1.0" — review with legal counsel before
 * going to production. Matches the `tcVersion` value sent by registration.
 */

import React from "react";
import { useNavigate } from "react-router-dom";

const TERMS_VERSION = "1.0";
const LAST_UPDATED = "2026-04-14";

const Terms: React.FC = () => {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Terms &amp; Conditions</h1>
        <p className="text-xs text-gray-500 mb-6">Version {TERMS_VERSION} · Last updated {LAST_UPDATED}</p>

        <section className="prose prose-sm max-w-none text-gray-700 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900 mt-4">1. Acceptance of Terms</h2>
            <p>
              By registering for and using the Hospital Management System (the "Service"),
              you ("Hospital", "you") agree to be bound by these Terms &amp; Conditions and
              our Privacy Policy. If you do not agree, do not use the Service.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">2. Account &amp; Access</h2>
            <p>
              Each hospital account is personal to the registering organisation. You are
              responsible for keeping your credentials (password, 6-digit Auth Code) and
              devices secure. You must notify us immediately of any unauthorised access.
              The Service supports up to two concurrent mobile sessions per account; a
              third sign-in will sign out the oldest device.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">3. Patient Data</h2>
            <p>
              You retain ownership of all patient records you upload. We act as a
              processor on your behalf. You are responsible for obtaining the necessary
              consents from patients under applicable law (including the Digital Personal
              Data Protection Act, 2023, or equivalent legislation in your jurisdiction)
              before uploading personal or sensitive health data.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Upload content that violates applicable law or another person's rights</li>
              <li>Attempt to reverse-engineer, probe, or circumvent security controls</li>
              <li>Share your Auth Code or login credentials with unauthorised persons</li>
              <li>Use the Service to store data unrelated to legitimate hospital operations</li>
              <li>Resell or sublicense access to the Service without written consent</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">5. Service Availability</h2>
            <p>
              We make reasonable efforts to keep the Service available but do not
              guarantee uninterrupted access. Scheduled maintenance, emergency fixes,
              and force-update rollouts may cause temporary unavailability. Records older
              than 90 days are subject to automated archival per your hospital's policy.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">6. Account Deletion</h2>
            <p>
              You may request account deletion at any time from the Delete Account
              screen. Deletion requests enter a grace period (default 30 days) during
              which you may cancel. Approved deletions remove your personal data; audit
              logs may be retained for up to 3 years to comply with legal obligations.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">7. Fees</h2>
            <p>
              Use of the Service may be subject to subscription or usage fees as
              communicated separately. Unpaid fees after 30 days may result in account
              suspension.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">8. Liability</h2>
            <p>
              The Service is provided "as is". To the extent permitted by law, we
              disclaim all implied warranties and will not be liable for indirect,
              incidental, or consequential damages, including loss of data. Our total
              liability is capped at the fees paid in the twelve months preceding the
              claim.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">9. Changes to These Terms</h2>
            <p>
              We may update these Terms. Material changes increment the version number;
              continued use after an update constitutes acceptance. If you disagree, you
              may request account deletion as described in Section 6.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">10. Contact</h2>
            <p>
              Questions about these Terms? Contact your system administrator or the
              email address listed on the login page.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Terms;
