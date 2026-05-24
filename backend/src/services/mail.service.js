import nodemailer from "nodemailer";
import config from "../config/env.js";
import logger from "../utils/logger.js";
import { geolocateIp, formatLocation } from "./geoip.service.js";

// ---------------------------------------------------------------------------
// Mailtrap transporter (lazy-loaded in development only)
// ---------------------------------------------------------------------------
let mailtrapTransporter = null;

function getMailtrapTransporter() {
  if (mailtrapTransporter) return mailtrapTransporter;

  mailtrapTransporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: Number(process.env.MAILTRAP_PORT) || 2525,
    auth: {
      user: process.env.MAILTRAP_USER,
      pass: process.env.MAILTRAP_PASS,
    },
  });
  return mailtrapTransporter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const APP_NAME = "MyMediVault";
const SENDER_EMAIL = () => process.env.BREVO_SENDER_EMAIL || "noreply@hospital-hms.com";
const SENDER_NAME = () => process.env.BREVO_SENDER_NAME || APP_NAME;

/** Escape HTML special characters to prevent injection in email templates */
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send via Brevo REST API (direct HTTP, no SDK).
 * Retries up to 2 times with 1 s delay.
 */
async function sendViaBrevo(to, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = SENDER_EMAIL();

  if (!apiKey) {
    logger.error({ event: "brevo_not_configured" }, "[Brevo] BREVO_API_KEY is not set!");
    throw new Error("BREVO_API_KEY environment variable is not configured");
  }

  logger.info(
    { event: "mail_sending", provider: "brevo", to, from: senderEmail, subject },
    `[Brevo] Sending email to=${to}, from=${senderEmail}, subject="${subject}"`,
  );

  const payload = JSON.stringify({
    sender: { name: SENDER_NAME(), email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent,
  });

  const MAX_RETRIES = 2;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: payload,
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        logger.info(
          { event: "mail_sent", provider: "brevo", to, messageId: body.messageId },
          `[Brevo] Email sent successfully. messageId=${body.messageId}`,
        );
        return { success: true, messageId: body.messageId };
      }

      // Brevo returned an error
      const errMsg = body.message || JSON.stringify(body);
      const failEvent = res.status === 429 ? "brevo_rate_limited" : "mail_failed";
      logger.error(
        { event: failEvent, provider: "brevo", to, status: res.status, attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1, errMsg },
        `[Brevo] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${res.status}): ${errMsg}`,
      );
      lastError = new Error(`Brevo API error ${res.status}: ${errMsg}`);
    } catch (err) {
      logger.error(
        { event: "mail_retry", provider: "brevo", to, attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1, err },
        `[Brevo] Attempt ${attempt + 1}/${MAX_RETRIES + 1} network error`,
      );
      lastError = err;
    }

    if (attempt < MAX_RETRIES) {
      await sleep(1000);
    }
  }
  throw lastError;
}

/**
 * Send via Mailtrap (nodemailer SMTP).
 */
async function sendViaMailtrap(to, subject, htmlContent) {
  const transporter = getMailtrapTransporter();
  const info = await transporter.sendMail({
    from: `"${SENDER_NAME()}" <${SENDER_EMAIL()}>`,
    to,
    subject,
    html: htmlContent,
  });
  return { success: true, messageId: info.messageId };
}

// ---------------------------------------------------------------------------
// 1. Unified sendEmail
// ---------------------------------------------------------------------------

/**
 * Send an email. Uses Mailtrap in development, Brevo in production.
 * Never throws — returns { success, error? }.
 */
