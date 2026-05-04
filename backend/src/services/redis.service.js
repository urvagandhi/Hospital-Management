import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";
import crypto from "crypto";
import logger from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Redis client with in-memory fallback
//
// Strategy:
//   1. If Upstash Creds exist → Use Upstash (REST) - Best for Development.
//   2. Else if REDIS_URL exists → Use IORedis (TCP) - Best for Production Host.
//   3. Otherwise → Fallback to In-Memory Map.
// ─────────────────────────────────────────────────────────────────────────────

const memStore = new Map();
const memTimers = new Map();

function memSet(key, value, { ex } = {}) {
  const expiresAt = ex ? Date.now() + ex * 1000 : null;
  memStore.set(key, { value: String(value), expiresAt });
  if (memTimers.has(key)) clearTimeout(memTimers.get(key));
  if (ex) {
    const h = setTimeout(() => { memStore.delete(key); memTimers.delete(key); }, ex * 1000);
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
  if (!rec) return -2;
  if (!rec.expiresAt) return -1;
  const remaining = Math.ceil((rec.expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : -2;
}

// ── Initialization ──────────────────────────────────────────────────────────
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisUrl = process.env.REDIS_URL;

let mode = "memory"; // "upstash" | "native" | "memory"
let upstashClient = null;
let nativeClient = null;

if (upstashUrl && upstashToken) {
  mode = "upstash";
  upstashClient = new UpstashRedis({ url: upstashUrl, token: upstashToken });
  logger.info({ event: "redis_init", mode: "upstash" }, "[redis.service] Using Upstash Redis (REST)");
} else if (redisUrl) {
  mode = "native";
  nativeClient = new IORedis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  });
  nativeClient.on("error", (err) => {
    logger.error({ event: "redis_error", err }, `[redis.service] Native Redis error: ${err.message}`);
  });
  logger.info({ event: "redis_init", mode: "native" }, "[redis.service] Using Native Redis (TCP)");
} else {
  logger.warn({ event: "redis_init", mode: "memory" }, "[redis.service] No Redis credentials found — using in-memory fallback");
}

let usingInMemoryFallback = (mode === "memory");

const redis = {
  async get(key) {
    if (usingInMemoryFallback) return memGet(key);
    try {
      if (mode === "upstash") return await upstashClient.get(key);
      if (mode === "native") return await nativeClient.get(key);
    } catch (err) {
      logger.warn({ event: "redis_fallback", err }, "[redis.service] Backend failed, using in-memory");
      usingInMemoryFallback = true;
      return memGet(key);
    }
    return memGet(key);
  },

  async set(key, value, opts = {}) {
    if (usingInMemoryFallback) return memSet(key, value, opts);
    try {
      if (mode === "upstash") return await upstashClient.set(key, value, opts);
      if (mode === "native") {
        const { ex } = opts;
        if (ex) return await nativeClient.set(key, value, "EX", ex);
        return await nativeClient.set(key, value);
      }
    } catch (err) {
      usingInMemoryFallback = true;
      return memSet(key, value, opts);
    }
    return memSet(key, value, opts);
  },

  async del(key) {
    if (usingInMemoryFallback) return memDel(key);
    try {
      if (mode === "upstash") return await upstashClient.del(key);
      if (mode === "native") return await nativeClient.del(key);
    } catch (err) {
      usingInMemoryFallback = true;
      return memDel(key);
    }
    return memDel(key);
  },

  async ttl(key) {
    if (usingInMemoryFallback) return memTtl(key);
    try {
      if (mode === "upstash") return await upstashClient.ttl(key);
      if (mode === "native") return await nativeClient.ttl(key);
    } catch (err) {
      usingInMemoryFallback = true;
      return memTtl(key);
    }
    return memTtl(key);
  },
};

export { redis };

export function isUsingInMemoryStore() {
  return usingInMemoryFallback;
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
    logger.error({ event: "redis_set_otp_failed", err }, "[redis.service] setOTP error");
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
    logger.error({ event: "redis_verify_otp_failed", err }, "[redis.service] verifyOTP error");
    return { valid: false, expired: true, attemptsLeft: 0 };
  }
}

// ── Partial Registration ────────────────────────────────────────────────────

export async function setPartialRegistration(email, data, ttlSeconds = 1800) {
  try {
    const key = `partial_reg:${normalizeIdentifier(email)}`;
    await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
  } catch (err) {
    logger.error({ event: "redis_set_partial_registration_failed", err }, "[redis.service] setPartialRegistration error");
  }
}

