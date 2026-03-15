function clampNum(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const ACTIVE_ABILITY_FAMILIES = Object.freeze({
  brace_stance: {
    id: "brace_stance",
    label: "Brace",
    family: "guard",
    energyCost: 32,
    cooldown: 4,
    targeting: "self",
  },
  charge_strike: {
    id: "charge_strike",
    label: "Charge",
    family: "breach",
    energyCost: 38,
    cooldown: 4,
    range: 3,
    targeting: "enemy",
    telegraph: false,
  },
  aimed_shot: {
    id: "aimed_shot",
    label: "Aimed Shot",
    family: "precision",
    energyCost: 34,
    cooldown: 3,
    range: 6,
    targeting: "enemy",
    telegraph: true,
  },
  shadowstep: {
    id: "shadowstep",
    label: "Shadowstep",
    family: "rogue",
    energyCost: 36,
    cooldown: 4,
    range: 4,
    targeting: "enemy",
    telegraph: false,
  },
  mind_lance: {
    id: "mind_lance",
    label: "Mind Lance",
    family: "psionic",
    energyCost: 34,
    cooldown: 3,
    range: 6,
    targeting: "enemy",
    telegraph: true,
  },
  anchor_field: {
    id: "anchor_field",
    label: "Anchor Field",
    family: "psionic",
    energyCost: 30,
    cooldown: 5,
    targeting: "self",
  },
  scan_reveal: {
    id: "scan_reveal",
    label: "Scan",
    family: "psionic",
    energyCost: 24,
    cooldown: 4,
    targeting: "self",
  },
  throw_vial: {
    id: "throw_vial",
    label: "Throw Vial",
    family: "utility",
    energyCost: 30,
    cooldown: 3,
    range: 5,
    targeting: "enemy",
    telegraph: true,
  },
  deploy_trap: {
    id: "deploy_trap",
    label: "Deploy Trap",
    family: "utility",
    energyCost: 26,
    cooldown: 4,
    targeting: "ground",
  },
  overclock: {
    id: "overclock",
    label: "Overclock",
    family: "utility",
    energyCost: 28,
    cooldown: 5,
    targeting: "self",
  },
  acid_glob: {
    id: "acid_glob",
    label: "Acid Glob",
    family: "utility",
    energyCost: 32,
    cooldown: 4,
    range: 5,
    targeting: "enemy",
    telegraph: true,
  },
});

const CLASS_ACTIVE_ABILITY_IDS = Object.freeze({
  vanguard: "charge_strike",
  bulwark: "brace_stance",
  rogue: "shadowstep",
  ranger: "aimed_shot",
  operative: "shadowstep",
  alchemist: "throw_vial",
  sentinel: "brace_stance",
  execution_frame: "charge_strike",
  calibrator: "scan_reveal",
  overclock_unit: "overclock",
  fabricator: "deploy_trap",
  nullblade: "mind_lance",
  veilblade: "shadowstep",
  shadeguard: "brace_stance",
  riftstalker: "shadowstep",
  echo_sniper: "aimed_shot",
  void_savant: "mind_lance",
  warden_gap: "anchor_field",
  tunnel_striker: "charge_strike",
  slipblade: "shadowstep",
  burrowguard: "brace_stance",
  shadowrunner: "shadowstep",
  scrapper: "charge_strike",
  trapwright: "deploy_trap",
  psion: "mind_lance",
  mindpiercer: "mind_lance",
  surveyor: "scan_reveal",
  telekinetic: "anchor_field",
  neural_anchor: "anchor_field",
  observer_prime: "scan_reveal",
  hive_warrior: "charge_strike",
  spitter: "acid_glob",
  chitin_guard: "brace_stance",
  skydarter: "aimed_shot",
  broodmind: "deploy_trap",
  venomblade: "throw_vial",
});

export function activeAbilityForClass(classId = "") {
  const familyId = CLASS_ACTIVE_ABILITY_IDS[String(classId ?? "").trim()] ?? "";
  return ACTIVE_ABILITY_FAMILIES[familyId] ? { ...ACTIVE_ABILITY_FAMILIES[familyId] } : null;
}

export function activeAbilityCostForPlayer(player, ability) {
  if (!ability || typeof ability !== "object") return 0;
  const mult = Math.max(0.1, Number(player?.abilityCostMult ?? 1));
  return Math.max(8, Math.round(clampNum(ability.energyCost, 0, 999, 0) * mult));
}

export function activeAbilityRangeForPlayer(player, ability) {
  if (!ability || typeof ability !== "object") return 1;
  const base = Math.max(1, Math.floor(Number(ability.range ?? 1) || 1));
  const mult = Math.max(0.1, Number(player?.abilityRangeMult ?? 1));
  return Math.max(1, Math.round(base * mult));
}

export function canPlayerUseActiveAbility(player, ability) {
  if (!player || !ability) return false;
  const energyCost = activeAbilityCostForPlayer(player, ability);
  if (clampNum(player.abilityCd, 0, 999, 0) > 0) return false;
  if (clampNum(player.energy, 0, Number.POSITIVE_INFINITY, 0) < energyCost) return false;
  return true;
}

export function activeAbilityStatus(player, ability) {
  if (!player || !ability) return { ok: false, reason: "No ability" };
  const energyCost = activeAbilityCostForPlayer(player, ability);
  const cooldown = clampNum(player.abilityCd, 0, 999, 0);
  if (cooldown > 0) return { ok: false, reason: `Cooldown ${cooldown}` };
  if (clampNum(player.energy, 0, Number.POSITIVE_INFINITY, 0) < energyCost) return { ok: false, reason: `Need ${energyCost}` };
  return { ok: true, reason: ability.label };
}