export async function sendEmail(to, subject, htmlContent) {
  try {
    if (process.env.NODE_ENV === "production") {
      return await sendViaBrevo(to, subject, htmlContent);
    }
    return await sendViaMailtrap(to, subject, htmlContent);
  } catch (err) {
    logger.error(
      { event: "mail_failed", to, err },
      `[mail.service] Failed to send email to ${to}`,
    );
    return { success: false, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Shared HTML wrapper
// ---------------------------------------------------------------------------

function wrapHtml(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:24px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 8px 24px rgba(16,24,40,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:20px 32px;">
            <h1 style="margin:0;font-size:18px;color:#ffffff;font-weight:700;">${APP_NAME}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">${bodyContent}</td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:14px 32px;text-align:center;font-size:12px;color:#9ca3af;">
            This is an automated message from ${APP_NAME}. Please do not reply.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 2. sendOTPEmail
// ---------------------------------------------------------------------------

/**
 * @param {string} to
 * @param {string} otp   — 6-digit code
 * @param {'registration'|'login'|'contact_change'} type
 */
export async function sendOTPEmail(to, otp, type) {
  let typeLabel;
  let typeBody;
  if (type === "registration") {
    typeLabel = "Registration";
    typeBody = "registration";
  } else if (type === "contact_change") {
    typeLabel = "Contact Change";
    typeBody = "email or phone change";
  } else {
    typeLabel = "Login";
    typeBody = "login";
  }
  const subject = `Your OTP for ${typeLabel} — ${APP_NAME}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Verification Code</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      Use the following one-time password to complete your <strong>${typeBody}</strong>.
    </p>
    <div style="background:#f1f5f9;padding:22px;border-radius:8px;margin-bottom:18px;text-align:center;">
      <p style="margin:0;font-size:36px;font-family:'Courier New',monospace;letter-spacing:10px;color:#0f172a;font-weight:700;">${otp}</p>
    </div>
    <p style="margin:0 0 6px;color:#ef4444;font-size:13px;font-weight:600;">Valid for 10 minutes</p>
    <p style="margin:0;color:#94a3b8;font-size:12px;">If you did not request this code, you can safely ignore this email.</p>`;

  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// 3. sendWelcomeEmail
// ---------------------------------------------------------------------------

/**
 * @param {string} to
 * @param {string} hospitalName
 * @param {string} loginId — the email used to log in
 * @param {string} [tempPassword] — temporary password (included if provided)
 * @param {string} [authCode] — unique 6-char auth code for login verification
 */
export async function sendWelcomeEmail(to, hospitalName, loginId, tempPassword, authCode) {
  const safeHospital = escapeHtml(hospitalName);
  const safeLoginId = escapeHtml(loginId);
  const safeTempPassword = escapeHtml(tempPassword);
  const safeAuthCode = escapeHtml(authCode || "");
  const subject = `Welcome to ${APP_NAME} — Your Account Details`;

  const authCodeRow = authCode
    ? `
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Auth Code</td>
          <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:16px;color:#1e40af;font-weight:700;letter-spacing:2px;">${safeAuthCode}</td>
        </tr>`
    : "";

  const credentialsBlock = tempPassword
    ? `
    <div style="background:#f1f5f9;padding:18px;border-radius:8px;margin-bottom:18px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 10px;font-size:14px;color:#0f172a;font-weight:700;">Your Login Credentials</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;width:140px;">Email</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${safeLoginId}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Temporary Password</td>
          <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:15px;color:#0f172a;font-weight:700;letter-spacing:1px;">${safeTempPassword}</td>
        </tr>
        ${authCodeRow}
      </table>
    </div>
    <div style="background:#fffbeb;padding:12px;border-radius:8px;margin-bottom:18px;border:1px solid #fde68a;">
      <p style="margin:0;font-size:13px;color:#92400e;">&#9888; You will be asked to change your password on first login.</p>
    </div>
    ${authCode ? `
    <div style="background:#eff6ff;padding:12px;border-radius:8px;margin-bottom:18px;border:1px solid #bfdbfe;">
      <p style="margin:0;font-size:13px;color:#1e40af;">&#128274; Your <strong>Auth Code</strong> is required every time you log in. Keep it private and memorize it.</p>
    </div>` : ""}`
    : `
    <div style="background:#f0fdf4;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:14px;color:#166534;"><strong>You're all set!</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#15803d;">You can sign in using your email (<strong>${safeLoginId}</strong>) or phone number.</p>
      ${authCode ? `
      <p style="margin:10px 0 0;font-size:13px;color:#15803d;">Your Auth Code: <strong style="font-family:'Courier New',monospace;letter-spacing:2px;color:#1e40af;">${safeAuthCode}</strong></p>` : ""}
    </div>`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Welcome!</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      Your account for <strong>${safeHospital}</strong> has been successfully created on ${APP_NAME}.
    </p>
    ${credentialsBlock}
    <p style="margin:0;color:#94a3b8;font-size:12px;">If you have any questions, please contact your administrator.</p>`;

  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// 4. sendSessionRevokedEmail
// ---------------------------------------------------------------------------

/**
 * Humanize a raw User-Agent into a short readable device label.
 * Falls back to the raw UA (trimmed) if no pattern matches, so nothing
 * disappears silently.
 */
function humanizeUserAgent(ua) {
  if (!ua || typeof ua !== "string") return "Unknown device";
  const s = ua.trim();

  // Our custom Android UA, e.g.
  //   "HospitalHMS-Android/1.0.0 (Android 14; samsung SM-G991B)"
  const ours = s.match(/HospitalHMS-Android\/[\w.+-]+\s*\(Android\s*([\w.]+);\s*([^)]+)\)/i);
  if (ours) return `${ours[2].trim()} (Android ${ours[1]})`;

  if (/okhttp/i.test(s)) return "Android app";
  if (/CFNetwork|Darwin|iPhone|iPad|iOS/i.test(s)) return "iOS device";

  let browser = null;
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\//.test(s)) browser = "Opera";
  else if (/Chrome\//.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s)) browser = "Safari";

  let os = null;
  if (/Windows NT/.test(s)) os = "Windows";
  else if (/Mac OS X/.test(s)) os = "macOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/Linux/.test(s)) os = "Linux";

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

/**
 * Send a "session ended" email.
 * @param {string} to
 * @param {string|object} info — either a raw UA string (legacy) OR
 *   { oldDevice, newDevice, reason } where reason is one of
 *   "SESSION_LIMIT_EXCEEDED" | "ADMIN_REVOKE" | "SESSION_CONFLICT".
 */
export async function sendSessionRevokedEmail(to, info) {
  const parsed = typeof info === "string"
    ? { oldDevice: info, newDevice: null, reason: null }
    : (info || {});
  const oldLabel = escapeHtml(humanizeUserAgent(parsed.oldDevice));
  const newLabel = parsed.newDevice ? escapeHtml(humanizeUserAgent(parsed.newDevice)) : null;
  const reason = parsed.reason || null;

  const subject = `Session ended — ${APP_NAME}`;

  let headline;
  let explainer;
  if (reason === "SESSION_LIMIT_EXCEEDED") {
    const limit = config.MOBILE_SESSION_LIMIT;
    headline = "A device was signed out to make room";
    explainer = newLabel
      ? `A new sign-in on <strong>${newLabel}</strong> exceeded your ${limit}-device mobile limit, so the oldest session on <strong>${oldLabel}</strong> was ended.`
      : `A new sign-in exceeded your ${limit}-device mobile limit, so the oldest session on <strong>${oldLabel}</strong> was ended.`;
  } else if (reason === "ADMIN_REVOKE") {
    headline = "A session was ended";
    explainer = `The session on <strong>${oldLabel}</strong> was ended from another of your devices.`;
  } else {
    // Fallback / SESSION_CONFLICT / legacy string call
    headline = "You've been signed out";
    explainer = newLabel
      ? `You've been signed out of ${APP_NAME} on <strong>${oldLabel}</strong> because you signed in on <strong>${newLabel}</strong>.`
      : `You've been signed out of ${APP_NAME} on <strong>${oldLabel}</strong>.`;
  }

  const previousBlock = `
    <div style="background:#fffbeb;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #fde68a;">
      <p style="margin:0 0 4px;font-size:14px;color:#92400e;"><strong>Signed-out device:</strong> ${oldLabel}</p>
      ${newLabel ? `<p style="margin:0;font-size:14px;color:#92400e;"><strong>New device:</strong> ${newLabel}</p>` : ""}
    </div>`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${headline}</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">${explainer}</p>
    ${previousBlock}
    <p style="margin:0 0 8px;color:#475569;font-size:14px;">If this wasn't you, please change your password immediately and contact your administrator.</p>
    <p style="margin:0;color:#94a3b8;font-size:12px;">Up to 2 mobile devices can stay signed in at the same time for security.</p>`;

  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// 4a. sendForgotPasswordOtpEmail
// ---------------------------------------------------------------------------

/**
 * Send the 6-digit OTP used to authorize a password reset.
 * @param {string} to
 * @param {string} otp
 */
export async function sendForgotPasswordOtpEmail(to, otp) {
  const subject = `Password Reset Code — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Reset your password</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      We received a request to reset your ${APP_NAME} password. Use the code below to continue.
    </p>
    <div style="background:#f1f5f9;padding:22px;border-radius:8px;margin-bottom:18px;text-align:center;">
      <p style="margin:0;font-size:36px;font-family:'Courier New',monospace;letter-spacing:10px;color:#0f172a;font-weight:700;">${escapeHtml(otp)}</p>
    </div>
    <p style="margin:0 0 6px;color:#ef4444;font-size:13px;font-weight:600;">Valid for 10 minutes</p>
    <p style="margin:0;color:#94a3b8;font-size:12px;">If you did not request this reset, ignore this email and your password will stay the same.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// 4b. sendPasswordResetNoticeEmail
// ---------------------------------------------------------------------------

/**
 * Notify the hospital that their password was just reset. Sent to the primary
 * email after a successful forgot-password or settings-based change.
 * @param {string} to
 * @param {'reset'|'changed'} kind
 */
export async function sendPasswordResetNoticeEmail(to, kind = "reset") {
  const headline = kind === "reset" ? "Your password was reset" : "Your password was changed";
  const subject = `${headline} — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${headline}</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      All existing sessions have been signed out. You can sign in again with your new password.
    </p>
    <div style="background:#fef2f2;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #fee2e2;">
      <p style="margin:0;font-size:14px;color:#991b1b;"><strong>Didn't do this?</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#b91c1c;">Contact your administrator immediately — your account may be compromised.</p>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated security notice.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// 4c. sendContactChangedNoticeEmail
// ---------------------------------------------------------------------------

/**
 * Notify the hospital that their email or phone on file was just changed.
 * For an email change, the caller sends this to BOTH the old and the new
 * address (old = security alert; new = confirmation). For a phone change,
 * there's only the current email on file, so just one recipient.
 *
 * @param {string} to
 * @param {{field:'email'|'phone', oldValue:string, newValue:string, recipient:'old'|'new'|'current'}} info
 */
export async function sendContactChangedNoticeEmail(to, info) {
  const { field, oldValue, newValue, recipient } = info || {};
  const fieldLabel = field === "email" ? "Email address" : "Phone number";
  const subject = `${fieldLabel} changed — ${APP_NAME}`;

  const oldSafe = escapeHtml(String(oldValue || ""));
  const newSafe = escapeHtml(String(newValue || ""));

  let headline, lead;
  if (recipient === "new") {
    headline = `Your ${fieldLabel.toLowerCase()} was confirmed`;
    lead = `This ${fieldLabel.toLowerCase()} is now the primary contact on your ${APP_NAME} account.`;
  } else {
    headline = `Your ${fieldLabel.toLowerCase()} was changed`;
    lead = `The ${fieldLabel.toLowerCase()} on your ${APP_NAME} account was just updated.`;
  }

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${headline}</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">${lead}</p>
    <div style="background:#f1f5f9;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;width:120px;">Previous</td>
          <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:13px;color:#0f172a;">${oldSafe}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">New</td>
          <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:13px;color:#0f172a;font-weight:700;">${newSafe}</td>
        </tr>
      </table>
    </div>
    <div style="background:#fef2f2;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #fee2e2;">
      <p style="margin:0;font-size:14px;color:#991b1b;"><strong>Didn't do this?</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#b91c1c;">Contact your administrator immediately — your account may be compromised.</p>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated security notice.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// 5. sendAccountLockedEmail
// ---------------------------------------------------------------------------

/**
 * @param {string} to
 * @param {number} unlockMinutes
 */
export async function sendAccountLockedEmail(to, unlockMinutes) {
  const subject = `Account Locked — ${APP_NAME}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#dc2626;">Account Locked</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      Your account has been temporarily locked due to multiple failed login attempts.
    </p>
    <div style="background:#fef2f2;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #fee2e2;">
      <p style="margin:0;font-size:14px;color:#991b1b;"><strong>Status:</strong> Locked</p>
      <p style="margin:6px 0 0;font-size:13px;color:#b91c1c;">Your account will automatically unlock in <strong>${unlockMinutes} minute${unlockMinutes === 1 ? "" : "s"}</strong>.</p>
    </div>
    <p style="margin:0 0 8px;color:#475569;font-size:14px;">If this wasn't you, please contact your administrator immediately.</p>
    <p style="margin:0;color:#94a3b8;font-size:12px;">Do not attempt to sign in until the lock period expires.</p>`;

  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// sendNewLoginAlertEmail — notify hospital when a new device signs in.
// Gated by notificationPrefs.newLoginAlert at the caller.
// ---------------------------------------------------------------------------
export async function sendNewLoginAlertEmail(to, info) {
  const device = escapeHtml(humanizeUserAgent(info?.userAgent));
  const ip = escapeHtml(info?.ipAddress || "unknown");
  const when = info?.when ? new Date(info.when).toLocaleString() : new Date().toLocaleString();
  const locationLabel = escapeHtml(formatLocation(await geolocateIp(info?.ipAddress)));
  const subject = `New sign-in — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">New sign-in to your account</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      A new device just signed in to your ${APP_NAME} account.
    </p>
    <div style="background:#eff6ff;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #bfdbfe;">
      <p style="margin:0 0 6px;font-size:14px;color:#1e3a8a;"><strong>Device:</strong> ${device}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#1e3a8a;"><strong>IP:</strong> ${ip}${locationLabel ? ` &middot; ${locationLabel}` : ""}</p>
      <p style="margin:0;font-size:14px;color:#1e3a8a;"><strong>When:</strong> ${escapeHtml(when)}</p>
    </div>
    <p style="margin:0 0 8px;color:#475569;font-size:14px;">If this was you, no action is needed.</p>
    <p style="margin:0;color:#991b1b;font-size:13px;">If you don't recognise this sign-in, change your password immediately and revoke active sessions from Security Settings.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// sendPasswordChangedEmail — security alert when password is changed.
// Gated by notificationPrefs.securityAlerts at the caller.
// ---------------------------------------------------------------------------
export async function sendPasswordChangedEmail(to, info) {
  const when = info?.when ? new Date(info.when).toLocaleString() : new Date().toLocaleString();
  const ip = escapeHtml(info?.ipAddress || "unknown");
  const locationLabel = escapeHtml(formatLocation(await geolocateIp(info?.ipAddress)));
  const subject = `Password changed — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Your password was changed</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      The password for your ${APP_NAME} account was changed. All other devices have been signed out.
    </p>
    <div style="background:#f0fdf4;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #bbf7d0;">
      <p style="margin:0 0 6px;font-size:14px;color:#14532d;"><strong>When:</strong> ${escapeHtml(when)}</p>
      <p style="margin:0;font-size:14px;color:#14532d;"><strong>IP:</strong> ${ip}${locationLabel ? ` &middot; ${locationLabel}` : ""}</p>
    </div>
    <p style="margin:0;color:#991b1b;font-size:13px;">If you didn't change your password, contact your administrator immediately.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// Admin actions: disable / re-enable / delete hospital account.
// Each sends a plain-language notice to the affected hospital. Called from
// updateHospital / adminForceDelete — see hospitals.controller.js.
// ---------------------------------------------------------------------------
export async function sendAccountDisabledEmail(to, info) {
  const name = escapeHtml(info?.hospitalName || "Hospital");
  const reason = info?.reason ? escapeHtml(info.reason) : "";
  const subject = `Your account has been disabled — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Account disabled</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.6;">
      Hi <strong>${name}</strong>, an administrator has disabled your ${APP_NAME} account.
      You won't be able to sign in until the account is re-enabled.
    </p>
    ${reason ? `<div style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:8px;margin-bottom:14px;"><p style="margin:0;font-size:13px;color:#7c2d12;"><strong>Reason:</strong> ${reason}</p></div>` : ""}
    <p style="margin:0;color:#475569;font-size:14px;">If you believe this is a mistake, please contact your administrator.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

export async function sendAccountEnabledEmail(to, info) {
  const name = escapeHtml(info?.hospitalName || "Hospital");
  const subject = `Your account has been re-enabled — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Account re-enabled</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.6;">
      Good news, <strong>${name}</strong> — your ${APP_NAME} account has been re-enabled by an administrator.
      You can now sign in as usual.
    </p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

export async function sendAccountDeletedEmail(to, info) {
  const name = escapeHtml(info?.hospitalName || "Hospital");
  const reason = info?.reason ? escapeHtml(info.reason) : "";
  const subject = `Your account has been deleted — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#991b1b;">Account deleted</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.6;">
      Hi <strong>${name}</strong>, an administrator has permanently deleted your ${APP_NAME} account.
      All active sessions have been revoked and you will no longer be able to sign in.
    </p>
    ${reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:8px;margin-bottom:14px;"><p style="margin:0;font-size:13px;color:#991b1b;"><strong>Reason:</strong> ${reason}</p></div>` : ""}
    <p style="margin:0;color:#475569;font-size:14px;">If you have questions, please contact your administrator.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// sendLogoutConfirmationEmail — confirm a manual sign-out from a device.
// Fired by /api/auth/logout, fire-and-forget.
// ---------------------------------------------------------------------------
export async function sendLogoutConfirmationEmail(to, info) {
  const device = escapeHtml(humanizeUserAgent(info?.userAgent));
  const ip = escapeHtml(info?.ipAddress || "unknown");
  const when = info?.when ? new Date(info.when).toLocaleString() : new Date().toLocaleString();
  const locationLabel = escapeHtml(formatLocation(await geolocateIp(info?.ipAddress)));
  const subject = `Signed out — ${APP_NAME}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">You've been signed out</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      You successfully signed out of ${APP_NAME} on the device below.
    </p>
    <div style="background:#f1f5f9;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #cbd5e1;">
      <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Device:</strong> ${device}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>IP:</strong> ${ip}${locationLabel ? ` &middot; ${locationLabel}` : ""}</p>
      <p style="margin:0;font-size:14px;color:#0f172a;"><strong>When:</strong> ${escapeHtml(when)}</p>
    </div>
    <p style="margin:0 0 8px;color:#475569;font-size:14px;">If this wasn't you, change your password immediately and revoke any unfamiliar sessions from Security Settings.</p>`;
  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------
export default {
  sendEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendSessionRevokedEmail,
  sendAccountLockedEmail,
  sendForgotPasswordOtpEmail,
  sendPasswordResetNoticeEmail,
  sendContactChangedNoticeEmail,
  sendNewLoginAlertEmail,
  sendPasswordChangedEmail,
  sendLogoutConfirmationEmail,
  sendAccountDisabledEmail,
  sendAccountEnabledEmail,
  sendAccountDeletedEmail,
};
