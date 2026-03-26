import crypto from "crypto";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function normalizeIdentifier(identifier) {
  return String(identifier).toLowerCase().trim();
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

// ---------------------------------------------------------------------------
// 1. OTP
// ---------------------------------------------------------------------------

export async function setOTP(identifier, otp, ttlSeconds = 600) {
  try {
    const key = `otp:${normalizeIdentifier(identifier)}`;
    const data = JSON.stringify({ hash: hashOTP(otp), attempts: 0 });
    await redis.set(key, data, { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setOTP error:", err.message);
  }
}

export async function verifyOTP(identifier, providedOtp) {
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

    if (record.attempts >= 5) {
      await redis.del(key);
      return { valid: false, expired: false, attemptsLeft: 0 };
    }

    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(record), { ex: ttl > 0 ? ttl : 600 });

    return {
      valid: false,
      expired: false,
      attemptsLeft: 5 - record.attempts,
    };
  } catch (err) {
    console.error("[redis.service] verifyOTP error:", err.message);
    return { valid: false, expired: true, attemptsLeft: 0 };
  }
}

// ---------------------------------------------------------------------------
// 3-5. Partial Registration
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 6-8. Sessions
// ---------------------------------------------------------------------------

export async function setSession(
  sessionId,
  userId,
  deviceInfo,
  ttlSeconds = 86400
) {
  try {
    const sessionKey = `session:${sessionId}`;
    const userSessionKey = `user_session:${userId}`;

    const data = JSON.stringify({
      userId,
      deviceInfo,
      createdAt: Date.now(),
    });

    await redis.set(sessionKey, data, { ex: ttlSeconds });
    await redis.set(userSessionKey, sessionId, { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setSession error:", err.message);
  }
}

export async function getSession(sessionId) {
  try {
    const key = `session:${sessionId}`;
    const raw = await redis.get(key);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("[redis.service] getSession error:", err.message);
    return null;
  }
}

export async function deleteSession(sessionId) {
  try {
    const key = `session:${sessionId}`;
    await redis.del(key);
  } catch (err) {
    console.error("[redis.service] deleteSession error:", err.message);
  }
}

// ---------------------------------------------------------------------------
// 9. Invalidate User Sessions
// ---------------------------------------------------------------------------

export async function invalidateUserSessions(userId) {
  try {
    const userSessionKey = `user_session:${userId}`;
    const sessionId = await redis.get(userSessionKey);

    if (sessionId) {
      await redis.del(`session:${sessionId}`);
    }

    await redis.del(userSessionKey);
  } catch (err) {
    console.error(
      "[redis.service] invalidateUserSessions error:",
      err.message
    );
  }
}

// ---------------------------------------------------------------------------
// 10-13. Login Attempts
// ---------------------------------------------------------------------------

export async function setLoginAttempts(identifier, count, ttlSeconds = 900) {
  try {
    const key = `login_attempts:${normalizeIdentifier(identifier)}`;
    await redis.set(key, String(count), { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setLoginAttempts error:", err.message);
  }
}

export async function getLoginAttempts(identifier) {
  try {
    const key = `login_attempts:${normalizeIdentifier(identifier)}`;
    const val = await redis.get(key);
    return val ? Number(val) : 0;
  } catch (err) {
    console.error("[redis.service] getLoginAttempts error:", err.message);
    return 0;
  }
}

export async function incrementLoginAttempts(identifier) {
  try {
    const current = await getLoginAttempts(identifier);
    await setLoginAttempts(identifier, current + 1, 900);
    return current + 1;
  } catch (err) {
    console.error("[redis.service] incrementLoginAttempts error:", err.message);
    return 0;
  }
}

export async function clearLoginAttempts(identifier) {
  try {
    const key = `login_attempts:${normalizeIdentifier(identifier)}`;
    await redis.del(key);
  } catch (err) {
    console.error("[redis.service] clearLoginAttempts error:", err.message);
  }
}

// ---------------------------------------------------------------------------
// 14-16. OTP Resend Count
// ---------------------------------------------------------------------------

export async function setOTPResendCount(identifier, count, ttlSeconds = 3600) {
  try {
    const key = `otp_resend:${normalizeIdentifier(identifier)}`;
    await redis.set(key, String(count), { ex: ttlSeconds });
  } catch (err) {
    console.error("[redis.service] setOTPResendCount error:", err.message);
  }
}

export async function getOTPResendCount(identifier) {
  try {
    const key = `otp_resend:${normalizeIdentifier(identifier)}`;
    const val = await redis.get(key);
    return val ? Number(val) : 0;
  } catch (err) {
    console.error("[redis.service] getOTPResendCount error:", err.message);
    return 0;
  }
}

export async function incrementOTPResendCount(identifier) {
  try {
    const current = await getOTPResendCount(identifier);
    await setOTPResendCount(identifier, current + 1, 3600);
    return current + 1;
  } catch (err) {
    console.error("[redis.service] incrementOTPResendCount error:", err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 17-18. Last OTP Sent (rate-limiting)
// ---------------------------------------------------------------------------

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
