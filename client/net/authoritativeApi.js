export function createAuthoritativeApi(options = {}) {
  const baseUrl = String(options.baseUrl ?? "./index.php").trim() || "./index.php";
  const csrfToken = String(options.csrfToken ?? "").trim();
  const browserInstanceId = String(options.browserInstanceId ?? "").trim();
  const cacheBust = typeof options.cacheBust === "function" ? options.cacheBust : ((url) => url);

  function buildPayload(body = null) {
    const payload = (body && typeof body === "object")
      ? { ...body }
      : {};
    if (browserInstanceId) payload.browser_instance_id = browserInstanceId;
    if (csrfToken) payload._csrf = csrfToken;
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
      body: JSON.stringify(payload),
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {}
    if (!resp.ok) {
      const msg = data?.error ?? `Authoritative request failed (${resp.status})`;
      const err = new Error(msg);
      err.response = { ...(data && typeof data === "object" ? data : {}), status_code: resp.status };
      throw err;
    }
    return data && typeof data === "object" ? data : { ok: false, error: "Invalid authoritative response." };
  }

  return {
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
      });
    },
    touchSession({ sessionId = "" } = {}) {
      return request({
        action: "touch_session",
        session_id: sessionId,
      }, { keepalive: true });
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
