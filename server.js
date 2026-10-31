/**
 * MusicPlayer 2026 backend — Node.js 20+ (no third-party dependencies).
 * Provides same-origin API routes and streams converted media through the server.
 * Use only for content you are authorized to access/download.
 */
"use strict";

const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { Readable } = require("node:stream");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const SIPUTZ_SEARCH = "https://api.siputzx.my.id/api/s/youtube";
const CONV_ORIGIN = "https://nodex2.ytzyar.cc";
const MUSIC_BASE = "https://ytzyar.cc";
const BUCKET = "https://bucketx2.ytzyar.cc";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
const TIMEOUT = 30000;
const MAX_BODY = 1024 * 1024;
const ALLOWED_MEDIA_HOSTS = new Set([
  "ytzyar.cc", "www.ytzyar.cc", "bucketx2.ytzyar.cc",
  "bucket.ytzyar.cc", "nodex2.ytzyar.cc"
]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { "User-Agent": UA, ...(options.headers || {}) },
      redirect: "follow"
    });
  } finally {
    clearTimeout(timer);
  }
}

async function jsonRequest(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Respons bukan JSON (HTTP ${response.status}): ${text.slice(0, 120)}`);
  }
  if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
  return json;
}

function validVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(value || ""));
}

function token(videoId) {
  const input = String(videoId).toLowerCase();
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash += input.charCodeAt(i);
    hash += hash << 10;
    hash ^= hash >>> 6;
  }
  hash += hash << 3;
  hash ^= hash >>> 11;
  hash += hash << 15;
  return hash >>> 0;
}

function converterHeaders(extra = {}) {
  return { Referer: `${CONV_ORIGIN}/`, Origin: CONV_ORIGIN, ...extra };
}

async function getAvailable(kind, videoId, signature) {
  const base = kind === "mp4" ? BUCKET : MUSIC_BASE;
  const endpoint = kind === "mp4" ? "/video/available-video" : "/music/available-music";
  const data = await jsonRequest(`${base}${endpoint}?v=${encodeURIComponent(videoId)}&token=${signature}`, {
    headers: converterHeaders({ Accept: "application/json" })
  });
  if (!data.success) throw new Error(data.message || `Kualitas ${kind} tidak tersedia`);
  return (data.data?.detail || []).map(item => ({
    quality: String(item.quality),
    label: item.quality_label || `${item.quality}${kind === "mp4" ? "p" : " kbps"}`
  }));
}

async function createConversion(kind, videoId, quality) {
  const signature = token(videoId);
  const qualities = await getAvailable(kind, videoId, signature);
  if (!qualities.length) throw new Error(`Tidak ada kualitas ${kind} yang tersedia.`);
  const selected = quality ? String(quality) : qualities[0].quality;
  if (!qualities.some(item => item.quality === selected)) {
    throw new Error(`Kualitas ${selected} tidak tersedia. Pilihan: ${qualities.map(x => x.quality).join(", ")}`);
  }

  const endpoint = kind === "mp4" ? "/video/pre-progress" : "/music/pre-progress";
  const pre = await jsonRequest(`${BUCKET}${endpoint}`, {
    method: "POST",
    headers: converterHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
    body: JSON.stringify({ video_id: videoId, quality: selected, sig: String(signature) })
  });

  let downloadUrl = pre.download_url;
  const jobId = pre.data?.job_id;
  if (!downloadUrl && jobId) {
    const progressPath = kind === "mp4" ? "/video/progress" : "/music/progress";
    for (let attempt = 0; attempt < 90; attempt++) {
      await sleep(1000);
      const progress = await jsonRequest(
        `${BUCKET}${progressPath}?job_id=${encodeURIComponent(jobId)}&token=${signature}`,
        { headers: converterHeaders({ Accept: "application/json" }) }
      );
      if (progress.download_url) {
        downloadUrl = progress.download_url;
        break;
      }
      if (progress.success === false || ["error", "failed"].includes(progress.status) ||
          progress.data?.status === "failed") {
        throw new Error(progress.message || "Proses konversi gagal.");
      }
    }
  }
  if (!downloadUrl) throw new Error("Converter tidak mengembalikan URL download.");
  const parsed = new URL(downloadUrl);
  if (parsed.protocol !== "https:" || !ALLOWED_MEDIA_HOSTS.has(parsed.hostname)) {
    throw new Error("Host URL hasil converter tidak diizinkan. Periksa konfigurasi ALLOWED_MEDIA_HOSTS.");
  }
  return { downloadUrl, quality: selected, kind };
}

function contentDisposition(filename, attachment) {
  const safe = String(filename || "musicplayer-download").replace(/[^\w.-]+/g, "_").slice(0, 120);
  return `${attachment ? "attachment" : "inline"}; filename="${safe}"`;
}

async function serveMedia(req, res, url) {
  const videoId = url.searchParams.get("videoId");
  const kind = (url.searchParams.get("format") || "mp3").toLowerCase();
  const quality = url.searchParams.get("quality");
  const attachment = url.searchParams.get("download") === "1";
  if (!validVideoId(videoId)) return sendJson(res, 400, { error: "videoId tidak valid." });
  if (!["mp3", "mp4"].includes(kind)) return sendJson(res, 400, { error: "Format harus mp3 atau mp4." });
  if (quality && !/^(320|256|192|128|1080|720|480|360)$/.test(quality)) {
    return sendJson(res, 400, { error: "Kualitas tidak valid." });
  }

  try {
    const converted = await createConversion(kind, videoId, quality);
    const upstream = await fetchWithTimeout(converted.downloadUrl, {
      headers: converterHeaders({ Accept: "*/*" })
    }, 60000);
    if (!upstream.ok || !upstream.body) {
      throw new Error(`Gagal mengambil file dari converter (HTTP ${upstream.status}).`);
    }
    const extension = kind === "mp4" ? "mp4" : "mp3";
    const type = kind === "mp4" ? "video/mp4" : "audio/mpeg";
    const upstreamLength = upstream.headers.get("content-length");
    const headers = {
      "Content-Type": upstream.headers.get("content-type") || type,
      "Content-Disposition": contentDisposition(`${videoId}-${converted.quality}.${extension}`, attachment),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    };
    if (upstreamLength) headers["Content-Length"] = upstreamLength;
    res.writeHead(200, headers);
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    console.error("Media conversion error:", error);
    if (!res.headersSent) sendJson(res, 502, { error: error.message || "Konversi media gagal." });
    else res.destroy(error);
  }
}

function mimeType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml", ".ico": "image/x-icon"
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "MusicPlayer 2026", node: process.version });
  }
  if (req.method === "GET" && url.pathname === "/api/search") {
    const query = (url.searchParams.get("query") || "").trim().slice(0, 160);
    if (!query) return sendJson(res, 400, { error: "Parameter query wajib diisi." });
    try {
      const apiUrl = `${SIPUTZ_SEARCH}?query=${encodeURIComponent(query)}`;
      const result = await jsonRequest(apiUrl, { headers: { Accept: "application/json" } });
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 502, { status: false, error: `Search API gagal: ${error.message}` });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/media") {
    return serveMedia(req, res, url);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Method tidak diizinkan." });
  }

  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, "index.html")) {
    return sendJson(res, 403, { error: "Akses ditolak." });
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: "File tidak ditemukan." });
    res.writeHead(200, {
      "Content-Type": mimeType(file),
      "Content-Length": stat.size,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`MusicPlayer 2026 berjalan di http://localhost:${PORT}`);
  console.log("Node.js 20+ direkomendasikan. Tekan Ctrl+C untuk berhenti.");
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
