import {
  createRealtimeSocketTransport,
  resolveAuthoritativeTransportMode,
} from "./realtimeSocketTransport.js?v=20260325a";

function createNoopUnsubscribe() {
  return () => {};
}

function isAbortLikeError(error = null) {
  if (!error) return false;
  const name = String(error?.name ?? "").trim();
  const code = String(error?.code ?? "").trim();
  return name === "AbortError" || code === "ERR_ABORTED" || code === "ABORT_ERR";
}

export function createPhpAuthoritativeTransport(options = {}) {
  const baseUrl = String(options.baseUrl ?? "./index.php").trim() || "./index.php";
  const csrfToken = String(options.csrfToken ?? "").trim();
  const browserInstanceId = String(options.browserInstanceId ?? "").trim();
  const cacheBust = typeof options.cacheBust === "function" ? options.cacheBust : ((url) => url);
  const liveTickCombatOption = options.liveTickCombat;
  let requestSeq = 0;

  function nextRequestId() {
    requestSeq = (requestSeq + 1) >>> 0;
    return `${Date.now().toString(36)}_${requestSeq.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  function buildPayload(body = null) {
    const payload = (body && typeof body === "object")
      ? { ...body }
      : {};
    if (browserInstanceId) payload.browser_instance_id = browserInstanceId;
    const liveTickCombat = typeof liveTickCombatOption === "function"
      ? liveTickCombatOption()
      : liveTickCombatOption;
    if (typeof liveTickCombat === "boolean") payload.live_tick_combat = liveTickCombat;
    if (csrfToken) payload._csrf = csrfToken;
    payload._req_id = nextRequestId();
    return payload;
  }

  function sendBeaconPayload(payload = null) {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
    const body = (payload && typeof payload === "object") ? payload : {};
    try {
      const encoded = JSON.stringify(body);
      if (!encoded) return false;
      const blob = new Blob([encoded], { type: "application/json" });
      return navigator.sendBeacon(cacheBust(`${baseUrl}?api=authoritative`), blob);
    } catch {
      return false;
    }
  }

  async function request(body = null, requestOptions = null) {
    const opts = (requestOptions && typeof requestOptions === "object") ? requestOptions : {};
    const payload = buildPayload(body);
    const requestStartedAt = Date.now();
    const headers = {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      "Content-Type": "application/json",
    };
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const resp = await fetch(cacheBust(`${baseUrl}?api=authoritative`), {
      method: "POST",
      credentials: "same-origin",
      headers,
      cache: "no-store",
      keepalive: opts.keepalive === true,
      signal: opts.signal,
      body: JSON.stringify(payload),
    });
    const responseReceivedAt = Date.now();
    let bodyReadCompletedAt = responseReceivedAt;
    let data = null;
    let rawText = "";
    try {
      rawText = await resp.text();
      bodyReadCompletedAt = Date.now();
    } catch {}
    const parseStartedAt = bodyReadCompletedAt;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {}
    const responseReadyAt = Date.now();
    const responseBytes = rawText
      ? ((typeof TextEncoder !== "undefined") ? new TextEncoder().encode(rawText).length : rawText.length)
      : 0;
    const transport = {
      requestId: String(payload._req_id ?? "").trim(),
      requestStartedAt,
      responseReceivedAt,
      bodyReadCompletedAt,
      responseReadyAt,
      totalMs: Math.max(0, responseReadyAt - requestStartedAt),
      headerWaitMs: Math.max(0, responseReceivedAt - requestStartedAt),
      bodyReadMs: Math.max(0, bodyReadCompletedAt - responseReceivedAt),
      jsonParseMs: Math.max(0, responseReadyAt - parseStartedAt),
      responseBytes,
      status: resp.status,
      contentLength: Math.max(0, Math.floor(Number(resp.headers.get("content-length") ?? 0) || 0)),
      mode: "php",
    };
    if (data && typeof data === "object") {
      data._transport = transport;
    }
    if (!resp.ok) {
      const msg = data?.error ?? `Authoritative request failed (${resp.status})`;
      const err = new Error(msg);
      err.response = {
        ...(data && typeof data === "object" ? data : {}),
        status_code: resp.status,
        _transport: transport,
      };
      throw err;
    }
    return data && typeof data === "object" ? data : { ok: false, error: "Invalid authoritative response." };
  }

  return {
    transportMode: "php",
    requestedTransportMode: "php",
    connect() {
      return Promise.resolve(true);
    },
    disconnect() {},
    onMessage() {
      return createNoopUnsubscribe();
    },
    onDisconnect() {
      return createNoopUnsubscribe();
    },
    openSession({ characterId = "", saveId = "", forceEntrance = false, freshWorld = false } = {}) {
      return request({
        action: "open_session",
        character_id: characterId || undefined,
        save_id: saveId || undefined,
        force_entrance: forceEntrance === true,
        fresh_world: freshWorld === true,
      });
    },
    sendCommand({ sessionId = "", clientCommandSeq = 0, command = null } = {}) {
      return request({
        action: "command",
        session_id: sessionId,
        client_command_seq: clientCommandSeq,
        command,
        client_sent_at: Date.now(),
      });
    },
    setMovementIntent({ sessionId = "", holdDir = "", active = false, enqueueDir = "", intentSeq = 0 } = {}) {
      return request({
        action: "set_movement_intent",
        session_id: sessionId,
        hold_dir: holdDir || undefined,
        active: active === true,
        enqueue_dir: enqueueDir || undefined,
        intent_seq: Math.max(0, Math.floor(Number(intentSeq) || 0)),
      });
    },
    pollMovement({ sessionId = "", timeoutMs = 25000, minResponseMs = 8, signal } = {}) {
      return request({
        action: "poll_movement",
        session_id: sessionId,
        timeout_ms: Math.max(100, Math.floor(Number(timeoutMs) || 25000)),
        min_response_ms: Math.max(0, Math.floor(Number(minResponseMs) || 0)),
      }, { signal });
    },
    touchSession({
      sessionId = "",
      name = "",
      speciesId = "",
      classId = "",
      dungeonInstanceId = "",
      x = null,
      y = null,
      z = null,
      hp = null,
      maxHp = null,
    } = {}) {
      return request({
        action: "touch_session",
        session_id: sessionId,
        name: name || undefined,
        species_id: speciesId || undefined,
        class_id: classId || undefined,
        dungeon_instance_id: dungeonInstanceId || undefined,
        x: Number.isFinite(Number(x)) ? Math.floor(Number(x)) : undefined,
        y: Number.isFinite(Number(y)) ? Math.floor(Number(y)) : undefined,
        z: Number.isFinite(Number(z)) ? Math.floor(Number(z)) : undefined,
        hp: Number.isFinite(Number(hp)) ? Math.max(0, Math.floor(Number(hp))) : undefined,
        max_hp: Number.isFinite(Number(maxHp)) ? Math.max(1, Math.floor(Number(maxHp))) : undefined,
      }, { keepalive: true });
    },
    sessionLockAudit({ sessionId = "" } = {}) {
      return request({
        action: "session_lock_audit",
        session_id: sessionId || undefined,
      });
    },
    requestResync({ sessionId = "" } = {}) {
      return request({
        action: "request_resync",
        session_id: sessionId,
      });
    },
    switchCharacter({ sessionId = "", characterId = "", forceEntrance = false } = {}) {
      return request({
        action: "switch_character",
        session_id: sessionId,
        character_id: characterId,
        force_entrance: forceEntrance === true,
      });
    },
    newDungeon({ sessionId = "" } = {}) {
      return request({
        action: "new_dungeon",
        session_id: sessionId,
      });
    },
    createCharacterAndEnter({ sessionId = "", characterPayload = "", name = "" } = {}) {
      return request({
        action: "create_character_and_enter",
        session_id: sessionId,
        character_payload: characterPayload,
        name,
      });
    },
    manualSave({ sessionId = "", name = "", overwriteId = "", autosave = false } = {}) {
      return request({
        action: "manual_save",
        session_id: sessionId,
        name,
        overwrite_id: overwriteId || undefined,
        autosave: autosave === true,
      });
    },
    saveAndExit({ sessionId = "" } = {}) {
      return request({
        action: "save_and_exit",
        session_id: sessionId,
      });
    },
    closeSession({ sessionId = "", reason = "", bestEffort = false } = {}) {
      const payload = {
        action: "close_session",
        session_id: sessionId,
        reason: String(reason ?? "").trim() || undefined,
      };
      if (bestEffort) {
        const beaconSent = sendBeaconPayload(buildPayload(payload));
        return request(payload, { keepalive: true }).catch(() => ({
          ok: beaconSent,
          closed: beaconSent,
          via: beaconSent ? "beacon" : "failed",
        }));
      }
      return request(payload, { keepalive: true });
    },
  };
}

export function createAuthoritativeApi(options = {}) {
  const requestedMode = resolveAuthoritativeTransportMode(options);
  const fallbackTransport = createPhpAuthoritativeTransport(options);
  if (requestedMode !== "realtime") return fallbackTransport;

  const realtimeTransport = createRealtimeSocketTransport({
    ...options,
    fallbackTransport,
  });
  const allowTransportFallback = options.allowTransportFallback !== false;
  let activeTransport = realtimeTransport;
  let fallbackActive = false;

  function activateFallback(reason = "", error = null) {
    if (fallbackActive || !allowTransportFallback) return false;
    fallbackActive = true;
    activeTransport = fallbackTransport;
    try {
      realtimeTransport.disconnect?.();
    } catch {}
    const detail = String(reason ?? "").trim() || "Realtime transport became unavailable.";
    if (detail !== "Realtime transport disconnected (client-disconnect).") {
      try {
        console.warn(`[authoritative] ${detail} Falling back to PHP authoritative transport.`, error ?? "");
      } catch {}
    }
    return true;
  }

  if (typeof realtimeTransport.onDisconnect === "function") {
    realtimeTransport.onDisconnect((reason) => {
      if (!allowTransportFallback) return;
      activateFallback(`Realtime transport disconnected (${String(reason ?? "socket-closed").trim() || "socket-closed"}).`);
    });
  }

  async function invoke(method = "", args = undefined) {
    const name = String(method ?? "").trim();
    const transport = activeTransport;
    const fn = transport?.[name];
    if (typeof fn !== "function") {
      throw new Error(`Authoritative transport method is unavailable: ${name}`);
    }
    try {
      return await fn.call(transport, args);
    } catch (error) {
      if (transport !== realtimeTransport || !allowTransportFallback || isAbortLikeError(error)) {
        throw error;
      }
      activateFallback(String(error?.message ?? `Realtime ${name} failed.`).trim(), error);
      const fallbackFn = fallbackTransport?.[name];
      if (typeof fallbackFn !== "function") throw error;
      return fallbackFn.call(fallbackTransport, args);
    }
  }

  return {
    get transportMode() {
      return String(activeTransport?.transportMode ?? (fallbackActive ? "php" : "realtime")).trim() || "php";
    },
    get requestedTransportMode() {
      return requestedMode;
    },
    get usingFallbackTransport() {
      return fallbackActive;
    },
    connect() {
      return invoke("connect");
    },
    disconnect() {
      try {
        realtimeTransport.disconnect?.();
      } catch {}
      try {
        fallbackTransport.disconnect?.();
      } catch {}
    },
    onMessage(handler) {
      const unsubscribers = [];
      if (typeof realtimeTransport.onMessage === "function") {
        unsubscribers.push(realtimeTransport.onMessage(handler));
      }
      if (typeof fallbackTransport.onMessage === "function") {
        unsubscribers.push(fallbackTransport.onMessage(handler));
      }
      return () => {
        for (const unsubscribe of unsubscribers) {
          try { unsubscribe?.(); } catch {}
        }
      };
    },
    onDisconnect(handler) {
      const unsubscribers = [];
      if (typeof realtimeTransport.onDisconnect === "function") {
        unsubscribers.push(realtimeTransport.onDisconnect(handler));
      }
      if (typeof fallbackTransport.onDisconnect === "function") {
        unsubscribers.push(fallbackTransport.onDisconnect(handler));
      }
      return () => {
        for (const unsubscribe of unsubscribers) {
          try { unsubscribe?.(); } catch {}
        }
      };
    },
    openSession(args = {}) {
      return invoke("openSession", args);
    },
    sendCommand(args = {}) {
      return invoke("sendCommand", args);
    },
    setMovementIntent(args = {}) {
      return invoke("setMovementIntent", args);
    },
    pollMovement(args = {}) {
      return invoke("pollMovement", args);
    },
    touchSession(args = {}) {
      return invoke("touchSession", args);
    },
    sessionLockAudit(args = {}) {
      return invoke("sessionLockAudit", args);
    },
    requestResync(args = {}) {
      return invoke("requestResync", args);
    },
    switchCharacter(args = {}) {
      return invoke("switchCharacter", args);
    },
    newDungeon(args = {}) {
      return invoke("newDungeon", args);
    },
    createCharacterAndEnter(args = {}) {
      return invoke("createCharacterAndEnter", args);
    },
    manualSave(args = {}) {
      return invoke("manualSave", args);
    },
    saveAndExit(args = {}) {
      return invoke("saveAndExit", args);
    },
    closeSession(args = {}) {
      return invoke("closeSession", args);
    },
  };
}

export { resolveAuthoritativeTransportMode };
