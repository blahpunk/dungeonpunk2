import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createHeadlessBrowserEnv } from "./headless_env.mjs";

createHeadlessBrowserEnv();

const engine = await import("../../game.js");

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTHORITATIVE_RUNTIME_DIR = path.join(PROJECT_ROOT, ".runtime", "authoritative_runtime");
const SESSION_CACHE_DIR = path.join(AUTHORITATIVE_RUNTIME_DIR, "session_cache");
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
const AUTHORITATIVE_TICK_MS = 12;

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

function sleep(ms = 0) {
  const delay = Math.max(0, Math.floor(Number(ms) || 0));
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
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
  entry.lastTick = Number.isFinite(entry.lastTick) ? Math.max(0, Math.floor(entry.lastTick)) : 0;
  entry.updatedAt = Number.isFinite(entry.updatedAt) ? Math.max(0, Math.floor(entry.updatedAt)) : Date.now();
  entry.worldPayload = String(entry.worldPayload ?? "");
  return entry;
}

function loadCachedSessionEntry(sessionId = "", worldPayload = "") {
  const cachePath = sessionCachePath(sessionId);
  if (!cachePath || !fs.existsSync(cachePath)) {
    if (!String(worldPayload ?? "").trim()) return null;
    return ensureMovementState({
      worldPayload: String(worldPayload ?? ""),
      updatedAt: Date.now(),
      lastTick: 0,
    });
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const entry = ensureMovementState(parsed && typeof parsed === "object" ? parsed : {});
    const requestedPayload = String(worldPayload ?? "");
    if (requestedPayload.trim()) entry.worldPayload = requestedPayload;
    return entry;
  } catch {
    if (!String(worldPayload ?? "").trim()) return null;
    return ensureMovementState({
      worldPayload: String(worldPayload ?? ""),
      updatedAt: Date.now(),
      lastTick: 0,
    });
  }
}

