/**
 * MusicPlayer 2026 — browser application.
 * Search: SiputzX YouTube API (proxied by the optional Node server).
 * Streaming/download: local Node backend using the supplied YTMp3PC scraper flow.
 */
"use strict";

(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const byId = id => document.getElementById(id);

  const el = {
    searchInput: $(".search-input"), searchBtn: $(".search-btn"),
    results: byId("results"), resultsSection: byId("resultsSection"),
    resultTitle: byId("searchResultTitle"), loading: $(".loading"),
    noResults: $(".no-results"), audio: byId("audioPlayer"),
    welcome: byId("welcomePanel"), welcomeClose: byId("welcomeCloseBtn"),
    logo: byId("logoLink"), historySection: byId("historySection"),
    historyList: byId("historyList"), mini: byId("playerMini"),
    full: byId("playerFull"), minimize: byId("minimizeBtn"),
    miniThumb: byId("miniThumbnail"), miniTitle: byId("miniTitle"),
    miniArtist: byId("miniArtist"), miniPlay: byId("miniPlayBtn"),
    miniNext: byId("miniNextBtn"), fullThumb: byId("fullThumbnail"),
    fullTitle: byId("fullTitle"), fullArtist: byId("fullArtist"),
    play: byId("playBtnLarge"), prev: byId("prevBtnLarge"),
    next: byId("nextBtnLarge"), shuffle: byId("shuffleBtn"),
    repeat: byId("repeatBtn"), progressBar: byId("progressBarLarge"),
    progress: byId("progressLarge"), currentTime: byId("currentTimeLarge"),
    totalTime: byId("totalTimeLarge"), download: byId("downloadBtnLarge"),
    queue: byId("queueList")
  };

  const state = {
    playlist: [], queue: [], index: -1, recent: [],
    favorites: new Set(), shuffle: false, repeat: false,
    requestId: 0, searchController: null, playbackRequest: 0,
    isLoading: false, currentQuery: ""
  };

  function notify(message, kind = "info") {
    let node = byId("appToast");
    if (!node) {
      node = document.createElement("div");
      node.id = "appToast";
      node.className = "app-toast";
      node.setAttribute("role", "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.dataset.kind = kind;
    node.classList.add("visible");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => node.classList.remove("visible"), 3200);
  }

  function setLoading(active, message = "Mengambil data...") {
    state.isLoading = active;
    if (el.loading) {
      el.loading.style.display = active ? "flex" : "none";
      const label = $(".loading-text", el.loading);
      if (label) label.textContent = message;
    }
    if (el.searchBtn) el.searchBtn.disabled = active;
  }

  function setText(node, value) {
    if (node) node.textContent = String(value ?? "");
  }

  function setImage(node, url, alt) {
    if (!node) return;
    node.src = UTILS.safeImage(url) || "https://placehold.co/320x320/191414/ffffff?text=Music";
    node.alt = alt || "Artwork";
    node.loading = "lazy";
    node.referrerPolicy = "no-referrer";
    node.onerror = () => { node.onerror = null; node.src = "https://placehold.co/320x320/191414/ffffff?text=Music"; };
  }

  function makeSongCard(song, index) {
    const card = document.createElement("article");
    card.className = "song-card";
    card.dataset.songId = song.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Putar ${song.title}`);

    const image = document.createElement("img");
    image.className = "song-thumbnail";
    setImage(image, song.thumbnail, song.title);

    const info = document.createElement("div");
    info.className = "song-info";
    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = song.title;
    const artist = document.createElement("div");
    artist.className = "song-artist";
    artist.textContent = song.artist;
    const meta = document.createElement("div");
    meta.className = "song-duration";
    meta.textContent = `${song.timestamp} · ${UTILS.formatViews(song.views)} views`;
    info.append(title, artist, meta);
    card.append(image, info);

    const play = () => playSong(index);
    card.addEventListener("click", play);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        play();
      }
    });
    return card;
  }

  function renderResults(songs) {
    el.results.replaceChildren();
    const fragment = document.createDocumentFragment();
    songs.forEach((song, index) => fragment.appendChild(makeSongCard(song, index)));
    el.results.appendChild(fragment);
    if (el.noResults) el.noResults.style.display = songs.length ? "none" : "block";
  }

  async function searchSongs(query) {
    const clean = String(query || "").trim();
    if (!clean) return notify("Masukkan judul lagu atau nama artis.", "warning");
    state.currentQuery = clean;
    const requestId = ++state.requestId;
    if (state.searchController) state.searchController.abort();
    state.searchController = new AbortController();
    setLoading(true, "Mencari video YouTube...");
    el.results.replaceChildren();
    el.noResults.style.display = "none";
    el.historySection.style.display = "none";
    el.resultsSection.classList.add("active");
    setText(el.resultTitle, `Hasil pencarian: "${clean}"`);

    try {
      const response = await fetch(`${APP_CONFIG.API.SEARCH}?query=${encodeURIComponent(clean)}`, {
        signal: state.searchController.signal,
        headers: { Accept: "application/json" }
      });
      const data = await response.json();
      if (!response.ok || data?.status !== true || !Array.isArray(data.data)) {
        throw new Error(data?.error || "Format respons pencarian tidak valid.");
      }
      if (requestId !== state.requestId) return;
      state.playlist = UTILS.formatSearchResults(data.data);
      state.queue = [...state.playlist];
      renderResults(state.playlist);
      if (!state.playlist.length) notify("Tidak ada video yang cocok.", "warning");
      updateQueue();
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Search error:", error);
      el.noResults.style.display = "block";
      notify(`Pencarian gagal: ${error.message}`, "error");
    } finally {
      if (requestId === state.requestId) setLoading(false);
    }
  }

  function currentSong() {
    return state.playlist[state.index] || null;
  }

  function updatePlayer(song) {
    setImage(el.miniThumb, song.thumbnail, song.title);
    setImage(el.fullThumb, song.thumbnail, song.title);
    setText(el.miniTitle, song.title);
    setText(el.fullTitle, song.title);
    setText(el.miniArtist, song.artist);
    setText(el.fullArtist, song.artist);
    el.mini.classList.remove("hidden");
    el.full.style.display = "flex";
    syncPlayButtons(false);
  }

  function syncPlayButtons(playing) {
    const icon = playing ? "fa-pause" : "fa-play";
    [el.miniPlay, el.play].forEach(button => {
      if (!button) return;
      const i = document.createElement("i");
      i.className = `fas ${icon}`;
      button.replaceChildren(i);
      button.setAttribute("aria-label", playing ? "Pause" : "Play");
    });
  }

  async function playSong(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.playlist.length) return;
    const song = state.playlist[index];
    state.index = index;
    const playbackRequest = ++state.playbackRequest;
    updatePlayer(song);
    setLoading(true, `Menyiapkan audio: ${song.title}`);
    el.audio.pause();
    el.audio.removeAttribute("src");
    el.audio.load();

    // Audio is streamed by the Node backend; the browser never handles scraper tokens.
    const streamUrl = `${APP_CONFIG.API.MEDIA}?videoId=${encodeURIComponent(song.id)}&format=mp3&quality=320`;
    el.audio.src = streamUrl;
    try {
      await el.audio.play();
      if (playbackRequest !== state.playbackRequest) return;
      addToRecentlyPlayed(song);
      updateQueue();
    } catch (error) {
      if (playbackRequest !== state.playbackRequest) return;
      console.error("Playback error:", error);
      notify("Audio gagal diputar. Pastikan backend Node.js aktif dan converter tersedia.", "error");
      syncPlayButtons(false);
    } finally {
      if (playbackRequest === state.playbackRequest) setLoading(false);
    }
  }

  function addToRecentlyPlayed(song) {
    state.recent = [song, ...state.recent.filter(item => item.id !== song.id)]
      .slice(0, APP_CONFIG.LIMITS.RECENT);
    UTILS.writeStorage(APP_CONFIG.STORAGE.RECENT, state.recent);
    renderHistory();
  }

  function renderHistory() {
    el.historyList.replaceChildren();
    if (!state.recent.length) {
      const empty = document.createElement("div");
      empty.className = "no-history";
      empty.textContent = "Belum ada lagu yang diputar.";
      el.historyList.appendChild(empty);
      return;
    }
    state.recent.forEach(song => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "history-item";
      const image = document.createElement("img");
      image.className = "history-thumbnail";
      setImage(image, song.thumbnail, song.title);
      const info = document.createElement("span");
      info.className = "history-info";
      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = song.title;
      const artist = document.createElement("span");
      artist.className = "history-artist";
      artist.textContent = song.artist;
      info.append(title, artist);
      item.append(image, info);
      item.addEventListener("click", () => {
        const existing = state.playlist.findIndex(entry => entry.id === song.id);
        if (existing >= 0) playSong(existing);
        else {
          state.playlist.unshift(song);
          renderResults(state.playlist);
          playSong(0);
        }
      });
      el.historyList.appendChild(item);
    });
  }

  function updateQueue() {
    if (!el.queue) return;
    el.queue.replaceChildren();
    const list = state.queue.length ? state.queue : state.playlist;
    const upcoming = list.filter((_, index) => index !== state.index).slice(0, APP_CONFIG.LIMITS.QUEUE);
    if (!upcoming.length) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent = "Tidak ada lagu berikutnya dalam antrean.";
      el.queue.appendChild(empty);
      return;
    }
    upcoming.forEach(song => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "queue-item";
      const title = document.createElement("span");
      title.className = "queue-title";
      title.textContent = song.title;
      const artist = document.createElement("span");
      artist.className = "queue-artist";
      artist.textContent = song.artist;
      row.append(title, artist);
      row.addEventListener("click", () => {
        const index = state.playlist.findIndex(entry => entry.id === song.id);
        if (index >= 0) playSong(index);
      });
      el.queue.appendChild(row);
    });
  }

  function togglePlay() {
    if (!currentSong()) return notify("Pilih lagu terlebih dahulu.", "warning");
    if (el.audio.paused) {
      el.audio.play().catch(error => notify(`Tidak dapat memutar audio: ${error.message}`, "error"));
    } else {
      el.audio.pause();
    }
  }

  function playNextSong() {
    if (!state.playlist.length) return;
    let next = state.index + 1;
    if (state.shuffle && state.playlist.length > 1) {
      do { next = Math.floor(Math.random() * state.playlist.length); }
      while (next === state.index);
    } else if (next >= state.playlist.length) {
      if (!state.repeat) {
        el.audio.pause();
        syncPlayButtons(false);
        return;
      }
      next = 0;
    }
    playSong(next);
  }

  function playPreviousSong() {
    if (!state.playlist.length) return;
    if (el.audio.currentTime > 3) {
      el.audio.currentTime = 0;
      return;
    }
    const previous = state.index <= 0 ? state.playlist.length - 1 : state.index - 1;
    playSong(previous);
  }

  function updateProgress() {
    const duration = Number.isFinite(el.audio.duration) ? el.audio.duration : 0;
    const current = Number.isFinite(el.audio.currentTime) ? el.audio.currentTime : 0;
    el.progress.style.width = `${duration ? (current / duration) * 100 : 0}%`;
    setText(el.currentTime, UTILS.formatTime(current));
    setText(el.totalTime, UTILS.formatTime(duration));
  }

  function seek(event) {
    if (!Number.isFinite(el.audio.duration) || !el.audio.duration) return;
    const rect = el.progressBar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    el.audio.currentTime = ratio * el.audio.duration;
  }

  function toggleMode(key, button) {
    state[key] = !state[key];
    button.classList.toggle("active", state[key]);
    button.setAttribute("aria-pressed", String(state[key]));
    notify(`${key === "shuffle" ? "Shuffle" : "Repeat"} ${state[key] ? "aktif" : "nonaktif"}.`);
  }

  function downloadCurrentSong() {
    const song = currentSong();
    if (!song) return notify("Pilih lagu terlebih dahulu.", "warning");
    const format = $("#downloadFormat")?.value || "mp3";
    const quality = $("#downloadQuality")?.value || (format === "mp3" ? "320" : "720");
    const url = `${APP_CONFIG.API.MEDIA}?videoId=${encodeURIComponent(song.id)}&format=${format}&quality=${encodeURIComponent(quality)}&download=1`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    notify(`Menyiapkan download ${format.toUpperCase()} ${quality}...`);
  }

  function loadState() {
    state.recent = UTILS.readStorage(APP_CONFIG.STORAGE.RECENT, []);
    if (!Array.isArray(state.recent)) state.recent = [];
    state.favorites = new Set(UTILS.readStorage(APP_CONFIG.STORAGE.FAVORITES, []));
    renderHistory();
  }

  function bindEvents() {
    el.searchBtn.addEventListener("click", () => searchSongs(el.searchInput.value));
    el.searchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") searchSongs(el.searchInput.value);
    });
    el.welcomeClose.addEventListener("click", () => {
      el.welcome.classList.remove("show");
      el.welcome.classList.add("hidden");
      if (!state.recent.length) searchSongs(APP_CONFIG.DEFAULT_QUERY);
    });
    el.logo.addEventListener("click", event => {
      event.preventDefault();
      el.resultsSection.classList.remove("active");
      el.historySection.style.display = "block";
      renderHistory();
    });
    el.minimize.addEventListener("click", () => {
      el.full.style.display = "none";
      el.mini.classList.remove("hidden");
    });
    el.mini.addEventListener("click", event => {
      if (!event.target.closest(".control-btn")) {
        el.full.style.display = "flex";
        el.mini.classList.add("hidden");
      }
    });
    el.miniPlay.addEventListener("click", event => { event.stopPropagation(); togglePlay(); });
    el.miniNext.addEventListener("click", event => { event.stopPropagation(); playNextSong(); });
    el.play.addEventListener("click", togglePlay);
    el.prev.addEventListener("click", playPreviousSong);
    el.next.addEventListener("click", playNextSong);
    el.shuffle.addEventListener("click", () => toggleMode("shuffle", el.shuffle));
    el.repeat.addEventListener("click", () => toggleMode("repeat", el.repeat));
    el.progressBar.addEventListener("click", seek);
    el.download.addEventListener("click", downloadCurrentSong);
    el.audio.addEventListener("timeupdate", updateProgress);
    el.audio.addEventListener("loadedmetadata", updateProgress);
    el.audio.addEventListener("play", () => syncPlayButtons(true));
    el.audio.addEventListener("pause", () => syncPlayButtons(false));
    el.audio.addEventListener("ended", playNextSong);
    el.audio.addEventListener("error", () => {
      if (currentSong()) notify("Stream gagal dimuat. Periksa backend atau coba lagi.", "error");
    });
    $("#downloadFormat")?.addEventListener("change", event => {
      const quality = $("#downloadQuality");
      if (!quality) return;
      quality.replaceChildren();
      const options = event.target.value === "mp4"
        ? [["1080", "1080p"], ["720", "720p"], ["480", "480p"], ["360", "360p"]]
        : [["320", "320 kbps"], ["256", "256 kbps"], ["192", "192 kbps"], ["128", "128 kbps"]];
      options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        quality.appendChild(option);
      });
    });
  }

  async function checkBackend() {
    try {
      const data = await UTILS.fetchJson(APP_CONFIG.API.HEALTH, {}, 5000);
      if (!data.ok) throw new Error("Backend tidak siap");
    } catch {
      notify("Mode frontend aktif. Untuk streaming dan download MP3/MP4, jalankan server Node.js.", "warning");
    }
  }

  function init() {
    loadState();
    bindEvents();
    requestAnimationFrame(() => el.welcome?.classList.add("show"));
    el.loading.style.display = "none";
    el.noResults.style.display = "none";
    checkBackend();
  }

  document.addEventListener("DOMContentLoaded", init, { once: true });
})();
