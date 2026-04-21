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
import scheduleAutoDelete from "./jobs/autoDelete.job.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import adminRoutes from "./routes/admin.routes.js";
import appVersionRoutes from "./routes/appVersion.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import authRoutes from "./routes/auth.routes.js";
import exportRoutes from "./routes/export.routes.js";
import hospitalsRoutes from "./routes/hospitals.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import patientRoutes from "./routes/patient.routes.js";

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
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);

  if (config.NODE_ENV === "development") {
    // Strip sensitive headers and body fields from logs
    const { authorization, cookie, ...safeHeaders } = req.headers;
    console.log("[Request] Headers:", safeHeaders);

    if (req.body && typeof req.body === "object") {
      const { password, newPassword, token, code, ...safeBody } = req.body;
      console.log("[Request] Body:", safeBody);
    }
  }

  next();
});

// ============ SECURITY MIDDLEWARE ============
app.use(helmet()); // Set security HTTP headers

// ============ CORS CONFIGURATION ============
// IMPORTANT: CORS must run BEFORE the rate limiter. Otherwise a 429 response
// skips the CORS middleware entirely, drops the Access-Control-Allow-Origin
// header, and the browser reports it as a CORS error — masking the real
// rate-limit failure (which we saw on the Sessions page in dev).
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        ...config.FRONTEND_URL.split(",").map((u) => u.trim()),
        ...(config.NODE_ENV !== "production"
          ? ["http://localhost:3000", "http://localhost:5173"]
          : []),
      ];

      // Allow requests with no origin (mobile apps, server-to-server)
      // These are still protected by JWT authentication
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
app.use("/api/notifications", notificationsRoutes);
app.use("/api/admin", adminRoutes);

// ============ HEALTH CHECK ============
app.get("/api/health", (req, res) => {
  const userAgent = req.get("user-agent") || "";
  const forwardedFor = req.get("x-forwarded-for") || "";
  const clientIp = forwardedFor ? forwardedFor.split(",", 1)[0].trim() : req.ip;
  console.log(
    `[health] hit source=${inferHealthCheckSource(userAgent)} ip=${clientIp || "unknown"} ua=${userAgent || "n/a"}`,
  );
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Deep health check (auth + admin required)
app.get("/api/health/deep", async (req, res) => {
  const userAgent = req.get("user-agent") || "";
  const forwardedFor = req.get("x-forwarded-for") || "";
  const clientIp = forwardedFor ? forwardedFor.split(",", 1)[0].trim() : req.ip;
  console.log(
    `[health:deep] hit source=${inferHealthCheckSource(userAgent)} ip=${clientIp || "unknown"} ua=${userAgent || "n/a"}`,
  );
  const checks = { server: "ok", database: "unknown", redis: "unknown" };
  try {
    // Check MongoDB
    const mongoose = (await import("mongoose")).default;
    if (mongoose.connection.readyState === 1) {
      checks.database = "ok";
    } else {
      checks.database = "disconnected";
    }
    // Check Redis (Upstash, with in-memory fallback)
    let redisBackend = null;
    try {
      const { pingRedis } = await import("./services/redis.service.js");
      const result = await pingRedis();
      checks.redis = result.ok ? "ok" : "error";
      redisBackend = result.backend;
    } catch (e) {
      checks.redis = "unavailable";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");
    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ok" : "degraded",
      checks,
      ...(redisBackend ? { redisBackend } : {}),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({ status: "error", checks, timestamp: new Date().toISOString() });
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
    scheduleAutoDelete();

    // Start Express server
    app.listen(config.PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║   Hospital Management API             ║
║   ✓ Server running on port ${config.PORT}       ║
║   ✓ Environment: ${config.NODE_ENV}          ║
║   ✓ DB: MongoDB Connected             ║
║   ✓ Auto-delete job scheduled         ║
╚════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
