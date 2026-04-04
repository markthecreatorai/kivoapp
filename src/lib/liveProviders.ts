/**
 * Live Provider Adapter Pattern
 * Decouples embed/join logic from business rules.
 * Each provider implements the LiveProvider interface.
 */

export interface LiveProvider {
  type: string;
  label: string;
  /** Whether this provider supports iframe embedding */
  supportsEmbed: boolean;
  /** Get the iframe src URL for embedding (null if not embeddable) */
  getEmbedUrl(rawUrl: string, options?: Record<string, string>): string | null;
  /** Get the direct join URL for the user */
  getJoinUrl(rawUrl: string): string;
  /** Detect if a raw URL belongs to this provider */
  matches(url: string): boolean;
  /** Extract a display-friendly identifier from the URL */
  extractId(url: string): string | null;
}

// ── YouTube ──────────────────────────────────────────────
const youtubeAdapter: LiveProvider = {
  type: "youtube",
  label: "YouTube",
  supportsEmbed: true,
  matches: (url) => /youtube\.com|youtu\.be/.test(url),
  extractId: (url) => {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/)([^&\s?/]+)/);
    return m ? m[1] : null;
  },
  getEmbedUrl: (url) => {
    const id = youtubeAdapter.extractId(url);
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
  },
  getJoinUrl: (url) => url,
};

// ── Twitch ───────────────────────────────────────────────
const twitchAdapter: LiveProvider = {
  type: "twitch",
  label: "Twitch",
  supportsEmbed: true,
  matches: (url) => /twitch\.tv/.test(url),
  extractId: (url) => {
    const m = url.match(/twitch\.tv\/([^/?]+)/);
    return m ? m[1] : null;
  },
  getEmbedUrl: (url) => {
    const channel = twitchAdapter.extractId(url);
    return channel
      ? `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}`
      : null;
  },
  getJoinUrl: (url) => url,
};

// ── Jitsi ────────────────────────────────────────────────
const jitsiAdapter: LiveProvider = {
  type: "jitsi",
  label: "Jitsi Meet",
  supportsEmbed: true,
  matches: (url) => /meet\.jit\.si|jitsi/i.test(url),
  extractId: (url) => {
    // Extract room name from meet.jit.si/RoomName or custom Jitsi URLs
    const m = url.match(/meet\.jit\.si\/([^?#]+)/);
    if (m) return m[1];
    // Custom jitsi: https://jitsi.example.com/RoomName
    const parts = url.replace(/^https?:\/\//, "").split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : null;
  },
  getEmbedUrl: (url) => {
    // For meet.jit.si, build embed URL
    const room = jitsiAdapter.extractId(url);
    if (!room) return null;
    const isDefault = url.includes("meet.jit.si");
    const base = isDefault ? "https://meet.jit.si" : url.replace(/\/[^/]+$/, "");
    return `${base}/${room}#config.prejoinPageEnabled=false`;
  },
  getJoinUrl: (url) => url,
};

// ── Zoom ─────────────────────────────────────────────────
const zoomAdapter: LiveProvider = {
  type: "zoom",
  label: "Zoom",
  supportsEmbed: false, // Zoom does NOT allow third-party iframe embedding
  matches: (url) => /zoom\.us/i.test(url),
  extractId: (url) => {
    // Extract meeting ID from zoom.us/j/123456789
    const m = url.match(/zoom\.us\/j\/(\d+)/);
    return m ? m[1] : null;
  },
  getEmbedUrl: () => null, // Not embeddable
  getJoinUrl: (url) => url,
};

// ── Custom / Generic ─────────────────────────────────────
const customAdapter: LiveProvider = {
  type: "custom",
  label: "Link externo",
  supportsEmbed: true,
  matches: () => true, // fallback
  extractId: (url) => url,
  getEmbedUrl: (url) => url,
  getJoinUrl: (url) => url,
};

// ── Registry ─────────────────────────────────────────────
const providers: LiveProvider[] = [
  youtubeAdapter,
  twitchAdapter,
  jitsiAdapter,
  zoomAdapter,
  customAdapter, // must be last (fallback)
];

/**
 * Detect the provider from a URL
 */
export function detectProvider(url: string): LiveProvider {
  return providers.find((p) => p.type !== "custom" && p.matches(url)) || customAdapter;
}

/**
 * Get provider by type string
 */
export function getProvider(type: string): LiveProvider {
  return providers.find((p) => p.type === type) || customAdapter;
}

/**
 * All available provider types for UI selectors
 */
export const PROVIDER_OPTIONS = [
  { value: "youtube", label: "YouTube" },
  { value: "twitch", label: "Twitch" },
  { value: "jitsi", label: "Jitsi Meet" },
  { value: "zoom", label: "Zoom" },
  { value: "custom", label: "Link externo" },
] as const;
