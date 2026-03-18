const DIR_BY_DELTA = new Map([
  ["0,-1", "N"],
  ["1,0", "E"],
  ["0,1", "S"],
  ["-1,0", "W"],
]);

function normalizeTarget(target = null) {
  const src = (target && typeof target === "object") ? target : {};
  const x = Number(src.x ?? null);
  const y = Number(src.y ?? null);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const normalized = {
    x: Math.floor(x),
    y: Math.floor(y),
  };
  const monsterId = String(src.id ?? src.monsterId ?? "").trim();
  if (monsterId) normalized.monsterId = monsterId;
  return normalized;
}

export function moveCommand(dx = 0, dy = 0) {
  const dir = DIR_BY_DELTA.get(`${Math.trunc(dx)},${Math.trunc(dy)}`) ?? "";
  return dir ? { type: "MOVE", dir } : null;
}

export function waitCommand() {
  return { type: "WAIT" };
}

export function stairsCommand(dir = "down") {
  const normalized = String(dir ?? "").trim().toLowerCase();
  return normalized === "up" || normalized === "down"
    ? { type: "USE_STAIRS", dir: normalized }
    : null;
}

export function openDoorCommand() {
  return { type: "OPEN_DOOR" };
}

export function closeDoorCommand() {
  return { type: "CLOSE_DOOR" };
}

export function pickupCommand() {
  return { type: "PICKUP" };
}

export function disarmTrapCommand() {
  return { type: "DISARM_TRAP" };
}

export function useShrineCommand() {
  return { type: "USE_SHRINE" };
}

export function interactCommand() {
  return { type: "INTERACT" };
}

export function attackCommand(target = null) {
  const normalized = normalizeTarget(target);
  return normalized ? { type: "ATTACK", ...normalized } : { type: "ATTACK" };
}

export function abilityCommand(abilityId = "", target = null) {
  const id = String(abilityId ?? "").trim();
  if (!id) return null;
  const normalized = normalizeTarget(target);
  return normalized ? { type: "ACTIVATE_ABILITY", abilityId: id, ...normalized } : { type: "ACTIVATE_ABILITY", abilityId: id };
}

export function useItemCommand(slot = -1) {
  return { type: "USE_ITEM", slot: Math.max(0, Math.floor(Number(slot) || 0)) };
}

export function dropItemCommand(slot = -1) {
  return { type: "DROP_ITEM", slot: Math.max(0, Math.floor(Number(slot) || 0)) };
}

export function unequipItemCommand(slot = "") {
  return { type: "UNEQUIP_ITEM", slot: String(slot ?? "").trim() };
}

export function buyShopItemCommand(index = -1) {
  const normalized = Math.floor(Number(index) || 0);
  return normalized >= 0 ? { type: "BUY_SHOP_ITEM", index: normalized } : null;
}

export function sellShopItemCommand(slot = -1) {
  const normalized = Math.floor(Number(slot) || -1);
  return normalized >= 0 ? { type: "SELL_SHOP_ITEM", slot: normalized } : null;
}
