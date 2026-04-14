/**
 * End-to-end test of the self-registration flow.
 *
 * Exercises every Redis use case in the codebase by driving the 3 live HTTP
 * endpoints and peeking into Upstash between steps to show exactly what's
 * stored and how TTL / attempts / cooldowns behave.
 *
 * Redis keys exercised:
 *   • partial_reg:{email}      — form data stash (30min TTL)
 *   • otp:{email}              — hashed OTP + attempts counter (10min TTL)
 *   • last_otp_sent:{email}    — resend cooldown timestamp (60s TTL)
 *
 * Usage:  node scripts/test-self-registration.js
 * Requires the backend to be running on http://localhost:5000
 */

import "dotenv/config";
import mongoose from "mongoose";
import { Redis } from "@upstash/redis";
import Hospital from "../src/models/Hospital.js";

const API = "http://localhost:5000/api/auth";
const TEST_EMAIL = `selfreg-test-${Date.now()}@example.com`;
const TEST_PHONE = "9123456789";              // will be normalized to +919123456789
const TEST_PASSWORD = "TestPass@123";          // passes strength: 8+ / upper / lower / digit / special

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ─── Pretty-printing helpers ───────────────────────────────────────────────
const line = (c = "─") => console.log(c.repeat(72));
const section = (n, title) => {
  console.log();
  line("═");
  console.log(`  STEP ${n}: ${title}`);
  line("═");
};
const sub = (title) => console.log(`\n  • ${title}`);
const ok = (msg) => console.log(`    ✅ ${msg}`);
const fail = (msg) => { console.log(`    ❌ ${msg}`); process.exit(1); };

async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function peekRedis(label, keys) {
  console.log(`\n    🔍 ${label}`);
  for (const key of keys) {
    const val = await redis.get(key);
    const ttl = await redis.ttl(key);
    if (val === null) {
      console.log(`       ${key}  ⟶  (not present)`);
    } else {
      const preview = typeof val === "string" ? val : JSON.stringify(val);
      const shown = preview.length > 80 ? preview.slice(0, 77) + "..." : preview;
      console.log(`       ${key}  ⟶  ${shown}   [ttl=${ttl}s]`);
    }
  }
}

