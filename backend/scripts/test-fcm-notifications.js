/**
 * FCM End-to-End Test (B6 — Notification Preferences)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

// 1. LOAD ENV IMMEDIATELY (Minimal change for local/server compatibility)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const possiblePaths = [
  path.resolve(__dirname, '../.env'),    // backend/.env
  path.resolve(__dirname, '../../.env')  // root/.env
];
let envPath = possiblePaths.find(p => fs.existsSync(p));
if (envPath) dotenv.config({ path: envPath });

// ---------------------------------------------------------------------------
// 1. Force FCM creds so push.service initializes Firebase Admin.
// ---------------------------------------------------------------------------
const sentMessages = [];
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "mock-project";
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\\nMOCK_FOR_TESTS_ONLY\\n-----END PRIVATE KEY-----\\n";
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || "mock@mock.iam.gserviceaccount.com";

async function run() {
  // ---------------------------------------------------------------------------
  // 2. Import the push service (this triggers Firebase init).
  // ---------------------------------------------------------------------------
  const push = await import("../src/services/push.service.js");

  // ---------------------------------------------------------------------------
  // 3. Patch the messaging singleton's `send` to capture messages.
  // ---------------------------------------------------------------------------
  const admin = (await import("firebase-admin")).default;
  const messaging = admin.messaging();
  messaging.send = async (msg) => {
    sentMessages.push(msg);
    return "mock-message-id";
  };

  // ---------------------------------------------------------------------------
  // 3. Stub Hospital.findById / Hospital.find to fake DB
  // ---------------------------------------------------------------------------
  const Hospital = (await import("../src/models/Hospital.js")).default;

  function stubFindById(hospitalDoc) {
    Hospital.findById = () => ({
      select: () => ({ lean: async () => hospitalDoc }),
    });
  }
  function stubFindAdmins(admins) {
    Hospital.find = () => ({
      select: () => ({ lean: async () => admins }),
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Tiny assertion helper
  // ---------------------------------------------------------------------------
  let passed = 0;
  let failed = 0;
  const log = (ok, label, detail = "") => {
    const icon = ok ? "✓" : "✗";
    const color = ok ? "\x1b[32m" : "\x1b[31m";
    console.log(`  ${color}${icon}\x1b[0m ${label}${detail ? `  — ${detail}` : ""}`);
    if (ok) passed++; else failed++;
  };

  // ---------------------------------------------------------------------------
  // 5. Tests
  // ---------------------------------------------------------------------------

  console.log("\n=== FCM E2E Tests (mock Firebase) ===\n");

  // ─── Flow 1: notifyNewLogin ────────────────────────────────────────────────
  console.log("Flow 1 — notifyNewLogin");
  {
    sentMessages.length = 0;
    stubFindById({
      notificationPrefs: { newLoginAlert: true },
      fcmToken: { token: "device-token-user-1" },
    });
    const r1 = await push.notifyNewLogin("u1", "Chrome on macOS");
    log(r1.success === true, "opted-in → push sent");
    log(sentMessages.length === 1, "exactly one FCM message sent");
    log(sentMessages[0]?.notification?.title === "New Sign-in", "title = New Sign-in", sentMessages[0]?.notification?.title);
    log(sentMessages[0]?.data?.type === "NEW_LOGIN", "data.type = NEW_LOGIN");
    log(sentMessages[0]?.token === "device-token-user-1", "token routed to correct device");

    sentMessages.length = 0;
    stubFindById({
      notificationPrefs: { newLoginAlert: false },
      fcmToken: { token: "device-token-user-1" },
    });
    const r2 = await push.notifyNewLogin("u1", "Chrome");
    log(r2.reason === "opted_out", "opted-out → skipped");
    log(sentMessages.length === 0, "no FCM message sent when opted out");

    sentMessages.length = 0;
    stubFindById({ fcmToken: { token: "device-token-user-1" } });
    const r3 = await push.notifyNewLogin("u1", "Chrome");
    log(r3.success === true, "no prefs → defaults to ON → push sent");
  }

  // ─── Flow 2: notifyPasswordChanged ─────────────────────────────────────────
  console.log("\nFlow 2 — notifyPasswordChanged");
  {
    sentMessages.length = 0;
    stubFindById({
      notificationPrefs: { securityAlerts: true },
      fcmToken: { token: "device-token-user-2" },
    });
    const r1 = await push.notifyPasswordChanged("u2");
    log(r1.success === true, "opted-in → push sent");
    log(sentMessages[0]?.data?.type === "PASSWORD_CHANGED", "data.type = PASSWORD_CHANGED");
    log(sentMessages[0]?.notification?.title === "Password Changed", "title = Password Changed");

    sentMessages.length = 0;
    stubFindById({
      notificationPrefs: { securityAlerts: false },
      fcmToken: { token: "device-token-user-2" },
    });
    const r2 = await push.notifyPasswordChanged("u2");
    log(r2.reason === "opted_out", "opted-out → skipped");
    log(sentMessages.length === 0, "no FCM sent when opted out");
  }

  // ─── Flow 3: notifyAdminsOfDeletionRequest ────────────────────────────────
  console.log("\nFlow 3 — notifyAdminsOfDeletionRequest");
  {
    sentMessages.length = 0;
    stubFindAdmins([
      { _id: "admin1", fcmToken: { token: "admin1-token" } },
      { _id: "admin2", fcmToken: { token: "admin2-token" } },
    ]);
    const r1 = await push.notifyAdminsOfDeletionRequest("St Mary's Hospital");
    log(r1.success === true, "returns success");
    log(r1.count === 2, `pushed to 2 admins (got ${r1.count})`);
    log(sentMessages.length === 2, "two FCM messages sent");
    log(sentMessages.every((m) => m.data.type === "DELETION_REQUEST"), "all messages have data.type = DELETION_REQUEST");
    log(sentMessages[0]?.notification?.body?.includes("St Mary's Hospital"), "body contains hospital name");

    sentMessages.length = 0;
    stubFindAdmins([]);
    const r2 = await push.notifyAdminsOfDeletionRequest("X");
    log(r2.count === 0, "empty admin list → zero pushes");
    log(sentMessages.length === 0, "no FCM sent");

    sentMessages.length = 0;
    stubFindAdmins([{ _id: "noTokenAdmin", fcmToken: null }]);
    const r3 = await push.notifyAdminsOfDeletionRequest("Y");
    log(r3.count === 0, "admin without token → skipped");
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`  Passed: ${passed}   Failed: ${failed}`);
  console.log(`─────────────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("\n❌ FATAL:", err);
  process.exit(1);
});
