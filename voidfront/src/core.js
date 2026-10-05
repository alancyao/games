export const SIMULATION_STEP = 1 / 60;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a, b) {
  return Math.sqrt(distanceSquared(a, b));
}

export function normalizedDelta(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) return { x: 0, y: 0, length: 0 };
  return { x: dx / length, y: dy / length, length };
}

export function circlesOverlap(a, b, padding = 0) {
  const radius = a.radius + b.radius + padding;
  return distanceSquared(a, b) < radius * radius;
}

export function withinDistance(a, b, limit, tolerance = 1) {
  return distanceSquared(a, b) <= (limit + tolerance) ** 2;
}

export function moveToward(entity, target, maxDistance) {
  const direction = normalizedDelta(entity, target);
  if (direction.length <= maxDistance) {
    entity.x = target.x;
    entity.y = target.y;
    return true;
  }
  entity.x += direction.x * maxDistance;
  entity.y += direction.y * maxDistance;
  return false;
}

export class SeededRandom {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  between(min, max) {
    return min + (max - min) * this.next();
  }

  integer(min, maxInclusive) {
    return Math.floor(this.between(min, maxInclusive + 1));
  }

  pick(values) {
    return values[Math.floor(this.next() * values.length)];
  }
}

export function formationOffsets(count, spacing = 34) {
  if (count <= 0) return [];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    result.push({
      x: (column - (rowCount - 1) / 2) * spacing,
      y: (row - (rows - 1) / 2) * spacing,
    });
  }
  return result;
}

export function canAfford(wallet, cost) {
  return (wallet.shards ?? 0) >= (cost.shards ?? 0);
}

export function debit(wallet, cost) {
  if (!canAfford(wallet, cost)) return false;
  wallet.shards -= cost.shards ?? 0;
  return true;
}

export function credit(wallet, income) {
  wallet.shards += income.shards ?? 0;
  return wallet;
}

export function hasSupply(state, needed) {
  return state.supplyUsed + needed <= state.supplyCap;
}

export function advanceProductionQueue(queue, deltaSeconds) {
  if (!queue.length) return null;
  const current = queue[0];
  current.remaining = Math.max(0, current.remaining - deltaSeconds);
  if (current.remaining > 0) return null;
  return queue.shift();
}

export function applyDamage(entity, damage) {
  const applied = Math.max(0, Math.min(entity.hp, damage));
  entity.hp -= applied;
  if (entity.hp <= 0) {
    entity.hp = 0;
    entity.dead = true;
  }
  return applied;
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secondsPart = (seconds % 60).toString().padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}

export function placementIsValid({ x, y, radius, world, entities, obstacles, nodes, margin = 18 }) {
  if (x - radius < 0 || y - radius < 0 || x + radius > world.width || y + radius > world.height) {
    return false;
  }

  const candidate = { x, y, radius };
  for (const entity of entities) {
    if (entity.dead || entity.kind === "unit") continue;
    if (circlesOverlap(candidate, entity, margin)) return false;
  }
  for (const obstacle of obstacles) {
    if (circlesOverlap(candidate, obstacle, margin)) return false;
  }
  for (const node of nodes) {
    if (node.amount <= 0) continue;
    if (circlesOverlap(candidate, node, margin)) return false;
  }
  return true;
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

export function stateHash(value) {
  const text = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
