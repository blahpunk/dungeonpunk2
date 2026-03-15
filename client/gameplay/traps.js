function clampNum(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const TRAP_FAMILIES = Object.freeze({
  pressure_plate: {
    id: "pressure_plate",
    label: "Pressure Plate",
    glyph: "X",
    color: "#ffb26b",
    damageMult: 1,
  },
  dart_line: {
    id: "dart_line",
    label: "Dart Line",
    glyph: ">",
    color: "#ffc06a",
    damageMult: 0.82,
  },
  poison_vent: {
    id: "poison_vent",
    label: "Poison Vent",
    glyph: "~",
    color: "#7ae28d",
    damageMult: 0.74,
  },
  alarm_trap: {
    id: "alarm_trap",
    label: "Alarm Trap",
    glyph: "!",
    color: "#f6d86b",
    damageMult: 0,
  },
  collapse_tile: {
    id: "collapse_tile",
    label: "Collapse Tile",
    glyph: "#",
    color: "#c9955d",
    damageMult: 0.9,
  },
  beam_link: {
    id: "beam_link",
    label: "Beam Link",
    glyph: "=",
    color: "#6cc8ff",
    damageMult: 1.05,
  },
  shrine_curse_seal: {
    id: "shrine_curse_seal",
    label: "Curse Seal",
    glyph: "*",
    color: "#cf88ff",
    damageMult: 0.42,
  },
});

const TRAP_FAMILY_WEIGHTS = Object.freeze({
  generic: { pressure_plate: 1, dart_line: 0.75, poison_vent: 0.55, alarm_trap: 0.45, collapse_tile: 0.35, beam_link: 0.25 },
  trap_corridor: { pressure_plate: 1.1, dart_line: 1.3, poison_vent: 0.75, alarm_trap: 0.6, collapse_tile: 0.55, beam_link: 0.45 },
  artillery_hall: { dart_line: 1.1, beam_link: 1.15, alarm_trap: 0.4, pressure_plate: 0.45 },
  brood_nest: { poison_vent: 1.15, pressure_plate: 0.55, collapse_tile: 0.45, alarm_trap: 0.5 },
  shrine_defense: { shrine_curse_seal: 1.3, alarm_trap: 0.7, beam_link: 0.4, pressure_plate: 0.35 },
  elite_vault: { beam_link: 0.95, collapse_tile: 0.9, alarm_trap: 0.65, pressure_plate: 0.5 },
  void_breach: { beam_link: 0.95, shrine_curse_seal: 0.95, pressure_plate: 0.35, poison_vent: 0.4 },
});

export function normalizeTrapFamilyId(raw) {
  const id = String(raw ?? "").trim().toLowerCase();
  if (TRAP_FAMILIES[id]) return id;
  return "pressure_plate";
}

export function trapFamilyDef(raw) {
  return TRAP_FAMILIES[normalizeTrapFamilyId(raw)];
}

export function chooseTrapFamily({ archetypeId = "", rng = Math.random } = {}) {
  const table = TRAP_FAMILY_WEIGHTS[String(archetypeId ?? "").trim()] ?? TRAP_FAMILY_WEIGHTS.generic;
  const entries = Object.entries(table)
    .map(([id, weight]) => ({ id, weight: Math.max(0, Number(weight) || 0) }))
    .filter((entry) => entry.weight > 0);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return "pressure_plate";
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return entries[entries.length - 1]?.id ?? "pressure_plate";
}

export function trapRevealStyle(trap) {
  const def = trapFamilyDef(trap?.trapFamily ?? trap?.trapType ?? "pressure_plate");
  return {
    glyph: def.glyph,
    color: def.color,
    label: def.label,
  };
}

export function trapDamageMultiplier(raw) {
  return clampNum(trapFamilyDef(raw)?.damageMult, 0, 3, 1);
}
