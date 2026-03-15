const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TURN_INTERVAL = 25;
const ANALYTICS_RESUME_STALE_MS = 1000 * 60 * 45;
const MIN_TRACKED_DEPTH = -1;

function clampInt(value, min = 0, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

function nowMs() {
  return Date.now();
}

function makeCounterBag() {
  return {
    turns: 0,
    moves: 0,
    waits: 0,
    attacks: 0,
    stairsUp: 0,
    stairsDown: 0,
    doorsOpened: 0,
    doorsClosed: 0,
    shrinesUsed: 0,
    chestsOpened: 0,
    trapsTriggered: 0,
    trapsDisarmed: 0,
    damageDealt: 0,
    damageTaken: 0,
    healingReceived: 0,
    goldCollected: 0,
    goldSpent: 0,
    tilesDiscovered: 0,
    chunksDiscovered: 0,
    distanceTravelled: 0,
  };
}

function makeFloorBag(depth = 0, startedAtMs = nowMs()) {
  return {
    depth: clampInt(depth, MIN_TRACKED_DEPTH, 0),
    enteredAtMs: clampInt(startedAtMs, 0, nowMs()),
    activeSecondsApprox: 0,
    turns: 0,
    moves: 0,
    distanceTravelled: 0,
    tilesDiscovered: 0,
    chunksDiscovered: 0,
    damageDealt: 0,
    damageTaken: 0,
    shrinesUsed: 0,
    chestsOpened: 0,
    trapsTriggered: 0,
    trapsDisarmed: 0,
    killsByType: {},
  };
}

function cloneCounters(raw = null) {
  const out = makeCounterBag();
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(out)) out[key] = clampInt(raw[key], 0, 0);
  return out;
}

function cloneFloors(raw = null) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [depthKey, floorRaw] of Object.entries(raw)) {
    const depth = clampInt(depthKey, MIN_TRACKED_DEPTH, MIN_TRACKED_DEPTH - 1);
    if (depth < MIN_TRACKED_DEPTH) continue;
    const base = makeFloorBag(depth, clampInt(floorRaw?.enteredAtMs, 0, nowMs()));
    base.activeSecondsApprox = clampInt(floorRaw?.activeSecondsApprox, 0, 0);
    base.turns = clampInt(floorRaw?.turns, 0, 0);
    base.moves = clampInt(floorRaw?.moves, 0, 0);
    base.distanceTravelled = clampInt(floorRaw?.distanceTravelled, 0, 0);
    base.tilesDiscovered = clampInt(floorRaw?.tilesDiscovered, 0, 0);
    base.chunksDiscovered = clampInt(floorRaw?.chunksDiscovered, 0, 0);
    base.damageDealt = clampInt(floorRaw?.damageDealt, 0, 0);
    base.damageTaken = clampInt(floorRaw?.damageTaken, 0, 0);
    base.shrinesUsed = clampInt(floorRaw?.shrinesUsed, 0, 0);
    base.chestsOpened = clampInt(floorRaw?.chestsOpened, 0, 0);
    base.trapsTriggered = clampInt(floorRaw?.trapsTriggered, 0, 0);
    base.trapsDisarmed = clampInt(floorRaw?.trapsDisarmed, 0, 0);
    base.killsByType = {};
    if (floorRaw?.killsByType && typeof floorRaw.killsByType === "object") {
      for (const [type, count] of Object.entries(floorRaw.killsByType)) {
        if (!type) continue;
        const nextCount = clampInt(count, 0, 0);
        if (nextCount > 0) base.killsByType[type] = nextCount;
      }
    }
    out[depth] = base;
  }
  return out;
}

