/**
 * Shared avatar helpers — derive initials + stable gradient for hospital/user
 * avatars when no image is available. Keeps fallback appearance consistent
 * across Navbar, HospitalsList, LogoHeader, Profile, etc.
 */

export const getInitials = (name: string | null | undefined, max = 2): string => {
  if (!name) return "H";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "H";
  return words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, max);
};

/**
 * Single-hue brand gradient used for every avatar fallback across the app
 * (Navbar, LogoHeader, Profile). Previously this returned a per-name hashed
 * gradient; switched to one consistent `bg-gradient-primary` class so every
 * avatar reads as "MediVault". Signature preserved so callers don't change.
 *
 * NOTE: callers must render this WITHOUT a `bg-gradient-to-br` prefix — the
 * class itself already describes the full gradient.
 */
export const getAvatarGradient = (_name?: string | null): string =>
  "bg-gradient-primary";

/**
 * A placeholder Cloudinary URL used by the seed/default hospital record. When
 * this value is present we should still render initials, not the placeholder.
 */
export const isPlaceholderLogo = (url: string | null | undefined): boolean => {
  if (!url) return true;
  return /placeholder\.com/i.test(url) || /text=Hospital/i.test(url);
};
