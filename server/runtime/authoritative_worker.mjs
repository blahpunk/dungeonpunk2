import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createHeadlessBrowserEnv } from "./headless_env.mjs";

createHeadlessBrowserEnv();

const engine = await import("../../game.js");

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
const AUTHORITATIVE_TICK_MS = 16;

function sleep(ms = 0) {
  const delay = Math.max(0, Math.floor(Number(ms) || 0));
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
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
  const raw = await readStdin();
  const input = raw.trim() ? JSON.parse(raw) : {};
  const operation = String(input.operation ?? "").trim();

  if (operation === "bootstrap") {
    const snapshot = engine.headlessBootstrapState(input.options ?? {});
    if (!snapshot) return fail("Could not bootstrap authoritative state.");
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
    return { ok: true, snapshot };
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
