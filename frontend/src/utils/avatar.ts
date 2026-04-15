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

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-indigo-500 to-violet-600",
  "from-teal-500 to-emerald-600",
];

export const getAvatarGradient = (name: string | null | undefined): string => {
  const key = name || "";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

/**
 * A placeholder Cloudinary URL used by the seed/default hospital record. When
 * this value is present we should still render initials, not the placeholder.
 */
export const isPlaceholderLogo = (url: string | null | undefined): boolean => {
  if (!url) return true;
  return /placeholder\.com/i.test(url) || /text=Hospital/i.test(url);
};
