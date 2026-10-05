/* Shared helpers for the games site: catalog page and bench page.
   Every game fact comes from window.CATALOG (catalog.js). Nothing here names a game or a model. */
(function () {
  "use strict";

  const RAW = window.CATALOG || {};
  const BASE = document.documentElement.dataset.base || "./";
  const INK = "#1F1A14";
  const PAPER = "#FFFBF2";
  const FALLBACK_ACCENT = "#EFCB94";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  /* ---------- data: tolerate missing fields so one bad record cannot blank the page ---------- */

  const str = (value) => (value === null || value === undefined ? "" : String(value));
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

  function cleanGame(game) {
    const media = game.media && typeof game.media === "object" ? game.media : {};
    const notes = game.notes && typeof game.notes === "object" ? game.notes : {};
    return Object.assign({}, game, {
      id: str(game.id),
      title: str(game.title) || str(game.id),
      subtitle: str(game.subtitle),
      genre: str(game.genre),
      pitch: str(game.pitch),
      controls: str(game.controls),
      model: str(game.model),
      effort: str(game.effort),
      score: num(game.score),
      verdict: str(game.verdict),
      review: str(game.review),
      highlights: Array.isArray(game.highlights) ? game.highlights.map(str).filter(Boolean) : [],
      buildTime: str(game.buildTime),
      agents: num(game.agents),
      tokens: num(game.tokens),
      cost: num(game.cost),
      costLabel: str(game.costLabel),
      notes: { build: str(notes.build), cost: str(notes.cost) },
      url: str(game.url) || "./",
      media: { poster: str(media.poster), thumb: str(media.thumb), webm: str(media.webm), mp4: str(media.mp4) },
    });
  }

  const CATALOG = {
    variant: RAW.variant === "public" ? "public" : "internal",
    genres: (Array.isArray(RAW.genres) ? RAW.genres : []).filter((g) => g && g.id),
    games: (Array.isArray(RAW.games) ? RAW.games : []).filter((g) => g && g.id).map(cleanGame),
  };

  /* ---------- DOM ---------- */

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key === "html") el.innerHTML = value; // static icon markup only, never catalog text
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? "" : value);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const sr = (text) => h("span", { class: "sr", text });

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4.6c0-1 1.1-1.6 2-1.1l11 7.4c.8.5.8 1.7 0 2.2l-11 7.4c-.9.5-2-.1-2-1.1z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.6" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.6" fill="currentColor"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6M11.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
    sort: '<svg viewBox="0 0 12 16" aria-hidden="true"><path class="up" d="M6 1.5l4.2 5H1.8z"/><path class="down" d="M6 14.5l4.2-5H1.8z"/></svg>',
  };

  function icon(name, cls) {
    return h("span", { class: "icon" + (cls ? " " + cls : ""), html: ICONS[name] });
  }

  /* ---------- colour: the game's own accent ---------- */

  function accentOf(game) {
    return /^#[0-9a-f]{6}$/i.test(game.accent || "") ? game.accent : FALLBACK_ACCENT;
  }

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /* Text colour for a flat fill of the accent. Ink or paper when one of them reaches 4.5:1;
     otherwise black or white, one of which always does. */
  function onAccent(hex) {
    const soft = contrast(hex, INK) >= contrast(hex, PAPER) ? INK : PAPER;
    if (contrast(hex, soft) >= 4.5) return soft;
    return contrast(hex, "#000000") >= contrast(hex, "#ffffff") ? "#000000" : "#ffffff";
  }

  function paint(el, game) {
    const accent = accentOf(game);
    const on = onAccent(accent);
    el.style.setProperty("--accent", accent);
    el.style.setProperty("--on-accent", on);
    // Text on a button filled with --on-accent, so Play has an edge on dark and on light boxes.
    el.style.setProperty("--on-accent-text", luminance(on) < 0.2 ? PAPER : INK);
    return el;
  }

  /* ---------- colour: the model that built it ----------
     One slot per model name, chosen by a hash of the name, so the colours do not depend on the
     order of the games or on how many games a model has. Names are placed in sorted order and a
     taken slot moves the later name on, so a new model can move an existing one only when the two
     hash to the same slot and the new name sorts first. Past twelve models the colours repeat
     with stripes. */

  const MODEL_COLOURS = [
    "#C8372D", "#B85C00", "#8A7400", "#2E8540", "#00857C", "#1C7ED6",
    "#4F5BD5", "#7A4A2B", "#C2338F", "#8E44C9", "#56657A", "#1F2A44",
  ];

  function hashName(name) {
    let hash = (2166136261 ^ 15) >>> 0;
    for (let i = 0; i < name.length; i++) {
      hash ^= name.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  const modelCounts = new Map();
  CATALOG.games.forEach((game) => {
    if (game.model) modelCounts.set(game.model, (modelCounts.get(game.model) || 0) + 1);
  });
  const modelNames = [...modelCounts.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const modelStyle = new Map();
  (function assignModelColours() {
    const size = MODEL_COLOURS.length;
    let taken = new Set();
    modelNames.forEach((name, i) => {
      if (i > 0 && i % size === 0) taken = new Set();
      let slot = hashName(name) % size;
      while (taken.has(slot)) slot = (slot + 5) % size;
      taken.add(slot);
      modelStyle.set(name, { colour: MODEL_COLOURS[slot], striped: Math.floor(i / size) % 2 === 1 });
    });
  })();

  function slug(text) {
    return str(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /* Models as { name, slug, count }, most builds first. */
  const models = modelNames
    .map((name) => ({ name, slug: slug(name) || "model", count: modelCounts.get(name) }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));

  /* A small block in the model's colour. Always sits beside the model's name. */
  function swatch(model, cls) {
    const style = modelStyle.get(model);
    const el = h("i", { class: "swatch" + (style && style.striped ? " swatch--striped" : "") + (cls ? " " + cls : ""), "aria-hidden": "true" });
    if (style) el.style.setProperty("--model", style.colour);
    return el;
  }

  function paintModel(el, model) {
    const style = modelStyle.get(model);
    if (style) el.style.setProperty("--model", style.colour);
    el.classList.toggle("is-striped", Boolean(style && style.striped));
    return el;
  }

  /* ---------- data helpers ---------- */

  const genreById = new Map(CATALOG.genres.map((g) => [g.id, g]));

  /* A genre has two labels. name is the genre as the pages name it ("StarCraft-inspired RTS"): filter
     chips, the details view, the bench. short ("RTS") is the compact tag on a card and in the hero,
     and stands in for the name where a narrow bench layout has no room for it. Each falls back to
     the other, then to the id. */
  function genreName(genre) {
    return str(genre.name) || str(genre.short) || str(genre.id);
  }

  function genreShort(genre) {
    return str(genre.short) || str(genre.name) || str(genre.id);
  }

  function genreOf(game) {
    const genre = genreById.get(game.genre);
    if (genre) return { id: genre.id, name: genreName(genre), short: genreShort(genre), reviewKicker: str(genre.reviewKicker) };
    return { id: game.genre, name: game.genre, short: game.genre, reviewKicker: "" };
  }

  /* Paths in the catalog are relative to games/. */
  function rel(path) {
    return BASE + str(path).replace(/^\.\//, "");
  }

  function isRated(game) {
    return typeof game.score === "number";
  }

  function minutes(buildTime) {
    const hours = /(\d+)\s*h/.exec(buildTime || "");
    const mins = /(\d+)\s*m/.exec(buildTime || "");
    if (!hours && !mins) return null;
    return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  }

  const nf = new Intl.NumberFormat("en-US");
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  function fmtInt(n) {
    return typeof n === "number" ? nf.format(n) : "";
  }

  /* Three significant figures: 9.95B, 70.9M, 164M. */
  function fmtCompact(n) {
    if (typeof n !== "number") return "";
    const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (let i = 0; i < units.length; i++) {
      const [size, unit] = units[i];
      if (n < size) continue;
      const v = n / size;
      const text = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
      if (Number(text) >= 1000 && i > 0) return "1.00" + units[i - 1][1];
      return text + unit;
    }
    return nf.format(n);
  }

  function fmtMoney(n) {
    return typeof n === "number" ? money.format(n) : "";
  }

  /* A dash that reads as "not listed". */
  function dash() {
    return [h("span", { "aria-hidden": "true", text: "–" }), sr("not listed")];
  }

  /* Abbreviated token count; the exact figure is the tooltip and what a screen reader hears. */
  function tokens(n) {
    if (typeof n !== "number") return dash();
    const exact = fmtInt(n);
    return h("span", { class: "abbr", title: exact + " tokens" }, h("span", { "aria-hidden": "true", text: fmtCompact(n) }), sr(exact));
  }

  /* Each comparator sorts ascending; missing values always sort last. */
  function by(get) {
    return (dir) => (a, b) => {
      const va = get(a);
      const vb = get(b);
      const na = va === null || va === undefined || va === "";
      const nb = vb === null || vb === undefined || vb === "";
      if (na || nb) return na === nb ? a.title.localeCompare(b.title) : na ? 1 : -1;
      const d = typeof va === "string" ? va.localeCompare(vb, "en", { numeric: true }) : va - vb;
      return d === 0 ? a.title.localeCompare(b.title) : d * dir;
    };
  }

  const SORTERS = {
    score: by((g) => g.score),
    title: by((g) => g.title),
    genre: by((g) => genreOf(g).name),
    model: by((g) => g.model),
    effort: by((g) => g.effort),
    buildTime: by((g) => minutes(g.buildTime)),
    agents: by((g) => g.agents),
    tokens: by((g) => g.tokens),
    cost: by((g) => g.cost),
  };

  function sortGames(games, key, dir) {
    const make = SORTERS[key] || SORTERS.score;
    return games.slice().sort(make(dir === "asc" ? 1 : -1));
  }

  function topRated(count) {
    return sortGames(CATALOG.games.filter(isRated), "score", "desc").slice(0, count);
  }

  /* ---------- titles that fit ----------
     Unbounded is a wide face. These are its advance widths in em, rounded up, so CSS can size a
     title from the data alone: no measuring, no waiting for the font. */

  function emWidth(text) {
    let width = 0;
    for (const ch of str(text)) {
      if (ch === " ") width += 0.25;
      else if ("iIjl.,:;'!|".includes(ch)) width += 0.37;
      else if ("frt1-/·()".includes(ch)) width += 0.62;
      else if ("mMwW".includes(ch)) width += 1.3;
      else if (ch >= "a" && ch <= "z") width += 0.82;
      else width += 0.95;
    }
    return width;
  }

  /* --word: the longest word, which must never break. --fit: the width to size against, one line
     when the title is short and two when it is long. */
  function fitTitle(el, text) {
    const words = str(text).split(/\s+/).filter(Boolean);
    const word = Math.max(1, ...words.map(emWidth));
    const line = Math.max(1, emWidth(text));
    el.style.setProperty("--word", word.toFixed(2));
    el.style.setProperty("--fit", (line <= 12 ? line : Math.max(word, line * 0.58)).toFixed(2));
    return el;
  }

  /* ---------- rating sticker ---------- */

  const SEAL_PATH = (() => {
    const lobes = 14;
    const steps = 168;
    let d = "";
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const r = 44 + 3 * Math.cos(lobes * t);
      d += (i ? "L" : "M") + (r * Math.cos(t)).toFixed(2) + " " + (r * Math.sin(t)).toFixed(2);
    }
    return d + "Z";
  })();

  function seal(game, cls) {
    if (!isRated(game)) {
      return h("p", { class: "seal seal--none" + (cls ? " " + cls : "") }, "Not yet rated");
    }
    const text = String(game.score);
    return h(
      "p",
      { class: "seal" + (text.length > 2 ? " seal--long" : "") + (cls ? " " + cls : "") },
      h("span", {
        class: "seal-shape",
        html: '<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="' + SEAL_PATH + '"/></svg>',
      }),
      sr("Alan's rating: " + text + " out of 10"),
      h("span", { class: "seal-num", "aria-hidden": "true", text }),
      h("span", { class: "seal-of", "aria-hidden": "true", text: "/10" })
    );
  }

  /* ---------- pictures ---------- */

  /* A game with no poster gets a plain block with its initial. */
  function blank(game, cls) {
    return h("span", { class: "blank" + (cls ? " " + cls : ""), "aria-hidden": "true" }, h("span", { text: (game.title.trim()[0] || "?").toUpperCase() }));
  }

  /* A picture that fails to load is swapped for the same plain block. */
  function orBlank(img, game, cls) {
    img.addEventListener("error", () => img.replaceWith(blank(game, cls)), { once: true });
    return img;
  }

  /* A small still. Uses media.thumb when the catalog has one, otherwise the full poster. */
  function thumb(game, cls, width, height) {
    const src = game.media.thumb || game.media.poster;
    if (!src) return blank(game, cls);
    return orBlank(h("img", { class: cls || null, src: rel(src), alt: "", width: String(width), height: String(height), loading: "lazy", decoding: "async" }), game, cls);
  }

  /* ---------- gameplay clip ----------
     The picture is a link to the game. It repeats the Play link beside it, so it is left out of the
     tab order and the accessibility tree. The play/pause button is a sibling, not inside the link. */

  const clips = new Set();

  function makeClip(game, opts) {
    const options = opts || {};
    const media = game.media;
    const hasVideo = Boolean(media.webm || media.mp4);
    const link = h("a", { class: "clip-link", href: rel(game.url), tabindex: "-1", "aria-hidden": "true" });

    let video = null;
    if (hasVideo) {
      video = h("video", {
        muted: true,
        loop: true,
        playsinline: true,
        // Only the hero's first clip loads ahead of a request to play, and not under reduced motion,
        // where nothing plays until the visitor asks.
        preload: options.eager && !reduceMotion.matches ? "auto" : "none",
        tabindex: "-1",
        disablepictureinpicture: true,
      });
      video.muted = true;
      if (media.webm) video.append(h("source", { src: rel(media.webm), type: "video/webm" }));
      if (media.mp4) video.append(h("source", { src: rel(media.mp4), type: "video/mp4" }));
      link.append(video);
    }
    // The still is an <img> over the video, not the video's poster attribute: a poster is fetched at
    // once wherever the card is, and a lazy image waits until the card is near the screen.
    if (media.poster) {
      link.append(
        orBlank(
          h("img", {
            class: "clip-poster",
            src: rel(media.poster),
            alt: "",
            width: "1280",
            height: "800",
            loading: options.eager ? "eager" : "lazy",
            // A lazy still is decoded with the frame that first shows it, so a still that has
            // loaded never appears as an empty block.
            decoding: options.eager ? "async" : null,
            fetchpriority: options.eager ? "high" : null,
          }),
          game,
          "clip-poster clip-blank"
        )
      );
    } else {
      link.append(blank(game, "clip-blank"));
    }

    const label = sr("Play clip of " + game.title);
    const toggle =
      hasVideo && !options.bare
        ? h("button", { class: "clip-toggle", type: "button" }, icon("play", "when-paused"), icon("pause", "when-playing"), label)
        : null;
    const el = h("div", { class: "clip" + (hasVideo ? "" : " clip--still") + (options.cls ? " " + options.cls : "") }, link, toggle);

    const api = {
      el,
      video,
      toggle,
      game,
      held: false, // the visitor paused it by hand
      wanted: false, // the visitor started it by hand
      onchange: null,
      get playing() {
        return Boolean(video) && !video.paused;
      },
      play() {
        if (!video) return;
        const started = video.play();
        if (started && started.catch) started.catch(() => {});
      },
      pause() {
        if (video) video.pause();
      },
      /* Autoplay paths call this; it does nothing under reduced motion or after a manual pause. */
      autoplay() {
        if (reduceMotion.matches || api.held) return;
        api.play();
      },
      /* For a clip that is leaving the page for good: stops it, lets go of what it has loaded and
         takes it off the list of clips, so nothing keeps the video element alive. */
      remove() {
        clips.delete(api);
        api.onchange = null;
        if (!video) return;
        video.pause();
        video.querySelectorAll("source").forEach((source) => source.remove());
        video.removeAttribute("src");
        video.load();
      },
    };

    if (video) {
      video.addEventListener("playing", () => {
        el.classList.add("is-playing", "has-played");
        label.textContent = "Pause clip of " + game.title;
      });
      video.addEventListener("pause", () => {
        el.classList.remove("is-playing");
        label.textContent = "Play clip of " + game.title;
      });
      if (toggle) toggle.addEventListener("click", () => {
        if (video.paused) {
          api.held = false;
          api.wanted = true;
          api.play();
        } else {
          api.held = true;
          api.wanted = false;
          api.pause();
        }
        if (api.onchange) api.onchange();
      });
      clips.add(api);
    }
    return api;
  }

  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) clips.forEach((clip) => clip.pause());
  });

  /* ---------- page chrome ---------- */

  function initChrome() {
    // The link back to Alan's home page exists only on the public variant.
    if (CATALOG.variant === "public") {
      document.querySelectorAll("[data-home]").forEach((el) => el.removeAttribute("hidden"));
    }
    // The mark is three little boxes in the colours of the three top-rated games.
    const top = topRated(3);
    if (top.length === 3) {
      document.querySelectorAll("[data-mark]").forEach((mark) => {
        mark.replaceChildren(...top.map((game) => paint(h("i", {}), game)));
      });
    }
    document.documentElement.classList.add("js");
  }

  /* The key that says which colour is which model. With onpick the entries are filter buttons. */
  function modelLegend(options) {
    const opts = options || {};
    return models.map((model) => {
      const inner = [swatch(model.name), h("span", { class: "legend-name", text: model.name })];
      if (!opts.onpick) return h("li", { class: "legend-item" }, inner);
      const count = h("span", { class: "chip-count" }, String(model.count), sr(model.count === 1 ? " game" : " games"));
      return h(
        "button",
        { class: "chip chip--model", type: "button", "data-model": model.slug, "aria-pressed": "false", onclick: () => opts.onpick(model) },
        inner,
        count
      );
    });
  }

  window.Shelf = {
    CATALOG,
    h,
    sr,
    icon,
    paint,
    accentOf,
    contrast,
    genreOf,
    genreName,
    rel,
    isRated,
    minutes,
    fmtInt,
    fmtCompact,
    fmtMoney,
    dash,
    tokens,
    sortGames,
    topRated,
    fitTitle,
    seal,
    blank,
    thumb,
    makeClip,
    models,
    swatch,
    paintModel,
    modelLegend,
    initChrome,
    reduceMotion,
    finePointer,
  };
})();
