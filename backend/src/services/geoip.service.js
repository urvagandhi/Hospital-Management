/**
 * GeoIP service — resolves a raw IP address to a human-readable location.
 *
 * Provider: ip-api.com (free tier, no API key, 45 req/min/IP). The response
 * is shaped as { status, country, regionName, city, ... }.
 *
 * Cache: in-process Map with 24h TTL. Private/loopback IPs short-circuit to
 * `{ isPrivate: true, displayName: "Local network" }`. The cache never
 * persists to disk — a restart re-fetches, which is fine given the TTL.
 *
 * All callers are fire-and-forget: geolocate() never throws, always resolves
 * to a location-like object (possibly null-ish). Use `formatLocation()` to
 * turn it into a UI/email-friendly string.
 */

import logger from "../utils/logger.js";

const CACHE = new Map(); // ip -> { value, expiresAt }
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

const PRIVATE_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^192\.168\./, // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^127\./, // loopback
  /^169\.254\./, // link-local
  /^::1$/, // IPv6 loopback
  /^fe80:/i, // IPv6 link-local
  /^fc00:/i, // IPv6 unique local
  /^fd00:/i, // IPv6 unique local
];

function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();
  // Strip IPv4-mapped IPv6 prefix ("::ffff:1.2.3.4" → "1.2.3.4")
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  // x-forwarded-for can be a comma-list; take the first
  if (ip.includes(",")) ip = ip.split(",")[0].trim();
  return ip || null;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  return PRIVATE_PATTERNS.some((re) => re.test(ip));
}

const PRIVATE_LOCATION = Object.freeze({
  city: null,
  region: null,
  country: null,
  countryCode: null,
  isPrivate: true,
  displayName: "Local network",
});

const UNKNOWN_LOCATION = Object.freeze({
  city: null,
  region: null,
  country: null,
  countryCode: null,
  isPrivate: false,
  displayName: null,
});

function buildDisplayName({ city, region, country }) {
  const parts = [city, country || region].filter(
    (p) => typeof p === "string" && p.trim(),
  );
  return parts.length ? parts.join(", ") : null;
}

/**
 * Resolve an IP to { city, region, country, countryCode, isPrivate, displayName }.
 * Never throws. Returns UNKNOWN_LOCATION on network / parse failure.
 *
 * Dev affordance: if `GEOIP_DEV_OVERRIDE_IP` is set (e.g. "8.8.8.8"), every
 * incoming lookup is rewritten to that IP. Useful when testing from localhost
 * — otherwise every session's IP is ::1 / 127.0.0.1 and correctly resolves
 * to "Local network", which hides the whole feature.
 */
export async function geolocateIp(rawIp) {
  const override = (process.env.GEOIP_DEV_OVERRIDE_IP || "").trim();
  const normalized = normalizeIp(rawIp);
  const ip = override || normalized;

  const debug = process.env.NODE_ENV !== "production";
  if (debug) {
    logger.debug(
      { event: "geoip_lookup_start", rawIp: rawIp || null, normalized: normalized || null, override: override || null },
      `[geoip] lookup raw=${rawIp || "null"} normalized=${normalized || "null"}${override ? ` override=${override}` : ""}`,
    );
  }

  if (!ip) return UNKNOWN_LOCATION;
  if (isPrivateIp(ip)) {
    if (debug)
      logger.debug(
        { event: "geoip_private", ip },
        `[geoip] ${ip} is private/loopback → Local network`,
      );
    return PRIVATE_LOCATION;
  }

  // Cache hit
  const cached = CACHE.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    if (debug)
      logger.debug({ event: "geoip_cache_hit", ip }, `[geoip] cache hit for ${ip}`);
    return cached.value;
  }

  try {
    // fields mask keeps the response small and fast
    const url = `http://ip-api.com/json/${encodeURIComponent(
      ip,
    )}?fields=status,country,countryCode,regionName,city`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ip-api HTTP ${res.status}`);
    const body = await res.json();
    if (body?.status !== "success") {
      throw new Error(`ip-api status=${body?.status || "unknown"}`);
    }
    const location = {
      city: body.city || null,
      region: body.regionName || null,
      country: body.country || null,
      countryCode: body.countryCode || null,
      isPrivate: false,
      displayName: buildDisplayName({
        city: body.city,
        region: body.regionName,
        country: body.country,
      }),
    };
    CACHE.set(ip, { value: location, expiresAt: Date.now() + TTL_MS });
    if (debug)
      logger.debug(
        { event: "geoip_resolved", ip, displayName: location.displayName || null },
        `[geoip] ${ip} → ${location.displayName || "unknown public"}`,
      );
    return location;
  } catch (err) {
    // Cache the miss briefly (5 min) so we don't hammer the API on flaky IPs
    const shortMiss = { value: UNKNOWN_LOCATION, expiresAt: Date.now() + 5 * 60 * 1000 };
    CACHE.set(ip, shortMiss);
    logger.warn(
      { event: "geoip_lookup_failed", ip, err },
      `[geoip] lookup failed for ${ip}: ${err.message}`,
    );
    return UNKNOWN_LOCATION;
  }
}

/**
 * Friendly string for templates / UI. Examples:
 *   "Mumbai, India"       (public IP, city + country)
 *   "Local network"       (private / LAN)
 *   ""                    (unknown — caller can fall back to just the IP)
 */
export function formatLocation(location) {
  if (!location) return "";
  if (location.isPrivate) return "Local network";
  return location.displayName || "";
}

export default { geolocateIp, formatLocation };
