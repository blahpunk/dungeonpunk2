import { createHeadlessBrowserEnv } from "./headless_env.mjs";

createHeadlessBrowserEnv();

const engine = await import("../../game.js");

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
    return engine.headlessExecuteCommandPayload(
      String(input.worldPayload ?? ""),
      input.command ?? {},
      String(input.characterPayload ?? "")
    );
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
