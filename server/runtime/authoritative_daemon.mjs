import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

import { createHeadlessBrowserEnv } from "./headless_env.mjs";

createHeadlessBrowserEnv();

const engine = await import("../../game.js");
const socketPath = String(process.argv[2] ?? "").trim();

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

async function handleOperation(raw = "") {
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
