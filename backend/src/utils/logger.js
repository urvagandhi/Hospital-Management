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
import pino from "pino";
import pinoHttp from "pino-http";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

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
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname,service,env",
            singleLine: false,
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
