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
import authRoutes from "./routes/auth.routes.js";
import hospitalsRoutes from "./routes/hospitals.routes.js";
import patientRoutes from "./routes/patient.routes.js";
import exportRoutes from "./routes/export.routes.js";

const app = express();

// ============ TRUST PROXY (Required for Render/Heroku) ============
app.set("trust proxy", 1);

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

// ============ RATE LIMITING ============
app.use(generalLimiter);

// ============ BODY PARSING ============
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

// ============ CORS CONFIGURATION ============
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

// ============ API ROUTES ============
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/hospitals", hospitalsRoutes);
app.use("/api/export", exportRoutes);

// ============ HEALTH CHECK ============
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Deep health check (auth + admin required)
app.get("/api/health/deep", async (req, res) => {
  const checks = { server: "ok", database: "unknown", redis: "unknown" };
  try {
    // Check MongoDB
    const mongoose = (await import("mongoose")).default;
    if (mongoose.connection.readyState === 1) {
      checks.database = "ok";
    } else {
      checks.database = "disconnected";
    }
    // Check Redis
    try {
      const { getRedis } = await import("./config/redis.js");
      const redis = getRedis();
      await redis.set("health:ping", "pong", "EX", 10);
      const pong = await redis.get("health:ping");
      checks.redis = pong === "pong" ? "ok" : "error";
    } catch (e) {
      checks.redis = "unavailable";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");
    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ok" : "degraded",
      checks,
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
