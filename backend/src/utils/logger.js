/**
 * Centralised structured logger (pino).
 *
 * - JSON output in production, pretty-printed in development.
 * - Redacts Authorization / Cookie headers and password-like body fields.
 * - Every request is tagged with a `request_id` via pino-http so log lines
 *   from the same HTTP request can be correlated end-to-end.
 *
 * Usage:
 *   import logger from "../utils/logger.js";
 *   logger.info({ event: "login_success", userId }, "User logged in");
 *
 * Inside an Express handler, prefer `req.log` — it's the same logger with
 * the request id already bound.
 */

import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pino from "pino";
import pinoHttp from "pino-http";

// Logger can be imported before config/env.js by other modules.
// Load env files here as well so LOG_PRETTY and LOG_LEVEL are always honored.
const devEnvPath = path.resolve(process.cwd(), ".env.development");
if (fs.existsSync(devEnvPath)) {
  dotenv.config({ path: devEnvPath });
} else {
  dotenv.config();
}

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const forcePretty = process.env.LOG_PRETTY === "true";

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.password',
  'req.body.newPassword',
  'req.body.oldPassword',
  'req.body.currentPassword',
  'req.body.confirmPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.code',
  'req.body.otp',
  'req.body.authCode',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  // Top-level keys on the log merge-object (e.g. logger.info({ password, authCode }, "..."))
  'password',
  'newPassword',
  'oldPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'refreshToken',
  'otp',
  'authCode',
  '*.password',
  '*.newPassword',
  '*.oldPassword',
  '*.currentPassword',
  '*.confirmPassword',
  '*.token',
  '*.refreshToken',
  '*.otp',
  '*.authCode',
];

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  enabled: !isTest,
  base: {
    service: "hms-backend",
    env: process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  ...((isProd && !forcePretty)
    ? {}
    : {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,service,env",
          singleLine: false,
          hideObject: false,
          customLevels: "trace:10,debug:20,info:30,warn:40,error:50,fatal:60",
          customColors: "trace:gray,debug:blue,info:green,warn:yellow,error:red,fatal:magenta",
          messageFormat: "[{event}] {msg}",
        },
      },
    }),
});

/**
 * Express middleware that attaches pino-http's per-request logger (`req.log`),
 * generating a request id from `X-Request-Id` when present or a random hex
 * otherwise, and echoing it back on the response.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && incoming.length > 0 && incoming.length < 200
      ? incoming
      : crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} → ${res.statusCode} (${err?.message || "error"})`,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
      userAgent: req.headers?.["user-agent"],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
});

export default logger;
