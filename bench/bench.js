/* Bench page: one sortable table, the reviews, and the method notes. */
(function () {
  "use strict";

  const S = window.Shelf;
  const { CATALOG, h, sr, icon, paint, genreOf, rel, isRated, sortGames, seal } = S;
  const games = CATALOG.games;

  S.initChrome();

  /* ---------- stats strip ---------- */

  const rated = games.filter(isRated).length;
  const genreCount = new Set(games.map((g) => g.genre)).size;
  document.getElementById("strip").replaceChildren(
    ...[
      [games.length, games.length === 1 ? "build" : "builds"],
      [rated, "rated"],
      [S.models.length, S.models.length === 1 ? "model" : "models"],
      [genreCount, genreCount === 1 ? "genre" : "genres"],
    ].map(([n, noun]) => h("li", {}, h("b", { text: String(n) }), " " + noun))
  );

  if (S.models.length) {
    document.getElementById("bench-legend").replaceChildren(...S.modelLegend());
    document.getElementById("key").hidden = false;
  }

  /* ---------- table ---------- */

  const max = (get) => Math.max(0, ...games.map(get).filter((v) => typeof v === "number"));
  const peaks = {
    buildTime: max((g) => S.minutes(g.buildTime)),
    agents: max((g) => g.agents),
    tokens: max((g) => g.tokens),
    cost: max((g) => g.cost),
  };

  /* A thin bar: this value against the largest in the column, in the colour of the model. */
  function meter(value, peak) {
    if (typeof value !== "number" || !peak) return null;
    const bar = h("i");
    bar.style.setProperty("--v", String(Math.max(0, Math.min(1, value / peak))));
    return h("span", { class: "meter", "aria-hidden": "true" }, bar);
  }

  const COLUMNS = [
    {
      key: "score",
      label: "Rating",
      note: "out of 10",
      first: "desc",
      words: ["lowest first", "highest first"],
      cell: (g) => seal(g),
    },
    {
      key: "title",
      label: "Game",
      first: "asc",
      words: ["A to Z", "Z to A"],
      cell: (g) => {
        const link = S.fitTitle(h("a", { href: rel("./#" + encodeURIComponent(g.id)) }, g.title, sr(": details")), g.title);
        const long = Number(link.style.getPropertyValue("--word")) > 9;
        return h(
          "div",
          { class: "game" + (long ? " is-long" : "") },
          S.thumb(g, "thumb", 80, 50),
          h("span", { class: "game-name" }, link, g.subtitle ? h("small", { text: g.subtitle }) : null),
          h("a", { class: "row-play", href: rel(g.url) }, icon("play"), h("span", { class: "row-play-label", "aria-hidden": "true", text: "Play" }), sr("Play " + g.title))
        );
      },
    },
    {
      key: "genre",
      label: "Genre",
      first: "asc",
      words: ["A to Z", "Z to A"],
      // The genre's full name. Where a layout has no room for it on a line of its own, the
      // stylesheet shows the short name in its place.
      cell: (g) => {
        const genre = genreOf(g);
        if (!genre.name) return S.dash();
        if (genre.short === genre.name) return genre.name;
        return [h("span", { class: "genre-full", text: genre.name }), h("span", { class: "genre-brief", text: genre.short })];
      },
    },
    {
      key: "model",
      label: "Model",
      first: "asc",
      words: ["A to Z", "Z to A"],
      cell: (g) => (g.model ? h("span", { class: "model" }, S.swatch(g.model), h("span", { text: g.model })) : S.dash()),
    },
    { key: "effort", label: "Effort", first: "asc", words: ["A to Z", "Z to A"], cell: (g) => g.effort || S.dash() },
    {
      key: "buildTime",
      label: "Build time",
      num: true,
      first: "asc",
      words: ["shortest first", "longest first"],
      cell: (g) => (g.buildTime ? [g.buildTime, meter(S.minutes(g.buildTime), peaks.buildTime)] : S.dash()),
    },
    {
      key: "agents",
      label: "Agents",
      num: true,
      first: "asc",
      words: ["fewest first", "most first"],
      cell: (g) => (typeof g.agents === "number" ? [S.fmtInt(g.agents), meter(g.agents, peaks.agents)] : S.dash()),
    },
    {
      key: "tokens",
      label: "Tokens",
      num: true,
      first: "asc",
      words: ["fewest first", "most first"],
      cell: (g) =>
        typeof g.tokens === "number"
          ? [S.tokens(g.tokens), h("small", { class: "exact", "aria-hidden": "true", text: S.fmtInt(g.tokens) }), meter(g.tokens, peaks.tokens)]
          : S.dash(),
    },
    {
      key: "cost",
      label: "Cost",
      note: "list-price equivalent",
      num: true,
      first: "asc",
      words: ["lowest first", "highest first"],
      cell: (g) => (typeof g.cost === "number" ? [S.fmtMoney(g.cost), meter(g.cost, peaks.cost)] : S.dash()),
    },
  ];

  const table = document.getElementById("bench");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const status = document.getElementById("sort-status");
  const select = document.getElementById("bench-sort");

  // The sort lives in the URL: bench/?sort=cost:asc
  const DEFAULT_SORT = "score:desc";
  const wanted = (new URLSearchParams(window.location.search).get("sort") || "").split(":");
  const valid = COLUMNS.some((c) => c.key === wanted[0]) && (wanted[1] === "asc" || wanted[1] === "desc");
  const state = valid ? { key: wanted[0], dir: wanted[1] } : { key: "score", dir: "desc" };

  const headCells = new Map();
  thead.append(
    h(
      "tr",
      {},
      COLUMNS.map((col) => {
        const button = h(
          "button",
          { class: "th-sort", type: "button", onclick: () => sortBy(col.key) },
          h("span", {}, col.label, col.note ? h("small", { text: col.note }) : null),
          icon("sort")
        );
        const th = h("th", { scope: "col", class: "c-" + col.key + (col.num ? " num" : ""), "data-key": col.key }, button);
        headCells.set(col.key, th);
        return th;
      })
    )
  );

  function sortOption(col, dir) {
    return h("option", { value: col.key + ":" + dir, text: col.label + ", " + col.words[dir === "asc" ? 0 : 1] });
  }
  COLUMNS.forEach((col) => {
    [col.first, col.first === "asc" ? "desc" : "asc"].forEach((dir, i) => {
      if (i === 1 && col.key !== "score" && !col.num) return; // keep the phone menu short
      select.append(sortOption(col, dir));
    });
  });

  const rows = new Map(
    games.map((game) => {
      const row = h(
        "tr",
        {},
        COLUMNS.map((col) =>
          h(
            col.key === "title" ? "th" : "td",
            {
              class: "c-" + col.key + (col.num ? " num" : ""),
              scope: col.key === "title" ? "row" : null,
              "data-key": col.key,
              "data-label": col.label + (col.note ? ", " + col.note : ""),
            },
            col.cell(game)
          )
        )
      );
      S.paintModel(row, game.model);
      return [game.id, row];
    })
  );

  function sortBy(key) {
    const col = COLUMNS.find((c) => c.key === key);
    state.dir = state.key === key ? (state.dir === "asc" ? "desc" : "asc") : col.first;
    state.key = key;
    renderTable(true);
  }

  function renderTable(byUser) {
    const col = COLUMNS.find((c) => c.key === state.key);
    const sorted = sortGames(games, state.key, state.dir);
    tbody.replaceChildren(...sorted.map((g) => rows.get(g.id)));
    headCells.forEach((th, key) => {
      th.setAttribute("aria-sort", key === state.key ? (state.dir === "asc" ? "ascending" : "descending") : "none");
    });
    table.querySelectorAll("[data-key]").forEach((cell) => cell.classList.toggle("is-sorted", cell.dataset.key === state.key));
    const value = state.key + ":" + state.dir;
    // The menu lists the common sorts. A sort that came from the URL or a header joins the list.
    if (![...select.options].some((o) => o.value === value)) select.append(sortOption(col, state.dir));
    select.value = value;
    status.textContent = "Sorted by " + col.label.toLowerCase() + ", " + col.words[state.dir === "asc" ? 0 : 1] + ".";

    if (byUser) {
      const url = new URL(window.location.href);
      if (value === DEFAULT_SORT) url.searchParams.delete("sort");
      else url.searchParams.set("sort", value);
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  }

  select.addEventListener("change", () => {
    const [key, dir] = select.value.split(":");
    state.key = key;
    state.dir = dir;
    renderTable(true);
  });

  // Rows become cards on narrow screens (display: block), so the table roles are stated outright.
  table.setAttribute("role", "table");
  table.querySelectorAll("thead, tbody").forEach((el) => el.setAttribute("role", "rowgroup"));
  table.querySelectorAll("thead th").forEach((el) => el.setAttribute("role", "columnheader"));
  rows.forEach((row) => {
    row.setAttribute("role", "row");
    row.querySelectorAll("td").forEach((el) => el.setAttribute("role", "cell"));
    row.querySelectorAll("th").forEach((el) => el.setAttribute("role", "rowheader"));
  });
  thead.querySelector("tr").setAttribute("role", "row");

  renderTable(false);

  /* ---------- reviews ---------- */

  const notes = document.getElementById("reviewer-notes");
  const withNote = CATALOG.genres.filter((g) => g.reviewer && games.some((game) => game.genre === g.id));
  if (withNote.length) {
    notes.append(...withNote.map((g) => h("li", {}, h("b", { text: S.genreName(g) }), h("span", { text: String(g.reviewer) }))));
  } else {
    notes.hidden = true;
  }

  document.getElementById("reviews").append(
    ...sortGames(games, "score", "desc").map((game) => {
      const genre = genreOf(game);
      const body = h("div", { class: "review-body" });
      body.append(
        h(
          "p",
          { class: "review-meta" },
          genre.reviewKicker ? h("span", { class: "kicker", text: genre.reviewKicker }) : null,
          genre.name ? h("span", { text: genre.name }) : null,
          game.model ? h("span", { class: "model" }, S.swatch(game.model), h("span", { text: game.model })) : null
        ),
        h("h3", {}, S.fitTitle(h("span", { class: "review-title", text: game.title }), game.title), game.subtitle ? h("small", { text: game.subtitle }) : null)
      );
      if (game.verdict) body.append(h("p", { class: "review-verdict", text: "“" + game.verdict + "”" }));
      if (game.review) body.append(h("p", { class: "review-text", text: game.review }));
      if (!game.verdict && !game.review) body.append(h("p", { class: "back-empty", text: "Not yet rated. There is no review of this build yet." }));
      if (game.highlights.length) {
        body.append(h("ul", { class: "marks", "aria-label": "Highlights" }, game.highlights.map((text) => h("li", { text }))));
      }
      body.append(
        h(
          "p",
          { class: "review-links" },
          h("a", { class: "btn btn-play", href: rel(game.url) }, icon("play"), "Play", sr(" " + game.title)),
          h("a", { class: "textlink", href: rel("./#" + encodeURIComponent(game.id)) }, "Details", sr(": " + game.title))
        )
      );
      return paint(h("li", { class: "review" }, h("div", { class: "review-side" }, seal(game), S.thumb(game, "", 160, 100)), body), game);
    })
  );

  /* ---------- method ---------- */

  const briefs = CATALOG.genres.filter((g) => g.brief);
  if (briefs.length) {
    document.getElementById("briefs").append(
      ...briefs.flatMap((g) => {
        const count = games.filter((game) => game.genre === g.id).length;
        return [h("dt", {}, S.genreName(g), h("small", { text: count + (count === 1 ? " build" : " builds") })), h("dd", { text: String(g.brief) })];
      })
    );
  } else {
    document.getElementById("briefs").parentElement.hidden = true;
  }

  const measured = sortGames(games, "score", "desc").filter((g) => g.notes.build || g.notes.cost);
  if (measured.length) {
    // A plain list, all of it in view: the notes say what each build time and cost includes.
    document.getElementById("measures").append(
      ...measured.map((g) =>
        h(
          "li",
          {},
          h("h4", {}, h("span", { text: g.title }), g.model ? h("small", {}, S.swatch(g.model), g.model) : null),
          g.notes.build ? h("p", {}, h("b", { text: "Build time. " }), g.notes.build) : null,
          g.notes.cost ? h("p", {}, h("b", { text: "Cost. " }), g.notes.cost) : null
        )
      )
    );
  } else {
    // No notes to point to, so the sentence in Method that points to them goes as well.
    document.getElementById("measures").hidden = true;
    document.getElementById("notes-pointer").hidden = true;
  }
})();
