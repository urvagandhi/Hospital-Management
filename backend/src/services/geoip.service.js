/**
 * GeoIP service — resolves a raw IP address to a human-readable location.
 *
 * Provider chain (ordered; first successful response wins, subsequent failures
 * fall through to the next):
 *   1. ipinfo.io — keyed tier via `IPINFO_TOKEN`; activated only when the env
 *      is set. Higher quality data, per-token quota (50 k/month on free tier).
 *   2. ip-api.com — keyless fallback, 45 req/min/IP. Always available.
 *
 * Cache: in-process Map with 24h TTL on success and 5-min TTL on miss. Private /
 * loopback IPs short-circuit to `{ isPrivate: true, displayName: "Local network" }`.
 * The cache never persists to disk — a restart re-fetches, which is fine given
 * the TTL.
 *
 * All callers are fire-and-forget: `geolocateIp` never throws, always resolves
 * to a location-like object (possibly null-ish). Use `formatLocation()` to turn
 * it into a UI/email-friendly string.
 */

import logger from "../utils/logger.js";

const CACHE = new Map(); // ip -> { value, expiresAt }
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MISS_TTL_MS = 5 * 60 * 1000; // 5 min negative cache
const PROVIDER_TIMEOUT_MS = 2500;

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

async function fetchWithTimeout(url, { headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timer);
  }
}

// ── Providers ────────────────────────────────────────────────────────────

const ipinfoProvider = {
  name: "ipinfo",
  enabled() {
    return Boolean((process.env.IPINFO_TOKEN || "").trim());
  },
  async lookup(ip) {
    const token = (process.env.IPINFO_TOKEN || "").trim();
    const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`ipinfo HTTP ${res.status}`);
    const body = await res.json();
    if (body?.error) throw new Error(`ipinfo error=${body.error.title || body.error.code || "unknown"}`);
    return {
      city: body.city || null,
      region: body.region || null,
      country: null, // ipinfo returns only 2-letter code in `country`; keep full name null
      countryCode: body.country || null,
    };
  },
};

const ipApiProvider = {
  name: "ip-api",
  enabled() {
    return true; // always available (keyless)
  },
  async lookup(ip) {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`ip-api HTTP ${res.status}`);
    const body = await res.json();
    if (body?.status !== "success") {
      throw new Error(`ip-api status=${body?.status || "unknown"}`);
    }
    return {
      city: body.city || null,
      region: body.regionName || null,
      country: body.country || null,
      countryCode: body.countryCode || null,
    };
  },
};

const PROVIDERS = [ipinfoProvider, ipApiProvider];

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

  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.enabled()) continue;
    try {
      const raw = await provider.lookup(ip);
      const location = {
        city: raw.city || null,
        region: raw.region || null,
        country: raw.country || null,
        countryCode: raw.countryCode || null,
        isPrivate: false,
        displayName: buildDisplayName(raw),
      };
      CACHE.set(ip, { value: location, expiresAt: Date.now() + TTL_MS });
      if (debug)
        logger.debug(
          { event: "geoip_resolved", ip, provider: provider.name, displayName: location.displayName || null },
          `[geoip] ${ip} → ${location.displayName || "unknown public"} via ${provider.name}`,
        );
      return location;
    } catch (err) {
      errors.push({ provider: provider.name, message: err.message });
      logger.warn(
        { event: "geoip_provider_failed", ip, provider: provider.name, err },
        `[geoip] ${provider.name} failed for ${ip}: ${err.message}`,
      );
      // fall through to next provider
    }
  }

  // All providers exhausted — short-cache the miss so we don't hammer APIs on
  // flaky / invalid IPs.
  CACHE.set(ip, { value: UNKNOWN_LOCATION, expiresAt: Date.now() + MISS_TTL_MS });
  logger.warn(
    { event: "geoip_lookup_failed", ip, attempts: errors },
    `[geoip] all providers failed for ${ip}`,
  );
  return UNKNOWN_LOCATION;
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
