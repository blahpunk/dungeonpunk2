import {
  LOCAL_SLOT_BACKUP_MIGRATED_KEY,
  LOCAL_SLOT_MAX,
  createLocalSlotStore,
} from "./client/save/saveManager.js";

// Infinite Dungeon Roguelike (Explore-Generated, Chunked, Multi-depth)
// v4.5
// - UI/Controls:
//   - "E" is now contextual: interacts with shrines OR uses stairs (up/down) when standing on them.
//   - "New Dungeon" reset flow now uses an in-game confirmation overlay (button + "R" hotkey).

const CHUNK = 32;
const TILE = 256;
const BASE_VIEW_RADIUS = 14;
// Slight desktop zoom-out (~5%) so more dungeon tiles are visible.
const DESKTOP_TARGET_TILE_PX = 40;
// Mobile zoom-in (~50%) so tiles render significantly larger.
const MOBILE_VIEW_RADIUS = Math.max(5, Math.round(BASE_VIEW_RADIUS / 1.5));

const MINI_SCALE = 3;
const MINI_RADIUS = 40;

const WALL = "#";
const FLOOR = ".";
const DOOR_CLOSED = "+";  // blocks movement + LOS, bump opens (spend turn)
const DOOR_OPEN = "/";    // passable, does NOT block LOS
const DOOR_OPEN_YELLOW = "y";
const DOOR_OPEN_ORANGE = "o";
const DOOR_OPEN_RED = "r";
const DOOR_OPEN_GREEN = "g";
const DOOR_OPEN_VIOLET = "v";
const DOOR_OPEN_INDIGO = "i";
// Legacy open-door tile codes retained for backward compatibility with old saves.
const DOOR_OPEN_BLUE = "b";
const DOOR_OPEN_PURPLE = "p";
const DOOR_OPEN_MAGENTA = "m";
const LOCK_YELLOW = "Y";
const LOCK_ORANGE = "O";
const LOCK_RED = "R";
const LOCK_GREEN = "G";
const LOCK_VIOLET = "V";
const LOCK_INDIGO = "I";
// Legacy lock tile codes retained for backward compatibility with old saves.
const LOCK_BLUE = "B";
const LOCK_PURPLE = "P";
const LOCK_MAGENTA = "M";
const STAIRS_DOWN = ">";
const STAIRS_UP = "<";
const SURFACE_LEVEL = -1;
const SURFACE_HALF_SIZE = 22;

const KEY_RED = "key_red";
const KEY_GREEN = "key_green";
const KEY_YELLOW = "key_yellow";
const KEY_ORANGE = "key_orange";
const KEY_VIOLET = "key_violet";
const KEY_INDIGO = "key_indigo";
// Legacy key ids retained for backward compatibility with old saves.
const KEY_BLUE = "key_blue";
const KEY_PURPLE = "key_purple";
const KEY_MAGENTA = "key_magenta";

const SAVE_KEY = "infinite_dungeon_roguelike_save_v8";
const SAVE_LOGIN_HANDOFF_KEY = "dungeon25_save_after_login_handoff_v1";
const SAVE_AUTH_STATE_KEY = "infinite_dungeon_save_auth_state_v1";
const CHARACTER_STATE_SLOT_PREFIX = "charstate:";
const LOCAL_CHARACTER_STATE_PREFIX = "infinite_dungeon_character_state_v1:";
const CHARACTER_SYNC_DEBOUNCE_MS = 1200;
const XP_SCALE = 100;
const COMBAT_SCALE = 100;
const POTION_HEAL_PCT = 0.35;
const XP_DAMAGE_PER_LEGACY_DAMAGE = 4.5;
const XP_KILL_BONUS_PER_MONSTER_XP = 9;
const XP_TO_NEXT_EARLY_MULT = 0.32;
const XP_TO_NEXT_EARLY_FADE_LEVEL = 10;
const XP_TO_NEXT_LEVEL_RAMP = 0.012;
const EXPLORATION_XP_ROOM = 18;
const EXPLORATION_XP_CORRIDOR = 11;
const EXPLORATION_XP_DEPTH_BASE_MULT = 0.72;
const EXPLORATION_XP_DEPTH_PER_LEVEL = 0.03;
const EXPLORATION_XP_DEPTH_BONUS_CAP = 0.36;
const XP_KILL_DEPTH_BONUS_PER_DEPTH = 0.025;
const XP_KILL_DEPTH_BONUS_CAP = 0.5;
const XP_DAMAGE_REWARD_SHARE = 0.52;
const XP_CHALLENGE_MIN_MULT = 0.08;
const XP_CHALLENGE_MAX_MULT = 1.75;
const XP_LEVEL_DIFF_BONUS_PER_LEVEL = 0.06;
const XP_LEVEL_DIFF_PENALTY_PER_LEVEL = 0.14;
const XP_LEVEL_DIFF_BONUS_CAP = 0.55;
const XP_LEVEL_DIFF_PENALTY_CAP = 0.72;
const XP_FARM_DEPTH_GRACE = 2;
const XP_FARM_DEPTH_PENALTY_PER_DEPTH = 0.08;
const XP_FARM_DEPTH_PENALTY_CAP = 0.7;
const XP_WEAPON_TIER_OVERGEAR_PENALTY_PER_TIER = 0.17;
const XP_WEAPON_TIER_UNDERGEAR_BONUS_PER_TIER = 0.08;
const XP_ARMOR_TIER_OVERGEAR_PENALTY_PER_TIER = 0.08;
const XP_ARMOR_TIER_UNDERGEAR_BONUS_PER_TIER = 0.04;
const XP_GEAR_TIER_ADJ_CAP = 0.5;
const XP_MONSTER_THREAT_BONUS_PER_XP = 0.006;
const XP_MONSTER_THREAT_BONUS_CAP = 0.18;
const XP_DEPTH_KILL_SOFTCAP_BASE = 24;
const XP_DEPTH_KILL_SOFTCAP_PER_DEPTH = 3;
const XP_DEPTH_KILL_PENALTY_PER_EXTRA = 0.012;
const XP_DEPTH_KILL_PENALTY_CAP = 0.55;
const STAIRS_DOWN_SPAWN_CHANCE = 0.48;
const STAIRS_UP_SPAWN_CHANCE = 0.50;
const EDGE_SHADE_PX = Math.max(2, Math.floor(TILE * 0.12));
const CORNER_CHAMFER_PX = Math.max(3, Math.floor(TILE * 0.22));
const EDGE_SOFT_PX = Math.max(2, Math.floor(TILE * 0.08));
const ENV_STYLE_VARIANTS = Object.freeze([
  {
    id: "carved_stone",
    label: "Carved Stone",
    hueShift: 0,
    floorSat: 4,
    floorLight: 1,
    wallSat: 1,
    wallLight: 0,
    borderScale: 1.0,
    aoScale: 1.0,
    insetScale: 1.0,
    noiseScale: 0.75,
    decalScale: 0.8,
    highlightScale: 1.0,
    bottomShadowScale: 0.9,
  },
  {
    id: "industrial_rustpunk",
    label: "Industrial Rustpunk",
    hueShift: 10,
    floorSat: -2,
    floorLight: -1,
    wallSat: 5,
    wallLight: -2,
    borderScale: 1.12,
    aoScale: 1.08,
    insetScale: 1.14,
    noiseScale: 1.12,
    decalScale: 1.2,
    highlightScale: 0.92,
    bottomShadowScale: 1.08,
  },
  {
    id: "organic_cavern",
    label: "Organic Cavern",
    hueShift: -12,
    floorSat: 2,
    floorLight: -2,
    wallSat: -1,
    wallLight: -2,
    borderScale: 0.82,
    aoScale: 1.18,
    insetScale: 0.78,
    noiseScale: 1.06,
    decalScale: 1.02,
    highlightScale: 0.72,
    bottomShadowScale: 1.06,
  },
  {
    id: "ancient_brick",
    label: "Ancient Brick",
    hueShift: 18,
    floorSat: 6,
    floorLight: 0,
    wallSat: 8,
    wallLight: 1,
    borderScale: 1.06,
    aoScale: 1.02,
    insetScale: 1.08,
    noiseScale: 0.86,
    decalScale: 0.92,
    highlightScale: 1.04,
    bottomShadowScale: 0.92,
  },
  {
    id: "corrupted_biome",
    label: "Corrupted Biome",
    hueShift: -28,
    floorSat: 8,
    floorLight: -3,
    wallSat: 6,
    wallLight: -3,
    borderScale: 0.9,
    aoScale: 1.26,
    insetScale: 0.92,
    noiseScale: 1.2,
    decalScale: 1.26,
    highlightScale: 0.68,
    bottomShadowScale: 1.12,
  },
  {
    id: "basalt_keep",
    label: "Basalt Keep",
    hueShift: 4,
    floorSat: -4,
    floorLight: -1,
    wallSat: -2,
    wallLight: -1,
    borderScale: 1.2,
    aoScale: 1.12,
    insetScale: 1.2,
    noiseScale: 0.68,
    decalScale: 0.74,
    highlightScale: 1.06,
    bottomShadowScale: 1.0,
  },
]);
const COMBAT_REGEN_DELAY_MS = 3000;
const COMBAT_REGEN_TICK_MS = 1000;
const COMBAT_REGEN_PCT_PER_TICK = 0.006;
const COMBAT_REGEN_ENEMY_BLOCK_RADIUS = 2;
const COMBAT_HUD_WINDOW_MS = 4500;
const AREA_RESPAWN_FLOOR1_MS = 90 * 1000;
const AREA_RESPAWN_MIN_MS = 45 * 1000;
const AREA_RESPAWN_DEPTH_CAP = 15;
const OUT_OF_COMBAT_HP_BAR_WIDTH_FRAC = 0.82;
const OUT_OF_COMBAT_HP_BAR_HEIGHT_FRAC = 0.125;
const COMBAT_HP_BAR_NEARBY_EXTRA_GAP_FRAC = 0.2;
const PLAYER_COMBAT_HP_BAR_EXTRA_LIFT_FRAC = 0.07;
const DEFAULT_CHARACTER_NAME = "Adventurer";
const DEFAULT_CHARACTER_CLASS_ID = "vanguard";
const DEFAULT_CHARACTER_SPECIES_ID = "human";
const CHARACTER_STAT_KEYS = ["vit", "str", "dex", "int", "agi"];
const CHARACTER_CREATION_BASE_POINTS = 10;
const CHARACTER_CREATION_MAX_STAT = 6;
const CHARACTER_STAT_MAX = 40;
const LEVEL_UP_ATTRIBUTE_POINTS = 1;
const PLAYER_STAT_SCALE = 10;
const PLAYER_PROGRESSION_CURVE_LEVEL = 30;
const PLAYER_OFFENSE_LEVEL_WEIGHT_EARLY = 0.62;
const PLAYER_OFFENSE_LEVEL_WEIGHT_LATE = 1.72;
const PLAYER_DEFENSE_LEVEL_WEIGHT_EARLY = 0.96;
const PLAYER_DEFENSE_LEVEL_WEIGHT_LATE = 1.58;
const PLAYER_WEAPON_ATK_SCALE_CURVE_LEVEL = 24;
const PLAYER_WEAPON_ATK_SCALE_EARLY = 0.52;
const PLAYER_WEAPON_ATK_SCALE_LATE = 1.24;
const PLAYER_LEVEL_FLAT_ATK_CURVE_EXP = 1.5;
const PLAYER_LEVEL_FLAT_ATK_SCALE = 1.05;
const MONSTER_OFFENSE_SIZE_SCALE_WEIGHT = 0.35;
const MONSTER_DEFENSE_SIZE_SCALE_WEIGHT = 0.12;
const MONSTER_OFFENSE_DEPTH_WEIGHT_SHALLOW = 1.2;
const MONSTER_OFFENSE_DEPTH_WEIGHT_DEEP = 0.78;
const MONSTER_DEFENSE_DEPTH_WEIGHT_SHALLOW = 0.92;
const MONSTER_DEFENSE_DEPTH_WEIGHT_DEEP = 0.22;
const EARLY_DEPTH_PRESSURE_FADE_DEPTH = 8;
const EARLY_DEPTH_HP_MULT = 1.24;
const EARLY_DEPTH_OFFENSE_MULT = 1.34;
const EARLY_DEPTH_DEFENSE_MULT = 1.06;
const MID_DEPTH_BOOST_START = 4;
const MID_DEPTH_BOOST_PEAK = 6;
const MID_DEPTH_BOOST_END = 11;
const MID_DEPTH_HP_MULT_PEAK = 1.2;
const MID_DEPTH_OFFENSE_MULT_PEAK = 1.2;
const MID_DEPTH_DEFENSE_MULT_PEAK = 1.14;
const PLAYER_DEFENSE_SOFTCAP_BASE = 120;
const PLAYER_DEFENSE_SOFTCAP_SLOPE = 0.08;
const MONSTER_MIN_HP_FLOOR_START_DEPTH = 3;
const MONSTER_MIN_HP_FLOOR_BASE = 40;
const MONSTER_MIN_HP_FLOOR_PER_DEPTH = 10;
const BASE_POTION_CAPACITY = 5;
const TRAP_TYPE_PRESSURE = "pressure_floor";
const TRAP_REVEALED_SPRITE_ID = "trap_pressure_revealed";
const TRAP_DETECTION_CHANCE_MIN = 0.03;
const TRAP_DETECTION_CHANCE_MAX = 0.92;
const DEFAULT_CHARACTER_STATS = { vit: 2, str: 3, dex: 2, int: 1, agi: 2 };
const CHARACTER_CREATION_DRAFT_STATS = { vit: 0, str: 0, dex: 0, int: 0, agi: 0 };
const CHARACTER_CREATE_STEPS = ["welcome", "species", "class", "stats", "name"];
const SPECIES_DEFS = {
  human: {
    id: "human",
    name: "Human",
    blurb: "Humans were not built for the dungeon; they adapted through flexibility, stubbornness, and invention.",
    extraCreationPoints: 1,
    defaultClassId: "vanguard",
    hpMult: 1,
    armorEffect: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    lowHpDamageMult: 1,
    healMult: 1,
    xpGainMult: 1.05,
    energyFlat: 0,
    buffLines: ["+1 creation stat point", "+5% XP gain", "No penalties"],
  },
  automaton: {
    id: "automaton",
    name: "Automaton",
    blurb: "Ancient mechanical intelligences built for labor and war, enduring extreme punishment but recovering poorly.",
    extraCreationPoints: 0,
    defaultClassId: "sentinel",
    hpMult: 1,
    armorEffect: 1.12,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    lowHpDamageMult: 1,
    poisonImmune: true,
    healMult: 0.9,
    xpGainMult: 1,
    energyFlat: 0,
    buffLines: ["+12% armor effectiveness", "-10% healing received", "Immune to poison"],
  },
  hollowed: {
    id: "hollowed",
    name: "Hollowed",
    blurb: "Survivors touched by deep anomalies, lighter and evasive, moving like they are slightly out of phase.",
    extraCreationPoints: 0,
    defaultClassId: "veilblade",
    hpMult: 0.9,
    armorEffect: 1,
    accFlat: 0,
    evaFlat: 10,
    speedMult: 1,
    fearImmune: true,
    lowHpDamageMult: 1,
    healMult: 1,
    xpGainMult: 1,
    energyFlat: 0,
    buffLines: ["+10 EVA", "-10% Max HP", "Immune to fear"],
  },
  skulker: {
    id: "skulker",
    name: "Skulker",
    blurb: "Tunnel-adapted mutants with elite reflexes and spatial awareness, thriving in cramped corridors.",
    extraCreationPoints: 0,
    defaultClassId: "tunnel_striker",
    hpMult: 1,
    armorEffect: 1,
    accFlat: 0,
    evaFlat: 8,
    speedMult: 1.05,
    trapDetectRadiusMult: 1.1,
    lowHpDamageMult: 1,
    healMult: 1,
    xpGainMult: 1,
    energyFlat: 0,
    buffLines: ["+8 EVA", "+5% speed", "+10% trap detection radius"],
  },
  grey: {
    id: "grey",
    name: "Grey",
    blurb: "Extraterrestrial observers: cerebral, precise, and detached, studying the dungeon as a phenomenon.",
    extraCreationPoints: 0,
    defaultClassId: "psion",
    hpMult: 0.92,
    armorEffect: 1,
    accFlat: 10,
    evaFlat: 0,
    speedMult: 1,
    lowHpDamageMult: 1,
    healMult: 1,
    xpGainMult: 1,
    energyFlat: 20,
    buffLines: ["+20 energy", "+10 ACC", "-8% Max HP"],
  },
  insectoid: {
    id: "insectoid",
    name: "Insectoid",
    blurb: "Hive-born predators with relentless tempo and hardened chitin, fighting by instinct and coordination.",
    extraCreationPoints: 0,
    defaultClassId: "hive_warrior",
    hpMult: 1,
    armorEffect: 1.1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1.06,
    fireResistMult: 0.9,
    lowHpDamageMult: 1,
    healMult: 1,
    xpGainMult: 1,
    energyFlat: 0,
    buffLines: ["+10% armor effectiveness", "+6% speed", "-10% fire resistance"],
  },
};
const CLASS_DEFS = {
  // Human classes
  vanguard: {
    id: "vanguard",
    speciesId: "human",
    name: "Vanguard",
    blurb: "Frontline pressure fighter who thrives in sustained melee.",
    hpMult: 1,
    armorEffect: 1.08,
    weaponDamageMult: 1.12,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+12% weapon damage", "+8% armor effectiveness"],
  },
  bulwark: {
    id: "bulwark",
    speciesId: "human",
    name: "Bulwark",
    blurb: "Heavy defensive specialist.",
    hpMult: 1.2,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 3,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+20% Max HP", "Incoming damage reduced by flat 3"],
  },
  rogue: {
    id: "rogue",
    speciesId: "human",
    name: "Rogue",
    blurb: "Precision assassin.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 10,
    speedMult: 1,
    critFlat: 5,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+10 EVA", "+5% crit chance"],
  },
  ranger: {
    id: "ranger",
    speciesId: "human",
    name: "Ranger",
    blurb: "Reliable ranged damage dealer.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 10,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0.15,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+10 ACC", "Ranged hits ignore 15% DEF"],
  },
  operative: {
    id: "operative",
    speciesId: "human",
    name: "Operative",
    blurb: "Mobile hit-and-run specialist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1.08,
    critFlat: 0,
    firstStrikeMoveMult: 1.15,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+8% speed", "First attack after moving: +15% damage"],
  },
  alchemist: {
    id: "alchemist",
    speciesId: "human",
    name: "Alchemist",
    blurb: "Resource survivalist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1.2,
    potionCapBonus: 1,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+20% healing item value", "+1 potion capacity"],
  },

  // Automaton classes
  sentinel: {
    id: "sentinel",
    speciesId: "automaton",
    name: "Sentinel",
    blurb: "Defensive stabilizer unit.",
    hpMult: 1.15,
    armorEffect: 1.05,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+15% Max HP", "+5% armor effectiveness"],
  },
  execution_frame: {
    id: "execution_frame",
    speciesId: "automaton",
    name: "Execution Frame",
    blurb: "Heavy assault chassis.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1.15,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 0.97,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+15% weapon damage", "-3% speed"],
  },
  calibrator: {
    id: "calibrator",
    speciesId: "automaton",
    name: "Calibrator",
    blurb: "Precision targeting unit.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 12,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 5,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+12 ACC", "+5% crit chance"],
  },
  overclock_unit: {
    id: "overclock_unit",
    speciesId: "automaton",
    name: "Overclock Unit",
    blurb: "Short-burst performance mode.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1.12,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+12% speed", "After taking damage: +10% damage for 3s"],
  },
  fabricator: {
    id: "fabricator",
    speciesId: "automaton",
    name: "Fabricator",
    blurb: "Adaptive field engineer.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1.25,
    consumableSlotBonus: 1,
    repairKitHealMult: 1.25,
    potionCapBonus: 1,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Repair kits heal 25% more", "+1 consumable slot"],
  },
  nullblade: {
    id: "nullblade",
    speciesId: "automaton",
    name: "Nullblade",
    blurb: "Anti-void combat frame.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1.08,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+10% damage vs Hollowed/void enemies", "+8% energy capacity"],
  },

  // Hollowed classes
  veilblade: {
    id: "veilblade",
    speciesId: "hollowed",
    name: "Veilblade",
    blurb: "Phase-shifting striker.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1.08,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["First attack each combat ignores 25% DEF", "+8% speed"],
  },
  shadeguard: {
    id: "shadeguard",
    speciesId: "hollowed",
    name: "Shadeguard",
    blurb: "Void-touched defender.",
    hpMult: 1.1,
    armorEffect: 1.06,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["15% chance to reduce incoming damage by 30%", "+10% Max HP"],
  },
  riftstalker: {
    id: "riftstalker",
    speciesId: "hollowed",
    name: "Riftstalker",
    blurb: "Ambush specialist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 6,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+15% damage when attacking unengaged targets", "+6 EVA"],
  },
  echo_sniper: {
    id: "echo_sniper",
    speciesId: "hollowed",
    name: "Echo Sniper",
    blurb: "Precision anomaly marksman.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 14,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.65,
    critDefIgnorePct: 0,
    buffLines: ["+14 ACC", "+10% crit damage"],
  },
  void_savant: {
    id: "void_savant",
    speciesId: "hollowed",
    name: "Void Savant",
    blurb: "Anomaly channeler.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    abilityCostMult: 0.9,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 25,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+25 energy", "Abilities cost -10%"],
  },
  warden_gap: {
    id: "warden_gap",
    speciesId: "hollowed",
    name: "Warden of the Gap",
    blurb: "Disruption specialist.",
    hpMult: 1,
    armorEffect: 1.08,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Enemies within 2 tiles lose 5 ACC", "+8% armor effectiveness"],
  },

  // Skulker classes
  tunnel_striker: {
    id: "tunnel_striker",
    speciesId: "skulker",
    name: "Tunnel Striker",
    blurb: "Close-quarters specialist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 6,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+15% damage in melee range 1", "+6 EVA"],
  },
  slipblade: {
    id: "slipblade",
    speciesId: "skulker",
    name: "Slipblade",
    blurb: "Extreme mobility duelist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1.12,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+12% speed", "After dodging: next attack +10% damage"],
  },
  burrowguard: {
    id: "burrowguard",
    speciesId: "skulker",
    name: "Burrowguard",
    blurb: "Compact defender.",
    hpMult: 1.12,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    knockbackResistPct: 0.5,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+12% Max HP", "Reduced knockback"],
  },
  shadowrunner: {
    id: "shadowrunner",
    speciesId: "skulker",
    name: "Shadowrunner",
    blurb: "Scout-class striker.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 8,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 5,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+8 ACC", "+5% crit chance"],
  },
  scrapper: {
    id: "scrapper",
    speciesId: "skulker",
    name: "Scrapper",
    blurb: "Improvised weapon specialist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    salvageChanceBonus: 1,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+10% damage with low-tier weapons", "+1 salvage chance"],
  },
  trapwright: {
    id: "trapwright",
    speciesId: "skulker",
    name: "Trapwright",
    blurb: "Hazard manipulator.",
    hpMult: 1,
    armorEffect: 1.05,
    weaponDamageMult: 1,
    damageMult: 1.04,
    trapDamageMult: 1.2,
    ignoreOwnTraps: true,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Traps deal 20% more damage", "Immune to own traps"],
  },

  // Grey classes
  psion: {
    id: "psion",
    speciesId: "grey",
    name: "Psion",
    blurb: "Mind-damage specialist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1.15,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 15,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Abilities deal +15% damage", "+15 energy"],
  },
  mindpiercer: {
    id: "mindpiercer",
    speciesId: "grey",
    name: "Mindpiercer",
    blurb: "Precision neural attacker.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 5,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0.2,
    buffLines: ["+5% crit chance", "Crits ignore 20% DEF"],
  },
  surveyor: {
    id: "surveyor",
    speciesId: "grey",
    name: "Surveyor",
    blurb: "Dungeon analyst.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 12,
    evaFlat: 0,
    speedMult: 1,
    rareLootChanceBonus: 0.05,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1.04,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+12 ACC", "Increased rare loot chance (small %)"],
  },
  telekinetic: {
    id: "telekinetic",
    speciesId: "grey",
    name: "Telekinetic",
    blurb: "Force manipulator.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    abilityRangeMult: 1.1,
    critFlat: 0,
    firstStrikeMoveMult: 1.12,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["First attack each combat knocks back target", "+10% ability range"],
  },
  neural_anchor: {
    id: "neural_anchor",
    speciesId: "grey",
    name: "Neural Anchor",
    blurb: "Stability field generator.",
    hpMult: 1.1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 5,
    allyAccAura: 5,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Allies gain +5 ACC", "+10% Max HP"],
  },
  observer_prime: {
    id: "observer_prime",
    speciesId: "grey",
    name: "Observer Prime",
    blurb: "Long-run strategist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    floorMilestoneBuffEnabled: true,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1.08,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+8% XP gain", "Every 5 floors: minor random stat buff"],
  },

  // Insectoid classes
  hive_warrior: {
    id: "hive_warrior",
    speciesId: "insectoid",
    name: "Hive Warrior",
    blurb: "Frontline swarm unit.",
    hpMult: 1.1,
    armorEffect: 1,
    weaponDamageMult: 1.12,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+12% weapon damage", "+10% Max HP"],
  },
  spitter: {
    id: "spitter",
    speciesId: "insectoid",
    name: "Spitter",
    blurb: "Ranged toxin specialist.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 10,
    evaFlat: 0,
    speedMult: 1,
    rangedPoisonOnHit: {
      chance: 1,
      dmgPct: 0.10,
      turns: 2,
      sourceLabel: "toxic spit",
      nativeOnly: true,
      requiredFlavor: "toxin",
    },
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0.1,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Ranged attacks apply minor poison", "+10 ACC"],
  },
  chitin_guard: {
    id: "chitin_guard",
    speciesId: "insectoid",
    name: "Chitin Guard",
    blurb: "Exoskeletal tank.",
    hpMult: 1,
    armorEffect: 1.18,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 0.96,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+18% armor effectiveness", "-4% speed"],
  },
  skydarter: {
    id: "skydarter",
    speciesId: "insectoid",
    name: "Skydarter",
    blurb: "Extreme mobility striker.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1.14,
    critFlat: 0,
    firstStrikeMoveMult: 1.12,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["+14% speed", "First strike bonus +12%"],
  },
  broodmind: {
    id: "broodmind",
    speciesId: "insectoid",
    name: "Broodmind",
    blurb: "Hive tactician.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    critFlat: 0,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 15,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Enemies within 2 tiles lose 5 EVA", "+15 energy"],
  },
  venomblade: {
    id: "venomblade",
    speciesId: "insectoid",
    name: "Venomblade",
    blurb: "Close-range executioner.",
    hpMult: 1,
    armorEffect: 1,
    weaponDamageMult: 1,
    damageMult: 1.05,
    accFlat: 0,
    evaFlat: 0,
    speedMult: 1,
    meleePoisonOnHit: {
      chance: 1,
      dmgPct: 0.08,
      turns: 2,
      sourceLabel: "venom strike",
      stack: true,
      maxStacks: 4,
    },
    critFlat: 5,
    firstStrikeMoveMult: 1,
    rangedDefIgnorePct: 0,
    healMult: 1,
    potionCapBonus: 0,
    energyFlat: 0,
    energyMult: 1,
    xpGainMult: 1,
    incomingDamageFlatLegacy: 0,
    critDamageMult: 1.5,
    critDefIgnorePct: 0,
    buffLines: ["Melee attacks apply stacking minor poison", "+5% crit chance"],
  },
};

function classListForSpecies(speciesId) {
  const sid = normalizeCharacterSpeciesId(speciesId);
  return Object.values(CLASS_DEFS).filter((entry) => entry?.speciesId === sid);
}

function defaultClassIdForSpecies(speciesId) {
  const sid = normalizeCharacterSpeciesId(speciesId);
  const species = SPECIES_DEFS[sid] ?? SPECIES_DEFS[DEFAULT_CHARACTER_SPECIES_ID];
  const preferred = normalizeCharacterClassId(species?.defaultClassId ?? DEFAULT_CHARACTER_CLASS_ID);
  if (CLASS_DEFS[preferred]?.speciesId === sid) return preferred;
  const first = classListForSpecies(sid)[0];
  return first?.id ?? DEFAULT_CHARACTER_CLASS_ID;
}

function normalizeCharacterSlotId(raw) {
  const id = String(raw ?? "").trim().toLowerCase();
  if (!id) return "";
  if (id.startsWith(CHARACTER_STATE_SLOT_PREFIX)) {
    const characterId = normalizeCharacterProfileIdFromSlotId(id);
    return characterId ? `${CHARACTER_STATE_SLOT_PREFIX}${characterId}` : "";
  }
  if (/^[a-f0-9]{16,64}$/.test(id)) return id;
  if (/^[a-z0-9_]{1,80}$/.test(id)) return id;
  return "";
}

function normalizeCharacterProfileIdFromSlotId(slotId = "") {
  const id = String(slotId ?? "").trim().toLowerCase();
  if (!id.startsWith(CHARACTER_STATE_SLOT_PREFIX)) return "";
  const raw = id.slice(CHARACTER_STATE_SLOT_PREFIX.length);
  return /^[a-z0-9_]{4,80}$/.test(raw) ? raw : "";
}

function isCharacterStateSlotId(slotId = "") {
  return !!normalizeCharacterProfileIdFromSlotId(slotId);
}

function characterStateSlotId(characterId = "") {
  const id = String(characterId ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{4,80}$/.test(id)) return "";
  return `${CHARACTER_STATE_SLOT_PREFIX}${id}`;
}

function normalizeCharacterProfileId(value = "") {
  const id = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9_]{4,80}$/.test(id) ? id : "";
}

function activeCharacterProfileIdFromCurrentState() {
  const slotId = String(getActiveCharacterSlotId() ?? "");
  const fromSlot = normalizeCharacterProfileIdFromSlotId(slotId);
  if (fromSlot) return fromSlot;
  return normalizeCharacterProfileId(game?.character?.id ?? "");
}

// ---------- DOM ----------
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const canAdminControls = document.body?.dataset?.canAdminControls === "1";
const isAuthenticatedUser = document.body?.dataset?.isAuthenticated === "1";
const saveApiCsrfToken = document.body?.dataset?.saveCsrf ?? "";
const saveSlotMax = Math.max(1, Number.parseInt(document.body?.dataset?.saveMaxSlots ?? "10", 10) || 10);
const saveNameMaxLen = Math.max(1, Number.parseInt(document.body?.dataset?.saveNameMaxLen ?? "48", 10) || 48);
const localSlotStore = createLocalSlotStore({
  storage: localStorage,
  normalizeId: (value) => normalizeCharacterSlotId(value ?? ""),
  maxNameLen: saveNameMaxLen,
  defaultName: "Local Adventurer",
});
const appBuildVersion = String(document.body?.dataset?.appVersion ?? "").trim() || `${Date.now()}`;
const metaEl = document.getElementById("meta");
const headerInfoEl = document.getElementById("headerInfo");
const btnNewEl = document.getElementById("btnNew");
const btnFogEl = document.getElementById("btnFog");
const btnSaveGameEl = document.getElementById("btnExport");
const btnLoadGameEl = document.getElementById("btnImport");
const btnChooseCharacterEl = document.getElementById("btnChooseCharacter");
const btnInfoEl = document.getElementById("btnInfo");
const btnSpriteEditorEl = document.getElementById("btnSpriteEditor");
const btnMonsterEditorEl = document.getElementById("btnMonsterEditor");
const authBtnEl = document.getElementById("authBtn");
const vitalsDisplayEl = document.getElementById("vitalsDisplay");
const logPanelEl = document.getElementById("logPanel");
const logEl = document.getElementById("log");
const logTickerEl = document.getElementById("logTicker");
const contextActionBtn = document.getElementById("contextActionBtn");
const contextPotionBtn = document.getElementById("contextPotionBtn");
const contextAttackListEl = document.getElementById("contextAttackList");
const dpadCenterBtnEl = document.querySelector('.dpad-btn.center[data-dx="0"][data-dy="0"]');
const depthDisplayEl = document.getElementById("depthDisplay");
const invOverlayEl = document.getElementById("invOverlay");
const mobileOverlayBackdropEl = document.getElementById("mobileOverlayBackdrop");
const mobileQuickBarEl = document.getElementById("mobileQuickBar");
const btnMobileGearEl = document.getElementById("btnMobileGear");
const btnMobileLogEl = document.getElementById("btnMobileLog");
const invListEl = document.getElementById("invList");
const equipTextEl = document.getElementById("equipText");
const equipBadgeWeaponEl = document.getElementById("equipBadgeWeapon");
const equipBadgeHeadEl = document.getElementById("equipBadgeHead");
const equipBadgeTorsoEl = document.getElementById("equipBadgeTorso");
const equipBadgeLegsEl = document.getElementById("equipBadgeLegs");
const equipBadgeLabelWeaponEl = document.getElementById("equipBadgeLabelWeapon");
const equipBadgeLabelHeadEl = document.getElementById("equipBadgeLabelHead");
const equipBadgeLabelTorsoEl = document.getElementById("equipBadgeLabelTorso");
const equipBadgeLabelLegsEl = document.getElementById("equipBadgeLabelLegs");
const characterStatsToggleEl = document.getElementById("characterStatsToggle");
const characterStatsPanelEl = document.getElementById("characterStatsPanel");
const equipSectionToggleEl = document.getElementById("equipSectionToggle");
const inventorySectionToggleEl = document.getElementById("inventorySectionToggle");
const equipSectionBodyEl = document.getElementById("equipSectionBody");
const inventorySectionBodyEl = document.getElementById("inventorySectionBody");
const effectsTextEl = document.getElementById("effectsText");
const deathOverlayEl = document.getElementById("deathOverlay");
const btnRespawnEl = document.getElementById("btnRespawn");
const btnNewDungeonEl = document.getElementById("btnNewDungeon");
const newDungeonConfirmOverlayEl = document.getElementById("newDungeonConfirmOverlay");
const newDungeonConfirmSummaryEl = document.getElementById("newDungeonConfirmSummary");
const newDungeonConfirmStartEl = document.getElementById("newDungeonConfirmStart");
const newDungeonConfirmCancelEl = document.getElementById("newDungeonConfirmCancel");
const saveGameOverlayEl = document.getElementById("saveGameOverlay");
const saveGameTitleEl = document.getElementById("saveGameTitle");
const saveGameModeEl = document.getElementById("saveGameMode");
const saveGameNameRowEl = document.getElementById("saveGameNameRow");
const saveGameNameInputEl = document.getElementById("saveGameNameInput");
const saveGameCreateBtnEl = document.getElementById("saveGameCreateBtn");
const saveGameListEl = document.getElementById("saveGameList");
const saveGameStatusEl = document.getElementById("saveGameStatus");
const saveGameCloseBtnEl = document.getElementById("saveGameCloseBtn");
const saveGameRefreshBtnEl = document.getElementById("saveGameRefreshBtn");
const characterOverlayEl = document.getElementById("characterOverlay");
const characterOverlayTitleEl = document.getElementById("characterOverlayTitle");
const characterOverlaySubtitleEl = document.getElementById("characterOverlaySubtitle");
const characterOverlayBodyEl = document.getElementById("characterOverlayBody");
const characterOverlayCloseBtnEl = document.getElementById("characterOverlayCloseBtn");
const characterOverlayPrimaryEl = document.getElementById("characterOverlayPrimary");
const characterOverlaySecondaryEl = document.getElementById("characterOverlaySecondary");
const characterOverlayTertiaryEl = document.getElementById("characterOverlayTertiary");
const infoOverlayEl = document.getElementById("infoOverlay");
const infoCloseBtnEl = document.getElementById("infoCloseBtn");
const weaponTierListEl = document.getElementById("weaponTierList");
const levelUpOverlayEl = document.getElementById("levelUpOverlay");
const levelUpStatsListEl = document.getElementById("levelUpStatsList");
const levelUpCloseBtnEl = document.getElementById("levelUpCloseBtn");
const spriteEditorOverlayEl = document.getElementById("spriteEditorOverlay");
const spriteEditorCloseBtnEl = document.getElementById("spriteEditorCloseBtn");
const spriteFilterCategoryEl = document.getElementById("spriteFilterCategory");
const spriteFilterArmorTypeEl = document.getElementById("spriteFilterArmorType");
const spriteFilterMetalTypeEl = document.getElementById("spriteFilterMetalType");
const spriteFilterSourceEl = document.getElementById("spriteFilterSource");
const spriteFilterSearchEl = document.getElementById("spriteFilterSearch");
const spriteSelectAllEl = document.getElementById("spriteSelectAll");
const spriteBulkScaleInputEl = document.getElementById("spriteBulkScaleInput");
const spriteBulkSetSizeBtnEl = document.getElementById("spriteBulkSetSizeBtn");
const spriteEditorRefreshBtnEl = document.getElementById("spriteEditorRefreshBtn");
const spriteEditorStatusEl = document.getElementById("spriteEditorStatus");
const spriteEditorListEl = document.getElementById("spriteEditorList");
const monsterEditorOverlayEl = document.getElementById("monsterEditorOverlay");
const monsterEditorCloseBtnEl = document.getElementById("monsterEditorCloseBtn");
const monsterEditorSearchInputEl = document.getElementById("monsterEditorSearchInput");
const monsterEditorPreviewDepthInputEl = document.getElementById("monsterEditorPreviewDepthInput");
const monsterEditorNewBtnEl = document.getElementById("monsterEditorNewBtn");
const monsterEditorDuplicateBtnEl = document.getElementById("monsterEditorDuplicateBtn");
const monsterEditorDeleteBtnEl = document.getElementById("monsterEditorDeleteBtn");
const monsterEditorExportBtnEl = document.getElementById("monsterEditorExportBtn");
const monsterEditorImportBtnEl = document.getElementById("monsterEditorImportBtn");
const monsterEditorImportInputEl = document.getElementById("monsterEditorImportInput");
const monsterEditorRefreshBtnEl = document.getElementById("monsterEditorRefreshBtn");
const monsterEditorRevertBtnEl = document.getElementById("monsterEditorRevertBtn");
const monsterEditorSaveBtnEl = document.getElementById("monsterEditorSaveBtn");
const monsterEditorStatusEl = document.getElementById("monsterEditorStatus");
const monsterEditorListEl = document.getElementById("monsterEditorList");
const monsterEditorPreviewEl = document.getElementById("monsterEditorPreview");
const monsterEditorFormEl = document.getElementById("monsterEditorForm");
const monsterEditAdvancedToggleEl = document.getElementById("monsterEditAdvancedToggle");
const monsterEditorAdvancedFieldsEl = document.getElementById("monsterEditorAdvancedFields");
const monsterEditIdEl = document.getElementById("monsterEditId");
const monsterEditNameEl = document.getElementById("monsterEditName");
const monsterEditGlyphEl = document.getElementById("monsterEditGlyph");
const monsterEditAliasOfEl = document.getElementById("monsterEditAliasOf");
const monsterEditAiEl = document.getElementById("monsterEditAi");
const monsterEditSizeGrowthEl = document.getElementById("monsterEditSizeGrowth");
const monsterEditBaseHpEl = document.getElementById("monsterEditBaseHp");
const monsterEditBaseAtkEl = document.getElementById("monsterEditBaseAtk");
const monsterEditBaseDefEl = document.getElementById("monsterEditBaseDef");
const monsterEditBaseAccEl = document.getElementById("monsterEditBaseAcc");
const monsterEditBaseEvaEl = document.getElementById("monsterEditBaseEva");
const monsterEditSpdEl = document.getElementById("monsterEditSpd");
const monsterEditXpEl = document.getElementById("monsterEditXp");
const monsterEditRangeEl = document.getElementById("monsterEditRange");
const monsterEditCdTurnsEl = document.getElementById("monsterEditCdTurns");
const monsterEditPreferredRangeEl = document.getElementById("monsterEditPreferredRange");
const monsterEditBlinkRangeEl = document.getElementById("monsterEditBlinkRange");
const monsterEditSummonCooldownTurnsEl = document.getElementById("monsterEditSummonCooldownTurns");
const monsterEditSpawnEnabledEl = document.getElementById("monsterEditSpawnEnabled");
const monsterEditSpawnMinDepthEl = document.getElementById("monsterEditSpawnMinDepth");
const monsterEditSpawnMaxDepthEl = document.getElementById("monsterEditSpawnMaxDepth");
const monsterEditSpawnBaseWeightEl = document.getElementById("monsterEditSpawnBaseWeight");
const monsterEditSpawnRampFactorEl = document.getElementById("monsterEditSpawnRampFactor");
const monsterEditPoisonOnHitChanceEl = document.getElementById("monsterEditPoisonOnHitChance");
const monsterEditPoisonOnHitTurnsEl = document.getElementById("monsterEditPoisonOnHitTurns");
const monsterEditPoisonOnHitDmgEl = document.getElementById("monsterEditPoisonOnHitDmg");
const monsterEditSlowOnHitChanceEl = document.getElementById("monsterEditSlowOnHitChance");
const monsterEditSlowTurnsEl = document.getElementById("monsterEditSlowTurns");
const monsterEditStunOnHitChanceEl = document.getElementById("monsterEditStunOnHitChance");
const monsterEditKnockbackOnHitChanceEl = document.getElementById("monsterEditKnockbackOnHitChance");
const monsterEditBackstabDamageMultEl = document.getElementById("monsterEditBackstabDamageMult");
const monsterEditMeleeReflectPctEl = document.getElementById("monsterEditMeleeReflectPct");
const monsterEditDeathCloudTurnsEl = document.getElementById("monsterEditDeathCloudTurns");
const monsterEditDeathCloudRadiusEl = document.getElementById("monsterEditDeathCloudRadius");
const monsterEditDeathCloudDmgEl = document.getElementById("monsterEditDeathCloudDmg");
const monsterEditImmunePoisonEl = document.getElementById("monsterEditImmunePoison");
const shopOverlayEl = document.getElementById("shopOverlay");
const shopCloseBtnEl = document.getElementById("shopCloseBtn");
const shopTabBuyEl = document.getElementById("shopTabBuy");
const shopTabSellEl = document.getElementById("shopTabSell");
const shopkeeperBuyPortraitWrapEl = document.getElementById("shopkeeperBuyPortraitWrap");
const shopkeeperBuyPortraitEl = document.getElementById("shopkeeperBuyPortrait");
const shopGoldEl = document.getElementById("shopGold");
const shopRefreshEl = document.getElementById("shopRefresh");
const shopListEl = document.getElementById("shopList");
const shopDetailTitleEl = document.getElementById("shopDetailTitle");
const shopDetailBodyEl = document.getElementById("shopDetailBody");
const shopDetailPreviewEl = document.getElementById("shopDetailPreview");
const shopActionBtnEl = document.getElementById("shopActionBtn");
const debugMenuWrapEl = document.getElementById("debugMenuWrap");
const btnDebugMenuEl = document.getElementById("btnDebugMenu");
const debugMenuEl = document.getElementById("debugMenu");
const toggleGodmodeEl = document.getElementById("toggleGodmode");
const toggleFreeShoppingEl = document.getElementById("toggleFreeShopping");
const toggleGhostEl = document.getElementById("toggleGhost");
const toggleLockpickEl = document.getElementById("toggleLockpick");
const debugDepthInputEl = document.getElementById("debugDepthInput");
const debugDepthGoEl = document.getElementById("debugDepthGo");
const debugLevelInputEl = document.getElementById("debugLevelInput");
const debugLevelGoEl = document.getElementById("debugLevelGo");
const mainCanvasWrapEl = document.getElementById("mainCanvasWrap");
const surfaceCompassEl = document.getElementById("surfaceCompass");
const surfaceCompassArrowEl = document.getElementById("surfaceCompassArrow");

// Right-side panels: panels are always visible; keep references for layout if needed
const wrapEl = document.getElementById("wrap");
const rightColEl = document.getElementById("rightCol");
let cacheBustCounter = 0;

function withCacheBust(url) {
  const sep = url.includes("?") ? "&" : "?";
  cacheBustCounter += 1;
  const token = `${appBuildVersion}.${Date.now().toString(36)}.${Math.floor(Math.random() * 1e9).toString(36)}.${cacheBustCounter.toString(36)}`;
  return `${url}${sep}_cb=${encodeURIComponent(token)}`;
}

function syncBodyModalLock() {
  const hasModal =
    !!shopOverlayEl?.classList.contains("show") ||
    !!saveGameOverlayEl?.classList.contains("show") ||
    !!characterOverlayEl?.classList.contains("show") ||
    !!infoOverlayEl?.classList.contains("show") ||
    !!spriteEditorOverlayEl?.classList.contains("show") ||
    !!monsterEditorOverlayEl?.classList.contains("show") ||
    !!newDungeonConfirmOverlayEl?.classList.contains("show") ||
    !!levelUpOverlayEl?.classList.contains("show");
  document.body?.classList.toggle("modal-open", hasModal);
}

const mini = document.getElementById("mini");
const mctx = mini.getContext("2d");

const MAX_RENDER_CANVAS_DIM = 4096;
let viewRadiusX = BASE_VIEW_RADIUS;
let viewRadiusY = BASE_VIEW_RADIUS;
let viewTilesX = viewRadiusX * 2 + 1;
let viewTilesY = viewRadiusY * 2 + 1;
let renderScale = 1;
let viewportSig = "";

function isMobileViewport() {
  const coarse = (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
    (typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));
  const narrow = typeof window !== "undefined" ? window.matchMedia("(max-width: 760px)").matches : false;
  return coarse || narrow;
}
function updateViewportMetrics(force = false) {
  const wrapW = Math.max(1, Math.floor(mainCanvasWrapEl?.clientWidth ?? 0));
  const wrapH = Math.max(1, Math.floor(mainCanvasWrapEl?.clientHeight ?? 0));
  const mobile = isMobileViewport();
  const sig = `${wrapW}x${wrapH}|${mobile}`;
  if (!force && sig === viewportSig) return false;
  viewportSig = sig;

  if (mobile || wrapW <= 2 || wrapH <= 2) {
    viewRadiusX = MOBILE_VIEW_RADIUS;
    viewRadiusY = MOBILE_VIEW_RADIUS;
  } else {
    const tilesX = Math.max(BASE_VIEW_RADIUS * 2 + 1, Math.floor(wrapW / DESKTOP_TARGET_TILE_PX));
    const tilesY = Math.max(BASE_VIEW_RADIUS * 2 + 1, Math.floor(wrapH / DESKTOP_TARGET_TILE_PX));
    viewRadiusX = Math.floor((tilesX - 1) / 2);
    viewRadiusY = Math.floor((tilesY - 1) / 2);
  }
  viewTilesX = viewRadiusX * 2 + 1;
  viewTilesY = viewRadiusY * 2 + 1;

  const logicalW = Math.max(1, viewTilesX * TILE);
  const logicalH = Math.max(1, viewTilesY * TILE);
  renderScale = Math.min(1, MAX_RENDER_CANVAS_DIM / Math.max(logicalW, logicalH));
  canvas.width = Math.max(1, Math.floor(logicalW * renderScale));
  canvas.height = Math.max(1, Math.floor(logicalH * renderScale));
  return true;
}
function viewRadiusForChunks() {
  return Math.max(viewRadiusX, viewRadiusY) + 2;
}
updateViewportMetrics(true);

mini.width = (MINI_RADIUS * 2 + 1) * MINI_SCALE;
mini.height = (MINI_RADIUS * 2 + 1) * MINI_SCALE;

let fogEnabled = true;
let minimapEnabled = true;
const shopUi = { open: false, mode: "buy", selectedBuy: 0, selectedSell: 0 };
const overlaySections = { equipmentCollapsed: false, inventoryCollapsed: false };
const mobileUi = { gearOpen: false, logExpanded: false };
let mobileUiSig = "";
let contextAuxSignature = "";
let dpadCenterSignature = "";
let newDungeonConfirmResolver = null;
let newDungeonResetPending = false;
let bootLoadedFromLocalSave = false;
let requiresCharacterCreation = false;
const saveMenuUi = { open: false, mode: "load", saves: [], loading: false };
const characterUi = {
  open: false,
  mode: "select",
  selectionPurpose: "load_run",
  createStep: "welcome",
  loading: false,
  status: "",
  statusError: false,
  slots: [],
  selectedSaveId: "",
  activeSaveId: "",
  selectionProfile: null,
  creation: {
    name: DEFAULT_CHARACTER_NAME,
    speciesId: DEFAULT_CHARACTER_SPECIES_ID,
    classId: DEFAULT_CHARACTER_CLASS_ID,
    stats: { ...DEFAULT_CHARACTER_STATS },
  },
};
const infoUi = { open: false };
const levelUpUi = { open: false, draft: {} };
const spriteEditorUi = {
  open: false,
  loading: false,
  objects: [],
  selectedSpriteIds: new Set(),
  filterCategory: "all",
  filterArmorType: "all",
  filterMetalType: "all",
  filterSource: "all",
  maxUploadBytes: 50_000_000,
};
const monsterEditorUi = {
  open: false,
  loading: false,
  dirty: false,
  selectedId: "",
  previewDepth: 1,
  showAdvanced: false,
  suspendFormEvents: false,
  baselineMonsters: {},
  baselineSpawnRules: [],
  workingMonsters: {},
  workingSpawnRules: [],
};
const CLIENT_SPRITE_UPLOAD_SOFT_TARGET_BYTES = 450 * 1024;
const CLIENT_SPRITE_UPLOAD_RETRY_TARGET_BYTES = 220 * 1024;
let saveNameWasEdited = false;
let lastAutoSaveName = "";
const saveRuntime = {
  dirty: false,
  dirtyReason: "",
  lastDirtyAt: 0,
  lastSaveAt: 0,
  autoTimer: 0,
  saving: false,
  pendingAutosaveReason: "",
  activeRunSaveId: "",
};
const characterSyncRuntime = {
  dirty: false,
  reason: "",
  timer: 0,
  syncing: false,
  lastSyncAt: 0,
};
const spriteOverrideState = { overrides: {}, scales: {}, entries: [] };
const monsterEditorState = { version: 1, monsters: {}, spawnRules: [], updatedAt: "" };
let infoTierSignature = "";
let spriteEditorSignature = "";
let monsterEditorSignature = "";
const MOBILE_VISIBILITY_BOOST =
  (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  (typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));
// Keep visuals conservative by default; this can be raised later once baseline perf is stable.
let visualFxQuality = 0;
let visualFrameMsAvg = MOBILE_VISIBILITY_BOOST ? 20 : 16;
let visualPerfTicker = 0;
let visibilityStateRef = null;
let visibilitySig = "";
let hydrationStateRef = null;
let hydrationSig = "";
let occupancyStateRef = null;
let occupancySig = "";
let occupancyCache = { monsters: new Map(), items: new Map(), traps: new Map() };

function maybeAdjustVisualQuality(frameMs) {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return;
  visualFrameMsAvg = visualFrameMsAvg * 0.92 + frameMs * 0.08;
  visualPerfTicker += 1;
  if (visualPerfTicker < 45) return;
  visualPerfTicker = 0;
  if (visualFrameMsAvg > 28 && visualFxQuality > 0) {
    visualFxQuality -= 1;
  }
}

function readEmbeddedJson(id) {
  const el = document.getElementById(id);
  const raw = el?.textContent?.trim() ?? "";
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function bootstrapSpriteOverrides() {
  const payload = readEmbeddedJson("spriteOverridesData");
  if (!payload || typeof payload !== "object") return;
  if (payload.overrides && typeof payload.overrides === "object") {
    spriteOverrideState.overrides = { ...payload.overrides };
  }
  if (payload.scales && typeof payload.scales === "object") {
    const next = {};
    for (const [spriteId, value] of Object.entries(payload.scales)) {
      if (!/^[a-z0-9_]{1,80}$/.test(spriteId)) continue;
      const scale = Math.max(25, Math.min(300, Math.floor(Number(value) || 100)));
      if (scale === 100) continue;
      next[spriteId] = scale;
    }
    spriteOverrideState.scales = next;
  }
  if (Array.isArray(payload.entries)) {
    spriteOverrideState.entries = payload.entries.slice();
  }
}
bootstrapSpriteOverrides();
const monsterEditorBootstrapPayload = readEmbeddedJson("monsterEditorData");

function normalizeDebugFlags(flags) {
  return {
    godmode: !!flags?.godmode,
    freeShopping: !!flags?.freeShopping,
    ghost: !!flags?.ghost,
    lockpick: !!flags?.lockpick,
  };
}
function stateDebug(state) {
  state.debug = normalizeDebugFlags(state?.debug);
  return state.debug;
}
function canUseAdminControls() {
  return !!canAdminControls;
}
function enforceAdminControlPolicy(state) {
  if (!state || canUseAdminControls()) return false;
  const d = stateDebug(state);
  let changed = false;
  if (d.godmode) {
    d.godmode = false;
    changed = true;
  }
  if (d.freeShopping) {
    d.freeShopping = false;
    changed = true;
  }
  if (d.ghost) {
    d.ghost = false;
    changed = true;
  }
  if (d.lockpick) {
    d.lockpick = false;
    changed = true;
  }
  if (!fogEnabled) {
    fogEnabled = true;
    changed = true;
  }
  if (toggleGodmodeEl) toggleGodmodeEl.checked = false;
  if (toggleFreeShoppingEl) toggleFreeShoppingEl.checked = false;
  if (toggleGhostEl) toggleGhostEl.checked = false;
  if (toggleLockpickEl) toggleLockpickEl.checked = false;
  if (debugMenuEl?.classList.contains("show")) setDebugMenuOpen(false);
  return changed;
}
function setDebugMenuOpen(open) {
  if (!debugMenuEl || !canUseAdminControls()) return;
  debugMenuEl.classList.toggle("show", !!open);
  debugMenuEl.setAttribute("aria-hidden", open ? "false" : "true");
  if (btnDebugMenuEl) btnDebugMenuEl.setAttribute("aria-expanded", open ? "true" : "false");
}
function updateDebugMenuUi(state) {
  const d = normalizeDebugFlags(state?.debug);
  if (toggleGodmodeEl) toggleGodmodeEl.checked = d.godmode;
  if (toggleFreeShoppingEl) toggleFreeShoppingEl.checked = d.freeShopping;
  if (toggleGhostEl) toggleGhostEl.checked = d.ghost;
  if (toggleLockpickEl) toggleLockpickEl.checked = d.lockpick;
  if (debugDepthInputEl) debugDepthInputEl.value = `${state?.player?.z ?? 0}`;
  if (debugLevelInputEl) debugLevelInputEl.value = `${Math.max(1, Math.floor(state?.player?.level ?? 1))}`;
}

function spawnDebugObjectByKey(state, key) {
  if (!canUseAdminControls()) return false;
  if (!state) return false;
  const spawnKey = String(key ?? "").trim();
  if (!spawnKey) return false;
  const p = state.player;
  if (!p || p.dead) return false;
  const targetX = p.x;
  const targetY = p.y - 2;
  const targetZ = p.z;
  const now = Date.now();
  if (spawnKey.startsWith("item:")) {
    const itemType = spawnKey.slice(5);
    if (!ITEM_TYPES[itemType]) {
      pushLog(state, `Unknown item type: ${itemType}.`);
      return false;
    }
    if (itemType === "shopkeeper") {
      const left = targetX - Math.floor(SHOP_FOOTPRINT_W / 2);
      const top = targetY;
      for (let yy = top; yy < top + SHOP_FOOTPRINT_H; yy++) {
        for (let xx = left; xx < left + SHOP_FOOTPRINT_W; xx++) state.world.setTile(xx, yy, targetZ, FLOOR);
      }
    } else if (!state.world.isPassable(targetX, targetY, targetZ)) {
      state.world.setTile(targetX, targetY, targetZ, FLOOR);
    }
    const amount = itemType === "gold" ? 10 : 1;
    spawnDynamicItem(state, itemType, amount, targetX, targetY, targetZ);
    pushLog(state, `Debug: spawned ${ITEM_TYPES[itemType]?.name ?? itemType} at (${targetX}, ${targetY}, ${targetZ}).`);
  } else if (spawnKey.startsWith("monster:")) {
    const monsterType = spawnKey.slice(8);
    if (!MONSTER_TYPES[monsterType]) {
      pushLog(state, `Unknown monster type: ${monsterType}.`);
      return false;
    }
    if (!state.world.isPassable(targetX, targetY, targetZ)) state.world.setTile(targetX, targetY, targetZ, FLOOR);
    const spec = monsterStatsForDepth(monsterType, targetZ);
    const id = `dbg_m|${monsterType}|${targetZ}|${targetX},${targetY}|${now}|${Math.floor(Math.random() * 1e9)}`;
    const ent = {
      id,
      origin: "dynamic",
      kind: "monster",
      type: monsterType,
      x: targetX,
      y: targetY,
      z: targetZ,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      awake: false,
      cd: 0,
    };
    state.dynamic.set(id, ent);
    state.entities.set(id, ent);
    pushLog(state, `Debug: spawned ${monsterDisplayName(monsterType, targetZ)} at (${targetX}, ${targetY}, ${targetZ}).`);
  } else {
    pushLog(state, "Unknown spawn object selection.");
    return false;
  }
  hydrateNearby(state);
  updateContextActionButton(state);
  updateDebugMenuUi(state);
  saveNow(state);
  return true;
}
function setDebugFlag(state, key, enabled) {
  if (!canUseAdminControls()) return;
  const d = stateDebug(state);
  const next = !!enabled;
  if (d[key] === next) return;
  d[key] = next;
  if (key === "godmode") pushLog(state, `Godmode ${next ? "enabled" : "disabled"}.`);
  if (key === "freeShopping") pushLog(state, `Free shopping ${next ? "enabled" : "disabled"}.`);
  if (key === "ghost") pushLog(state, `Ghost ${next ? "enabled" : "disabled"}.`);
  if (key === "lockpick") pushLog(state, `Lockpick ${next ? "enabled" : "disabled"}.`);
  saveNow(state);
}

function setPlayerLevelDebug(state, targetLevel) {
  if (!canUseAdminControls()) return false;
  const p = state.player;
  if (!p || !Number.isFinite(targetLevel)) return false;
  const profile = ensureCharacterState(state);
  const prevLevel = Math.max(1, Math.floor(p.level ?? 1));
  const prevMaxHp = Math.max(1, Math.floor(p.maxHp ?? maxHpForLevel(prevLevel, state.character)));
  const newLevel = clamp(Math.trunc(targetLevel), 1, 9999);
  p.level = newLevel;
  if (profile) {
    const deltaPoints = (newLevel - prevLevel) * LEVEL_UP_ATTRIBUTE_POINTS;
    profile.unspentStatPoints = Math.max(0, Math.floor(profile.unspentStatPoints ?? 0) + deltaPoints);
  }
  // Reset progress within the level so XP/UI always matches the chosen level.
  p.xp = 0;
  const newMaxHp = maxHpForLevel(newLevel, state.character);
  p.maxHp = newMaxHp;
  if (newMaxHp >= prevMaxHp) {
    const hpGain = newMaxHp - prevMaxHp;
    p.hp = clamp(Math.floor((p.hp ?? newMaxHp) + hpGain), 0, newMaxHp);
  } else {
    const ratio = clamp((p.hp ?? newMaxHp) / prevMaxHp, 0, 1);
    p.hp = clamp(Math.round(newMaxHp * ratio), 0, newMaxHp);
  }
  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDebugMenuUi(state);
  pushLog(
    state,
    `Debug: level set ${prevLevel} -> ${newLevel} (XP ${p.xp}/${xpToNext(newLevel)}, HP ${p.hp}/${p.maxHp}).`
  );
  saveNow(state);
  return true;
}

function cellHasPassableNeighbor(world, x, y, z) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) {
    if (world.isPassable(x + dx, y + dy, z)) return true;
  }
  return false;
}

function findNearestSafeTeleportCell(state, x, y, z, maxRadius = 24) {
  let best = null;
  let bestDist = Infinity;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > maxRadius || d >= bestDist) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!state.world.isPassable(nx, ny, z)) continue;
      if (!cellHasPassableNeighbor(state.world, nx, ny, z)) continue;
      best = { x: nx, y: ny };
      bestDist = d;
    }
  }
  return best;
}

function ensureTeleportLanding(state) {
  const p = state.player;
  const safe = findNearestSafeTeleportCell(state, p.x, p.y, p.z, 24);
  if (safe) {
    p.x = safe.x;
    p.y = safe.y;
    return;
  }

  if (p.z === SURFACE_LEVEL) {
    p.x = 0;
    p.y = 0;
    state.world.setTile(0, 0, p.z, STAIRS_DOWN);
    return;
  }

  carveLandingAndConnect(state, p.x, p.y, p.z, FLOOR);
  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);

  if (!cellHasPassableNeighbor(state.world, p.x, p.y, p.z)) {
    state.world.setTile(p.x + 1, p.y, p.z, FLOOR);
  }
}

function teleportPlayerToDepth(state, targetDepth) {
  if (!canUseAdminControls()) return false;
  const p = state.player;
  if (!p || p.dead) return false;
  if (!Number.isFinite(targetDepth)) return false;

  const newZ = Math.max(SURFACE_LEVEL, Math.trunc(targetDepth));
  if (newZ === p.z) {
    pushLog(state, `Already at depth ${newZ}.`);
    return false;
  }

  state.world.ensureChunksAround(p.x, p.y, newZ, viewRadiusForChunks());
  if (newZ === SURFACE_LEVEL) state.world.ensureChunksAround(0, 0, newZ, 1);

  p.z = newZ;
  p.attackAfterMove = false;
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;
  ensureTeleportLanding(state);
  if (newZ === 0) ensureSurfaceLinkTile(state);

  hydrateNearby(state);
  updateAreaRespawnTracking(state, Date.now());
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  updateDebugMenuUi(state);
  pushLog(state, `Debug: teleported to depth ${newZ}.`);
  saveNow(state);
  return true;
}

function updateOverlaySectionUi() {
  const equipCollapsed = !!overlaySections.equipmentCollapsed;
  const invCollapsed = !!overlaySections.inventoryCollapsed;
  equipSectionBodyEl?.classList.toggle("hidden", equipCollapsed);
  inventorySectionBodyEl?.classList.toggle("hidden", invCollapsed);
  if (equipSectionToggleEl) {
    equipSectionToggleEl.textContent = `Equipment ${equipCollapsed ? "+" : "-"}`;
    equipSectionToggleEl.setAttribute("aria-expanded", equipCollapsed ? "false" : "true");
  }
  if (inventorySectionToggleEl) {
    inventorySectionToggleEl.textContent = `Inventory ${invCollapsed ? "+" : "-"}`;
    inventorySectionToggleEl.setAttribute("aria-expanded", invCollapsed ? "false" : "true");
  }
}

function removeLegacyAttributePanel() {
  if (characterStatsPanelEl && characterStatsPanelEl.parentElement) {
    characterStatsPanelEl.remove();
  }
  if (characterStatsToggleEl && characterStatsToggleEl.parentElement) {
    characterStatsToggleEl.remove();
  }
}

function isCompactMobileUi() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 760px)").matches;
}

function syncMobileUi(force = false) {
  const mobile = isCompactMobileUi();
  const sig = `${mobile}|${mobileUi.gearOpen}|${mobileUi.logExpanded}`;
  if (!force && sig === mobileUiSig) return;
  mobileUiSig = sig;

  if (!mobile) {
    invOverlayEl?.classList.remove("show");
    mobileOverlayBackdropEl?.classList.remove("show");
    mobileOverlayBackdropEl?.setAttribute("aria-hidden", "true");
    logPanelEl?.classList.remove("log-expanded");
    mobileQuickBarEl?.setAttribute("aria-hidden", "true");
    if (btnMobileGearEl) {
      btnMobileGearEl.textContent = "Gear +";
      btnMobileGearEl.setAttribute("aria-expanded", "false");
    }
    if (btnMobileLogEl) {
      btnMobileLogEl.textContent = "Log +";
      btnMobileLogEl.setAttribute("aria-expanded", "false");
    }
    return;
  }

  invOverlayEl?.classList.toggle("show", !!mobileUi.gearOpen);
  mobileOverlayBackdropEl?.classList.toggle("show", !!mobileUi.gearOpen);
  mobileOverlayBackdropEl?.setAttribute("aria-hidden", mobileUi.gearOpen ? "false" : "true");
  logPanelEl?.classList.toggle("log-expanded", !!mobileUi.logExpanded);
  mobileQuickBarEl?.setAttribute("aria-hidden", "false");
  if (btnMobileGearEl) {
    btnMobileGearEl.textContent = mobileUi.gearOpen ? "Gear -" : "Gear +";
    btnMobileGearEl.setAttribute("aria-expanded", mobileUi.gearOpen ? "true" : "false");
  }
  if (btnMobileLogEl) {
    btnMobileLogEl.textContent = mobileUi.logExpanded ? "Log -" : "Log +";
    btnMobileLogEl.setAttribute("aria-expanded", mobileUi.logExpanded ? "true" : "false");
  }
}

function setMobileGearOpen(open) {
  mobileUi.gearOpen = !!open;
  syncMobileUi();
}

function setMobileLogExpanded(open) {
  mobileUi.logExpanded = !!open;
  syncMobileUi();
}

function closeMobilePanels() {
  const hadOpen = !!mobileUi.gearOpen || !!mobileUi.logExpanded;
  if (!hadOpen) return false;
  mobileUi.gearOpen = false;
  mobileUi.logExpanded = false;
  syncMobileUi();
  return true;
}

// ---------- RNG (deterministic base gen) ----------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const seed = xmur3(seedStr);
  return sfc32(seed(), seed(), seed(), seed());
}
function randInt(rng, lo, hiInclusive) {
  const span = hiInclusive - lo + 1;
  return lo + Math.floor(rng() * span);
}

function brightenHexColor(hex, amount = 0.2) {
  if (typeof hex !== "string" || hex.charAt(0) !== "#") return hex;
  let s = hex.slice(1);
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6) return hex;
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lift = (v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amount)));
  const rr = lift(r).toString(16).padStart(2, "0");
  const gg = lift(g).toString(16).padStart(2, "0");
  const bb = lift(b).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}
function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== "string" || hex.charAt(0) !== "#") return `rgba(255,255,255,${clamp(alpha, 0, 1)})`;
  let s = hex.slice(1);
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6) return `rgba(255,255,255,${clamp(alpha, 0, 1)})`;
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${clamp(alpha, 0, 1)})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

function applyVisibilityBoostToTheme(theme) {
  if (!MOBILE_VISIBILITY_BOOST || !theme) return theme;
  const boosted = { ...theme };
  for (const [k, v] of Object.entries(theme)) {
    if (typeof v !== "string" || v.charAt(0) !== "#") continue;
    const amt = k.endsWith("NV") ? 0.26 : 0.2;
    boosted[k] = brightenHexColor(v, amt);
  }
  return boosted;
}
function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function lerp(a, b, t) { return a + (b - a) * t; }
const SPECIES_ID_ALIASES = {
  dwarf: "automaton",
  elf: "grey",
  orc: "insectoid",
  ratkin: "skulker",
  skulkers: "skulker",
};
const CLASS_ID_ALIASES = {
  adventurer: "vanguard",
  fighter: "vanguard",
  guardian: "bulwark",
  skirmisher: "operative",
};
function normalizeCharacterSpeciesId(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const mapped = SPECIES_ID_ALIASES[raw] ?? raw;
  if (!mapped || !SPECIES_DEFS[mapped]) return DEFAULT_CHARACTER_SPECIES_ID;
  return mapped;
}
function normalizeCharacterClassId(value, speciesId = null) {
  const raw = String(value ?? "").trim().toLowerCase();
  const mappedRaw = CLASS_ID_ALIASES[raw] ?? raw;
  let mapped = mappedRaw;
  if (!mapped || !CLASS_DEFS[mapped]) mapped = DEFAULT_CHARACTER_CLASS_ID;
  if (speciesId !== null && speciesId !== undefined) {
    const sid = normalizeCharacterSpeciesId(speciesId);
    if (CLASS_DEFS[mapped]?.speciesId !== sid) {
      return defaultClassIdForSpecies(sid);
    }
  }
  return mapped;
}
function characterSpeciesDef(speciesId) {
  return SPECIES_DEFS[normalizeCharacterSpeciesId(speciesId)] ?? SPECIES_DEFS[DEFAULT_CHARACTER_SPECIES_ID];
}
function characterClassDef(classId) {
  return CLASS_DEFS[normalizeCharacterClassId(classId)] ?? CLASS_DEFS[DEFAULT_CHARACTER_CLASS_ID];
}
function characterCreationPointBudget(speciesId) {
  const species = characterSpeciesDef(speciesId);
  return CHARACTER_CREATION_BASE_POINTS + Math.max(0, Math.floor(species.extraCreationPoints ?? 0));
}
function countCharacterStatsPoints(stats) {
  let total = 0;
  for (const key of CHARACTER_STAT_KEYS) total += Math.max(0, Math.floor(stats?.[key] ?? 0));
  return total;
}
function normalizeCharacterStats(rawStats, speciesId = DEFAULT_CHARACTER_SPECIES_ID, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const maxPerStat = clamp(Math.floor(Number(opts.maxPerStat) || CHARACTER_STAT_MAX), 1, CHARACTER_STAT_MAX);
  const enforceBudget = !!opts.enforceBudget;
  const out = {};
  for (const key of CHARACTER_STAT_KEYS) {
    const fallback = Math.max(0, Math.floor(DEFAULT_CHARACTER_STATS[key] ?? 0));
    out[key] = clamp(Math.floor(Number(rawStats?.[key] ?? fallback) || 0), 0, maxPerStat);
  }
  if (!enforceBudget) return out;
  const budget = characterCreationPointBudget(speciesId);
  let total = countCharacterStatsPoints(out);
  if (total <= budget) return out;

  const order = [...CHARACTER_STAT_KEYS].sort((a, b) => (out[b] - out[a]) || a.localeCompare(b));
  while (total > budget) {
    let changed = false;
    for (const key of order) {
      if (out[key] <= 0 || total <= budget) continue;
      out[key] -= 1;
      total -= 1;
      changed = true;
      if (total <= budget) break;
    }
    if (!changed) break;
  }
  return out;
}
function normalizeCreationCharacterStats(rawStats, speciesId = DEFAULT_CHARACTER_SPECIES_ID) {
  return normalizeCharacterStats(rawStats, speciesId, {
    enforceBudget: true,
    maxPerStat: CHARACTER_CREATION_MAX_STAT,
  });
}
function emptyCharacterStats() {
  const out = {};
  for (const key of CHARACTER_STAT_KEYS) out[key] = 0;
  return out;
}

// ---------- Helpers ----------
function floorDiv(a, b) { return Math.floor(a / b); }
function splitWorldToChunk(wx, wy) {
  const cx = floorDiv(wx, CHUNK);
  const cy = floorDiv(wy, CHUNK);
  const lx = wx - cx * CHUNK;
  const ly = wy - cy * CHUNK;
  return { cx, cy, lx, ly };
}
function keyXYZ(x, y, z) { return `${z}|${x},${y}`; }
function keyZCXCY(z, cx, cy) { return `${z}|${cx},${cy}`; }
function keyXY(x, y) { return `${x},${y}`; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < CHUNK && y < CHUNK; }
function hashInt32(a, b, c = 0, d = 0) {
  let h = Math.imul((a | 0) ^ 0x27d4eb2d, 0x85ebca6b);
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35);
  h ^= Math.imul((c | 0) ^ 0x165667b1, 0x27d4eb2d);
  h ^= Math.imul((d | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}
function tileNoise01(x, y, z, salt = 0) {
  return hashInt32(x, y, z, salt) / 4294967295;
}
function pulse01(timeSec, speed = 1, phase = 0) {
  return 0.5 + 0.5 * Math.sin(timeSec * speed + phase);
}

function isOpenDoorTile(t) {
  return t === DOOR_OPEN ||
    t === DOOR_OPEN_YELLOW ||
    t === DOOR_OPEN_ORANGE ||
    t === DOOR_OPEN_RED ||
    t === DOOR_OPEN_GREEN ||
    t === DOOR_OPEN_VIOLET ||
    t === DOOR_OPEN_INDIGO ||
    t === DOOR_OPEN_BLUE ||
    t === DOOR_OPEN_PURPLE ||
    t === DOOR_OPEN_MAGENTA;
}

// ---------- Themes ----------
function hueWrap(h) {
  let out = h % 360;
  if (out < 0) out += 360;
  return out;
}
function hslColor(h, s, l) {
  return `hsl(${Math.round(hueWrap(h))} ${Math.round(s)}% ${Math.round(l)}%)`;
}
function hslaColor(h, s, l, a = 1) {
  return `hsla(${Math.round(hueWrap(h))} ${Math.round(s)}% ${Math.round(l)}% / ${clamp(a, 0, 1)})`;
}
function depthHueName(h) {
  const names = ["Red", "Orange", "Yellow", "Lime", "Green", "Teal", "Cyan", "Azure", "Blue", "Violet", "Magenta", "Rose"];
  const idx = Math.floor(hueWrap(h) / 30) % names.length;
  return names[idx];
}
function styleVariantForDepth(depth) {
  const d = Math.max(0, Math.floor(depth ?? 0));
  const len = ENV_STYLE_VARIANTS.length;
  const idx = len > 0 ? ((d % len) + len) % len : 0;
  const style = ENV_STYLE_VARIANTS[idx] ?? ENV_STYLE_VARIANTS[0];
  return { index: idx, ...style };
}
function generateDepthTheme(z, seedStr = "") {
  const depth = Math.max(0, Math.floor(z ?? 0));
  const style = styleVariantForDepth(depth);

  if (z <= SURFACE_LEVEL) {
    const floorBaseH = 94;
    const floorBaseS = 23;
    const floorBaseL = 52;
    const floorAccentH = 92;
    const floorAccentS = 25;
    const floorAccentL = 58;
    const wallBaseH = 157;
    const wallBaseS = 16;
    const wallBaseL = 32;
    const wallShadeH = 156;
    const wallShadeS = 18;
    const wallShadeL = 20;
    const borderThickness = Math.max(2, Math.round(TILE * 0.02));
    const noiseIntensity = 0.028;
    return {
      name: "Surface",
      styleVariant: "surface",
      styleLabel: "Surface",
      styleVariantIndex: -1,
      floorBaseH, floorBaseS, floorBaseL,
      floorAccentH, floorAccentS, floorAccentL,
      wallBaseH, wallBaseS, wallBaseL,
      wallShadeH, wallShadeS, wallShadeL,
      floorBase: hslColor(floorBaseH, floorBaseS, floorBaseL),
      floorAccent: hslColor(floorAccentH, floorAccentS, floorAccentL),
      wallBase: hslColor(wallBaseH, wallBaseS, wallBaseL),
      wallShade: hslColor(wallShadeH, wallShadeS, wallShadeL),
      trimColor: hslColor(wallShadeH, wallShadeS, wallShadeL),
      shadowColor: hslColor(wallShadeH, wallShadeS, Math.max(6, wallShadeL - 8)),
      highlightColor: hslColor(wallBaseH, Math.max(10, wallBaseS - 4), Math.min(82, wallBaseL + 20)),
      borderThickness,
      noiseIntensity,
      trimAlpha: 0.24,
      cornerAoAlpha: 0.24,
      cornerAoSizePx: Math.max(borderThickness + 2, Math.round(TILE * 0.035)),
      wallInsetPx: Math.max(2, Math.round(TILE * 0.014)),
      wallHighlightAlpha: 0.12,
      wallBottomShadowAlpha: 0.12,
      edgeRoundPx: Math.max(4, Math.round(TILE * 0.032)),
      decalDensity: 0.052,
      decalAlpha: 0.12,
      wallV: hslColor(wallBaseH, wallBaseS, wallBaseL),
      wallNV: hslColor(wallBaseH, wallBaseS, Math.max(5, Math.round(wallBaseL * 0.56))),
      floorV: hslColor(floorAccentH, floorAccentS, floorAccentL),
      floorNV: hslColor(floorBaseH, Math.max(8, floorBaseS - 8), Math.max(5, Math.round(floorBaseL * 0.64))),
      doorC_V: "#6e5a3e",
      doorC_NV: "#4a3b29",
      doorO_V: "#4f7b63",
      doorO_NV: "#375241",
      lockR_V: "#8e4040",
      lockR_NV: "#5a2626",
      lockG_V: "#3f8e55",
      lockG_NV: "#275a37",
      lockY_V: "#b8a942",
      lockY_NV: "#70652a",
      lockO_V: "#b96a38",
      lockO_NV: "#6e3f22",
      lockV_V: "#7d4aa8",
      lockV_NV: "#4b2c64",
      lockI_V: "#3e4f93",
      lockI_NV: "#27305a",
      lockB_V: "#40688e",
      lockB_NV: "#26415a",
      lockP_V: "#7d4aa8",
      lockP_NV: "#4b2c64",
      lockM_V: "#a83f8c",
      lockM_NV: "#632553",
      downV: "#7b6a3d",
      downNV: "#514528",
      upV: "#6c5a80",
      upNV: "#453a52",
      overlay: "rgba(0,0,0,0.35)",
    };
  }

  const rng = makeRng(`${seedStr}|depth-theme|${depth}|${style.id}`);
  const hue = hueWrap(depth * 28 + style.hueShift + randInt(rng, -8, 8));
  const wallHue = hue + 18 + randInt(rng, -3, 3);
  const floorHue = hue + randInt(rng, -2, 2);
  const doorHue = hue + 34 + randInt(rng, -3, 3);
  const downHue = hue + 58;
  const upHue = hue - 52;

  const floorBaseH = floorHue;
  const floorBaseS = clamp(40 + style.floorSat + randInt(rng, -3, 3), 18, 64);
  const floorBaseL = clamp(17 + style.floorLight + randInt(rng, -2, 2), 8, 42);
  const floorAccentH = floorHue + randInt(rng, -2, 2);
  const floorAccentS = clamp(floorBaseS + 3 + randInt(rng, -2, 2), 18, 68);
  const floorAccentL = clamp(floorBaseL + 6 + randInt(rng, -1, 2), floorBaseL + 2, 56);

  const wallBaseH = wallHue;
  const wallBaseS = clamp(24 + style.wallSat + randInt(rng, -3, 3), 10, 48);
  const wallBaseL = clamp(27 + style.wallLight + randInt(rng, -2, 2), 12, 48);
  const wallShadeH = wallHue + randInt(rng, -2, 2);
  const wallShadeS = clamp(wallBaseS - 2 + randInt(rng, -2, 2), 8, 52);
  const wallShadeL = clamp(wallBaseL - 9 - Math.max(0, Math.floor(style.insetScale * 1.5)) + randInt(rng, -1, 1), 6, 42);

  const borderThickness = clamp(Math.round(TILE * (0.015 + style.borderScale * 0.006)), 2, Math.max(3, Math.round(TILE * 0.06)));
  const wallInsetPx = clamp(Math.round(TILE * (0.012 + style.insetScale * 0.007)), 2, Math.max(4, Math.round(TILE * 0.05)));
  const noiseIntensity = clamp(0.026 * style.noiseScale, 0.012, 0.09);

  return {
    name: `${depthHueName(hue)} Depth · ${style.label}`,
    styleVariant: style.id,
    styleLabel: style.label,
    styleVariantIndex: style.index,
    floorBaseH, floorBaseS, floorBaseL,
    floorAccentH, floorAccentS, floorAccentL,
    wallBaseH, wallBaseS, wallBaseL,
    wallShadeH, wallShadeS, wallShadeL,
    floorBase: hslColor(floorBaseH, floorBaseS, floorBaseL),
    floorAccent: hslColor(floorAccentH, floorAccentS, floorAccentL),
    wallBase: hslColor(wallBaseH, wallBaseS, wallBaseL),
    wallShade: hslColor(wallShadeH, wallShadeS, wallShadeL),
    trimColor: hslColor(wallShadeH, wallShadeS, Math.max(5, wallShadeL - 2)),
    shadowColor: hslColor(wallShadeH, wallShadeS, Math.max(4, wallShadeL - 8)),
    highlightColor: hslColor(wallBaseH - 5, Math.max(8, wallBaseS - 10), Math.min(84, wallBaseL + 18)),
    borderThickness,
    noiseIntensity,
    trimAlpha: clamp(0.23 * style.borderScale, 0.14, 0.36),
    cornerAoAlpha: clamp(0.25 * style.aoScale, 0.16, 0.42),
    cornerAoSizePx: clamp(Math.round(TILE * (0.03 + style.aoScale * 0.015)), borderThickness + 2, Math.round(TILE * 0.12)),
    wallInsetPx,
    wallHighlightAlpha: clamp(0.12 * style.highlightScale, 0.06, 0.2),
    wallBottomShadowAlpha: clamp(0.12 * style.bottomShadowScale, 0.06, 0.24),
    edgeRoundPx: clamp(Math.round(TILE * (0.03 + (1.2 - style.borderScale) * 0.01)), 4, Math.round(TILE * 0.12)),
    decalDensity: clamp(0.048 * style.decalScale, 0.03, 0.14),
    decalAlpha: clamp(0.12 + style.decalScale * 0.03, 0.09, 0.2),
    wallV: hslColor(wallBaseH, wallBaseS, wallBaseL),
    wallNV: hslColor(wallBaseH, Math.max(8, wallBaseS - 8), Math.max(4, Math.round(wallBaseL * 0.56))),
    floorV: hslColor(floorAccentH, floorAccentS, floorAccentL),
    floorNV: hslColor(floorBaseH, Math.max(8, floorBaseS - 10), Math.max(4, Math.round(floorBaseL * 0.60))),
    doorC_V: hslColor(doorHue, 40, 24),
    doorC_NV: hslColor(doorHue, 32, 14),
    doorO_V: hslColor(doorHue + 18, 36, 27),
    doorO_NV: hslColor(doorHue + 18, 30, 16),
    lockR_V: hslColor(0, 58, 26),
    lockR_NV: hslColor(0, 45, 15),
    lockG_V: hslColor(132, 52, 28),
    lockG_NV: hslColor(132, 40, 16),
    lockY_V: hslColor(53, 66, 34),
    lockY_NV: hslColor(53, 48, 20),
    lockO_V: hslColor(28, 70, 33),
    lockO_NV: hslColor(28, 52, 19),
    lockV_V: hslColor(278, 58, 32),
    lockV_NV: hslColor(278, 46, 19),
    lockI_V: hslColor(235, 58, 31),
    lockI_NV: hslColor(235, 44, 18),
    lockB_V: hslColor(214, 56, 30),
    lockB_NV: hslColor(214, 42, 17),
    lockP_V: hslColor(276, 58, 32),
    lockP_NV: hslColor(276, 46, 19),
    lockM_V: hslColor(320, 62, 33),
    lockM_NV: hslColor(320, 48, 20),
    downV: hslColor(downHue, 42, 25),
    downNV: hslColor(downHue, 34, 15),
    upV: hslColor(upHue, 38, 27),
    upNV: hslColor(upHue, 30, 16),
    overlay: hslaColor(hue + 8, 18, 6, clamp(0.46 + depth * 0.001, 0.46, 0.6)),
  };
}
function themeForDepth(z, seedStr = "") {
  return generateDepthTheme(z, seedStr);
}

// ---------- Edge hashing (deterministic border openings) ----------
function edgeCanonical(z, cx, cy, dir) {
  let ax = cx, ay = cy, bx = cx, by = cy;
  if (dir === "E") bx = cx + 1;
  else if (dir === "W") bx = cx - 1;
  else if (dir === "S") by = cy + 1;
  else if (dir === "N") by = cy - 1;
  else throw new Error("bad dir");
  if (ax > bx || (ax === bx && ay > by)) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; }
  return { z, ax, ay, bx, by };
}
function edgeInfo(seedStr, z, cx, cy, dir) {
  const { ax, ay, bx, by } = edgeCanonical(z, cx, cy, dir);
  const rng = makeRng(`${seedStr}|edge|z${z}|${ax},${ay}|${bx},${by}`);
  const open = rng() < 0.78;
  const pos = 2 + Math.floor(rng() * (CHUNK - 4));
  return { open, pos };
}

// ---------- Grid carving ----------
function newGrid(fill = WALL) {
  const g = new Array(CHUNK);
  for (let y = 0; y < CHUNK; y++) g[y] = new Array(CHUNK).fill(fill);
  return g;
}
function carveRect(grid, x, y, w, h, tile = FLOOR) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++)
      if (inBounds(xx, yy)) grid[yy][xx] = tile;
}
function carveOval(grid, cx, cy, rx, ry, tile = FLOOR) {
  const rx2 = rx * rx, ry2 = ry * ry;
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (!inBounds(x, y)) continue;
      const dx = x - cx, dy = y - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) grid[y][x] = tile;
    }
  }
}
function carveLine(grid, x1, y1, x2, y2, width, tile = FLOOR) {
  if (x1 === x2) {
    const [ya, yb] = y1 < y2 ? [y1, y2] : [y2, y1];
    for (let y = ya; y <= yb; y++)
      for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++)
        if (inBounds(x1 + dx, y)) grid[y][x1 + dx] = tile;
  } else if (y1 === y2) {
    const [xa, xb] = x1 < x2 ? [x1, x2] : [x2, x1];
    for (let x = xa; x <= xb; x++)
      for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++)
        if (inBounds(x, y1 + dy)) grid[y1 + dy][x] = tile;
  }
}
function carveCorridor(grid, rng, x1, y1, x2, y2) {
  const width = rng() < 0.25 ? 2 : 1;

  if (rng() < 0.28) {
    let x = x1, y = y1, safety = 800;
    while ((x !== x2 || y !== y2) && safety-- > 0) {
      for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++)
        for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++)
          if (inBounds(x + dx, y + dy)) grid[y + dy][x + dx] = FLOOR;

      const dxTo = x2 - x, dyTo = y2 - y;
      const opts = [];
      if (dxTo !== 0) opts.push({ x: x + Math.sign(dxTo), y, w: 3 });
      if (dyTo !== 0) opts.push({ x, y: y + Math.sign(dyTo), w: 3 });
      if (rng() < 0.35) {
        opts.push({ x: x + (rng() < 0.5 ? -1 : 1), y, w: 1 });
        opts.push({ x, y: y + (rng() < 0.5 ? -1 : 1), w: 1 });
      }
      const total = opts.reduce((s, o) => s + o.w, 0);
      let r = rng() * total;
      let pick = opts[0];
      for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
      x = clamp(pick.x, 1, CHUNK - 2);
      y = clamp(pick.y, 1, CHUNK - 2);
    }
    return;
  }

  if (rng() < 0.5) {
    const midX = clamp(x2 + (rng() < 0.35 ? randInt(rng, -3, 3) : 0), 1, CHUNK - 2);
    carveLine(grid, x1, y1, midX, y1, width);
    carveLine(grid, midX, y1, midX, y2, width);
    carveLine(grid, midX, y2, x2, y2, width);
  } else {
    const midY = clamp(y2 + (rng() < 0.35 ? randInt(rng, -3, 3) : 0), 1, CHUNK - 2);
    carveLine(grid, x1, y1, x1, midY, width);
    carveLine(grid, x1, midY, x2, midY, width);
    carveLine(grid, x2, midY, x2, y2, width);
  }
}

function tileBlocksLOS(t) {
  if (t === WALL) return true;
  if (t === DOOR_CLOSED) return true;
  if (tileIsLocked(t)) return true;
  return false;
}

function floodConnected(grid, sx, sy) {
  const passable = (t) => t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
  const q = [{ x: sx, y: sy }];
  const seen = new Set([keyXY(sx, sy)]);
  while (q.length) {
    const { x, y } = q.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (!passable(grid[ny][nx])) continue;
      const k = keyXY(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}
function ensureChunkConnectivity(grid, rng) {
  const passable = (t) => t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
  let carved = 0;
  let start = null;
  for (let y = 1; y < CHUNK - 1 && !start; y++)
    for (let x = 1; x < CHUNK - 1; x++)
      if (passable(grid[y][x])) { start = { x, y }; break; }
  if (!start) return;

  while (true) {
    const connected = floodConnected(grid, start.x, start.y);
    let island = null;
    for (let y = 1; y < CHUNK - 1 && !island; y++)
      for (let x = 1; x < CHUNK - 1; x++)
        if (passable(grid[y][x]) && !connected.has(keyXY(x, y))) { island = { x, y }; break; }
    if (!island) break;

    let best = null, bestD = Infinity;
    for (const k of connected) {
      const [cx, cy] = k.split(",").map(Number);
      const dx = cx - island.x, dy = cy - island.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
    }
    if (!best) break;
    carveCorridor(grid, rng, island.x, island.y, best.x, best.y);
    carved += 1;
  }
  return carved;
}

function placeInternalDoors(grid, rng, z) {
  const floorish = (t) => t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (grid[y][x] !== WALL) continue;
      const n = grid[y - 1][x], s = grid[y + 1][x], w = grid[y][x - 1], e = grid[y][x + 1];
      const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
      const we = floorish(w) && floorish(e) && n === WALL && s === WALL;
      if ((ns || we) && rng() < 0.62) {
        // Keep base generation as regular connector doors; locks are applied via proximity conversion.
        grid[y][x] = DOOR_CLOSED;
      }
    }
  }
}

function chunkDoorAxis(grid, x, y) {
  const n = grid[y - 1]?.[x];
  const s = grid[y + 1]?.[x];
  const w = grid[y]?.[x - 1];
  const e = grid[y]?.[x + 1];
  const ns = chunkFloorishTile(n) && chunkFloorishTile(s) && w === WALL && e === WALL;
  if (ns) return { a: { x, y: y - 1, dx: 0, dy: -1 }, b: { x, y: y + 1, dx: 0, dy: 1 } };
  const we = chunkFloorishTile(w) && chunkFloorishTile(e) && n === WALL && s === WALL;
  if (we) return { a: { x: x - 1, y, dx: -1, dy: 0 }, b: { x: x + 1, y, dx: 1, dy: 0 } };
  return null;
}

function chunkFloorishTile(t) {
  return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
}

function chunkTopologyWalkableTile(t) {
  // Treat closed doors as blocked so chokepoint detection favors hard corridor bottlenecks.
  return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
}

function chunkAreaWalkableTile(t) {
  return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
}

function buildChunkAreaMap(grid) {
  const areaMap = Array.from({ length: CHUNK }, () => Array(CHUNK).fill(-1));
  let nextAreaId = 0;

  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      if (areaMap[y][x] >= 0) continue;
      if (!chunkAreaWalkableTile(grid[y][x])) continue;

      const q = [{ x, y }];
      areaMap[y][x] = nextAreaId;
      while (q.length) {
        const cur = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (!inBounds(nx, ny)) continue;
          if (areaMap[ny][nx] >= 0) continue;
          if (!chunkAreaWalkableTile(grid[ny][nx])) continue;
          areaMap[ny][nx] = nextAreaId;
          q.push({ x: nx, y: ny });
        }
      }
      nextAreaId += 1;
    }
  }

  return { areaMap, areaCount: nextAreaId };
}

function chunkDoorwayCandidate(grid, x, y) {
  if (x <= 0 || y <= 0 || x >= CHUNK - 1 || y >= CHUNK - 1) return false;
  if (grid[y][x] !== DOOR_CLOSED) return false;
  return !!chunkDoorAxis(grid, x, y);
}

function chunkCellIsChokepoint(grid, x, y, maxRadius = 18, maxNodes = 1500) {
  const axis = chunkDoorAxis(grid, x, y);
  if (!axis) return false;
  const centerTile = grid[y]?.[x];
  const validCenter =
    centerTile === FLOOR ||
    centerTile === DOOR_CLOSED ||
    isOpenDoorTile(centerTile) ||
    tileIsLocked(centerTile);
  if (!validCenter) return false;
  const start = { x: axis.a.x, y: axis.a.y };
  const goal = { x: axis.b.x, y: axis.b.y };

  const q = [start];
  const seen = new Set([keyXY(start.x, start.y)]);
  let nodes = 0;

  while (q.length && nodes++ < maxNodes) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) return false;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (nx === x && ny === y) continue;
      if (Math.abs(nx - x) + Math.abs(ny - y) > maxRadius) continue;
      if (!chunkTopologyWalkableTile(grid[ny][nx])) continue;
      const k = keyXY(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return true;
}

function chunkDoorIsChokepoint(grid, x, y, maxRadius = 18, maxNodes = 1500) {
  if (!chunkDoorwayCandidate(grid, x, y)) return false;
  return chunkCellIsChokepoint(grid, x, y, maxRadius, maxNodes);
}

function chunkAreaSizes(areaMap, areaCount) {
  const sizes = Array.from({ length: Math.max(0, areaCount) }, () => 0);
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      const areaId = areaMap?.[y]?.[x];
      if (!Number.isFinite(areaId) || areaId < 0 || areaId >= sizes.length) continue;
      sizes[areaId] += 1;
    }
  }
  return sizes;
}

function chunkDoorAreaProfile(grid, areaMap, sizes, x, y) {
  const axis = chunkDoorAxis(grid, x, y);
  if (!axis) return null;
  const aId = Number(areaMap?.[axis.a.y]?.[axis.a.x] ?? -1);
  const bId = Number(areaMap?.[axis.b.y]?.[axis.b.x] ?? -1);
  if (!Number.isFinite(aId) || !Number.isFinite(bId) || aId < 0 || bId < 0) return null;
  if (aId === bId) return null;
  const aSize = Math.max(0, Math.floor(sizes?.[aId] ?? 0));
  const bSize = Math.max(0, Math.floor(sizes?.[bId] ?? 0));
  const maxSize = Math.max(aSize, bSize);
  const minSize = Math.min(aSize, bSize);
  const ratio = maxSize / Math.max(1, minSize);
  const roomCorridorLike = maxSize >= 18 && minSize <= 9;
  return { aId, bId, aSize, bSize, maxSize, minSize, ratio, roomCorridorLike };
}

function findRewardChestCellForDoor(grid, door, usedCells) {
  const axis = chunkDoorAxis(grid, door.x, door.y);
  if (!axis) return null;

  const center = (CHUNK - 1) / 2;
  const sides = [axis.a, axis.b]
    .map((s) => ({
      ...s,
      score: Math.abs(s.x - center) + Math.abs(s.y - center),
    }))
    .sort((a, b) => b.score - a.score);

  const suitable = (x, y) => {
    if (!inBounds(x, y)) return false;
    const t = grid[y][x];
    if (t !== FLOOR && !isOpenDoorTile(t)) return false;
    if (t === STAIRS_DOWN || t === STAIRS_UP) return false;
    if (usedCells.has(keyXY(x, y))) return false;
    return true;
  };

  for (const side of sides) {
    for (let step = 1; step <= 6; step++) {
      const x = door.x + side.dx * step;
      const y = door.y + side.dy * step;
      if (!inBounds(x, y)) break;
      const t = grid[y][x];
      if (t === WALL || t === DOOR_CLOSED || tileIsLocked(t)) break;
      if (suitable(x, y)) return { x, y };
    }
  }

  for (const side of sides) {
    for (let ry = -2; ry <= 2; ry++) {
      for (let rx = -2; rx <= 2; rx++) {
        const x = side.x + rx;
        const y = side.y + ry;
        if (Math.abs(rx) + Math.abs(ry) > 3) continue;
        if (!suitable(x, y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

function applyLockedDoorChokepoints(grid, rng, z) {
  const candidates = [];
  const center = (CHUNK - 1) / 2;
  const areaInfo = buildChunkAreaMap(grid);
  const areaSizes = chunkAreaSizes(areaInfo.areaMap, areaInfo.areaCount);
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (!chunkDoorwayCandidate(grid, x, y)) continue;
      if (!chunkDoorIsChokepoint(grid, x, y)) continue;
      const profile = chunkDoorAreaProfile(grid, areaInfo.areaMap, areaSizes, x, y);
      const roomCorridorLike = !!(profile?.roomCorridorLike);
      const dCenter = Math.abs(x - center) + Math.abs(y - center);
      candidates.push({
        x,
        y,
        dCenter,
        source: "door",
        roomCorridorLike,
        ratio: profile?.ratio ?? 1,
        minSideSize: profile?.minSize ?? 0,
        maxSideSize: profile?.maxSize ?? 0,
        jitter: rng(),
      });
    }
  }

  // Fallback: if not enough existing doors qualify, also allow floor chokepoints
  // that fit door axis geometry so every chunk can still produce lock gates.
  if (candidates.length < 2) {
    for (let y = 1; y < CHUNK - 1; y++) {
      for (let x = 1; x < CHUNK - 1; x++) {
        if (grid[y][x] !== FLOOR) continue;
        if (!chunkDoorAxis(grid, x, y)) continue;
        if (!chunkCellIsChokepoint(grid, x, y)) continue;
        const profile = chunkDoorAreaProfile(grid, areaInfo.areaMap, areaSizes, x, y);
        const roomCorridorLike = !!(profile?.roomCorridorLike);
        const dCenter = Math.abs(x - center) + Math.abs(y - center);
        candidates.push({
          x,
          y,
          dCenter,
          source: "floor",
          roomCorridorLike,
          ratio: profile?.ratio ?? 1,
          minSideSize: profile?.minSize ?? 0,
          maxSideSize: profile?.maxSize ?? 0,
          jitter: rng(),
        });
      }
    }
  }
  if (!candidates.length) return [];

  candidates.sort((a, b) =>
    (Number(b.roomCorridorLike) - Number(a.roomCorridorLike)) ||
    ((b.ratio ?? 1) - (a.ratio ?? 1)) ||
    ((b.dCenter ?? 0) - (a.dCenter ?? 0)) ||
    ((b.jitter ?? 0) - (a.jitter ?? 0))
  );

  const desiredBase = 1 + Math.floor(Math.max(0, z) / 5);
  const desired = clamp(desiredBase + (rng() < 0.55 ? 1 : 0), 1, 6);
  const densityCap = Math.max(1, Math.floor(candidates.length * 0.55));
  const targetCount = Math.min(candidates.length, Math.max(1, Math.min(desired, densityCap)));

  const chosen = [];
  for (const cand of candidates) {
    if (chosen.some((c) => Math.abs(c.x - cand.x) + Math.abs(c.y - cand.y) < 5)) continue;
    chosen.push(cand);
    if (chosen.length >= targetCount) break;
  }
  if (chosen.length < targetCount) {
    for (const cand of candidates) {
      if (chosen.find((c) => c.x === cand.x && c.y === cand.y)) continue;
      chosen.push(cand);
      if (chosen.length >= targetCount) break;
    }
  }

  const usedChestCells = new Set();
  const rewards = [];
  for (const cand of chosen) {
    const keyType = keyTypeForDepth(z, rng);
    const lockTile = keyTypeToLockTile(keyType);
    grid[cand.y][cand.x] = lockTile;

    const chestCell = findRewardChestCellForDoor(grid, cand, usedChestCells);
    if (!chestCell) continue;
    usedChestCells.add(keyXY(chestCell.x, chestCell.y));
    rewards.push({
      keyType,
      chestX: chestCell.x,
      chestY: chestCell.y,
      lootDepth: Math.max(z + 2, z + randInt(rng, 2, 5)),
    });
  }
  return rewards;
}

// ---------- Special rooms ----------
function rectMostlyWalls(grid, x, y, w, h) {
  let walls = 0, total = 0;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (!inBounds(xx, yy)) return false;
      total++;
      if (grid[yy][xx] === WALL) walls++;
    }
  }
  return walls / total >= 0.9;
}

function tryAddTreasureRoom(seedStr, rng, z, grid, anchors) {
  const specials = {};
  const chance = clamp(0.10 + z * 0.007, 0, 0.30);
  if (rng() >= chance) return specials;

  for (let attempt = 0; attempt < 12; attempt++) {
    const a = anchors[randInt(rng, 0, anchors.length - 1)];
    const dir = choice(rng, ["N","S","W","E"]);
    const w = randInt(rng, 6, 10);
    const h = randInt(rng, 5, 8);

    let x = a.cx - Math.floor(w / 2);
    let y = a.cy - Math.floor(h / 2);
    const gap = 2;
    if (dir === "N") y = a.cy - h - gap;
    if (dir === "S") y = a.cy + gap;
    if (dir === "W") x = a.cx - w - gap;
    if (dir === "E") x = a.cx + gap;

    x = clamp(x, 2, CHUNK - 2 - w);
    y = clamp(y, 2, CHUNK - 2 - h);

    if (!rectMostlyWalls(grid, x, y, w, h)) continue;

    carveRect(grid, x, y, w, h, FLOOR);

    let doorX = clamp(a.cx, x + 1, x + w - 2);
    let doorY = clamp(a.cy, y + 1, y + h - 2);
    let outsideX = doorX, outsideY = doorY;

    if (dir === "N") { doorY = y + h - 1; outsideY = doorY + 1; }
    if (dir === "S") { doorY = y; outsideY = doorY - 1; }
    if (dir === "W") { doorX = x + w - 1; outsideX = doorX + 1; }
    if (dir === "E") { doorX = x; outsideX = doorX - 1; }

    carveCorridor(grid, rng, a.cx, a.cy, outsideX, outsideY);

    grid[doorY][doorX] = DOOR_CLOSED;

    specials.treasure = { lx: x + Math.floor(w / 2), ly: y + Math.floor(h / 2) };
    return specials;
  }
  return specials;
}

function tryAddShrineRoom(seedStr, rng, z, grid, anchors) {
  const specials = {};
  // increase base shrine chance and depth scaling so shrines appear more often
  const chance = clamp(0.14 + z * 0.01, 0, 0.35);
  if (rng() >= chance) return specials;

  for (let attempt = 0; attempt < 12; attempt++) {
    const a = anchors[randInt(rng, 0, anchors.length - 1)];
    const dir = choice(rng, ["N","S","W","E"]);
    const w = randInt(rng, 6, 10);
    const h = randInt(rng, 5, 8);

    let x = a.cx - Math.floor(w / 2);
    let y = a.cy - Math.floor(h / 2);
    const gap = 2;
    if (dir === "N") y = a.cy - h - gap;
    if (dir === "S") y = a.cy + gap;
    if (dir === "W") x = a.cx - w - gap;
    if (dir === "E") x = a.cx + gap;

    x = clamp(x, 2, CHUNK - 2 - w);
    y = clamp(y, 2, CHUNK - 2 - h);

    if (!rectMostlyWalls(grid, x, y, w, h)) continue;

    carveRect(grid, x, y, w, h, FLOOR);

    let doorX = clamp(a.cx, x + 1, x + w - 2);
    let doorY = clamp(a.cy, y + 1, y + h - 2);
    let outsideX = doorX, outsideY = doorY;

    if (dir === "N") { doorY = y + h - 1; outsideY = doorY + 1; }
    if (dir === "S") { doorY = y; outsideY = doorY - 1; }
    if (dir === "W") { doorX = x + w - 1; outsideX = doorX + 1; }
    if (dir === "E") { doorX = x; outsideX = doorX - 1; }

    carveCorridor(grid, rng, a.cx, a.cy, outsideX, outsideY);

    grid[doorY][doorX] = DOOR_CLOSED;

    specials.shrine = { lx: x + Math.floor(w / 2), ly: y + Math.floor(h / 2) };
    return specials;
  }
  return specials;
}

// ---------- Chunk generation ----------
function generateSurfaceChunk(z, cx, cy) {
  const grid = newGrid(WALL);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const wx = cx * CHUNK + lx;
      const wy = cy * CHUNK + ly;
      const ax = Math.abs(wx);
      const ay = Math.abs(wy);
      if (ax < SURFACE_HALF_SIZE && ay < SURFACE_HALF_SIZE) grid[ly][lx] = FLOOR;
      else if (
        (ax === SURFACE_HALF_SIZE && ay <= SURFACE_HALF_SIZE) ||
        (ay === SURFACE_HALF_SIZE && ax <= SURFACE_HALF_SIZE)
      ) grid[ly][lx] = WALL;

      // Surface return ladder is fixed at the center.
      if (wx === 0 && wy === 0) grid[ly][lx] = STAIRS_DOWN;
    }
  }
  const area = buildChunkAreaMap(grid);
  return {
    z, cx, cy, grid,
    specials: {},
    explore: { rooms: 0, corridors: 0 },
    areaMap: area.areaMap,
    areaCount: area.areaCount,
    surface: true,
  };
}

function generateChunk(seedStr, z, cx, cy) {
  if (z === SURFACE_LEVEL) return generateSurfaceChunk(z, cx, cy);

  const rng = makeRng(`${seedStr}|chunk|z${z}|${cx},${cy}`);
  const grid = newGrid(WALL);

  const edges = {
    N: edgeInfo(seedStr, z, cx, cy, "N"),
    S: edgeInfo(seedStr, z, cx, cy, "S"),
    W: edgeInfo(seedStr, z, cx, cy, "W"),
    E: edgeInfo(seedStr, z, cx, cy, "E"),
  };

  const rooms = [];
  let corridorCount = 0;
  const roomCount = randInt(rng, 2, 4);

  for (let i = 0; i < roomCount; i++) {
    const t = choice(rng, ["rect","rect","L","oval"]);
    if (t === "rect") {
      const w = randInt(rng, 5, 13);
      const h = randInt(rng, 4, 10);
      const x = randInt(rng, 2, CHUNK - 2 - w);
      const y = randInt(rng, 2, CHUNK - 2 - h);
      carveRect(grid, x, y, w, h, FLOOR);
      rooms.push({ cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    } else if (t === "L") {
      const w1 = randInt(rng, 6, 13);
      const h1 = randInt(rng, 4, 10);
      const w2 = randInt(rng, 4, 9);
      const h2 = randInt(rng, 4, 9);
      const x = randInt(rng, 2, CHUNK - 2 - Math.max(w1, w2));
      const y = randInt(rng, 2, CHUNK - 2 - Math.max(h1, h2));
      carveRect(grid, x, y, w1, h1, FLOOR);

      const attach = choice(rng, ["right-down","left-down","right-up","left-up"]);
      let x2 = x, y2 = y;
      if (attach.includes("right")) x2 = x + Math.max(1, w1 - Math.floor(w2 / 2));
      else x2 = Math.max(2, x - Math.floor(w2 / 2));
      if (attach.includes("down")) y2 = y + Math.max(1, h1 - Math.floor(h2 / 2));
      else y2 = Math.max(2, y - Math.floor(h2 / 2));
      x2 = clamp(x2, 2, CHUNK - 2 - w2);
      y2 = clamp(y2, 2, CHUNK - 2 - h2);
      carveRect(grid, x2, y2, w2, h2, FLOOR);

      rooms.push({
        cx: Math.floor((x + x2 + Math.floor(w1 / 2) + Math.floor(w2 / 2)) / 2),
        cy: Math.floor((y + y2 + Math.floor(h1 / 2) + Math.floor(h2 / 2)) / 2),
      });
    } else {
      const rx = randInt(rng, 3, 6);
      const ry = randInt(rng, 3, 6);
      const ox = randInt(rng, 2 + rx, CHUNK - 3 - rx);
      const oy = randInt(rng, 2 + ry, CHUNK - 3 - ry);
      carveOval(grid, ox, oy, rx, ry, FLOOR);
      rooms.push({ cx: ox, cy: oy });
    }
  }

  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(grid, rng, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
    corridorCount += 1;
  }
  if (rooms.length >= 3 && rng() < 0.6) {
    carveCorridor(grid, rng, rooms[0].cx, rooms[0].cy, rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy);
    corridorCount += 1;
  }

  const openCount = ["N","S","W","E"].reduce((n, d) => n + (edges[d].open ? 1 : 0), 0);
  if (openCount === 0) edges.E.open = true;

  const anchors = rooms.length ? rooms : [{ cx: Math.floor(CHUNK / 2), cy: Math.floor(CHUNK / 2) }];
  const nearestAnchor = (x, y) => {
    let best = anchors[0], bestD = Infinity;
    for (const a of anchors) {
      const dx = a.cx - x, dy = a.cy - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  };

  function openDoorAt(dir) {
    const info = edges[dir];
    if (!info.open) return;

    if (dir === "N") {
      const x = info.pos;
      grid[0][x] = DOOR_CLOSED;
      grid[1][x] = FLOOR;
      const a = nearestAnchor(x, 1);
      carveCorridor(grid, rng, x, 1, a.cx, a.cy);
      corridorCount += 1;
    } else if (dir === "S") {
      const x = info.pos;
      grid[CHUNK - 1][x] = DOOR_CLOSED;
      grid[CHUNK - 2][x] = FLOOR;
      const a = nearestAnchor(x, CHUNK - 2);
      carveCorridor(grid, rng, x, CHUNK - 2, a.cx, a.cy);
      corridorCount += 1;
    } else if (dir === "W") {
      const y = info.pos;
      grid[y][0] = DOOR_CLOSED;
      grid[y][1] = FLOOR;
      const a = nearestAnchor(1, y);
      carveCorridor(grid, rng, 1, y, a.cx, a.cy);
      corridorCount += 1;
    } else if (dir === "E") {
      const y = info.pos;
      grid[y][CHUNK - 1] = DOOR_CLOSED;
      grid[y][CHUNK - 2] = FLOOR;
      const a = nearestAnchor(CHUNK - 2, y);
      carveCorridor(grid, rng, CHUNK - 2, y, a.cx, a.cy);
      corridorCount += 1;
    }
  }

  openDoorAt("N"); openDoorAt("S"); openDoorAt("W"); openDoorAt("E");

  corridorCount += ensureChunkConnectivity(grid, rng) ?? 0;
  placeInternalDoors(grid, rng, z);

  function placeRandomStair(centerTile) {
    let best = null, bestD = Infinity;
    const tx = Math.floor(CHUNK / 2), ty = Math.floor(CHUNK / 2);
    for (let y = 2; y < CHUNK - 2; y++) for (let x = 2; x < CHUNK - 2; x++) {
      const t = grid[y][x];
      if (t !== FLOOR && t !== DOOR_CLOSED && !isOpenDoorTile(t)) continue;
      const dx = x - tx, dy = y - ty;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (!best) return false;
    grid[best.y][best.x] = centerTile;
    return true;
  }

  // Keep start chunk dedicated to the surface ladder (no down stairs there).
  const hasDownStairs = !(z === 0 && cx === 0 && cy === 0) && rng() < STAIRS_DOWN_SPAWN_CHANCE;
  if (hasDownStairs) {
    placeRandomStair(STAIRS_DOWN);
  }
  const hasUpStairs = z > 0 && rng() < STAIRS_UP_SPAWN_CHANCE;
  if (hasUpStairs) {
    placeRandomStair(STAIRS_UP);
  }

  const specials = {
    ...tryAddTreasureRoom(seedStr, rng, z, grid, anchors),
    ...tryAddShrineRoom(seedStr, rng, z, grid, anchors),
  };
  const lockedDoorRewards = applyLockedDoorChokepoints(grid, rng, z);
  const specialRoomCount = (specials.treasure ? 1 : 0) + (specials.shrine ? 1 : 0);
  const specialCorridorCount = specialRoomCount; // each special room uses one connector corridor
  const explore = {
    rooms: roomCount + specialRoomCount,
    corridors: corridorCount + specialCorridorCount,
  };
  const area = buildChunkAreaMap(grid);
  return { z, cx, cy, grid, specials, explore, lockedDoorRewards, areaMap: area.areaMap, areaCount: area.areaCount };
}

// ---------- World ----------
class World {
  constructor(seedStr, tileOverrides = null) {
    this.seedStr = seedStr;
    this.chunks = new Map();
    this.tileOverrides = tileOverrides ?? new Map(); // keyXYZ -> tile
  }
  chunkKey(z, cx, cy) { return `${z}|${cx},${cy}`; }
  getChunk(z, cx, cy) {
    const k = this.chunkKey(z, cx, cy);
    let c = this.chunks.get(k);
    if (!c) { c = generateChunk(this.seedStr, z, cx, cy); this.chunks.set(k, c); }
    return c;
  }
  normalizeTile(t) {
    if (t === "*") return LOCK_RED;
    return t;
  }
  getTile(x, y, z) {
    const ov = this.tileOverrides.get(keyXYZ(x, y, z));
    if (ov) return this.normalizeTile(ov);
    const { cx, cy, lx, ly } = splitWorldToChunk(x, y);
    const ch = this.getChunk(z, cx, cy);
    return this.normalizeTile(ch.grid[ly][lx]);
  }
  setTile(x, y, z, tile) {
    this.tileOverrides.set(keyXYZ(x, y, z), tile);
  }
  isPassable(x, y, z) {
    const t = this.getTile(x, y, z);
    return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
  }
  ensureChunksAround(x, y, z, radiusTiles) {
    const minX = x - radiusTiles, maxX = x + radiusTiles;
    const minY = y - radiusTiles, maxY = y + radiusTiles;
    const cMin = splitWorldToChunk(minX, minY);
    const cMax = splitWorldToChunk(maxX, maxY);
    for (let cy = cMin.cy; cy <= cMax.cy; cy++)
      for (let cx = cMin.cx; cx <= cMax.cx; cx++)
        this.getChunk(z, cx, cy);
  }
  areaIdAt(x, y, z) {
    const { cx, cy, lx, ly } = splitWorldToChunk(x, y);
    const ch = this.getChunk(z, cx, cy);
    const row = ch?.areaMap?.[ly];
    const areaId = Number.isFinite(row?.[lx]) ? row[lx] : -1;
    return Number.isFinite(areaId) ? Math.floor(areaId) : -1;
  }
  areaKeyAt(x, y, z) {
    const { cx, cy, lx, ly } = splitWorldToChunk(x, y);
    const areaId = this.areaIdAt(x, y, z);
    if (areaId >= 0) return `${z}|${cx},${cy}|${areaId}`;
    return `${z}|${cx},${cy}|void|${lx},${ly}`;
  }
}

// ---------- LOS / FOV ----------
function bresenham(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    pts.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return pts;
}
function hasLineOfSight(world, z, x0, y0, x1, y1) {
  const pts = bresenham(x0, y0, x1, y1);
  for (let i = 1; i < pts.length - 1; i++) {
    const t = world.getTile(pts[i].x, pts[i].y, z);
    if (tileBlocksLOS(t)) return false;
  }
  return true;
}

// ---------- Monsters / Items ----------
const FALLBACK_MONSTERS_MIN = {
  rat: {
    id: "rat",
    name: "Rat",
    baseHp: 18, baseAtk: 6, baseDef: 1, baseAcc: 70, baseEva: 18, spd: 1.25, xp: 3, glyph: "r", sizeGrowth: true,
  },
  goblin: {
    id: "goblin",
    name: "Goblin",
    baseHp: 46, baseAtk: 17, baseDef: 5, baseAcc: 76, baseEva: 14, spd: 1.1, xp: 7, glyph: "g", sizeGrowth: true,
  },
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    baseHp: 54, baseAtk: 15, baseDef: 7, baseAcc: 71, baseEva: 8, spd: 0.95, xp: 6, glyph: "k", sizeGrowth: true,
  },
  slime_yellow: {
    id: "slime_yellow",
    name: "Yellow Slime",
    baseHp: 26, baseAtk: 10, baseDef: 3, baseAcc: 68, baseEva: 11, spd: 1.0, xp: 6, glyph: "s", sizeGrowth: true,
  },
  slime: { id: "slime", name: "Slime", aliasOf: "slime_yellow", glyph: "s", sizeGrowth: true },
  jelly: { id: "jelly", name: "Slime", aliasOf: "slime_yellow", glyph: "s", sizeGrowth: true },
};
const MONSTER_TYPES = JSON.parse(JSON.stringify(FALLBACK_MONSTERS_MIN));
const VOID_ALIGNED_MONSTER_IDS = new Set([
  "wraith",
  "rift_hound",
  "nullmetal_assassin",
  "singularity_hunter",
  "slime_violet",
  "slime_indigo",
  "slime_red",
]);
const MONSTER_SIZE_TIERS = [
  { id: "small", depthStart: 0, mult: 1 },
  { id: "large", depthStart: 3, mult: 1.35 },
  { id: "giant", depthStart: 7, mult: 1.75 },
  { id: "hulking", depthStart: 18, mult: 2.3 },
];
function monsterDepthScale(depth) {
  const d = Math.max(0, Math.floor(depth ?? 0));
  return 1 + Math.pow(d * 0.085, 1.18);
}
function monsterSizeTier(depth, spec) {
  if (!spec?.sizeGrowth) return MONSTER_SIZE_TIERS[0];
  const d = Math.max(0, Math.floor(depth ?? 0));
  let out = MONSTER_SIZE_TIERS[0];
  for (const tier of MONSTER_SIZE_TIERS) {
    if (d >= tier.depthStart) out = tier;
  }
  return out;
}
function normalizeMonsterTypeId(type) {
  const id = String(type ?? "").trim();
  if (!id) return "";
  if (id === "jelly_green") return "slime_green";
  if (id === "jelly_yellow") return "slime_yellow";
  if (id === "jelly_red") return "slime_red";
  return id;
}
function resolveMonsterSpec(type) {
  const normalizedType = normalizeMonsterTypeId(type);
  const base = MONSTER_TYPES[normalizedType] ?? MONSTER_TYPES.rat;
  if (base?.aliasOf && MONSTER_TYPES[base.aliasOf]) {
    return { ...(MONSTER_TYPES[base.aliasOf] ?? MONSTER_TYPES.rat), id: normalizedType || type, aliasOf: base.aliasOf };
  }
  return base;
}

function monsterMinHpFloorForDepth(depth) {
  const d = Math.max(0, Math.floor(depth ?? 0));
  if (d < MONSTER_MIN_HP_FLOOR_START_DEPTH) return 0;
  const floorLegacy = MONSTER_MIN_HP_FLOOR_BASE + d * MONSTER_MIN_HP_FLOOR_PER_DEPTH;
  return Math.max(1, Math.round(floorLegacy * PLAYER_STAT_SCALE));
}

function monsterStatsForDepth(type, z) {
  const spec = resolveMonsterSpec(type);
  const depth = Math.max(0, Math.floor(z ?? 0));
  const scale = monsterDepthScale(depth);
  const sizeTier = monsterSizeTier(depth, spec);
  const tierIndex = Math.max(0, MONSTER_SIZE_TIERS.findIndex((t) => t.id === sizeTier.id));
  const sizePenalty = spec?.sizeGrowth ? tierIndex : 0;
  const hpScale = scale * sizeTier.mult;
  const depthT = clamp(depth / 20, 0, 1);
  const offenseDepthWeight = MONSTER_OFFENSE_DEPTH_WEIGHT_SHALLOW +
    (MONSTER_OFFENSE_DEPTH_WEIGHT_DEEP - MONSTER_OFFENSE_DEPTH_WEIGHT_SHALLOW) * depthT;
  const defenseDepthWeight = MONSTER_DEFENSE_DEPTH_WEIGHT_SHALLOW +
    (MONSTER_DEFENSE_DEPTH_WEIGHT_DEEP - MONSTER_DEFENSE_DEPTH_WEIGHT_SHALLOW) * depthT;
  const offenseScale =
    (1 + (scale - 1) * offenseDepthWeight) *
    (1 + (sizeTier.mult - 1) * MONSTER_OFFENSE_SIZE_SCALE_WEIGHT);
  const defenseScale =
    (1 + (scale - 1) * defenseDepthWeight) *
    (1 + (sizeTier.mult - 1) * MONSTER_DEFENSE_SIZE_SCALE_WEIGHT);
  const earlyDepthPressureT = clamp((EARLY_DEPTH_PRESSURE_FADE_DEPTH - depth) / EARLY_DEPTH_PRESSURE_FADE_DEPTH, 0, 1);
  const earlyHpMult = 1 + (EARLY_DEPTH_HP_MULT - 1) * earlyDepthPressureT;
  const earlyOffenseMult = 1 + (EARLY_DEPTH_OFFENSE_MULT - 1) * earlyDepthPressureT;
  const earlyDefenseMult = 1 + (EARLY_DEPTH_DEFENSE_MULT - 1) * earlyDepthPressureT;
  const midDepthPressureT = depth < MID_DEPTH_BOOST_START || depth > MID_DEPTH_BOOST_END
    ? 0
    : (depth <= MID_DEPTH_BOOST_PEAK
      ? clamp((depth - MID_DEPTH_BOOST_START) / Math.max(1, MID_DEPTH_BOOST_PEAK - MID_DEPTH_BOOST_START), 0, 1)
      : clamp((MID_DEPTH_BOOST_END - depth) / Math.max(1, MID_DEPTH_BOOST_END - MID_DEPTH_BOOST_PEAK), 0, 1));
  const midHpMult = 1 + (MID_DEPTH_HP_MULT_PEAK - 1) * midDepthPressureT;
  const midOffenseMult = 1 + (MID_DEPTH_OFFENSE_MULT_PEAK - 1) * midDepthPressureT;
  const midDefenseMult = 1 + (MID_DEPTH_DEFENSE_MULT_PEAK - 1) * midDepthPressureT;
  const baseHpScaled = Math.round((spec.baseHp ?? 18) * hpScale * earlyHpMult * midHpMult * PLAYER_STAT_SCALE);
  const hpFloor = monsterMinHpFloorForDepth(depth);
  const maxHp = Math.max(1, Math.max(baseHpScaled, hpFloor));
  const atk = Math.max(1, Math.round((spec.baseAtk ?? 6) * offenseScale * earlyOffenseMult * midOffenseMult * PLAYER_STAT_SCALE));
  const atkLo = Math.max(1, Math.round(atk * 0.82));
  const atkHi = Math.max(atkLo, Math.round(atk * 1.18));
  const def = Math.max(0, Math.round((spec.baseDef ?? 1) * defenseScale * earlyDefenseMult * midDefenseMult * PLAYER_STAT_SCALE));
  const acc = clamp(Math.round((spec.baseAcc ?? 70) + depth * 0.15), 8, 98);
  const evaBase = Math.round((spec.baseEva ?? 8) + depth * 0.12);
  const eva = clamp(evaBase - sizePenalty * 5, 0, 88);
  const spd = Math.max(0.55, Number(((spec.spd ?? 1) * Math.max(0.7, 1 - sizePenalty * 0.05)).toFixed(3)));
  return {
    ...spec,
    level: depth + 1,
    sizeTier: sizeTier.id,
    sizeMult: sizeTier.mult,
    depthScale: scale,
    offenseScale,
    defenseScale,
    maxHp,
    atk,
    atkLo,
    atkHi,
    def,
    acc,
    eva,
    spd,
    range: Math.max(0, Math.floor(spec.range ?? 0)),
    cdTurns: Math.max(0, Math.floor(spec.cdTurns ?? 0)),
  };
}

function monsterSizeTierPrefix(sizeTier) {
  if (sizeTier === "large") return "Large";
  if (sizeTier === "giant") return "Giant";
  if (sizeTier === "hulking") return "Hulking";
  return "";
}

function monsterDisplayName(monsterOrType, depth = 0) {
  const type = typeof monsterOrType === "string"
    ? monsterOrType
    : (monsterOrType?.type ?? "rat");
  const z = typeof monsterOrType === "string"
    ? depth
    : (monsterOrType?.z ?? depth ?? 0);
  const spec = monsterStatsForDepth(type, z);
  const baseName = spec?.name ?? MONSTER_TYPES[type]?.name ?? type;
  const prefix = monsterSizeTierPrefix(spec?.sizeTier);
  return prefix ? `${prefix} ${baseName}` : baseName;
}

const METAL_TIERS = [
  { id: "wood", name: "Wood", color: "#8B5A2B", atkBonus: -30, defBonus: 0, unlockDepth: 0, rampDepth: 2, maxWeight: 42 },
  { id: "bronze", name: "Bronze", color: "#CD7F32", atkBonus: 0, defBonus: 40, unlockDepth: 0, rampDepth: 2, maxWeight: 38 },
  { id: "iron", name: "Iron", color: "#5A5F66", atkBonus: 120, defBonus: 150, unlockDepth: 0, rampDepth: 3, maxWeight: 34 },
  { id: "steel", name: "Steel", color: "#B0B7C1", atkBonus: 260, defBonus: 250, unlockDepth: 3, rampDepth: 4, maxWeight: 28 },
  { id: "silversteel", name: "Silversteel", color: "#E8F0FF", atkBonus: 390, defBonus: 360, unlockDepth: 8, rampDepth: 5, maxWeight: 20 },
  { id: "storm_alloy", name: "Storm Alloy", color: "#4DA6FF", atkBonus: 530, defBonus: 480, unlockDepth: 14, rampDepth: 6, maxWeight: 16 },
  { id: "sunforged_alloy", name: "Sunforged Alloy", color: "#FFC94D", atkBonus: 680, defBonus: 610, unlockDepth: 21, rampDepth: 7, maxWeight: 13 },
  { id: "embersteel", name: "Embersteel", color: "#D9381E", atkBonus: 840, defBonus: 750, unlockDepth: 29, rampDepth: 8, maxWeight: 11 },
  { id: "star_metal", name: "Star Metal", color: "#6C7B8B", atkBonus: 1010, defBonus: 900, unlockDepth: 38, rampDepth: 9, maxWeight: 9 },
  { id: "nightsteel", name: "Nightsteel", color: "#1A1F2E", atkBonus: 1190, defBonus: 1060, unlockDepth: 49, rampDepth: 10, maxWeight: 8 },
  { id: "heartstone_alloy", name: "Heartstone Alloy", color: "#C43C7A", atkBonus: 1380, defBonus: 1230, unlockDepth: 61, rampDepth: 11, maxWeight: 7 },
  { id: "aether_alloy", name: "Aether Alloy", color: "#E0FFF7", atkBonus: 1580, defBonus: 1410, unlockDepth: 74, rampDepth: 12, maxWeight: 6 },
  { id: "prime_metal", name: "Prime Metal", color: "#F4F1D0", atkBonus: 1790, defBonus: 1600, unlockDepth: 88, rampDepth: 14, maxWeight: 5 },
  { id: "nullmetal", name: "Nullmetal", color: "#2B2B2B", atkBonus: 2010, defBonus: 1800, unlockDepth: 103, rampDepth: 16, maxWeight: 4 },
  { id: "dungeoncore_alloy", name: "Dungeoncore Alloy", color: "#6B2DFF", atkBonus: 2240, defBonus: 2010, unlockDepth: 109, rampDepth: 18, maxWeight: 3 },
  { id: "azhurite_prime", name: "Azhurite Prime", color: "#00BFFF", atkBonus: 2480, defBonus: 2230, unlockDepth: 114, rampDepth: 20, maxWeight: 2 },
  { id: "deepcore_metal", name: "Deepcore Metal", color: "#8B0000", atkBonus: 2730, defBonus: 2460, unlockDepth: 118, rampDepth: 22, maxWeight: 2 },
  { id: "singularity_steel", name: "Singularity Steel", color: "#7A00CC", atkBonus: 2990, defBonus: 2700, unlockDepth: 120, rampDepth: 24, maxWeight: 1 },
];
const MATERIAL_DEPTH_WINDOWS = {
  // Early game hard cutoffs requested: wood <= 1, iron <= 4, steel <= 6.
  wood: { minDepth: 0, peakDepth: 0, maxDepth: 1, peakWeight: 44 },
  bronze: { minDepth: 0, peakDepth: 1, maxDepth: 3, peakWeight: 40 },
  iron: { minDepth: 0, peakDepth: 2, maxDepth: 4, peakWeight: 46 },
  steel: { minDepth: 2, peakDepth: 4, maxDepth: 6, peakWeight: 38 },
  silversteel: { minDepth: 4, peakDepth: 7, maxDepth: 10, peakWeight: 30 },
  storm_alloy: { minDepth: 6, peakDepth: 10, maxDepth: 15, peakWeight: 27 },
  sunforged_alloy: { minDepth: 9, peakDepth: 14, maxDepth: 21, peakWeight: 23 },
  embersteel: { minDepth: 13, peakDepth: 19, maxDepth: 28, peakWeight: 20 },
  star_metal: { minDepth: 18, peakDepth: 26, maxDepth: 36, peakWeight: 17 },
  nightsteel: { minDepth: 24, peakDepth: 33, maxDepth: 45, peakWeight: 15 },
  heartstone_alloy: { minDepth: 31, peakDepth: 42, maxDepth: 56, peakWeight: 13 },
  aether_alloy: { minDepth: 39, peakDepth: 52, maxDepth: 68, peakWeight: 12 },
  prime_metal: { minDepth: 48, peakDepth: 63, maxDepth: 81, peakWeight: 10 },
  nullmetal: { minDepth: 58, peakDepth: 75, maxDepth: 95, peakWeight: 8 },
  dungeoncore_alloy: { minDepth: 70, peakDepth: 89, maxDepth: 108, peakWeight: 7 },
  azhurite_prime: { minDepth: 82, peakDepth: 101, maxDepth: 116, peakWeight: 5 },
  deepcore_metal: { minDepth: 93, peakDepth: 112, maxDepth: 122, peakWeight: 4 },
  singularity_steel: { minDepth: 105, peakDepth: 126, maxDepth: Number.POSITIVE_INFINITY, peakWeight: 3 },
};
const MATERIAL_BY_ID = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m]));
const MATERIAL_COLOR_BY_ID = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.color]));
const WEAPON_MATERIALS = METAL_TIERS.map((m) => m.id);
const WEAPON_KINDS = ["dagger", "sword", "axe", "shortbow", "longbow", "crossbow"];
const ARMOR_MATERIALS = METAL_TIERS.map((m) => m.id);
const ARMOR_SLOTS = ["head", "chest", "legs"];
const SCRAPPER_LOW_TIER_MAX_INDEX = Math.max(0, METAL_TIERS.findIndex((tier) => tier.id === "steel"));

const WEAPON_KIND_LABEL = {
  dagger: "Dagger",
  sword: "Sword",
  axe: "Axe",
  shortbow: "Shortbow",
  longbow: "Longbow",
  crossbow: "Crossbow",
};
const BOW_DISPLAY_NAME_BY_MATERIAL = {
  wood: {
    shortbow: "Oak Initiate Bow",
    longbow: "Hardened Oak Longbow",
    crossbow: "Crude Oak Crossbow",
  },
  bronze: {
    shortbow: "Bronze-Banded Oak Bow",
    longbow: "Copper-Limbed Longbow",
    crossbow: "Bronze Crankbow",
  },
  iron: {
    shortbow: "Iron-Riveted Oak Bow",
    longbow: "Forged Iron Warbow",
    crossbow: "Iron Bolt-Caster",
  },
  steel: {
    shortbow: "Steel-Tipped Yew Bow",
    longbow: "Tempered Yew Longbow",
    crossbow: "Steel Recurve Crossbow",
  },
  silversteel: {
    shortbow: "Silversteel Whisperbow",
    longbow: "Frostbound Yew Longbow",
    crossbow: "Silversteel Windlass",
  },
  storm_alloy: {
    shortbow: "Stormbound Yew Bow",
    longbow: "Thunderlimb Warbow",
    crossbow: "Storm Alloy Arcbow",
  },
  sunforged_alloy: {
    shortbow: "Sunforged Ash Bow",
    longbow: "Radiant Warbow",
    crossbow: "Solar Crankbow",
  },
  embersteel: {
    shortbow: "Emberlash Bow",
    longbow: "Magma-Core Warbow",
    crossbow: "Embersteel Siegebow",
  },
  star_metal: {
    shortbow: "Starforged Ash Bow",
    longbow: "Meteor Arc Longbow",
    crossbow: "Star Metal Ballista",
  },
  nightsteel: {
    shortbow: "Nightsteel Shadowbow",
    longbow: "Abyssal Ironwood Longbow",
    crossbow: "Nightsteel Silent Repeater",
  },
  heartstone_alloy: {
    shortbow: "Heartpulse Bow",
    longbow: "Crimson Core Longbow",
    crossbow: "Heartstone Windlass",
  },
  aether_alloy: {
    shortbow: "Aetherweave Bow",
    longbow: "Mistbound Ironwood Warbow",
    crossbow: "Aetherlight Crossbow",
  },
  prime_metal: {
    shortbow: "Primebound Dragonbow",
    longbow: "Ivory Sovereign Longbow",
    crossbow: "Prime Metal Arbalest",
  },
  nullmetal: {
    shortbow: "Nullstring Dragonbow",
    longbow: "Voidlined Warbow",
    crossbow: "Nullmetal Suppressor",
  },
  dungeoncore_alloy: {
    shortbow: "Corebound Bow",
    longbow: "Dungeonheart Warbow",
    crossbow: "Corelock Ballista",
  },
  azhurite_prime: {
    shortbow: "Azhurite Recurve",
    longbow: "Azurefract Longbow",
    crossbow: "Azhurite Prismcaster",
  },
  deepcore_metal: {
    shortbow: "Deepcore Warbow",
    longbow: "Coreblood Siege Bow",
    crossbow: "Deepcore Torsion Engine",
  },
  singularity_steel: {
    shortbow: "Singularity Recurve",
    longbow: "Gravity Arc Longbow",
    crossbow: "Event Horizon Arbalest",
  },
};
const WEAPON_KIND_ATK = {
  dagger: 90,
  sword: 150,
  axe: 210,
  shortbow: 105,
  longbow: 135,
  crossbow: 165,
};
const WEAPON_ATTACK_PROFILES = {
  dagger: {
    kind: "melee",
    range: 1,
    minRange: 1,
    requiresLOS: false,
    cannotFireAdjacent: false,
    damageMod: 1,
    accuracyMod: 0,
    critChanceMod: 0,
    defIgnorePct: 0,
    hands: 1,
  },
  sword: {
    kind: "melee",
    range: 1,
    minRange: 1,
    requiresLOS: false,
    cannotFireAdjacent: false,
    damageMod: 1,
    accuracyMod: 0,
    critChanceMod: 0,
    defIgnorePct: 0,
    hands: 1,
  },
  axe: {
    kind: "melee",
    range: 1,
    minRange: 1,
    requiresLOS: false,
    cannotFireAdjacent: false,
    damageMod: 1,
    accuracyMod: -1,
    critChanceMod: 0,
    defIgnorePct: 0,
    hands: 1,
  },
  shortbow: {
    kind: "ranged",
    range: 7,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.80,
    accuracyMod: 2,
    critChanceMod: 3,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.88,
    maxRangeFalloffPct: 0.12,
    hands: 2,
  },
  longbow: {
    kind: "ranged",
    range: 8,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.92,
    accuracyMod: 0,
    critChanceMod: 0,
    defIgnorePct: 0.05,
    closeRangeDamageMult: 0.75,
    maxRangeFalloffPct: 0.10,
    hands: 2,
  },
  crossbow: {
    kind: "ranged",
    range: 6,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 1.04,
    accuracyMod: -3,
    critChanceMod: -1,
    defIgnorePct: 0.09,
    closeRangeDamageMult: 0.62,
    maxRangeFalloffPct: 0.14,
    hands: 1,
  },
};
const UNARMED_ATTACK_PROFILE = {
  kind: "melee",
  flavor: "unarmed",
  range: 1,
  minRange: 1,
  requiresLOS: false,
  cannotFireAdjacent: false,
  damageMod: 1,
  accuracyMod: 0,
  critChanceMod: 0,
  defIgnorePct: 0,
  closeRangeDamageMult: 1,
  maxRangeFalloffPct: 0,
  hands: 0,
};
const CLASS_NATIVE_ATTACKS = {
  ranger: {
    kind: "ranged",
    flavor: "ballistic",
    range: 5,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.82,
    accuracyMod: 8,
    critChanceMod: 0,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.72,
    maxRangeFalloffPct: 0.1,
  },
  alchemist: {
    kind: "ranged",
    flavor: "alchemical",
    range: 4,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.78,
    accuracyMod: 4,
    critChanceMod: 0,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.72,
    maxRangeFalloffPct: 0.08,
  },
  calibrator: {
    kind: "ranged",
    flavor: "tech",
    range: 5,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.8,
    accuracyMod: 10,
    critChanceMod: 4,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.72,
    maxRangeFalloffPct: 0.1,
  },
  overclock_unit: {
    kind: "ranged",
    flavor: "tech",
    range: 4,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.84,
    accuracyMod: 2,
    critChanceMod: 0,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.74,
    maxRangeFalloffPct: 0.08,
  },
  void_savant: {
    kind: "ranged",
    flavor: "void",
    range: 5,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.86,
    accuracyMod: 4,
    critChanceMod: 0,
    defIgnorePct: 0.06,
    closeRangeDamageMult: 0.72,
    maxRangeFalloffPct: 0.1,
  },
  echo_sniper: {
    kind: "ranged",
    flavor: "void",
    range: 7,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.8,
    accuracyMod: 12,
    critChanceMod: 0,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.6,
    maxRangeFalloffPct: 0.16,
  },
  psion: {
    kind: "ranged",
    flavor: "psionic",
    range: 4,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.82,
    accuracyMod: 6,
    critChanceMod: 0,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.74,
    maxRangeFalloffPct: 0.08,
  },
  mindpiercer: {
    kind: "ranged",
    flavor: "psionic",
    range: 5,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.8,
    accuracyMod: 6,
    critChanceMod: 5,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.72,
    maxRangeFalloffPct: 0.1,
  },
  spitter: {
    kind: "ranged",
    flavor: "toxin",
    range: 5,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod: 0.8,
    accuracyMod: 8,
    critChanceMod: 0,
    defIgnorePct: 0,
    closeRangeDamageMult: 0.72,
    maxRangeFalloffPct: 0.1,
  },
};
const WEAPON_MATERIAL_ATK = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.atkBonus]));
const ARMOR_MATERIAL_DEF = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.defBonus]));
const ARMOR_SLOT_DEF = {
  head: 70,
  chest: 130,
  legs: 90,
};

function capWord(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleFromId(s) { return String(s ?? "").split("_").map(capWord).join(" "); }
function materialLabel(material) { return MATERIAL_BY_ID[material]?.name ?? titleFromId(material); }
function weaponDisplayName(material, kind) {
  const mappedBowName = BOW_DISPLAY_NAME_BY_MATERIAL[material]?.[kind];
  if (mappedBowName) {
    if (/bow/i.test(mappedBowName)) return mappedBowName;
    return `${mappedBowName} (${WEAPON_KIND_LABEL[kind]})`;
  }
  return `${materialLabel(material)} ${WEAPON_KIND_LABEL[kind]}`;
}
function weaponType(material, kind) { return `weapon_${material}_${kind}`; }
function armorType(material, slot) { return `armor_${material}_${slot}`; }
function weaponKindFromItemType(type) {
  if (!type || typeof type !== "string" || !type.startsWith("weapon_")) return null;
  const parts = type.split("_");
  if (parts.length < 3) return null;
  return parts[parts.length - 1] ?? null;
}
function normalizeAttackProfile(profile, fallbackProfile = UNARMED_ATTACK_PROFILE) {
  const src = (profile && typeof profile === "object") ? profile : fallbackProfile;
  const fallback = (fallbackProfile && typeof fallbackProfile === "object") ? fallbackProfile : UNARMED_ATTACK_PROFILE;
  const kind = src.kind === "ranged" ? "ranged" : "melee";
  const minRange = Math.max(1, Math.floor(Number(src.minRange ?? fallback.minRange ?? 1) || 1));
  const range = Math.max(minRange, Math.floor(Number(src.range ?? fallback.range ?? minRange) || minRange));
  const flavorRaw = String(src.flavor ?? (kind === "ranged" ? "ballistic" : "melee")).trim().toLowerCase();
  return {
    kind,
    flavor: flavorRaw || (kind === "ranged" ? "ballistic" : "melee"),
    range,
    minRange,
    requiresLOS: kind === "ranged" ? !!src.requiresLOS : false,
    cannotFireAdjacent: kind === "ranged" ? !!src.cannotFireAdjacent : false,
    damageMod: Math.max(0.1, Number(src.damageMod ?? fallback.damageMod ?? 1)),
    accuracyMod: Math.round(Number(src.accuracyMod ?? fallback.accuracyMod ?? 0) || 0),
    critChanceMod: Math.round(Number(src.critChanceMod ?? fallback.critChanceMod ?? 0) || 0),
    defIgnorePct: clamp(Number(src.defIgnorePct ?? fallback.defIgnorePct ?? 0), 0, 0.9),
    closeRangeDamageMult: clamp(Number(src.closeRangeDamageMult ?? fallback.closeRangeDamageMult ?? 1), 0.2, 1),
    maxRangeFalloffPct: clamp(Number(src.maxRangeFalloffPct ?? fallback.maxRangeFalloffPct ?? 0), 0, 0.8),
    hands: Math.max(0, Math.floor(Number(src.hands ?? fallback.hands ?? 0) || 0)),
  };
}
function weaponAttackProfileForType(type) {
  const kind = weaponKindFromItemType(type);
  const profile = kind ? WEAPON_ATTACK_PROFILES[kind] : null;
  return normalizeAttackProfile(profile ?? UNARMED_ATTACK_PROFILE, UNARMED_ATTACK_PROFILE);
}
function classNativeAttackProfile(classId) {
  const cid = normalizeCharacterClassId(classId);
  const profile = CLASS_NATIVE_ATTACKS[cid];
  return profile ? normalizeAttackProfile(profile, UNARMED_ATTACK_PROFILE) : null;
}
function resolvePlayerAttackProfile(state) {
  const weaponTypeId = state?.player?.equip?.weapon ?? null;
  const weaponProfile = weaponTypeId ? WEAPONS[weaponTypeId]?.attackProfile ?? null : null;
  if (weaponProfile) {
    return {
      ...normalizeAttackProfile(weaponProfile, UNARMED_ATTACK_PROFILE),
      source: "weapon",
      weaponType: weaponTypeId,
    };
  }
  const classId = state?.player?.classId ?? state?.character?.classId ?? DEFAULT_CHARACTER_CLASS_ID;
  const nativeProfile = classNativeAttackProfile(classId);
  if (nativeProfile) {
    return {
      ...nativeProfile,
      source: "class_native",
      classId: normalizeCharacterClassId(classId),
    };
  }
  return {
    ...normalizeAttackProfile(UNARMED_ATTACK_PROFILE, UNARMED_ATTACK_PROFILE),
    source: "unarmed",
  };
}

const ITEM_TYPES = {
  potion: { name: "Potion" },
  gold: { name: "Gold" },
  shopkeeper: { name: "Shopkeeper" },

  key_red: { name: "Red Key" },
  key_green: { name: "Green Key" },
  key_yellow: { name: "Yellow Key" },
  key_orange: { name: "Orange Key" },
  key_violet: { name: "Violet Key" },
  key_indigo: { name: "Indigo Key" },
  key_blue: { name: "Blue Key" },
  key_purple: { name: "Purple Key" },
  key_magenta: { name: "Magenta Key" },

  chest: { name: "Chest" },
  shrine: { name: "Shrine" },
};

const WEAPONS = {};
for (const material of WEAPON_MATERIALS) {
  for (const kind of WEAPON_KINDS) {
    const id = weaponType(material, kind);
    ITEM_TYPES[id] = { name: weaponDisplayName(material, kind) };
    WEAPONS[id] = {
      atkBonus: WEAPON_KIND_ATK[kind] + WEAPON_MATERIAL_ATK[material],
      kind,
      attackProfile: normalizeAttackProfile(WEAPON_ATTACK_PROFILES[kind] ?? UNARMED_ATTACK_PROFILE, UNARMED_ATTACK_PROFILE),
    };
  }
}

const ARMOR_PIECES = {};
for (const material of ARMOR_MATERIALS) {
  for (const slot of ARMOR_SLOTS) {
    const id = armorType(material, slot);
    const slotLabel = slot === "head" ? "Helmet" : (slot === "chest" ? "Chestplate" : "Platelegs");
    ITEM_TYPES[id] = { name: `${materialLabel(material)} ${slotLabel}` };
    ARMOR_PIECES[id] = { slot, defBonus: ARMOR_MATERIAL_DEF[material] + ARMOR_SLOT_DEF[slot] };
  }
}

const LEGACY_ITEM_MAP = {
  weapon_dagger: weaponType("bronze", "dagger"),
  weapon_sword: weaponType("bronze", "sword"),
  weapon_axe: weaponType("bronze", "axe"),
  weapon_mace: weaponType("iron", "axe"),
  weapon_greatsword: weaponType("steel", "sword"),
  weapon_runeblade: weaponType("steel", "axe"),
  armor_leather: armorType("wood", "chest"),
  armor_leather_chest: armorType("wood", "chest"),
  armor_leather_legs: armorType("wood", "legs"),
  armor_chain: armorType("iron", "chest"),
  armor_plate: armorType("steel", "chest"),
  key_blue: KEY_INDIGO,
  key_purple: KEY_VIOLET,
  key_magenta: KEY_INDIGO,
};

function normalizeItemType(type) {
  return LEGACY_ITEM_MAP[type] ?? type;
}

function weightedPick(rng, entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}

function depthWindowWeight(depth, window) {
  if (!window) return 0;
  const min = Math.max(0, Math.floor(window.minDepth ?? 0));
  const peak = Math.max(min, Math.floor(window.peakDepth ?? min));
  const maxRaw = window.maxDepth ?? Number.POSITIVE_INFINITY;
  const max = Number.isFinite(maxRaw) ? Math.max(peak, Math.floor(maxRaw)) : Number.POSITIVE_INFINITY;
  if (depth < min || depth > max) return 0;

  const peakWeight = Math.max(1, Math.floor(window.peakWeight ?? 1));
  if (!Number.isFinite(max) || (min === peak && peak === max)) return peakWeight;
  if (depth === peak) return peakWeight;

  if (depth < peak) {
    const denom = Math.max(1, peak - min);
    const t = (depth - min) / denom;
    return Math.max(1, Math.round(1 + (peakWeight - 1) * t));
  }

  if (!Number.isFinite(max)) return peakWeight;
  const denom = Math.max(1, max - peak);
  const t = (max - depth) / denom;
  return Math.max(1, Math.round(1 + (peakWeight - 1) * t));
}

function fallbackMaterialForDepth(depth) {
  if (depth <= 1) return "wood";
  if (depth <= 3) return "bronze";
  if (depth <= 4) return "iron";
  if (depth <= 6) return "steel";
  return METAL_TIERS[METAL_TIERS.length - 1].id;
}

function materialWeightsForDepth(z) {
  const depth = Math.max(0, Math.floor(z));
  const weighted = [];
  for (const tier of METAL_TIERS) {
    const w = depthWindowWeight(depth, MATERIAL_DEPTH_WINDOWS[tier.id]);
    if (w > 0) weighted.push({ id: tier.id, w });
  }

  if (weighted.length > 0) return weighted;
  return [{ id: fallbackMaterialForDepth(depth), w: 1 }];
}

function weaponMaterialWeightsForDepth(z) {
  return materialWeightsForDepth(z);
}

function armorMaterialWeightsForDepth(z) {
  return materialWeightsForDepth(z);
}

function weaponForDepth(z, rng = Math.random) {
  const material = weightedPick(rng, weaponMaterialWeightsForDepth(z));
  const kind = weightedPick(rng, [
    { id: "dagger", w: 20 },
    { id: "sword", w: 28 },
    { id: "axe", w: 22 },
    { id: "shortbow", w: 14 },
    { id: "longbow", w: 10 },
    { id: "crossbow", w: 6 },
  ]);
  return weaponType(material, kind);
}

function armorForDepth(z, rng = Math.random) {
  const material = weightedPick(rng, armorMaterialWeightsForDepth(z));
  const slot = weightedPick(rng, [
    { id: "head", w: 20 },
    { id: "chest", w: 45 },
    { id: "legs", w: 35 },
  ]);
  return armorType(material, slot);
}

function itemMarketValue(type) {
  if (type === "potion") return 60;
  if (type === "gold") return 1;
  const materialId = type?.startsWith("weapon_") || type?.startsWith("armor_")
    ? type.split("_").slice(1, -1).join("_")
    : null;
  const tierIndex = materialId ? METAL_TIERS.findIndex((tier) => tier.id === materialId) : -1;
  // Keep early tiers accessible while making late-tier metals meaningfully expensive.
  const tierFactor = tierIndex >= 0 ? (0.85 + tierIndex * 0.12) : 1;
  if (type?.startsWith("weapon_")) {
    const atk = WEAPONS[type]?.atkBonus ?? 0;
    return Math.max(20, Math.floor((34 + atk * 0.48) * tierFactor));
  }
  if (type?.startsWith("armor_")) {
    const def = ARMOR_PIECES[type]?.defBonus ?? 0;
    return Math.max(20, Math.floor((30 + def * 0.52) * tierFactor));
  }
  return 20;
}

function shopBuyPrice(type, depth) {
  const base = itemMarketValue(type);
  const markup = type === "potion" ? 1.2 : (1.25 + Math.min(0.25, depth * 0.01));
  return Math.max(5, Math.floor(base * markup));
}

function shopSellPrice(type) {
  return Math.max(1, Math.floor(itemMarketValue(type) * 0.25));
}

function shopProgressScore(state) {
  const depthScore = Math.max(0, state.player.z);
  const levelScore = Math.max(0, Math.floor((state.player.level - 1) * 0.9));
  return depthScore + levelScore;
}

function shopRefreshIntervalMsForLevel(levelRaw) {
  const level = Math.max(1, Math.floor(levelRaw ?? 1));
  // Lower levels refresh faster, rising toward 7 minutes at high levels.
  const t = clamp((level - 1) / 49, 0, 1);
  const sec = Math.round(30 + (420 - 30) * t);
  return sec * 1000;
}

function shopTierIndexForLevel(levelRaw) {
  const level = Math.max(1, Math.floor(levelRaw ?? 1));
  return clamp(Math.floor((level - 1) / 2), 0, METAL_TIERS.length - 1);
}

function randomPotionStockAmount(rng = Math.random) {
  return randInt(rng, 8, 15);
}

function buildShopGearPoolByTier() {
  const byTier = new Map();
  for (let tierIdx = 0; tierIdx < METAL_TIERS.length; tierIdx++) {
    const material = METAL_TIERS[tierIdx]?.id;
    if (!material) continue;
    const types = [];
    for (const kind of WEAPON_KINDS) types.push(weaponType(material, kind));
    for (const slot of ARMOR_SLOTS) types.push(armorType(material, slot));
    byTier.set(tierIdx, types);
  }
  return byTier;
}

function drawUniqueFromPool(rng, pool, count, taken = new Set()) {
  if (!Array.isArray(pool) || pool.length <= 0 || count <= 0) return [];
  const available = pool.filter((type) => type && !taken.has(type));
  if (!available.length) return [];
  const out = [];
  while (available.length && out.length < count) {
    const pick = randInt(rng, 0, available.length - 1);
    const type = available.splice(pick, 1)[0];
    if (!type || taken.has(type)) continue;
    taken.add(type);
    out.push(type);
  }
  return out;
}

function targetShopCountsForLevel(levelRaw) {
  const level = Math.max(1, Math.floor(levelRaw ?? 1));
  const total = clamp(10 + Math.floor(level / 8), 10, 14);
  const gear = Math.max(4, total - 1);
  return { total, gear };
}

function buildShopGearTypesForLevel(levelRaw, rng = Math.random) {
  const playerTier = shopTierIndexForLevel(levelRaw);
  const poolByTier = buildShopGearPoolByTier();
  const { gear: gearTarget } = targetShopCountsForLevel(levelRaw);
  const taken = new Set();
  const out = [];

  const takeFromTierDelta = (minDelta, maxDelta, wanted) => {
    const bucket = [];
    for (let d = minDelta; d <= maxDelta; d++) {
      const idx = playerTier + d;
      if (idx < 0 || idx >= METAL_TIERS.length) continue;
      bucket.push(...(poolByTier.get(idx) ?? []));
    }
    const picked = drawUniqueFromPool(rng, bucket, wanted, taken);
    out.push(...picked);
    return picked.length;
  };

  // 2-3 items one tier higher.
  const oneTierWanted = randInt(rng, 2, 3);
  takeFromTierDelta(1, 1, oneTierWanted);

  // Sometimes 1-2 items 2-3 tiers higher.
  const twoThreeRoll = rng();
  const twoThreeWanted = twoThreeRoll < 0.16 ? 2 : (twoThreeRoll < 0.44 ? 1 : 0);
  takeFromTierDelta(2, 3, twoThreeWanted);

  // Very rarely one 4-tier item.
  if (rng() < 0.05) takeFromTierDelta(4, 4, 1);

  // Once in a blue moon one 5-tier item.
  if (rng() < 0.01) takeFromTierDelta(5, 5, 1);

  // Mostly around player tier or lower.
  if (out.length < gearTarget) {
    const corePool = [];
    for (let idx = 0; idx <= playerTier; idx++) corePool.push(...(poolByTier.get(idx) ?? []));
    out.push(...drawUniqueFromPool(rng, corePool, gearTarget - out.length, taken));
  }

  // Fallback fill (if near top tiers and constrained).
  if (out.length < gearTarget) {
    const anyPool = [];
    for (let idx = 0; idx < METAL_TIERS.length; idx++) anyPool.push(...(poolByTier.get(idx) ?? []));
    out.push(...drawUniqueFromPool(rng, anyPool, gearTarget - out.length, taken));
  }

  return out.slice(0, gearTarget);
}

function ensurePotionStockEntry(stock, depth, rng = Math.random) {
  if (!Array.isArray(stock)) return;
  const idx = stock.findIndex((entry) => entry?.type === "potion");
  const refill = randomPotionStockAmount(rng);
  if (idx < 0) {
    stock.unshift({ type: "potion", price: shopBuyPrice("potion", depth), amount: refill });
    return;
  }
  const entry = stock[idx];
  entry.price = shopBuyPrice("potion", depth);
  const cur = Math.max(0, Math.floor(entry.amount ?? 0));
  if (cur < 4) entry.amount = refill;
  else if (cur > 15) entry.amount = 15;
  else entry.amount = cur;
}

function shopCatalogForDepth(depth) {
  const d = Math.max(0, depth);
  const items = [{ type: "potion", w: Math.max(6, 14 - Math.floor(d / 16)) }];

  const weaponMats = weaponMaterialWeightsForDepth(d);
  for (const mat of weaponMats) {
    for (const kind of WEAPON_KINDS) {
      const mul = kind === "sword" ? 1.1 : (kind === "axe" ? 1.0 : 0.95);
      items.push({
        type: weaponType(mat.id, kind),
        w: Math.max(1, Math.round(mat.w * mul)),
      });
    }
  }

  const armorMats = armorMaterialWeightsForDepth(d);
  for (const mat of armorMats) {
    for (const slot of ARMOR_SLOTS) {
      const mul = slot === "chest" ? 1 : 0.92;
      items.push({
        type: armorType(mat.id, slot),
        w: Math.max(1, Math.round(mat.w * mul)),
      });
    }
  }

  return items;
}

function drawUniqueWeightedItems(rng, weightedItems, count) {
  const pool = weightedItems.map((x) => ({ ...x }));
  const out = [];
  while (pool.length && out.length < count) {
    const total = pool.reduce((s, x) => s + Math.max(0, x.w), 0);
    if (total <= 0) break;
    let r = rng() * total;
    let pickIndex = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0, pool[i].w);
      if (r <= 0) {
        pickIndex = i;
        break;
      }
    }
    out.push(pool[pickIndex].type);
    pool.splice(pickIndex, 1);
  }
  return out;
}

function buildShopStockEntry(type, depth) {
  const amount = type === "potion" ? randomPotionStockAmount(Math.random) : 1;
  return { type, price: shopBuyPrice(type, depth), amount };
}

function ensureShopState(state) {
  if (state.shop) return;
  const now = Date.now();
  const depth = shopProgressScore(state);
  const { total } = targetShopCountsForLevel(state.player.level);
  const gearTypes = buildShopGearTypesForLevel(state.player.level, Math.random);
  const types = ["potion", ...gearTypes].slice(0, total);
  state.shop = {
    stock: types.map((type) => buildShopStockEntry(type, depth)),
    lastRefreshMs: now,
    nextRefreshMs: now + shopRefreshIntervalMsForLevel(state.player.level),
  };
  ensurePotionStockEntry(state.shop.stock, depth, Math.random);
}

function refreshShopStock(state, force = false) {
  ensureShopState(state);
  const now = Date.now();
  if (!force && now < (state.shop?.nextRefreshMs ?? 0)) return false;

  const depth = shopProgressScore(state);
  const { total } = targetShopCountsForLevel(state.player.level);
  const gearTypes = buildShopGearTypesForLevel(state.player.level, Math.random);
  const nextTypes = ["potion", ...gearTypes].slice(0, total);
  state.shop.stock = nextTypes.map((type) => buildShopStockEntry(type, depth));
  ensurePotionStockEntry(state.shop.stock, depth, Math.random);
  state.shop.lastRefreshMs = now;
  state.shop.nextRefreshMs = now + shopRefreshIntervalMsForLevel(state.player.level);
  return true;
}

function isShopOverlayOpen() {
  return !!shopUi.open && !!shopOverlayEl?.classList.contains("show");
}

function formatMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function getSellableInventory(state) {
  return state.inv
    .map((entry, idx) => ({
      idx,
      type: entry.type,
      amount: entry.amount ?? 1,
      price: shopSellPrice(entry.type),
    }))
    .filter((entry) =>
      entry.type === "potion" ||
      entry.type.startsWith("weapon_") ||
      entry.type.startsWith("armor_")
    );
}

function closeShopOverlay() {
  shopUi.open = false;
  if (!shopOverlayEl) return;
  shopOverlayEl.classList.remove("show");
  shopOverlayEl.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function updateShopOverlayMeta(state) {
  if (!shopUi.open) return;
  const now = Date.now();
  if (shopGoldEl) shopGoldEl.textContent = `Gold: ${state.player.gold}`;
  if (shopRefreshEl) {
    const remaining = (state.shop?.nextRefreshMs ?? now) - now;
    shopRefreshEl.textContent = `Refresh in ${formatMs(remaining)}`;
  }
}

function openShopOverlay(state, mode = "buy") {
  if (!shopOverlayEl) return false;
  closeMobilePanels();
  setDebugMenuOpen(false);
  closeSaveGameOverlay();
  closeInfoOverlay();
  closeSpriteEditorOverlay();
  closeMonsterEditorOverlay();
  if (isNewDungeonConfirmOpen()) resolveNewDungeonConfirm(false);
  ensureShopState(state);
  refreshShopStock(state, false);
  shopUi.open = true;
  shopUi.mode = mode === "sell" ? "sell" : "buy";
  if (shopUi.selectedBuy < 0) shopUi.selectedBuy = 0;
  if (shopUi.selectedSell < 0) shopUi.selectedSell = 0;
  shopOverlayEl.classList.add("show");
  shopOverlayEl.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
  renderShopOverlay(state);
  return true;
}

function renderShopOverlay(state) {
  if (!shopUi.open || !shopOverlayEl || !shopListEl) return;

  const stock = state.shop?.stock ?? [];
  const sellable = getSellableInventory(state);
  const isBuyMode = shopUi.mode === "buy";
  const entries = isBuyMode ? stock : sellable;

  if (isBuyMode) shopUi.selectedBuy = clamp(shopUi.selectedBuy, 0, Math.max(0, entries.length - 1));
  else shopUi.selectedSell = clamp(shopUi.selectedSell, 0, Math.max(0, entries.length - 1));
  const selectedIdx = isBuyMode ? shopUi.selectedBuy : shopUi.selectedSell;
  const selected = entries[selectedIdx] ?? null;

  shopTabBuyEl?.classList.toggle("active", isBuyMode);
  shopTabSellEl?.classList.toggle("active", !isBuyMode);
  if (shopkeeperBuyPortraitWrapEl) {
    shopkeeperBuyPortraitWrapEl.style.display = isBuyMode ? "flex" : "none";
    shopkeeperBuyPortraitWrapEl.setAttribute("aria-hidden", isBuyMode ? "false" : "true");
  }
  updateShopOverlayMeta(state);

  const renderShopItemPreview = (type) => {
    if (!shopDetailPreviewEl) return;
    shopDetailPreviewEl.innerHTML = "";
    const appendGlyphPreview = (glyphInfo = { g: "?", c: "#d5dfef" }) => {
      const glyph = document.createElement("span");
      glyph.className = "shopDetailPreviewGlyph";
      glyph.textContent = glyphInfo.g ?? "?";
      glyph.style.color = glyphInfo.c ?? "#d5dfef";
      shopDetailPreviewEl.appendChild(glyph);
    };
    if (!type) {
      appendGlyphPreview({ g: "?", c: "#9fb2cf" });
      return;
    }
    const spriteId = SPRITE_SOURCES[type] ? type : null;
    const spriteImg = spriteId ? getSpriteIfReady(spriteId) : null;
    const spriteSrc = spriteImg?.src ?? (spriteId ? SPRITE_SOURCES[spriteId] : null);
    if (spriteSrc) {
      const img = document.createElement("img");
      img.src = spriteSrc;
      img.alt = `${ITEM_TYPES[type]?.name ?? type} preview`;
      img.addEventListener("error", () => {
        if (!shopDetailPreviewEl || !shopDetailPreviewEl.contains(img)) return;
        img.remove();
        appendGlyphPreview(itemGlyph(type) ?? { g: "?", c: "#d5dfef" });
      });
      shopDetailPreviewEl.appendChild(img);
      return;
    }
    appendGlyphPreview(itemGlyph(type) ?? { g: "?", c: "#d5dfef" });
  };

  shopListEl.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = isBuyMode ? "(no stock available)" : "(nothing sellable in inventory)";
    shopListEl.appendChild(empty);
  } else {
    entries.forEach((entry, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `shopItemBtn${idx === selectedIdx ? " active" : ""}`;
      const nm = ITEM_TYPES[entry.type]?.name ?? entry.type;
      if (isBuyMode) btn.textContent = `${idx + 1}. ${nm} x${Math.max(1, entry.amount ?? 1)} - ${entry.price}g`;
      else btn.textContent = `${idx + 1}. ${nm} x${entry.amount} - ${entry.price}g`;
      btn.addEventListener("click", () => {
        if (isBuyMode) shopUi.selectedBuy = idx;
        else shopUi.selectedSell = idx;
        renderShopOverlay(state);
      });
      shopListEl.appendChild(btn);
    });
  }

  if (!selected) {
    renderShopItemPreview(null);
    if (shopDetailTitleEl) shopDetailTitleEl.textContent = "Select an item";
    if (shopDetailBodyEl) shopDetailBodyEl.textContent = "Tap an item to view details.";
    if (shopActionBtnEl) {
      shopActionBtnEl.textContent = isBuyMode ? "Buy" : "Sell";
      shopActionBtnEl.disabled = true;
      shopActionBtnEl.onclick = null;
    }
    return;
  }

  const selectedName = ITEM_TYPES[selected.type]?.name ?? selected.type;
  renderShopItemPreview(selected.type);
  const atk = WEAPONS[selected.type]?.atkBonus ?? 0;
  const def = ARMOR_PIECES[selected.type]?.defBonus ?? 0;
  const weaponProfile = selected.type?.startsWith("weapon_") ? weaponAttackProfileForType(selected.type) : null;
  const details = [];
  if (atk > 0) details.push(`ATK Bonus: +${atk}`);
  if (def > 0) details.push(`DEF Bonus: +${def}`);
  if (weaponProfile) {
    if ((weaponProfile.kind ?? "melee") === "ranged") {
      details.push(`Range: ${Math.max(1, Math.floor(weaponProfile.minRange ?? 1))}-${Math.max(1, Math.floor(weaponProfile.range ?? 1))}`);
      details.push(`Targeting: ${weaponProfile.requiresLOS ? "LoS required" : "No LoS requirement"}`);
      if (weaponProfile.cannotFireAdjacent) details.push("Cannot fire while adjacent to enemies");
      const closePenaltyPct = Math.round(clamp(1 - Number(weaponProfile.closeRangeDamageMult ?? 1), 0, 0.95) * 100);
      if (closePenaltyPct > 0) details.push(`Adjacency damage penalty: -${closePenaltyPct}%`);
      const maxFalloffPct = Math.round(clamp(Number(weaponProfile.maxRangeFalloffPct ?? 0), 0, 0.95) * 100);
      if (maxFalloffPct > 0) details.push(`Max-range damage falloff: up to -${maxFalloffPct}%`);
    } else {
      details.push("Type: Melee");
    }
  }
  if (!atk && !def && selected.type === "potion") details.push("Consumable healing item.");
  if (!atk && !def && selected.type !== "potion") details.push("Utility item.");
  if (isBuyMode) details.push(`Stock: ${Math.max(1, selected.amount ?? 1)}`);
  if (!isBuyMode) details.push(`Inventory: ${selected.amount}`);
  details.push(`Value: ${itemMarketValue(selected.type)}g`);

  if (shopDetailTitleEl) shopDetailTitleEl.textContent = selectedName;
  if (shopDetailBodyEl) {
    const freeShopping = !!stateDebug(state).freeShopping;
    const actionLine = isBuyMode
      ? (freeShopping ? "Buy price: FREE" : `Buy price: ${selected.price}g`)
      : `Sell price: ${selected.price}g`;
    shopDetailBodyEl.textContent = `${details.join("\n")}\n${actionLine}`;
  }
  if (!shopActionBtnEl) return;
  shopActionBtnEl.textContent = isBuyMode ? "Buy Selected" : "Sell One";
  shopActionBtnEl.disabled = !selected || (!isBuyMode && selected.amount <= 0);
  shopActionBtnEl.onclick = () => {
    const currentStock = state.shop?.stock ?? [];
    const currentSellable = getSellableInventory(state);
    const liveIsBuyMode = shopUi.mode === "buy";
    const liveEntries = liveIsBuyMode ? currentStock : currentSellable;
    const liveIndex = liveIsBuyMode ? shopUi.selectedBuy : shopUi.selectedSell;
    const liveSelected = liveEntries[liveIndex] ?? null;
    if (!liveSelected) return;
    const liveSelectedName = ITEM_TYPES[liveSelected.type]?.name ?? liveSelected.type;

    if (liveIsBuyMode) {
      const freeShopping = !!stateDebug(state).freeShopping;
      if (liveSelected.type === "potion") {
        const potionCount = invCount(state, "potion");
        const potionCap = potionCapacityForState(state);
        if (potionCount >= potionCap) {
          pushLog(state, "Potion belt is full (" + potionCount + "/" + potionCap + ").");
          renderShopOverlay(state);
          return;
        }
      }
      if (!freeShopping && state.player.gold < liveSelected.price) {
        pushLog(state, "Not enough gold.");
      } else {
        if (!freeShopping) state.player.gold -= liveSelected.price;
        invAdd(state, liveSelected.type, 1);
        const left = Math.max(0, (liveSelected.amount ?? 1) - 1);
        liveSelected.amount = left;
        if (left <= 0) {
          currentStock.splice(liveIndex, 1);
          if (shopUi.selectedBuy >= currentStock.length) shopUi.selectedBuy = Math.max(0, currentStock.length - 1);
        }
        // Keep potion shelves healthy: refill to a random stock band once they run low.
        ensurePotionStockEntry(currentStock, shopProgressScore(state), Math.random);
        if (freeShopping) pushLog(state, `Bought ${liveSelectedName} for free.`);
        else pushLog(state, `Bought ${liveSelectedName} for ${liveSelected.price} gold.`);
      }
    } else {
      if (!invConsume(state, liveSelected.type, 1)) {
        pushLog(state, "Couldn't complete that sale.");
      } else {
        state.player.gold += liveSelected.price;
        pushLog(state, `Sold ${liveSelectedName} for ${liveSelected.price} gold.`);
      }
    }
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    saveNow(state);
    renderShopOverlay(state);
  };
}

function weightedChoice(rng, entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}
const FALLBACK_MONSTER_SPAWN_RULES_MIN = [
  { id: "rat", minDepth: 0, maxDepth: 4, baseWeight: 6, rampFactor: -0.7 },
  { id: "goblin", minDepth: 0, maxDepth: 10, baseWeight: 5.8, rampFactor: -0.2 },
  { id: "skeleton", minDepth: 0, maxDepth: 14, baseWeight: 4.8, rampFactor: -0.08 },
  { id: "slime_yellow", minDepth: 1, maxDepth: 10, baseWeight: 1.8, rampFactor: 0.06 },
];
const MONSTER_SPAWN_RULES = FALLBACK_MONSTER_SPAWN_RULES_MIN.map((rule) => ({ ...rule }));
const BASE_MONSTER_TYPES = JSON.parse(JSON.stringify(FALLBACK_MONSTERS_MIN));
const BASE_MONSTER_SPAWN_RULES = FALLBACK_MONSTER_SPAWN_RULES_MIN.map((rule) => ({ ...rule }));

function monsterSpawnWeightForDepth(rule, depth) {
  if (!rule || typeof rule !== "object") return 0;
  const minDepth = Math.max(0, Math.floor(rule.minDepth ?? 0));
  const maxDepth = Number.isFinite(rule.maxDepth) ? Math.floor(rule.maxDepth) : Number.POSITIVE_INFINITY;
  if (depth < minDepth || depth > maxDepth) return 0;
  const base = Number(rule.baseWeight ?? 0);
  const ramp = Number(rule.rampFactor ?? 0);
  const raw = base + (depth - minDepth) * ramp;
  return clamp(raw, 0, 12);
}

function monsterTableForDepth(z) {
  const depth = Math.max(0, Math.floor(z ?? 0));
  const weighted = [];
  for (const rule of MONSTER_SPAWN_RULES) {
    const w = monsterSpawnWeightForDepth(rule, depth);
    if (w <= 0) continue;
    weighted.push({ id: rule.id, w: Math.max(1, Math.round(w * 100) / 100) });
  }
  if (weighted.length > 0) return weighted;
  return [{ id: "rat", w: 1 }];
}

function normalizeMonsterEditorId(raw) {
  const id = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,80}$/.test(id)) return null;
  return id;
}

function normalizeMonsterEditorSpec(id, rawSpec = null) {
  const src = (rawSpec && typeof rawSpec === "object") ? rawSpec : {};
  const baseName = String(src.name ?? "").trim() || titleFromId(id);
  const glyphRaw = String(src.glyph ?? "").trim();
  const glyph = glyphRaw ? glyphRaw.slice(0, 2) : (id.slice(0, 1) || "m");
  const aliasOf = normalizeMonsterEditorId(src.aliasOf ?? "");
  const ai = String(src.ai ?? "").trim().slice(0, 40);
  const spec = {
    id,
    name: baseName.slice(0, 80),
    glyph: glyph || "m",
    sizeGrowth: src.sizeGrowth !== false,
    baseHp: clamp(Math.floor(Number(src.baseHp ?? 18) || 18), 1, 250000),
    baseAtk: clamp(Math.floor(Number(src.baseAtk ?? 6) || 6), 1, 250000),
    baseDef: clamp(Math.floor(Number(src.baseDef ?? 1) || 1), 0, 250000),
    baseAcc: clamp(Math.floor(Number(src.baseAcc ?? 70) || 70), 1, 98),
    baseEva: clamp(Math.floor(Number(src.baseEva ?? 8) || 8), 0, 95),
    spd: clamp(Number(src.spd ?? 1) || 1, 0.1, 8),
    xp: clamp(Math.floor(Number(src.xp ?? 3) || 3), 1, 250000),
  };
  if (aliasOf && aliasOf !== id) spec.aliasOf = aliasOf;
  if (ai) spec.ai = ai;

  const optionalInt = [
    "range", "cdTurns", "preferredRange", "blinkRange",
    "poisonOnHitTurns", "poisonOnHitDmg", "slowTurns",
    "summonCooldownTurns", "deathCloudTurns", "deathCloudRadius", "deathCloudDmg",
  ];
  for (const key of optionalInt) {
    if (!Number.isFinite(Number(src[key]))) continue;
    const value = Math.floor(Number(src[key]) || 0);
    if (value > 0) spec[key] = value;
  }

  const optionalPct = [
    "poisonOnHitChance", "slowOnHitChance", "stunOnHitChance",
    "knockbackOnHitChance", "meleeReflectPct",
  ];
  for (const key of optionalPct) {
    if (!Number.isFinite(Number(src[key]))) continue;
    const value = clamp(Number(src[key]) || 0, 0, 0.95);
    if (value > 0) spec[key] = Number(value.toFixed(3));
  }
  if (Number.isFinite(Number(src.backstabDamageMult))) {
    const value = clamp(Number(src.backstabDamageMult) || 0, 0.5, 5);
    if (value > 0) spec.backstabDamageMult = Number(value.toFixed(3));
  }
  if (src.immunePoison) spec.immunePoison = true;

  return spec;
}

function normalizeMonsterSpawnRule(rawRule = null) {
  const src = (rawRule && typeof rawRule === "object") ? rawRule : {};
  const id = normalizeMonsterEditorId(src.id ?? "");
  if (!id) return null;
  const minDepth = clamp(Math.floor(Number(src.minDepth ?? 0) || 0), 0, 5000);
  const maxRaw = src.maxDepth;
  let maxDepth = null;
  if (maxRaw !== null && maxRaw !== "" && Number.isFinite(Number(maxRaw))) {
    maxDepth = clamp(Math.floor(Number(maxRaw) || 0), minDepth, 5000);
  }
  const baseWeight = Number(clamp(Number(src.baseWeight ?? 1) || 1, 0, 20).toFixed(3));
  const rampFactor = Number(clamp(Number(src.rampFactor ?? 0) || 0, -5, 5).toFixed(3));
  return { id, minDepth, maxDepth, baseWeight, rampFactor };
}

function cloneMonsterTypeMapForEditor(source = MONSTER_TYPES) {
  const out = {};
  for (const [idRaw, specRaw] of Object.entries(source ?? {})) {
    const id = normalizeMonsterEditorId(idRaw);
    if (!id) continue;
    out[id] = normalizeMonsterEditorSpec(id, specRaw);
  }
  return out;
}

function cloneMonsterSpawnRulesForEditor(source = MONSTER_SPAWN_RULES) {
  const out = [];
  for (const ruleRaw of source ?? []) {
    const rule = normalizeMonsterSpawnRule(ruleRaw);
    if (!rule) continue;
    out.push(rule);
  }
  out.sort((a, b) => (a.minDepth - b.minDepth) || a.id.localeCompare(b.id));
  return out;
}

function normalizeMonsterEditorPayload(payload) {
  const src = (payload && typeof payload === "object") ? payload : {};
  const versionRaw = Number(src.version ?? 1);
  const version = Number.isFinite(versionRaw) ? clamp(Math.floor(versionRaw), 1, 1000) : 1;
  const monstersOut = {};
  const monstersRaw = src.monsters;
  if (Array.isArray(monstersRaw)) {
    for (const entry of monstersRaw) {
      if (!entry || typeof entry !== "object") continue;
      const id = normalizeMonsterEditorId(entry.id ?? "");
      if (!id) continue;
      monstersOut[id] = normalizeMonsterEditorSpec(id, entry);
    }
  } else if (monstersRaw && typeof monstersRaw === "object") {
    for (const [idRaw, specRaw] of Object.entries(monstersRaw)) {
      const id = normalizeMonsterEditorId(idRaw);
      if (!id) continue;
      monstersOut[id] = normalizeMonsterEditorSpec(id, specRaw);
    }
  }
  const spawnRulesOut = [];
  const spawnRulesRaw = Array.isArray(src.spawn_rules) ? src.spawn_rules : [];
  for (const ruleRaw of spawnRulesRaw) {
    const rule = normalizeMonsterSpawnRule(ruleRaw);
    if (!rule) continue;
    if (!monstersOut[rule.id]) continue;
    spawnRulesOut.push(rule);
  }
  spawnRulesOut.sort((a, b) => (a.minDepth - b.minDepth) || a.id.localeCompare(b.id));
  return {
    version,
    monsters: monstersOut,
    spawnRules: spawnRulesOut,
    updatedAt: String(src.updated_at ?? "").trim(),
  };
}

function replaceMonsterRuntimeConfig(monsters = {}, spawnRules = []) {
  const monsterMap = (monsters && Object.keys(monsters).length > 0)
    ? monsters
    : BASE_MONSTER_TYPES;
  const rulesList = (Array.isArray(spawnRules) && spawnRules.length > 0)
    ? spawnRules
    : BASE_MONSTER_SPAWN_RULES;

  for (const key of Object.keys(MONSTER_TYPES)) {
    delete MONSTER_TYPES[key];
  }
  for (const [idRaw, rawSpec] of Object.entries(monsterMap)) {
    const id = normalizeMonsterEditorId(idRaw);
    if (!id) continue;
    MONSTER_TYPES[id] = normalizeMonsterEditorSpec(id, rawSpec);
  }
  if (!MONSTER_TYPES.rat) {
    MONSTER_TYPES.rat = normalizeMonsterEditorSpec("rat", BASE_MONSTER_TYPES.rat ?? { id: "rat", name: "Rat", glyph: "r", baseHp: 18, baseAtk: 6, baseDef: 1, baseAcc: 70, baseEva: 18, spd: 1.25, xp: 3, sizeGrowth: true });
  }

  MONSTER_SPAWN_RULES.length = 0;
  for (const rawRule of rulesList) {
    const rule = normalizeMonsterSpawnRule(rawRule);
    if (!rule) continue;
    if (!MONSTER_TYPES[rule.id]) continue;
    MONSTER_SPAWN_RULES.push(rule);
  }
  if (!MONSTER_SPAWN_RULES.length) {
    for (const fallbackRule of BASE_MONSTER_SPAWN_RULES) {
      MONSTER_SPAWN_RULES.push({ ...fallbackRule });
    }
  }

  spriteEditorUi.objects = buildSpriteObjectCatalog();
  updateSpriteEditorFilterControls();
  if (isSpriteEditorOverlayOpen()) renderSpriteEditorList();
}

function applyMonsterEditorPayload(payload, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const normalized = normalizeMonsterEditorPayload(payload);
  monsterEditorState.version = normalized.version;
  monsterEditorState.monsters = normalized.monsters;
  monsterEditorState.spawnRules = normalized.spawnRules;
  monsterEditorState.updatedAt = normalized.updatedAt;
  if (!opts.skipRuntimeApply) {
    replaceMonsterRuntimeConfig(normalized.monsters, normalized.spawnRules);
  }
  monsterEditorSignature = "";
  return normalized;
}

function keyWeightsForDepth(z) {
  const d = Math.max(0, z | 0);
  if (d <= 1) return [
    { id: KEY_GREEN, w: 70 },
    { id: KEY_YELLOW, w: 18 },
    { id: KEY_ORANGE, w: 8 },
    { id: KEY_RED, w: 3 },
    { id: KEY_VIOLET, w: 1 },
    { id: KEY_INDIGO, w: 1 },
  ];
  if (d <= 4) return [
    { id: KEY_GREEN, w: 48 },
    { id: KEY_YELLOW, w: 28 },
    { id: KEY_ORANGE, w: 14 },
    { id: KEY_RED, w: 7 },
    { id: KEY_VIOLET, w: 2 },
    { id: KEY_INDIGO, w: 1 },
  ];
  if (d <= 10) return [
    { id: KEY_GREEN, w: 28 },
    { id: KEY_YELLOW, w: 26 },
    { id: KEY_ORANGE, w: 22 },
    { id: KEY_RED, w: 15 },
    { id: KEY_VIOLET, w: 7 },
    { id: KEY_INDIGO, w: 2 },
  ];
  if (d <= 20) return [
    { id: KEY_GREEN, w: 16 },
    { id: KEY_YELLOW, w: 20 },
    { id: KEY_ORANGE, w: 22 },
    { id: KEY_RED, w: 22 },
    { id: KEY_VIOLET, w: 14 },
    { id: KEY_INDIGO, w: 6 },
  ];
  return [
    { id: KEY_GREEN, w: 10 },
    { id: KEY_YELLOW, w: 14 },
    { id: KEY_ORANGE, w: 18 },
    { id: KEY_RED, w: 24 },
    { id: KEY_VIOLET, w: 20 },
    { id: KEY_INDIGO, w: 14 },
  ];
}

function keyTypeForDepth(z, rng = Math.random) {
  return weightedChoice(rng, keyWeightsForDepth(z));
}

function keyRarityFactor(keyType) {
  if (keyType === KEY_GREEN) return 1.0;
  if (keyType === KEY_YELLOW) return 0.84;
  if (keyType === KEY_ORANGE) return 0.66;
  if (keyType === KEY_RED) return 0.52;
  if (keyType === KEY_VIOLET) return 0.34;
  if (keyType === KEY_INDIGO) return 0.22;
  if (keyType === KEY_BLUE) return 0.22;
  if (keyType === KEY_PURPLE) return 0.34;
  if (keyType === KEY_MAGENTA) return 0.22;
  return 0.5;
}

function samplePassableCellsInChunk(grid, rng, count) {
  const passable = (t) => t === FLOOR || isOpenDoorTile(t) || t === DOOR_CLOSED || t === STAIRS_DOWN || t === STAIRS_UP;
  const cells = [];
  for (let y = 2; y < CHUNK - 2; y++)
    for (let x = 2; x < CHUNK - 2; x++)
      if (passable(grid[y][x])) cells.push({ x, y });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, Math.min(count, cells.length));
}

function chunkBaseSpawns(worldSeed, chunk) {
  const { z, cx, cy, grid, specials, lockedDoorRewards = [] } = chunk;
  if (z === SURFACE_LEVEL || chunk.surface) return { monsters: [], items: [], traps: [] };
  const rng = makeRng(`${worldSeed}|spawns|z${z}|${cx},${cy}`);
  const isOpenCell = (x, y) => {
    const t = grid[y]?.[x];
    return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
  };
  const occupiedItemCells = new Set();
  const occupiedMonsterCells = new Set();
  const cellKey = (x, y) => `${x},${y}`;

  const depthBoost = clamp(z, 0, 60);

  const monsterCount = clamp(
    randInt(rng, 2, 5) + (rng() < depthBoost / 50 ? 1 : 0) + (rng() < 0.38 ? 1 : 0),
    0,
    10
  );

  // Higher baseline item density for a richer dungeon.
  const itemCount = clamp(randInt(rng, 2, 6) + (rng() < 0.30 ? 1 : 0), 0, 9);
  const trapCount = clamp(
    randInt(rng, 0, 1) +
      (rng() < clamp(0.18 + z * 0.012, 0.18, 0.46) ? 1 : 0) +
      (rng() < clamp((z - 6) * 0.01, 0, 0.22) ? 1 : 0),
    0,
    3
  );

  const cells = samplePassableCellsInChunk(grid, rng, monsterCount + itemCount + trapCount + 24);
  const monsters = [];
  const mTable = monsterTableForDepth(z);

  for (let i = 0; i < monsterCount; i++) {
    const c = cells[i];
    if (!c) break;
    const type = weightedChoice(rng, mTable);
    const id = `m|${z}|${cx},${cy}|${i}`;
    monsters.push({ id, type, lx: c.x, ly: c.y });
    occupiedMonsterCells.add(cellKey(c.x, c.y));
  }

  const items = [];
  const pushItem = (item) => {
    items.push(item);
    occupiedItemCells.add(cellKey(item.lx, item.ly));
  };
  const findOpenCellNear = (ox, oy, maxR) => {
    for (let attempt = 0; attempt < 36; attempt++) {
      const dx = randInt(rng, -maxR, maxR);
      const dy = randInt(rng, -maxR, maxR);
      const x = clamp(ox + dx, 1, CHUNK - 2);
      const y = clamp(oy + dy, 1, CHUNK - 2);
      if (x === ox && y === oy) continue;
      if (!isOpenCell(x, y)) continue;
      if (occupiedItemCells.has(cellKey(x, y))) continue;
      return { x, y };
    }
    for (let y = Math.max(1, oy - maxR); y <= Math.min(CHUNK - 2, oy + maxR); y++) {
      for (let x = Math.max(1, ox - maxR); x <= Math.min(CHUNK - 2, ox + maxR); x++) {
        if (x === ox && y === oy) continue;
        if (!isOpenCell(x, y)) continue;
        if (occupiedItemCells.has(cellKey(x, y))) continue;
        return { x, y };
      }
    }
    return null;
  };

  // Reward chests beyond generated locked chokepoint doors.
  for (let i = 0; i < lockedDoorRewards.length; i++) {
    const reward = lockedDoorRewards[i];
    const cxr = clamp(reward.chestX ?? 0, 1, CHUNK - 2);
    const cyr = clamp(reward.chestY ?? 0, 1, CHUNK - 2);
    if (isOpenCell(cxr, cyr) && !occupiedItemCells.has(cellKey(cxr, cyr))) {
      const rewardKeyType = reward.keyType ?? keyTypeForDepth(z, rng);
      pushItem({
        id: `chest_lock_reward|${z}|${cx},${cy}|${i}`,
        type: "chest",
        amount: 1,
        lx: cxr,
        ly: cyr,
        locked: true,
        keyType: rewardKeyType,
        rewardChest: true,
        lootDepth: Math.max(z + 1, Math.floor(reward.lootDepth ?? (z + 2))),
        lockKeyType: rewardKeyType,
      });
    }

    const keyType = reward.keyType ?? keyTypeForDepth(z, rng);
    const keyChance = clamp(0.20 * keyRarityFactor(keyType) + 0.12, 0.10, 0.32);
    if (rng() < keyChance) {
      const near = findOpenCellNear(cxr, cyr, 10);
      if (near) {
        pushItem({
          id: `key_lock_reward|${z}|${cx},${cy}|${i}`,
          type: keyType,
          amount: 1,
          lx: near.x,
          ly: near.y,
        });
      }
    }
  }

  for (let i = 0; i < itemCount; i++) {
    const c = cells[monsterCount + i];
    if (!c) break;
    const roll = rng();
    // Potions are common; equipment appears regularly; keys are occasional.
    const equipmentType = rng() < 0.6 ? weaponForDepth(z, rng) : armorForDepth(z, rng);
    const type = roll < 0.45 ? "potion" : roll < 0.66 ? "gold" : roll < 0.94 ? equipmentType : keyTypeForDepth(z, rng);
    const id = `i|${z}|${cx},${cy}|${i}`;
    const amount = type === "gold" ? randInt(rng, 4, 22) + clamp(z, 0, 30) : 1;
    // Small chance this item is actually a chest (locked or unlocked)
    if (rng() < 0.24) {
      const locked = rng() < 0.6;
      let keyType = null;
      let chestLootDepth = Math.max(z, z + randInt(rng, 0, 2));
      if (locked) {
        // choose a key type for this locked chest
        keyType = keyTypeForDepth(z, rng);
        chestLootDepth = Math.max(z + 1, z + randInt(rng, 1, 4));
        // Place chest key only on open, reachable tiles.
        const near = findOpenCellNear(c.x, c.y, CHUNK);
        if (near) {
          pushItem({ id: `key_near_inline|${z}|${cx},${cy}|${i}`, type: keyType, amount: 1, lx: near.x, ly: near.y });
        }
      }
      // push the chest as a chest entity but include locked/keyType metadata
      pushItem({ id: `chest_inline|${z}|${cx},${cy}|${i}`, type: "chest", amount: 1, lx: c.x, ly: c.y, locked: locked, keyType, lootDepth: chestLootDepth });
    } else {
      let lx = c.x;
      let ly = c.y;
      if (type.startsWith("key_") && !isOpenCell(lx, ly)) {
        const near = findOpenCellNear(c.x, c.y, CHUNK);
        if (!near) continue;
        lx = near.x;
        ly = near.y;
      }
      pushItem({ id, type, amount, lx, ly });
    }
  }

  // bump chance for extra chests (more frequent, scales with depth)
  if (rng() < clamp(0.50 + z * 0.02, 0.50, 0.78)) {
    const c = cells[monsterCount + itemCount] ?? cells[cells.length - 1];
    if (c) {
      const extraLocked = rng() < clamp(0.14 + z * 0.02, 0.14, 0.62);
      const extraKeyType = extraLocked ? keyTypeForDepth(z, rng) : null;
      const extraLootDepth = Math.max(z + (extraLocked ? 1 : 0), z + randInt(rng, extraLocked ? 1 : 0, extraLocked ? 4 : 2));
      pushItem({
        id: `chest_extra|${z}|${cx},${cy}`,
        type: "chest",
        amount: 1,
        lx: c.x,
        ly: c.y,
        locked: extraLocked,
        keyType: extraKeyType,
        lootDepth: extraLootDepth,
      });
    }
  }

  if (specials?.treasure) {
    pushItem({
      id: `chest|${z}|${cx},${cy}`,
      type: "chest",
      amount: 1,
      lx: specials.treasure.lx,
      ly: specials.treasure.ly,
      lootDepth: Math.max(z + 2, z + randInt(rng, 2, 6)),
    });
  }
  if (specials?.shrine) {
    pushItem({
      id: `shrine|${z}|${cx},${cy}`,
      type: "shrine",
      amount: 1,
      lx: specials.shrine.lx,
      ly: specials.shrine.ly,
    });
  }

  const traps = [];
  const trapCellUsed = new Set();
  const isTrapCellCandidate = (x, y) => {
    const t = grid[y]?.[x];
    if (t !== FLOOR) return false;
    const ck = cellKey(x, y);
    if (occupiedItemCells.has(ck)) return false;
    if (occupiedMonsterCells.has(ck)) return false;
    if (trapCellUsed.has(ck)) return false;
    return true;
  };
  const trapStartIdx = monsterCount + itemCount + 4;
  for (let i = 0; i < trapCount; i++) {
    let c = cells[trapStartIdx + i];
    if (!c || !isTrapCellCandidate(c.x, c.y)) {
      c = null;
      for (let attempts = 0; attempts < 48; attempts++) {
        const x = randInt(rng, 1, CHUNK - 2);
        const y = randInt(rng, 1, CHUNK - 2);
        if (!isTrapCellCandidate(x, y)) continue;
        c = { x, y };
        break;
      }
    }
    if (!c) continue;
    const ck = cellKey(c.x, c.y);
    trapCellUsed.add(ck);
    traps.push({
      id: `t|${z}|${cx},${cy}|${i}`,
      type: TRAP_TYPE_PRESSURE,
      depth: z,
      lx: c.x,
      ly: c.y,
    });
  }

  return { monsters, items, traps };
}

// ---------- Game state ----------
function randomSeedString() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const r = makeRng(`seedmaker|${Date.now()}|${Math.random()}`);
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
}

function randomCharacterId() {
  const r = makeRng(`character|${Date.now()}|${Math.random()}`);
  const alpha = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alpha[Math.floor(r() * alpha.length)];
  return `char_${out}`;
}

function normalizeCharacterProfile(profile = null) {
  const nowIso = new Date().toISOString();
  const src = (profile && typeof profile === "object") ? profile : {};
  const rawId = String(src.id ?? "").trim().toLowerCase();
  const id = /^[a-z0-9_]{4,48}$/.test(rawId) ? rawId : randomCharacterId();
  const rawName = String(src.name ?? DEFAULT_CHARACTER_NAME).trim();
  const name = rawName ? rawName.slice(0, 40) : DEFAULT_CHARACTER_NAME;
  const speciesId = normalizeCharacterSpeciesId(src.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID);
  const classId = normalizeCharacterClassId(
    src.classId ?? defaultClassIdForSpecies(speciesId),
    speciesId
  );
  const statsInput = src.stats ?? {
    vit: src.stat_vit ?? src.statVit,
    str: src.stat_str ?? src.statStr,
    dex: src.stat_dex ?? src.statDex,
    int: src.stat_int ?? src.statInt,
    agi: src.stat_agi ?? src.statAgi,
  };
  const stats = normalizeCharacterStats(statsInput, speciesId);
  const unspentStatPoints = Math.max(
    0,
    Math.floor(
      Number(
        src.unspentStatPoints ??
        src.unspent_stat_points ??
        src.unspentPoints ??
        0
      ) || 0
    )
  );
  const deepestDepth = Math.max(0, Math.floor(Number(src.deepestDepth ?? src.deepest_depth ?? 0) || 0));
  const isDead = !!src.isDead;
  const createdAt = (typeof src.createdAt === "string" && src.createdAt.trim()) ? src.createdAt : nowIso;
  const updatedAt = (typeof src.updatedAt === "string" && src.updatedAt.trim()) ? src.updatedAt : nowIso;
  return { id, name, classId, speciesId, stats, unspentStatPoints, deepestDepth, isDead, createdAt, updatedAt };
}

function ensureCharacterState(state) {
  if (!state || typeof state !== "object") return null;
  const existing = normalizeCharacterProfile(state.character ?? null);
  state.character = existing;
  if (state.player && typeof state.player === "object") {
    state.player.classId = existing.classId;
    state.player.speciesId = existing.speciesId;
  }
  return existing;
}

function touchCharacterProgress(state) {
  const profile = ensureCharacterState(state);
  if (!profile || !state?.player) return profile;
  const depth = Math.max(0, Math.floor(state.player.z ?? 0));
  if (depth > (profile.deepestDepth ?? 0)) profile.deepestDepth = depth;
  profile.updatedAt = new Date().toISOString();
  return profile;
}

function buildCharacterCarryoverSnapshot(state) {
  const profile = touchCharacterProgress(state);
  if (!profile || !state?.player) return null;
  const p = state.player;
  return {
    character: profile,
    level: Math.max(1, Math.floor(p.level ?? 1)),
    xp: Math.max(0, Math.floor(p.xp ?? 0)),
    gold: Math.max(0, Math.floor(p.gold ?? 0)),
    inv: normalizeInventoryEntries(state.inv ?? []),
    equip: normalizeEquip(p.equip ?? {}),
    maxHp: Math.max(1, Math.floor(p.maxHp ?? maxHpForLevel(Math.max(1, Math.floor(p.level ?? 1)), profile))),
  };
}

function pushLog(state, msg) {
  state.log.push(msg);
  if (state.log.length > 160) state.log.shift();
  renderLog(state);
}
function renderLog(state) {
  const last = state.log.slice(-55);
  logEl.textContent = last.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
  if (logTickerEl) {
    const latest = last[last.length - 1] ?? "(no messages)";
    logTickerEl.textContent = latest;
    logTickerEl.title = latest;
  }
}

function updateDeathOverlay(state) {
  if (!deathOverlayEl) return;
  const show = !!state?.player?.dead;
  if (show) closeMobilePanels();
  deathOverlayEl.classList.toggle("show", show);
  deathOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
}

function isNewDungeonConfirmOpen() {
  return !!newDungeonConfirmOverlayEl?.classList.contains("show");
}

function setNewDungeonConfirmOpen(open) {
  if (!newDungeonConfirmOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
    closeShopOverlay();
    closeSaveGameOverlay();
    closeInfoOverlay();
    closeSpriteEditorOverlay();
    closeMonsterEditorOverlay();
  }
  newDungeonConfirmOverlayEl.classList.toggle("show", show);
  newDungeonConfirmOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) newDungeonConfirmStartEl?.focus();
}

function buildNewDungeonResetSummary(state) {
  const character = ensureCharacterState(state);
  const p = state?.player ?? {};
  const level = Math.max(1, Math.floor(p.level ?? 1));
  const xp = Math.max(0, Math.floor(p.xp ?? 0));
  const xpNeeded = Math.max(1, Math.floor(xpToNext(level)));
  const inv = Array.isArray(state?.inv) ? state.inv : [];
  let invTotal = 0;
  for (const entry of inv) {
    const count = Math.max(1, Math.floor(entry?.amount ?? entry?.count ?? 1));
    invTotal += count;
  }
  const equippedCount = ["weapon", "head", "chest", "legs"]
    .map((slot) => p?.equip?.[slot])
    .filter((it) => !!it)
    .length;
  const depth = Math.trunc(p.z ?? 0);
  const depthLabel = depth === SURFACE_LEVEL ? "Surface" : `Depth ${depth}`;
  const exploredChunks = state?.exploredChunks?.size ?? 0;
  const seenTiles = state?.seen?.size ?? 0;
  const turn = Math.max(0, Math.floor(state?.turn ?? 0));

  return (
    `Character: ${character?.name ?? DEFAULT_CHARACTER_NAME} (${character?.classId ?? DEFAULT_CHARACTER_CLASS_ID}/${character?.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID})\n` +
    `Bound progression kept: Level ${level} (${xp}/${xpNeeded} XP), Gold ${Math.max(0, Math.floor(p.gold ?? 0))}\n` +
    `Bound equipment/inventory kept: ${inv.length} stacks (${invTotal} total), ${equippedCount} equipped\n` +
    `Run progress reset: ${depthLabel}, ${exploredChunks} explored chunks, ${seenTiles} discovered tiles, turn ${turn}\n\n` +
    "Starting a new dungeon keeps character progression and starts a fresh map."
  );
}

function resolveNewDungeonConfirm(confirmed) {
  const resolver = newDungeonConfirmResolver;
  newDungeonConfirmResolver = null;
  setNewDungeonConfirmOpen(false);
  if (resolver) resolver(!!confirmed);
}

function openNewDungeonConfirm(state) {
  if (newDungeonConfirmResolver) return Promise.resolve(false);
  const summary = buildNewDungeonResetSummary(state);
  if (!newDungeonConfirmOverlayEl || !newDungeonConfirmSummaryEl) {
    return Promise.resolve(confirm(`Start a NEW DUNGEON?\n\n${summary}`));
  }
  newDungeonConfirmSummaryEl.textContent = summary;
  setNewDungeonConfirmOpen(true);
  return new Promise((resolve) => {
    newDungeonConfirmResolver = resolve;
  });
}

async function requestNewDungeonReset(state) {
  const run = state ?? game;
  if (!run || newDungeonResetPending) return false;
  newDungeonResetPending = true;
  try {
    const confirmed = await openNewDungeonConfirm(run);
    if (!confirmed) return false;
    const carryover = buildCharacterCarryoverSnapshot(run);
    const priorDebug = normalizeDebugFlags(run.debug);
    closeShopOverlay();
    closeSaveGameOverlay();
    closeInfoOverlay();
    closeSpriteEditorOverlay();
    closeMonsterEditorOverlay();
    game = makeNewGame(randomSeedString(), { carryover });
    game.debug = priorDebug;
    enforceAdminControlPolicy(game);
    updateDebugMenuUi(game);
    setDebugMenuOpen(false);
    updateContextActionButton(game);
    updateDeathOverlay(game);
    refreshSaveNameFromLive(true);
    saveNow(game);
    markCharacterStateDirty(game, "new-dungeon");
    void syncCharacterStateIfDirty("new-dungeon");
    return true;
  } finally {
    newDungeonResetPending = false;
  }
}

function isSaveGameOverlayOpen() {
  return !!saveGameOverlayEl?.classList.contains("show");
}

function setSaveGameStatus(message, isError = false) {
  if (!saveGameStatusEl) return;
  saveGameStatusEl.textContent = message ?? "";
  saveGameStatusEl.style.color = isError ? "#ff9aa8" : "#b8c6df";
}

function formatSaveTimestamp(value) {
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return value || "";
  return dt.toLocaleString();
}

function defaultServerSaveNameForState(state, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const autosave = opts.autosave === true;
  const character = ensureCharacterState(state);
  const level = Math.max(1, Math.floor(state?.player?.level ?? 1));
  const depth = Math.trunc(state?.player?.z ?? 0);
  const now = new Date();
  const two = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
  const charName = (character?.name ?? DEFAULT_CHARACTER_NAME).slice(0, 20);
  const base = `${charName} Lvl ${level}, Depth ${depth}, ${stamp}`;
  return (autosave ? `Autosave - ${base}` : base).slice(0, saveNameMaxLen);
}

function refreshSaveNameFromLive(force = false) {
  if (!saveGameNameInputEl || !game) return;
  const liveName = defaultServerSaveNameForState(game);
  const current = saveGameNameInputEl.value.trim();
  const shouldReplace =
    force ||
    !saveNameWasEdited ||
    current === "" ||
    current === lastAutoSaveName;
  if (shouldReplace) {
    saveGameNameInputEl.value = liveName;
    saveNameWasEdited = false;
  }
  lastAutoSaveName = liveName;
}

function prepareGuestLoginHandoff(state = null) {
  const run = state ?? game;
  if (run) {
    try { localStorage.setItem(SAVE_KEY, exportSave(run)); } catch {}
  }
  try {
    localStorage.setItem(SAVE_LOGIN_HANDOFF_KEY, String(Date.now()));
  } catch {}
}

function requireSaveLogin() {
  const msg = "Log in with Google to save this current run to your account.";
  if (game) {
    prepareGuestLoginHandoff(game);
    pushLog(game, msg);
  } else {
    prepareGuestLoginHandoff(null);
  }
  if (authBtnEl?.href) {
    window.location.href = authBtnEl.href;
    return;
  }
  alert(msg);
}

function closeSaveGameOverlay() {
  saveMenuUi.open = false;
  if (!saveGameOverlayEl) return;
  saveGameOverlayEl.classList.remove("show");
  saveGameOverlayEl.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function setSaveGameOverlayOpen(open) {
  if (!saveGameOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
    if (isNewDungeonConfirmOpen()) resolveNewDungeonConfirm(false);
    closeShopOverlay();
    closeInfoOverlay();
    closeSpriteEditorOverlay();
    closeMonsterEditorOverlay();
  }
  saveMenuUi.open = show;
  saveGameOverlayEl.classList.toggle("show", show);
  saveGameOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) {
    if (saveMenuUi.mode === "save") saveGameNameInputEl?.focus();
    else saveGameCloseBtnEl?.focus();
  }
}

function localSlotPayloadKey(slotId) {
  return localSlotStore.payloadKey(slotId);
}

function readLocalSlotIndex() {
  return localSlotStore.readIndex();
}

function writeLocalSlotIndex(index) {
  return localSlotStore.writeIndex(index);
}

function readLocalSlotPayload(slotId) {
  return localSlotStore.readPayload(slotId);
}

function upsertLocalSlotSummary(slotId, name = "", updatedAt = "") {
  return localSlotStore.upsertSummary(slotId, name, updatedAt);
}

function removeLocalSlot(slotId) {
  const id = normalizeCharacterSlotId(slotId ?? "");
  if (!id) return false;
  localSlotStore.removePayload(id);
  const idx = readLocalSlotIndex();
  const nextSlots = (idx.slots ?? []).filter((slot) => slot.id !== id);
  const nextActive = (idx.activeId === id) ? (nextSlots[0]?.id ?? "") : idx.activeId;
  const next = writeLocalSlotIndex({ activeId: nextActive, slots: nextSlots });
  characterUi.activeSaveId = next.activeId ?? "";
  return true;
}

function setActiveCharacterSlotId(slotId) {
  const id = normalizeCharacterSlotId(slotId ?? "");
  if (isAuthenticatedUser) {
    characterUi.activeSaveId = id;
    return;
  }
  const idx = readLocalSlotIndex();
  idx.activeId = id;
  writeLocalSlotIndex(idx);
  characterUi.activeSaveId = id;
}

function getActiveCharacterSlotId() {
  if (isAuthenticatedUser) return String(characterUi.activeSaveId ?? "");
  const idx = readLocalSlotIndex();
  if (idx.activeId) return idx.activeId;
  return String(characterUi.activeSaveId ?? "");
}

function ensureLocalSlotMigration() {
  if (isAuthenticatedUser) return;
  let idx = readLocalSlotIndex();
  if (idx.slots.length > 0) {
    if (!idx.activeId) {
      idx.activeId = idx.slots[0]?.id ?? "";
      writeLocalSlotIndex(idx);
    }
    return;
  }
  let legacyPayload = "";
  try {
    legacyPayload = String(localStorage.getItem(SAVE_KEY) ?? "");
  } catch {}
  if (!legacyPayload) return;
  const migrated = importSave(legacyPayload);
  if (!migrated) return;
  const id = `legacy_${Date.now().toString(36)}`;
  const profile = ensureCharacterState(migrated);
  const name = String(profile?.name ?? "Legacy Adventurer").slice(0, saveNameMaxLen) || "Legacy Adventurer";
  try {
    localStorage.setItem(localSlotPayloadKey(id), legacyPayload);
    localStorage.setItem(LOCAL_SLOT_BACKUP_MIGRATED_KEY, legacyPayload);
  } catch {}
  idx = writeLocalSlotIndex({
    activeId: id,
    slots: [{ id, name, updatedAt: new Date().toISOString() }],
  });
  characterUi.activeSaveId = idx.activeId;
}

async function fetchCharacterSlotsFromLocal() {
  ensureLocalSlotMigration();
  const idx = readLocalSlotIndex();
  const out = [];
  for (const slotMeta of idx.slots) {
    const payload = readLocalSlotPayload(slotMeta.id);
    const loaded = payload ? importSave(payload) : null;
    const profile = normalizeCharacterProfile(
      loaded?.character ?? { id: `slot_${slotMeta.id}`, name: slotMeta.name }
    );
    const level = Math.max(1, Math.floor(loaded?.player?.level ?? 1));
    const depth = Math.trunc(loaded?.player?.z ?? 0);
    const deepestDepth = Math.max(0, Math.floor(profile.deepestDepth ?? 0), Math.max(0, depth));
    profile.deepestDepth = deepestDepth;
    out.push({
      id: slotMeta.id,
      name: slotMeta.name,
      updatedAt: slotMeta.updatedAt || "",
      level,
      depth,
      profile,
      deepestDepth,
    });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (!isAuthenticatedUser) characterUi.activeSaveId = idx.activeId || out[0]?.id || "";
  return out;
}

function markSaveDirty(state, reason = "") {
  if (!state) return;
  saveRuntime.dirty = true;
  saveRuntime.dirtyReason = String(reason || "state-change");
  saveRuntime.lastDirtyAt = Date.now();
  markCharacterStateDirty(state, reason || "state-change");
  if (saveRuntime.pendingAutosaveReason) {
    const autoReason = String(saveRuntime.pendingAutosaveReason);
    saveRuntime.pendingAutosaveReason = "";
    void autosaveIfDirty(autoReason);
  }
}

function clearSaveDirty() {
  saveRuntime.dirty = false;
  saveRuntime.dirtyReason = "";
  saveRuntime.lastSaveAt = Date.now();
}

async function saveCurrentGameToLocalSlot(slotId = "", nameOverride = "") {
  if (isAuthenticatedUser || !game) return false;
  const id = normalizeCharacterSlotId(slotId || getActiveCharacterSlotId() || "") || `slot_${Date.now().toString(36)}`;
  const profile = ensureCharacterState(game);
  const className = characterClassDef(profile.classId).name;
  const defaultName = `${profile.name} • ${className}`.slice(0, saveNameMaxLen);
  const name = String(nameOverride || defaultName).trim().slice(0, saveNameMaxLen) || "Local Adventurer";
  const payload = exportSave(game);
  try {
    localStorage.setItem(localSlotPayloadKey(id), payload);
  } catch {
    return false;
  }
  upsertLocalSlotSummary(id, name, new Date().toISOString());
  setActiveCharacterSlotId(id);
  return true;
}

async function autosaveIfDirty(reason = "") {
  if (!game || !saveRuntime.dirty || saveRuntime.saving) return true;
  saveRuntime.saving = true;
  try {
    if (isAuthenticatedUser) {
      const overwriteId = String(saveRuntime.activeRunSaveId ?? "").trim();
      const ok = await saveCurrentGameToServer(overwriteId, { autosave: true });
      if (ok) {
        saveResumeSnapshot(game);
        clearSaveDirty();
      }
      return !!ok;
    }
    saveNow(game);
    return true;
  } finally {
    saveRuntime.saving = false;
  }
}

function exportCharacterSnapshot(state) {
  const src = state && typeof state === "object" ? state : {};
  const p = src.player ?? {};
  const profile = normalizeCharacterProfile(src.character ?? null);
  return {
    character: profile,
    player: {
      level: Math.max(1, Math.floor(p.level ?? 1)),
      xp: Math.max(0, Math.floor(p.xp ?? 0)),
      hp: Math.max(0, Math.floor(p.hp ?? 0)),
      maxHp: Math.max(1, Math.floor(p.maxHp ?? 1)),
      gold: Math.max(0, Math.floor(p.gold ?? 0)),
      inv: normalizeInventoryEntries(src.inv ?? []),
      equip: normalizeEquip(p.equip ?? {}),
      classId: normalizeCharacterClassId(p.classId ?? profile.classId, profile.speciesId),
      speciesId: normalizeCharacterSpeciesId(p.speciesId ?? profile.speciesId),
    },
  };
}

function characterStatePayloadKey(characterId = "") {
  return `${LOCAL_CHARACTER_STATE_PREFIX}${characterId}`;
}

function encodeCharacterSnapshotPayload(snapshot) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(snapshot ?? {}))));
  } catch {
    return "";
  }
}

function decodeCharacterSnapshotPayload(payloadB64 = "") {
  try {
    const json = decodeURIComponent(escape(atob(String(payloadB64 ?? ""))));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resolveCharacterSnapshotFromServerState(characterId = "") {
  if (!isAuthenticatedUser) return null;
  const id = String(characterId ?? "").trim();
  if (!id) return null;
  try {
    const data = await saveApiRequest("GET", null, `character=${encodeURIComponent(id)}`);
    const decoded = decodeCharacterSnapshotPayload(data?.character?.payload ?? "");
    if (!decoded) return null;
    return {
      character: normalizeCharacterProfile(decoded.character ?? null),
      player: {
        level: Math.max(1, Math.floor(decoded?.player?.level ?? 1)),
        xp: Math.max(0, Math.floor(decoded?.player?.xp ?? 0)),
        hp: Math.max(0, Math.floor(decoded?.player?.hp ?? 0)),
        maxHp: Math.max(1, Math.floor(decoded?.player?.maxHp ?? 1)),
        gold: Math.max(0, Math.floor(decoded?.player?.gold ?? 0)),
        inv: normalizeInventoryEntries(decoded?.player?.inv ?? []),
        equip: normalizeEquip(decoded?.player?.equip ?? {}),
        classId: normalizeCharacterClassId(decoded?.player?.classId, decoded?.character?.speciesId),
        speciesId: normalizeCharacterSpeciesId(decoded?.player?.speciesId),
      },
    };
  } catch {
    return null;
  }
}

function resolveCharacterSnapshotFromLocalState(characterId = "") {
  const id = String(characterId ?? "").trim();
  if (!id) return null;
  let raw = "";
  try {
    raw = String(localStorage.getItem(characterStatePayloadKey(id)) ?? "");
  } catch {
    raw = "";
  }
  if (!raw) return null;
  const decoded = decodeCharacterSnapshotPayload(raw);
  if (!decoded) return null;
  return {
    character: normalizeCharacterProfile(decoded.character ?? null),
    player: {
      level: Math.max(1, Math.floor(decoded?.player?.level ?? 1)),
      xp: Math.max(0, Math.floor(decoded?.player?.xp ?? 0)),
      hp: Math.max(0, Math.floor(decoded?.player?.hp ?? 0)),
      maxHp: Math.max(1, Math.floor(decoded?.player?.maxHp ?? 1)),
      gold: Math.max(0, Math.floor(decoded?.player?.gold ?? 0)),
      inv: normalizeInventoryEntries(decoded?.player?.inv ?? []),
      equip: normalizeEquip(decoded?.player?.equip ?? {}),
      classId: normalizeCharacterClassId(decoded?.player?.classId, decoded?.character?.speciesId),
      speciesId: normalizeCharacterSpeciesId(decoded?.player?.speciesId),
    },
  };
}

async function syncCharacterStateIfDirty(reason = "") {
  if (!game || characterSyncRuntime.syncing || !characterSyncRuntime.dirty) return true;
  const profile = ensureCharacterState(game);
  if (!profile?.id) return false;
  characterSyncRuntime.syncing = true;
  try {
    const snapshot = exportCharacterSnapshot(game);
    const payload = encodeCharacterSnapshotPayload(snapshot);
    if (!payload) return false;
    if (isAuthenticatedUser) {
      const activeProfileId = normalizeCharacterProfileIdFromSlotId(getActiveCharacterSlotId());
      const profileId = normalizeCharacterProfileId(profile.id);
      // Avoid creating implicit server-side characters before the user chooses/imports one.
      if (!activeProfileId || !profileId || activeProfileId !== profileId) return false;
      await saveApiRequest("POST", {
        action: "character_sync",
        character_id: profile.id,
        name: profile.name,
        payload,
      });
    } else {
      try { localStorage.setItem(characterStatePayloadKey(profile.id), payload); } catch {}
    }
    characterSyncRuntime.dirty = false;
    characterSyncRuntime.reason = "";
    characterSyncRuntime.lastSyncAt = Date.now();
    return true;
  } catch {
    return false;
  } finally {
    characterSyncRuntime.syncing = false;
  }
}

function markCharacterStateDirty(state, reason = "") {
  if (!state) return;
  characterSyncRuntime.dirty = true;
  characterSyncRuntime.reason = String(reason || "state-change");
  if (characterSyncRuntime.timer) {
    clearTimeout(characterSyncRuntime.timer);
    characterSyncRuntime.timer = 0;
  }
  characterSyncRuntime.timer = setTimeout(() => {
    characterSyncRuntime.timer = 0;
    void syncCharacterStateIfDirty(characterSyncRuntime.reason || "debounced");
  }, CHARACTER_SYNC_DEBOUNCE_MS);
}

function applyCharacterSnapshot(state, snapshot) {
  if (!state || !snapshot) return false;
  const p = state.player ?? {};
  const snapPlayer = snapshot.player ?? {};
  const profile = normalizeCharacterProfile(snapshot.character ?? null);
  state.character = profile;

  p.level = Math.max(1, Math.floor(snapPlayer.level ?? p.level ?? 1));
  p.xp = Math.max(0, Math.floor(snapPlayer.xp ?? p.xp ?? 0));
  p.gold = Math.max(0, Math.floor(snapPlayer.gold ?? p.gold ?? 0));
  p.equip = normalizeEquip(snapPlayer.equip ?? p.equip ?? {});
  p.effects = [];
  p.classId = normalizeCharacterClassId(snapPlayer.classId ?? profile.classId, profile.speciesId);
  p.speciesId = normalizeCharacterSpeciesId(snapPlayer.speciesId ?? profile.speciesId);
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;
  p.attackAfterMove = false;
  p.dead = false;
  state.inv = normalizeInventoryEntries(snapPlayer.inv ?? state.inv ?? []);

  const snapMaxHp = Math.max(1, Math.floor(snapPlayer.maxHp ?? p.maxHp ?? 1));
  const snapHp = Math.max(0, Math.floor(snapPlayer.hp ?? p.hp ?? snapMaxHp));
  const hpRatio = clamp(snapHp / snapMaxHp, 0, 1);
  recalcDerivedStats(state);
  p.hp = clamp(Math.round((p.maxHp ?? 1) * hpRatio), 0, p.maxHp ?? 1);
  touchCharacterProgress(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  renderLog(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  return true;
}

async function loadRunFromCharacterSlot(slotId, options = null) {
  const id = String(slotId ?? "").trim();
  if (!id) return false;
  const opts = (options && typeof options === "object") ? options : {};
  const forceEntrance = opts.forceEntrance === true;
  const currentId = String(getActiveCharacterSlotId() ?? "");
  if (currentId && currentId === id) return true;

  const saved = await autosaveIfDirty("switch-character");
  if (!saved && game) {
    const proceed = confirm("Could not auto-save current character. Switch anyway?");
    if (!proceed) return false;
  }

  if (isAuthenticatedUser) {
    const characterOnlyId = normalizeCharacterProfileIdFromSlotId(id);
    if (characterOnlyId) {
      const snapshot = await resolveCharacterSnapshotFromServerState(characterOnlyId);
      if (!snapshot) return false;
      const profile = normalizeCharacterProfile(snapshot.character ?? { id: characterOnlyId });
      const carryover = {
        character: profile,
        level: Math.max(1, Math.floor(snapshot?.player?.level ?? 1)),
        xp: Math.max(0, Math.floor(snapshot?.player?.xp ?? 0)),
        gold: Math.max(0, Math.floor(snapshot?.player?.gold ?? 0)),
        inv: normalizeInventoryEntries(snapshot?.player?.inv ?? []),
        equip: normalizeEquip(snapshot?.player?.equip ?? {}),
        maxHp: Math.max(1, Math.floor(snapshot?.player?.maxHp ?? maxHpForLevel(1, profile))),
      };
      game = makeNewGame(randomSeedString(), { carryover });
      enforceAdminControlPolicy(game);
      updateDebugMenuUi(game);
      setDebugMenuOpen(false);
      updateContextActionButton(game);
      updateDeathOverlay(game);
      setActiveCharacterSlotId(id);
      saveRuntime.activeRunSaveId = "";
      refreshSaveNameFromLive(true);
      saveNow(game);
      clearSaveDirty();
      markCharacterStateDirty(game, "load-run");
      void syncCharacterStateIfDirty("load-run");
      return true;
    }
    const loaded = await loadSaveFromServer(id, { showStatus: false, closeOverlay: false, forceEntrance });
    if (!loaded) return false;
    clearSaveDirty();
    markCharacterStateDirty(game, "load-run");
    void syncCharacterStateIfDirty("load-run");
    return true;
  }

  const payload = readLocalSlotPayload(id);
  if (!payload) return false;
  const loaded = importSave(payload);
  if (!loaded) return false;
  game = loaded;
  const loadedCharacterId = String(loaded?.character?.id ?? "").trim();
  if (loadedCharacterId) {
    const latestSnapshot = await resolveLatestCharacterSnapshot(loadedCharacterId);
    if (latestSnapshot) applyCharacterSnapshot(game, latestSnapshot);
  }
  if (forceEntrance) {
    respawnAtStart(game);
    pushLog(game, "You re-enter at the dungeon entrance.");
  }
  enforceAdminControlPolicy(game);
  updateDebugMenuUi(game);
  setDebugMenuOpen(false);
  updateContextActionButton(game);
  updateDeathOverlay(game);
  setActiveCharacterSlotId(id);
  refreshSaveNameFromLive(true);
  saveNow(game);
  clearSaveDirty();
  markCharacterStateDirty(game, "load-run");
  void syncCharacterStateIfDirty("load-run");
  return true;
}

async function swapCharacterFromSlotIntoCurrentRun(slotId) {
  const id = String(slotId ?? "").trim();
  if (!id || !game) return false;
  const currentId = String(getActiveCharacterSlotId() ?? "");
  if (currentId && currentId === id) return true;

  const saved = await autosaveIfDirty("swap-character");
  if (!saved && game) {
    const proceed = confirm("Could not auto-save current character. Switch anyway?");
    if (!proceed) return false;
  }

  let loaded = null;
  let loadedCharacterId = "";
  if (isAuthenticatedUser) {
    const characterOnlyId = normalizeCharacterProfileIdFromSlotId(id);
    if (characterOnlyId) {
      loadedCharacterId = characterOnlyId;
    } else {
      try {
        const detail = await saveApiRequest("GET", null, `load=${encodeURIComponent(id)}`);
        loaded = importSave(String(detail?.save?.payload ?? ""));
      } catch {
        loaded = null;
      }
    }
  } else {
    try {
      loaded = importSave(readLocalSlotPayload(id));
    } catch {
      loaded = null;
    }
  }
  if (!loaded && !loadedCharacterId) return false;
  if (!loadedCharacterId) loadedCharacterId = String(loaded?.character?.id ?? "").trim();
  let snapshot = loaded ? exportCharacterSnapshot(loaded) : null;
  if (loadedCharacterId) {
    const latestSnapshot = await resolveLatestCharacterSnapshot(loadedCharacterId);
    if (latestSnapshot) snapshot = latestSnapshot;
  }
  if (!snapshot) return false;
  if (!applyCharacterSnapshot(game, snapshot)) return false;
  relocatePlayerToLastLadderLanding(game);
  if (isAuthenticatedUser) {
    const nextSlotId = characterStateSlotId(loadedCharacterId);
    setActiveCharacterSlotId(nextSlotId || id);
  } else {
    setActiveCharacterSlotId(id);
  }
  refreshSaveNameFromLive(true);
  saveNow(game);
  clearSaveDirty();
  markCharacterStateDirty(game, "swap-character");
  void syncCharacterStateIfDirty("swap-character");
  return true;
}

async function switchToCharacterSlot(slotId, options = null) {
  return loadRunFromCharacterSlot(slotId, options);
}

async function saveApiRequest(method = "GET", body = null, query = "") {
  const q = query ? `&${query}` : "";
  const url = withCacheBust(`./index.php?api=savegames${q}`);
  const headers = {
    Accept: "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
  const init = { method, credentials: "same-origin", headers, cache: "no-store" };
  if (body !== null) {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = saveApiCsrfToken;
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url, init);
  let data = null;
  try { data = await resp.json(); } catch {}
  if (!resp.ok || !data?.ok) {
    const msg = data?.error ?? `Request failed (${resp.status})`;
    const err = new Error(msg);
    err.response = data;
    throw err;
  }
  return data;
}

function renderSaveGameOverlay() {
  if (!saveGameListEl || !saveGameTitleEl || !saveGameModeEl || !saveGameNameRowEl) return;
  const mode = saveMenuUi.mode === "save" ? "save" : "load";
  const saves = Array.isArray(saveMenuUi.saves) ? saveMenuUi.saves : [];
  const full = saves.length >= saveSlotMax;

  saveGameTitleEl.textContent = mode === "save" ? "Save Game" : "Load Game";
  saveGameModeEl.textContent =
    mode === "save"
      ? `Store current dungeon state on the server. You can keep up to ${saveSlotMax} save slots.`
      : `Load one of your server dungeon saves (${saves.length}/${saveSlotMax} used).`;
  saveGameNameRowEl.style.display = mode === "save" ? "grid" : "none";
  if (saveGameCreateBtnEl) {
    saveGameCreateBtnEl.disabled = saveMenuUi.loading || (mode === "save" && full);
  }
  if (mode === "save") refreshSaveNameFromLive(false);

  saveGameListEl.innerHTML = "";
  if (!saves.length) {
    const empty = document.createElement("div");
    empty.className = "saveGameEmpty";
    empty.textContent = "(no save slots yet)";
    saveGameListEl.appendChild(empty);
    return;
  }

  for (const save of saves) {
    const row = document.createElement("div");
    row.className = "saveGameRow";

    const main = document.createElement("div");
    main.className = "saveGameRowMain";
    const name = document.createElement("div");
    name.className = "saveGameRowName";
    name.textContent = save.name ?? "(unnamed save)";
    const meta = document.createElement("div");
    meta.className = "saveGameRowMeta";
    const updated = formatSaveTimestamp(save.updated_at ?? "");
    meta.textContent = `Lvl ${save.level ?? 1}, Depth ${save.depth ?? 0} · Updated ${updated}`;
    main.appendChild(name);
    main.appendChild(meta);
    row.appendChild(main);

    const actions = document.createElement("div");
    actions.className = "saveGameRowActions";

    if (mode === "load") {
      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.textContent = "Load";
      loadBtn.disabled = saveMenuUi.loading;
      loadBtn.addEventListener("click", () => {
        void loadSaveFromServer(save.id);
      });
      actions.appendChild(loadBtn);
    } else {
      const overwriteBtn = document.createElement("button");
      overwriteBtn.type = "button";
      overwriteBtn.textContent = "Overwrite";
      overwriteBtn.disabled = saveMenuUi.loading;
      overwriteBtn.addEventListener("click", () => {
        void saveCurrentGameToServer(save.id);
      });
      actions.appendChild(overwriteBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "saveGameDanger";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = saveMenuUi.loading;
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`Delete save-game run "${save.name ?? "this save"}"? Character will be kept.`)) return;
      void deleteServerSave(save.id);
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    saveGameListEl.appendChild(row);
  }
}

async function refreshSaveGameList() {
  if (!isAuthenticatedUser) return [];
  saveMenuUi.loading = true;
  renderSaveGameOverlay();
  try {
    const data = await saveApiRequest("GET");
    saveMenuUi.saves = Array.isArray(data.saves) ? data.saves : [];
    setSaveGameStatus("", false);
    return saveMenuUi.saves;
  } catch (err) {
    setSaveGameStatus(err?.message ?? "Could not refresh saves.", true);
    return saveMenuUi.saves;
  } finally {
    saveMenuUi.loading = false;
    renderSaveGameOverlay();
  }
}

async function openSaveGameOverlay(mode = "load") {
  if (!isAuthenticatedUser) {
    requireSaveLogin();
    return false;
  }
  saveMenuUi.mode = mode === "save" ? "save" : "load";
  setSaveGameOverlayOpen(true);
  if (saveMenuUi.mode === "save") refreshSaveNameFromLive(true);
  setSaveGameStatus("", false);
  await refreshSaveGameList();
  return true;
}

async function deleteServerSave(saveId) {
  if (!isAuthenticatedUser || !saveId) return false;
  saveMenuUi.loading = true;
  renderSaveGameOverlay();
  setSaveGameStatus("Deleting save...", false);
  try {
    const data = await saveApiRequest("POST", { action: "delete", id: saveId });
    saveMenuUi.saves = Array.isArray(data.saves) ? data.saves : [];
    if (String(saveRuntime.activeRunSaveId ?? "") === String(saveId)) {
      saveRuntime.activeRunSaveId = "";
    }
    setSaveGameStatus("Save deleted.", false);
    renderSaveGameOverlay();
    return true;
  } catch (err) {
    setSaveGameStatus(err?.message ?? "Delete failed.", true);
    renderSaveGameOverlay();
    return false;
  } finally {
    saveMenuUi.loading = false;
    renderSaveGameOverlay();
  }
}

async function loadSaveFromServer(saveId, options = null) {
  if (!isAuthenticatedUser || !saveId) return false;
  const opts = (options && typeof options === "object") ? options : {};
  const showStatus = opts.showStatus !== false;
  const closeOverlay = opts.closeOverlay !== false;
  const forceEntrance = opts.forceEntrance === true;
  saveMenuUi.loading = true;
  renderSaveGameOverlay();
  if (showStatus) setSaveGameStatus("Loading save...", false);
  try {
    const activeCharacterId = activeCharacterProfileIdFromCurrentState();
    const data = await saveApiRequest("GET", null, `load=${encodeURIComponent(saveId)}`);
    const payload = String(data?.save?.payload ?? "");
    const loaded = importSave(payload);
    if (!loaded) {
      throw new Error("Save payload is invalid.");
    }
    game = loaded;
    const targetCharacterId = activeCharacterId || normalizeCharacterProfileId(loaded?.character?.id ?? "");
    if (targetCharacterId) {
      const latestSnapshot = await resolveLatestCharacterSnapshot(targetCharacterId);
      if (latestSnapshot) applyCharacterSnapshot(game, latestSnapshot);
    }
    if (forceEntrance) {
      respawnAtStart(game);
      pushLog(game, "You re-enter at the dungeon entrance.");
    }
    enforceAdminControlPolicy(game);
    updateDebugMenuUi(game);
    setDebugMenuOpen(false);
    updateContextActionButton(game);
    updateDeathOverlay(game);
    saveRuntime.activeRunSaveId = String(saveId);
    const activeCharacterSlotId = characterStateSlotId(targetCharacterId);
    if (activeCharacterSlotId) setActiveCharacterSlotId(activeCharacterSlotId);
    saveNow(game);
    clearSaveDirty();
    markCharacterStateDirty(game, "load-run");
    void syncCharacterStateIfDirty("load-run");
    refreshSaveNameFromLive(true);
    if (showStatus) setSaveGameStatus(`Loaded "${data?.save?.name ?? "save"}".`, false);
    if (closeOverlay) closeSaveGameOverlay();
    return true;
  } catch (err) {
    if (showStatus) setSaveGameStatus(err?.message ?? "Load failed.", true);
    return false;
  } finally {
    saveMenuUi.loading = false;
    renderSaveGameOverlay();
  }
}

async function saveCurrentGameToServer(overwriteId = "", options = null) {
  if (!isAuthenticatedUser || !game) return false;
  const opts = (options && typeof options === "object") ? options : {};
  const useAutosaveName = opts.autosave === true;
  const forceName = String(opts.forceName ?? "").trim();
  const mode = saveMenuUi.mode === "save" ? "save" : "load";
  if (mode !== "save") saveMenuUi.mode = "save";
  if (!useAutosaveName) refreshSaveNameFromLive(false);
  const requestedName = useAutosaveName ? "" : (saveGameNameInputEl?.value ?? "").trim();
  const fallbackName = defaultServerSaveNameForState(game, { autosave: useAutosaveName });
  const name = (forceName || requestedName || fallbackName).slice(0, saveNameMaxLen);
  const payload = exportSave(game);
  const level = Math.max(1, Math.floor(game?.player?.level ?? 1));
  const depth = Math.trunc(game?.player?.z ?? 0);

  saveMenuUi.loading = true;
  renderSaveGameOverlay();
  setSaveGameStatus(overwriteId ? "Overwriting save..." : "Saving game...", false);
  try {
    const data = await saveApiRequest("POST", {
      action: "save",
      overwrite_id: overwriteId || undefined,
      name,
      payload,
      level,
      depth,
    });
    saveMenuUi.saves = Array.isArray(data.saves) ? data.saves : [];
    if (data?.save?.id) saveRuntime.activeRunSaveId = String(data.save.id);
    saveResumeSnapshot(game);
    clearSaveDirty();
    refreshSaveNameFromLive(true);
    setSaveGameStatus(data?.message ?? "Game saved.", false);
    renderSaveGameOverlay();
    return true;
  } catch (err) {
    const responseCode = err?.response?.code ?? "";
    if (responseCode === "SAVE_LIMIT_REACHED") {
      saveMenuUi.saves = Array.isArray(err?.response?.saves) ? err.response.saves : saveMenuUi.saves;
    }
    setSaveGameStatus(err?.message ?? "Save failed.", true);
    renderSaveGameOverlay();
    return false;
  } finally {
    saveMenuUi.loading = false;
    renderSaveGameOverlay();
  }
}

function isCharacterOverlayOpen() {
  return !!characterOverlayEl?.classList.contains("show");
}
function setCharacterOverlayOpen(open) {
  if (!characterOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
    closeShopOverlay();
    closeSaveGameOverlay();
    closeInfoOverlay();
    closeSpriteEditorOverlay();
    closeMonsterEditorOverlay();
    if (isNewDungeonConfirmOpen()) resolveNewDungeonConfirm(false);
  }
  characterUi.open = show;
  characterOverlayEl.classList.toggle("show", show);
  characterOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) characterOverlayCloseBtnEl?.focus();
}
function parseCharacterSummaryPayload(payloadB64) {
  try {
    const json = decodeURIComponent(escape(atob(String(payloadB64 ?? ""))));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const profile = normalizeCharacterProfile(parsed.character ?? null);
    const level = Math.max(1, Math.floor(parsed?.player?.level ?? 1));
    const depth = Math.trunc(parsed?.player?.z ?? 0);
    const deepestDepth = Math.max(
      Math.floor(profile.deepestDepth ?? 0),
      Math.max(0, Math.floor(parsed?.character?.deepestDepth ?? 0)),
      Math.max(0, depth)
    );
    profile.deepestDepth = deepestDepth;
    return { profile, level, depth, deepestDepth };
  } catch {
    return null;
  }
}

function saveEntryUpdatedAtMs(value = "") {
  const ms = Date.parse(String(value ?? ""));
  if (Number.isFinite(ms)) return ms;
  return 0;
}

function chooseNewerCharacterSaveEntry(current = null, candidate = null) {
  if (!current) return candidate;
  if (!candidate) return current;
  const curMs = saveEntryUpdatedAtMs(current.updatedAt);
  const nextMs = saveEntryUpdatedAtMs(candidate.updatedAt);
  if (nextMs > curMs) return candidate;
  if (nextMs < curMs) return current;
  return String(candidate.id ?? "").localeCompare(String(current.id ?? "")) > 0 ? candidate : current;
}

async function resolveLatestCharacterSnapshotFromServer(characterId = "") {
  if (!isAuthenticatedUser) return null;
  const targetId = String(characterId ?? "").trim();
  if (!targetId) return null;
  const directState = await resolveCharacterSnapshotFromServerState(targetId);
  if (directState) return directState;
  const list = await saveApiRequest("GET");
  const characters = Array.isArray(list?.characters) ? list.characters : [];
  const saves = Array.isArray(list?.saves) ? list.saves : [];
  let latestSaveId = "";
  const direct = characters.find((entry) => String(entry?.character_id ?? "") === targetId);
  if (direct) {
    latestSaveId = String(direct?.latest_save_id ?? "").trim();
  }
  if (!latestSaveId) {
    let chosenMeta = null;
    for (const save of saves) {
      const cid = String(save?.character_id ?? "").trim();
      if (!cid || cid !== targetId) continue;
      chosenMeta = chooseNewerCharacterSaveEntry(chosenMeta, {
        id: String(save?.id ?? ""),
        updatedAt: String(save?.updated_at ?? ""),
      });
    }
    latestSaveId = String(chosenMeta?.id ?? "").trim();
  }
  if (!latestSaveId) return null;
  const detail = await saveApiRequest("GET", null, `load=${encodeURIComponent(latestSaveId)}`);
  const loaded = importSave(String(detail?.save?.payload ?? ""));
  if (!loaded) return null;
  return exportCharacterSnapshot(loaded);
}

async function resolveLatestCharacterSnapshotFromLocal(characterId = "") {
  if (isAuthenticatedUser) return null;
  const targetId = String(characterId ?? "").trim();
  if (!targetId) return null;
  const directState = resolveCharacterSnapshotFromLocalState(targetId);
  if (directState) return directState;
  const slots = await fetchCharacterSlotsFromLocal();
  let chosen = null;
  for (const slot of slots) {
    const saveId = String(slot?.id ?? "");
    if (!saveId) continue;
    const payload = readLocalSlotPayload(saveId);
    if (!payload) continue;
    const summary = parseCharacterSummaryPayload(payload);
    const cid = String(summary?.profile?.id ?? "").trim();
    if (!cid || cid !== targetId) continue;
    chosen = chooseNewerCharacterSaveEntry(chosen, {
      id: saveId,
      updatedAt: String(slot?.updatedAt ?? ""),
      payload,
    });
  }
  if (!chosen?.payload) return null;
  const loaded = importSave(chosen.payload);
  if (!loaded) return null;
  return exportCharacterSnapshot(loaded);
}

async function resolveLatestCharacterSnapshot(characterId = "") {
  if (isAuthenticatedUser) return resolveLatestCharacterSnapshotFromServer(characterId);
  return resolveLatestCharacterSnapshotFromLocal(characterId);
}

async function fetchCharacterSlotsFromServer() {
  if (!isAuthenticatedUser) return [];
  const base = await saveApiRequest("GET");
  const characters = Array.isArray(base?.characters) ? base.characters : [];
  const characterStates = Array.isArray(base?.character_states) ? base.character_states : [];
  const out = [];
  const knownCharacterIds = new Set();
  if (characterStates.length) {
    for (const stateMeta of characterStates) {
      const characterId = normalizeCharacterProfileId(stateMeta?.id ?? "");
      if (!characterId || knownCharacterIds.has(characterId)) continue;
      const slotId = characterStateSlotId(characterId);
      if (!slotId) continue;
      const profileFallback = normalizeCharacterProfile({
        id: characterId,
        name: String(stateMeta?.name ?? DEFAULT_CHARACTER_NAME),
      });
      const snapshot = await resolveCharacterSnapshotFromServerState(characterId);
      const slot = {
        id: slotId,
        name: String(stateMeta?.name ?? profileFallback.name ?? DEFAULT_CHARACTER_NAME),
        updatedAt: String(stateMeta?.updated_at ?? ""),
        level: Math.max(1, Math.floor(snapshot?.player?.level ?? 1)),
        depth: 0,
        profile: snapshot?.character ? normalizeCharacterProfile(snapshot.character) : profileFallback,
        deepestDepth: Math.max(
          0,
          Math.floor(snapshot?.character?.deepestDepth ?? profileFallback.deepestDepth ?? 0)
        ),
      };
      out.push(slot);
      knownCharacterIds.add(characterId);
    }
  } else {
    for (const entry of characters) {
      const characterId = normalizeCharacterProfileId(entry?.character_id ?? "");
      if (!characterId || knownCharacterIds.has(characterId)) continue;
      const slotId = characterStateSlotId(characterId);
      if (!slotId) continue;
      const profileFallback = normalizeCharacterProfile({
        id: characterId,
        name: String(entry?.character_name ?? DEFAULT_CHARACTER_NAME),
      });
      const slot = {
        id: slotId,
        name: String(entry?.character_name ?? profileFallback.name ?? DEFAULT_CHARACTER_NAME),
        updatedAt: String(entry?.updated_at ?? ""),
        level: Math.max(1, Math.floor(entry?.level ?? 1)),
        depth: Math.trunc(entry?.depth ?? 0),
        profile: profileFallback,
        deepestDepth: Math.max(0, Math.trunc(entry?.depth ?? 0)),
      };
      const saveId = String(entry?.latest_save_id ?? "").trim();
      if (saveId) {
        try {
          const detail = await saveApiRequest("GET", null, `load=${encodeURIComponent(saveId)}`);
          const summary = parseCharacterSummaryPayload(detail?.save?.payload ?? "");
          if (summary) {
            slot.profile = summary.profile;
            slot.level = summary.level;
            slot.depth = summary.depth;
            slot.deepestDepth = summary.deepestDepth;
          }
        } catch {}
      }
      out.push(slot);
      knownCharacterIds.add(characterId);
    }
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}
function resetCharacterCreationDraft(profile = null, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const normalized = normalizeCharacterProfile(profile ?? {
    name: DEFAULT_CHARACTER_NAME,
    classId: DEFAULT_CHARACTER_CLASS_ID,
    speciesId: DEFAULT_CHARACTER_SPECIES_ID,
    stats: CHARACTER_CREATION_DRAFT_STATS,
  });
  const useProfileStats = !!profile;
  characterUi.creation = {
    name: normalized.name,
    speciesId: normalized.speciesId,
    classId: normalizeCharacterClassId(normalized.classId, normalized.speciesId),
    stats: useProfileStats ? { ...normalized.stats } : { ...CHARACTER_CREATION_DRAFT_STATS },
  };
  const requestedStep = String(opts.step ?? "welcome");
  characterUi.createStep = CHARACTER_CREATE_STEPS.includes(requestedStep) ? requestedStep : "welcome";
}
function setCharacterOverlayStatus(message = "", isError = false) {
  const text = String(message ?? "").trim();
  characterUi.status = text;
  characterUi.statusError = !!(text && isError);
}
function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function characterStatusMarkup() {
  if (!characterUi.status) return "";
  return `<div class="charStatus${characterUi.statusError ? " error" : ""}">${escapeHtmlText(characterUi.status)}</div>`;
}
function characterCreationPointsRemaining() {
  const draft = characterUi.creation;
  const budget = characterCreationPointBudget(draft.speciesId);
  const spent = countCharacterStatsPoints(draft.stats);
  return budget - spent;
}
function characterCreateStepIndex(step = "") {
  const idx = CHARACTER_CREATE_STEPS.indexOf(step);
  return idx >= 0 ? idx : 0;
}
function characterCreateStepMove(delta = 0) {
  const idx = characterCreateStepIndex(characterUi.createStep);
  const next = clamp(idx + Math.trunc(delta), 0, CHARACTER_CREATE_STEPS.length - 1);
  characterUi.createStep = CHARACTER_CREATE_STEPS[next];
}
function normalizeCharacterSelectionPurpose(value = "") {
  return value === "swap_character" ? "swap_character" : "load_run";
}
function mustHaveCharacterSlot() {
  return !!(isAuthenticatedUser && (characterUi.slots?.length ?? 0) === 0);
}
function refreshCharacterCreationRequirement() {
  if (!isAuthenticatedUser) return;
  if (mustHaveCharacterSlot()) {
    requiresCharacterCreation = true;
    return;
  }
  requiresCharacterCreation = !String(characterUi.activeSaveId ?? "").trim();
}
function enforceCharacterCreationGate() {
  if (!requiresCharacterCreation) return false;
  if (!isCharacterOverlayOpen()) {
    void openCharacterSelectionOverlay({ purpose: "load_run" });
  } else {
    characterUi.mode = mustHaveCharacterSlot() ? "create" : "select";
    characterUi.selectionPurpose = "load_run";
    if (characterUi.mode === "create" && !CHARACTER_CREATE_STEPS.includes(characterUi.createStep)) {
      resetCharacterCreationDraft(null, { step: "welcome" });
    }
    setCharacterOverlayStatus(
      characterUi.mode === "create"
        ? "Create a character to continue."
        : "Select or create a character to continue.",
      true
    );
    renderCharacterOverlay();
  }
  return true;
}
function characterSpeciesBuffLines(speciesId) {
  return [...(characterSpeciesDef(speciesId)?.buffLines ?? [])];
}
function characterClassBuffLines(classId) {
  return [...(characterClassDef(classId)?.buffLines ?? [])];
}
function characterCreationDerivedPreview(draft) {
  const species = characterSpeciesDef(draft.speciesId);
  const classDef = characterClassDef(draft.classId);
  const stats = normalizeCreationCharacterStats(draft.stats, draft.speciesId);
  const vit = Math.max(0, Math.floor(stats.vit ?? 0));
  const str = Math.max(0, Math.floor(stats.str ?? 0));
  const dex = Math.max(0, Math.floor(stats.dex ?? 0));
  const int = Math.max(0, Math.floor(stats.int ?? 0));
  const agi = Math.max(0, Math.floor(stats.agi ?? 0));
  const hpMult = (species.hpMult ?? 1) * (classDef.hpMult ?? 1);
  const armorEffect = (species.armorEffect ?? 1) * (classDef.armorEffect ?? 1);
  const energyMult = (species.energyMult ?? 1) * (classDef.energyMult ?? 1);
  const energyFlat = Math.floor((species.energyFlat ?? 0) + (classDef.energyFlat ?? 0));
  const maxHp = Math.max(1, Math.round((70 + vit * 18) * PLAYER_STAT_SCALE * hpMult));
  const baseAtk = Math.max(1, Math.round((8 + str * 4) * PLAYER_STAT_SCALE));
  const atkLo = Math.max(1, Math.round(baseAtk * 0.86));
  const atkHi = Math.max(atkLo, Math.round(baseAtk * 1.16));
  const def = Math.max(0, Math.round(vit * PLAYER_STAT_SCALE * armorEffect));
  const acc = clamp(Math.round(70 + dex * 3 + (species.accFlat ?? 0) + (classDef.accFlat ?? 0)), 10, 98);
  const eva = clamp(Math.round(8 + dex * 2 + agi + (species.evaFlat ?? 0) + (classDef.evaFlat ?? 0)), 0, 85);
  const spd = Number((Math.max(0.55, (1 + agi * 0.03) * (species.speedMult ?? 1) * (classDef.speedMult ?? 1))).toFixed(3));
  const energy = Math.max(1, Math.round(((30 + int * 10) * PLAYER_STAT_SCALE) * energyMult + energyFlat));
  return { maxHp, atkLo, atkHi, def, acc, eva, spd, energy };
}
function starterCarryoverForClass(classId) {
  const cid = normalizeCharacterClassId(classId);
  const classDef = characterClassDef(cid);
  const out = {
    gold: 0,
    inv: [],
    equip: { weapon: null, head: null, chest: null, legs: null },
  };
  out.equip.weapon = "weapon_wood_dagger";
  if ((classDef?.hpMult ?? 1) >= 1.12 || (classDef?.armorEffect ?? 1) >= 1.1) {
    out.equip.head = "armor_wood_head";
  }
  let starterPotions = 0;
  if ((classDef?.potionCapBonus ?? 0) > 0) starterPotions += 1;
  if ((classDef?.healMult ?? 1) >= 1.2) starterPotions += 1;
  if (starterPotions > 0) out.inv.push({ type: "potion", amount: starterPotions });
  return out;
}
function renderCharacterSelectBody() {
  if (!characterOverlayBodyEl || !characterOverlayTitleEl || !characterOverlaySubtitleEl) return;
  const slots = Array.isArray(characterUi.slots) ? characterUi.slots : [];
  if (!slots.length) {
    characterUi.mode = "create";
    resetCharacterCreationDraft(null, { step: "welcome" });
    renderCharacterOverlay();
    return;
  }
  if (!slots.find((slot) => slot.id === characterUi.selectedSaveId)) {
    characterUi.selectedSaveId = slots[0].id;
  }

  const purpose = normalizeCharacterSelectionPurpose(characterUi.selectionPurpose);
  characterOverlayTitleEl.textContent = purpose === "swap_character" ? "Switch Character" : "Choose Character";
  const slotCap = isAuthenticatedUser ? saveSlotMax : LOCAL_SLOT_MAX;
  characterOverlaySubtitleEl.textContent = purpose === "swap_character"
    ? "Switch character while staying in the current dungeon."
    : `Load an existing run or start a new one (${slots.length}/${slotCap} slots used).`;
  characterOverlayBodyEl.innerHTML = characterStatusMarkup();
  for (const slot of slots) {
    const selected = slot.id === characterUi.selectedSaveId;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "charSlotRow";
    row.style.width = "100%";
    row.style.textAlign = "left";
    row.style.borderColor = selected ? "#4f79b7" : "#2b3956";
    row.style.background = selected ? "rgba(28, 45, 73, 0.92)" : "rgba(12, 18, 30, 0.9)";
    const classLabel = characterClassDef(slot.profile?.classId ?? "").name;
    const speciesLabel = characterSpeciesDef(slot.profile?.speciesId ?? "").name;
    const spriteDisplay = resolveCharacterSpriteDisplay(slot.profile?.speciesId ?? "", slot.profile?.classId ?? "");
    const visual = spriteDisplay.src
      ? `<img class="charSlotSprite" src="${spriteDisplay.src}" alt="${escapeHtmlText(speciesLabel)} ${escapeHtmlText(classLabel)} sprite" />`
      : `<div class="charSlotSpriteFallback">@</div>`;
    row.innerHTML =
      `<div class="charSlotVisual">${visual}</div>` +
      `<div class="charSlotInfo">` +
      `<div class="charSlotTitle">${escapeHtmlText(slot.profile?.name ?? slot.name)}</div>` +
      `<div class="charSlotMeta">Species: ${speciesLabel}  |  Class: ${classLabel}\n` +
      `Level ${slot.level}  |  Last depth ${slot.depth}  |  Deepest ${slot.deepestDepth}\n` +
      `Updated ${formatSaveTimestamp(slot.updatedAt)}</div>` +
      `</div>`;
    row.addEventListener("click", () => {
      characterUi.selectedSaveId = slot.id;
      setCharacterOverlayStatus("");
      renderCharacterOverlay();
    });
    characterOverlayBodyEl.appendChild(row);
  }

  characterOverlayPrimaryEl.textContent = purpose === "swap_character"
    ? "Switch to Selected Character (Stay Here)"
    : "Load Selected Run";
  characterOverlayPrimaryEl.disabled = characterUi.loading || !characterUi.selectedSaveId;
  characterOverlayPrimaryEl.style.display = "";
  characterOverlaySecondaryEl.textContent = "Start New Run";
  characterOverlaySecondaryEl.disabled = characterUi.loading || slots.length >= slotCap;
  characterOverlaySecondaryEl.style.display = "";
  characterOverlayTertiaryEl.textContent = "Delete Selected";
  characterOverlayTertiaryEl.disabled = characterUi.loading || !characterUi.selectedSaveId;
  characterOverlayTertiaryEl.style.display = "";
}
function renderCharacterCreateBody() {
  if (!characterOverlayBodyEl || !characterOverlayTitleEl || !characterOverlaySubtitleEl) return;
  const draft = characterUi.creation;
  draft.speciesId = normalizeCharacterSpeciesId(draft.speciesId);
  draft.classId = normalizeCharacterClassId(draft.classId, draft.speciesId);
  draft.stats = normalizeCreationCharacterStats(draft.stats, draft.speciesId);
  const species = characterSpeciesDef(draft.speciesId);
  const klass = characterClassDef(draft.classId);
  const step = CHARACTER_CREATE_STEPS.includes(characterUi.createStep) ? characterUi.createStep : "welcome";
  characterUi.createStep = step;
  const remaining = characterCreationPointsRemaining();
  const budget = characterCreationPointBudget(draft.speciesId);
  const spent = budget - remaining;
  const derived = characterCreationDerivedPreview(draft);
  const statusHtml = characterStatusMarkup();

  characterOverlayTitleEl.textContent = "Create Character";
  characterOverlaySubtitleEl.textContent = isAuthenticatedUser
    ? "Build a persistent runner. Character data and dungeon state are bound to this slot."
    : "Guest mode: one local character is cached on this device.";

  if (step === "welcome") {
    characterOverlayBodyEl.innerHTML =
      statusHtml +
      `<div class="charWelcome">` +
      `<h3>Create your runner. The dungeon adapts.</h3>` +
      `<p>Choose species, class, and stats. Choices are permanent per character slot.</p>` +
      `<p>${isAuthenticatedUser
        ? `You can keep up to ${saveSlotMax} characters.`
        : "Login is optional for cloud slots. Starting a new guest character replaces the current guest run."}</p>` +
      `</div>`;
  } else if (step === "species") {
    characterOverlayBodyEl.innerHTML =
      statusHtml +
      `<div class="charStepLead">Step 2/5: Choose Species</div>` +
      `<div class="charChoiceGrid">` +
      `${Object.values(SPECIES_DEFS).map((entry) => {
        const selected = entry.id === draft.speciesId;
        const defaultClassId = defaultClassIdForSpecies(entry.id);
        const defaultClass = characterClassDef(defaultClassId);
        const spriteDisplay = resolveCharacterSpriteDisplay(entry.id, defaultClassId);
        const visual = spriteDisplay.src
          ? `<img class="charChoiceSprite" src="${spriteDisplay.src}" alt="${escapeHtmlText(entry.name)} ${escapeHtmlText(defaultClass.name)} sprite" />`
          : `<div class="charChoiceSpriteFallback">@</div>`;
        const buffs = characterSpeciesBuffLines(entry.id)
          .map((line) => `<li>${escapeHtmlText(line)}</li>`)
          .join("");
        return `<button type="button" class="charChoiceCard speciesChoiceCard${selected ? " selected" : ""}" data-species-id="${entry.id}">` +
          `<div class="charChoiceVisual">${visual}</div>` +
          `<div class="charChoiceMeta">` +
            `<div class="charChoiceName">${escapeHtmlText(entry.name)}</div>` +
            `<div class="charChoiceSubtle">Default class: ${escapeHtmlText(defaultClass.name)}</div>` +
            `<div class="charChoiceBlurb">${escapeHtmlText(entry.blurb)}</div>` +
            `<ul class="charBuffList">${buffs}</ul>` +
          `</div>` +
          `</button>`;
      }).join("")}` +
      `</div>`;
    for (const btn of characterOverlayBodyEl.querySelectorAll("[data-species-id]")) {
      btn.addEventListener("click", () => {
        const id = normalizeCharacterSpeciesId(btn.getAttribute("data-species-id"));
        characterUi.creation.speciesId = id;
        characterUi.creation.classId = defaultClassIdForSpecies(id);
        characterUi.creation.stats = normalizeCreationCharacterStats(characterUi.creation.stats, id);
        setCharacterOverlayStatus("");
        renderCharacterOverlay();
      });
    }
  } else if (step === "class") {
    const classChoices = classListForSpecies(draft.speciesId);
    if (!classChoices.find((entry) => entry.id === draft.classId)) {
      draft.classId = defaultClassIdForSpecies(draft.speciesId);
    }
    characterOverlayBodyEl.innerHTML =
      statusHtml +
      `<div class="charStepLead">Step 3/5: Choose Class (${escapeHtmlText(species.name)})</div>` +
      `<div class="charChoiceGrid">` +
      `${classChoices.map((entry) => {
        const selected = entry.id === draft.classId;
        const spriteDisplay = resolveCharacterSpriteDisplay(draft.speciesId, entry.id);
        const visual = spriteDisplay.src
          ? `<img class="charChoiceSprite" src="${spriteDisplay.src}" alt="${escapeHtmlText(entry.name)} sprite" />`
          : `<div class="charChoiceSpriteFallback">@</div>`;
        const buffs = characterClassBuffLines(entry.id)
          .map((line) => `<li>${escapeHtmlText(line)}</li>`)
          .join("");
        return `<button type="button" class="charChoiceCard classChoiceCard${selected ? " selected" : ""}" data-class-id="${entry.id}">` +
          `<div class="charChoiceVisual">${visual}</div>` +
          `<div class="charChoiceMeta">` +
            `<div class="charChoiceName">${escapeHtmlText(entry.name)}</div>` +
            `<div class="charChoiceBlurb">${escapeHtmlText(entry.blurb)}</div>` +
            `<ul class="charBuffList">${buffs}</ul>` +
          `</div>` +
          `</button>`;
      }).join("")}` +
      `</div>`;
    for (const btn of characterOverlayBodyEl.querySelectorAll("[data-class-id]")) {
      btn.addEventListener("click", () => {
        characterUi.creation.classId = normalizeCharacterClassId(
          btn.getAttribute("data-class-id"),
          characterUi.creation.speciesId
        );
        setCharacterOverlayStatus("");
        renderCharacterOverlay();
      });
    }
  } else if (step === "stats") {
    characterOverlayBodyEl.innerHTML =
      statusHtml +
      `<div class="charStepLead">Step 4/5: Allocate Attribute Points</div>` +
      `<div class="charPointsBanner${remaining === 0 ? " ready" : ""}">` +
      `<span class="charPointsBannerLabel">Points Remaining</span>` +
      `<strong class="charPointsBannerValue">${remaining}</strong>` +
      `<span class="charPointsBannerMeta">Spent ${spent}/${budget}</span>` +
      `</div>` +
      `<div class="charCreatorGrid charCreatorGridStatsMeta">` +
      `<div class="charCreatorField"><label>Species</label><input type="text" value="${escapeHtmlText(species.name)}" disabled /></div>` +
      `<div class="charCreatorField"><label>Class</label><input type="text" value="${escapeHtmlText(klass.name)}" disabled /></div>` +
      `<div class="charCreatorField"><label>Point Budget</label><input type="text" value="${spent}/${budget}" disabled /></div>` +
      `</div>` +
      `<div class="charStatsWrap">` +
      `<div class="charStatsHeader">Distribute points (max ${CHARACTER_CREATION_MAX_STAT} per stat)</div>` +
      `${CHARACTER_STAT_KEYS.map((key) => {
        const label = characterStatLabelLong(key);
        const val = Math.max(0, Math.floor(draft.stats[key] ?? 0));
        return `<div class="charStatRow" data-stat="${key}">` +
          `<div class="charStatLabelWrap"><div class="charStatLabel">${label}</div><div class="charStatKey">${characterStatLabelShort(key)}</div></div>` +
          `<div class="charStatValueBox"><span class="charStatValue">${val}</span></div>` +
          `<button class="charStatBtn" data-op="minus" data-stat="${key}" type="button">-</button>` +
          `<button class="charStatBtn" data-op="plus" data-stat="${key}" type="button">+</button>` +
        `</div>`;
      }).join("")}` +
      `</div>` +
      `<div class="charDerivedGrid">` +
      `<div class="charDerivedCell"><span>Max HP</span><strong>${derived.maxHp}</strong></div>` +
      `<div class="charDerivedCell"><span>ATK</span><strong>${derived.atkLo}-${derived.atkHi}</strong></div>` +
      `<div class="charDerivedCell"><span>DEF</span><strong>${derived.def}</strong></div>` +
      `<div class="charDerivedCell"><span>ACC</span><strong>${derived.acc}</strong></div>` +
      `<div class="charDerivedCell"><span>EVA</span><strong>${derived.eva}</strong></div>` +
      `<div class="charDerivedCell"><span>SPD</span><strong>${derived.spd.toFixed(2)}</strong></div>` +
      `<div class="charDerivedCell"><span>Energy</span><strong>${derived.energy}</strong></div>` +
      `<div class="charDerivedCell"><span>Potions</span><strong>${potionCapacityForState({ player: { classId: draft.classId }, character: { classId: draft.classId } })}</strong></div>` +
      `</div>`;
    for (const btn of characterOverlayBodyEl.querySelectorAll(".charStatBtn")) {
      btn.addEventListener("click", () => {
        const stat = String(btn.getAttribute("data-stat") ?? "");
        if (!CHARACTER_STAT_KEYS.includes(stat)) return;
        const op = String(btn.getAttribute("data-op") ?? "");
        const cur = Math.max(0, Math.floor(characterUi.creation.stats[stat] ?? 0));
        const budgetNow = characterCreationPointBudget(characterUi.creation.speciesId);
        const spentNow = countCharacterStatsPoints(characterUi.creation.stats);
        if (op === "plus") {
          if (cur >= CHARACTER_CREATION_MAX_STAT) return;
          if (spentNow >= budgetNow) return;
          characterUi.creation.stats[stat] = cur + 1;
        } else if (op === "minus") {
          if (cur <= 0) return;
          characterUi.creation.stats[stat] = cur - 1;
        }
        setCharacterOverlayStatus("");
        renderCharacterOverlay();
      });
    }
  } else {
    characterOverlayBodyEl.innerHTML =
      statusHtml +
      `<div class="charStepLead">Step 5/5: Name + Confirm</div>` +
      `<div class="charCreatorGrid">` +
      `<div class="charCreatorField"><label for="charCreateName">Name (optional)</label><input id="charCreateName" type="text" maxlength="40" /></div>` +
      `<div class="charCreatorField"><label>Species</label><input type="text" value="${escapeHtmlText(species.name)}" disabled /></div>` +
      `<div class="charCreatorField"><label>Class</label><input type="text" value="${escapeHtmlText(klass.name)}" disabled /></div>` +
      `<div class="charCreatorField"><label>Stats Spent</label><input type="text" value="${spent}/${budget}" disabled /></div>` +
      `</div>` +
      `<div class="charSummaryCard">` +
      `<div><strong>Derived Combat Snapshot</strong></div>` +
      `<div>HP ${derived.maxHp} | ATK ${derived.atkLo}-${derived.atkHi} | DEF ${derived.def}</div>` +
      `<div>ACC ${derived.acc} | EVA ${derived.eva} | SPD ${derived.spd.toFixed(2)} | Energy ${derived.energy}</div>` +
      `<div>Species Buffs: ${characterSpeciesBuffLines(species.id).join(" • ") || "None"}</div>` +
      `<div>Class Buffs: ${characterClassBuffLines(klass.id).join(" • ") || "None"}</div>` +
      `</div>`;
    const nameInput = document.getElementById("charCreateName");
    if (nameInput) nameInput.value = draft.name;
    nameInput?.addEventListener("input", () => {
      const raw = String(nameInput.value ?? "").trim();
      characterUi.creation.name = raw ? raw.slice(0, 40) : DEFAULT_CHARACTER_NAME;
    });
  }

  const stepIdx = characterCreateStepIndex(step);
  if (step === "welcome") {
    characterOverlayPrimaryEl.textContent = isAuthenticatedUser ? "Create Character" : "Continue as Guest";
    characterOverlayPrimaryEl.disabled = characterUi.loading;
  } else if (step === "species") {
    characterOverlayPrimaryEl.textContent = "Choose Class";
    characterOverlayPrimaryEl.disabled = characterUi.loading;
  } else if (step === "class") {
    characterOverlayPrimaryEl.textContent = "Allocate Stats";
    characterOverlayPrimaryEl.disabled = characterUi.loading;
  } else if (step === "stats") {
    characterOverlayPrimaryEl.textContent = "Finalize Name";
    characterOverlayPrimaryEl.disabled = characterUi.loading || (isAuthenticatedUser && remaining !== 0);
  } else {
    characterOverlayPrimaryEl.textContent = isAuthenticatedUser ? "Create Character" : "Enter Dungeon";
    characterOverlayPrimaryEl.disabled = characterUi.loading || (isAuthenticatedUser && remaining !== 0);
  }
  characterOverlayPrimaryEl.style.display = "";

  if (stepIdx <= 0) {
    const canBackToSelect = isAuthenticatedUser && (characterUi.slots?.length ?? 0) > 0;
    const canGuestLogin = !isAuthenticatedUser && !!authBtnEl?.href;
    if (canBackToSelect) {
      characterOverlaySecondaryEl.textContent = "Back to Select";
      characterOverlaySecondaryEl.disabled = characterUi.loading;
      characterOverlaySecondaryEl.style.display = "";
    } else if (canGuestLogin) {
      characterOverlaySecondaryEl.textContent = "Login (Optional)";
      characterOverlaySecondaryEl.disabled = characterUi.loading;
      characterOverlaySecondaryEl.style.display = "";
    } else {
      characterOverlaySecondaryEl.textContent = "Back";
      characterOverlaySecondaryEl.disabled = true;
      characterOverlaySecondaryEl.style.display = "none";
    }
  } else {
    characterOverlaySecondaryEl.textContent = "Back";
    characterOverlaySecondaryEl.disabled = characterUi.loading;
    characterOverlaySecondaryEl.style.display = "";
  }
  characterOverlayTertiaryEl.style.display = "none";
}
function renderCharacterOverlay() {
  if (!isCharacterOverlayOpen()) return;
  if (characterUi.mode === "select") renderCharacterSelectBody();
  else renderCharacterCreateBody();
}
async function saveStateToServerSlot(state, overwriteId = "", nameOverride = "") {
  const payload = exportSave(state);
  const level = Math.max(1, Math.floor(state?.player?.level ?? 1));
  const depth = Math.trunc(state?.player?.z ?? 0);
  const name = (String(nameOverride || defaultServerSaveNameForState(state)).trim() || defaultServerSaveNameForState(state)).slice(0, saveNameMaxLen);
  return saveApiRequest("POST", {
    action: "save",
    overwrite_id: overwriteId || undefined,
    name,
    payload,
    level,
    depth,
  });
}
async function handleCharacterOverlayPrimary() {
  if (characterUi.loading) return;
  if (characterUi.mode === "select") {
    if (!characterUi.selectedSaveId) return;
    setCharacterOverlayStatus("");
    characterUi.loading = true;
    renderCharacterOverlay();
    const purpose = normalizeCharacterSelectionPurpose(characterUi.selectionPurpose);
    const loaded = purpose === "swap_character"
      ? await swapCharacterFromSlotIntoCurrentRun(characterUi.selectedSaveId)
      : await loadRunFromCharacterSlot(characterUi.selectedSaveId, { forceEntrance: false });
    characterUi.loading = false;
    if (loaded) {
      setActiveCharacterSlotId(characterUi.selectedSaveId);
      requiresCharacterCreation = false;
      setCharacterOverlayOpen(false);
    } else {
      setCharacterOverlayStatus("Could not load that character slot.", true);
    }
    renderCharacterOverlay();
    return;
  }

  const step = CHARACTER_CREATE_STEPS.includes(characterUi.createStep) ? characterUi.createStep : "welcome";
  if (step !== "name") {
    if (step === "stats" && isAuthenticatedUser && characterCreationPointsRemaining() !== 0) {
      setCharacterOverlayStatus("Spend all stat points before continuing.", true);
      renderCharacterOverlay();
      return;
    }
    setCharacterOverlayStatus("");
    characterCreateStepMove(1);
    renderCharacterOverlay();
    return;
  }

  if (isAuthenticatedUser && characterCreationPointsRemaining() !== 0) {
    setCharacterOverlayStatus("Spend all stat points before creating this character.", true);
    renderCharacterOverlay();
    return;
  }

  const draft = characterUi.creation;
  const profile = normalizeCharacterProfile({
    name: draft.name,
    speciesId: draft.speciesId,
    classId: draft.classId,
    stats: draft.stats,
    deepestDepth: 0,
    isDead: false,
  });
  const starter = starterCarryoverForClass(profile.classId);
  const carryover = {
    character: profile,
    level: 1,
    xp: 0,
    gold: starter.gold ?? 0,
    inv: starter.inv ?? [],
    equip: starter.equip ?? { weapon: null, head: null, chest: null, legs: null },
    maxHp: maxHpForLevel(1, profile),
  };
  game = makeNewGame(randomSeedString(), { carryover });
  enforceAdminControlPolicy(game);
  updateDebugMenuUi(game);
  updateContextActionButton(game);
  updateDeathOverlay(game);
  refreshSaveNameFromLive(true);
  saveNow(game);
  clearSaveDirty();

  if (isAuthenticatedUser) {
    characterUi.loading = true;
    setCharacterOverlayStatus("Creating character slot...", false);
    renderCharacterOverlay();
    try {
      const slotName = `${profile.name} • ${characterClassDef(profile.classId).name}`.slice(0, saveNameMaxLen);
      const saved = await saveStateToServerSlot(game, "", slotName);
      const savedId = String(saved?.save?.id ?? "");
      characterUi.slots = await fetchCharacterSlotsFromServer();
      characterUi.selectedSaveId = savedId || characterUi.slots[0]?.id || "";
      setActiveCharacterSlotId(characterUi.selectedSaveId);
      requiresCharacterCreation = false;
      setCharacterOverlayStatus("");
      setCharacterOverlayOpen(false);
    } catch (err) {
      setCharacterOverlayStatus(err?.message ?? "Could not create character slot.", true);
    } finally {
      characterUi.loading = false;
      renderCharacterOverlay();
    }
    return;
  }

  saveNow(game);
  const slotName = `${profile.name} • ${characterClassDef(profile.classId).name}`.slice(0, saveNameMaxLen);
  const savedLocal = await saveCurrentGameToLocalSlot("", slotName);
  if (savedLocal) {
    characterUi.slots = await fetchCharacterSlotsFromLocal();
    const activeId = getActiveCharacterSlotId();
    const activeExists = !!(activeId && characterUi.slots.some((slot) => slot.id === activeId));
    characterUi.selectedSaveId = activeExists ? activeId : (characterUi.slots[0]?.id || "");
    if (!activeExists && characterUi.selectedSaveId) setActiveCharacterSlotId(characterUi.selectedSaveId);
  } else {
    characterUi.slots = [];
    characterUi.selectedSaveId = "";
    setActiveCharacterSlotId("");
  }
  requiresCharacterCreation = false;
  setCharacterOverlayStatus("");
  setCharacterOverlayOpen(false);
}
async function handleCharacterOverlaySecondary() {
  if (characterUi.loading) return;
  if (characterUi.mode === "select") {
    const slotCap = isAuthenticatedUser ? saveSlotMax : LOCAL_SLOT_MAX;
    if ((characterUi.slots?.length ?? 0) >= slotCap) return;
    characterUi.mode = "create";
    setCharacterOverlayStatus("");
    resetCharacterCreationDraft(null, { step: "welcome" });
    renderCharacterOverlay();
    return;
  }
  const step = CHARACTER_CREATE_STEPS.includes(characterUi.createStep) ? characterUi.createStep : "welcome";
  if (step === "welcome") {
    if (isAuthenticatedUser && (characterUi.slots?.length ?? 0) > 0) {
      characterUi.mode = "select";
      setCharacterOverlayStatus("");
      renderCharacterOverlay();
      return;
    }
    if (!isAuthenticatedUser && authBtnEl?.href) {
      prepareGuestLoginHandoff(game);
      window.location.href = authBtnEl.href;
    }
    return;
  }
  setCharacterOverlayStatus("");
  characterCreateStepMove(-1);
  renderCharacterOverlay();
}

function tryCloseCharacterOverlay() {
  const purpose = normalizeCharacterSelectionPurpose(characterUi.selectionPurpose);
  if (purpose === "swap_character") {
    requiresCharacterCreation = false;
    setCharacterOverlayStatus("");
    setCharacterOverlayOpen(false);
    return true;
  }
  if ((isAuthenticatedUser && requiresCharacterCreation) || (!isAuthenticatedUser && requiresCharacterCreation)) {
    const hasSlots = (characterUi.slots?.length ?? 0) > 0;
    characterUi.mode = (isAuthenticatedUser && !mustHaveCharacterSlot()) || (!isAuthenticatedUser && hasSlots)
      ? "select"
      : "create";
    characterUi.selectionPurpose = "load_run";
    setCharacterOverlayStatus(
      characterUi.mode === "create"
        ? "Create a character to continue."
        : "Select or create a character to continue.",
      true
    );
    if (characterUi.mode === "create") resetCharacterCreationDraft(null, { step: "welcome" });
    setCharacterOverlayOpen(true);
    renderCharacterOverlay();
    return false;
  }
  setCharacterOverlayStatus("");
  setCharacterOverlayOpen(false);
  return true;
}

async function handleCharacterOverlayTertiary() {
  if (characterUi.loading || characterUi.mode !== "select") return;
  const selectedId = characterUi.selectedSaveId;
  if (!selectedId) return;
  const priorSlots = Array.isArray(characterUi.slots) ? [...characterUi.slots] : [];
  const slot = priorSlots.find((s) => s.id === selectedId);
  if (!slot) return;
  const deletedIdx = priorSlots.findIndex((s) => s.id === selectedId);
  const preferredNextId = (
    priorSlots[deletedIdx + 1]?.id ||
    priorSlots[deletedIdx - 1]?.id ||
    ""
  );
  const activeSlotIdBeforeDelete = String(getActiveCharacterSlotId() ?? "");
  if (!confirm(`Delete character slot "${slot.profile?.name ?? slot.name}"?`)) return;
  setCharacterOverlayStatus("");
  characterUi.loading = true;
  renderCharacterOverlay();
  try {
    let deletedActiveCharacter = false;
    if (isAuthenticatedUser) {
      const characterId = normalizeCharacterProfileId(
        normalizeCharacterProfileIdFromSlotId(selectedId) || slot.profile?.id || ""
      );
      if (!characterId) throw new Error("Could not resolve character id to delete.");
      const activeCharacterId = normalizeCharacterProfileId(
        normalizeCharacterProfileIdFromSlotId(activeSlotIdBeforeDelete) || ""
      );
      deletedActiveCharacter = !!(activeCharacterId && activeCharacterId === characterId);
      await saveApiRequest("POST", { action: "character_delete", character_id: characterId });
      characterUi.slots = await fetchCharacterSlotsFromServer();
    } else {
      deletedActiveCharacter = !!(activeSlotIdBeforeDelete && activeSlotIdBeforeDelete === selectedId);
      removeLocalSlot(selectedId);
      const localCharacterId = normalizeCharacterProfileId(slot.profile?.id ?? "");
      if (localCharacterId) {
        try { localStorage.removeItem(characterStatePayloadKey(localCharacterId)); } catch {}
      }
      characterUi.slots = await fetchCharacterSlotsFromLocal();
    }
    if (deletedActiveCharacter) setActiveCharacterSlotId("");
    const nextSelectedId = (
      (preferredNextId && characterUi.slots.some((s) => s.id === preferredNextId)) ? preferredNextId : (characterUi.slots[0]?.id ?? "")
    );
    characterUi.selectedSaveId = nextSelectedId;
    if (!characterUi.slots.length) {
      setActiveCharacterSlotId("");
      requiresCharacterCreation = true;
      characterUi.mode = "create";
      characterUi.selectionPurpose = "load_run";
      setCharacterOverlayStatus("Create a character to continue.", true);
      resetCharacterCreationDraft(null, { step: "welcome" });
    } else {
      if (deletedActiveCharacter && characterUi.selectedSaveId) {
        const switched = await swapCharacterFromSlotIntoCurrentRun(characterUi.selectedSaveId);
        if (!switched) {
          setActiveCharacterSlotId(characterUi.selectedSaveId);
          setCharacterOverlayStatus("Character deleted, but auto-switch to the next character failed.", true);
        }
      } else if (activeSlotIdBeforeDelete === selectedId) {
        setActiveCharacterSlotId(characterUi.selectedSaveId);
      }
      if (isAuthenticatedUser) refreshCharacterCreationRequirement();
    }
  } catch (err) {
    setCharacterOverlayStatus(err?.message ?? "Could not delete character slot.", true);
  } finally {
    characterUi.loading = false;
    renderCharacterOverlay();
  }
}
async function startCharacterFlow() {
  if (!characterOverlayEl) return;
  setCharacterOverlayStatus("");
  if (isAuthenticatedUser) {
    requiresCharacterCreation = true;
    let allowResumeWithoutOverlay = false;
    try {
      characterUi.loading = true;
      setCharacterOverlayOpen(true);
      characterOverlayTitleEl.textContent = "Loading Characters";
      characterOverlaySubtitleEl.textContent = "Fetching your saved character slots...";
      characterOverlayBodyEl.textContent = "Please wait...";
      characterOverlayPrimaryEl.style.display = "none";
      characterOverlaySecondaryEl.style.display = "none";
      characterOverlayTertiaryEl.style.display = "none";
      characterUi.slots = await fetchCharacterSlotsFromServer();
      const activeId = getActiveCharacterSlotId();
      const hasSlots = characterUi.slots.length > 0;
      const activeSlotExists = !!(activeId && characterUi.slots.some((slot) => slot.id === activeId));
      characterUi.selectedSaveId = activeSlotExists ? activeId : (characterUi.slots[0]?.id || "");
      characterUi.selectionPurpose = "load_run";
      characterUi.mode = hasSlots ? "select" : "create";
      // On refresh, keep the in-progress run if the account still has at least one slot.
      // We only block resume when there are zero slots (all characters deleted).
      if (bootLoadedFromLocalSave && hasSlots) {
        if (!activeSlotExists && characterUi.selectedSaveId) setActiveCharacterSlotId(characterUi.selectedSaveId);
        requiresCharacterCreation = false;
        setCharacterOverlayStatus("");
        allowResumeWithoutOverlay = true;
        return;
      }
      if (!hasSlots) {
        setActiveCharacterSlotId("");
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        bootLoadedFromLocalSave = false;
      }
      if (characterUi.mode === "create") {
        resetCharacterCreationDraft(null, { step: "welcome" });
        setCharacterOverlayStatus("Create a character to continue.", true);
      } else {
        setCharacterOverlayStatus("Select or create a character to continue.", true);
      }
    } catch {
      characterUi.mode = "create";
      characterUi.selectionPurpose = "load_run";
      requiresCharacterCreation = true;
      setCharacterOverlayStatus("Could not load your character slots. Create a new one to continue.", true);
      resetCharacterCreationDraft(null, { step: "welcome" });
    } finally {
      characterUi.loading = false;
      if (allowResumeWithoutOverlay) {
        setCharacterOverlayOpen(false);
      } else {
        setCharacterOverlayOpen(true);
        renderCharacterOverlay();
      }
    }
    return;
  }
  characterUi.loading = false;
  characterUi.slots = await fetchCharacterSlotsFromLocal();
  const activeId = getActiveCharacterSlotId();
  const hasSlots = characterUi.slots.length > 0;
  const activeSlotExists = !!(activeId && characterUi.slots.some((slot) => slot.id === activeId));
  characterUi.selectedSaveId = activeSlotExists ? activeId : (characterUi.slots[0]?.id || "");
  if (!activeSlotExists && characterUi.selectedSaveId) setActiveCharacterSlotId(characterUi.selectedSaveId);
  characterUi.selectionPurpose = "load_run";
  characterUi.mode = hasSlots ? "select" : "create";
  if (bootLoadedFromLocalSave) {
    requiresCharacterCreation = false;
    setCharacterOverlayOpen(false);
    return;
  }
  requiresCharacterCreation = true;
  if (hasSlots) {
    setCharacterOverlayStatus("Select or create a character to continue.", true);
  } else {
    resetCharacterCreationDraft(null, { step: "welcome" });
    setCharacterOverlayStatus("Create a character to continue.", true);
  }
  setCharacterOverlayOpen(true);
  renderCharacterOverlay();
}

function hasPendingSaveAfterLoginHandoff() {
  if (!isAuthenticatedUser) return false;
  try {
    const raw = localStorage.getItem(SAVE_LOGIN_HANDOFF_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) {
      localStorage.removeItem(SAVE_LOGIN_HANDOFF_KEY);
      return false;
    }
    const ageMs = Date.now() - ts;
    if (ageMs < 0 || ageMs > 30 * 60 * 1000) {
      localStorage.removeItem(SAVE_LOGIN_HANDOFF_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function clearPendingSaveAfterLoginHandoff() {
  try { localStorage.removeItem(SAVE_LOGIN_HANDOFF_KEY); } catch {}
}

function buildGuestImportPromptSummary(state) {
  const profile = ensureCharacterState(state);
  const className = characterClassDef(profile?.classId).name;
  const speciesName = characterSpeciesDef(profile?.speciesId).name;
  const level = Math.max(1, Math.floor(state?.player?.level ?? 1));
  const depth = Math.trunc(state?.player?.z ?? 0);
  return {
    profile,
    text: `"${profile?.name ?? DEFAULT_CHARACTER_NAME}" (${speciesName} ${className}, Lvl ${level}, Depth ${depth})`,
  };
}

async function importGuestCharacterFromCurrentRun(options = null) {
  if (!isAuthenticatedUser || !game) return false;
  const opts = (options && typeof options === "object") ? options : {};
  const snapshot = exportCharacterSnapshot(game);
  const profile = normalizeCharacterProfile(snapshot?.character ?? game.character ?? null);
  snapshot.character = profile;
  const payload = encodeCharacterSnapshotPayload(snapshot);
  if (!payload) return false;

  await saveApiRequest("POST", {
    action: "character_sync",
    character_id: profile.id,
    name: profile.name,
    payload,
  });

  const importedSlotId = characterStateSlotId(profile.id);
  if (importedSlotId) setActiveCharacterSlotId(importedSlotId);

  try {
    characterUi.slots = await fetchCharacterSlotsFromServer();
  } catch {
    characterUi.slots = characterUi.slots ?? [];
  }

  const importedExists = !!(importedSlotId && characterUi.slots.some((slot) => slot.id === importedSlotId));
  characterUi.selectedSaveId = importedExists
    ? importedSlotId
    : (characterUi.slots[0]?.id || importedSlotId || "");
  if (characterUi.selectedSaveId) setActiveCharacterSlotId(characterUi.selectedSaveId);
  characterUi.mode = characterUi.slots.length ? "select" : "create";
  if (characterUi.mode === "create") {
    resetCharacterCreationDraft(null, { step: "welcome" });
    requiresCharacterCreation = true;
  } else {
    requiresCharacterCreation = false;
  }
  setCharacterOverlayStatus("");
  clearPendingSaveAfterLoginHandoff();
  markCharacterStateDirty(game, "import-guest-character");
  void syncCharacterStateIfDirty("import-guest-character");
  if (opts.closeOverlay !== false && isCharacterOverlayOpen()) {
    setCharacterOverlayOpen(false);
  } else if (isCharacterOverlayOpen()) {
    renderCharacterOverlay();
  }
  return true;
}

async function maybeHandlePostLoginGuestImport() {
  if (!isAuthenticatedUser || !game) return;
  if (!hasPendingSaveAfterLoginHandoff()) return;
  const summary = buildGuestImportPromptSummary(game);
  const shouldImport = confirm(
    `Import your guest character ${summary.text} into this account?\n\n` +
    "Choose Cancel to skip import."
  );
  if (!shouldImport) {
    clearPendingSaveAfterLoginHandoff();
    return;
  }
  try {
    const imported = await importGuestCharacterFromCurrentRun({ closeOverlay: true });
    if (imported) {
      pushLog(game, "Guest character imported. Use Save Game to store this dungeon run on the server.");
    } else {
      pushLog(game, "Could not import guest character.");
    }
  } catch {
    pushLog(game, "Could not import guest character.");
  }
}
async function openCharacterSelectionOverlay(options = null) {
  if (!characterOverlayEl) return;
  const opts = (options && typeof options === "object") ? options : {};
  const requestedPurpose = normalizeCharacterSelectionPurpose(opts.purpose);
  if (!isAuthenticatedUser) {
    characterUi.loading = false;
    characterUi.slots = await fetchCharacterSlotsFromLocal();
    const activeId = getActiveCharacterSlotId();
    const hasSlots = characterUi.slots.length > 0;
    const activeSlotExists = !!(activeId && characterUi.slots.some((slot) => slot.id === activeId));
    characterUi.selectedSaveId = activeSlotExists ? activeId : (characterUi.slots[0]?.id || "");
    if (!activeSlotExists && characterUi.selectedSaveId) setActiveCharacterSlotId(characterUi.selectedSaveId);
    characterUi.mode = hasSlots ? "select" : "create";
    characterUi.selectionPurpose = hasSlots ? requestedPurpose : "load_run";
    if (!hasSlots && !bootLoadedFromLocalSave) {
      requiresCharacterCreation = true;
      setCharacterOverlayStatus("Create a character to continue.", true);
    } else {
      requiresCharacterCreation = false;
      setCharacterOverlayStatus("");
    }
    if (characterUi.mode === "create") resetCharacterCreationDraft(null, { step: "welcome" });
    setCharacterOverlayOpen(true);
    renderCharacterOverlay();
    return;
  }
  setCharacterOverlayStatus("");
  characterUi.loading = true;
  setCharacterOverlayOpen(true);
  characterOverlayTitleEl.textContent = "Loading Characters";
  characterOverlaySubtitleEl.textContent = "Fetching your saved character slots...";
  characterOverlayBodyEl.textContent = "Please wait...";
  characterOverlayPrimaryEl.style.display = "none";
  characterOverlaySecondaryEl.style.display = "none";
  characterOverlayTertiaryEl.style.display = "none";
  try {
    characterUi.slots = await fetchCharacterSlotsFromServer();
    const activeId = getActiveCharacterSlotId();
    characterUi.selectedSaveId = activeId || characterUi.slots[0]?.id || "";
    characterUi.selectionPurpose = mustHaveCharacterSlot() ? "load_run" : requestedPurpose;
    characterUi.mode = characterUi.slots.length ? "select" : "create";
    refreshCharacterCreationRequirement();
    if (characterUi.selectionPurpose === "swap_character") requiresCharacterCreation = false;
    if (characterUi.mode === "create") resetCharacterCreationDraft(null, { step: "welcome" });
  } catch {
    characterUi.mode = "create";
    characterUi.selectionPurpose = requestedPurpose;
    refreshCharacterCreationRequirement();
    if (characterUi.selectionPurpose === "swap_character") requiresCharacterCreation = false;
    setCharacterOverlayStatus(
      "Could not load your character slots. Create a new one to continue.",
      true
    );
    resetCharacterCreationDraft(null, { step: "welcome" });
  } finally {
    characterUi.loading = false;
    renderCharacterOverlay();
  }
}

function stairContextLabel(state, dir) {
  const z = state?.player?.z ?? 0;
  if (dir === "down" && z === SURFACE_LEVEL) return "Enter dungeon";
  if (dir === "up" && z === 0) return "Ascend to surface";
  return dir === "down" ? "Descend Stairs" : "Ascend Stairs";
}

function resolveContextAction(state, occupancy = null) {
  const p = state.player;
  if (p.dead) return null;
  const trapHere = getTrapAt(state, p.x, p.y, p.z, { requireArmed: true, requireRevealed: true });
  if (trapHere) {
    return {
      type: "disarm-trap",
      label: "Disarm Trap",
      run: () => disarmTrapAtPlayer(state),
    };
  }

  const occ = occupancy ?? buildOccupancy(state);
  if (shouldShowPotionContext(state)) {
    return {
      type: "use-potion",
      label: "Use Potion",
      run: () => usePotionFromContext(state),
    };
  }

  const attackTarget = getAdjacentMonsterTarget(state, occ);
  if (attackTarget) {
    const nm = monsterDisplayName(attackTarget, state.player.z);
    return {
      type: "attack",
      targetMonsterId: attackTarget.id,
      monsterType: attackTarget.type,
      label: `Attack ${nm}`,
      run: () => attackMonsterById(state, attackTarget.id),
    };
  }

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN) return { type: "stairs-down", label: stairContextLabel(state, "down"), run: () => tryUseStairs(state, "down") };
  if (here === STAIRS_UP) return { type: "stairs-up", label: stairContextLabel(state, "up"), run: () => tryUseStairs(state, "up") };

  const itemsHere = getItemsAt(state, p.x, p.y, p.z);
  if (itemsHere.length) {
    const shop = itemsHere.find((e) => e.type === "shopkeeper");
    if (shop) return { type: "shop", label: "Open Shop", run: () => interactShopkeeper(state) };

    const takeable = itemsHere.filter((e) => isDirectlyTakeableItem(e.type));
    if (takeable.length) {
      const target = takeable[0];
      const nm = titleCaseLowerLabel(ITEM_TYPES[target.type]?.name ?? target.type);
      const more = takeable.length > 1 ? ` (+${takeable.length - 1} more)` : "";
      return {
        type: "pickup",
        pickupType: target.type,
        label: `Take ${nm}${more}`,
        run: () => pickup(state),
      };
    }

    const shrine = itemsHere.find((e) => e.type === "shrine");
    if (shrine) return { type: "shrine", label: "Pray at Shrine", run: () => interactShrine(state) };
  }

  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (!isOpenDoorTile(t)) continue;
    const blocked = occ.monsters.get(keyXYZ(x, y, p.z)) || occ.items.get(keyXYZ(x, y, p.z));
    if (blocked) continue;
    return { type: "close-door", label: "Close Door", run: () => tryCloseAdjacentDoor(state) };
  }
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (t === DOOR_CLOSED) return { type: "open-door", label: "Open Door", run: () => tryOpenAdjacentDoor(state) };
  }
  return null;
}

function monsterThreatScore(state, monster) {
  const spec = monsterStatsForDepth(monster?.type, monster?.z ?? state.player.z);
  const level = Math.max(1, spec?.level ?? 1);
  const maxHp = Math.max(1, spec?.maxHp ?? 1);
  const atkHi = Math.max(1, spec?.atkHi ?? 1);
  const atkLo = Math.max(1, spec?.atkLo ?? 1);
  return level * 100000 + maxHp * 8 + atkHi * 6 + atkLo * 3;
}

function playerWeaponAttackProfile(state) {
  return resolvePlayerAttackProfile(state);
}

function hasAdjacentMonster(state, occupancy = null) {
  const p = state.player;
  const occ = occupancy ?? buildOccupancy(state);
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    if (occ.monsters.has(keyXYZ(p.x + dx, p.y + dy, p.z))) return true;
  }
  return false;
}

function playerCanAttackMonster(state, monster, profile = null, occupancy = null) {
  if (!monster || monster.kind !== "monster") return false;
  const p = state.player;
  if (!p || p.dead) return false;
  if (monster.z !== p.z) return false;
  const atkProfile = profile ?? playerWeaponAttackProfile(state);
  const dist = Math.abs((monster.x ?? 0) - p.x) + Math.abs((monster.y ?? 0) - p.y);
  const minRange = Math.max(1, Math.floor(atkProfile?.minRange ?? 1));
  const maxRange = Math.max(minRange, Math.floor(atkProfile?.range ?? 1));
  if (dist < minRange || dist > maxRange) return false;
  if (atkProfile?.kind === "melee") return dist === 1;
  if (atkProfile?.cannotFireAdjacent && hasAdjacentMonster(state, occupancy)) return false;
  if (atkProfile?.requiresLOS && !hasLineOfSight(state.world, p.z, p.x, p.y, monster.x, monster.y)) return false;
  return true;
}

function getAttackableMonsters(state, occupancy = null, profile = null) {
  const p = state.player;
  const atkProfile = profile ?? playerWeaponAttackProfile(state);
  const out = [];
  for (const ent of state.entities.values()) {
    if (!ent || ent.kind !== "monster") continue;
    if (ent.z !== p.z) continue;
    if (!playerCanAttackMonster(state, ent, atkProfile, occupancy)) continue;
    const dist = Math.abs((ent.x ?? 0) - p.x) + Math.abs((ent.y ?? 0) - p.y);
    out.push({ monster: ent, dist, score: monsterThreatScore(state, ent) });
  }
  out.sort((a, b) =>
    (b.score - a.score) ||
    (a.dist - b.dist) ||
    ((a.monster?.id ?? "").localeCompare(b.monster?.id ?? ""))
  );
  return out;
}

function getAdjacentMonsterTarget(state, occupancy = null) {
  const list = getAttackableMonsters(state, occupancy, playerWeaponAttackProfile(state));
  return list.length ? list[0].monster : null;
}

function getAdjacentMonsters(state, occupancy = null) {
  const p = state.player;
  const occ = occupancy ?? buildOccupancy(state);
  const dirs = [
    { dx: 0, dy: -1, dir: "N" },
    { dx: 1, dy: 0, dir: "E" },
    { dx: 0, dy: 1, dir: "S" },
    { dx: -1, dy: 0, dir: "W" },
  ];
  const out = [];
  for (const d of dirs) {
    const x = p.x + d.dx;
    const y = p.y + d.dy;
    const id = occ.monsters.get(keyXYZ(x, y, p.z));
    if (!id) continue;
    const m = state.entities.get(id);
    if (!m || m.kind !== "monster") continue;
    out.push({ monster: m, dir: d.dir, order: out.length, score: monsterThreatScore(state, m) });
  }
  out.sort((a, b) =>
    (b.score - a.score) ||
    ((b.monster?.hp ?? 0) - (a.monster?.hp ?? 0)) ||
    (a.order - b.order)
  );
  return out;
}

function attackAdjacentMonster(state, occupancy = null) {
  const m = getAdjacentMonsterTarget(state, occupancy);
  if (!m) {
    pushLog(state, "No adjacent monster to attack.");
    return false;
  }
  playerAttack(state, m);
  return true;
}

function attackMonsterById(state, monsterId) {
  const m = state.entities.get(monsterId);
  const profile = playerWeaponAttackProfile(state);
  if (!m || m.kind !== "monster" || m.z !== state.player.z) {
    pushLog(state, "That enemy is no longer in range.");
    return false;
  }
  if (!playerCanAttackMonster(state, m, profile)) {
    if (profile?.kind === "ranged" && profile?.cannotFireAdjacent && hasAdjacentMonster(state)) {
      pushLog(state, "An adjacent enemy prevents you from firing.");
    } else if (profile?.kind === "ranged") {
      pushLog(state, "Target is out of range or line of sight.");
    } else {
      pushLog(state, "That enemy is no longer adjacent.");
    }
    return false;
  }
  playerAttack(state, m);
  return true;
}

function iconSpecForItemType(type) {
  if (!type) return null;
  const spriteId = itemSpriteId({ type });
  if (spriteId && SPRITE_SOURCES[spriteId]) return { spriteId };
  const glyphInfo = itemGlyph(type);
  if (glyphInfo) return { glyph: glyphInfo.g, color: glyphInfo.c };
  return null;
}

function iconSpecForMonsterType(type) {
  if (!type) return null;
  const spriteId = monsterSpriteId(type);
  if (spriteId && SPRITE_SOURCES[spriteId]) return { spriteId };
  const glyphInfo = monsterGlyph(type);
  if (glyphInfo) return { glyph: glyphInfo.g, color: glyphInfo.c };
  return null;
}

function iconSpecForContextAction(state, action) {
  if (!action) return null;
  if (action.type === "use-potion") return iconSpecForItemType("potion");
  if (action.type === "attack") {
    const mType = action.monsterType ?? state.entities.get(action.targetMonsterId)?.type ?? null;
    return iconSpecForMonsterType(mType);
  }
  if (action.type === "pickup") {
    return iconSpecForItemType(action.pickupType ?? null);
  }
  if (action.type === "disarm-trap") return { glyph: "X", color: "#ffb26b" };
  if (action.type === "shop") return iconSpecForItemType("shopkeeper");
  if (action.type === "shrine") return iconSpecForItemType("shrine");
  if (action.type === "open-door") {
    const g = tileGlyph(DOOR_CLOSED);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  if (action.type === "close-door") {
    const g = tileGlyph(DOOR_OPEN);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  if (action.type === "stairs-up") {
    if (state.player.z === 0) return { spriteId: "surface_entrance" };
    if (SPRITE_SOURCES.stairs_up) return { spriteId: "stairs_up" };
    const g = tileGlyph(STAIRS_UP);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  if (action.type === "stairs-down") {
    if (state.player.z === SURFACE_LEVEL) return { spriteId: "surface_entrance" };
    if (SPRITE_SOURCES.stairs_down) return { spriteId: "stairs_down" };
    const g = tileGlyph(STAIRS_DOWN);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  return null;
}

function setContextButtonContent(btn, label, iconSpec = null) {
  if (!btn) return;
  btn.innerHTML = "";
  const content = document.createElement("span");
  content.className = "contextBtnContent";

  if (iconSpec) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "contextBtnIcon";
    if (iconSpec.spriteId && SPRITE_SOURCES[iconSpec.spriteId]) {
      const img = document.createElement("img");
      img.src = SPRITE_SOURCES[iconSpec.spriteId];
      img.alt = "";
      iconWrap.appendChild(img);
    } else if (iconSpec.glyph) {
      const glyph = document.createElement("span");
      glyph.className = "contextBtnGlyph";
      glyph.textContent = iconSpec.glyph;
      if (iconSpec.color) glyph.style.color = iconSpec.color;
      iconWrap.appendChild(glyph);
    }
    if (iconWrap.childNodes.length) content.appendChild(iconWrap);
  }

  const text = document.createElement("span");
  text.className = "contextBtnText";
  text.textContent = label;
  content.appendChild(text);

  btn.appendChild(content);
}

function updateDpadCenterButton(state, action) {
  if (!dpadCenterBtnEl) return;
  const iconSpec = action ? iconSpecForContextAction(state, action) : null;
  const signature = [
    action?.type ?? "none",
    action?.label ?? "",
    action?.targetMonsterId ?? "",
    action?.pickupType ?? "",
    iconSpec?.spriteId ?? "",
    iconSpec?.glyph ?? "",
    iconSpec?.color ?? "",
  ].join("|");
  if (signature === dpadCenterSignature) return;
  dpadCenterSignature = signature;

  dpadCenterBtnEl.innerHTML = "";
  const label = action?.label ?? "Context Action";
  dpadCenterBtnEl.title = label;
  dpadCenterBtnEl.setAttribute("aria-label", label);

  if (iconSpec?.spriteId && SPRITE_SOURCES[iconSpec.spriteId]) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "dpadCenterIcon";
    const img = document.createElement("img");
    img.src = SPRITE_SOURCES[iconSpec.spriteId];
    img.alt = "";
    iconWrap.appendChild(img);
    dpadCenterBtnEl.appendChild(iconWrap);
    return;
  }

  if (iconSpec?.glyph) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "dpadCenterIcon";
    const glyph = document.createElement("span");
    glyph.className = "dpadCenterGlyph";
    glyph.textContent = iconSpec.glyph;
    if (iconSpec.color) glyph.style.color = iconSpec.color;
    iconWrap.appendChild(glyph);
    dpadCenterBtnEl.appendChild(iconWrap);
    return;
  }

  const fallback = document.createElement("span");
  fallback.className = "dpadCenterFallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = "\u25CF";
  dpadCenterBtnEl.appendChild(fallback);
}

function updateContextActionButton(state, occupancy = null) {
  if (!contextActionBtn) return;
  const action = resolveContextAction(state, occupancy);
  if (!action) {
    contextActionBtn.disabled = true;
    setContextButtonContent(contextActionBtn, "No Action", null);
    contextActionBtn.dataset.actionType = "none";
    updateDpadCenterButton(state, null);
    updatePotionContextButton(state, null);
    updateAttackContextButtons(state, occupancy, null);
    return;
  }
  contextActionBtn.disabled = false;
  setContextButtonContent(contextActionBtn, action.label, iconSpecForContextAction(state, action));
  contextActionBtn.dataset.actionType = action.type;
  updateDpadCenterButton(state, action);

  updatePotionContextButton(state, action);
  updateAttackContextButtons(state, occupancy, action);
}

function findPotionInventoryIndex(state) {
  return state.inv.findIndex((x) => x.type === "potion" && (x.amount ?? 0) > 0);
}

function shouldShowPotionContext(state) {
  const p = state.player;
  if (p.dead) return false;
  const maxHp = Math.max(1, p.maxHp || 1);
  if (p.hp > Math.floor(maxHp * 0.15)) return false;
  return findPotionInventoryIndex(state) >= 0;
}

function usePotionFromContext(state) {
  const idx = findPotionInventoryIndex(state);
  if (idx < 0) {
    pushLog(state, "No potion available.");
    return false;
  }
  useInventoryIndex(state, idx);
  return false;
}

function updatePotionContextButton(state, primaryAction = null) {
  if (!contextPotionBtn) return;
  if (primaryAction?.type === "use-potion") {
    contextPotionBtn.style.display = "none";
    contextPotionBtn.disabled = true;
    return;
  }
  if (!shouldShowPotionContext(state)) {
    contextPotionBtn.style.display = "none";
    contextPotionBtn.disabled = true;
    return;
  }
  contextPotionBtn.style.display = "";
  contextPotionBtn.disabled = false;
  setContextButtonContent(contextPotionBtn, "Use Potion", iconSpecForItemType("potion"));
}

function buildAuxContextActions(state, occupancy = null, primaryAction = null) {
  const p = state.player;
  const occ = occupancy ?? buildOccupancy(state);
  const actions = [];

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN && primaryAction?.type !== "stairs-down") {
    actions.push({
      id: "aux|stairs-down",
      type: "stairs-down",
      label: stairContextLabel(state, "down"),
      run: () => tryUseStairs(state, "down"),
    });
  }
  if (here === STAIRS_UP && primaryAction?.type !== "stairs-up") {
    actions.push({
      id: "aux|stairs-up",
      type: "stairs-up",
      label: stairContextLabel(state, "up"),
      run: () => tryUseStairs(state, "up"),
    });
  }

  const attackables = getAttackableMonsters(state, occ, playerWeaponAttackProfile(state));
  for (const entry of attackables) {
    const id = entry.monster.id;
    if (primaryAction?.type === "attack" && primaryAction?.targetMonsterId === id) continue;
    const nm = monsterDisplayName(entry.monster, state.player.z);
    const distLabel = entry.dist > 1 ? ` (${entry.dist} tiles)` : "";
    actions.push({
      id: `aux|attack|${id}`,
      type: "attack",
      targetMonsterId: id,
      monsterType: entry.monster.type,
      label: `Attack ${nm}${distLabel}`,
      run: () => attackMonsterById(state, id),
    });
  }

  const itemsHere = getItemsAt(state, p.x, p.y, p.z);
  if (itemsHere.length) {
    const shop = itemsHere.find((e) => e.type === "shopkeeper");
    if (shop && primaryAction?.type !== "shop") {
      actions.push({
        id: "aux|shop",
        type: "shop",
        label: "Open Shop",
        run: () => interactShopkeeper(state),
      });
    }

    const takeable = itemsHere.filter((e) => isDirectlyTakeableItem(e.type));
    if (takeable.length && primaryAction?.type !== "pickup") {
      const target = takeable[0];
      const nm = titleCaseLowerLabel(ITEM_TYPES[target.type]?.name ?? target.type);
      const more = takeable.length > 1 ? ` (+${takeable.length - 1} more)` : "";
      actions.push({
        id: `aux|pickup|${target.type}|${takeable.length}`,
        type: "pickup",
        pickupType: target.type,
        label: `Take ${nm}${more}`,
        run: () => pickup(state),
      });
    }

    const shrine = itemsHere.find((e) => e.type === "shrine");
    if (shrine && primaryAction?.type !== "shrine") {
      actions.push({
        id: "aux|shrine",
        type: "shrine",
        label: "Pray at Shrine",
        run: () => interactShrine(state),
      });
    }
  }

  return actions;
}

function updateAttackContextButtons(state, occupancy = null, primaryAction = null) {
  if (!contextAttackListEl) return;
  const actions = buildAuxContextActions(state, occupancy, primaryAction);
  const signature = actions.map((a) => `${a.id}|${a.label}`).join("||");
  if (signature === contextAuxSignature) return;
  contextAuxSignature = signature;

  if (!actions.length) {
    contextAttackListEl.style.display = "none";
    contextAttackListEl.classList.remove("grid");
    contextAttackListEl.innerHTML = "";
    return;
  }

  contextAttackListEl.innerHTML = "";
  contextAttackListEl.classList.remove("grid");
  contextAttackListEl.style.display = "flex";
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "contextAttackBtn";
    setContextButtonContent(btn, action.label, iconSpecForContextAction(state, action));
    btn.addEventListener("click", () => {
      takeTurn(state, action.run());
    });
    contextAttackListEl.appendChild(btn);
  }
}

function isStackable(type) {
  return type === "potion" ||
    type.startsWith("key_") ||
    type.startsWith("weapon_") || type.startsWith("armor_");
}
function potionCapacityForState(state) {
  const classId = state?.player?.classId ?? state?.character?.classId ?? DEFAULT_CHARACTER_CLASS_ID;
  const classDef = characterClassDef(classId);
  return Math.max(1, BASE_POTION_CAPACITY + Math.max(0, Math.floor(classDef.potionCapBonus ?? 0)));
}
function invAdd(state, type, amount = 1) {
  if (type === "potion") {
    const cap = potionCapacityForState(state);
    const cur = invCount(state, "potion");
    amount = Math.max(0, Math.min(Math.floor(amount), cap - cur));
    if (amount <= 0) return;
  }
  if (isStackable(type)) {
    const idx = state.inv.findIndex((x) => x.type === type);
    if (idx >= 0) state.inv[idx].amount += amount;
    else state.inv.push({ type, amount });
  } else {
    for (let i = 0; i < amount; i++) state.inv.push({ type, amount: 1 });
  }
}
function invConsume(state, type, amount = 1) {
  const idx = state.inv.findIndex((x) => x.type === type);
  if (idx < 0) return false;
  const it = state.inv[idx];
  if (it.amount < amount) return false;
  it.amount -= amount;
  if (it.amount <= 0) state.inv.splice(idx, 1);
  return true;
}
function invCount(state, type) {
  return state.inv.find((x) => x.type === type)?.amount ?? 0;
}

function xpToNext(level) {
  const lv = Math.max(1, Math.floor(level ?? 1));
  const base = (8 + lv * 6) * XP_SCALE;
  const earlyT = clamp((XP_TO_NEXT_EARLY_FADE_LEVEL - lv) / Math.max(1, XP_TO_NEXT_EARLY_FADE_LEVEL - 1), 0, 1);
  const earlyMult = 1 + XP_TO_NEXT_EARLY_MULT * earlyT;
  const levelRampMult = 1 + Math.max(0, lv - 1) * XP_TO_NEXT_LEVEL_RAMP;
  return Math.max(1, Math.round(base * earlyMult * levelRampMult));
}

function hpGainForLevel(level) {
  const lv = Math.max(1, Math.floor(level));
  return (4 + Math.floor((lv - 1) / 4)) * PLAYER_STAT_SCALE;
}

function playerLevelScale(level) {
  const lv = Math.max(1, Math.floor(level ?? 1));
  // Mirror monster depth scaling so player HP progression tracks deeper-floor lethality.
  return monsterDepthScale(Math.max(0, lv - 1));
}

function progressionCurveT(level, maxLevel = PLAYER_PROGRESSION_CURVE_LEVEL) {
  const lv = Math.max(1, Math.floor(level ?? 1));
  const maxLv = Math.max(2, Math.floor(maxLevel ?? PLAYER_PROGRESSION_CURVE_LEVEL));
  return clamp((lv - 1) / (maxLv - 1), 0, 1);
}

function playerOffenseLevelWeight(level) {
  return lerp(PLAYER_OFFENSE_LEVEL_WEIGHT_EARLY, PLAYER_OFFENSE_LEVEL_WEIGHT_LATE, progressionCurveT(level, PLAYER_PROGRESSION_CURVE_LEVEL));
}

function playerDefenseLevelWeight(level) {
  return lerp(PLAYER_DEFENSE_LEVEL_WEIGHT_EARLY, PLAYER_DEFENSE_LEVEL_WEIGHT_LATE, progressionCurveT(level, PLAYER_PROGRESSION_CURVE_LEVEL));
}

function playerWeaponAtkScale(level) {
  return lerp(
    PLAYER_WEAPON_ATK_SCALE_EARLY,
    PLAYER_WEAPON_ATK_SCALE_LATE,
    progressionCurveT(level, PLAYER_WEAPON_ATK_SCALE_CURVE_LEVEL)
  );
}

function playerFlatAtkBonus(level) {
  const lv = Math.max(1, Math.floor(level ?? 1));
  const scaled = Math.pow(Math.max(0, lv - 1), PLAYER_LEVEL_FLAT_ATK_CURVE_EXP) * PLAYER_STAT_SCALE * PLAYER_LEVEL_FLAT_ATK_SCALE;
  return Math.max(0, Math.round(scaled));
}

function maxHpForLevel(level, profile = null) {
  const lv = Math.max(1, Math.floor(level));
  const char = normalizeCharacterProfile(profile ?? null);
  const species = characterSpeciesDef(char.speciesId);
  const classDef = characterClassDef(char.classId);
  const vit = Math.max(0, Math.floor(char.stats?.vit ?? DEFAULT_CHARACTER_STATS.vit));
  const hpMult = (species.hpMult ?? 1) * (classDef.hpMult ?? 1);
  let hp = Math.max(1, Math.round((70 + vit * 18) * PLAYER_STAT_SCALE * hpMult * playerLevelScale(lv)));
  for (let l = 2; l <= lv; l++) hp += hpGainForLevel(l);
  return hp;
}

function materialTierIndexFromId(materialId) {
  if (!materialId) return -1;
  return METAL_TIERS.findIndex((tier) => tier.id === materialId);
}

function itemMaterialTierIndex(type) {
  return materialTierIndexFromId(materialIdFromItemType(type));
}

function expectedMaterialTierIndexForDepth(depth) {
  const weighted = materialWeightsForDepth(depth);
  if (!Array.isArray(weighted) || weighted.length <= 0) return 0;
  let totalW = 0;
  let weightedTier = 0;
  for (const entry of weighted) {
    const idx = materialTierIndexFromId(entry?.id);
    if (idx < 0) continue;
    const w = Math.max(0, Number(entry?.w ?? 0));
    if (w <= 0) continue;
    totalW += w;
    weightedTier += idx * w;
  }
  if (totalW <= 0) return 0;
  return weightedTier / totalW;
}

function playerGearTierProfileForXp(state) {
  const equip = state?.player?.equip ?? {};
  const weaponTierRaw = itemMaterialTierIndex(equip.weapon);
  const weaponTier = weaponTierRaw >= 0 ? weaponTierRaw : 0;
  const armorTiers = [equip.head, equip.chest, equip.legs]
    .map((type) => itemMaterialTierIndex(type))
    .filter((idx) => idx >= 0);
  const armorTier = armorTiers.length
    ? (armorTiers.reduce((sum, idx) => sum + idx, 0) / armorTiers.length)
    : 0;
  return { weaponTier, armorTier };
}

function ensureDepthKillCounters(state) {
  if (!state || typeof state !== "object") return {};
  if (!state.xpDepthKills || typeof state.xpDepthKills !== "object") state.xpDepthKills = {};
  return state.xpDepthKills;
}

function depthKillCountForDepth(state, depth) {
  const counters = ensureDepthKillCounters(state);
  const d = Math.max(0, Math.floor(depth ?? 0));
  return Math.max(0, Math.floor(Number(counters[d] ?? 0) || 0));
}

function depthKillSoftcap(depth) {
  const d = Math.max(0, Math.floor(depth ?? 0));
  return Math.max(1, XP_DEPTH_KILL_SOFTCAP_BASE + d * XP_DEPTH_KILL_SOFTCAP_PER_DEPTH);
}

function depthKillDiminishingMult(state, depth) {
  const kills = depthKillCountForDepth(state, depth);
  const softcap = depthKillSoftcap(depth);
  if (kills <= softcap) return 1;
  const extra = kills - softcap;
  const penalty = Math.min(XP_DEPTH_KILL_PENALTY_CAP, extra * XP_DEPTH_KILL_PENALTY_PER_EXTRA);
  return Math.max(0.2, 1 - penalty);
}

function markDepthKillForXp(state, depth) {
  const counters = ensureDepthKillCounters(state);
  const d = Math.max(0, Math.floor(depth ?? 0));
  counters[d] = depthKillCountForDepth(state, d) + 1;
}

function xpChallengeMultiplier(state, monster = null, monsterSpec = null) {
  const p = state?.player;
  if (!p) return 1;
  const depth = Math.max(0, Math.floor(monster?.z ?? p.z ?? 0));
  const mSpec = monsterSpec ?? monsterStatsForDepth(monster?.type, depth);
  const playerLevel = Math.max(1, Math.floor(p.level ?? 1));
  const monsterLevel = Math.max(1, Math.floor(mSpec?.level ?? (depth + 1)));
  const levelDelta = monsterLevel - playerLevel;
  const levelMult = levelDelta >= 0
    ? (1 + Math.min(XP_LEVEL_DIFF_BONUS_CAP, levelDelta * XP_LEVEL_DIFF_BONUS_PER_LEVEL))
    : (1 - Math.min(XP_LEVEL_DIFF_PENALTY_CAP, (-levelDelta) * XP_LEVEL_DIFF_PENALTY_PER_LEVEL));

  const profile = state.character ?? ensureCharacterState(state);
  const deepestDepth = Math.max(depth, Math.floor(profile?.deepestDepth ?? p.z ?? depth));
  const farmDepthDelta = Math.max(0, deepestDepth - depth - XP_FARM_DEPTH_GRACE);
  const farmMult = 1 - Math.min(XP_FARM_DEPTH_PENALTY_CAP, farmDepthDelta * XP_FARM_DEPTH_PENALTY_PER_DEPTH);

  const expectedTier = expectedMaterialTierIndexForDepth(depth);
  const gear = playerGearTierProfileForXp(state);
  const weaponDelta = gear.weaponTier - expectedTier;
  const armorDelta = gear.armorTier - expectedTier;
  let tierAdj = 0;
  tierAdj += weaponDelta >= 0
    ? -Math.min(XP_GEAR_TIER_ADJ_CAP, weaponDelta * XP_WEAPON_TIER_OVERGEAR_PENALTY_PER_TIER)
    : Math.min(XP_GEAR_TIER_ADJ_CAP, -weaponDelta * XP_WEAPON_TIER_UNDERGEAR_BONUS_PER_TIER);
  tierAdj += armorDelta >= 0
    ? -Math.min(XP_GEAR_TIER_ADJ_CAP, armorDelta * XP_ARMOR_TIER_OVERGEAR_PENALTY_PER_TIER)
    : Math.min(XP_GEAR_TIER_ADJ_CAP, -armorDelta * XP_ARMOR_TIER_UNDERGEAR_BONUS_PER_TIER);
  const gearMult = Math.max(0.2, 1 + clamp(tierAdj, -XP_GEAR_TIER_ADJ_CAP, XP_GEAR_TIER_ADJ_CAP));

  const monsterBaseXp = Math.max(0, mSpec?.xp ?? resolveMonsterSpec(monster?.type)?.xp ?? 2);
  const threatBonus = Math.min(
    XP_MONSTER_THREAT_BONUS_CAP,
    Math.max(0, (monsterBaseXp - 8) * XP_MONSTER_THREAT_BONUS_PER_XP)
  );
  const threatMult = 1 + threatBonus;
  const repeatClearMult = depthKillDiminishingMult(state, depth);

  return clamp(levelMult * farmMult * gearMult * threatMult * repeatClearMult, XP_CHALLENGE_MIN_MULT, XP_CHALLENGE_MAX_MULT);
}

function xpFromDamage(dmg, monster = null) {
  const applied = Math.max(0, Math.floor(dmg ?? 0));
  if (!monster || typeof monster !== "object") {
    // Normalize combat-scaled damage back to legacy-sized units.
    return Math.max(0, Math.floor((applied / COMBAT_SCALE) * XP_DAMAGE_PER_LEGACY_DAMAGE));
  }
  const maxHp = Math.max(1, Math.floor(monster.maxHp ?? monster.hp ?? 1));
  const killBudget = xpKillBonus(monster.type, monster.z ?? 0);
  const hpShare = clamp(applied / maxHp, 0, 1);
  return Math.max(0, Math.floor(killBudget * XP_DAMAGE_REWARD_SHARE * hpShare));
}

function xpKillBonus(monsterType, monsterDepth = 0) {
  const base = Math.max(1, resolveMonsterSpec(monsterType)?.xp ?? 2);
  const depth = Math.max(0, Math.floor(monsterDepth ?? 0));
  const depthMult = 1 + Math.min(XP_KILL_DEPTH_BONUS_CAP, depth * XP_KILL_DEPTH_BONUS_PER_DEPTH);
  return Math.max(1, Math.round(base * XP_KILL_BONUS_PER_MONSTER_XP * depthMult));
}

function xpExplorationBonus(roomCount, corridorCount, depth = 0) {
  const rooms = Math.max(0, Math.floor(roomCount ?? 0));
  const corridors = Math.max(0, Math.floor(corridorCount ?? 0));
  const d = Math.max(0, Math.floor(depth ?? 0));
  const base = Math.max(0, rooms * EXPLORATION_XP_ROOM + corridors * EXPLORATION_XP_CORRIDOR);
  const depthMult = EXPLORATION_XP_DEPTH_BASE_MULT + Math.min(EXPLORATION_XP_DEPTH_BONUS_CAP, d * EXPLORATION_XP_DEPTH_PER_LEVEL);
  return Math.max(0, Math.round(base * depthMult));
}

function potionHealAmount(maxHp) {
  const hpMax = Math.max(1, Math.floor(maxHp ?? 1));
  return Math.max(1, Math.floor(hpMax * POTION_HEAL_PCT));
}

function recalcDerivedStats(state) {
  const profile = ensureCharacterState(state);
  const p = state.player;
  if (profile) {
    profile.speciesId = normalizeCharacterSpeciesId(profile.speciesId);
    profile.classId = normalizeCharacterClassId(profile.classId, profile.speciesId);
    profile.stats = normalizeCharacterStats(profile.stats, profile.speciesId);
    p.classId = profile.classId;
    p.speciesId = profile.speciesId;
  }
  const species = characterSpeciesDef(p.speciesId);
  const classDef = characterClassDef(p.classId);
  const stats = profile?.stats ?? normalizeCharacterStats(DEFAULT_CHARACTER_STATS, DEFAULT_CHARACTER_SPECIES_ID);
  const vit = Math.max(0, Math.floor(stats.vit ?? 0));
  const str = Math.max(0, Math.floor(stats.str ?? 0));
  const dex = Math.max(0, Math.floor(stats.dex ?? 0));
  const int = Math.max(0, Math.floor(stats.int ?? 0));
  const agi = Math.max(0, Math.floor(stats.agi ?? 0));

  const equip = p.equip ?? {};
  const weapon = p.equip.weapon ? WEAPONS[p.equip.weapon] : null;
  const headArmor = equip.head ? ARMOR_PIECES[equip.head] : null;
  const chestArmor = equip.chest ? ARMOR_PIECES[equip.chest] : null;
  const legsArmor = equip.legs ? ARMOR_PIECES[equip.legs] : null;

  const effAtk = state.player.effects
    .filter(e => e.type === "bless" || e.type === "curse")
    .reduce((s, e) => s + e.atkDelta, 0);
  const effAcc = state.player.effects
    .filter((e) => Number.isFinite(e?.accDelta))
    .reduce((s, e) => s + Number(e.accDelta), 0);
  const effEva = state.player.effects
    .filter((e) => Number.isFinite(e?.evaDelta))
    .reduce((s, e) => s + Number(e.evaDelta), 0);
  const effSpeedMult = state.player.effects
    .filter((e) => Number.isFinite(e?.speedMult))
    .reduce((m, e) => m * Math.max(0.2, Number(e.speedMult ?? 1)), 1);
  const weaponAtk = weapon?.atkBonus ?? 0;
  const armorRaw = (headArmor?.defBonus ?? 0) + (chestArmor?.defBonus ?? 0) + (legsArmor?.defBonus ?? 0);
  const level = Math.max(1, Math.floor(p.level ?? 1));
  const levelScale = playerLevelScale(level);
  const offenseScale = 1 + (levelScale - 1) * playerOffenseLevelWeight(level);
  const defenseScale = 1 + (levelScale - 1) * playerDefenseLevelWeight(level);
  const baseAtk = Math.max(1, Math.round((8 + str * 4) * PLAYER_STAT_SCALE * offenseScale + playerFlatAtkBonus(level)));
  const baseDef = Math.max(0, Math.round(vit * PLAYER_STAT_SCALE * defenseScale));
  const baseAcc = 70 + dex * 3;
  const baseEva = 8 + dex * 2 + agi;
  const baseSpd = 1 + agi * 0.03;
  const weaponAtkScale = Math.max(0.1, playerWeaponAtkScale(level));
  const armorEffect = (species.armorEffect ?? 1) * (classDef.armorEffect ?? 1);
  const energyMult = Math.max(0.1, (species.energyMult ?? 1) * (classDef.energyMult ?? 1));
  const energyFlat = Math.floor((species.energyFlat ?? 0) + (classDef.energyFlat ?? 0));
  const resolvedAttackProfile = resolvePlayerAttackProfile(state);
  const newMaxHp = Math.max(1, maxHpForLevel(level, profile));
  const prevMaxHp = Math.max(1, Math.floor(p.maxHp ?? newMaxHp));
  const hpRatio = clamp((p.hp ?? newMaxHp) / prevMaxHp, 0, 1);
  p.maxHp = newMaxHp;
  p.hp = clamp(Math.round(newMaxHp * hpRatio), 0, newMaxHp);

  p.baseAtk = baseAtk;
  p.baseDef = baseDef;
  p.weaponKind = weapon?.kind
    ?? (resolvedAttackProfile?.source === "class_native" ? `native_${resolvedAttackProfile.flavor ?? "ranged"}` : "unarmed");
  p.weaponAttackProfile = { ...resolvedAttackProfile };
  p.weaponRange = Math.max(1, Math.floor(p.weaponAttackProfile?.range ?? 1));
  p.weaponMinRange = Math.max(1, Math.floor(p.weaponAttackProfile?.minRange ?? 1));
  p.weaponIsRanged = (p.weaponAttackProfile?.kind ?? "melee") === "ranged";
  p.weaponAtkBonus = weaponAtk;
  p.weaponAtkScale = weaponAtkScale;
  p.effectAtkBonus = effAtk;
  p.atkBonus = weaponAtk + effAtk;
  p.atkLo = Math.max(1, Math.round(baseAtk * 0.86));
  p.atkHi = Math.max(p.atkLo, Math.round(baseAtk * 1.16));
  p.defBonus = Math.max(0, Math.round((baseDef + armorRaw) * armorEffect));
  p.acc = clamp(Math.round(baseAcc + (species.accFlat ?? 0) + (classDef.accFlat ?? 0) + effAcc), 10, 98);
  p.eva = clamp(Math.round(baseEva + (species.evaFlat ?? 0) + (classDef.evaFlat ?? 0) + effEva), 0, 85);
  p.spd = Number((baseSpd * (species.speedMult ?? 1) * (classDef.speedMult ?? 1) * effSpeedMult).toFixed(3));
  p.energyMax = Math.max(1, Math.round(((30 + int * 10) * PLAYER_STAT_SCALE) * energyMult + energyFlat));
  p.critChance = clamp(Math.round(2 + dex * 0.6 + (classDef.critFlat ?? 0)), 0, 45);
  p.critDamageMult = Math.max(1, Number(classDef.critDamageMult ?? 1.5));
  p.critDefIgnorePct = clamp(Number(classDef.critDefIgnorePct ?? 0), 0, 0.9);
  p.healMult = Math.max(0.1, (species.healMult ?? 1) * (classDef.healMult ?? 1));
  p.xpGainMult = Math.max(0.1, (species.xpGainMult ?? 1) * (classDef.xpGainMult ?? 1));
  p.incomingDamageFlat = Math.max(0, Math.floor(Number(classDef.incomingDamageFlatLegacy ?? 0) * COMBAT_SCALE));
  p.weaponDamageMult = classDef.weaponDamageMult ?? 1;
  p.damageMult = classDef.damageMult ?? 1;
  p.lowHpDamageMult = species.lowHpDamageMult ?? 1;
  p.firstStrikeMoveMult = classDef.firstStrikeMoveMult ?? 1;
  p.rangedDefIgnorePct = clamp(classDef.rangedDefIgnorePct ?? 0, 0, 0.75);
  p.poisonImmune = !!(species.poisonImmune || classDef.poisonImmune);
  p.fearImmune = !!(species.fearImmune || classDef.fearImmune);
  p.knockbackResistPct = clamp(Number(classDef.knockbackResistPct ?? 0), 0, 1);
  p.trapDetectRadiusMult = Math.max(0.1, Number(species.trapDetectRadiusMult ?? classDef.trapDetectRadiusMult ?? 1));
  p.fireResistMult = Math.max(0, Number(species.fireResistMult ?? classDef.fireResistMult ?? 1));
  p.abilityCostMult = Math.max(0.1, Number(classDef.abilityCostMult ?? 1));
  p.abilityRangeMult = Math.max(0.1, Number(classDef.abilityRangeMult ?? 1));
  p.rareLootChanceBonus = Math.max(0, Number(classDef.rareLootChanceBonus ?? 0));
  p.salvageChanceBonus = Math.max(0, Number(classDef.salvageChanceBonus ?? 0));
  p.consumableSlotBonus = Math.max(0, Math.floor(Number(classDef.consumableSlotBonus ?? 0)));
  p.repairKitHealMult = Math.max(0.1, Number(classDef.repairKitHealMult ?? 1));
  p.allyAccAura = Math.max(0, Math.floor(Number(classDef.allyAccAura ?? 0)));
  p.floorMilestoneBuffEnabled = !!classDef.floorMilestoneBuffEnabled;
  p.trapDamageMult = Math.max(0, Number(classDef.trapDamageMult ?? 1));
  p.ignoreOwnTraps = !!classDef.ignoreOwnTraps;
  p.potionCapacity = potionCapacityForState(state);
  if (typeof p.combatFirstStrikeReady !== "boolean") p.combatFirstStrikeReady = true;
  if (typeof p.slipbladeBonusReady !== "boolean") p.slipbladeBonusReady = false;
  if (!Number.isFinite(p.overclockUntilMs)) p.overclockUntilMs = 0;
}
function characterStatLabelShort(key) {
  if (key === "vit") return "VIT";
  if (key === "str") return "STR";
  if (key === "dex") return "DEX";
  if (key === "int") return "INT";
  if (key === "agi") return "AGI";
  return key.toUpperCase();
}
function characterStatLabelLong(key) {
  if (key === "vit") return "Vitality";
  if (key === "str") return "Strength";
  if (key === "dex") return "Dexterity";
  if (key === "int") return "Intellect";
  if (key === "agi") return "Agility";
  return key.toUpperCase();
}
function characterUnspentStatPoints(state) {
  const profile = ensureCharacterState(state);
  return Math.max(0, Math.floor(profile?.unspentStatPoints ?? 0));
}
function spendCharacterStatPoint(state, statKey) {
  if (!state?.player || state.player.dead) return false;
  if (!CHARACTER_STAT_KEYS.includes(statKey)) return false;
  const profile = ensureCharacterState(state);
  if (!profile) return false;
  const unspent = Math.max(0, Math.floor(profile.unspentStatPoints ?? 0));
  if (unspent <= 0) {
    pushLog(state, "No attribute points available.");
    return false;
  }
  const stats = normalizeCharacterStats(profile.stats, profile.speciesId);
  const cur = Math.max(0, Math.floor(stats[statKey] ?? 0));
  if (cur >= CHARACTER_STAT_MAX) {
    pushLog(state, `${characterStatLabelShort(statKey)} is already at max (${CHARACTER_STAT_MAX}).`);
    return false;
  }
  stats[statKey] = cur + 1;
  profile.stats = stats;
  profile.unspentStatPoints = unspent - 1;
  touchCharacterProgress(state);
  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  renderCharacterStatsPanel(state);
  renderLevelUpOverlay(state);
  pushLog(state, `${characterStatLabelShort(statKey)} increased to ${stats[statKey]}.`);
  saveNow(state);
  return true;
}
function applyCharacterStatPointAllocations(state, allocations = {}) {
  if (!state?.player || state.player.dead) return false;
  const profile = ensureCharacterState(state);
  if (!profile) return false;
  const stats = normalizeCharacterStats(profile.stats, profile.speciesId);
  const unspent = Math.max(0, Math.floor(profile.unspentStatPoints ?? 0));
  const applied = {};
  let totalSpent = 0;
  for (const key of CHARACTER_STAT_KEYS) {
    const raw = allocations?.[key];
    const delta = Math.max(0, Math.floor(Number(raw ?? 0)));
    if (delta <= 0) continue;
    const cur = Math.max(0, Math.floor(stats[key] ?? 0));
    const headroom = Math.max(0, CHARACTER_STAT_MAX - cur);
    const spend = Math.min(delta, headroom);
    if (spend <= 0) continue;
    applied[key] = spend;
    totalSpent += spend;
  }
  if (totalSpent <= 0) return true;
  if (totalSpent > unspent) {
    pushLog(state, "Not enough attribute points to confirm allocation.");
    return false;
  }
  for (const key of CHARACTER_STAT_KEYS) {
    const spend = Math.max(0, Math.floor(applied[key] ?? 0));
    if (spend <= 0) continue;
    const cur = Math.max(0, Math.floor(stats[key] ?? 0));
    stats[key] = Math.min(CHARACTER_STAT_MAX, cur + spend);
  }
  profile.stats = stats;
  profile.unspentStatPoints = unspent - totalSpent;
  touchCharacterProgress(state);
  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  renderCharacterStatsPanel(state);
  const summaries = CHARACTER_STAT_KEYS
    .map((key) => {
      const spend = Math.max(0, Math.floor(applied[key] ?? 0));
      if (spend <= 0) return "";
      return `${characterStatLabelShort(key)} +${spend}`;
    })
    .filter(Boolean);
  if (summaries.length > 0) {
    pushLog(state, `Allocated attribute point${totalSpent === 1 ? "" : "s"}: ${summaries.join(", ")}.`);
  }
  saveNow(state);
  return true;
}
function clearLevelUpDraft() {
  levelUpUi.draft = {};
}
function levelUpDraftForKey(key) {
  return Math.max(0, Math.floor(levelUpUi.draft?.[key] ?? 0));
}
function levelUpDraftSpentTotal() {
  let total = 0;
  for (const key of CHARACTER_STAT_KEYS) total += levelUpDraftForKey(key);
  return Math.max(0, Math.floor(total));
}
function updateLevelUpDraft(state, statKey, delta) {
  if (!state?.player || state.player.dead) return false;
  if (!CHARACTER_STAT_KEYS.includes(statKey)) return false;
  const profile = ensureCharacterState(state);
  const stats = normalizeCharacterStats(profile?.stats, profile?.speciesId);
  const unspent = Math.max(0, Math.floor(profile?.unspentStatPoints ?? 0));
  const step = Math.trunc(Number(delta));
  if (!Number.isFinite(step) || step === 0) return false;
  const currentDraft = levelUpDraftForKey(statKey);
  if (step > 0) {
    const remaining = Math.max(0, unspent - levelUpDraftSpentTotal());
    const baseVal = Math.max(0, Math.floor(stats[statKey] ?? 0));
    const headroom = Math.max(0, CHARACTER_STAT_MAX - (baseVal + currentDraft));
    if (remaining <= 0 || headroom <= 0) return false;
    levelUpUi.draft[statKey] = currentDraft + 1;
    return true;
  }
  if (currentDraft <= 0) return false;
  levelUpUi.draft[statKey] = currentDraft - 1;
  if (levelUpUi.draft[statKey] <= 0) delete levelUpUi.draft[statKey];
  return true;
}
function confirmLevelUpDraft(state) {
  const ok = applyCharacterStatPointAllocations(state, levelUpUi.draft);
  if (!ok) return false;
  clearLevelUpDraft();
  return true;
}
function renderCharacterStatsPanel(state) {
  if (!characterStatsPanelEl) return;
  const profile = ensureCharacterState(state);
  if (!profile) {
    characterStatsPanelEl.textContent = "";
    return;
  }
  const stats = normalizeCharacterStats(profile.stats, profile.speciesId);
  const unspent = Math.max(0, Math.floor(profile.unspentStatPoints ?? 0));
  characterStatsPanelEl.innerHTML =
    `<div class="charStatsPanelHead"><span>Attributes</span><span class="charStatsPointBadge">Points: ${unspent}</span></div>` +
    CHARACTER_STAT_KEYS.map((key) => {
      const val = Math.max(0, Math.floor(stats[key] ?? 0));
      const canSpend = unspent > 0 && val < CHARACTER_STAT_MAX;
      return `<div class="charStatsSpendRow">` +
        `<div class="charStatsSpendLabel">${characterStatLabelShort(key)}</div>` +
        `<div class="charStatsSpendValue">${val} / ${CHARACTER_STAT_MAX}</div>` +
        `<button class="charStatsSpendBtn" type="button" data-stat-key="${key}"${canSpend ? "" : " disabled"}>+</button>` +
      `</div>`;
    }).join("");
}

function renderEquipment(state) {
  const p = state.player;
  const equip = p.equip ?? {};
  if (equipTextEl) {
    const w = equip.weapon ? (ITEM_TYPES[equip.weapon]?.name ?? equip.weapon) : "(none)";
    const head = equip.head ? (ITEM_TYPES[equip.head]?.name ?? equip.head) : "(none)";
    const chest = equip.chest ? (ITEM_TYPES[equip.chest]?.name ?? equip.chest) : "(none)";
    const legs = equip.legs ? (ITEM_TYPES[equip.legs]?.name ?? equip.legs) : "(none)";
    equipTextEl.textContent =
      `Weapon: ${w}\nHead:   ${head}\nChest:  ${chest}\nLegs:   ${legs}\nATK: ${Math.max(1, p.atkLo + p.atkBonus)}-${Math.max(1, p.atkHi + p.atkBonus)}  DEF: +${p.defBonus}\nACC: ${p.acc ?? 0}  EVA: ${p.eva ?? 0}  SPD: ${(p.spd ?? 1).toFixed(2)}  Potions: ${invCount(state, "potion")}/${p.potionCapacity ?? BASE_POTION_CAPACITY}`;
  }

  const setBadge = (el, itemType) => {
    if (!el) return;
    el.innerHTML = "";
    if (!itemType) return;

    const appendGlyph = () => {
      const glyphInfo = itemGlyph(itemType);
      const glyph = document.createElement("span");
      glyph.className = "equipBadgeGlyph";
      glyph.textContent = glyphInfo?.g ?? "?";
      glyph.style.color = glyphInfo?.c ?? "#d6e4ff";
      el.appendChild(glyph);
    };

    const spriteId = itemSpriteId({ type: itemType });
    const src = spriteId ? SPRITE_SOURCES[spriteId] : null;
    if (!src) {
      appendGlyph();
      return;
    }

    const img = document.createElement("img");
    img.src = src;
    img.alt = ITEM_TYPES[itemType]?.name ?? itemType;
    img.onerror = () => {
      el.innerHTML = "";
      appendGlyph();
    };
    el.appendChild(img);
  };

  const setBadgeLabel = (el, itemType, fallback) => {
    if (!el) return;
    const txt = itemType ? (ITEM_TYPES[itemType]?.name ?? itemType) : fallback;
    el.textContent = txt;
    el.title = txt;
  };

  setBadge(equipBadgeWeaponEl, equip.weapon ?? null);
  setBadge(equipBadgeHeadEl, equip.head ?? null);
  setBadge(equipBadgeTorsoEl, equip.chest ?? null);
  setBadge(equipBadgeLegsEl, equip.legs ?? null);
  setBadgeLabel(equipBadgeLabelWeaponEl, equip.weapon ?? null, "Weapon");
  setBadgeLabel(equipBadgeLabelHeadEl, equip.head ?? null, "Head");
  setBadgeLabel(equipBadgeLabelTorsoEl, equip.chest ?? null, "Torso");
  setBadgeLabel(equipBadgeLabelLegsEl, equip.legs ?? null, "Legs");
  renderCharacterStatsPanel(state);
}

function unequipSlotToInventory(state, slot) {
  if (!state?.player || state.player.dead) return false;
  const equip = state.player.equip ?? {};
  const type = equip[slot] ?? null;
  if (!type) return false;

  equip[slot] = null;
  invAdd(state, type, 1);
  pushLog(state, `Removed ${ITEM_TYPES[type]?.name ?? type}.`);
  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  saveNow(state);
  return true;
}

function renderEffects(state) {
  const eff = state.player.effects;
  if (!eff.length) {
    effectsTextEl.textContent = "(none)";
    return;
  }
  effectsTextEl.textContent = eff
    .map(e => {
      if (e.type === "regen") return `Regen (+${e.healPerTurn}/turn) \u2014 ${e.turnsLeft} turns`;
      if (e.type === "bless") return `Blessing (ATK +${e.atkDelta}) \u2014 ${e.turnsLeft} turns`;
      if (e.type === "curse") return `Curse (ATK ${e.atkDelta}) \u2014 ${e.turnsLeft} turns`;
      if (e.type === "reveal") return `Revelation \u2014 ${e.turnsLeft} turns`;
      return `${e.type} \u2014 ${e.turnsLeft} turns`;
    })
    .join("\n");
}

function renderInventory(state) {
  invListEl.innerHTML = "";
  if (state.inv.length === 0) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "(empty)";
    invListEl.appendChild(div);
    return;
  }
  getInventoryDisplayEntries(state).forEach((entry, idx) => {
    const it = entry.item;
    const invIdx = entry.invIndex;
    const nm = ITEM_TYPES[it.type]?.name ?? it.type;
    const btn = document.createElement("button");
    btn.className = 'invLabelBtn';
    btn.type = 'button';

    const row = document.createElement("span");
    row.className = "invRow";

    const iconWrap = document.createElement("span");
    iconWrap.className = "invIconWrap";
    const icon = inventoryIconNode(it.type);
    if (icon) iconWrap.appendChild(icon);

    const label = document.createElement("span");
    label.className = "invLabelText";
    label.textContent = `${idx + 1}. ${nm}${isStackable(it.type) ? ` x${it.amount}` : ""}`;

    row.appendChild(iconWrap);
    row.appendChild(label);
    btn.appendChild(row);

    const invoke = () => useInventoryIndex(state, invIdx);
    const clickHandler = (e) => { e.stopPropagation(); invoke(); };
    btn.addEventListener('click', clickHandler);
    btn.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); invoke(); }, { passive: false });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      takeTurn(state, dropInventoryIndex(state, invIdx));
    });

    invListEl.appendChild(btn);
  });
}

function getInventoryDisplayEntries(state) {
  const entries = state.inv.map((item, invIndex) => ({
    item,
    invIndex,
    priority: item.type === "potion" ? 0 : 1,
    value: itemMarketValue(item.type),
    name: ITEM_TYPES[item.type]?.name ?? item.type,
  }));
  entries.sort((a, b) =>
    (a.priority - b.priority) ||
    (b.value - a.value) ||
    a.name.localeCompare(b.name) ||
    (a.invIndex - b.invIndex)
  );
  return entries;
}

function inventoryIconNode(type) {
  const spriteId = itemSpriteId({ type });
  if (spriteId && SPRITE_SOURCES[spriteId]) {
    const img = document.createElement("img");
    img.src = SPRITE_SOURCES[spriteId];
    img.alt = "";
    return img;
  }
  const glyphInfo = itemGlyph(type);
  const glyph = document.createElement("span");
  glyph.className = "invIconGlyph";
  glyph.textContent = glyphInfo?.g ?? "?";
  glyph.style.color = glyphInfo?.c ?? "#e6e6e6";
  return glyph;
}

function resolveSurfaceLink(state) {
  const cand = state.surfaceLink;
  if (cand && Number.isFinite(cand.x) && Number.isFinite(cand.y) && Number.isFinite(cand.z)) {
    return { x: Math.floor(cand.x), y: Math.floor(cand.y), z: Math.floor(cand.z) };
  }

  // Backward-compat fallback for saves without surfaceLink: prefer stairs-up near start area.
  const z = 0;
  const targetX = Math.floor(CHUNK / 2);
  const targetY = Math.floor(CHUNK / 2);
  let best = null, bestD = Infinity;
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      const t = state.world.getTile(x, y, z);
      if (t !== STAIRS_UP) continue;
      const dx = x - targetX, dy = y - targetY;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x, y, z }; }
    }
  }
  return best ?? { x: targetX, y: targetY, z };
}

function ensureSurfaceLinkTile(state) {
  const link = resolveSurfaceLink(state);
  state.surfaceLink = link;
  state.world.setTile(link.x, link.y, link.z, STAIRS_UP);
  return link;
}

function placeInitialSurfaceStairs(state) {
  const p = state.player;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy, z = p.z;
    const t = state.world.getTile(x, y, z);
    if (t === FLOOR || isOpenDoorTile(t)) {
      state.world.setTile(x, y, z, STAIRS_UP);
      state.surfaceLink = { x, y, z };
      return;
    }
  }

  const fx = p.x + 1, fy = p.y;
  state.world.setTile(fx, fy, p.z, FLOOR);
  state.world.setTile(fx, fy, p.z, STAIRS_UP);
  state.surfaceLink = { x: fx, y: fy, z: p.z };
}

function computeInitialDepth0Spawn(world) {
  world.ensureChunksAround(0, 0, 0, viewRadiusForChunks());
  const ch = world.getChunk(0, 0, 0);
  const target = { x: Math.floor(CHUNK / 2), y: Math.floor(CHUNK / 2) };
  let best = null, bestD = Infinity;
  for (let y = 1; y < CHUNK - 1; y++) for (let x = 1; x < CHUNK - 1; x++) {
    const t = ch.grid[y][x];
    if (t === WALL) continue;
    const dx = x - target.x, dy = y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = { x, y, z: 0 }; }
  }
  return best ?? { x: target.x, y: target.y, z: 0 };
}

function respawnAtStart(state) {
  const p = state.player;
  const sp = state.startSpawn ?? computeInitialDepth0Spawn(state.world);
  state.startSpawn = sp;

  p.dead = false;
  p.hp = p.maxHp;
  p.effects = [];
  p.attackAfterMove = false;
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;
  p.x = sp.x; p.y = sp.y; p.z = sp.z;
  setLastLadderLanding(state, sp);
  state.disengageGrace = {};
  const combat = ensureCombatState(state);
  combat.lastEventMs = 0;
  combat.regenAnchorMs = Date.now();
  combat.hudTargets = {};

  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);
  ensureSurfaceLinkTile(state);
  ensureShopState(state);
  updateAreaRespawnTracking(state, Date.now());
  hydrateNearby(state);
  pushLog(state, "You awaken at the dungeon entrance.");
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  saveNow(state);
}

function makeNewGame(seedStr = randomSeedString(), options = null) {
  const world = new World(seedStr);
  const carryover = (options && typeof options === "object") ? options.carryover ?? null : null;
  const characterProfile = normalizeCharacterProfile(carryover?.character ?? null);

  const player = {
    x: 0, y: 0, z: 0,
    dead: false,
    level: 1,
    xp: 0,
    hp: maxHpForLevel(1, characterProfile), maxHp: maxHpForLevel(1, characterProfile),
    atkLo: 80, atkHi: 140,
    atkBonus: 0,
    defBonus: 0,
    acc: 70,
    eva: 8,
    spd: 1,
    energyMax: 300,
    critChance: 2,
    healMult: 1,
    potionCapacity: BASE_POTION_CAPACITY,
    attackAfterMove: false,
    combatFirstStrikeReady: true,
    slipbladeBonusReady: false,
    overclockUntilMs: 0,
    gold: 0,
    equip: { weapon: null, head: null, chest: null, legs: null },
    effects: [],
    classId: characterProfile.classId,
    speciesId: characterProfile.speciesId,
  };

  const state = {
    world,
    player,
    character: characterProfile,
    seen: new Set(),
    visible: new Set(),
    log: [],
    entities: new Map(),
    removedIds: new Set(),
    entityOverrides: new Map(),
    inv: [],
    dynamic: new Map(),
    turn: 0,
    visitedDoors: new Set(),
    exploredChunks: new Set(),
    xpDepthKills: {},
    poisonClouds: {},
    surfaceLink: null,
    startSpawn: null,
    lastLadderLanding: null,
    shop: null,
    combat: { lastEventMs: 0, regenAnchorMs: Date.now(), hudTargets: {} },
    disengageGrace: {},
    areaRespawn: { currentAreaKey: "", schedules: {} },
    debug: normalizeDebugFlags(),
  };

  if (carryover) {
    player.level = Math.max(1, Math.floor(carryover.level ?? player.level));
    player.xp = Math.max(0, Math.floor(carryover.xp ?? player.xp));
    player.maxHp = Math.max(1, Math.floor(carryover.maxHp ?? maxHpForLevel(player.level, characterProfile)));
    player.hp = player.maxHp;
    player.gold = Math.max(0, Math.floor(carryover.gold ?? 0));
    player.equip = normalizeEquip(carryover.equip ?? player.equip);
    state.inv = normalizeInventoryEntries(carryover.inv ?? []);
  }

  const start = computeInitialDepth0Spawn(world);
  state.startSpawn = start;
  setLastLadderLanding(state, start);
  player.x = start.x;
  player.y = start.y;
  player.z = start.z;
  placeInitialSurfaceStairs(state);
  ensureSurfaceLinkTile(state);
  ensureShopState(state);

  ensureCharacterState(state);
  recalcDerivedStats(state);
  if (carryover) pushLog(state, "A fresh dungeon forms around your enduring character.");
  else pushLog(state, "You enter the dungeon...");
  hydrateNearby(state);
  updateAreaRespawnTracking(state, Date.now());
  maybeGrantExplorationXP(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  return state;
}

// ---------- Hydration ----------
function hydrateChunkEntities(state, z, cx, cy) {
  const chunk = state.world.getChunk(z, cx, cy);
  const base = chunkBaseSpawns(state.world.seedStr, chunk);

  for (const m of base.monsters) {
    if (state.removedIds.has(m.id)) continue;
    if (state.entities.has(m.id)) continue;

    const wx = cx * CHUNK + m.lx;
    const wy = cy * CHUNK + m.ly;

    const ov = state.entityOverrides.get(m.id);
    const mx = ov?.x ?? wx;
    const my = ov?.y ?? wy;
    const mz = ov?.z ?? z;

    const spec = monsterStatsForDepth(m.type, z);
    const hp = ov?.hp ?? spec.maxHp;
    const cd = ov?.cd ?? 0;
    const effects = normalizeMonsterEffects(ov?.effects ?? []);

    state.entities.set(m.id, {
      id: m.id,
      origin: "base",
      kind: "monster",
      type: m.type,
      x: mx, y: my, z: mz,
      hp, maxHp: spec.maxHp,
      awake: !!ov?.awake,
      cd,
      abilityCd: Math.max(0, Math.floor(ov?.abilityCd ?? 0)),
      effects,
    });
  }

  for (const it of base.items) {
    if (state.removedIds.has(it.id)) continue;
    if (state.entities.has(it.id)) continue;

    const wx = cx * CHUNK + it.lx;
    const wy = cy * CHUNK + it.ly;

    state.entities.set(it.id, {
      id: it.id,
      origin: "base",
      kind: "item",
      type: it.type,
      amount: it.amount ?? 1,
      x: wx, y: wy, z,
      locked: it.locked,
      keyType: it.keyType,
      rewardChest: !!it.rewardChest,
      lootDepth: Number.isFinite(it.lootDepth) ? it.lootDepth : undefined,
      lockKeyType: it.lockKeyType,
    });
  }

  for (const trap of base.traps ?? []) {
    if (state.removedIds.has(trap.id)) continue;
    if (state.entities.has(trap.id)) continue;
    const wx = cx * CHUNK + trap.lx;
    const wy = cy * CHUNK + trap.ly;
    const ov = state.entityOverrides.get(trap.id);
    state.entities.set(trap.id, {
      id: trap.id,
      origin: "base",
      kind: "trap",
      trapType: trap.type ?? TRAP_TYPE_PRESSURE,
      x: Math.floor(ov?.x ?? wx),
      y: Math.floor(ov?.y ?? wy),
      z: Math.floor(ov?.z ?? z),
      depth: Math.max(0, Math.floor(ov?.depth ?? trap.depth ?? z)),
      armed: ov?.armed !== false,
      detected: !!ov?.detected,
      triggered: !!ov?.triggered,
      disarmed: !!ov?.disarmed,
    });
  }

  if (z === SURFACE_LEVEL && cx === 0 && cy === 0) {
    // Keep the surface dungeon entrance fixed at center.
    state.world.setTile(0, 0, z, STAIRS_DOWN);
    const id = "shopkeeper|surface|0,0";
    if (!state.removedIds.has(id)) {
      const x = 10, y = -8;
      const left = x - Math.floor(SHOP_FOOTPRINT_W / 2);
      const top = y;
      for (let yy = top; yy < top + SHOP_FOOTPRINT_H; yy++) {
        for (let xx = left; xx < left + SHOP_FOOTPRINT_W; xx++) state.world.setTile(xx, yy, z, FLOOR);
      }
      const existing = state.entities.get(id);
      state.entities.set(id, {
        id,
        origin: existing?.origin ?? "base",
        kind: existing?.kind ?? "item",
        type: "shopkeeper",
        amount: existing?.amount ?? 1,
        x, y, z,
      });
    }
  }
}

function hydrateNearby(state) {
  const p = state.player;
  const { cx: pcx, cy: pcy } = splitWorldToChunk(p.x, p.y);
  const radius = viewRadiusForChunks();
  if (hydrationStateRef !== state) {
    hydrationStateRef = state;
    hydrationSig = "";
  }
  const sig = `${p.z}|${pcx},${pcy}|${radius}|${state.turn ?? 0}`;
  if (sig === hydrationSig) return;
  hydrationSig = sig;

  state.world.ensureChunksAround(p.x, p.y, p.z, viewRadiusForChunks());

  for (const e of state.dynamic.values()) state.entities.set(e.id, e);

  for (let cy = pcy - 1; cy <= pcy + 1; cy++)
    for (let cx = pcx - 1; cx <= pcx + 1; cx++)
      hydrateChunkEntities(state, p.z, cx, cy);
}

// ---------- Occupancy ----------
function buildOccupancy(state) {
  const monsters = new Map();
  const items = new Map();
  const traps = new Map();
  const pz = state.player.z;
  for (const e of state.entities.values()) {
    if (e.z !== pz) continue;
    const k = keyXYZ(e.x, e.y, e.z);
    if (e.kind === "monster") monsters.set(k, e.id);
    else if (e.kind === "item") items.set(k, e.id);
    else if (e.kind === "trap") traps.set(k, e.id);
  }
  return { monsters, items, traps };
}
function getCachedOccupancy(state) {
  if (occupancyStateRef !== state) {
    occupancyStateRef = state;
    occupancySig = "";
    occupancyCache = { monsters: new Map(), items: new Map(), traps: new Map() };
  }
  const sig = `${state.turn ?? 0}|${state.player.z}|${state.entities.size}`;
  if (sig !== occupancySig) {
    occupancySig = sig;
    occupancyCache = buildOccupancy(state);
  }
  return occupancyCache;
}

function getItemsAt(state, x, y, z) {
  const items = [];
  for (const e of state.entities.values()) {
    if (e.kind !== "item") continue;
    if (e.z !== z) continue;
    if (e.type === "shopkeeper") {
      const left = e.x - Math.floor(SHOP_FOOTPRINT_W / 2);
      const top = e.y;
      if (x < left || x >= left + SHOP_FOOTPRINT_W || y < top || y >= top + SHOP_FOOTPRINT_H) continue;
      items.push(e);
      continue;
    }
    if (e.x !== x || e.y !== y) continue;
    items.push(e);
  }
  return items;
}

function findItemAtByType(state, x, y, z, type) {
  for (const e of state.entities.values()) {
    if (e.kind !== "item") continue;
    if (e.type !== type) continue;
    if (e.z !== z) continue;
    if (type === "shopkeeper") {
      const left = e.x - Math.floor(SHOP_FOOTPRINT_W / 2);
      const top = e.y;
      if (x >= left && x < left + SHOP_FOOTPRINT_W && y >= top && y < top + SHOP_FOOTPRINT_H) return e;
      continue;
    }
    if (e.x === x && e.y === y) return e;
  }
  return null;
}
function getTrapAt(state, x, y, z, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  for (const e of state.entities.values()) {
    if (e.kind !== "trap") continue;
    if (e.z !== z) continue;
    if (e.x !== x || e.y !== y) continue;
    if (opts.requireArmed && !e.armed) continue;
    if (opts.requireRevealed && !(e.detected || e.triggered)) continue;
    return e;
  }
  return null;
}
function persistTrapOverride(state, trap) {
  if (!state || !trap || trap.origin !== "base") return;
  state.entityOverrides.set(trap.id, {
    x: Math.floor(trap.x ?? 0),
    y: Math.floor(trap.y ?? 0),
    z: Math.floor(trap.z ?? 0),
    depth: Math.max(0, Math.floor(trap.depth ?? trap.z ?? 0)),
    armed: !!trap.armed,
    detected: !!trap.detected,
    triggered: !!trap.triggered,
    disarmed: !!trap.disarmed,
  });
}
function trapDepth(trap, state) {
  return Math.max(0, Math.floor(trap?.depth ?? trap?.z ?? state?.player?.z ?? 0));
}
function playerTrapDetectionScore(state) {
  const profile = ensureCharacterState(state);
  const stats = normalizeCharacterStats(profile?.stats, profile?.speciesId);
  const dex = Math.max(0, Math.floor(stats.dex ?? 0));
  const int = Math.max(0, Math.floor(stats.int ?? 0));
  const level = Math.max(1, Math.floor(state?.player?.level ?? 1));
  const accBonus = Math.max(0, ((state?.player?.acc ?? 70) - 70) * 0.08);
  return 10 + level * 1.8 + dex * 2.6 + int * 1.9 + accBonus;
}
function trapDetectionRadius(state) {
  const mult = Math.max(0.5, Number(state?.player?.trapDetectRadiusMult ?? 1));
  return Math.max(1, Math.floor(1 + Math.max(0, mult - 1) * 10));
}
function trapDetectionChance(state, trap, dist) {
  const score = playerTrapDetectionScore(state);
  const difficulty = 14 + trapDepth(trap, state) * 2.8;
  let chance = 0.05 + (score - difficulty) * 0.045;
  if (dist <= 0) chance += 0.20;
  else if (dist === 1) chance += 0.08;
  return clamp(chance, TRAP_DETECTION_CHANCE_MIN, TRAP_DETECTION_CHANCE_MAX);
}
function revealNearbyTrapsBySkill(state) {
  const p = state.player;
  const radius = trapDetectionRadius(state);
  let detectedCount = 0;
  for (const trap of state.entities.values()) {
    if (trap.kind !== "trap") continue;
    if (trap.z !== p.z) continue;
    if (!trap.armed || trap.detected || trap.disarmed) continue;
    const dist = Math.abs((trap.x ?? 0) - p.x) + Math.abs((trap.y ?? 0) - p.y);
    if (dist > radius) continue;
    if (dist > 0 && !hasLineOfSight(state.world, p.z, p.x, p.y, trap.x, trap.y)) continue;
    if (Math.random() > trapDetectionChance(state, trap, dist)) continue;
    trap.detected = true;
    persistTrapOverride(state, trap);
    detectedCount += 1;
  }
  if (detectedCount > 0) pushLog(state, detectedCount === 1 ? "You detect a hidden pressure trap." : `You detect ${detectedCount} hidden pressure traps.`);
  return detectedCount;
}
function trapPressureRawDamage(depth) {
  const legacyDamage = 7 + depth * 2.2;
  return Math.max(1, Math.round(legacyDamage * COMBAT_SCALE));
}
function triggerPressureTrap(state, trap) {
  const p = state?.player;
  if (!p || p.dead || !trap || trap.kind !== "trap" || !trap.armed) return false;
  const depth = trapDepth(trap, state);
  trap.detected = true;
  trap.triggered = true;
  trap.armed = false;
  persistTrapOverride(state, trap);
  if (stateDebug(state).godmode) {
    pushLog(state, "A pressure trap triggers, but godmode negates the blast.");
    return true;
  }
  const reduced = reduceIncomingDamage(state, trapPressureRawDamage(depth), depth);
  const dmg = Math.max(1, Math.floor(reduced?.dmg ?? 1));
  p.hp = Math.max(0, p.hp - dmg);
  pushLog(state, `A hidden pressure trap triggers for ${dmg} damage.`);
  if (p.hp <= 0 && !p.dead) killPlayer(state);
  return true;
}
function trapDisarmXp(depth) {
  return Math.max(1, Math.round((3 + depth * 0.8) * XP_SCALE));
}
function disarmTrapAtPlayer(state) {
  const p = state?.player;
  if (!p || p.dead) return false;
  const trap = getTrapAt(state, p.x, p.y, p.z, { requireArmed: true, requireRevealed: true });
  if (!trap) return false;
  const xp = trapDisarmXp(trapDepth(trap, state));
  trap.armed = false;
  trap.disarmed = true;
  if (trap.origin === "base") {
    state.removedIds.add(trap.id);
    state.entityOverrides.delete(trap.id);
  } else if (trap.origin === "dynamic") {
    state.dynamic.delete(trap.id);
  }
  state.entities.delete(trap.id);
  grantXP(state, xp);
  pushLog(state, `You disarm the pressure trap. (+${xp} XP)`);
  return true;
}
function processPlayerTrapInteractions(state) {
  const p = state?.player;
  if (!p || p.dead) return false;
  revealNearbyTrapsBySkill(state);
  const trap = getTrapAt(state, p.x, p.y, p.z, { requireArmed: true });
  if (!trap) return false;
  if (trap.detected || trap.triggered) return false;
  return triggerPressureTrap(state, trap);
}

function isDirectlyTakeableItem(type) {
  return type !== "shrine" && type !== "shopkeeper";
}

function titleCaseLowerLabel(name) {
  const s = String(name ?? "").trim();
  if (!s) return "item";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function ensureAreaRespawnState(state) {
  if (!state.areaRespawn || typeof state.areaRespawn !== "object") {
    state.areaRespawn = { currentAreaKey: "", schedules: {} };
  }
  if (typeof state.areaRespawn.currentAreaKey !== "string") state.areaRespawn.currentAreaKey = "";
  if (!state.areaRespawn.schedules || typeof state.areaRespawn.schedules !== "object") state.areaRespawn.schedules = {};
  return state.areaRespawn;
}

function parseChunkAreaKey(areaKey) {
  const m = /^(-?\d+)\|(-?\d+),(-?\d+)\|(-?\d+)$/.exec(String(areaKey ?? ""));
  if (!m) return null;
  const z = Number(m[1]);
  const cx = Number(m[2]);
  const cy = Number(m[3]);
  const areaId = Number(m[4]);
  if (!Number.isFinite(z) || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(areaId)) return null;
  return { z: Math.trunc(z), cx: Math.trunc(cx), cy: Math.trunc(cy), areaId: Math.trunc(areaId) };
}

function areaRespawnDelayMsForDepth(z) {
  const depth = clamp(Math.max(0, Math.floor(z)), 0, AREA_RESPAWN_DEPTH_CAP);
  const t = depth / AREA_RESPAWN_DEPTH_CAP;
  return Math.round(AREA_RESPAWN_FLOOR1_MS + (AREA_RESPAWN_MIN_MS - AREA_RESPAWN_FLOOR1_MS) * t);
}

function collectChunkAreaCells(state, z, cx, cy, areaId) {
  const chunk = state.world.getChunk(z, cx, cy);
  const cells = [];
  for (let ly = 0; ly < CHUNK; ly++) {
    const areaRow = chunk?.areaMap?.[ly];
    const tileRow = chunk?.grid?.[ly];
    if (!areaRow || !tileRow) continue;
    for (let lx = 0; lx < CHUNK; lx++) {
      if (areaRow[lx] !== areaId) continue;
      if (!chunkAreaWalkableTile(tileRow[lx])) continue;
      cells.push({ x: cx * CHUNK + lx, y: cy * CHUNK + ly });
    }
  }
  return cells;
}

function pickRespawnCell(rng, cells, occupiedKeys) {
  if (!cells.length) return null;
  for (let i = 0; i < 16; i++) {
    const idx = randInt(rng, 0, cells.length - 1);
    const cell = cells[idx];
    if (!cell) continue;
    const k = keyXY(cell.x, cell.y);
    if (occupiedKeys.has(k)) continue;
    occupiedKeys.add(k);
    return cell;
  }
  for (const cell of cells) {
    const k = keyXY(cell.x, cell.y);
    if (occupiedKeys.has(k)) continue;
    occupiedKeys.add(k);
    return cell;
  }
  return null;
}

function respawnAreaItemType(depth, rng) {
  const roll = rng();
  if (roll < 0.30) return "potion";
  if (roll < 0.48) return "gold";
  if (roll < 0.72) return weaponForDepth(depth, rng);
  if (roll < 0.92) return armorForDepth(depth, rng);
  return keyTypeForDepth(depth, rng);
}

function respawnEntitiesForArea(state, areaKey, now = Date.now()) {
  const parsed = parseChunkAreaKey(areaKey);
  if (!parsed || parsed.z < 0) return false;
  const { z, cx, cy, areaId } = parsed;
  const cells = collectChunkAreaCells(state, z, cx, cy, areaId);
  if (!cells.length) return false;
  const areaCellKeys = new Set(cells.map((c) => keyXY(c.x, c.y)));

  // Remove any prior respawn wave for this area even if those entities wandered out.
  // Without this, repeated area respawns can stack roaming monsters over time.
  const respawnMonsterPrefix = `resp_m|${areaKey}|`;
  const respawnItemPrefix = `resp_i|${areaKey}|`;
  for (const ent of Array.from(state.dynamic.values())) {
    const id = String(ent?.id ?? "");
    if (!(id.startsWith(respawnMonsterPrefix) || id.startsWith(respawnItemPrefix))) continue;
    state.dynamic.delete(id);
    state.entities.delete(id);
  }

  for (const ent of Array.from(state.entities.values())) {
    if (ent.z !== z) continue;
    if (!areaCellKeys.has(keyXY(ent.x, ent.y))) continue;
    if (ent.kind === "trap") continue;
    if (ent.kind === "item" && (ent.type === "shopkeeper" || ent.type === "shrine")) continue;
    if (ent.origin === "base") {
      state.removedIds.add(ent.id);
      state.entityOverrides.delete(ent.id);
    } else if (ent.origin === "dynamic") {
      state.dynamic.delete(ent.id);
    }
    state.entities.delete(ent.id);
  }

  const rng = makeRng(`${state.world.seedStr}|respawn|${areaKey}|${Math.floor(now / 1000)}|${Math.random()}`);
  const depth = Math.max(0, z);
  const occupiedKeys = new Set([keyXY(state.player.x, state.player.y)]);
  for (const ent of state.entities.values()) {
    if (ent.z !== z) continue;
    if (!areaCellKeys.has(keyXY(ent.x, ent.y))) continue;
    occupiedKeys.add(keyXY(ent.x, ent.y));
  }

  const monsterCount = clamp(Math.floor(cells.length / 28) + randInt(rng, 1, 2) + Math.floor(depth / 7), 1, 9);
  const itemCount = clamp(Math.floor(cells.length / 34) + randInt(rng, 1, 3), 1, 8);
  const mTable = monsterTableForDepth(depth);

  for (let i = 0; i < monsterCount; i++) {
    const cell = pickRespawnCell(rng, cells, occupiedKeys);
    if (!cell) break;
    const type = weightedChoice(rng, mTable);
    const spec = monsterStatsForDepth(type, z);
    const id = `resp_m|${areaKey}|${Math.floor(now)}|${i}|${Math.floor(rng() * 1e9)}`;
    const ent = {
      id,
      origin: "dynamic",
      kind: "monster",
      type,
      x: cell.x,
      y: cell.y,
      z,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      awake: false,
      cd: 0,
    };
    state.dynamic.set(id, ent);
    state.entities.set(id, ent);
  }

  for (let i = 0; i < itemCount; i++) {
    const cell = pickRespawnCell(rng, cells, occupiedKeys);
    if (!cell) break;
    let type = respawnAreaItemType(depth, rng);
    let amount = type === "gold" ? (randInt(rng, 4, 22) + clamp(depth, 0, 35)) : 1;
    let locked = false;
    let keyType = null;
    let lootDepth = undefined;
    if (rng() < 0.18) {
      type = "chest";
      amount = 1;
      locked = rng() < clamp(0.12 + depth * 0.02, 0.12, 0.60);
      keyType = locked ? keyTypeForDepth(depth, rng) : null;
      lootDepth = Math.max(depth + (locked ? 1 : 0), depth + randInt(rng, locked ? 1 : 0, locked ? 4 : 2));
    }
    const id = `resp_i|${areaKey}|${Math.floor(now)}|${i}|${Math.floor(rng() * 1e9)}`;
    const ent = {
      id,
      origin: "dynamic",
      kind: "item",
      type,
      amount,
      x: cell.x,
      y: cell.y,
      z,
      locked,
      keyType,
      lootDepth,
    };
    state.dynamic.set(id, ent);
    state.entities.set(id, ent);
  }

  occupancySig = "";
  hydrationSig = "";
  return true;
}

function updateAreaRespawnTracking(state, now = Date.now()) {
  const areaState = ensureAreaRespawnState(state);
  const currentKey = state.world.areaKeyAt(state.player.x, state.player.y, state.player.z);
  const previousKey = areaState.currentAreaKey;
  if (previousKey && previousKey !== currentKey) {
    const parsedPrev = parseChunkAreaKey(previousKey);
    if (parsedPrev && parsedPrev.z >= 0) {
      areaState.schedules[previousKey] = now + areaRespawnDelayMsForDepth(parsedPrev.z);
    }
  }
  areaState.currentAreaKey = currentKey;
  if (currentKey && areaState.schedules[currentKey]) delete areaState.schedules[currentKey];
}

function processAreaRespawns(state, now = Date.now()) {
  const areaState = ensureAreaRespawnState(state);
  for (const [areaKey, dueMs] of Object.entries(areaState.schedules)) {
    const parsed = parseChunkAreaKey(areaKey);
    if (!parsed || parsed.z < 0) {
      delete areaState.schedules[areaKey];
      continue;
    }
    if (areaKey === areaState.currentAreaKey) {
      areaState.schedules[areaKey] = now + 1000;
      continue;
    }
    if (!Number.isFinite(dueMs) || dueMs > now) continue;
    respawnEntitiesForArea(state, areaKey, now);
    delete areaState.schedules[areaKey];
  }
}

function updateAreaRespawnSystem(state, now = Date.now()) {
  updateAreaRespawnTracking(state, now);
  processAreaRespawns(state, now);
}

// ---------- Visibility ----------
function computeVisibility(state) {
  updateViewportMetrics();
  const { world, player, seen, visible } = state;
  if (visibilityStateRef !== state) {
    visibilityStateRef = state;
    visibilitySig = "";
  }
  const sig = `${player.x},${player.y},${player.z}|${state.turn ?? 0}|${fogEnabled ? 1 : 0}|${viewRadiusX},${viewRadiusY}`;
  if (sig === visibilitySig) return;
  visibilitySig = sig;

  visible.clear();

  world.ensureChunksAround(player.x, player.y, player.z, viewRadiusForChunks());

  for (let dy = -viewRadiusY; dy <= viewRadiusY; dy++) {
    for (let dx = -viewRadiusX; dx <= viewRadiusX; dx++) {
      const wx = player.x + dx;
      const wy = player.y + dy;

      if (!fogEnabled) {
        visible.add(keyXY(wx, wy));
        seen.add(keyXYZ(wx, wy, player.z));
        continue;
      }

      if (hasLineOfSight(world, player.z, player.x, player.y, wx, wy)) {
        visible.add(keyXY(wx, wy));
        seen.add(keyXYZ(wx, wy, player.z));
      }
    }
  }
}

// ---------- Minimap ----------
function tileToMiniColor(theme, t, visible) {
  const v = visible;
  if (t === WALL) return v ? theme.wallV : theme.wallNV;
  if (t === FLOOR) return v ? theme.floorV : theme.floorNV;
  if (t === DOOR_CLOSED) return v ? theme.doorC_V : theme.doorC_NV;
  if (isOpenDoorTile(t)) return v ? theme.doorO_V : theme.doorO_NV;
  if (t === LOCK_GREEN) return v ? theme.lockG_V : theme.lockG_NV;
  if (t === LOCK_YELLOW) return v ? theme.lockY_V : theme.lockY_NV;
  if (t === LOCK_ORANGE) return v ? theme.lockO_V : theme.lockO_NV;
  if (t === LOCK_RED) return v ? theme.lockR_V : theme.lockR_NV;
  if (t === LOCK_VIOLET) return v ? theme.lockV_V : theme.lockV_NV;
  if (t === LOCK_INDIGO) return v ? theme.lockI_V : theme.lockI_NV;
  if (t === LOCK_BLUE) return v ? theme.lockI_V : theme.lockI_NV;
  if (t === LOCK_PURPLE) return v ? theme.lockV_V : theme.lockV_NV;
  if (t === LOCK_MAGENTA) return v ? theme.lockI_V : theme.lockI_NV;
  if (t === STAIRS_DOWN) return v ? theme.downV : theme.downNV;
  if (t === STAIRS_UP) return v ? theme.upV : theme.upNV;
  return null;
}

function drawMinimap(state) {
  if (!minimapEnabled) {
    mctx.clearRect(0, 0, mini.width, mini.height);
    return;
  }

  const p = state.player;
  const theme = applyVisibilityBoostToTheme(themeForDepth(p.z, state.world.seedStr ?? ""));
  mctx.fillStyle = "#05070c";
  mctx.fillRect(0, 0, mini.width, mini.height);

  const size = MINI_RADIUS * 2 + 1;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const wx = p.x + (mx - MINI_RADIUS);
      const wy = p.y + (my - MINI_RADIUS);
      const seenKey = keyXYZ(wx, wy, p.z);
      if (!state.seen.has(seenKey)) continue;

      const isVis = state.visible.has(keyXY(wx, wy));
      const t = state.world.getTile(wx, wy, p.z);
      const c = tileToMiniColor(theme, t, isVis);
      if (!c) continue;

      mctx.fillStyle = c;
      mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, MINI_SCALE);

      if (wx % CHUNK === 0 || wy % CHUNK === 0) {
        mctx.fillStyle = "#0f1420";
        mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, 1);
      }
    }
  }

  const { monsters, items } = getCachedOccupancy(state);
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const wx = p.x + (mx - MINI_RADIUS);
      const wy = p.y + (my - MINI_RADIUS);
      if (!state.seen.has(keyXYZ(wx, wy, p.z))) continue;

      const ik = items.get(keyXYZ(wx, wy, p.z));
      if (ik) {
        const ent = state.entities.get(ik);
        mctx.fillStyle =
          ent?.type === "shrine" ? "#b8f2e6" :
          ent?.type === "chest" ? "#d9b97a" :
          "#f4d35e";
        mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, MINI_SCALE);
      }

      const mk = monsters.get(keyXYZ(wx, wy, p.z));
      if (mk) {
        if (!state.visible.has(keyXY(wx, wy))) continue;
        mctx.fillStyle = "#ff6b6b";
        mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, MINI_SCALE);
      }
    }
  }

  // Draw stair arrows on top of minimap tiles so ladders are always identifiable.
  mctx.textAlign = "center";
  mctx.textBaseline = "middle";
  mctx.font = `bold ${Math.max(8, MINI_SCALE * 3)}px ui-monospace, monospace`;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const wx = p.x + (mx - MINI_RADIUS);
      const wy = p.y + (my - MINI_RADIUS);
      if (!state.seen.has(keyXYZ(wx, wy, p.z))) continue;
      const t = state.world.getTile(wx, wy, p.z);
      if (t !== STAIRS_UP && t !== STAIRS_DOWN) continue;

      const cx = mx * MINI_SCALE + MINI_SCALE / 2;
      const cy = my * MINI_SCALE + MINI_SCALE / 2;
      mctx.fillStyle = t === STAIRS_UP ? "#f0d8ff" : "#d8ffd8";
      mctx.fillText(t === STAIRS_UP ? "\u25B2" : "\u25BC", cx, cy);
    }
  }

  // Draw locked-door markers only (exclude standard closed/open doors).
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const wx = p.x + (mx - MINI_RADIUS);
      const wy = p.y + (my - MINI_RADIUS);
      if (!state.seen.has(keyXYZ(wx, wy, p.z))) continue;
      const t = state.world.getTile(wx, wy, p.z);
      if (!tileIsLocked(t)) continue;
      const markerColor = tileGlyph(t)?.c ?? "#ffd966";
      const dotSize = Math.max(1, Math.floor(MINI_SCALE * 0.66));
      const ox = Math.floor((MINI_SCALE - dotSize) / 2);
      const oy = Math.floor((MINI_SCALE - dotSize) / 2);
      mctx.fillStyle = markerColor;
      mctx.fillRect(mx * MINI_SCALE + ox, my * MINI_SCALE + oy, dotSize, dotSize);
    }
  }

  const surfaceTarget = p.z === 0
    ? (state.surfaceLink ?? resolveSurfaceLink(state))
    : (p.z === SURFACE_LEVEL ? { x: 0, y: 0, z: SURFACE_LEVEL } : null);
  if (surfaceTarget && surfaceTarget.z === p.z) {
    const mx = surfaceTarget.x - p.x + MINI_RADIUS;
    const my = surfaceTarget.y - p.y + MINI_RADIUS;
    if (mx >= 0 && mx < size && my >= 0 && my < size && state.seen.has(keyXYZ(surfaceTarget.x, surfaceTarget.y, p.z))) {
      const cx = mx * MINI_SCALE + MINI_SCALE / 2;
      const cy = my * MINI_SCALE + MINI_SCALE / 2;
      const rOuter = Math.max(4, MINI_SCALE * 1.8);
      const rInner = Math.max(1.6, rOuter * 0.48);
      const points = 5;
      const step = Math.PI / points;

      mctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = (i % 2 === 0) ? rOuter : rInner;
        const a = -Math.PI / 2 + i * step;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) mctx.moveTo(x, y);
        else mctx.lineTo(x, y);
      }
      mctx.closePath();
      mctx.fillStyle = "#ffd166";
      mctx.fill();
      mctx.lineWidth = 1;
      mctx.strokeStyle = "rgba(80,55,0,0.85)";
      mctx.stroke();
    }
  }

  mctx.fillStyle = "#7ce3ff";
  mctx.fillRect(MINI_RADIUS * MINI_SCALE, MINI_RADIUS * MINI_SCALE, MINI_SCALE, MINI_SCALE);
}

// ---------- Effects tick ----------
function applyEffectsTick(state) {
  const p = state.player;
  if (p.poisonImmune) {
    p.effects = (p.effects ?? []).filter((e) => e?.type !== "poison");
  }
  if (!p.effects.length) return;

  for (const e of p.effects) {
    if (e.type === "regen") {
      if (p.hp > 0) p.hp = clamp(p.hp + e.healPerTurn, 0, p.maxHp);
    }
    if (e.type === "poison") {
      if (p.hp > 0) {
        const dmg = Math.max(1, Math.floor(Number(e.dmgPerTurn ?? 1)));
        p.hp = Math.max(0, p.hp - dmg);
        pushLog(state, `Poison deals ${dmg} damage.`);
      }
    }
    e.turnsLeft -= 1;
  }
  p.effects = p.effects.filter(e => e.turnsLeft > 0);
  if (p.hp <= 0 && !p.dead) killPlayer(state);

  recalcDerivedStats(state);
  renderEquipment(state);
  renderEffects(state);
}

function ensurePoisonCloudState(state) {
  if (!state || typeof state !== "object") return {};
  if (!state.poisonClouds || typeof state.poisonClouds !== "object") state.poisonClouds = {};
  return state.poisonClouds;
}

function normalizeMonsterEffects(rawEffects) {
  const out = [];
  for (const raw of rawEffects ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const type = String(raw.type ?? "").trim().toLowerCase();
    if (type !== "poison") continue;
    const dmgPerTurn = Math.max(1, Math.floor(Number(raw.dmgPerTurn ?? 1)));
    const stacks = Math.max(1, Math.floor(Number(raw.stacks ?? 1)));
    const baseDmgPerTurn = Math.max(1, Math.floor(Number(raw.baseDmgPerTurn ?? Math.max(1, Math.round(dmgPerTurn / stacks)))));
    const turnsLeft = Math.max(0, Math.floor(Number(raw.turnsLeft ?? 0)));
    if (turnsLeft <= 0) continue;
    const entry = { type: "poison", dmgPerTurn, turnsLeft };
    if (stacks > 1) entry.stacks = stacks;
    if (baseDmgPerTurn > 0) entry.baseDmgPerTurn = baseDmgPerTurn;
    out.push(entry);
  }
  return out;
}

function ensureMonsterEffects(monster) {
  if (!monster || typeof monster !== "object") return [];
  if (!Array.isArray(monster.effects)) monster.effects = [];
  monster.effects = normalizeMonsterEffects(monster.effects);
  return monster.effects;
}

function persistMonsterOverride(state, monster) {
  if (!state || !monster || monster.origin !== "base") return;
  const next = {
    x: Math.floor(monster.x ?? 0),
    y: Math.floor(monster.y ?? 0),
    z: Math.floor(monster.z ?? 0),
    hp: Math.max(0, Math.floor(monster.hp ?? 0)),
    cd: Math.max(0, Math.floor(monster.cd ?? 0)),
    awake: !!monster.awake,
  };
  if (Number.isFinite(monster.abilityCd)) next.abilityCd = Math.max(0, Math.floor(monster.abilityCd));
  const effects = normalizeMonsterEffects(monster.effects ?? []);
  if (effects.length) next.effects = effects;
  state.entityOverrides.set(monster.id, next);
}

function applyPoisonToMonster(state, monster, dmgPerTurn = 1, turns = 2, sourceLabel = "toxic spit", options = null) {
  if (!monster || monster.kind !== "monster") return false;
  const spec = monsterStatsForDepth(monster.type, monster.z ?? state?.player?.z ?? 0);
  if (spec?.immunePoison) return false;
  const opts = (options && typeof options === "object") ? options : {};
  const stackMode = !!opts.stack;
  const maxStacks = Math.max(1, Math.floor(Number(opts.maxStacks ?? 4)));
  const dpt = Math.max(1, Math.floor(Number(dmgPerTurn ?? 1)));
  const ttl = Math.max(1, Math.floor(Number(turns ?? 1)));
  const effects = ensureMonsterEffects(monster);
  const existing = effects.find((e) => e.type === "poison");
  const isNew = !existing;
  if (existing) {
    if (stackMode) {
      const prevStacks = Math.max(1, Math.floor(existing.stacks ?? 1));
      const nextStacks = Math.min(maxStacks, prevStacks + 1);
      const prevBase = Math.max(1, Math.floor(existing.baseDmgPerTurn ?? Math.max(1, Math.round((existing.dmgPerTurn ?? 1) / prevStacks))));
      const baseDmg = Math.max(prevBase, dpt);
      existing.stacks = nextStacks;
      existing.baseDmgPerTurn = baseDmg;
      existing.dmgPerTurn = Math.max(1, Math.floor(baseDmg * nextStacks));
      existing.turnsLeft = Math.max(Math.floor(existing.turnsLeft ?? 0), ttl);
    } else {
      existing.dmgPerTurn = Math.max(Math.floor(existing.dmgPerTurn ?? 1), dpt);
      existing.turnsLeft = Math.max(Math.floor(existing.turnsLeft ?? 0), ttl);
      existing.stacks = Math.max(1, Math.floor(existing.stacks ?? 1));
      if (existing.stacks <= 1) delete existing.stacks;
      delete existing.baseDmgPerTurn;
    }
  } else {
    if (stackMode) effects.push({ type: "poison", dmgPerTurn: dpt, turnsLeft: ttl, stacks: 1, baseDmgPerTurn: dpt });
    else effects.push({ type: "poison", dmgPerTurn: dpt, turnsLeft: ttl });
  }
  persistMonsterOverride(state, monster);
  if (isNew) {
    pushLog(state, `The ${monsterDisplayName(monster, state?.player?.z ?? monster.z ?? 0)} is poisoned by ${sourceLabel}.`);
  }
  return true;
}

function tickMonsterEffects(state) {
  const p = state?.player;
  if (!p || p.dead) return;
  for (const monster of Array.from(state.entities.values())) {
    if (!monster || monster.kind !== "monster") continue;
    if (monster.z !== p.z) continue;
    if (!Array.isArray(monster.effects) || monster.effects.length <= 0) continue;
    let poisonDamage = 0;
    for (const e of monster.effects) {
      if (e.type === "poison" && monster.hp > 0) {
        const dmg = Math.max(1, Math.floor(Number(e.dmgPerTurn ?? 1)));
        monster.hp = Math.max(0, monster.hp - dmg);
        poisonDamage += dmg;
      }
      e.turnsLeft = Math.max(0, Math.floor(Number(e.turnsLeft ?? 0)) - 1);
    }
    monster.effects = normalizeMonsterEffects(monster.effects);
    if (poisonDamage > 0) {
      pushLog(state, `Poison deals ${poisonDamage} to the ${monsterDisplayName(monster, p.z)}.`);
    }
    if (monster.hp <= 0) {
      const xpMult = xpChallengeMultiplier(state, monster, monsterStatsForDepth(monster.type, monster.z ?? p.z));
      handleMonsterDefeat(state, monster, {
        xpMult,
        deathMessage: `The ${monsterDisplayName(monster, p.z)} succumbs to poison.`,
      });
      continue;
    }
    persistMonsterOverride(state, monster);
  }
}

function applyPoisonToPlayer(state, dmgPerTurn = 40, turns = 2, sourceLabel = "poison") {
  const p = state?.player;
  if (!p || p.dead) return;
  if (p.poisonImmune) return;
  const dpt = Math.max(1, Math.floor(dmgPerTurn));
  const ttl = Math.max(1, Math.floor(turns));
  const existing = p.effects.find((e) => e.type === "poison");
  if (existing) {
    existing.dmgPerTurn = Math.max(Math.floor(existing.dmgPerTurn ?? 1), dpt);
    existing.turnsLeft = Math.max(Math.floor(existing.turnsLeft ?? 0), ttl);
  } else {
    p.effects.push({ type: "poison", dmgPerTurn: dpt, turnsLeft: ttl });
  }
  pushLog(state, `You are poisoned by ${sourceLabel}.`);
}

function applySlowToPlayer(state, turns = 2, accDelta = -6, evaDelta = -10, speedMult = 0.88, sourceLabel = "slowing shot") {
  const p = state?.player;
  if (!p || p.dead) return;
  const ttl = Math.max(1, Math.floor(turns));
  const existing = p.effects.find((e) => e.type === "slow");
  if (existing) {
    existing.turnsLeft = Math.max(Math.floor(existing.turnsLeft ?? 0), ttl);
    existing.accDelta = Math.min(Math.floor(existing.accDelta ?? 0), Math.floor(accDelta));
    existing.evaDelta = Math.min(Math.floor(existing.evaDelta ?? 0), Math.floor(evaDelta));
    existing.speedMult = Math.min(Number(existing.speedMult ?? 1), Number(speedMult));
  } else {
    p.effects.push({
      type: "slow",
      turnsLeft: ttl,
      accDelta: Math.floor(accDelta),
      evaDelta: Math.floor(evaDelta),
      speedMult: Number(speedMult),
    });
  }
  pushLog(state, `${sourceLabel} slows you.`);
  recalcDerivedStats(state);
}

function spawnPoisonCloudBurst(state, x, y, z, turns = 3, radius = 1, dmg = 55, sourceLabel = "spores") {
  const clouds = ensurePoisonCloudState(state);
  const ttl = Math.max(1, Math.floor(turns));
  const rad = Math.max(0, Math.floor(radius));
  const cloudDmg = Math.max(1, Math.floor(dmg));
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > rad) continue;
      const tx = x + dx;
      const ty = y + dy;
      const tile = state.world.getTile(tx, ty, z);
      if (tile === WALL || tileIsLocked(tile) || tile === DOOR_CLOSED) continue;
      const key = keyXYZ(tx, ty, z);
      const existing = clouds[key];
      if (existing) {
        existing.turnsLeft = Math.max(existing.turnsLeft ?? 0, ttl);
        existing.dmg = Math.max(existing.dmg ?? 1, cloudDmg);
      } else {
        clouds[key] = { x: tx, y: ty, z, turnsLeft: ttl, dmg: cloudDmg, source: sourceLabel };
      }
    }
  }
  pushLog(state, `Toxic ${sourceLabel} spread across the area.`);
}

function tickPoisonClouds(state) {
  const clouds = ensurePoisonCloudState(state);
  const p = state.player;
  if (!p || p.dead) {
    for (const key of Object.keys(clouds)) {
      const entry = clouds[key];
      entry.turnsLeft = Math.max(0, Math.floor(entry.turnsLeft ?? 0) - 1);
      if (entry.turnsLeft <= 0) delete clouds[key];
    }
    return;
  }
  const key = keyXYZ(p.x, p.y, p.z);
  const cloud = clouds[key];
  if (cloud) {
    const base = Math.max(1, Math.floor(cloud.dmg ?? 1));
    const reduced = reduceIncomingDamage(state, base, p.z);
    const dmg = Math.max(1, Math.floor(reduced?.dmg ?? 1));
    p.hp = Math.max(0, p.hp - dmg);
    pushLog(state, `Toxic cloud burns you for ${dmg}.`);
    applyPoisonToPlayer(state, Math.round(base * 0.6), 2, cloud.source ?? "the cloud");
    if (p.hp <= 0 && !p.dead) killPlayer(state);
  }
  for (const k of Object.keys(clouds)) {
    const entry = clouds[k];
    entry.turnsLeft = Math.max(0, Math.floor(entry.turnsLeft ?? 0) - 1);
    if (entry.turnsLeft <= 0) delete clouds[k];
  }
}

function applyReveal(state, radius = 28) {
  const p = state.player;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = p.x + dx, wy = p.y + dy;
      state.seen.add(keyXYZ(wx, wy, p.z));
    }
  }
}

// ---------- Leveling ----------
function grantXP(state, amount) {
  const p = state.player;
  if (!Number.isFinite(amount) || amount <= 0) return;
  const profile = touchCharacterProgress(state);
  const expectedMaxHp = maxHpForLevel(p.level, profile);
  if (p.maxHp !== expectedMaxHp) {
    const ratio = clamp((p.hp ?? expectedMaxHp) / Math.max(1, p.maxHp ?? expectedMaxHp), 0, 1);
    p.maxHp = expectedMaxHp;
    p.hp = clamp(Math.round(expectedMaxHp * ratio), 0, expectedMaxHp);
  }
  const xpMult = Math.max(0.1, Number(p.xpGainMult ?? 1));
  const gainedXp = Math.max(1, Math.round(amount * xpMult));
  p.xp += gainedXp;
  pushLog(state, `+${gainedXp} XP`);
  let didLevelUp = false;

  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    const prevLevel = p.level;
    const prevMaxHp = maxHpForLevel(prevLevel, profile);
    p.level += 1;
    p.maxHp = maxHpForLevel(p.level, profile);
    const hpGain = p.maxHp - prevMaxHp;
    p.hp = clamp(p.hp + hpGain, 0, p.maxHp);
    if (profile) {
      profile.unspentStatPoints = Math.max(0, Math.floor(profile.unspentStatPoints ?? 0)) + LEVEL_UP_ATTRIBUTE_POINTS;
    }
    didLevelUp = true;
    pushLog(
      state,
      `*** Level up! You are now level ${p.level}. (+${hpGain} max HP, +${LEVEL_UP_ATTRIBUTE_POINTS} attribute point)`
    );
  }

  recalcDerivedStats(state);
  renderEquipment(state);
  renderCharacterStatsPanel(state);
  if (didLevelUp) {
    promptLevelUpOverlay(state, true);
  }
}

function maybeGrantExplorationXP(state) {
  const p = state.player;
  const { cx, cy } = splitWorldToChunk(p.x, p.y);
  const key = keyZCXCY(p.z, cx, cy);
  if (state.exploredChunks?.has(key)) return;

  state.exploredChunks?.add(key);

  const chunk = state.world.getChunk(p.z, cx, cy);
  const rooms = Math.max(0, chunk.explore?.rooms ?? 0);
  const corridors = Math.max(0, chunk.explore?.corridors ?? 0);
  const xp = xpExplorationBonus(rooms, corridors, p.z);
  if (xp <= 0) return;

  grantXP(state, xp);
  pushLog(
    state,
    `Exploration: +${xp} XP (${rooms} room${rooms === 1 ? "" : "s"}, ${corridors} corridor${corridors === 1 ? "" : "s"}).`
  );
}

// ---------- Damage helpers ----------
function rollHit(attackerAcc, defenderEva) {
  const chancePct = clamp(Math.round((attackerAcc ?? 70) - (defenderEva ?? 0)), 10, 95);
  return Math.random() * 100 < chancePct;
}
function applyDefenseMitigation(rawDamage, defense, ignorePct = 0) {
  const raw = Math.max(1, Math.floor(rawDamage ?? 1));
  const def = Math.max(0, Number(defense ?? 0));
  const ignore = clamp(Number(ignorePct ?? 0), 0, 0.95);
  const effectiveDef = Math.max(0, def * (1 - ignore));
  const scaled = raw * (100 / (100 + effectiveDef));
  const minDamage = Math.max(1, Math.round(raw * 0.10));
  return Math.max(minDamage, Math.round(scaled));
}
function isVoidAlignedMonsterType(type) {
  const raw = String(type ?? "").trim();
  if (!raw) return false;
  const alias = MONSTER_TYPES[raw]?.aliasOf ?? "";
  return VOID_ALIGNED_MONSTER_IDS.has(raw) || (alias ? VOID_ALIGNED_MONSTER_IDS.has(alias) : false);
}
function isLowTierWeaponType(type) {
  if (!type || typeof type !== "string" || !type.startsWith("weapon_")) return false;
  const materialId = materialIdFromItemType(type);
  if (!materialId) return false;
  const tierIndex = METAL_TIERS.findIndex((tier) => tier.id === materialId);
  return tierIndex >= 0 && tierIndex <= SCRAPPER_LOW_TIER_MAX_INDEX;
}
function playerAttackDamage(state, monster = null, options = null) {
  const p = state.player;
  const opts = (options && typeof options === "object") ? options : {};
  const classId = normalizeCharacterClassId(p.classId, p.speciesId);
  const weaponProfile = (opts.weaponProfile && typeof opts.weaponProfile === "object")
    ? opts.weaponProfile
    : playerWeaponAttackProfile(state);
  const profileDamageMod = Math.max(0.1, Number(weaponProfile?.damageMod ?? 1));
  const profileCritMod = Number(weaponProfile?.critChanceMod ?? 0);
  const firstCombatStrike = !!opts.firstCombatStrike;
  const attackAfterMove = !!opts.attackAfterMove;
  const targetUnengaged = !!opts.targetUnengaged;
  const distance = Math.max(0, Math.floor(Number(opts.distance ?? (
    monster ? (Math.abs((monster.x ?? 0) - p.x) + Math.abs((monster.y ?? 0) - p.y)) : 1
  )) || 0));
  const baseLo = Math.max(1, Math.floor(p.atkLo ?? 1));
  const baseHi = Math.max(baseLo, Math.floor(p.atkHi ?? baseLo));
  const baseRoll = baseLo + Math.floor(Math.random() * (baseHi - baseLo + 1));
  const weaponAtk = Math.floor(p.weaponAtkBonus ?? 0);
  const effectAtk = Math.floor(p.effectAtkBonus ?? 0);
  const weaponScale = Math.max(0.1, Number(p.weaponAtkScale ?? 1));
  const scaledWeaponAtk = weaponAtk >= 0
    ? Math.round(weaponAtk * weaponScale * (p.weaponDamageMult ?? 1))
    : weaponAtk;
  let raw = Math.max(1, baseRoll + scaledWeaponAtk + effectAtk);

  let damageMult = Math.max(0.1, Number(p.damageMult ?? 1)) * profileDamageMod;
  if ((weaponProfile?.kind ?? "melee") === "ranged") {
    const closeRangeDamageMult = clamp(Number(weaponProfile?.closeRangeDamageMult ?? 1), 0.2, 1);
    if (distance <= 1) damageMult *= closeRangeDamageMult;

    const maxRangeFalloffPct = clamp(Number(weaponProfile?.maxRangeFalloffPct ?? 0), 0, 0.8);
    const minRange = Math.max(1, Math.floor(Number(weaponProfile?.minRange ?? 1) || 1));
    const maxRange = Math.max(minRange, Math.floor(Number(weaponProfile?.range ?? minRange) || minRange));
    const span = Math.max(0, maxRange - minRange);
    if (maxRangeFalloffPct > 0 && span > 0 && distance > minRange) {
      const t = clamp((distance - minRange) / span, 0, 1);
      damageMult *= (1 - maxRangeFalloffPct * t);
    }
  }
  if ((p.lowHpDamageMult ?? 1) > 1 && p.hp <= Math.max(1, p.maxHp) * 0.4) damageMult *= p.lowHpDamageMult;
  if (attackAfterMove) damageMult *= Math.max(1, Number(p.firstStrikeMoveMult ?? 1));
  if (classId === "tunnel_striker" && distance <= 1) damageMult *= 1.15;
  if (classId === "riftstalker" && targetUnengaged) damageMult *= 1.15;
  if (classId === "slipblade" && p.slipbladeBonusReady) {
    damageMult *= 1.1;
    p.slipbladeBonusReady = false;
  }
  if (classId === "overclock_unit" && Number(p.overclockUntilMs ?? 0) > Date.now()) damageMult *= 1.1;
  if (classId === "nullblade" && monster && isVoidAlignedMonsterType(monster.type)) damageMult *= 1.1;
  if (classId === "scrapper" && isLowTierWeaponType(p.equip?.weapon)) damageMult *= 1.1;

  let crit = false;
  const critChance = clamp(Math.round((p.critChance ?? 0) + profileCritMod), 0, 95);
  if (Math.random() * 100 < critChance) {
    crit = true;
    damageMult *= Math.max(1, Number(p.critDamageMult ?? 1.5));
  }
  if (classId === "skydarter" && firstCombatStrike) damageMult *= 1.12;
  raw = Math.max(1, Math.round(raw * damageMult));

  if (!monster) return { raw, dmg: raw, crit };
  const classRangedDefIgnore = (weaponProfile?.kind ?? "melee") === "ranged"
    ? Number(p.rangedDefIgnorePct ?? 0)
    : 0;
  const mSpec = monsterStatsForDepth(monster.type, monster.z ?? state.player.z);
  let ignorePct = Math.max(
    classRangedDefIgnore,
    crit ? Number(p.critDefIgnorePct ?? 0) : 0,
    Number(weaponProfile?.defIgnorePct ?? 0)
  );
  if (classId === "veilblade" && firstCombatStrike) ignorePct = Math.max(ignorePct, 0.25);
  const dmg = applyDefenseMitigation(raw, mSpec.def, ignorePct);
  return { raw, dmg, crit };
}
function reduceIncomingDamage(state, dmg, attackerDepth = null) {
  const depth = clamp(Math.floor(attackerDepth ?? state.player.z ?? 0), 0, 160);
  const rawDef = Math.max(0, Number(state.player.defBonus ?? 0));
  const effectiveDef = rawDef <= PLAYER_DEFENSE_SOFTCAP_BASE
    ? rawDef
    : (PLAYER_DEFENSE_SOFTCAP_BASE + (rawDef - PLAYER_DEFENSE_SOFTCAP_BASE) * PLAYER_DEFENSE_SOFTCAP_SLOPE);
  const mitigated = applyDefenseMitigation(Math.max(1, Math.floor(dmg ?? 1)), effectiveDef, 0);
  const flatReduction = Math.max(0, Math.floor(state.player.incomingDamageFlat ?? 0));
  let reduced = Math.max(1, mitigated - flatReduction);
  // Keep encounters threatening as HP/DEF rise by enforcing a depth-scaled minimum chip.
  const minPct = clamp(0.008 + depth * 0.00035, 0.008, 0.02);
  const minByHp = Math.max(1, Math.round(Math.max(1, state.player.maxHp ?? 1) * minPct));
  reduced = Math.max(reduced, minByHp);
  let shaded = false;
  if (normalizeCharacterClassId(state.player.classId, state.player.speciesId) === "shadeguard" && Math.random() < 0.15) {
    reduced = Math.max(1, Math.round(reduced * 0.7));
    shaded = true;
  }
  return { dmg: reduced, shaded };
}
function ensureCombatState(state) {
  if (!state.combat || typeof state.combat !== "object") {
    state.combat = { lastEventMs: 0, regenAnchorMs: Date.now(), hudTargets: {} };
  }
  if (!state.combat.hudTargets || typeof state.combat.hudTargets !== "object") {
    state.combat.hudTargets = {};
  }
  if (!Number.isFinite(state.combat.lastEventMs)) state.combat.lastEventMs = 0;
  if (!Number.isFinite(state.combat.regenAnchorMs)) state.combat.regenAnchorMs = Date.now();
  return state.combat;
}
function ensureDisengageState(state) {
  if (!state.disengageGrace || typeof state.disengageGrace !== "object") state.disengageGrace = {};
  return state.disengageGrace;
}
function markCombatEvent(state, monster = null) {
  const now = Date.now();
  const combat = ensureCombatState(state);
  combat.lastEventMs = now;
  combat.regenAnchorMs = now;
  combat.hudTargets.player = now + COMBAT_HUD_WINDOW_MS;
  if (monster?.id) combat.hudTargets[monster.id] = now + COMBAT_HUD_WINDOW_MS;
}
function hasNearbyLivingMonster(state, radius = COMBAT_REGEN_ENEMY_BLOCK_RADIUS) {
  const p = state.player;
  if (!p) return false;
  const blockRadius = Math.max(1, Math.floor(Number(radius) || COMBAT_REGEN_ENEMY_BLOCK_RADIUS));
  for (const ent of state.entities.values()) {
    if (!ent || ent.kind !== "monster") continue;
    if (ent.z !== p.z) continue;
    if ((ent.hp ?? 0) <= 0) continue;
    const dist = Math.abs((ent.x ?? 0) - p.x) + Math.abs((ent.y ?? 0) - p.y);
    if (dist <= blockRadius) return true;
  }
  return false;
}
function pruneCombatHudTargets(state, now = Date.now()) {
  const combat = ensureCombatState(state);
  for (const [id, expiresAt] of Object.entries(combat.hudTargets)) {
    if (!Number.isFinite(expiresAt) || expiresAt < now) delete combat.hudTargets[id];
  }
}
function applyOutOfCombatRegen(state, now = Date.now()) {
  const p = state.player;
  if (!p || p.dead) return false;
  const combat = ensureCombatState(state);
  pruneCombatHudTargets(state, now);
  if (combat.lastEventMs > 0 && now - combat.lastEventMs < COMBAT_REGEN_DELAY_MS) {
    if (combat.regenAnchorMs < combat.lastEventMs) combat.regenAnchorMs = combat.lastEventMs;
    return false;
  }
  if (hasNearbyLivingMonster(state)) {
    combat.regenAnchorMs = now;
    return false;
  }
  if (!Number.isFinite(combat.regenAnchorMs) || combat.regenAnchorMs < combat.lastEventMs) {
    combat.regenAnchorMs = Math.max(combat.lastEventMs, now - COMBAT_REGEN_TICK_MS);
  }
  if (!p.combatFirstStrikeReady) p.combatFirstStrikeReady = true;
  if (p.hp >= p.maxHp) return false;
  const elapsed = now - combat.regenAnchorMs;
  const ticks = Math.floor(elapsed / COMBAT_REGEN_TICK_MS);
  if (ticks <= 0) return false;
  const healPerTick = Math.max(1, Math.floor(Math.max(1, p.maxHp) * COMBAT_REGEN_PCT_PER_TICK * Math.max(0.1, p.healMult ?? 1)));
  const before = p.hp;
  p.hp = clamp(p.hp + healPerTick * ticks, 0, p.maxHp);
  combat.regenAnchorMs += ticks * COMBAT_REGEN_TICK_MS;
  return p.hp !== before;
}
function killPlayer(state) {
  state.player.hp = 0;
  state.player.dead = true;
  pushLog(state, "YOU DIED.");
}

// ---------- Doors ----------
function tileIsLocked(t) {
  return t === LOCK_GREEN || t === LOCK_YELLOW || t === LOCK_ORANGE || t === LOCK_RED || t === LOCK_VIOLET || t === LOCK_INDIGO || t === LOCK_BLUE || t === LOCK_PURPLE || t === LOCK_MAGENTA || t === "*";
}
function lockToKeyType(t) {
  if (t === LOCK_GREEN) return KEY_GREEN;
  if (t === LOCK_YELLOW) return KEY_YELLOW;
  if (t === LOCK_ORANGE) return KEY_ORANGE;
  if (t === "*" || t === LOCK_RED) return KEY_RED;
  if (t === LOCK_VIOLET) return KEY_VIOLET;
  if (t === LOCK_INDIGO) return KEY_INDIGO;
  if (t === LOCK_BLUE) return KEY_INDIGO;
  if (t === LOCK_PURPLE) return KEY_VIOLET;
  if (t === LOCK_MAGENTA) return KEY_INDIGO;
  return KEY_GREEN;
}
function lockToOpenDoorTile(t) {
  if (t === LOCK_GREEN) return DOOR_OPEN_GREEN;
  if (t === LOCK_YELLOW) return DOOR_OPEN_YELLOW;
  if (t === LOCK_ORANGE) return DOOR_OPEN_ORANGE;
  if (t === LOCK_RED) return DOOR_OPEN_RED;
  if (t === LOCK_VIOLET) return DOOR_OPEN_VIOLET;
  if (t === LOCK_INDIGO) return DOOR_OPEN_INDIGO;
  if (t === LOCK_BLUE) return DOOR_OPEN_INDIGO;
  if (t === LOCK_PURPLE) return DOOR_OPEN_VIOLET;
  if (t === LOCK_MAGENTA) return DOOR_OPEN_INDIGO;
  return DOOR_OPEN;
}

function tryUnlockDoor(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (!tileIsLocked(t)) return false;

  const keyType = lockToKeyType(t);
  const lockpickEnabled = !!stateDebug(state).lockpick;
  if (!lockpickEnabled && !invConsume(state, keyType, 1)) {
    pushLog(state, `Locked door. Need a ${ITEM_TYPES[keyType].name}.`);
    renderInventory(state);
    return true;
  }

  state.world.setTile(x, y, z, lockToOpenDoorTile(t));
  if (lockpickEnabled) pushLog(state, "You pick the lock and open the door.");
  else pushLog(state, "You unlock and open the door.");
  renderInventory(state);
  return true;
}

function tryOpenClosedDoor(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (t !== DOOR_CLOSED) return false;
  state.world.setTile(x, y, z, DOOR_OPEN);
  pushLog(state, "You open the door.");
  state.visitedDoors?.add(keyXYZ(x, y, z));
  return true;
}

function tryCloseAdjacentDoor(state) {
  const p = state.player;
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (!isOpenDoorTile(t)) continue;

    const { monsters, items } = buildOccupancy(state);
    const occ = monsters.get(keyXYZ(x, y, p.z)) || items.get(keyXYZ(x, y, p.z));
    if (occ) continue;

    state.world.setTile(x, y, p.z, DOOR_CLOSED);
    pushLog(state, "You close the door.");
    return true;
  }
  pushLog(state, "No open door adjacent to close.");
  return false;
}

// ---------- Dynamic drops ----------
function spawnDynamicItem(state, type, amount, x, y, z) {
  const id = `dyn|${type}|${z}|${x},${y}|${Date.now()}|${Math.floor(Math.random() * 1e9)}`;
  const ent = { id, origin: "dynamic", kind: "item", type, amount, x, y, z };
  state.dynamic.set(id, ent);
  state.entities.set(id, ent);
}

function chestLootDepthBounds(depth, chest = null) {
  const d = Math.max(0, Math.floor(depth ?? 0));
  const isRewardChest = !!chest?.rewardChest;
  const isLockedChest = !!chest?.locked;
  const overlevelSoftCap = isRewardChest ? 3 : (isLockedChest ? 2 : 1);
  const progressionCap = Math.max(1, Math.floor(d * 1.35) + 2);
  const maxDepth = Math.max(d, Math.min(d + overlevelSoftCap, progressionCap));
  const minDepth = Math.max(0, d - (isRewardChest ? 0 : 1));
  return { minDepth, maxDepth };
}

function normalizeChestLootDepth(depth, chest = null) {
  const d = Math.max(0, Math.floor(depth ?? 0));
  const bounds = chestLootDepthBounds(d, chest);
  const rawDepth = Number(chest?.lootDepth);
  const fallback = d + (chest?.rewardChest ? 1 : 0);
  const sourceDepth = Number.isFinite(rawDepth) ? Math.floor(rawDepth) : fallback;
  return clamp(sourceDepth, bounds.minDepth, bounds.maxDepth);
}

function dropEquipmentFromChest(state, chest = null) {
  const z = Math.max(0, Math.floor(Number(chest?.z ?? state.player.z) || 0));
  const isRewardChest = !!chest?.rewardChest;
  const locked = !!chest?.locked;
  const bounds = chestLootDepthBounds(z, chest);
  const baseLootDepth = normalizeChestLootDepth(z, chest);
  const depthBias = isRewardChest ? randInt(Math.random, 0, 2) : (locked ? randInt(Math.random, 0, 1) : randInt(Math.random, 0, 1));
  const lootDepth = clamp(baseLootDepth + depthBias, bounds.minDepth, bounds.maxDepth);

  const gearRolls = isRewardChest ? randInt(Math.random, 2, 3) : (locked ? randInt(Math.random, 1, 2) : (Math.random() < 0.42 ? 1 : 0));
  for (let i = 0; i < gearRolls; i++) {
    const rollDepth = clamp(
      lootDepth + randInt(Math.random, 0, isRewardChest ? 1 : 0),
      bounds.minDepth,
      bounds.maxDepth
    );
    const drop = Math.random() < 0.58 ? weaponForDepth(rollDepth, Math.random) : armorForDepth(rollDepth, Math.random);
    invAdd(state, drop, 1);
    pushLog(state, `${isRewardChest ? "Reward" : "Found"}: ${ITEM_TYPES[drop].name}.`);
  }

  const potionRolls = isRewardChest
    ? (Math.random() < 0.75 ? 1 : 0) + (Math.random() < 0.28 ? 1 : 0)
    : (locked ? (Math.random() < 0.55 ? 1 : 0) : (Math.random() < 0.36 ? 1 : 0));
  for (let i = 0; i < potionRolls; i++) {
    invAdd(state, "potion", 1);
    pushLog(state, `${isRewardChest ? "Reward" : "Found"}: Potion.`);
  }

  const keyChance = isRewardChest ? 0.24 : (locked ? 0.18 : 0.08);
  if (Math.random() < keyChance) {
    const keyDepth = clamp(Math.max(z, lootDepth - (locked ? 1 : 0)), bounds.minDepth, bounds.maxDepth);
    const key = keyTypeForDepth(keyDepth, Math.random);
    invAdd(state, key, 1);
    pushLog(state, `${isRewardChest ? "Reward" : "Found"}: ${ITEM_TYPES[key].name}.`);
  }
}

function maybeDropKeyFromMonster(state, monster) {
  const z = Math.max(0, monster?.z ?? state.player.z ?? 0);
  const spec = monsterStatsForDepth(monster.type, z);
  let chance = 0.06 + Math.min(0.14, z * 0.003) + clamp(((spec.xp ?? 3) - 6) * 0.004, 0, 0.12);
  if (monster.type === "goblin" || monster.type === "rogue") chance += 0.06;
  if (monster.type === "archer" || monster.type === "dire_wolf") chance += 0.05;
  if (monster.type === "slime_red" || monster.type === "slime_violet" || monster.type === "slime_indigo") chance += 0.07;
  if (monster.type === "cave_troll" || monster.type === "basilisk" || monster.type === "ancient_automaton") chance += 0.09;

  if (Math.random() >= clamp(chance, 0.04, 0.35)) return false;

  const keyType = keyTypeForDepth(z, Math.random);
  spawnDynamicItem(state, keyType, 1, monster.x, monster.y, monster.z);
  pushLog(state, `It dropped a ${ITEM_TYPES[keyType].name}!`);
  return true;
}

// ---------- Player actions ----------
function tryKnockbackMonster(state, monster, sourceX, sourceY) {
  if (!monster || monster.kind !== "monster") return false;
  const dx = Math.sign((monster.x ?? 0) - (sourceX ?? 0));
  const dy = Math.sign((monster.y ?? 0) - (sourceY ?? 0));
  if (dx === 0 && dy === 0) return false;
  const tx = (monster.x ?? 0) + dx;
  const ty = (monster.y ?? 0) + dy;
  const tz = monster.z ?? state.player.z;
  if (!state.world.isPassable(tx, ty, tz)) return false;
  const occ = buildOccupancy(state);
  const occKey = keyXYZ(tx, ty, tz);
  if (occ.monsters.has(occKey) || occ.items.has(occKey)) return false;
  monster.x = tx;
  monster.y = ty;
  persistMonsterOverride(state, monster);
  return true;
}

function tryKnockbackPlayer(state, sourceX, sourceY) {
  const p = state?.player;
  if (!p || p.dead) return false;
  const resistPct = clamp(Number(p.knockbackResistPct ?? 0), 0, 1);
  if (resistPct >= 1 || Math.random() < resistPct) return false;
  const dx = Math.sign((p.x ?? 0) - (sourceX ?? 0));
  const dy = Math.sign((p.y ?? 0) - (sourceY ?? 0));
  if (dx === 0 && dy === 0) return false;
  const tx = (p.x ?? 0) + dx;
  const ty = (p.y ?? 0) + dy;
  const tz = p.z;
  if (!state.world.isPassable(tx, ty, tz)) return false;
  const occ = buildOccupancy(state);
  if (occ.monsters.has(keyXYZ(tx, ty, tz))) return false;
  p.x = tx;
  p.y = ty;
  return true;
}

function handleMonsterDefeat(state, monster, options = null) {
  if (!monster || monster.kind !== "monster") return;
  const opts = (options && typeof options === "object") ? options : {};
  const p = state.player;
  const xpMult = Math.max(0, Number(opts.xpMult ?? 1));
  const mSpec = monsterStatsForDepth(monster.type, monster.z ?? p.z);
  pushLog(state, String(opts.deathMessage ?? `The ${monsterDisplayName(monster, p.z)} dies.`));
  if (mSpec?.deathCloudTurns && mSpec?.deathCloudRadius && mSpec?.deathCloudDmg) {
    spawnPoisonCloudBurst(
      state,
      monster.x,
      monster.y,
      monster.z ?? p.z,
      mSpec.deathCloudTurns,
      mSpec.deathCloudRadius,
      mSpec.deathCloudDmg,
      "spores"
    );
  }

  grantXP(state, Math.round(xpKillBonus(monster.type, monster.z ?? p.z) * xpMult));
  markDepthKillForXp(state, monster.z ?? p.z);

  if (monster.origin === "base") {
    state.removedIds.add(monster.id);
    state.entityOverrides.delete(monster.id);
  } else if (monster.origin === "dynamic") {
    state.dynamic.delete(monster.id);
  }

  let droppedSpecial = false;
  if (maybeDropKeyFromMonster(state, monster)) droppedSpecial = true;

  if (monster.type === "skeleton" && Math.random() < 0.24) {
    const drop = Math.random() < 0.5 ? weaponForDepth(state.player.z, Math.random) : armorForDepth(state.player.z);
    spawnDynamicItem(state, drop, 1, monster.x, monster.y, monster.z);
    pushLog(state, `It dropped ${ITEM_TYPES[drop].name}!`);
    droppedSpecial = true;
  }

  if (!droppedSpecial && Math.random() < 0.30) {
    const amt = 2 + Math.floor(Math.random() * (10 + clamp(state.player.z, 0, 20)));
    spawnDynamicItem(state, "gold", amt, monster.x, monster.y, monster.z);
  }

  state.entities.delete(monster.id);
}

function playerAttack(state, monster) {
  markCombatEvent(state, monster);
  const p = state.player;
  const weaponProfile = playerWeaponAttackProfile(state);
  if (!playerCanAttackMonster(state, monster, weaponProfile)) {
    if (weaponProfile?.kind === "ranged" && weaponProfile?.cannotFireAdjacent && hasAdjacentMonster(state)) {
      pushLog(state, "An adjacent enemy prevents you from firing.");
    } else {
      pushLog(state, "Target is out of range.");
    }
    return;
  }
  const classId = normalizeCharacterClassId(p.classId, p.speciesId);
  const classDef = characterClassDef(classId);
  const mSpec = monsterStatsForDepth(monster.type, monster.z ?? p.z);
  const attackAfterMove = !!p.attackAfterMove;
  const firstCombatStrike = !!p.combatFirstStrikeReady;
  const distance = Math.abs((monster.x ?? 0) - p.x) + Math.abs((monster.y ?? 0) - p.y);
  const targetUnengaged = !monster.awake;
  p.attackAfterMove = false;
  p.combatFirstStrikeReady = false;
  let targetEva = mSpec.eva;
  if (classId === "broodmind" && distance <= 2) targetEva = Math.max(0, targetEva - 5);
  const attackAcc = Math.max(1, Math.round((p.acc ?? 70) + Number(weaponProfile?.accuracyMod ?? 0)));
  if (!rollHit(attackAcc, targetEva)) {
    monster.awake = true;
    pushLog(state, `You miss the ${monsterDisplayName(monster, p.z)}.`);
    persistMonsterOverride(state, monster);
    return;
  }
  const hpBefore = monster.hp;
  const attack = playerAttackDamage(state, monster, {
    attackAfterMove,
    firstCombatStrike,
    targetUnengaged,
    distance,
    weaponProfile,
  });
  const dmg = attack.dmg;
  monster.hp -= dmg;
  monster.awake = true;
  persistMonsterOverride(state, monster);

  const profileKind = weaponProfile?.kind ?? "melee";
  const nativeFlavor = String(weaponProfile?.flavor ?? "").trim().toLowerCase();
  const isNativeToxinShot = profileKind === "ranged" && weaponProfile?.source === "class_native" && nativeFlavor === "toxin";
  if (dmg > 0 && monster.hp > 0) {
    const rangedPoison = (classDef?.rangedPoisonOnHit && typeof classDef.rangedPoisonOnHit === "object")
      ? classDef.rangedPoisonOnHit
      : null;
    if (rangedPoison && profileKind === "ranged") {
      const chance = clamp(Number(rangedPoison.chance ?? 1), 0, 1);
      const nativeOnly = !!rangedPoison.nativeOnly;
      const requiredFlavor = String(rangedPoison.requiredFlavor ?? "").trim().toLowerCase();
      const flavorMatch = !requiredFlavor || requiredFlavor === nativeFlavor;
      if ((!nativeOnly || weaponProfile?.source === "class_native") && flavorMatch && Math.random() < chance) {
        const poisonDpt = Math.max(1, Math.round(dmg * Math.max(0.02, Number(rangedPoison.dmgPct ?? 0.1))));
        const turns = Math.max(1, Math.floor(Number(rangedPoison.turns ?? 2)));
        applyPoisonToMonster(
          state,
          monster,
          poisonDpt,
          turns,
          String(rangedPoison.sourceLabel ?? "poison shot"),
          {
            stack: !!rangedPoison.stack,
            maxStacks: Math.max(1, Math.floor(Number(rangedPoison.maxStacks ?? 4))),
          }
        );
      }
    }
    const meleePoison = (classDef?.meleePoisonOnHit && typeof classDef.meleePoisonOnHit === "object")
      ? classDef.meleePoisonOnHit
      : null;
    if (meleePoison && profileKind === "melee") {
      const chance = clamp(Number(meleePoison.chance ?? 1), 0, 1);
      if (Math.random() < chance) {
        const poisonDpt = Math.max(1, Math.round(dmg * Math.max(0.02, Number(meleePoison.dmgPct ?? 0.08))));
        const turns = Math.max(1, Math.floor(Number(meleePoison.turns ?? 2)));
        applyPoisonToMonster(
          state,
          monster,
          poisonDpt,
          turns,
          String(meleePoison.sourceLabel ?? "venom"),
          {
            stack: !!meleePoison.stack,
            maxStacks: Math.max(1, Math.floor(Number(meleePoison.maxStacks ?? 4))),
          }
        );
      }
    }
  }
  const attackVerb = isNativeToxinShot
    ? "You spit venom at"
    : "You hit";
  pushLog(state, `${attackVerb} the ${monsterDisplayName(monster, p.z)} for ${dmg}${attack.crit ? " (critical)" : ""}.`);
  if (classId === "telekinetic" && firstCombatStrike && monster.hp > 0 && tryKnockbackMonster(state, monster, p.x, p.y)) {
    pushLog(state, `Telekinetic force knocks the ${monsterDisplayName(monster, p.z)} back.`);
  }
  const damageApplied = Math.max(0, Math.min(dmg, hpBefore));
  const xpMult = xpChallengeMultiplier(state, monster, mSpec);
  grantXP(state, Math.round(xpFromDamage(damageApplied, monster) * xpMult));
  if (
    !state.player.dead &&
    (monster.type === "iron_warden") &&
    (weaponProfile?.kind ?? "melee") === "melee" &&
    damageApplied > 0
  ) {
    const reflectPct = clamp(Number(mSpec?.meleeReflectPct ?? 0.2), 0, 0.8);
    const reflectedRaw = Math.max(1, Math.round(damageApplied * reflectPct));
    if (stateDebug(state).godmode) {
      pushLog(state, "Reflected impact glances off your godmode.");
    } else {
      const reduced = reduceIncomingDamage(state, reflectedRaw, monster.z ?? p.z);
      const reflected = Math.max(1, Math.floor(reduced?.dmg ?? 1));
      p.hp = Math.max(0, p.hp - reflected);
      pushLog(state, `The ${monsterDisplayName(monster, p.z)} reflects ${reflected} damage.`);
      if (p.hp <= 0) {
        killPlayer(state);
        return;
      }
    }
  }

  if (monster.hp <= 0) handleMonsterDefeat(state, monster, { xpMult });
}

function markDisengageGraceFromStep(state, fromX, fromY, toX, toY, z) {
  const disengage = ensureDisengageState(state);
  const graceTurn = (state.turn ?? 0) + 1;
  for (const ent of state.entities.values()) {
    if (ent.kind !== "monster") continue;
    if (ent.z !== z) continue;
    const wasAdjacent = (Math.abs(ent.x - fromX) + Math.abs(ent.y - fromY)) === 1;
    if (!wasAdjacent) continue;
    const stillAdjacent = (Math.abs(ent.x - toX) + Math.abs(ent.y - toY)) <= 1;
    if (stillAdjacent) continue;
    disengage[ent.id] = graceTurn;
  }
}

function playerMoveOrAttack(state, dx, dy) {
  const p = state.player;
  if (p.dead) return false;

  const nx = p.x + dx;
  const ny = p.y + dy;
  const nz = p.z;

  hydrateNearby(state);

  const tile = state.world.getTile(nx, ny, nz);

  if (tileIsLocked(tile)) {
    const handled = tryUnlockDoor(state, nx, ny, nz);
    if (!handled) return false;
    if (state.world.isPassable(nx, ny, nz)) { p.x = nx; p.y = ny; }
    return true;
  }

  if (tile === DOOR_CLOSED) {
    tryOpenClosedDoor(state, nx, ny, nz);
    return true;
  }

  const { monsters } = buildOccupancy(state);
  const mid = monsters.get(keyXYZ(nx, ny, nz));
  if (mid) {
    pushLog(state, "An enemy blocks the way. Use Attack context action.");
    return false;
  }

  if (!state.world.isPassable(nx, ny, nz)) {
    pushLog(state, "You bump into a wall.");
    return false;
  }

  const hereTile = state.world.getTile(nx, ny, nz);
  if (isOpenDoorTile(hereTile)) state.visitedDoors?.add(keyXYZ(nx, ny, nz));

  markDisengageGraceFromStep(state, p.x, p.y, nx, ny, nz);
  p.x = nx; p.y = ny;
  p.attackAfterMove = true;
  return true;
}

function waitTurn(state) {
  if (state.player.dead) return false;
  state.player.attackAfterMove = false;
  pushLog(state, "You wait.");
  return true;
}

function pickup(state) {
  const p = state.player;
  if (p.dead) return false;

  const itemsHere = getItemsAt(state, p.x, p.y, p.z);
  if (!itemsHere.length) { pushLog(state, "Nothing here to pick up."); return false; }

  const it = itemsHere.find((e) => isDirectlyTakeableItem(e.type)) ?? itemsHere[0];
  if (!it) return false;

  if (it.type === "gold") {
    p.gold += it.amount ?? 1;
    pushLog(state, `Picked up ${it.amount} gold.`);
  } else if (it.type === "potion") {
    const before = invCount(state, "potion");
    invAdd(state, "potion", it.amount ?? 1);
    const after = invCount(state, "potion");
    if (after > before) {
      pushLog(state, `Picked up potion${after - before > 1 ? "s" : ""}. (${after}/${potionCapacityForState(state)})`);
    } else {
      pushLog(state, `Potion belt is full (${before}/${potionCapacityForState(state)}).`);
      return false;
    }
  } else if (it.type.startsWith("key_")) {
    invAdd(state, it.type, it.amount ?? 1);
    pushLog(state, `Picked up a ${ITEM_TYPES[it.type].name}.`);
    // Backfill missing lock gates in already explored terrain if generation did not place one nearby.
    placeMatchingLockedDoorNearPlayer(state, it.type);
  } else if (it.type.startsWith("weapon_") || it.type.startsWith("armor_")) {
    invAdd(state, it.type, 1);
    pushLog(state, `Picked up ${ITEM_TYPES[it.type].name}.`);
  } else if (it.type === "chest") {
    const keyType = it.keyType ?? it.lockKeyType ?? null;
    const isLocked = !!it.locked || !!keyType;
    if (isLocked) {
      const lockpickEnabled = !!stateDebug(state).lockpick;
      if (!lockpickEnabled && (!keyType || !invConsume(state, keyType, 1))) {
        pushLog(state, "The chest is locked. You need the correct key to open it.");
        return false;
      }
      if (lockpickEnabled) pushLog(state, "You pick the chest lock.");
      else pushLog(state, `You use the ${ITEM_TYPES[keyType].name} and open the Chest.`);
    }
    const chestDepth = normalizeChestLootDepth(Math.max(0, Math.floor(it.z ?? p.z ?? 0)), it);
    const g = 15 + Math.floor(Math.random() * (25 + clamp(chestDepth, 0, 55)));
    p.gold += g;
    pushLog(state, `You open the Chest. (+${g} gold)`);
    dropEquipmentFromChest(state, it);
  } else if (it.type === "shrine") {
    pushLog(state, "A Shrine hums with power. Press E to interact.");
    return false;
  } else if (it.type === "shopkeeper") {
    pushLog(state, "The shopkeeper greets you. Press E to trade.");
    return false;
  } else {
    pushLog(state, `Picked up ${it.type}.`);
    invAdd(state, it.type, it.amount ?? 1);
  }

  if (it.origin === "base") state.removedIds.add(it.id);
  else if (it.origin === "dynamic") state.dynamic.delete(it.id);

  state.entities.delete(it.id);

  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  return true;
}

function useInventoryIndex(state, idx) {
  const p = state.player;
  if (p.dead) return;

  const it = state.inv[idx];
  if (!it) return;

  if (it.type === "potion") {
    const heal = Math.max(1, Math.round(potionHealAmount(p.maxHp) * Math.max(0.1, Number(p.healMult ?? 1))));
    const before = p.hp;
    p.hp = clamp(p.hp + heal, 0, p.maxHp);
    pushLog(state, `You drink a potion. (+${p.hp - before} HP, ${Math.round(POTION_HEAL_PCT * 100)}% max base)`);

    if (isStackable(it.type)) {
      it.amount -= 1;
      if (it.amount <= 0) state.inv.splice(idx, 1);
    } else {
      state.inv.splice(idx, 1);
    }

    renderInventory(state);
    markSaveDirty(state, "use-potion");
    return;
  }

  if (it.type.startsWith("key_")) {
    pushLog(state, "Keys are used automatically on matching locked doors.");
    return;
  }

  if (it.type.startsWith("weapon_")) {
    const prev = p.equip.weapon;
    p.equip.weapon = it.type;
    if (isStackable(it.type)) {
      it.amount -= 1;
      if (it.amount <= 0) state.inv.splice(idx, 1);
    } else {
      state.inv.splice(idx, 1);
    }
    if (prev) invAdd(state, prev, 1);
    pushLog(state, `Equipped ${ITEM_TYPES[p.equip.weapon].name}.`);
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    markSaveDirty(state, "equip-weapon");
    return;
  }

  if (it.type.startsWith("armor_")) {
    const piece = ARMOR_PIECES[it.type];
    if (!piece) {
      pushLog(state, "That armor can't be equipped.");
      return;
    }
    const slot = piece.slot;
    const prev = p.equip[slot] ?? null;
    p.equip[slot] = it.type;
    if (isStackable(it.type)) {
      it.amount -= 1;
      if (it.amount <= 0) state.inv.splice(idx, 1);
    } else {
      state.inv.splice(idx, 1);
    }
    if (prev) invAdd(state, prev, 1);
    pushLog(state, `Equipped ${ITEM_TYPES[p.equip[slot]].name}.`);
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    markSaveDirty(state, "equip-armor");
    return;
  }

  pushLog(state, "You can't use that right now.");
}

function dropInventoryIndex(state, idx) {
  const p = state.player;
  if (p.dead) return false;

  const it = state.inv[idx];
  if (!it) {
    pushLog(state, "No item in that inventory slot.");
    return false;
  }

  const dropType = it.type;
  let dropAmount = 1;

  if (isStackable(dropType)) {
    it.amount -= 1;
    if (it.amount <= 0) state.inv.splice(idx, 1);
  } else {
    dropAmount = Math.max(1, it.amount ?? 1);
    state.inv.splice(idx, 1);
  }

  spawnDynamicItem(state, dropType, dropAmount, p.x, p.y, p.z);
  pushLog(state, `Dropped ${ITEM_TYPES[dropType]?.name ?? dropType}.`);
  renderInventory(state);
  return true;
}

function interactShopkeeper(state) {
  const p = state.player;
  if (p.dead) return null;

  const it = findItemAtByType(state, p.x, p.y, p.z, "shopkeeper");
  if (!it || it.type !== "shopkeeper") return null;

  const refreshed = refreshShopStock(state, false);
  if (refreshed) pushLog(state, "The shopkeeper restocked new wares.");
  openShopOverlay(state, "buy");
  return false;
}

// ---------- Shrine interaction ----------
function deterministicShrineEffect(seed, z, cx, cy) {
  const rng = makeRng(`${seed}|shrine|z${z}|${cx},${cy}`);
  const r = rng();
  if (r < 0.30) return { type: "heal" };
  if (r < 0.55) return { type: "bless" };
  if (r < 0.78) return { type: "regen" };
  return { type: "curse" };
}

function interactShrine(state) {
  const p = state.player;
  if (p.dead) return false;

  const it = findItemAtByType(state, p.x, p.y, p.z, "shrine");
  if (!it || it.type !== "shrine") { pushLog(state, "Nothing to interact with here."); return false; }

  const { cx, cy } = splitWorldToChunk(p.x, p.y);
  const eff = deterministicShrineEffect(state.world.seedStr, p.z, cx, cy);

  if (eff.type === "heal") {
    const before = p.hp;
    p.hp = p.maxHp;
    pushLog(state, `The Shrine heals you to full. (+${p.hp - before} HP)`);
    const curseIdx = p.effects.findIndex(e => e.type === "curse");
    if (curseIdx >= 0) { p.effects.splice(curseIdx, 1); pushLog(state, "A curse is lifted."); }
  } else if (eff.type === "bless") {
    p.effects.push({ type: "bless", atkDelta: +100, turnsLeft: 80 });
    pushLog(state, "Blessing: ATK +100 for 80 turns.");
  } else if (eff.type === "regen") {
    p.effects.push({ type: "regen", healPerTurn: 100, turnsLeft: 60 });
    pushLog(state, "Regen: +100 HP per turn for 60 turns.");
  } else if (eff.type === "curse") {
    p.effects.push({ type: "curse", atkDelta: -100, turnsLeft: 80 });
    pushLog(state, "Curse: ATK -100 for 80 turns.");
  }

  applyReveal(state, 22);
  pushLog(state, "The dungeon\u2019s outline flashes in your mind...");

  if (it.origin === "base") state.removedIds.add(it.id);
  else if (it.origin === "dynamic") state.dynamic.delete(it.id);
  state.entities.delete(it.id);

  recalcDerivedStats(state);
  renderEquipment(state);
  renderEffects(state);
  renderInventory(state);
  return true;
}

// ---------- Stairs + landing carve ----------
function carveLandingAndConnect(state, x, y, z, centerTile) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      const cur = state.world.getTile(tx, ty, z);
      // Preserve any existing stairs so adjacent up/down pairs are not erased.
      if (cur === STAIRS_UP || cur === STAIRS_DOWN) continue;
      state.world.setTile(tx, ty, z, FLOOR);
    }
  }

  state.world.setTile(x, y, z, centerTile);

  const { cx, cy } = splitWorldToChunk(x, y);
  state.world.getChunk(z, cx, cy);

  let best = null, bestD = Infinity;
  for (let ly = 1; ly < CHUNK - 1; ly++) for (let lx = 1; lx < CHUNK - 1; lx++) {
    const wx = cx * CHUNK + lx;
    const wy = cy * CHUNK + ly;
    // Ignore the freshly carved landing footprint so we connect outwards.
    if (Math.abs(wx - x) <= 2 && Math.abs(wy - y) <= 2) continue;
    const t = state.world.getTile(wx, wy, z);
    if (t === WALL || tileIsLocked(t)) continue;
    const dx = wx - x, dy = wy - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = { x: wx, y: wy }; }
  }
  if (!best) return;

  let cx2 = x, cy2 = y;
  while (cx2 !== best.x) { cx2 += Math.sign(best.x - cx2); state.world.setTile(cx2, cy2, z, FLOOR); }
  while (cy2 !== best.y) { cy2 += Math.sign(best.y - cy2); state.world.setTile(cx2, cy2, z, FLOOR); }
}

function normalizeLadderLanding(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Math.floor(Number(raw.x));
  const y = Math.floor(Number(raw.y));
  const z = Math.floor(Number(raw.z));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function setLastLadderLanding(state, raw) {
  if (!state) return null;
  const next = normalizeLadderLanding(raw);
  if (!next) return null;
  state.lastLadderLanding = next;
  return next;
}

function resolveLastLadderLanding(state) {
  const explicit = normalizeLadderLanding(state?.lastLadderLanding);
  if (explicit) return explicit;
  const start = normalizeLadderLanding(state?.startSpawn);
  if (start) return start;
  const p = state?.player ?? null;
  return normalizeLadderLanding(p);
}

function relocatePlayerToLastLadderLanding(state) {
  if (!state?.player || !state?.world) return false;
  const landing = resolveLastLadderLanding(state);
  if (!landing) return false;
  state.world.ensureChunksAround(landing.x, landing.y, landing.z, viewRadiusForChunks());
  const p = state.player;
  p.x = landing.x;
  p.y = landing.y;
  p.z = landing.z;
  p.dead = false;
  p.attackAfterMove = false;
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;
  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);
  setLastLadderLanding(state, p);
  hydrateNearby(state);
  updateAreaRespawnTracking(state, Date.now());
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  return true;
}

function goToLevel(state, newZ, direction) {
  const p = state.player;
  if (p.dead) return;

  if (newZ === SURFACE_LEVEL) {
    // Surface uses a fixed central ladder location.
    state.world.ensureChunksAround(0, 0, newZ, viewRadiusForChunks());
  } else {
    state.world.ensureChunksAround(p.x, p.y, newZ, viewRadiusForChunks());
  }

  if (direction === "down") {
    if (p.z === SURFACE_LEVEL && newZ === 0) {
      const link = ensureSurfaceLinkTile(state);
      state.world.ensureChunksAround(link.x, link.y, newZ, viewRadiusForChunks());
      p.x = link.x; p.y = link.y;

      // Guarantee at least one escape tile from the return ladder.
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      let hasExit = false;
      for (const [dx, dy] of dirs) {
        if (state.world.isPassable(link.x + dx, link.y + dy, newZ)) { hasExit = true; break; }
      }
      if (!hasExit) state.world.setTile(link.x + 1, link.y, newZ, FLOOR);
    } else {
      carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_UP);
    }
    pushLog(state, `You descend to depth ${newZ}.`);
  } else {
    if (newZ === SURFACE_LEVEL) {
      p.x = 0; p.y = 0;
      state.world.setTile(0, 0, newZ, STAIRS_DOWN);
    } else {
      carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_DOWN);
      if (newZ === 0) ensureSurfaceLinkTile(state);
    }
    pushLog(state, `You ascend to depth ${newZ}.`);
  }

  p.z = newZ;
  p.attackAfterMove = false;
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;

  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);
  setLastLadderLanding(state, p);

  hydrateNearby(state);
  updateAreaRespawnTracking(state, Date.now());
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
}

function tryUseStairs(state, dir) {
  const p = state.player;
  if (p.dead) return false;

  const here = state.world.getTile(p.x, p.y, p.z);

  if (dir === "down") {
    if (here !== STAIRS_DOWN) { pushLog(state, "No stairs down here."); return false; }
    goToLevel(state, p.z + 1, "down");
    saveRuntime.pendingAutosaveReason = "stairs-transition";
    return true;
  } else {
    if (here !== STAIRS_UP) { pushLog(state, "No stairs up here."); return false; }
    if (p.z <= SURFACE_LEVEL) { pushLog(state, "You can't go up any further."); return false; }
    goToLevel(state, p.z - 1, "up");
    saveRuntime.pendingAutosaveReason = "stairs-transition";
    return true;
  }
}

// Contextual interact: stairs first, then shop/shrine
function interactContext(state) {
  const p = state.player;
  if (p.dead) return false;

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN) return tryUseStairs(state, "down");
  if (here === STAIRS_UP) return tryUseStairs(state, "up");
  if (disarmTrapAtPlayer(state)) return true;

  const shopResult = interactShopkeeper(state);
  if (shopResult !== null) return shopResult;
  return interactShrine(state);
}

// ---------- Monster AI ----------
function bfsNextStep(state, start, goal, maxNodes = 600, maxDist = 18) {
  const z = state.player.z;
  const passable = (x, y) => state.world.isPassable(x, y, z);

  const dx0 = start.x - goal.x, dy0 = start.y - goal.y;
  if (dx0 * dx0 + dy0 * dy0 > maxDist * maxDist) return null;

  const { monsters } = buildOccupancy(state);
  const blocked = new Set(monsters.keys());

  const q = [];
  const prev = new Map();
  const sKey = keyXY(start.x, start.y);
  q.push(start);
  prev.set(sKey, null);

  let nodes = 0;
  while (q.length && nodes++ < maxNodes) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) break;

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!passable(nx, ny)) continue;

      const occ = blocked.has(keyXYZ(nx, ny, z));
      if (occ && !(nx === goal.x && ny === goal.y)) continue;

      const k = keyXY(nx, ny);
      if (prev.has(k)) continue;

      prev.set(k, cur);
      q.push({ x: nx, y: ny });
    }
  }

  const gKey = keyXY(goal.x, goal.y);
  if (!prev.has(gKey)) return null;

  let cur = { x: goal.x, y: goal.y };
  let p = prev.get(keyXY(cur.x, cur.y));
  while (p && !(p.x === start.x && p.y === start.y)) { cur = p; p = prev.get(keyXY(cur.x, cur.y)); }
  return cur;
}

function monsterHitPlayer(state, monster, baseDmgLo, baseDmgHi, verb = "hits") {
  markCombatEvent(state, monster);
  const nm = monsterDisplayName(monster, state.player.z);
  const spec = monsterStatsForDepth(monster.type, monster.z ?? state.player.z);
  const classId = normalizeCharacterClassId(state.player.classId, state.player.speciesId);
  const dist = Math.abs((monster?.x ?? 0) - state.player.x) + Math.abs((monster?.y ?? 0) - state.player.y);
  let attackerAcc = spec.acc;
  if (classId === "warden_gap" && dist <= 2) attackerAcc = Math.max(8, attackerAcc - 5);
  if (!rollHit(attackerAcc, state.player.eva ?? 0)) {
    if (classId === "slipblade") state.player.slipbladeBonusReady = true;
    pushLog(state, `The ${nm} misses you.`);
    return;
  }
  let raw = baseDmgLo + Math.floor(Math.random() * (baseDmgHi - baseDmgLo + 1));
  if (monster?.type === "rift_hound" && monster?.blinkStrikeBonus) {
    raw = Math.max(1, Math.round(raw * (spec.backstabDamageMult ?? 1.2)));
    monster.blinkStrikeBonus = false;
  }

  if (stateDebug(state).godmode) {
    pushLog(state, `The ${nm} ${verb} you, but no damage gets through.`);
    return;
  }

  const reduced = reduceIncomingDamage(state, raw, monster.z ?? state.player.z);
  const dmg = Math.max(1, Math.floor(reduced?.dmg ?? 1));
  state.player.hp -= dmg;
  if (classId === "overclock_unit") state.player.overclockUntilMs = Date.now() + 3000;
  pushLog(state, `The ${nm} ${verb} you for ${dmg}.`);
  if (reduced?.shaded) pushLog(state, "Shadeguard ward dampens the blow.");
  if (Math.random() < clamp(Number(spec?.poisonOnHitChance ?? 0), 0, 1)) {
    applyPoisonToPlayer(
      state,
      Math.max(1, Math.floor(spec?.poisonOnHitDmg ?? (0.28 * dmg))),
      Math.max(1, Math.floor(spec?.poisonOnHitTurns ?? 2)),
      nm
    );
  }
  if (Math.random() < clamp(Number(spec?.slowOnHitChance ?? 0), 0, 1)) {
    applySlowToPlayer(state, Math.max(1, Math.floor(spec?.slowTurns ?? 2)), -6, -10, 0.88, `${nm}'s shot`);
  }
  if (Math.random() < clamp(Number(spec?.stunOnHitChance ?? 0), 0, 1)) {
    applySlowToPlayer(state, 1, -10, -14, 0.75, `${nm}'s impact`);
  }
  if (Math.random() < clamp(Number(spec?.knockbackOnHitChance ?? 0), 0, 1)) {
    if (tryKnockbackPlayer(state, monster.x ?? state.player.x, monster.y ?? state.player.y)) {
      pushLog(state, `${nm} knocks you back.`);
    }
  }
  if (state.player.hp <= 0) killPlayer(state);
}

function monstersTurn(state) {
  const p = state.player;
  if (p.dead) return;
  if (stateDebug(state).ghost) return;

  hydrateNearby(state);
  computeVisibility(state);

  const z = p.z;
  const { monsters } = buildOccupancy(state);
  const toAct = [];
  const disengage = ensureDisengageState(state);
  for (const [monsterId, untilTurn] of Object.entries(disengage)) {
    const validUntil = Number.isFinite(untilTurn) ? Math.floor(untilTurn) : -1;
    if (!state.entities.has(monsterId) || validUntil < (state.turn ?? 0)) delete disengage[monsterId];
  }

  for (const e of state.entities.values()) {
    if (e.kind !== "monster") continue;
    if (e.z !== z) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const actR = Math.max(viewRadiusX, viewRadiusY) + 5;
    if (dx * dx + dy * dy <= actR * actR) toAct.push(e);
  }

  for (const m of toAct) {
    if (!state.entities.has(m.id)) continue;
    if (p.dead) return;

    if ((m.cd ?? 0) > 0) m.cd -= 1;
    if ((m.abilityCd ?? 0) > 0) m.abilityCd -= 1;

    const spec = monsterStatsForDepth(m.type, m.z ?? z);
    if ((m.maxHp ?? 0) !== spec.maxHp) {
      const hpRatio = m.maxHp > 0 ? clamp(m.hp / m.maxHp, 0, 1) : 1;
      m.maxHp = spec.maxHp;
      m.hp = Math.max(0, Math.min(m.maxHp, Math.round(m.maxHp * hpRatio)));
      persistMonsterOverride(state, m);
    }
    if ((m.hp ?? 0) <= 0) {
      state.entities.delete(m.id);
      if (m.origin === "base") {
        state.removedIds.add(m.id);
        state.entityOverrides.delete(m.id);
      } else if (m.origin === "dynamic") {
        state.dynamic.delete(m.id);
      }
      continue;
    }
    const mdx = p.x - m.x, mdy = p.y - m.y;
    const distMan = Math.abs(mdx) + Math.abs(mdy);
    const adj = distMan === 1;
    const disengageUntilTurn = Number.isFinite(disengage[m.id]) ? Math.floor(disengage[m.id]) : -1;
    const hasDisengageGrace = disengageUntilTurn >= (state.turn ?? 0);

    const ai = String(spec.ai ?? (spec.range ? "ranged_hold" : "melee_chase"));
    const preferredRange = Math.max(2, Math.floor(spec.preferredRange ?? (spec.range ? Math.max(2, spec.range - 1) : 2)));
    const minRange = Math.max(1, Math.floor(spec.minRange ?? (spec.range ? 2 : 1)));
    const seesPlayer = hasLineOfSight(state.world, z, m.x, m.y, p.x, p.y);
    const canShoot = !!(spec.range && distMan <= spec.range && distMan >= minRange && !adj && seesPlayer && (m.cd ?? 0) === 0);
    const persistOverride = () => {
      persistMonsterOverride(state, m);
    };
    const tryMoveTo = (nx, ny) => {
      if (!state.world.isPassable(nx, ny, z)) return false;
      const occ = monsters.get(keyXYZ(nx, ny, z));
      if (occ) return false;
      if (nx === p.x && ny === p.y) return false;
      m.x = nx;
      m.y = ny;
      persistOverride();
      return true;
    };
    const tryStepTowardPlayer = () => {
      const next = bfsNextStep(state, { x: m.x, y: m.y }, { x: p.x, y: p.y });
      if (!next) return false;
      return tryMoveTo(next.x, next.y);
    };
    const tryStepAwayFromPlayer = () => {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(() => Math.random() - 0.5);
      let best = null;
      let bestDist = distMan;
      for (const [dx, dy] of dirs) {
        const nx = m.x + dx;
        const ny = m.y + dy;
        if (!state.world.isPassable(nx, ny, z)) continue;
        const occ = monsters.get(keyXYZ(nx, ny, z));
        if (occ) continue;
        if (nx === p.x && ny === p.y) continue;
        const nd = Math.abs(nx - p.x) + Math.abs(ny - p.y);
        if (nd <= bestDist) continue;
        bestDist = nd;
        best = { x: nx, y: ny };
      }
      if (!best) return false;
      return tryMoveTo(best.x, best.y);
    };
    const tryBlinkCloser = (maxBlinkRange = 2) => {
      const range = Math.max(1, Math.floor(maxBlinkRange ?? 2));
      const candidates = [];
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const nx = m.x + dx;
          const ny = m.y + dy;
          if (Math.abs(dx) + Math.abs(dy) > range) continue;
          if (nx === m.x && ny === m.y) continue;
          if (!state.world.isPassable(nx, ny, z)) continue;
          const occ = monsters.get(keyXYZ(nx, ny, z));
          if (occ) continue;
          if (nx === p.x && ny === p.y) continue;
          const nd = Math.abs(nx - p.x) + Math.abs(ny - p.y);
          candidates.push({ x: nx, y: ny, d: nd });
        }
      }
      if (!candidates.length) return false;
      candidates.sort((a, b) => a.d - b.d);
      const pick = candidates[0];
      m.x = pick.x;
      m.y = pick.y;
      m.blinkStrikeBonus = pick.d <= 1;
      persistOverride();
      return true;
    };

    if (ai === "support_undead") {
      let supportActed = false;
      const nearbyUndead = [];
      for (const ent of state.entities.values()) {
        if (!ent || ent.kind !== "monster") continue;
        if (ent.id === m.id || ent.z !== z) continue;
        if (!(ent.type === "skeleton" || ent.type === "wraith" || ent.type === "bone_herald")) continue;
        const d = Math.abs((ent.x ?? 0) - m.x) + Math.abs((ent.y ?? 0) - m.y);
        if (d <= 4) nearbyUndead.push(ent);
      }
      if (!nearbyUndead.length && (m.abilityCd ?? 0) === 0) {
        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].sort(() => Math.random() - 0.5);
        for (const [dx, dy] of dirs) {
          const nx = m.x + dx, ny = m.y + dy;
          if (!state.world.isPassable(nx, ny, z)) continue;
          if (monsters.get(keyXYZ(nx, ny, z))) continue;
          if (nx === p.x && ny === p.y) continue;
          const sumSpec = monsterStatsForDepth("skeleton", z);
          const sid = `summon|${m.id}|${state.turn}|${nx},${ny}`;
          state.entities.set(sid, {
            id: sid,
            origin: "summoned",
            kind: "monster",
            type: "skeleton",
            x: nx, y: ny, z,
            hp: sumSpec.maxHp,
            maxHp: sumSpec.maxHp,
            awake: true,
            cd: 0,
          });
          m.abilityCd = Math.max(2, Math.floor(spec.summonCooldownTurns ?? 6));
          m.awake = true;
          pushLog(state, `${monsterDisplayName(m, z)} summons a Skeleton.`);
          persistOverride();
          supportActed = true;
          break;
        }
      } else if (nearbyUndead.length && (m.abilityCd ?? 0) === 0) {
        let didBuff = false;
        for (const ally of nearbyUndead) {
          const heal = Math.max(1, Math.round((ally.maxHp ?? 1) * 0.12));
          const before = ally.hp ?? 0;
          ally.hp = clamp((ally.hp ?? 0) + heal, 0, ally.maxHp ?? heal);
          didBuff = didBuff || ally.hp > before;
          persistMonsterOverride(state, ally);
        }
        if (didBuff) pushLog(state, `${monsterDisplayName(m, z)} bolsters nearby undead.`);
        m.abilityCd = 4;
        m.awake = true;
        persistOverride();
        supportActed = true;
      }
      if (supportActed) continue;
    }

    if (ai === "blink_flanker" && !adj && seesPlayer) {
      if (Math.random() < 0.58 && tryBlinkCloser(spec.blinkRange ?? 2)) {
        m.awake = true;
        continue;
      }
    }

    if (canShoot && (ai !== "ranged_kite" || distMan >= preferredRange - 1)) {
      monsterHitPlayer(state, m, spec.atkLo, spec.atkHi, "shoots");
      m.cd = spec.cdTurns ?? 2;
      m.awake = true;
      persistOverride();
      continue;
    }

    if (adj) {
      monsterHitPlayer(state, m, spec.atkLo, spec.atkHi, "hits");
      m.awake = true;
      persistOverride();
      continue;
    }

    if (hasDisengageGrace && distMan > 1) continue;

    if (ai === "ranged_artillery") {
      if (seesPlayer && distMan < minRange && tryStepAwayFromPlayer()) {
        m.awake = true;
        continue;
      }
      if (canShoot) {
        monsterHitPlayer(state, m, spec.atkLo, spec.atkHi, "shoots");
        m.cd = spec.cdTurns ?? 2;
        m.awake = true;
        persistOverride();
      }
      continue;
    }

    if (ai === "ranged_kite") {
      if ((adj || distMan < preferredRange) && tryStepAwayFromPlayer()) {
        m.awake = true;
        continue;
      }
      if (canShoot) {
        monsterHitPlayer(state, m, spec.atkLo, spec.atkHi, "shoots");
        m.cd = spec.cdTurns ?? 2;
        m.awake = true;
        persistOverride();
        continue;
      }
    }

    if (ai === "ranged_hold") {
      if (canShoot) {
        monsterHitPlayer(state, m, spec.atkLo, spec.atkHi, "shoots");
        m.cd = spec.cdTurns ?? 2;
        m.awake = true;
        persistOverride();
        continue;
      }
    }

    if (seesPlayer) {
      m.awake = true;
      persistOverride();
      if (tryStepTowardPlayer()) continue;
    }

    const wanderChance = m.awake ? 0.60 : 0.22;
    if (Math.random() < wanderChance) {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of dirs) {
        const nx = m.x + dx, ny = m.y + dy;
        if (tryMoveTo(nx, ny)) break;
      }
    }
  }
}

// ---------- Rendering (glyph overlays) ----------
// Glyph font: slightly larger than tile size so characters/icons overlap cells a bit
const GLYPH_FONT = `bold ${Math.floor(TILE * 1.12)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
const MONSTER_SPRITE_SIZE = Math.round(TILE * 1.6);
const ITEM_SPRITE_SIZE = Math.round(TILE * 1.6);
const DOOR_SPRITE_SIZE = Math.round(ITEM_SPRITE_SIZE * 1.1);
const STAIRS_SPRITE_SIZE = Math.round(TILE * 2.15);
const SURFACE_ENTRANCE_SPRITE_SIZE = Math.round(TILE * 2.25);
const SHOP_SPRITE_SIZE = Math.round(TILE * 3.25);
const PLAYER_SPRITE_SIZE = Math.round(TILE * 2.1);
const HERO_GLOW_RADIUS = Math.round(TILE * 0.95);
const MONSTER_GLOW_RADIUS = Math.round(TILE * 0.78);
const SHOP_FOOTPRINT_W = 3;
const SHOP_FOOTPRINT_H = 2;
const DEFAULT_SPRITE_SOURCES = {
  hero: "./client/assets/sprites/actors/hero.png",
  goblin: "./client/assets/sprites/monsters/goblin.png",
  rat: "./client/assets/sprites/monsters/rat.png",
  rogue: "./client/assets/sprites/monsters/rogue.png",
  slime_green: "./client/assets/sprites/monsters/jelly_green.png",
  slime_yellow: "./client/assets/sprites/monsters/jelly_yellow.png",
  slime_orange: "./client/assets/sprites/monsters/jelly_red.png",
  slime_red: "./client/assets/sprites/monsters/jelly_red.png",
  slime_violet: "./client/assets/sprites/monsters/jelly_red.png",
  slime_indigo: "./client/assets/sprites/monsters/jelly_red.png",
  key_red: "./client/assets/sprites/items/key_red.png",
  key_blue: "./client/assets/sprites/items/key_blue.png",
  key_green: "./client/assets/sprites/items/key_green.png",
  chest: "./client/assets/sprites/items/chest.png",
  chest_red: "./client/assets/sprites/environment/chest_red.png",
  chest_blue: "./client/assets/sprites/environment/chest_blue.png",
  chest_green: "./client/assets/sprites/environment/chest_green.png",
  shopkeeper: "./client/assets/sprites/items/shopkeeper.png",
  gold: "./client/assets/sprites/items/gold.png",
  potion: "./client/assets/sprites/items/potion.png",
  door_closed: "./client/assets/sprites/environment/door_closed.png",
  door_open: "./client/assets/sprites/environment/door_open.png",
  door_red_closed: "./client/assets/sprites/environment/door_red_closed.png",
  door_red_open: "./client/assets/sprites/environment/door_red_open.png",
  door_green_closed: "./client/assets/sprites/environment/door_green_closed.png",
  door_green_open: "./client/assets/sprites/environment/door_green_open.png",
  door_blue_closed: "./client/assets/sprites/environment/door_blue_closed.png",
  door_blue_open: "./client/assets/sprites/environment/door_blue_open.png",
  stairs_up: "./client/assets/sprites/environment/stairs_up.png",
  stairs_down: "./client/assets/sprites/environment/stairs_down.png",
  surface_entrance: "./client/assets/sprites/environment/surface_entrance.png",
  weapon_bronze_dagger: "./client/assets/sprites/weapons/weapon_bronze_dagger.png",
  weapon_bronze_sword: "./client/assets/sprites/weapons/weapon_bronze_sword.png",
  weapon_bronze_axe: "./client/assets/sprites/weapons/weapon_bronze_axe.png",
  armor_bronze_head: "./client/assets/sprites/armor/armor_bronze_head.png",
  armor_bronze_chest: "./client/assets/sprites/armor/armor_bronze_chest.png",
  armor_bronze_legs: "./client/assets/sprites/armor/armor_bronze_legs.png",
  armor_leather_chest: "./client/assets/sprites/armor/armor_leather_chest.png",
  armor_leather_legs: "./client/assets/sprites/armor/armor_leather_legs.png",
  weapon_iron_dagger: "./client/assets/sprites/weapons/weapon_iron_dagger.png",
  weapon_iron_sword: "./client/assets/sprites/weapons/weapon_iron_sword.png",
  weapon_iron_axe: "./client/assets/sprites/weapons/weapon_iron_axe.png",
  armor_iron_chest: "./client/assets/sprites/armor/armor_iron_chest.png",
  armor_iron_legs: "./client/assets/sprites/armor/armor_iron_legs.png",
};
const SPRITE_SOURCES = {};
const spriteImages = {};
const spriteProcessed = {};
const spriteReady = {};
const spriteRequested = {};
function buildSpriteTransparency(id, img) {
  // Use source sprites directly to avoid aggressive matte-stripping artifacts.
  return img;
}
function loadProcessedSprite(id, src) {
  if (!id || !src) return;
  spriteRequested[id] = true;
  const img = new Image();
  spriteImages[id] = img;
  spriteProcessed[id] = null;
  spriteReady[id] = false;
  img.onload = () => {
    spriteProcessed[id] = buildSpriteTransparency(id, img);
    spriteReady[id] = true;
  };
  img.onerror = () => { spriteReady[id] = false; };
  img.src = src;
}
function clearSpriteCache(id) {
  delete spriteImages[id];
  delete spriteProcessed[id];
  delete spriteReady[id];
  delete spriteRequested[id];
}
function normalizeSpriteOverrideMap(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, src] of Object.entries(input)) {
    if (!/^[a-z0-9_]{1,80}$/.test(id)) continue;
    if (typeof src !== "string") continue;
    const cleanSrc = src.trim();
    if (!cleanSrc) continue;
    out[id] = cleanSrc;
  }
  return out;
}
function normalizeSpriteScaleMap(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, value] of Object.entries(input)) {
    if (!/^[a-z0-9_]{1,80}$/.test(id)) continue;
    const scale = clamp(Math.floor(Number(value) || 100), 25, 300);
    if (scale === 100) continue;
    out[id] = scale;
  }
  return out;
}
function spriteScalePercentForId(spriteId) {
  if (!spriteId) return 100;
  const value = spriteOverrideState.scales?.[spriteId];
  const scale = Number.isFinite(value) ? Math.floor(value) : 100;
  return clamp(scale, 25, 300);
}
function scaledSpriteSize(baseSize, spriteId) {
  const scale = spriteScalePercentForId(spriteId);
  return Math.max(1, Math.round(baseSize * (scale / 100)));
}
function syncSpriteSources(overrides = null) {
  if (overrides && typeof overrides === "object") {
    spriteOverrideState.overrides = normalizeSpriteOverrideMap(overrides);
  }
  const merged = { ...DEFAULT_SPRITE_SOURCES, ...spriteOverrideState.overrides };
  const nextIds = new Set(Object.keys(merged));
  for (const id of Object.keys(SPRITE_SOURCES)) {
    if (nextIds.has(id)) continue;
    delete SPRITE_SOURCES[id];
    clearSpriteCache(id);
  }
  for (const [id, src] of Object.entries(merged)) {
    if (SPRITE_SOURCES[id] === src) continue;
    SPRITE_SOURCES[id] = src;
    clearSpriteCache(id);
  }
}
syncSpriteSources(spriteOverrideState.overrides);
function getSpriteIfReady(id) {
  if (!id) return null;
  if (!spriteRequested[id] && SPRITE_SOURCES[id]) loadProcessedSprite(id, SPRITE_SOURCES[id]);
  if (!id || !spriteReady[id]) return null;
  return spriteProcessed[id] ?? spriteImages[id] ?? null;
}
const MONSTER_SPRITE_FALLBACKS = {
  slime: "slime_yellow",
  slime_green: "slime_green",
  slime_yellow: "slime_yellow",
  slime_orange: "slime_orange",
  slime_red: "slime_red",
  slime_violet: "slime_violet",
  slime_indigo: "slime_indigo",
  jelly: "slime_yellow",
  hobgoblin: "goblin",
  dire_wolf: "rat",
  cave_troll: "goblin",
  wraith: "rogue",
  basilisk: "giant_spider",
  ancient_automaton: "skeleton",
  spore_crawler: "giant_spider",
  rift_hound: "dire_wolf",
  crocubot: "ancient_automaton",
  bone_herald: "skeleton",
  iron_warden: "ancient_automaton",
  cave_skirmisher: "archer",
  ruin_archer: "archer",
  storm_sniper: "archer",
  nullmetal_assassin: "rogue",
  deepcore_ballista_sentinel: "ancient_automaton",
  singularity_hunter: "wraith",
};
const CHEST_LOCK_SPRITE_BY_KEY = {
  key_red: "chest_red",
  key_green: "chest_green",
  key_yellow: "chest_green",
  key_orange: "chest_red",
  key_violet: "chest_purple",
  key_indigo: "chest_blue",
  key_blue: "chest_blue",
  key_purple: "chest_purple",
  key_magenta: "chest_blue",
};
function monsterSpriteId(type) {
  const normalizedType = normalizeMonsterTypeId(type);
  if (!normalizedType) return null;
  if (SPRITE_SOURCES[normalizedType]) return normalizedType;
  const fallback = MONSTER_SPRITE_FALLBACKS[normalizedType] ?? null;
  if (fallback && SPRITE_SOURCES[fallback]) return fallback;
  return null;
}
function itemSpriteId(ent) {
  if (!ent?.type) return null;
  const type = ent.type;
  if (type === "chest") {
    const keyType = ent.keyType ?? ent.lockKeyType ?? null;
    const isLocked = !!ent.locked || !!keyType;
    const lockSprite = isLocked ? (CHEST_LOCK_SPRITE_BY_KEY[keyType] ?? null) : null;
    if (lockSprite && SPRITE_SOURCES[lockSprite]) return lockSprite;
  }
  if (SPRITE_SOURCES[type]) return type;
  return null;
}
function characterSpriteId(speciesId, classId) {
  const sid = normalizeCharacterSpeciesId(speciesId);
  const cid = normalizeCharacterClassId(classId);
  return `hero_${sid}_${cid}`;
}
function resolveCharacterSpriteDisplay(speciesId, classId) {
  const spriteId = characterSpriteId(speciesId, classId);
  if (SPRITE_SOURCES[spriteId]) return { spriteId, src: SPRITE_SOURCES[spriteId], fallback: false };
  if (SPRITE_SOURCES.hero) return { spriteId: "hero", src: SPRITE_SOURCES.hero, fallback: true };
  return { spriteId: "", src: "", fallback: true };
}
function playerCharacterSpriteId(state) {
  const speciesId = state?.player?.speciesId ?? state?.character?.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID;
  const classId = state?.player?.classId ?? state?.character?.classId ?? DEFAULT_CHARACTER_CLASS_ID;
  const display = resolveCharacterSpriteDisplay(speciesId, classId);
  return display.spriteId || "hero";
}

function drawGlyph(ctx2d, sx, sy, glyph, color = "#e6e6e6") {
  const cx = sx * TILE + TILE / 2;
  const cy = sy * TILE + TILE / 2 + 0.5;
  ctx2d.save();
  ctx2d.font = GLYPH_FONT;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillStyle = color;
  ctx2d.fillText(glyph, cx, cy);
  ctx2d.restore();
}
function drawCenteredSprite(ctx2d, sx, sy, img, w, h) {
  const iw = img?.width || 1;
  const ih = img?.height || 1;
  const scale = Math.min(w, h) / Math.max(iw, ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const px = sx * TILE + Math.floor((TILE - dw) / 2);
  const py = sy * TILE + Math.floor((TILE - dh) / 2);
  ctx2d.drawImage(img, px, py, dw, dh);
}
function drawCenteredSpriteAt(ctx2d, centerX, centerY, img, w, h) {
  const iw = img?.width || 1;
  const ih = img?.height || 1;
  const scale = Math.min(w, h) / Math.max(iw, ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const px = Math.round(centerX - dw / 2);
  const py = Math.round(centerY - dh / 2);
  ctx2d.drawImage(img, px, py, dw, dh);
}
function drawBottomAnchoredSprite(ctx2d, sx, sy, img, w, h, cellsTall = 1, bobPx = 0) {
  const iw = img?.width || 1;
  const ih = img?.height || 1;
  const scale = Math.min(w, h) / Math.max(iw, ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const px = Math.round(sx * TILE + (TILE - dw) / 2);
  const footY = Math.round((sy + Math.max(1, Number(cellsTall) || 1)) * TILE + (Number(bobPx) || 0));
  const py = Math.round(footY - dh);
  ctx2d.drawImage(img, px, py, dw, dh);
}
function drawBottomAnchoredSpriteAt(ctx2d, centerX, footY, img, w, h, bobPx = 0) {
  const iw = img?.width || 1;
  const ih = img?.height || 1;
  const scale = Math.min(w, h) / Math.max(iw, ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const px = Math.round(centerX - dw / 2);
  const py = Math.round((footY + (Number(bobPx) || 0)) - dh);
  ctx2d.drawImage(img, px, py, dw, dh);
}
function drawBottomAnchoredGlyph(ctx2d, sx, sy, glyph, color = "#e6e6e6", cellsTall = 1) {
  const cx = sx * TILE + TILE / 2;
  const footY = (sy + Math.max(1, Number(cellsTall) || 1)) * TILE;
  const y = footY - Math.round(TILE * 0.1);
  ctx2d.save();
  ctx2d.font = GLYPH_FONT;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "alphabetic";
  ctx2d.fillStyle = color;
  ctx2d.fillText(glyph, cx, y);
  ctx2d.restore();
}
function drawSoftGlow(ctx2d, cx, cy, radius, rgbaInner = "rgba(255,255,255,0.22)", rgbaOuter = "rgba(255,255,255,0)") {
  const r = Math.max(2, radius);
  const g = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgbaInner);
  g.addColorStop(1, rgbaOuter);
  ctx2d.fillStyle = g;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2d.fill();
}
function drawCombatHealthBar(ctx2d, centerX, centerY, actorSize, hp, maxHp, fillColor = "#41d66f", extraLiftPx = 0) {
  const actor = Math.max(TILE * 0.62, Number(actorSize) || TILE);
  const width = Math.round(clamp(actor * OUT_OF_COMBAT_HP_BAR_WIDTH_FRAC, TILE * 0.74, TILE * 1.55));
  const height = Math.round(clamp(actor * OUT_OF_COMBAT_HP_BAR_HEIGHT_FRAC, TILE * 0.11, TILE * 0.26));
  const gap = Math.round(clamp(actor * 0.07, TILE * 0.04, TILE * 0.13));
  const x = Math.round(centerX - width / 2);
  const y = Math.round(centerY - actor / 2 - height - gap - Math.max(0, Number(extraLiftPx) || 0));
  const ratio = clamp((Math.max(0, hp) / Math.max(1, maxHp)), 0, 1);
  const innerW = Math.max(0, Math.round((width - 2) * ratio));

  ctx2d.fillStyle = "rgba(18,22,28,0.92)";
  ctx2d.fillRect(x, y, width, height);
  ctx2d.fillStyle = "rgba(170,36,36,0.94)";
  ctx2d.fillRect(x + 1, y + 1, width - 2, height - 2);
  if (innerW > 0) {
    ctx2d.fillStyle = fillColor;
    ctx2d.fillRect(x + 1, y + 1, innerW, height - 2);
  }

  const text = `${Math.max(0, Math.floor(hp))}/${Math.max(1, Math.floor(maxHp))}`;
  ctx2d.font = `bold ${Math.max(14, Math.floor(height * 1.05))}px ui-sans-serif, system-ui, sans-serif`;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "bottom";
  ctx2d.strokeStyle = "rgba(0,0,0,0.72)";
  ctx2d.lineWidth = Math.max(2, Math.floor(height * 0.36));
  ctx2d.strokeText(text, Math.round(centerX), y - 4);
  ctx2d.fillStyle = "#f3f8ff";
  ctx2d.fillText(text, Math.round(centerX), y - 4);
}
function drawCombatHudOverlay(ctx2d, state, nowMs = Date.now()) {
  const combat = ensureCombatState(state);
  pruneCombatHudTargets(state, nowMs);
  if (!combat.hudTargets || Object.keys(combat.hudTargets).length === 0) return;

  const p = state.player;
  const playerHudExpiry = Number(combat.hudTargets.player ?? 0);
  if (playerHudExpiry >= nowMs) {
    const cx = viewRadiusX * TILE + TILE / 2;
    const cy = viewRadiusY * TILE + TILE / 2;
    const playerSize = scaledSpriteSize(PLAYER_SPRITE_SIZE, "hero");
    const playerExtraLiftPx = Math.round(TILE * PLAYER_COMBAT_HP_BAR_EXTRA_LIFT_FRAC);
    drawCombatHealthBar(ctx2d, cx, cy, playerSize, p.hp, p.maxHp, "#52e07a", playerExtraLiftPx);
  }

  for (const [monsterId, expiresAt] of Object.entries(combat.hudTargets)) {
    if (monsterId === "player") continue;
    if (!Number.isFinite(expiresAt) || expiresAt < nowMs) continue;
    const monster = state.entities.get(monsterId);
    if (!monster || monster.kind !== "monster" || monster.z !== p.z) continue;
    if (!state.visible.has(keyXY(monster.x, monster.y))) continue;
    const sx = monster.x - p.x + viewRadiusX;
    const sy = monster.y - p.y + viewRadiusY;
    if (sx < -1 || sy < -1 || sx > viewTilesX + 1 || sy > viewTilesY + 1) continue;
    const cx = sx * TILE + TILE / 2;
    const cy = sy * TILE + TILE / 2;
    const spriteId = monsterSpriteId(monster.type);
    const monsterSize = scaledSpriteSize(MONSTER_SPRITE_SIZE, spriteId);
    const nearPlayer = (Math.abs(monster.x - p.x) + Math.abs(monster.y - p.y)) <= 1;
    const extraLiftPx = nearPlayer ? Math.round(TILE * COMBAT_HP_BAR_NEARBY_EXTRA_GAP_FRAC) : 0;
    drawCombatHealthBar(ctx2d, cx, cy, monsterSize, monster.hp, monster.maxHp, "#4fd77f", extraLiftPx);
  }
}
function tileIsBoundaryForFloor(t) {
  return t === WALL || t === DOOR_CLOSED || tileIsLocked(t);
}
function collectTileNeighbors(getTileAt, wx, wy) {
  return {
    N: getTileAt(wx, wy - 1),
    E: getTileAt(wx + 1, wy),
    S: getTileAt(wx, wy + 1),
    W: getTileAt(wx - 1, wy),
    NE: getTileAt(wx + 1, wy - 1),
    NW: getTileAt(wx - 1, wy - 1),
    SE: getTileAt(wx + 1, wy + 1),
    SW: getTileAt(wx - 1, wy + 1),
  };
}
function tileOverlaySpec(theme, t, isVisible) {
  if (t === FLOOR || t === WALL) return null;
  const v = !!isVisible;
  if (t === DOOR_CLOSED) return { color: v ? theme.doorC_V : theme.doorC_NV, alpha: v ? 0.58 : 0.40 };
  if (isOpenDoorTile(t)) return { color: v ? theme.doorO_V : theme.doorO_NV, alpha: v ? 0.48 : 0.34 };
  if (t === LOCK_GREEN) return { color: v ? theme.lockG_V : theme.lockG_NV, alpha: v ? 0.62 : 0.46 };
  if (t === LOCK_YELLOW) return { color: v ? theme.lockY_V : theme.lockY_NV, alpha: v ? 0.62 : 0.46 };
  if (t === LOCK_ORANGE) return { color: v ? theme.lockO_V : theme.lockO_NV, alpha: v ? 0.62 : 0.46 };
  if (t === LOCK_RED) return { color: v ? theme.lockR_V : theme.lockR_NV, alpha: v ? 0.62 : 0.46 };
  if (t === LOCK_VIOLET) return { color: v ? theme.lockV_V : theme.lockV_NV, alpha: v ? 0.62 : 0.46 };
  if (t === LOCK_INDIGO || t === LOCK_BLUE || t === LOCK_MAGENTA) return { color: v ? theme.lockI_V : theme.lockI_NV, alpha: v ? 0.62 : 0.46 };
  if (t === LOCK_PURPLE) return { color: v ? theme.lockV_V : theme.lockV_NV, alpha: v ? 0.62 : 0.46 };
  if (t === STAIRS_DOWN) return { color: v ? theme.downV : theme.downNV, alpha: v ? 0.44 : 0.32 };
  if (t === STAIRS_UP) return { color: v ? theme.upV : theme.upNV, alpha: v ? 0.44 : 0.32 };
  return null;
}
function drawFloorDecal(ctx2d, theme, wx, wy, wz, px, py, neighbors, isVisible) {
  const orthWalls =
    (tileIsBoundaryForFloor(neighbors.N) ? 1 : 0) +
    (tileIsBoundaryForFloor(neighbors.E) ? 1 : 0) +
    (tileIsBoundaryForFloor(neighbors.S) ? 1 : 0) +
    (tileIsBoundaryForFloor(neighbors.W) ? 1 : 0);
  const diagWalls =
    (tileIsBoundaryForFloor(neighbors.NE) ? 1 : 0) +
    (tileIsBoundaryForFloor(neighbors.NW) ? 1 : 0) +
    (tileIsBoundaryForFloor(neighbors.SE) ? 1 : 0) +
    (tileIsBoundaryForFloor(neighbors.SW) ? 1 : 0);
  const cornerPairCount =
    ((tileIsBoundaryForFloor(neighbors.N) && tileIsBoundaryForFloor(neighbors.W)) ? 1 : 0) +
    ((tileIsBoundaryForFloor(neighbors.N) && tileIsBoundaryForFloor(neighbors.E)) ? 1 : 0) +
    ((tileIsBoundaryForFloor(neighbors.S) && tileIsBoundaryForFloor(neighbors.W)) ? 1 : 0) +
    ((tileIsBoundaryForFloor(neighbors.S) && tileIsBoundaryForFloor(neighbors.E)) ? 1 : 0);

  const deadEndBoost = orthWalls >= 3 ? 0.04 : 0;
  const density = clamp(
    (theme.decalDensity ?? 0.05) + orthWalls * 0.008 + diagWalls * 0.004 + cornerPairCount * 0.006 + deadEndBoost,
    0.03,
    0.15
  );
  const styleSalt = Math.max(0, Math.floor(theme.styleVariantIndex ?? 0));
  const roll = tileNoise01(wx, wy, wz, 1507 + styleSalt * 17);
  if (roll > density) return;

  const alphaBase = clamp((theme.decalAlpha ?? 0.12) * (isVisible ? 1 : 0.48), 0.05, 0.26);
  const typeRoll = tileNoise01(wx, wy, wz, 1519 + styleSalt * 19);
  const decalHue = theme.wallShadeH ?? theme.floorBaseH ?? 0;
  const decalSat = Math.max(6, (theme.wallShadeS ?? 20) - 5);
  const decalLight = Math.max(4, (theme.wallShadeL ?? 14) - 2);

  if (typeRoll < 0.45) {
    const x1 = px + TILE * (0.18 + tileNoise01(wx, wy, wz, 1531) * 0.58);
    const y1 = py + TILE * (0.20 + tileNoise01(wx, wy, wz, 1537) * 0.54);
    const x2 = px + TILE * (0.18 + tileNoise01(wx, wy, wz, 1541) * 0.58);
    const y2 = py + TILE * (0.20 + tileNoise01(wx, wy, wz, 1543) * 0.54);
    ctx2d.strokeStyle = hslaColor(decalHue, decalSat, decalLight, alphaBase * 0.92);
    ctx2d.lineWidth = Math.max(1, Math.round(TILE * 0.0048));
    ctx2d.lineCap = "round";
    ctx2d.beginPath();
    ctx2d.moveTo(Math.round(x1), Math.round(y1));
    ctx2d.lineTo(Math.round((x1 + x2) * 0.5 + TILE * (tileNoise01(wx, wy, wz, 1547) - 0.5) * 0.08), Math.round((y1 + y2) * 0.5));
    ctx2d.lineTo(Math.round(x2), Math.round(y2));
    ctx2d.stroke();
    return;
  }

  if (typeRoll < 0.78) {
    const patchW = Math.round(TILE * (0.12 + tileNoise01(wx, wy, wz, 1553) * 0.16));
    const patchH = Math.round(TILE * (0.07 + tileNoise01(wx, wy, wz, 1559) * 0.12));
    const corner = Math.floor(tileNoise01(wx, wy, wz, 1567) * 4) % 4;
    let bx = px + Math.round(TILE * 0.08);
    let by = py + Math.round(TILE * 0.08);
    if (corner === 1) bx = px + TILE - patchW - Math.round(TILE * 0.08);
    else if (corner === 2) { bx = px + TILE - patchW - Math.round(TILE * 0.08); by = py + TILE - patchH - Math.round(TILE * 0.08); }
    else if (corner === 3) by = py + TILE - patchH - Math.round(TILE * 0.08);
    ctx2d.fillStyle = hslaColor(decalHue, decalSat, decalLight, alphaBase * 0.86);
    ctx2d.fillRect(bx, by, patchW, patchH);
    return;
  }

  const speckCount = 2 + Math.floor(tileNoise01(wx, wy, wz, 1571) * 3);
  ctx2d.fillStyle = hslaColor(decalHue, decalSat, decalLight, alphaBase * 0.74);
  for (let i = 0; i < speckCount; i++) {
    const nx = tileNoise01(wx, wy, wz, 1581 + i * 7);
    const ny = tileNoise01(wx, wy, wz, 1591 + i * 11);
    const r = Math.max(1, Math.round(TILE * (0.003 + tileNoise01(wx, wy, wz, 1601 + i * 13) * 0.0036)));
    const cx = px + Math.round(TILE * (0.16 + nx * 0.68));
    const cy = py + Math.round(TILE * (0.16 + ny * 0.68));
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
    ctx2d.fill();
  }
}
function drawFloorCell(ctx2d, theme, wx, wy, wz, px, py, neighbors, isVisible, tileType = FLOOR) {
  const visMul = isVisible ? 1 : 0.68;
  const noiseIntensity = Math.max(0.008, Number(theme.noiseIntensity) || 0.02);
  const variationSpan = clamp(noiseIntensity * 2.2, 0.03, 0.11);
  const variation = (1 - variationSpan / 2) + tileNoise01(wx, wy, wz, 121) * variationSpan;
  const baseL = clamp((theme.floorBaseL ?? 18) * variation * visMul, 3, 94);
  ctx2d.fillStyle = hslColor(theme.floorBaseH ?? 0, theme.floorBaseS ?? 40, baseL);
  ctx2d.fillRect(px, py, TILE, TILE);

  const blotchRoll = tileNoise01(wx, wy, wz, 127);
  if (blotchRoll < noiseIntensity * 0.92) {
    const bw = Math.round(TILE * (0.14 + tileNoise01(wx, wy, wz, 131) * 0.22));
    const bh = Math.round(TILE * (0.08 + tileNoise01(wx, wy, wz, 137) * 0.18));
    const bx = px + Math.round(TILE * (0.08 + tileNoise01(wx, wy, wz, 139) * 0.72));
    const by = py + Math.round(TILE * (0.08 + tileNoise01(wx, wy, wz, 149) * 0.72));
    const accentL = clamp((theme.floorAccentL ?? (theme.floorBaseL ?? 18)) * visMul, 3, 94);
    ctx2d.fillStyle = hslaColor(theme.floorAccentH ?? 0, theme.floorAccentS ?? 38, accentL, (isVisible ? 0.09 : 0.05) * (0.7 + noiseIntensity * 3));
    ctx2d.fillRect(bx, by, bw, bh);
  }

  const nB = tileIsBoundaryForFloor(neighbors.N);
  const eB = tileIsBoundaryForFloor(neighbors.E);
  const sB = tileIsBoundaryForFloor(neighbors.S);
  const wB = tileIsBoundaryForFloor(neighbors.W);
  const orthWalls = (nB ? 1 : 0) + (eB ? 1 : 0) + (sB ? 1 : 0) + (wB ? 1 : 0);

  const trimT = clamp(Math.round(theme.borderThickness ?? 2), 1, Math.round(TILE * 0.14));
  const trimAlpha = clamp((theme.trimAlpha ?? 0.22) * (isVisible ? 1 : 0.6) * (1 + orthWalls * 0.08), 0.05, 0.44);
  ctx2d.fillStyle = hslaColor(theme.wallShadeH ?? 0, theme.wallShadeS ?? 20, Math.max(4, (theme.wallShadeL ?? 12) - 2), trimAlpha);
  if (nB) ctx2d.fillRect(px, py, TILE, trimT);
  if (sB) ctx2d.fillRect(px, py + TILE - trimT, TILE, trimT);
  if (wB) ctx2d.fillRect(px, py, trimT, TILE);
  if (eB) ctx2d.fillRect(px + TILE - trimT, py, trimT, TILE);

  const cornerSize = clamp(Math.round(theme.cornerAoSizePx ?? (trimT * 2)), trimT + 2, Math.round(TILE * 0.16));
  const cornerAlpha = clamp((theme.cornerAoAlpha ?? 0.24) * (isVisible ? 1 : 0.62) * (1 + orthWalls * 0.12), 0.06, 0.54);
  if (cornerAlpha > 0.01) {
    ctx2d.fillStyle = hslaColor(theme.wallShadeH ?? 0, theme.wallShadeS ?? 20, Math.max(3, (theme.wallShadeL ?? 12) - 5), cornerAlpha);
    if (nB && wB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px, py);
      ctx2d.lineTo(px + cornerSize, py);
      ctx2d.lineTo(px, py + cornerSize);
      ctx2d.closePath();
      ctx2d.fill();
    }
    if (nB && eB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px + TILE, py);
      ctx2d.lineTo(px + TILE - cornerSize, py);
      ctx2d.lineTo(px + TILE, py + cornerSize);
      ctx2d.closePath();
      ctx2d.fill();
    }
    if (sB && wB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px, py + TILE);
      ctx2d.lineTo(px + cornerSize, py + TILE);
      ctx2d.lineTo(px, py + TILE - cornerSize);
      ctx2d.closePath();
      ctx2d.fill();
    }
    if (sB && eB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px + TILE, py + TILE);
      ctx2d.lineTo(px + TILE - cornerSize, py + TILE);
      ctx2d.lineTo(px + TILE, py + TILE - cornerSize);
      ctx2d.closePath();
      ctx2d.fill();
    }
  }

  const nwB = tileIsBoundaryForFloor(neighbors.NW);
  const neB = tileIsBoundaryForFloor(neighbors.NE);
  const swB = tileIsBoundaryForFloor(neighbors.SW);
  const seB = tileIsBoundaryForFloor(neighbors.SE);
  const roundRadius = clamp(Math.round(theme.edgeRoundPx ?? (trimT * 2)), trimT + 2, Math.round(TILE * 0.2));
  const roundAlpha = clamp(cornerAlpha * 0.56, 0.03, 0.24);
  if (roundAlpha > 0.01) {
    ctx2d.fillStyle = hslaColor(theme.wallShadeH ?? 0, theme.wallShadeS ?? 20, Math.max(3, (theme.wallShadeL ?? 12) - 4), roundAlpha);
    if (!nB && !wB && nwB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px, py);
      ctx2d.arc(px, py, roundRadius, 0, Math.PI / 2);
      ctx2d.closePath();
      ctx2d.fill();
    }
    if (!nB && !eB && neB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px + TILE, py);
      ctx2d.arc(px + TILE, py, roundRadius, Math.PI / 2, Math.PI);
      ctx2d.closePath();
      ctx2d.fill();
    }
    if (!sB && !eB && seB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px + TILE, py + TILE);
      ctx2d.arc(px + TILE, py + TILE, roundRadius, Math.PI, Math.PI * 1.5);
      ctx2d.closePath();
      ctx2d.fill();
    }
    if (!sB && !wB && swB) {
      ctx2d.beginPath();
      ctx2d.moveTo(px, py + TILE);
      ctx2d.arc(px, py + TILE, roundRadius, Math.PI * 1.5, Math.PI * 2);
      ctx2d.closePath();
      ctx2d.fill();
    }
  }

  if (tileType === FLOOR) drawFloorDecal(ctx2d, theme, wx, wy, wz, px, py, neighbors, isVisible);
}
function drawWallCell(ctx2d, theme, wx, wy, wz, px, py, neighbors, isVisible) {
  const visMul = isVisible ? 1 : 0.65;
  const baseVarSpan = clamp((theme.noiseIntensity ?? 0.02) * 0.9, 0.02, 0.08);
  const baseVar = (1 - baseVarSpan / 2) + tileNoise01(wx, wy, wz, 167) * baseVarSpan;
  const baseL = clamp((theme.wallBaseL ?? 28) * baseVar * visMul, 3, 94);
  ctx2d.fillStyle = hslColor(theme.wallBaseH ?? 0, theme.wallBaseS ?? 24, baseL);
  ctx2d.fillRect(px, py, TILE, TILE);

  const inset = clamp(Math.round(theme.wallInsetPx ?? 2), 1, Math.round(TILE * 0.18));
  const innerW = Math.max(1, TILE - inset * 2);
  const innerH = Math.max(1, TILE - inset * 2);
  const shadeL = clamp((theme.wallShadeL ?? 16) * visMul, 2, 92);
  ctx2d.fillStyle = hslColor(theme.wallShadeH ?? 0, theme.wallShadeS ?? 20, shadeL);
  ctx2d.fillRect(px + inset, py + inset, innerW, innerH);

  if (chunkFloorishTile(neighbors.N)) {
    const hlH = Math.max(1, Math.round(inset * 0.72));
    ctx2d.fillStyle = hslaColor(theme.wallBaseH ?? 0, Math.max(8, (theme.wallBaseS ?? 24) - 10), Math.min(92, (theme.wallBaseL ?? 28) + 20), (theme.wallHighlightAlpha ?? 0.12) * (isVisible ? 1 : 0.55));
    ctx2d.fillRect(px, py, TILE, hlH);
  }

  if (chunkFloorishTile(neighbors.S) || chunkFloorishTile(neighbors.E) || chunkFloorishTile(neighbors.W)) {
    const shH = Math.max(1, Math.round(inset * 0.65));
    ctx2d.fillStyle = hslaColor(theme.wallShadeH ?? 0, theme.wallShadeS ?? 20, Math.max(2, (theme.wallShadeL ?? 16) - 6), (theme.wallBottomShadowAlpha ?? 0.12) * (isVisible ? 1 : 0.6));
    ctx2d.fillRect(px, py + TILE - shH, TILE, shH);
  }
}
function drawEnvironmentTile(ctx2d, theme, wx, wy, wz, px, py, t, neighbors, isVisible) {
  if (t === WALL) {
    drawWallCell(ctx2d, theme, wx, wy, wz, px, py, neighbors, isVisible);
    return;
  }

  if (t === FLOOR || t === DOOR_CLOSED || isOpenDoorTile(t) || tileIsLocked(t) || t === STAIRS_DOWN || t === STAIRS_UP) {
    drawFloorCell(ctx2d, theme, wx, wy, wz, px, py, neighbors, isVisible, t);
    const overlay = tileOverlaySpec(theme, t, isVisible);
    if (overlay) {
      ctx2d.save();
      ctx2d.globalAlpha = clamp(overlay.alpha, 0, 1);
      ctx2d.fillStyle = overlay.color;
      ctx2d.fillRect(px, py, TILE, TILE);
      ctx2d.restore();
    }
    return;
  }

  const fallback = isVisible ? (theme.floorV ?? "#111722") : (theme.floorNV ?? "#0b0e14");
  ctx2d.fillStyle = fallback;
  ctx2d.fillRect(px, py, TILE, TILE);
}
function drawShrineParticles(ctx2d, cx, cy, timeSec, wx, wy, wz) {
  const count = visualFxQuality >= 2 ? (MOBILE_VISIBILITY_BOOST ? 2 : 3) : 1;
  const rise = TILE * 0.42;
  const baseY = cy + TILE * 0.18;
  const size = Math.max(4, Math.floor(TILE * 0.028));
  for (let i = 0; i < count; i++) {
    const seed = tileNoise01(wx, wy, wz, 300 + i * 17);
    const travel = ((timeSec * (0.35 + seed * 0.25)) + seed * 3.3 + i * 0.21) % 1;
    const x = cx + Math.sin(timeSec * (1.2 + seed * 1.1) + i * 1.7) * TILE * (0.1 + seed * 0.16);
    const y = baseY - travel * rise;
    const alpha = (0.08 + (1 - travel) * 0.22) * (MOBILE_VISIBILITY_BOOST ? 0.75 : 1);
    ctx2d.fillStyle = `rgba(255,176,118,${alpha})`;
    ctx2d.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
}
function drawAtmospherePass(ctx2d, theme, depth, timeSec, w, h, quality = 2) {
  if (quality <= 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const innerR = Math.min(w, h) * 0.24;
  const outerR = Math.max(w, h) * 0.72;
  const depthTint = clamp(Math.max(0, depth) * 0.0014, 0, 0.08);

  ctx2d.save();

  if (quality >= 2) {
    const warm = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.62);
    warm.addColorStop(0, `rgba(255,230,196,${0.08 + depthTint * 0.7})`);
    warm.addColorStop(0.65, `rgba(255,205,160,${0.02 + depthTint * 0.4})`);
    warm.addColorStop(1, "rgba(255,205,160,0)");
    ctx2d.fillStyle = warm;
    ctx2d.fillRect(0, 0, w, h);
  }

  const vignette = ctx2d.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.62, `rgba(8,4,5,${MOBILE_VISIBILITY_BOOST ? 0.14 : (quality >= 2 ? 0.26 : 0.2)})`);
  vignette.addColorStop(1, theme?.overlay ?? `rgba(0,0,0,${MOBILE_VISIBILITY_BOOST ? 0.32 : (quality >= 2 ? 0.45 : 0.38)})`);
  ctx2d.fillStyle = vignette;
  ctx2d.fillRect(0, 0, w, h);

  const ambientPulse = quality >= 2 ? (0.01 * Math.sin(timeSec * 0.7)) : 0;
  ctx2d.fillStyle = `rgba(120,0,0,${clamp((quality >= 2 ? 0.035 : 0.028) + depthTint + ambientPulse, 0.02, 0.11)})`;
  ctx2d.fillRect(0, 0, w, h);
  ctx2d.restore();
}
function isRareLootType(type) {
  if (!type || typeof type !== "string") return false;
  if (type === KEY_VIOLET || type === KEY_INDIGO || type === KEY_PURPLE || type === KEY_MAGENTA) return true;
  if (type.startsWith("weapon_") || type.startsWith("armor_")) {
    const mat = materialIdFromItemType(type);
    return (MATERIAL_BY_ID[mat]?.unlockDepth ?? 0) >= 21;
  }
  return itemMarketValue(type) >= 520;
}
function tileGlyph(t) {
  if (t === STAIRS_DOWN) return { g: "\u25BC", c: "#d6f5d6" };
  if (t === STAIRS_UP) return { g: "\u25B2", c: "#e8d6ff" };
  if (t === LOCK_GREEN) return { g: "G", c: "#a6ff9a" };
  if (t === LOCK_YELLOW) return { g: "Y", c: "#ffd966" };
  if (t === LOCK_ORANGE) return { g: "O", c: "#ffb066" };
  if (t === LOCK_RED) return { g: "R", c: "#ff9a9a" };
  if (t === LOCK_VIOLET) return { g: "V", c: "#d6a8ff" };
  if (t === LOCK_INDIGO) return { g: "I", c: "#aab8ff" };
  if (t === LOCK_BLUE) return { g: "I", c: "#aab8ff" };
  if (t === LOCK_PURPLE) return { g: "V", c: "#d6a8ff" };
  if (t === LOCK_MAGENTA) return { g: "I", c: "#aab8ff" };
  if (t === DOOR_CLOSED) return { g: "+", c: "#e6d3b3" };
  if (t === DOOR_OPEN) return { g: "/", c: "#b8d6ff" };
  if (t === DOOR_OPEN_GREEN) return { g: "/", c: "#a6ff9a" };
  if (t === DOOR_OPEN_YELLOW) return { g: "/", c: "#ffd966" };
  if (t === DOOR_OPEN_ORANGE) return { g: "/", c: "#ffb066" };
  if (t === DOOR_OPEN_RED) return { g: "/", c: "#ff9a9a" };
  if (t === DOOR_OPEN_VIOLET) return { g: "/", c: "#d6a8ff" };
  if (t === DOOR_OPEN_INDIGO) return { g: "/", c: "#aab8ff" };
  if (t === DOOR_OPEN_BLUE) return { g: "/", c: "#aab8ff" };
  if (t === DOOR_OPEN_PURPLE) return { g: "/", c: "#d6a8ff" };
  if (t === DOOR_OPEN_MAGENTA) return { g: "/", c: "#aab8ff" };
  return null;
}
function firstAvailableSpriteId(...ids) {
  for (const id of ids) {
    if (id && SPRITE_SOURCES[id]) return id;
  }
  return null;
}
function tileSpriteId(state, wx, wy, wz, t) {
  if (t === LOCK_GREEN) return firstAvailableSpriteId("door_green_closed", "door_closed");
  if (t === LOCK_YELLOW) return firstAvailableSpriteId("door_yellow_closed", "door_closed");
  if (t === LOCK_ORANGE) return firstAvailableSpriteId("door_orange_closed", "door_closed");
  if (t === LOCK_RED) return firstAvailableSpriteId("door_red_closed", "door_closed");
  if (t === LOCK_VIOLET) return firstAvailableSpriteId("door_violet_closed", "door_purple_closed", "door_closed");
  if (t === LOCK_INDIGO) return firstAvailableSpriteId("door_indigo_closed", "door_blue_closed", "door_closed");
  if (t === LOCK_BLUE) return firstAvailableSpriteId("door_blue_closed", "door_indigo_closed", "door_closed");
  if (t === LOCK_PURPLE) return firstAvailableSpriteId("door_purple_closed", "door_violet_closed", "door_closed");
  if (t === LOCK_MAGENTA) return firstAvailableSpriteId("door_magenta_closed", "door_indigo_closed", "door_blue_closed", "door_closed");
  if (t === DOOR_CLOSED) return "door_closed";
  if (t === DOOR_OPEN_GREEN) return firstAvailableSpriteId("door_green_open", "door_open");
  if (t === DOOR_OPEN_YELLOW) return firstAvailableSpriteId("door_yellow_open", "door_open");
  if (t === DOOR_OPEN_ORANGE) return firstAvailableSpriteId("door_orange_open", "door_open");
  if (t === DOOR_OPEN_RED) return firstAvailableSpriteId("door_red_open", "door_open");
  if (t === DOOR_OPEN_VIOLET) return firstAvailableSpriteId("door_violet_open", "door_purple_open", "door_open");
  if (t === DOOR_OPEN_INDIGO) return firstAvailableSpriteId("door_indigo_open", "door_blue_open", "door_open");
  if (t === DOOR_OPEN_BLUE) return firstAvailableSpriteId("door_blue_open", "door_indigo_open", "door_open");
  if (t === DOOR_OPEN_PURPLE) return firstAvailableSpriteId("door_purple_open", "door_violet_open", "door_open");
  if (t === DOOR_OPEN_MAGENTA) return firstAvailableSpriteId("door_magenta_open", "door_indigo_open", "door_blue_open", "door_open");
  if (t === DOOR_OPEN) return "door_open";
  if (t === STAIRS_DOWN && wz === SURFACE_LEVEL && wx === 0 && wy === 0) return "surface_entrance";
  if (t === STAIRS_UP && wz === 0) {
    const link = state.surfaceLink ?? resolveSurfaceLink(state);
    if (link && wx === link.x && wy === link.y) return "surface_entrance";
  }
  if (t === STAIRS_UP) return "stairs_up";
  if (t === STAIRS_DOWN) return "stairs_down";
  return null;
}
function materialIdFromItemType(type) {
  if (!type || typeof type !== "string") return null;
  if (!type.startsWith("weapon_") && !type.startsWith("armor_")) return null;
  const parts = type.split("_");
  if (parts.length < 3) return null;
  return parts.slice(1, -1).join("_");
}
const EMBERSTEEL_MIN_INDEX = Math.max(0, METAL_TIERS.findIndex((tier) => tier.id === "embersteel"));
function weaponTierGlowColor(type) {
  if (!type || typeof type !== "string" || !type.startsWith("weapon_")) return null;
  const materialId = materialIdFromItemType(type);
  if (!materialId) return null;
  const index = METAL_TIERS.findIndex((tier) => tier.id === materialId);
  if (index < EMBERSTEEL_MIN_INDEX) return null;
  return MATERIAL_COLOR_BY_ID[materialId] ?? "#f4c96a";
}
function itemGlyph(type) {
  // Updated colors: potions magenta, armor brown, weapons silver, chests yellow, gold gold
  if (type === "potion") return { g: "!", c: "#ff66cc" };
  if (type === "gold") return { g: "$", c: "#ffbf00" };
  if (type === KEY_RED) return { g: "k", c: "#ff6b6b" };
  if (type === KEY_GREEN) return { g: "k", c: "#7dff6b" };
  if (type === KEY_YELLOW) return { g: "k", c: "#ffd966" };
  if (type === KEY_ORANGE) return { g: "k", c: "#ffb166" };
  if (type === KEY_VIOLET) return { g: "k", c: "#b18cff" };
  if (type === KEY_INDIGO) return { g: "k", c: "#8ba3ff" };
  if (type === KEY_BLUE) return { g: "k", c: "#8ba3ff" };
  if (type === KEY_PURPLE) return { g: "k", c: "#b18cff" };
  if (type === KEY_MAGENTA) return { g: "k", c: "#8ba3ff" };
  if (type === "shopkeeper") return { g: "@", c: "#ffd166" };
  if (type === "chest") return { g: "\u25A3", c: "#ffd700" };
  if (type === "shrine") return { g: "\u2726", c: "#b8f2e6" };
  if (type?.startsWith("weapon_")) {
    const matId = materialIdFromItemType(type);
    return { g: "\u2020", c: MATERIAL_COLOR_BY_ID[matId] ?? "#cfcfcf" };
  }
  if (type?.startsWith("armor_")) {
    const matId = materialIdFromItemType(type);
    return { g: "\u26E8", c: MATERIAL_COLOR_BY_ID[matId] ?? "#8b5a2b" };
  }
  return { g: "\u2022", c: "#f4d35e" };
}
function arrowForVector(dx, dy) {
  if (dx === 0 && dy === 0) return "\u2191";
  const dirs = ["\u2192", "\u2198", "\u2193", "\u2199", "\u2190", "\u2196", "\u2191", "\u2197"];
  const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return dirs[((oct % 8) + 8) % 8];
}

function updateSurfaceCompass(state) {
  if (!surfaceCompassEl || !surfaceCompassArrowEl || !mainCanvasWrapEl) return;
  const p = state.player;
  if (p.z !== 0) {
    surfaceCompassEl.style.display = "none";
    return;
  }

  const link = state.surfaceLink ?? resolveSurfaceLink(state);
  const dx = (link?.x ?? p.x) - p.x;
  const dy = (link?.y ?? p.y) - p.y;
  const isLadderOnScreen = Math.abs(dx) <= viewRadiusX && Math.abs(dy) <= viewRadiusY;
  if (isLadderOnScreen) {
    surfaceCompassEl.style.display = "none";
    return;
  }
  const angle = (dx === 0 && dy === 0) ? (-Math.PI / 2) : Math.atan2(dy, dx);

  const w = Math.max(1, mainCanvasWrapEl.clientWidth);
  const h = Math.max(1, mainCanvasWrapEl.clientHeight);
  const cx = w / 2;
  const cy = h / 2;
  const margin = 14;
  const radius = Math.max(18, Math.min(w, h) / 2 - margin);
  const px = cx + Math.cos(angle) * radius;
  const py = cy + Math.sin(angle) * radius;

  surfaceCompassEl.style.display = "flex";
  surfaceCompassEl.style.left = `${px}px`;
  surfaceCompassEl.style.top = `${py}px`;
  surfaceCompassArrowEl.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
}

function monsterGlyph(type) {
  type = normalizeMonsterTypeId(type) || type;
  if (type === "rat") return { g: "r", c: "#ff6b6b" };
  if (type === "goblin") return { g: "g", c: "#ff6b6b" };
  if (type === "hobgoblin") return { g: "H", c: "#ff896b" };
  if (type === "dire_wolf") return { g: "W", c: "#ff9f7b" };
  if (type === "cave_troll") return { g: "T", c: "#ff7f5a" };
  if (type === "wraith") return { g: "w", c: "#d0b8ff" };
  if (type === "basilisk") return { g: "B", c: "#ffe18c" };
  if (type === "ancient_automaton") return { g: "A", c: "#c7d3ea" };
  if (type === "spore_crawler") return { g: "f", c: "#c8ff7b" };
  if (type === "rift_hound") return { g: "h", c: "#bca8ff" };
  if (type === "crocubot") return { g: "C", c: "#9dd7e8" };
  if (type === "bone_herald") return { g: "N", c: "#f0f0ff" };
  if (type === "iron_warden") return { g: "I", c: "#c4d2df" };
  if (type === "cave_skirmisher") return { g: "k", c: "#ffd39a" };
  if (type === "ruin_archer") return { g: "u", c: "#ffbf84" };
  if (type === "storm_sniper") return { g: "t", c: "#9edbff" };
  if (type === "nullmetal_assassin") return { g: "n", c: "#b9b9d8" };
  if (type === "deepcore_ballista_sentinel") return { g: "D", c: "#d69f8a" };
  if (type === "singularity_hunter") return { g: "Q", c: "#b386ff" };
  if (type === "slime_green") return { g: "s", c: "#79ff79" };
  if (type === "slime_yellow" || type === "slime" || type === "jelly") return { g: "s", c: "#ffd966" };
  if (type === "slime_orange") return { g: "s", c: "#ffb266" };
  if (type === "slime_red") return { g: "s", c: "#ff7b7b" };
  if (type === "slime_violet") return { g: "s", c: "#c79bff" };
  if (type === "slime_indigo") return { g: "s", c: "#9ea8ff" };
  if (type === "rogue") return { g: "R", c: "#ff8a6b" };
  if (type === "giant_spider") return { g: "S", c: "#ff9f4a" };
  if (type === "skeleton") return { g: "K", c: "#ff6b6b" };
  if (type === "archer") return { g: "a", c: "#ffb36b" };
  return { g: "m", c: "#ff6b6b" };
}

const SPRITE_CATEGORY_LABELS = {
  monster: "Monster",
  weapon: "Weapon",
  armor: "Armor",
  item: "Item",
  environment: "Environment",
  actor: "Actor",
};
const SPRITE_UPLOAD_DIR_BY_CATEGORY = {
  monster: "monsters",
  weapon: "weapons",
  armor: "armor",
  item: "items",
  environment: "environment",
  actor: "actors",
};
const ARMOR_SLOT_LABELS = {
  head: "Helmet",
  chest: "Chestplate",
  legs: "Platelegs",
};
const SPRITE_CATEGORY_SORT = {
  monster: 1,
  weapon: 2,
  armor: 3,
  item: 4,
  environment: 5,
  actor: 6,
};
const ENVIRONMENT_SPRITE_OBJECTS = [
  { objectId: "hero", name: "Hero", category: "actor", spriteId: "hero" },
  { objectId: "door_closed", name: "Door (Closed)", category: "environment", spriteId: "door_closed" },
  { objectId: "door_open", name: "Door (Open)", category: "environment", spriteId: "door_open" },
  { objectId: "door_red_closed", name: "Red Door (Locked)", category: "environment", spriteId: "door_red_closed" },
  { objectId: "door_red_open", name: "Red Door (Open)", category: "environment", spriteId: "door_red_open" },
  { objectId: "door_green_closed", name: "Green Door (Locked)", category: "environment", spriteId: "door_green_closed" },
  { objectId: "door_green_open", name: "Green Door (Open)", category: "environment", spriteId: "door_green_open" },
  { objectId: "door_yellow_closed", name: "Yellow Door (Locked)", category: "environment", spriteId: "door_yellow_closed" },
  { objectId: "door_yellow_open", name: "Yellow Door (Open)", category: "environment", spriteId: "door_yellow_open" },
  { objectId: "door_orange_closed", name: "Orange Door (Locked)", category: "environment", spriteId: "door_orange_closed" },
  { objectId: "door_orange_open", name: "Orange Door (Open)", category: "environment", spriteId: "door_orange_open" },
  { objectId: "door_violet_closed", name: "Violet Door (Locked)", category: "environment", spriteId: "door_violet_closed" },
  { objectId: "door_violet_open", name: "Violet Door (Open)", category: "environment", spriteId: "door_violet_open" },
  { objectId: "door_indigo_closed", name: "Indigo Door (Locked)", category: "environment", spriteId: "door_indigo_closed" },
  { objectId: "door_indigo_open", name: "Indigo Door (Open)", category: "environment", spriteId: "door_indigo_open" },
  // Legacy colorway object ids kept visible in the sprite editor.
  { objectId: "door_blue_closed", name: "Blue Door (Locked)", category: "environment", spriteId: "door_blue_closed" },
  { objectId: "door_blue_open", name: "Blue Door (Open)", category: "environment", spriteId: "door_blue_open" },
  { objectId: "door_purple_closed", name: "Purple Door (Locked)", category: "environment", spriteId: "door_purple_closed" },
  { objectId: "door_purple_open", name: "Purple Door (Open)", category: "environment", spriteId: "door_purple_open" },
  { objectId: "door_magenta_closed", name: "Magenta Door (Locked)", category: "environment", spriteId: "door_magenta_closed" },
  { objectId: "door_magenta_open", name: "Magenta Door (Open)", category: "environment", spriteId: "door_magenta_open" },
  { objectId: "stairs_up", name: "Stairs Up", category: "environment", spriteId: "stairs_up" },
  { objectId: "stairs_down", name: "Stairs Down", category: "environment", spriteId: "stairs_down" },
  { objectId: "surface_entrance", name: "Surface Entrance", category: "environment", spriteId: "surface_entrance" },
  { objectId: "chest_red", name: "Red Locked Chest", category: "environment", spriteId: "chest_red" },
  { objectId: "chest_yellow", name: "Yellow Locked Chest", category: "environment", spriteId: "chest_yellow" },
  { objectId: "chest_orange", name: "Orange Locked Chest", category: "environment", spriteId: "chest_orange" },
  { objectId: "chest_violet", name: "Violet Locked Chest", category: "environment", spriteId: "chest_violet" },
  { objectId: "chest_indigo", name: "Indigo Locked Chest", category: "environment", spriteId: "chest_indigo" },
  { objectId: "chest_blue", name: "Blue Locked Chest", category: "environment", spriteId: "chest_blue" },
  { objectId: "chest_green", name: "Green Locked Chest", category: "environment", spriteId: "chest_green" },
  { objectId: "chest_purple", name: "Purple Locked Chest", category: "environment", spriteId: "chest_purple" },
  { objectId: "chest_magenta", name: "Magenta Locked Chest", category: "environment", spriteId: "chest_magenta" },
];
function characterSpriteCatalogEntries() {
  const out = [];
  for (const species of Object.values(SPECIES_DEFS)) {
    for (const klass of classListForSpecies(species.id)) {
      const spriteId = characterSpriteId(species.id, klass.id);
      out.push({
        objectId: spriteId,
        name: `${species.name} ${klass.name} Hero`,
        category: "actor",
        spriteId,
        fallbackSpriteId: "hero",
        armorType: "",
        uploadDir: SPRITE_UPLOAD_DIR_BY_CATEGORY.actor,
      });
    }
  }
  return out;
}

function normalizeSpriteResponsePayload(payload) {
  if (!payload || typeof payload !== "object") return { overrides: {}, scales: {}, entries: [] };
  const overrides = normalizeSpriteOverrideMap(payload.overrides ?? {});
  const scales = normalizeSpriteScaleMap(payload.scales ?? {});
  const entries = Array.isArray(payload.entries) ? payload.entries.slice() : [];
  return { overrides, scales, entries };
}

function applySpritePayload(payload) {
  const normalized = normalizeSpriteResponsePayload(payload);
  spriteOverrideState.overrides = normalized.overrides;
  spriteOverrideState.scales = normalized.scales;
  spriteOverrideState.entries = normalized.entries;
  syncSpriteSources(normalized.overrides);
  infoTierSignature = "";
  spriteEditorSignature = "";
}

function sourceTypeForSpriteId(spriteId) {
  if (!spriteId || !SPRITE_SOURCES[spriteId]) return "none";
  if (spriteOverrideState.overrides[spriteId]) return "custom";
  if (DEFAULT_SPRITE_SOURCES[spriteId]) return "default";
  return "runtime";
}

function resolveSpriteDisplayForEntry(entry) {
  if (!entry) return { hasSprite: false, sourceType: "none", sourceText: "No sprite", spriteId: "", src: "" };

  if (entry.spriteId && SPRITE_SOURCES[entry.spriteId]) {
    const sourceType = sourceTypeForSpriteId(entry.spriteId);
    return {
      hasSprite: true,
      sourceType,
      sourceText: sourceType === "custom" ? "Custom override" : (sourceType === "default" ? "Default" : "Runtime"),
      spriteId: entry.spriteId,
      src: SPRITE_SOURCES[entry.spriteId],
      viaAlias: false,
    };
  }

  if (entry.fallbackSpriteId && SPRITE_SOURCES[entry.fallbackSpriteId]) {
    const sourceType = sourceTypeForSpriteId(entry.fallbackSpriteId);
    return {
      hasSprite: true,
      sourceType,
      sourceText: `Alias -> ${entry.fallbackSpriteId}`,
      spriteId: entry.fallbackSpriteId,
      src: SPRITE_SOURCES[entry.fallbackSpriteId],
      viaAlias: true,
    };
  }

  return {
    hasSprite: false,
    sourceType: "none",
    sourceText: "No sprite",
    spriteId: "",
    src: "",
    viaAlias: false,
  };
}

function placeholderGlyphForObject(entry) {
  if (!entry) return { g: "?", c: "#d5dfef" };
  if (entry.category === "monster") return monsterGlyph(entry.objectId) ?? { g: "m", c: "#d5dfef" };
  if (entry.category === "weapon" || entry.category === "armor" || entry.category === "item") {
    return itemGlyph(entry.objectId) ?? { g: "?", c: "#d5dfef" };
  }
  if (entry.objectId === "hero") return { g: "@", c: "#f2f6ff" };
  if (entry.objectId === "stairs_up") return tileGlyph(STAIRS_UP) ?? { g: "\u25B2", c: "#e8d6ff" };
  if (entry.objectId === "stairs_down" || entry.objectId === "surface_entrance") return tileGlyph(STAIRS_DOWN) ?? { g: "\u25BC", c: "#d6f5d6" };
  if (entry.objectId.startsWith("door_")) {
    const open = entry.objectId.endsWith("_open") || entry.objectId === "door_open";
    return { g: open ? "/" : "+", c: "#d9c5a6" };
  }
  if (entry.objectId.startsWith("chest_")) return itemGlyph("chest") ?? { g: "\u25A3", c: "#ffd700" };
  return { g: "?", c: "#d5dfef" };
}

function buildSpriteObjectCatalog() {
  const out = [];

  for (const [id, spec] of Object.entries(MONSTER_TYPES)) {
    if (spec?.aliasOf) continue;
    out.push({
      objectId: id,
      name: spec.name ?? titleFromId(id),
      category: "monster",
      spriteId: id,
      fallbackSpriteId: MONSTER_SPRITE_FALLBACKS[id] ?? "",
      armorType: "",
      metalType: "",
      uploadDir: SPRITE_UPLOAD_DIR_BY_CATEGORY.monster,
    });
  }

  for (const [id, spec] of Object.entries(ITEM_TYPES)) {
    let category = "item";
    let armorType = "";
    const metalType = materialIdFromItemType(id) ?? "";
    if (id.startsWith("weapon_")) category = "weapon";
    else if (id.startsWith("armor_")) {
      category = "armor";
      armorType = ARMOR_PIECES[id]?.slot ?? "";
    }
    out.push({
      objectId: id,
      name: spec?.name ?? titleFromId(id),
      category,
      spriteId: id,
      fallbackSpriteId: "",
      armorType,
      metalType,
      uploadDir: SPRITE_UPLOAD_DIR_BY_CATEGORY[category] ?? SPRITE_UPLOAD_DIR_BY_CATEGORY.item,
    });
  }

  for (const extra of ENVIRONMENT_SPRITE_OBJECTS) {
    out.push({
      objectId: extra.objectId,
      name: extra.name,
      category: extra.category,
      spriteId: extra.spriteId,
      fallbackSpriteId: "",
      armorType: "",
      metalType: "",
      uploadDir: SPRITE_UPLOAD_DIR_BY_CATEGORY[extra.category] ?? SPRITE_UPLOAD_DIR_BY_CATEGORY.environment,
    });
  }
  out.push(...characterSpriteCatalogEntries());

  out.sort((a, b) => {
    const ac = SPRITE_CATEGORY_SORT[a.category] ?? 99;
    const bc = SPRITE_CATEGORY_SORT[b.category] ?? 99;
    if (ac !== bc) return ac - bc;

    if (a.category === "monster" && b.category === "monster") {
      const ahp = Math.max(0, Math.floor(MONSTER_TYPES[a.objectId]?.baseHp ?? 0));
      const bhp = Math.max(0, Math.floor(MONSTER_TYPES[b.objectId]?.baseHp ?? 0));
      if (ahp !== bhp) return bhp - ahp;
    }

    if ((a.category === "weapon" || a.category === "armor") && (b.category === "weapon" || b.category === "armor")) {
      const av = itemMarketValue(a.objectId ?? a.spriteId ?? "");
      const bv = itemMarketValue(b.objectId ?? b.spriteId ?? "");
      if (av !== bv) return bv - av;
    }

    return (a.objectId ?? "").localeCompare(b.objectId ?? "");
  });
  return out;
}

function setSpriteEditorStatus(message, isError = false) {
  if (!spriteEditorStatusEl) return;
  spriteEditorStatusEl.textContent = message ?? "";
  spriteEditorStatusEl.style.color = isError ? "#ff9aa8" : "#b8c6df";
}

function isLevelUpOverlayOpen() {
  return !!levelUpOverlayEl?.classList.contains("show");
}

function closeLevelUpOverlay() {
  levelUpUi.open = false;
  clearLevelUpDraft();
  if (!levelUpOverlayEl) return;
  levelUpOverlayEl.classList.remove("show");
  levelUpOverlayEl.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function setLevelUpOverlayOpen(open) {
  if (!levelUpOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
    closeShopOverlay();
    closeSaveGameOverlay();
    closeInfoOverlay();
    closeSpriteEditorOverlay();
    closeMonsterEditorOverlay();
    if (isNewDungeonConfirmOpen()) resolveNewDungeonConfirm(false);
    renderLevelUpOverlay(game);
  }
  levelUpUi.open = show;
  levelUpOverlayEl.classList.toggle("show", show);
  levelUpOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) levelUpCloseBtnEl?.focus();
}

function renderLevelUpOverlay(state) {
  if (!levelUpStatsListEl || !levelUpCloseBtnEl) return;
  if (!state?.player) return;
  const profile = ensureCharacterState(state);
  const stats = normalizeCharacterStats(profile?.stats, profile?.speciesId);
  const unspent = Math.max(0, Math.floor(profile?.unspentStatPoints ?? 0));
  const drafted = levelUpDraftSpentTotal();
  const remaining = Math.max(0, unspent - drafted);

  levelUpStatsListEl.innerHTML = CHARACTER_STAT_KEYS.map((key) => {
    const baseVal = Math.max(0, Math.floor(stats[key] ?? 0));
    const pending = levelUpDraftForKey(key);
    const val = baseVal + pending;
    const canSpend = remaining > 0 && val < CHARACTER_STAT_MAX;
    const canRefund = pending > 0;
    const pendingText = pending > 0 ? ` <span class="levelUpPendingDelta">(+${pending})</span>` : "";
    return `<div class="levelUpRow">` +
      `<div class="levelUpStatLabel">${characterStatLabelShort(key)}</div>` +
      `<div class="levelUpStatValue">${val} / ${CHARACTER_STAT_MAX}${pendingText}</div>` +
      `<div class="levelUpSpendControls">` +
        `<button class="levelUpSpendBtn" type="button" data-stat-key="${key}" data-delta="-1"${canRefund ? "" : " disabled"}>-</button>` +
        `<button class="levelUpSpendBtn" type="button" data-stat-key="${key}" data-delta="1"${canSpend ? "" : " disabled"}>+</button>` +
      `</div>` +
    `</div>`;
  }).join("");

  levelUpCloseBtnEl.textContent = drafted > 0 ? `Confirm (+${drafted})` : "Close";
  levelUpCloseBtnEl.disabled = false;
}

function promptLevelUpOverlay(state, forceOpen = false) {
  const unspent = characterUnspentStatPoints(state);
  if (unspent <= 0) {
    return;
  }
  renderLevelUpOverlay(state);
  if (forceOpen || !isLevelUpOverlayOpen()) {
    setLevelUpOverlayOpen(true);
  }
}

function isInfoOverlayOpen() {
  return !!infoOverlayEl?.classList.contains("show");
}

function closeInfoOverlay() {
  infoUi.open = false;
  if (!infoOverlayEl) return;
  infoOverlayEl.classList.remove("show");
  infoOverlayEl.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function setInfoOverlayOpen(open) {
  if (!infoOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
    closeShopOverlay();
    closeSaveGameOverlay();
    closeSpriteEditorOverlay();
    closeMonsterEditorOverlay();
    if (isNewDungeonConfirmOpen()) resolveNewDungeonConfirm(false);
    renderInfoOverlay(game);
  }
  infoUi.open = show;
  infoOverlayEl.classList.toggle("show", show);
  infoOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) infoCloseBtnEl?.focus();
}

function weaponTierDepthSummary(windowInfo, fallbackDepth = 0) {
  if (!windowInfo) return `Starts around Depth ${Math.max(0, fallbackDepth)}.`;
  const start = Math.max(0, Math.floor(windowInfo.minDepth ?? fallbackDepth));
  const peak = Math.max(start, Math.floor(windowInfo.peakDepth ?? start));
  const maxRaw = windowInfo.maxDepth ?? Number.POSITIVE_INFINITY;
  const hasMax = Number.isFinite(maxRaw);
  if (!hasMax) {
    return `Players usually start seeing this around Depth ${start}, with a strong peak near Depth ${peak}, and it remains relevant in deeper floors.`;
  }
  const finish = Math.max(peak, Math.floor(maxRaw));
  return `Players usually start seeing this around Depth ${start}, peak near Depth ${peak}, and see it taper after Depth ${finish}.`;
}

function weaponTierFlavor(tier, idx) {
  const atk = WEAPON_MATERIAL_ATK[tier.id] ?? tier.atkBonus ?? 0;
  if (idx === 0 || atk <= 0) return "A rough baseline that keeps you alive while the dungeon tests your fundamentals.";
  if (atk < 200) return "A dependable upgrade tier: balanced handling, better edge retention, and steady fights.";
  if (atk < 500) return "A clear mid-run power spike. You can start ending trash mobs before they close distance.";
  if (atk < 900) return "This is where runs feel dangerous in your favor. Strong enough to punish mistakes less.";
  if (atk < 1600) return "High-pressure expedition gear. Expensive, rare, and built for long streaks of lethal rooms.";
  if (atk < 2400) return "Late-depth specialist steel. Hits hard enough to matter even when defenses scale sharply.";
  return "Dungeon-end mythic alloy. If you find this, the run has entered boss-hunting territory.";
}

function renderInfoOverlay(state = null) {
  if (!weaponTierListEl) return;
  const sig = [
    METAL_TIERS.map((tier) => tier.id).join("|"),
    ...METAL_TIERS.map((tier) => {
      const swordType = weaponType(tier.id, "sword");
      const spriteId = itemSpriteId({ type: swordType }) ?? "";
      return `${tier.id}:${spriteId}:${spriteId ? (SPRITE_SOURCES[spriteId] ?? "") : ""}`;
    }),
  ].join("::");
  if (sig === infoTierSignature && infoUi.open) return;
  infoTierSignature = sig;

  weaponTierListEl.innerHTML = "";
  for (let idx = 0; idx < METAL_TIERS.length; idx++) {
    const tier = METAL_TIERS[idx];
    const row = document.createElement("div");
    row.className = "weaponTierRow";

    const preview = document.createElement("div");
    preview.className = "weaponTierPreview";

    const preferredTypes = [
      weaponType(tier.id, "sword"),
      weaponType(tier.id, "axe"),
      weaponType(tier.id, "dagger"),
    ];
    let previewSpriteSrc = "";
    for (const type of preferredTypes) {
      const spriteId = itemSpriteId({ type });
      if (!spriteId || !SPRITE_SOURCES[spriteId]) continue;
      previewSpriteSrc = SPRITE_SOURCES[spriteId];
      break;
    }
    if (previewSpriteSrc) {
      const img = document.createElement("img");
      img.src = previewSpriteSrc;
      img.alt = `${tier.name} weapon sprite`;
      preview.appendChild(img);
    } else {
      const glyph = document.createElement("span");
      glyph.className = "weaponTierPlaceholder";
      const glyphInfo = itemGlyph(preferredTypes[0]) ?? { g: "?", c: "#d5dfef" };
      glyph.textContent = glyphInfo.g ?? "?";
      glyph.style.color = glyphInfo.c ?? "#d5dfef";
      preview.appendChild(glyph);
    }

    const meta = document.createElement("div");
    meta.className = "weaponTierMeta";
    const name = document.createElement("div");
    name.className = "weaponTierName";
    name.textContent = tier.name;

    const stats = document.createElement("div");
    stats.className = "weaponTierStats";
    const atkBonus = WEAPON_MATERIAL_ATK[tier.id] ?? tier.atkBonus ?? 0;
    stats.textContent = `Material ATK bonus: ${atkBonus >= 0 ? "+" : ""}${atkBonus}`;

    const depth = document.createElement("div");
    depth.className = "weaponTierDepth";
    depth.textContent = weaponTierDepthSummary(MATERIAL_DEPTH_WINDOWS[tier.id], tier.unlockDepth ?? 0);

    const flavor = document.createElement("div");
    flavor.className = "weaponTierFlavor";
    flavor.textContent = weaponTierFlavor(tier, idx);

    meta.appendChild(name);
    meta.appendChild(stats);
    meta.appendChild(depth);
    meta.appendChild(flavor);
    row.appendChild(preview);
    row.appendChild(meta);
    weaponTierListEl.appendChild(row);
  }
}

function setMonsterEditorStatus(message, isError = false) {
  if (!monsterEditorStatusEl) return;
  monsterEditorStatusEl.textContent = message ?? "";
  monsterEditorStatusEl.style.color = isError ? "#ff9aa8" : "#b8c6df";
}

function isMonsterEditorOverlayOpen() {
  return !!monsterEditorOverlayEl?.classList.contains("show");
}

function closeMonsterEditorOverlay() {
  monsterEditorUi.open = false;
  if (!monsterEditorOverlayEl) return;
  monsterEditorOverlayEl.classList.remove("show");
  monsterEditorOverlayEl.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function setMonsterEditorOverlayOpen(open) {
  if (!monsterEditorOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
    closeShopOverlay();
    closeSaveGameOverlay();
    closeInfoOverlay();
    closeSpriteEditorOverlay();
    if (isNewDungeonConfirmOpen()) resolveNewDungeonConfirm(false);
  }
  monsterEditorUi.open = show;
  monsterEditorOverlayEl.classList.toggle("show", show);
  monsterEditorOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) monsterEditorCloseBtnEl?.focus();
}

function setMonsterEditorAdvancedVisible(show) {
  monsterEditorUi.showAdvanced = !!show;
  if (monsterEditorAdvancedFieldsEl) {
    monsterEditorAdvancedFieldsEl.classList.toggle("show", monsterEditorUi.showAdvanced);
  }
  if (monsterEditAdvancedToggleEl) {
    monsterEditAdvancedToggleEl.textContent = monsterEditorUi.showAdvanced ? "Advanced -" : "Advanced +";
  }
}

function monsterEditorRuleIndexById(id) {
  const normalizedId = normalizeMonsterEditorId(id ?? "");
  if (!normalizedId) return -1;
  return (monsterEditorUi.workingSpawnRules ?? []).findIndex((rule) => rule?.id === normalizedId);
}

function monsterEditorRuleById(id) {
  const idx = monsterEditorRuleIndexById(id);
  if (idx < 0) return null;
  return monsterEditorUi.workingSpawnRules[idx] ?? null;
}

function upsertMonsterEditorRule(rawRule) {
  const rule = normalizeMonsterSpawnRule(rawRule);
  if (!rule) return false;
  const idx = monsterEditorRuleIndexById(rule.id);
  if (idx >= 0) monsterEditorUi.workingSpawnRules[idx] = rule;
  else monsterEditorUi.workingSpawnRules.push(rule);
  monsterEditorUi.workingSpawnRules.sort((a, b) => (a.minDepth - b.minDepth) || a.id.localeCompare(b.id));
  return true;
}

function removeMonsterEditorRule(id) {
  const idx = monsterEditorRuleIndexById(id);
  if (idx < 0) return false;
  monsterEditorUi.workingSpawnRules.splice(idx, 1);
  return true;
}

function monsterEditorPayloadSignature(monsters, spawnRules) {
  const monsterMap = {};
  const sourceMonsters = (monsters && typeof monsters === "object") ? monsters : {};
  for (const id of Object.keys(sourceMonsters).sort()) {
    const normalizedId = normalizeMonsterEditorId(id);
    if (!normalizedId) continue;
    monsterMap[normalizedId] = normalizeMonsterEditorSpec(normalizedId, sourceMonsters[normalizedId]);
  }
  const rules = cloneMonsterSpawnRulesForEditor(spawnRules ?? []);
  return JSON.stringify({ monsters: monsterMap, spawn_rules: rules });
}

function setMonsterEditorSpawnFieldState() {
  const hasSelected = !!monsterEditorUi.selectedId && !!monsterEditorUi.workingMonsters[monsterEditorUi.selectedId];
  const canEditSpawn = !monsterEditorUi.loading && hasSelected && !!monsterEditSpawnEnabledEl?.checked;
  const spawnFields = [
    monsterEditSpawnMinDepthEl,
    monsterEditSpawnMaxDepthEl,
    monsterEditSpawnBaseWeightEl,
    monsterEditSpawnRampFactorEl,
  ];
  for (const field of spawnFields) {
    if (!field) continue;
    field.disabled = !canEditSpawn;
  }
  if (monsterEditSpawnEnabledEl) {
    monsterEditSpawnEnabledEl.disabled = monsterEditorUi.loading || !hasSelected;
  }
}

function updateMonsterEditorControlState() {
  const hasSelected = !!monsterEditorUi.selectedId && !!monsterEditorUi.workingMonsters[monsterEditorUi.selectedId];
  const busy = monsterEditorUi.loading;

  if (monsterEditorSearchInputEl) monsterEditorSearchInputEl.disabled = busy;
  if (monsterEditorPreviewDepthInputEl) monsterEditorPreviewDepthInputEl.disabled = busy;
  if (monsterEditorNewBtnEl) monsterEditorNewBtnEl.disabled = busy;
  if (monsterEditorDuplicateBtnEl) monsterEditorDuplicateBtnEl.disabled = busy || !hasSelected;
  if (monsterEditorDeleteBtnEl) {
    monsterEditorDeleteBtnEl.disabled = busy || !hasSelected || monsterEditorUi.selectedId === "rat";
  }
  if (monsterEditorExportBtnEl) monsterEditorExportBtnEl.disabled = busy;
  if (monsterEditorImportBtnEl) monsterEditorImportBtnEl.disabled = busy;
  if (monsterEditorImportInputEl) monsterEditorImportInputEl.disabled = busy;
  if (monsterEditorRefreshBtnEl) monsterEditorRefreshBtnEl.disabled = busy;
  if (monsterEditorRevertBtnEl) monsterEditorRevertBtnEl.disabled = busy || !monsterEditorUi.dirty;
  if (monsterEditorSaveBtnEl) monsterEditorSaveBtnEl.disabled = busy || !monsterEditorUi.dirty;
  if (monsterEditAdvancedToggleEl) monsterEditAdvancedToggleEl.disabled = busy || !hasSelected;

  if (monsterEditorFormEl) {
    const fields = monsterEditorFormEl.querySelectorAll("input, select");
    for (const field of fields) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) continue;
      if (field === monsterEditIdEl) {
        field.disabled = true;
        continue;
      }
      field.disabled = busy || !hasSelected;
    }
  }
  setMonsterEditorSpawnFieldState();
}

function refreshMonsterEditorDirtyState() {
  const workingSig = monsterEditorPayloadSignature(monsterEditorUi.workingMonsters, monsterEditorUi.workingSpawnRules);
  const baselineSig = monsterEditorPayloadSignature(monsterEditorUi.baselineMonsters, monsterEditorUi.baselineSpawnRules);
  monsterEditorUi.dirty = workingSig !== baselineSig;
  updateMonsterEditorControlState();
}

function setMonsterEditorLoading(loading) {
  monsterEditorUi.loading = !!loading;
  monsterEditorSignature = "";
  updateMonsterEditorControlState();
  renderMonsterEditorList();
}

function monsterEditorListEntries() {
  const query = (monsterEditorSearchInputEl?.value ?? "").trim().toLowerCase();
  const entries = [];
  for (const [id, spec] of Object.entries(monsterEditorUi.workingMonsters ?? {})) {
    if (!spec || typeof spec !== "object") continue;
    const rule = monsterEditorRuleById(id);
    if (query) {
      const haystack = `${id} ${spec.name ?? ""} ${spec.ai ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) continue;
    }
    entries.push({ id, spec, rule });
  }
  entries.sort((a, b) => {
    const minA = Number.isFinite(a.rule?.minDepth) ? a.rule.minDepth : Number.POSITIVE_INFINITY;
    const minB = Number.isFinite(b.rule?.minDepth) ? b.rule.minDepth : Number.POSITIVE_INFINITY;
    if (minA !== minB) return minA - minB;
    const hpA = Math.max(0, Math.floor(a.spec?.baseHp ?? 0));
    const hpB = Math.max(0, Math.floor(b.spec?.baseHp ?? 0));
    if (hpA !== hpB) return hpB - hpA;
    return a.id.localeCompare(b.id);
  });
  return entries;
}

function ensureMonsterEditorAiValue(aiValue) {
  if (!monsterEditAiEl) return;
  for (const opt of [...monsterEditAiEl.options]) {
    if (opt.dataset.dynamic === "1") opt.remove();
  }
  const wanted = String(aiValue ?? "").trim();
  if (!wanted) {
    monsterEditAiEl.value = "";
    return;
  }
  const hasOption = [...monsterEditAiEl.options].some((opt) => opt.value === wanted);
  if (!hasOption) {
    const opt = document.createElement("option");
    opt.value = wanted;
    opt.textContent = wanted;
    opt.dataset.dynamic = "1";
    monsterEditAiEl.appendChild(opt);
  }
  monsterEditAiEl.value = wanted;
}

function populateMonsterEditorForm() {
  if (!monsterEditorFormEl) return;
  const id = normalizeMonsterEditorId(monsterEditorUi.selectedId ?? "");
  const spec = id ? monsterEditorUi.workingMonsters[id] : null;
  const rule = id ? monsterEditorRuleById(id) : null;

  monsterEditorUi.suspendFormEvents = true;
  try {
    if (!id || !spec) {
      if (monsterEditIdEl) monsterEditIdEl.value = "";
      if (monsterEditNameEl) monsterEditNameEl.value = "";
      if (monsterEditGlyphEl) monsterEditGlyphEl.value = "";
      if (monsterEditAliasOfEl) monsterEditAliasOfEl.value = "";
      ensureMonsterEditorAiValue("");
      if (monsterEditSizeGrowthEl) monsterEditSizeGrowthEl.checked = true;
      if (monsterEditBaseHpEl) monsterEditBaseHpEl.value = "";
      if (monsterEditBaseAtkEl) monsterEditBaseAtkEl.value = "";
      if (monsterEditBaseDefEl) monsterEditBaseDefEl.value = "";
      if (monsterEditBaseAccEl) monsterEditBaseAccEl.value = "";
      if (monsterEditBaseEvaEl) monsterEditBaseEvaEl.value = "";
      if (monsterEditSpdEl) monsterEditSpdEl.value = "";
      if (monsterEditXpEl) monsterEditXpEl.value = "";
      if (monsterEditRangeEl) monsterEditRangeEl.value = "";
      if (monsterEditCdTurnsEl) monsterEditCdTurnsEl.value = "";
      if (monsterEditPreferredRangeEl) monsterEditPreferredRangeEl.value = "";
      if (monsterEditBlinkRangeEl) monsterEditBlinkRangeEl.value = "";
      if (monsterEditSummonCooldownTurnsEl) monsterEditSummonCooldownTurnsEl.value = "";
      if (monsterEditPoisonOnHitChanceEl) monsterEditPoisonOnHitChanceEl.value = "";
      if (monsterEditPoisonOnHitTurnsEl) monsterEditPoisonOnHitTurnsEl.value = "";
      if (monsterEditPoisonOnHitDmgEl) monsterEditPoisonOnHitDmgEl.value = "";
      if (monsterEditSlowOnHitChanceEl) monsterEditSlowOnHitChanceEl.value = "";
      if (monsterEditSlowTurnsEl) monsterEditSlowTurnsEl.value = "";
      if (monsterEditStunOnHitChanceEl) monsterEditStunOnHitChanceEl.value = "";
      if (monsterEditKnockbackOnHitChanceEl) monsterEditKnockbackOnHitChanceEl.value = "";
      if (monsterEditBackstabDamageMultEl) monsterEditBackstabDamageMultEl.value = "";
      if (monsterEditMeleeReflectPctEl) monsterEditMeleeReflectPctEl.value = "";
      if (monsterEditDeathCloudTurnsEl) monsterEditDeathCloudTurnsEl.value = "";
      if (monsterEditDeathCloudRadiusEl) monsterEditDeathCloudRadiusEl.value = "";
      if (monsterEditDeathCloudDmgEl) monsterEditDeathCloudDmgEl.value = "";
      if (monsterEditImmunePoisonEl) monsterEditImmunePoisonEl.checked = false;
      if (monsterEditSpawnEnabledEl) monsterEditSpawnEnabledEl.checked = false;
      if (monsterEditSpawnMinDepthEl) monsterEditSpawnMinDepthEl.value = "0";
      if (monsterEditSpawnMaxDepthEl) monsterEditSpawnMaxDepthEl.value = "";
      if (monsterEditSpawnBaseWeightEl) monsterEditSpawnBaseWeightEl.value = "1";
      if (monsterEditSpawnRampFactorEl) monsterEditSpawnRampFactorEl.value = "0";
      return;
    }
    if (monsterEditIdEl) monsterEditIdEl.value = id;
    if (monsterEditNameEl) monsterEditNameEl.value = String(spec.name ?? titleFromId(id));
    if (monsterEditGlyphEl) monsterEditGlyphEl.value = String(spec.glyph ?? "").slice(0, 2);
    if (monsterEditAliasOfEl) monsterEditAliasOfEl.value = String(spec.aliasOf ?? "");
    ensureMonsterEditorAiValue(spec.ai ?? "");
    if (monsterEditSizeGrowthEl) monsterEditSizeGrowthEl.checked = spec.sizeGrowth !== false;
    if (monsterEditBaseHpEl) monsterEditBaseHpEl.value = `${Math.max(1, Math.floor(spec.baseHp ?? 18))}`;
    if (monsterEditBaseAtkEl) monsterEditBaseAtkEl.value = `${Math.max(1, Math.floor(spec.baseAtk ?? 6))}`;
    if (monsterEditBaseDefEl) monsterEditBaseDefEl.value = `${Math.max(0, Math.floor(spec.baseDef ?? 1))}`;
    if (monsterEditBaseAccEl) monsterEditBaseAccEl.value = `${Math.max(1, Math.floor(spec.baseAcc ?? 70))}`;
    if (monsterEditBaseEvaEl) monsterEditBaseEvaEl.value = `${Math.max(0, Math.floor(spec.baseEva ?? 8))}`;
    if (monsterEditSpdEl) monsterEditSpdEl.value = `${Number(spec.spd ?? 1)}`;
    if (monsterEditXpEl) monsterEditXpEl.value = `${Math.max(1, Math.floor(spec.xp ?? 3))}`;
    if (monsterEditRangeEl) monsterEditRangeEl.value = Number.isFinite(spec.range) && spec.range > 0 ? `${Math.floor(spec.range)}` : "";
    if (monsterEditCdTurnsEl) monsterEditCdTurnsEl.value = Number.isFinite(spec.cdTurns) && spec.cdTurns > 0 ? `${Math.floor(spec.cdTurns)}` : "";
    if (monsterEditPreferredRangeEl) monsterEditPreferredRangeEl.value = Number.isFinite(spec.preferredRange) && spec.preferredRange > 0 ? `${Math.floor(spec.preferredRange)}` : "";
    if (monsterEditBlinkRangeEl) monsterEditBlinkRangeEl.value = Number.isFinite(spec.blinkRange) && spec.blinkRange > 0 ? `${Math.floor(spec.blinkRange)}` : "";
    if (monsterEditSummonCooldownTurnsEl) monsterEditSummonCooldownTurnsEl.value = Number.isFinite(spec.summonCooldownTurns) && spec.summonCooldownTurns > 0 ? `${Math.floor(spec.summonCooldownTurns)}` : "";
    if (monsterEditPoisonOnHitChanceEl) monsterEditPoisonOnHitChanceEl.value = Number.isFinite(spec.poisonOnHitChance) && spec.poisonOnHitChance > 0 ? `${Number(spec.poisonOnHitChance)}` : "";
    if (monsterEditPoisonOnHitTurnsEl) monsterEditPoisonOnHitTurnsEl.value = Number.isFinite(spec.poisonOnHitTurns) && spec.poisonOnHitTurns > 0 ? `${Math.floor(spec.poisonOnHitTurns)}` : "";
    if (monsterEditPoisonOnHitDmgEl) monsterEditPoisonOnHitDmgEl.value = Number.isFinite(spec.poisonOnHitDmg) && spec.poisonOnHitDmg > 0 ? `${Math.floor(spec.poisonOnHitDmg)}` : "";
    if (monsterEditSlowOnHitChanceEl) monsterEditSlowOnHitChanceEl.value = Number.isFinite(spec.slowOnHitChance) && spec.slowOnHitChance > 0 ? `${Number(spec.slowOnHitChance)}` : "";
    if (monsterEditSlowTurnsEl) monsterEditSlowTurnsEl.value = Number.isFinite(spec.slowTurns) && spec.slowTurns > 0 ? `${Math.floor(spec.slowTurns)}` : "";
    if (monsterEditStunOnHitChanceEl) monsterEditStunOnHitChanceEl.value = Number.isFinite(spec.stunOnHitChance) && spec.stunOnHitChance > 0 ? `${Number(spec.stunOnHitChance)}` : "";
    if (monsterEditKnockbackOnHitChanceEl) monsterEditKnockbackOnHitChanceEl.value = Number.isFinite(spec.knockbackOnHitChance) && spec.knockbackOnHitChance > 0 ? `${Number(spec.knockbackOnHitChance)}` : "";
    if (monsterEditBackstabDamageMultEl) monsterEditBackstabDamageMultEl.value = Number.isFinite(spec.backstabDamageMult) && spec.backstabDamageMult > 0 ? `${Number(spec.backstabDamageMult)}` : "";
    if (monsterEditMeleeReflectPctEl) monsterEditMeleeReflectPctEl.value = Number.isFinite(spec.meleeReflectPct) && spec.meleeReflectPct > 0 ? `${Number(spec.meleeReflectPct)}` : "";
    if (monsterEditDeathCloudTurnsEl) monsterEditDeathCloudTurnsEl.value = Number.isFinite(spec.deathCloudTurns) && spec.deathCloudTurns > 0 ? `${Math.floor(spec.deathCloudTurns)}` : "";
    if (monsterEditDeathCloudRadiusEl) monsterEditDeathCloudRadiusEl.value = Number.isFinite(spec.deathCloudRadius) && spec.deathCloudRadius > 0 ? `${Math.floor(spec.deathCloudRadius)}` : "";
    if (monsterEditDeathCloudDmgEl) monsterEditDeathCloudDmgEl.value = Number.isFinite(spec.deathCloudDmg) && spec.deathCloudDmg > 0 ? `${Math.floor(spec.deathCloudDmg)}` : "";
    if (monsterEditImmunePoisonEl) monsterEditImmunePoisonEl.checked = !!spec.immunePoison;
    if (monsterEditSpawnEnabledEl) monsterEditSpawnEnabledEl.checked = !!rule;
    if (monsterEditSpawnMinDepthEl) monsterEditSpawnMinDepthEl.value = `${Math.max(0, Math.floor(rule?.minDepth ?? 0))}`;
    if (monsterEditSpawnMaxDepthEl) monsterEditSpawnMaxDepthEl.value = Number.isFinite(rule?.maxDepth) ? `${Math.floor(rule.maxDepth)}` : "";
    if (monsterEditSpawnBaseWeightEl) monsterEditSpawnBaseWeightEl.value = `${Number(rule?.baseWeight ?? 1)}`;
    if (monsterEditSpawnRampFactorEl) monsterEditSpawnRampFactorEl.value = `${Number(rule?.rampFactor ?? 0)}`;
  } finally {
    monsterEditorUi.suspendFormEvents = false;
    setMonsterEditorSpawnFieldState();
    updateMonsterEditorControlState();
  }
}

function resolveMonsterEditorPreviewSpec(id, seen = null) {
  const normalizedId = normalizeMonsterEditorId(id ?? "");
  if (!normalizedId) return normalizeMonsterEditorSpec("rat", monsterEditorUi.workingMonsters.rat ?? MONSTER_TYPES.rat);
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(normalizedId)) {
    return normalizeMonsterEditorSpec(normalizedId, monsterEditorUi.workingMonsters[normalizedId] ?? MONSTER_TYPES[normalizedId]);
  }
  visited.add(normalizedId);
  const current = monsterEditorUi.workingMonsters[normalizedId] ?? MONSTER_TYPES[normalizedId] ?? { id: normalizedId, name: titleFromId(normalizedId) };
  const spec = normalizeMonsterEditorSpec(normalizedId, current);
  const aliasId = normalizeMonsterEditorId(spec.aliasOf ?? "");
  if (aliasId && aliasId !== normalizedId) {
    const aliasSpec = resolveMonsterEditorPreviewSpec(aliasId, visited);
    if (aliasSpec) return { ...aliasSpec, id: normalizedId, aliasOf: aliasId };
  }
  return spec;
}

function monsterEditorPreviewStatsForDepth(id, z) {
  const spec = resolveMonsterEditorPreviewSpec(id);
  const depth = Math.max(0, Math.floor(z ?? 0));
  const scale = monsterDepthScale(depth);
  const sizeTier = monsterSizeTier(depth, spec);
  const tierIndex = Math.max(0, MONSTER_SIZE_TIERS.findIndex((t) => t.id === sizeTier.id));
  const sizePenalty = spec?.sizeGrowth ? tierIndex : 0;
  const hpScale = scale * sizeTier.mult;
  const depthT = clamp(depth / 20, 0, 1);
  const offenseDepthWeight = MONSTER_OFFENSE_DEPTH_WEIGHT_SHALLOW +
    (MONSTER_OFFENSE_DEPTH_WEIGHT_DEEP - MONSTER_OFFENSE_DEPTH_WEIGHT_SHALLOW) * depthT;
  const defenseDepthWeight = MONSTER_DEFENSE_DEPTH_WEIGHT_SHALLOW +
    (MONSTER_DEFENSE_DEPTH_WEIGHT_DEEP - MONSTER_DEFENSE_DEPTH_WEIGHT_SHALLOW) * depthT;
  const offenseScale =
    (1 + (scale - 1) * offenseDepthWeight) *
    (1 + (sizeTier.mult - 1) * MONSTER_OFFENSE_SIZE_SCALE_WEIGHT);
  const defenseScale =
    (1 + (scale - 1) * defenseDepthWeight) *
    (1 + (sizeTier.mult - 1) * MONSTER_DEFENSE_SIZE_SCALE_WEIGHT);
  const earlyDepthPressureT = clamp((EARLY_DEPTH_PRESSURE_FADE_DEPTH - depth) / EARLY_DEPTH_PRESSURE_FADE_DEPTH, 0, 1);
  const earlyHpMult = 1 + (EARLY_DEPTH_HP_MULT - 1) * earlyDepthPressureT;
  const earlyOffenseMult = 1 + (EARLY_DEPTH_OFFENSE_MULT - 1) * earlyDepthPressureT;
  const earlyDefenseMult = 1 + (EARLY_DEPTH_DEFENSE_MULT - 1) * earlyDepthPressureT;
  const midDepthPressureT = depth < MID_DEPTH_BOOST_START || depth > MID_DEPTH_BOOST_END
    ? 0
    : (depth <= MID_DEPTH_BOOST_PEAK
      ? clamp((depth - MID_DEPTH_BOOST_START) / Math.max(1, MID_DEPTH_BOOST_PEAK - MID_DEPTH_BOOST_START), 0, 1)
      : clamp((MID_DEPTH_BOOST_END - depth) / Math.max(1, MID_DEPTH_BOOST_END - MID_DEPTH_BOOST_PEAK), 0, 1));
  const midHpMult = 1 + (MID_DEPTH_HP_MULT_PEAK - 1) * midDepthPressureT;
  const midOffenseMult = 1 + (MID_DEPTH_OFFENSE_MULT_PEAK - 1) * midDepthPressureT;
  const midDefenseMult = 1 + (MID_DEPTH_DEFENSE_MULT_PEAK - 1) * midDepthPressureT;
  const baseHpScaled = Math.round((spec.baseHp ?? 18) * hpScale * earlyHpMult * midHpMult * PLAYER_STAT_SCALE);
  const hpFloor = monsterMinHpFloorForDepth(depth);
  const maxHp = Math.max(1, Math.max(baseHpScaled, hpFloor));
  const atk = Math.max(1, Math.round((spec.baseAtk ?? 6) * offenseScale * earlyOffenseMult * midOffenseMult * PLAYER_STAT_SCALE));
  const atkLo = Math.max(1, Math.round(atk * 0.82));
  const atkHi = Math.max(atkLo, Math.round(atk * 1.18));
  const def = Math.max(0, Math.round((spec.baseDef ?? 1) * defenseScale * earlyDefenseMult * midDefenseMult * PLAYER_STAT_SCALE));
  const acc = clamp(Math.round((spec.baseAcc ?? 70) + depth * 0.15), 8, 98);
  const evaBase = Math.round((spec.baseEva ?? 8) + depth * 0.12);
  const eva = clamp(evaBase - sizePenalty * 5, 0, 88);
  const spd = Math.max(0.55, Number(((spec.spd ?? 1) * Math.max(0.7, 1 - sizePenalty * 0.05)).toFixed(3)));
  return {
    ...spec,
    level: depth + 1,
    sizeTier: sizeTier.id,
    maxHp,
    atk,
    atkLo,
    atkHi,
    def,
    acc,
    eva,
    spd,
  };
}

function renderMonsterEditorPreview() {
  if (!monsterEditorPreviewEl) return;
  const id = normalizeMonsterEditorId(monsterEditorUi.selectedId ?? "");
  if (!id || !monsterEditorUi.workingMonsters[id]) {
    monsterEditorPreviewEl.textContent = "Select a monster to preview depth-scaled stats.";
    return;
  }

  const rawDepth = Number(monsterEditorPreviewDepthInputEl?.value ?? monsterEditorUi.previewDepth ?? 1);
  const depth = Math.max(0, Math.floor(Number.isFinite(rawDepth) ? rawDepth : 1));
  monsterEditorUi.previewDepth = depth;
  if (monsterEditorPreviewDepthInputEl && Number(monsterEditorPreviewDepthInputEl.value) !== depth) {
    monsterEditorPreviewDepthInputEl.value = `${depth}`;
  }
  const stats = monsterEditorPreviewStatsForDepth(id, depth);
  const rule = monsterEditorRuleById(id);
  const spawnSummary = rule
    ? `Spawn depth ${rule.minDepth}-${Number.isFinite(rule.maxDepth) ? rule.maxDepth : "∞"} · weight ${rule.baseWeight} · ramp ${rule.rampFactor >= 0 ? "+" : ""}${rule.rampFactor}`
    : "Spawn disabled";

  monsterEditorPreviewEl.innerHTML = "";
  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.textContent = `${stats.name ?? titleFromId(id)} (${id})`;
  const sub = document.createElement("div");
  sub.style.opacity = "0.84";
  sub.textContent = `Depth ${depth} · level ${stats.level} · size ${stats.sizeTier} · ${spawnSummary}`;
  const statsLineA = document.createElement("div");
  statsLineA.textContent = `HP ${stats.maxHp} · ATK ${stats.atkLo}-${stats.atkHi} · DEF ${stats.def} · ACC ${stats.acc} · EVA ${stats.eva} · SPD ${stats.spd}`;
  const statsLineB = document.createElement("div");
  statsLineB.style.opacity = "0.82";
  statsLineB.textContent = `XP ${Math.max(1, Math.floor(stats.xp ?? 1))} · AI ${stats.ai ? stats.ai : "(default melee_chase)"}${stats.aliasOf ? ` · alias of ${stats.aliasOf}` : ""}`;
  monsterEditorPreviewEl.appendChild(title);
  monsterEditorPreviewEl.appendChild(sub);
  monsterEditorPreviewEl.appendChild(statsLineA);
  monsterEditorPreviewEl.appendChild(statsLineB);
}

function renderMonsterEditorList() {
  if (!monsterEditorListEl) return;
  const entries = monsterEditorListEntries();
  const signature = `${monsterEditorUi.loading ? 1 : 0}|${monsterEditorUi.selectedId}|${monsterEditorUi.dirty ? 1 : 0}|${entries
    .map((entry) => {
      const maxDepth = Number.isFinite(entry.rule?.maxDepth) ? entry.rule.maxDepth : "";
      return `${entry.id}|${entry.spec.name ?? ""}|${entry.spec.baseHp ?? 0}|${entry.spec.baseAtk ?? 0}|${entry.spec.xp ?? 0}|${entry.rule ? `${entry.rule.minDepth}|${maxDepth}|${entry.rule.baseWeight}|${entry.rule.rampFactor}` : "off"}`;
    })
    .join("::")}`;
  if (signature === monsterEditorSignature && monsterEditorUi.open) return;
  monsterEditorSignature = signature;

  monsterEditorListEl.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "spriteEditorEmpty";
    empty.textContent = "(no monsters match the current filter)";
    monsterEditorListEl.appendChild(empty);
    updateMonsterEditorControlState();
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "monsterEditorListBtn";
    if (entry.id === monsterEditorUi.selectedId) row.classList.add("active");
    row.disabled = monsterEditorUi.loading;
    row.addEventListener("click", () => {
      if (monsterEditorUi.selectedId === entry.id) return;
      monsterEditorUi.selectedId = entry.id;
      monsterEditorSignature = "";
      populateMonsterEditorForm();
      renderMonsterEditorList();
      renderMonsterEditorPreview();
      refreshMonsterEditorDirtyState();
    });
    const name = document.createElement("div");
    name.className = "monsterEditorListName";
    name.textContent = `${entry.spec.name ?? titleFromId(entry.id)}`;
    const sub = document.createElement("div");
    sub.className = "monsterEditorListSub";
    const rule = entry.rule;
    const spawnText = rule
      ? `spawn ${rule.minDepth}-${Number.isFinite(rule.maxDepth) ? rule.maxDepth : "∞"} w=${rule.baseWeight} r=${rule.rampFactor >= 0 ? "+" : ""}${rule.rampFactor}`
      : "spawn disabled";
    sub.textContent = `${entry.id} · HP ${entry.spec.baseHp ?? 0} · ATK ${entry.spec.baseAtk ?? 0} · XP ${entry.spec.xp ?? 0} · ${spawnText}`;
    row.appendChild(name);
    row.appendChild(sub);
    monsterEditorListEl.appendChild(row);
  }
  updateMonsterEditorControlState();
}

function monsterEditorResetWorkingFromRuntime() {
  monsterEditorUi.baselineMonsters = cloneMonsterTypeMapForEditor(MONSTER_TYPES);
  monsterEditorUi.baselineSpawnRules = cloneMonsterSpawnRulesForEditor(MONSTER_SPAWN_RULES);
  monsterEditorUi.workingMonsters = cloneMonsterTypeMapForEditor(monsterEditorUi.baselineMonsters);
  monsterEditorUi.workingSpawnRules = cloneMonsterSpawnRulesForEditor(monsterEditorUi.baselineSpawnRules);
  const ids = Object.keys(monsterEditorUi.workingMonsters).sort();
  if (!ids.includes(monsterEditorUi.selectedId)) {
    monsterEditorUi.selectedId = ids[0] ?? "";
  }
  monsterEditorSignature = "";
  populateMonsterEditorForm();
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  refreshMonsterEditorDirtyState();
}

function readNumberInputValue(el, fallback = 0) {
  const value = Number(el?.value ?? "");
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function readOptionalIntInputValue(el) {
  const raw = String(el?.value ?? "").trim();
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.floor(value);
}

function readOptionalFloatInputValue(el) {
  const raw = String(el?.value ?? "").trim();
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

function syncMonsterEditorFromForm() {
  if (monsterEditorUi.suspendFormEvents || monsterEditorUi.loading) return;
  const id = normalizeMonsterEditorId(monsterEditorUi.selectedId ?? "");
  if (!id) return;
  const prior = monsterEditorUi.workingMonsters[id] ?? MONSTER_TYPES[id] ?? { id, name: titleFromId(id) };

  const raw = {
    id,
    name: String(monsterEditNameEl?.value ?? prior.name ?? titleFromId(id)),
    glyph: String(monsterEditGlyphEl?.value ?? prior.glyph ?? "").slice(0, 2),
    aliasOf: String(monsterEditAliasOfEl?.value ?? "").trim(),
    ai: String(monsterEditAiEl?.value ?? "").trim(),
    sizeGrowth: !!monsterEditSizeGrowthEl?.checked,
    baseHp: readNumberInputValue(monsterEditBaseHpEl, prior.baseHp ?? 18),
    baseAtk: readNumberInputValue(monsterEditBaseAtkEl, prior.baseAtk ?? 6),
    baseDef: readNumberInputValue(monsterEditBaseDefEl, prior.baseDef ?? 1),
    baseAcc: readNumberInputValue(monsterEditBaseAccEl, prior.baseAcc ?? 70),
    baseEva: readNumberInputValue(monsterEditBaseEvaEl, prior.baseEva ?? 8),
    spd: readNumberInputValue(monsterEditSpdEl, prior.spd ?? 1),
    xp: readNumberInputValue(monsterEditXpEl, prior.xp ?? 3),
  };

  const intOptionals = [
    ["range", monsterEditRangeEl],
    ["cdTurns", monsterEditCdTurnsEl],
    ["preferredRange", monsterEditPreferredRangeEl],
    ["blinkRange", monsterEditBlinkRangeEl],
    ["summonCooldownTurns", monsterEditSummonCooldownTurnsEl],
    ["poisonOnHitTurns", monsterEditPoisonOnHitTurnsEl],
    ["poisonOnHitDmg", monsterEditPoisonOnHitDmgEl],
    ["slowTurns", monsterEditSlowTurnsEl],
    ["deathCloudTurns", monsterEditDeathCloudTurnsEl],
    ["deathCloudRadius", monsterEditDeathCloudRadiusEl],
    ["deathCloudDmg", monsterEditDeathCloudDmgEl],
  ];
  for (const [key, field] of intOptionals) {
    const value = readOptionalIntInputValue(field);
    if (value !== null) raw[key] = value;
  }
  const floatOptionals = [
    ["poisonOnHitChance", monsterEditPoisonOnHitChanceEl],
    ["slowOnHitChance", monsterEditSlowOnHitChanceEl],
    ["stunOnHitChance", monsterEditStunOnHitChanceEl],
    ["knockbackOnHitChance", monsterEditKnockbackOnHitChanceEl],
    ["backstabDamageMult", monsterEditBackstabDamageMultEl],
    ["meleeReflectPct", monsterEditMeleeReflectPctEl],
  ];
  for (const [key, field] of floatOptionals) {
    const value = readOptionalFloatInputValue(field);
    if (value !== null) raw[key] = value;
  }
  if (monsterEditImmunePoisonEl?.checked) raw.immunePoison = true;

  monsterEditorUi.workingMonsters[id] = normalizeMonsterEditorSpec(id, raw);

  if (monsterEditSpawnEnabledEl?.checked) {
    const maxDepthRaw = String(monsterEditSpawnMaxDepthEl?.value ?? "").trim();
    upsertMonsterEditorRule({
      id,
      minDepth: readNumberInputValue(monsterEditSpawnMinDepthEl, 0),
      maxDepth: maxDepthRaw === "" ? null : readNumberInputValue(monsterEditSpawnMaxDepthEl, 0),
      baseWeight: readNumberInputValue(monsterEditSpawnBaseWeightEl, 1),
      rampFactor: readNumberInputValue(monsterEditSpawnRampFactorEl, 0),
    });
  } else {
    removeMonsterEditorRule(id);
  }
  setMonsterEditorSpawnFieldState();
  monsterEditorSignature = "";
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  refreshMonsterEditorDirtyState();
}

async function monsterEditorApiRequest(method = "GET", body = null) {
  const headers = {
    Accept: "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
  const init = { method, credentials: "same-origin", headers, cache: "no-store" };
  if (body !== null) {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = saveApiCsrfToken;
    init.body = JSON.stringify(body);
  }
  let resp = null;
  try {
    resp = await fetch(withCacheBust("./index.php?api=monsters"), init);
  } catch {
    throw new Error("Network error while contacting the monster API.");
  }
  let data = null;
  try { data = await resp.json(); } catch {}
  if (!resp.ok || !data?.ok) {
    const msg = data?.error ?? `Monster request failed (${resp.status})`;
    throw new Error(msg);
  }
  return data;
}

async function refreshMonsterEditorFromServer(quiet = false) {
  if (!canUseAdminControls()) return false;
  setMonsterEditorLoading(true);
  if (!quiet) setMonsterEditorStatus("Refreshing monster data...", false);
  try {
    const data = await monsterEditorApiRequest("GET", null);
    applyMonsterEditorPayload(data);
    monsterEditorResetWorkingFromRuntime();
    if (!quiet) setMonsterEditorStatus("Monster data refreshed.", false);
    return true;
  } catch (err) {
    if (!quiet) setMonsterEditorStatus(err?.message ?? "Could not refresh monster data.", true);
    return false;
  } finally {
    setMonsterEditorLoading(false);
  }
}

function buildMonsterEditorSavePayload() {
  return {
    version: Math.max(1, Math.floor(Number(monsterEditorState.version) || 1)),
    monsters: cloneMonsterTypeMapForEditor(monsterEditorUi.workingMonsters),
    spawn_rules: cloneMonsterSpawnRulesForEditor(monsterEditorUi.workingSpawnRules),
    updated_at: new Date().toISOString(),
  };
}

async function saveMonsterEditorToServer() {
  if (!canUseAdminControls()) return false;
  if (!monsterEditorUi.dirty) {
    setMonsterEditorStatus("No changes to save.", false);
    return true;
  }
  setMonsterEditorLoading(true);
  setMonsterEditorStatus("Saving monster data...", false);
  try {
    const payload = buildMonsterEditorSavePayload();
    const data = await monsterEditorApiRequest("POST", {
      action: "save",
      version: payload.version,
      monsters: payload.monsters,
      spawn_rules: payload.spawn_rules,
      updated_at: payload.updated_at,
    });
    applyMonsterEditorPayload(data);
    monsterEditorResetWorkingFromRuntime();
    setMonsterEditorStatus("Monster data saved.", false);
    return true;
  } catch (err) {
    setMonsterEditorStatus(err?.message ?? "Could not save monster data.", true);
    return false;
  } finally {
    setMonsterEditorLoading(false);
  }
}

function promptMonsterEditorId(promptText, defaultValue = "") {
  const raw = window.prompt(promptText, defaultValue);
  if (raw === null) return null;
  const id = normalizeMonsterEditorId(raw);
  if (!id) {
    setMonsterEditorStatus("Monster id must match [a-z0-9_] and be at most 80 chars.", true);
    return null;
  }
  return id;
}

function createMonsterEditorFromTemplate() {
  const suggested = "new_monster";
  const id = promptMonsterEditorId("Enter new monster id:", suggested);
  if (!id) return false;
  if (monsterEditorUi.workingMonsters[id]) {
    setMonsterEditorStatus(`Monster id '${id}' already exists.`, true);
    return false;
  }
  const selectedId = normalizeMonsterEditorId(monsterEditorUi.selectedId ?? "");
  const template = (selectedId && monsterEditorUi.workingMonsters[selectedId])
    ? monsterEditorUi.workingMonsters[selectedId]
    : (monsterEditorUi.workingMonsters.rat ?? MONSTER_TYPES.rat);
  const newSpec = normalizeMonsterEditorSpec(id, {
    ...template,
    id,
    name: titleFromId(id),
    glyph: id.slice(0, 1) || (template?.glyph ?? "m"),
    aliasOf: "",
  });
  monsterEditorUi.workingMonsters[id] = newSpec;

  const baseDepth = Math.max(0, Math.floor(monsterEditorUi.previewDepth ?? 0));
  const templateRule = selectedId ? monsterEditorRuleById(selectedId) : null;
  if (templateRule) {
    upsertMonsterEditorRule({ ...templateRule, id });
  } else {
    upsertMonsterEditorRule({
      id,
      minDepth: baseDepth,
      maxDepth: null,
      baseWeight: 1,
      rampFactor: 0,
    });
  }
  monsterEditorUi.selectedId = id;
  monsterEditorSignature = "";
  populateMonsterEditorForm();
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  refreshMonsterEditorDirtyState();
  setMonsterEditorStatus(`Created '${id}'.`, false);
  return true;
}

function duplicateSelectedMonsterEditorEntry() {
  const sourceId = normalizeMonsterEditorId(monsterEditorUi.selectedId ?? "");
  if (!sourceId || !monsterEditorUi.workingMonsters[sourceId]) {
    setMonsterEditorStatus("Select a monster to duplicate.", true);
    return false;
  }
  const id = promptMonsterEditorId("Enter duplicate monster id:", `${sourceId}_copy`);
  if (!id) return false;
  if (monsterEditorUi.workingMonsters[id]) {
    setMonsterEditorStatus(`Monster id '${id}' already exists.`, true);
    return false;
  }
  const sourceSpec = monsterEditorUi.workingMonsters[sourceId];
  monsterEditorUi.workingMonsters[id] = normalizeMonsterEditorSpec(id, {
    ...sourceSpec,
    id,
    name: `${sourceSpec.name ?? titleFromId(sourceId)} Copy`,
  });
  const sourceRule = monsterEditorRuleById(sourceId);
  if (sourceRule) {
    upsertMonsterEditorRule({ ...sourceRule, id });
  }
  monsterEditorUi.selectedId = id;
  monsterEditorSignature = "";
  populateMonsterEditorForm();
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  refreshMonsterEditorDirtyState();
  setMonsterEditorStatus(`Duplicated '${sourceId}' to '${id}'.`, false);
  return true;
}

function deleteSelectedMonsterEditorEntry() {
  const id = normalizeMonsterEditorId(monsterEditorUi.selectedId ?? "");
  if (!id || !monsterEditorUi.workingMonsters[id]) {
    setMonsterEditorStatus("Select a monster to delete.", true);
    return false;
  }
  if (id === "rat") {
    setMonsterEditorStatus("The 'rat' baseline cannot be deleted.", true);
    return false;
  }
  const confirmed = window.confirm(`Delete monster '${id}' from the working set?`);
  if (!confirmed) return false;
  delete monsterEditorUi.workingMonsters[id];
  removeMonsterEditorRule(id);
  const ids = Object.keys(monsterEditorUi.workingMonsters).sort();
  monsterEditorUi.selectedId = ids[0] ?? "";
  monsterEditorSignature = "";
  populateMonsterEditorForm();
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  refreshMonsterEditorDirtyState();
  setMonsterEditorStatus(`Deleted '${id}'.`, false);
  return true;
}

function exportMonsterEditorPayload() {
  const payload = {
    version: Math.max(1, Math.floor(Number(monsterEditorState.version) || 1)),
    monsters: cloneMonsterTypeMapForEditor(monsterEditorUi.workingMonsters),
    spawn_rules: cloneMonsterSpawnRulesForEditor(monsterEditorUi.workingSpawnRules),
    updated_at: new Date().toISOString(),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([`${json}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `monster-editor-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setMonsterEditorStatus("Exported monster editor payload.", false);
}

async function importMonsterEditorPayloadFromFile(file) {
  if (!file) return false;
  let parsed = null;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    setMonsterEditorStatus("Could not parse monster JSON file.", true);
    return false;
  }
  const normalized = normalizeMonsterEditorPayload(parsed);
  const importedMonsters = cloneMonsterTypeMapForEditor(normalized.monsters);
  const importedRules = cloneMonsterSpawnRulesForEditor(normalized.spawnRules);
  if (!Object.keys(importedMonsters).length) {
    setMonsterEditorStatus("Import payload contains no monsters.", true);
    return false;
  }
  monsterEditorUi.workingMonsters = importedMonsters;
  monsterEditorUi.workingSpawnRules = importedRules;
  if (!monsterEditorUi.workingMonsters[monsterEditorUi.selectedId]) {
    monsterEditorUi.selectedId = Object.keys(monsterEditorUi.workingMonsters).sort()[0] ?? "";
  }
  monsterEditorSignature = "";
  populateMonsterEditorForm();
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  refreshMonsterEditorDirtyState();
  setMonsterEditorStatus("Imported monster payload into working set. Save to apply.", false);
  return true;
}

async function openMonsterEditorOverlay() {
  if (!canUseAdminControls()) return false;
  setMonsterEditorOverlayOpen(true);
  if (!Object.keys(monsterEditorUi.baselineMonsters ?? {}).length) {
    monsterEditorResetWorkingFromRuntime();
  }
  await refreshMonsterEditorFromServer(false);
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  return true;
}

async function spriteApiRequest(method = "GET", body = null) {
  const headers = {
    Accept: "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
  const init = { method, credentials: "same-origin", headers, cache: "no-store" };
  if (body !== null) {
    headers["X-CSRF-Token"] = saveApiCsrfToken;
    init.body = body;
  }
  let resp = null;
  try {
    resp = await fetch(withCacheBust("./index.php?api=sprites"), init);
  } catch {
    throw new Error("Network error while contacting the sprite API.");
  }
  let data = null;
  try { data = await resp.json(); } catch {}
  if (!resp.ok || !data?.ok) {
    let msg = data?.error ?? "";
    if (!msg && resp.status === 413) msg = "Sprite upload rejected as too large by the server (413).";
    if (!msg) msg = `Sprite request failed (${resp.status})`;
    throw new Error(msg);
  }
  return data;
}

async function refreshSpriteOverridesFromServer(quiet = false) {
  try {
    const data = await spriteApiRequest("GET", null);
    const maxUploadBytes = Math.floor(Number(data?.max_upload_bytes) || spriteEditorUi.maxUploadBytes || 25_000_000);
    spriteEditorUi.maxUploadBytes = Math.max(1_000_000, maxUploadBytes);
    applySpritePayload(data);
    if (infoUi.open) renderInfoOverlay(game);
    if (spriteEditorUi.open) renderSpriteEditorList();
    if (!quiet && canUseAdminControls()) {
      setSpriteEditorStatus("Sprite data refreshed.", false);
    }
    return true;
  } catch (err) {
    if (!quiet && canUseAdminControls()) {
      setSpriteEditorStatus(err?.message ?? "Could not refresh sprite data.", true);
    }
    return false;
  }
}

function formatBytesCompact(bytes) {
  const n = Math.max(0, Math.floor(Number(bytes) || 0));
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the selected image."));
    };
    img.src = url;
  });
}

function verifySpriteAssetUrlLoad(url) {
  return new Promise((resolve, reject) => {
    const src = String(url || "").trim();
    if (!src) {
      reject(new Error("Sprite URL is missing after upload."));
      return;
    }
    const img = new Image();
    img.onload = () => {
      if ((img.naturalWidth || 0) <= 0 || (img.naturalHeight || 0) <= 0) {
        reject(new Error("Uploaded sprite loaded with invalid dimensions."));
        return;
      }
      resolve(true);
    };
    img.onerror = () => reject(new Error("Uploaded sprite could not be loaded from the server."));
    img.src = withCacheBust(src);
  });
}

function canvasToBlobAsync(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode compressed sprite."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function imageFileHasVisiblePixels(file) {
  const img = await loadImageElementFromFile(file);
  const sampleW = Math.max(1, Math.min(128, Math.floor(img.naturalWidth || img.width || 1)));
  const sampleH = Math.max(1, Math.min(128, Math.floor(img.naturalHeight || img.height || 1)));
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const cx = canvas.getContext("2d", { alpha: true });
  if (!cx) return true;
  cx.clearRect(0, 0, sampleW, sampleH);
  cx.drawImage(img, 0, 0, sampleW, sampleH);
  const pixels = cx.getImageData(0, 0, sampleW, sampleH).data;
  if (!pixels.length) return false;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] ?? 0;
    if (a > 0) return true;
  }
  return false;
}

async function compressSpriteUploadFile(file, targetBytes) {
  if (!Number.isFinite(file?.size)) return file;
  const img = await loadImageElementFromFile(file);
  const srcW = Math.max(1, Math.floor(img.naturalWidth || img.width || 1));
  const srcH = Math.max(1, Math.floor(img.naturalHeight || img.height || 1));
  const canvas = document.createElement("canvas");
  const cx = canvas.getContext("2d", { alpha: true });
  if (!cx) throw new Error("Could not create image compression canvas.");

  const baseName = String(file.name || "sprite").replace(/\.[^.]+$/, "") || "sprite";
  let bestFile = null;
  let bestBytes = Number.POSITIVE_INFINITY;
  let bestSizeDiff = Number.POSITIVE_INFINITY;
  const failures = [];

  async function encodeCandidate(drawW, drawH, type, quality = 0.82) {
    try {
      canvas.width = drawW;
      canvas.height = drawH;
      cx.clearRect(0, 0, drawW, drawH);
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = "high";
      cx.drawImage(img, 0, 0, drawW, drawH);
      const blob = await canvasToBlobAsync(canvas, type, quality);
      const ext = type === "image/png" ? "png" : (type === "image/jpeg" ? "jpg" : "webp");
      const out = new File([blob], `${baseName}.${ext}`, { type });
      const hasVisiblePixels = await imageFileHasVisiblePixels(out);
      if (!hasVisiblePixels) {
        failures.push(`${type}:blank`);
        return null;
      }
      return out;
    } catch (err) {
      failures.push(`${type}:error`);
      return null;
    }
  }

  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const quality = clamp(0.9 - i * 0.07, 0.38, 0.92);
    const downscaleFactor = Math.pow(0.88, Math.floor(i / 2));
    const drawW = Math.max(64, Math.floor(srcW * downscaleFactor));
    const drawH = Math.max(64, Math.floor(srcH * downscaleFactor));

    // Try WEBP first for size efficiency, then PNG/JPEG fallbacks.
    let outFile = await encodeCandidate(drawW, drawH, "image/webp", quality);
    if (!outFile) {
      outFile = await encodeCandidate(drawW, drawH, "image/png", quality);
    }
    if (!outFile) {
      outFile = await encodeCandidate(drawW, drawH, "image/jpeg", quality);
    }
    if (!outFile) continue;

    const sizeDiff = Math.abs(outFile.size - targetBytes);
    if (!bestFile || sizeDiff < bestSizeDiff || outFile.size < bestBytes) {
      bestFile = outFile;
      bestBytes = outFile.size;
      bestSizeDiff = sizeDiff;
    }
    if (outFile.size <= targetBytes) {
      bestFile = outFile;
      break;
    }
  }

  if (!bestFile) {
    const failureSummary = failures.length ? failures.join(", ") : "unknown";
    throw new Error(`Could not compress image. Attempts failed: ${failureSummary}`);
  }
  if (file.size <= targetBytes && bestFile.size >= file.size) return file;
  return bestFile;
}

function updateSpriteEditorFilterControls() {
  if (!spriteFilterCategoryEl || !spriteFilterArmorTypeEl || !spriteFilterMetalTypeEl) return;
  const objects = Array.isArray(spriteEditorUi.objects) ? spriteEditorUi.objects : [];

  const categories = [...new Set(objects.map((entry) => entry.category).filter(Boolean))]
    .sort((a, b) => (SPRITE_CATEGORY_SORT[a] ?? 99) - (SPRITE_CATEGORY_SORT[b] ?? 99));
  const prevCategory = spriteEditorUi.filterCategory;
  spriteFilterCategoryEl.innerHTML = "";
  const allCategory = document.createElement("option");
  allCategory.value = "all";
  allCategory.textContent = "All types";
  spriteFilterCategoryEl.appendChild(allCategory);
  for (const category of categories) {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = SPRITE_CATEGORY_LABELS[category] ?? category;
    spriteFilterCategoryEl.appendChild(opt);
  }
  spriteEditorUi.filterCategory = categories.includes(prevCategory) ? prevCategory : "all";
  spriteFilterCategoryEl.value = spriteEditorUi.filterCategory;

  const armorTypes = [...new Set(
    objects
      .filter((entry) => entry.category === "armor")
      .map((entry) => entry.armorType)
      .filter((slot) => !!slot)
  )].sort();
  const prevArmor = spriteEditorUi.filterArmorType;
  spriteFilterArmorTypeEl.innerHTML = "";
  const allArmor = document.createElement("option");
  allArmor.value = "all";
  allArmor.textContent = "All armor";
  spriteFilterArmorTypeEl.appendChild(allArmor);
  for (const slot of armorTypes) {
    const opt = document.createElement("option");
    opt.value = slot;
    opt.textContent = ARMOR_SLOT_LABELS[slot] ?? titleFromId(slot);
    spriteFilterArmorTypeEl.appendChild(opt);
  }
  spriteEditorUi.filterArmorType = armorTypes.includes(prevArmor) ? prevArmor : "all";
  spriteFilterArmorTypeEl.value = spriteEditorUi.filterArmorType;

  const metalTypes = [...new Set(
    objects
      .filter((entry) => entry.category === "weapon" || entry.category === "armor")
      .map((entry) => String(entry.metalType ?? ""))
      .filter((metal) => !!metal)
  )];
  metalTypes.sort((a, b) => {
    const ai = materialTierIndexFromId(a);
    const bi = materialTierIndexFromId(b);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
  const prevMetal = spriteEditorUi.filterMetalType;
  spriteFilterMetalTypeEl.innerHTML = "";
  const allMetal = document.createElement("option");
  allMetal.value = "all";
  allMetal.textContent = "All metals";
  spriteFilterMetalTypeEl.appendChild(allMetal);
  for (const metal of metalTypes) {
    const opt = document.createElement("option");
    opt.value = metal;
    opt.textContent = materialLabel(metal);
    spriteFilterMetalTypeEl.appendChild(opt);
  }
  spriteEditorUi.filterMetalType = metalTypes.includes(prevMetal) ? prevMetal : "all";
  spriteFilterMetalTypeEl.value = spriteEditorUi.filterMetalType;

  if (spriteFilterSourceEl) {
    const src = spriteEditorUi.filterSource;
    spriteEditorUi.filterSource = src === "has" || src === "missing" ? src : "all";
    spriteFilterSourceEl.value = spriteEditorUi.filterSource;
  }
}

function filteredSpriteEditorObjects() {
  const sourceFilter = spriteEditorUi.filterSource;
  const categoryFilter = spriteEditorUi.filterCategory;
  const armorTypeFilter = spriteEditorUi.filterArmorType;
  const metalTypeFilter = spriteEditorUi.filterMetalType;
  const query = (spriteFilterSearchEl?.value ?? "").trim().toLowerCase();

  return (spriteEditorUi.objects ?? []).filter((entry) => {
    if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
    if (armorTypeFilter !== "all") {
      if (entry.category !== "armor") return false;
      if (entry.armorType !== armorTypeFilter) return false;
    }
    if (metalTypeFilter !== "all") {
      if (entry.category !== "weapon" && entry.category !== "armor") return false;
      if (entry.metalType !== metalTypeFilter) return false;
    }
    const display = resolveSpriteDisplayForEntry(entry);
    if (sourceFilter === "has" && !display.hasSprite) return false;
    if (sourceFilter === "missing" && display.hasSprite) return false;
    if (!query) return true;
    const haystack = `${entry.name} ${entry.objectId} ${entry.spriteId}`.toLowerCase();
    return haystack.includes(query);
  });
}

function pruneSpriteEditorSelection() {
  const validIds = new Set(
    (spriteEditorUi.objects ?? [])
      .map((entry) => String(entry?.spriteId ?? ""))
      .filter(Boolean)
  );
  for (const spriteId of spriteEditorUi.selectedSpriteIds) {
    if (!validIds.has(spriteId)) spriteEditorUi.selectedSpriteIds.delete(spriteId);
  }
}

function updateSpriteEditorBulkControls(entries = []) {
  const visibleIds = [...new Set(entries.map((entry) => String(entry?.spriteId ?? "")).filter(Boolean))];
  const selectedVisibleCount = visibleIds.filter((id) => spriteEditorUi.selectedSpriteIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const selectedTotal = spriteEditorUi.selectedSpriteIds.size;

  if (spriteSelectAllEl) {
    spriteSelectAllEl.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
    spriteSelectAllEl.checked = allVisibleSelected;
    spriteSelectAllEl.disabled = spriteEditorUi.loading || visibleIds.length === 0;
  }
  if (spriteBulkSetSizeBtnEl) {
    spriteBulkSetSizeBtnEl.textContent = selectedTotal > 0 ? `Set Selected (${selectedTotal})` : "Set Selected";
    spriteBulkSetSizeBtnEl.disabled = spriteEditorUi.loading || selectedTotal === 0;
  }
  if (spriteBulkScaleInputEl) {
    spriteBulkScaleInputEl.disabled = spriteEditorUi.loading;
  }
}

function isSpriteEditorOverlayOpen() {
  return !!spriteEditorOverlayEl?.classList.contains("show");
}

function closeSpriteEditorOverlay() {
  spriteEditorUi.open = false;
  if (!spriteEditorOverlayEl) return;
  spriteEditorOverlayEl.classList.remove("show");
  spriteEditorOverlayEl.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function setSpriteEditorOverlayOpen(open) {
  if (!spriteEditorOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
    closeShopOverlay();
    closeSaveGameOverlay();
    closeInfoOverlay();
    closeMonsterEditorOverlay();
    if (isNewDungeonConfirmOpen()) resolveNewDungeonConfirm(false);
  }
  spriteEditorUi.open = show;
  spriteEditorOverlayEl.classList.toggle("show", show);
  spriteEditorOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) spriteEditorCloseBtnEl?.focus();
}

function isSpawnableSpriteEditorObject(entry) {
  const objectId = String(entry?.objectId ?? "");
  return !!ITEM_TYPES[objectId] || !!MONSTER_TYPES[objectId];
}

function spawnSpriteEditorObject(state, entry) {
  if (!canUseAdminControls()) return false;
  if (!state || !entry) return false;
  const objectId = String(entry.objectId ?? "");
  const key = ITEM_TYPES[objectId]
    ? `item:${objectId}`
    : (MONSTER_TYPES[objectId] ? `monster:${objectId}` : "");
  if (!key) {
    setSpriteEditorStatus(`Spawn is not supported for ${objectId}.`, true);
    return false;
  }
  const ok = spawnDebugObjectByKey(state, key);
  if (ok) setSpriteEditorStatus(`Spawned ${entry.name} north of player.`, false);
  else setSpriteEditorStatus(`Could not spawn ${entry.name}.`, true);
  return ok;
}

function renderSpriteEditorList() {
  if (!spriteEditorListEl) return;
  pruneSpriteEditorSelection();
  const entries = filteredSpriteEditorObjects();
  const selectedSig = Array.from(spriteEditorUi.selectedSpriteIds).sort().join("|");
  const signature = `${spriteEditorUi.loading ? 1 : 0}|${entries
    .map((entry) => {
      const display = resolveSpriteDisplayForEntry(entry);
      const scale = spriteScalePercentForId(entry.spriteId);
      return `${entry.objectId}|${entry.spriteId}|${display.spriteId}|${display.sourceType}|${display.hasSprite ? 1 : 0}|${scale}`;
    })
    .join("::")}|${selectedSig}`;
  if (signature === spriteEditorSignature && spriteEditorUi.open) return;
  spriteEditorSignature = signature;

  spriteEditorListEl.innerHTML = "";
  updateSpriteEditorBulkControls(entries);
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "spriteEditorEmpty";
    empty.textContent = "(no objects match the current filters)";
    spriteEditorListEl.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const display = resolveSpriteDisplayForEntry(entry);
    const row = document.createElement("div");
    row.className = "spriteEditorRow";
    const selected = spriteEditorUi.selectedSpriteIds.has(entry.spriteId);

    const selectCell = document.createElement("label");
    selectCell.className = "spriteSelectCell";
    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.className = "spriteSelectInput";
    selectInput.checked = selected;
    selectInput.disabled = spriteEditorUi.loading;
    selectInput.addEventListener("change", () => {
      if (selectInput.checked) spriteEditorUi.selectedSpriteIds.add(entry.spriteId);
      else spriteEditorUi.selectedSpriteIds.delete(entry.spriteId);
      spriteEditorSignature = "";
      renderSpriteEditorList();
    });
    selectCell.appendChild(selectInput);

    const preview = document.createElement("div");
    preview.className = "spritePreview";
    if (display.hasSprite && display.src) {
      const img = document.createElement("img");
      img.src = display.src;
      img.alt = `${entry.name} sprite`;
      preview.appendChild(img);
    } else {
      const glyphInfo = placeholderGlyphForObject(entry);
      const glyph = document.createElement("span");
      glyph.className = "spritePreviewGlyph";
      glyph.textContent = glyphInfo.g ?? "?";
      glyph.style.color = glyphInfo.c ?? "#d5dfef";
      preview.appendChild(glyph);
    }

    const meta = document.createElement("div");
    meta.className = "spriteRowMeta";
    const name = document.createElement("div");
    name.className = "spriteRowName";
    name.textContent = entry.name;
    const sub = document.createElement("div");
    sub.className = "spriteRowSub";
    const scalePercent = spriteScalePercentForId(entry.spriteId);
    const armorInfo = entry.category === "armor" && entry.armorType
      ? ` | armor type: ${ARMOR_SLOT_LABELS[entry.armorType] ?? entry.armorType}`
      : "";
    const fallbackInfo = (!display.hasSprite && entry.fallbackSpriteId)
      ? ` | fallback: ${entry.fallbackSpriteId}`
      : "";
    sub.textContent = `${SPRITE_CATEGORY_LABELS[entry.category] ?? entry.category} | object: ${entry.objectId} | sprite: ${entry.spriteId}${armorInfo}${fallbackInfo} | source: ${display.sourceText} | world size: ${scalePercent}%`;
    meta.appendChild(name);
    meta.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "spriteRowActions";
    const spawnBtn = document.createElement("button");
    spawnBtn.type = "button";
    spawnBtn.textContent = "Spawn";
    spawnBtn.disabled = spriteEditorUi.loading || !canUseAdminControls() || !isSpawnableSpriteEditorObject(entry);
    spawnBtn.addEventListener("click", () => {
      if (!game) return;
      void spawnSpriteEditorObject(game, entry);
    });
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = "image/*";
    uploadInput.className = "spriteUploadInput";

    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.textContent = "Upload";
    uploadBtn.disabled = spriteEditorUi.loading;
    uploadBtn.addEventListener("click", () => {
      if (spriteEditorUi.loading) return;
      uploadInput.click();
    });
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files?.[0] ?? null;
      uploadInput.value = "";
      if (!file) return;
      void uploadSpriteForEntry(entry, file);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "spriteDeleteBtn";
    deleteBtn.textContent = "Delete";
    const hasDirectOverride = !!spriteOverrideState.overrides[entry.spriteId];
    deleteBtn.disabled = spriteEditorUi.loading || !hasDirectOverride;
    deleteBtn.addEventListener("click", () => {
      if (!hasDirectOverride) return;
      void deleteSpriteForEntry(entry);
    });

    const scaleGroup = document.createElement("div");
    scaleGroup.className = "spriteScaleGroup";
    const scaleInput = document.createElement("input");
    scaleInput.type = "number";
    scaleInput.min = "25";
    scaleInput.max = "300";
    scaleInput.step = "1";
    scaleInput.className = "spriteScaleInput";
    scaleInput.value = `${scalePercent}`;
    scaleInput.disabled = spriteEditorUi.loading;
    const scaleSuffix = document.createElement("span");
    scaleSuffix.className = "spriteScaleSuffix";
    scaleSuffix.textContent = "%";
    scaleGroup.appendChild(scaleInput);
    scaleGroup.appendChild(scaleSuffix);

    const setScaleBtn = document.createElement("button");
    setScaleBtn.type = "button";
    setScaleBtn.textContent = "Set Size";
    setScaleBtn.disabled = spriteEditorUi.loading;
    setScaleBtn.addEventListener("click", () => {
      const raw = Number(scaleInput.value);
      if (!Number.isFinite(raw)) {
        setSpriteEditorStatus("World size must be a number between 25 and 300.", true);
        return;
      }
      const value = clamp(Math.floor(raw), 25, 300);
      if (value !== raw) scaleInput.value = `${value}`;
      void setSpriteScaleForEntry(entry, value);
    });

    const resetScaleBtn = document.createElement("button");
    resetScaleBtn.type = "button";
    resetScaleBtn.textContent = "Reset Size";
    resetScaleBtn.disabled = spriteEditorUi.loading || scalePercent === 100;
    resetScaleBtn.addEventListener("click", () => {
      scaleInput.value = "100";
      void setSpriteScaleForEntry(entry, 100);
    });

    actions.appendChild(spawnBtn);
    actions.appendChild(uploadBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(scaleGroup);
    actions.appendChild(setScaleBtn);
    actions.appendChild(resetScaleBtn);
    actions.appendChild(uploadInput);

    row.appendChild(selectCell);
    row.appendChild(preview);
    row.appendChild(meta);
    row.appendChild(actions);
    spriteEditorListEl.appendChild(row);
  }
}

async function uploadSpriteForEntry(entry, file) {
  if (!canUseAdminControls()) return false;
  if (!entry?.spriteId || !entry?.uploadDir) return false;
  const maxUploadBytes = Math.max(1_000_000, Math.floor(Number(spriteEditorUi.maxUploadBytes) || 25_000_000));
  const mime = String(file.type || "").toLowerCase().trim();
  const name = String(file.name || "").toLowerCase().trim();
  const mimeOk = mime === "" || mime.startsWith("image/");
  const extOk = /\.(png|jpe?g|webp)$/i.test(name);
  if ((mime && !mimeOk) || (!mime && !extOk)) {
    setSpriteEditorStatus("Unsupported file. Upload PNG, JPG, or WEBP.", true);
    return false;
  }
  let uploadFile = file;
  spriteEditorUi.loading = true;
  setSpriteEditorStatus(`Uploading sprite for ${entry.objectId}...`, false);
  renderSpriteEditorList();
  try {
    if (uploadFile.size > maxUploadBytes) {
      const initialTargetBytes = Math.max(
        120_000,
        Math.min(CLIENT_SPRITE_UPLOAD_SOFT_TARGET_BYTES, Math.floor(maxUploadBytes * 0.9))
      );
      setSpriteEditorStatus(`Sprite is oversized. Compressing for ${entry.objectId}...`, false);
      renderSpriteEditorList();
      uploadFile = await compressSpriteUploadFile(uploadFile, initialTargetBytes);
      if (uploadFile.size > maxUploadBytes) {
        const targetText = formatBytesCompact(maxUploadBytes);
        const outText = formatBytesCompact(uploadFile.size);
        throw new Error(`Compressed sprite is still too large (${outText}; max ${targetText}).`);
      }
    }
    const originalSizeText = formatBytesCompact(uploadFile.size);
    setSpriteEditorStatus(`Uploading original sprite (${originalSizeText})...`, false);
    renderSpriteEditorList();

    let form = new FormData();
    form.append("action", "upload");
    form.append("sprite_id", entry.spriteId);
    form.append("category", entry.uploadDir);
    form.append("sprite_file", uploadFile);
    let data = null;
    try {
      data = await spriteApiRequest("POST", form);
    } catch (err) {
      const msg = String(err?.message || "");
      const is413 = msg.includes("(413)") || msg.includes("too large");
      if (!is413) throw err;

      const emergencyTarget = Math.max(
        96_000,
        Math.min(CLIENT_SPRITE_UPLOAD_RETRY_TARGET_BYTES, Math.floor(uploadFile.size * 0.65))
      );
      if (uploadFile.size <= emergencyTarget) throw err;
      setSpriteEditorStatus("Server rejected size. Applying stronger compression...", false);
      renderSpriteEditorList();
      uploadFile = await compressSpriteUploadFile(uploadFile, emergencyTarget);

      if (uploadFile.size > maxUploadBytes) {
        const targetText = formatBytesCompact(maxUploadBytes);
        const outText = formatBytesCompact(uploadFile.size);
        throw new Error(`Compressed sprite is still too large (${outText}; max ${targetText}).`);
      }

      form = new FormData();
      form.append("action", "upload");
      form.append("sprite_id", entry.spriteId);
      form.append("category", entry.uploadDir);
      form.append("sprite_file", uploadFile);
      data = await spriteApiRequest("POST", form);
    }
    applySpritePayload(data);
    const uploadedUrl = String(data?.url || spriteOverrideState.overrides?.[entry.spriteId] || "");
    await verifySpriteAssetUrlLoad(uploadedUrl);
    setSpriteEditorStatus(`Uploaded sprite for ${entry.objectId}.`, false);
    renderInfoOverlay(game);
    renderSpriteEditorList();
    return true;
  } catch (err) {
    setSpriteEditorStatus(err?.message ?? "Upload failed.", true);
    renderSpriteEditorList();
    return false;
  } finally {
    spriteEditorUi.loading = false;
    renderSpriteEditorList();
  }
}

async function setSpriteScaleForEntry(entry, scalePercent) {
  if (!canUseAdminControls()) return false;
  if (!entry?.spriteId || !entry?.uploadDir) return false;
  const normalized = clamp(Math.floor(Number(scalePercent) || 100), 25, 300);
  spriteEditorUi.loading = true;
  setSpriteEditorStatus(`Updating world size for ${entry.objectId}...`, false);
  renderSpriteEditorList();
  try {
    const form = new FormData();
    form.append("action", "scale");
    form.append("sprite_id", entry.spriteId);
    form.append("category", entry.uploadDir);
    form.append("scale_percent", `${normalized}`);
    const data = await spriteApiRequest("POST", form);
    applySpritePayload(data);
    setSpriteEditorStatus(`World size set to ${normalized}% for ${entry.objectId}.`, false);
    renderInfoOverlay(game);
    renderSpriteEditorList();
    return true;
  } catch (err) {
    setSpriteEditorStatus(err?.message ?? "Could not update sprite world size.", true);
    renderSpriteEditorList();
    return false;
  } finally {
    spriteEditorUi.loading = false;
    renderSpriteEditorList();
  }
}

async function setSpriteScaleForSelected(scalePercent) {
  if (!canUseAdminControls()) return false;
  const selected = Array.from(spriteEditorUi.selectedSpriteIds);
  if (!selected.length) return false;
  const normalized = clamp(Math.floor(Number(scalePercent) || 100), 25, 300);
  const objectBySpriteId = new Map(
    (spriteEditorUi.objects ?? [])
      .filter((entry) => entry?.spriteId && entry?.uploadDir)
      .map((entry) => [entry.spriteId, entry])
  );
  const targets = selected
    .map((spriteId) => objectBySpriteId.get(spriteId))
    .filter(Boolean);
  if (!targets.length) {
    setSpriteEditorStatus("No valid selected sprites to update.", true);
    return false;
  }

  spriteEditorUi.loading = true;
  setSpriteEditorStatus(`Updating world size for ${targets.length} selected sprite(s)...`, false);
  renderSpriteEditorList();
  try {
    let latestPayload = null;
    for (const entry of targets) {
      const form = new FormData();
      form.append("action", "scale");
      form.append("sprite_id", entry.spriteId);
      form.append("category", entry.uploadDir);
      form.append("scale_percent", `${normalized}`);
      latestPayload = await spriteApiRequest("POST", form);
    }
    if (latestPayload) applySpritePayload(latestPayload);
    setSpriteEditorStatus(`World size set to ${normalized}% for ${targets.length} sprite(s).`, false);
    renderInfoOverlay(game);
    renderSpriteEditorList();
    return true;
  } catch (err) {
    setSpriteEditorStatus(err?.message ?? "Could not update selected sprite world sizes.", true);
    renderSpriteEditorList();
    return false;
  } finally {
    spriteEditorUi.loading = false;
    renderSpriteEditorList();
  }
}

async function deleteSpriteForEntry(entry) {
  if (!canUseAdminControls()) return false;
  if (!entry?.spriteId || !entry?.uploadDir) return false;
  if (!spriteOverrideState.overrides[entry.spriteId]) return false;
  spriteEditorUi.loading = true;
  setSpriteEditorStatus(`Deleting custom sprite for ${entry.objectId}...`, false);
  renderSpriteEditorList();
  try {
    const form = new FormData();
    form.append("action", "delete");
    form.append("sprite_id", entry.spriteId);
    form.append("category", entry.uploadDir);
    const data = await spriteApiRequest("POST", form);
    applySpritePayload(data);
    setSpriteEditorStatus(`Deleted custom sprite for ${entry.objectId}.`, false);
    renderInfoOverlay(game);
    renderSpriteEditorList();
    return true;
  } catch (err) {
    setSpriteEditorStatus(err?.message ?? "Delete failed.", true);
    renderSpriteEditorList();
    return false;
  } finally {
    spriteEditorUi.loading = false;
    renderSpriteEditorList();
  }
}

async function openSpriteEditorOverlay() {
  if (!canUseAdminControls()) return false;
  spriteEditorUi.objects = buildSpriteObjectCatalog();
  updateSpriteEditorFilterControls();
  setSpriteEditorOverlayOpen(true);
  renderSpriteEditorList();
  setSpriteEditorStatus("Refreshing sprite data...", false);
  await refreshSpriteOverridesFromServer(true);
  renderSpriteEditorList();
  setSpriteEditorStatus("", false);
  return true;
}

function draw(state) {
  if (!state || !state.world || !state.player) return;
  const frameStartMs = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const nowMs = Date.now();
  touchCharacterProgress(state);
  updateAreaRespawnSystem(state, nowMs);
  applyOutOfCombatRegen(state, nowMs);
  computeVisibility(state);
  hydrateNearby(state);
  const shopRestocked = refreshShopStock(state, false);
  syncMobileUi();

  const { world, player, seen, visible } = state;
  const { monsters, items, traps } = getCachedOccupancy(state);
  updateContextActionButton(state, { monsters, items, traps });
  const theme = applyVisibilityBoostToTheme(themeForDepth(player.z, world.seedStr ?? ""));
  const timeSec = Date.now() / 1000;
  const deferredWorldObjects = [];
  const auraMax = visualFxQuality <= 0 ? 0 : (MOBILE_VISIBILITY_BOOST ? 1 : (visualFxQuality >= 2 ? 5 : 2));
  let auraBudget = auraMax;
  const z = player.z;
  const tileCache = new Map();
  const minWX = player.x - viewRadiusX - 1;
  const maxWX = player.x + viewRadiusX + 1;
  const minWY = player.y - viewRadiusY - 1;
  const maxWY = player.y + viewRadiusY + 1;
  for (let y = minWY; y <= maxWY; y++) {
    for (let x = minWX; x <= maxWX; x++) {
      tileCache.set(keyXY(x, y), world.getTile(x, y, z));
    }
  }
  const getTileAt = (x, y) => {
    const k = keyXY(x, y);
    if (tileCache.has(k)) return tileCache.get(k);
    const t = world.getTile(x, y, z);
    tileCache.set(k, t);
    return t;
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

  for (let sy = 0; sy < viewTilesY; sy++) {
    for (let sx = 0; sx < viewTilesX; sx++) {
      const wx = player.x + (sx - viewRadiusX);
      const wy = player.y + (sy - viewRadiusY);

      const isVisible = visible.has(keyXY(wx, wy));
      const isSeen = seen.has(keyXYZ(wx, wy, player.z));
      if (!isSeen) continue;

      const t = getTileAt(wx, wy);
      const neighbors = collectTileNeighbors(getTileAt, wx, wy);

      const px = sx * TILE;
      const py = sy * TILE;
      drawEnvironmentTile(ctx, theme, wx, wy, player.z, px, py, t, neighbors, isVisible);

      const tileSpriteKind = tileSpriteId(state, wx, wy, player.z, t);
      if (visualFxQuality > 0 && (isVisible || !fogEnabled) && (t === STAIRS_UP || t === STAIRS_DOWN)) {
        deferredWorldObjects.push({
          kind: "tile-aura",
          sortY: wy,
          sortX: wx,
          order: -1.4,
          sx,
          sy,
          tile: t,
        });
      }
      const tileSprite = getSpriteIfReady(tileSpriteKind);
      if (tileSprite) {
        let tileSpriteSize = ITEM_SPRITE_SIZE;
        if (tileSpriteKind === "surface_entrance") tileSpriteSize = SURFACE_ENTRANCE_SPRITE_SIZE;
        else if (tileSpriteKind === "stairs_up" || tileSpriteKind === "stairs_down") tileSpriteSize = STAIRS_SPRITE_SIZE;
        else if (tileSpriteKind?.startsWith("door_")) tileSpriteSize = DOOR_SPRITE_SIZE;
        deferredWorldObjects.push({
          kind: "tile-sprite",
          // Keep the large surface entrance sprite behind actors regardless of relative cell position.
          sortY: tileSpriteKind === "surface_entrance" ? -1000000 : wy,
          sortX: wx,
          order: -1,
          sx,
          sy,
          img: tileSprite,
          spriteId: tileSpriteKind,
          size: tileSpriteSize,
        });
      } else {
        const tg = tileGlyph(t);
        if (tg) {
          const col = (isVisible || !fogEnabled) ? tg.c : "rgba(230,230,230,0.45)";
          deferredWorldObjects.push({
            kind: "glyph",
            sortY: wy,
            sortX: wx,
            order: -1,
            sx,
            sy,
            glyph: tg.g,
            color: col,
          });
        }
      }

      const occKey = keyXYZ(wx, wy, player.z);
      const trapId = traps.get(occKey);
      if (trapId) {
        const trapEnt = state.entities.get(trapId);
        const revealed = !!(trapEnt?.detected || trapEnt?.triggered);
        if (revealed && (isSeen || isVisible || !fogEnabled)) {
          const trapSprite = getSpriteIfReady(TRAP_REVEALED_SPRITE_ID);
          if (trapSprite) {
            deferredWorldObjects.push({
              kind: "item-sprite",
              sortY: wy,
              sortX: wx,
              order: -0.08,
              sx,
              sy,
              img: trapSprite,
              spriteId: TRAP_REVEALED_SPRITE_ID,
              size: ITEM_SPRITE_SIZE,
              entType: "trap",
              wx,
              wy,
            });
          } else {
            const trapColor = trapEnt?.armed
              ? "#ffb26b"
              : (trapEnt?.triggered ? "#ff6f6f" : "#a7bfd8");
            deferredWorldObjects.push({
              kind: "glyph",
              sortY: wy,
              sortX: wx,
              order: -0.08,
              sx,
              sy,
              glyph: "X",
              color: trapColor,
            });
          }
        }
      }

      if (isVisible || !fogEnabled) {
        const mk = monsters.get(occKey);
        const ik = items.get(occKey);

        if (ik) {
          const ent = state.entities.get(ik);
          const entType = ent?.type ?? "";
          const weaponGlow = weaponTierGlowColor(entType);
          if (weaponGlow) {
            deferredWorldObjects.push({
              kind: "weapon-tier-aura",
              sortY: wy,
              sortX: wx,
              order: -0.35,
              sx,
              sy,
              color: weaponGlow,
            });
          }
          const nearPlayer = Math.abs(wx - player.x) <= 10 && Math.abs(wy - player.y) <= 10;
          const shouldAura =
            visualFxQuality > 0 &&
            (entType === "shrine" ||
              (auraBudget > 0 && nearPlayer && (entType === "gold" || entType === "chest" || isRareLootType(entType))));
          if (shouldAura) {
            deferredWorldObjects.push({
              kind: "item-aura",
              sortY: wy,
              sortX: wx,
              order: -0.3,
              sx,
              sy,
              wx,
              wy,
              entType,
            });
            if (entType !== "shrine") auraBudget -= 1;
          }
          const itemSpriteIdValue = itemSpriteId(ent);
          const itemSprite = getSpriteIfReady(itemSpriteIdValue);
          if (itemSprite) {
            if (ent?.type === "shopkeeper") {
              const centerX = (sx + 0.5) * TILE;
              const footY = (sy + SHOP_FOOTPRINT_H) * TILE;
              deferredWorldObjects.push({
                kind: "item-sprite",
                sortY: wy + (SHOP_FOOTPRINT_H - 1),
                sortX: wx,
                order: 0,
                sx,
                sy,
                img: itemSprite,
                spriteId: itemSpriteIdValue,
                size: SHOP_SPRITE_SIZE,
                centerX,
                footY,
                cellsTall: SHOP_FOOTPRINT_H,
                entType,
                wx,
                wy,
              });
            } else {
              deferredWorldObjects.push({
                kind: "item-sprite",
                sortY: wy,
                sortX: wx,
                order: 0,
                sx,
                sy,
                img: itemSprite,
                spriteId: itemSpriteIdValue,
                size: ITEM_SPRITE_SIZE,
                entType,
                wx,
                wy,
              });
            }
          } else {
            const gi = itemGlyph(ent?.type);
            if (gi) {
              deferredWorldObjects.push({
                kind: "glyph",
                sortY: wy,
                sortX: wx,
                order: 0,
                sx,
                sy,
                glyph: gi.g,
                color: gi.c,
              });
            }
          }
        }

        if (mk) {
          const ent = state.entities.get(mk);
          const monsterSpriteIdValue = monsterSpriteId(ent?.type);
          const monsterSprite = getSpriteIfReady(monsterSpriteIdValue);
          if (monsterSprite) {
            deferredWorldObjects.push({
              kind: "monster-sprite",
              sortY: wy,
              sortX: wx,
              order: 1,
              sx,
              sy,
              img: monsterSprite,
              spriteId: monsterSpriteIdValue,
            });
          } else {
            const gm = monsterGlyph(ent?.type);
            if (gm) {
              deferredWorldObjects.push({
                kind: "glyph",
                sortY: wy,
                sortX: wx,
                order: 1,
                sx,
                sy,
                glyph: gm.g,
                color: gm.c,
              });
            }
          }
        }
      }
    }
  }

  const heroCx = viewRadiusX * TILE + TILE / 2;
  const heroCy = viewRadiusY * TILE + TILE / 2;
  const heroSortY = player.y + 0.01;
  const heroSpriteId = playerCharacterSpriteId(state);
  const heroSprite = getSpriteIfReady(heroSpriteId) || getSpriteIfReady("hero");
  if (heroSprite) {
    deferredWorldObjects.push({
      kind: "hero-sprite",
      sortY: heroSortY,
      sortX: player.x,
      order: 2,
      sx: viewRadiusX,
      sy: viewRadiusY,
      img: heroSprite,
      spriteId: heroSpriteId,
    });
  } else {
    deferredWorldObjects.push({
      kind: "hero-fallback",
      sortY: heroSortY,
      sortX: player.x,
      order: 2,
      sx: viewRadiusX,
      sy: viewRadiusY,
      centerX: heroCx,
      centerY: heroCy,
      footY: (viewRadiusY + 1) * TILE,
    });
  }

  // Painter's algorithm for world objects: lower tiles (higher Y) render over higher tiles.
  deferredWorldObjects.sort((a, b) => {
    const aIsHero = a.kind === "hero-sprite" || a.kind === "hero-fallback";
    const bIsHero = b.kind === "hero-sprite" || b.kind === "hero-fallback";
    const aIsShop = a.kind === "item-sprite" && a.entType === "shopkeeper";
    const bIsShop = b.kind === "item-sprite" && b.entType === "shopkeeper";
    if (aIsHero && bIsShop) return 1;
    if (aIsShop && bIsHero) return -1;
    return (a.sortY - b.sortY) || (a.sortX - b.sortX) || (a.order - b.order);
  });
  for (const obj of deferredWorldObjects) {
    if (obj.kind === "tile-aura") {
      const cx = obj.sx * TILE + TILE / 2;
      const cy = obj.sy * TILE + TILE / 2;
      const up = obj.tile === STAIRS_UP;
      const pulse = 0.75 + 0.25 * pulse01(timeSec, up ? 2 : 1.7, (obj.sx + obj.sy) * 0.35);
      const inner = up
        ? `rgba(210,178,255,${0.12 * pulse})`
        : `rgba(196,255,188,${0.12 * pulse})`;
      const outer = up ? "rgba(210,178,255,0)" : "rgba(196,255,188,0)";
      drawSoftGlow(ctx, cx, cy, TILE * (0.45 + 0.14 * pulse), inner, outer);
      continue;
    }
    if (obj.kind === "weapon-tier-aura") {
      const cx = obj.sx * TILE + TILE / 2;
      const cy = obj.sy * TILE + TILE / 2;
      const pulse = 0.72 + 0.28 * pulse01(timeSec, 3.1, (obj.sx + obj.sy) * 0.43);
      const color = obj.color ?? "#f4c96a";
      const alpha = clamp(0.20 * pulse, 0.08, 0.3);
      drawSoftGlow(ctx, cx, cy, TILE * (0.48 + 0.14 * pulse), `${hexToRgba(color, alpha)}`, `${hexToRgba(color, 0)}`);
      continue;
    }
    if (obj.kind === "item-aura") {
      const cx = obj.sx * TILE + TILE / 2;
      const cy = obj.sy * TILE + TILE / 2;
      if (obj.entType === "shrine") {
        const pulse = 0.8 + 0.2 * pulse01(timeSec, 2.2, tileNoise01(obj.wx, obj.wy, player.z, 377) * Math.PI * 2);
        drawSoftGlow(ctx, cx, cy, TILE * (0.62 + pulse * 0.14), `rgba(255,160,74,${0.18 * pulse})`, "rgba(255,160,74,0)");
        drawSoftGlow(ctx, cx, cy, TILE * 0.34, `rgba(255,210,140,${0.16 * pulse})`, "rgba(255,210,140,0)");
        drawShrineParticles(ctx, cx, cy, timeSec, obj.wx, obj.wy, player.z);
      } else {
        const rarePulse = 0.72 + 0.28 * pulse01(timeSec, 3.4, tileNoise01(obj.wx, obj.wy, player.z, 401) * Math.PI * 2);
        const goldish = obj.entType === "gold";
        const inner = goldish
          ? `rgba(245,197,66,${0.16 * rarePulse})`
          : `rgba(255,224,140,${0.17 * rarePulse})`;
        const outer = goldish ? "rgba(245,197,66,0)" : "rgba(255,224,140,0)";
        drawSoftGlow(ctx, cx, cy, TILE * (0.42 + 0.1 * rarePulse), inner, outer);
        const sparkle = pulse01(timeSec, 5.4, tileNoise01(obj.wx, obj.wy, player.z, 433) * Math.PI * 2);
        if (sparkle > 0.78) {
          const r = Math.max(4, Math.floor(TILE * 0.04));
          const alpha = Math.min(0.9, (sparkle - 0.78) * 3.8);
          ctx.strokeStyle = `rgba(255,236,170,${alpha})`;
          ctx.lineWidth = Math.max(2, Math.floor(TILE * 0.01));
          ctx.beginPath();
          ctx.moveTo(cx - r, cy);
          ctx.lineTo(cx + r, cy);
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx, cy + r);
          ctx.stroke();
        }
      }
      continue;
    }
    if (obj.kind === "tile-sprite") {
      const size = scaledSpriteSize(obj.size, obj.spriteId);
      drawBottomAnchoredSprite(ctx, obj.sx, obj.sy, obj.img, size, size);
      continue;
    }
    if (obj.kind === "glyph") {
      drawBottomAnchoredGlyph(ctx, obj.sx, obj.sy, obj.glyph, obj.color, obj.cellsTall ?? 1);
      continue;
    }
    if (obj.kind === "item-sprite") {
      const scaledSize = scaledSpriteSize(obj.size ?? ITEM_SPRITE_SIZE, obj.spriteId);
      if (Number.isFinite(obj.centerX) && Number.isFinite(obj.footY)) {
        drawBottomAnchoredSpriteAt(ctx, obj.centerX, obj.footY, obj.img, scaledSize, scaledSize);
      } else {
        drawBottomAnchoredSprite(ctx, obj.sx, obj.sy, obj.img, scaledSize, scaledSize, obj.cellsTall ?? 1);
      }
      continue;
    }
    if (obj.kind === "monster-sprite") {
      const cx = obj.sx * TILE + TILE / 2;
      const footY = (obj.sy + 1) * TILE;
      const cy = footY - TILE * 0.5;
      const bob = Math.sin(timeSec * 2 + (obj.sortX + obj.sortY) * 0.65) * TILE * 0.008;
      drawSoftGlow(ctx, cx, cy, MONSTER_GLOW_RADIUS, "rgba(255,120,90,0.20)", "rgba(255,120,90,0)");
      const size = scaledSpriteSize(MONSTER_SPRITE_SIZE, obj.spriteId);
      drawBottomAnchoredSpriteAt(ctx, cx, footY, obj.img, size, size, bob);
      continue;
    }
    if (obj.kind === "hero-sprite") {
      const cx = obj.sx * TILE + TILE / 2;
      const footY = (obj.sy + 1) * TILE;
      const cy = footY - TILE * 0.5;
      const bob = Math.sin(timeSec * 2.4) * TILE * 0.01;
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.beginPath();
      ctx.ellipse(cx, footY - TILE * 0.06, TILE * 0.19, TILE * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSoftGlow(ctx, cx, cy, HERO_GLOW_RADIUS, "rgba(120,220,255,0.24)", "rgba(120,220,255,0)");
      const size = scaledSpriteSize(PLAYER_SPRITE_SIZE, obj.spriteId);
      drawBottomAnchoredSpriteAt(ctx, cx, footY, obj.img, size, size, bob);
      continue;
    }
    if (obj.kind === "hero-fallback") {
      const cx = Number.isFinite(obj.centerX) ? obj.centerX : heroCx;
      const footY = Number.isFinite(obj.footY) ? obj.footY : ((obj.sy + 1) * TILE);
      const cy = footY - TILE * 0.5;
      const bob = Math.sin(timeSec * 2.4) * TILE * 0.01;
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.beginPath();
      ctx.ellipse(cx, footY - TILE * 0.06, TILE * 0.19, TILE * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSoftGlow(ctx, cx, cy, HERO_GLOW_RADIUS, "rgba(120,220,255,0.24)", "rgba(120,220,255,0)");
      ctx.fillStyle = "#ffffff";
      // Fallback player marker while sprite is loading.
      const prad = Math.max(3, TILE / 2 - 2);
      ctx.beginPath();
      ctx.arc(cx, footY - prad + bob, prad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (visualFxQuality > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawAtmospherePass(ctx, theme, player.z, timeSec, canvas.width, canvas.height, visualFxQuality);
  }
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  drawCombatHudOverlay(ctx, state, nowMs);

  const { cx, cy, lx, ly } = splitWorldToChunk(player.x, player.y);
  if (headerInfoEl) {
    headerInfoEl.innerHTML =
      `<div>seed: ${world.seedStr} | theme: ${theme.name}</div>` +
      `<div>pos: (${player.x}, ${player.y}) chunk: (${cx}, ${cy}) local: (${lx}, ${ly})</div>`;
  }
  metaEl.innerHTML =
    `<div class="meta-row"><div class="meta-col"><span class="label">XP</span><span class="val xp">${player.xp}/${xpToNext(player.level)}</span></div><div class="meta-col"><span class="label">Gold</span><span class="val gold">${player.gold}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">ATK</span><span class="val atk">${Math.max(1, player.atkLo + player.atkBonus)}-${Math.max(1, player.atkHi + player.atkBonus)}</span></div><div class="meta-col"><span class="label">DEF</span><span class="val def">+${player.defBonus}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">ACC</span><span class="val atk">${player.acc ?? 0}</span></div><div class="meta-col"><span class="label">EVA</span><span class="val def">${player.eva ?? 0}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">PTS</span><span class="val gold">${characterUnspentStatPoints(state)}</span></div><div class="meta-col"><span class="label">SPD</span><span class="val def">${(player.spd ?? 1).toFixed(2)}</span></div></div>`;
  if (vitalsDisplayEl) {
    vitalsDisplayEl.innerHTML =
      `<span class="lbl">HP</span><span class="hp">${player.hp}/${player.maxHp}</span>` +
      `<span class="sep">|</span>` +
      `<span class="lbl">LVL</span><span class="lvl">${player.level}</span>`;
  }
  if (depthDisplayEl) depthDisplayEl.textContent = `Depth: ${player.z}`;
  updateSurfaceCompass(state);

  // Visual indicator for low HP: toggle hp-low class when HP <= 30% of max
  try {
    const hpNode = (vitalsDisplayEl?.querySelector('.hp')) || metaEl.querySelector('.val.hp');
    if (hpNode) {
      const threshold = Math.ceil((player.maxHp || 1) * 0.3);
      if (player.hp <= threshold) hpNode.classList.add('hp-low');
      else hpNode.classList.remove('hp-low');
    }
  } catch (e) { /* ignore DOM errors */ }

  drawMinimap(state);
  updateDeathOverlay(state);
  if (state.player.dead && isShopOverlayOpen()) closeShopOverlay();
  if (shopUi.open) {
    if (shopRestocked) renderShopOverlay(state);
    else updateShopOverlayMeta(state);
  }
  const frameEndMs = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  maybeAdjustVisualQuality(frameEndMs - frameStartMs);
}

// ---------- Turn handling ----------
function applyEffectsAfterPlayerAction(state) {
  if (!state.player.dead) {
    applyEffectsTick(state);
    tickPoisonClouds(state);
    tickMonsterEffects(state);
  }
}

function takeTurn(state, didSpendTurn) {
  if (enforceCharacterCreationGate()) return;
  if (isLevelUpOverlayOpen()) return;
  if (isCharacterOverlayOpen()) return;
  if (!didSpendTurn) return;
  state.turn += 1;
  maybeGrantExplorationXP(state);
  processPlayerTrapInteractions(state);
  if (state.player.dead) {
    renderInventory(state);
    renderEquipment(state);
    renderEffects(state);
    markSaveDirty(state, "turn");
    return;
  }

  applyEffectsAfterPlayerAction(state);
  monstersTurn(state);

  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  markSaveDirty(state, "turn");
}

// ---------- Input ----------
function isTextEntryElement(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest("[contenteditable='true']")) return true;
  const field = el.closest("input, textarea");
  if (!field) return false;
  const tag = field.tagName.toLowerCase();
  if (tag === "textarea") return true;
  const type = String(field.getAttribute("type") ?? "text").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(type);
}

function shouldIgnoreGameHotkeys(e) {
  const target = e.target;
  if (!(target instanceof Element)) return false;
  if (debugMenuWrapEl?.contains(target)) return true;
  if (isTextEntryElement(target)) return true;
  return false;
}

function onKey(state, e) {
  const k = e.key.toLowerCase();
  if (shouldIgnoreGameHotkeys(e)) return;
  if (enforceCharacterCreationGate()) {
    e.preventDefault();
    return;
  }
  if (isLevelUpOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") closeLevelUpOverlay();
    return;
  }
  if (isCharacterOverlayOpen()) {
    if (k === "escape") {
      e.preventDefault();
      tryCloseCharacterOverlay();
    }
    return;
  }
  if (isSaveGameOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") closeSaveGameOverlay();
    return;
  }
  if (isNewDungeonConfirmOpen()) {
    e.preventDefault();
    if (k === "escape") resolveNewDungeonConfirm(false);
    return;
  }
  if (isSpriteEditorOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") closeSpriteEditorOverlay();
    return;
  }
  if (isMonsterEditorOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") closeMonsterEditorOverlay();
    return;
  }
  if (isInfoOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") closeInfoOverlay();
    return;
  }
  if (k === "escape" && closeMobilePanels()) {
    e.preventDefault();
    return;
  }
  if (isShopOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") closeShopOverlay();
    return;
  }
  const digitShiftDrop = /^Digit[1-9]$/.test(e.code) && e.shiftKey;

  if (digitShiftDrop) {
    e.preventDefault();
    const displayIdx = Number(e.code.replace("Digit", "")) - 1;
    const entry = getInventoryDisplayEntries(state)[displayIdx];
    if (entry) takeTurn(state, dropInventoryIndex(state, entry.invIndex));
    return;
  }

  if (e.key >= "1" && e.key <= "9") {
    e.preventDefault();
    const displayIdx = parseInt(e.key, 10) - 1;
    const entry = getInventoryDisplayEntries(state)[displayIdx];
    if (entry) useInventoryIndex(state, entry.invIndex);
    return;
  }

  if (k === "arrowup" || k === "w") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 0, -1)); }
  else if (k === "arrowdown" || k === "s") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 0, 1)); }
  else if (k === "arrowleft" || k === "a") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, -1, 0)); }
  else if (k === "arrowright" || k === "d") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 1, 0)); }
  else if (k === "." || k === " " || k === "spacebar") { e.preventDefault(); takeTurn(state, waitTurn(state)); }
  else if (k === "g") { e.preventDefault(); takeTurn(state, pickup(state)); }
  else if (k === "c") { e.preventDefault(); {
      // Try to close an open adjacent door; if none, try to open a closed adjacent door.
      const closed = tryCloseAdjacentDoor(state);
      if (closed) takeTurn(state, true);
      else takeTurn(state, tryOpenAdjacentDoor(state));
    }
  }

  // E is now contextual: stairs (up/down) OR shop/shrine interaction
  else if (k === "e") { e.preventDefault(); takeTurn(state, interactContext(state)); }
  else if (k === "enter") {
    e.preventDefault();
    const action = resolveContextAction(state);
    if (action) takeTurn(state, action.run());
  }

  else if (k === "i") { e.preventDefault(); renderInventory(state); }
  else if (k === "m") { e.preventDefault(); minimapEnabled = !minimapEnabled; markSaveDirty(state, "toggle-minimap"); }
  else if (e.key === ">") { e.preventDefault(); takeTurn(state, tryUseStairs(state, "down")); }
  else if (e.key === "<") { e.preventDefault(); takeTurn(state, tryUseStairs(state, "up")); }
  else if (k === "f") {
    if (!canUseAdminControls()) return;
    e.preventDefault();
    fogEnabled = !fogEnabled;
    markSaveDirty(state, "toggle-fog");
  }

  else if (k === "r") {
    e.preventDefault();
    void requestNewDungeonReset(state);
  }
}

// ---------- Keyâ†’Locked Door pairing (doorway-only replacement) ----------
function keyTypeToLockTile(keyType) {
  if (keyType === KEY_GREEN) return LOCK_GREEN;
  if (keyType === KEY_YELLOW) return LOCK_YELLOW;
  if (keyType === KEY_ORANGE) return LOCK_ORANGE;
  if (keyType === KEY_RED) return LOCK_RED;
  if (keyType === KEY_VIOLET) return LOCK_VIOLET;
  if (keyType === KEY_INDIGO) return LOCK_INDIGO;
  if (keyType === KEY_BLUE) return LOCK_INDIGO;
  if (keyType === KEY_PURPLE) return LOCK_VIOLET;
  if (keyType === KEY_MAGENTA) return LOCK_INDIGO;
  return LOCK_GREEN;
}

function isDoorwayCandidate(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (t !== DOOR_CLOSED) return false;

  if (state.visitedDoors?.has(keyXYZ(x, y, z))) return false;

  const floorish = (tt) => tt === FLOOR || isOpenDoorTile(tt) || tt === STAIRS_DOWN || tt === STAIRS_UP;
  const n = state.world.getTile(x, y - 1, z), s = state.world.getTile(x, y + 1, z);
  const w = state.world.getTile(x - 1, y, z), e = state.world.getTile(x + 1, y, z);

  const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
  const we = floorish(w) && floorish(e) && n === WALL && s === WALL;

  return ns || we;
}

function topologyWalkableTile(t) {
  return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
}

function isDoorChokepoint(state, x, y, z, maxRadius = 28, maxNodes = 2600) {
  if (!isDoorwayCandidate(state, x, y, z)) return false;

  const n = state.world.getTile(x, y - 1, z);
  const s = state.world.getTile(x, y + 1, z);
  const w = state.world.getTile(x - 1, y, z);
  const e = state.world.getTile(x + 1, y, z);

  let start = null;
  let goal = null;
  if (topologyWalkableTile(n) && topologyWalkableTile(s)) {
    start = { x, y: y - 1 };
    goal = { x, y: y + 1 };
  } else if (topologyWalkableTile(w) && topologyWalkableTile(e)) {
    start = { x: x - 1, y };
    goal = { x: x + 1, y };
  } else {
    return false;
  }

  const q = [start];
  const seen = new Set([keyXY(start.x, start.y)]);
  let nodes = 0;

  while (q.length && nodes++ < maxNodes) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) return false;

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx === x && ny === y) continue; // treat the candidate door as blocked
      if (Math.abs(nx - x) + Math.abs(ny - y) > maxRadius) continue;

      const t = state.world.getTile(nx, ny, z);
      if (!topologyWalkableTile(t)) continue;

      const k = keyXY(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }

  // If sides could not reconnect without using this door, it's a chokepoint.
  return true;
}

function placeMatchingLockedDoorNearPlayer(state, keyType) {
  const p = state.player;
  const z = p.z;
  const lockTile = keyTypeToLockTile(keyType);

  let foundExisting = false;
  for (let dy = -48; dy <= 48 && !foundExisting; dy++) {
    for (let dx = -48; dx <= 48; dx++) {
      const wx = p.x + dx, wy = p.y + dy;
      if (state.world.getTile(wx, wy, z) === lockTile) { foundExisting = true; break; }
    }
  }
  if (foundExisting) return true;

  const minDist = 10;
  const maxDist = 48;
  const candidates = [];

  for (let dy = -maxDist; dy <= maxDist; dy++) {
    for (let dx = -maxDist; dx <= maxDist; dx++) {
      const wx = p.x + dx;
      const wy = p.y + dy;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < minDist || d > maxDist) continue;
      if (!state.seen.has(keyXYZ(wx, wy, z))) continue;
      if (!isDoorwayCandidate(state, wx, wy, z)) continue;
      candidates.push({ x: wx, y: wy, d, choke: isDoorChokepoint(state, wx, wy, z) });
    }
  }

  if (!candidates.length) return false;

  const chokeCandidates = candidates.filter(c => c.choke);
  const pool = chokeCandidates.length ? chokeCandidates : candidates;
  pool.sort((a, b) => a.d - b.d);
  const pick = pool[Math.floor(pool.length * 0.65)] ?? pool[pool.length - 1];

  state.world.setTile(pick.x, pick.y, z, lockTile);
  pushLog(state, `You sense a matching locked door somewhere nearby...`);
  return true;
}

// ---------- Save / Load ----------
function exportSave(state) {
  const character = touchCharacterProgress(state);
  const areaRespawn = ensureAreaRespawnState(state);
  const tileOv = Array.from(state.world.tileOverrides.entries());
  const removed = Array.from(state.removedIds);
  const entOv = Array.from(state.entityOverrides.entries()).map(([id, ov]) => {
    const ent = state.entities.get(id);
    if (!ent) return [id, ov];
    if (ent.kind === "trap") {
      const next = { ...(ov ?? {}) };
      next.armed = !!ent.armed;
      next.detected = !!ent.detected;
      next.triggered = !!ent.triggered;
      next.disarmed = !!ent.disarmed;
      next.depth = Math.max(0, Math.floor(ent.depth ?? ent.z ?? 0));
      return [id, next];
    }
    if (ent.kind !== "monster") return [id, ov];
    const next = { ...(ov ?? {}) };
    next.awake = !!ent.awake;
    if (Number.isFinite(ent.abilityCd)) next.abilityCd = Math.floor(ent.abilityCd);
    const effects = normalizeMonsterEffects(ent.effects ?? []);
    if (effects.length > 0) next.effects = effects;
    else delete next.effects;
    return [id, next];
  });
  const seen = Array.from(state.seen).slice(0, 60000);
  const dynamic = Array.from(state.dynamic.values());
  const visitedDoors = Array.from(state.visitedDoors ?? []);
  const exploredChunks = Array.from(state.exploredChunks ?? []);
  const xpDepthKills = ensureDepthKillCounters(state);
  const poisonClouds = ensurePoisonCloudState(state);

  const payload = {
    v: 8,
    seed: state.world.seedStr,
    fog: fogEnabled,
    minimap: minimapEnabled,
    player: state.player,
    inv: state.inv,
    removed,
    entOv,
    tileOv,
    seen,
    dynamic,
    log: state.log.slice(-110),
    turn: state.turn,
    visitedDoors,
    exploredChunks,
    xpDepthKills,
    poisonClouds,
    surfaceLink: state.surfaceLink ?? null,
    startSpawn: state.startSpawn ?? null,
    lastLadderLanding: normalizeLadderLanding(state.lastLadderLanding ?? state.player) ?? null,
    shop: state.shop ?? null,
    character: character ?? null,
    areaRespawn: {
      currentAreaKey: areaRespawn.currentAreaKey ?? "",
      schedules: areaRespawn.schedules ?? {},
    },
    debug: normalizeDebugFlags(state.debug),
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function normalizeInventoryEntries(items) {
  const out = [];
  for (const raw of items ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const type = normalizeItemType(raw.type);
    if (!ITEM_TYPES[type]) continue;
    const amount = Math.max(1, Math.floor(raw.amount ?? 1));
    out.push({ type, amount });
  }
  return out;
}

function normalizeDynamicEntries(items) {
  const out = [];
  for (const raw of items ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const kind = String(raw.kind ?? "item");
    if (kind === "monster") {
      const type = normalizeMonsterTypeId(raw.type);
      if (!type || !MONSTER_TYPES[type]) continue;
      const x = Math.floor(Number(raw.x));
      const y = Math.floor(Number(raw.y));
      const z = Math.floor(Number(raw.z));
      const hp = Math.max(0, Math.floor(Number(raw.hp ?? 0)));
      const maxHp = Math.max(1, Math.floor(Number(raw.maxHp ?? (hp || 1))));
      const effects = normalizeMonsterEffects(raw.effects ?? []);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const entry = {
        ...raw,
        kind: "monster",
        type,
        x,
        y,
        z,
        hp: clamp(hp, 0, maxHp),
        maxHp,
        cd: Math.max(0, Math.floor(Number(raw.cd ?? 0))),
        abilityCd: Math.max(0, Math.floor(Number(raw.abilityCd ?? 0))),
        awake: !!raw.awake,
      };
      if (effects.length > 0) entry.effects = effects;
      else delete entry.effects;
      out.push(entry);
      continue;
    }
    const type = normalizeItemType(raw.type);
    if (!ITEM_TYPES[type]) continue;
    out.push({ ...raw, kind: "item", type, amount: Math.max(1, Math.floor(raw.amount ?? 1)) });
  }
  return out;
}

function normalizeDepthKillCounters(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [depthKey, countRaw] of Object.entries(raw)) {
    const depth = Math.max(0, Math.floor(Number(depthKey)));
    const count = Math.max(0, Math.floor(Number(countRaw)));
    if (!Number.isFinite(depth) || !Number.isFinite(count) || count <= 0) continue;
    out[depth] = count;
  }
  return out;
}

function normalizePoisonCloudState(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const x = Math.floor(Number(entry.x));
    const y = Math.floor(Number(entry.y));
    const z = Math.floor(Number(entry.z));
    const turnsLeft = Math.max(0, Math.floor(Number(entry.turnsLeft ?? 0)));
    const dmg = Math.max(1, Math.floor(Number(entry.dmg ?? 1)));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (turnsLeft <= 0) continue;
    out[k] = { x, y, z, turnsLeft, dmg, source: String(entry.source ?? "spores").slice(0, 40) };
  }
  return out;
}

function normalizeEquip(equip) {
  const out = { weapon: null, head: null, chest: null, legs: null };
  const e = equip ?? {};

  const weapon = normalizeItemType(e.weapon ?? null);
  if (weapon && WEAPONS[weapon]) out.weapon = weapon;

  const candidates = [e.head, e.chest, e.legs, e.armor]
    .map((x) => normalizeItemType(x))
    .filter(Boolean);

  for (const type of candidates) {
    const piece = ARMOR_PIECES[type];
    if (!piece) continue;
    if (!out[piece.slot]) out[piece.slot] = type;
  }

  return out;
}

function migrateV3toV4(payload) {
  if (payload?.inv) {
    for (const it of payload.inv) {
      if (it.type === "key") it.type = KEY_GREEN;
    }
  }
  if (payload?.dynamic) {
    for (const it of payload.dynamic) {
      if (it.type === "key") it.type = KEY_GREEN;
    }
  }
  payload.player = payload.player ?? {};
  payload.player.dead = !!payload.player.dead;
  payload.player.level = payload.player.level ?? 1;
  payload.player.xp = payload.player.xp ?? 0;
  payload.player.equip = payload.player.equip ?? { weapon: null, armor: null };
  payload.player.effects = payload.player.effects ?? [];
  payload.turn = payload.turn ?? 0;
  return payload;
}

function deriveExploredChunksFromSeen(seenEntries) {
  const chunks = new Set();
  for (const s of seenEntries ?? []) {
    const [zPart, xyPart] = String(s).split("|");
    if (!xyPart) continue;
    const [xPart, yPart] = xyPart.split(",");
    const z = Number(zPart);
    const x = Number(xPart);
    const y = Number(yPart);
    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const { cx, cy } = splitWorldToChunk(x, y);
    chunks.add(keyZCXCY(z, cx, cy));
  }
  return chunks;
}

function migrateV4toV5(payload) {
  payload.player = payload.player ?? {};
  payload.player.xp = Math.max(0, Math.floor((payload.player.xp ?? 0) * XP_SCALE));
  payload.exploredChunks = Array.from(deriveExploredChunksFromSeen(payload.seen ?? []));
  payload.v = 5;
  return payload;
}

function migrateV5toV6(payload) {
  payload.player = payload.player ?? {};
  payload.player.maxHp = Math.max(1, Math.floor((payload.player.maxHp ?? 18) * COMBAT_SCALE));
  payload.player.hp = Math.max(0, Math.floor((payload.player.hp ?? payload.player.maxHp) * COMBAT_SCALE));
  payload.player.effects = (payload.player.effects ?? []).map((e) => {
    const next = { ...e };
    if ((next.type === "bless" || next.type === "curse") && Number.isFinite(next.atkDelta) && Math.abs(next.atkDelta) < COMBAT_SCALE) {
      next.atkDelta = Math.floor(next.atkDelta * COMBAT_SCALE);
    }
    if (next.type === "regen" && Number.isFinite(next.healPerTurn) && Math.abs(next.healPerTurn) < COMBAT_SCALE) {
      next.healPerTurn = Math.floor(next.healPerTurn * COMBAT_SCALE);
    }
    return next;
  });

  payload.entOv = (payload.entOv ?? []).map(([id, ov]) => {
    if (!ov || typeof ov !== "object") return [id, ov];
    const next = { ...ov };
    if (Number.isFinite(next.hp)) next.hp = Math.max(1, Math.floor(next.hp * COMBAT_SCALE));
    return [id, next];
  });

  payload.v = 6;
  return payload;
}

function migrateV6toV7(payload) {
  payload.player = payload.player ?? {};
  payload.player.equip = normalizeEquip(payload.player.equip ?? {});
  payload.inv = normalizeInventoryEntries(payload.inv ?? []);
  payload.dynamic = normalizeDynamicEntries(payload.dynamic ?? []);
  payload.shop = payload.shop ?? null;
  payload.v = 7;
  return payload;
}
function migrateV7toV8(payload) {
  payload.player = payload.player ?? {};
  payload.character = normalizeCharacterProfile(
    payload.character ?? {
      classId: payload?.player?.classId,
      speciesId: payload?.player?.speciesId,
    }
  );
  payload.player.classId = payload.character.classId;
  payload.player.speciesId = payload.character.speciesId;
  payload.v = 8;
  return payload;
}

function importSave(saveStr) {
  try {
    const json = decodeURIComponent(escape(atob(saveStr)));
    let payload = JSON.parse(json);
    if (!payload) return null;

    if (payload.v === 3) payload = migrateV3toV4(payload);
    if (payload.v === 4) payload = migrateV4toV5(payload);
    if (payload.v === 5) payload = migrateV5toV6(payload);
    if (payload.v === 6) payload = migrateV6toV7(payload);
    if (payload.v === 7) payload = migrateV7toV8(payload);
    if (payload.v !== 8) return null;

    const tileOverrides = new Map(payload.tileOv ?? []);
    const world = new World(payload.seed, tileOverrides);

    const state = {
      world,
      player: payload.player,
      seen: new Set(payload.seen ?? []),
      visible: new Set(),
      log: payload.log ?? [],
      entities: new Map(),
      removedIds: new Set(payload.removed ?? []),
      entityOverrides: new Map(payload.entOv ?? []),
      inv: normalizeInventoryEntries(payload.inv ?? []),
      dynamic: new Map(),
      turn: payload.turn ?? 0,
      visitedDoors: new Set(payload.visitedDoors ?? []),
      exploredChunks: new Set(payload.exploredChunks ?? []),
      xpDepthKills: normalizeDepthKillCounters(payload.xpDepthKills ?? {}),
      poisonClouds: normalizePoisonCloudState(payload.poisonClouds ?? {}),
      surfaceLink: payload.surfaceLink ?? null,
      startSpawn: payload.startSpawn ?? null,
      lastLadderLanding: normalizeLadderLanding(payload.lastLadderLanding ?? null),
      shop: payload.shop ?? null,
      character: normalizeCharacterProfile(
        payload.character ?? {
          classId: payload?.player?.classId,
          speciesId: payload?.player?.speciesId,
        }
      ),
      combat: {
        lastEventMs: Number.isFinite(payload?.combat?.lastEventMs) ? payload.combat.lastEventMs : 0,
        regenAnchorMs: Date.now(),
        hudTargets: {},
      },
      disengageGrace: {},
      areaRespawn: {
        currentAreaKey: (typeof payload?.areaRespawn?.currentAreaKey === "string") ? payload.areaRespawn.currentAreaKey : "",
        schedules: (payload?.areaRespawn?.schedules && typeof payload.areaRespawn.schedules === "object")
          ? Object.fromEntries(
              Object.entries(payload.areaRespawn.schedules)
                .map(([k, v]) => [k, Number(v)])
                .filter(([, v]) => Number.isFinite(v))
            )
          : {},
      },
      debug: normalizeDebugFlags(payload.debug),
    };

    fogEnabled = !!payload.fog;
    minimapEnabled = payload.minimap !== false;

    for (const e of normalizeDynamicEntries(payload.dynamic ?? [])) state.dynamic.set(e.id, e);

    state.player.dead = !!state.player.dead;
    state.player.level = state.player.level ?? 1;
    state.player.xp = Math.max(0, Math.floor(state.player.xp ?? 0));
    state.player.equip = normalizeEquip(state.player.equip ?? {});
    state.player.effects = state.player.effects ?? [];
    state.player.maxHp = Math.max(1, Math.floor(state.player.maxHp ?? maxHpForLevel(state.player.level, state.character)));
    state.player.hp = clamp(Math.floor(state.player.hp ?? state.player.maxHp), 0, state.player.maxHp);
    ensureCharacterState(state);
    state.surfaceLink = resolveSurfaceLink(state);
    state.startSpawn = state.startSpawn ?? computeInitialDepth0Spawn(world);
    if (!normalizeLadderLanding(state.lastLadderLanding)) {
      setLastLadderLanding(state, state.player ?? state.startSpawn);
    }
    ensureSurfaceLinkTile(state);
    if (state.shop && Array.isArray(state.shop.stock)) {
      state.shop.stock = state.shop.stock
        .map((s) => {
          const type = normalizeItemType(s?.type);
          const amountRaw = Math.max(1, Math.floor(s?.amount ?? 1));
          const amount = type === "potion" ? Math.min(5, amountRaw) : 1;
          return { type, price: Math.max(1, Math.floor(s?.price ?? 0)), amount };
        })
        .filter((s) => ITEM_TYPES[s.type]);
      state.shop.lastRefreshMs = Number.isFinite(state.shop.lastRefreshMs) ? state.shop.lastRefreshMs : Date.now();
      state.shop.nextRefreshMs = Number.isFinite(state.shop.nextRefreshMs) ? state.shop.nextRefreshMs : Date.now();
    } else {
      state.shop = null;
    }
    state.debug = normalizeDebugFlags(state.debug);
    ensureShopState(state);

    recalcDerivedStats(state);

    hydrateNearby(state);
    updateAreaRespawnTracking(state, Date.now());
    renderLog(state);
    renderInventory(state);
    renderEquipment(state);
    renderEffects(state);

    return state;
  } catch {
    return null;
  }
}

function saveNow(state) {
  const payload = exportSave(state);
  try { localStorage.setItem(SAVE_KEY, payload); } catch {}
  clearSaveDirty();
}

function saveResumeSnapshot(state) {
  if (!state) return;
  try { localStorage.setItem(SAVE_KEY, exportSave(state)); } catch {}
}

function loadSaveOrNew() {
  bootLoadedFromLocalSave = false;
  const authState = isAuthenticatedUser ? "auth" : "guest";
  try {
    const prevAuthState = String(localStorage.getItem(SAVE_AUTH_STATE_KEY) ?? "");
    if (authState === "guest" && prevAuthState !== "guest") {
      localStorage.removeItem(SAVE_KEY);
    }
  } catch {}
  try { localStorage.setItem(SAVE_AUTH_STATE_KEY, authState); } catch {}
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) {
      const loaded = importSave(s);
      if (loaded) {
        bootLoadedFromLocalSave = true;
        const changed = enforceAdminControlPolicy(loaded);
        if (changed) saveNow(loaded);
        return loaded;
      }
    }
  } catch {}

  // Avoid leaking transformed state to any future direct canvas operations.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = makeNewGame();
  enforceAdminControlPolicy(g);
  return g;
}

// ---------- Buttons ----------
btnNewEl?.addEventListener("click", () => {
  void requestNewDungeonReset(game);
});

btnFogEl?.addEventListener("click", () => {
  if (!canUseAdminControls()) return;
  fogEnabled = !fogEnabled;
  saveNow(game);
});

btnSaveGameEl?.addEventListener("click", () => {
  void openSaveGameOverlay("save");
});

btnLoadGameEl?.addEventListener("click", () => {
  void openSaveGameOverlay("load");
});
authBtnEl?.addEventListener("click", () => {
  if (isAuthenticatedUser) return;
  prepareGuestLoginHandoff(game);
});
btnChooseCharacterEl?.addEventListener("click", () => {
  void openCharacterSelectionOverlay({ purpose: "swap_character" });
});
btnInfoEl?.addEventListener("click", () => {
  setInfoOverlayOpen(true);
});
btnSpriteEditorEl?.addEventListener("click", () => {
  void openSpriteEditorOverlay();
});
btnMonsterEditorEl?.addEventListener("click", () => {
  void openMonsterEditorOverlay();
});
infoCloseBtnEl?.addEventListener("click", () => {
  closeInfoOverlay();
});
infoOverlayEl?.addEventListener("click", (e) => {
  if (e.target === infoOverlayEl) closeInfoOverlay();
});
levelUpCloseBtnEl?.addEventListener("click", () => {
  if (!game) return;
  const ok = confirmLevelUpDraft(game);
  if (!ok) return;
  closeLevelUpOverlay();
});
levelUpOverlayEl?.addEventListener("click", (e) => {
  if (e.target === levelUpOverlayEl) closeLevelUpOverlay();
});
levelUpStatsListEl?.addEventListener("click", (e) => {
  if (!game) return;
  const btn = e.target?.closest?.("button[data-stat-key][data-delta]");
  if (!btn) return;
  const key = String(btn.getAttribute("data-stat-key") ?? "");
  const delta = Number(btn.getAttribute("data-delta") ?? "0");
  if (!Number.isFinite(delta) || delta === 0) return;
  const changed = updateLevelUpDraft(game, key, delta);
  if (!changed) return;
  renderLevelUpOverlay(game);
});
spriteEditorCloseBtnEl?.addEventListener("click", () => {
  closeSpriteEditorOverlay();
});
spriteEditorOverlayEl?.addEventListener("click", (e) => {
  if (e.target === spriteEditorOverlayEl) closeSpriteEditorOverlay();
});
spriteEditorRefreshBtnEl?.addEventListener("click", () => {
  void refreshSpriteOverridesFromServer(false);
});
monsterEditorCloseBtnEl?.addEventListener("click", () => {
  closeMonsterEditorOverlay();
});
monsterEditorOverlayEl?.addEventListener("click", (e) => {
  if (e.target === monsterEditorOverlayEl) closeMonsterEditorOverlay();
});
monsterEditorSearchInputEl?.addEventListener("input", () => {
  monsterEditorSignature = "";
  renderMonsterEditorList();
});
monsterEditorPreviewDepthInputEl?.addEventListener("input", () => {
  renderMonsterEditorPreview();
});
monsterEditorNewBtnEl?.addEventListener("click", () => {
  createMonsterEditorFromTemplate();
});
monsterEditorDuplicateBtnEl?.addEventListener("click", () => {
  duplicateSelectedMonsterEditorEntry();
});
monsterEditorDeleteBtnEl?.addEventListener("click", () => {
  deleteSelectedMonsterEditorEntry();
});
monsterEditorExportBtnEl?.addEventListener("click", () => {
  exportMonsterEditorPayload();
});
monsterEditorImportBtnEl?.addEventListener("click", () => {
  monsterEditorImportInputEl?.click();
});
monsterEditorImportInputEl?.addEventListener("change", () => {
  const file = monsterEditorImportInputEl.files?.[0] ?? null;
  monsterEditorImportInputEl.value = "";
  if (!file) return;
  void importMonsterEditorPayloadFromFile(file);
});
monsterEditorRefreshBtnEl?.addEventListener("click", () => {
  void refreshMonsterEditorFromServer(false);
});
monsterEditorRevertBtnEl?.addEventListener("click", () => {
  monsterEditorUi.workingMonsters = cloneMonsterTypeMapForEditor(monsterEditorUi.baselineMonsters);
  monsterEditorUi.workingSpawnRules = cloneMonsterSpawnRulesForEditor(monsterEditorUi.baselineSpawnRules);
  if (!monsterEditorUi.workingMonsters[monsterEditorUi.selectedId]) {
    monsterEditorUi.selectedId = Object.keys(monsterEditorUi.workingMonsters).sort()[0] ?? "";
  }
  monsterEditorSignature = "";
  populateMonsterEditorForm();
  renderMonsterEditorList();
  renderMonsterEditorPreview();
  refreshMonsterEditorDirtyState();
  setMonsterEditorStatus("Reverted unsaved changes.", false);
});
monsterEditorSaveBtnEl?.addEventListener("click", () => {
  void saveMonsterEditorToServer();
});
monsterEditAdvancedToggleEl?.addEventListener("click", () => {
  setMonsterEditorAdvancedVisible(!monsterEditorUi.showAdvanced);
});
monsterEditSpawnEnabledEl?.addEventListener("change", () => {
  setMonsterEditorSpawnFieldState();
  syncMonsterEditorFromForm();
});
monsterEditorFormEl?.addEventListener("input", () => {
  syncMonsterEditorFromForm();
});
monsterEditorFormEl?.addEventListener("change", () => {
  syncMonsterEditorFromForm();
});
monsterEditorFormEl?.addEventListener("submit", (e) => {
  e.preventDefault();
});
spriteFilterCategoryEl?.addEventListener("change", () => {
  spriteEditorUi.filterCategory = spriteFilterCategoryEl.value || "all";
  spriteEditorSignature = "";
  renderSpriteEditorList();
});
spriteFilterArmorTypeEl?.addEventListener("change", () => {
  spriteEditorUi.filterArmorType = spriteFilterArmorTypeEl.value || "all";
  spriteEditorSignature = "";
  renderSpriteEditorList();
});
spriteFilterMetalTypeEl?.addEventListener("change", () => {
  spriteEditorUi.filterMetalType = spriteFilterMetalTypeEl.value || "all";
  spriteEditorSignature = "";
  renderSpriteEditorList();
});
spriteFilterSourceEl?.addEventListener("change", () => {
  spriteEditorUi.filterSource = spriteFilterSourceEl.value || "all";
  spriteEditorSignature = "";
  renderSpriteEditorList();
});
spriteFilterSearchEl?.addEventListener("input", () => {
  spriteEditorSignature = "";
  renderSpriteEditorList();
});
spriteSelectAllEl?.addEventListener("change", () => {
  const entries = filteredSpriteEditorObjects();
  const visibleIds = [...new Set(entries.map((entry) => String(entry?.spriteId ?? "")).filter(Boolean))];
  if (spriteSelectAllEl.checked) {
    for (const id of visibleIds) spriteEditorUi.selectedSpriteIds.add(id);
  } else {
    for (const id of visibleIds) spriteEditorUi.selectedSpriteIds.delete(id);
  }
  spriteEditorSignature = "";
  renderSpriteEditorList();
});
spriteBulkSetSizeBtnEl?.addEventListener("click", () => {
  const raw = Number(spriteBulkScaleInputEl?.value ?? "");
  if (!Number.isFinite(raw)) {
    setSpriteEditorStatus("Bulk world size must be a number between 25 and 300.", true);
    return;
  }
  const value = clamp(Math.floor(raw), 25, 300);
  if (spriteBulkScaleInputEl && value !== raw) spriteBulkScaleInputEl.value = `${value}`;
  void setSpriteScaleForSelected(value);
});
saveGameCloseBtnEl?.addEventListener("click", () => {
  closeSaveGameOverlay();
});
saveGameOverlayEl?.addEventListener("click", (e) => {
  if (e.target === saveGameOverlayEl) closeSaveGameOverlay();
});
saveGameRefreshBtnEl?.addEventListener("click", () => {
  if (!isAuthenticatedUser) {
    requireSaveLogin();
    return;
  }
  void refreshSaveGameList();
});
saveGameCreateBtnEl?.addEventListener("click", () => {
  void saveCurrentGameToServer("");
});
saveGameNameInputEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  void saveCurrentGameToServer("");
});
saveGameNameInputEl?.addEventListener("input", () => {
  const raw = saveGameNameInputEl.value.trim();
  saveNameWasEdited = raw !== "" && raw !== lastAutoSaveName;
});
characterOverlayPrimaryEl?.addEventListener("click", () => {
  void handleCharacterOverlayPrimary();
});
characterOverlayCloseBtnEl?.addEventListener("click", () => {
  tryCloseCharacterOverlay();
});
characterOverlaySecondaryEl?.addEventListener("click", () => {
  void handleCharacterOverlaySecondary();
});
characterOverlayTertiaryEl?.addEventListener("click", () => {
  void handleCharacterOverlayTertiary();
});
newDungeonConfirmStartEl?.addEventListener("click", () => {
  resolveNewDungeonConfirm(true);
});
newDungeonConfirmCancelEl?.addEventListener("click", () => {
  resolveNewDungeonConfirm(false);
});
newDungeonConfirmOverlayEl?.addEventListener("click", (e) => {
  if (e.target === newDungeonConfirmOverlayEl) resolveNewDungeonConfirm(false);
});
btnDebugMenuEl?.addEventListener("click", (e) => {
  if (!canUseAdminControls()) return;
  e.stopPropagation();
  if (game) updateDebugMenuUi(game);
  const open = !(debugMenuEl?.classList.contains("show"));
  setDebugMenuOpen(open);
});
debugMenuEl?.addEventListener("click", (e) => {
  e.stopPropagation();
});
document.addEventListener("click", (e) => {
  if (!debugMenuWrapEl) return;
  if (debugMenuWrapEl.contains(e.target)) return;
  setDebugMenuOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (isLevelUpOverlayOpen()) {
    e.preventDefault();
    closeLevelUpOverlay();
    return;
  }
  if (isCharacterOverlayOpen()) {
    e.preventDefault();
    tryCloseCharacterOverlay();
    return;
  }
  if (isSpriteEditorOverlayOpen()) {
    e.preventDefault();
    closeSpriteEditorOverlay();
    return;
  }
  if (isMonsterEditorOverlayOpen()) {
    e.preventDefault();
    closeMonsterEditorOverlay();
    return;
  }
  if (isInfoOverlayOpen()) {
    e.preventDefault();
    closeInfoOverlay();
    return;
  }
  if (isSaveGameOverlayOpen()) {
    e.preventDefault();
    closeSaveGameOverlay();
    return;
  }
  if (isNewDungeonConfirmOpen()) {
    e.preventDefault();
    resolveNewDungeonConfirm(false);
    return;
  }
  setDebugMenuOpen(false);
});
toggleGodmodeEl?.addEventListener("change", () => {
  if (!game) return;
  if (!canUseAdminControls()) return;
  setDebugFlag(game, "godmode", !!toggleGodmodeEl.checked);
  updateDebugMenuUi(game);
});
toggleFreeShoppingEl?.addEventListener("change", () => {
  if (!game) return;
  if (!canUseAdminControls()) return;
  setDebugFlag(game, "freeShopping", !!toggleFreeShoppingEl.checked);
  updateDebugMenuUi(game);
  if (shopUi.open) renderShopOverlay(game);
});
toggleGhostEl?.addEventListener("change", () => {
  if (!game) return;
  if (!canUseAdminControls()) return;
  setDebugFlag(game, "ghost", !!toggleGhostEl.checked);
  updateDebugMenuUi(game);
});
toggleLockpickEl?.addEventListener("change", () => {
  if (!game) return;
  if (!canUseAdminControls()) return;
  setDebugFlag(game, "lockpick", !!toggleLockpickEl.checked);
  updateDebugMenuUi(game);
});
const runDebugDepthTeleport = () => {
  if (!canUseAdminControls()) return;
  if (!game || !debugDepthInputEl) return;
  const raw = debugDepthInputEl.value.trim();
  if (!raw.length) {
    pushLog(game, "Enter a depth value.");
    return;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    pushLog(game, "Invalid depth value.");
    return;
  }
  teleportPlayerToDepth(game, parsed);
};
debugDepthGoEl?.addEventListener("click", (e) => {
  e.preventDefault();
  runDebugDepthTeleport();
});
debugDepthInputEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  runDebugDepthTeleport();
});
const runDebugSetLevel = () => {
  if (!canUseAdminControls()) return;
  if (!game || !debugLevelInputEl) return;
  const raw = debugLevelInputEl.value.trim();
  if (!raw.length) {
    pushLog(game, "Enter a level value.");
    return;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    pushLog(game, "Invalid level value.");
    return;
  }
  setPlayerLevelDebug(game, parsed);
};
debugLevelGoEl?.addEventListener("click", (e) => {
  e.preventDefault();
  runDebugSetLevel();
});
debugLevelInputEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  runDebugSetLevel();
});
shopCloseBtnEl?.addEventListener("click", () => {
  closeShopOverlay();
});
shopTabBuyEl?.addEventListener("click", () => {
  if (!game) return;
  shopUi.mode = "buy";
  renderShopOverlay(game);
});
shopTabSellEl?.addEventListener("click", () => {
  if (!game) return;
  shopUi.mode = "sell";
  renderShopOverlay(game);
});
shopkeeperBuyPortraitEl?.addEventListener("error", () => {
  if (!shopkeeperBuyPortraitWrapEl) return;
  shopkeeperBuyPortraitWrapEl.style.display = "none";
  shopkeeperBuyPortraitWrapEl.setAttribute("aria-hidden", "true");
});
shopOverlayEl?.addEventListener("click", (e) => {
  if (e.target === shopOverlayEl) closeShopOverlay();
});
btnMobileGearEl?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!isCompactMobileUi()) return;
  setMobileGearOpen(!mobileUi.gearOpen);
});
btnMobileLogEl?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!isCompactMobileUi()) return;
  setMobileLogExpanded(!mobileUi.logExpanded);
});
mobileOverlayBackdropEl?.addEventListener("click", () => {
  closeMobilePanels();
});
contextActionBtn?.addEventListener("click", () => {
  if (!game) return;
  const action = resolveContextAction(game);
  if (!action) return;
  takeTurn(game, action.run());
});
contextPotionBtn?.addEventListener("click", () => {
  if (!game) return;
  takeTurn(game, usePotionFromContext(game));
});
btnRespawnEl?.addEventListener("click", () => {
  if (!game || !game.player?.dead) return;
  closeShopOverlay();
  respawnAtStart(game);
});
btnNewDungeonEl?.addEventListener("click", () => {
  void requestNewDungeonReset(game);
});

const bindEquipBadgeUnequip = (el, slot) => {
  el?.addEventListener("click", () => {
    if (!game) return;
    unequipSlotToInventory(game, slot);
  });
};
bindEquipBadgeUnequip(equipBadgeWeaponEl, "weapon");
bindEquipBadgeUnequip(equipBadgeHeadEl, "head");
bindEquipBadgeUnequip(equipBadgeTorsoEl, "chest");
bindEquipBadgeUnequip(equipBadgeLegsEl, "legs");
equipSectionToggleEl?.addEventListener("click", () => {
  overlaySections.equipmentCollapsed = !overlaySections.equipmentCollapsed;
  updateOverlaySectionUi();
});
inventorySectionToggleEl?.addEventListener("click", () => {
  overlaySections.inventoryCollapsed = !overlaySections.inventoryCollapsed;
  updateOverlaySectionUi();
});

// ---------- Main ----------
let game = null;

function showFatal(err) {
  console.error(err);
  try {
    if (game?.log) {
      game.log.push(`FATAL: ${err?.message ?? String(err)}`);
      renderLog(game);
    } else {
      logEl.textContent = `FATAL: ${err?.message ?? String(err)}`;
    }
  } catch {}
}

window.addEventListener("error", (e) => showFatal(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason ?? e));

try {
  applyMonsterEditorPayload(
    monsterEditorBootstrapPayload ?? {
      version: 1,
      monsters: cloneMonsterTypeMapForEditor(MONSTER_TYPES),
      spawn_rules: cloneMonsterSpawnRulesForEditor(MONSTER_SPAWN_RULES),
      updated_at: "",
    }
  );
  monsterEditorResetWorkingFromRuntime();
  setMonsterEditorAdvancedVisible(false);
  try {
    game = loadSaveOrNew();
  } catch (err) {
    console.error("loadSaveOrNew failed, falling back to new game", err);
    game = null;
  }
  if (!game || !game.player || !game.world) {
    game = makeNewGame();
  }
  if (enforceAdminControlPolicy(game)) saveNow(game);
  spriteEditorUi.objects = buildSpriteObjectCatalog();
  updateSpriteEditorFilterControls();
  refreshSaveNameFromLive(true);
  removeLegacyAttributePanel();
  updateOverlaySectionUi();
  updateDebugMenuUi(game);
  updateContextActionButton(game);
  updateDeathOverlay(game);
  renderInfoOverlay(game);
  renderInventory(game);
  renderEquipment(game);
  renderEffects(game);
  renderLog(game);
  markCharacterStateDirty(game, "startup");
  void syncCharacterStateIfDirty("startup");
  void refreshSpriteOverridesFromServer(true);
  void startCharacterFlow().then(() => {
    void maybeHandlePostLoginGuestImport();
  });
  syncBodyModalLock();
  syncMobileUi(true);
  const flushAutosaveLifecycle = () => {
    if (!game) return;
    saveResumeSnapshot(game);
    if (saveRuntime.autoTimer) {
      clearTimeout(saveRuntime.autoTimer);
      saveRuntime.autoTimer = 0;
    }
    if (characterSyncRuntime.timer) {
      clearTimeout(characterSyncRuntime.timer);
      characterSyncRuntime.timer = 0;
    }
    if (characterSyncRuntime.dirty) {
      void syncCharacterStateIfDirty("lifecycle");
    }
    if (!saveRuntime.dirty) return;
    if (!isAuthenticatedUser) {
      saveNow(game);
      return;
    }
    void autosaveIfDirty("lifecycle");
  };
  window.addEventListener("pagehide", flushAutosaveLifecycle);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    flushAutosaveLifecycle();
  });
  window.addEventListener("beforeunload", flushAutosaveLifecycle);
  document.addEventListener("keydown", (e) => onKey(game, e));
  window.addEventListener("resize", () => syncMobileUi(true));
  // Initialize touch controls (mobile): wire on-screen buttons to existing actions
  function initTouchControls() {
    try {
      const tc = document.getElementById('touchControls');
      if (!tc) return;

      const handleDpad = (dx, dy) => {
        if (!game) return;
        if (dx === 0 && dy === 0) {
          const action = resolveContextAction(game);
          if (action) takeTurn(game, action.run());
        } else {
          takeTurn(game, playerMoveOrAttack(game, dx, dy));
        }
      };

      // Pointer-based input handling with tap-vs-hold semantics for reliable touch
      const activePointers = new Map();
      const initialDelay = 300; // ms before repeating starts
      const repeatInterval = 120; // ms between repeats

      tc.addEventListener('pointerdown', (ev) => {
        try {
          const btn = ev.target.closest && ev.target.closest('.dpad-btn');
          if (!btn) return;
          ev.preventDefault();
          try { btn.setPointerCapture && btn.setPointerCapture(ev.pointerId); } catch {}

          if (btn.classList.contains('dpad-btn')) {
            const dx = Number(btn.dataset.dx || 0);
            const dy = Number(btn.dataset.dy || 0);
            const entry = { btn, type: 'dpad', start: Date.now(), dx, dy, firedRepeat: false };
            entry.initialTimeout = setTimeout(() => {
              // initial delay elapsed: fire first move and start repeating
              try { handleDpad(dx, dy); } catch {}
              entry.firedRepeat = true;
              entry.repeatInterval = setInterval(() => { try { handleDpad(dx, dy); } catch {} }, repeatInterval);
            }, initialDelay);
            activePointers.set(ev.pointerId, entry);
          }
        } catch (e) { /* ignore */ }
      }, { passive: false });

      const finishPointer = (ev, invokeOnTap = true) => {
        try {
          const entry = activePointers.get(ev.pointerId);
          if (!entry) return;
          try { entry.btn.releasePointerCapture && entry.btn.releasePointerCapture(ev.pointerId); } catch {}
          // clear timers
          if (entry.initialTimeout) { clearTimeout(entry.initialTimeout); entry.initialTimeout = null; }
          if (entry.repeatInterval) { clearInterval(entry.repeatInterval); entry.repeatInterval = null; }

          const elapsed = Date.now() - (entry.start || 0);
          if (entry.type === 'dpad') {
            // If the initial delay did not elapse, treat as tap on release
            if (!entry.firedRepeat && elapsed < initialDelay && invokeOnTap) {
              try { handleDpad(entry.dx, entry.dy); } catch {}
            }
          }
          activePointers.delete(ev.pointerId);
        } catch (e) { /* ignore */ }
      };

      tc.addEventListener('pointerup', (ev) => { ev.preventDefault(); finishPointer(ev, true); }, { passive: false });
      tc.addEventListener('pointercancel', (ev) => { finishPointer(ev, false); }, { passive: false });
      // Prevent synthetic clicks from causing double-invoke
      tc.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, true);
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('load', initTouchControls);

  let lastFrameTs = 0;
  const targetFrameMs = 1000 / 30;
  function loop(ts) {
    const now = Number.isFinite(ts)
      ? ts
      : ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
    if (now - lastFrameTs >= targetFrameMs) {
      try {
        draw(game);
      } catch (err) {
        showFatal(err);
        try {
          game = makeNewGame();
          updateDebugMenuUi(game);
          updateContextActionButton(game);
          updateDeathOverlay(game);
          renderInfoOverlay(game);
          renderInventory(game);
          renderEquipment(game);
          renderEffects(game);
          renderLog(game);
        } catch (fallbackErr) {
          showFatal(fallbackErr);
        }
      }
      lastFrameTs = now;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
} catch (err) {
  showFatal(err);
}

function tryOpenAdjacentDoor(state) {
  const p = state.player;
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (t !== DOOR_CLOSED) continue;

    // Opening a closed door does not require checking occupancy
    state.world.setTile(x, y, p.z, DOOR_OPEN);
    pushLog(state, "You open the door.");
    state.visitedDoors?.add(keyXYZ(x, y, p.z));
    return true;
  }
  pushLog(state, "No closed door adjacent to open.");
  return false;
}
