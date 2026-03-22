import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createHeadlessBrowserEnv } from "./headless_env.mjs";

createHeadlessBrowserEnv();

const engine = await import("../../game.js");
const socketPath = String(process.argv[2] ?? "").trim();
const workerLogPath = path.join(path.dirname(socketPath || "."), "worker.log");
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MONSTER_EDITOR_CONFIG_PATHS = [
  (() => {
    const envRoot = String(process.env.DUNGEON25_STORAGE_ROOT ?? "").trim();
    return envRoot ? path.join(envRoot, "data", "monsters.json") : "";
  })(),
  "/var/www/blahpunk_runtime/dungeon25/data/monsters.json",
  path.resolve(PROJECT_ROOT, "..", "blahpunk_runtime", "dungeon25", "data", "monsters.json"),
  path.join(PROJECT_ROOT, ".runtime", "data", "monsters.json"),
  path.join(PROJECT_ROOT, "data", "data", "monsters.json"),
  path.join(PROJECT_ROOT, "data", "monster_editor", "config.json"),
  path.join(PROJECT_ROOT, "src", "content", "monsters.seed.json"),
].filter(Boolean);
let appliedMonsterConfigRaw = "";
const SESSION_STATE_CACHE_TTL_MS = 300000;
const SESSION_STATE_CACHE_MAX = 128;
const AUTHORITATIVE_TICK_MS = 12;
const AUTHORITATIVE_INPUT_WINDOW_MS = 12;
const AUTHORITATIVE_POLL_MIN_RESPONSE_MS = 2;
const AUTHORITATIVE_POLL_MAX_BATCH_CHANGED_TICKS = 1;
const sessionStateCache = new Map();
const SESSION_CACHE_DIR = path.join(PROJECT_ROOT, ".runtime", "authoritative_runtime", "session_cache");
const heartbeatTimer = setInterval(() => {
  pruneSessionStateCache(Date.now());
}, 15000);

if (!socketPath) {
  throw new Error("Missing authoritative daemon socket path.");
}

function appendRuntimeLog(message = "") {
  const line = `[${new Date().toISOString()}] ${String(message ?? "").trim()}\n`;
  try {
    fs.appendFileSync(workerLogPath, line, "utf8");
  } catch {}
}

function normalizeSessionId(value = "") {
  const id = String(value ?? "").trim();
  return /^[a-z0-9_\-]{8,160}$/i.test(id) ? id : "";
}

function normalizeMoveDir(value = "") {
  const dir = String(value ?? "").trim().toUpperCase();
  return (dir === "N" || dir === "S" || dir === "E" || dir === "W") ? dir : "";
}

