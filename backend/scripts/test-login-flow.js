/**
 * End-to-end test of the new 2-step login flow:
 *   Step 1: POST /api/auth/login                → returns tempToken + requireAuthCode
 *   Step 2: POST /api/auth/login/verify-auth-code → returns access token + hospital
 *
 * Also tests the mustChangePassword branch and negative paths.
 *
 * Usage:  node scripts/test-login-flow.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import Hospital from "../src/models/Hospital.js";
import { hashPassword } from "../src/utils/hash.js";

const API = "http://localhost:5000/api/auth";
const TEST_EMAIL = `login-test-${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPass@123";

const line = (c = "─") => console.log(c.repeat(72));
const section = (n, title) => { console.log(); line("═"); console.log(`  STEP ${n}: ${title}`); line("═"); };
const ok = (m) => console.log(`    ✅ ${m}`);
const fail = (m) => { console.log(`    ❌ ${m}`); process.exit(1); };

async function postJson(path, body, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  // ── Create a fresh test hospital directly (bypass OTP) ────────────────
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await Hospital.deleteOne({ email: TEST_EMAIL });
  const hospital = await Hospital.create({
    hospitalName: "Login Flow Test Hospital",
    email: TEST_EMAIL,
    phone: `+911${Date.now().toString().slice(-9)}`,
    passwordHash,
    isActive: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
  });
  console.log(`Test hospital created: ${hospital._id}`);
  console.log(`  authCode (auto-generated): ${hospital.authCode}`);
  if (!/^\d{6}$/.test(hospital.authCode)) fail("authCode is not 6-digit numeric");

  // ── STEP 1: Password login ─────────────────────────────────────────────
  section(1, "POST /login with email + password");

  const step1 = await postJson("/login", { identifier: TEST_EMAIL, password: TEST_PASSWORD });
  console.log(`    status: ${step1.status}`);
  console.log(`    body: ${JSON.stringify(step1.body)}`);
  if (step1.status !== 200) fail(`expected 200, got ${step1.status}`);
  if (!step1.body.requireAuthCode) fail("expected requireAuthCode:true");
  if (!step1.body.data?.tempToken) fail("no tempToken in response");
  ok("password verified → received AUTH_CODE tempToken");
  const tempToken = step1.body.data.tempToken;

  // ── STEP 2a: verify-auth-code with WRONG code ─────────────────────────
  section("2a", "POST /login/verify-auth-code with WRONG code");

  const wrong = await postJson("/login/verify-auth-code", { authCode: "000000" }, {
    Authorization: `Bearer ${tempToken}`,
  });
  console.log(`    status: ${wrong.status}`);
  console.log(`    body: ${JSON.stringify(wrong.body)}`);
  if (wrong.status !== 401) fail(`expected 401, got ${wrong.status}`);
  ok("wrong auth code correctly rejected with 401");

  // ── STEP 2b: verify-auth-code with CORRECT code ───────────────────────
  section("2b", "POST /login/verify-auth-code with CORRECT code");

  const correct = await postJson("/login/verify-auth-code", { authCode: hospital.authCode }, {
    Authorization: `Bearer ${tempToken}`,
  });
  console.log(`    status: ${correct.status}`);
  if (correct.status !== 200) fail(`expected 200, got ${correct.status}\n    body: ${JSON.stringify(correct.body)}`);
  if (!correct.body.data?.accessToken) fail("no accessToken in response");
  if (!correct.body.data?.refreshToken) fail("no refreshToken in response");
  if (correct.body.data?.hospital?._id?.toString() !== hospital._id.toString()) fail("hospital mismatch in response");
  ok("correct auth code → full session issued");
  ok(`accessToken length: ${correct.body.data.accessToken.length}, refreshToken length: ${correct.body.data.refreshToken.length}`);

  // ── STEP 3: mustChangePassword flow ────────────────────────────────────
  section(3, "mustChangePassword=true should return PASSWORD_CHANGE token");

  hospital.mustChangePassword = true;
  await hospital.save();

  const step4 = await postJson("/login", { identifier: TEST_EMAIL, password: TEST_PASSWORD });
  console.log(`    status: ${step4.status}`);
  console.log(`    body: ${JSON.stringify(step4.body)}`);
  if (step4.status !== 200) fail(`expected 200, got ${step4.status}`);
  if (!step4.body.requirePasswordChange) fail("expected requirePasswordChange:true");
  if (step4.body.requireAuthCode) fail("requireAuthCode should NOT be set when password change required");
  ok("mustChangePassword branch returns PASSWORD_CHANGE temp token (not AUTH_CODE)");

  // ── STEP 4: TOTP routes are gone ───────────────────────────────────────
  section(4, "Deleted TOTP routes return 404");

  for (const path of ["/2fa/setup", "/2fa/verify", "/2fa/disable", "/login/totp", "/login/recovery", "/2fa/reset"]) {
    const resp = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (resp.status !== 404) fail(`${path} returned ${resp.status}, expected 404`);
  }
  ok("all 6 deleted TOTP routes return 404");

  // ── STEP 5: Wrong password still returns 401 (no change) ──────────────
  section(5, "Wrong password still returns 401");

  const badPw = await postJson("/login", { identifier: TEST_EMAIL, password: "WrongPass@999" });
  console.log(`    status: ${badPw.status}`);
  if (badPw.status !== 401) fail(`expected 401, got ${badPw.status}`);
  ok("wrong password correctly rejected with 401");

  // ── Cleanup ────────────────────────────────────────────────────────────
  await Hospital.deleteOne({ _id: hospital._id });
  await mongoose.disconnect();

  console.log();
  line("═");
  console.log("  🎉 LOGIN FLOW (TOTP REMOVED, AUTH CODE ADDED) VERIFIED");
  line("═");
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ FATAL:", err);
  process.exit(1);
});