function makeRunId(seed = "") {
  const random = Math.random().toString(36).slice(2, 10);
  const ts = nowMs().toString(36);
  const seedTag = String(seed || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase();
  return `run_${seedTag || "seed"}_${ts}_${random}`;
}

export function createRunAnalyticsState({
  seed = "",
  depth = 0,
  startedAtMs = nowMs(),
  runId = "",
} = {}) {
  const started = clampInt(startedAtMs, 0, nowMs());
  const safeDepth = clampInt(depth, MIN_TRACKED_DEPTH, 0);
  const analytics = {
    runId: String(runId || makeRunId(seed)),
    startedAtMs: started,
    resumedAtMs: started,
    lastInputAtMs: started,
    lastTickAtMs: started,
    lastFlushAtMs: 0,
    lastHeartbeatAtMs: 0,
    activeSecondsApprox: 0,
    idleSecondsApprox: 0,
    counters: makeCounterBag(),
    floors: {},
    pendingEvents: [],
    pendingSeq: 0,
    currentDepth: safeDepth,
    deepestDepth: safeDepth,
    hasRunStartSent: false,
    ended: false,
    endStatus: "",
    deathCause: "",
    deathKillerType: "",
    _turnsSinceHeartbeat: 0,
  };
  analytics.floors[safeDepth] = makeFloorBag(safeDepth, started);
  return analytics;
}

export function createOrResumeAnalyticsState(snapshot = null, options = {}) {
  const currentMs = clampInt(options.nowMs, 0, nowMs());
  if (!snapshot || typeof snapshot !== "object") return createRunAnalyticsState({ ...options, startedAtMs: currentMs });

  const startedAtMs = clampInt(snapshot.startedAtMs, 0, currentMs);
  const ended = !!snapshot.ended;
  const stale = (currentMs - startedAtMs) > ANALYTICS_RESUME_STALE_MS;
  if (ended || stale || !snapshot.runId) return createRunAnalyticsState({ ...options, startedAtMs: currentMs });

  const analytics = {
    runId: String(snapshot.runId),
    startedAtMs,
    resumedAtMs: currentMs,
    lastInputAtMs: currentMs,
    lastTickAtMs: currentMs,
    lastFlushAtMs: 0,
    lastHeartbeatAtMs: 0,
    activeSecondsApprox: clampInt(snapshot.activeSecondsApprox, 0, 0),
    idleSecondsApprox: clampInt(snapshot.idleSecondsApprox, 0, 0),
    counters: cloneCounters(snapshot.countersSnapshot),
    floors: cloneFloors(snapshot.floorsSnapshot),
    pendingEvents: [],
    pendingSeq: clampInt(snapshot.pendingSeq, 0, 0),
    currentDepth: clampInt(options.depth ?? snapshot.currentDepth, MIN_TRACKED_DEPTH, 0),
    deepestDepth: Math.max(
      clampInt(options.depth ?? MIN_TRACKED_DEPTH, MIN_TRACKED_DEPTH, MIN_TRACKED_DEPTH),
      clampInt(snapshot.deepestDepth, MIN_TRACKED_DEPTH, MIN_TRACKED_DEPTH)
    ),
    hasRunStartSent: false,
    ended: false,
    endStatus: "",
    deathCause: "",
    deathKillerType: "",
    _turnsSinceHeartbeat: 0,
  };
  if (!analytics.floors[analytics.currentDepth]) {
    analytics.floors[analytics.currentDepth] = makeFloorBag(analytics.currentDepth, currentMs);
  }
  return analytics;
}

export function analyticsSnapshotForSave(analytics = null) {
  if (!analytics || typeof analytics !== "object") return null;
  return {
    runId: String(analytics.runId ?? ""),
    startedAtMs: clampInt(analytics.startedAtMs, 0, 0),
    currentDepth: clampInt(analytics.currentDepth, MIN_TRACKED_DEPTH, MIN_TRACKED_DEPTH),
    deepestDepth: clampInt(analytics.deepestDepth, MIN_TRACKED_DEPTH, MIN_TRACKED_DEPTH),
    activeSecondsApprox: clampInt(analytics.activeSecondsApprox, 0, 0),
    idleSecondsApprox: clampInt(analytics.idleSecondsApprox, 0, 0),
    countersSnapshot: cloneCounters(analytics.counters),
    floorsSnapshot: cloneFloors(analytics.floors),
    pendingSeq: clampInt(analytics.pendingSeq, 0, 0),
    ended: !!analytics.ended,
  };
}

export function ensureAnalyticsFloor(analytics, depth, enteredAtMs = nowMs()) {
  if (!analytics || typeof analytics !== "object") return null;
  const safeDepth = clampInt(depth, MIN_TRACKED_DEPTH, 0);
  if (!analytics.floors[safeDepth]) analytics.floors[safeDepth] = makeFloorBag(safeDepth, enteredAtMs);
  analytics.currentDepth = safeDepth;
  analytics.deepestDepth = Math.max(
    clampInt(analytics.deepestDepth, MIN_TRACKED_DEPTH, safeDepth),
    safeDepth
  );
  return analytics.floors[safeDepth];
}

export function markAnalyticsInput(analytics, inputAtMs = nowMs()) {
  if (!analytics || typeof analytics !== "object") return;
  analytics.lastInputAtMs = clampInt(inputAtMs, 0, nowMs());
}

export function accumulateAnalyticsTime(analytics, tickAtMs = nowMs()) {
  if (!analytics || typeof analytics !== "object") return;
  const currentMs = clampInt(tickAtMs, 0, nowMs());
  const lastTick = clampInt(analytics.lastTickAtMs, 0, currentMs);
  if (currentMs <= lastTick) {
    analytics.lastTickAtMs = currentMs;
    return;
  }
  const deltaMs = currentMs - lastTick;
  const recentInput = (currentMs - clampInt(analytics.lastInputAtMs, 0, currentMs)) <= 12000;
  const activeSeconds = recentInput ? Math.round(deltaMs / 1000) : 0;
  const idleSeconds = Math.max(0, Math.round(deltaMs / 1000) - activeSeconds);
  analytics.activeSecondsApprox += activeSeconds;
  analytics.idleSecondsApprox += idleSeconds;
  const floor = ensureAnalyticsFloor(analytics, analytics.currentDepth, currentMs);
  if (floor) floor.activeSecondsApprox += activeSeconds;
  analytics.lastTickAtMs = currentMs;
}

export function recordAnalyticsCounter(analytics, key, delta = 1, depth = null) {
  if (!analytics || typeof analytics !== "object") return;
  if (!analytics.counters || typeof analytics.counters !== "object") analytics.counters = makeCounterBag();
  const safeKey = String(key ?? "");
  if (!(safeKey in analytics.counters)) return;
  const safeDelta = clampInt(delta, 0, 0);
  analytics.counters[safeKey] += safeDelta;
  const targetDepth = depth === null || depth === undefined ? analytics.currentDepth : depth;
  const floor = ensureAnalyticsFloor(analytics, targetDepth);
  if (!floor) return;
  if (safeKey in floor) floor[safeKey] += safeDelta;
}

export function recordAnalyticsMovement(analytics, depth, distance = 1) {
  const safeDistance = clampInt(distance, 0, 0);
  if (safeDistance <= 0) return;
  recordAnalyticsCounter(analytics, "moves", 1, depth);
  recordAnalyticsCounter(analytics, "distanceTravelled", safeDistance, depth);
}

export function recordAnalyticsDiscovery(analytics, depth, tilesDelta = 0, chunkDelta = 0) {
  if (tilesDelta > 0) recordAnalyticsCounter(analytics, "tilesDiscovered", tilesDelta, depth);
  if (chunkDelta > 0) recordAnalyticsCounter(analytics, "chunksDiscovered", chunkDelta, depth);
}

export function recordAnalyticsKill(analytics, depth, type) {
  if (!analytics || typeof analytics !== "object" || !type) return;
  const floor = ensureAnalyticsFloor(analytics, depth);
  if (!floor) return;
  const monsterType = String(type);
  floor.killsByType[monsterType] = clampInt(floor.killsByType[monsterType], 0, 0) + 1;
}

export function recordAnalyticsDamage(analytics, depth, { dealt = 0, taken = 0, healing = 0 } = {}) {
  if (dealt > 0) recordAnalyticsCounter(analytics, "damageDealt", dealt, depth);
  if (taken > 0) recordAnalyticsCounter(analytics, "damageTaken", taken, depth);
  if (healing > 0) recordAnalyticsCounter(analytics, "healingReceived", healing, depth);
}

export function queueAnalyticsEvent(analytics, type, depth, x, y, payload = null, eventAtMs = nowMs()) {
  if (!analytics || typeof analytics !== "object") return null;
  const event = {
    seq: clampInt(analytics.pendingSeq, 0, 0) + 1,
    ts: clampInt(eventAtMs, 0, nowMs()),
    type: String(type ?? "").trim(),
    runId: String(analytics.runId ?? ""),
    depth: clampInt(depth, MIN_TRACKED_DEPTH, analytics.currentDepth ?? 0),
    x: Number.isFinite(Number(x)) ? Math.floor(Number(x)) : null,
    y: Number.isFinite(Number(y)) ? Math.floor(Number(y)) : null,
    payload: (payload && typeof payload === "object") ? payload : {},
  };
  if (!event.type || !event.runId) return null;
  analytics.pendingSeq = event.seq;
  analytics.pendingEvents.push(event);
  return event;
}

export function enterAnalyticsFloor(analytics, depth, eventAtMs = nowMs()) {
  const floor = ensureAnalyticsFloor(analytics, depth, eventAtMs);
  if (!floor) return null;
  floor.enteredAtMs = clampInt(floor.enteredAtMs, 0, eventAtMs) || clampInt(eventAtMs, 0, nowMs());
  analytics.currentDepth = clampInt(depth, MIN_TRACKED_DEPTH, 0);
  analytics.deepestDepth = Math.max(
    clampInt(analytics.deepestDepth, MIN_TRACKED_DEPTH, MIN_TRACKED_DEPTH),
    analytics.currentDepth
  );
  return floor;
}

export function advanceAnalyticsTurn(analytics, depth, turnAtMs = nowMs()) {
  if (!analytics || typeof analytics !== "object") return;
  accumulateAnalyticsTime(analytics, turnAtMs);
  recordAnalyticsCounter(analytics, "turns", 1, depth);
  analytics._turnsSinceHeartbeat = clampInt(analytics._turnsSinceHeartbeat, 0, 0) + 1;
}

export function analyticsNeedsHeartbeat(analytics, currentAtMs = nowMs()) {
  if (!analytics || typeof analytics !== "object" || analytics.ended) return false;
  const currentMs = clampInt(currentAtMs, 0, nowMs());
  if (!analytics.hasRunStartSent) return true;
  if (analytics.pendingEvents?.length > 0) return true;
  if ((currentMs - clampInt(analytics.lastHeartbeatAtMs, 0, 0)) >= HEARTBEAT_INTERVAL_MS) return true;
  if (clampInt(analytics._turnsSinceHeartbeat, 0, 0) >= HEARTBEAT_TURN_INTERVAL) return true;
  return false;
}

export function markAnalyticsHeartbeat(analytics, sentAtMs = nowMs()) {
  if (!analytics || typeof analytics !== "object") return;
  analytics.lastHeartbeatAtMs = clampInt(sentAtMs, 0, nowMs());
  analytics.lastFlushAtMs = analytics.lastHeartbeatAtMs;
  analytics._turnsSinceHeartbeat = 0;
}

export function drainAnalyticsEvents(analytics) {
  if (!analytics || typeof analytics !== "object") return [];
  const events = Array.isArray(analytics.pendingEvents) ? analytics.pendingEvents.slice() : [];
  analytics.pendingEvents = [];
  return events;
}

export function markAnalyticsEnded(analytics, {
  status = "ended",
  deathCause = "",
  deathKillerType = "",
  endedAtMs = nowMs(),
} = {}) {
  if (!analytics || typeof analytics !== "object") return;
  accumulateAnalyticsTime(analytics, endedAtMs);
  analytics.ended = true;
  analytics.endStatus = String(status || "ended");
  analytics.deathCause = String(deathCause || "");
  analytics.deathKillerType = String(deathKillerType || "");
}

export function buildRunStartPayload(analytics, state, extra = {}) {
  const player = state?.player ?? {};
  const character = state?.character ?? {};
  return {
    run_id: String(analytics?.runId ?? ""),
    seed: String(state?.world?.seedStr ?? ""),
    started_at_ms: clampInt(analytics?.startedAtMs, 0, nowMs()),
    current_depth: clampInt(player.z, MIN_TRACKED_DEPTH, 0),
    deepest_depth: clampInt(player.z, MIN_TRACKED_DEPTH, 0),
    character: {
      id: String(character.id ?? ""),
      name: String(character.name ?? "Adventurer"),
      species_id: String(character.speciesId ?? player.speciesId ?? ""),
      class_id: String(character.classId ?? player.classId ?? ""),
    },
    ...extra,
  };
}

export function buildHeartbeatPayload(analytics, state, extra = {}) {
  const player = state?.player ?? {};
  return {
    run_id: String(analytics?.runId ?? ""),
    seed: String(state?.world?.seedStr ?? ""),
    current_depth: clampInt(player.z, MIN_TRACKED_DEPTH, 0),
    deepest_depth: clampInt(analytics?.deepestDepth, MIN_TRACKED_DEPTH, clampInt(player.z, MIN_TRACKED_DEPTH, 0)),
    turn: clampInt(state?.turn, 0, 0),
    active_seconds_approx: clampInt(analytics?.activeSecondsApprox, 0, 0),
    idle_seconds_approx: clampInt(analytics?.idleSecondsApprox, 0, 0),
    counters: cloneCounters(analytics?.counters),
    floors: cloneFloors(analytics?.floors),
    ...extra,
  };
}

export function buildRunEndPayload(analytics, state, extra = {}) {
  const player = state?.player ?? {};
  return {
    run_id: String(analytics?.runId ?? ""),
    seed: String(state?.world?.seedStr ?? ""),
    current_depth: clampInt(player.z, MIN_TRACKED_DEPTH, 0),
    deepest_depth: clampInt(analytics?.deepestDepth, MIN_TRACKED_DEPTH, clampInt(player.z, MIN_TRACKED_DEPTH, 0)),
    turn: clampInt(state?.turn, 0, 0),
    active_seconds_approx: clampInt(analytics?.activeSecondsApprox, 0, 0),
    idle_seconds_approx: clampInt(analytics?.idleSecondsApprox, 0, 0),
    counters: cloneCounters(analytics?.counters),
    floors: cloneFloors(analytics?.floors),
    status: String(analytics?.endStatus || extra.status || "ended"),
    death_cause: String(analytics?.deathCause || extra.death_cause || ""),
    death_killer_type: String(analytics?.deathKillerType || extra.death_killer_type || ""),
    ...extra,
  };
}

export { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TURN_INTERVAL };
