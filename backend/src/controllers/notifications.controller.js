/**
 * Notifications Controller
 * Test and preview push notification payloads.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseDeviceInfo, sendPushToUser } from "../services/push.service.js";
import Hospital from "../models/Hospital.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Embed the app logo as base64 for the HTML preview — loaded once at startup
const _logoB64 = (() => {
  try {
    const p = join(__dirname, "../../../android-app/app/src/main/res/drawable/ic_platform_logo.png");
    return readFileSync(p).toString("base64");
  } catch {
    return null;
  }
})();
const APP_ICON_HTML = _logoB64
  ? `<img src="data:image/png;base64,${_logoB64}" class="notif-app-logo"/>`
  : `<div class="notif-app-icon"></div>`;

const NOTIF_LARGE_ICON_HTML = _logoB64
  ? `<img src="data:image/png;base64,${_logoB64}" class="notif-large-icon"/>`
  : `<div class="notif-icon-fallback"></div>`;

// Predefined notification templates (mirrors push.service.js payloads)
const TEMPLATES = {
  NEW_LOGIN: (device) => ({
    title: "New Sign-in Detected",
    body: `Your account was accessed from ${device}. If this wasn't you, review your active sessions.`,
  }),
  SESSION_REVOKED: () => ({
    title: "Session Ended",
    body: "You've been signed out on this device because you signed in elsewhere.",
  }),
  PASSWORD_CHANGED: () => ({
    title: "Password Changed",
    body: "Your account password was just changed. Other devices have been signed out.",
  }),
};

/**
 * POST /api/notifications/test
 * Sends a test push notification to the authenticated user's registered device.
 * Useful for previewing how each notification type looks on the actual device.
 *
 * Body:
 *   type       - "NEW_LOGIN" | "SESSION_REVOKED" | "PASSWORD_CHANGED" | "CUSTOM"
 *   userAgent  - (optional) UA string to parse; defaults to the request's User-Agent header
 *   title      - (required for CUSTOM) custom title
 *   body       - (required for CUSTOM) custom body
 */
export async function sendTestNotification(req, res) {
  try {
    const userId = req.hospital.id;
    const { type = "NEW_LOGIN", userAgent, title: customTitle, body: customBody } = req.body;

    const ua = userAgent || req.headers["user-agent"] || "";
    const device = parseDeviceInfo(ua);

    let payload;
    if (type === "CUSTOM") {
      if (!customTitle || !customBody) {
        return res.status(400).json({ error: "title and body are required for CUSTOM type" });
      }
      payload = { title: customTitle, body: customBody };
    } else {
      const templateFn = TEMPLATES[type];
      if (!templateFn) {
        return res.status(400).json({
          error: `Unknown type. Valid types: ${Object.keys(TEMPLATES).join(", ")}, CUSTOM`,
        });
      }
      payload = templateFn(device);
    }

    // Check whether the user even has an FCM token registered
    const hospital = await Hospital.findById(userId).select("fcmToken").lean();
    const hasToken = !!hospital?.fcmToken?.token;

    let sendResult = { success: false, reason: "no_token" };
    if (hasToken) {
      sendResult = await sendPushToUser(userId, payload.title, payload.body, { type });
    }

    res.json({
      preview: {
        type,
        title: payload.title,
        body: payload.body,
        parsedDevice: type === "NEW_LOGIN" ? device : undefined,
      },
      sent: sendResult.success,
      reason: sendResult.success ? undefined : (sendResult.reason || sendResult.error || "unknown"),
      hint: hasToken ? undefined : "No FCM token registered on this account — open the Android app to register a device first.",
    });
  } catch (error) {
    console.error("[notifications.controller] sendTestNotification error:", error.message);
    res.status(500).json({ error: "Failed to send test notification" });
  }
}

/**
 * GET /api/notifications/preview
 * Returns all notification templates as JSON — no push sent, no auth required.
 * Pass ?userAgent=<string> to test the UA parser with a custom agent.
 */
export function previewNotifications(req, res) {
  const ua = req.query.userAgent || req.headers["user-agent"] || "";
  const device = parseDeviceInfo(ua);

  const previews = Object.entries(TEMPLATES).map(([type, fn]) => ({
    type,
    ...fn(device),
  }));

  res.json({
    parsedDevice: device,
    userAgent: ua,
    templates: previews,
  });
}

/**
 * GET /api/notifications/sample
 * Renders a visual HTML mockup of every notification type — no auth, no push sent.
 * Simulates how each notification appears on the Android device.
 * Pass ?userAgent=<ua-string> to test with a specific device UA.
 */
