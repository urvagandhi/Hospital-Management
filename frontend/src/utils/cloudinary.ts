/**
 * Cloudinary URL helpers.
 *
 * buildThumbnailUrl prepends a transformation segment after the `/upload/`
 * marker. This works correctly even when the URL already contains a version
 * segment (`/v1234/`), a named transformation, a custom CNAME, or a folder
 * path — we only split on the first `/upload/` and rebuild.
 *
 * Returns the original URL unchanged if it isn't a recognisable Cloudinary
 * delivery URL, so `<img onError>` fallback logic still protects us.
 */
export function buildThumbnailUrl(url: string, w = 240, h = 240): string {
  if (!url || typeof url !== "string") return url;
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const prefix = url.slice(0, idx + marker.length);
  const rest = url.slice(idx + marker.length);
  return `${prefix}c_fill,w_${w},h_${h},q_auto,f_auto/${rest}`;
}

export function isImageMime(mimeType: string): boolean {
  return typeof mimeType === "string" && mimeType.startsWith("image/");
}

export function isPdfMime(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

