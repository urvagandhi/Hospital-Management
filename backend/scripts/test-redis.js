/**
 * Sanity-check the Redis connection and the OTP helpers used by the
 * self-registration flow.
 *
 * Run:  node scripts/test-redis.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

// 1. LOAD ENV IMMEDIATELY
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const possiblePaths = [
  path.resolve(__dirname, '../.env'),    // backend/.env
  path.resolve(__dirname, '../../.env')  // root/.env
];
let envPath = possiblePaths.find(p => fs.existsSync(p));
if (envPath) dotenv.config({ path: envPath });

async function run() {
  // 2. DYNAMICALLY IMPORT SERVICES
  const {
    setOTP,
    verifyOTP,
    setPartialRegistration,
    getPartialRegistration,
    deletePartialRegistration,
    setLastOTPSent,
    getLastOTPSent,
  } = await import("../src/services/redis.service.js");

  const testEmail = `redis-test-${Date.now()}@example.com`;

  console.log("─".repeat(60));
  console.log("Redis connectivity + OTP helper test");
  console.log("─".repeat(60));
  console.log("UPSTASH_REDIS_REST_URL set:", !!process.env.UPSTASH_REDIS_REST_URL);
  console.log("UPSTASH_REDIS_REST_TOKEN set:", !!process.env.UPSTASH_REDIS_REST_TOKEN);
  console.log("REDIS_URL set:", !!process.env.REDIS_URL);
  console.log("Test email:", testEmail);
  console.log();

  // 1. Partial registration round-trip
  console.log("[1] Storing partial registration...");
  await setPartialRegistration(testEmail, { hospitalName: "Test Hosp", phone: "+919999999999" }, 60);

  const partial = await getPartialRegistration(testEmail);
  console.log("    fetched:", partial);
  if (!partial || partial.hospitalName !== "Test Hosp") {
    console.error("    ❌ FAILED — partial registration did not round-trip");
    process.exit(1);
  }
  console.log("    ✅ partial_reg round-trip OK");
  console.log();

  // 2. OTP set + wrong guess (1 attempt consumed)
  console.log("[2] Storing OTP '123456', then guessing '000000' with max=3...");
  await setOTP(testEmail, "123456", 60);
  const wrong = await verifyOTP(testEmail, "000000", 3);
  console.log("    result:", wrong);
  if (wrong.valid || wrong.attemptsLeft !== 2) {
    console.error("    ❌ FAILED — expected {valid:false, attemptsLeft:2}");
    process.exit(1);
  }
  console.log("    ✅ wrong-guess path OK (2 attempts left)");
  console.log();

  // 3. Correct OTP
  console.log("[3] Now guessing '123456' (correct)...");
  const correct = await verifyOTP(testEmail, "123456", 3);
  console.log("    result:", correct);
  if (!correct.valid) {
    console.error("    ❌ FAILED — correct OTP should have verified");
    process.exit(1);
  }
  console.log("    ✅ correct-guess path OK (OTP deleted from Redis)");
  console.log();

  // 4. Verify OTP is gone after correct guess
  console.log("[4] Re-verifying same OTP (should be expired/missing)...");
  const afterValid = await verifyOTP(testEmail, "123456", 3);
  console.log("    result:", afterValid);
  if (!afterValid.expired) {
    console.error("    ❌ FAILED — OTP should be deleted after successful verify");
    process.exit(1);
  }
  console.log("    ✅ OTP correctly removed after successful verify");
  console.log();

  // 5. Last-OTP-sent cooldown
  console.log("[5] Setting last-OTP-sent timestamp (60s cooldown)...");
  await setLastOTPSent(testEmail, 60);
  const ts = await getLastOTPSent(testEmail);
  console.log("    fetched timestamp:", ts, "(age:", Date.now() - ts, "ms)");
  if (!ts || Date.now() - ts > 5000) {
    console.error("    ❌ FAILED — timestamp not stored/retrieved correctly");
    process.exit(1);
  }
  console.log("    ✅ last_otp_sent round-trip OK");
  console.log();

  // 6. Exhaust attempts → OTP burns after 3 wrong guesses
  console.log("[6] Burn-attempts test: storing OTP, then 3 wrong guesses...");
  await setOTP(testEmail, "654321", 60);
  const g1 = await verifyOTP(testEmail, "111111", 3);
  const g2 = await verifyOTP(testEmail, "222222", 3);
  const g3 = await verifyOTP(testEmail, "333333", 3);
  console.log("    guess 1:", g1);
  console.log("    guess 2:", g2);
  console.log("    guess 3:", g3);
  if (g1.attemptsLeft !== 2 || g2.attemptsLeft !== 1 || g3.attemptsLeft !== 0) {
    console.error("    ❌ FAILED — attemptsLeft sequence wrong (expected 2,1,0)");
    process.exit(1);
  }
  const burnedAttempt = await verifyOTP(testEmail, "654321", 3);
  console.log("    after burn, correct guess:", burnedAttempt);
  if (!burnedAttempt.expired) {
    console.error("    ❌ FAILED — OTP should have been burned after 3 failures");
    process.exit(1);
  }
  console.log("    ✅ burn-after-max-attempts works");
  console.log();

  // Cleanup
  await deletePartialRegistration(testEmail);
  console.log("─".repeat(60));
  console.log("🎉 All Redis helpers work correctly.");
  console.log("─".repeat(60));
  process.exit(0);
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