export function sampleNotifications(req, res) {
  const ua = req.query.userAgent || req.headers["user-agent"] || "";
  const device = parseDeviceInfo(ua);

  const notifications = [
    { type: "NEW_LOGIN", ...TEMPLATES.NEW_LOGIN(device), icon: "🔔", time: "just now" },
    { type: "SESSION_REVOKED", ...TEMPLATES.SESSION_REVOKED(), icon: "🔔", time: "2 min ago" },
    { type: "PASSWORD_CHANGED", ...TEMPLATES.PASSWORD_CHANGED(), icon: "🔔", time: "5 min ago" },
  ];

  const notifCards = notifications
    .map(
      ({ title, body, time }) => `
      <div class="notif-card">
        <div class="notif-app-bar">
          ${APP_ICON_HTML}
          <span class="notif-app-name">HospitALL</span>
          <span class="notif-time">${time}</span>
        </div>
        <div class="notif-content">
          <div class="notif-icon-wrap">
            ${NOTIF_LARGE_ICON_HTML}
          </div>
          <div class="notif-text">
            <div class="notif-title">${title}</div>
            <div class="notif-body">${body}</div>
          </div>
        </div>
      </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Push Notification Preview — HospitALL</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, "Roboto", "Segoe UI", sans-serif;
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 16px;
    }

    h1 {
      color: #f1f5f9;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 6px;
      letter-spacing: -0.3px;
    }
    .subtitle {
      color: #64748b;
      font-size: 13px;
      margin-bottom: 36px;
      text-align: center;
    }
    .subtitle code {
      background: #1e293b;
      color: #93c5fd;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 12px;
    }

    /* Android phone shell */
    .phone {
      width: 320px;
      background: #1c1c1e;
      border-radius: 40px;
      padding: 16px 10px 24px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.7), inset 0 0 0 1px #2d2d2f;
      position: relative;
    }
    .phone-notch {
      width: 90px;
      height: 24px;
      background: #1c1c1e;
      border-radius: 12px;
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .phone-camera {
      width: 10px; height: 10px;
      background: #2d2d2f;
      border-radius: 50%;
    }
    .phone-screen {
      background: #111827;
      border-radius: 28px;
      overflow: hidden;
      padding: 12px 8px;
    }

    /* Status bar */
    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 8px 10px;
      color: #e2e8f0;
      font-size: 11px;
      font-weight: 600;
    }
    .status-icons { display: flex; gap: 6px; align-items: center; }

    /* Notification card */
    .notif-card {
      background: #1e293b;
      border-radius: 14px;
      margin-bottom: 8px;
      overflow: hidden;
      border: 1px solid #2d3748;
    }
    .notif-app-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px 6px;
      border-bottom: 1px solid #2d3748;
    }
    .notif-app-icon {
      width: 16px; height: 16px;
      background: #2563eb;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .notif-app-logo {
      width: 16px; height: 16px;
      border-radius: 4px;
      flex-shrink: 0;
      object-fit: cover;
    }
    .notif-app-name {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
      flex: 1;
    }
    .notif-time {
      font-size: 10px;
      color: #475569;
    }
    .notif-content {
      display: flex;
      gap: 10px;
      padding: 10px 12px 12px;
      align-items: flex-start;
    }
    .notif-icon-wrap {
      width: 44px; height: 44px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .notif-large-icon {
      width: 44px; height: 44px;
      object-fit: cover;
    }
    .notif-icon-fallback {
      width: 44px; height: 44px;
      background: #2563eb;
      border-radius: 50%;
    }
    .notif-text { flex: 1; min-width: 0; }
    .notif-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .notif-body {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.4;
    }

    /* Lock screen wallpaper hint */
    .screen-label {
      text-align: center;
      color: #475569;
      font-size: 10px;
      margin-top: 10px;
      padding-bottom: 6px;
    }

    /* UA pill */
    .ua-badge {
      margin-top: 28px;
      background: #1e293b;
      border: 1px solid #2d3748;
      border-radius: 8px;
      padding: 10px 16px;
      max-width: 320px;
      text-align: center;
    }
    .ua-badge .label { color: #475569; font-size: 11px; margin-bottom: 4px; }
    .ua-badge .value { color: #60a5fa; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Push Notification Preview</h1>
  <p class="subtitle">
    Simulates how notifications appear on the device lock screen.<br/>
    Test with custom UA: <code>?userAgent=Mozilla/5.0 (Windows NT 10.0...)</code>
  </p>

  <div class="phone">
    <div class="phone-notch"><div class="phone-camera"></div><div class="phone-camera"></div></div>
    <div class="phone-screen">
      <div class="status-bar">
        <span>9:41</span>
        <div class="status-icons">
          <span>▲</span><span>WiFi</span><span>🔋</span>
        </div>
      </div>
      ${notifCards}
      <div class="screen-label">Lock screen · HospitALL</div>
    </div>
  </div>

  <div class="ua-badge">
    <div class="label">Detected device from User-Agent</div>
    <div class="value">${device}</div>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}
