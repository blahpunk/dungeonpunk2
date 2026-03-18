export function createAuthoritativeApi(options = {}) {
  const baseUrl = String(options.baseUrl ?? "./index.php").trim() || "./index.php";
  const csrfToken = String(options.csrfToken ?? "").trim();
  const cacheBust = typeof options.cacheBust === "function" ? options.cacheBust : ((url) => url);

  async function request(body = null) {
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
      body: JSON.stringify(body ?? {}),
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
  };
}
