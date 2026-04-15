import admin from "firebase-admin";
import Hospital from "../models/Hospital.js";

// Singleton Firebase initialization — skip if credentials missing
let firebaseEnabled = false;

if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_PRIVATE_KEY &&
  process.env.FIREBASE_CLIENT_EMAIL
) {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
    }
    firebaseEnabled = true;
    console.log("[push.service] Firebase Admin SDK initialized");
  } catch (error) {
    console.warn("[push.service] Firebase init failed:", error.message);
  }
} else {
  console.warn("[push.service] Firebase credentials not set — push notifications disabled");
}

/**
 * Send a push notification to a single device token.
 * @param {string} fcmToken - The FCM registration token.
 * @param {string} title - Notification title.
 * @param {string} body - Notification body.
 * @param {Object} data - Optional key-value data payload (values will be stringified).
 * @returns {Promise<{success: boolean, invalidToken?: boolean, error?: string}>}
 */
export async function sendPushToDevice(fcmToken, title, body, data = {}) {
  if (!firebaseEnabled) return { success: false, reason: "firebase_disabled" };
  try {
    // Ensure all data values are flat string pairs
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );

    const message = {
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: {
        priority: "high",
        notification: {
          channelId: "hospital_notifications",
          defaultSound: true,
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default" } },
      },
    };

    await admin.messaging().send(message);
    return { success: true };
  } catch (error) {
    const code = error?.code || error?.errorInfo?.code || "";
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      console.error(`[push.service] Invalid/expired FCM token: ${code}`);
      return { success: false, invalidToken: true };
    }
    console.error("[push.service] sendPushToDevice failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send a push notification to a user (hospital) by their ID.
 * Looks up the FCM token from the Hospital document.
 * @param {string} userId - The Hospital _id.
 * @param {string} title - Notification title.
 * @param {string} body - Notification body.
 * @param {Object} data - Optional key-value data payload.
 * @returns {Promise<{success: boolean, reason?: string, invalidToken?: boolean, error?: string}>}
 */
export async function sendPushToUser(userId, title, body, data = {}) {
  try {
    const hospital = await Hospital.findById(userId).select("fcmToken").lean();

    const token = hospital?.fcmToken?.token;
    if (!token) {
      return { success: false, reason: "no_token" };
    }

    const result = await sendPushToDevice(token, title, body, data);

    // If the token was invalid/expired, clear it from the database
    if (result.invalidToken) {
      await Hospital.findByIdAndUpdate(userId, { $unset: { fcmToken: "" } });
      console.info(
        `[push.service] Cleared invalid FCM token for user ${userId}`
      );
    }

    return result;
  } catch (error) {
    console.error("[push.service] sendPushToUser failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Notify a user that their session was revoked (signed in elsewhere).
 * @param {string} userId - The Hospital _id.
 * @returns {Promise<{success: boolean}>}
 */
export async function notifySessionRevoked(userId) {
  try {
    return await sendPushToUser(userId, "Session Ended", "You have been signed in elsewhere", {
      type: "SESSION_REVOKED",
    });
  } catch (error) {
    console.error(
      "[push.service] notifySessionRevoked failed:",
      error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Notify a user that a new login was detected.
 * Gated by notificationPrefs.newLoginAlert — if the user opted out, this is a no-op.
 */
export async function notifyNewLogin(userId, deviceInfo) {
  try {
    const hospital = await Hospital.findById(userId).select("notificationPrefs").lean();
    if (hospital?.notificationPrefs && hospital.notificationPrefs.newLoginAlert === false) {
      return { success: false, reason: "opted_out" };
    }
    return await sendPushToUser(
      userId,
      "New Sign-in",
      `New sign-in on ${deviceInfo}`,
      { type: "NEW_LOGIN" }
    );
  } catch (error) {
    console.error("[push.service] notifyNewLogin failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Notify a user that their password was changed.
 * Gated by notificationPrefs.securityAlerts.
 */
export async function notifyPasswordChanged(userId) {
  try {
    const hospital = await Hospital.findById(userId).select("notificationPrefs").lean();
    if (hospital?.notificationPrefs && hospital.notificationPrefs.securityAlerts === false) {
      return { success: false, reason: "opted_out" };
    }
    return await sendPushToUser(
      userId,
      "Password Changed",
      "Your account password was just changed. Other devices have been signed out.",
      { type: "PASSWORD_CHANGED" }
    );
  } catch (error) {
    console.error("[push.service] notifyPasswordChanged failed:", error.message);
    return { success: false, error: error.message };
  }
}

