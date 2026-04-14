/**
 * App Version Management Script
 *
 * Directly seed or update the AppVersion document without needing an admin UI.
 * The doctor-admin (single hospital user) never sees this — it's a dev tool.
 *
 * Usage:
 *   node scripts/manage-app-version.js list
 *   node scripts/manage-app-version.js set --platform=android --latest=1.2.0 --min=1.0.0 [--force] [--url="https://play..."] [--notes="Bug fixes"]
 *   node scripts/manage-app-version.js force-on  --platform=android
 *   node scripts/manage-app-version.js force-off --platform=android
 *
 * Examples:
 *   # Seed initial version (run once before shipping)
 *   node scripts/manage-app-version.js set --platform=android --latest=1.0.0 --min=1.0.0 --notes="Initial release"
 *
 *   # Bump latest after uploading new APK to Play Store
 *   node scripts/manage-app-version.js set --platform=android --latest=1.1.0 --min=1.0.0 --notes="Improved PDF viewer"
 *
 *   # Emergency: force everyone below 1.1.0 to update
 *   node scripts/manage-app-version.js set --platform=android --latest=1.1.0 --min=1.1.0 --notes="Critical security fix"
 *
 *   # Kill-switch: force ALL clients to update (regardless of version)
 *   node scripts/manage-app-version.js force-on --platform=android
 */

import "dotenv/config";
import mongoose from "mongoose";
import AppVersion from "../src/models/AppVersion.js";

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, ...rest] = a.slice(2).split("=");
      out[k] = rest.length ? rest.join("=") : true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("✗ MONGODB_URI not set in .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("✓ Connected to MongoDB");
}

async function cmdList() {
  const items = await AppVersion.find().sort({ createdAt: -1 }).lean();
  if (items.length === 0) {
    console.log("(no version rows — run `set` to seed one)");
    return;
  }
  console.log("\nPlatform  Latest    Min       Force  Created");
  console.log("--------  --------  --------  -----  -------------------");
  for (const v of items) {
    console.log(
      `${v.platform.padEnd(8)}  ${v.latestVersion.padEnd(8)}  ${v.minVersion.padEnd(8)}  ${String(v.forceUpdate).padEnd(5)}  ${new Date(v.createdAt).toISOString().slice(0, 19)}`,
    );
    if (v.releaseNotes) console.log(`          notes: ${v.releaseNotes}`);
  }
  console.log();
}

async function cmdSet(args) {
  const platform = (args.platform || "android").toLowerCase();
  const latest = args.latest || args.latestVersion;
  const min = args.min || args.minVersion || latest;
  if (!latest) {
    console.error("✗ --latest=<version> is required");
    process.exit(1);
  }
  const doc = {
    platform,
    latestVersion: String(latest),
    minVersion: String(min),
    forceUpdate: !!args.force,
    updateUrl: args.url || "",
    releaseNotes: args.notes || "",
  };
  // Replace the single row per platform (keep history lean — no rollover)
  const existing = await AppVersion.findOne({ platform }).sort({ createdAt: -1 });
  if (existing) {
    Object.assign(existing, doc);
    await existing.save();
    console.log(`✓ Updated ${platform}: latest=${doc.latestVersion}, min=${doc.minVersion}, force=${doc.forceUpdate}`);
  } else {
    await AppVersion.create(doc);
    console.log(`✓ Created ${platform}: latest=${doc.latestVersion}, min=${doc.minVersion}, force=${doc.forceUpdate}`);
  }
}

async function cmdForce(platform, on) {
  const existing = await AppVersion.findOne({ platform }).sort({ createdAt: -1 });
  if (!existing) {
    console.error(`✗ No version row for platform=${platform}. Run \`set\` first.`);
    process.exit(1);
  }
  existing.forceUpdate = on;
  await existing.save();
  console.log(`✓ ${platform}: forceUpdate = ${on}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`
App Version Management

Commands:
  list                          Show current version rows
  set --platform=android --latest=1.2.0 [--min=1.0.0] [--force] [--url=...] [--notes=...]
                                Create or update the version row for a platform
  force-on  --platform=android  Turn on kill-switch force-update
  force-off --platform=android  Turn off kill-switch force-update

Example:
  node scripts/manage-app-version.js set --platform=android --latest=1.0.0 --min=1.0.0 --notes="Initial release"
`);
    process.exit(0);
  }

  await connect();
  try {
    switch (cmd) {
      case "list":
        await cmdList();
        break;
      case "set":
        await cmdSet(args);
        await cmdList();
        break;
      case "force-on":
        await cmdForce((args.platform || "android").toLowerCase(), true);
        break;
      case "force-off":
        await cmdForce((args.platform || "android").toLowerCase(), false);
        break;
      default:
        console.error(`✗ Unknown command: ${cmd}`);
        process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("✗ Error:", err.message);
  process.exit(1);
});
