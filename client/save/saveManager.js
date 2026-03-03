export const LOCAL_SLOT_INDEX_KEY = "infinite_dungeon_local_slots_v1";
export const LOCAL_SLOT_PAYLOAD_PREFIX = "infinite_dungeon_local_slot_payload_v1:";
export const LOCAL_SLOT_BACKUP_MIGRATED_KEY = "infinite_dungeon_roguelike_save_v8_backup_migrated";
export const LOCAL_SLOT_MAX = 12;
export const AUTOSAVE_DEBOUNCE_MS = 3500;

export function createLocalSlotStore(options = {}) {
  const storage = options.storage ?? null;
  const normalizeId = typeof options.normalizeId === "function"
    ? options.normalizeId
    : ((value) => String(value ?? "").trim());
  const maxNameLen = Math.max(1, Number(options.maxNameLen ?? 48) || 48);
  const defaultName = String(options.defaultName ?? "Local Adventurer") || "Local Adventurer";

  function payloadKey(slotId) {
    return `${LOCAL_SLOT_PAYLOAD_PREFIX}${slotId}`;
  }

  function cleanSlotId(value) {
    return normalizeId(value ?? "") || "";
  }

  function readIndex() {
    try {
      const raw = storage?.getItem(LOCAL_SLOT_INDEX_KEY);
      if (!raw) return { activeId: "", slots: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { activeId: "", slots: [] };
      const slotsRaw = Array.isArray(parsed.slots) ? parsed.slots : [];
      const slots = slotsRaw
        .map((entry) => {
          const id = cleanSlotId(entry?.id ?? "");
          if (!id) return null;
          const name = String(entry?.name ?? "").trim().slice(0, maxNameLen) || defaultName;
          const updatedAt = String(entry?.updatedAt ?? "");
          return { id, name, updatedAt };
        })
        .filter(Boolean);
      const activeId = cleanSlotId(parsed.activeId ?? "") || "";
      return { activeId, slots };
    } catch {
      return { activeId: "", slots: [] };
    }
  }

  function writeIndex(index) {
    const src = (index && typeof index === "object") ? index : {};
    const slots = Array.isArray(src.slots) ? src.slots : [];
    const cleanSlots = [];
    for (const entry of slots) {
      const id = cleanSlotId(entry?.id ?? "");
      if (!id) continue;
      const name = String(entry?.name ?? "").trim().slice(0, maxNameLen) || defaultName;
      const updatedAt = String(entry?.updatedAt ?? "").trim() || new Date().toISOString();
      cleanSlots.push({ id, name, updatedAt });
    }
    const dedup = [];
    const seen = new Set();
    for (const entry of cleanSlots) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      dedup.push(entry);
    }
    const activeRaw = cleanSlotId(src.activeId ?? "") || "";
    const activeId = dedup.some((slot) => slot.id === activeRaw)
      ? activeRaw
      : (dedup[0]?.id ?? "");
    const next = { activeId, slots: dedup };
    try {
      storage?.setItem(LOCAL_SLOT_INDEX_KEY, JSON.stringify(next));
    } catch {}
    return next;
  }

  function readPayload(slotId) {
    const id = cleanSlotId(slotId ?? "");
    if (!id) return "";
    try {
      return String(storage?.getItem(payloadKey(id)) ?? "");
    } catch {
      return "";
    }
  }

  function upsertSummary(slotId, name = "", updatedAt = "") {
    const id = cleanSlotId(slotId ?? "");
    if (!id) return null;
    const idx = readIndex();
    const when = String(updatedAt || new Date().toISOString());
    const slotName = String(name ?? "").trim().slice(0, maxNameLen) || defaultName;
    const hit = idx.slots.find((slot) => slot.id === id);
    if (hit) {
      hit.name = slotName;
      hit.updatedAt = when;
    } else {
      idx.slots.push({ id, name: slotName, updatedAt: when });
    }
    idx.slots.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    idx.activeId = id;
    return writeIndex(idx);
  }

  function removePayload(slotId) {
    const id = cleanSlotId(slotId ?? "");
    if (!id) return;
    try { storage?.removeItem(payloadKey(id)); } catch {}
  }

  return {
    payloadKey,
    readIndex,
    writeIndex,
    readPayload,
    upsertSummary,
    removePayload,
  };
}