function normalizeOperation(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function ensureRuntimeDirs() {
  try {
    fs.mkdirSync(SESSION_CACHE_DIR, { recursive: true });
  } catch {}
}

function sessionCachePath(sessionId = "") {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return "";
  return path.join(SESSION_CACHE_DIR, `${sid}.json`);
}

function pruneSessionStateCache(nowMs = Date.now()) {
  for (const [key, entry] of sessionStateCache.entries()) {
    const updatedAt = Number(entry?.updatedAt ?? 0);
    if (!Number.isFinite(updatedAt) || (nowMs - updatedAt) > SESSION_STATE_CACHE_TTL_MS) {
      sessionStateCache.delete(key);
    }
  }
  if (sessionStateCache.size <= SESSION_STATE_CACHE_MAX) return;
  const ordered = [...sessionStateCache.entries()]
    .sort((a, b) => Number(a?.[1]?.updatedAt ?? 0) - Number(b?.[1]?.updatedAt ?? 0));
  while (ordered.length > SESSION_STATE_CACHE_MAX) {
    const victim = ordered.shift();
    if (!victim) break;
    sessionStateCache.delete(victim[0]);
  }
}

function getCachedSessionState(sessionId = "", worldPayload = "") {
  const key = normalizeSessionId(sessionId);
  if (!key) return null;
  pruneSessionStateCache(Date.now());
  let entry = sessionStateCache.get(key);
  if ((!entry || typeof entry !== "object") && key) {
    const cachePath = sessionCachePath(key);
    if (cachePath && fs.existsSync(cachePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        const payload = String(parsed?.worldPayload ?? "");
        const state = payload ? engine.headlessStateFromPayload(payload) : null;
        if (state) {
          entry = {
            worldPayload: payload,
            state,
            lastTick: Math.max(0, Math.floor(Number(parsed?.lastTick ?? 0) || 0)),
            updatedAt: Math.max(0, Math.floor(Number(parsed?.updatedAt ?? Date.now()) || Date.now())),
            movementIntent: {
              active: parsed?.movementIntent?.active === true,
              dir: normalizeMoveDir(parsed?.movementIntent?.dir ?? ""),
              updatedAt: Math.max(0, Math.floor(Number(parsed?.movementIntent?.updatedAt ?? 0) || 0)),
              seq: Math.max(0, Math.floor(Number(parsed?.movementIntent?.seq ?? 0) || 0)),
              enqueueSeq: Math.max(0, Math.floor(Number(parsed?.movementIntent?.enqueueSeq ?? 0) || 0)),
            },
            pendingMoves: Array.isArray(parsed?.pendingMoves)
              ? parsed.pendingMoves.map((dir) => normalizeMoveDir(dir)).filter(Boolean).slice(-8)
              : [],
          };
          sessionStateCache.set(key, entry);
        }
      } catch {}
    }
  }
  if (!entry || typeof entry !== "object") return null;
  const requestedPayload = String(worldPayload ?? "");
  if (requestedPayload.trim() !== "" && String(entry.worldPayload ?? "") !== requestedPayload) return null;
  entry.updatedAt = Date.now();
  return entry;
}

function setCachedSessionState(sessionId = "", worldPayload = "", state = null) {
  const key = normalizeSessionId(sessionId);
  if (!key || !state) return;
  pruneSessionStateCache(Date.now());
  const prev = sessionStateCache.get(key);
  const nextEntry = {
    worldPayload: String(worldPayload ?? ""),
    state,
    lastTick: Number.isFinite(prev?.lastTick) ? Math.max(0, Math.floor(prev.lastTick)) : 0,
    updatedAt: Date.now(),
    movementIntent: {
      active: prev?.movementIntent?.active === true,
      dir: normalizeMoveDir(prev?.movementIntent?.dir ?? ""),
      updatedAt: Number.isFinite(prev?.movementIntent?.updatedAt)
        ? Math.max(0, Math.floor(prev.movementIntent.updatedAt))
        : 0,
      seq: Number.isFinite(prev?.movementIntent?.seq)
        ? Math.max(0, Math.floor(prev.movementIntent.seq))
        : 0,
      enqueueSeq: Number.isFinite(prev?.movementIntent?.enqueueSeq)
        ? Math.max(0, Math.floor(prev.movementIntent.enqueueSeq))
        : 0,
    },
    pendingMoves: Array.isArray(prev?.pendingMoves)
      ? prev.pendingMoves.map((dir) => normalizeMoveDir(dir)).filter(Boolean).slice(-8)
      : [],
  };
  sessionStateCache.set(key, nextEntry);
  ensureRuntimeDirs();
  const cachePath = sessionCachePath(key);
  if (!cachePath) return;
  try {
    fs.writeFileSync(cachePath, JSON.stringify({
      worldPayload: nextEntry.worldPayload,
      lastTick: nextEntry.lastTick,
      updatedAt: nextEntry.updatedAt,
      movementIntent: nextEntry.movementIntent,
      pendingMoves: nextEntry.pendingMoves,
    }), "utf8");
  } catch {}
}

function clearCachedSessionState(sessionId = "") {
  const key = normalizeSessionId(sessionId);
  if (!key) return;
  sessionStateCache.delete(key);
  const cachePath = sessionCachePath(key);
  if (!cachePath) return;
  try {
    fs.unlinkSync(cachePath);
  } catch {}
}

function sleep(ms = 0) {
  const delay = Math.max(0, Math.floor(Number(ms) || 0));
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function ensureMovementState(entry = null) {
  if (!entry || typeof entry !== "object") return null;
  if (!entry.movementIntent || typeof entry.movementIntent !== "object") {
    entry.movementIntent = {
      active: false,
      dir: "",
      updatedAt: 0,
      seq: 0,
      enqueueSeq: 0,
    };
  }
  entry.movementIntent.active = entry.movementIntent.active === true;
  entry.movementIntent.dir = normalizeMoveDir(entry.movementIntent.dir ?? "");
  entry.movementIntent.updatedAt = Number.isFinite(entry.movementIntent.updatedAt)
    ? Math.max(0, Math.floor(entry.movementIntent.updatedAt))
    : 0;
  entry.movementIntent.seq = Number.isFinite(entry.movementIntent.seq)
    ? Math.max(0, Math.floor(entry.movementIntent.seq))
    : 0;
  entry.movementIntent.enqueueSeq = Number.isFinite(entry.movementIntent.enqueueSeq)
    ? Math.max(0, Math.floor(entry.movementIntent.enqueueSeq))
    : 0;
  if (!Array.isArray(entry.pendingMoves)) entry.pendingMoves = [];
  entry.pendingMoves = entry.pendingMoves.map((dir) => normalizeMoveDir(dir)).filter(Boolean).slice(-8);
  return entry;
}

function sessionHasPendingMovement(entry = null) {
  const normalized = ensureMovementState(entry);
  if (!normalized) return false;
  if (normalized.pendingMoves.length > 0) return true;
  return normalized.movementIntent.active === true && !!normalized.movementIntent.dir;
}

function dequeueSessionMoveDir(entry = null) {
  const normalized = ensureMovementState(entry);
  if (!normalized) return "";
  if (normalized.pendingMoves.length > 0) {
    return normalizeMoveDir(normalized.pendingMoves.shift() ?? "");
  }
  if (normalized.movementIntent.active === true) {
    return normalizeMoveDir(normalized.movementIntent.dir ?? "");
  }
  return "";
}

function updateSessionMovementIntent(entry = null, options = null) {
  const normalized = ensureMovementState(entry);
  if (!normalized) return null;
  const opts = (options && typeof options === "object") ? options : {};
  const seq = Math.max(0, Math.floor(Number(opts.intentSeq ?? 0) || 0));
  if (seq > 0 && seq < normalized.movementIntent.seq) {
    return normalized.movementIntent;
  }
  if (seq > 0) normalized.movementIntent.seq = seq;
  const holdDir = normalizeMoveDir(opts.holdDir ?? opts.dir ?? "");
  normalized.movementIntent.active = opts.active === true && !!holdDir;
  normalized.movementIntent.dir = normalized.movementIntent.active ? holdDir : "";
  normalized.movementIntent.updatedAt = Date.now();
  const enqueueDir = normalizeMoveDir(opts.enqueueDir ?? "");
  if (enqueueDir && seq > normalized.movementIntent.enqueueSeq) {
    normalized.pendingMoves.push(enqueueDir);
    normalized.pendingMoves = normalized.pendingMoves.slice(-8);
    normalized.movementIntent.enqueueSeq = seq;
  }
  return normalized.movementIntent;
}

function movementIntentSummary(entry = null) {
  const normalized = ensureMovementState(entry);
  if (!normalized) {
    return {
      active: false,
      dir: "",
      queued: 0,
      seq: 0,
    };
  }
  return {
    active: normalized.movementIntent.active === true,
    dir: normalizeMoveDir(normalized.movementIntent.dir ?? ""),
    queued: normalized.pendingMoves.length,
    seq: Math.max(0, Math.floor(Number(normalized.movementIntent.seq ?? 0) || 0)),
  };
}

function capturePlayerEffectProbeSignature(player = null) {
  const effects = Array.isArray(player?.effects) ? player.effects : [];
  if (!effects.length) return "";
  const parts = [];
  for (const raw of effects) {
    if (!raw || typeof raw !== "object") continue;
    const type = String(raw.type ?? "").trim().toLowerCase();
    if (!type) continue;
    const turnsLeft = Math.max(0, Math.floor(Number(raw.turnsLeft ?? 0) || 0));
    const dmgPerTurn = Math.max(0, Math.floor(Number(raw.dmgPerTurn ?? 0) || 0));
    const healPerTurn = Math.max(0, Math.floor(Number(raw.healPerTurn ?? 0) || 0));
    parts.push(`${type}:${turnsLeft}:${dmgPerTurn}:${healPerTurn}`);
  }
  if (!parts.length) return "";
  parts.sort();
  return parts.join("|");
}

function capturePollStateProbe(state = null) {
  const player = (state && typeof state === "object" && state.player && typeof state.player === "object")
    ? state.player
    : {};
  const live = (state && typeof state === "object" && state.live && typeof state.live === "object")
    ? state.live
    : {};
  const events = Array.isArray(live.events) ? live.events : [];
  const log = Array.isArray(state?.log) ? state.log : [];
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  return {
    x: Math.floor(Number(player.x ?? 0)),
    y: Math.floor(Number(player.y ?? 0)),
    z: Math.floor(Number(player.z ?? 0)),
    hp: Math.max(0, Math.floor(Number(player.hp ?? 0))),
    energy: Math.max(0, Math.floor(Number(player.energy ?? 0))),
    abilityCd: Math.max(0, Math.floor(Number(player.abilityCd ?? 0))),
    effectsSig: capturePlayerEffectProbeSignature(player),
    dead: !!player.dead,
    logLen: log.length,
    eventLen: events.length,
    stepSeq: Math.max(0, Math.floor(Number(live.stepSeq ?? 0) || 0)),
    lastEventTick: Math.max(0, Math.floor(Number(lastEvent?.tick ?? 0) || 0)),
    lastEventType: String(lastEvent?.type ?? "").trim().toLowerCase(),
    lastEventActionId: String(lastEvent?.actionId ?? "").trim(),
  };
}

function pollStateProbeChanged(before = null, after = null) {
  const a = (before && typeof before === "object") ? before : capturePollStateProbe(null);
  const b = (after && typeof after === "object") ? after : capturePollStateProbe(null);
  return (
    a.x !== b.x
    || a.y !== b.y
    || a.z !== b.z
    || a.hp !== b.hp
    || a.energy !== b.energy
    || a.abilityCd !== b.abilityCd
    || a.effectsSig !== b.effectsSig
    || a.dead !== b.dead
    || a.logLen !== b.logLen
    || a.eventLen !== b.eventLen
    || a.stepSeq !== b.stepSeq
    || a.lastEventTick !== b.lastEventTick
    || a.lastEventType !== b.lastEventType
    || a.lastEventActionId !== b.lastEventActionId
  );
}

function fail(message, extra = {}) {
  return {
    ok: false,
    error: String(message ?? "Authoritative daemon failed."),
    ...extra,
  };
}

function loadMonsterEditorPayload() {
  for (const cfgPath of MONSTER_EDITOR_CONFIG_PATHS) {
    try {
      const raw = fs.readFileSync(cfgPath, "utf8").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      const monsters = parsed.monsters && typeof parsed.monsters === "object" ? parsed.monsters : {};
      const spawnRules = Array.isArray(parsed.spawn_rules) ? parsed.spawn_rules : [];
      return {
        raw,
        payload: {
          version: Math.max(1, Math.floor(Number(parsed.version ?? 1) || 1)),
          monsters,
          spawn_rules: spawnRules,
          updated_at: String(parsed.updated_at ?? ""),
        },
      };
    } catch {}
  }
  return null;
}

function refreshMonsterRuntimeConfig() {
  if (typeof engine.applyHeadlessMonsterEditorPayload !== "function") return;
  const loaded = loadMonsterEditorPayload();
  if (loaded?.raw && loaded.raw === appliedMonsterConfigRaw) return;
  if (loaded?.payload) {
    const ok = engine.applyHeadlessMonsterEditorPayload(loaded.payload);
    if (ok) {
      appliedMonsterConfigRaw = loaded.raw;
      return;
    }
  }
  if (!appliedMonsterConfigRaw) {
    if (engine.applyHeadlessMonsterEditorPayload(null)) {
      appliedMonsterConfigRaw = "__default__";
    }
  }
}

async function handleOperation(raw = "") {
  refreshMonsterRuntimeConfig();
  const input = raw.trim() ? JSON.parse(raw) : {};
  const operation = normalizeOperation(input.operation ?? "");
  const sessionId = normalizeSessionId(input.sessionId ?? input.session_id ?? "");

  if (operation === "bootstrap") {
    const snapshot = engine.headlessBootstrapState(input.options ?? {});
    if (!snapshot) return fail("Could not bootstrap authoritative state.");
    if (sessionId) {
      const payload = String(snapshot?.payload ?? "");
      const state = payload ? engine.headlessStateFromPayload(payload) : null;
      if (state) setCachedSessionState(sessionId, payload, state);
      else clearCachedSessionState(sessionId);
    }
    return { ok: true, snapshot };
  }

  if (operation === "snapshot") {
    const worldPayload = String(input.worldPayload ?? "");
    let entry = getCachedSessionState(sessionId, worldPayload);
    let state = entry?.state ?? null;
    if (!state) {
      state = engine.headlessStateFromPayload(worldPayload);
      if (state && sessionId) {
        setCachedSessionState(sessionId, worldPayload, state);
        entry = getCachedSessionState(sessionId, worldPayload);
      }
    }
    if (!state) return fail("Invalid canonical run payload.");
    return { ok: true, snapshot: engine.buildHeadlessStateSnapshot(state) };
  }

  if (operation === "switch_character") {
    const snapshot = engine.headlessSwitchCharacterPayload(
      String(input.worldPayload ?? ""),
      String(input.characterPayload ?? ""),
      input.options ?? {}
    );
    if (!snapshot) return fail("Could not switch authoritative character.");
    if (sessionId) {
      const payload = String(snapshot?.payload ?? "");
      const state = payload ? engine.headlessStateFromPayload(payload) : null;
      if (state) setCachedSessionState(sessionId, payload, state);
      else clearCachedSessionState(sessionId);
    }
    return { ok: true, snapshot };
  }

  if (operation === "shared_dungeon_step") {
    const result = engine.headlessAdvanceSharedDungeonState(
      String(input.sharedPayload ?? input.worldPayload ?? ""),
      Array.isArray(input.characterEntries) ? input.characterEntries : [],
      input.options ?? {}
    );
    if (!result) return fail("Could not advance shared dungeon state.");
    return { ok: true, result };
  }

  if (operation === "command") {
    const opStartMs = Date.now();
    const worldPayload = String(input.worldPayload ?? "");
    let entry = getCachedSessionState(sessionId, worldPayload);
    let state = entry?.state ?? null;
    if (!state) {
      state = engine.headlessStateFromPayload(worldPayload);
      if (!state) return fail("Invalid canonical run payload.");
      if (sessionId) {
        setCachedSessionState(sessionId, worldPayload, state);
        entry = getCachedSessionState(sessionId, worldPayload);
      }
    }

    const nowMs = Date.now();
    const nowTick = Math.max(0, Math.floor(nowMs / AUTHORITATIVE_TICK_MS));
    const previousTick = Number.isFinite(entry?.lastTick) ? Math.max(0, Math.floor(entry.lastTick)) : 0;
    const serverTick = Math.max(previousTick + 1, nowTick + 1);
    const executeAtMs = serverTick * AUTHORITATIVE_TICK_MS;
    const waitMs = Math.max(0, executeAtMs - nowMs);
    if (entry && typeof entry === "object") {
      entry.lastTick = serverTick;
      entry.updatedAt = nowMs;
    }
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const result = typeof engine.headlessExecuteCommandOnState === "function"
      ? engine.headlessExecuteCommandOnState(state, input.command ?? {}, "", {
          basePayload: worldPayload,
          nowMs: executeAtMs,
        })
      : engine.headlessExecuteCommandPayload(worldPayload, input.command ?? {}, "");
    if (sessionId && result && typeof result === "object") {
      const nextPayload = String(result?.snapshot?.payload ?? "");
      if (nextPayload && state) {
        setCachedSessionState(sessionId, nextPayload, state);
        const nextEntry = getCachedSessionState(sessionId, nextPayload);
        if (nextEntry && typeof nextEntry === "object") {
          nextEntry.lastTick = serverTick;
        }
      }
      else clearCachedSessionState(sessionId);
      const perf = (result.perf && typeof result.perf === "object") ? { ...result.perf } : {};
      perf.daemonMs = Math.max(0, Date.now() - opStartMs);
      result.perf = perf;
      result.tick = {
        serverTick,
        tickMs: AUTHORITATIVE_TICK_MS,
        inputWindowMs: AUTHORITATIVE_INPUT_WINDOW_MS,
      };
    }
    return result;
  }

  if (operation === "set_movement_intent") {
    const worldPayload = String(input.worldPayload ?? "");
    let entry = getCachedSessionState(sessionId, worldPayload);
    let state = entry?.state ?? null;
    if (!state) {
      if (!worldPayload.trim()) return fail("Authoritative session cache miss.");
      state = engine.headlessStateFromPayload(worldPayload);
      if (!state) return fail("Invalid canonical run payload.");
      if (sessionId) {
        setCachedSessionState(sessionId, worldPayload, state);
        entry = getCachedSessionState(sessionId, worldPayload);
      }
    }
    ensureMovementState(entry);
    updateSessionMovementIntent(entry, {
      holdDir: input.holdDir ?? input.dir ?? "",
      active: input.active === true,
      enqueueDir: input.enqueueDir ?? "",
      intentSeq: input.intentSeq ?? 0,
    });
    if (entry && typeof entry === "object") {
      entry.updatedAt = Date.now();
    }
    return {
      ok: true,
      sessionId,
      intent: movementIntentSummary(entry),
      tick: {
        serverTick: Number.isFinite(entry?.lastTick) ? Math.max(0, Math.floor(entry.lastTick)) : 0,
        tickMs: AUTHORITATIVE_TICK_MS,
        inputWindowMs: AUTHORITATIVE_INPUT_WINDOW_MS,
      },
    };
  }

  if (operation === "poll_movement") {
    const opStartMs = Date.now();
    const worldPayload = String(input.worldPayload ?? "");
    let entry = getCachedSessionState(sessionId, worldPayload);
    let state = entry?.state ?? null;
    if (!state) {
      if (!worldPayload.trim()) return fail("Authoritative session cache miss.");
      state = engine.headlessStateFromPayload(worldPayload);
      if (!state) return fail("Invalid canonical run payload.");
      if (sessionId) {
        setCachedSessionState(sessionId, worldPayload, state);
        entry = getCachedSessionState(sessionId, worldPayload);
      }
    }
    ensureMovementState(entry);
    const timeoutMs = Math.max(100, Math.min(30000, Math.floor(Number(input.timeoutMs ?? 0) || 25000)));
    const deadlineMs = Date.now() + timeoutMs;
    const minResponseMs = Math.max(
      0,
      Math.min(
        Math.floor(timeoutMs / 2),
        Math.floor(Number(input.minResponseMs ?? AUTHORITATIVE_POLL_MIN_RESPONSE_MS) || AUTHORITATIVE_POLL_MIN_RESPONSE_MS)
      )
    );
    const earliestResponseAtMs = opStartMs + minResponseMs;
    let lastTick = Number.isFinite(entry?.lastTick)
      ? Math.max(0, Math.floor(entry.lastTick))
      : Math.max(0, Math.floor(Date.now() / AUTHORITATIVE_TICK_MS));
    let changedTickCount = 0;
    let changedResult = null;
    let changedServerTick = lastTick;

    while (Date.now() < deadlineMs) {
      const nowMs = Date.now();
      const currentTick = Math.max(0, Math.floor(nowMs / AUTHORITATIVE_TICK_MS));
      const previousTick = Number.isFinite(entry?.lastTick)
        ? Math.max(0, Math.floor(entry.lastTick))
        : Math.max(lastTick, currentTick);
      const serverTick = Math.max(previousTick + 1, currentTick + 1);
      const executeAtMs = serverTick * AUTHORITATIVE_TICK_MS;
      if (executeAtMs > deadlineMs) break;

      const waitMs = Math.max(0, executeAtMs - nowMs);
      if (waitMs > 0) await sleep(waitMs);

      if (entry && typeof entry === "object") {
        entry.lastTick = serverTick;
        entry.updatedAt = Date.now();
      }
      lastTick = serverTick;

      const intentActive = entry?.movementIntent?.active === true;
      const holdDir = intentActive ? normalizeMoveDir(entry?.movementIntent?.dir ?? "") : "";
      let enqueueDir = "";
      if (Array.isArray(entry?.pendingMoves) && entry.pendingMoves.length > 0) {
        enqueueDir = normalizeMoveDir(entry.pendingMoves.shift() ?? "");
      }

      const beforeProbe = capturePollStateProbe(state);
      const basePayload = String(entry?.worldPayload ?? worldPayload);
      const result = typeof engine.headlessExecuteCommandOnState === "function"
        ? engine.headlessExecuteCommandOnState(state, {
            type: "LIVE_POLL_TICK",
            holdDir,
            active: intentActive,
            enqueueDir,
          }, "", {
            basePayload,
            nowMs: executeAtMs,
            maxCatchupTicks: 1,
          })
        : engine.headlessExecuteCommandPayload(basePayload, { type: "WAIT" }, "");
      if (!result || typeof result !== "object") {
        return fail("Movement poll tick failed.");
      }

      const afterProbe = capturePollStateProbe(state);
      const changed = pollStateProbeChanged(beforeProbe, afterProbe) || result.moved === true;
      if (changed) {
        changedTickCount += 1;
        changedResult = result;
        changedServerTick = serverTick;
        const nowAfterChange = Date.now();
        if (
          nowAfterChange >= earliestResponseAtMs
          || changedTickCount >= AUTHORITATIVE_POLL_MAX_BATCH_CHANGED_TICKS
          || (deadlineMs - nowAfterChange) <= AUTHORITATIVE_TICK_MS
        ) {
          const nextPayload = String(changedResult?.snapshot?.payload ?? "");
          if (nextPayload && entry && typeof entry === "object") {
            entry.worldPayload = nextPayload;
            entry.updatedAt = nowAfterChange;
          }
          const perf = (changedResult?.perf && typeof changedResult.perf === "object")
            ? { ...changedResult.perf }
            : {};
          if (changedTickCount > 1) {
            // Multi-tick batches produce a payload diff from the cached base payload;
            // suppress single-tick hot delta to avoid partial client application.
            changedResult.hotDelta = null;
          }
          perf.daemonMs = Math.max(0, Date.now() - opStartMs);
          return {
            ...changedResult,
            ok: changedResult?.ok !== false,
            changed: true,
            sessionId,
            intent: movementIntentSummary(entry),
            perf,
            tick: {
              serverTick: changedServerTick,
              tickMs: AUTHORITATIVE_TICK_MS,
              inputWindowMs: AUTHORITATIVE_INPUT_WINDOW_MS,
            },
          };
        }
      }

      // If we already captured a changed result, flush it as soon as the
      // minimum response window has elapsed even when subsequent ticks are idle.
      if (changedResult && Date.now() >= earliestResponseAtMs) {
        const nextPayload = String(changedResult?.snapshot?.payload ?? "");
        if (nextPayload && entry && typeof entry === "object") {
          entry.worldPayload = nextPayload;
          entry.updatedAt = Date.now();
        }
        const perf = (changedResult?.perf && typeof changedResult.perf === "object")
          ? { ...changedResult.perf }
          : {};
        if (changedTickCount > 1) {
          changedResult.hotDelta = null;
        }
        perf.daemonMs = Math.max(0, Date.now() - opStartMs);
        return {
          ...changedResult,
          ok: changedResult?.ok !== false,
          changed: true,
          sessionId,
          intent: movementIntentSummary(entry),
          perf,
          tick: {
            serverTick: changedServerTick,
            tickMs: AUTHORITATIVE_TICK_MS,
            inputWindowMs: AUTHORITATIVE_INPUT_WINDOW_MS,
          },
        };
      }
    }

    if (changedResult) {
      const nextPayload = String(changedResult?.snapshot?.payload ?? "");
      if (nextPayload && entry && typeof entry === "object") {
        entry.worldPayload = nextPayload;
        entry.updatedAt = Date.now();
      }
      const perf = (changedResult?.perf && typeof changedResult.perf === "object")
        ? { ...changedResult.perf }
        : {};
      if (changedTickCount > 1) {
        changedResult.hotDelta = null;
      }
      perf.daemonMs = Math.max(0, Date.now() - opStartMs);
      return {
        ...changedResult,
        ok: changedResult?.ok !== false,
        changed: true,
        sessionId,
        intent: movementIntentSummary(entry),
        perf,
        tick: {
          serverTick: changedServerTick,
          tickMs: AUTHORITATIVE_TICK_MS,
          inputWindowMs: AUTHORITATIVE_INPUT_WINDOW_MS,
        },
      };
    }

    return {
      ok: true,
      changed: false,
      sessionId,
      intent: movementIntentSummary(entry),
      tick: {
        serverTick: Math.max(0, Math.floor(lastTick)),
        tickMs: AUTHORITATIVE_TICK_MS,
        inputWindowMs: AUTHORITATIVE_INPUT_WINDOW_MS,
      },
      perf: {
        daemonMs: Math.max(0, Date.now() - opStartMs),
      },
    };
  }

  return fail(`Unsupported worker operation: ${operation}`);
}

function cleanupAndExit(exitCode = 0) {
  appendRuntimeLog(`cleanupAndExit code=${exitCode}`);
  try {
    fs.unlinkSync(socketPath);
  } catch {}
  process.exit(exitCode);
}

try {
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });
} catch {}
ensureRuntimeDirs();

