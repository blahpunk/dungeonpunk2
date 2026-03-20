import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createHeadlessBrowserEnv } from "./headless_env.mjs";

createHeadlessBrowserEnv();

const engine = await import("../../game.js");
const socketPath = String(process.argv[2] ?? "").trim();
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
const AUTHORITATIVE_TICK_MS = 50;
const AUTHORITATIVE_INPUT_WINDOW_MS = 50;
const sessionStateCache = new Map();

if (!socketPath) {
  throw new Error("Missing authoritative daemon socket path.");
}

function normalizeSessionId(value = "") {
  const id = String(value ?? "").trim();
  return /^[a-z0-9_\-]{8,160}$/i.test(id) ? id : "";
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
  const entry = sessionStateCache.get(key);
  if (!entry || typeof entry !== "object") return null;
  if (String(entry.worldPayload ?? "") !== String(worldPayload ?? "")) return null;
  entry.updatedAt = Date.now();
  return entry;
}

function setCachedSessionState(sessionId = "", worldPayload = "", state = null) {
  const key = normalizeSessionId(sessionId);
  if (!key || !state) return;
  pruneSessionStateCache(Date.now());
  const prev = sessionStateCache.get(key);
  sessionStateCache.set(key, {
    worldPayload: String(worldPayload ?? ""),
    state,
    lastTick: Number.isFinite(prev?.lastTick) ? Math.max(0, Math.floor(prev.lastTick)) : 0,
    updatedAt: Date.now(),
  });
}

function clearCachedSessionState(sessionId = "") {
  const key = normalizeSessionId(sessionId);
  if (!key) return;
  sessionStateCache.delete(key);
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
  const operation = String(input.operation ?? "").trim();
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
    const serverTick = Math.max(previousTick + 1, nowTick);
    if (entry && typeof entry === "object") {
      entry.lastTick = serverTick;
      entry.updatedAt = nowMs;
    }

    const result = typeof engine.headlessExecuteCommandOnState === "function"
      ? engine.headlessExecuteCommandOnState(state, input.command ?? {}, "", { basePayload: worldPayload })
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

  return fail(`Unsupported worker operation: ${operation}`);
}

function cleanupAndExit(exitCode = 0) {
  try {
    fs.unlinkSync(socketPath);
  } catch {}
  process.exit(exitCode);
}

try {
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });
} catch {}

try {
  fs.unlinkSync(socketPath);
} catch {}

const server = net.createServer({ allowHalfOpen: true }, (socket) => {
  let raw = "";
  socket.setEncoding("utf8");

  socket.on("data", (chunk) => {
    raw += chunk;
  });

  socket.on("end", async () => {
    let result;
    try {
      result = await handleOperation(raw);
    } catch (err) {
      result = fail(err?.message ?? "Unhandled authoritative daemon error.");
    }
    socket.end(JSON.stringify(result));
  });

  socket.on("error", () => {
    socket.destroy();
  });
});

server.on("error", (err) => {
  process.stderr.write(`${err?.message ?? "Authoritative daemon server error."}\n`);
  cleanupAndExit(1);
});

server.listen(socketPath, () => {
  try {
    fs.chmodSync(socketPath, 0o660);
  } catch {}
});

process.on("SIGINT", () => cleanupAndExit(0));
process.on("SIGTERM", () => cleanupAndExit(0));