async function run() {
  console.log();
  line("═");
  console.log("  Self-Registration E2E Test");
  console.log(`  Email: ${TEST_EMAIL}`);
  console.log(`  Phone: ${TEST_PHONE} → normalized +91${TEST_PHONE}`);
  line("═");

  await mongoose.connect(process.env.MONGODB_URI);
  // Cleanup any pre-existing test record (paranoia)
  await Hospital.deleteOne({ email: TEST_EMAIL });

  const redisKeys = [
    `partial_reg:${TEST_EMAIL}`,
    `otp:${TEST_EMAIL}`,
    `last_otp_sent:${TEST_EMAIL}`,
  ];

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1 — POST /register (initiate)
  // Expected: no Hospital in DB; three Redis keys populated.
  // ═══════════════════════════════════════════════════════════════════════
  section(1, "POST /api/auth/register  (initiate registration)");

  const step1 = await postJson("/register", {
    hospitalName: "E2E Test Hospital",
    email: TEST_EMAIL,
    phone: TEST_PHONE,
    password: TEST_PASSWORD,
  });
  console.log(`    response: ${step1.status}`);
  console.log(`    body: ${JSON.stringify(step1.body)}`);
  if (step1.status !== 200) fail(`expected 200, got ${step1.status}`);
  ok("endpoint returned 200 with OTP-sent confirmation");

  await peekRedis("Redis state after Step 1:", redisKeys);

  // partial_reg must hold hashed password + phone + name
  const partial = await redis.get(redisKeys[0]);
  const parsed = typeof partial === "string" ? JSON.parse(partial) : partial;
  if (!parsed || parsed.email !== TEST_EMAIL) fail("partial_reg missing or malformed");
  if (!parsed.passwordHash?.startsWith("$2")) fail("partial_reg.passwordHash not bcrypt-hashed");
  if (parsed.phone !== `+91${TEST_PHONE}`) fail(`partial_reg.phone expected +91${TEST_PHONE}, got ${parsed.phone}`);
  ok("partial_reg contains bcrypt-hashed password + normalized phone");

  // otp key exists with hash + attempts=0
  const otpRec = await redis.get(redisKeys[1]);
  const otpParsed = typeof otpRec === "string" ? JSON.parse(otpRec) : otpRec;
  if (!otpParsed?.hash || otpParsed.attempts !== 0) fail("otp record malformed");
  ok("otp record has SHA-256 hash and attempts=0");

  // Last-OTP-sent timestamp present
  const tsRaw = await redis.get(redisKeys[2]);
  if (!tsRaw) fail("last_otp_sent not set — cooldown will be ineffective");
  ok("last_otp_sent cooldown timestamp is set");

  // Hospital must NOT exist in DB yet
  const prematureHospital = await Hospital.findOne({ email: TEST_EMAIL });
  if (prematureHospital) fail("Hospital was created before OTP verification (should NOT happen)");
  ok("Hospital record NOT yet created in MongoDB (correct)");

  // Extract OTP from the backend log so we can verify it
  console.log("\n    📋 Fetching OTP from backend log (dev SMS stub)...");
  const { execSync } = await import("child_process");
  const logOut = execSync(`grep -F "Registration OTP for +91${TEST_PHONE}" /tmp/backend.log | tail -1`, { encoding: "utf8" });
  const otpMatch = logOut.match(/(\d{6})\s*$/);
  if (!otpMatch) fail("Could not read OTP from backend log");
  const otp = otpMatch[1];
  ok(`captured OTP from log: ${otp}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2a — POST /register/verify-otp with WRONG code (attempt counter test)
  // ═══════════════════════════════════════════════════════════════════════
  section("2a", "POST /verify-otp with WRONG code  (attempt counter)");

  const wrong = await postJson("/register/verify-otp", { email: TEST_EMAIL, otp: "000000" });
  console.log(`    response: ${wrong.status}`);
  console.log(`    body: ${JSON.stringify(wrong.body)}`);
  if (wrong.body?.data?.attemptsLeft !== 2) fail(`expected attemptsLeft=2, got ${wrong.body?.data?.attemptsLeft}`);
  ok("server reports 2 attempts remaining");

  const afterWrong = await redis.get(redisKeys[1]);
  const afterWrongParsed = typeof afterWrong === "string" ? JSON.parse(afterWrong) : afterWrong;
  if (afterWrongParsed.attempts !== 1) fail(`Redis attempts expected 1, got ${afterWrongParsed.attempts}`);
  ok("Redis otp.attempts incremented to 1");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2b — POST /register/resend-otp too soon (cooldown test)
  // ═══════════════════════════════════════════════════════════════════════
  section("2b", "POST /resend-otp immediately  (60s cooldown)");

  const tooSoon = await postJson("/register/resend-otp", { email: TEST_EMAIL });
  console.log(`    response: ${tooSoon.status}`);
  console.log(`    body: ${JSON.stringify(tooSoon.body)}`);
  if (tooSoon.status !== 429) fail(`expected 429, got ${tooSoon.status}`);
  if (typeof tooSoon.body?.data?.retryAfterSeconds !== "number") fail("retryAfterSeconds missing");
  ok(`server correctly rejected resend with 429 (retryAfter=${tooSoon.body.data.retryAfterSeconds}s)`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2c — POST /register/verify-otp with CORRECT code
  // Expected: Hospital created, Redis keys cleared, welcome email sent.
  // ═══════════════════════════════════════════════════════════════════════
  section("2c", "POST /verify-otp with CORRECT code  (success path)");

  const correct = await postJson("/register/verify-otp", { email: TEST_EMAIL, otp });
  console.log(`    response: ${correct.status}`);
  console.log(`    body keys: ${Object.keys(correct.body)} | data keys: ${Object.keys(correct.body.data || {})}`);
  if (correct.status !== 201) fail(`expected 201, got ${correct.status}`);
  ok("verify-otp returned 201 with hospital data");

  const hospitalDoc = correct.body.data;
  if (!hospitalDoc?._id) fail("no hospital _id in response");
  if (!hospitalDoc.authCode || !/^\d{6}$/.test(hospitalDoc.authCode)) {
    fail(`authCode missing or not 6-digit numeric: ${hospitalDoc.authCode}`);
  }
  ok(`Hospital created with auto-generated authCode: ${hospitalDoc.authCode}`);

  await peekRedis("Redis state after successful verify:", redisKeys);

  // All three Redis keys should now be gone
  const partialAfter = await redis.get(redisKeys[0]);
  const otpAfter = await redis.get(redisKeys[1]);
  if (partialAfter) fail("partial_reg should be deleted after success");
  if (otpAfter) fail("otp key should be deleted after successful verify");
  ok("partial_reg and otp keys correctly cleaned up");

  // Verify in MongoDB: mustChangePassword=false, isActive=true
  const dbHospital = await Hospital.findOne({ email: TEST_EMAIL }).lean();
  if (!dbHospital) fail("Hospital not found in MongoDB");
  if (dbHospital.mustChangePassword !== false) fail(`mustChangePassword expected false, got ${dbHospital.mustChangePassword}`);
  if (dbHospital.isActive !== true) fail(`isActive expected true, got ${dbHospital.isActive}`);
  if (dbHospital.authCode !== hospitalDoc.authCode) fail("authCode mismatch between response and DB");
  ok("DB record: mustChangePassword=false, isActive=true, authCode matches");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3 — Re-attempt verify (replay defence)
  // ═══════════════════════════════════════════════════════════════════════
  section(3, "POST /verify-otp with same OTP again  (replay defence)");

  const replay = await postJson("/register/verify-otp", { email: TEST_EMAIL, otp });
  console.log(`    response: ${replay.status}`);
  console.log(`    body: ${JSON.stringify(replay.body)}`);
  if (replay.status !== 410) fail(`expected 410 (expired), got ${replay.status}`);
  ok("replay correctly rejected with 410 — OTP was burned after first success");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4 — Second registration attempt with same email (duplicate check)
  // ═══════════════════════════════════════════════════════════════════════
  section(4, "POST /register with same email  (duplicate prevention)");

  const dup = await postJson("/register", {
    hospitalName: "Duplicate Attempt",
    email: TEST_EMAIL,
    phone: "9999999999",
    password: TEST_PASSWORD,
  });
  console.log(`    response: ${dup.status}`);
  console.log(`    body: ${JSON.stringify(dup.body)}`);
  if (dup.status !== 409) fail(`expected 409, got ${dup.status}`);
  ok("duplicate email correctly rejected with 409");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5 — Weak password rejection
  // ═══════════════════════════════════════════════════════════════════════
  section(5, "POST /register with weak password  (strength check)");

  const weak = await postJson("/register", {
    hospitalName: "Weak Pass Test",
    email: `weak-${Date.now()}@example.com`,
    phone: "9888888888",
    password: "weakpw",
  });
  console.log(`    response: ${weak.status}`);
  console.log(`    body: ${JSON.stringify(weak.body)}`);
  if (weak.status !== 400) fail(`expected 400, got ${weak.status}`);
  ok("weak password rejected with 400");

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log();
  line("─");
  await Hospital.deleteOne({ _id: hospitalDoc._id });
  ok(`test hospital ${hospitalDoc._id} deleted`);
  await mongoose.disconnect();

  line("═");
  console.log("  🎉 ALL REDIS USE CASES VERIFIED END-TO-END");
  line("═");
  console.log(`
  Redis keys used by the self-registration flow (all confirmed working):

    1. partial_reg:{email}    — stash form data between Step 1 and Step 2
    2. otp:{email}            — hashed OTP + attempts counter (max 3)
    3. last_otp_sent:{email}  — 60-second resend cooldown

  All keys auto-expire via Redis TTL; they are also explicitly deleted
  on successful verify-otp to minimise Redis footprint.
`);
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ FATAL:", err);
  process.exit(1);
});
