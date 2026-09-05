// Upload limits
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
export const MAX_THUMBNAIL_SIZE = 512 * 1024; // 512KB
export const MAX_UPLOAD_BODY_SIZE = MAX_FILE_SIZE + MAX_THUMBNAIL_SIZE + 256 * 1024;
export const MAX_INPUT_IMAGE_PIXELS = 50_000_000;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_THUMBNAIL_DIMENSION = 1024;
export const MAX_DM_MEDIA_STORAGE_BYTES = 250 * 1024 * 1024; // 250MB per sender
export const MAX_DM_MEDIA_OBJECTS = 500;

// Business limits
export const MAX_PHOTOS = 12; // Note: project_overview.md incorrectly listed this as 6
const FREE_USER_FRIEND_LIMIT = 3;
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
const AVATAR_COLORS = [
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

// Rate limits per endpoint: { limit: max requests, window: duration in seconds }
export const RATE_LIMITS = {
  sendMessage:   { limit: 30, window: 60 },
  friendRequest: { limit: 20, window: 60 },
  coinMeeting:   { limit: 10, window: 60 },
  coinBot:       { limit: 20, window: 60 },
  adminCoins:    { limit: 60, window: 60 },
  moderation:    { limit: 60, window: 60 },
  upload:        { limit: 10, window: 60 },
  callCredentials: { limit: 20, window: 60 },
  callInvite:    { limit: 5, window: 60 },
  callInviteRecipient: { limit: 5, window: 60 },
  callSignal:    { limit: 60, window: 60 },
  messageMutation: { limit: 60, window: 60 },
  realtimeSignal: { limit: 120, window: 60 },
  threadCreate:  { limit: 20, window: 60 },
  groupJoin:     { limit: 30, window: 60 },
  friendMutation: { limit: 60, window: 60 },
  profileMutation: { limit: 60, window: 60 },
  pushToken:     { limit: 20, window: 86_400 },
  billing:       { limit: 10, window: 60 },
  userReport:    { limit: 5, window: 86_400 },
  userBlock:     { limit: 20, window: 86_400 },
  accountDelete: { limit: 5, window: 3_600 },
  location:      { limit: 12, window: 60 },
  nearby:        { limit: 12, window: 60 },
  inviteAccept:  { limit: 20, window: 86_400 },
  search:        { limit: 60, window: 60 },
} as const;
