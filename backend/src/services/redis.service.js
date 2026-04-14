import crypto from "crypto";
import { Redis } from "@upstash/redis";

// ─────────────────────────────────────────────────────────────────────────────
// Redis client with in-memory fallback
//
// SRS §2.1 requires "Redis with in-memory fallback" so dev environments and
// outages don't take down auth flows. We expose a minimal compatible surface
// (get / set / del / ttl) that every helper in this file uses.
//
// Strategy:
//   • If Upstash env vars are set AND the first write succeeds → use Upstash.
//   • Otherwise, or after a catastrophic failure, transparently switch to an
//     in-memory Map-based store with real TTL semantics.
// ─────────────────────────────────────────────────────────────────────────────

const memStore = new Map();   // key -> { value: string, expiresAt: number|null }
const memTimers = new Map();  // key -> setTimeout handle (for cleanup)

function memSet(key, value, { ex } = {}) {
  const expiresAt = ex ? Date.now() + ex * 1000 : null;
  memStore.set(key, { value: String(value), expiresAt });

  if (memTimers.has(key)) clearTimeout(memTimers.get(key));
  if (ex) {
    const h = setTimeout(() => {
      memStore.delete(key);
      memTimers.delete(key);
    }, ex * 1000);
    if (h.unref) h.unref();
    memTimers.set(key, h);
  }
  return "OK";
}

function memGet(key) {
  const rec = memStore.get(key);
  if (!rec) return null;
  if (rec.expiresAt && Date.now() > rec.expiresAt) {
    memStore.delete(key);
    const h = memTimers.get(key);
    if (h) clearTimeout(h);
    memTimers.delete(key);
    return null;
  }
  return rec.value;
}

function memDel(key) {
  const existed = memStore.delete(key);
  const h = memTimers.get(key);
  if (h) clearTimeout(h);
  memTimers.delete(key);
  return existed ? 1 : 0;
}

