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
