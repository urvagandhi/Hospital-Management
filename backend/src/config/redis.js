/**
 * Redis Configuration
 * Used for OTP caching, partial registration, rate limiting state
 */

import Redis from "ioredis";
import config from "./env.js";

let redis = null;

/**
 * Get or create Redis client singleton
 * Falls back to in-memory Map when Redis is unavailable (dev mode)
 */
export const getRedis = () => {
  if (redis) return redis;

  if (config.REDIS_URL) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    redis.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    redis.connect().catch((err) => {
      console.error("[Redis] Initial connection failed:", err.message);
      console.warn("[Redis] Falling back to in-memory store");
      redis = createInMemoryStore();
    });
  } else {
    console.warn("[Redis] No REDIS_URL configured — using in-memory store");
    redis = createInMemoryStore();
  }

  return redis;
};

/**
 * In-memory fallback (development only)
 */
function createInMemoryStore() {
  const store = new Map();
  return {
    async get(key) {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }
      return item.value;
    },
    async set(key, value, ...args) {
      let ttlMs = null;
      // Handle set(key, value, "EX", seconds)
      if (args[0] === "EX" && args[1]) {
        ttlMs = args[1] * 1000;
      }
      store.set(key, {
        value,
        expiresAt: ttlMs ? Date.now() + ttlMs : null,
      });
      return "OK";
    },
    async del(key) {
      store.delete(key);
      return 1;
    },
    async incr(key) {
      const current = store.get(key);
      const val = current ? parseInt(current.value || "0") + 1 : 1;
      store.set(key, { value: String(val), expiresAt: current?.expiresAt || null });
      return val;
    },
    async expire(key, seconds) {
      const item = store.get(key);
      if (item) {
        item.expiresAt = Date.now() + seconds * 1000;
      }
      return 1;
    },
    async ttl(key) {
      const item = store.get(key);
      if (!item || !item.expiresAt) return -1;
      const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    },
  };
}

export default { getRedis };
