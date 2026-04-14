/**
 * Real FCM Push Test
 *
 * Sends an ACTUAL push notification via Firebase Cloud Messaging.
 * Requires FIREBASE_* env vars to be set.
 *
 * Usage:
 *   # Send to a specific device token (copy from Android app logs)
 *   node scripts/send-test-push.js --token=<fcm-token>
 *
 *   # Send to a hospital by _id (uses stored fcmToken.token)
 *   node scripts/send-test-push.js --hospital=<objectId>
 *
 *   # Send to a hospital by email
 *   node scripts/send-test-push.js --email=<email>
 *
 *   # List hospitals that have an FCM token stored (so you can pick one)
 *   node scripts/send-test-push.js --list
 *
 * Optional:
 *   --type=NEW_LOGIN|PASSWORD_CHANGED|DELETION_REQUEST|CUSTOM  (default CUSTOM)
 *   --title="Your title"
 *   --body="Your body"
 */

import "dotenv/config";
import mongoose from "mongoose";

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, ...rest] = a.slice(2).split("=");
    out[k] = rest.length ? rest.join("=") : true;
  }
  return out;
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("✗ MONGODB_URI not set in .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
}

function assertFirebaseEnv() {
  const missing = [];
  for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL"]) {
    if (!process.env[k]) missing.push(k);
  }
  if (missing.length) {
    console.error(`✗ Missing Firebase env vars: ${missing.join(", ")}`);
    console.error("  Set these in backend/.env to enable real FCM:");
    console.error("    FIREBASE_PROJECT_ID=your-project-id");
    console.error("    FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com");
    console.error('    FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
    console.error("  Download creds from:  https://console.firebase.google.com → Project Settings → Service Accounts → Generate new private key");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.token && !args.hospital && !args.email && !args.list) {
    console.log("Usage: node scripts/send-test-push.js --token=<fcm-token>");
    console.log("       node scripts/send-test-push.js --hospital=<objectId>");
    console.log("       node scripts/send-test-push.js --email=<email>");
    console.log("       node scripts/send-test-push.js --list");
    process.exit(0);
  }

  assertFirebaseEnv();

  // Import only after env check (Firebase initializes at import time)
  const push = await import("../src/services/push.service.js");
  const Hospital = (await import("../src/models/Hospital.js")).default;

  await connectMongo();

  try {
    if (args.list) {
      const rows = await Hospital.find({ "fcmToken.token": { $exists: true, $ne: null } })
        .select("_id hospitalName email fcmToken.updatedAt notificationPrefs")
        .lean();
      console.log(`\nHospitals with an FCM token stored (${rows.length}):\n`);
      for (const h of rows) {
        const prefs = h.notificationPrefs || {};
        console.log(`  ${h._id}  ${h.hospitalName}`);
        console.log(`    email: ${h.email}`);
        console.log(`    fcm updated: ${h.fcmToken?.updatedAt || "—"}`);
        console.log(`    prefs: newLogin=${prefs.newLoginAlert ?? "(default on)"} security=${prefs.securityAlerts ?? "(default on)"} deletion=${prefs.deletionUpdates ?? "(default on)"}`);
        console.log("");
      }
      return;
    }

    // Resolve device token
    let token = args.token;
    let hospitalLabel = "anonymous token";
    if (!token && args.hospital) {
      const h = await Hospital.findById(args.hospital).select("hospitalName email fcmToken").lean();
      if (!h) { console.error(`✗ No hospital with id=${args.hospital}`); process.exit(1); }
      token = h.fcmToken?.token;
      hospitalLabel = `${h.hospitalName} (${h.email})`;
    }
    if (!token && args.email) {
      const h = await Hospital.findOne({ email: String(args.email).toLowerCase() }).select("hospitalName email fcmToken").lean();
      if (!h) { console.error(`✗ No hospital with email=${args.email}`); process.exit(1); }
      token = h.fcmToken?.token;
      hospitalLabel = `${h.hospitalName} (${h.email})`;
    }
    if (!token) {
      console.error("✗ No FCM token found for that hospital. The mobile app must be logged in and have called POST /api/auth/fcm-token at least once.");
      process.exit(1);
    }

    const type = (args.type || "CUSTOM").toUpperCase();
    const defaults = {
      NEW_LOGIN: { title: "New Sign-in", body: "Test: a new device just signed in" },
      PASSWORD_CHANGED: { title: "Password Changed", body: "Test: your password was just changed" },
      DELETION_REQUEST: { title: "Deletion Request", body: "Test: a hospital has requested account deletion" },
      CUSTOM: { title: args.title || "Test Push", body: args.body || "Hello from send-test-push.js" },
    };
    const payload = defaults[type] || defaults.CUSTOM;

    console.log(`\n→ Target: ${hospitalLabel}`);
    console.log(`  Token:  ${token.slice(0, 20)}…${token.slice(-10)}`);
    console.log(`  Type:   ${type}`);
    console.log(`  Title:  ${payload.title}`);
    console.log(`  Body:   ${payload.body}\n`);

    const result = await push.sendPushToDevice(token, payload.title, payload.body, { type });
    if (result.success) {
      console.log("✓ Push sent. Check the device — notification should arrive within seconds.");
    } else if (result.invalidToken) {
      console.error("✗ FCM token is invalid or expired. The app needs to re-register it via POST /api/auth/fcm-token.");
    } else {
      console.error("✗ Push failed:", result);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("✗ Error:", err);
  process.exit(1);
});