try {
  fs.unlinkSync(socketPath);
} catch {}

const server = net.createServer({ allowHalfOpen: true }, (socket) => {
  let raw = "";
  let handled = false;
  socket.setEncoding("utf8");

  const finalize = async () => {
    if (handled) return;
    handled = true;
    let result;
    try {
      result = await handleOperation(raw);
    } catch (err) {
      result = fail(err?.message ?? "Unhandled authoritative daemon error.");
    }
    socket.end(JSON.stringify(result));
  };

  socket.on("data", (chunk) => {
    raw += chunk;
    if (!handled && raw.includes("\n")) {
      void finalize();
    }
  });

  socket.on("end", async () => {
    await finalize();
  });

  socket.on("error", () => {
    socket.destroy();
  });
});

server.on("error", (err) => {
  appendRuntimeLog(`server error: ${err?.stack ?? err?.message ?? "unknown"}`);
  process.stderr.write(`${err?.message ?? "Authoritative daemon server error."}\n`);
  cleanupAndExit(1);
});

server.listen(socketPath, () => {
  appendRuntimeLog(`listening socket=${socketPath}`);
  try {
    fs.chmodSync(socketPath, 0o660);
  } catch {}
});

process.on("beforeExit", (code) => {
  appendRuntimeLog(`beforeExit code=${code}`);
});
process.on("exit", (code) => {
  appendRuntimeLog(`exit code=${code}`);
});
process.on("uncaughtException", (err) => {
  appendRuntimeLog(`uncaughtException: ${err?.stack ?? err?.message ?? "unknown"}`);
  cleanupAndExit(1);
});
process.on("unhandledRejection", (reason) => {
  appendRuntimeLog(`unhandledRejection: ${reason?.stack ?? reason?.message ?? String(reason ?? "unknown")}`);
  cleanupAndExit(1);
});
process.on("SIGINT", () => cleanupAndExit(0));
process.on("SIGTERM", () => cleanupAndExit(0));
