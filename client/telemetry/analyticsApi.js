export function createAnalyticsApi({ baseUrl = "./index.php", csrfToken = "", actorId = "" } = {}) {
  const stableActorId = String(actorId ?? "").trim();
  function buildPayload(body = null) {
    const payload = (body && typeof body === "object") ? { ...body } : {};
    if (stableActorId) payload.actor_id = stableActorId;
    if (csrfToken) payload._csrf = csrfToken;
    return payload;
  }

  function sendBeaconPayload(body = null) {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
    const payload = buildPayload(body);
    try {
      const encoded = JSON.stringify(payload);
      if (!encoded) return false;
      const blob = new Blob([encoded], { type: "application/json" });
      return navigator.sendBeacon(`${baseUrl}?api=analytics`, blob);
    } catch {
      return false;
    }
  }

  async function request(method = "GET", body = null, query = "") {
    const queryPrefix = query ? `&${query}` : "";
    const url = `${baseUrl}?api=analytics${queryPrefix}`;
    const headers = {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    };
    const init = {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers,
    };
    if (body !== null) {
      const payload = buildPayload(body);
      headers["Content-Type"] = "application/json";
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      init.keepalive = method === "POST";
      init.body = JSON.stringify(payload);
    }
    const resp = await fetch(url, init);
    let data = null;
    try {
      data = await resp.json();
    } catch {}
    if (!resp.ok || !data?.ok) {
      const err = new Error(data?.error ?? `Analytics request failed (${resp.status})`);
      err.response = data;
      throw err;
    }
    return data;
  }

  return {
    request,
    runStart: (payload) => request("POST", { action: "run_start", ...(payload ?? {}) }),
    heartbeat: (payload) => request("POST", { action: "heartbeat", ...(payload ?? {}) }),
    eventBatch: (payload) => request("POST", { action: "event_batch", ...(payload ?? {}) }),
    runEnd: (payload) => request("POST", { action: "run_end", ...(payload ?? {}) }),
    runEndBestEffort: (payload) => sendBeaconPayload({ action: "run_end", ...(payload ?? {}) }),
    overview: () => request("GET", null, "action=overview"),
    run: (runId) => request("GET", null, `action=run&run_id=${encodeURIComponent(String(runId ?? ""))}`),
    player: (userEmail) => request("GET", null, `action=player&user=${encodeURIComponent(String(userEmail ?? ""))}`),
  };
}
