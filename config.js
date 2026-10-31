/**
 * MusicPlayer 2026 — central configuration and utilities.
 * Requires a modern browser (ES2020+) and Node.js 20+ for the optional backend.
 */
"use strict";

const APP_CONFIG = Object.freeze({
  API: Object.freeze({
    SEARCH: "/api/search",
    MEDIA: "/api/media",
    HEALTH: "/api/health"
  }),
  STORAGE: Object.freeze({
    RECENT: "musicplayer:recent:v2",
    FAVORITES: "musicplayer:favorites:v1",
    VOLUME: "musicplayer:volume:v1",
    THEME: "musicplayer:theme:v1"
  }),
  LIMITS: Object.freeze({
    RECENT: 30,
    SEARCH_RESULTS: 30,
    QUEUE: 100
  }),
  DEFAULT_QUERY: "lagu Indonesia populer",
  REQUEST_TIMEOUT: 15000
});

const UTILS = Object.freeze({
  formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  },

  formatViews(value) {
    const views = Number(value) || 0;
    return new Intl.NumberFormat("id-ID", {
      notation: views >= 100000 ? "compact" : "standard",
      maximumFractionDigits: 1
    }).format(views);
  },

  formatSong(item) {
    if (!item || item.type === "list" || !item.videoId) return null;
    const id = String(item.videoId);
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return {
      id,
      title: String(item.title || "Judul tidak diketahui"),
      artist: String(item.author?.name || "Artis tidak diketahui"),
      authorUrl: String(item.author?.url || ""),
      description: String(item.description || ""),
      thumbnail: String(item.thumbnail || item.image || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
      duration: Number(item.seconds ?? item.duration?.seconds ?? 0),
      timestamp: String(item.timestamp || item.duration?.timestamp || "0:00"),
      views: Number(item.views || 0),
      ago: String(item.ago || ""),
      videoUrl: `https://www.youtube.com/watch?v=${id}`
    };
  },

  formatSearchResults(items) {
    return Array.isArray(items)
      ? items.map(item => this.formatSong(item)).filter(Boolean).slice(0, APP_CONFIG.LIMITS.SEARCH_RESULTS)
      : [];
  },

  safeImage(url) {
    try {
      const parsed = new URL(url);
      return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  },

  escapeText(value) {
    return String(value ?? "");
  },

  readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  },

  writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Penyimpanan lokal tidak tersedia:", error);
      return false;
    }
  },

  async fetchJson(url, options = {}, timeout = APP_CONFIG.REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { Accept: "application/json", ...(options.headers || {}) }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }
});

// Backward-compatible names for integrations that used the old config.
const API_URL = Object.freeze({
  SEARCH: "https://api.siputzx.my.id/api/s/youtube",
  DOWNLOAD_MP3: APP_CONFIG.API.MEDIA
});
const APP_DEFAULTS = Object.freeze({
  DEFAULT_SEARCH: APP_CONFIG.DEFAULT_QUERY,
  MAX_RECENT_ITEMS: APP_CONFIG.LIMITS.RECENT,
  MAX_QUEUE_ITEMS: 5,
  STORAGE_KEY: APP_CONFIG.STORAGE.RECENT
});
