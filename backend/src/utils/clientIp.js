/**
 * Extract the *real* client IP from a request, accounting for the CDN /
 * proxy chain in front of the backend.
 *
 * Render sits behind Cloudflare. Cloudflare strips the original client IP
 * from the TCP layer and forwards it via the `CF-Connecting-IP` header.
 * If we only consult `req.ip` / `X-Forwarded-For`, we end up logging
 * Cloudflare-edge IPs (172.64.0.0/13) — which geoip resolves to whichever
 * Cloudflare PoP terminated the connection (e.g. Singapore for traffic
 * from India), not the user's actual location.
 *
 * Resolution order:
 *   1. CF-Connecting-IP   — Cloudflare's authoritative client IP
 *   2. True-Client-IP     — Akamai / Cloudflare Enterprise variant
 *   3. X-Forwarded-For[0] — first entry (original client) when behind a
 *                           non-Cloudflare proxy
 *   4. req.ip             — Express's parsed value (uses trust-proxy)
 *   5. req.connection.remoteAddress — last-resort raw socket address
 *
 * Spoofing note: any client that reaches the backend NOT via Cloudflare
 * could send a fake `CF-Connecting-IP` header. For an internal hospital
 * system this is acceptable — same trust level the previous code had with
 * `X-Forwarded-For`. If higher assurance is needed later, gate this on
 * `req.ip ∈ Cloudflare-egress-list` before trusting the header.
 *
 * @param {import("express").Request} req
 * @returns {string|undefined} client IP, or undefined if no source had one
 */
export const getClientIp = (req) => {
  if (!req) return undefined;

  // 1. Cloudflare
  const cf = req.headers?.["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();

  // 2. Akamai / CF Enterprise
  const trueClient = req.headers?.["true-client-ip"];
  if (typeof trueClient === "string" && trueClient.trim()) return trueClient.trim();

  // 3. X-Forwarded-For (first entry = original client per RFC 7239 convention)
  const xff = req.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",", 1)[0].trim();
    if (first) return first;
  }

  // 4 & 5. Express parsed IP / raw socket
  return req.ip || req.connection?.remoteAddress || undefined;
};

export default getClientIp;
