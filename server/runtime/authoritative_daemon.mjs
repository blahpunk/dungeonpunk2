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

if (!socketPath) {
  throw new Error("Missing authoritative daemon socket path.");
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
    return engine.headlessExecuteCommandPayload(
      String(input.worldPayload ?? ""),
      input.command ?? {},
      String(input.characterPayload ?? "")
    );
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
