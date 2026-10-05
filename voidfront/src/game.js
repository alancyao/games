import {
  SIMULATION_STEP,
  SeededRandom,
  advanceProductionQueue,
  applyDamage,
  canAfford,
  clamp,
  debit,
  distance,
  distanceSquared,
  formationOffsets,
  formatClock,
  hasSupply,
  normalizedDelta,
  placementIsValid,
  stateHash,
  withinDistance,
} from "./core.js?v=6";

const WORLD = Object.freeze({ width: 3000, height: 1900 });
const FOG_SIZE = 100;
const MAX_ACTIVE_ENEMIES = 64;

const TEAM = Object.freeze({
  PLAYER: "player",
  ENEMY: "enemy",
});

const COLORS = Object.freeze({
  player: "#5ee9e1",
  playerDark: "#176e71",
  enemy: "#ff6878",
  enemyDark: "#8d2639",
  red: "#ff4f63",
  amber: "#ffc85e",
  green: "#65f0a7",
  terrain: "#0b1817",
});

const UNIT_DEFS = Object.freeze({
  surveyor: {
    name: "Surveyor",
    short: "SV",
    description: "Autonomous field engineer. Harvests Lumen and assembles structures.",
    cost: { shards: 55 },
    time: 7,
    supply: 1,
    hp: 55,
    speed: 112,
    radius: 12,
    sight: 290,
    range: 58,
    damage: 5,
    cooldown: 0.85,
    worker: true,
    glyph: "◆",
  },
  vanguard: {
    name: "Vanguard",
    short: "VG",
    description: "Fast line infantry with a precise medium-range pulse rifle.",
    cost: { shards: 85 },
    time: 8,
    supply: 1,
    hp: 95,
    speed: 105,
    radius: 13,
    sight: 320,
    range: 175,
    damage: 12,
    cooldown: 0.72,
    glyph: "▲",
  },
  aegis: {
    name: "Aegis",
    short: "AE",
    description: "Combat support unit that restores nearby organic allies.",
    cost: { shards: 125 },
    time: 11,
    supply: 2,
    hp: 85,
    speed: 101,
    radius: 14,
    sight: 310,
    range: 125,
    heal: 11,
    cooldown: 0.65,
    support: true,
    glyph: "+",
  },
  titan: {
    name: "Titan",
    short: "TN",
    description: "Armored siege platform. Its heavy cannon deals splash damage.",
    cost: { shards: 210 },
    time: 15,
    supply: 3,
    hp: 260,
    speed: 68,
    radius: 20,
    sight: 350,
    range: 235,
    damage: 38,
    cooldown: 1.75,
    splash: 48,
    armored: true,
    glyph: "■",
  },
  raider: {
    name: "Ravener",
    short: "RV",
    description: "Fast enemy assault organism.",
    hp: 68,
    speed: 103,
    radius: 13,
    sight: 285,
    range: 42,
    damage: 9,
    cooldown: 0.7,
    melee: true,
    glyph: "⌁",
  },
  stalker: {
    name: "Spineshade",
    short: "SP",
    description: "Enemy ranged skirmisher.",
    hp: 100,
    speed: 82,
    radius: 14,
    sight: 310,
    range: 155,
    damage: 11,
    cooldown: 0.95,
    glyph: "◇",
  },
  crusher: {
    name: "Dreadmaw",
    short: "DM",
    description: "Slow armored siege beast.",
    hp: 350,
    speed: 55,
    radius: 23,
    sight: 330,
    range: 50,
    damage: 28,
    cooldown: 1.28,
    armored: true,
    melee: true,
    glyph: "⬢",
  },
});

const STRUCTURE_DEFS = Object.freeze({
  outpost: {
    name: "Frontier Outpost",
    short: "HQ",
    description: "Command anchor, Lumen drop-off, and Surveyor production center.",
    cost: { shards: 400 },
    time: 40,
    hp: 1450,
    radius: 57,
    sight: 390,
    supply: 12,
    glyph: "⌂",
  },
  relay: {
    name: "Signal Relay",
    short: "RL",
    description: "Extends the uplink network by eight population slots, up to 60.",
    cost: { shards: 110 },
    time: 14,
    hp: 430,
    radius: 32,
    sight: 300,
    supply: 8,
    glyph: "◉",
  },
  garrison: {
    name: "Garrison",
    short: "GR",
    description: "Trains Vanguard infantry and Aegis support units.",
    cost: { shards: 175 },
    time: 21,
    hp: 760,
    radius: 45,
    sight: 330,
    glyph: "▰",
  },
  foundry: {
    name: "Titan Foundry",
    short: "TF",
    description: "Fabricates heavy Titan siege platforms. Requires a Garrison.",
    cost: { shards: 275 },
    time: 28,
    hp: 900,
    radius: 49,
    sight: 340,
    requires: "garrison",
    glyph: "⬡",
  },
  turret: {
    name: "Sentinel Turret",
    short: "ST",
    description: "Automated perimeter defense. Requires a Garrison.",
    cost: { shards: 145 },
    time: 17,
    hp: 480,
    radius: 30,
    sight: 350,
    range: 220,
    damage: 18,
    cooldown: 0.68,
    requires: "garrison",
    glyph: "⌾",
  },
  aegisNode: {
    name: "Aegis Node",
    short: "AN",
    description: "Hostile shield generator protecting the Citadel.",
    hp: 640,
    radius: 43,
    sight: 340,
    range: 190,
    damage: 13,
    cooldown: 0.82,
    objective: true,
    glyph: "✦",
  },
  citadel: {
    name: "Ashen Citadel",
    short: "CT",
    description: "The source of the invasion. Shielded while any Aegis Node remains.",
    hp: 2400,
    radius: 73,
    sight: 430,
    range: 235,
    damage: 21,
    cooldown: 0.76,
    objective: true,
    glyph: "⬟",
  },
});

const DIFFICULTIES = Object.freeze({
  recruit: { label: "Recruit", firstWave: 72, waveInterval: 74, count: 0.78, enemyDamage: 0.82, enemyHp: 0.9, income: 1.08 },
  standard: { label: "Standard", firstWave: 60, waveInterval: 66, count: 1, enemyDamage: 1, enemyHp: 1, income: 1 },
  veteran: { label: "Veteran", firstWave: 48, waveInterval: 56, count: 1.2, enemyDamage: 1.16, enemyHp: 1.12, income: 0.95 },
});

const ACTIONS = Object.freeze({
  move: { id: "move", name: "Move", glyph: "➜", key: "M", kind: "command", mode: "move" },
  attack: { id: "attack", name: "Attack-move", glyph: "⌖", key: "A", kind: "command", mode: "attackMove" },
  stop: { id: "stop", name: "Stop", glyph: "■", key: "S", kind: "instant" },
  hold: { id: "hold", name: "Hold", glyph: "⬡", key: "H", kind: "instant" },
  buildRelay: { id: "buildRelay", name: "Signal Relay", glyph: "◉", key: "Z", kind: "build", type: "relay" },
  buildGarrison: { id: "buildGarrison", name: "Garrison", glyph: "▰", key: "X", kind: "build", type: "garrison" },
  buildFoundry: { id: "buildFoundry", name: "Titan Foundry", glyph: "⬡", key: "C", kind: "build", type: "foundry" },
  buildTurret: { id: "buildTurret", name: "Sentinel", glyph: "⌾", key: "V", kind: "build", type: "turret" },
  trainSurveyor: { id: "trainSurveyor", name: "Surveyor", glyph: "◆", key: "Z", kind: "train", type: "surveyor" },
  trainVanguard: { id: "trainVanguard", name: "Vanguard", glyph: "▲", key: "Z", kind: "train", type: "vanguard" },
  trainAegis: { id: "trainAegis", name: "Aegis", glyph: "+", key: "X", kind: "train", type: "aegis" },
  trainTitan: { id: "trainTitan", name: "Titan", glyph: "■", key: "Z", kind: "train", type: "titan" },
});

const TUTORIAL = Object.freeze([
  { title: "Take command", copy: "Select an allied unit with the primary mouse button.", flag: "selected" },
  { title: "Set a destination", copy: "Right-click open ground, or press M then choose a destination.", flag: "moved" },
  { title: "Secure Lumen", copy: "Select a Surveyor and right-click a glowing Lumen formation.", flag: "gathered" },
  { title: "Establish production", copy: "Select a Surveyor and assemble a Garrison from the command grid.", flag: "garrisonPlaced" },
  { title: "Raise a force", copy: "Select the completed Garrison and train a Vanguard.", flag: "vanguardQueued" },
  { title: "Break the shield", copy: "Destroy both marked Aegis Nodes, then assault the Ashen Citadel.", flag: "complete" },
]);

const dom = {
  shell: document.querySelector("#game-shell"),
  canvas: document.querySelector("#game-canvas"),
  minimap: document.querySelector("#minimap"),
  start: document.querySelector("#start-screen"),
  launch: document.querySelector("#launch-button"),
  pause: document.querySelector("#pause-screen"),
  resume: document.querySelector("#resume-button"),
  restart: document.querySelector("#restart-button"),
  pauseButton: document.querySelector("#pause-button"),
  audioButton: document.querySelector("#audio-button"),
  helpButton: document.querySelector("#help-button"),
  pauseHelpButton: document.querySelector("#pause-help-button"),
  help: document.querySelector("#help-dialog"),
  end: document.querySelector("#end-screen"),
  playAgain: document.querySelector("#play-again-button"),
  endKicker: document.querySelector("#end-kicker"),
  endTitle: document.querySelector("#end-title"),
  endCopy: document.querySelector("#end-copy"),
  endStats: document.querySelector("#end-stats"),
  shards: document.querySelector("#shard-count"),
  supplyUsed: document.querySelector("#supply-used"),
  supplyCap: document.querySelector("#supply-cap"),
  clock: document.querySelector("#game-clock"),
  objective: document.querySelector("#objective-text"),
  objectiveFill: document.querySelector("#objective-progress-fill"),
  missionCard: document.querySelector("#mission-card"),
  missionTitle: document.querySelector("#mission-title"),
  missionCopy: document.querySelector("#mission-copy"),
  missionFill: document.querySelector("#mission-meter-fill"),
  dismissTutorial: document.querySelector("#dismiss-tutorial"),
  alerts: document.querySelector("#alert-stack"),
  targetMode: document.querySelector("#target-mode"),
  targetLabel: document.querySelector("#target-mode-label"),
  cancelTarget: document.querySelector("#cancel-target"),
  selectionPortrait: document.querySelector("#selection-portrait"),
  selectionEyebrow: document.querySelector("#selection-eyebrow"),
  selectionName: document.querySelector("#selection-name"),
  selectionDescription: document.querySelector("#selection-description"),
  selectionHealth: document.querySelector("#selection-health"),
  selectionHealthFill: document.querySelector("#selection-health-fill"),
  selectionHealthText: document.querySelector("#selection-health-text"),
  productionQueue: document.querySelector("#production-queue"),
  roster: document.querySelector("#unit-roster"),
  actions: document.querySelector("#action-grid"),
  contextLabel: document.querySelector("#context-label"),
  tooltip: document.querySelector("#cursor-tooltip"),
  toasts: document.querySelector("#toast-region"),
  ariaStatus: document.querySelector("#aria-status"),
};

class Soundscape {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.lastShot = 0;
  }

  async unlock() {
    if (!this.enabled) return;
    this.context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === "suspended") await this.context.resume();
  }

  tone(frequency, duration = 0.06, volume = 0.025, type = "sine", delay = 0) {
    if (!this.enabled || !this.context || this.context.state !== "running") return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * 0.72), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  ui() { this.tone(680, 0.045, 0.022, "triangle"); }
  order() { this.tone(390, 0.05, 0.018, "sine"); }
  complete() { this.tone(540, 0.08, 0.024, "triangle"); this.tone(810, 0.09, 0.018, "triangle", 0.07); }
  warning() { this.tone(155, 0.14, 0.035, "sawtooth"); this.tone(125, 0.16, 0.03, "sawtooth", 0.15); }
  victory() { [392, 523, 659, 784].forEach((note, index) => this.tone(note, 0.22, 0.025, "triangle", index * 0.11)); }

  shot(heavy = false) {
    const now = performance.now();
    if (now - this.lastShot < 42) return;
    this.lastShot = now;
    this.tone(heavy ? 92 : 220, heavy ? 0.11 : 0.045, heavy ? 0.026 : 0.011, heavy ? "sawtooth" : "square");
  }
}

