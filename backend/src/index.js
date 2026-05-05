/**
 * Main Application Entry Point
 * Initializes Express server with all middleware and routes
 */

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import connectDB from "./config/db.js";
import config from "./config/env.js";
// import scheduleAutoDelete from "./jobs/autoDelete.job.js";
import scheduleIdleSweep from "./jobs/idleSweep.job.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import adminRoutes from "./routes/admin.routes.js";
import appVersionRoutes from "./routes/appVersion.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import authRoutes from "./routes/auth.routes.js";
import exportRoutes from "./routes/export.routes.js";
import hospitalsRoutes from "./routes/hospitals.routes.js";
import patientRoutes from "./routes/patient.routes.js";
import getClientIp from "./utils/clientIp.js";
import logger, { httpLogger } from "./utils/logger.js";

const app = express();

function inferHealthCheckSource(userAgent = "") {
  const ua = String(userAgent).toLowerCase();
  if (ua.includes("uptime") || ua.includes("statuscake") || ua.includes("healthcheck")) {
    return "uptime-monitor";
  }
  if (ua.includes("cron")) {
    return "cron-job";
  }
  if (ua) {
    return "manual-or-client";
  }
  return "unknown";
}

function normalizeOrigin(value) {
  if (!value) return null;

  const trimmed = String(value).trim().replace(/\/$/, "");

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

// ============ TRUST PROXY (Required for Render/Heroku/Cloudflare) ============
// Must be a SPECIFIC number of hops — not `true`. `true` tells Express to
// trust every proxy in the chain, which express-rate-limit rejects because
// a client could forge X-Forwarded-For to bypass rate limits
// (ERR_ERL_PERMISSIVE_TRUST_PROXY). Use the actual hop count for the
// deployment:
//   • Render alone             → 1
//   • Render + Cloudflare/CDN  → 2
//   • Render + CF + extra LB   → 3
// If you still see internal 10.x / 172.16.x addresses in Sessions after
// login, bump this by 1.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 2));

// ============ REQUEST LOGGING MIDDLEWARE ============
// pino-http attaches `req.log` with a bound `request_id` (from X-Request-Id
// header or generated). Authorization / Cookie headers + password-like body
// fields are redacted centrally in utils/logger.js. Echoes X-Request-Id back
// on the response so clients can correlate.
app.use(httpLogger);

// ============ SECURITY MIDDLEWARE ============
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin" },
  }),
); // Set security HTTP headers

// ============ CORS CONFIGURATION ============
// IMPORTANT: CORS must run BEFORE the rate limiter. Otherwise a 429 response
// skips the CORS middleware entirely, drops the Access-Control-Allow-Origin
// header, and the browser reports it as a CORS error — masking the real
// rate-limit failure (which we saw on the Sessions page in dev).
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        ...config.FRONTEND_URL.split(",").map((u) => normalizeOrigin(u)).filter(Boolean),
        "https://mymedivault.in",
        "https://www.mymedivault.in",
        ...(config.NODE_ENV !== "production"
          ? ["http://localhost:3000", "http://localhost:5173"]
          : []),
      ].map((u) => normalizeOrigin(u)).filter(Boolean);
      const normalizedOrigin = normalizeOrigin(origin);

      // Allow requests with no origin (mobile apps, server-to-server)
      // These are still protected by JWT authentication
      if (!normalizedOrigin) return callback(null, true);

      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
      } else {
        logger.warn({ event: "cors_blocked", origin: normalizedOrigin }, "Blocked by CORS");
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Client-Type", "X-Request-Id"],
    optionsSuccessStatus: 200,
  }),
);

// ============ RATE LIMITING ============
app.use(generalLimiter);

// ============ BODY PARSING ============
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

// ============ API ROUTES ============
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/hospitals", hospitalsRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/audits", auditRoutes);
app.use("/api/version", appVersionRoutes);
app.use("/api/admin", adminRoutes);

// ============ HEALTH CHECK ============
app.get("/api/health", (req, res) => {
  const userAgent = req.get("user-agent") || "";
  const clientIp = getClientIp(req);
  req.log.info(
    {
      event: "health_hit",
      source: inferHealthCheckSource(userAgent),
      client_ip: clientIp || "unknown",
      user_agent: userAgent || null,
    },
    "health endpoint hit",
  );
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Deep health check — probes Mongo, Redis, Cloudinary, Brevo, FCM, and the
// compression sidecar in parallel. Each probe has a 3s hard timeout; not
// configured dependencies report `status: "disabled"` and do not mark the
// system degraded. See services/health.service.js for probe internals.
app.get("/api/health/deep", async (req, res) => {
  const userAgent = req.get("user-agent") || "";
  const clientIp = getClientIp(req);
  req.log.info(
    {
      event: "health_deep_hit",
      source: inferHealthCheckSource(userAgent),
      client_ip: clientIp || "unknown",
      user_agent: userAgent || null,
    },
    "deep health endpoint hit",
  );
  try {
    const { probeAllExternals } = await import("./services/health.service.js");
    const { checks, degraded } = await probeAllExternals();
    res.status(degraded ? 503 : 200).json({
      status: degraded ? "degraded" : "ok",
      degraded,
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    req.log.error(
      { event: "health_deep_failed", err: error },
      "deep health probe runner failed",
    );
    res.status(503).json({
      status: "error",
      degraded: true,
      checks: { server: { status: "ok" } },
      error: error?.message || "probe runner failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// ============ 404 HANDLER ============
app.use(notFoundHandler);

// ============ GLOBAL ERROR HANDLER ============
app.use(errorHandler);

// ============ DATABASE CONNECTION & SERVER START ============
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Schedule auto-delete cron job
    // scheduleAutoDelete();

    // Schedule idle-session sweep — retires sessions idle > 15 min so closing
    // a tab without explicit logout doesn't leave ghost rows in the list.
    scheduleIdleSweep();

    // Start Express server
    const server = app.listen(config.PORT, () => {
      // ... same logs as before ...
      if (config.NODE_ENV !== "production") {
        process.stdout.write(`
╔════════════════════════════════════════╗
║   MyMediVault API                        ║
║   ✓ Server running on port ${String(config.PORT).padEnd(12)}║
║   ✓ Environment: ${String(config.NODE_ENV).padEnd(22)}║
║   ✓ DB: MongoDB Connected              ║
║   ✓ Auto-delete job scheduled          ║
╚════════════════════════════════════════╝
`);
      }
      logger.info(
        {
          event: "server_started",
          port: config.PORT,
          env: config.NODE_ENV,
        },
        `MyMediVault API listening on port ${config.PORT}`,
      );
    });

    // Set server-wide timeout to 10 minutes (600,000ms) for large PDF merges
    server.timeout = 600000;
    server.headersTimeout = 600000;
    server.keepAliveTimeout = 600000;
  } catch (error) {
    logger.fatal({ event: "server_start_failed", err: error }, "Failed to start server");
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