export async function getPartialRegistration(email) {
  try {
    const key = `partial_reg:${normalizeIdentifier(email)}`;
    const raw = await redis.get(key);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    logger.error({ event: "redis_get_partial_registration_failed", err }, "[redis.service] getPartialRegistration error");
    return null;
  }
}

export async function deletePartialRegistration(email) {
  try {
    const key = `partial_reg:${normalizeIdentifier(email)}`;
    await redis.del(key);
  } catch (err) {
    logger.error(
      { event: "redis_delete_partial_registration_failed", err },
      "[redis.service] deletePartialRegistration error",
    );
  }
}

// ── Last-OTP-Sent (60s resend cooldown) ─────────────────────────────────────

export async function setLastOTPSent(identifier, ttlSeconds = 60) {
  try {
    const key = `last_otp_sent:${normalizeIdentifier(identifier)}`;
    await redis.set(key, String(Date.now()), { ex: ttlSeconds });
  } catch (err) {
    logger.error({ event: "redis_set_last_otp_sent_failed", err }, "[redis.service] setLastOTPSent error");
  }
}

export async function getLastOTPSent(identifier) {
  try {
    const key = `last_otp_sent:${normalizeIdentifier(identifier)}`;
    const val = await redis.get(key);
    return val ? Number(val) : null;
  } catch (err) {
    logger.error({ event: "redis_get_last_otp_sent_failed", err }, "[redis.service] getLastOTPSent error");
    return null;
  }
}

// ── Forgot-Password OTP ─────────────────────────────────────────────────────
//
//   forgot_otp:{hospitalId}      OTP hash + attempt counter     TTL: 10 min
//                                Keyed by hospitalId (not identifier) so the
//                                same pattern works for email- or phone-based
//                                lookups, and so the OTP namespace can't
//                                collide with the registration `otp:{email}`
//                                key.
//
//   forgot_last_sent:{hospitalId} Unix-ms timestamp of last send TTL: 60 sec
//                                Drives the resend cooldown.

function forgotOtpKey(hospitalId) {
  return `forgot_otp:${hospitalId}`;
}
function forgotLastSentKey(hospitalId) {
  return `forgot_last_sent:${hospitalId}`;
}

export async function setForgotPasswordOtp(hospitalId, otp, ttlSeconds = 600) {
  try {
    const data = JSON.stringify({ hash: hashOTP(otp), attempts: 0 });
    await redis.set(forgotOtpKey(hospitalId), data, { ex: ttlSeconds });
  } catch (err) {
    logger.error({ event: "redis_set_forgot_password_otp_failed", err }, "[redis.service] setForgotPasswordOtp error");
  }
}

export async function verifyForgotPasswordOtp(hospitalId, providedOtp, maxAttempts = 5) {
  try {
    const key = forgotOtpKey(hospitalId);
    const raw = await redis.get(key);
    if (!raw) return { valid: false, expired: true, attemptsLeft: 0 };

    const record = typeof raw === "string" ? JSON.parse(raw) : raw;
    const providedHash = hashOTP(providedOtp);

    if (providedHash === record.hash) {
      await redis.del(key);
      return { valid: true, expired: false, attemptsLeft: 0 };
    }

    record.attempts += 1;
    if (record.attempts >= maxAttempts) {
      await redis.del(key);
      return { valid: false, expired: false, attemptsLeft: 0 };
    }

    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(record), { ex: ttl > 0 ? ttl : 600 });
    return { valid: false, expired: false, attemptsLeft: maxAttempts - record.attempts };
  } catch (err) {
    logger.error({ event: "redis_verify_forgot_password_otp_failed", err }, "[redis.service] verifyForgotPasswordOtp error");
    return { valid: false, expired: true, attemptsLeft: 0 };
  }
}

export async function deleteForgotPasswordOtp(hospitalId) {
  try {
    await redis.del(forgotOtpKey(hospitalId));
  } catch (err) {
    logger.error({ event: "redis_delete_forgot_password_otp_failed", err }, "[redis.service] deleteForgotPasswordOtp error");
  }
}

export async function setForgotPasswordLastSent(hospitalId, ttlSeconds = 60) {
  try {
    await redis.set(forgotLastSentKey(hospitalId), String(Date.now()), { ex: ttlSeconds });
  } catch (err) {
    logger.error({ event: "redis_set_forgot_password_last_sent_failed", err }, "[redis.service] setForgotPasswordLastSent error");
  }
}

