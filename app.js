/* Catalog page: the hero reel, the shelf, and the back-of-the-box dialog. */
(function () {
  "use strict";

  const S = window.Shelf;
  const { CATALOG, h, sr, icon, paint, genreOf, rel, isRated, sortGames, seal, makeClip, fitTitle, reduceMotion, finePointer } = S;
  const games = CATALOG.games;
  const byId = new Map(games.map((g) => [g.id, g]));

  S.initChrome();

  /* ---------- headline ---------- */

  const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
  const countEl = document.querySelector("[data-count]");
  if (countEl && games.length) {
    const word = WORDS[games.length] || String(games.length);
    countEl.textContent = word + " browser " + (games.length === 1 ? "game" : "games");
    const each = document.querySelector("[data-each]");
    if (each && games.length === 1) each.textContent = "built";
  }

  const tally = document.getElementById("tally");
  if (tally) {
    const genreCount = new Set(games.map((g) => g.genre)).size;
    tally.replaceChildren(
      ...[
        [games.length, games.length === 1 ? "game" : "games"],
        [S.models.length, S.models.length === 1 ? "model" : "models"],
        [genreCount, genreCount === 1 ? "genre" : "genres"],
      ].map(([n, noun]) => h("li", {}, h("b", { text: String(n) }), h("span", { text: noun })))
    );
  }

  /* ---------- one clip at a time ----------
     Mouse: a card plays while the pointer is on it, and the hero waits meanwhile.
     Keyboard: a card plays while Tab has put focus inside it.
     Touch: there is no hover, so the one picture most in view plays and every other one pauses.
     A card's clip starts only after the page has rested on it, so skimming the page loads none. */

  const dialog = document.getElementById("detail");
  const cards = []; // { clip, el, slot, pointerIn, turns }
  let reel = null;

  /* How much of a picture is on screen (seen, 0 to 1) and how far its middle is from the middle of
     the screen (off, in screen heights). */
  function share(el) {
    const r = el.getBoundingClientRect();
    if (!r.height) return { seen: 0, off: 1 };
    const seen = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) / r.height;
    const off = Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2) / window.innerHeight;
    return { seen, off };
  }
  const onScreen = (item) => share(item.el).seen >= 0.3;
  /* True while any part of a control is between the top and the bottom of the screen. */
  function showing(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  /* Mouse and keyboard: at most one card is live, and the hero waits while one is. */
  let live = null;
  // True while the visitor is moving through the page with the Tab key. Focus inside a card counts
  // only then. A click leaves focus in a card too, and so does the dialog when it hands focus back,
  // and neither of those is a reason to keep a clip playing.
  let tabbing = false;

  function rest(item) {
    item.clip.held = false;
    item.clip.wanted = false;
    item.clip.pause();
  }

  function goLive(item) {
    if (live === item || !item.clip.video) return;
    if (live) rest(live);
    live = item;
    if (reel) reel.hold("card", true);
    item.clip.autoplay();
  }

  function letGo(item) {
    if (live !== item) return;
    live = null;
    rest(item);
    if (reel) reel.hold("card", false);
  }

  /* What keeps a card live: the pointer on it, Tab focus inside it, or, under reduced motion where
     nothing plays by itself, a clip the visitor started with its Play button. */
  function settleCard(item) {
    const keeps =
      item.pointerIn ||
      (tabbing && item.slot.contains(document.activeElement)) ||
      (reduceMotion.matches && item.clip.wanted);
    if (!keeps) letGo(item);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Tab") tabbing = true;
  }, true);
  function stopTabbing() {
    if (!tabbing) return;
    tabbing = false;
    if (live) settleCard(live);
  }
  window.addEventListener("pointerdown", stopTabbing, true);
  window.addEventListener("wheel", stopTabbing, { capture: true, passive: true });

  const stage = (function () {
    const DWELL = 400; // ms the page rests on a card before its clip starts loading
    const near = new Set();
    let queued = false;
    let settle = 0;
    let turn = null; // touch: the card whose clip is having its run

    function evaluate() {
      queued = false;
      window.clearTimeout(settle);
      if (finePointer.matches) {
        if (reel) reel.hold("touch", false);
        // A card kept live by focus or by its own Play button stops once it is out of view. The card
        // with Tab focus starts when it is on screen: focus can arrive before the page has scrolled
        // to it.
        if (live && !live.pointerIn && !onScreen(live)) letGo(live);
        if (!live && tabbing && !reduceMotion.matches) {
          const focused = cards.find((item) => item.slot.contains(document.activeElement));
          if (focused && onScreen(focused)) goLive(focused);
        }
        return;
      }
      if (dialog.open) return;
      const inView = [];
      const consider = (item, isHero) => {
        const { seen, off } = share(item.el);
        const clip = item.clip;
        // A clip started by hand is the visitor's choice until it has left the screen: under a third
        // of the picture showing and its button gone as well. Until then it needs no more of itself
        // in view than that, so a Play button that can be tapped always starts its clip.
        if (clip && clip.wanted && seen < 0.3 && !showing(clip.toggle)) clip.wanted = false;
        const wanted = Boolean(clip && clip.wanted);
        if (seen < 0.6 && !wanted) return;
        if (clip && clip.held) return;
        inView.push({ item, score: seen - off + (wanted ? 10 : 0) + (isHero ? 0.05 : 0) });
      };
      if (reel) consider(reel.item, true);
      cards.forEach((item) => {
        if (near.has(item.el)) consider(item, false);
      });
      // Cards side by side are equally in view. The one having its run keeps it; after that the
      // card that has had the fewest runs goes next, so the cards in a row take turns.
      const top = inView.reduce((most, entry) => Math.max(most, entry.score), -Infinity);
      const level = inView.filter((entry) => top - entry.score < 0.02).map((entry) => entry.item);
      const best = level.find((item) => item === turn) || level.reduce((a, b) => ((b.turns || 0) < (a.turns || 0) ? b : a), level[0]) || null;
      cards.forEach((item) => {
        if (item === best) return;
        if (item.clip.playing) item.clip.pause();
        item.clip.wanted = false;
      });
      if (reel) reel.hold("touch", best !== reel.item);
      if (!best || !best.clip || best.clip.playing) return;
      // A clip the visitor started by hand plays at once. Otherwise the card must stay the one most
      // in view for DWELL first: every scroll event lands here and restarts the wait, so a quick
      // scroll past a card never asks for its clip.
      if (best.clip.wanted) best.clip.autoplay();
      else if (!reduceMotion.matches) {
        settle = window.setTimeout(() => {
          if (dialog.open || finePointer.matches) return;
          if (turn !== best) best.turns += 1;
          turn = best;
          best.clip.autoplay();
        }, DWELL);
      }
    }

    function queue() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(evaluate);
    }

    const watcher =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) near.add(entry.target);
                else near.delete(entry.target);
              });
              queue();
            },
            { threshold: [0, 0.3, 0.6, 0.8, 1] }
          )
        : null;

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue, { passive: true });
    finePointer.addEventListener("change", queue);
    reduceMotion.addEventListener("change", queue);

    return {
      watch(el) {
        if (watcher) watcher.observe(el);
      },
      evaluate: queue,
      /* A card's clip has played through once: the next card in the row may have its run. */
      played(item) {
        if (turn !== item) return;
        turn = null;
        queue();
      },
    };
  })();

  /* ---------- details dialog ---------- */

  let dialogClip = null;
  let dialogGame = null;
  let opener = null;
  let visibleOrder = games.slice();

  function fact(label, value) {
    return [h("dt", { text: label }), h("dd", {}, value || S.dash())];
  }

  /* The dialog shows one clip at a time and builds a new one for each game, so the one it had is
     dropped for good: stopped, unloaded and taken off the list of clips. */
  function dropDialogClip() {
    if (dialogClip) dialogClip.remove();
    dialogClip = null;
  }

  function renderDetail(game) {
    const genre = genreOf(game);
    dropDialogClip();
    dialogClip = makeClip(game);
    dialogGame = game;
    paint(dialog, game);

    const title = fitTitle(h("h2", { id: "detail-title", tabindex: "-1", text: game.title }), game.title);
    const rating = h("div", { class: "back-rating" }, seal(game), isRated(game) ? h("span", { text: "Alan's rating" }) : null);
    const head = h(
      "header",
      { class: "back-head" },
      dialogClip.el,
      h(
        "div",
        { class: "back-title" },
        genre.name ? h("p", { class: "tag" }, sr("Genre: "), genre.name) : null,
        title,
        game.subtitle ? h("p", { class: "back-sub", text: game.subtitle }) : null,
        game.pitch ? h("p", { class: "back-pitch", text: game.pitch }) : null,
        rating,
        h("a", { class: "btn btn-play btn-lg", href: rel(game.url) }, icon("play"), h("span", {}, "Play ", game.title))
      )
    );
    const close = h("button", { class: "back-close", type: "button", onclick: () => dialog.close() }, icon("close"), sr("Close"));

    const review = h("section", { "aria-labelledby": "detail-review" }, h("h3", { id: "detail-review", text: "Alan's review" }));
    if (game.verdict || game.review) {
      if (game.verdict) review.append(h("p", { class: "back-verdict", text: "“" + game.verdict + "”" }));
      if (game.review) review.append(h("p", { class: "back-review", text: game.review }));
    } else {
      review.append(h("p", { class: "back-empty", text: "Not yet rated. There is no review of this build yet." }));
    }
    if (game.highlights.length) {
      review.append(h("h4", { class: "sr", text: "Highlights" }), h("ul", { class: "marks" }, game.highlights.map((text) => h("li", { text }))));
    }
    if (game.controls) {
      review.append(h("div", { class: "back-controls" }, h("h3", { text: "Controls" }), h("p", { text: game.controls })));
    }

    const notes = [
      game.notes.build ? h("p", {}, h("b", { text: "Build time. " }), game.notes.build) : null,
      game.notes.cost ? h("p", {}, h("b", { text: "Cost. " }), game.notes.cost) : null,
    ].filter(Boolean);
    const facts = h(
      "section",
      { "aria-labelledby": "detail-facts" },
      h("h3", { id: "detail-facts", text: "Build facts" }),
      h(
        "dl",
        { class: "facts" },
        fact("Model", game.model ? [S.swatch(game.model), game.model] : null),
        fact("Effort", game.effort),
        fact("Build time", game.buildTime),
        fact("Agents", typeof game.agents === "number" ? S.fmtInt(game.agents) : null),
        fact(
          "Tokens",
          typeof game.tokens === "number" ? [h("b", { text: S.fmtCompact(game.tokens) }), h("small", { text: S.fmtInt(game.tokens) })] : null
        ),
        fact("Cost", game.costLabel || (typeof game.cost === "number" ? S.fmtMoney(game.cost) + " list-price equivalent" : null))
      ),
      notes.length ? h("div", { class: "facts-notes" }, h("h4", { text: "How these were measured" }), notes) : null
    );

    const at = visibleOrder.findIndex((g) => g.id === game.id);
    const prev = at > 0 ? visibleOrder[at - 1] : null;
    const next = at >= 0 && at < visibleOrder.length - 1 ? visibleOrder[at + 1] : null;
    const step = (to, label, glyph, cls) =>
      to
        ? h(
            "button",
            { class: "btn " + cls, type: "button", onclick: () => openDetail(to) },
            glyph === "back" ? icon("back") : null,
            h("span", { class: "step-name" }, sr(label + " game: "), to.title),
            glyph === "arrow" ? icon("arrow") : null
          )
        : h("span", { class: cls });
    // Previous and next stay at the foot of the sheet while it scrolls.
    const foot = h("footer", { class: "back-foot" }, step(prev, "Previous", "back", "step-prev"), step(next, "Next", "arrow", "step-next"));

    dialog.replaceChildren(close, head, h("div", { class: "back-body" }, review, facts), foot);
    dialog.scrollTop = 0;
    return title;
  }

  function hashId() {
    try {
      return decodeURIComponent(window.location.hash.slice(1));
    } catch (error) {
      return "";
    }
  }

  /* Opening adds a history entry, so the browser Back button closes the dialog.
     Previous and next replace that entry, so one Back still closes it. */
  function openDetail(game, from) {
    const wasOpen = dialog.open;
    const title = renderDetail(game);
    const url = window.location.pathname + window.location.search + "#" + encodeURIComponent(game.id);
    if (!wasOpen) {
      opener = from || null;
      dialog.showModal();
      if (hashId() !== game.id) history.pushState({ detail: true }, "", url);
    } else if (hashId() !== game.id) {
      history.replaceState(history.state, "", url);
    }
    title.focus();
    dialogClip.autoplay();
    if (reel) reel.hold("dialog", true);
    cards.forEach((item) => item.clip.pause());
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dropDialogClip();
    if (byId.has(hashId())) {
      // Closed with Esc, the button or the backdrop: take the entry back off the history.
      if (history.state && history.state.detail) history.back();
      else history.replaceState(history.state, "", window.location.pathname + window.location.search);
    }
    if (reel) reel.hold("dialog", false);
    // Focus goes back to the control that opened the dialog. When there is none (a link straight to
    // a game, or the browser's Forward button) the browser puts focus back where it was and the
    // page does not scroll.
    if (opener && opener.isConnected) opener.focus();
    opener = null;
    // A card the pointer never left picks its clip up again.
    if (live) live.clip.autoplay();
    stage.evaluate();
  });

  /* ---------- quotes that end on a word ----------
     A quote held to a fixed number of lines (line-clamp in the stylesheet). The browser cuts a
     clamped line mid-word, so when the quote is too long this drops whole words until it fits and
     ends it with an ellipsis. Screen readers get the full text. */
  const quotes = [];
  function fitQuote(quote) {
    const { el, shown, text, marks } = quote;
    if (!el.isConnected || !el.clientHeight) return;
    const set = (words) => {
      shown.textContent = marks ? "“" + words + "”" : words;
      return el.scrollHeight <= el.clientHeight + 1;
    };
    if (set(text)) return;
    const words = text.split(/\s+/);
    const cut = (n) => words.slice(0, n).join(" ").replace(/[\s,;:.(\[–—-]+$/, "") + "…";
    let low = 1;
    let high = words.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (set(cut(mid))) low = mid;
      else high = mid - 1;
    }
    set(cut(low));
  }
  const quoteWatcher =
    "ResizeObserver" in window
      ? new ResizeObserver((entries) => {
          // Fitting again at the same size gives the same text, so this settles in one pass.
          entries.forEach((entry) => {
            const quote = quotes.find((q) => q.el === entry.target);
            if (quote) fitQuote(quote);
          });
        })
      : null;
  function wordFit(el, text, spoken, marks) {
    const shown = h("span", { "aria-hidden": "true", text: marks ? "“" + text + "”" : text });
    el.append(sr(spoken + text), shown);
    quotes.push({ el, shown, text, marks });
    if (quoteWatcher) quoteWatcher.observe(el);
    return el;
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => quotes.forEach(fitQuote));

  /* ---------- hero reel ---------- */

  function bigScore(game) {
    if (!isRated(game)) return h("p", { class: "score score--none" }, "Not yet rated");
    const text = String(game.score);
    return h(
      "p",
      { class: "score" + (text.length > 1 ? " score--long" : "") },
      sr("Alan's rating: " + text + " out of 10"),
      h("span", { class: "score-num", "aria-hidden": "true", text }),
      h("span", { class: "score-of", "aria-hidden": "true", text: "/10" })
    );
  }

  function buildReel(root, list) {
    const kiosk = root.querySelector(".kiosk");
    const screen = root.querySelector(".screen");
    const info = root.querySelector(".kiosk-info");
    if (!list.length || !kiosk || !screen || !info) {
      root.closest(".reel-wall").hidden = true;
      return null;
    }

    // With no rated game the reel shows the first few as they come, so nothing calls them top rated.
    const rated = isRated(list[0]);
    root.closest(".reel-wall").setAttribute("aria-label", rated ? "Top rated games" : "Games on display");

    let index = 0;
    let running = !reduceMotion.matches;
    let inView = true;
    const holds = new Set();

    const clips = list.map((game, i) => makeClip(game, { eager: i === 0, bare: true, cls: "clip-slide" }));
    const toggle = h("button", { class: "clip-toggle reel-toggle", type: "button" }, icon("play", "when-paused"), icon("pause", "when-playing"), sr(""));
    const toggleLabel = toggle.querySelector(".sr");
    const hint = h("p", { class: "kiosk-hint", id: "reel-hint", text: "Left and right arrow keys change the game" });
    const live = h("p", { class: "sr", "aria-live": "polite" });
    screen.replaceChildren(...clips.map((c) => c.el), toggle, hint);

    const panels = list.map((game, i) => {
      const genre = genreOf(game);
      const quote = game.verdict
        ? h("blockquote", { class: "kiosk-verdict" }, wordFit(h("p"), game.verdict, "", true), h("footer", { text: "Alan's verdict" }))
        : game.pitch
          ? wordFit(h("p", { class: "kiosk-verdict kiosk-pitch" }), game.pitch, "", false)
          : null;
      if (quote) quote.style.setProperty("--len", String((game.verdict || game.pitch).length));
      return h(
        "div",
        { class: "panel" },
        h(
          "p",
          { class: "kiosk-kicker" },
          genre.short ? h("span", { class: "tag" }, sr("Genre: "), genre.short) : null,
          list.length > 1 ? h("span", { text: (rated ? "Top rated · " : "") + (i + 1) + " of " + list.length }) : null
        ),
        fitTitle(h("h2", { class: "kiosk-title", text: game.title }), game.title),
        game.subtitle ? h("p", { class: "kiosk-sub", text: game.subtitle }) : null,
        h("div", { class: "verdict" }, bigScore(game), quote),
        game.model ? h("p", { class: "kiosk-model" }, S.swatch(game.model), h("span", {}, "Built by ", h("b", { text: game.model }))) : null,
        h(
          "div",
          { class: "kiosk-actions" },
          h("a", { class: "btn btn-play btn-lg", href: rel(game.url), "data-role": "play" }, icon("play"), h("span", {}, "Play ", game.title)),
          h(
            "button",
            { class: "btn btn-lg", type: "button", "aria-haspopup": "dialog", "data-role": "details", onclick: (event) => openDetail(game, event.currentTarget) },
            "Details",
            sr(": " + game.title)
          )
        )
      );
    });

    const picks = list.map((game, i) =>
      h(
        "button",
        { class: "pick", type: "button", "data-role": "pick", onclick: () => show(i, true) },
        S.thumb(game, "", 160, 100),
        h("span", { class: "pick-bar" }),
        sr("Show " + game.title)
      )
    );
    const picker =
      list.length > 1
        ? h("div", { class: "picker", role: "group", "aria-label": "Games in the reel", style: "--n:" + list.length }, picks)
        : null;
    info.replaceChildren(...[h("div", { class: "kiosk-stack" }, panels), picker, live].filter(Boolean));
    kiosk.setAttribute("role", "group");
    kiosk.setAttribute("aria-label", "Featured game");
    if (list.length > 1) kiosk.setAttribute("aria-describedby", "reel-hint");
    kiosk.classList.add("is-ready");

    function sync() {
      const on = running && holds.size === 0 && inView;
      kiosk.classList.toggle("is-running", running);
      kiosk.classList.toggle("is-held", !on);
      const title = list[index].title;
      toggleLabel.textContent = reduceMotion.matches ? (running ? "Pause clip of " : "Play clip of ") + title : running ? "Pause the reel" : "Play the reel";
      clips.forEach((clip, i) => {
        if (i === index && on) clip.play();
        else clip.pause();
      });
    }

    function show(i, byUser) {
      index = (i + list.length) % list.length;
      const game = list[index];
      paint(kiosk, game);
      clips.forEach((clip, j) => clip.el.classList.toggle("is-on", j === index));
      panels.forEach((panel, j) => {
        panel.classList.toggle("is-on", j === index);
        panel.inert = j !== index;
      });
      picks.forEach((pick, j) => {
        pick.setAttribute("aria-current", j === index ? "true" : "false");
        pick.tabIndex = j === index ? 0 : -1;
      });
      if (byUser) live.textContent = "Showing " + game.title + ", " + (index + 1) + " of " + list.length;
      sync();
    }

    /* Move to another game and keep keyboard focus on the same control. */
    function step(delta) {
      const active = document.activeElement;
      const role = active && kiosk.contains(active) && active.dataset ? active.dataset.role : "";
      show(index + delta, true);
      if (role === "pick") picks[index].focus();
      else if (role) {
        const twin = panels[index].querySelector('[data-role="' + role + '"]');
        if (twin) twin.focus();
      }
    }

    toggle.addEventListener("click", () => {
      running = !running;
      sync();
    });
    // The progress bar on the current thumbnail is the timer: when it fills, the next game comes on.
    kiosk.addEventListener("animationend", (event) => {
      if (event.animationName === "fill" && list.length > 1) show(index + 1, false);
    });
    kiosk.addEventListener("keydown", (event) => {
      if (list.length < 2 || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else return;
      event.preventDefault();
    });
    // A sideways swipe on the picture changes the game too.
    let touchStart = null;
    screen.addEventListener("touchstart", (event) => {
      const t = event.touches[0];
      touchStart = event.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
    }, { passive: true });
    screen.addEventListener("touchend", (event) => {
      if (!touchStart || list.length < 2) return;
      const t = event.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) show(index + (dx < 0 ? 1 : -1), true);
    }, { passive: true });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          inView = entries[entries.length - 1].isIntersecting;
          sync();
        },
        { threshold: 0.35 }
      ).observe(screen);
    }
    reduceMotion.addEventListener("change", () => {
      if (reduceMotion.matches) running = false;
      sync();
    });

    const NUMBERS = ["", "", "two", "three", "four", "five", "six"];
    const what = rated ? "top-rated " : "";
    const onDisplay = list.length > 1 ? "On display: the " + (NUMBERS[list.length] || list.length) + " " + what + "games" : what ? "On display: the top-rated game" : "On display";
    root.append(h("p", { class: "slot-label slot-label--plain", text: onDisplay }));
    show(0, false);
    return {
      item: { el: screen, clip: null },
      hold(reason, on) {
        const had = holds.has(reason);
        if (on) holds.add(reason);
        else holds.delete(reason);
        if (had !== on) sync();
      },
    };
  }

  const featured = S.topRated(4);
  reel = buildReel(document.getElementById("reel"), featured.length ? featured : games.slice(0, 4));
  if (reel) stage.watch(reel.item.el);

  /* ---------- the shelf ---------- */

  const shelf = document.getElementById("shelf");
  const chips = document.getElementById("chips");
  const modelChips = document.getElementById("model-chips");
  const legend = document.getElementById("legend");
  const sortSelect = document.getElementById("sort");
  const status = document.getElementById("shelf-status");

  // Genres from the catalog, plus any genre id a game uses that the catalog does not list. The chips
  // and the status line use the genre's full name.
  const genres = CATALOG.genres.map((g) => ({ id: String(g.id), label: S.genreName(g) }));
  games.forEach((game) => {
    if (game.genre && !genres.some((g) => g.id === game.genre)) genres.push({ id: game.genre, label: game.genre });
  });

  const params = new URLSearchParams(window.location.search);
  const state = {
    genre: genres.some((g) => g.id === params.get("genre")) ? params.get("genre") : "all",
    model: S.models.some((m) => m.slug === params.get("model")) ? params.get("model") : "all",
    sort: [...sortSelect.options].some((o) => o.value === params.get("sort")) ? params.get("sort") : "score:desc",
  };
  sortSelect.value = state.sort;

  function buildSlot(game, i) {
    const genre = genreOf(game);
    const clip = makeClip(game);
    const titleId = "box-title-" + i;
    const details = h(
      "button",
      { class: "btn", type: "button", "aria-haspopup": "dialog", onclick: (event) => openDetail(game, event.currentTarget) },
      "Details",
      sr(": " + game.title)
    );
    const sortFact = h("p", { class: "box-fact", hidden: true });

    const box = h(
      "article",
      { class: "box" + (game.verdict ? " has-verdict" : ""), "aria-labelledby": titleId },
      clip.el,
      h("div", { class: "box-seal" }, seal(game)),
      h(
        "div",
        { class: "box-body" },
        h(
          "div",
          { class: "box-top" },
          fitTitle(h("h3", { class: "box-title", id: titleId, text: game.title }), game.title),
          h(
            "p",
            { class: "box-meta" },
            genre.short ? h("span", { class: "tag" }, sr("Genre: "), genre.short) : null,
            game.subtitle ? h("span", { class: "box-sub", text: game.subtitle }) : null
          )
        ),
        game.pitch ? wordFit(h("p", { class: "box-pitch" }), game.pitch, "", false) : null,
        game.verdict ? wordFit(h("p", { class: "box-verdict" }), game.verdict, "Alan's verdict: ", true) : null,
        sortFact,
        h(
          "div",
          { class: "box-actions" },
          h("a", { class: "btn btn-play", href: rel(game.url) }, icon("play"), "Play", sr(" " + game.title)),
          details
        )
      )
    );
    box.style.viewTransitionName = "box-" + i;

    const label = game.model
      ? S.paintModel(h("p", { class: "slot-label", title: "Built by " + game.model }, h("span", { text: "Built by " }), h("b", { text: game.model })), game.model)
      : null;
    const slot = paint(h("li", { class: "slot" }, box, label), game);

    // Mouse: play while the pointer is on the box. Keyboard: play while Tab focus is inside it.
    // Under reduced motion neither starts a clip; the card's Play button does.
    const item = { clip, el: clip.el, slot, pointerIn: false, turns: 0 };
    slot.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      item.pointerIn = true;
      if (!reduceMotion.matches) goLive(item);
    });
    slot.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      item.pointerIn = false;
      settleCard(item);
      stage.evaluate();
    });
    slot.addEventListener("focusin", () => {
      if (!tabbing || !finePointer.matches || reduceMotion.matches) return;
      if (onScreen(item)) goLive(item);
      else stage.evaluate();
    });
    slot.addEventListener("focusout", (event) => {
      if (!slot.contains(event.relatedTarget)) settleCard(item);
    });
    // The card's own Play and Pause button. Starting a clip by hand stops any other card's clip:
    // with a mouse goLive does that, and on touch the other cards give up their claim here, so the
    // card just tapped is the one the stage keeps, wherever the others are on screen.
    clip.onchange = () => {
      if (finePointer.matches) {
        if (clip.wanted) goLive(item);
        else if (reduceMotion.matches) letGo(item);
      } else if (clip.wanted) {
        cards.forEach((other) => {
          if (other === item) return;
          other.clip.wanted = false;
          other.clip.pause();
        });
      }
      stage.evaluate();
    };
    // Touch: when a clip has played through once (or for 12 seconds), a card beside it has a turn.
    if (clip.video) {
      let last = 0;
      clip.video.addEventListener("timeupdate", () => {
        const now = clip.video.currentTime;
        if (now < last || (now >= 12 && last < 12)) stage.played(item);
        last = now;
      });
    }
    cards.push(item);
    stage.watch(clip.el);
    return { slot, sortFact };
  }

  function buildBenchSlot() {
    const ranked = sortGames(games, "score", "desc").slice(0, 10);
    const bars = h(
      "div",
      { class: "bench-bars", "aria-hidden": "true" },
      ranked.map((game) => {
        const bar = S.paintModel(h("i", { class: isRated(game) ? "" : "is-none" }), game.model);
        if (isRated(game)) bar.style.setProperty("--v", String(Math.max(0, Math.min(10, game.score)) / 10));
        return bar;
      })
    );
    const box = h(
      "article",
      { class: "box", "aria-labelledby": "bench-box" },
      bars,
      h(
        "div",
        {},
        h("h3", { id: "bench-box", text: "The bench" }),
        h("p", { text: "The same games in one table: rating, model, effort, build time, agents, tokens and cost." })
      ),
      h("a", { class: "btn btn-solid", href: rel("./bench/") }, "Open the bench", icon("arrow"))
    );
    return h("li", { class: "slot slot--bench" }, box, h("p", { class: "slot-label slot-label--plain", text: "All builds compared" }));
  }

  const slots = new Map(games.map((g, i) => [g.id, buildSlot(g, i)]));
  const benchSlot = buildBenchSlot();
  const emptySlot = h(
    "li",
    { class: "slot slot--empty" },
    h(
      "div",
      { class: "box" },
      h("h3", { text: games.length ? "No games match" : "No games yet" }),
      h("p", { text: games.length ? "No game on the shelf fits both filters." : "The shelf is empty." }),
      games.length
        ? h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: () => {
                state.genre = "all";
                state.model = "all";
                update();
                document.getElementById("shelf-title").focus();
              },
            },
            "Show all games"
          )
        : null
    )
  );

  function countFor(genreId) {
    return genreId === "all" ? games.length : games.filter((g) => g.genre === genreId).length;
  }

  function buildChips() {
    const options = [{ id: "all", label: "All" }].concat(genres.filter((g) => countFor(g.id) > 0));
    chips.replaceChildren(
      ...options.map((option) =>
        h(
          "button",
          {
            class: "chip",
            type: "button",
            "data-genre": option.id,
            "aria-pressed": String(state.genre === option.id),
            onclick: () => {
              if (state.genre === option.id) return;
              state.genre = option.id;
              update();
            },
          },
          h("span", { text: option.label }),
          h("span", { class: "chip-count" }, String(countFor(option.id)), sr(countFor(option.id) === 1 ? " game" : " games"))
        )
      )
    );
    if (S.models.length) {
      modelChips.replaceChildren(
        ...S.modelLegend({
          onpick: (model) => {
            state.model = state.model === model.slug ? "all" : model.slug;
            update();
          },
        })
      );
      legend.hidden = false;
    }
  }

  const SORT_WORDS = { score: "rating", title: "title", genre: "genre", buildTime: "build time", cost: "cost" };

  /* The shelf's order. Sorting by genre groups the games in the order the catalog lists its genres,
     highest rated first inside each genre. */
  function inOrder(list, key, dir) {
    if (key !== "genre") return sortGames(list, key, dir);
    const place = (game) => {
      const at = genres.findIndex((g) => g.id === game.genre);
      return at < 0 ? genres.length : at;
    };
    return sortGames(list, "score", "desc")
      .map((game, i) => ({ game, i }))
      .sort((a, b) => place(a.game) - place(b.game) || a.i - b.i)
      .map((entry) => entry.game);
  }

  function sortFactFor(game, key) {
    if (key === "buildTime") return [h("span", { text: "Build time " }), h("b", {}, game.buildTime || S.dash())];
    if (key === "cost") {
      return [h("span", { text: "Cost " }), h("b", {}, typeof game.cost === "number" ? S.fmtMoney(game.cost) : S.dash()), typeof game.cost === "number" ? h("span", { text: " list-price equivalent" }) : null];
    }
    return null;
  }

  function render() {
    const [key, dir] = state.sort.split(":");
    const model = S.models.find((m) => m.slug === state.model);
    const genre = genres.find((g) => g.id === state.genre);
    const shown = inOrder(
      games.filter((g) => (!genre || g.genre === genre.id) && (!model || g.model === model.name)),
      key,
      dir
    );
    visibleOrder = shown;
    shown.forEach((game) => {
      const { sortFact } = slots.get(game.id);
      const content = sortFactFor(game, key);
      sortFact.hidden = !content;
      sortFact.replaceChildren(...(content || []).filter(Boolean));
    });
    shelf.replaceChildren(...shown.map((g) => slots.get(g.id).slot), ...(shown.length ? [] : [emptySlot]), benchSlot);
    // A card taken off the shelf gets no pointerleave, so it is let go here.
    cards.forEach((item) => {
      if (item.slot.isConnected) return;
      item.pointerIn = false;
      letGo(item);
    });
    chips.querySelectorAll(".chip").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.genre === state.genre)));
    modelChips.querySelectorAll(".chip").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.model === state.model)));

    const noun = shown.length === 1 ? "game" : "games";
    status.textContent =
      shown.length +
      " " +
      (genre ? genre.label + " " : "") +
      noun +
      (model ? " built by " + model.name : "") +
      ", sorted by " +
      (SORT_WORDS[key] || key) +
      ". Ratings are Alan's, out of 10.";
    stage.evaluate();
  }

  function update() {
    const url = new URL(window.location.href);
    const set = (name, value, fallback) => {
      if (value === fallback) url.searchParams.delete(name);
      else url.searchParams.set(name, value);
    };
    set("genre", state.genre, "all");
    set("model", state.model, "all");
    set("sort", state.sort, "score:desc");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);

    if (document.startViewTransition && !reduceMotion.matches) {
      const transition = document.startViewTransition(render);
      // A transition that is skipped (a resize, a second click) still runs render.
      [transition.ready, transition.finished, transition.updateCallbackDone].forEach((p) => p && p.catch(() => {}));
    } else render();
  }

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    update();
  });

  buildChips();
  render();
  if (!reduceMotion.matches) {
    [...shelf.children].forEach((slot, i) => slot.style.setProperty("--i", String(i)));
    shelf.classList.add("is-stocking");
    window.setTimeout(() => shelf.classList.remove("is-stocking"), 1400);
  }

  /* ---------- deep links: games/#aphelion opens that box, and Back closes it ---------- */

  function syncFromUrl() {
    const game = byId.get(hashId());
    if (game) {
      if (!dialog.open || dialogGame !== game) openDetail(game, null);
    } else if (dialog.open) dialog.close();
  }
  window.addEventListener("popstate", syncFromUrl);
  window.addEventListener("hashchange", syncFromUrl);
  syncFromUrl();
})();
