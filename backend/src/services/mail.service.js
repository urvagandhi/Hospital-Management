import nodemailer from "nodemailer";

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
const APP_NAME = "Hospital HMS";
const SENDER_EMAIL = () => process.env.BREVO_SENDER_EMAIL || "noreply@hospital-hms.com";
const SENDER_NAME = () => process.env.BREVO_SENDER_NAME || APP_NAME;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send via Brevo REST API with retry (2 retries, 1 s delay).
 */
async function sendViaBrevo(to, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = SENDER_EMAIL();

  if (!apiKey) {
    console.error("[Brevo] BREVO_API_KEY is not set!");
    throw new Error("BREVO_API_KEY environment variable is not configured");
  }

  console.log(`[Brevo] Sending email to=${to}, from=${senderEmail}, subject="${subject}"`);

  const brevo = await import("@getbrevo/brevo");
  const apiInstance = new brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    apiKey,
  );

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.sender = { email: senderEmail, name: SENDER_NAME() };
  sendSmtpEmail.to = [{ email: to }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  const MAX_RETRIES = 2;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`[Brevo] Email sent successfully. messageId=${result?.body?.messageId}`);
      return { success: true, messageId: result?.body?.messageId };
    } catch (err) {
      const errBody = err?.body || err?.response?.body || err?.message || err;
      console.error(`[Brevo] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, JSON.stringify(errBody));
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(1000);
      }
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
    console.error(`[mail.service] Failed to send email to ${to}:`, err.message || err);
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
 * @param {'registration'|'login'} type
 */
export async function sendOTPEmail(to, otp, type) {
  const typeLabel = type === "registration" ? "Registration" : "Login";
  const subject = `Your OTP for ${typeLabel} — ${APP_NAME}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Verification Code</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      Use the following one-time password to complete your <strong>${typeLabel.toLowerCase()}</strong>.
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
 * @param {string} username
 * @param {string} [tempPassword] — temporary password (included if provided)
 */
export async function sendWelcomeEmail(to, hospitalName, username, tempPassword) {
  const subject = `Welcome to ${APP_NAME} — Your Account Details`;

  const credentialsBlock = tempPassword
    ? `
    <div style="background:#f1f5f9;padding:18px;border-radius:8px;margin-bottom:18px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 10px;font-size:14px;color:#0f172a;font-weight:700;">Your Login Credentials</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;width:120px;">Email / Username</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${username}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Temporary Password</td>
          <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:15px;color:#0f172a;font-weight:700;letter-spacing:1px;">${tempPassword}</td>
        </tr>
      </table>
    </div>
    <div style="background:#fffbeb;padding:12px;border-radius:8px;margin-bottom:18px;border:1px solid #fde68a;">
      <p style="margin:0;font-size:13px;color:#92400e;">&#9888; You will be asked to change your password on first login.</p>
    </div>`
    : `
    <div style="background:#f0fdf4;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:14px;color:#166534;"><strong>You're all set!</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#15803d;">You can sign in using your username (<strong>${username}</strong>) or your email address.</p>
    </div>`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Welcome!</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      Your account for <strong>${hospitalName}</strong> has been successfully created on ${APP_NAME}.
    </p>
    ${credentialsBlock}
    <p style="margin:0;color:#94a3b8;font-size:12px;">If you have any questions, please contact your administrator.</p>`;

  return sendEmail(to, subject, wrapHtml(body));
}

// ---------------------------------------------------------------------------
// 4. sendSessionRevokedEmail
// ---------------------------------------------------------------------------

/**
 * @param {string} to
 * @param {string} deviceInfo — e.g. "Chrome on Windows"
 */
export async function sendSessionRevokedEmail(to, deviceInfo) {
  const subject = `Session ended — ${APP_NAME}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">You've Been Logged Out</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      You have been logged out of ${APP_NAME} on <strong>${deviceInfo || "an unknown device"}</strong> because you signed in on a new device.
    </p>
    <div style="background:#fffbeb;padding:14px;border-radius:8px;margin-bottom:18px;border:1px solid #fde68a;">
      <p style="margin:0;font-size:14px;color:#92400e;"><strong>Previous device:</strong> ${deviceInfo || "Unknown"}</p>
    </div>
    <p style="margin:0 0 8px;color:#475569;font-size:14px;">If this wasn't you, please change your password immediately and contact your administrator.</p>
    <p style="margin:0;color:#94a3b8;font-size:12px;">Only one mobile session is allowed at a time for security.</p>`;

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
// Default export
// ---------------------------------------------------------------------------
export default {
  sendEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendSessionRevokedEmail,
  sendAccountLockedEmail,
};
