import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";

const PORT = Math.max(1, Math.floor(Number(process.env.DUNGEON25_REALTIME_PORT ?? 8787) || 8787));
const HOST = String(process.env.DUNGEON25_REALTIME_HOST ?? "0.0.0.0").trim() || "0.0.0.0";
const PATHNAME = String(process.env.DUNGEON25_REALTIME_PATH ?? "/realtime").trim() || "/realtime";
const DEFAULT_PHP_URL = String(process.env.DUNGEON25_REALTIME_PHP_URL ?? "").trim();
const POLL_TIMEOUT_MS = Math.max(1000, Math.floor(Number(process.env.DUNGEON25_REALTIME_POLL_TIMEOUT_MS ?? 25000) || 25000));
const POLL_BACKOFF_MS = Math.max(250, Math.floor(Number(process.env.DUNGEON25_REALTIME_POLL_BACKOFF_MS ?? 1000) || 1000));
const REQUEST_TIMEOUT_MS = Math.max(1000, Math.floor(Number(process.env.DUNGEON25_REALTIME_REQUEST_TIMEOUT_MS ?? 30000) || 30000));

let nextClientId = 1;
const clients = new Set();

function nowIso() {
  return new Date().toISOString();
}

function logLine(message = "") {
  process.stdout.write(`[${nowIso()}] ${String(message ?? "").trim()}\n`);
}

