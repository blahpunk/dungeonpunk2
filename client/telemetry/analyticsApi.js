export function createAnalyticsApi({ baseUrl = "./index.php", csrfToken = "" } = {}) {
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
      headers["Content-Type"] = "application/json";
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      init.body = JSON.stringify(body);
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
    overview: () => request("GET", null, "action=overview"),
    run: (runId) => request("GET", null, `action=run&run_id=${encodeURIComponent(String(runId ?? ""))}`),
    player: (userEmail) => request("GET", null, `action=player&user=${encodeURIComponent(String(userEmail ?? ""))}`),
  };
}
