/**
 * Health probes for /api/health/deep.
 *
 * Each probe is shaped identically: `{ status, latency_ms, detail?, ...extra }`.
 *   • status "ok"        — dependency answered successfully within the timeout
 *   • status "error"     — dependency answered with an error or threw
 *   • status "timeout"   — did not answer within PROBE_TIMEOUT_MS
 *   • status "disabled"  — this env doesn't have the dependency configured
 *                          (e.g. no BREVO_API_KEY, or USE_COMPRESSION_SERVICE=false)
 *   • status "disconnected" — mongoose readyState !== 1 at probe time
 *
 * The overall `degraded` flag is true iff any configured dependency is not
 * `ok`. `disabled` dependencies never mark the system degraded — a feature
 * that isn't wired in this env can't be failing.
 */

import config from "../config/env.js";

const PROBE_TIMEOUT_MS = 3000;

/**
 * Wraps a probe in a hard timeout. The AbortSignal is forwarded to the probe
 * so fetch-based probes can abort cleanly; SDK-based probes (Cloudinary,
 * firebase-admin) lose the abort race via Promise.race but their in-flight
 * work is harmless (no state mutation).
 */
async function runProbe(probeFn, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error(`exceeded ${timeoutMs}ms`);
      err.__timeout = true;
      reject(err);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([probeFn(controller.signal), timeoutPromise]);
    return { status: "ok", latency_ms: Date.now() - started, ...(result || {}) };
  } catch (err) {
    const latency_ms = Date.now() - started;
    if (err?.__timeout || err?.name === "AbortError" || controller.signal.aborted) {
      return { status: "timeout", latency_ms, detail: `exceeded ${timeoutMs}ms` };
    }
    return { status: "error", latency_ms, detail: err?.message || "unknown error" };
  } finally {
    clearTimeout(timer);
  }
}

async function probeDatabase() {
  const mongoose = (await import("mongoose")).default;
  if (mongoose.connection.readyState !== 1) {
    return { status: "disconnected", latency_ms: 0 };
  }
  return runProbe(async () => {
    await mongoose.connection.db.admin().ping();
    return {};
  });
}

async function probeRedis() {
  return runProbe(async () => {
    const { pingRedis } = await import("./redis.service.js");
    const result = await pingRedis();
    if (!result.ok) {
      throw new Error(result.error || "ping failed");
    }
    return { backend: result.backend };
  });
}

async function probeCloudinary() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    return { status: "disabled", latency_ms: 0, detail: "CLOUDINARY_* not configured" };
  }
  // Cloudinary's `api.ping()` is routinely 2-4s on cold calls from non-US
  // regions — the 3s global probe budget is too tight for it. Give it 5s and
  // pass the same budget into the SDK so the underlying HTTP request aborts
  // instead of leaking.
  return runProbe(
    async () => {
      const { cloudinary } = await import("./storage.service.js");
      await cloudinary.api.ping({ timeout: 5000 });
      return {};
    },
    { timeoutMs: 5000 },
  );
}

async function probeBrevo() {
  if (!process.env.BREVO_API_KEY) {
    return { status: "disabled", latency_ms: 0, detail: "BREVO_API_KEY not configured" };
  }
  return runProbe(async (signal) => {
    const res = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        accept: "application/json",
      },
      signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return {};
  });
}

async function probeFcm() {
  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_PRIVATE_KEY ||
    !process.env.FIREBASE_CLIENT_EMAIL
  ) {
    return { status: "disabled", latency_ms: 0, detail: "FIREBASE_* not configured" };
  }
  return runProbe(async () => {
    const admin = (await import("firebase-admin")).default;
    if (!admin.apps.length) {
      throw new Error("firebase admin not initialized");
    }
    const credential = admin.app().options.credential;
    if (!credential || typeof credential.getAccessToken !== "function") {
      throw new Error("firebase credential missing getAccessToken");
    }
    // Mint an OAuth access token against Google's token endpoint — the cheapest
    // real round-trip that exercises the service-account credentials. Avoids
    // sending an actual FCM message (which would need a registration token).
    const token = await credential.getAccessToken();
    if (!token || !token.access_token) {
      throw new Error("no access token returned");
    }
    return {};
  });
}

async function probeSidecar() {
  if (!config.USE_COMPRESSION_SERVICE) {
    return { status: "disabled", latency_ms: 0, detail: "USE_COMPRESSION_SERVICE=false" };
  }
  if (!config.COMPRESSION_SERVICE_URL) {
    return { status: "disabled", latency_ms: 0, detail: "COMPRESSION_SERVICE_URL not set" };
  }
  return runProbe(async (signal) => {
    const base = config.COMPRESSION_SERVICE_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/api/health`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return {};
  });
}

/**
 * Run every probe in parallel and return the consolidated result.
 *
 * `degraded` is true iff any check is neither `ok` nor `disabled`. The caller
 * is responsible for translating `degraded` to an HTTP status code.
 */
export async function probeAllExternals() {
  const [database, redis, cloudinary, brevo, fcm, sidecar] = await Promise.all([
    probeDatabase(),
    probeRedis(),
    probeCloudinary(),
    probeBrevo(),
    probeFcm(),
    probeSidecar(),
  ]);

  const checks = {
    server: { status: "ok" },
    database,
    redis,
    cloudinary,
    brevo,
    fcm,
    sidecar,
  };

  const degraded = Object.values(checks).some(
    (c) => c.status !== "ok" && c.status !== "disabled",
  );

  return { checks, degraded };
}