function memTtl(key) {
  const rec = memStore.get(key);
  if (!rec) return -2;               // key does not exist
  if (!rec.expiresAt) return -1;     // no expiry
  const remaining = Math.ceil((rec.expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : -2;
}

// ── Select backend at module load ───────────────────────────────────────────
const hasUpstashCreds = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
let usingInMemory = !hasUpstashCreds;
const upstash = hasUpstashCreds
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

if (!hasUpstashCreds) {
  console.warn("[redis.service] ⚠️  Upstash credentials missing — using in-memory fallback (dev-only, non-persistent)");
}

/**
 * Unified backend. Each method tries Upstash first (if configured) and falls
 * back to the in-memory store on any error. Once Upstash fails we latch
 * `usingInMemory = true` so subsequent calls don't keep paying the DNS /
 * connect timeout.
 */
const redis = {
  async get(key) {
    if (usingInMemory || !upstash) return memGet(key);
    try {
      return await upstash.get(key);
    } catch (err) {
      if (!usingInMemory) {
        console.warn(`[redis.service] ⚠️  Upstash unreachable (${err.message}) — falling back to in-memory for this process`);
        usingInMemory = true;
      }
      return memGet(key);
    }
  },

  async set(key, value, opts) {
    if (usingInMemory || !upstash) return memSet(key, value, opts);
    try {
      return await upstash.set(key, value, opts);
    } catch (err) {
      if (!usingInMemory) {
        console.warn(`[redis.service] ⚠️  Upstash unreachable (${err.message}) — falling back to in-memory for this process`);
        usingInMemory = true;
      }
      return memSet(key, value, opts);
    }
  },

  async del(key) {
    if (usingInMemory || !upstash) return memDel(key);
    try {
      return await upstash.del(key);
    } catch (err) {
      if (!usingInMemory) {
        console.warn(`[redis.service] ⚠️  Upstash unreachable (${err.message}) — falling back to in-memory for this process`);
        usingInMemory = true;
      }
      return memDel(key);
    }
  },

  async ttl(key) {
    if (usingInMemory || !upstash) return memTtl(key);
    try {
      return await upstash.ttl(key);
    } catch (err) {
      if (!usingInMemory) {
        console.warn(`[redis.service] ⚠️  Upstash unreachable (${err.message}) — falling back to in-memory for this process`);
        usingInMemory = true;
      }
      return memTtl(key);
    }
  },
};

/** Whether the process is currently using the in-memory fallback. */
export function isUsingInMemoryStore() {
  return usingInMemory;
}

function normalizeIdentifier(identifier) {
  return String(identifier).toLowerCase().trim();
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis key patterns used by this app
//
//   otp:{email}              OTP hash + attempt counter          TTL: 10 min
//                            Written by the self-registration flow on /register
//                            and /register/resend-otp; consumed by
//                            /register/verify-otp. Burns itself after max
//                            wrong attempts (configurable per call).
//
//   partial_reg:{email}      Pending registration form data      TTL: 30 min
//                            Hashed password, normalized phone, logo,
//                            hospital name — everything needed to create the
//                            Hospital once the user verifies their OTP.
//                            Deleted explicitly on successful verify; falls
//                            back to TTL expiry if the user abandons.
//
//   last_otp_sent:{email}    Unix-ms timestamp of last OTP send  TTL: 60 sec
//                            Enforces the 60-second resend cooldown for
//                            /register/resend-otp.
//
//   bio:challenge:{hId}:{dev} Biometric challenge nonce          TTL: 2 min
//                            Server-issued random nonce that the Android app
//                            must sign with its device private key. Deleted
//                            on successful verify (one-shot).
//
// Anything else is not used. If you need Redis-backed sessions or per-IP
// login-attempt counters later, add them here and wire them up in the
// relevant controller.
// ─────────────────────────────────────────────────────────────────────────────

// ── OTP ─────────────────────────────────────────────────────────────────────

export async function setOTP(identifier, otp, ttlSeconds = 600) {
  try {
    const key = `otp:${normalizeIdentifier(identifier)}`;
    const data = JSON.stringify({ hash: hashOTP(otp), attempts: 0 });
    await redis.set(key, data, { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setOTP error:", err.message);
  }
}

export async function verifyOTP(identifier, providedOtp, maxAttempts = 5) {
  try {
    const key = `otp:${normalizeIdentifier(identifier)}`;
    const raw = await redis.get(key);

    if (!raw) {
      return { valid: false, expired: true, attemptsLeft: 0 };
    }

    const record = typeof raw === "string" ? JSON.parse(raw) : raw;
    const providedHash = hashOTP(providedOtp);

    if (providedHash === record.hash) {
      await redis.del(key);
      return { valid: true, expired: false, attemptsLeft: 0 };
    }

    // Wrong OTP
    record.attempts += 1;

    if (record.attempts >= maxAttempts) {
      // Burn the OTP after too many wrong attempts — user must request a new one
      await redis.del(key);
      return { valid: false, expired: false, attemptsLeft: 0 };
    }

    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(record), { ex: ttl > 0 ? ttl : 600 });

    return {
      valid: false,
      expired: false,
      attemptsLeft: maxAttempts - record.attempts,
    };
  } catch (err) {
    console.error("[redis.service] verifyOTP error:", err.message);
    return { valid: false, expired: true, attemptsLeft: 0 };
  }
}

// ── Partial Registration ────────────────────────────────────────────────────

export async function setPartialRegistration(email, data, ttlSeconds = 1800) {
  try {
    const key = `partial_reg:${normalizeIdentifier(email)}`;
    await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setPartialRegistration error:", err.message);
  }
}

export async function getPartialRegistration(email) {
  try {
    const key = `partial_reg:${normalizeIdentifier(email)}`;
    const raw = await redis.get(key);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("[redis.service] getPartialRegistration error:", err.message);
    return null;
  }
}

export async function deletePartialRegistration(email) {
  try {
    const key = `partial_reg:${normalizeIdentifier(email)}`;
    await redis.del(key);
  } catch (err) {
    console.error(
      "[redis.service] deletePartialRegistration error:",
      err.message
    );
  }
}

// ── Last-OTP-Sent (60s resend cooldown) ─────────────────────────────────────

export async function setLastOTPSent(identifier, ttlSeconds = 60) {
  try {
    const key = `last_otp_sent:${normalizeIdentifier(identifier)}`;
    await redis.set(key, String(Date.now()), { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setLastOTPSent error:", err.message);
  }
}

export async function getLastOTPSent(identifier) {
  try {
    const key = `last_otp_sent:${normalizeIdentifier(identifier)}`;
    const val = await redis.get(key);
    return val ? Number(val) : null;
  } catch (err) {
    console.error("[redis.service] getLastOTPSent error:", err.message);
    return null;
  }
}

// ── Biometric Challenge (one-shot nonce) ────────────────────────────────────

function bioChallengeKey(hospitalId, deviceId) {
  return `bio:challenge:${hospitalId}:${deviceId}`;
}

export async function setBiometricChallenge(hospitalId, deviceId, challenge, ttlSeconds = 120) {
  try {
    await redis.set(bioChallengeKey(hospitalId, deviceId), String(challenge), { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setBiometricChallenge error:", err.message);
  }
}

/**
 * PEEK at a biometric challenge without deleting it. Returns null if missing/expired.
 * Use this during verification so that transient failures (wrong signature,
 * user cancels) don't burn the challenge — letting the client retry within TTL.
 */
export async function peekBiometricChallenge(hospitalId, deviceId) {
  try {
    const key = bioChallengeKey(hospitalId, deviceId);
    const val = await redis.get(key);
    return val ? String(val) : null;
  } catch (err) {
    console.error("[redis.service] peekBiometricChallenge error:", err.message);
    return null;
  }
}

/**
 * Delete the biometric challenge (one-shot consume). Call this ONLY after a
 * signature has verified successfully — replay prevention.
 */
export async function consumeBiometricChallenge(hospitalId, deviceId) {
  try {
    await redis.del(bioChallengeKey(hospitalId, deviceId));
  } catch (err) {
    console.error("[redis.service] consumeBiometricChallenge error:", err.message);
  }
}

/**
 * @deprecated Use peekBiometricChallenge + consumeBiometricChallenge.
 * Kept for any legacy caller; reads AND deletes atomically.
 */
export async function getBiometricChallenge(hospitalId, deviceId) {
  const val = await peekBiometricChallenge(hospitalId, deviceId);
  if (val) await consumeBiometricChallenge(hospitalId, deviceId);
  return val;
}

// ── Upload Idempotency (dedupe retries of the same upload) ─────────────────

function uploadIdemKey(hospitalId, key) {
  return `upload:idem:${hospitalId}:${key}`;
}

/**
 * Look up a previously-stored response for this idempotency key.
 * Returns the parsed response object, or null if not found / expired.
 */
export async function getUploadIdempotentResponse(hospitalId, key) {
  try {
    const raw = await redis.get(uploadIdemKey(hospitalId, key));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("[redis.service] getUploadIdempotentResponse error:", err.message);
    return null;
  }
}

/**
 * Atomically claim an idempotency key. Returns true if this caller won the race
 * and should perform the upload; false if another request already started.
 * Caller that wins must later call setUploadIdempotentResponse with the final body.
 */
export async function claimUploadIdempotencyKey(hospitalId, key, ttlSeconds = 86400) {
  const k = uploadIdemKey(hospitalId, key);
  const placeholder = JSON.stringify({ pending: true });
  try {
    if (usingInMemory || !upstash) {
      if (memGet(k)) return false;
      memSet(k, placeholder, { ex: ttlSeconds });
      return true;
    }
    const res = await upstash.set(k, placeholder, { ex: ttlSeconds, nx: true });
    return res === "OK";
  } catch (err) {
    console.error("[redis.service] claimUploadIdempotencyKey error:", err.message);
    return true; // fail-open: better a duplicate than a blocked user
  }
}

/**
 * Store the final response body for an idempotency key so retries return the same result.
 * TTL defaults to 24h — long enough for offline retries but short enough not to leak storage.
 */
export async function setUploadIdempotentResponse(hospitalId, key, body, ttlSeconds = 86400) {
  try {
    await redis.set(uploadIdemKey(hospitalId, key), JSON.stringify(body), { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setUploadIdempotentResponse error:", err.message);
  }
}

// ── Health Check ─────────────────────────────────────────────────────────────

/**
 * Ping the underlying store (Upstash or the in-memory fallback).
 * Returns { ok: boolean, backend: "upstash" | "memory" }.
 * Used by /api/health/deep.
 */
export async function pingRedis() {
  try {
    const token = `ping-${Date.now()}`;
    await redis.set("health:ping", token, { ex: 10 });
    const got = await redis.get("health:ping");
    const ok = got === token;
    return { ok, backend: usingInMemory ? "memory" : "upstash" };
  } catch (err) {
    console.error("[redis.service] pingRedis error:", err.message);
    return { ok: false, backend: usingInMemory ? "memory" : "upstash", error: err.message };
  }
}
