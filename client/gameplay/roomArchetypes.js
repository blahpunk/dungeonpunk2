function clampInt(value, min = 0, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

export const ROOM_ARCHETYPES = Object.freeze({
  ambush_room: { id: "ambush_room", minDepth: 0, maxDepth: 999, monsterCountBonus: 1, trapWeightMult: 0.8 },
  artillery_hall: { id: "artillery_hall", minDepth: 2, maxDepth: 999, monsterCountBonus: 0, trapWeightMult: 1.2 },
  shrine_defense: { id: "shrine_defense", minDepth: 0, maxDepth: 999, monsterCountBonus: 1, trapWeightMult: 1.1 },
  trap_corridor: { id: "trap_corridor", minDepth: 1, maxDepth: 999, monsterCountBonus: 0, trapWeightMult: 1.5 },
  elite_vault: { id: "elite_vault", minDepth: 4, maxDepth: 999, monsterCountBonus: 1, trapWeightMult: 1.3 },
  brood_nest: { id: "brood_nest", minDepth: 2, maxDepth: 999, monsterCountBonus: 1, trapWeightMult: 1.1 },
  void_breach: { id: "void_breach", minDepth: 5, maxDepth: 999, monsterCountBonus: 1, trapWeightMult: 1.15 },
  merchant_refuge: { id: "merchant_refuge", minDepth: 3, maxDepth: 999, monsterCountBonus: -1, trapWeightMult: 0.4 },
});

const FACTION_POOLS = Object.freeze({
  surface_raiders: ["goblin", "rogue", "archer", "ruin_archer", "cave_skirmisher", "storm_sniper"],
  bone_cult: ["skeleton", "wraith", "bone_herald"],
  machine_clade: ["ancient_automaton", "crocubot", "iron_warden", "deepcore_ballista_sentinel"],
  vermin_pack: ["rat", "dire_wolf", "giant_spider", "basilisk", "spore_crawler", "cave_troll"],
  voidborn: ["rift_hound", "nullmetal_assassin", "singularity_hunter", "wraith", "slime_indigo", "slime_violet"],
  fungal_brood: ["slime_green", "slime_yellow", "spore_crawler", "giant_spider", "basilisk", "cave_troll"],
});

function hash01(seed = "") {
  let h = 2166136261 >>> 0;
  const src = String(seed ?? "");
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function weightedPick(entries, seed) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.w) || 0), 0);
  if (total <= 0) return entries[0]?.id ?? "";
  let roll = hash01(seed) * total;
  for (const entry of entries) {
    roll -= Math.max(0, Number(entry.w) || 0);
    if (roll <= 0) return entry.id;
  }
  return entries[entries.length - 1]?.id ?? "";
}

export function chooseLocalFaction({ depth = 0, seed = "", cx = 0, cy = 0 } = {}) {
  const d = clampInt(depth, 0, 0);
  const entries = [
    { id: "surface_raiders", w: d <= 4 ? 1.15 : 0.45 },
    { id: "vermin_pack", w: 0.95 },
    { id: "bone_cult", w: d >= 1 ? 0.85 : 0.4 },
    { id: "fungal_brood", w: d >= 2 ? 0.7 : 0.35 },
    { id: "machine_clade", w: d >= 4 ? 0.9 : 0.25 },
    { id: "voidborn", w: d >= 5 ? 0.95 : 0.18 },
  ];
  return weightedPick(entries, `${seed}|faction|${d}|${cx},${cy}`);
}

export function chooseChunkArchetype({
  depth = 0,
  seed = "",
  cx = 0,
  cy = 0,
  specials = null,
  lockedDoorRewards = [],
} = {}) {
  if (specials?.shrine) return "shrine_defense";
  if ((lockedDoorRewards?.length ?? 0) >= 2 && depth >= 3) return "elite_vault";
  const entries = [
    { id: "ambush_room", w: 0.95 },
    { id: "artillery_hall", w: depth >= 2 ? 0.8 : 0.25 },
    { id: "trap_corridor", w: depth >= 1 ? 0.85 : 0.2 },
    { id: "brood_nest", w: depth >= 2 ? 0.72 : 0.1 },
    { id: "void_breach", w: depth >= 5 ? 0.7 : 0.05 },
    { id: "merchant_refuge", w: depth >= 4 ? 0.14 : 0.02 },
  ];
  return weightedPick(entries, `${seed}|arch|${depth}|${cx},${cy}`);
}

export function buildChunkEncounterProfile({
  depth = 0,
  seed = "",
  cx = 0,
  cy = 0,
  specials = null,
  lockedDoorRewards = [],
} = {}) {
  const factionId = chooseLocalFaction({ depth, seed, cx, cy });
  const archetypeId = chooseChunkArchetype({ depth, seed, cx, cy, specials, lockedDoorRewards });
  const archetype = ROOM_ARCHETYPES[archetypeId] ?? ROOM_ARCHETYPES.ambush_room;
  return {
    factionId,
    archetypeId,
    monsterPool: FACTION_POOLS[factionId] ?? [],
    monsterCountBonus: clampInt(archetype.monsterCountBonus, -2, 0),
    trapWeightMult: Math.max(0.2, Number(archetype.trapWeightMult ?? 1)),
  };
}

export function weightedMonsterTableForEncounter(baseTable = [], profile = null) {
  const pool = new Set(profile?.monsterPool ?? []);
  if (!pool.size) return Array.isArray(baseTable) ? baseTable.slice() : [];
  const boosted = [];
  for (const entry of baseTable ?? []) {
    if (!entry?.id) continue;
    const inPool = pool.has(entry.id);
    boosted.push({
      id: entry.id,
      w: Math.max(0.1, Number(entry.w ?? 0) * (inPool ? 1.55 : 0.62)),
    });
  }
  return boosted.length ? boosted : (Array.isArray(baseTable) ? baseTable.slice() : []);
}