function safeJsonParse(raw = "") {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function websocketAcceptValue(key = "") {
  return crypto
    .createHash("sha1")
    .update(`${String(key ?? "").trim()}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, "utf8")
    .digest("base64");
}

function encodeWebSocketFrame(payload = "") {
  const body = Buffer.from(String(payload ?? ""), "utf8");
  const length = body.length;
  let header = null;
  if (length < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x81;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, body]);
}

function decodeWebSocketFrames(buffer = Buffer.alloc(0)) {
  const messages = [];
  let offset = 0;
  let closeRequested = false;
  let pingPayloads = [];
  while ((offset + 2) <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let payloadLength = second & 0x7f;
    let headerLength = 2;
    if (payloadLength === 126) {
      if ((offset + 4) > buffer.length) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if ((offset + 10) > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Realtime websocket frame too large.");
      }
      payloadLength = Number(bigLength);
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;
    if ((offset + frameLength) > buffer.length) break;
    const maskOffset = offset + headerLength;
    const payloadOffset = maskOffset + maskLength;
    let payload = buffer.subarray(payloadOffset, payloadOffset + payloadLength);
    if (masked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      const unmasked = Buffer.from(payload);
      for (let i = 0; i < unmasked.length; i += 1) {
        unmasked[i] ^= mask[i % 4];
      }
      payload = unmasked;
    }
    offset += frameLength;
    if (opcode === 0x8) {
      closeRequested = true;
      break;
    }
    if (opcode === 0x9) {
      pingPayloads.push(Buffer.from(payload));
      continue;
    }
    if (opcode === 0xA) continue;
    if (opcode !== 0x1) continue;
    messages.push(payload.toString("utf8"));
  }
  return {
    messages,
    remaining: buffer.subarray(offset),
    closeRequested,
    pingPayloads,
  };
}

function sendPong(socket, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? "");
  const length = body.length;
  let header = null;
  if (length < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x8A;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x8A;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x8A;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  socket.write(Buffer.concat([header, body]));
}

function resolvePhpUrl(client, explicitUrl = "") {
  const candidate = String(explicitUrl ?? "").trim() || String(client.phpBaseUrl ?? "").trim() || DEFAULT_PHP_URL;
  if (!candidate) throw new Error("Realtime transport is missing a PHP authoritative endpoint URL.");
  return candidate;
}

function extractSessionId(response = null) {
  const data = (response && typeof response === "object") ? response : {};
  const direct = String(data.sessionId ?? data.session_id ?? "").trim();
  if (direct) return direct;
  const snapshotSession = String(data.snapshot?.sessionId ?? data.snapshot?.session_id ?? "").trim();
  if (snapshotSession) return snapshotSession;
  return "";
}

function bindAbortSignal(controller, signal = null) {
  if (!controller || !signal || typeof signal.addEventListener !== "function") {
    return { cleanup() {}, externallyAborted: () => false };
  }
  let externalAbort = false;
  const forwardAbort = () => {
    externalAbort = true;
    try {
      controller.abort(signal.reason ?? new Error("Realtime authoritative proxy aborted."));
    } catch {}
  };
  if (signal.aborted) {
    forwardAbort();
    return { cleanup() {}, externallyAborted: () => externalAbort };
  }
  signal.addEventListener("abort", forwardAbort, { once: true });
  return {
    cleanup() {
      try {
        signal.removeEventListener("abort", forwardAbort);
      } catch {}
    },
    externallyAborted: () => externalAbort,
  };
}

async function forwardPhpAuthoritative(client, body = null, requestOptions = null) {
  const payload = (body && typeof body === "object") ? { ...body } : {};
  if (client.browserInstanceId && payload.browser_instance_id === undefined) {
    payload.browser_instance_id = client.browserInstanceId;
  }
  if (typeof client.liveTickCombat === "boolean" && payload.live_tick_combat === undefined) {
    payload.live_tick_combat = client.liveTickCombat;
  }
  if (client.csrfToken && payload._csrf === undefined) {
    payload._csrf = client.csrfToken;
  }
  payload._req_id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const opts = (requestOptions && typeof requestOptions === "object") ? requestOptions : {};
  const controller = new AbortController();
  const abortRelay = bindAbortSignal(controller, opts.signal);
  const timeoutMs = Math.max(1000, Math.floor(Number(opts.timeoutMs ?? REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS));
  const timeout = setTimeout(() => controller.abort(new Error("Realtime authoritative proxy timed out.")), timeoutMs);
  try {
    try {
      const response = await fetch(resolvePhpUrl(client, opts.phpBaseUrl ?? payload.php_base_url ?? ""), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          ...(client.csrfToken ? { "X-CSRF-Token": client.csrfToken } : {}),
          ...(client.cookieHeader ? { Cookie: client.cookieHeader } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await response.text();
      const data = safeJsonParse(raw);
      if (!response.ok) {
        const message = String(data?.error ?? `Realtime authoritative proxy failed (${response.status}).`).trim();
        const error = new Error(message);
        error.response = data && typeof data === "object" ? data : null;
        throw error;
      }
      if (!data || typeof data !== "object") {
        throw new Error("Realtime authoritative proxy returned invalid JSON.");
      }
      return data;
    } catch (error) {
      if (abortRelay.externallyAborted()) {
        const abortError = new Error("Realtime authoritative proxy aborted.");
        abortError.name = "AbortError";
        abortError.code = "ERR_REALTIME_REQUEST_ABORTED";
        throw abortError;
      }
      throw error;
    }
  } finally {
    abortRelay.cleanup();
    clearTimeout(timeout);
  }
}

function sendMessage(client, message = null) {
  if (!client?.alive || !client.socket?.writable) return false;
  const payload = JSON.stringify((message && typeof message === "object") ? message : {});
  client.socket.write(encodeWebSocketFrame(payload));
  return true;
}

async function delay(ms = 0) {
  const duration = Math.max(0, Math.floor(Number(ms) || 0));
  if (duration <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, duration));
}

function stopPollLoop(client) {
  if (!client) return;
  client.pollGeneration += 1;
  if (client.pollAbortController) {
    try { client.pollAbortController.abort(); } catch {}
  }
  client.pollAbortController = null;
}

function startPollLoop(client) {
  if (!client?.alive) return;
  const sessionId = String(client.sessionId ?? "").trim();
  if (!sessionId || !client.phpBaseUrl) return;
  if (client.pollPromise) return;
  const generation = client.pollGeneration + 1;
  client.pollGeneration = generation;
  client.pollPromise = (async () => {
    while (client.alive && String(client.sessionId ?? "").trim() === sessionId && client.pollGeneration === generation) {
      const controller = new AbortController();
      client.pollAbortController = controller;
      try {
        const response = await forwardPhpAuthoritative(client, {
          action: "poll_movement",
          session_id: sessionId,
          timeout_ms: POLL_TIMEOUT_MS,
          min_response_ms: 0,
        }, {
          timeoutMs: POLL_TIMEOUT_MS + 5000,
          signal: controller.signal,
        });
        if (!client.alive || client.pollGeneration !== generation || String(client.sessionId ?? "").trim() !== sessionId) break;
        sendMessage(client, {
          type: "world_delta",
          sessionId,
          deltaSeq: (client.deltaSequence = Math.max(0, Math.floor(Number(client.deltaSequence ?? 0) || 0)) + 1),
          data: response,
        });
      } catch (error) {
        if (!client.alive || client.pollGeneration !== generation || error?.code === "ERR_REALTIME_REQUEST_ABORTED") break;
        sendMessage(client, {
          type: "error",
          source: "poll_movement",
          sessionId,
          error: String(error?.message ?? "Realtime movement poll failed.").trim() || "Realtime movement poll failed.",
        });
        await delay(POLL_BACKOFF_MS);
      } finally {
        if (client.pollAbortController === controller) client.pollAbortController = null;
      }
    }
  })().finally(() => {
    if (client.pollGeneration === generation) {
      client.pollPromise = null;
      client.pollAbortController = null;
    }
  });
}

async function handleClientRequest(client, message = null) {
  const msg = (message && typeof message === "object") ? message : {};
  const type = String(msg.type ?? "").trim().toLowerCase();
  const requestId = String(msg.requestId ?? msg.request_id ?? "").trim();
  const payload = (msg.payload && typeof msg.payload === "object") ? msg.payload : {};
  if (!type) {
    sendMessage(client, { type: "error", requestId, error: "Missing realtime message type." });
    return;
  }

  if (type === "auth") {
    client.csrfToken = String(payload.csrfToken ?? payload.csrf_token ?? client.csrfToken ?? "").trim();
    client.browserInstanceId = String(payload.browserInstanceId ?? payload.browser_instance_id ?? client.browserInstanceId ?? "").trim();
    client.phpBaseUrl = String(payload.phpBaseUrl ?? payload.php_base_url ?? client.phpBaseUrl ?? DEFAULT_PHP_URL).trim();
    if (typeof payload.liveTickCombat === "boolean") client.liveTickCombat = payload.liveTickCombat;
    sendMessage(client, {
      type: "auth",
      requestId,
      ok: true,
      transport: "realtime_socket",
      phpBaseUrl: client.phpBaseUrl,
      browserInstanceId: client.browserInstanceId,
    });
    return;
  }

  const proxyPhp = async (action, responseType, extraPayload = null, options = null) => {
    const body = {
      action,
      ...((extraPayload && typeof extraPayload === "object") ? extraPayload : {}),
    };
    const response = await forwardPhpAuthoritative(client, body, options);
    const nextSessionId = extractSessionId(response) || String(body.session_id ?? body.sessionId ?? client.sessionId ?? "").trim();
    if (nextSessionId) client.sessionId = nextSessionId;
    if (["session_opened", "snapshot", "character_switched", "shared_dungeon_reset"].includes(responseType)) {
      client.deltaSequence = 0;
    }
    return { responseType, response };
  };

  try {
    let handled = null;
    if (type === "open_session") {
      handled = await proxyPhp("open_session", "session_opened", {
        character_id: String(payload.characterId ?? payload.character_id ?? "").trim() || undefined,
        save_id: String(payload.saveId ?? payload.save_id ?? "").trim() || undefined,
        force_entrance: payload.forceEntrance === true || payload.force_entrance === true,
        fresh_world: payload.freshWorld === true || payload.fresh_world === true,
      });
      startPollLoop(client);
    } else if (type === "command") {
      handled = await proxyPhp("command", "command_ack", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
        client_command_seq: Math.max(0, Math.floor(Number(payload.clientCommandSeq ?? payload.client_command_seq ?? 0) || 0)),
        command: payload.command ?? null,
        client_sent_at: Number.isFinite(Number(payload.clientSentAt ?? payload.client_sent_at ?? 0))
          ? Math.floor(Number(payload.clientSentAt ?? payload.client_sent_at ?? 0))
          : Date.now(),
      });
      startPollLoop(client);
    } else if (type === "set_movement_intent") {
      handled = await proxyPhp("set_movement_intent", "movement_intent_ack", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
        hold_dir: String(payload.holdDir ?? payload.hold_dir ?? "").trim() || undefined,
        active: payload.active === true,
        enqueue_dir: String(payload.enqueueDir ?? payload.enqueue_dir ?? "").trim() || undefined,
        intent_seq: Math.max(0, Math.floor(Number(payload.intentSeq ?? payload.intent_seq ?? 0) || 0)),
      });
      startPollLoop(client);
    } else if (type === "request_resync") {
      handled = await proxyPhp("request_resync", "snapshot", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
      });
      startPollLoop(client);
    } else if (type === "switch_character") {
      handled = await proxyPhp("switch_character", "character_switched", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
        character_id: String(payload.characterId ?? payload.character_id ?? "").trim(),
        force_entrance: payload.forceEntrance === true || payload.force_entrance === true,
      });
      stopPollLoop(client);
      startPollLoop(client);
    } else if (type === "new_dungeon") {
      handled = await proxyPhp("new_dungeon", "shared_dungeon_reset", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
      });
      stopPollLoop(client);
      startPollLoop(client);
    } else if (type === "touch_session") {
      handled = await proxyPhp("touch_session", "touch_session_ack", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
        name: String(payload.name ?? "").trim() || undefined,
        species_id: String(payload.speciesId ?? payload.species_id ?? "").trim() || undefined,
        class_id: String(payload.classId ?? payload.class_id ?? "").trim() || undefined,
        dungeon_instance_id: String(payload.dungeonInstanceId ?? payload.dungeon_instance_id ?? "").trim() || undefined,
        x: Number.isFinite(Number(payload.x)) ? Math.floor(Number(payload.x)) : undefined,
        y: Number.isFinite(Number(payload.y)) ? Math.floor(Number(payload.y)) : undefined,
        z: Number.isFinite(Number(payload.z)) ? Math.floor(Number(payload.z)) : undefined,
        hp: Number.isFinite(Number(payload.hp)) ? Math.max(0, Math.floor(Number(payload.hp))) : undefined,
        max_hp: Number.isFinite(Number(payload.maxHp ?? payload.max_hp)) ? Math.max(1, Math.floor(Number(payload.maxHp ?? payload.max_hp))) : undefined,
      }, { timeoutMs: 10000 });
    } else if (type === "session_lock_audit") {
      handled = await proxyPhp("session_lock_audit", "session_lock_audit", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim() || undefined,
      }, { timeoutMs: 10000 });
    } else if (type === "create_character_and_enter") {
      handled = await proxyPhp("create_character_and_enter", "character_switched", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
        character_payload: String(payload.characterPayload ?? payload.character_payload ?? "").trim(),
        name: String(payload.name ?? "").trim(),
      });
      stopPollLoop(client);
      startPollLoop(client);
    } else if (type === "manual_save") {
      handled = await proxyPhp("manual_save", "manual_save_ack", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
        name: String(payload.name ?? "").trim(),
        overwrite_id: String(payload.overwriteId ?? payload.overwrite_id ?? "").trim() || undefined,
        autosave: payload.autosave === true,
      });
    } else if (type === "save_and_exit") {
      handled = await proxyPhp("save_and_exit", "save_and_exit_ack", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
      });
      stopPollLoop(client);
      client.sessionId = "";
    } else if (type === "close_session") {
      handled = await proxyPhp("close_session", "session_closed", {
        session_id: String(payload.sessionId ?? payload.session_id ?? client.sessionId ?? "").trim(),
        reason: String(payload.reason ?? "").trim() || undefined,
      }, { timeoutMs: 10000 });
      stopPollLoop(client);
      client.sessionId = "";
    } else if (type === "disconnect") {
      sendMessage(client, { type: "disconnected", requestId, ok: true });
      client.socket.end();
      return;
    } else {
      throw new Error(`Unsupported realtime request type: ${type}`);
    }

    sendMessage(client, {
      type: handled.responseType,
      requestId,
      ok: handled.response?.ok !== false,
      deltaSeq: Math.max(0, Math.floor(Number(client.deltaSequence ?? 0) || 0)),
      data: handled.response,
    });
  } catch (error) {
    sendMessage(client, {
      type: "error",
      requestId,
      error: String(error?.message ?? "Realtime request failed.").trim() || "Realtime request failed.",
    });
  }
}

function closeClient(client, reason = "socket-closed") {
  if (!client || !client.alive) return;
  client.alive = false;
  stopPollLoop(client);
  clients.delete(client);
  try { client.socket.destroy(); } catch {}
  logLine(`realtime client closed id=${client.id} reason=${reason}`);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      service: "dungeonpunk-realtime",
      clients: clients.size,
      path: PATHNAME,
      phpConfigured: !!DEFAULT_PHP_URL,
    }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Not found." }));
});

server.on("upgrade", (req, socket) => {
  if (req.url !== PATHNAME) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  const upgrade = String(req.headers.upgrade ?? "").trim().toLowerCase();
  const wsKey = String(req.headers["sec-websocket-key"] ?? "").trim();
  if (upgrade !== "websocket" || !wsKey) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${websocketAcceptValue(wsKey)}`,
    "\r\n",
  ];
  socket.write(responseHeaders.join("\r\n"));

  const client = {
    id: nextClientId += 1,
    socket,
    alive: true,
    buffer: Buffer.alloc(0),
    cookieHeader: String(req.headers.cookie ?? "").trim(),
    csrfToken: "",
    browserInstanceId: "",
    phpBaseUrl: DEFAULT_PHP_URL,
    liveTickCombat: null,
    sessionId: "",
    pollPromise: null,
    pollAbortController: null,
    pollGeneration: 0,
    deltaSequence: 0,
  };
  clients.add(client);
  logLine(`realtime client connected id=${client.id} from=${String(req.socket?.remoteAddress ?? "unknown")}`);

  sendMessage(client, {
    type: "hello",
    ok: true,
    serverTime: Date.now(),
    transport: "realtime_socket",
    path: PATHNAME,
  });

  socket.on("data", (chunk) => {
    if (!client.alive) return;
    client.buffer = Buffer.concat([client.buffer, Buffer.from(chunk)]);
    let decoded = null;
    try {
      decoded = decodeWebSocketFrames(client.buffer);
    } catch (error) {
      sendMessage(client, { type: "error", error: String(error?.message ?? "Invalid realtime websocket frame.") });
      closeClient(client, "protocol-error");
      return;
    }
    client.buffer = decoded.remaining;
    for (const pingPayload of decoded.pingPayloads) {
      try { sendPong(socket, pingPayload); } catch {}
    }
    if (decoded.closeRequested) {
      closeClient(client, "peer-close");
      return;
    }
    for (const raw of decoded.messages) {
      const message = safeJsonParse(raw);
      if (!message || typeof message !== "object") {
        sendMessage(client, { type: "error", error: "Invalid realtime JSON payload." });
        continue;
      }
      void handleClientRequest(client, message);
    }
  });

  socket.on("close", () => closeClient(client, "socket-close"));
  socket.on("end", () => closeClient(client, "socket-end"));
  socket.on("error", (error) => {
    logLine(`realtime client socket error id=${client.id} error=${String(error?.message ?? "socket-error")}`);
    closeClient(client, "socket-error");
  });
});

server.listen(PORT, HOST, () => {
  logLine(`dungeonpunk realtime server listening on ${HOST}:${PORT}${PATHNAME}`);
});