function saveCachedSessionEntry(sessionId = "", entry = null) {
  const cachePath = sessionCachePath(sessionId);
  const normalized = ensureMovementState(entry);
  if (!cachePath || !normalized) return;
  ensureRuntimeDirs();
  const tmpPath = `${cachePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(normalized), "utf8");
  fs.renameSync(tmpPath, cachePath);
}

function clearCachedSessionEntry(sessionId = "") {
  const cachePath = sessionCachePath(sessionId);
  if (!cachePath) return;
  try {
    fs.unlinkSync(cachePath);
  } catch {}
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
    return { active: false, dir: "", queued: 0, seq: 0 };
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

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function fail(message, extra = {}) {
  return {
    ok: false,
    error: String(message ?? "Authoritative worker failed."),
    ...extra,
  };
}

async function main() {
  refreshMonsterRuntimeConfig();
  ensureRuntimeDirs();
  const raw = await readStdin();
  const input = raw.trim() ? JSON.parse(raw) : {};
  const operation = normalizeOperation(input.operation ?? "");
  const sessionId = normalizeSessionId(input.sessionId ?? input.session_id ?? "");

  if (operation === "bootstrap") {
    const snapshot = engine.headlessBootstrapState(input.options ?? {});
    if (!snapshot) return fail("Could not bootstrap authoritative state.");
    if (sessionId) {
      const payload = String(snapshot?.payload ?? "");
      saveCachedSessionEntry(sessionId, {
        worldPayload: payload,
        updatedAt: Date.now(),
        lastTick: 0,
      });
    }
    return { ok: true, snapshot };
  }

  if (operation === "snapshot") {
    const state = engine.headlessStateFromPayload(String(input.worldPayload ?? ""));
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
      saveCachedSessionEntry(sessionId, {
        worldPayload: payload,
        updatedAt: Date.now(),
        lastTick: 0,
      });
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
    const nowMs = Date.now();
    const nowTick = Math.max(0, Math.floor(nowMs / AUTHORITATIVE_TICK_MS));
    const serverTick = nowTick + 1;
    const executeAtMs = serverTick * AUTHORITATIVE_TICK_MS;
    const waitMs = Math.max(0, executeAtMs - nowMs);
    if (waitMs > 0) await sleep(waitMs);
    const worldPayload = String(input.worldPayload ?? "");
    let result;
    if (typeof engine.headlessExecuteCommandOnState === "function") {
      const state = engine.headlessStateFromPayload(worldPayload);
      if (!state) return fail("Invalid canonical run payload.");
      result = engine.headlessExecuteCommandOnState(state, input.command ?? {}, "", {
        basePayload: worldPayload,
        nowMs: executeAtMs,
      });
    } else {
      result = engine.headlessExecuteCommandPayload(
        worldPayload,
        input.command ?? {},
        ""
      );
    }
    if (result && typeof result === "object") {
      if (sessionId) {
        const nextPayload = String(result?.snapshot?.payload ?? worldPayload);
        if (nextPayload) {
          const cached = loadCachedSessionEntry(sessionId, nextPayload) ?? {};
          cached.worldPayload = nextPayload;
          cached.updatedAt = Date.now();
          cached.lastTick = serverTick;
          saveCachedSessionEntry(sessionId, cached);
        } else {
          clearCachedSessionEntry(sessionId);
        }
      }
      const perf = (result.perf && typeof result.perf === "object") ? { ...result.perf } : {};
      perf.workerMs = Math.max(0, Date.now() - opStartMs);
      result.perf = perf;
      result.tick = {
        serverTick,
        tickMs: AUTHORITATIVE_TICK_MS,
        inputWindowMs: AUTHORITATIVE_TICK_MS,
      };
    }
    return result;
  }

  if (operation === "set_movement_intent") {
    const worldPayload = String(input.worldPayload ?? "");
    const entry = loadCachedSessionEntry(sessionId, worldPayload);
    if (!entry || (!entry.worldPayload.trim() && !worldPayload.trim())) {
      return fail("Authoritative session cache miss.");
    }
    if (!entry.worldPayload.trim()) entry.worldPayload = worldPayload;
    updateSessionMovementIntent(entry, {
      holdDir: input.holdDir ?? input.dir ?? "",
      active: input.active === true,
      enqueueDir: input.enqueueDir ?? "",
      intentSeq: input.intentSeq ?? 0,
    });
    entry.updatedAt = Date.now();
    saveCachedSessionEntry(sessionId, entry);
    return {
      ok: true,
      sessionId,
      intent: movementIntentSummary(entry),
      tick: {
        serverTick: Math.max(0, Math.floor(Number(entry.lastTick ?? 0) || 0)),
        tickMs: AUTHORITATIVE_TICK_MS,
        inputWindowMs: AUTHORITATIVE_TICK_MS,
      },
    };
  }

  if (operation === "poll_movement") {
    const opStartMs = Date.now();
    const worldPayload = String(input.worldPayload ?? "");
    const entry = loadCachedSessionEntry(sessionId, worldPayload);
    if (!entry || (!entry.worldPayload.trim() && !worldPayload.trim())) {
      return fail("Authoritative session cache miss.");
    }
    const payload = String(entry.worldPayload ?? worldPayload);
    const state = engine.headlessStateFromPayload(payload);
    if (!state) return fail("Invalid canonical run payload.");
    const timeoutMs = Math.max(100, Math.min(30000, Math.floor(Number(input.timeoutMs ?? 0) || 25000)));
    const deadlineMs = Date.now() + timeoutMs;
    const minResponseMs = Math.max(0, Math.min(Math.floor(timeoutMs / 2), Math.floor(Number(input.minResponseMs ?? 8) || 8)));
    const earliestResponseAtMs = opStartMs + minResponseMs;
    let lastTick = Math.max(0, Math.floor(Number(entry.lastTick ?? 0) || 0));
    let changedResult = null;
    let changedServerTick = lastTick;
    let changedTickCount = 0;

    while (Date.now() < deadlineMs) {
      const nowMs = Date.now();
      const currentTick = Math.max(0, Math.floor(nowMs / AUTHORITATIVE_TICK_MS));
      const serverTick = Math.max(lastTick + 1, currentTick + 1);
      const executeAtMs = serverTick * AUTHORITATIVE_TICK_MS;
      if (executeAtMs > deadlineMs) break;
      const waitMs = Math.max(0, executeAtMs - nowMs);
      if (waitMs > 0) await sleep(waitMs);
      entry.lastTick = serverTick;
      entry.updatedAt = Date.now();
      lastTick = serverTick;

      const holdDir = entry.movementIntent?.active === true ? normalizeMoveDir(entry.movementIntent?.dir ?? "") : "";
      const enqueueDir = Array.isArray(entry.pendingMoves) && entry.pendingMoves.length > 0
        ? normalizeMoveDir(entry.pendingMoves.shift() ?? "")
        : "";
      const beforeProbe = capturePollStateProbe(state);
      const result = typeof engine.headlessExecuteCommandOnState === "function"
        ? engine.headlessExecuteCommandOnState(state, {
            type: "LIVE_POLL_TICK",
            holdDir,
            active: entry.movementIntent?.active === true,
            enqueueDir,
          }, "", {
            basePayload: String(entry.worldPayload ?? ""),
            nowMs: executeAtMs,
            maxCatchupTicks: 1,
          })
        : engine.headlessExecuteCommandPayload(String(entry.worldPayload ?? ""), { type: "WAIT" }, "");
      if (!result || typeof result !== "object") {
        return fail("Movement poll tick failed.");
      }
      const afterProbe = capturePollStateProbe(state);
      const changed = pollStateProbeChanged(beforeProbe, afterProbe) || result.moved === true;
      if (changed) {
        changedResult = result;
        changedServerTick = serverTick;
        changedTickCount += 1;
        if (Date.now() >= earliestResponseAtMs || changedTickCount >= 1) break;
      }
      if (changedResult && Date.now() >= earliestResponseAtMs) break;
    }

    if (!changedResult) {
      saveCachedSessionEntry(sessionId, entry);
      return {
        ok: true,
        changed: false,
        sessionId,
        intent: movementIntentSummary(entry),
        tick: {
          serverTick: Math.max(0, Math.floor(lastTick)),
          tickMs: AUTHORITATIVE_TICK_MS,
          inputWindowMs: AUTHORITATIVE_TICK_MS,
        },
        perf: {
          daemonMs: Math.max(0, Date.now() - opStartMs),
        },
      };
    }

    const nextPayload = String(changedResult?.snapshot?.payload ?? "");
    if (nextPayload) entry.worldPayload = nextPayload;
    entry.updatedAt = Date.now();
    saveCachedSessionEntry(sessionId, entry);
    const perf = (changedResult?.perf && typeof changedResult.perf === "object")
      ? { ...changedResult.perf }
      : {};
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
        inputWindowMs: AUTHORITATIVE_TICK_MS,
      },
    };
  }

  return fail(`Unsupported worker operation: ${operation}`);
}

try {
  const result = await main();
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  const payload = fail(err?.message ?? "Unhandled authoritative worker error.");
  process.stdout.write(JSON.stringify(payload));
  process.exitCode = 1;
}
