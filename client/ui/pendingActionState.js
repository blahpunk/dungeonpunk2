function ensurePendingActionShape(state = null) {
  const next = (state && typeof state === "object") ? state : {};
  next.pending = next.pending === true;
  next.commandType = String(next.commandType ?? "");
  next.reason = String(next.reason ?? "");
  next.startedAt = Number.isFinite(next.startedAt) ? Number(next.startedAt) : 0;
  return next;
}

export function createPendingActionState() {
  return ensurePendingActionShape({});
}

export function startPendingAction(state = null, descriptor = null) {
  const next = ensurePendingActionShape(state);
  const meta = (descriptor && typeof descriptor === "object") ? descriptor : {};
  next.pending = true;
  next.commandType = String(meta.type ?? meta.commandType ?? "");
  next.reason = String(meta.reason ?? "");
  next.startedAt = Date.now();
  return next;
}

export function clearPendingAction(state = null) {
  const next = ensurePendingActionShape(state);
  next.pending = false;
  next.commandType = "";
  next.reason = "";
  next.startedAt = 0;
  return next;
}