export async function getForgotPasswordLastSent(hospitalId) {
  try {
    const val = await redis.get(forgotLastSentKey(hospitalId));
    return val ? Number(val) : null;
  } catch (err) {
    logger.error({ event: "redis_get_forgot_password_last_sent_failed", err }, "[redis.service] getForgotPasswordLastSent error");
    return null;
  }
}

// ── Contact-Change OTP (email / phone change in settings) ──────────────────
//
//   contact_change:{hospitalId}  { field, newValue, hash, attempts }  TTL: 10m
//                                OTP is always emailed to the CURRENT email on
//                                file (proof the user still controls the
//                                account), regardless of which field is being
//                                changed. SMS path deferred.

function contactChangeKey(hospitalId) {
  return `contact_change:${hospitalId}`;
}

export async function setContactChangeRequest(hospitalId, field, newValue, otp, ttlSeconds = 600) {
  try {
    const data = JSON.stringify({
      field,
      newValue,
      hash: hashOTP(otp),
      attempts: 0,
    });
    await redis.set(contactChangeKey(hospitalId), data, { ex: ttlSeconds });
  } catch (err) {
    logger.error({ event: "redis_set_contact_change_request_failed", err }, "[redis.service] setContactChangeRequest error");
  }
}

export async function getContactChangeRequest(hospitalId) {
  try {
    const raw = await redis.get(contactChangeKey(hospitalId));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    logger.error({ event: "redis_get_contact_change_request_failed", err }, "[redis.service] getContactChangeRequest error");
    return null;
  }
}

export async function verifyContactChangeOtp(hospitalId, providedOtp, maxAttempts = 5) {
  try {
    const key = contactChangeKey(hospitalId);
    const raw = await redis.get(key);
    if (!raw) return { valid: false, expired: true, attemptsLeft: 0, request: null };

    const record = typeof raw === "string" ? JSON.parse(raw) : raw;
    const providedHash = hashOTP(providedOtp);

    if (providedHash === record.hash) {
      await redis.del(key);
      return {
        valid: true,
        expired: false,
        attemptsLeft: 0,
        request: { field: record.field, newValue: record.newValue },
      };
    }

    record.attempts += 1;
    if (record.attempts >= maxAttempts) {
      await redis.del(key);
      return { valid: false, expired: false, attemptsLeft: 0, request: null };
    }
    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(record), { ex: ttl > 0 ? ttl : 600 });
    return {
      valid: false,
      expired: false,
      attemptsLeft: maxAttempts - record.attempts,
      request: null,
    };
  } catch (err) {
    logger.error({ event: "redis_verify_contact_change_otp_failed", err }, "[redis.service] verifyContactChangeOtp error");
    return { valid: false, expired: true, attemptsLeft: 0, request: null };
  }
}

export async function deleteContactChangeRequest(hospitalId) {
  try {
    await redis.del(contactChangeKey(hospitalId));
  } catch (err) {
    logger.error({ event: "redis_delete_contact_change_request_failed", err }, "[redis.service] deleteContactChangeRequest error");
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
    logger.error({ event: "redis_set_biometric_challenge_failed", err }, "[redis.service] setBiometricChallenge error");
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
    logger.error({ event: "redis_peek_biometric_challenge_failed", err }, "[redis.service] peekBiometricChallenge error");
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
    logger.error({ event: "redis_consume_biometric_challenge_failed", err }, "[redis.service] consumeBiometricChallenge error");
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
    logger.error({ event: "redis_get_upload_idempotent_response_failed", err }, "[redis.service] getUploadIdempotentResponse error");
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
    if (usingInMemoryFallback) {
      if (memGet(k)) return false;
      memSet(k, placeholder, { ex: ttlSeconds });
      return true;
    }
    // Using nx: true ensures only the first request sets the key
    const res = await redis.set(k, placeholder, { ex: ttlSeconds, nx: true });
    return res === "OK" || res === 1;
  } catch (err) {
    logger.error({ event: "redis_claim_upload_idempotency_failed", err }, "[redis.service] claimUploadIdempotencyKey error");
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
    logger.error({ event: "redis_set_upload_idempotent_response_failed", err }, "[redis.service] setUploadIdempotentResponse error");
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
    return { ok, backend: mode };
  } catch (err) {
    logger.error({ event: "redis_ping_failed", err }, "[redis.service] pingRedis error");
    return { ok: false, backend: mode, error: err.message };
  }
}
