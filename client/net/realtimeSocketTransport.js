function nextRealtimeRequestId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeParseJson(raw = "") {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function createAbortError(message = "Realtime movement poll aborted.") {
  const error = new Error(String(message ?? "Realtime movement poll aborted.").trim() || "Realtime movement poll aborted.");
  error.name = "AbortError";
  error.code = "ERR_ABORTED";
  return error;
}

function readBodyDatasetValue(key = "") {
  if (!key) return "";
  try {
    return String(document?.body?.dataset?.[key] ?? "").trim();
  } catch {
    return "";
  }
}

function readLocalStorageValue(key = "") {
  if (!key) return "";
  try {
    return String(localStorage.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function normalizeTransportMode(value = null) {
  const raw = typeof value === "function" ? value() : value;
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (["realtime", "socket", "ws", "websocket", "realtime_socket"].includes(normalized)) return "realtime";
  if (["php", "legacy", "legacy_php"].includes(normalized)) return "php";
  return "";
}

function readBooleanFlag(value = null) {
  const raw = typeof value === "function" ? value() : value;
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return null;
}

function decorateTransportPayload(data = null, extras = null) {
  if (!data || typeof data !== "object") return data;
  const now = Date.now();
  const payload = { ...data };
  const extra = (extras && typeof extras === "object") ? extras : {};
  payload._transport = {
    ...((payload._transport && typeof payload._transport === "object") ? payload._transport : {}),
    mode: "realtime_socket",
    responseReceivedAt: now,
    bodyReadCompletedAt: now,
    responseReadyAt: now,
    totalMs: 0,
    headerWaitMs: 0,
    bodyReadMs: 0,
    jsonParseMs: 0,
    status: 200,
    contentLength: 0,
    responseBytes: 0,
    ...extra,
  };
  return payload;
}

export function resolveAuthoritativeTransportMode(options = {}) {
  const candidates = [
    options.transportMode,
    options.mode,
    readLocalStorageValue("dungeonpunk.authoritativeTransportMode"),
    readLocalStorageValue("d25.authoritativeTransportMode"),
    readBodyDatasetValue("authoritativeTransportMode"),
    readBodyDatasetValue("realtimeTransportMode"),
  ];
  for (const candidate of candidates) {
    const mode = normalizeTransportMode(candidate);
    if (mode) return mode;
  }
  const enabledFlags = [
    options.realtimeEnabled,
    readLocalStorageValue("dungeonpunk.realtimeTransportEnabled"),
    readBodyDatasetValue("realtimeTransportEnabled"),
  ];
  for (const flag of enabledFlags) {
    const enabled = readBooleanFlag(flag);
    if (enabled === true) return "realtime";
    if (enabled === false) return "php";
  }
  return "php";
}

function resolveRealtimeUrl(options = {}) {
  const explicit = typeof options.realtimeUrl === "function"
    ? options.realtimeUrl()
    : options.realtimeUrl;
  const direct = String(explicit ?? "").trim();
  if (direct) return direct;
  const fromData = readBodyDatasetValue("realtimeTransportUrl") || readBodyDatasetValue("authoritativeTransportUrl");
  if (fromData) return fromData;
  const fromStorage = readLocalStorageValue("dungeonpunk.realtimeTransportUrl");
  if (fromStorage) return fromStorage;
  if (typeof window !== "undefined" && window.location) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:8787/realtime`;
  }
  return "ws://127.0.0.1:8787/realtime";
}

export function createRealtimeSocketTransport(options = {}) {
  const fallbackTransport = options.fallbackTransport ?? null;
  const csrfToken = String(options.csrfToken ?? "").trim();
  const browserInstanceId = String(options.browserInstanceId ?? "").trim();
  const phpBaseUrl = (() => {
    const base = String(options.baseUrl ?? "./index.php").trim() || "./index.php";
    if (typeof window !== "undefined" && window.location) {
      try {
        return new URL(base, window.location.href).toString();
      } catch {}
    }
    return base;
  })();
  const liveTickCombatOption = options.liveTickCombat;
  const requestedUrl = resolveRealtimeUrl(options);

  let socket = null;
  let socketOpen = false;
  let connectPromise = null;
  let disconnectReason = "";
  const pendingRequests = new Map();
  const movementQueue = [];
  const movementWaiters = [];
  const messageHandlers = new Set();
  const disconnectHandlers = new Set();

  function currentLiveTickCombat() {
    return typeof liveTickCombatOption === "function"
      ? liveTickCombatOption()
      : liveTickCombatOption;
  }

  function notifyDisconnect(reason = "socket-closed") {
    disconnectReason = String(reason ?? "socket-closed").trim() || "socket-closed";
    for (const [, pending] of pendingRequests.entries()) {
      try { pending.cleanup?.(); } catch {}
      pending.reject(new Error(`Realtime transport disconnected: ${disconnectReason}`));
    }
    pendingRequests.clear();
    while (movementWaiters.length > 0) {
      const waiter = movementWaiters.shift();
      try { waiter?.cleanup?.(); } catch {}
      waiter?.reject?.(new Error(`Realtime transport disconnected: ${disconnectReason}`));
    }
    for (const handler of disconnectHandlers) {
      try { handler(disconnectReason); } catch {}
    }
  }

  function cleanupSocket(reason = "socket-closed") {
    if (socket) {
      try {
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
      } catch {}
    }
    socket = null;
    socketOpen = false;
    connectPromise = null;
    notifyDisconnect(reason);
  }

  function sendEnvelope(envelope = null) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime transport is not connected.");
    }
    socket.send(JSON.stringify((envelope && typeof envelope === "object") ? envelope : {}));
  }

  function resolveMovementWaiter(waiter = null, data = null) {
    if (!waiter) return;
    try { waiter.cleanup?.(); } catch {}
    waiter.resolve?.(data);
  }

  function rejectMovementWaiter(waiter = null, error = null) {
    if (!waiter) return;
    try { waiter.cleanup?.(); } catch {}
    waiter.reject?.(error);
  }

  function enqueueMovement(data = null) {
    const payload = decorateTransportPayload(data, {
      responseBytes: 0,
      deltaSeq: Math.max(0, Math.floor(Number(data?._transport?.deltaSeq ?? data?.deltaSeq ?? 0) || 0)),
    });
    if (movementWaiters.length > 0) {
      const waiter = movementWaiters.shift();
      resolveMovementWaiter(waiter, payload);
      return;
    }
    movementQueue.push(payload);
    if (movementQueue.length > 24) movementQueue.splice(0, movementQueue.length - 24);
  }

  function handleIncomingMessage(rawData = "") {
    const message = safeParseJson(typeof rawData === "string" ? rawData : String(rawData ?? ""));
    if (!message || typeof message !== "object") return;
    const requestId = String(message.requestId ?? message.request_id ?? "").trim();
    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);
      try { pending.cleanup?.(); } catch {}
      if (message.type === "error" || message.ok === false) {
        pending.reject(new Error(String(message.error ?? "Realtime request failed.").trim() || "Realtime request failed."));
      } else {
        pending.resolve(decorateTransportPayload(message.data ?? message, {
          requestId,
          responseBytes: 0,
          deltaSeq: Math.max(0, Math.floor(Number(message.deltaSeq ?? message.data?.deltaSeq ?? 0) || 0)),
        }));
      }
      return;
    }
    if (message.type === "world_delta") {
      const payload = (message.data && typeof message.data === "object")
        ? { ...message.data, deltaSeq: Math.max(0, Math.floor(Number(message.deltaSeq ?? 0) || 0)) }
        : { deltaSeq: Math.max(0, Math.floor(Number(message.deltaSeq ?? 0) || 0)) };
      enqueueMovement(payload);
    }
    for (const handler of messageHandlers) {
      try { handler(message); } catch {}
    }
  }

  async function connect() {
    if (socketOpen && socket && socket.readyState === WebSocket.OPEN) return true;
    if (connectPromise) return connectPromise;
    connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      try {
        socket = new WebSocket(requestedUrl);
      } catch (error) {
        connectPromise = null;
        reject(error);
        return;
      }
      socket.onopen = () => {
        socketOpen = true;
        sendEnvelope({
          type: "auth",
          requestId: nextRealtimeRequestId(),
          payload: {
            csrfToken,
            browserInstanceId,
            phpBaseUrl,
            liveTickCombat: typeof currentLiveTickCombat() === "boolean" ? currentLiveTickCombat() : undefined,
          },
        });
        settled = true;
        resolve(true);
      };
      socket.onmessage = (event) => {
        handleIncomingMessage(event?.data ?? "");
      };
      socket.onerror = () => {
        if (!settled) {
          settled = true;
          connectPromise = null;
          reject(new Error("Realtime websocket connection failed."));
        }
      };
      socket.onclose = () => {
        cleanupSocket("socket-closed");
      };
    }).finally(() => {
      connectPromise = null;
    });
    return connectPromise;
  }

  async function sendRequest(type = "", payload = null) {
    await connect();
    const requestId = nextRealtimeRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject, cleanup: null });
      try {
        sendEnvelope({
          type,
          requestId,
          payload: (payload && typeof payload === "object") ? payload : {},
        });
      } catch (error) {
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  return {
    transportMode: "realtime",
    requestedTransportMode: "realtime",
    connect,
    disconnect() {
      if (socket) {
        try { socket.close(); } catch {}
      }
      cleanupSocket("client-disconnect");
    },
    onMessage(handler) {
      if (typeof handler !== "function") return () => {};
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onDisconnect(handler) {
      if (typeof handler !== "function") return () => {};
      disconnectHandlers.add(handler);
      return () => disconnectHandlers.delete(handler);
    },
    openSession({ characterId = "", saveId = "", forceEntrance = false, freshWorld = false } = {}) {
      return sendRequest("open_session", {
        characterId,
        saveId,
        forceEntrance: forceEntrance === true,
        freshWorld: freshWorld === true,
      });
    },
    sendCommand({ sessionId = "", clientCommandSeq = 0, command = null } = {}) {
      return sendRequest("command", {
        sessionId,
        clientCommandSeq,
        command,
        clientSentAt: Date.now(),
      });
    },
    setMovementIntent({ sessionId = "", holdDir = "", active = false, enqueueDir = "", intentSeq = 0 } = {}) {
      return sendRequest("set_movement_intent", {
        sessionId,
        holdDir,
        active: active === true,
        enqueueDir,
        intentSeq,
      });
    },
    async pollMovement({ signal } = {}) {
      await connect();
      if (movementQueue.length > 0) return movementQueue.shift();
      if (signal?.aborted) throw createAbortError();
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          cleanup: null,
        };
        if (signal && typeof signal.addEventListener === "function") {
          const onAbort = () => {
            const index = movementWaiters.indexOf(waiter);
            if (index >= 0) movementWaiters.splice(index, 1);
            rejectMovementWaiter(waiter, createAbortError());
          };
          signal.addEventListener("abort", onAbort, { once: true });
          waiter.cleanup = () => {
            try { signal.removeEventListener("abort", onAbort); } catch {}
          };
        }
        movementWaiters.push(waiter);
      });
    },
    touchSession(payload = {}) {
      return sendRequest("touch_session", payload);
    },
    sessionLockAudit({ sessionId = "" } = {}) {
      return sendRequest("session_lock_audit", { sessionId });
    },
    requestResync({ sessionId = "" } = {}) {
      return sendRequest("request_resync", { sessionId });
    },
    switchCharacter({ sessionId = "", characterId = "", forceEntrance = false } = {}) {
      return sendRequest("switch_character", { sessionId, characterId, forceEntrance: forceEntrance === true });
    },
    newDungeon({ sessionId = "" } = {}) {
      return sendRequest("new_dungeon", { sessionId });
    },
    createCharacterAndEnter({ sessionId = "", characterPayload = "", name = "" } = {}) {
      return sendRequest("create_character_and_enter", { sessionId, characterPayload, name });
    },
    manualSave({ sessionId = "", name = "", overwriteId = "", autosave = false } = {}) {
      return sendRequest("manual_save", { sessionId, name, overwriteId, autosave: autosave === true });
    },
    saveAndExit({ sessionId = "" } = {}) {
      return sendRequest("save_and_exit", { sessionId });
    },
    closeSession({ sessionId = "", reason = "", bestEffort = false } = {}) {
      if (bestEffort && fallbackTransport && typeof fallbackTransport.closeSession === "function") {
        return fallbackTransport.closeSession({ sessionId, reason, bestEffort });
      }
      return sendRequest("close_session", { sessionId, reason });
    },
  };
}
