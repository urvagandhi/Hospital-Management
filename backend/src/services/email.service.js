import nodemailer from "nodemailer";
import config from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: (config.SMTP_SECURE === "true") || (String(config.SMTP_PORT) === "465"),
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
  },
});

export const sendInvitationEmail = async (to, hospitalName, tempPassword) => {
  const signInUrl = `${config.FRONTEND_URL.replace(/\/+$/, "")}/login?email=${encodeURIComponent(to)}`;
  const subject = `You're invited to access ${hospitalName}`;

  const html = `
  <html>
    <body style="font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#f6f9fc; padding:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 8px 24px rgba(16,24,40,0.08);">
              <tr>
                <td style="padding:28px 32px; text-align:left;">
                  <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Invitation to ${hospitalName}</h1>
                  <p style="margin:0 0 18px; color:#475569; font-size:14px; line-height:1.5;">An administrator has created an account for you to access ${hospitalName}.</p>

                  <div style="background:#f1f5f9; padding:14px; border-radius:8px; margin-bottom:18px;">
                    <p style="margin:0; font-size:14px; color:#0f172a;"><strong>Sign-in details</strong></p>
                    <p style="margin:6px 0 0; font-size:13px; color:#334155;"><strong>Email:</strong> ${to}</p>
                    <p style="margin:6px 0 0; font-size:13px; color:#334155;"><strong>Temporary password:</strong> <span style="font-family: monospace; background:#fff; padding:2px 6px; border-radius:4px; border:1px solid #e2e8f0;">${tempPassword}</span></p>
                  </div>

                  <p style="margin:0 0 18px; color:#475569; font-size:14px;">Use the temporary password to sign in. On first login you will be prompted to change your password.</p>

                  <p style="margin:0 0 22px;">
                    <a href="${signInUrl}" style="display:inline-block; background:#0ea5e9; color:#fff; text-decoration:none; padding:10px 18px; border-radius:8px; font-weight:600;">Sign in to ${hospitalName}</a>
                  </p>

                  <p style="margin:0 0 8px; color:#94a3b8; font-size:12px;">If you did not expect this email, please contact your administrator.</p>

                  <p style="margin:18px 0 0; color:#94a3b8; font-size:12px;">— ${config.APP_NAME || "Hospital Management"} Team</p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc; padding:12px 32px; text-align:center; font-size:12px; color:#9ca3af;">If the button doesn't work, copy-paste this URL into your browser:<br/><a href="${signInUrl}" style="color:#60a5fa;">${signInUrl}</a></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;

  const mailOptions = {
    from: config.SMTP_FROM || `no-reply@${config.SMTP_HOST || "example.com"}`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
};

export const sendAccountLockedEmail = async (to, hospitalName, lockDurationMinutes) => {
  const subject = `Security Alert: Account Locked - ${hospitalName}`;
  const unlockTime = new Date(Date.now() + lockDurationMinutes * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const html = `
  <html>
    <body style="font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#f6f9fc; padding:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 8px 24px rgba(16,24,40,0.08); border-top: 4px solid #ef4444;">
              <tr>
                <td style="padding:28px 32px; text-align:left;">
                  <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Account Locked</h1>
                  <p style="margin:0 0 18px; color:#475569; font-size:14px; line-height:1.5;">
                    Your account for <strong>${hospitalName}</strong> has been temporarily locked due to too many failed authentication attempts.
                  </p>

                  <div style="background:#fef2f2; padding:14px; border-radius:8px; margin-bottom:18px; border: 1px solid #fee2e2;">
                    <p style="margin:0; font-size:14px; color:#991b1b;"><strong>Status: Locked</strong></p>
                    <p style="margin:6px 0 0; font-size:13px; color:#b91c1c;">Your account will automatically unlock in approximately <strong>${lockDurationMinutes} minutes</strong> (around ${unlockTime}).</p>
                  </div>

                  <p style="margin:0 0 18px; color:#475569; font-size:14px;">If this wasn't you, please contact your administrator immediately or reset your credentials once access is restored.</p>

                  <p style="margin:18px 0 0; color:#94a3b8; font-size:12px;">— ${config.APP_NAME || "Hospital Management"} Security Team</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;

  const mailOptions = {
    from: config.SMTP_FROM || `no-reply@${config.SMTP_HOST || "example.com"}`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
};

export default { sendInvitationEmail, sendAccountLockedEmail };