class VoidfrontGame {
  constructor() {
    this.ctx = dom.canvas.getContext("2d", { alpha: false });
    this.minimapCtx = dom.minimap.getContext("2d");
    this.sound = new Soundscape();
    this.phase = "menu";
    this.autoSimulation = true;
    this.difficultyKey = "standard";
    this.difficulty = DIFFICULTIES.standard;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = 1;
    this.camera = { x: 600, y: 1420, zoom: 1 };
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, inside: false, hasPosition: false };
    this.pointer = null;
    this.keys = new Set();
    this.selected = new Set();
    this.controlGroups = Array.from({ length: 10 }, () => []);
    this.lastGroupTap = { number: -1, time: 0 };
    this.commandMode = null;
    this.placement = null;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.hudTimer = 0;
    this.fogTimer = 0;
    this.minimapTimer = 0;
    this.alertSequence = 0;
    this.actionSignature = "";
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resetState();
    this.bindEvents();
    this.resize();
    requestAnimationFrame((time) => this.frame(time));
  }

  resetState() {
    this.rng = new SeededRandom(0x5f3759df);
    this.entities = [];
    this.nodes = [];
    this.obstacles = [];
    this.terrain = [];
    this.effects = [];
    this.markers = [];
    this.nextId = 1;
    this.time = 0;
    this.wallet = { shards: 430 };
    this.wave = 0;
    this.nextWave = this.difficulty?.firstWave ?? 60;
    this.waveWarned = false;
    this.accumulator = 0;
    this.hudTimer = 0;
    this.fogTimer = 0;
    this.lastShieldNotice = -Infinity;
    this.lastGroupTap = { number: -1, time: 0 };
    this.keys.clear();
    this.pointer = null;
    this.selected.clear();
    this.commandMode = null;
    this.placement = null;
    this.controlGroups = Array.from({ length: 10 }, () => []);
    this.tutorialIndex = 0;
    this.tutorialDismissed = false;
    this.flags = {
      selected: false,
      moved: false,
      gathered: false,
      garrisonPlaced: false,
      vanguardQueued: false,
      complete: false,
    };
    this.stats = { harvested: 0, trained: 0, lost: 0, enemiesDestroyed: 0, structuresBuilt: 0 };
    dom.alerts.replaceChildren();
    dom.toasts.replaceChildren();
    dom.missionCard.classList.remove("hidden");
    dom.pauseButton.classList.remove("active");
    dom.canvas.classList.remove("commanding", "placing");
    dom.targetMode.hidden = true;
    this.fogColumns = Math.ceil(WORLD.width / FOG_SIZE);
    this.fogRows = Math.ceil(WORLD.height / FOG_SIZE);
    this.explored = new Uint8Array(this.fogColumns * this.fogRows);
    this.visible = new Uint8Array(this.fogColumns * this.fogRows);
    this.createWorld();
    this.updateFog(true);
    this.actionSignature = "";
  }

  createWorld() {
    for (let index = 0; index < 170; index += 1) {
      this.terrain.push({
        x: this.rng.between(0, WORLD.width),
        y: this.rng.between(0, WORLD.height),
        radius: this.rng.between(25, 155),
        tone: this.rng.integer(0, 3),
        angle: this.rng.between(0, Math.PI * 2),
      });
    }

    const obstacleData = [
      [1120, 1510, 115], [1320, 1620, 82], [1460, 1320, 95],
      [920, 890, 120], [1130, 810, 74], [1320, 760, 86],
      [1730, 1160, 130], [1940, 1080, 80], [2060, 1280, 100],
      [1850, 470, 95], [1650, 360, 75], [2240, 820, 95],
      [620, 430, 105], [850, 330, 80], [2460, 1390, 90],
    ];
    this.obstacles = obstacleData.map(([x, y, radius], index) => ({ id: `rock-${index}`, x, y, radius, variant: index % 4 }));

    this.addResourceField(520, 1540, 7, 1160);
    this.addResourceField(1420, 1110, 6, 1050);
    this.addResourceField(700, 520, 7, 1250);
    this.addResourceField(2260, 1260, 5, 1300);

    const outpost = this.addStructure("outpost", TEAM.PLAYER, 470, 1370, { complete: true });
    this.addUnit("surveyor", TEAM.PLAYER, 380, 1460);
    this.addUnit("surveyor", TEAM.PLAYER, 435, 1490);
    this.addUnit("surveyor", TEAM.PLAYER, 500, 1495);
    this.addUnit("surveyor", TEAM.PLAYER, 550, 1445);
    this.addUnit("vanguard", TEAM.PLAYER, 540, 1295);
    this.addUnit("vanguard", TEAM.PLAYER, 590, 1335);

    const starterNodes = this.nodes.slice(0, 7);
    this.entities.filter((entity) => entity.type === "surveyor").slice(0, 2).forEach((worker, index) => {
      worker.order = { type: "gather", nodeId: starterNodes[index].id, phase: "toNode", timer: 0 };
    });

    this.addStructure("citadel", TEAM.ENEMY, 2670, 350, { complete: true });
    this.addStructure("aegisNode", TEAM.ENEMY, 2250, 380, { complete: true });
    this.addStructure("aegisNode", TEAM.ENEMY, 2600, 790, { complete: true });
    this.addStructure("turret", TEAM.ENEMY, 2470, 290, { complete: true });
    this.addStructure("turret", TEAM.ENEMY, 2780, 560, { complete: true });
    this.addStructure("turret", TEAM.ENEMY, 2325, 690, { complete: true });

    [
      [2470, 500, "raider"], [2550, 470, "raider"], [2760, 710, "raider"],
      [2190, 520, "stalker"], [2360, 470, "stalker"], [2630, 610, "stalker"],
      [2820, 410, "crusher"],
    ].forEach(([x, y, type]) => {
      const unit = this.addUnit(type, TEAM.ENEMY, x, y, { guardX: x, guardY: y });
      unit.order = { type: "hold" };
    });

    this.camera.x = outpost.x + 100;
    this.camera.y = outpost.y - 30;
  }

  addResourceField(centerX, centerY, count, amount) {
    for (let index = 0; index < count; index += 1) {
      const angle = -0.9 + (index / Math.max(1, count - 1)) * 1.8;
      const spread = 90 + (index % 2) * 32;
      this.nodes.push({
        id: `node-${this.nextId++}`,
        kind: "resource",
        x: centerX + Math.cos(angle) * spread,
        y: centerY + Math.sin(angle) * spread,
        radius: 22,
        amount,
        maxAmount: amount,
        pulse: this.rng.between(0, Math.PI * 2),
      });
    }
  }

  addUnit(type, team, x, y, options = {}) {
    const definition = UNIT_DEFS[type];
    const hpScale = team === TEAM.ENEMY ? this.difficulty.enemyHp : 1;
    const entity = {
      id: this.nextId++,
      kind: "unit",
      type,
      team,
      x,
      y,
      radius: definition.radius,
      hp: Math.round(definition.hp * hpScale),
      maxHp: Math.round(definition.hp * hpScale),
      angle: team === TEAM.PLAYER ? -Math.PI / 2 : Math.PI / 2,
      attackCooldown: this.rng.between(0, 0.25),
      flash: 0,
      dead: false,
      order: { type: "idle" },
      carry: 0,
      carryCapacity: 15,
      guardX: options.guardX ?? x,
      guardY: options.guardY ?? y,
      ...options,
    };
    this.entities.push(entity);
    return entity;
  }

  addStructure(type, team, x, y, options = {}) {
    const definition = STRUCTURE_DEFS[type];
    const hpScale = team === TEAM.ENEMY ? this.difficulty.enemyHp : 1;
    const complete = options.complete ?? false;
    const maxHp = Math.round(definition.hp * hpScale);
    const entity = {
      id: this.nextId++,
      kind: "structure",
      type,
      team,
      x,
      y,
      radius: definition.radius,
      hp: complete ? maxHp : Math.max(1, Math.round(maxHp * 0.12)),
      maxHp,
      complete,
      buildProgress: complete ? 1 : 0,
      builderId: options.builderId ?? null,
      queue: [],
      attackCooldown: 0,
      flash: 0,
      dead: false,
      ...options,
    };
    this.entities.push(entity);
    return entity;
  }

  getEntity(id) {
    return this.entities.find((entity) => entity.id === id && !entity.dead) ?? null;
  }

  definition(entity) {
    return entity.kind === "unit" ? UNIT_DEFS[entity.type] : STRUCTURE_DEFS[entity.type];
  }

  get selectedEntities() {
    return [...this.selected].map((id) => this.getEntity(id)).filter(Boolean);
  }

  get playerUnits() {
    return this.entities.filter((entity) => !entity.dead && entity.team === TEAM.PLAYER && entity.kind === "unit");
  }

  get playerStructures() {
    return this.entities.filter((entity) => !entity.dead && entity.team === TEAM.PLAYER && entity.kind === "structure");
  }

  get supplyCap() {
    return Math.min(60, this.playerStructures
      .filter((structure) => structure.complete)
      .reduce((total, structure) => total + (STRUCTURE_DEFS[structure.type].supply ?? 0), 0));
  }

  get supplyUsed() {
    const active = this.playerUnits.reduce((total, unit) => total + (UNIT_DEFS[unit.type].supply ?? 0), 0);
    const queued = this.playerStructures.reduce((total, structure) => total + structure.queue.reduce((sum, item) => sum + (UNIT_DEFS[item.type].supply ?? 0), 0), 0);
    return active + queued;
  }

  start(difficultyKey = this.difficultyKey) {
    this.difficultyKey = DIFFICULTIES[difficultyKey] ? difficultyKey : "standard";
    this.difficulty = DIFFICULTIES[this.difficultyKey];
    this.resetState();
    this.phase = "playing";
    this.mouse.hasPosition = false;
    this.lastFrame = performance.now();
    dom.shell.classList.remove("is-menu");
    dom.start.classList.remove("active");
    dom.pause.classList.remove("active");
    dom.end.classList.remove("active", "victory", "defeat");
    dom.canvas.focus({ preventScroll: true });
    this.sound.unlock();
    this.alert("Command link online", `${this.difficulty.label} protocol engaged.`, "info");
    this.updateHud(true);
  }

  restart() {
    this.start(this.difficultyKey);
  }

  setPaused(paused) {
    if (this.phase !== "playing" && this.phase !== "paused") return;
    this.phase = paused ? "paused" : "playing";
    dom.pause.classList.toggle("active", paused);
    dom.pauseButton.classList.toggle("active", paused);
    if (!paused) {
      this.lastFrame = performance.now();
      dom.canvas.focus({ preventScroll: true });
    }
  }

  endGame(victory) {
    if (this.phase === "victory" || this.phase === "defeat") return;
    this.phase = victory ? "victory" : "defeat";
    this.cancelMode();
    dom.end.classList.add("active", victory ? "victory" : "defeat");
    dom.end.classList.remove(victory ? "defeat" : "victory");
    dom.endKicker.textContent = victory ? "MISSION COMPLETE" : "COMMAND LINK LOST";
    dom.endTitle.textContent = victory ? "SECTOR SECURED" : "OUTPOST DESTROYED";
    dom.endCopy.textContent = victory
      ? "The Aegis network is broken and the Ashen Citadel has fallen."
      : "The frontier force has been overrun. Rebuild the defense and strike earlier.";
    dom.endStats.innerHTML = [
      [formatClock(this.time), "MISSION TIME"],
      [this.stats.enemiesDestroyed, "HOSTILES CLEARED"],
      [this.stats.harvested, "LUMEN SECURED"],
    ].map(([value, label]) => `<div class="end-stat"><b>${value}</b><span>${label}</span></div>`).join("");
    if (victory) this.sound.victory();
    else this.sound.warning();
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.phase === "playing") this.setPaused(true);
    });

    document.querySelectorAll("[data-difficulty]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-difficulty]").forEach((candidate) => candidate.classList.remove("selected"));
        button.classList.add("selected");
        this.difficultyKey = button.dataset.difficulty;
        this.sound.ui();
      });
    });

    dom.launch.addEventListener("click", () => this.start(this.difficultyKey));
    dom.resume.addEventListener("click", () => this.setPaused(false));
    dom.pauseButton.addEventListener("click", () => this.setPaused(this.phase === "playing"));
    dom.restart.addEventListener("click", () => this.restart());
    dom.playAgain.addEventListener("click", () => this.restart());
    dom.dismissTutorial.addEventListener("click", () => {
      this.tutorialDismissed = true;
      dom.missionCard.classList.add("hidden");
    });
    dom.cancelTarget.addEventListener("click", () => this.cancelMode());

    const openHelp = () => {
      if (this.phase === "playing") this.setPaused(true);
      if (!dom.help.open) dom.help.showModal();
    };
    dom.helpButton.addEventListener("click", openHelp);
    dom.pauseHelpButton.addEventListener("click", openHelp);
    dom.help.addEventListener("close", () => {
      if (this.phase === "paused") dom.pause.classList.add("active");
    });

    dom.audioButton.addEventListener("click", async () => {
      this.sound.enabled = !this.sound.enabled;
      dom.audioButton.textContent = this.sound.enabled ? "◖" : "×";
      dom.audioButton.classList.toggle("active", this.sound.enabled);
      dom.audioButton.setAttribute("aria-label", this.sound.enabled ? "Mute sound" : "Enable sound");
      if (this.sound.enabled) await this.sound.unlock();
    });

    dom.canvas.addEventListener("pointerenter", () => { this.mouse.inside = true; });
    dom.canvas.addEventListener("pointerleave", () => { this.mouse.inside = false; });
    dom.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    dom.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    dom.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
    dom.canvas.addEventListener("pointercancel", () => { this.pointer = null; });
    dom.canvas.addEventListener("dblclick", (event) => this.onDoubleClick(event));
    dom.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.phase !== "playing") return;
      this.updateMouse(event);
      if (this.placement || this.commandMode) this.cancelMode();
      else this.issueContextOrder({ x: this.mouse.worldX, y: this.mouse.worldY });
    });
    dom.canvas.addEventListener("wheel", (event) => {
      if (this.phase !== "playing") return;
      event.preventDefault();
      const before = this.screenToWorld(event.clientX, event.clientY);
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      this.camera.zoom = clamp(this.camera.zoom * factor, 0.65, 1.48);
      const after = this.screenToWorld(event.clientX, event.clientY);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
      this.clampCamera();
    }, { passive: false });

    dom.minimap.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const rect = dom.minimap.getBoundingClientRect();
      this.camera.x = clamp(((event.clientX - rect.left) / rect.width) * WORLD.width, 0, WORLD.width);
      this.camera.y = clamp(((event.clientY - rect.top) / rect.height) * WORLD.height, 0, WORLD.height);
      this.clampCamera();
      this.sound.order();
    });

    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    dom.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    dom.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    dom.canvas.style.width = `${this.width}px`;
    dom.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.clampCamera();
  }

  frame(now) {
    const realDelta = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.phase === "playing" && this.autoSimulation) {
      this.updateCamera(realDelta);
      this.accumulator += realDelta;
      let iterations = 0;
      while (this.accumulator >= SIMULATION_STEP && iterations < 8) {
        this.step(SIMULATION_STEP);
        this.accumulator -= SIMULATION_STEP;
        iterations += 1;
      }
      if (iterations === 8) this.accumulator = 0;
    }
    this.render();
    this.hudTimer -= realDelta;
    if (this.hudTimer <= 0) {
      this.updateHud();
      this.hudTimer = 0.12;
    }
    requestAnimationFrame((time) => this.frame(time));
  }

  step(delta) {
    if (this.phase !== "playing") return;
    this.time += delta;
    this.updateEnemyWaves();
    this.updateConstruction(delta);
    this.updateProduction(delta);
    for (const entity of this.entities) {
      if (entity.dead) continue;
      entity.flash = Math.max(0, entity.flash - delta);
      entity.attackCooldown = Math.max(0, entity.attackCooldown - delta);
      if (entity.kind === "unit") this.updateUnit(entity, delta);
      else if (entity.complete) this.updateCombatStructure(entity, delta);
    }
    this.applySeparation();
    this.updateEffects(delta);
    this.fogTimer -= delta;
    if (this.fogTimer <= 0) {
      this.updateFog();
      this.fogTimer = 0.18;
    }
    this.advanceTutorial();
    this.checkEndConditions();
  }

  updateEnemyWaves() {
    if (!this.waveWarned && this.time >= this.nextWave - 12) {
      this.waveWarned = true;
      this.alert("Hostile surge detected", `Wave ${this.wave + 1} reaches the sector in 12 seconds.`, "danger");
      this.addMarker(2820, 520, "danger", 12);
      this.sound.warning();
    }
    if (this.time < this.nextWave) return;
    this.wave += 1;
    this.waveWarned = false;
    this.spawnWave(this.wave);
    this.nextWave += Math.max(46, this.difficulty.waveInterval - Math.floor(this.wave / 3) * 2);
  }

  spawnWave(waveNumber) {
    const enemyCount = this.entities.filter((entity) => !entity.dead && entity.team === TEAM.ENEMY && entity.kind === "unit").length;
    if (enemyCount >= MAX_ACTIVE_ENEMIES) return;
    const baseRaiders = 3 + Math.floor(waveNumber * 1.25);
    const composition = {
      raider: Math.max(2, Math.round(baseRaiders * this.difficulty.count)),
      stalker: Math.max(0, Math.round(Math.max(0, waveNumber - 1) * 0.8 * this.difficulty.count)),
      crusher: Math.max(0, Math.round(Math.max(0, waveNumber - 2) * 0.35 * this.difficulty.count)),
    };
    const spawnPoints = [{ x: 2860, y: 670 }, { x: 2720, y: 190 }];
    const target = this.entities.find((entity) => !entity.dead && entity.team === TEAM.PLAYER && entity.type === "outpost");
    let offsetIndex = 0;
    for (const [type, count] of Object.entries(composition)) {
      for (let index = 0; index < count && enemyCount + offsetIndex < MAX_ACTIVE_ENEMIES; index += 1) {
        const point = spawnPoints[(index + waveNumber) % spawnPoints.length];
        const unit = this.addUnit(type, TEAM.ENEMY, point.x + this.rng.between(-55, 55), point.y + this.rng.between(-45, 45));
        unit.order = target
          ? { type: "attackMove", x: target.x + this.rng.between(-90, 90), y: target.y + this.rng.between(-90, 90), assault: true }
          : { type: "idle" };
        offsetIndex += 1;
      }
    }
    this.alert(`Wave ${waveNumber} entering sector`, `${offsetIndex} hostile signatures are advancing.`, "danger");
  }

  updateConstruction(delta) {
    for (const structure of this.playerStructures) {
      if (structure.complete || structure.dead) continue;
      const builder = this.getEntity(structure.builderId);
      if (!builder || builder.type !== "surveyor") continue;
      const requiredDistance = structure.radius + builder.radius + 8;
      if (!withinDistance(builder, structure, requiredDistance)) {
        this.moveUnit(builder, structure, delta, requiredDistance);
        continue;
      }
      builder.order = { type: "build", targetId: structure.id };
      const definition = STRUCTURE_DEFS[structure.type];
      structure.buildProgress = clamp(structure.buildProgress + delta / definition.time, 0, 1);
      structure.hp = Math.max(structure.hp, Math.round(structure.maxHp * (0.12 + structure.buildProgress * 0.88)));
      if (structure.buildProgress >= 1) {
        structure.complete = true;
        structure.hp = structure.maxHp;
        structure.builderId = null;
        builder.order = { type: "idle" };
        this.stats.structuresBuilt += 1;
        this.flags.garrisonPlaced ||= structure.type === "garrison";
        this.alert(`${definition.name} online`, "Construction complete.", "info");
        this.sound.complete();
      }
    }
  }

  updateProduction(delta) {
    for (const structure of this.playerStructures) {
      if (!structure.complete || !structure.queue.length) continue;
      const completed = advanceProductionQueue(structure.queue, delta);
      if (!completed) continue;
      const angle = this.rng.between(0, Math.PI * 2);
      const radius = structure.radius + UNIT_DEFS[completed.type].radius + 22;
      const unit = this.addUnit(
        completed.type,
        TEAM.PLAYER,
        clamp(structure.x + Math.cos(angle) * radius, 20, WORLD.width - 20),
        clamp(structure.y + Math.sin(angle) * radius, 20, WORLD.height - 20),
      );
      unit.order = { type: "move", x: structure.x, y: structure.y + structure.radius + 100 };
      this.stats.trained += 1;
      this.alert(`${UNIT_DEFS[completed.type].name} ready`, "Unit awaiting field orders.", "info");
      this.addMarker(unit.x, unit.y, "friendly", 2.5);
      this.sound.complete();
    }
  }

  updateUnit(unit, delta) {
    const definition = UNIT_DEFS[unit.type];
    if (definition.worker && unit.order.type === "gather") {
      this.updateGatherer(unit, delta);
      return;
    }
    if (definition.worker && unit.order.type === "build") {
      const target = this.getEntity(unit.order.targetId);
      if (!target || target.complete) unit.order = { type: "idle" };
      return;
    }

    if (definition.support && unit.order.type !== "move") {
      const patient = this.findHealTarget(unit);
      if (patient) {
        const healDistance = definition.range + patient.radius;
        if (distance(unit, patient) <= healDistance) {
          if (unit.attackCooldown <= 0) {
            patient.hp = Math.min(patient.maxHp, patient.hp + definition.heal);
            unit.attackCooldown = definition.cooldown;
            this.effects.push({ type: "heal", x1: unit.x, y1: unit.y, x2: patient.x, y2: patient.y, life: 0.18, maxLife: 0.18 });
          }
        } else if (unit.order.type !== "hold") {
          this.moveUnit(unit, patient, delta, healDistance - 5);
        }
        return;
      }
    }

    let target = null;
    if (unit.order.type === "attack") target = this.getEntity(unit.order.targetId);
    if (!target && !definition.support && ["idle", "hold", "attackMove"].includes(unit.order.type)) {
      const acquisition = unit.order.type === "hold" ? definition.range + 35 : definition.sight;
      target = this.findNearestEnemy(unit, acquisition);
    }

    if (target) {
      const attackDistance = definition.range + target.radius;
      if (distance(unit, target) <= attackDistance) {
        this.performAttack(unit, target);
      } else if (unit.order.type !== "hold") {
        this.moveUnit(unit, target, delta, attackDistance - 5);
      }
      return;
    }

    if (unit.order.type === "attack" && !target) unit.order = { type: "idle" };
    if (unit.order.type === "move" || unit.order.type === "attackMove") {
      const arrived = this.moveUnit(unit, unit.order, delta, 5);
      if (arrived) unit.order = { type: unit.order.type === "attackMove" ? "hold" : "idle" };
    }
  }

  updateGatherer(worker, delta) {
    const order = worker.order;
    const node = this.nodes.find((candidate) => candidate.id === order.nodeId && candidate.amount > 0);
    if (!node) {
      if (worker.carry > 0) order.phase = "returning";
      else {
        worker.order = { type: "idle" };
        this.toast("That Lumen formation is depleted.");
        return;
      }
    }

    if (order.phase === "toNode") {
      if (!node) return;
      const arrived = this.moveUnit(worker, node, delta, worker.radius + node.radius + 4);
      if (arrived) {
        order.phase = "harvesting";
        order.timer = 0;
      }
      return;
    }

    if (order.phase === "harvesting") {
      order.timer += delta;
      if (order.timer < 1.15) return;
      const amount = Math.min(worker.carryCapacity, node?.amount ?? 0);
      if (node) node.amount -= amount;
      worker.carry = amount;
      order.phase = "returning";
      order.timer = 0;
      return;
    }

    if (order.phase === "returning") {
      const bases = this.playerStructures.filter((structure) => structure.type === "outpost" && structure.complete);
      const base = bases.sort((a, b) => distanceSquared(worker, a) - distanceSquared(worker, b))[0];
      if (!base) {
        worker.order = { type: "idle" };
        return;
      }
      const arrived = this.moveUnit(worker, base, delta, worker.radius + base.radius + 8);
      if (arrived) {
        const income = Math.round(worker.carry * this.difficulty.income);
        this.wallet.shards += income;
        this.stats.harvested += income;
        worker.carry = 0;
        order.phase = node?.amount > 0 ? "toNode" : "idle";
        if (order.phase === "idle") worker.order = { type: "idle" };
      }
    }
  }

  findHealTarget(unit) {
    let best = null;
    let bestScore = Infinity;
    for (const candidate of this.playerUnits) {
      if (candidate.id === unit.id || candidate.type === "aegis" || candidate.type === "titan" || candidate.hp >= candidate.maxHp) continue;
      const separation = distanceSquared(unit, candidate);
      if (separation > UNIT_DEFS[unit.type].sight ** 2) continue;
      const score = separation + (candidate.hp / candidate.maxHp) * 30000;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  updateCombatStructure(structure) {
    const definition = STRUCTURE_DEFS[structure.type];
    if (!definition.damage || structure.attackCooldown > 0) return;
    const target = this.findNearestEnemy(structure, definition.range + 30);
    if (target && distance(structure, target) <= definition.range + target.radius) this.performAttack(structure, target);
  }

  findNearestEnemy(source, maxRange) {
    let closest = null;
    let closestDistance = maxRange * maxRange;
    for (const candidate of this.entities) {
      if (candidate.dead || candidate.team === source.team) continue;
      if (source.team === TEAM.PLAYER && !this.isVisible(candidate.x, candidate.y)) continue;
      const separation = distanceSquared(source, candidate);
      if (separation < closestDistance) {
        closestDistance = separation;
        closest = candidate;
      }
    }
    return closest;
  }

  performAttack(attacker, target) {
    const definition = this.definition(attacker);
    if (attacker.attackCooldown > 0 || !definition.damage) return;
    attacker.attackCooldown = definition.cooldown;
    attacker.angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    const heavy = attacker.type === "titan" || attacker.type === "crusher" || attacker.type === "citadel";
    const damageScale = attacker.team === TEAM.ENEMY ? this.difficulty.enemyDamage : 1;
    const baseDamage = definition.damage * damageScale;
    this.damageEntity(target, baseDamage, attacker);
    if (definition.splash) {
      for (const nearby of this.entities) {
        if (nearby.dead || nearby.id === target.id || nearby.team === attacker.team) continue;
        if (distance(nearby, target) <= definition.splash + nearby.radius) this.damageEntity(nearby, baseDamage * 0.42, attacker);
      }
    }
    this.effects.push({
      type: heavy ? "heavyShot" : "shot",
      team: attacker.team,
      x1: attacker.x,
      y1: attacker.y,
      x2: target.x,
      y2: target.y,
      life: heavy ? 0.22 : 0.12,
      maxLife: heavy ? 0.22 : 0.12,
    });
    if (this.isOnScreen(attacker) || this.isOnScreen(target)) this.sound.shot(heavy);
  }

  damageEntity(target, rawDamage, attacker) {
    if (target.dead) return;
    if (target.type === "citadel" && this.aegisNodesRemaining > 0) {
      this.effects.push({ type: "shield", x: target.x, y: target.y, radius: target.radius + 22, life: 0.34, maxLife: 0.34 });
      if (this.time - (this.lastShieldNotice ?? -10) > 5) {
        this.lastShieldNotice = this.time;
        this.toast("Citadel shield active — destroy both Aegis Nodes.", true);
      }
      return;
    }
    const definition = this.definition(target);
    const armor = definition.armored ? 3 : target.kind === "structure" ? 1 : 0;
    const damage = Math.max(1, Math.round(rawDamage - armor));
    applyDamage(target, damage);
    target.flash = 0.11;
    if (target.dead) this.onDestroyed(target, attacker);
  }

  onDestroyed(entity, attacker) {
    this.selected.delete(entity.id);
    const definition = this.definition(entity);
    if (entity.type === "surveyor") {
      for (const structure of this.playerStructures) {
        if (structure.builderId === entity.id) structure.builderId = null;
      }
    }
    this.effects.push({ type: "explosion", x: entity.x, y: entity.y, radius: entity.radius, life: 0.7, maxLife: 0.7, team: entity.team });
    if (entity.team === TEAM.ENEMY && attacker?.team === TEAM.PLAYER) this.stats.enemiesDestroyed += 1;
    if (entity.team === TEAM.PLAYER && entity.kind === "unit") this.stats.lost += 1;
    if (entity.type === "aegisNode") {
      this.alert("Aegis Node destroyed", this.aegisNodesRemaining ? "One shield generator remains." : "Citadel shield has collapsed.", "warning");
      this.addMarker(entity.x, entity.y, "friendly", 3);
    }
    if (entity.type === "citadel") this.endGame(true);
    if (entity.type === "outpost" && entity.team === TEAM.PLAYER) this.endGame(false);
    if (definition.objective) this.sound.warning();
  }

  get aegisNodesRemaining() {
    return this.entities.filter((entity) => !entity.dead && entity.team === TEAM.ENEMY && entity.type === "aegisNode").length;
  }

  moveUnit(unit, target, delta, stopDistance = 0) {
    const definition = UNIT_DEFS[unit.type];
    const direction = normalizedDelta(unit, target);
    if (direction.length <= stopDistance + 1) return true;
    const travel = Math.min(definition.speed * delta, Math.max(0, direction.length - stopDistance));
    unit.angle = Math.atan2(direction.y, direction.x);
    const desired = {
      x: clamp(unit.x + direction.x * travel, unit.radius, WORLD.width - unit.radius),
      y: clamp(unit.y + direction.y * travel, unit.radius, WORLD.height - unit.radius),
    };
    const collides = (x, y) => {
      for (const obstacle of this.obstacles) {
        const minimum = unit.radius + obstacle.radius + 3;
        const candidateDistance = (x - obstacle.x) ** 2 + (y - obstacle.y) ** 2;
        const currentDistance = (unit.x - obstacle.x) ** 2 + (unit.y - obstacle.y) ** 2;
        if (candidateDistance < minimum ** 2 && (currentDistance >= minimum ** 2 || candidateDistance <= currentDistance)) return true;
      }
      for (const structure of this.entities) {
        if (structure.dead || structure.kind !== "structure" || !structure.complete) continue;
        if (structure.id === target.id) continue;
        const minimum = unit.radius + structure.radius + 3;
        const candidateDistance = (x - structure.x) ** 2 + (y - structure.y) ** 2;
        const currentDistance = (unit.x - structure.x) ** 2 + (unit.y - structure.y) ** 2;
        if (candidateDistance < minimum ** 2 && (currentDistance >= minimum ** 2 || candidateDistance <= currentDistance)) return true;
      }
      return false;
    };
    if (!collides(desired.x, desired.y)) {
      unit.x = desired.x;
      unit.y = desired.y;
    } else if (!collides(desired.x, unit.y)) {
      unit.x = desired.x;
    } else if (!collides(unit.x, desired.y)) {
      unit.y = desired.y;
    } else {
      const side = this.rng.next() > 0.5 ? 1 : -1;
      const tangentX = -direction.y * side;
      const tangentY = direction.x * side;
      const slideX = clamp(unit.x + tangentX * travel * 0.7, unit.radius, WORLD.width - unit.radius);
      const slideY = clamp(unit.y + tangentY * travel * 0.7, unit.radius, WORLD.height - unit.radius);
      if (!collides(slideX, slideY)) {
        unit.x = slideX;
        unit.y = slideY;
      }
    }
    return direction.length - travel <= stopDistance + 2;
  }

  applySeparation() {
    const units = this.entities.filter((entity) => !entity.dead && entity.kind === "unit");
    for (let leftIndex = 0; leftIndex < units.length; leftIndex += 1) {
      const left = units[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < units.length; rightIndex += 1) {
        const right = units[rightIndex];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const minimum = left.radius + right.radius - 2;
        const squared = dx * dx + dy * dy;
        if (squared <= 0.001 || squared >= minimum * minimum) continue;
        const actual = Math.sqrt(squared);
        const push = (minimum - actual) * 0.18;
        const nx = dx / actual;
        const ny = dy / actual;
        left.x = clamp(left.x - nx * push, left.radius, WORLD.width - left.radius);
        left.y = clamp(left.y - ny * push, left.radius, WORLD.height - left.radius);
        right.x = clamp(right.x + nx * push, right.radius, WORLD.width - right.radius);
        right.y = clamp(right.y + ny * push, right.radius, WORLD.height - right.radius);
      }
    }
  }

  updateEffects(delta) {
    for (const effect of this.effects) effect.life -= delta;
    for (const marker of this.markers) marker.life -= delta;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    this.markers = this.markers.filter((marker) => marker.life > 0);
  }

  updateFog(force = false) {
    this.visible.fill(0);
    for (const entity of this.entities) {
      if (entity.dead || entity.team !== TEAM.PLAYER || entity.kind === "structure" && !entity.complete) continue;
      const sight = this.definition(entity).sight ?? 250;
      const minColumn = clamp(Math.floor((entity.x - sight) / FOG_SIZE), 0, this.fogColumns - 1);
      const maxColumn = clamp(Math.floor((entity.x + sight) / FOG_SIZE), 0, this.fogColumns - 1);
      const minRow = clamp(Math.floor((entity.y - sight) / FOG_SIZE), 0, this.fogRows - 1);
      const maxRow = clamp(Math.floor((entity.y + sight) / FOG_SIZE), 0, this.fogRows - 1);
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const tileCenter = { x: (column + 0.5) * FOG_SIZE, y: (row + 0.5) * FOG_SIZE };
          if (distanceSquared(entity, tileCenter) > (sight + FOG_SIZE * 0.75) ** 2) continue;
          const index = row * this.fogColumns + column;
          this.visible[index] = 1;
          this.explored[index] = 1;
        }
      }
    }
    if (force) this.minimapTimer = 0;
  }

  isVisible(x, y) {
    const column = clamp(Math.floor(x / FOG_SIZE), 0, this.fogColumns - 1);
    const row = clamp(Math.floor(y / FOG_SIZE), 0, this.fogRows - 1);
    return this.visible[row * this.fogColumns + column] === 1;
  }

  isExplored(x, y) {
    const column = clamp(Math.floor(x / FOG_SIZE), 0, this.fogColumns - 1);
    const row = clamp(Math.floor(y / FOG_SIZE), 0, this.fogRows - 1);
    return this.explored[row * this.fogColumns + column] === 1;
  }

  checkEndConditions() {
    if (this.phase !== "playing") return;
    const outpost = this.entities.find((entity) => !entity.dead && entity.team === TEAM.PLAYER && entity.type === "outpost");
    if (!outpost) this.endGame(false);
    const citadel = this.entities.find((entity) => !entity.dead && entity.team === TEAM.ENEMY && entity.type === "citadel");
    if (!citadel) this.endGame(true);
  }

  updateCamera(delta) {
    const panSpeed = 620 / this.camera.zoom;
    let horizontal = 0;
    let vertical = 0;
    if (this.keys.has("ArrowLeft")) horizontal -= 1;
    if (this.keys.has("ArrowRight")) horizontal += 1;
    if (this.keys.has("ArrowUp")) vertical -= 1;
    if (this.keys.has("ArrowDown")) vertical += 1;
    if (this.mouse.inside && this.mouse.hasPosition && !this.pointer) {
      const edge = 7;
      if (this.mouse.x <= edge) horizontal -= 0.8;
      if (this.mouse.x >= this.width - edge) horizontal += 0.8;
      if (this.mouse.y <= edge) vertical -= 0.8;
      if (this.mouse.y >= this.height - edge) vertical += 0.8;
    }
    if (horizontal && vertical) {
      horizontal *= Math.SQRT1_2;
      vertical *= Math.SQRT1_2;
    }
    this.camera.x += horizontal * panSpeed * delta;
    this.camera.y += vertical * panSpeed * delta;
    this.clampCamera();
  }

  clampCamera() {
    const halfWidth = Math.min(WORLD.width / 2, this.width / (2 * this.camera.zoom));
    const halfHeight = Math.min(WORLD.height / 2, this.height / (2 * this.camera.zoom));
    this.camera.x = clamp(this.camera.x, halfWidth, WORLD.width - halfWidth);
    this.camera.y = clamp(this.camera.y, halfHeight, WORLD.height - halfHeight);
  }

  screenToWorld(clientX, clientY) {
    const rect = dom.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      x: (x - this.width / 2) / this.camera.zoom + this.camera.x,
      y: (y - this.height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.camera.x) * this.camera.zoom + this.width / 2,
      y: (y - this.camera.y) * this.camera.zoom + this.height / 2,
    };
  }

  updateMouse(event) {
    const rect = dom.canvas.getBoundingClientRect();
    this.mouse.x = event.clientX - rect.left;
    this.mouse.y = event.clientY - rect.top;
    this.mouse.hasPosition = true;
    const world = this.screenToWorld(event.clientX, event.clientY);
    this.mouse.worldX = world.x;
    this.mouse.worldY = world.y;
  }

  onPointerDown(event) {
    if (this.phase !== "playing") return;
    this.updateMouse(event);
    if (event.button === 2) return;
    const world = { x: this.mouse.worldX, y: this.mouse.worldY };
    const hit = this.pickAt(world.x, world.y);
    const touchPan = event.pointerType === "touch" && !hit && !this.placement && !this.commandMode;
    this.pointer = {
      id: event.pointerId,
      button: event.button,
      pointerType: event.pointerType,
      startX: this.mouse.x,
      startY: this.mouse.y,
      lastX: this.mouse.x,
      lastY: this.mouse.y,
      startWorldX: world.x,
      startWorldY: world.y,
      panning: event.button === 1 || touchPan,
      moved: false,
    };
    dom.canvas.setPointerCapture(event.pointerId);
  }

  onPointerMove(event) {
    this.updateMouse(event);
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    const dx = this.mouse.x - this.pointer.lastX;
    const dy = this.mouse.y - this.pointer.lastY;
    if (Math.hypot(this.mouse.x - this.pointer.startX, this.mouse.y - this.pointer.startY) > 6) this.pointer.moved = true;
    if (this.pointer.panning && this.pointer.moved) {
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.clampCamera();
    }
    this.pointer.lastX = this.mouse.x;
    this.pointer.lastY = this.mouse.y;
  }

  onPointerUp(event) {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    this.updateMouse(event);
    const pointer = this.pointer;
    this.pointer = null;
    if (this.phase !== "playing" || pointer.button !== 0) return;

    if (pointer.panning) {
      if (!pointer.moved && pointer.pointerType === "touch") this.handlePrimaryClick(event, true);
      return;
    }

    if (this.placement) {
      this.confirmPlacement(this.mouse.worldX, this.mouse.worldY);
      return;
    }
    if (this.commandMode) {
      this.confirmCommandMode(this.mouse.worldX, this.mouse.worldY);
      return;
    }

    if (pointer.moved) {
      this.selectBox(pointer.startX, pointer.startY, this.mouse.x, this.mouse.y, event.shiftKey);
    } else {
      this.handlePrimaryClick(event, false);
    }
  }

  handlePrimaryClick(event, touch) {
    const hit = this.pickAt(this.mouse.worldX, this.mouse.worldY);
    const hasCommandUnits = this.selectedEntities.some((entity) => entity.team === TEAM.PLAYER && entity.kind === "unit");
    const touchContextTarget = hit && (
      hit.kind === "resource"
      || hit.team === TEAM.ENEMY
      || hit.team === TEAM.PLAYER && hit.kind === "structure" && !hit.complete
    );
    if (touch && hasCommandUnits && touchContextTarget) {
      this.issueContextOrder({ x: this.mouse.worldX, y: this.mouse.worldY });
      return;
    }
    if (touch && !hit && hasCommandUnits) {
      this.issueMove({ x: this.mouse.worldX, y: this.mouse.worldY }, false);
      return;
    }
    if (!hit || hit.kind === "resource") {
      if (!event.shiftKey) this.setSelection([]);
      return;
    }
    if (event.shiftKey) {
      const next = new Set(this.selected);
      if (next.has(hit.id)) next.delete(hit.id);
      else next.add(hit.id);
      this.setSelection([...next]);
    } else {
      this.setSelection([hit.id]);
    }
  }

  onDoubleClick(event) {
    if (this.phase !== "playing") return;
    this.updateMouse(event);
    const hit = this.pickAt(this.mouse.worldX, this.mouse.worldY);
    if (!hit || hit.kind !== "unit" || hit.team !== TEAM.PLAYER) return;
    const visibleIds = this.playerUnits
      .filter((unit) => unit.type === hit.type && this.isOnScreen(unit))
      .map((unit) => unit.id);
    this.setSelection(visibleIds);
  }

  selectBox(startX, startY, endX, endY, additive) {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const ids = this.playerUnits.filter((unit) => {
      const screen = this.worldToScreen(unit.x, unit.y);
      return screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY;
    }).map((unit) => unit.id);
    const next = additive ? new Set([...this.selected, ...ids]) : new Set(ids);
    this.setSelection([...next]);
  }

  setSelection(ids) {
    this.selected = new Set(ids.filter((id) => this.getEntity(id)));
    const selection = this.selectedEntities;
    if (selection.length) {
      this.flags.selected = true;
      const label = selection.length === 1 ? this.definition(selection[0]).name : `${selection.length} units selected`;
      this.announce(label);
      this.sound.ui();
    }
    this.actionSignature = "";
    this.updateHud(true);
  }

  pickAt(x, y) {
    const candidates = [];
    for (const entity of this.entities) {
      if (entity.dead) continue;
      if (entity.team === TEAM.ENEMY && !this.isVisible(entity.x, entity.y)) continue;
      const hitRadius = entity.radius + 8 / this.camera.zoom;
      const separation = (x - entity.x) ** 2 + (y - entity.y) ** 2;
      if (separation <= hitRadius * hitRadius) candidates.push({ entity, separation });
    }
    for (const node of this.nodes) {
      if (node.amount <= 0 || !this.isExplored(node.x, node.y)) continue;
      const hitRadius = node.radius + 10 / this.camera.zoom;
      const separation = (x - node.x) ** 2 + (y - node.y) ** 2;
      if (separation <= hitRadius * hitRadius) candidates.push({ entity: node, separation });
    }
    candidates.sort((left, right) => left.separation - right.separation || (left.entity.kind === "unit" ? -1 : 1));
    return candidates[0]?.entity ?? null;
  }

  issueContextOrder(point) {
    const units = this.selectedEntities.filter((entity) => entity.team === TEAM.PLAYER && entity.kind === "unit");
    if (!units.length) return;
    const target = this.pickAt(point.x, point.y);
    if (target?.team === TEAM.ENEMY) {
      this.issueAttack(target);
      return;
    }
    if (target?.kind === "resource") {
      const workers = units.filter((unit) => UNIT_DEFS[unit.type].worker);
      const others = units.filter((unit) => !UNIT_DEFS[unit.type].worker);
      workers.forEach((worker) => {
        this.releaseBuilder(worker);
        worker.order = { type: "gather", nodeId: target.id, phase: "toNode", timer: 0 };
      });
      if (others.length) this.issueMove(point, false, others);
      if (workers.length) {
        this.flags.gathered = true;
        this.addMarker(target.x, target.y, "resource", 2.2);
        this.sound.order();
        this.announce("Harvest order confirmed");
      }
      return;
    }
    if (target?.team === TEAM.PLAYER && target.kind === "structure" && !target.complete) {
      const worker = units.find((unit) => UNIT_DEFS[unit.type].worker);
      if (worker) {
        this.assignBuilder(worker, target);
        this.sound.order();
        return;
      }
    }
    this.issueMove(point, false, units);
  }

  issueMove(point, attackMove = false, providedUnits = null) {
    const units = providedUnits ?? this.selectedEntities.filter((entity) => entity.team === TEAM.PLAYER && entity.kind === "unit");
    if (!units.length) return;
    const offsets = formationOffsets(units.length, 36);
    units.forEach((unit, index) => {
      this.releaseBuilder(unit);
      unit.order = {
        type: attackMove ? "attackMove" : "move",
        x: clamp(point.x + offsets[index].x, unit.radius, WORLD.width - unit.radius),
        y: clamp(point.y + offsets[index].y, unit.radius, WORLD.height - unit.radius),
      };
    });
    this.flags.moved = true;
    this.addMarker(point.x, point.y, attackMove ? "danger" : "friendly", 1.5);
    this.sound.order();
    this.cancelMode();
  }

  issueAttack(target) {
    const units = this.selectedEntities.filter((entity) => entity.team === TEAM.PLAYER && entity.kind === "unit");
    if (!units.length) return;
    units.forEach((unit) => {
      this.releaseBuilder(unit);
      unit.order = UNIT_DEFS[unit.type].support
        ? { type: "attackMove", x: target.x, y: target.y }
        : { type: "attack", targetId: target.id };
    });
    this.addMarker(target.x, target.y, "danger", 1.8);
    this.sound.order();
    this.cancelMode();
  }

  stopSelected(hold = false) {
    this.selectedEntities.filter((entity) => entity.team === TEAM.PLAYER && entity.kind === "unit").forEach((unit) => {
      this.releaseBuilder(unit);
      unit.order = { type: hold ? "hold" : "idle" };
    });
    this.sound.ui();
  }

  enterCommandMode(mode) {
    this.placement = null;
    this.commandMode = mode;
    dom.canvas.classList.add("commanding");
    dom.canvas.classList.remove("placing");
    dom.targetMode.hidden = false;
    dom.targetLabel.textContent = mode === "attackMove" ? "SELECT ATTACK DESTINATION" : "SELECT MOVE DESTINATION";
    this.actionSignature = "";
  }

  confirmCommandMode(x, y) {
    if (!this.commandMode) return;
    const target = this.pickAt(x, y);
    if (this.commandMode === "attackMove" && target?.team === TEAM.ENEMY) this.issueAttack(target);
    else this.issueMove({ x, y }, this.commandMode === "attackMove");
  }

  enterPlacement(type) {
    const worker = this.selectedEntities.find((entity) => entity.team === TEAM.PLAYER && entity.type === "surveyor");
    if (!worker) return;
    const disabled = this.buildDisabledReason(type);
    if (disabled) {
      this.toast(disabled, true);
      return;
    }
    this.commandMode = null;
    this.placement = { type, workerId: worker.id };
    dom.canvas.classList.add("placing");
    dom.canvas.classList.remove("commanding");
    dom.targetMode.hidden = false;
    dom.targetLabel.textContent = `PLACE ${STRUCTURE_DEFS[type].name.toUpperCase()}`;
    this.actionSignature = "";
  }

  placementStatus(type, x, y) {
    const definition = STRUCTURE_DEFS[type];
    if (!placementIsValid({
      x,
      y,
      radius: definition.radius,
      world: WORLD,
      entities: this.entities,
      obstacles: this.obstacles,
      nodes: this.nodes,
      margin: 18,
    })) return { valid: false, reason: "Placement area is obstructed." };
    const networked = this.playerStructures.some((structure) => structure.complete && distance(structure, { x, y }) <= 720);
    if (!networked) return { valid: false, reason: "Place within uplink range of an allied structure." };
    return { valid: true, reason: "" };
  }

  confirmPlacement(x, y) {
    const placement = this.placement;
    if (!placement) return;
    const worker = this.getEntity(placement.workerId);
    if (!worker) {
      this.cancelMode();
      return;
    }
    const status = this.placementStatus(placement.type, x, y);
    if (!status.valid) {
      this.toast(status.reason, true);
      this.addMarker(x, y, "invalid", 1.1);
      return;
    }
    const definition = STRUCTURE_DEFS[placement.type];
    if (!debit(this.wallet, definition.cost)) {
      this.toast("Insufficient Lumen.", true);
      this.cancelMode();
      return;
    }
    const structure = this.addStructure(placement.type, TEAM.PLAYER, x, y, { builderId: worker.id });
    this.assignBuilder(worker, structure);
    this.flags.garrisonPlaced ||= placement.type === "garrison";
    this.addMarker(x, y, "friendly", 2);
    this.setSelection([structure.id]);
    this.cancelMode();
    this.sound.order();
  }

  releaseBuilder(unit) {
    if (unit?.type !== "surveyor") return;
    const assignment = this.playerStructures.find((structure) => !structure.complete && structure.builderId === unit.id);
    if (assignment) assignment.builderId = null;
  }

  assignBuilder(worker, structure) {
    const previousBuilder = this.getEntity(structure.builderId);
    if (previousBuilder && previousBuilder.id !== worker.id && previousBuilder.order.type === "build" && previousBuilder.order.targetId === structure.id) {
      previousBuilder.order = { type: "idle" };
    }
    this.releaseBuilder(worker);
    structure.builderId = worker.id;
    worker.order = { type: "build", targetId: structure.id };
  }

  cancelMode() {
    this.commandMode = null;
    this.placement = null;
    dom.canvas.classList.remove("commanding", "placing");
    dom.targetMode.hidden = true;
    this.actionSignature = "";
  }

  buildDisabledReason(type) {
    const definition = STRUCTURE_DEFS[type];
    if (definition.requires && !this.playerStructures.some((structure) => structure.type === definition.requires && structure.complete)) {
      return `Requires a completed ${STRUCTURE_DEFS[definition.requires].name}.`;
    }
    if (!canAfford(this.wallet, definition.cost)) return `Requires ${definition.cost.shards} Lumen.`;
    return "";
  }

  queueUnit(structure, type) {
    const definition = UNIT_DEFS[type];
    if (!structure?.complete || structure.queue.length >= 5) {
      this.toast("Production queue is full.", true);
      return;
    }
    if (!canAfford(this.wallet, definition.cost)) {
      this.toast(`Requires ${definition.cost.shards} Lumen.`, true);
      return;
    }
    if (!hasSupply({ supplyUsed: this.supplyUsed, supplyCap: this.supplyCap }, definition.supply)) {
      this.toast("Uplink capacity reached. Build a Signal Relay.", true);
      this.alert("Uplink saturated", "Build a Signal Relay before training more units.", "warning");
      return;
    }
    debit(this.wallet, definition.cost);
    structure.queue.push({ type, remaining: definition.time, total: definition.time });
    this.flags.vanguardQueued ||= type === "vanguard";
    this.sound.ui();
    this.actionSignature = "";
    this.updateHud(true);
  }

  availableActions() {
    const selection = this.selectedEntities;
    if (!selection.length || selection.some((entity) => entity.team !== TEAM.PLAYER)) return [];
    if (selection.length === 1 && selection[0].kind === "structure") {
      const structure = selection[0];
      if (!structure.complete) return [];
      if (structure.type === "outpost") return [ACTIONS.trainSurveyor];
      if (structure.type === "garrison") return [ACTIONS.trainVanguard, ACTIONS.trainAegis];
      if (structure.type === "foundry") return [ACTIONS.trainTitan];
      return [];
    }
    if (!selection.some((entity) => entity.kind === "unit")) return [];
    const actions = [ACTIONS.move, ACTIONS.attack, ACTIONS.stop, ACTIONS.hold];
    if (selection.some((entity) => entity.type === "surveyor")) {
      actions.push(ACTIONS.buildRelay, ACTIONS.buildGarrison, ACTIONS.buildFoundry, ACTIONS.buildTurret);
    }
    return actions;
  }

  actionDisabledReason(action) {
    if (action.kind === "build") return this.buildDisabledReason(action.type);
    if (action.kind === "train") {
      const structure = this.selectedEntities[0];
      const definition = UNIT_DEFS[action.type];
      if (!structure?.complete) return "Structure is not operational.";
      if (structure.queue.length >= 5) return "Queue full.";
      if (!canAfford(this.wallet, definition.cost)) return `Requires ${definition.cost.shards} Lumen.`;
      if (!hasSupply({ supplyUsed: this.supplyUsed, supplyCap: this.supplyCap }, definition.supply)) return "Uplink capacity reached.";
    }
    return "";
  }

  activateAction(action) {
    const reason = this.actionDisabledReason(action);
    if (reason) {
      this.toast(reason, true);
      return;
    }
    if (action.kind === "command") this.enterCommandMode(action.mode);
    else if (action.kind === "instant") this.stopSelected(action.id === "hold");
    else if (action.kind === "build") this.enterPlacement(action.type);
    else if (action.kind === "train") this.queueUnit(this.selectedEntities[0], action.type);
  }

  onKeyDown(event) {
    const code = event.code;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "F1"].includes(code)) event.preventDefault();
    if (code === "F1") {
      dom.helpButton.click();
      return;
    }
    if (this.phase === "menu" && (code === "Enter" || code === "Space")) {
      this.start(this.difficultyKey);
      return;
    }
    if (code === "KeyP") {
      if (this.phase === "playing" || this.phase === "paused") this.setPaused(this.phase === "playing");
      return;
    }
    if (code === "Escape") {
      if (dom.help.open) dom.help.close();
      else if (this.commandMode || this.placement) this.cancelMode();
      else if (this.phase === "playing" || this.phase === "paused") this.setPaused(this.phase === "playing");
      return;
    }
    if (this.phase !== "playing") return;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) this.keys.add(code);

    if (/^Digit[1-9]$/.test(code)) {
      const number = Number(code.slice(-1));
      if (event.ctrlKey || event.metaKey) this.assignControlGroup(number);
      else this.recallControlGroup(number);
      return;
    }

    if (event.repeat) return;
    if (code === "KeyF") {
      this.focusSelection();
      return;
    }
    if (code === "KeyA") {
      if (this.availableActions().some((action) => action.id === "attack")) this.enterCommandMode("attackMove");
      return;
    }
    if (code === "KeyM") {
      if (this.availableActions().some((action) => action.id === "move")) this.enterCommandMode("move");
      return;
    }
    if (code === "KeyS") {
      this.stopSelected(false);
      return;
    }
    if (code === "KeyH") {
      this.stopSelected(true);
      return;
    }
    const key = code.startsWith("Key") ? code.slice(3) : "";
    const action = this.availableActions().find((candidate) => candidate.key === key);
    if (action) this.activateAction(action);
  }

  assignControlGroup(number) {
    this.controlGroups[number] = this.selectedEntities
      .filter((entity) => entity.team === TEAM.PLAYER)
      .map((entity) => entity.id);
    this.toast(`Control group ${number} saved.`);
    this.sound.ui();
  }

  recallControlGroup(number) {
    const ids = this.controlGroups[number].filter((id) => this.getEntity(id));
    if (!ids.length) return;
    const now = performance.now();
    const doubleTap = this.lastGroupTap.number === number && now - this.lastGroupTap.time < 420;
    this.lastGroupTap = { number, time: now };
    this.setSelection(ids);
    if (doubleTap) this.focusSelection();
  }

  focusSelection() {
    const selection = this.selectedEntities;
    if (!selection.length) return;
    this.camera.x = selection.reduce((sum, entity) => sum + entity.x, 0) / selection.length;
    this.camera.y = selection.reduce((sum, entity) => sum + entity.y, 0) / selection.length;
    this.clampCamera();
  }

  advanceTutorial() {
    if (this.tutorialDismissed || this.tutorialIndex >= TUTORIAL.length - 1) return;
    const current = TUTORIAL[this.tutorialIndex];
    if (this.flags[current.flag]) {
      this.tutorialIndex += 1;
      this.updateTutorial();
    }
  }

  updateTutorial() {
    if (this.tutorialDismissed) return;
    const step = TUTORIAL[this.tutorialIndex];
    dom.missionTitle.textContent = step.title;
    dom.missionCopy.textContent = step.copy;
    dom.missionFill.style.width = `${((this.tutorialIndex + 1) / TUTORIAL.length) * 100}%`;
  }

  updateHud(force = false) {
    if (!force && this.phase === "menu") return;
    dom.shards.textContent = Math.floor(this.wallet.shards).toLocaleString();
    dom.supplyUsed.textContent = this.supplyUsed;
    dom.supplyCap.textContent = this.supplyCap;
    dom.clock.textContent = formatClock(this.time);
    const nodes = this.aegisNodesRemaining;
    const citadel = this.entities.find((entity) => !entity.dead && entity.type === "citadel");
    if (nodes > 0) {
      dom.objective.textContent = `Destroy Aegis Nodes · ${2 - nodes}/2 neutralized`;
      dom.objectiveFill.style.width = `${(2 - nodes) * 50}%`;
    } else if (citadel) {
      dom.objective.textContent = "Citadel shield down · destroy the core";
      dom.objectiveFill.style.width = `${(citadel.hp / citadel.maxHp) * 100}%`;
    } else {
      dom.objective.textContent = "Sector secured";
      dom.objectiveFill.style.width = "0%";
    }
    this.updateTutorial();
    this.updateSelectionPanel();
    this.updateActionGrid();
  }

  updateSelectionPanel() {
    const selection = this.selectedEntities;
    dom.productionQueue.replaceChildren();
    dom.roster.replaceChildren();
    if (!selection.length) {
      dom.selectionPortrait.classList.add("empty");
      dom.selectionPortrait.innerHTML = "<span>◇</span>";
      dom.selectionEyebrow.textContent = "NO SELECTION";
      dom.selectionName.textContent = "Awaiting command";
      dom.selectionDescription.textContent = "Select allied units or structures on the battlefield.";
      dom.selectionHealth.hidden = true;
      return;
    }

    const first = selection[0];
    const definition = this.definition(first);
    const friendly = first.team === TEAM.PLAYER;
    dom.selectionPortrait.classList.remove("empty");
    dom.selectionPortrait.innerHTML = `<span style="color:${friendly ? COLORS.player : COLORS.enemy}">${definition.glyph ?? "◆"}</span>`;
    dom.selectionEyebrow.textContent = selection.length > 1 ? `${selection.length} LINKED UNITS` : `${friendly ? "ALLIED" : "HOSTILE"} ${first.kind.toUpperCase()}`;
    dom.selectionName.textContent = selection.length > 1 ? "Task Force" : definition.name;
    dom.selectionDescription.textContent = selection.length > 1
      ? `${selection.filter((entity) => entity.kind === "unit").length} mobile units under unified command.`
      : !first.complete && first.kind === "structure"
        ? `Assembly ${Math.floor(first.buildProgress * 100)}% complete.`
        : definition.description;
    const hp = selection.reduce((sum, entity) => sum + entity.hp, 0);
    const maxHp = selection.reduce((sum, entity) => sum + entity.maxHp, 0);
    dom.selectionHealth.hidden = false;
    dom.selectionHealthFill.style.width = `${(hp / maxHp) * 100}%`;
    dom.selectionHealthText.textContent = `${Math.ceil(hp)} / ${maxHp}`;
    dom.selectionHealthFill.style.background = hp / maxHp < 0.35 ? COLORS.red : hp / maxHp < 0.65 ? COLORS.amber : COLORS.green;

    if (selection.length === 1 && first.queue?.length) {
      first.queue.forEach((item) => {
        const node = document.createElement("div");
        node.className = "queue-item";
        const progress = 1 - item.remaining / item.total;
        node.innerHTML = `<span>${UNIT_DEFS[item.type].glyph}</span><i style="width:${progress * 100}%"></i>`;
        node.title = `${UNIT_DEFS[item.type].name}: ${Math.ceil(item.remaining)} seconds`;
        dom.productionQueue.append(node);
      });
    }

    if (selection.length > 1) {
      selection.slice(0, 12).forEach((entity) => {
        const unit = document.createElement("div");
        unit.className = `roster-unit${entity.hp / entity.maxHp < 0.5 ? " hurt" : ""}`;
        unit.textContent = this.definition(entity).glyph ?? "◆";
        unit.title = this.definition(entity).name;
        dom.roster.append(unit);
      });
    }
  }

  updateActionGrid() {
    const actions = this.availableActions();
    const signature = stateHash({
      actions: actions.map((action) => action.id),
      resources: Math.floor(this.wallet.shards),
      supply: [this.supplyUsed, this.supplyCap],
      mode: this.commandMode,
      placement: this.placement?.type,
      queues: this.selectedEntities.map((entity) => entity.queue?.length ?? 0),
      tech: this.playerStructures.filter((structure) => structure.complete).map((structure) => structure.type).sort(),
    });
    if (signature === this.actionSignature) return;
    this.actionSignature = signature;
    dom.actions.replaceChildren();
    dom.contextLabel.textContent = actions.length ? (this.selectedEntities[0]?.kind === "structure" ? "PRODUCTION" : "FIELD OPS") : "—";
    actions.forEach((action) => {
      const button = document.createElement("button");
      const reason = this.actionDisabledReason(action);
      const definition = action.type ? (UNIT_DEFS[action.type] ?? STRUCTURE_DEFS[action.type]) : null;
      const cost = definition?.cost?.shards;
      const supply = definition?.supply && action.kind === "train" ? ` · ${definition.supply} UP` : "";
      button.type = "button";
      button.className = `action-button${this.commandMode === action.mode || this.placement?.type === action.type ? " active" : ""}`;
      button.disabled = Boolean(reason);
      button.title = reason || `${action.name}${cost ? ` · ${cost} Lumen` : ""}${action.key ? ` · ${action.key}` : ""}`;
      button.innerHTML = `<span class="action-glyph">${action.glyph}</span><span class="action-name">${action.name}</span><span class="action-meta">${cost ? `${cost} LM${supply}` : action.kind === "command" ? "TARGET" : "IMMEDIATE"}</span><span class="action-key">${action.key ?? ""}</span>`;
      button.addEventListener("click", () => this.activateAction(action));
      dom.actions.append(button);
    });
  }

  alert(title, copy, priority = "info") {
    const id = ++this.alertSequence;
    const alert = document.createElement("div");
    alert.className = `battle-alert ${priority}`;
    alert.dataset.alertId = id;
    alert.innerHTML = `<i>${priority === "danger" ? "!" : priority === "warning" ? "△" : "•"}</i><div><strong>${title}</strong><span>${copy}</span></div>`;
    dom.alerts.prepend(alert);
    while (dom.alerts.children.length > 4) dom.alerts.lastElementChild.remove();
    this.announce(`${title}. ${copy}`);
    window.setTimeout(() => alert.remove(), priority === "danger" ? 6000 : 4200);
  }

  toast(message, error = false) {
    const toast = document.createElement("div");
    toast.className = `toast${error ? " error" : ""}`;
    toast.textContent = message;
    dom.toasts.append(toast);
    this.announce(message);
    window.setTimeout(() => toast.remove(), 2400);
  }

  announce(message) {
    dom.ariaStatus.textContent = "";
    window.setTimeout(() => { dom.ariaStatus.textContent = message; }, 10);
  }

  addMarker(x, y, kind, life = 1.5) {
    this.markers.push({ x, y, kind, life, maxLife: life });
  }

  isOnScreen(entity, padding = 120) {
    const screen = this.worldToScreen(entity.x, entity.y);
    return screen.x >= -padding && screen.y >= -padding && screen.x <= this.width + padding && screen.y <= this.height + padding;
  }

  snapshot() {
    const alive = this.entities.filter((entity) => !entity.dead);
    const simulation = {
      rngState: this.rng.state,
      nodes: this.nodes.map((node) => ({ id: node.id, amount: Math.round(node.amount) })),
      entities: alive.map((entity) => ({
        id: entity.id,
        team: entity.team,
        kind: entity.kind,
        type: entity.type,
        x: Number(entity.x.toFixed(2)),
        y: Number(entity.y.toFixed(2)),
        hp: Number(entity.hp.toFixed(2)),
        complete: entity.complete,
        buildProgress: entity.buildProgress == null ? undefined : Number(entity.buildProgress.toFixed(4)),
        order: entity.order?.type ?? null,
        targetId: entity.order?.targetId ?? null,
        queue: entity.queue?.map((item) => ({ type: item.type, remaining: Number(item.remaining.toFixed(3)) })) ?? [],
      })),
    };
    const snapshot = {
      phase: this.phase,
      difficulty: this.difficultyKey,
      time: Number(this.time.toFixed(3)),
      resources: Math.floor(this.wallet.shards),
      supplyUsed: this.supplyUsed,
      supplyCap: this.supplyCap,
      wave: this.wave,
      nextWave: Number(this.nextWave.toFixed(2)),
      aegisNodesRemaining: this.aegisNodesRemaining,
      selected: [...this.selected],
      playerUnits: alive.filter((entity) => entity.team === TEAM.PLAYER && entity.kind === "unit").length,
      playerStructures: alive.filter((entity) => entity.team === TEAM.PLAYER && entity.kind === "structure").length,
      enemyUnits: alive.filter((entity) => entity.team === TEAM.ENEMY && entity.kind === "unit").length,
      enemyStructures: alive.filter((entity) => entity.team === TEAM.ENEMY && entity.kind === "structure").length,
      stats: { ...this.stats },
      camera: { x: Math.round(this.camera.x), y: Math.round(this.camera.y), zoom: Number(this.camera.zoom.toFixed(2)) },
      simulation,
    };
    return { ...snapshot, hash: stateHash(snapshot) };
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#071110";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawTerrain(ctx);
    this.drawCommandPaths(ctx);
    const visibleEntities = this.entities
      .filter((entity) => !entity.dead && (entity.team === TEAM.PLAYER || this.isVisible(entity.x, entity.y)))
      .sort((left, right) => left.y - right.y || (left.kind === "structure" ? -1 : 1));
    for (const entity of visibleEntities) {
      if (entity.kind === "structure") this.drawStructure(ctx, entity);
      else this.drawUnit(ctx, entity);
    }
    this.drawEffects(ctx);
    this.drawFog(ctx);
    this.drawMarkers(ctx);
    this.drawPlacement(ctx);
    ctx.restore();

    this.drawObjectivePointers(ctx);
    this.drawSelectionBox(ctx);
    const vignette = ctx.createRadialGradient(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.2, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,4,7,.46)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawMinimap();
  }

  visibleWorldBounds(padding = 100) {
    const halfWidth = this.width / (2 * this.camera.zoom) + padding;
    const halfHeight = this.height / (2 * this.camera.zoom) + padding;
    return {
      left: this.camera.x - halfWidth,
      right: this.camera.x + halfWidth,
      top: this.camera.y - halfHeight,
      bottom: this.camera.y + halfHeight,
    };
  }

  drawTerrain(ctx) {
    ctx.fillStyle = "#0a1715";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    const bounds = this.visibleWorldBounds(180);

    ctx.save();
    ctx.strokeStyle = "rgba(85,147,132,.075)";
    ctx.lineWidth = 1;
    const grid = 80;
    for (let x = Math.max(0, Math.floor(bounds.left / grid) * grid); x <= Math.min(WORLD.width, bounds.right); x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, bounds.top));
      ctx.lineTo(x, Math.min(WORLD.height, bounds.bottom));
      ctx.stroke();
    }
    for (let y = Math.max(0, Math.floor(bounds.top / grid) * grid); y <= Math.min(WORLD.height, bounds.bottom); y += grid) {
      ctx.beginPath();
      ctx.moveTo(Math.max(0, bounds.left), y);
      ctx.lineTo(Math.min(WORLD.width, bounds.right), y);
      ctx.stroke();
    }
    ctx.restore();

    for (const patch of this.terrain) {
      if (patch.x + patch.radius < bounds.left || patch.x - patch.radius > bounds.right || patch.y + patch.radius < bounds.top || patch.y - patch.radius > bounds.bottom) continue;
      ctx.save();
      ctx.translate(patch.x, patch.y);
      ctx.rotate(patch.angle);
      const tones = ["rgba(37,78,61,.16)", "rgba(91,71,44,.11)", "rgba(24,85,81,.11)", "rgba(77,45,49,.09)"];
      ctx.fillStyle = tones[patch.tone];
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.radius, patch.radius * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(86,115,91,.09)";
    ctx.lineWidth = 90;
    ctx.beginPath();
    ctx.moveTo(470, 1370);
    ctx.bezierCurveTo(980, 1250, 1650, 930, 2670, 350);
    ctx.stroke();
    ctx.strokeStyle = "rgba(151,169,133,.07)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 22]);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(94,233,225,.25)";
    ctx.lineWidth = 5;
    ctx.strokeRect(2, 2, WORLD.width - 4, WORLD.height - 4);
    ctx.strokeStyle = "rgba(94,233,225,.08)";
    ctx.lineWidth = 18;
    ctx.strokeRect(12, 12, WORLD.width - 24, WORLD.height - 24);

    for (const obstacle of this.obstacles) {
      if (obstacle.x + obstacle.radius < bounds.left || obstacle.x - obstacle.radius > bounds.right || obstacle.y + obstacle.radius < bounds.top || obstacle.y - obstacle.radius > bounds.bottom) continue;
      this.drawObstacle(ctx, obstacle);
    }
    for (const node of this.nodes) {
      if (node.amount <= 0 || !this.isExplored(node.x, node.y)) continue;
      if (node.x + node.radius < bounds.left || node.x - node.radius > bounds.right || node.y + node.radius < bounds.top || node.y - node.radius > bounds.bottom) continue;
      this.drawResourceNode(ctx, node);
    }
  }

  drawObstacle(ctx, obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(8, 13, obstacle.radius * 1.04, obstacle.radius * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    const gradient = ctx.createRadialGradient(-obstacle.radius * 0.3, -obstacle.radius * 0.4, 4, 0, 0, obstacle.radius);
    gradient.addColorStop(0, "#31433a");
    gradient.addColorStop(0.55, "#1c2925");
    gradient.addColorStop(1, "#0c1413");
    ctx.fillStyle = gradient;
    this.polygonPath(ctx, 7 + obstacle.variant % 2, obstacle.radius, obstacle.variant * 0.42);
    ctx.fill();
    ctx.strokeStyle = "rgba(126,158,129,.14)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.24)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-obstacle.radius * 0.45, -obstacle.radius * 0.15);
    ctx.lineTo(0, obstacle.radius * 0.1);
    ctx.lineTo(obstacle.radius * 0.35, -obstacle.radius * 0.28);
    ctx.stroke();
    ctx.restore();
  }

  drawResourceNode(ctx, node) {
    const depleted = node.amount / node.maxAmount;
    const pulse = 0.5 + Math.sin(this.time * 2.8 + node.pulse) * 0.18;
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.globalAlpha = this.isVisible(node.x, node.y) ? 1 : 0.45;
    ctx.fillStyle = `rgba(67,240,226,${0.08 + pulse * 0.11})`;
    ctx.beginPath();
    ctx.arc(0, 0, node.radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    const crystals = Math.max(1, Math.ceil(depleted * 4));
    for (let index = 0; index < crystals; index += 1) {
      const x = (index - (crystals - 1) / 2) * 9;
      const height = 25 + ((index * 11) % 15);
      const gradient = ctx.createLinearGradient(x, -height, x + 8, 6);
      gradient.addColorStop(0, "#dfffff");
      gradient.addColorStop(0.2, "#64f5e8");
      gradient.addColorStop(1, "#11606a");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x, -height);
      ctx.lineTo(x + 7, -5);
      ctx.lineTo(x + 3, 8);
      ctx.lineTo(x - 5, 4);
      ctx.lineTo(x - 7, -7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(4,16,18,.72)";
    ctx.fillRect(-24, 16, 48, 4);
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(-24, 16, 48 * depleted, 4);
    ctx.restore();
  }

  drawCommandPaths(ctx) {
    ctx.save();
    ctx.setLineDash([7, 10]);
    ctx.lineWidth = 1.5;
    for (const unit of this.selectedEntities) {
      if (unit.kind !== "unit") continue;
      if (!["move", "attackMove"].includes(unit.order.type)) continue;
      ctx.strokeStyle = unit.order.type === "attackMove" ? "rgba(255,104,120,.5)" : "rgba(94,233,225,.42)";
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      ctx.lineTo(unit.order.x, unit.order.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStructure(ctx, structure) {
    const definition = STRUCTURE_DEFS[structure.type];
    const color = structure.team === TEAM.PLAYER ? COLORS.player : COLORS.enemy;
    const dark = structure.team === TEAM.PLAYER ? COLORS.playerDark : COLORS.enemyDark;
    const selected = this.selected.has(structure.id);
    ctx.save();
    ctx.translate(structure.x, structure.y);
    ctx.fillStyle = "rgba(0,0,0,.38)";
    ctx.beginPath();
    ctx.ellipse(8, structure.radius * 0.43, structure.radius * 1.07, structure.radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, structure.radius + 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!structure.complete) {
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      this.polygonPath(ctx, 6, structure.radius, Math.PI / 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `${dark}77`;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      for (let offset = -structure.radius * 0.7; offset <= structure.radius * 0.7; offset += 13) {
        ctx.beginPath();
        ctx.moveTo(offset, -structure.radius * 0.65);
        ctx.lineTo(offset, structure.radius * 0.65);
        ctx.stroke();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, structure.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * structure.buildProgress);
      ctx.stroke();
      ctx.restore();
      this.drawHealthBar(ctx, structure);
      return;
    }

    if (structure.type === "outpost") {
      ctx.fillStyle = dark;
      this.polygonPath(ctx, 8, 54, Math.PI / 8);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let index = 0; index < 4; index += 1) {
        ctx.save();
        ctx.rotate(index * Math.PI / 2);
        ctx.fillStyle = "#18323a";
        ctx.fillRect(-14, -53, 28, 23);
        ctx.strokeStyle = "rgba(255,255,255,.16)";
        ctx.strokeRect(-14, -53, 28, 23);
        ctx.restore();
      }
      const core = ctx.createRadialGradient(-5, -7, 2, 0, 0, 27);
      core.addColorStop(0, "#dfffff");
      core.addColorStop(0.25, color);
      core.addColorStop(1, "#0d2930");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.38)";
      ctx.stroke();
      ctx.rotate(this.time * 0.25);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0.1, 1.35);
      ctx.arc(0, 0, 36, Math.PI + 0.1, Math.PI + 1.35);
      ctx.stroke();
    } else if (structure.type === "relay") {
      ctx.fillStyle = "#132a31";
      this.polygonPath(ctx, 6, 29, Math.PI / 6);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.fillRect(-7, -42, 14, 47);
      ctx.strokeStyle = color;
      ctx.strokeRect(-7, -42, 14, 47);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -47, 7 + Math.sin(this.time * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `${color}66`;
      ctx.beginPath();
      ctx.arc(0, -47, 16 + (this.time * 10) % 16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (structure.type === "garrison") {
      ctx.fillStyle = "#182d32";
      ctx.fillRect(-40, -31, 80, 62);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-40, -31, 80, 62);
      ctx.fillStyle = dark;
      ctx.fillRect(-50, -19, 14, 38);
      ctx.fillRect(36, -19, 14, 38);
      ctx.fillStyle = "#071418";
      ctx.fillRect(-17, 6, 34, 25);
      ctx.strokeStyle = "rgba(255,255,255,.2)";
      for (let x = -28; x <= 28; x += 14) ctx.strokeRect(x, -20, 9, 9);
      ctx.fillStyle = color;
      ctx.fillRect(-28, -33, 56, 3);
    } else if (structure.type === "foundry") {
      ctx.fillStyle = "#152b31";
      this.polygonPath(ctx, 6, 47, Math.PI / 6);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.setLineDash([8, 5]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 34, this.time * 0.25, this.time * 0.25 + Math.PI * 1.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#081216";
      ctx.fillRect(-13, -13, 26, 26);
      ctx.strokeStyle = "rgba(255,255,255,.3)";
      ctx.strokeRect(-13, -13, 26, 26);
    } else if (structure.type === "turret") {
      ctx.fillStyle = "#152b31";
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.rotate(structure.angle ?? -Math.PI / 2);
      ctx.fillStyle = dark;
      ctx.fillRect(-10, -10, 35, 20);
      ctx.strokeStyle = color;
      ctx.strokeRect(-10, -10, 35, 20);
      ctx.fillStyle = color;
      ctx.fillRect(20, -3, 18, 6);
    } else if (structure.type === "aegisNode") {
      ctx.fillStyle = "#301721";
      this.polygonPath(ctx, 6, 42, Math.PI / 6);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.rotate(this.time * 0.4);
      ctx.strokeStyle = `${color}aa`;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, 51, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.rotate(-this.time * 0.4);
      const crystal = ctx.createLinearGradient(-10, -35, 12, 30);
      crystal.addColorStop(0, "#ffdce3");
      crystal.addColorStop(0.25, color);
      crystal.addColorStop(1, dark);
      ctx.fillStyle = crystal;
      ctx.beginPath();
      ctx.moveTo(0, -42);
      ctx.lineTo(17, -5);
      ctx.lineTo(10, 28);
      ctx.lineTo(-13, 26);
      ctx.lineTo(-18, -7);
      ctx.closePath();
      ctx.fill();
    } else if (structure.type === "citadel") {
      ctx.fillStyle = "#28151d";
      this.polygonPath(ctx, 8, 70, Math.PI / 8);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let index = 0; index < 4; index += 1) {
        ctx.save();
        ctx.rotate(index * Math.PI / 2 + this.time * 0.08);
        ctx.fillStyle = "#461c29";
        ctx.beginPath();
        ctx.moveTo(-13, -37);
        ctx.lineTo(13, -37);
        ctx.lineTo(7, -75);
        ctx.lineTo(-7, -75);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `${color}88`;
        ctx.stroke();
        ctx.restore();
      }
      const core = ctx.createRadialGradient(-5, -8, 2, 0, 0, 37);
      core.addColorStop(0, "#fff2f4");
      core.addColorStop(0.17, color);
      core.addColorStop(0.65, "#651c31");
      core.addColorStop(1, "#160a10");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 36 + Math.sin(this.time * 2) * 2, 0, Math.PI * 2);
      ctx.fill();
      if (this.aegisNodesRemaining > 0) {
        ctx.strokeStyle = "rgba(255,172,192,.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 86 + Math.sin(this.time * 2.8) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (structure.flash > 0) {
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255,255,255,${structure.flash * 4})`;
      ctx.beginPath();
      ctx.arc(0, 0, structure.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.drawHealthBar(ctx, structure);
  }

  drawUnit(ctx, unit) {
    const definition = UNIT_DEFS[unit.type];
    const color = unit.team === TEAM.PLAYER ? COLORS.player : COLORS.enemy;
    const dark = unit.team === TEAM.PLAYER ? COLORS.playerDark : COLORS.enemyDark;
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.fillStyle = "rgba(0,0,0,.34)";
    ctx.beginPath();
    ctx.ellipse(5, unit.radius * 0.58, unit.radius * 1.18, unit.radius * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.selected.has(unit.id)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 3, unit.radius + 7, unit.radius + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `${color}22`;
      ctx.fill();
    }
    ctx.rotate(unit.angle);
    ctx.fillStyle = dark;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;

    if (unit.type === "surveyor") {
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(2, 9);
      ctx.lineTo(-11, 5);
      ctx.lineTo(-8, -6);
      ctx.lineTo(2, -9);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-3, -3, 7, 6);
      ctx.strokeStyle = `${color}aa`;
      ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(-14, -11); ctx.moveTo(-7, 5); ctx.lineTo(-14, 11); ctx.stroke();
    } else if (unit.type === "vanguard") {
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(-9, 10); ctx.lineTo(-5, 0); ctx.lineTo(-9, -10); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(0, -2, 17, 4);
      ctx.fillStyle = "#9feeea";
      ctx.beginPath(); ctx.arc(-3, 0, 3, 0, Math.PI * 2); ctx.fill();
    } else if (unit.type === "aegis") {
      this.polygonPath(ctx, 6, 13, Math.PI / 6);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
      ctx.strokeStyle = `${color}66`;
      ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(this.time * 3) * 1.5, 0, Math.PI * 2); ctx.stroke();
    } else if (unit.type === "titan") {
      ctx.fillRect(-17, -15, 31, 30);
      ctx.strokeRect(-17, -15, 31, 30);
      ctx.fillStyle = "#0b171c";
      ctx.fillRect(-19, -18, 26, 6); ctx.fillRect(-19, 12, 26, 6);
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(2, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(4, -3, 25, 6);
    } else if (unit.type === "raider") {
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(2, 7); ctx.lineTo(-13, 12); ctx.lineTo(-6, 1); ctx.lineTo(-13, -12); ctx.lineTo(2, -7); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(4, 0, 3, 0, Math.PI * 2); ctx.fill();
    } else if (unit.type === "stalker") {
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(0, 13); ctx.lineTo(-13, 0); ctx.lineTo(0, -13); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = `${color}aa`;
      ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(-14, -16); ctx.moveTo(-5, 8); ctx.lineTo(-14, 16); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(4, 0, 3, 0, Math.PI * 2); ctx.fill();
    } else if (unit.type === "crusher") {
      this.polygonPath(ctx, 6, 21, 0);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4d1b29";
      ctx.beginPath(); ctx.arc(4, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(5, -17); ctx.lineTo(24, -8); ctx.moveTo(5, 17); ctx.lineTo(24, 8); ctx.stroke();
    }

    if (unit.flash > 0) {
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255,255,255,${unit.flash * 5})`;
      ctx.beginPath(); ctx.arc(0, 0, unit.radius + 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (unit.carry > 0) {
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y - unit.radius - 12);
      ctx.lineTo(unit.x + 5, unit.y - unit.radius - 5);
      ctx.lineTo(unit.x, unit.y - unit.radius);
      ctx.lineTo(unit.x - 5, unit.y - unit.radius - 5);
      ctx.closePath();
      ctx.fill();
    }
    this.drawHealthBar(ctx, unit);
  }

  drawHealthBar(ctx, entity) {
    if (!this.selected.has(entity.id) && entity.hp >= entity.maxHp && entity.flash <= 0) return;
    const width = Math.max(28, entity.radius * 1.65);
    const y = entity.y - entity.radius - 15;
    const ratio = clamp(entity.hp / entity.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fillRect(entity.x - width / 2 - 1, y - 1, width + 2, 6);
    ctx.fillStyle = ratio < 0.33 ? COLORS.red : ratio < 0.62 ? COLORS.amber : COLORS.green;
    ctx.fillRect(entity.x - width / 2, y, width * ratio, 4);
  }

  drawEffects(ctx) {
    for (const effect of this.effects) {
      const progress = 1 - effect.life / effect.maxLife;
      const alpha = clamp(effect.life / effect.maxLife, 0, 1);
      if (effect.type === "shot" || effect.type === "heavyShot") {
        const color = effect.team === TEAM.PLAYER ? COLORS.player : COLORS.enemy;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = effect.type === "heavyShot" ? 5 : 2;
        ctx.shadowBlur = effect.type === "heavyShot" ? 18 : 8;
        ctx.shadowColor = color;
        const headX = effect.x1 + (effect.x2 - effect.x1) * clamp(progress * 1.8, 0, 1);
        const headY = effect.y1 + (effect.y2 - effect.y1) * clamp(progress * 1.8, 0, 1);
        ctx.beginPath(); ctx.moveTo(effect.x1, effect.y1); ctx.lineTo(headX, headY); ctx.stroke();
        ctx.restore();
      } else if (effect.type === "heal") {
        ctx.save();
        ctx.strokeStyle = `rgba(101,240,167,${alpha})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(effect.x1, effect.y1); ctx.lineTo(effect.x2, effect.y2); ctx.stroke();
        ctx.restore();
      } else if (effect.type === "explosion") {
        ctx.save();
        ctx.globalAlpha = alpha;
        const color = effect.team === TEAM.PLAYER ? COLORS.player : COLORS.enemy;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5 * alpha;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (0.4 + progress * 1.9), 0, Math.PI * 2); ctx.stroke();
        for (let index = 0; index < 9; index += 1) {
          const angle = index * Math.PI * 2 / 9 + effect.radius;
          const travel = effect.radius * progress * (1.1 + (index % 3) * 0.3);
          ctx.fillStyle = index % 2 ? color : COLORS.amber;
          ctx.beginPath();
          ctx.arc(effect.x + Math.cos(angle) * travel, effect.y + Math.sin(angle) * travel, 4 * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (effect.type === "shield") {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#ff9eb7";
        ctx.lineWidth = 6 * alpha;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius + progress * 18, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawFog(ctx) {
    const bounds = this.visibleWorldBounds(FOG_SIZE);
    const minColumn = clamp(Math.floor(bounds.left / FOG_SIZE), 0, this.fogColumns - 1);
    const maxColumn = clamp(Math.ceil(bounds.right / FOG_SIZE), 0, this.fogColumns - 1);
    const minRow = clamp(Math.floor(bounds.top / FOG_SIZE), 0, this.fogRows - 1);
    const maxRow = clamp(Math.ceil(bounds.bottom / FOG_SIZE), 0, this.fogRows - 1);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const index = row * this.fogColumns + column;
        if (this.visible[index]) continue;
        ctx.fillStyle = this.explored[index] ? "rgba(2,8,10,.59)" : "rgba(1,4,7,.94)";
        ctx.fillRect(column * FOG_SIZE - 1, row * FOG_SIZE - 1, FOG_SIZE + 2, FOG_SIZE + 2);
      }
    }
  }

  drawMarkers(ctx) {
    for (const marker of this.markers) {
      const progress = 1 - marker.life / marker.maxLife;
      const alpha = clamp(marker.life / Math.min(marker.maxLife, 0.7), 0, 1);
      const color = marker.kind === "danger" || marker.kind === "invalid" ? COLORS.red : marker.kind === "resource" ? COLORS.amber : COLORS.player;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 9 + progress * 28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(marker.x - 8, marker.y); ctx.lineTo(marker.x + 8, marker.y); ctx.moveTo(marker.x, marker.y - 8); ctx.lineTo(marker.x, marker.y + 8); ctx.stroke();
      ctx.restore();
    }
  }

  drawPlacement(ctx) {
    if (!this.placement || this.phase !== "playing") return;
    const definition = STRUCTURE_DEFS[this.placement.type];
    const status = this.placementStatus(this.placement.type, this.mouse.worldX, this.mouse.worldY);
    const color = status.valid ? COLORS.green : COLORS.red;
    ctx.save();
    ctx.translate(this.mouse.worldX, this.mouse.worldY);
    ctx.globalAlpha = 0.64;
    ctx.fillStyle = `${color}33`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    this.polygonPath(ctx, 6, definition.radius, Math.PI / 6);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, definition.radius + 15, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "700 11px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText(status.valid ? definition.name.toUpperCase() : status.reason.toUpperCase(), 0, definition.radius + 36);
    ctx.restore();
  }

  drawObjectivePointers(ctx) {
    if (this.phase === "menu") return;
    const objectives = this.entities.filter((entity) => !entity.dead && entity.team === TEAM.ENEMY && ["aegisNode", "citadel"].includes(entity.type));
    for (const objective of objectives) {
      if (objective.type === "citadel" && this.aegisNodesRemaining > 0) continue;
      const screen = this.worldToScreen(objective.x, objective.y);
      const marginX = 82;
      const marginTop = 92;
      const marginBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hud-height"), 10) + 35 || 205;
      const onScreen = screen.x > marginX && screen.x < this.width - marginX && screen.y > marginTop && screen.y < this.height - marginBottom;
      const x = clamp(screen.x, marginX, this.width - marginX);
      const y = clamp(screen.y, marginTop, this.height - marginBottom);
      const color = COLORS.red;
      ctx.save();
      ctx.translate(x, y);
      if (!onScreen) {
        const angle = Math.atan2(screen.y - y, screen.x - x);
        ctx.rotate(angle);
        ctx.fillStyle = "rgba(4,10,14,.85)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-8, 9); ctx.lineTo(-5, 0); ctx.lineTo(-8, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.rotate(-angle);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 12 + Math.sin(this.time * 3) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "rgba(3,9,13,.88)";
      ctx.fillRect(-48, 17, 96, 18);
      ctx.fillStyle = "#ffc3ca";
      ctx.font = "800 8px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText(STRUCTURE_DEFS[objective.type].name.toUpperCase(), 0, 29);
      ctx.restore();
    }
  }

  drawSelectionBox(ctx) {
    if (!this.pointer || this.pointer.panning || !this.pointer.moved || this.pointer.pointerType === "touch") return;
    const x = Math.min(this.pointer.startX, this.mouse.x);
    const y = Math.min(this.pointer.startY, this.mouse.y);
    const width = Math.abs(this.mouse.x - this.pointer.startX);
    const height = Math.abs(this.mouse.y - this.pointer.startY);
    ctx.fillStyle = "rgba(94,233,225,.09)";
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const width = dom.minimap.width;
    const height = dom.minimap.height;
    const scaleX = width / WORLD.width;
    const scaleY = height / WORLD.height;
    ctx.fillStyle = "#06100f";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(42,79,61,.38)";
    for (const patch of this.terrain) {
      ctx.beginPath();
      ctx.ellipse(patch.x * scaleX, patch.y * scaleY, Math.max(1, patch.radius * scaleX), Math.max(1, patch.radius * 0.4 * scaleY), patch.angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#111b18";
    for (const obstacle of this.obstacles) {
      ctx.beginPath(); ctx.arc(obstacle.x * scaleX, obstacle.y * scaleY, Math.max(2, obstacle.radius * scaleX), 0, Math.PI * 2); ctx.fill();
    }
    for (let row = 0; row < this.fogRows; row += 1) {
      for (let column = 0; column < this.fogColumns; column += 1) {
        const index = row * this.fogColumns + column;
        if (this.visible[index]) continue;
        ctx.fillStyle = this.explored[index] ? "rgba(0,3,5,.47)" : "rgba(0,2,4,.91)";
        ctx.fillRect(column * FOG_SIZE * scaleX, row * FOG_SIZE * scaleY, FOG_SIZE * scaleX + 1, FOG_SIZE * scaleY + 1);
      }
    }
    for (const node of this.nodes) {
      if (node.amount <= 0 || !this.isExplored(node.x, node.y)) continue;
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(node.x * scaleX - 1, node.y * scaleY - 1, 3, 3);
    }
    for (const entity of this.entities) {
      if (entity.dead || entity.team === TEAM.ENEMY && !this.isVisible(entity.x, entity.y)) continue;
      ctx.fillStyle = entity.team === TEAM.PLAYER ? COLORS.player : COLORS.enemy;
      const size = entity.kind === "structure" ? 4 : 2.5;
      if (entity.kind === "structure") ctx.fillRect(entity.x * scaleX - size / 2, entity.y * scaleY - size / 2, size, size);
      else {
        ctx.beginPath(); ctx.arc(entity.x * scaleX, entity.y * scaleY, size / 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    const objectives = this.entities.filter((entity) => !entity.dead && entity.team === TEAM.ENEMY && ["aegisNode", "citadel"].includes(entity.type));
    ctx.strokeStyle = COLORS.red;
    for (const objective of objectives) {
      ctx.strokeRect(objective.x * scaleX - 3, objective.y * scaleY - 3, 6, 6);
    }
    const viewWidth = Math.min(WORLD.width, this.width / this.camera.zoom) * scaleX;
    const viewHeight = Math.min(WORLD.height, this.height / this.camera.zoom) * scaleY;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.camera.x * scaleX - viewWidth / 2, this.camera.y * scaleY - viewHeight / 2, viewWidth, viewHeight);
    ctx.strokeStyle = "rgba(94,233,225,.4)";
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  polygonPath(ctx, sides, radius, rotation = 0) {
    ctx.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = rotation + index * Math.PI * 2 / sides;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

const game = new VoidfrontGame();

window.__voidfront = {
  version: "1.0.0",
  start: (difficulty = "standard") => game.start(difficulty),
  step: (seconds = SIMULATION_STEP) => {
    const ticks = Math.max(1, Math.round(seconds / SIMULATION_STEP));
    for (let index = 0; index < ticks; index += 1) game.step(SIMULATION_STEP);
    game.render();
    game.updateHud(true);
    return window.__voidfront.snapshot();
  },
  snapshot: () => game.snapshot(),
  setAutoSimulation: (enabled) => {
    game.autoSimulation = Boolean(enabled);
    game.accumulator = 0;
    game.lastFrame = performance.now();
    return game.autoSimulation;
  },
  game,
};
window.__voidfrontReady = true;
