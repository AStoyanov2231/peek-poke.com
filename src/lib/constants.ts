// Upload limits
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
export const MAX_THUMBNAIL_SIZE = 512 * 1024; // 512KB

// Business limits
export const MAX_PHOTOS = 12; // Note: project_overview.md incorrectly listed this as 6
export const FREE_USER_FRIEND_LIMIT = 3;
export const EDIT_WINDOW_MINUTES = 15;
export const MIN_INTERESTS_REQUIRED = 5;

// Interest category emojis (moved from ProfileInterests component)
export const CATEGORY_EMOJI: Record<string, string> = {
  "Food & Drink": "🍕",
  "Outdoors": "🌿",
  "Hobbies": "🎨",
  "Entertainment": "🎬",
  "Culture": "🏛️",
  "Health": "💪",
  "Lifestyle": "✨",
  "Professional": "💼",
};

export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] || "•";
}

// Avatar color palette for user cards (moved from NearbySwiper component)
export const AVATAR_COLORS = [
  { bg: "#EEEDff", text: "#6C63FF" },
  { bg: "#DCFCE7", text: "#22A55A" },
  { bg: "#FEF3C7", text: "#D97706" },
  { bg: "#FEE2E2", text: "#DC2626" },
  { bg: "#DBEAFE", text: "#2563EB" },
];

// Coin spent animation duration in ms
export const COIN_SPENT_ANIMATION_MS = 600;

// Presence tracking location update debounce in ms
export const TRACK_DEBOUNCE_MS = 10_000;

// Dating — discovery limits
export const MIN_AGE = 18;
export const FREE_DAILY_POKES = 10;
export const FREE_DAILY_PASSES = 50;
export const FREE_DISTANCE_KM = 25;
export const PASS_COOLDOWN_DAYS = 30;
export const MATCH_EXPIRY_HOURS = 72;
export const MIN_DATING_PHOTOS = 4;

// Dating — coin costs
export const BOOST_COST_COINS = 50;
export const SUPER_POKE_COST_COINS = 25;
export const REWIND_COST_COINS = 10;
export const REMATCH_COST_COINS = 30;
export const PROFILE_UNBLUR_COST_COINS = 100;

// Dating — verification
export const VERIFICATION_COIN_REWARD = 50;
export const VERIFICATION_MAX_ATTEMPTS_PER_DAY = 3;
