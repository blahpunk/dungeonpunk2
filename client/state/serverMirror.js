function ensureMirrorShape(mirror = null) {
  const next = (mirror && typeof mirror === "object") ? mirror : {};
  if (typeof next.sessionId !== "string") next.sessionId = "";
  if (!Number.isFinite(next.serverRevision)) next.serverRevision = 0;
  if (!Number.isFinite(next.clientCommandSeq)) next.clientCommandSeq = 0;
  next.ready = next.ready === true;
  next.inFlight = next.inFlight === true;
  next.lastSnapshot = next.lastSnapshot && typeof next.lastSnapshot === "object" ? next.lastSnapshot : null;
  next.lastEvents = Array.isArray(next.lastEvents) ? next.lastEvents : [];
  next.lastError = String(next.lastError ?? "");
  next.activeCharacterId = String(next.activeCharacterId ?? "");
  next.lastSave = next.lastSave && typeof next.lastSave === "object" ? next.lastSave : null;
  next.saves = Array.isArray(next.saves) ? next.saves : [];
  if (!Number.isFinite(next.lastServerTick)) next.lastServerTick = 0;
  next.lastPerf = next.lastPerf && typeof next.lastPerf === "object" ? next.lastPerf : null;
  return next;
}

export function createServerMirror() {
  return ensureMirrorShape({});
}

export function resetServerMirror(mirror = null) {
  const next = ensureMirrorShape(mirror);
  next.sessionId = "";
  next.serverRevision = 0;
  next.clientCommandSeq = 0;
  next.ready = false;
  next.inFlight = false;
  next.lastSnapshot = null;
  next.lastEvents = [];
  next.lastError = "";
  next.activeCharacterId = "";
  next.lastSave = null;
  next.saves = [];
  next.lastServerTick = 0;
  next.lastPerf = null;
  return next;
}

export function nextServerMirrorCommandSeq(mirror = null) {
  const next = ensureMirrorShape(mirror);
  next.clientCommandSeq = Math.max(0, Math.floor(next.clientCommandSeq || 0)) + 1;
  return next.clientCommandSeq;
}

export function applyAuthoritativeResponseToMirror(mirror = null, response = null) {
  const next = ensureMirrorShape(mirror);
  const data = (response && typeof response === "object") ? response : {};
  if (typeof data.sessionId === "string" && data.sessionId) next.sessionId = data.sessionId;
  if (Number.isFinite(data.serverRevision)) next.serverRevision = Math.max(0, Math.floor(data.serverRevision));
  if (Number.isFinite(data.acceptedCommandSeq)) {
    next.clientCommandSeq = Math.max(next.clientCommandSeq, Math.floor(data.acceptedCommandSeq));
  }
  next.lastSnapshot = data.snapshot && typeof data.snapshot === "object" ? data.snapshot : null;
  next.lastEvents = Array.isArray(data.events) ? data.events.slice() : [];
  next.lastError = String(data.error ?? "");
  next.activeCharacterId = String(data?.snapshot?.character?.id ?? next.activeCharacterId ?? "");
  next.lastSave = data.save && typeof data.save === "object" ? data.save : null;
  next.saves = Array.isArray(data.saves) ? data.saves.slice() : next.saves;
  const tick = Number(data?.tick?.serverTick ?? data?.tick?.tick ?? 0);
  if (Number.isFinite(tick)) next.lastServerTick = Math.max(next.lastServerTick, Math.floor(tick));
  next.lastPerf = data?.perf && typeof data.perf === "object" ? data.perf : next.lastPerf;
  next.ready = !!next.lastSnapshot;
  return next;
}

export function setServerMirrorInFlight(mirror = null, value = false) {
  const next = ensureMirrorShape(mirror);
  next.inFlight = value === true;
  return next;
}
