import {
  LOCAL_SLOT_BACKUP_MIGRATED_KEY,
  LOCAL_SLOT_MAX,
  createLocalSlotStore,
} from "./client/save/saveManager.js?v=20260315a";
import { createAuthoritativeApi } from "./client/net/authoritativeApi.js?v=20260318d";
import {
  abilityCommand,
  attackCommand,
  buyShopItemCommand,
  closeDoorCommand,
  disarmTrapCommand,
  dropItemCommand,
  interactCommand,
  moveCommand,
  openDoorCommand,
  pickupCommand,
  sellShopItemCommand,
  stairsCommand,
  unequipItemCommand,
  useItemCommand,
  useShrineCommand,
  waitCommand,
} from "./client/input/authoritativeCommands.js?v=20260318c";
import {
  drawCellHighlight,
  drawFootShadow,
  drawIntentBadge,
  drawLineTelegraph,
  drawTargetRing,
} from "./client/render/intentOverlays.js?v=20260315a";
import {
  SPRITE_PROFILE_VERSION,
  buildCombatAdjacencyClusters,
  computeSpriteDrawMetrics,
  defaultSpriteProfile,
  ensureSpriteBounds,
  getSpriteCombatOffset,
  normalizeSpriteProfiles,
} from "./client/render/spriteProfiles.js?v=20260315a";
import {
  activeAbilityCostForPlayer,
  activeAbilityForClass,
  activeAbilityRangeForPlayer,
  activeAbilityStatus,
  canPlayerUseActiveAbility,
} from "./client/gameplay/abilities.js?v=20260315a";
import {
  buildChunkEncounterProfile,
  weightedMonsterTableForEncounter,
} from "./client/gameplay/roomArchetypes.js?v=20260315a";
import {
  chooseTrapFamily,
  trapDamageMultiplier,
  trapFamilyDef,
  trapRevealStyle,
} from "./client/gameplay/traps.js?v=20260315a";
import { createAnalyticsApi } from "./client/telemetry/analyticsApi.js?v=20260318e";
import {
  HEARTBEAT_INTERVAL_MS,
  accumulateAnalyticsTime,
  advanceAnalyticsTurn,
  analyticsNeedsHeartbeat,
  analyticsSnapshotForSave,
  buildHeartbeatPayload,
  buildRunEndPayload,
  buildRunStartPayload,
  createOrResumeAnalyticsState,
  drainAnalyticsEvents,
  enterAnalyticsFloor,
  markAnalyticsEnded,
  markAnalyticsHeartbeat,
  markAnalyticsInput,
  queueAnalyticsEvent,
  recordAnalyticsCounter,
  recordAnalyticsDamage,
  recordAnalyticsDiscovery,
  recordAnalyticsKill,
  recordAnalyticsMovement,
} from "./client/telemetry/runStats.js?v=20260315a";
import {
  applyAuthoritativeResponseToMirror,
  createServerMirror,
  nextServerMirrorCommandSeq,
  resetServerMirror,
  setServerMirrorInFlight,
} from "./client/state/serverMirror.js?v=20260317a";
import {
  clearPendingAction,
  createPendingActionState,
  startPendingAction,
} from "./client/ui/pendingActionState.js?v=20260317b";

const HEADLESS_RUNTIME = globalThis.__DUNGEONPUNK_HEADLESS__ === true;

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
const DEBUG_ROSTER_LEFT_RIGHT_PADDING = 5;
const DEBUG_ROSTER_FIRST_ROW_OFFSET = 5;
const DEBUG_ROSTER_CELL_GAP = 4;
const DEBUG_ROSTER_ID_PREFIX = "dbg_roster|";

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
const RANGED_ATTACK_RANGE_BONUS = 1;
const STAIRS_DOWN_SPAWN_CHANCE = 0.48;
const STAIRS_UP_SPAWN_CHANCE = 0.50;
const EDGE_SHADE_PX = Math.max(2, Math.floor(TILE * 0.12));
const CORNER_CHAMFER_PX = Math.max(3, Math.floor(TILE * 0.22));
const EDGE_SOFT_PX = Math.max(2, Math.floor(TILE * 0.08));
const FEATURE_FLAGS = Object.freeze({
  spriteFootprints: true,
  roomArchetypes: true,
  advancedTraps: true,
  monsterIntentTelegraphs: true,
  telemetryUpload: true,
  adminConsole: true,
  classActives: true,
});
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
const authoritativeEnabled = document.body?.dataset?.authoritativeEnabled === "1";
const saveApiCsrfToken = document.body?.dataset?.saveCsrf ?? "";
const saveSlotMax = Math.max(1, Number.parseInt(document.body?.dataset?.saveMaxSlots ?? "10", 10) || 10);
const characterSlotMax = Math.max(1, Number.parseInt(document.body?.dataset?.characterMaxSlots ?? "5", 10) || 5);
const saveNameMaxLen = Math.max(1, Number.parseInt(document.body?.dataset?.saveNameMaxLen ?? "48", 10) || 48);
const BROWSER_INSTANCE_ID_STORAGE_KEY = "d25_browser_instance_id";
const ANALYTICS_ACTOR_ID_STORAGE_KEY = "d25_analytics_actor_id";

function resolveAnalyticsActorId() {
  if (isAuthenticatedUser) return "";
  const fallback = () => `guest:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  let id = "";
  try {
    id = String(localStorage.getItem(ANALYTICS_ACTOR_ID_STORAGE_KEY) ?? "").trim().toLowerCase();
  } catch {}
  if (!/^guest:[a-z0-9_\-]{12,120}$/.test(id)) {
    id = fallback().replace(/[^a-z0-9:_\-]/g, "");
    if (!/^guest:[a-z0-9_\-]{12,120}$/.test(id)) {
      id = `guest:${Math.random().toString(36).slice(2, 14)}`.replace(/[^a-z0-9:_\-]/g, "");
    }
    try {
      localStorage.setItem(ANALYTICS_ACTOR_ID_STORAGE_KEY, id);
    } catch {}
  }
  return id;
}

const analyticsApi = createAnalyticsApi({
  baseUrl: "./index.php",
  csrfToken: saveApiCsrfToken,
  actorId: resolveAnalyticsActorId(),
});
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
const btnGuestNewCharacterEl = document.getElementById("btnGuestNewCharacter");
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
const contextAbilityBtn = document.getElementById("contextAbilityBtn");
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
const characterSwitchConfirmOverlayEl = document.getElementById("characterSwitchConfirmOverlay");
const characterSwitchConfirmTitleEl = document.getElementById("characterSwitchConfirmTitle");
const characterSwitchConfirmTextEl = document.getElementById("characterSwitchConfirmText");
const characterSwitchConfirmConfirmEl = document.getElementById("characterSwitchConfirmConfirm");
const characterSwitchConfirmCancelEl = document.getElementById("characterSwitchConfirmCancel");
const guestNewCharacterOverlayEl = document.getElementById("guestNewCharacterOverlay");
const guestNewCharacterCurrentCardEl = document.getElementById("guestNewCharacterCurrentCard");
const guestNewCharacterConfirmEl = document.getElementById("guestNewCharacterConfirm");
const guestNewCharacterCancelEl = document.getElementById("guestNewCharacterCancel");
const guestLoginImportOverlayEl = document.getElementById("guestLoginImportOverlay");
const guestLoginImportCharacterCardEl = document.getElementById("guestLoginImportCharacterCard");
const guestLoginImportConfirmEl = document.getElementById("guestLoginImportConfirm");
const guestLoginImportDeclineEl = document.getElementById("guestLoginImportDecline");
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
const debugClearRadiusInputEl = document.getElementById("debugClearRadiusInput");
const debugClearGoEl = document.getElementById("debugClearGo");
const debugRosterGoEl = document.getElementById("debugRosterGo");
const debugQuickSwitchClassEl = document.getElementById("debugQuickSwitchClass");
const debugQuickSwitchGoEl = document.getElementById("debugQuickSwitchGo");
const debugQuickSwitchStatusEl = document.getElementById("debugQuickSwitchStatus");
const mainCanvasWrapEl = document.getElementById("mainCanvasWrap");
const surfaceCompassEl = document.getElementById("surfaceCompass");
const surfaceCompassArrowEl = document.getElementById("surfaceCompassArrow");

// Right-side panels: panels are always visible; keep references for layout if needed
const wrapEl = document.getElementById("wrap");
const rightColEl = document.getElementById("rightCol");
let cacheBustCounter = 0;
const authoritativeMirror = createServerMirror();
const authoritativePendingAction = createPendingActionState();
let lifecycleAuthoritativeCloseRequested = false;
const AUTHORITATIVE_SESSION_TOUCH_INTERVAL_MS = 15000;
const authoritativeSessionRuntime = {
  touchTimer: 0,
  touchInFlight: false,
  lastTouchAt: 0,
};

function resolveBrowserInstanceId() {
  const fallback = () => `browser_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  let id = "";
  try {
    id = String(localStorage.getItem(BROWSER_INSTANCE_ID_STORAGE_KEY) ?? "").trim().toLowerCase();
  } catch {}
  if (!/^[a-z0-9_\-]{12,120}$/.test(id)) {
    id = fallback().replace(/[^a-z0-9_\-]/g, "");
    if (!/^[a-z0-9_\-]{12,120}$/.test(id)) {
      id = `browser_${Math.random().toString(36).slice(2, 14)}`.replace(/[^a-z0-9_\-]/g, "");
    }
    try {
      localStorage.setItem(BROWSER_INSTANCE_ID_STORAGE_KEY, id);
    } catch {}
  }
  return id;
}

function withCacheBust(url) {
  const sep = url.includes("?") ? "&" : "?";
  cacheBustCounter += 1;
  const token = `${appBuildVersion}.${Date.now().toString(36)}.${Math.floor(Math.random() * 1e9).toString(36)}.${cacheBustCounter.toString(36)}`;
  return `${url}${sep}_cb=${encodeURIComponent(token)}`;
}

const authoritativeApi = createAuthoritativeApi({
  baseUrl: "./index.php",
  csrfToken: saveApiCsrfToken,
  browserInstanceId: resolveBrowserInstanceId(),
  cacheBust: withCacheBust,
});

function isAuthoritativeModeEnabled() {
  return authoritativeEnabled && isAuthenticatedUser;
}

function isAuthoritativeSessionActive() {
  return isAuthoritativeModeEnabled() && !!authoritativeMirror.sessionId;
}

function canMutateGameplayStateLocally() {
  return HEADLESS_RUNTIME || !isAuthoritativeSessionActive();
}

function setAuthoritativeInputLock(locked = false, descriptor = null) {
  if (locked) startPendingAction(authoritativePendingAction, descriptor);
  else clearPendingAction(authoritativePendingAction);
  setServerMirrorInFlight(authoritativeMirror, locked);
}

function authoritativeErrorMessage(err, fallback = "Authoritative action failed.") {
  const direct = String(err?.message ?? err?.response?.error ?? "").trim();
  return direct || fallback;
}

function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback.slice();
}

function normalizeLoadedStateCollections(state) {
  if (!state || typeof state !== "object") return state;
  state.log = ensureArray(state.log);
  state.inv = normalizeInventoryEntries(state.inv ?? [], {
    speciesId: state?.character?.speciesId ?? state?.player?.speciesId,
    classId: state?.character?.classId ?? state?.player?.classId,
    ownerId: state?.character?.id ?? null,
  });
  if (state.player && typeof state.player === "object") {
    state.player.effects = ensureArray(state.player.effects);
  }
  return state;
}

function activateLoadedGameState(nextGame, reason = "load") {
  if (!nextGame?.player || !nextGame?.world) return false;
  normalizeLoadedStateCollections(nextGame);
  game = nextGame;
  computeVisibility(game);
  hydrateNearby(game);
  enforceAdminControlPolicy(game);
  updateDebugMenuUi(game);
  setDebugMenuOpen(false);
  renderInventory(game);
  renderEquipment(game);
  renderEffects(game);
  renderLog(game);
  renderInfoOverlay(game);
  renderCharacterStatsPanel(game);
    if (shopUi.open) renderShopOverlay(game);
  updateContextActionButton(game);
  updateDeathOverlay(game);
  refreshSaveNameFromLive(true);
  resetItemAuthorityRuntime(itemAuthorityCharacterIdForState(game));
  if (reason === "respawn-autosave") {
    applyRespawnRecoveryState(game);
  }
  if (isAuthoritativeSessionActive()) clearSaveDirty();
  else saveNow(game);
  restartAnalyticsHeartbeatLoop(game);
  void flushAnalyticsIfNeeded(game, `${reason}-load`);
  return true;
}

function applyAuthoritativeSnapshotToGame(response, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const data = (response && typeof response === "object") ? response : {};
  applyAuthoritativeResponseToMirror(authoritativeMirror, data);
  const payload = String(data?.snapshot?.payload ?? "").trim();
  if (!payload) return false;
  const loaded = importSave(payload);
  if (!loaded) return false;
  if (!activateLoadedGameState(loaded, String(opts.reason ?? "authoritative"))) return false;
  if (Array.isArray(data?.saves)) saveMenuUi.saves = data.saves;
  if (data?.save?.id) {
    const saveId = String(data.save.id ?? "").trim();
    if (saveNameLooksLikeAutosave(data?.save?.name ?? "")) saveRuntime.activeAutosaveSaveId = saveId;
    else saveRuntime.activeRunSaveId = saveId;
  }
  if (opts.clearDirty === true) clearSaveDirty();
  else if (opts.markDirty === true) {
    saveRuntime.dirty = true;
    saveRuntime.dirtyReason = String(opts.dirtyReason ?? "authoritative");
    saveRuntime.lastDirtyAt = Date.now();
  }
  lifecycleAuthoritativeCloseRequested = false;
  restartAuthoritativeSessionTouchLoop();
  return true;
}

async function requestAuthoritativeResync(reason = "resync") {
  if (!isAuthoritativeSessionActive()) return false;
  try {
    const response = await authoritativeApi.requestResync({
      sessionId: authoritativeMirror.sessionId,
    });
    return applyAuthoritativeSnapshotToGame(response, { clearDirty: false, reason });
  } catch (err) {
    if (game?.log) {
      pushLog(game, authoritativeErrorMessage(err, "Could not resync the authoritative run."));
      renderLog(game);
    }
    return false;
  }
}

async function performAuthoritativeCommand(command, options = null) {
  if (!isAuthoritativeSessionActive()) return false;
  if (!command || typeof command !== "object") return false;
  if (authoritativeMirror.inFlight) return false;
  const opts = (options && typeof options === "object") ? options : {};
    setAuthoritativeInputLock(true, {
      type: String(command.type ?? "").trim().toUpperCase(),
      reason: String(opts.reason ?? command.type ?? "authoritative-command"),
    });
  try {
    const response = await authoritativeApi.sendCommand({
      sessionId: authoritativeMirror.sessionId,
      clientCommandSeq: nextServerMirrorCommandSeq(authoritativeMirror),
      command,
    });
    const applied = applyAuthoritativeSnapshotToGame(response, {
      markDirty: !!response?.ok,
      dirtyReason: String(opts.dirtyReason ?? command.type ?? "authoritative-command"),
      reason: String(opts.reason ?? command.type ?? "authoritative-command"),
    });
    if (!applied) throw new Error("Authoritative snapshot was invalid.");
    if (!response?.ok && response?.error) {
      pushLog(game, String(response.error));
      renderLog(game);
    }
    return !!response?.ok;
  } catch (err) {
    const message = authoritativeErrorMessage(err, "Authoritative command failed.");
    if (game?.log) {
      pushLog(game, message);
      renderLog(game);
    }
    if (String(err?.response?.status_code ?? "") === "409") {
      void requestAuthoritativeResync("command-conflict");
    }
    return false;
  } finally {
    setAuthoritativeInputLock(false);
    updateContextActionButton(game);
  }
}

function stopAuthoritativeSessionTouchLoop() {
  if (!authoritativeSessionRuntime.touchTimer) return;
  clearInterval(authoritativeSessionRuntime.touchTimer);
  authoritativeSessionRuntime.touchTimer = 0;
}

async function touchAuthoritativeSession(reason = "interval") {
  if (!isAuthoritativeSessionActive()) return false;
  if (authoritativeSessionRuntime.touchInFlight) return false;
  const sessionId = String(authoritativeMirror.sessionId ?? "").trim();
  if (!sessionId) return false;
  const now = Date.now();
  if ((now - authoritativeSessionRuntime.lastTouchAt) < (AUTHORITATIVE_SESSION_TOUCH_INTERVAL_MS - 500)) {
    return false;
  }
  authoritativeSessionRuntime.touchInFlight = true;
  try {
    await authoritativeApi.touchSession({ sessionId });
    authoritativeSessionRuntime.lastTouchAt = Date.now();
    return true;
  } catch {
    return false;
  } finally {
    authoritativeSessionRuntime.touchInFlight = false;
  }
}

function restartAuthoritativeSessionTouchLoop() {
  stopAuthoritativeSessionTouchLoop();
  authoritativeSessionRuntime.touchInFlight = false;
  authoritativeSessionRuntime.lastTouchAt = 0;
  if (HEADLESS_RUNTIME) return;
  if (!isAuthoritativeModeEnabled()) return;
  authoritativeSessionRuntime.touchTimer = setInterval(() => {
    void touchAuthoritativeSession("interval");
  }, AUTHORITATIVE_SESSION_TOUCH_INTERVAL_MS);
  void touchAuthoritativeSession("startup");
}

function requestLifecycleAuthoritativeClose(reason = "lifecycle-close") {
  if (lifecycleAuthoritativeCloseRequested) return false;
  if (!isAuthoritativeSessionActive()) return false;
  const sessionId = String(authoritativeMirror.sessionId ?? "").trim();
  if (!sessionId) return false;
  lifecycleAuthoritativeCloseRequested = true;
  stopAuthoritativeSessionTouchLoop();
  void authoritativeApi.closeSession({
    sessionId,
    reason: String(reason ?? "").trim() || "lifecycle-close",
    bestEffort: true,
  });
  return true;
}

async function openAuthoritativeSessionForSelection(characterId = "", options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const response = await authoritativeApi.openSession({
    characterId: String(characterId ?? "").trim(),
    saveId: String(opts.saveId ?? "").trim(),
    forceEntrance: opts.forceEntrance === true,
    freshWorld: opts.freshWorld === true,
  });
  const applied = applyAuthoritativeSnapshotToGame(response, {
    clearDirty: true,
    reason: String(opts.reason ?? "open-session"),
  });
  if (!applied) throw new Error("Authoritative session snapshot was invalid.");
  return response;
}

async function switchAuthoritativeCharacter(characterId = "", options = null) {
  const targetId = String(characterId ?? "").trim();
  if (!targetId) return false;
  const opts = (options && typeof options === "object") ? options : {};
  try {
    const response = isAuthoritativeSessionActive()
      ? await authoritativeApi.switchCharacter({
        sessionId: authoritativeMirror.sessionId,
        characterId: targetId,
        forceEntrance: opts.forceEntrance === true,
      })
      : await openAuthoritativeSessionForSelection(targetId, {
        forceEntrance: opts.forceEntrance === true,
        reason: "switch-bootstrap",
      });
    return applyAuthoritativeSnapshotToGame(response, {
      clearDirty: true,
      reason: String(opts.reason ?? "switch-character"),
    });
  } catch (err) {
    if (game?.log) {
      pushLog(game, authoritativeErrorMessage(err, "Could not switch character."));
      renderLog(game);
    }
    return false;
  }
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
    !!characterSwitchConfirmOverlayEl?.classList.contains("show") ||
    !!guestNewCharacterOverlayEl?.classList.contains("show") ||
    !!guestLoginImportOverlayEl?.classList.contains("show") ||
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
const shopUi = { open: false, mode: "buy", selectedBuy: 0, selectedSell: 0, lastRefreshRequestAt: 0 };
const overlaySections = { equipmentCollapsed: false, inventoryCollapsed: false };
const mobileUi = { gearOpen: false, logExpanded: false };
let mobileUiSig = "";
let contextAuxSignature = "";
let dpadCenterSignature = "";
let contextActionButtonSignature = "";
let contextAbilityButtonSignature = "";
let contextPotionButtonSignature = "";
let currentContextAction = null;
let currentAbilityContextAction = null;
let newDungeonConfirmResolver = null;
let characterSwitchConfirmResolver = null;
let guestNewCharacterResolver = null;
let guestLoginImportResolver = null;
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
function ensureCharacterSlotsList(slots = null) {
  return Array.isArray(slots) ? slots : [];
}
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
  activeAutosaveSaveId: "",
};
const characterSyncRuntime = {
  dirty: false,
  reason: "",
  timer: 0,
  syncing: false,
  lastSyncAt: 0,
};
const itemAuthorityRuntime = {
  ready: false,
  loading: false,
  processing: false,
  characterId: "",
  revision: 0,
  queue: [],
  baselineAt: 0,
  lastSnapshotMap: null,
  lastSyncAt: 0,
  lastError: "",
};
const spriteOverrideState = { overrides: {}, scales: {}, profiles: {}, entries: [] };
const monsterEditorState = { version: 1, monsters: {}, spawnRules: [], updatedAt: "" };
const spriteBoundsCache = Object.create(null);
const analyticsRuntime = {
  heartbeatTimer: 0,
  flushing: false,
  lastError: "",
};

function stopAnalyticsHeartbeatLoop() {
  if (!analyticsRuntime.heartbeatTimer) return;
  clearInterval(analyticsRuntime.heartbeatTimer);
  analyticsRuntime.heartbeatTimer = 0;
}

function restartAnalyticsHeartbeatLoop(state = null) {
  stopAnalyticsHeartbeatLoop();
  if (HEADLESS_RUNTIME || !FEATURE_FLAGS.telemetryUpload) return;
  const nextState = state ?? game;
  if (!nextState?.player || !nextState?.world) return;
  const intervalMs = Math.max(5000, Math.floor(HEARTBEAT_INTERVAL_MS / 2));
  analyticsRuntime.heartbeatTimer = setInterval(() => {
    if (!game?.player || !game?.world) return;
    void flushAnalyticsIfNeeded(game, "interval");
  }, intervalMs);
  void flushAnalyticsIfNeeded(nextState, "startup");
}
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
let occupancyCache = { monsters: new Map(), items: new Map(), traps: new Map(), actors: new Map() };

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
  spriteOverrideState.profiles = normalizeSpriteProfiles(payload.profiles ?? {}, spriteOverrideState.scales);
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
function ensureQuickSwitchState(state) {
  if (!state || typeof state !== "object") return null;
  if (!state.quickSwitch || typeof state.quickSwitch !== "object") {
    state.quickSwitch = {
      active: false,
      baseCharacterId: "",
      baseClassId: "",
      baseSpeciesId: "",
      baseName: "",
      startedAt: 0,
    };
  }
  const qs = state.quickSwitch;
  qs.active = !!qs.active;
  qs.baseCharacterId = String(qs.baseCharacterId ?? "");
  qs.baseClassId = String(qs.baseClassId ?? "");
  qs.baseSpeciesId = String(qs.baseSpeciesId ?? "");
  qs.baseName = String(qs.baseName ?? "");
  qs.startedAt = Number.isFinite(qs.startedAt) ? Math.floor(qs.startedAt) : 0;
  return qs;
}
function isQuickSwitchCharacterActive(state) {
  if (!state || typeof state !== "object") return false;
  return !!state?.quickSwitch?.active;
}
function clearQuickSwitchCharacterState(state) {
  const qs = ensureQuickSwitchState(state);
  if (!qs) return false;
  const changed = qs.active || qs.baseCharacterId || qs.baseClassId || qs.baseSpeciesId || qs.baseName || qs.startedAt;
  qs.active = false;
  qs.baseCharacterId = "";
  qs.baseClassId = "";
  qs.baseSpeciesId = "";
  qs.baseName = "";
  qs.startedAt = 0;
  const profile = state?.character;
  if (profile && typeof profile === "object" && typeof profile.name === "string") {
    profile.name = profile.name.replace(/\s+\[Quick\]\s*$/i, "");
  }
  return !!changed;
}
function clearQuickSwitchPersistenceRuntime() {
  clearSaveDirty();
  saveRuntime.pendingAutosaveReason = "";
  if (characterSyncRuntime.timer) {
    clearTimeout(characterSyncRuntime.timer);
    characterSyncRuntime.timer = 0;
  }
  characterSyncRuntime.dirty = false;
  characterSyncRuntime.reason = "";
}
function quickSwitchClassLabel(classId = "") {
  const cls = characterClassDef(classId);
  const species = characterSpeciesDef(cls?.speciesId ?? "");
  return `${species?.name ?? "Unknown"} ${cls?.name ?? classId}`;
}
function ensureDebugQuickSwitchClassOptions() {
  if (!debugQuickSwitchClassEl) return;
  if (debugQuickSwitchClassEl.options.length > 0) return;
  const entries = Object.values(CLASS_DEFS)
    .slice()
    .sort((a, b) => {
      const aSpecies = characterSpeciesDef(a?.speciesId ?? "").name;
      const bSpecies = characterSpeciesDef(b?.speciesId ?? "").name;
      return aSpecies.localeCompare(bSpecies) || String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
    });
  for (const entry of entries) {
    if (!entry?.id) continue;
    const species = characterSpeciesDef(entry.speciesId ?? "");
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = `${species?.name ?? "Unknown"} - ${entry.name ?? entry.id}`;
    debugQuickSwitchClassEl.appendChild(opt);
  }
}
function updateDebugQuickSwitchStatus(state) {
  if (!debugQuickSwitchStatusEl) return;
  const active = isQuickSwitchCharacterActive(state);
  if (!active) {
    debugQuickSwitchStatusEl.textContent = "Quick characters are temporary and never saved.";
    debugQuickSwitchStatusEl.classList.remove("active");
    return;
  }
  const classId = normalizeCharacterClassId(state?.player?.classId ?? state?.character?.classId ?? "");
  debugQuickSwitchStatusEl.textContent = `Quick active: ${quickSwitchClassLabel(classId)} (not saved). Load a real character to switch back.`;
  debugQuickSwitchStatusEl.classList.add("active");
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
  if (debugClearRadiusInputEl) {
    const raw = Number(debugClearRadiusInputEl.value ?? "");
    if (!Number.isFinite(raw) || raw <= 0) debugClearRadiusInputEl.value = "10";
  }
  ensureDebugQuickSwitchClassOptions();
  if (debugQuickSwitchClassEl && document.activeElement !== debugQuickSwitchClassEl) {
    const classId = normalizeCharacterClassId(state?.player?.classId ?? state?.character?.classId ?? DEFAULT_CHARACTER_CLASS_ID);
    if (classId && Array.from(debugQuickSwitchClassEl.options).some((opt) => opt.value === classId)) {
      debugQuickSwitchClassEl.value = classId;
    }
  }
  updateDebugQuickSwitchStatus(state);
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
  } else if (spawnKey.startsWith("actor:")) {
    const rawSpriteId = spawnKey.slice(6).trim();
    let spriteId = rawSpriteId;
    if (!spriteId || !SPRITE_SOURCES[spriteId]) {
      spriteId = SPRITE_SOURCES.hero ? "hero" : (Object.keys(SPRITE_SOURCES)[0] ?? "");
    }
    if (!spriteId) {
      pushLog(state, "No actor sprite is available to spawn.");
      return false;
    }
    if (!state.world.isPassable(targetX, targetY, targetZ)) state.world.setTile(targetX, targetY, targetZ, FLOOR);
    const id = `dbg_a|${spriteId}|${targetZ}|${targetX},${targetY}|${now}|${Math.floor(Math.random() * 1e9)}`;
    const ent = {
      id,
      origin: "dynamic",
      kind: "actor",
      type: "hero_actor",
      spriteId,
      x: targetX,
      y: targetY,
      z: targetZ,
      ai: "none",
    };
    state.dynamic.set(id, ent);
    state.entities.set(id, ent);
    pushLog(state, `Debug: spawned actor sprite ${spriteId} at (${targetX}, ${targetY}, ${targetZ}).`);
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
function removeEntityByAdminAction(state, ent) {
  if (!state || !ent) return false;
  if (ent.origin === "base") {
    state.removedIds.add(ent.id);
    state.entityOverrides.delete(ent.id);
  } else if (ent.origin === "dynamic") {
    state.dynamic.delete(ent.id);
  }
  state.entities.delete(ent.id);
  return true;
}
function clearMonstersAndActorsAroundPlayer(state, radius = 10) {
  if (!canUseAdminControls()) return { radius: 0, monsterCount: 0, actorCount: 0 };
  const p = state?.player;
  if (!state || !p || p.dead) return { radius: 0, monsterCount: 0, actorCount: 0 };
  const rad = clamp(Math.floor(Number(radius) || 0), 1, 120);
  const radSq = rad * rad;
  let monsterCount = 0;
  let actorCount = 0;
  for (const ent of Array.from(state.entities.values())) {
    if (!ent || ent.z !== p.z) continue;
    if (ent.kind !== "monster" && ent.kind !== "actor") continue;
    const dx = (ent.x ?? 0) - p.x;
    const dy = (ent.y ?? 0) - p.y;
    if (dx * dx + dy * dy > radSq) continue;
    if (!removeEntityByAdminAction(state, ent)) continue;
    if (ent.kind === "monster") monsterCount += 1;
    else actorCount += 1;
  }
  if (monsterCount > 0 || actorCount > 0) {
    hydrateNearby(state);
    updateContextActionButton(state);
    updateDeathOverlay(state);
    saveNow(state);
  }
  return { radius: rad, monsterCount, actorCount };
}
function debugMonsterRosterTypes() {
  return Object.entries(MONSTER_TYPES ?? {})
    .filter(([id, spec]) => typeof id === "string" && id && !!spec && typeof spec === "object")
    .sort((a, b) => {
      const aName = String(a[1]?.name ?? a[0]);
      const bName = String(b[1]?.name ?? b[0]);
      return aName.localeCompare(bName) || a[0].localeCompare(b[0]);
    })
    .map(([id]) => id);
}
function clearDebugMonsterRoster(state) {
  if (!state?.entities) return 0;
  let removed = 0;
  for (const ent of Array.from(state.entities.values())) {
    if (!ent || typeof ent.id !== "string") continue;
    if (!ent.id.startsWith(DEBUG_ROSTER_ID_PREFIX)) continue;
    if (!removeEntityByAdminAction(state, ent)) continue;
    removed += 1;
  }
  return removed;
}
function spawnMonsterRosterOnSurface(state) {
  if (!canUseAdminControls()) return { total: 0, spawned: 0, removed: 0, truncated: false };
  const p = state?.player;
  if (!state || !p || p.dead) return { total: 0, spawned: 0, removed: 0, truncated: false };

  const rosterTypes = debugMonsterRosterTypes();
  const total = rosterTypes.length;
  const removed = clearDebugMonsterRoster(state);
  if (!total) return { total, spawned: 0, removed, truncated: false };

  state.world.ensureChunksAround(0, 0, SURFACE_LEVEL, SURFACE_HALF_SIZE + 2);
  const minX = (-SURFACE_HALF_SIZE + 1) + DEBUG_ROSTER_LEFT_RIGHT_PADDING;
  const maxX = (SURFACE_HALF_SIZE - 1) - DEBUG_ROSTER_LEFT_RIGHT_PADDING;
  const startY = (-SURFACE_HALF_SIZE + 1) + DEBUG_ROSTER_FIRST_ROW_OFFSET;
  const maxY = SURFACE_HALF_SIZE - 1;
  const step = DEBUG_ROSTER_CELL_GAP + 1;
  if (minX > maxX || startY > maxY) {
    return { total, spawned: 0, removed, truncated: total > 0 };
  }

  const batch = `${Date.now()}|${Math.floor(Math.random() * 1e9)}`;
  let x = minX;
  let y = startY;
  let spawned = 0;

  for (const type of rosterTypes) {
    if (x > maxX) {
      x = minX;
      y += step;
    }
    if (y > maxY) break;
    if (!state.world.isPassable(x, y, SURFACE_LEVEL)) state.world.setTile(x, y, SURFACE_LEVEL, FLOOR);
    const spec = monsterStatsForDepth(type, SURFACE_LEVEL);
    const id = `${DEBUG_ROSTER_ID_PREFIX}${batch}|${spawned}|${type}|${x},${y}`;
    const ent = {
      id,
      origin: "dynamic",
      kind: "monster",
      type,
      x,
      y,
      z: SURFACE_LEVEL,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      awake: false,
      cd: 0,
      abilityCd: 0,
    };
    state.dynamic.set(id, ent);
    state.entities.set(id, ent);
    spawned += 1;
    x += step;
  }

  if (removed > 0 || spawned > 0) {
    hydrateNearby(state);
    updateContextActionButton(state);
    updateDeathOverlay(state);
    saveNow(state);
  }
  return { total, spawned, removed, truncated: spawned < total };
}
function applyQuickSwitchClass(state, classId) {
  if (!canUseAdminControls()) return false;
  if (!state?.player || state.player.dead) return false;
  const requestedClass = normalizeCharacterClassId(classId);
  const classDef = CLASS_DEFS[requestedClass];
  if (!classDef) return false;
  const speciesId = normalizeCharacterSpeciesId(classDef.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID);
  const nextClassId = normalizeCharacterClassId(requestedClass, speciesId);
  const p = state.player;
  const profile = ensureCharacterState(state);
  const qs = ensureQuickSwitchState(state);
  if (qs && !qs.active) {
    qs.active = true;
    qs.baseCharacterId = String(profile.id ?? "");
    qs.baseClassId = normalizeCharacterClassId(profile.classId, profile.speciesId);
    qs.baseSpeciesId = normalizeCharacterSpeciesId(profile.speciesId);
    qs.baseName = String(profile.name ?? "");
    qs.startedAt = Date.now();
  }
  const prevMaxHp = Math.max(1, Math.floor(p.maxHp ?? maxHpForLevel(Math.max(1, p.level ?? 1), profile)));
  const hpRatio = clamp((p.hp ?? prevMaxHp) / prevMaxHp, 0, 1);

  profile.classId = nextClassId;
  profile.speciesId = speciesId;
  profile.stats = normalizeCharacterStats(profile.stats, speciesId);
  if (typeof profile.name === "string") {
    profile.name = profile.name.replace(/\s+\[Quick\]\s*$/i, "");
    profile.name = `${profile.name || DEFAULT_CHARACTER_NAME} [Quick]`;
  } else {
    profile.name = `${DEFAULT_CHARACTER_NAME} [Quick]`;
  }

  p.classId = nextClassId;
  p.speciesId = speciesId;
  p.equip = normalizeEquip(p.equip ?? {}, { speciesId, classId: nextClassId });
  p.effects = [];
  p.attackAfterMove = false;
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;
  p.dead = false;

  recalcDerivedStats(state);
  p.hp = clamp(Math.round((p.maxHp ?? 1) * hpRatio), 0, p.maxHp ?? 1);
  clearQuickSwitchPersistenceRuntime();
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  updateDebugMenuUi(state);
  pushLog(state, `Quick Switch: now testing ${quickSwitchClassLabel(nextClassId)}. This character will not be saved.`);
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
    encounterProfile: null,
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
  const encounterProfile = FEATURE_FLAGS.roomArchetypes
    ? buildChunkEncounterProfile({
        depth: z,
        seed: seedStr,
        cx,
        cy,
        specials,
        lockedDoorRewards,
      })
    : null;
  const specialRoomCount = (specials.treasure ? 1 : 0) + (specials.shrine ? 1 : 0);
  const specialCorridorCount = specialRoomCount; // each special room uses one connector corridor
  const explore = {
    rooms: roomCount + specialRoomCount,
    corridors: corridorCount + specialCorridorCount,
  };
  const area = buildChunkAreaMap(grid);
  return {
    z,
    cx,
    cy,
    grid,
    specials,
    explore,
    lockedDoorRewards,
    areaMap: area.areaMap,
    areaCount: area.areaCount,
    encounterProfile,
  };
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
  if (id === "slime" || id === "jelly") return "slime_yellow";
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
    range: Math.max(0, Math.floor(spec.range ?? 0))
      + (Number(spec.range ?? 0) > 0 ? RANGED_ATTACK_RANGE_BONUS : 0),
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
const ARMOR_MATERIALS = METAL_TIERS.map((m) => m.id);
const ARMOR_SLOTS = ["head", "chest", "legs"];
const SCRAPPER_LOW_TIER_MAX_INDEX = Math.max(0, METAL_TIERS.findIndex((tier) => tier.id === "steel"));
const SPECIES_BODY_MODEL = Object.freeze({
  human: "humanoid",
  automaton: "automaton",
  hollowed: "phaseborn",
  skulker: "humanoid",
  grey: "humanoid",
  insectoid: "insectoid",
});
const SPECIES_EQUIP_RULES = Object.freeze({
  human: {
    preferredWeaponFamilies: ["dagger", "sword", "axe", "shortbow", "longbow", "crossbow", "wand", "staff", "focus"],
    blockedWeaponFamilies: [],
    preferredArmorFamilies: ["plate", "leather", "robe"],
    blockedArmorFamilies: [],
  },
  automaton: {
    preferredWeaponFamilies: ["sword", "axe", "emitter", "carbine", "launcher"],
    blockedWeaponFamilies: ["shortbow", "longbow", "crossbow", "gland_caster", "stinger_rig"],
    preferredArmorFamilies: ["chassis"],
    blockedArmorFamilies: ["chitin", "robe", "veil"],
  },
  hollowed: {
    preferredWeaponFamilies: ["dagger", "sword", "focus", "staff", "void_lens", "wand", "shortbow", "longbow"],
    blockedWeaponFamilies: [],
    preferredArmorFamilies: ["veil", "leather"],
    blockedArmorFamilies: [],
  },
  skulker: {
    preferredWeaponFamilies: ["dagger", "crossbow", "shortbow", "carbine", "alchemical_kit"],
    blockedWeaponFamilies: [],
    preferredArmorFamilies: ["leather"],
    blockedArmorFamilies: ["plate", "chassis", "chitin"],
  },
  grey: {
    preferredWeaponFamilies: ["wand", "focus", "staff", "psi_lens", "void_lens"],
    blockedWeaponFamilies: ["axe", "launcher", "stinger_rig"],
    preferredArmorFamilies: ["robe"],
    blockedArmorFamilies: ["plate", "chitin"],
  },
  insectoid: {
    preferredWeaponFamilies: ["gland_caster", "stinger_rig", "dagger"],
    blockedWeaponFamilies: ["shortbow", "longbow", "crossbow", "launcher"],
    preferredArmorFamilies: ["chitin"],
    blockedArmorFamilies: ["plate", "chassis"],
  },
});
const SPECIES_DEFAULT_ARMOR_FAMILY = Object.freeze({
  human: "plate",
  automaton: "chassis",
  hollowed: "veil",
  skulker: "leather",
  grey: "robe",
  insectoid: "chitin",
});
const CLASS_ARMOR_FAMILY_OVERRIDE = Object.freeze({
  riftstalker: "leather",
  echo_sniper: "leather",
  shadowrunner: "leather",
  scrapper: "leather",
  trapwright: "leather",
});
const WEAPON_FAMILY_DEFS = Object.freeze({
  dagger: {
    label: "Dagger",
    behavior: "replacer",
    tags: ["melee", "finesse"],
    atk: 90,
    description: "Fast melee sidearm with stable handling.",
    attackProfile: { kind: "melee", range: 1, minRange: 1, requiresLOS: false, cannotFireAdjacent: false, damageMod: 1, accuracyMod: 1, critChanceMod: 2, defIgnorePct: 0.04, hands: 1 },
  },
  sword: {
    label: "Sword",
    behavior: "replacer",
    tags: ["melee", "martial"],
    atk: 150,
    description: "Balanced martial blade.",
    attackProfile: { kind: "melee", range: 1, minRange: 1, requiresLOS: false, cannotFireAdjacent: false, damageMod: 1.02, accuracyMod: 0, critChanceMod: 1, defIgnorePct: 0.02, hands: 1 },
  },
  axe: {
    label: "Axe",
    behavior: "replacer",
    tags: ["melee", "heavy"],
    atk: 210,
    description: "Heavy melee breaker with penetration.",
    attackProfile: { kind: "melee", range: 1, minRange: 1, requiresLOS: false, cannotFireAdjacent: false, damageMod: 1.08, accuracyMod: -2, critChanceMod: 0, defIgnorePct: 0.08, hands: 1 },
  },
  shortbow: {
    label: "Shortbow",
    behavior: "replacer",
    tags: ["ballistic", "ranged"],
    atk: 105,
    description: "Mobile ranged bow for close-to-mid skirmishing.",
    attackProfile: { kind: "ranged", range: 7, minRange: 1, requiresLOS: true, cannotFireAdjacent: false, damageMod: 0.84, accuracyMod: 2, critChanceMod: 3, defIgnorePct: 0, closeRangeDamageMult: 0.88, maxRangeFalloffPct: 0.12, hands: 2 },
  },
  longbow: {
    label: "Longbow",
    behavior: "replacer",
    tags: ["ballistic", "ranged"],
    atk: 135,
    description: "Long-range ballistic bow with better penetration.",
    attackProfile: { kind: "ranged", range: 8, minRange: 1, requiresLOS: true, cannotFireAdjacent: false, damageMod: 0.96, accuracyMod: 0, critChanceMod: 0, defIgnorePct: 0.05, closeRangeDamageMult: 0.74, maxRangeFalloffPct: 0.10, hands: 2 },
  },
  crossbow: {
    label: "Crossbow",
    behavior: "replacer",
    tags: ["ballistic", "ranged", "piercing"],
    atk: 165,
    description: "Bolt launcher with strong armor penetration.",
    attackProfile: { kind: "ranged", range: 6, minRange: 1, requiresLOS: true, cannotFireAdjacent: false, damageMod: 1.04, accuracyMod: -3, critChanceMod: -1, defIgnorePct: 0.09, closeRangeDamageMult: 0.62, maxRangeFalloffPct: 0.14, hands: 1 },
  },
  wand: {
    label: "Wand",
    behavior: "amplifier",
    tags: ["arcane", "psionic", "ranged"],
    atk: 110,
    description: "Arcane conductor that amplifies native casting precision.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.08, accuracyBonus: 4, critBonus: 2, defIgnoreBonusPct: 0.02 },
  },
  staff: {
    label: "Staff",
    behavior: "amplifier",
    tags: ["arcane", "void", "support"],
    atk: 130,
    description: "Two-hand channeling focus for powerful native techniques.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.12, accuracyBonus: 2, critBonus: 0, defIgnoreBonusPct: 0.03 },
  },
  focus: {
    label: "Focus",
    behavior: "amplifier",
    tags: ["arcane", "psionic", "precision"],
    atk: 120,
    description: "Psionic focus that increases native attack quality.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.1, accuracyBonus: 6, critBonus: 4, defIgnoreBonusPct: 0.02 },
  },
  psi_lens: {
    label: "Psi Lens",
    behavior: "amplifier",
    tags: ["psionic", "precision", "support"],
    atk: 125,
    description: "Grey-optimized neural lens for psionic shot shaping.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.1, accuracyBonus: 5, critBonus: 3, defIgnoreBonusPct: 0.03 },
  },
  emitter: {
    label: "Emitter",
    behavior: "amplifier",
    tags: ["tech", "ranged"],
    atk: 125,
    description: "Tech emitter that boosts native discharge attacks.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.1, accuracyBonus: 3, critBonus: 1, defIgnoreBonusPct: 0.04 },
  },
  carbine: {
    label: "Carbine",
    behavior: "amplifier",
    tags: ["tech", "ballistic", "ranged"],
    atk: 145,
    description: "Compact kinetic-tech hybrid for amplified native fire.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.14, accuracyBonus: 2, critBonus: 2, defIgnoreBonusPct: 0.04 },
  },
  launcher: {
    label: "Launcher",
    behavior: "replacer",
    tags: ["tech", "ranged", "heavy"],
    atk: 190,
    description: "Dedicated heavy launcher replacing native attacks.",
    attackProfile: { kind: "ranged", range: 6, minRange: 1, requiresLOS: true, cannotFireAdjacent: false, damageMod: 1.12, accuracyMod: -4, critChanceMod: 0, defIgnorePct: 0.08, closeRangeDamageMult: 0.68, maxRangeFalloffPct: 0.14, hands: 2 },
  },
  gland_caster: {
    label: "Gland-Caster",
    behavior: "amplifier",
    tags: ["bio", "toxin", "ranged"],
    atk: 120,
    description: "Bio-organic ranged gland that amplifies toxin native attacks.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.1, accuracyBonus: 4, critBonus: 0, defIgnoreBonusPct: 0.03 },
  },
  stinger_rig: {
    label: "Stinger-Rig",
    behavior: "amplifier",
    tags: ["bio", "toxin", "tempo"],
    atk: 135,
    description: "Insectoid rig that improves native venom tempo.",
    amplifierProfile: { rangeBonus: 0, damageMult: 1.13, accuracyBonus: 2, critBonus: 2, defIgnoreBonusPct: 0.03 },
  },
  void_lens: {
    label: "Void Lens",
    behavior: "amplifier",
    tags: ["void", "anomaly", "ranged"],
    atk: 140,
    description: "Anomalous lens increasing void-native range and efficiency.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.14, accuracyBonus: 3, critBonus: 1, defIgnoreBonusPct: 0.05 },
  },
  alchemical_kit: {
    label: "Alchemical Kit",
    behavior: "amplifier",
    tags: ["alchemical", "support"],
    atk: 100,
    description: "Portable reagent pack amplifying native alchemical attacks.",
    amplifierProfile: { rangeBonus: 1, damageMult: 1.08, accuracyBonus: 3, critBonus: 0, defIgnoreBonusPct: 0.01 },
  },
});
const ARMOR_FAMILY_DEFS = Object.freeze({
  plate: {
    label: "Plate",
    slotNames: { head: ["Helm"], chest: ["Chestplate"], legs: ["Greaves"] },
    defMult: 1.22,
    evaBonus: -4,
    energyBonus: 0,
    tags: ["armor", "martial", "heavy"],
    description: "Highest mitigation with reduced mobility.",
  },
  leather: {
    label: "Leather",
    slotNames: { head: ["Hood", "Coif"], chest: ["Jerkin", "Coat"], legs: ["Leathers", "Treads"] },
    defMult: 0.96,
    evaBonus: 2,
    energyBonus: 0,
    tags: ["armor", "balanced", "agile"],
    description: "Balanced protection with mobility.",
  },
  robe: {
    label: "Robe",
    slotNames: { head: ["Circlet", "Cowl"], chest: ["Robe", "Mantle"], legs: ["Hem", "Wrapped Leggings"] },
    defMult: 0.78,
    evaBonus: 1,
    energyBonus: 40,
    tags: ["armor", "arcane", "utility"],
    description: "Low armor but high utility and energy support.",
  },
  chassis: {
    label: "Chassis",
    slotNames: { head: ["Sensor Crown", "Head Unit"], chest: ["Core Plating"], legs: ["Servo Struts"] },
    defMult: 1.14,
    evaBonus: -1,
    energyBonus: 18,
    tags: ["armor", "tech", "stability"],
    description: "Automaton plating tuned for stability and systems load.",
  },
  chitin: {
    label: "Chitin",
    slotNames: { head: ["Carapace Crest"], chest: ["Thorax Shell"], legs: ["Lower Carapace"] },
    defMult: 1.08,
    evaBonus: 0,
    energyBonus: 10,
    tags: ["armor", "bio", "tempo"],
    description: "Bio-hard shell with resilient tempo bonuses.",
  },
  veil: {
    label: "Veil",
    slotNames: { head: ["Veil Halo"], chest: ["Phase Shroud"], legs: ["Rift Wraps"] },
    defMult: 0.86,
    evaBonus: 3,
    energyBonus: 24,
    tags: ["armor", "void", "anomaly", "utility"],
    description: "Anomalous defense favoring evasion and utility.",
  },
});
const WEAPON_KINDS = Object.freeze(Object.keys(WEAPON_FAMILY_DEFS));
const WEAPON_KIND_LABEL = Object.freeze(Object.fromEntries(
  WEAPON_KINDS.map((id) => [id, WEAPON_FAMILY_DEFS[id]?.label ?? titleFromId(id)])
));
const WEAPON_KIND_ATK = Object.freeze(Object.fromEntries(
  WEAPON_KINDS.map((id) => [id, Math.max(1, Math.floor(WEAPON_FAMILY_DEFS[id]?.atk ?? 100))])
));
const WEAPON_ATTACK_PROFILES = Object.freeze(Object.fromEntries(
  WEAPON_KINDS
    .filter((id) => WEAPON_FAMILY_DEFS[id]?.behavior === "replacer")
    .map((id) => [id, WEAPON_FAMILY_DEFS[id].attackProfile])
));
const AMPLIFIER_FAMILY_PROFILES = Object.freeze(Object.fromEntries(
  WEAPON_KINDS
    .filter((id) => WEAPON_FAMILY_DEFS[id]?.behavior === "amplifier")
    .map((id) => [id, WEAPON_FAMILY_DEFS[id].amplifierProfile])
));
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
const UNARMED_ATTACK_PROFILE = {
  attackName: "Unarmed Strike",
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
function nativeMelee(attackName, flavor = "melee", damageMod = 0.82, accuracyMod = 2, critChanceMod = 0, defIgnorePct = 0) {
  return {
    attackName,
    kind: "melee",
    flavor,
    range: 1,
    minRange: 1,
    requiresLOS: false,
    cannotFireAdjacent: false,
    damageMod,
    accuracyMod,
    critChanceMod,
    defIgnorePct,
    closeRangeDamageMult: 1,
    maxRangeFalloffPct: 0,
  };
}
function nativeRanged(attackName, flavor, range = 5, damageMod = 0.82, accuracyMod = 4, critChanceMod = 0, defIgnorePct = 0.02) {
  return {
    attackName,
    kind: "ranged",
    flavor,
    range,
    minRange: 1,
    requiresLOS: true,
    cannotFireAdjacent: false,
    damageMod,
    accuracyMod,
    critChanceMod,
    defIgnorePct,
    closeRangeDamageMult: 0.74,
    maxRangeFalloffPct: 0.10,
  };
}
const CLASS_NATIVE_ATTACKS = {
  vanguard: nativeMelee("Combat Shove", "melee", 0.84, 2, 0, 0.02),
  bulwark: nativeMelee("Guard Bash", "melee", 0.83, 1, 0, 0.04),
  rogue: nativeMelee("Knife-Hand Thrust", "melee", 0.8, 5, 4, 0.06),
  ranger: nativeRanged("Improvised Shot", "ballistic", 5, 0.82, 8, 0, 0),
  operative: nativeRanged("Snap Shot", "ballistic", 4, 0.8, 6, 2, 0.02),
  alchemist: nativeRanged("Volatile Flask", "alchemical", 4, 0.8, 4, 0, 0),

  sentinel: nativeMelee("Impact Arm", "melee", 0.85, 1, 0, 0.03),
  execution_frame: nativeMelee("Piston Smash", "melee", 0.9, -1, 0, 0.08),
  calibrator: nativeRanged("Pulse Shot", "tech", 5, 0.82, 10, 4, 0.02),
  overclock_unit: nativeRanged("Burst Discharge", "tech", 4, 0.84, 2, 0, 0.01),
  fabricator: nativeRanged("Cutter Beam", "tech", 4, 0.79, 5, 0, 0.03),
  nullblade: nativeMelee("Null Edge", "void", 0.86, 2, 2, 0.08),

  veilblade: nativeMelee("Phase Slash", "melee", 0.83, 3, 2, 0.05),
  shadeguard: nativeMelee("Void Brace", "void", 0.84, 1, 0, 0.05),
  riftstalker: nativeMelee("Rift Lunge", "melee", 0.86, 3, 2, 0.06),
  echo_sniper: nativeRanged("Echo Shard", "void", 7, 0.8, 12, 0, 0),
  void_savant: nativeRanged("Void Bolt", "void", 5, 0.86, 4, 0, 0.06),
  warden_gap: nativeRanged("Gap Pulse", "support_anomaly", 5, 0.8, 6, 0, 0.03),

  tunnel_striker: nativeMelee("Hook Jab", "melee", 0.84, 2, 1, 0.03),
  slipblade: nativeMelee("Skitter Slash", "melee", 0.82, 4, 3, 0.04),
  burrowguard: nativeMelee("Burrow Slam", "melee", 0.86, 0, 0, 0.05),
  shadowrunner: nativeRanged("Scrap Dart", "ballistic", 4, 0.8, 5, 2, 0.01),
  scrapper: nativeRanged("Junk Toss", "ballistic", 4, 0.82, 2, 0, 0.02),
  trapwright: nativeRanged("Shrapnel Snap", "ballistic", 4, 0.81, 4, 1, 0.03),

  psion: nativeRanged("Psi Bolt", "psionic", 4, 0.82, 6, 0, 0),
  mindpiercer: nativeRanged("Neural Spike", "psionic", 5, 0.8, 6, 5, 0),
  surveyor: nativeRanged("Scan Lance", "psionic", 5, 0.79, 8, 1, 0.02),
  telekinetic: nativeRanged("Force Shard", "psionic", 5, 0.82, 4, 0, 0.03),
  neural_anchor: nativeRanged("Anchor Pulse", "psionic", 4, 0.8, 5, 0, 0.02),
  observer_prime: nativeRanged("Observation Ray", "psionic", 5, 0.8, 6, 1, 0.02),

  hive_warrior: nativeMelee("Talon Rake", "melee", 0.85, 2, 1, 0.03),
  spitter: nativeRanged("Toxic Spit", "toxin", 5, 0.8, 8, 0, 0),
  chitin_guard: nativeMelee("Horn Slam", "melee", 0.86, 0, 0, 0.04),
  skydarter: nativeMelee("Dart Pounce", "melee", 0.83, 4, 2, 0.04),
  broodmind: nativeRanged("Hive Pulse", "bio", 4, 0.79, 6, 0, 0.02),
  venomblade: nativeMelee("Venom Slash", "toxin", 0.84, 3, 3, 0.05),
};
const NATIVE_ATTACK_LABEL_BY_CLASS = Object.freeze(
  Object.fromEntries(Object.entries(CLASS_NATIVE_ATTACKS).map(([classId, profile]) => [classId, profile.attackName ?? "Native Attack"]))
);
const WEAPON_MATERIAL_ATK = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.atkBonus]));
const ARMOR_MATERIAL_DEF = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.defBonus]));
const ARMOR_SLOT_DEF = {
  head: 70,
  chest: 130,
  legs: 90,
};
const ITEM_TEMPLATES = {};
const ITEM_TEMPLATE_ALIAS = {};
let itemInstanceSerial = 0;
function capWord(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleFromId(s) { return String(s ?? "").split("_").map(capWord).join(" "); }
function materialLabel(material) { return MATERIAL_BY_ID[material]?.name ?? titleFromId(material); }
function normalizeWeaponFamilyId(value) {
  return String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
}
function normalizeArmorFamilyId(value) {
  return String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
}
function bodyModelForSpecies(speciesId) {
  const sid = normalizeCharacterSpeciesId(speciesId);
  return SPECIES_BODY_MODEL[sid] ?? "humanoid";
}
function speciesEquipRule(speciesId) {
  const sid = normalizeCharacterSpeciesId(speciesId);
  return SPECIES_EQUIP_RULES[sid] ?? SPECIES_EQUIP_RULES.human;
}
function armorFamilyForCharacter(speciesId, classId = null) {
  const sid = normalizeCharacterSpeciesId(speciesId);
  const cid = normalizeCharacterClassId(classId ?? defaultClassIdForSpecies(sid), sid);
  return normalizeArmorFamilyId(CLASS_ARMOR_FAMILY_OVERRIDE[cid] ?? SPECIES_DEFAULT_ARMOR_FAMILY[sid] ?? "plate");
}
function speciesPreferredWeaponUsers(family) {
  const fam = normalizeWeaponFamilyId(family);
  const out = [];
  for (const sid of Object.keys(SPECIES_DEFS)) {
    if ((speciesEquipRule(sid).preferredWeaponFamilies ?? []).includes(fam)) out.push(sid);
  }
  return out;
}
function speciesBlockedWeaponUsers(family) {
  const fam = normalizeWeaponFamilyId(family);
  const out = [];
  for (const sid of Object.keys(SPECIES_DEFS)) {
    if ((speciesEquipRule(sid).blockedWeaponFamilies ?? []).includes(fam)) out.push(sid);
  }
  return out;
}
function speciesPreferredArmorUsers(family) {
  const fam = normalizeArmorFamilyId(family);
  const out = [];
  for (const sid of Object.keys(SPECIES_DEFS)) {
    if ((speciesEquipRule(sid).preferredArmorFamilies ?? []).includes(fam)) out.push(sid);
  }
  return out;
}
function speciesBlockedArmorUsers(family) {
  const fam = normalizeArmorFamilyId(family);
  const out = [];
  for (const sid of Object.keys(SPECIES_DEFS)) {
    if ((speciesEquipRule(sid).blockedArmorFamilies ?? []).includes(fam)) out.push(sid);
  }
  return out;
}
function weaponDisplayName(material, kind) {
  const familyId = normalizeWeaponFamilyId(kind);
  const familyLabel = WEAPON_KIND_LABEL[familyId] ?? titleFromId(familyId);
  const mappedBowName = BOW_DISPLAY_NAME_BY_MATERIAL[material]?.[familyId];
  if (mappedBowName) {
    if (/bow/i.test(mappedBowName)) return mappedBowName;
    return `${mappedBowName} (${familyLabel})`;
  }
  return `${materialLabel(material)} ${familyLabel}`;
}
function armorSlotNameForFamily(family, slot, material = "") {
  const familyId = normalizeArmorFamilyId(family);
  const slotId = String(slot ?? "").trim().toLowerCase();
  const names = ARMOR_FAMILY_DEFS[familyId]?.slotNames?.[slotId] ?? [titleFromId(slotId)];
  if (!Array.isArray(names) || names.length <= 0) return titleFromId(slotId);
  const materialIndex = Math.max(0, METAL_TIERS.findIndex((tier) => tier.id === material));
  return names[materialIndex % names.length];
}
function weaponType(material, kind) {
  const mat = String(material ?? "").trim().toLowerCase();
  const fam = normalizeWeaponFamilyId(kind);
  return `weapon_${mat}_${fam}`;
}
function armorType(familyOrMaterial, materialOrSlot, maybeSlot = null) {
  if (maybeSlot === null || maybeSlot === undefined) {
    const legacyMaterial = String(familyOrMaterial ?? "").trim().toLowerCase();
    const legacySlot = String(materialOrSlot ?? "").trim().toLowerCase();
    return `armor_plate_${legacyMaterial}_${legacySlot}`;
  }
  const family = normalizeArmorFamilyId(familyOrMaterial);
  const material = String(materialOrSlot ?? "").trim().toLowerCase();
  const slot = String(maybeSlot ?? "").trim().toLowerCase();
  return `armor_${family}_${material}_${slot}`;
}
function parseArmorTypeParts(type) {
  if (!type || typeof type !== "string" || !type.startsWith("armor_")) return null;
  const parts = type.split("_");
  if (parts.length < 3) return null;
  const slot = parts[parts.length - 1];
  if (!ARMOR_SLOTS.includes(slot)) return null;
  const middle = parts.slice(1, -1);
  const legacyMaterial = middle.join("_");
  if (MATERIAL_BY_ID[legacyMaterial]) {
    return { family: null, material: legacyMaterial, slot, legacy: true };
  }
  for (let i = 1; i < middle.length; i++) {
    const family = middle.slice(0, i).join("_");
    const material = middle.slice(i).join("_");
    if (!MATERIAL_BY_ID[material]) continue;
    return { family: normalizeArmorFamilyId(family), material, slot, legacy: false };
  }
  return null;
}
function normalizeWeaponTypeId(type) {
  if (!type || typeof type !== "string" || !type.startsWith("weapon_")) return type;
  const body = type.slice("weapon_".length);
  const mats = [...WEAPON_MATERIALS].sort((a, b) => b.length - a.length);
  for (const material of mats) {
    const prefix = `${material}_`;
    if (!body.startsWith(prefix)) continue;
    const family = normalizeWeaponFamilyId(body.slice(prefix.length));
    const normalized = weaponType(material, family);
    return normalized;
  }
  return type;
}
function resolveLegacyArmorType(type, speciesId = DEFAULT_CHARACTER_SPECIES_ID, classId = DEFAULT_CHARACTER_CLASS_ID) {
  const parsed = parseArmorTypeParts(type);
  if (!parsed?.material || !parsed?.slot) return type;
  const familyRaw = parsed.family ?? armorFamilyForCharacter(speciesId, classId);
  const family = ARMOR_FAMILY_DEFS[familyRaw] ? familyRaw : "plate";
  return armorType(family, parsed.material, parsed.slot);
}
function itemTemplateForType(type) {
  const normalized = normalizeItemType(type);
  const templateId = ITEM_TEMPLATE_ALIAS[normalized] ?? normalized;
  return ITEM_TEMPLATES[templateId] ?? null;
}
function itemTemplateIdForType(type) {
  return itemTemplateForType(type)?.id ?? null;
}
function createItemInstance(type, ownerType = "world", ownerId = null, position = null) {
  const normalizedType = normalizeItemType(type);
  const templateId = itemTemplateIdForType(normalizedType) ?? normalizedType;
  const nowIso = new Date().toISOString();
  itemInstanceSerial += 1;
  const serial = itemInstanceSerial.toString(36).padStart(4, "0");
  const id = `itm_${Date.now().toString(36)}_${serial}`;
  return {
    id,
    templateId,
    type: normalizedType,
    seed: `${Math.floor(Math.random() * 1e9)}`,
    affixes: [],
    ownerType,
    ownerId,
    position: position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
      ? { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) }
      : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
function isSpeciesPreferredForItemType(type, speciesId) {
  const template = itemTemplateForType(type);
  if (!template) return false;
  const sid = normalizeCharacterSpeciesId(speciesId);
  return (template.speciesAffinity ?? []).includes(sid);
}
function equipValidationForItemType(type, speciesId, classId = DEFAULT_CHARACTER_CLASS_ID) {
  const template = itemTemplateForType(type);
  if (!template) return { ok: false, reason: "Unknown item template." };
  const sid = normalizeCharacterSpeciesId(speciesId);
  const cid = normalizeCharacterClassId(classId, sid);
  const rules = template.equipRules ?? {};
  const bodyModel = bodyModelForSpecies(sid);
  if (Array.isArray(rules.allowedSpecies) && rules.allowedSpecies.length > 0 && !rules.allowedSpecies.includes(sid)) {
    return { ok: false, reason: `${characterSpeciesDef(sid).name} cannot equip this family.` };
  }
  if (Array.isArray(rules.blockedSpecies) && rules.blockedSpecies.includes(sid)) {
    return { ok: false, reason: `${characterSpeciesDef(sid).name} is blocked from this family.` };
  }
  const requiredBodyModel = String(rules.bodyModel ?? "universal").trim().toLowerCase();
  if (requiredBodyModel && requiredBodyModel !== "universal" && requiredBodyModel !== bodyModel) {
    return { ok: false, reason: `Requires ${titleFromId(requiredBodyModel)} body model.` };
  }
  if (Array.isArray(template.classAffinity) && template.classAffinity.length > 0 && template.classAffinity.includes(cid)) {
    return { ok: true, favored: true, reason: "" };
  }
  return { ok: true, favored: isSpeciesPreferredForItemType(type, sid), reason: "" };
}
function canPlayerEquipItemType(state, type) {
  const sid = state?.player?.speciesId ?? state?.character?.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID;
  const cid = state?.player?.classId ?? state?.character?.classId ?? defaultClassIdForSpecies(sid);
  return equipValidationForItemType(type, sid, cid);
}
function itemUsageMetaForType(type) {
  const template = itemTemplateForType(type);
  if (!template) return null;
  const favoredSpecies = (template.speciesAffinity ?? []).map((sid) => characterSpeciesDef(sid).name);
  const blockedSpecies = (template.equipRules?.blockedSpecies ?? []).map((sid) => characterSpeciesDef(sid).name);
  const allowedSpecies = (template.equipRules?.allowedSpecies ?? []).map((sid) => characterSpeciesDef(sid).name);
  const usableBy = allowedSpecies.length > 0
    ? allowedSpecies
    : Object.values(SPECIES_DEFS)
      .map((entry) => entry.id)
      .filter((sid) => !blockedSpecies.includes(characterSpeciesDef(sid).name))
      .map((sid) => characterSpeciesDef(sid).name);
  return {
    family: template.family,
    behavior: template.behavior ?? "replacer",
    archetypeTags: template.archetypeTags ?? [],
    favoredBy: favoredSpecies,
    usableBy,
  };
}
function registerItemTemplate(template, aliases = []) {
  if (!template?.id) return;
  ITEM_TEMPLATES[template.id] = template;
  ITEM_TEMPLATE_ALIAS[template.id] = template.id;
  for (const alias of aliases ?? []) {
    if (!alias || typeof alias !== "string") continue;
    ITEM_TEMPLATE_ALIAS[alias] = template.id;
  }
}
function weaponKindFromItemType(type) {
  const template = itemTemplateForType(type);
  if (template?.category === "weapon") return normalizeWeaponFamilyId(template.family);
  const normalized = normalizeWeaponTypeId(type);
  if (!normalized || typeof normalized !== "string" || !normalized.startsWith("weapon_")) return null;
  const body = normalized.slice("weapon_".length);
  const mats = [...WEAPON_MATERIALS].sort((a, b) => b.length - a.length);
  for (const material of mats) {
    const prefix = `${material}_`;
    if (!body.startsWith(prefix)) continue;
    const family = normalizeWeaponFamilyId(body.slice(prefix.length));
    return family || null;
  }
  return null;
}
function normalizeAttackProfile(profile, fallbackProfile = UNARMED_ATTACK_PROFILE) {
  const src = (profile && typeof profile === "object") ? profile : fallbackProfile;
  const fallback = (fallbackProfile && typeof fallbackProfile === "object") ? fallbackProfile : UNARMED_ATTACK_PROFILE;
  const kind = src.kind === "ranged" ? "ranged" : "melee";
  const minRange = Math.max(1, Math.floor(Number(src.minRange ?? fallback.minRange ?? 1) || 1));
  const baseRange = Math.max(minRange, Math.floor(Number(src.range ?? fallback.range ?? minRange) || minRange));
  const range = kind === "ranged"
    ? Math.max(minRange, baseRange + RANGED_ATTACK_RANGE_BONUS)
    : baseRange;
  const flavorRaw = String(src.flavor ?? (kind === "ranged" ? "ballistic" : "melee")).trim().toLowerCase();
  return {
    kind,
    flavor: flavorRaw || (kind === "ranged" ? "ballistic" : "melee"),
    attackName: String(src.attackName ?? fallback.attackName ?? "Attack"),
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
function applyAmplifierToAttackProfile(nativeProfile, amplifierProfile, amplifierName = "") {
  const base = normalizeAttackProfile(nativeProfile, UNARMED_ATTACK_PROFILE);
  const amp = (amplifierProfile && typeof amplifierProfile === "object") ? amplifierProfile : {};
  const out = {
    ...base,
    attackName: amplifierName ? `${base.attackName} (Amplified)` : base.attackName,
    range: Math.max(base.minRange, Math.floor(base.range + (Number(amp.rangeBonus ?? 0) || 0))),
    damageMod: Math.max(0.1, Number(base.damageMod ?? 1) * Math.max(0.1, Number(amp.damageMult ?? 1))),
    accuracyMod: Math.round((Number(base.accuracyMod ?? 0) || 0) + (Number(amp.accuracyBonus ?? 0) || 0)),
    critChanceMod: Math.round((Number(base.critChanceMod ?? 0) || 0) + (Number(amp.critBonus ?? 0) || 0)),
    defIgnorePct: clamp((Number(base.defIgnorePct ?? 0) || 0) + (Number(amp.defIgnoreBonusPct ?? 0) || 0), 0, 0.9),
    closeRangeDamageMult: clamp(Number(base.closeRangeDamageMult ?? 1) * Math.max(0.25, Number(amp.closeRangeMult ?? 1)), 0.2, 1),
    maxRangeFalloffPct: clamp(Number(base.maxRangeFalloffPct ?? 0) * Math.max(0.2, Number(amp.falloffMult ?? 1)), 0, 0.8),
  };
  return out;
}
function weaponAttackNameForType(type, family = "") {
  const explicit = String(ITEM_TYPES[type]?.name ?? "").trim();
  if (explicit) return explicit;
  const familyId = normalizeWeaponFamilyId(family || weaponKindFromItemType(type) || "");
  const familyLabel = String(WEAPON_FAMILY_DEFS[familyId]?.label ?? "").trim();
  if (familyLabel) return familyLabel;
  return "Weapon Strike";
}
function weaponAttackProfileForType(type) {
  const template = itemTemplateForType(type);
  if (template?.category !== "weapon") return null;
  const behavior = String(template.behavior ?? "replacer");
  if (behavior !== "replacer") return null;
  const family = normalizeWeaponFamilyId(template.family);
  const profile = WEAPON_ATTACK_PROFILES[family] ?? null;
  return profile
    ? {
        ...normalizeAttackProfile(profile, UNARMED_ATTACK_PROFILE),
        attackName: weaponAttackNameForType(type, family),
      }
    : null;
}
function classNativeAttackProfile(classId) {
  const cid = normalizeCharacterClassId(classId);
  const profile = CLASS_NATIVE_ATTACKS[cid];
  return profile ? normalizeAttackProfile(profile, UNARMED_ATTACK_PROFILE) : null;
}
function resolvePlayerAttackProfile(state) {
  const weaponTypeId = state?.player?.equip?.weapon ?? null;
  const classId = state?.player?.classId ?? state?.character?.classId ?? DEFAULT_CHARACTER_CLASS_ID;
  const nativeProfile = classNativeAttackProfile(classId);
  const weaponTemplate = weaponTypeId ? itemTemplateForType(weaponTypeId) : null;
  const equipValidation = weaponTypeId ? canPlayerEquipItemType(state, weaponTypeId) : { ok: true };
  if (weaponTemplate?.category === "weapon" && equipValidation.ok) {
    const behavior = String(weaponTemplate.behavior ?? "replacer");
    if (behavior === "replacer") {
      const weaponProfile = WEAPONS[weaponTypeId]?.attackProfile ?? null;
      if (weaponProfile) {
        const family = normalizeWeaponFamilyId(weaponTemplate.family);
        return {
          ...normalizeAttackProfile(weaponProfile, UNARMED_ATTACK_PROFILE),
          attackName: weaponAttackNameForType(weaponTypeId, family),
          source: "replacer",
          weaponType: weaponTypeId,
          family,
        };
      }
    }
    if (behavior === "amplifier" && nativeProfile) {
      const amplifier = WEAPONS[weaponTypeId]?.amplifierProfile ?? AMPLIFIER_FAMILY_PROFILES[normalizeWeaponFamilyId(weaponTemplate.family)] ?? null;
      return {
        ...applyAmplifierToAttackProfile(nativeProfile, amplifier, ITEM_TYPES[weaponTypeId]?.name ?? ""),
        source: "amplified_native",
        weaponType: weaponTypeId,
        family: normalizeWeaponFamilyId(weaponTemplate.family),
        classId: normalizeCharacterClassId(classId),
      };
    }
  }
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
  for (const family of WEAPON_KINDS) {
    const id = weaponType(material, family);
    const familyDef = WEAPON_FAMILY_DEFS[family] ?? WEAPON_FAMILY_DEFS.dagger;
    const tags = [...(familyDef.tags ?? [])];
    const behavior = String(familyDef.behavior ?? "replacer");
    ITEM_TYPES[id] = { name: weaponDisplayName(material, family) };
    const attackProfile = behavior === "replacer"
      ? normalizeAttackProfile(WEAPON_ATTACK_PROFILES[family] ?? UNARMED_ATTACK_PROFILE, UNARMED_ATTACK_PROFILE)
      : null;
    const amplifierProfile = behavior === "amplifier"
      ? { ...(AMPLIFIER_FAMILY_PROFILES[family] ?? {}) }
      : null;
    WEAPONS[id] = {
      atkBonus: WEAPON_KIND_ATK[family] + WEAPON_MATERIAL_ATK[material],
      kind: family,
      family,
      behavior,
      attackProfile,
      amplifierProfile,
    };
    registerItemTemplate({
      id,
      category: "weapon",
      family,
      slot: "weapon",
      materialTierId: material,
      archetypeTags: tags,
      speciesAffinity: speciesPreferredWeaponUsers(family),
      classAffinity: [],
      equipRules: {
        blockedSpecies: speciesBlockedWeaponUsers(family),
        bodyModel: "universal",
      },
      behavior,
      attackProfileId: behavior === "replacer" ? family : undefined,
      amplifierProfileId: behavior === "amplifier" ? family : undefined,
      statBudget: {
        atkBonus: WEAPON_KIND_ATK[family] + WEAPON_MATERIAL_ATK[material],
        defBonus: 0,
        critBonus: Math.round(Number(familyDef.attackProfile?.critChanceMod ?? familyDef.amplifierProfile?.critBonus ?? 0)),
        defIgnorePct: clamp(Number(familyDef.attackProfile?.defIgnorePct ?? familyDef.amplifierProfile?.defIgnoreBonusPct ?? 0), 0, 0.9),
      },
      value: 0,
      rarityWeight: Math.max(1, Math.round(MATERIAL_DEPTH_WINDOWS[material]?.peakWeight ?? 1)),
      spriteProfileId: id,
      description: familyDef.description ?? "",
    });
  }
}

const ARMOR_PIECES = {};
for (const material of ARMOR_MATERIALS) {
  for (const family of Object.keys(ARMOR_FAMILY_DEFS)) {
    const familyDef = ARMOR_FAMILY_DEFS[family];
    for (const slot of ARMOR_SLOTS) {
      const id = armorType(family, material, slot);
      const slotName = armorSlotNameForFamily(family, slot, material);
      const defBase = ARMOR_MATERIAL_DEF[material] + ARMOR_SLOT_DEF[slot];
      const defBonus = Math.max(1, Math.round(defBase * Math.max(0.2, Number(familyDef.defMult ?? 1))));
      const evaBonus = Math.round(Number(familyDef.evaBonus ?? 0));
      const energyBonus = Math.round(Number(familyDef.energyBonus ?? 0));
      ITEM_TYPES[id] = { name: `${materialLabel(material)} ${slotName}` };
      ARMOR_PIECES[id] = { slot, family, defBonus, evaBonus, energyBonus };
      registerItemTemplate({
        id,
        category: "armor",
        family,
        slot,
        materialTierId: material,
        archetypeTags: [...(familyDef.tags ?? ["armor"])],
        speciesAffinity: speciesPreferredArmorUsers(family),
        classAffinity: [],
        equipRules: {
          blockedSpecies: speciesBlockedArmorUsers(family),
          bodyModel: "universal",
        },
        behavior: "replacer",
        statBudget: {
          atkBonus: 0,
          defBonus,
          evaBonus,
          energyBonus,
        },
        value: 0,
        rarityWeight: Math.max(1, Math.round(MATERIAL_DEPTH_WINDOWS[material]?.peakWeight ?? 1)),
        spriteProfileId: id,
        description: familyDef.description ?? "",
      });
    }
  }
}

const LEGACY_ITEM_MAP = {
  weapon_dagger: weaponType("bronze", "dagger"),
  weapon_sword: weaponType("bronze", "sword"),
  weapon_axe: weaponType("bronze", "axe"),
  weapon_mace: weaponType("iron", "axe"),
  weapon_greatsword: weaponType("steel", "sword"),
  weapon_runeblade: weaponType("steel", "axe"),
  armor_leather: armorType("leather", "wood", "chest"),
  armor_leather_chest: armorType("leather", "wood", "chest"),
  armor_leather_legs: armorType("leather", "wood", "legs"),
  armor_chain: armorType("plate", "iron", "chest"),
  armor_plate: armorType("plate", "steel", "chest"),
  key_blue: KEY_INDIGO,
  key_purple: KEY_VIOLET,
  key_magenta: KEY_INDIGO,
};

function normalizeItemType(type, options = null) {
  const raw = String(type ?? "").trim();
  if (!raw) return "";
  const mapped = LEGACY_ITEM_MAP[raw] ?? raw;
  if (ITEM_TYPES[mapped]) return mapped;
  if (mapped.startsWith("weapon_")) {
    const normalizedWeapon = normalizeWeaponTypeId(mapped);
    if (ITEM_TYPES[normalizedWeapon]) return normalizedWeapon;
    return normalizedWeapon;
  }
  if (mapped.startsWith("armor_")) {
    const sid = normalizeCharacterSpeciesId(options?.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID);
    const cid = normalizeCharacterClassId(options?.classId ?? defaultClassIdForSpecies(sid), sid);
    const normalizedArmor = resolveLegacyArmorType(mapped, sid, cid);
    if (ITEM_TYPES[normalizedArmor]) return normalizedArmor;
    return normalizedArmor;
  }
  return mapped;
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

const BIOME_FAMILY_WEIGHTS = Object.freeze({
  carved_stone: {
    sword: 20, axe: 16, dagger: 12, crossbow: 10, longbow: 8,
    plate: 18, leather: 8, robe: 4, wand: 4, focus: 4,
  },
  ancient_brick: {
    sword: 20, axe: 14, dagger: 12, crossbow: 10, longbow: 8,
    plate: 18, leather: 8, robe: 6, focus: 6,
  },
  basalt_keep: {
    sword: 18, axe: 16, dagger: 10, crossbow: 8, longbow: 6,
    plate: 20, leather: 8, chassis: 6, launcher: 6, wand: 4,
  },
  industrial_rustpunk: {
    emitter: 20, carbine: 16, launcher: 8, chassis: 22,
    sword: 8, axe: 8, focus: 4, plate: 4, leather: 4,
  },
  organic_cavern: {
    gland_caster: 18, stinger_rig: 14, chitin: 24, toxin: 8,
    dagger: 8, leather: 8, shortbow: 4, focus: 4, robe: 4,
  },
  corrupted_biome: {
    void_lens: 20, focus: 18, staff: 10, veil: 18,
    sword: 10, dagger: 8, robe: 8, wand: 8, psi_lens: 4,
  },
  default: {
    dagger: 14, sword: 18, axe: 14, shortbow: 10, longbow: 8, crossbow: 8,
    wand: 8, staff: 8, focus: 8, emitter: 7, carbine: 7, launcher: 5,
    gland_caster: 6, stinger_rig: 6, void_lens: 6, psi_lens: 6, alchemical_kit: 6,
    plate: 10, leather: 10, robe: 8, chassis: 8, chitin: 8, veil: 8,
  },
});
const SOURCE_FAMILY_MULT = Object.freeze({
  floor: { default: 1 },
  chest: { plate: 1.14, leather: 1.08, robe: 1.08, focus: 1.08, wand: 1.06, emitter: 1.06, default: 1 },
  monster: { dagger: 1.08, sword: 1.08, leather: 1.08, default: 1 },
  shrine_cache: { focus: 1.32, staff: 1.24, wand: 1.22, psi_lens: 1.18, void_lens: 1.18, robe: 1.18, veil: 1.12, default: 1 },
  shop: { sword: 1.1, shortbow: 1.1, wand: 1.1, emitter: 1.1, leather: 1.08, plate: 1.08, chassis: 1.08, default: 1 },
  event_reward: { default: 1.2 },
});
const MONSTER_TYPE_FACTION = Object.freeze({
  ancient_automaton: "automaton",
  iron_warden: "automaton",
  crocubot: "automaton",
  deepcore_ballista_sentinel: "automaton",
  nullmetal_assassin: "hollowed",
  wraith: "hollowed",
  rift_hound: "hollowed",
  singularity_hunter: "hollowed",
  bone_herald: "hollowed",
  skeleton: "undead",
  basilisk: "beast",
  giant_spider: "beast",
  spore_crawler: "insectoid",
  slime_green: "slime",
  slime_yellow: "slime",
  slime_orange: "slime",
  slime_red: "slime",
  slime_violet: "slime",
  slime_indigo: "slime",
  goblin: "humanoid",
  hobgoblin: "humanoid",
  rogue: "humanoid",
  archer: "humanoid",
  cave_skirmisher: "humanoid",
  ruin_archer: "humanoid",
  storm_sniper: "humanoid",
  dire_wolf: "beast",
  cave_troll: "beast",
  rat: "beast",
});
const FACTION_FAMILY_MULT = Object.freeze({
  automaton: { emitter: 1.3, carbine: 1.25, launcher: 1.12, chassis: 1.3, sword: 1.06, axe: 1.06, default: 1 },
  hollowed: { void_lens: 1.3, focus: 1.2, staff: 1.1, veil: 1.25, dagger: 1.08, sword: 1.08, default: 1 },
  insectoid: { gland_caster: 1.28, stinger_rig: 1.22, chitin: 1.3, dagger: 1.06, default: 1 },
  humanoid: { sword: 1.12, dagger: 1.1, crossbow: 1.08, longbow: 1.08, plate: 1.08, leather: 1.08, default: 1 },
  undead: { sword: 1.08, axe: 1.08, crossbow: 1.05, plate: 1.1, veil: 1.08, default: 1 },
  beast: { leather: 1.08, chitin: 1.08, dagger: 1.05, default: 1 },
  slime: { focus: 1.06, staff: 1.06, robe: 1.06, void_lens: 1.05, default: 1 },
});
function normalizeLootSource(source) {
  const src = String(source ?? "").trim().toLowerCase();
  if (src === "monster" || src === "chest" || src === "shrine_cache" || src === "shop" || src === "event_reward") return src;
  return "floor";
}
function biomeIdForDepth(state, depth) {
  const z = Math.max(0, Math.floor(depth ?? 0));
  const seed = state?.world?.seedStr ?? "";
  const style = themeForDepth(z, seed)?.styleVariant ?? "default";
  return BIOME_FAMILY_WEIGHTS[style] ? style : "default";
}
function monsterFactionForType(type) {
  const tid = normalizeMonsterTypeId(type);
  if (MONSTER_TYPE_FACTION[tid]) return MONSTER_TYPE_FACTION[tid];
  if (VOID_ALIGNED_MONSTER_IDS.has(tid)) return "hollowed";
  return "";
}
function familyEntriesForLootContext({ state = null, depth = 0, source = "floor", biomeId = "", factionId = "", category = "" } = {}) {
  const biome = BIOME_FAMILY_WEIGHTS[biomeId] ? biomeId : biomeIdForDepth(state, depth);
  const base = BIOME_FAMILY_WEIGHTS[biome] ?? BIOME_FAMILY_WEIGHTS.default;
  const defaultBase = BIOME_FAMILY_WEIGHTS.default ?? {};
  const sourceMods = SOURCE_FAMILY_MULT[normalizeLootSource(source)] ?? SOURCE_FAMILY_MULT.floor;
  const factionMods = factionId ? (FACTION_FAMILY_MULT[factionId] ?? { default: 1 }) : { default: 1 };
  const weaponBaselineMult = 0.35;
  const mergedBase = { ...base };
  if (category === "weapon") {
    for (const [familyIdRaw, weightRaw] of Object.entries(defaultBase)) {
      const familyId = String(familyIdRaw ?? "").trim().toLowerCase();
      if (!WEAPON_FAMILY_DEFS[familyId]) continue;
      const baseWeight = Math.max(0, Number(weightRaw ?? 0));
      if (baseWeight <= 0) continue;
      const existing = Math.max(0, Number(mergedBase[familyId] ?? 0));
      mergedBase[familyId] = Math.max(existing, baseWeight * weaponBaselineMult);
    }
  }
  const out = [];
  for (const [familyIdRaw, weightRaw] of Object.entries(mergedBase)) {
    const familyId = String(familyIdRaw ?? "").trim().toLowerCase();
    if (!familyId || familyId === "default") continue;
    const isWeapon = !!WEAPON_FAMILY_DEFS[familyId];
    const isArmor = !!ARMOR_FAMILY_DEFS[familyId];
    if (!isWeapon && !isArmor) continue;
    if (category === "weapon" && !isWeapon) continue;
    if (category === "armor" && !isArmor) continue;
    const wBase = Math.max(0, Number(weightRaw ?? 0));
    if (wBase <= 0) continue;
    const sourceMult = Math.max(0.05, Number(sourceMods[familyId] ?? sourceMods.default ?? 1));
    const factionMult = Math.max(0.05, Number(factionMods[familyId] ?? factionMods.default ?? 1));
    const w = wBase * sourceMult * factionMult;
    if (w <= 0) continue;
    out.push({ id: familyId, w });
  }
  if (out.length > 0) return out;
  const fallbackPool = category === "armor"
    ? Object.keys(ARMOR_FAMILY_DEFS).map((id) => ({ id, w: 1 }))
    : category === "weapon"
      ? Object.keys(WEAPON_FAMILY_DEFS).map((id) => ({ id, w: 1 }))
      : [
        ...Object.keys(WEAPON_FAMILY_DEFS).map((id) => ({ id, w: 1 })),
        ...Object.keys(ARMOR_FAMILY_DEFS).map((id) => ({ id, w: 1 })),
      ];
  return fallbackPool;
}
function equipmentTypeForDepth(z, rng = Math.random, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const depth = Math.max(0, Math.floor(z ?? 0));
  const source = normalizeLootSource(opts.source ?? "floor");
  const biomeId = String(opts.biomeId ?? "").trim().toLowerCase();
  const factionId = String(opts.factionId ?? "").trim().toLowerCase();
  const categoryHint = opts.category === "weapon" || opts.category === "armor" ? opts.category : "";
  const material = weightedPick(rng, materialWeightsForDepth(depth));
  const families = familyEntriesForLootContext({
    state: opts.state ?? null,
    depth,
    source,
    biomeId,
    factionId,
    category: categoryHint,
  });
  let familyId = weightedPick(rng, families);
  const isWeapon = !!WEAPON_FAMILY_DEFS[familyId];
  const isArmor = !!ARMOR_FAMILY_DEFS[familyId];
  if (!isWeapon && !isArmor) {
    familyId = categoryHint === "armor" ? "plate" : "sword";
  }
  if (ARMOR_FAMILY_DEFS[familyId]) {
    const slot = weightedPick(rng, [
      { id: "head", w: 20 },
      { id: "chest", w: 45 },
      { id: "legs", w: 35 },
    ]);
    return armorType(familyId, material, slot);
  }
  return weaponType(material, familyId);
}
function weaponForDepth(z, rng = Math.random, options = null) {
  return equipmentTypeForDepth(z, rng, { ...(options ?? {}), category: "weapon" });
}

function armorForDepth(z, rng = Math.random, options = null) {
  return equipmentTypeForDepth(z, rng, { ...(options ?? {}), category: "armor" });
}

function itemMarketValue(type) {
  if (type === "potion") return 60;
  if (type === "gold") return 1;
  const template = itemTemplateForType(type);
  const materialId = template?.materialTierId ?? materialIdFromItemType(type);
  const tierIndex = materialId ? METAL_TIERS.findIndex((tier) => tier.id === materialId) : -1;
  // Keep early tiers accessible while making late-tier metals meaningfully expensive.
  const tierFactor = tierIndex >= 0 ? (0.85 + tierIndex * 0.12) : 1;
  if (type?.startsWith("weapon_")) {
    const atk = WEAPONS[type]?.atkBonus ?? 0;
    return Math.max(20, Math.floor((34 + atk * 0.48) * tierFactor));
  }
  if (type?.startsWith("armor_")) {
    const piece = ARMOR_PIECES[type] ?? null;
    const def = piece?.defBonus ?? 0;
    const utility = Math.max(0, Math.floor((piece?.energyBonus ?? 0) * 0.35 + (piece?.evaBonus ?? 0) * 18));
    return Math.max(20, Math.floor((30 + (def + utility) * 0.52) * tierFactor));
  }
  return 20;
}

const SHOP_CORE_SLOT_LAYOUT = Object.freeze([
  "low_gear", "low_gear", "low_gear", "low_gear",
  "mid_gear", "mid_gear", "mid_gear", "mid_gear",
  "high_gear", "high_gear", "high_gear", "high_gear",
  "potions", "potions",
  "wildcard", "wildcard",
]);
const SHOP_CORE_SIZE = SHOP_CORE_SLOT_LAYOUT.length;
const SHOP_OVERFLOW_MAX = 32;
const SHOP_REFRESH_INTERVAL_MS = 25 * 60 * 1000;
const SHOP_PURCHASE_COOLDOWN_MS = 2500;

function shopBuildItemId(prefix = "itm") {
  const safePrefix = String(prefix ?? "itm").replace(/[^a-z0-9_]/gi, "").toLowerCase() || "itm";
  return `${safePrefix}_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-6)}`;
}

function normalizeShopType(value = "") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "weaponsmith" || raw === "armorer" || raw === "general") return raw;
  return "general";
}

function shopTierForItemType(type = "") {
  const template = itemTemplateForType(type);
  const materialId = template?.materialTierId ?? materialIdFromItemType(type);
  const tierIdx = materialId ? METAL_TIERS.findIndex((tier) => tier.id === materialId) : -1;
  if (tierIdx < 0) return "mid";
  if (tierIdx <= 5) return "low";
  if (tierIdx <= 11) return "mid";
  return "high";
}

function shopTierForSlotType(slotType = "", rng = Math.random) {
  const slot = String(slotType ?? "").trim().toLowerCase();
  if (slot === "low_gear" || slot === "potions") return "low";
  if (slot === "mid_gear") return "mid";
  if (slot === "high_gear") return "high";
  if (slot === "wildcard") return rng() < 0.6 ? "mid" : "high";
  return "mid";
}

function shopCategoryForSlot(shopType = "general", slotType = "", rng = Math.random) {
  if (slotType === "potions") return "";
  const type = normalizeShopType(shopType);
  if (type === "weaponsmith") return rng() < 0.78 ? "weapon" : "armor";
  if (type === "armorer") return rng() < 0.78 ? "armor" : "weapon";
  return rng() < 0.5 ? "weapon" : "armor";
}

function shopDepthBandForTier(tier = "mid") {
  if (tier === "low") return { min: 0, max: 8 };
  if (tier === "high") return { min: 18, max: 48 };
  return { min: 8, max: 24 };
}

function shopBuyPrice(type, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const tier = opts.tier || shopTierForItemType(type);
  const base = itemMarketValue(type);
  if (type === "potion") return Math.max(5, Math.floor(base * 1.22));
  const markup = tier === "low" ? 1.12 : (tier === "high" ? 1.52 : 1.28);
  return Math.max(5, Math.floor(base * markup));
}

function shopSellPrice(type) {
  return Math.max(1, Math.floor(itemMarketValue(type) * 0.35));
}

function shopOverflowBuyPrice(type) {
  return Math.max(1, Math.floor(itemMarketValue(type) * 0.7));
}

function shopRefreshIntervalMsForLevel(levelRaw) {
  void levelRaw;
  return SHOP_REFRESH_INTERVAL_MS;
}

function randomPotionStockAmount(rng = Math.random) {
  return randInt(rng, 8, 15);
}

function canSellItemType(type = "") {
  return type === "potion" || type.startsWith("weapon_") || type.startsWith("armor_");
}

function buildShopCoreItemForSlot(state, slotType, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const nowMs = Number.isFinite(opts.nowMs) ? Math.max(0, Math.floor(opts.nowMs)) : Date.now();
  const shopType = normalizeShopType(state?.shop?.shopType ?? "general");
  const slot = String(slotType ?? "").trim().toLowerCase();
  if (slot === "potions") {
    const amount = randomPotionStockAmount(rng);
    return {
      itemId: shopBuildItemId("core"),
      templateId: "potion",
      type: "potion",
      tier: "low",
      price: shopBuyPrice("potion", { tier: "low" }),
      generatedAt: nowMs,
      slotType: "potions",
      amount,
      source: "core",
    };
  }

  const targetTier = shopTierForSlotType(slot, rng);
  const category = shopCategoryForSlot(shopType, slot, rng);
  const band = shopDepthBandForTier(targetTier);
  let chosenType = "";
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const depthRoll = randInt(rng, band.min, band.max);
    const rollType = equipmentTypeForDepth(depthRoll, rng, {
      source: "shop",
      category: category || undefined,
    });
    if (!rollType) continue;
    const rolledTier = shopTierForItemType(rollType);
    if (slot === "wildcard" || rolledTier === targetTier || (targetTier === "high" && rolledTier === "mid")) {
      chosenType = rollType;
      break;
    }
  }
  if (!chosenType) {
    const fallbackType = equipmentTypeForDepth(randInt(rng, band.min, band.max), rng, {
      source: "shop",
      category: category || undefined,
    });
    chosenType = fallbackType || Object.keys(WEAPONS)[0] || "potion";
  }
  const resolvedTier = shopTierForItemType(chosenType);
  return {
    itemId: shopBuildItemId("core"),
    templateId: chosenType,
    type: chosenType,
    tier: resolvedTier,
    price: shopBuyPrice(chosenType, { tier: resolvedTier }),
    generatedAt: nowMs,
    slotType: slot || "mid_gear",
    amount: 1,
    source: "core",
  };
}

function normalizeShopCoreItem(raw, slotType, state, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const nowMs = Number.isFinite(opts.nowMs) ? Math.max(0, Math.floor(opts.nowMs)) : Date.now();
  const allowGenerate = opts.allowGenerate !== false;
  const slot = String(slotType ?? "").trim().toLowerCase() || "mid_gear";
  const entry = (raw && typeof raw === "object") ? raw : null;
  const normalizedType = normalizeItemType(entry?.templateId ?? entry?.type ?? "");
  if (!entry || !normalizedType || !ITEM_TYPES[normalizedType]) {
    return allowGenerate ? buildShopCoreItemForSlot(state, slot, { rng, nowMs }) : null;
  }
  const amount = normalizedType === "potion"
    ? clamp(Math.floor(Number(entry.amount ?? 1) || 1), 1, 20)
    : 1;
  const tier = normalizedType === "potion" ? "low" : shopTierForItemType(normalizedType);
  return {
    itemId: String(entry.itemId ?? "").trim() || shopBuildItemId("core"),
    templateId: normalizedType,
    type: normalizedType,
    tier: String(entry.tier ?? "").trim().toLowerCase() || tier,
    price: Math.max(1, Math.floor(Number(entry.price ?? shopBuyPrice(normalizedType, { tier })) || 1)),
    generatedAt: Math.max(0, Math.floor(Number(entry.generatedAt ?? Date.now()) || Date.now())),
    slotType: slot,
    amount,
    source: "core",
  };
}

function normalizeShopOverflowItem(raw) {
  const entry = (raw && typeof raw === "object") ? raw : null;
  const type = normalizeItemType(entry?.templateId ?? entry?.type ?? "");
  if (!entry || !type || !ITEM_TYPES[type]) return null;
  return {
    itemId: String(entry.itemId ?? "").trim() || shopBuildItemId("overflow"),
    templateId: type,
    type,
    tier: String(entry.tier ?? "").trim().toLowerCase() || shopTierForItemType(type),
    price: Math.max(1, Math.floor(Number(entry.price ?? shopOverflowBuyPrice(type)) || 1)),
    listedAt: Math.max(0, Math.floor(Number(entry.listedAt ?? Date.now()) || Date.now())),
    soldByPlayerId: String(entry.soldByPlayerId ?? "").trim(),
    source: "overflow",
  };
}

function ensureShopState(state) {
  if (!state || typeof state !== "object") return;
  const nowMs = Date.now();
  const allowGenerate = canMutateShopStateLocally();
  const existing = (state.shop && typeof state.shop === "object") ? state.shop : {};
  const shop = {
    shopId: String(existing.shopId ?? "shop_01").trim() || "shop_01",
    shopType: normalizeShopType(existing.shopType ?? "general"),
    coreStock: Array.isArray(existing.coreStock) ? existing.coreStock.slice() : [],
    overflowStock: Array.isArray(existing.overflowStock) ? existing.overflowStock.slice() : [],
    lastRefreshMs: Number.isFinite(existing.lastRefreshMs) ? Math.max(0, Math.floor(existing.lastRefreshMs)) : nowMs,
    nextRefreshMs: Number.isFinite(existing.nextRefreshMs) ? Math.max(0, Math.floor(existing.nextRefreshMs)) : (nowMs + shopRefreshIntervalMsForLevel(state?.player?.level ?? 1)),
    refreshSeed: Number.isFinite(existing.refreshSeed) ? Math.max(0, Math.floor(existing.refreshSeed)) : randInt(Math.random, 1000000, 999999999),
  };

  if (!shop.coreStock.length && Array.isArray(existing.stock)) {
    // Legacy migration path from the previous single stock pool.
    shop.coreStock = existing.stock.map((entry, idx) => {
      const slotType = SHOP_CORE_SLOT_LAYOUT[idx] ?? "mid_gear";
      return normalizeShopCoreItem(entry, slotType, state, { nowMs, allowGenerate });
    });
  }

  const nextCore = [];
  for (let i = 0; i < SHOP_CORE_SIZE; i += 1) {
    const slotType = SHOP_CORE_SLOT_LAYOUT[i];
    const normalized = normalizeShopCoreItem(shop.coreStock[i] ?? null, slotType, state, { nowMs, allowGenerate });
    if (normalized) nextCore.push(normalized);
  }
  shop.coreStock = nextCore;

  const nextOverflow = [];
  for (const entry of shop.overflowStock) {
    const normalized = normalizeShopOverflowItem(entry);
    if (normalized) nextOverflow.push(normalized);
  }
  shop.overflowStock = nextOverflow.slice(-SHOP_OVERFLOW_MAX);
  if (!Number.isFinite(shop.nextRefreshMs) || shop.nextRefreshMs <= 0) {
    shop.nextRefreshMs = nowMs + shopRefreshIntervalMsForLevel(state?.player?.level ?? 1);
  }
  state.shop = shop;
}

function shouldRefreshShopSlot(slotType, force, rng = Math.random) {
  if (force) return true;
  const slot = String(slotType ?? "").trim().toLowerCase();
  if (slot === "low_gear" || slot === "potions") return true;
  if (slot === "mid_gear") return rng() < 0.75;
  if (slot === "high_gear") return rng() < 0.35;
  if (slot === "wildcard") return rng() < 0.5;
  return rng() < 0.5;
}

function refreshShopStock(state, force = false) {
  ensureShopState(state);
  const shop = state?.shop;
  if (!shop) return false;
  const nowMs = Date.now();
  if (!force && nowMs < (shop.nextRefreshMs ?? 0)) return false;
  let changed = false;
  for (let i = 0; i < SHOP_CORE_SIZE; i += 1) {
    const slotType = SHOP_CORE_SLOT_LAYOUT[i];
    if (!shouldRefreshShopSlot(slotType, force, Math.random)) continue;
    shop.coreStock[i] = buildShopCoreItemForSlot(state, slotType, { nowMs, rng: Math.random });
    changed = true;
  }
  shop.lastRefreshMs = nowMs;
  shop.nextRefreshMs = nowMs + shopRefreshIntervalMsForLevel(state?.player?.level ?? 1);
  return changed;
}

function shopBuyEntries(state) {
  ensureShopState(state);
  const core = Array.isArray(state?.shop?.coreStock) ? state.shop.coreStock.map((entry, coreIndex) => ({
    ...entry,
    source: "core",
    coreIndex,
  })) : [];
  const overflow = Array.isArray(state?.shop?.overflowStock) ? state.shop.overflowStock.map((entry, overflowIndex) => ({
    ...entry,
    source: "overflow",
    overflowIndex,
  })) : [];
  return [...core, ...overflow];
}

function resolveShopBuyEntry(state, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const entries = shopBuyEntries(state);
  const itemId = String(opts.itemId ?? "").trim();
  if (itemId) {
    const found = entries.find((entry) => String(entry.itemId ?? "").trim() === itemId) ?? null;
    return found;
  }
  const idx = Math.max(0, Math.floor(Number(opts.index ?? 0) || 0));
  return entries[idx] ?? null;
}

function canMutateShopStateLocally() {
  return canMutateGameplayStateLocally();
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
  return buildGroupedInventoryEntries(
    state,
    (entry) => canSellItemType(entry.type)
  ).map((entry) => ({
    idx: entry.invIndex,
    type: entry.type,
    amount: entry.amount,
    price: shopSellPrice(entry.type),
  }));
}

function buyShopItemByIndex(state, indexOrOptions = 0) {
  if (!state?.player || state.player.dead) return false;
  ensureShopState(state);
  refreshShopStock(state, false);

  const opts = (indexOrOptions && typeof indexOrOptions === "object")
    ? indexOrOptions
    : { index: Math.max(0, Math.floor(Number(indexOrOptions) || 0)) };
  const entry = resolveShopBuyEntry(state, opts);
  if (!entry) {
    pushLog(state, "That shop item is no longer available.");
    return false;
  }

  const nowMs = Date.now();
  const lastPurchaseAt = Math.max(0, Math.floor(Number(state.player.lastShopPurchaseAt ?? 0) || 0));
  if ((nowMs - lastPurchaseAt) < SHOP_PURCHASE_COOLDOWN_MS) {
    pushLog(state, "Slow down. The shopkeeper needs a moment to process that purchase.");
    return false;
  }

  const type = normalizeItemType(entry.templateId ?? entry.type ?? "");
  if (!type || !ITEM_TYPES[type]) {
    pushLog(state, "That shop item is no longer available.");
    return false;
  }
  const itemName = ITEM_TYPES[type]?.name ?? type;
  const freeShopping = !!stateDebug(state).freeShopping;
  if (type === "potion") {
    const potionCount = invCount(state, "potion");
    const potionCap = potionCapacityForState(state);
    if (potionCount >= potionCap) {
      pushLog(state, `Potion belt is full (${potionCount}/${potionCap}).`);
      return false;
    }
  }
  const price = Math.max(1, Math.floor(Number(entry.price ?? 1) || 1));
  if (!freeShopping && state.player.gold < price) {
    pushLog(state, "Not enough gold.");
    return false;
  }

  if (!freeShopping) state.player.gold -= price;
  invAdd(state, type, 1);
  state.player.lastShopPurchaseAt = nowMs;

  if (entry.source === "overflow") {
    const overflow = state.shop?.overflowStock ?? [];
    const overflowIdx = Math.max(0, Math.floor(Number(entry.overflowIndex ?? -1)));
    if (overflowIdx >= 0 && overflowIdx < overflow.length) overflow.splice(overflowIdx, 1);
  } else {
    const coreIdx = Math.max(0, Math.floor(Number(entry.coreIndex ?? -1)));
    const slotType = SHOP_CORE_SLOT_LAYOUT[coreIdx] ?? String(entry.slotType ?? "mid_gear");
    const core = state.shop?.coreStock ?? [];
    if (coreIdx >= 0 && coreIdx < core.length) {
      const current = core[coreIdx];
      const currentAmount = Math.max(1, Math.floor(Number(current?.amount ?? 1) || 1));
      if (type === "potion" && currentAmount > 1) {
        core[coreIdx] = {
          ...current,
          amount: currentAmount - 1,
          price: shopBuyPrice("potion", { tier: "low" }),
        };
      } else {
        core[coreIdx] = buildShopCoreItemForSlot(state, slotType, { nowMs });
      }
    }
  }

  pushLog(
    state,
    freeShopping
      ? `Bought ${itemName} for free.`
      : `Bought ${itemName} for ${price} gold.`
  );
  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  return true;
}

function sellShopInventoryIndex(state, invIndex) {
  if (!state?.player || state.player.dead) return false;
  ensureShopState(state);
  const idx = Math.max(0, Math.floor(Number(invIndex) || 0));
  const item = state.inv?.[idx] ?? null;
  const type = normalizeItemType(item?.type ?? "");
  if (!type) {
    pushLog(state, "That inventory item is no longer available.");
    return false;
  }
  if (!canSellItemType(type)) {
    pushLog(state, "That item can't be sold.");
    return false;
  }

  const payout = shopSellPrice(type);
  const buyback = shopOverflowBuyPrice(type);
  const itemName = ITEM_TYPES[type]?.name ?? type;
  if (!invConsume(state, type, 1)) {
    pushLog(state, "Couldn't complete that sale.");
    return false;
  }
  state.player.gold += payout;
  const sellerId = String(state?.character?.id ?? state?.player?.id ?? "").trim();
  const overflowEntry = {
    itemId: shopBuildItemId("overflow"),
    templateId: type,
    type,
    tier: shopTierForItemType(type),
    price: buyback,
    soldByPlayerId: sellerId,
    listedAt: Date.now(),
    source: "overflow",
  };
  const overflow = state.shop?.overflowStock ?? [];
  overflow.push(overflowEntry);
  while (overflow.length > SHOP_OVERFLOW_MAX) overflow.shift();

  pushLog(state, `Sold ${itemName} for ${payout} gold.`);
  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  return true;
}

function closeShopOverlay() {
  shopUi.open = false;
  shopUi.lastRefreshRequestAt = 0;
  if (!shopOverlayEl) return;
  shopOverlayEl.classList.remove("show");
  shopOverlayEl.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function updateShopOverlayMeta(state) {
  if (!shopUi.open) return;
  const now = Date.now();
  if (shopGoldEl) shopGoldEl.textContent = `Gold: ${state.player.gold}`;
  const remaining = (state.shop?.nextRefreshMs ?? now) - now;
  if (shopRefreshEl) {
    if (remaining > 0) {
      shopRefreshEl.textContent = `Refresh in ${formatMs(remaining)}`;
    } else if (isAuthoritativeSessionActive()) {
      shopRefreshEl.textContent = "Refreshing...";
    } else {
      shopRefreshEl.textContent = "Refresh in 0:00";
    }
  }

  if (remaining <= 0) {
    if (canMutateShopStateLocally()) {
      if (refreshShopStock(state, false)) renderShopOverlay(state);
      return;
    }
    if (isAuthoritativeSessionActive() && !authoritativeMirror.inFlight) {
      const lastRequestAt = Math.max(0, Math.floor(Number(shopUi.lastRefreshRequestAt ?? 0) || 0));
      if ((now - lastRequestAt) >= 1500) {
        shopUi.lastRefreshRequestAt = now;
        void performAuthoritativeCommand(interactCommand(), { reason: "shop-refresh" });
      }
    }
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
  if (canMutateShopStateLocally()) {
    ensureShopState(state);
    refreshShopStock(state, false);
  }
  shopUi.open = true;
  shopUi.lastRefreshRequestAt = 0;
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

  ensureShopState(state);
  const buyEntries = shopBuyEntries(state);
  const sellable = getSellableInventory(state);
  const isBuyMode = shopUi.mode === "buy";
  const entries = isBuyMode ? buyEntries : sellable;

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
    const spriteId = itemSpriteId({ type });
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
    const renderEntryButton = (entry, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `shopItemBtn${idx === selectedIdx ? " active" : ""}`;
      const nm = ITEM_TYPES[entry.type]?.name ?? entry.type;
      const equipValidation = (entry.type.startsWith("weapon_") || entry.type.startsWith("armor_"))
        ? canPlayerEquipItemType(state, entry.type)
        : { ok: true, reason: "" };
      const unusableBadge = equipValidation.ok ? "" : " [Unusable]";
      const playerSoldBadge = isBuyMode && entry.source === "overflow" ? " [Player Sold]" : "";
      const amount = Math.max(1, Math.floor(Number(entry.amount ?? 1) || 1));
      if (isBuyMode) btn.textContent = `${idx + 1}. ${nm}${playerSoldBadge}${unusableBadge} x${amount} - ${entry.price}g`;
      else btn.textContent = `${idx + 1}. ${nm}${unusableBadge} x${amount} - ${entry.price}g`;
      if (isBuyMode && entry.source === "overflow") {
        btn.style.borderColor = "#6a8db6";
      }
      btn.addEventListener("click", () => {
        if (isBuyMode) shopUi.selectedBuy = idx;
        else shopUi.selectedSell = idx;
        renderShopOverlay(state);
      });
      shopListEl.appendChild(btn);
    };

    if (!isBuyMode) {
      entries.forEach((entry, idx) => renderEntryButton(entry, idx));
    } else {
      const coreEntries = entries.filter((entry) => entry.source !== "overflow");
      const overflowEntries = entries.filter((entry) => entry.source === "overflow");
      let cursor = 0;
      const appendSection = (title) => {
        const label = document.createElement("div");
        label.className = "muted";
        label.style.padding = "4px 2px";
        label.textContent = title;
        shopListEl.appendChild(label);
      };
      if (coreEntries.length > 0) {
        appendSection("Shop Inventory");
        for (const entry of coreEntries) {
          renderEntryButton(entry, cursor);
          cursor += 1;
        }
      }
      if (overflowEntries.length > 0) {
        appendSection("Recently Sold");
        for (const entry of overflowEntries) {
          renderEntryButton(entry, cursor);
          cursor += 1;
        }
      }
    }
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
  const template = itemTemplateForType(selected.type);
  const usageMeta = itemUsageMetaForType(selected.type);
  const equipValidation = (selected.type.startsWith("weapon_") || selected.type.startsWith("armor_"))
    ? canPlayerEquipItemType(state, selected.type)
    : { ok: true, reason: "" };
  const atk = WEAPONS[selected.type]?.atkBonus ?? 0;
  const def = ARMOR_PIECES[selected.type]?.defBonus ?? 0;
  const weaponProfile = selected.type?.startsWith("weapon_") ? weaponAttackProfileForType(selected.type) : null;
  const amplifierProfile = WEAPONS[selected.type]?.amplifierProfile ?? null;
  const details = [];
  if (atk > 0) details.push(`ATK Bonus: +${atk}`);
  if (def > 0) details.push(`DEF Bonus: +${def}`);
  if ((ARMOR_PIECES[selected.type]?.evaBonus ?? 0) !== 0) details.push(`EVA Bonus: ${ARMOR_PIECES[selected.type].evaBonus > 0 ? "+" : ""}${ARMOR_PIECES[selected.type].evaBonus}`);
  if ((ARMOR_PIECES[selected.type]?.energyBonus ?? 0) > 0) details.push(`Energy Bonus: +${ARMOR_PIECES[selected.type].energyBonus}`);
  if (usageMeta) {
    details.push(`Family: ${titleFromId(usageMeta.family)}`);
    if (template?.materialTierId) details.push(`Tier: ${materialLabel(template.materialTierId)}`);
    if ((usageMeta.archetypeTags ?? []).length > 0) details.push(`Tags: ${(usageMeta.archetypeTags ?? []).map((tag) => titleFromId(tag)).join(", ")}`);
    details.push(`Behavior: ${usageMeta.behavior === "amplifier" ? "Amplifier" : "Replacer"}`);
    if ((usageMeta.favoredBy ?? []).length > 0) details.push(`Favored by: ${(usageMeta.favoredBy ?? []).join(", ")}`);
    if ((usageMeta.usableBy ?? []).length > 0) details.push(`Usable by: ${(usageMeta.usableBy ?? []).join(", ")}`);
  }
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
  } else if (amplifierProfile) {
    details.push("Mode: Amplifies class-native attacks");
    const r = Math.floor(Number(amplifierProfile.rangeBonus ?? 0));
    if (r !== 0) details.push(`Native range: +${r}`);
    const dmgPct = Math.round((Number(amplifierProfile.damageMult ?? 1) - 1) * 100);
    if (dmgPct !== 0) details.push(`Native damage: ${dmgPct > 0 ? "+" : ""}${dmgPct}%`);
    if (Number(amplifierProfile.accuracyBonus ?? 0) !== 0) details.push(`Native accuracy: ${Number(amplifierProfile.accuracyBonus) > 0 ? "+" : ""}${Math.round(Number(amplifierProfile.accuracyBonus))}`);
    if (Number(amplifierProfile.critBonus ?? 0) !== 0) details.push(`Native crit: ${Number(amplifierProfile.critBonus) > 0 ? "+" : ""}${Math.round(Number(amplifierProfile.critBonus))}`);
  }
  if (!atk && !def && selected.type === "potion") details.push("Consumable healing item.");
  if (!atk && !def && selected.type !== "potion") details.push("Utility item.");
  if (!equipValidation.ok && equipValidation.reason) details.push(`Cannot equip now: ${equipValidation.reason}`);
  if (isBuyMode && selected.source === "overflow") details.push("Source: Player Sold");
  if (isBuyMode && selected.source !== "overflow") details.push("Source: Core Stock");
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
  shopActionBtnEl.disabled =
    !selected ||
    (!isBuyMode && selected.amount <= 0) ||
    (isAuthoritativeSessionActive() && authoritativeMirror.inFlight);
  shopActionBtnEl.onclick = () => {
    const currentStock = shopBuyEntries(state);
    const currentSellable = getSellableInventory(state);
    const liveIsBuyMode = shopUi.mode === "buy";
    const liveEntries = liveIsBuyMode ? currentStock : currentSellable;
    const liveIndex = liveIsBuyMode ? shopUi.selectedBuy : shopUi.selectedSell;
    const liveSelected = liveEntries[liveIndex] ?? null;
    if (!liveSelected) return;

    if (isAuthoritativeSessionActive()) {
      const command = liveIsBuyMode
        ? buyShopItemCommand({ itemId: liveSelected.itemId, index: liveIndex })
        : sellShopItemCommand(liveSelected.idx);
      if (!command) return;
      void performAuthoritativeCommand(command, {
        reason: liveIsBuyMode ? "shop-buy" : "shop-sell",
      });
      return;
    }

    if (liveIsBuyMode) {
      buyShopItemByIndex(state, { itemId: liveSelected.itemId, index: liveIndex });
    } else {
      sellShopInventoryIndex(state, liveSelected.idx);
    }
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
  let id = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,80}$/.test(id)) return null;
  if (id === "slime" || id === "jelly" || id === "jelly_yellow") id = "slime_yellow";
  else if (id === "jelly_green") id = "slime_green";
  else if (id === "jelly_red") id = "slime_red";
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
  const encounterProfile = FEATURE_FLAGS.roomArchetypes
    ? (chunk.encounterProfile ?? buildChunkEncounterProfile({
        depth: z,
        seed: worldSeed,
        cx,
        cy,
        specials,
        lockedDoorRewards,
      }))
    : null;
  const isOpenCell = (x, y) => {
    const t = grid[y]?.[x];
    return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
  };
  const occupiedItemCells = new Set();
  const occupiedMonsterCells = new Set();
  const cellKey = (x, y) => `${x},${y}`;

  const depthBoost = clamp(z, 0, 60);

  const monsterCount = clamp(
    randInt(rng, 2, 5) +
      (rng() < depthBoost / 50 ? 1 : 0) +
      (rng() < 0.38 ? 1 : 0) +
      Math.max(-1, Math.min(2, Math.floor(encounterProfile?.monsterCountBonus ?? 0))),
    0,
    10
  );

  // Higher baseline item density for a richer dungeon.
  const itemCount = clamp(randInt(rng, 2, 6) + (rng() < 0.30 ? 1 : 0), 0, 9);
  const trapCount = clamp(
    Math.round(randInt(rng, 0, 1) * Math.max(0.5, Number(encounterProfile?.trapWeightMult ?? 1))) +
      (rng() < clamp((0.18 + z * 0.012) * Math.max(0.5, Number(encounterProfile?.trapWeightMult ?? 1)), 0.12, 0.6) ? 1 : 0) +
      (rng() < clamp((z - 6) * 0.01, 0, 0.22) ? 1 : 0),
    0,
    3
  );

  const cells = samplePassableCellsInChunk(grid, rng, monsterCount + itemCount + trapCount + 24);
  const monsters = [];
  const mTable = encounterProfile
    ? weightedMonsterTableForEncounter(monsterTableForDepth(z), encounterProfile)
    : monsterTableForDepth(z);

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
    const equipmentType = rng() < 0.6
      ? weaponForDepth(z, rng, { source: "floor", factionId: encounterProfile?.factionId ?? "" })
      : armorForDepth(z, rng, { source: "floor", factionId: encounterProfile?.factionId ?? "" });
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
    const trapFamily = FEATURE_FLAGS.advancedTraps
      ? chooseTrapFamily({
          archetypeId: encounterProfile?.archetypeId ?? "",
          rng,
        })
      : "pressure_plate";
    traps.push({
      id: `t|${z}|${cx},${cy}|${i}`,
      type: trapFamily,
      trapFamily,
      depth: z,
      factionId: encounterProfile?.factionId ?? "",
      lx: c.x,
      ly: c.y,
      charges: 1,
      payload: {},
    });
  }

  if (encounterProfile?.archetypeId === "merchant_refuge") {
    const c = cells[monsterCount + itemCount + trapCount + 2] ?? cells[cells.length - 1];
    if (c && !occupiedItemCells.has(cellKey(c.x, c.y))) {
      pushItem({
        id: `shopkeeper|${z}|${cx},${cy}|merchant`,
        type: "shopkeeper",
        amount: 1,
        lx: c.x,
        ly: c.y,
      });
    }
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
    inv: normalizeInventoryEntries(state.inv ?? [], {
      speciesId: profile.speciesId,
      classId: profile.classId,
      ownerId: profile.id,
    }),
    equip: normalizeEquip(p.equip ?? {}, { speciesId: profile.speciesId, classId: profile.classId }),
    maxHp: Math.max(1, Math.floor(p.maxHp ?? maxHpForLevel(Math.max(1, Math.floor(p.level ?? 1)), profile))),
  };
}

function pushLog(state, msg) {
  state.log = ensureArray(state?.log);
  state.log.push(msg);
  if (state.log.length > 160) state.log.shift();
  renderLog(state);
}
function renderLog(state) {
  const entries = ensureArray(state?.log);
  state.log = entries;
  const last = entries.slice(-55);
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
    "WARNING: Starting a new dungeon permanently discards the current dungeon instance for this account. All characters will have dungeon position reset and will re-enter at the new dungeon entrance."
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

function isCharacterSwitchConfirmOpen() {
  return !!characterSwitchConfirmOverlayEl?.classList.contains("show");
}

function setCharacterSwitchConfirmOpen(open) {
  if (!characterSwitchConfirmOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
  }
  characterSwitchConfirmOverlayEl.classList.toggle("show", show);
  characterSwitchConfirmOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) characterSwitchConfirmConfirmEl?.focus();
}

function resolveCharacterSwitchConfirm(confirmed) {
  const resolver = characterSwitchConfirmResolver;
  characterSwitchConfirmResolver = null;
  setCharacterSwitchConfirmOpen(false);
  if (resolver) resolver(!!confirmed);
}

function openCharacterSwitchConfirm(currentSlot = null, targetSlot = null) {
  if (characterSwitchConfirmResolver) return Promise.resolve(false);
  const currentName = String(currentSlot?.profile?.name ?? currentSlot?.name ?? ensureCharacterState(game)?.name ?? DEFAULT_CHARACTER_NAME).trim() || DEFAULT_CHARACTER_NAME;
  const targetName = String(targetSlot?.profile?.name ?? targetSlot?.name ?? DEFAULT_CHARACTER_NAME).trim() || DEFAULT_CHARACTER_NAME;
  const hasSavedPosition = !!targetSlot?.hasDungeonPosition;
  const title = hasSavedPosition ? "Switch Character?" : "Start Character?";
  const body = hasSavedPosition
    ? `You will stop controlling ${currentName} and resume ${targetName} at their saved location.`
    : `${targetName} will enter the dungeon at the entrance.\nYour current character will remain saved.`;
  if (!characterSwitchConfirmOverlayEl || !characterSwitchConfirmTitleEl || !characterSwitchConfirmTextEl) {
    return Promise.resolve(confirm(body));
  }
  characterSwitchConfirmTitleEl.textContent = title;
  characterSwitchConfirmTextEl.textContent = body;
  setCharacterSwitchConfirmOpen(true);
  return new Promise((resolve) => {
    characterSwitchConfirmResolver = resolve;
  });
}

function buildGuestCharacterCardMarkup(state) {
  const run = state && typeof state === "object" ? state : game;
  const profile = ensureCharacterState(run);
  const classLabel = characterClassDef(profile?.classId ?? "").name;
  const speciesLabel = characterSpeciesDef(profile?.speciesId ?? "").name;
  const spriteDisplay = resolveCharacterSpriteDisplay(profile?.speciesId ?? "", profile?.classId ?? "");
  const visual = spriteDisplay.src
    ? `<img class="charSlotSprite" src="${spriteDisplay.src}" alt="${escapeHtmlText(speciesLabel)} ${escapeHtmlText(classLabel)} sprite" />`
    : `<div class="charSlotSpriteFallback">@</div>`;
  const level = Math.max(1, Math.floor(run?.player?.level ?? 1));
  const depth = Math.trunc(run?.player?.z ?? 0);
  return (
    `<div class="charSlotVisual">${visual}</div>` +
    `<div class="charSlotInfo">` +
      `<div class="charSlotTitle">${escapeHtmlText(profile?.name ?? DEFAULT_CHARACTER_NAME)}</div>` +
      `<div class="charSlotMeta">Species: ${escapeHtmlText(speciesLabel)}  |  Class: ${escapeHtmlText(classLabel)}\n` +
      `Level ${level}  |  Depth ${depth}</div>` +
    `</div>`
  );
}

function isGuestNewCharacterOverlayOpen() {
  return !!guestNewCharacterOverlayEl?.classList.contains("show");
}

function setGuestNewCharacterOverlayOpen(open) {
  if (!guestNewCharacterOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
  }
  guestNewCharacterOverlayEl.classList.toggle("show", show);
  guestNewCharacterOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) guestNewCharacterConfirmEl?.focus();
}

function resolveGuestNewCharacterChoice(confirmed) {
  const resolver = guestNewCharacterResolver;
  guestNewCharacterResolver = null;
  setGuestNewCharacterOverlayOpen(false);
  if (resolver) resolver(!!confirmed);
}

function openGuestNewCharacterOverlay(state = null) {
  if (guestNewCharacterResolver) return Promise.resolve(false);
  if (!guestNewCharacterOverlayEl) return Promise.resolve(false);
  if (guestNewCharacterCurrentCardEl) {
    guestNewCharacterCurrentCardEl.innerHTML = buildGuestCharacterCardMarkup(state ?? game);
  }
  setGuestNewCharacterOverlayOpen(true);
  return new Promise((resolve) => {
    guestNewCharacterResolver = resolve;
  });
}

async function openGuestNewCharacterCreationFlow() {
  if (isAuthenticatedUser) {
    await openCharacterSelectionOverlay({ purpose: "load_run" });
    return true;
  }
  characterUi.loading = false;
  characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromLocal());
  const activeId = getActiveCharacterSlotId();
  const activeExists = !!(activeId && characterUi.slots.some((slot) => slot.id === activeId));
  characterUi.selectedSaveId = activeExists ? activeId : (characterUi.slots[0]?.id || "");
  characterUi.mode = "create";
  characterUi.selectionPurpose = "load_run";
  requiresCharacterCreation = true;
  setCharacterOverlayStatus(
    "Creating a new guest character overwrites this guest run. Log in first if you want to keep it.",
    true
  );
  resetCharacterCreationDraft(null, { step: "welcome" });
  setCharacterOverlayOpen(true);
  renderCharacterOverlay();
  return true;
}

async function handleGuestNewCharacterRequest() {
  if (!game) return false;
  const confirmed = await openGuestNewCharacterOverlay(game);
  if (!confirmed) return false;
  return openGuestNewCharacterCreationFlow();
}

function isGuestLoginImportOverlayOpen() {
  return !!guestLoginImportOverlayEl?.classList.contains("show");
}

function setGuestLoginImportOverlayOpen(open) {
  if (!guestLoginImportOverlayEl) return;
  const show = !!open;
  if (show) {
    closeMobilePanels();
    setDebugMenuOpen(false);
  }
  guestLoginImportOverlayEl.classList.toggle("show", show);
  guestLoginImportOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  syncBodyModalLock();
  if (show) guestLoginImportConfirmEl?.focus();
}

function resolveGuestLoginImportChoice(shouldImport) {
  const resolver = guestLoginImportResolver;
  guestLoginImportResolver = null;
  setGuestLoginImportOverlayOpen(false);
  if (resolver) resolver(!!shouldImport);
}

function openGuestLoginImportOverlay(state = null) {
  if (guestLoginImportResolver) return Promise.resolve(false);
  if (!guestLoginImportOverlayEl) return Promise.resolve(false);
  if (guestLoginImportCharacterCardEl) {
    guestLoginImportCharacterCardEl.innerHTML = buildGuestCharacterCardMarkup(state ?? game);
  }
  setGuestLoginImportOverlayOpen(true);
  return new Promise((resolve) => {
    guestLoginImportResolver = resolve;
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
    if (isAuthoritativeModeEnabled()) {
      if (isAuthoritativeSessionActive() && typeof authoritativeApi?.newDungeon === "function") {
        const response = await authoritativeApi.newDungeon({
          sessionId: authoritativeMirror.sessionId,
        });
        const applied = applyAuthoritativeSnapshotToGame(response, {
          clearDirty: true,
          reason: "new-dungeon",
        });
        if (!applied || !response?.ok) {
          throw new Error(response?.error ?? "Could not start a fresh dungeon.");
        }
      } else {
        const currentCharacterId = activeCharacterProfileIdFromCurrentState() || normalizeCharacterProfileIdFromSlotId(getActiveCharacterSlotId());
        if (!currentCharacterId) throw new Error("Could not determine the active character for the new dungeon.");
        await openAuthoritativeSessionForSelection(currentCharacterId, {
          forceEntrance: true,
          freshWorld: true,
          reason: "new-dungeon",
        });
      }
      saveRuntime.activeRunSaveId = "";
      saveRuntime.activeAutosaveSaveId = "";
      const activeCharacterId = activeCharacterProfileIdFromCurrentState();
      if (activeCharacterId) {
        setActiveCharacterSlotId(characterStateSlotId(activeCharacterId) || getActiveCharacterSlotId());
      }
      clearSaveDirty();
      refreshSaveNameFromLive(true);
      return true;
    }
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
  if (run && !isQuickSwitchCharacterActive(run)) {
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
      latestSaveId: slotMeta.id,
      hasDungeonPosition: true,
    });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (!isAuthenticatedUser) characterUi.activeSaveId = idx.activeId || out[0]?.id || "";
  return out;
}

function markSaveDirty(state, reason = "") {
  if (!state) return;
  if (isQuickSwitchCharacterActive(state)) {
    saveRuntime.pendingAutosaveReason = "";
    return;
  }
  if (isAuthoritativeSessionActive()) {
    saveRuntime.dirty = true;
    saveRuntime.dirtyReason = String(reason || "authoritative");
    saveRuntime.lastDirtyAt = Date.now();
    if (saveRuntime.pendingAutosaveReason) {
      const autoReason = String(saveRuntime.pendingAutosaveReason);
      saveRuntime.pendingAutosaveReason = "";
      void autosaveIfDirty(autoReason);
    }
    return;
  }
  saveRuntime.dirty = true;
  saveRuntime.dirtyReason = String(reason || "state-change");
  saveRuntime.lastDirtyAt = Date.now();
  syncItemAuthorityFromStateIfChanged(state, reason || "state-change");
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
  if (isQuickSwitchCharacterActive(game)) return false;
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
  if (isQuickSwitchCharacterActive(game)) {
    clearQuickSwitchPersistenceRuntime();
    return true;
  }
  if (!game || !saveRuntime.dirty || saveRuntime.saving) return true;
  saveRuntime.saving = true;
  try {
    if (isAuthoritativeSessionActive()) {
      clearSaveDirty();
      return true;
    }
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

async function autosaveBeforeCharacterSwitch() {
  if (!game) return true;
  if (isAuthoritativeModeEnabled()) {
    if (isAuthoritativeSessionActive()) {
      clearSaveDirty();
      return true;
    }
    return true;
  }
  if (!isAuthenticatedUser) return autosaveIfDirty("switch-character");
  const hasServerRunSave = !!String(saveRuntime.activeAutosaveSaveId ?? saveRuntime.activeRunSaveId ?? "").trim();
  if (saveRuntime.dirty || !hasServerRunSave) {
    return saveCurrentGameToServer(String(saveRuntime.activeAutosaveSaveId ?? saveRuntime.activeRunSaveId ?? "").trim(), {
      autosave: true,
    });
  }
  return true;
}

function exportCharacterSnapshot(state) {
  const src = state && typeof state === "object" ? state : {};
  const p = src.player ?? {};
  const profile = normalizeCharacterProfile(src.character ?? null);
  return {
    character: profile,
    position: {
      x: Number.isFinite(Number(p.x)) ? Math.floor(Number(p.x)) : null,
      y: Number.isFinite(Number(p.y)) ? Math.floor(Number(p.y)) : null,
      depth: Number.isFinite(Number(p.z)) ? Math.floor(Number(p.z)) : null,
    },
    player: {
      level: Math.max(1, Math.floor(p.level ?? 1)),
      xp: Math.max(0, Math.floor(p.xp ?? 0)),
      hp: Math.max(0, Math.floor(p.hp ?? 0)),
      maxHp: Math.max(1, Math.floor(p.maxHp ?? 1)),
      gold: Math.max(0, Math.floor(p.gold ?? 0)),
      inv: normalizeInventoryEntries(src.inv ?? [], {
        speciesId: profile.speciesId,
        classId: profile.classId,
        ownerId: profile.id,
      }),
      equip: normalizeEquip(p.equip ?? {}, { speciesId: profile.speciesId, classId: profile.classId }),
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
    const profile = normalizeCharacterProfile(decoded.character ?? null);
    const speciesId = normalizeCharacterSpeciesId(decoded?.player?.speciesId ?? profile.speciesId);
    const classId = normalizeCharacterClassId(decoded?.player?.classId ?? profile.classId, speciesId);
    return {
      character: profile,
      position: normalizeCharacterSnapshotPosition(decoded?.position ?? decoded?.character?.position ?? null),
      player: {
        level: Math.max(1, Math.floor(decoded?.player?.level ?? 1)),
        xp: Math.max(0, Math.floor(decoded?.player?.xp ?? 0)),
        hp: Math.max(0, Math.floor(decoded?.player?.hp ?? 0)),
        maxHp: Math.max(1, Math.floor(decoded?.player?.maxHp ?? 1)),
        gold: Math.max(0, Math.floor(decoded?.player?.gold ?? 0)),
        inv: normalizeInventoryEntries(decoded?.player?.inv ?? [], {
          speciesId,
          classId,
          ownerId: profile.id,
        }),
        equip: normalizeEquip(decoded?.player?.equip ?? {}, {
          speciesId,
          classId,
        }),
        classId,
        speciesId,
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
  const profile = normalizeCharacterProfile(decoded.character ?? null);
  const speciesId = normalizeCharacterSpeciesId(decoded?.player?.speciesId ?? profile.speciesId);
  const classId = normalizeCharacterClassId(decoded?.player?.classId ?? profile.classId, speciesId);
  return {
    character: profile,
    position: normalizeCharacterSnapshotPosition(decoded?.position ?? decoded?.character?.position ?? null),
    player: {
      level: Math.max(1, Math.floor(decoded?.player?.level ?? 1)),
      xp: Math.max(0, Math.floor(decoded?.player?.xp ?? 0)),
      hp: Math.max(0, Math.floor(decoded?.player?.hp ?? 0)),
      maxHp: Math.max(1, Math.floor(decoded?.player?.maxHp ?? 1)),
      gold: Math.max(0, Math.floor(decoded?.player?.gold ?? 0)),
      inv: normalizeInventoryEntries(decoded?.player?.inv ?? [], {
        speciesId,
        classId,
        ownerId: profile.id,
      }),
      equip: normalizeEquip(decoded?.player?.equip ?? {}, {
        speciesId,
        classId,
      }),
      classId,
      speciesId,
    },
  };
}

function buildCharacterSnapshotFromCarryover(profile, carryover = null) {
  const normalizedProfile = normalizeCharacterProfile(profile ?? carryover?.character ?? null);
  const level = Math.max(1, Math.floor(carryover?.level ?? 1));
  const maxHp = Math.max(1, Math.floor(carryover?.maxHp ?? maxHpForLevel(level, normalizedProfile)));
  return {
    character: normalizedProfile,
    position: { x: null, y: null, depth: null },
    player: {
      level,
      xp: Math.max(0, Math.floor(carryover?.xp ?? 0)),
      hp: maxHp,
      maxHp,
      gold: Math.max(0, Math.floor(carryover?.gold ?? 0)),
      inv: normalizeInventoryEntries(carryover?.inv ?? [], {
        speciesId: normalizedProfile.speciesId,
        classId: normalizedProfile.classId,
        ownerId: normalizedProfile.id,
      }),
      equip: normalizeEquip(carryover?.equip ?? { weapon: null, head: null, chest: null, legs: null }, {
        speciesId: normalizedProfile.speciesId,
        classId: normalizedProfile.classId,
      }),
      classId: normalizedProfile.classId,
      speciesId: normalizedProfile.speciesId,
    },
  };
}

async function persistCharacterSnapshot(snapshot, profile = null) {
  const normalizedProfile = normalizeCharacterProfile(profile ?? snapshot?.character ?? null);
  if (!normalizedProfile?.id) return false;
  const payload = encodeCharacterSnapshotPayload(snapshot);
  if (!payload) return false;
  if (isAuthenticatedUser) {
    await saveApiRequest("POST", {
      action: "character_sync",
      character_id: normalizedProfile.id,
      name: normalizedProfile.name,
      payload,
    });
    return true;
  }
  try {
    localStorage.setItem(characterStatePayloadKey(normalizedProfile.id), payload);
    return true;
  } catch {
    return false;
  }
}

async function syncCharacterStateIfDirty(reason = "") {
  if (isAuthoritativeModeEnabled()) {
    characterSyncRuntime.dirty = false;
    characterSyncRuntime.reason = "";
    if (characterSyncRuntime.timer) {
      clearTimeout(characterSyncRuntime.timer);
      characterSyncRuntime.timer = 0;
    }
    return true;
  }
  if (isQuickSwitchCharacterActive(game)) {
    characterSyncRuntime.dirty = false;
    characterSyncRuntime.reason = "";
    if (characterSyncRuntime.timer) {
      clearTimeout(characterSyncRuntime.timer);
      characterSyncRuntime.timer = 0;
    }
    return true;
  }
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
  if (isAuthoritativeModeEnabled()) return;
  if (isQuickSwitchCharacterActive(state)) return;
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
  clearQuickSwitchCharacterState(state);

  p.level = Math.max(1, Math.floor(snapPlayer.level ?? p.level ?? 1));
  p.xp = Math.max(0, Math.floor(snapPlayer.xp ?? p.xp ?? 0));
  p.gold = Math.max(0, Math.floor(snapPlayer.gold ?? p.gold ?? 0));
  p.equip = normalizeEquip(snapPlayer.equip ?? p.equip ?? {}, { speciesId: profile.speciesId, classId: profile.classId });
  p.effects = [];
  p.classId = normalizeCharacterClassId(snapPlayer.classId ?? profile.classId, profile.speciesId);
  p.speciesId = normalizeCharacterSpeciesId(snapPlayer.speciesId ?? profile.speciesId);
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;
  p.attackAfterMove = false;
  p.abilityCd = 0;
  p.dead = false;
  state.inv = normalizeInventoryEntries(snapPlayer.inv ?? state.inv ?? [], {
    speciesId: profile.speciesId,
    classId: profile.classId,
    ownerId: profile.id,
  });

  const snapMaxHp = Math.max(1, Math.floor(snapPlayer.maxHp ?? p.maxHp ?? 1));
  const snapHp = Math.max(0, Math.floor(snapPlayer.hp ?? p.hp ?? snapMaxHp));
  const hpRatio = clamp(snapHp / snapMaxHp, 0, 1);
  recalcDerivedStats(state);
  p.hp = clamp(Math.round((p.maxHp ?? 1) * hpRatio), 0, p.maxHp ?? 1);
  p.energy = p.energyMax;
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
  const providedCharacterId = normalizeCharacterProfileId(opts.characterId ?? "");
  const providedLatestSaveId = String(opts.latestSaveId ?? "").trim();
  const currentId = String(getActiveCharacterSlotId() ?? "");
  // In Quick Switch mode we must still reload even if slot id matches,
  // otherwise the temporary test class cannot be reverted.
  if (
    currentId &&
    currentId === id &&
    !isQuickSwitchCharacterActive(game) &&
    (!isAuthoritativeModeEnabled() || isAuthoritativeSessionActive())
  ) return true;

  if (isAuthoritativeModeEnabled()) {
    const characterOnlyId = providedCharacterId || normalizeCharacterProfileIdFromSlotId(id);
    if (!characterOnlyId) return false;
    try {
      await openAuthoritativeSessionForSelection(characterOnlyId, {
        forceEntrance,
        reason: "load-character",
      });
      saveRuntime.activeRunSaveId = "";
      saveRuntime.activeAutosaveSaveId = "";
      setActiveCharacterSlotId(characterStateSlotId(characterOnlyId) || id);
      clearSaveDirty();
      refreshSaveNameFromLive(true);
      return true;
    } catch (err) {
      const message = String(err?.message ?? "").trim();
      if (message) {
        if (isCharacterOverlayOpen()) setCharacterOverlayStatus(message, true);
        else if (game?.log) {
          pushLog(game, message);
          renderLog(game);
        }
      }
      return false;
    }
  }

  if (isAuthenticatedUser) {
    const characterOnlyId = providedCharacterId || normalizeCharacterProfileIdFromSlotId(id);
    if (characterOnlyId) {
      const latestSaveId = providedLatestSaveId || await resolveLatestSaveIdForCharacter(characterOnlyId);
      if (latestSaveId) {
        const loaded = await loadSaveFromServer(latestSaveId, { showStatus: false, closeOverlay: false, forceEntrance });
        if (!loaded) return false;
        clearSaveDirty();
        markCharacterStateDirty(game, "load-run");
        void syncCharacterStateIfDirty("load-run");
        return true;
      }
      const snapshot = await resolveCharacterSnapshotFromServerState(characterOnlyId);
      if (!snapshot) return false;
      const profile = normalizeCharacterProfile(snapshot.character ?? { id: characterOnlyId });
      const seededRun = game ? createCharacterRunFromCurrentDungeon(game, snapshot) : null;
      if (seededRun) {
        game = seededRun;
      } else {
        const carryover = {
          character: profile,
          level: Math.max(1, Math.floor(snapshot?.player?.level ?? 1)),
          xp: Math.max(0, Math.floor(snapshot?.player?.xp ?? 0)),
          gold: Math.max(0, Math.floor(snapshot?.player?.gold ?? 0)),
          inv: normalizeInventoryEntries(snapshot?.player?.inv ?? [], {
            speciesId: profile.speciesId,
            classId: profile.classId,
            ownerId: profile.id,
          }),
          equip: normalizeEquip(snapshot?.player?.equip ?? {}, {
            speciesId: profile.speciesId,
            classId: profile.classId,
          }),
          maxHp: Math.max(1, Math.floor(snapshot?.player?.maxHp ?? maxHpForLevel(1, profile))),
        };
        game = makeNewGame(randomSeedString(), { carryover });
      }
      if (forceEntrance) {
        respawnAtStart(game);
      }
      const slotName = `${profile.name} • ${characterClassDef(profile.classId).name}`.slice(0, saveNameMaxLen);
      const savedRun = await saveStateToServerSlot(game, "", slotName);
      enforceAdminControlPolicy(game);
      updateDebugMenuUi(game);
      setDebugMenuOpen(false);
      updateContextActionButton(game);
      updateDeathOverlay(game);
      setActiveCharacterSlotId(id);
      saveRuntime.activeRunSaveId = String(savedRun?.save?.id ?? "").trim();
      saveRuntime.activeAutosaveSaveId = "";
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

async function switchCharacter(slotId, options = null) {
  if (isAuthoritativeModeEnabled()) {
    const opts = (options && typeof options === "object") ? options : {};
    const saved = await autosaveBeforeCharacterSwitch();
    if (!saved && game) {
      const proceed = confirm("Could not auto-save current character. Switch anyway?");
      if (!proceed) return false;
    }
    const id = String(slotId ?? "").trim();
    const characterId = normalizeCharacterProfileId(opts.characterId ?? "") || normalizeCharacterProfileIdFromSlotId(id);
    if (!characterId) return false;
    const switched = await switchAuthoritativeCharacter(characterId, {
      forceEntrance: opts.forceEntrance === true,
      reason: "switch-character",
    });
    if (switched) {
      saveRuntime.activeRunSaveId = "";
      saveRuntime.activeAutosaveSaveId = "";
      setActiveCharacterSlotId(characterStateSlotId(characterId) || id);
      clearSaveDirty();
      refreshSaveNameFromLive(true);
    }
    return switched;
  }
  return swapCharacterFromSlotIntoCurrentRun(slotId, options);
}

function placePlayerFromCharacterSnapshot(state, snapshot, options = null) {
  if (!state?.player) return false;
  const opts = (options && typeof options === "object") ? options : {};
  const pos = normalizeCharacterSnapshotPosition(snapshot?.position ?? snapshot?.character?.position ?? null);
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.depth)) {
    return placePlayerAtDungeonEntrance(state, {
      message: String(opts.entranceMessage ?? "").trim(),
      resetVision: opts.resetVision === true,
    });
  }
  const p = state.player;
  p.x = pos.x;
  p.y = pos.y;
  p.z = pos.depth;
  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);
  setLastLadderLanding(state, p);
  ensureSurfaceLinkTile(state);
  ensureShopState(state);
  updateAreaRespawnTracking(state, Date.now());
  hydrateNearby(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  return true;
}

async function swapCharacterFromSlotIntoCurrentRun(slotId, options = null) {
  const id = String(slotId ?? "").trim();
  if (!id || !game) return false;
  const opts = (options && typeof options === "object") ? options : {};
  const providedCharacterId = normalizeCharacterProfileId(opts.characterId ?? "");
  const currentId = String(getActiveCharacterSlotId() ?? "");
  // In Quick Switch mode we must still reload even if slot id matches,
  // otherwise the temporary test class cannot be reverted.
  if (
    currentId &&
    currentId === id &&
    !isQuickSwitchCharacterActive(game) &&
    (!isAuthoritativeModeEnabled() || isAuthoritativeSessionActive())
  ) return true;

  const saved = await autosaveBeforeCharacterSwitch();
  if (!saved && game) {
    const proceed = confirm("Could not auto-save current character. Switch anyway?");
    if (!proceed) return false;
  }

  let loaded = null;
  let loadedCharacterId = "";
  if (isAuthenticatedUser) {
    const characterOnlyId = providedCharacterId || normalizeCharacterProfileIdFromSlotId(id);
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
  placePlayerFromCharacterSnapshot(game, snapshot, {
    entranceMessage: "You enter the dungeon...",
  });
  if (isAuthenticatedUser) {
    const nextSlotId = characterStateSlotId(loadedCharacterId);
    setActiveCharacterSlotId(nextSlotId || id);
  } else {
    setActiveCharacterSlotId(id);
  }
  if (isAuthenticatedUser) {
    saveRuntime.activeRunSaveId = "";
    saveRuntime.activeAutosaveSaveId = await resolveAutosaveOverwriteIdFromServer(game);
  } else {
    saveRuntime.activeRunSaveId = "";
    saveRuntime.activeAutosaveSaveId = "";
  }
  resetItemAuthorityRuntime(itemAuthorityCharacterIdForState(game));
  refreshSaveNameFromLive(true);
  saveNow(game);
  clearSaveDirty();
  markCharacterStateDirty(game, "swap-character");
  void syncCharacterStateIfDirty("swap-character");
  return true;
}

async function switchToCharacterSlot(slotId, options = null) {
  return switchCharacter(slotId, options);
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
    err.response = { ...(data && typeof data === "object" ? data : {}), status_code: resp.status };
    throw err;
  }
  return data;
}

function initializeAnalyticsForState(state, snapshot = null, reason = "runtime") {
  if (!state?.player || !state?.world) return null;
  const analytics = createOrResumeAnalyticsState(snapshot, {
    seed: state.world.seedStr,
    depth: state.player.z,
    nowMs: Date.now(),
  });
  enterAnalyticsFloor(analytics, state.player.z, Date.now());
  const isFreshRun = !snapshot || snapshot.runId !== analytics.runId;
  if (isFreshRun) {
    queueAnalyticsEvent(analytics, "floor_enter", state.player.z, state.player.x, state.player.y, {
      reason,
    });
  }
  state.analytics = analytics;
  return analytics;
}

function ensureAnalyticsState(state) {
  if (!state) return null;
  if (!state.analytics || typeof state.analytics !== "object") {
    state.analytics = initializeAnalyticsForState(state, null, "ensure");
  }
  return state.analytics ?? null;
}

function analyticsEventAtPlayer(state, type, payload = null, depth = null, x = null, y = null) {
  const analytics = ensureAnalyticsState(state);
  if (!analytics) return null;
  return queueAnalyticsEvent(
    analytics,
    type,
    depth ?? state?.player?.z ?? analytics.currentDepth ?? 0,
    x ?? state?.player?.x ?? null,
    y ?? state?.player?.y ?? null,
    payload ?? {}
  );
}

async function flushAnalyticsIfNeeded(state, reason = "heartbeat", force = false) {
  const analytics = ensureAnalyticsState(state);
  if (!analytics) return false;
  accumulateAnalyticsTime(analytics, Date.now());
  if (!force && !analyticsNeedsHeartbeat(analytics, Date.now())) return false;
  if (!FEATURE_FLAGS.telemetryUpload) return false;
  if (analyticsRuntime.flushing) return false;

  analyticsRuntime.flushing = true;
  analyticsRuntime.lastError = "";
  const queuedEvents = Array.isArray(analytics.pendingEvents) ? analytics.pendingEvents.slice() : [];

  try {
    if (!analytics.hasRunStartSent) {
      await analyticsApi.runStart(buildRunStartPayload(analytics, state, { reason }));
      analytics.hasRunStartSent = true;
    }

    await analyticsApi.heartbeat(buildHeartbeatPayload(analytics, state, { reason }));
    analytics.pendingEvents = [];
    if (queuedEvents.length) {
      await analyticsApi.eventBatch({
        run_id: analytics.runId,
        reason,
        events: queuedEvents,
      });
    }
    if (force && analytics.ended) {
      await analyticsApi.runEnd(buildRunEndPayload(analytics, state, {
        reason,
      }));
    }
    markAnalyticsHeartbeat(analytics, Date.now());
    return true;
  } catch (err) {
    analyticsRuntime.lastError = String(err?.message ?? "analytics-flush-failed");
    if (queuedEvents.length) analytics.pendingEvents = [...queuedEvents, ...(analytics.pendingEvents ?? [])];
    return false;
  } finally {
    analyticsRuntime.flushing = false;
  }
}

async function endAnalyticsRun(state, {
  status = "ended",
  deathCause = "",
  deathKillerType = "",
  reason = "run-end",
  bestEffortBeacon = false,
} = {}) {
  const analytics = ensureAnalyticsState(state);
  if (!analytics || analytics.ended) return false;
  markAnalyticsEnded(analytics, {
    status,
    deathCause,
    deathKillerType,
    endedAtMs: Date.now(),
  });
  analyticsEventAtPlayer(state, "run_end", {
    status,
    deathCause,
    deathKillerType,
    turn: state?.turn ?? 0,
  });
  if (bestEffortBeacon && typeof analyticsApi?.runEndBestEffort === "function") {
    try {
      analyticsApi.runEndBestEffort(buildRunEndPayload(analytics, state, { reason }));
    } catch {}
  }
  return flushAnalyticsIfNeeded(state, reason, true);
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
    if (String(saveRuntime.activeAutosaveSaveId ?? "") === String(saveId)) {
      saveRuntime.activeAutosaveSaveId = "";
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
  const requireAlive = opts.requireAlive === true;
  saveMenuUi.loading = true;
  renderSaveGameOverlay();
  if (showStatus) setSaveGameStatus("Loading save...", false);
  try {
    if (isAuthoritativeModeEnabled()) {
      let saveDetail = null;
      if (requireAlive) {
        saveDetail = await saveApiRequest("GET", null, `load=${encodeURIComponent(saveId)}`);
        const candidate = importSave(String(saveDetail?.save?.payload ?? ""));
        if (!candidate || candidate?.player?.dead || Number(candidate?.player?.hp ?? 0) <= 0) {
          throw new Error("Autosave is from a dead state.");
        }
      }
      const response = await openAuthoritativeSessionForSelection("", {
        saveId,
        forceEntrance,
        reason: "load-save",
      });
      const targetCharacterId = normalizeCharacterProfileId(response?.snapshot?.character?.id ?? "");
      saveRuntime.activeRunSaveId = String(saveId);
      saveRuntime.activeAutosaveSaveId = saveNameLooksLikeAutosave(saveDetail?.save?.name ?? "") ? String(saveId) : "";
      const activeCharacterSlotId = characterStateSlotId(targetCharacterId);
      if (activeCharacterSlotId) setActiveCharacterSlotId(activeCharacterSlotId);
      clearSaveDirty();
      if (showStatus) setSaveGameStatus(`Loaded "${saveDetail?.save?.name ?? "save"}".`, false);
      if (closeOverlay) closeSaveGameOverlay();
      return true;
    }
    const activeCharacterId = activeCharacterProfileIdFromCurrentState();
    const data = await saveApiRequest("GET", null, `load=${encodeURIComponent(saveId)}`);
    const payload = String(data?.save?.payload ?? "");
    const loaded = importSave(payload);
    if (!loaded) {
      throw new Error("Save payload is invalid.");
    }
    if (requireAlive && (loaded?.player?.dead || Number(loaded?.player?.hp ?? 0) <= 0)) {
      throw new Error("Autosave is from a dead state.");
    }
    game = loaded;
    const targetCharacterId = normalizeCharacterProfileId(loaded?.character?.id ?? "") || activeCharacterId;
    if (targetCharacterId) {
      const latestSnapshot = await resolveLatestCharacterSnapshot(targetCharacterId);
      if (latestSnapshot) applyCharacterSnapshot(game, latestSnapshot);
    }
    if (requireAlive) applyRespawnRecoveryState(game);
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
    if (saveNameLooksLikeAutosave(data?.save?.name ?? "")) {
      saveRuntime.activeAutosaveSaveId = String(saveId);
    }
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
  if (isQuickSwitchCharacterActive(game)) {
    setSaveGameStatus("Quick Switch character cannot be saved. Load your real character first.", true);
    return false;
  }
  const opts = (options && typeof options === "object") ? options : {};
  const useAutosaveName = opts.autosave === true;
  const forceName = String(opts.forceName ?? "").trim();
  let targetOverwriteId = String(overwriteId ?? "").trim();
  if (useAutosaveName) {
    if (!targetOverwriteId) targetOverwriteId = String(saveRuntime.activeAutosaveSaveId ?? "").trim();
    if (!targetOverwriteId) targetOverwriteId = await resolveAutosaveOverwriteIdFromServer(game);
  }
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
  setSaveGameStatus(targetOverwriteId ? "Overwriting save..." : "Saving game...", false);
  try {
    if (isAuthoritativeModeEnabled()) {
      if (useAutosaveName) {
        clearSaveDirty();
        return true;
      }
      throw new Error("Manual save/load slots are disabled. Character progress is autosaved automatically.");
    }
    const data = await saveApiRequest("POST", {
      action: "save",
      overwrite_id: targetOverwriteId || undefined,
      name,
      payload,
      level,
      depth,
    });
    saveMenuUi.saves = Array.isArray(data.saves) ? data.saves : [];
    if (data?.save?.id) {
      const savedId = String(data.save.id);
      if (useAutosaveName) saveRuntime.activeAutosaveSaveId = savedId;
      else saveRuntime.activeRunSaveId = savedId;
    }
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
    if (isCharacterSwitchConfirmOpen()) resolveCharacterSwitchConfirm(false);
  }
  if (!show && isCharacterSwitchConfirmOpen()) resolveCharacterSwitchConfirm(false);
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
  return resolveCharacterSnapshotFromServerState(targetId);
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
  const characterStates = Array.isArray(base?.character_states) ? base.character_states : [];
  const slotsByCharacterId = new Map();
  for (const stateMeta of characterStates) {
    const characterId = normalizeCharacterProfileId(stateMeta?.id ?? "");
    if (!characterId) continue;
    const slotId = characterStateSlotId(characterId);
    if (!slotId) continue;
    const profileFallback = normalizeCharacterProfile({
      id: characterId,
      name: String(stateMeta?.name ?? DEFAULT_CHARACTER_NAME),
    });
    const snapshot = await resolveCharacterSnapshotFromServerState(characterId);
    const slot = slotsByCharacterId.get(characterId) ?? {
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
      latestSaveId: "",
      hasDungeonPosition: characterSnapshotHasDungeonPosition(snapshot),
    };
    slot.name = String(stateMeta?.name ?? slot.name ?? profileFallback.name ?? DEFAULT_CHARACTER_NAME);
    slot.updatedAt = String(stateMeta?.updated_at ?? slot.updatedAt ?? "");
    if (snapshot?.character) slot.profile = normalizeCharacterProfile(snapshot.character);
    slot.level = Math.max(1, Math.floor(snapshot?.player?.level ?? slot.level ?? 1));
    slot.deepestDepth = Math.max(
      Math.floor(slot.deepestDepth ?? 0),
      Math.floor(snapshot?.character?.deepestDepth ?? slot.profile?.deepestDepth ?? 0)
    );
    slot.hasDungeonPosition = slot.hasDungeonPosition || characterSnapshotHasDungeonPosition(snapshot);
    slotsByCharacterId.set(characterId, slot);
  }

  const out = Array.from(slotsByCharacterId.values());
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
  const speciesId = normalizeCharacterSpeciesId(classDef?.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID);
  const defaultArmorFamily = armorFamilyForCharacter(speciesId, cid);
  const nativeAttack = classNativeAttackProfile(cid);
  const startsUnarmed = (nativeAttack?.kind ?? "melee") === "ranged";
  const out = {
    gold: 0,
    inv: [],
    equip: { weapon: null, head: null, chest: null, legs: null },
  };
  if (!startsUnarmed) out.equip.weapon = "weapon_wood_dagger";
  if ((classDef?.hpMult ?? 1) >= 1.12 || (classDef?.armorEffect ?? 1) >= 1.1) {
    out.equip.head = armorType(defaultArmorFamily, "wood", "head");
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
  const slotCap = isAuthenticatedUser ? characterSlotMax : LOCAL_SLOT_MAX;
  characterOverlaySubtitleEl.textContent = purpose === "swap_character"
    ? "Switch to another character while keeping the current dungeon state."
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
    const depthLabel = slot.hasDungeonPosition ? String(slot.depth) : "Entrance";
    const spriteDisplay = resolveCharacterSpriteDisplay(slot.profile?.speciesId ?? "", slot.profile?.classId ?? "");
    const visual = spriteDisplay.src
      ? `<img class="charSlotSprite" src="${spriteDisplay.src}" alt="${escapeHtmlText(speciesLabel)} ${escapeHtmlText(classLabel)} sprite" />`
      : `<div class="charSlotSpriteFallback">@</div>`;
    row.innerHTML =
      `<div class="charSlotVisual">${visual}</div>` +
      `<div class="charSlotInfo">` +
      `<div class="charSlotTitle">${escapeHtmlText(slot.profile?.name ?? slot.name)}</div>` +
      `<div class="charSlotMeta">Species: ${speciesLabel}  |  Class: ${classLabel}\n` +
      `Level ${slot.level}  |  Last depth ${depthLabel}  |  Deepest ${slot.deepestDepth}\n` +
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
    ? "Switch to Selected Character"
    : "Load Selected Run";
  characterOverlayPrimaryEl.disabled = characterUi.loading || !characterUi.selectedSaveId;
  characterOverlayPrimaryEl.style.display = "";
    characterOverlaySecondaryEl.textContent = "New Character";
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
    ? "Build a persistent runner. Character data is bound to this slot."
    : "Guest mode: one local character is cached on this device.";

  if (step === "welcome") {
    characterOverlayBodyEl.innerHTML =
      statusHtml +
      `<div class="charWelcome">` +
      `<h3>Create your runner. The dungeon adapts.</h3>` +
      `<p>Choose species, class, and stats. Choices are permanent per character slot.</p>` +
      `<p>${isAuthenticatedUser
        ? `You can keep up to ${characterSlotMax} characters.`
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
    const statsSpriteDisplay = resolveCharacterSpriteDisplay(draft.speciesId, draft.classId);
    const statsSpriteVisual = statsSpriteDisplay.src
      ? `<img class="charLargeSprite" src="${statsSpriteDisplay.src}" alt="${escapeHtmlText(species.name)} ${escapeHtmlText(klass.name)} sprite" />`
      : `<div class="charLargeSpriteFallback">@</div>`;
    characterOverlayBodyEl.innerHTML =
      statusHtml +
      `<div class="charStepLead">Step 4/5: Allocate Attribute Points</div>` +
      `<div class="charStatsSpriteCard">` +
      `<div class="charStatsSpriteVisual">${statsSpriteVisual}</div>` +
      `<div class="charStatsSpriteDerived">` +
      `<div class="charDerivedGrid">` +
      `<div class="charDerivedCell"><span>Max HP</span><strong>${derived.maxHp}</strong></div>` +
      `<div class="charDerivedCell"><span>ATK</span><strong>${derived.atkLo}-${derived.atkHi}</strong></div>` +
      `<div class="charDerivedCell"><span>DEF</span><strong>${derived.def}</strong></div>` +
      `<div class="charDerivedCell"><span>ACC</span><strong>${derived.acc}</strong></div>` +
      `<div class="charDerivedCell"><span>EVA</span><strong>${derived.eva}</strong></div>` +
      `<div class="charDerivedCell"><span>SPD</span><strong>${derived.spd.toFixed(2)}</strong></div>` +
      `<div class="charDerivedCell"><span>Energy</span><strong>${derived.energy}</strong></div>` +
      `<div class="charDerivedCell"><span>Potions</span><strong>${potionCapacityForState({ player: { classId: draft.classId }, character: { classId: draft.classId } })}</strong></div>` +
      `</div>` +
      `</div>` +
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
      `<div class="charPointsBanner charPointsBannerBottom${remaining === 0 ? " ready" : ""}">` +
      `<span class="charPointsBannerLabel">Points Remaining</span>` +
      `<strong class="charPointsBannerValue">${remaining}</strong>` +
      `<span class="charPointsBannerMeta">Spent ${spent}/${budget}</span>` +
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
    const selectedId = String(characterUi.selectedSaveId ?? "");
    const purpose = normalizeCharacterSelectionPurpose(characterUi.selectionPurpose);
    const targetSlot = (Array.isArray(characterUi.slots) ? characterUi.slots : []).find((slot) => slot.id === selectedId) ?? null;
    const activeSlotId = String(getActiveCharacterSlotId() ?? "");
    const currentSlot = (Array.isArray(characterUi.slots) ? characterUi.slots : []).find((slot) => slot.id === activeSlotId) ?? null;
    if (purpose === "swap_character" && activeSlotId && activeSlotId !== selectedId) {
      const confirmed = await openCharacterSwitchConfirm(currentSlot, targetSlot);
      if (!confirmed) return;
    }
    setCharacterOverlayStatus("");
    characterUi.loading = true;
    renderCharacterOverlay();
    const loaded = purpose === "swap_character"
      ? await switchCharacter(selectedId, {
        characterId: normalizeCharacterProfileId(targetSlot?.profile?.id ?? normalizeCharacterProfileIdFromSlotId(selectedId)),
        latestSaveId: String(targetSlot?.latestSaveId ?? "").trim(),
        forceEntrance: false,
      })
      : await loadRunFromCharacterSlot(selectedId, {
        forceEntrance: false,
        characterId: normalizeCharacterProfileId(targetSlot?.profile?.id ?? normalizeCharacterProfileIdFromSlotId(selectedId)),
        latestSaveId: String(targetSlot?.latestSaveId ?? "").trim(),
      });
    characterUi.loading = false;
    if (loaded) {
      setActiveCharacterSlotId(selectedId);
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

  if (isAuthenticatedUser) {
    if (isAuthoritativeModeEnabled()) {
      const activeCharacterIdBeforeCreate = normalizeCharacterProfileIdFromSlotId(getActiveCharacterSlotId());
      characterUi.loading = true;
      setCharacterOverlayStatus("Creating character slot...", false);
      renderCharacterOverlay();
      try {
        const snapshot = buildCharacterSnapshotFromCarryover(profile, carryover);
        const payload = encodeCharacterSnapshotPayload(snapshot);
        if (!payload) throw new Error("Could not prepare the new character state.");
        if (!authoritativeMirror.sessionId) {
          await openAuthoritativeSessionForSelection(activeCharacterIdBeforeCreate, {
            reason: "create-character-bootstrap",
          });
        }
        const response = await authoritativeApi.createCharacterAndEnter({
          sessionId: authoritativeMirror.sessionId,
          characterPayload: payload,
          name: profile.name,
        });
        const applied = applyAuthoritativeSnapshotToGame(response, {
          clearDirty: true,
          reason: "create-character",
        });
        if (!applied || !response?.ok) {
          throw new Error(response?.error ?? "Could not create character slot.");
        }
        characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromServer());
        const preferredSlotId = characterStateSlotId(profile.id);
        const preferredExists = !!(preferredSlotId && characterUi.slots.some((slot) => slot.id === preferredSlotId));
        characterUi.selectedSaveId = preferredExists ? preferredSlotId : (characterUi.slots[0]?.id || "");
        if (characterUi.selectedSaveId) setActiveCharacterSlotId(characterUi.selectedSaveId);
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
    const activeCharacterIdBeforeCreate = normalizeCharacterProfileIdFromSlotId(getActiveCharacterSlotId());
    const shouldUseCurrentDungeon = !!(activeCharacterIdBeforeCreate && game);
    const shouldAutoEnterNewCharacter = shouldUseCurrentDungeon || normalizeCharacterSelectionPurpose(characterUi.selectionPurpose) === "load_run";
    characterUi.loading = true;
    setCharacterOverlayStatus("Creating character slot...", false);
    renderCharacterOverlay();
    try {
      if (shouldUseCurrentDungeon) {
        const saved = await autosaveBeforeCharacterSwitch();
        if (!saved && game) {
          const proceed = confirm("Could not auto-save current character. Create the new character in this dungeon anyway?");
          if (!proceed) throw new Error("Character creation cancelled.");
        }
      }
      const snapshot = buildCharacterSnapshotFromCarryover(profile, carryover);
      const ok = await persistCharacterSnapshot(snapshot, profile);
      if (!ok) throw new Error("Could not persist new character state.");
      let seededRun = null;
      if (shouldUseCurrentDungeon) {
        seededRun = createCharacterRunFromCurrentDungeon(game, snapshot);
        if (!seededRun) throw new Error("Could not prepare the new character in the current dungeon.");
      }
      let firstSaveId = "";
      if (seededRun) {
        const slotName = `${profile.name} • ${characterClassDef(profile.classId).name}`.slice(0, saveNameMaxLen);
        const savedRun = await saveStateToServerSlot(seededRun, "", slotName);
        firstSaveId = String(savedRun?.save?.id ?? "").trim();
      }
      characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromServer());
      const preferredSlotId = characterStateSlotId(profile.id);
      const preferredExists = !!(preferredSlotId && characterUi.slots.some((slot) => slot.id === preferredSlotId));
      characterUi.selectedSaveId = preferredExists ? preferredSlotId : (characterUi.slots[0]?.id || "");
      if (shouldAutoEnterNewCharacter && characterUi.selectedSaveId) {
        const loaded = await loadRunFromCharacterSlot(characterUi.selectedSaveId, {
          characterId: profile.id,
          latestSaveId: firstSaveId,
        });
        if (!loaded) throw new Error("Character created, but the first load failed.");
        setActiveCharacterSlotId(characterUi.selectedSaveId);
        requiresCharacterCreation = false;
        setCharacterOverlayStatus("");
        setCharacterOverlayOpen(false);
      } else {
        characterUi.mode = "select";
        requiresCharacterCreation = false;
        setCharacterOverlayStatus("Character created. Select it to start at the entrance.", false);
      }
    } catch (err) {
      setCharacterOverlayStatus(err?.message ?? "Could not create character slot.", true);
    } finally {
      characterUi.loading = false;
      renderCharacterOverlay();
    }
    return;
  }

  game = makeNewGame(randomSeedString(), { carryover });
  enforceAdminControlPolicy(game);
  updateDebugMenuUi(game);
  updateContextActionButton(game);
  updateDeathOverlay(game);
  refreshSaveNameFromLive(true);
  saveNow(game);
  clearSaveDirty();

  saveNow(game);
  const slotName = `${profile.name} • ${characterClassDef(profile.classId).name}`.slice(0, saveNameMaxLen);
  const savedLocal = await saveCurrentGameToLocalSlot("", slotName);
  if (savedLocal) {
    characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromLocal());
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
    const slotCap = isAuthenticatedUser ? characterSlotMax : LOCAL_SLOT_MAX;
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
      characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromServer());
    } else {
      deletedActiveCharacter = !!(activeSlotIdBeforeDelete && activeSlotIdBeforeDelete === selectedId);
      removeLocalSlot(selectedId);
      const localCharacterId = normalizeCharacterProfileId(slot.profile?.id ?? "");
      if (localCharacterId) {
        try { localStorage.removeItem(characterStatePayloadKey(localCharacterId)); } catch {}
      }
      characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromLocal());
    }
    if (deletedActiveCharacter) setActiveCharacterSlotId("");
    const nextSelectedId = (
      (preferredNextId && characterUi.slots.some((s) => s.id === preferredNextId)) ? preferredNextId : (characterUi.slots[0]?.id ?? "")
    );
    characterUi.selectedSaveId = nextSelectedId;
    if ((characterUi.slots?.length ?? 0) <= 0) {
      setActiveCharacterSlotId("");
      requiresCharacterCreation = true;
      characterUi.mode = "create";
      characterUi.selectionPurpose = "load_run";
      setCharacterOverlayStatus("Create a character to continue.", true);
      resetCharacterCreationDraft(null, { step: "welcome" });
    } else {
      if (deletedActiveCharacter && characterUi.selectedSaveId) {
        const targetSlot = characterUi.slots.find((s) => s.id === characterUi.selectedSaveId) ?? null;
        const switched = await loadRunFromCharacterSlot(characterUi.selectedSaveId, {
          characterId: normalizeCharacterProfileId(targetSlot?.profile?.id ?? normalizeCharacterProfileIdFromSlotId(characterUi.selectedSaveId)),
          latestSaveId: String(targetSlot?.latestSaveId ?? "").trim(),
        });
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
      characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromServer());
      const activeId = getActiveCharacterSlotId();
      const hasSlots = (characterUi.slots?.length ?? 0) > 0;
      const activeSlotExists = !!(activeId && characterUi.slots.some((slot) => slot.id === activeId));
      characterUi.selectedSaveId = activeSlotExists ? activeId : (characterUi.slots[0]?.id || "");
      characterUi.selectionPurpose = "load_run";
      characterUi.mode = hasSlots ? "select" : "create";
      if (isAuthoritativeModeEnabled() && hasSlots && characterUi.selectedSaveId) {
        const resumeSlot = characterUi.slots.find((slot) => slot.id === characterUi.selectedSaveId) ?? null;
        const loaded = await loadRunFromCharacterSlot(characterUi.selectedSaveId, {
          forceEntrance: false,
          characterId: normalizeCharacterProfileId(
            resumeSlot?.profile?.id ?? normalizeCharacterProfileIdFromSlotId(characterUi.selectedSaveId)
          ),
          latestSaveId: String(resumeSlot?.latestSaveId ?? "").trim(),
        });
        if (loaded) {
          if (!activeSlotExists) setActiveCharacterSlotId(characterUi.selectedSaveId);
          requiresCharacterCreation = false;
          setCharacterOverlayStatus("");
          allowResumeWithoutOverlay = true;
          return;
        }
      }
      // On refresh, keep the in-progress run if the account still has at least one slot.
      // We only block resume when there are zero slots (all characters deleted).
      if (!isAuthoritativeModeEnabled() && bootLoadedFromLocalSave && hasSlots) {
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
  characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromLocal());
  const activeId = getActiveCharacterSlotId();
  const hasSlots = (characterUi.slots?.length ?? 0) > 0;
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

function saveNameLooksLikeAutosave(name = "") {
  return String(name ?? "").trim().toLowerCase().startsWith("autosave");
}
function saveEntryCharacterId(entry = null) {
  return normalizeCharacterProfileId(entry?.character_id ?? "");
}
function activeCharacterProfileIdFromGameState(state = null) {
  return normalizeCharacterProfileId(state?.character?.id ?? "");
}
function pickMostRecentSaveIdForCharacter(saves = [], characterId = "") {
  const cid = normalizeCharacterProfileId(characterId);
  const matching = (Array.isArray(saves) ? saves : [])
    .filter((entry) => !cid || saveEntryCharacterId(entry) === cid)
    .slice()
    .sort((a, b) => saveEntryUpdatedAtMs(b?.updated_at) - saveEntryUpdatedAtMs(a?.updated_at));
  return String(matching[0]?.id ?? "").trim();
}
function pickMostRecentAutosaveIdForCharacter(saves = [], characterId = "") {
  const cid = normalizeCharacterProfileId(characterId);
  const autosaves = (Array.isArray(saves) ? saves : [])
    .filter((entry) => saveNameLooksLikeAutosave(entry?.name ?? ""))
    .filter((entry) => !cid || saveEntryCharacterId(entry) === cid)
    .slice()
    .sort((a, b) => saveEntryUpdatedAtMs(b?.updated_at) - saveEntryUpdatedAtMs(a?.updated_at));
  return String(autosaves[0]?.id ?? "").trim();
}
async function resolveLatestSaveIdForCharacter(characterId = "") {
  const cid = normalizeCharacterProfileId(characterId);
  if (!cid) return "";
  const cached = pickMostRecentSaveIdForCharacter(saveMenuUi?.saves ?? [], cid);
  if (cached) return cached;
  try {
    const data = await saveApiRequest("GET");
    const saves = Array.isArray(data?.saves) ? data.saves : [];
    saveMenuUi.saves = saves;
    return pickMostRecentSaveIdForCharacter(saves, cid);
  } catch {
    return "";
  }
}
function normalizeCharacterSnapshotPosition(src = null) {
  const raw = (src && typeof src === "object") ? src : {};
  const x = Number(raw.x ?? null);
  const y = Number(raw.y ?? null);
  const depth = Number(raw.depth ?? raw.z ?? null);
  return {
    x: Number.isFinite(x) ? Math.floor(x) : null,
    y: Number.isFinite(y) ? Math.floor(y) : null,
    depth: Number.isFinite(depth) ? Math.floor(depth) : null,
  };
}
function characterSnapshotHasDungeonPosition(snapshot = null) {
  const pos = normalizeCharacterSnapshotPosition(snapshot?.position ?? snapshot?.character?.position ?? null);
  return Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.depth);
}
async function resolveAutosaveOverwriteIdFromServer(state = null) {
  const characterId = activeCharacterProfileIdFromGameState(state);
  const cached = pickMostRecentAutosaveIdForCharacter(saveMenuUi?.saves ?? [], characterId);
  if (cached) return cached;
  try {
    const data = await saveApiRequest("GET");
    const saves = Array.isArray(data?.saves) ? data.saves : [];
    saveMenuUi.saves = saves;
    return pickMostRecentAutosaveIdForCharacter(saves, characterId);
  } catch {
    return "";
  }
}

function mostRecentCharacterSlotIdFromSaveListResponse(listData = null) {
  const data = (listData && typeof listData === "object") ? listData : {};
  const states = Array.isArray(data.character_states) ? data.character_states : [];
  for (const entry of states) {
    const cid = normalizeCharacterProfileId(entry?.id ?? "");
    const slotId = characterStateSlotId(cid);
    if (slotId) return slotId;
  }
  return "";
}

async function loadLatestAccountRunAfterGuestDecline() {
  if (!isAuthenticatedUser) return false;
  let data = null;
  try {
    data = await saveApiRequest("GET");
  } catch {
    return false;
  }
  const slotId = mostRecentCharacterSlotIdFromSaveListResponse(data);
  if (slotId) {
    setActiveCharacterSlotId(slotId);
    const characterId = normalizeCharacterProfileIdFromSlotId(slotId);
    clearSaveDirty();
    const loadedCharacter = await loadRunFromCharacterSlot(slotId, {
      forceEntrance: false,
      characterId,
    });
    if (loadedCharacter) return true;
  }
  return false;
}
function activateLoadedRunStateForRespawn(loaded, reason = "respawn-autosave") {
  if (!loaded?.player || !loaded?.world) return false;
  game = loaded;
  applyRespawnRecoveryState(game);
  enforceAdminControlPolicy(game);
  updateDebugMenuUi(game);
  setDebugMenuOpen(false);
  updateContextActionButton(game);
  updateDeathOverlay(game);
  refreshSaveNameFromLive(true);
  clearSaveDirty();
  markCharacterStateDirty(game, reason);
  void syncCharacterStateIfDirty(reason);
  return true;
}
function applyRespawnRecoveryState(state) {
  const p = state?.player;
  if (!p) return;
  p.dead = false;
  p.hp = Math.max(1, Math.floor(p.maxHp ?? 1));
  p.effects = [];
  p.attackAfterMove = false;
  p.combatFirstStrikeReady = true;
  p.slipbladeBonusReady = false;
  p.overclockUntilMs = 0;
  state.disengageGrace = {};
  const combat = ensureCombatState(state);
  combat.lastEventMs = 0;
  combat.regenAnchorMs = Date.now();
  combat.hudTargets = {};
}
function loadLocalAutosaveForRespawn() {
  try {
    const payload = localStorage.getItem(SAVE_KEY);
    if (!payload) return false;
    const loaded = importSave(payload);
    if (!loaded || loaded?.player?.dead) return false;
    return activateLoadedRunStateForRespawn(loaded);
  } catch {
    return false;
  }
}
async function loadLatestAutosaveForRespawn() {
  if (!game?.player?.dead) return false;
  if (isAuthoritativeModeEnabled()) return false;

  if (isAuthenticatedUser) {
    const activeRunSaveId = String(saveRuntime.activeRunSaveId ?? "").trim();
    if (activeRunSaveId) {
      const loadedActive = await loadSaveFromServer(activeRunSaveId, {
        showStatus: false,
        closeOverlay: false,
        forceEntrance: false,
        requireAlive: true,
      });
      if (loadedActive && !game?.player?.dead) return true;
    }
    try {
      const data = await saveApiRequest("GET");
      const saves = Array.isArray(data?.saves) ? [...data.saves] : [];
      saves.sort((a, b) => saveEntryUpdatedAtMs(b?.updated_at) - saveEntryUpdatedAtMs(a?.updated_at));
      const autosave = saves.find((save) => saveNameLooksLikeAutosave(save?.name ?? ""));
      const fallback = saves[0] ?? null;
      const tried = new Set();
      for (const candidate of [autosave, fallback]) {
        const id = String(candidate?.id ?? "").trim();
        if (!id || tried.has(id)) continue;
        tried.add(id);
        const loaded = await loadSaveFromServer(id, {
          showStatus: false,
          closeOverlay: false,
          forceEntrance: false,
          requireAlive: true,
        });
        if (loaded && !game?.player?.dead) return true;
      }
    } catch {}
  }

  return loadLocalAutosaveForRespawn();
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
    characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromServer());
  } catch {
    characterUi.slots = ensureCharacterSlotsList(characterUi.slots);
  }

  const importedExists = !!(importedSlotId && characterUi.slots.some((slot) => slot.id === importedSlotId));
  characterUi.selectedSaveId = importedExists
    ? importedSlotId
    : (characterUi.slots[0]?.id || importedSlotId || "");
  if (characterUi.selectedSaveId) setActiveCharacterSlotId(characterUi.selectedSaveId);
  characterUi.mode = (characterUi.slots?.length ?? 0) > 0 ? "select" : "create";
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
  const shouldImport = await openGuestLoginImportOverlay(game);
  clearPendingSaveAfterLoginHandoff();
  try {
    if (shouldImport) {
      const imported = await importGuestCharacterFromCurrentRun({ closeOverlay: true });
      if (imported) {
        pushLog(game, "Guest character imported. Use Choose Character to switch between your account characters.");
      } else {
        pushLog(game, "Could not import guest character.");
      }
      return;
    }

    const loaded = await loadLatestAccountRunAfterGuestDecline();
    if (loaded) {
      requiresCharacterCreation = false;
      setCharacterOverlayStatus("");
      if (isCharacterOverlayOpen()) setCharacterOverlayOpen(false);
      pushLog(game, "Loaded your latest account autosave.");
    } else {
      if (isCharacterOverlayOpen()) renderCharacterOverlay();
      pushLog(game, "Could not load an account autosave. Select or create a character to continue.");
    }
  } catch {
    pushLog(game, shouldImport ? "Could not import guest character." : "Could not load an account autosave.");
  }
}
async function openCharacterSelectionOverlay(options = null) {
  if (!characterOverlayEl) return;
  const opts = (options && typeof options === "object") ? options : {};
  const requestedPurpose = normalizeCharacterSelectionPurpose(opts.purpose);
  if (!isAuthenticatedUser) {
    characterUi.loading = false;
    characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromLocal());
    const activeId = getActiveCharacterSlotId();
    const hasSlots = (characterUi.slots?.length ?? 0) > 0;
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
    characterUi.slots = ensureCharacterSlotsList(await fetchCharacterSlotsFromServer());
    const activeId = getActiveCharacterSlotId();
    characterUi.selectedSaveId = activeId || characterUi.slots[0]?.id || "";
    characterUi.selectionPurpose = mustHaveCharacterSlot() ? "load_run" : requestedPurpose;
    characterUi.mode = (characterUi.slots?.length ?? 0) > 0 ? "select" : "create";
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

function playerActiveAbility(state) {
  const classId = normalizeCharacterClassId(state?.player?.classId, state?.player?.speciesId);
  return FEATURE_FLAGS.classActives ? activeAbilityForClass(classId) : null;
}

function restorePlayerEnergy(state, amount) {
  if (!state?.player || !Number.isFinite(amount) || amount <= 0) return;
  state.player.energy = clamp(Math.floor((state.player.energy ?? 0) + amount), 0, state.player.energyMax ?? 0);
}

function spendPlayerEnergy(state, amount) {
  if (!state?.player) return false;
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if ((state.player.energy ?? 0) < cost) return false;
  state.player.energy = Math.max(0, Math.floor((state.player.energy ?? 0) - cost));
  return true;
}

function adjacentOpenCellsAround(state, x, y, z) {
  const occ = getCachedOccupancy(state);
  const out = [];
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!state.world.isPassable(nx, ny, z)) continue;
    if (occ.monsters.has(keyXYZ(nx, ny, z))) continue;
    if (nx === state.player.x && ny === state.player.y) continue;
    out.push({ x: nx, y: ny });
  }
  return out;
}

function monstersTargetableByAbility(state, ability, occupancy = null) {
  const p = state?.player;
  if (!p || p.dead || !ability) return [];
  const occ = occupancy ?? getCachedOccupancy(state);
  const range = activeAbilityRangeForPlayer(p, ability);
  const out = [];
  for (const ent of state.entities.values()) {
    if (!ent || ent.kind !== "monster" || ent.z !== p.z) continue;
    const dist = Math.abs((ent.x ?? 0) - p.x) + Math.abs((ent.y ?? 0) - p.y);
    if (dist <= 0 || dist > range) continue;
    if ((ability.id === "charge_strike" || ability.id === "shadowstep") && adjacentOpenCellsAround(state, ent.x, ent.y, ent.z).length <= 0) continue;
    if ((ability.id === "aimed_shot" || ability.id === "throw_vial" || ability.id === "acid_glob") && !hasLineOfSight(state.world, p.z, p.x, p.y, ent.x, ent.y)) continue;
    out.push({
      monster: ent,
      dist,
      score: monsterThreatScore(state, ent),
    });
  }
  out.sort((a, b) => (b.score - a.score) || (a.dist - b.dist) || (a.monster.id.localeCompare(b.monster.id)));
  return out;
}

function spendActiveAbility(state, ability) {
  const p = state?.player;
  if (!p || !ability) return false;
  const cost = activeAbilityCostForPlayer(p, ability);
  if (!spendPlayerEnergy(state, cost)) return false;
  p.abilityCd = Math.max(0, Math.floor(Number(ability.cooldown ?? 0))) + 1;
  state.lastPlayerActionKind = "ability";
  return true;
}

function activeAbilityAction(state, occupancy = null) {
  const p = state?.player;
  if (!p || p.dead) return null;
  const ability = playerActiveAbility(state);
  if (!ability) return null;
  const status = activeAbilityStatus(p, ability);
  const baseLabel = ability.label;
  if (!status.ok) {
    return {
      type: "active-ability-disabled",
      abilityId: ability.id,
      label: `${baseLabel} (${status.reason})`,
      disabled: true,
      run: () => false,
    };
  }

  if (ability.targeting === "self" || ability.targeting === "ground") {
    return {
      type: "active-ability",
      abilityId: ability.id,
      label: baseLabel,
      run: () => usePlayerActiveAbility(state, ability, null, occupancy),
    };
  }

  const candidates = monstersTargetableByAbility(state, ability, occupancy);
  const target = candidates[0]?.monster ?? null;
  if (!target) {
    return {
      type: "active-ability-disabled",
      abilityId: ability.id,
      label: `${baseLabel} (No target)`,
      disabled: true,
      run: () => false,
    };
  }
  return {
    type: "active-ability",
    abilityId: ability.id,
    targetMonsterId: target.id,
    monsterType: target.type,
    label: `${baseLabel}: ${monsterDisplayName(target, p.z)}`,
    run: () => usePlayerActiveAbility(state, ability, target, occupancy),
  };
}

function abilityAttackMonster(state, monster, ability, {
  damageMod = 1,
  accuracyBonus = 0,
  critBonus = 0,
  defIgnorePct = 0,
  kind = "ranged",
  requiresLos = true,
} = {}) {
  if (!monster || monster.kind !== "monster") return false;
  const p = state.player;
  const dist = Math.abs((monster.x ?? 0) - p.x) + Math.abs((monster.y ?? 0) - p.y);
  if (requiresLos && !hasLineOfSight(state.world, p.z, p.x, p.y, monster.x, monster.y)) {
    pushLog(state, `${ability.label} cannot find a clear line.`);
    return false;
  }
  const spec = monsterStatsForDepth(monster.type, monster.z ?? p.z);
  const attackAcc = Math.max(1, Math.round((p.acc ?? 70) + accuracyBonus));
  if (!rollHit(attackAcc, spec.eva ?? 0)) {
    monster.awake = true;
    rememberMonsterPlayerPosition(monster, p, state.turn ?? 0);
    alertMonsterPack(state, monster, p, monsterAlertRadius(spec));
    persistMonsterOverride(state, monster);
    pushLog(state, `${ability.label} misses the ${monsterDisplayName(monster, p.z)}.`);
    return true;
  }
  const profile = {
    ...(playerWeaponAttackProfile(state) ?? {}),
    kind,
    range: activeAbilityRangeForPlayer(p, ability),
    minRange: 1,
    requiresLOS: requiresLos,
    cannotFireAdjacent: false,
    damageMod: Math.max(0.2, Number(playerWeaponAttackProfile(state)?.damageMod ?? 1) * damageMod),
    critChanceMod: Math.round(critBonus),
    defIgnorePct: Math.max(0, Number(defIgnorePct ?? 0)),
    attackName: ability.label,
    source: "active_ability",
  };
  const hpBefore = Math.max(0, Math.floor(monster.hp ?? 0));
  const attack = playerAttackDamage(state, monster, {
    distance: dist,
    targetUnengaged: !monster.awake,
    firstCombatStrike: false,
    attackAfterMove: false,
    weaponProfile: profile,
  });
  monster.hp = Math.max(0, hpBefore - attack.dmg);
  monster.awake = true;
  rememberMonsterPlayerPosition(monster, p, state.turn ?? 0);
  alertMonsterPack(state, monster, p, monsterAlertRadius(spec));
  persistMonsterOverride(state, monster);
  const applied = Math.max(0, Math.min(attack.dmg, hpBefore));
  markCombatEvent(state, monster);
  recordAnalyticsCounter(ensureAnalyticsState(state), "attacks", 1, p.z);
  recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { dealt: applied });
  if (monster.hp <= 0) {
    const xpMult = xpChallengeMultiplier(state, monster, spec);
    handleMonsterDefeat(state, monster, {
      xpMult,
      deathMessage: `${ability.label} drops the ${monsterDisplayName(monster, p.z)}.`,
    });
  }
  pushLog(state, `${ability.label} hits the ${monsterDisplayName(monster, p.z)} for ${attack.dmg}${attack.crit ? " (critical)" : ""}.`);
  return true;
}

function deployPlayerTrap(state, trapFamily = "pressure_plate") {
  const p = state?.player;
  if (!p || p.dead) return false;
  const candidates = adjacentOpenCellsAround(state, p.x, p.y, p.z)
    .filter((cell) => !getTrapAt(state, cell.x, cell.y, p.z));
  const target = candidates[0] ?? null;
  if (!target) {
    pushLog(state, "No adjacent tile is clear enough for a trap.");
    return false;
  }
  const trapId = `dyn_trap|${trapFamily}|${state.turn}|${target.x},${target.y}`;
  const trap = {
    id: trapId,
    origin: "dynamic",
    kind: "trap",
    trapType: trapFamily,
    trapFamily,
    x: target.x,
    y: target.y,
    z: p.z,
    depth: p.z,
    armed: true,
    detected: true,
    triggered: false,
    disarmed: false,
    charges: 1,
    factionId: "player",
    payload: {},
    friendlyTo: "player",
    ownerId: state.character?.id ?? "player",
  };
  state.dynamic.set(trapId, trap);
  state.entities.set(trapId, trap);
  pushLog(state, `You deploy ${trapDisplayName(trap).toLowerCase()}.`);
  return true;
}

function usePlayerActiveAbility(state, ability = null, explicitTarget = null, occupancy = null) {
  if (isAuthoritativeSessionActive()) {
    const p = state?.player;
    const resolvedAbility = ability ?? playerActiveAbility(state);
    if (!p || p.dead || !resolvedAbility || !canPlayerUseActiveAbility(p, resolvedAbility)) return false;
    return performAuthoritativeCommand(
      abilityCommand(resolvedAbility.id, explicitTarget),
      { reason: "activate-ability" }
    );
  }
  const p = state?.player;
  if (!p || p.dead) return false;
  const resolvedAbility = ability ?? playerActiveAbility(state);
  if (!resolvedAbility || !canPlayerUseActiveAbility(p, resolvedAbility)) return false;
  const occ = occupancy ?? getCachedOccupancy(state);

  let spent = false;
  if (resolvedAbility.id === "brace_stance") {
    p.effects.push({ type: "brace", turnsLeft: 3, incomingDamageMult: 0.72, speedMult: 0.94 });
    recalcDerivedStats(state);
    pushLog(state, "You brace for impact.");
    spent = true;
  } else if (resolvedAbility.id === "anchor_field") {
    p.effects.push({ type: "anchor_field", turnsLeft: 4, incomingDamageMult: 0.84, accDelta: 4 });
    for (const entry of getAdjacentMonsters(state, occ)) {
      if (tryKnockbackMonster(state, entry.monster, p.x, p.y)) {
        entry.monster.cd = Math.max(1, Math.floor(entry.monster.cd ?? 0));
        persistMonsterOverride(state, entry.monster);
      }
    }
    recalcDerivedStats(state);
    pushLog(state, "A stabilizing field blooms around you.");
    spent = true;
  } else if (resolvedAbility.id === "scan_reveal") {
    applyReveal(state, 18);
    for (const trap of state.entities.values()) {
      if (!trap || trap.kind !== "trap" || trap.z !== p.z) continue;
      const dist = Math.abs((trap.x ?? 0) - p.x) + Math.abs((trap.y ?? 0) - p.y);
      if (dist > 7) continue;
      trap.detected = true;
      persistTrapOverride(state, trap);
    }
    pushLog(state, "Your senses flare across the dungeon.");
    spent = true;
  } else if (resolvedAbility.id === "overclock") {
    p.effects.push({ type: "overclock_boost", turnsLeft: 4, accDelta: 6, evaDelta: 4, speedMult: 1.16 });
    p.overclockUntilMs = Date.now() + 6000;
    recalcDerivedStats(state);
    pushLog(state, "Systems surge into overclock.");
    spent = true;
  } else if (resolvedAbility.id === "deploy_trap") {
    const classId = normalizeCharacterClassId(p.classId, p.speciesId);
    const family = classId === "fabricator"
      ? "beam_link"
      : (classId === "broodmind" ? "poison_vent" : "dart_line");
    spent = deployPlayerTrap(state, family);
  } else {
    const target = explicitTarget ?? monstersTargetableByAbility(state, resolvedAbility, occ)[0]?.monster ?? null;
    if (!target) return false;
    if (resolvedAbility.id === "charge_strike") {
      const landing = adjacentOpenCellsAround(state, target.x, target.y, target.z)[0] ?? null;
      if (!landing) {
        pushLog(state, "No clear lane to charge.");
        return false;
      }
      const moveDist = Math.abs(landing.x - p.x) + Math.abs(landing.y - p.y);
      p.x = landing.x;
      p.y = landing.y;
      recordAnalyticsMovement(ensureAnalyticsState(state), p.z, moveDist);
      spent = abilityAttackMonster(state, target, resolvedAbility, { damageMod: 1.28, accuracyBonus: 6, defIgnorePct: 0.12, kind: "melee", requiresLos: false });
      if (spent && target.hp > 0 && tryKnockbackMonster(state, target, p.x, p.y)) {
        pushLog(state, `The charge knocks the ${monsterDisplayName(target, p.z)} back.`);
      }
    } else if (resolvedAbility.id === "aimed_shot") {
      spent = abilityAttackMonster(state, target, resolvedAbility, { damageMod: 1.16, accuracyBonus: 12, critBonus: 8, defIgnorePct: 0.18, kind: "ranged", requiresLos: true });
    } else if (resolvedAbility.id === "shadowstep") {
      const landing = adjacentOpenCellsAround(state, target.x, target.y, target.z)[0] ?? null;
      if (!landing) {
        pushLog(state, "No clear place to shadowstep.");
        return false;
      }
      const moveDist = Math.abs(landing.x - p.x) + Math.abs(landing.y - p.y);
      p.x = landing.x;
      p.y = landing.y;
      recordAnalyticsMovement(ensureAnalyticsState(state), p.z, moveDist);
      spent = abilityAttackMonster(state, target, resolvedAbility, { damageMod: 1.22, accuracyBonus: 8, critBonus: 10, defIgnorePct: 0.26, kind: "melee", requiresLos: false });
    } else if (resolvedAbility.id === "mind_lance") {
      spent = abilityAttackMonster(state, target, resolvedAbility, { damageMod: 1.12, accuracyBonus: 10, critBonus: 6, defIgnorePct: 0.32, kind: "ranged", requiresLos: false });
      if (spent && target.hp > 0) {
        target.cd = Math.max(1, Math.floor(target.cd ?? 0));
        persistMonsterOverride(state, target);
      }
    } else if (resolvedAbility.id === "throw_vial") {
      spent = abilityAttackMonster(state, target, resolvedAbility, { damageMod: 0.92, accuracyBonus: 6, critBonus: 0, defIgnorePct: 0.08, kind: "ranged", requiresLos: true });
      if (spent && target.hp > 0) {
        applyPoisonToMonster(state, target, Math.max(1, Math.round((p.atkHi ?? 1) * 0.12)), 2, "the vial");
        spawnPoisonCloudBurst(state, target.x, target.y, target.z, 3, 1, Math.max(1, Math.round((p.atkHi ?? 1) * 0.18)), "volatile reagents");
      }
    } else if (resolvedAbility.id === "acid_glob") {
      spent = abilityAttackMonster(state, target, resolvedAbility, { damageMod: 0.86, accuracyBonus: 8, critBonus: 0, defIgnorePct: 0.1, kind: "ranged", requiresLos: true });
      if (spent && target.hp > 0) {
        applyPoisonToMonster(state, target, Math.max(1, Math.round((p.atkHi ?? 1) * 0.18)), 3, "acid");
        spawnPoisonCloudBurst(state, target.x, target.y, target.z, 3, 1, Math.max(1, Math.round((p.atkHi ?? 1) * 0.24)), "acid");
      }
    }
  }

  if (!spent) return false;
  if (!spendActiveAbility(state, resolvedAbility)) return false;
  state.lastPlayerActionKind = "ability";
  markAnalyticsInput(ensureAnalyticsState(state), Date.now());
  analyticsEventAtPlayer(state, resolvedAbility.id, {
    abilityId: resolvedAbility.id,
    classId: p.classId,
    energyCost: activeAbilityCostForPlayer(p, resolvedAbility),
  });
  return true;
}

function updateAbilityContextButton(state, occupancy = null) {
  if (!contextAbilityBtn) return;
  const action = activeAbilityAction(state, occupancy);
  currentAbilityContextAction = action ?? null;
  if (!action) {
    contextAbilityBtn.style.display = "none";
    contextAbilityBtn.disabled = true;
    contextAbilityButtonSignature = "";
    return;
  }
  contextAbilityBtn.style.display = "";
  contextAbilityBtn.disabled = !!action.disabled;
  const iconSpec = { glyph: "Q", color: action.disabled ? "#9aa4b2" : "#ffd166" };
  const signature = contextButtonSignature(action.label, iconSpec, !!action.disabled);
  if (signature !== contextAbilityButtonSignature) {
    setContextButtonContent(contextAbilityBtn, action.label, iconSpec);
    contextAbilityButtonSignature = signature;
  }
  contextAbilityBtn.dataset.actionType = action.type;
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
  if (isAuthoritativeSessionActive()) {
    const monster = state?.entities?.get(monsterId) ?? null;
    return performAuthoritativeCommand(attackCommand(monster), { reason: "attack" });
  }
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
    if ((iconWrap.childNodes?.length ?? 0) > 0) content.appendChild(iconWrap);
  }

  const text = document.createElement("span");
  text.className = "contextBtnText";
  text.textContent = label;
  content.appendChild(text);

  btn.appendChild(content);
}

function contextButtonSignature(label, iconSpec = null, disabled = false) {
  return [
    String(label ?? ""),
    iconSpec?.spriteId ?? "",
    iconSpec?.glyph ?? "",
    iconSpec?.color ?? "",
    disabled ? "1" : "0",
  ].join("|");
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
  currentContextAction = action ?? null;
  if (!action) {
    contextActionBtn.disabled = true;
    const signature = contextButtonSignature("No Action", null, true);
    if (signature !== contextActionButtonSignature) {
      setContextButtonContent(contextActionBtn, "No Action", null);
      contextActionButtonSignature = signature;
    }
    contextActionBtn.dataset.actionType = "none";
    updateDpadCenterButton(state, null);
    updateAbilityContextButton(state, occupancy);
    updatePotionContextButton(state, null);
    updateAttackContextButtons(state, occupancy, null);
    return;
  }
  contextActionBtn.disabled = false;
  const iconSpec = iconSpecForContextAction(state, action);
  const signature = contextButtonSignature(action.label, iconSpec, false);
  if (signature !== contextActionButtonSignature) {
    setContextButtonContent(contextActionBtn, action.label, iconSpec);
    contextActionButtonSignature = signature;
  }
  contextActionBtn.dataset.actionType = action.type;
  updateDpadCenterButton(state, action);

  updateAbilityContextButton(state, occupancy);
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
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(useItemCommand(idx), { reason: "use-potion" });
  }
  useInventoryIndex(state, idx);
  return false;
}

function updatePotionContextButton(state, primaryAction = null) {
  if (!contextPotionBtn) return;
  if (primaryAction?.type === "use-potion") {
    contextPotionBtn.style.display = "none";
    contextPotionBtn.disabled = true;
    contextPotionButtonSignature = "";
    return;
  }
  if (!shouldShowPotionContext(state)) {
    contextPotionBtn.style.display = "none";
    contextPotionBtn.disabled = true;
    contextPotionButtonSignature = "";
    return;
  }
  contextPotionBtn.style.display = "";
  contextPotionBtn.disabled = false;
  const iconSpec = iconSpecForItemType("potion");
  const signature = contextButtonSignature("Use Potion", iconSpec, false);
  if (signature !== contextPotionButtonSignature) {
    setContextButtonContent(contextPotionBtn, "Use Potion", iconSpec);
    contextPotionButtonSignature = signature;
  }
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
    type.startsWith("key_");
}
function potionCapacityForState(state) {
  const classId = state?.player?.classId ?? state?.character?.classId ?? DEFAULT_CHARACTER_CLASS_ID;
  const classDef = characterClassDef(classId);
  return Math.max(1, BASE_POTION_CAPACITY + Math.max(0, Math.floor(classDef.potionCapBonus ?? 0)));
}
function invAdd(state, type, amount = 1) {
  const normalizedType = normalizeItemType(type, {
    speciesId: state?.player?.speciesId ?? state?.character?.speciesId,
    classId: state?.player?.classId ?? state?.character?.classId,
  });
  const templateId = itemTemplateIdForType(normalizedType) ?? normalizedType;
  type = normalizedType;
  if (type === "potion") {
    const cap = potionCapacityForState(state);
    const cur = invCount(state, "potion");
    amount = Math.max(0, Math.min(Math.floor(amount), cap - cur));
    if (amount <= 0) return;
  }
  if (isStackable(type)) {
    const idx = state.inv.findIndex((x) => x.type === type);
    if (idx >= 0) {
      state.inv[idx].amount += amount;
      if (!state.inv[idx].templateId) state.inv[idx].templateId = templateId;
    } else {
      state.inv.push({ type, amount, templateId });
    }
  } else {
    for (let i = 0; i < amount; i++) {
      const instance = createItemInstance(type, "player", state?.character?.id ?? null);
      state.inv.push({ type, amount: 1, templateId, instanceId: instance.id });
    }
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
  const speciesRule = speciesEquipRule(profile?.speciesId ?? p.speciesId);
  const equippedWeaponFamily = normalizeWeaponFamilyId(weapon?.family ?? weaponKindFromItemType(equip.weapon) ?? "");
  const weaponAffinityMult = equippedWeaponFamily && (speciesRule.preferredWeaponFamilies ?? []).includes(equippedWeaponFamily) ? 1.06 : 1;
  const weaponAtk = Math.max(0, Math.round((weapon?.atkBonus ?? 0) * weaponAffinityMult));
  const armorRaw = (headArmor?.defBonus ?? 0) + (chestArmor?.defBonus ?? 0) + (legsArmor?.defBonus ?? 0);
  const armorEvaBonus = (headArmor?.evaBonus ?? 0) + (chestArmor?.evaBonus ?? 0) + (legsArmor?.evaBonus ?? 0);
  const armorEnergyBonus = (headArmor?.energyBonus ?? 0) + (chestArmor?.energyBonus ?? 0) + (legsArmor?.energyBonus ?? 0);
  const armorPieces = [headArmor, chestArmor, legsArmor].filter(Boolean);
  const preferredArmorFamilies = new Set(speciesRule.preferredArmorFamilies ?? []);
  const preferredArmorCount = armorPieces.filter((piece) => preferredArmorFamilies.has(piece?.family ?? "")).length;
  const armorAffinityMult = 1 + Math.min(0.12, preferredArmorCount * 0.04);
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
  const prevEnergyMax = Math.max(1, Math.floor(p.energyMax ?? 1));
  const hadExplicitEnergy = Number.isFinite(p.energy);
  const energyRatio = hadExplicitEnergy
    ? clamp((p.energy ?? prevEnergyMax) / prevEnergyMax, 0, 1)
    : 1;
  p.maxHp = newMaxHp;
  p.hp = clamp(Math.round(newMaxHp * hpRatio), 0, newMaxHp);

  p.baseAtk = baseAtk;
  p.baseDef = baseDef;
  p.weaponKind = weapon?.kind
    ?? ((resolvedAttackProfile?.source === "class_native" || resolvedAttackProfile?.source === "amplified_native")
      ? `native_${resolvedAttackProfile.flavor ?? "ranged"}`
      : "unarmed");
  p.weaponFamily = equippedWeaponFamily || (resolvedAttackProfile?.source === "replacer" ? String(resolvedAttackProfile.family ?? "") : "");
  p.weaponBehavior = weapon?.behavior ?? (resolvedAttackProfile?.source === "amplified_native" ? "amplifier" : "replacer");
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
  p.defBonus = Math.max(0, Math.round((baseDef + armorRaw * armorAffinityMult) * armorEffect));
  p.acc = clamp(Math.round(baseAcc + (species.accFlat ?? 0) + (classDef.accFlat ?? 0) + effAcc), 10, 98);
  p.eva = clamp(Math.round(baseEva + (species.evaFlat ?? 0) + (classDef.evaFlat ?? 0) + effEva + armorEvaBonus), 0, 85);
  p.spd = Number((baseSpd * (species.speedMult ?? 1) * (classDef.speedMult ?? 1) * effSpeedMult).toFixed(3));
  p.energyMax = Math.max(1, Math.round(((30 + int * 10) * PLAYER_STAT_SCALE) * energyMult + energyFlat + armorEnergyBonus));
  p.energy = clamp(Math.round(p.energyMax * energyRatio), 0, p.energyMax);
  p.armorAffinityMult = armorAffinityMult;
  p.weaponAffinityMult = weaponAffinityMult;
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
  if (!Number.isFinite(p.abilityCd)) p.abilityCd = 0;
  p.activeAbilityId = activeAbilityForClass(p.classId)?.id ?? "";
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
  if (isAuthoritativeSessionActive()) {
    const allocations = { ...levelUpUi.draft };
    return performAuthoritativeCommand({
      type: "ALLOCATE_STATS",
      allocations,
    }, { reason: "allocate-stats" }).then((ok) => {
      if (ok) clearLevelUpDraft();
      return ok;
    });
  }
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
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(unequipItemCommand(slot), { reason: "unequip-item" });
  }
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
  const eff = ensureArray(state?.player?.effects);
  if (state?.player) state.player.effects = eff;
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
  state.inv = normalizeInventoryEntries(state?.inv ?? [], {
    speciesId: state?.character?.speciesId ?? state?.player?.speciesId,
    classId: state?.character?.classId ?? state?.player?.classId,
    ownerId: state?.character?.id ?? null,
  });
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
    const usageMeta = itemUsageMetaForType(it.type);
    const equipValidation = (it.type.startsWith("weapon_") || it.type.startsWith("armor_"))
      ? canPlayerEquipItemType(state, it.type)
      : { ok: true, reason: "" };
    const unusableBadge = equipValidation.ok ? "" : " [Unusable]";
    const stackedAmount = Math.max(1, Math.floor(Number(entry.amount ?? it.amount ?? 1) || 1));
    label.textContent = `${idx + 1}. ${nm}${stackedAmount > 1 ? ` x${stackedAmount}` : ""}${unusableBadge}`;
    if (usageMeta) {
      const template = itemTemplateForType(it.type);
      const detailLines = [];
      detailLines.push(`Family: ${titleFromId(usageMeta.family)}`);
      detailLines.push(`Tier: ${materialLabel(template?.materialTierId ?? materialIdFromItemType(it.type) ?? "")}`);
      if ((usageMeta.archetypeTags ?? []).length > 0) detailLines.push(`Tags: ${(usageMeta.archetypeTags ?? []).map((tag) => titleFromId(tag)).join(", ")}`);
      detailLines.push(`Mode: ${usageMeta.behavior === "amplifier" ? "Amplifier" : "Replacer"}`);
      if ((usageMeta.favoredBy ?? []).length > 0) detailLines.push(`Favored by: ${(usageMeta.favoredBy ?? []).join(", ")}`);
      if ((usageMeta.usableBy ?? []).length > 0) detailLines.push(`Usable by: ${(usageMeta.usableBy ?? []).join(", ")}`);
      if (!equipValidation.ok && equipValidation.reason) detailLines.push(`Cannot equip: ${equipValidation.reason}`);
      btn.title = detailLines.join("\n");
    } else {
      btn.title = nm;
    }

    row.appendChild(iconWrap);
    row.appendChild(label);
    btn.appendChild(row);

    const invoke = () => useInventoryIndex(state, invIdx);
    const clickHandler = (e) => { e.stopPropagation(); invoke(); };
    btn.addEventListener('click', clickHandler);
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      takeTurn(state, dropInventoryIndex(state, invIdx));
    });

    invListEl.appendChild(btn);
  });
}

function buildGroupedInventoryEntries(state, filterFn = null) {
  const grouped = new Map();
  const source = Array.isArray(state?.inv) ? state.inv : [];
  for (let invIndex = 0; invIndex < source.length; invIndex++) {
    const item = source[invIndex];
    if (!item?.type) continue;
    if (filterFn && !filterFn(item, invIndex)) continue;
    const type = String(item.type);
    const amount = Math.max(1, Math.floor(Number(item.amount ?? 1) || 1));
    const existing = grouped.get(type);
    if (existing) {
      existing.amount += amount;
      existing.invIndices.push(invIndex);
      continue;
    }
    grouped.set(type, {
      type,
      item,
      invIndex,
      invIndices: [invIndex],
      amount,
      priority: type === "potion" ? 0 : 1,
      value: itemMarketValue(type),
      name: ITEM_TYPES[type]?.name ?? type,
    });
  }
  return [...grouped.values()].sort((a, b) =>
    (a.priority - b.priority) ||
    (b.value - a.value) ||
    a.name.localeCompare(b.name) ||
    (a.invIndex - b.invIndex)
  );
}

function getInventoryDisplayEntries(state) {
  return buildGroupedInventoryEntries(state);
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
  applyRespawnRecoveryState(state);
  p.x = sp.x; p.y = sp.y; p.z = sp.z;
  setLastLadderLanding(state, sp);

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

function placePlayerAtDungeonEntrance(state, { message = "", resetVision = false } = {}) {
  const p = state?.player;
  if (!state || !p) return false;
  const sp = state.startSpawn ?? computeInitialDepth0Spawn(state.world);
  state.startSpawn = sp;
  p.x = sp.x;
  p.y = sp.y;
  p.z = sp.z;
  setLastLadderLanding(state, sp);
  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);
  ensureSurfaceLinkTile(state);
  ensureShopState(state);
  updateAreaRespawnTracking(state, Date.now());
  hydrateNearby(state);
  if (resetVision) {
    state.seen = new Set();
    state.visible = new Set();
    state.exploredChunks = new Set();
  }
  if (message) pushLog(state, message);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  return true;
}

function createCharacterRunFromCurrentDungeon(baseState, snapshot) {
  if (!baseState || !snapshot) return null;
  const cloned = importSave(exportSave(baseState));
  if (!cloned) return null;
  if (!applyCharacterSnapshot(cloned, snapshot)) return null;
  cloned.log = [];
  placePlayerAtDungeonEntrance(cloned, {
    message: "You enter the dungeon...",
    resetVision: true,
  });
  return cloned;
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
    energy: 300,
    energyMax: 300,
    abilityCd: 0,
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
    quickSwitch: { active: false, baseCharacterId: "", baseClassId: "", baseSpeciesId: "", baseName: "", startedAt: 0 },
    debug: normalizeDebugFlags(),
    analytics: null,
  };

  if (carryover) {
    player.level = Math.max(1, Math.floor(carryover.level ?? player.level));
    player.xp = Math.max(0, Math.floor(carryover.xp ?? player.xp));
    player.maxHp = Math.max(1, Math.floor(carryover.maxHp ?? maxHpForLevel(player.level, characterProfile)));
    player.hp = player.maxHp;
    player.gold = Math.max(0, Math.floor(carryover.gold ?? 0));
    player.equip = normalizeEquip(carryover.equip ?? player.equip, {
      speciesId: characterProfile.speciesId,
      classId: characterProfile.classId,
    });
    state.inv = normalizeInventoryEntries(carryover.inv ?? [], {
      speciesId: characterProfile.speciesId,
      classId: characterProfile.classId,
      ownerId: characterProfile.id,
    });
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
  state.analytics = initializeAnalyticsForState(state, null, "new-game");
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
    const type = normalizeItemType(it.type);
    const templateId = itemTemplateIdForType(type) ?? type;
    const instanceId = String(it.instanceId ?? `base_${it.id}`);

    state.entities.set(it.id, {
      id: it.id,
      origin: "base",
      kind: "item",
      type,
      templateId,
      instanceId,
      ownerType: "world",
      ownerId: null,
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
    const trapFamilyId = trapFamilyDef(ov?.trapFamily ?? ov?.trapType ?? trap.trapFamily ?? trap.type ?? "pressure_plate")?.id ?? "pressure_plate";
    state.entities.set(trap.id, {
      id: trap.id,
      origin: "base",
      kind: "trap",
      trapType: trapFamilyId,
      trapFamily: trapFamilyId,
      x: Math.floor(ov?.x ?? wx),
      y: Math.floor(ov?.y ?? wy),
      z: Math.floor(ov?.z ?? z),
      depth: Math.max(0, Math.floor(ov?.depth ?? trap.depth ?? z)),
      armed: ov?.armed !== false,
      detected: !!ov?.detected,
      triggered: !!ov?.triggered,
      disarmed: !!ov?.disarmed,
      charges: Math.max(1, Math.floor(ov?.charges ?? trap.charges ?? 1)),
      factionId: String(ov?.factionId ?? trap.factionId ?? "").trim().toLowerCase(),
      payload: (ov?.payload && typeof ov.payload === "object")
        ? { ...ov.payload }
        : ((trap.payload && typeof trap.payload === "object") ? { ...trap.payload } : {}),
      friendlyTo: String(ov?.friendlyTo ?? trap.friendlyTo ?? "").trim().toLowerCase(),
      ownerId: ov?.ownerId ?? trap.ownerId ?? "",
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
  const actors = new Map();
  const pz = state.player.z;
  for (const e of state.entities.values()) {
    if (e.z !== pz) continue;
    const k = keyXYZ(e.x, e.y, e.z);
    if (e.kind === "monster") monsters.set(k, e.id);
    else if (e.kind === "item") items.set(k, e.id);
    else if (e.kind === "trap") traps.set(k, e.id);
    else if (e.kind === "actor") actors.set(k, e.id);
  }
  return { monsters, items, traps, actors };
}
function getCachedOccupancy(state) {
  if (occupancyStateRef !== state) {
    occupancyStateRef = state;
    occupancySig = "";
    occupancyCache = { monsters: new Map(), items: new Map(), traps: new Map(), actors: new Map() };
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
    trapFamily: trapFamilyDef(trap.trapFamily ?? trap.trapType ?? "pressure_plate")?.id ?? "pressure_plate",
    armed: !!trap.armed,
    detected: !!trap.detected,
    triggered: !!trap.triggered,
    disarmed: !!trap.disarmed,
    charges: Math.max(1, Math.floor(trap.charges ?? 1)),
    factionId: String(trap.factionId ?? "").trim().toLowerCase(),
    payload: (trap.payload && typeof trap.payload === "object") ? { ...trap.payload } : {},
    friendlyTo: String(trap.friendlyTo ?? "").trim().toLowerCase(),
    ownerId: trap.ownerId ?? "",
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
  if (detectedCount > 0) pushLog(state, detectedCount === 1 ? "You detect a hidden trap." : `You detect ${detectedCount} hidden traps.`);
  return detectedCount;
}
function trapPressureRawDamage(depth) {
  const legacyDamage = 7 + depth * 2.2;
  return Math.max(1, Math.round(legacyDamage * COMBAT_SCALE));
}
function trapDisplayName(trap) {
  return trapFamilyDef(trap?.trapFamily ?? trap?.trapType ?? "pressure_plate")?.label ?? "Trap";
}
function trapFamilyId(trap) {
  return trapFamilyDef(trap?.trapFamily ?? trap?.trapType ?? "pressure_plate")?.id ?? "pressure_plate";
}
function trapRawDamageForTrap(trap, state) {
  const depth = trapDepth(trap, state);
  const mult = trapDamageMultiplier(trapFamilyId(trap));
  return Math.max(1, Math.round(trapPressureRawDamage(depth) * mult));
}
function trapAffectsEntity(trap, entity) {
  if (!trap || !entity) return false;
  const friendlyTo = String(trap.friendlyTo ?? "").trim().toLowerCase();
  if (!friendlyTo) return true;
  if (entity.kind === "monster") return friendlyTo !== "monster";
  return friendlyTo !== "player";
}
function wakeMonstersNearTrap(state, trap, radius = 6) {
  let woke = 0;
  for (const ent of state.entities.values()) {
    if (!ent || ent.kind !== "monster") continue;
    if (ent.z !== trap.z) continue;
    const dist = Math.abs((ent.x ?? 0) - trap.x) + Math.abs((ent.y ?? 0) - trap.y);
    if (dist > radius) continue;
    if (!ent.awake) woke += 1;
    ent.awake = true;
    ent.alertedTurn = Math.max(state.turn ?? 0, Math.floor(ent.alertedTurn ?? 0));
    persistMonsterOverride(state, ent);
  }
  return woke;
}
function retireTriggeredTrap(state, trap) {
  if (!trap) return;
  trap.detected = true;
  trap.triggered = true;
  trap.charges = Math.max(0, Math.floor(Number(trap.charges ?? 1) - 1));
  trap.armed = trap.charges > 0;
  persistTrapOverride(state, trap);
}
function applyTrapDamageToMonster(state, trap, monster, rawDamage) {
  if (!monster || monster.kind !== "monster") return 0;
  const damage = Math.max(1, Math.floor(applyDefenseMitigation(rawDamage, monsterStatsForDepth(monster.type, monster.z ?? state?.player?.z ?? 0).def, 0.12)));
  const hpBefore = Math.max(0, Math.floor(monster.hp ?? 0));
  monster.hp = Math.max(0, hpBefore - damage);
  persistMonsterOverride(state, monster);
  recordAnalyticsDamage(ensureAnalyticsState(state), monster.z ?? state?.player?.z ?? 0, { dealt: damage });
  if (monster.hp <= 0) {
    const xpMult = xpChallengeMultiplier(state, monster, monsterStatsForDepth(monster.type, monster.z ?? state?.player?.z ?? 0));
    handleMonsterDefeat(state, monster, {
      xpMult,
      deathMessage: `The ${monsterDisplayName(monster, state?.player?.z ?? monster.z ?? 0)} is torn apart by ${trapDisplayName(trap).toLowerCase()}.`,
    });
  }
  return Math.max(0, Math.min(damage, hpBefore));
}
function triggerTrapForEntity(state, trap, entity) {
  if (!trap || trap.kind !== "trap" || !trap.armed || !entity) return false;
  if (!trapAffectsEntity(trap, entity)) return false;
  const familyId = trapFamilyId(trap);
  const label = trapDisplayName(trap);
  const analytics = ensureAnalyticsState(state);
  const depth = trapDepth(trap, state);
  let triggered = false;
  let damageDone = 0;

  if (familyId === "alarm_trap") {
    const woke = wakeMonstersNearTrap(state, trap, 7);
    if (entity.kind === "monster") pushLog(state, `${label} snaps and sends nearby enemies into a frenzy.`);
    else pushLog(state, `${label} blares. ${woke > 0 ? `${woke} nearby enemies stir.` : "Nothing answers."}`);
    triggered = true;
  } else if (entity.kind === "monster") {
    const rawDamage = trapRawDamageForTrap(trap, state);
    damageDone = applyTrapDamageToMonster(state, trap, entity, rawDamage);
    if (familyId === "poison_vent" && entity.hp > 0) {
      applyPoisonToMonster(state, entity, Math.max(1, Math.round(rawDamage * 0.18)), 2, label.toLowerCase());
      spawnPoisonCloudBurst(state, trap.x, trap.y, trap.z, 3, 1, Math.max(1, Math.round(rawDamage * 0.32)), label.toLowerCase());
    }
    if (familyId === "collapse_tile" && entity.hp > 0) entity.cd = Math.max(Math.floor(entity.cd ?? 0), 1);
    if (damageDone > 0) pushLog(state, `${label} hits the ${monsterDisplayName(entity, state?.player?.z ?? entity.z ?? 0)} for ${damageDone}.`);
    triggered = damageDone > 0 || familyId === "poison_vent" || familyId === "collapse_tile";
  } else {
    const player = state?.player;
    if (!player || player.dead) return false;
    if (stateDebug(state).godmode && familyId !== "alarm_trap") {
      pushLog(state, `${label} triggers, but godmode negates it.`);
      triggered = true;
    } else {
      const rawDamage = trapRawDamageForTrap(trap, state);
      const reduced = reduceIncomingDamage(state, rawDamage, depth);
      const damage = Math.max(1, Math.floor(reduced?.dmg ?? 1));
      if (familyId !== "alarm_trap") {
        player.hp = Math.max(0, player.hp - damage);
        damageDone = damage;
        recordAnalyticsDamage(analytics, depth, { taken: damage });
      }
      if (familyId === "poison_vent") {
        applyPoisonToPlayer(state, Math.max(1, Math.round(rawDamage * 0.14)), 3, label.toLowerCase());
        spawnPoisonCloudBurst(state, trap.x, trap.y, trap.z, 3, 1, Math.max(1, Math.round(rawDamage * 0.28)), label.toLowerCase());
      } else if (familyId === "collapse_tile") {
        applySlowToPlayer(state, 2, -5, -8, 0.86, label.toLowerCase());
      } else if (familyId === "shrine_curse_seal") {
        player.effects.push({ type: "curse", atkDelta: -80, turnsLeft: 40 });
        recalcDerivedStats(state);
      }
      if (familyId === "beam_link") {
        pushLog(state, `${label} lances through you for ${damage}.`);
      } else if (familyId === "dart_line") {
        pushLog(state, `${label} tears into you for ${damage}.`);
      } else if (familyId === "pressure_plate") {
        pushLog(state, `A hidden ${label.toLowerCase()} triggers for ${damage} damage.`);
      } else if (familyId === "alarm_trap") {
        const woke = wakeMonstersNearTrap(state, trap, 7);
        pushLog(state, `${label} blares. ${woke > 0 ? `${woke} nearby enemies stir.` : "Nothing answers."}`);
      } else {
        pushLog(state, `${label} triggers for ${damage}.`);
      }
      if (player.hp <= 0 && !player.dead) killPlayer(state, { cause: "trap", killerType: familyId });
      triggered = true;
    }
  }

  if (!triggered) return false;
  retireTriggeredTrap(state, trap);
  recordAnalyticsCounter(analytics, "trapsTriggered", 1, depth);
  analyticsEventAtPlayer(state, "trap_triggered", {
    trapFamily: familyId,
    damage: damageDone,
  }, depth, trap.x, trap.y);
  return true;
}
function triggerPressureTrap(state, trap) {
  return triggerTrapForEntity(state, trap, state?.player ?? null);
}
function trapDisarmXp(depth) {
  return Math.max(1, Math.round((3 + depth * 0.8) * XP_SCALE));
}
function disarmTrapAtPlayer(state) {
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(disarmTrapCommand(), { reason: "disarm-trap" });
  }
  const p = state?.player;
  if (!p || p.dead) return false;
  state.lastPlayerActionKind = "trap";
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
  recordAnalyticsCounter(ensureAnalyticsState(state), "trapsDisarmed", 1, trapDepth(trap, state));
  analyticsEventAtPlayer(state, "trap_disarmed", {
    trapFamily: trapFamilyId(trap),
    xp,
  }, trapDepth(trap, state), trap.x, trap.y);
  pushLog(state, `You disarm the ${trapDisplayName(trap).toLowerCase()}. (+${xp} XP)`);
  return true;
}
function processPlayerTrapInteractions(state) {
  const p = state?.player;
  if (!p || p.dead) return false;
  revealNearbyTrapsBySkill(state);
  const trap = getTrapAt(state, p.x, p.y, p.z, { requireArmed: true });
  if (!trap) return false;
  if (trap.detected || trap.triggered) return false;
  return triggerTrapForEntity(state, trap, p);
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
  if (roll < 0.72) return weaponForDepth(depth, rng, { source: "floor" });
  if (roll < 0.92) return armorForDepth(depth, rng, { source: "floor" });
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
  const canTrackDiscovery = canMutateGameplayStateLocally();
  const shouldPrimeSeenForRender = !canTrackDiscovery && (state?.seen?.size ?? 0) === 0;
  const { world, player, seen, visible } = state;
  if (visibilityStateRef !== state) {
    visibilityStateRef = state;
    visibilitySig = "";
  }
  const sig = `${player.x},${player.y},${player.z}|${state.turn ?? 0}|${fogEnabled ? 1 : 0}|${viewRadiusX},${viewRadiusY}`;
  if (sig === visibilitySig) return;
  visibilitySig = sig;

  visible.clear();
  let newlySeenTiles = 0;
  let newlySeenChunks = 0;

  world.ensureChunksAround(player.x, player.y, player.z, viewRadiusForChunks());

  for (let dy = -viewRadiusY; dy <= viewRadiusY; dy++) {
    for (let dx = -viewRadiusX; dx <= viewRadiusX; dx++) {
      const wx = player.x + dx;
      const wy = player.y + dy;

      if (!fogEnabled) {
        visible.add(keyXY(wx, wy));
        if (canTrackDiscovery || shouldPrimeSeenForRender) {
          const seenKey = keyXYZ(wx, wy, player.z);
          if (!seen.has(seenKey) && canTrackDiscovery) {
            newlySeenTiles += 1;
            const { cx, cy } = splitWorldToChunk(wx, wy);
            const chunkKey = keyZCXCY(player.z, cx, cy);
            if (!state.exploredChunks.has(chunkKey)) {
              state.exploredChunks.add(chunkKey);
              newlySeenChunks += 1;
            }
          }
          seen.add(seenKey);
        }
        continue;
      }

      if (hasLineOfSight(world, player.z, player.x, player.y, wx, wy)) {
        visible.add(keyXY(wx, wy));
        if (canTrackDiscovery || shouldPrimeSeenForRender) {
          const seenKey = keyXYZ(wx, wy, player.z);
          if (!seen.has(seenKey) && canTrackDiscovery) {
            newlySeenTiles += 1;
            const { cx, cy } = splitWorldToChunk(wx, wy);
            const chunkKey = keyZCXCY(player.z, cx, cy);
            if (!state.exploredChunks.has(chunkKey)) {
              state.exploredChunks.add(chunkKey);
              newlySeenChunks += 1;
            }
          }
          seen.add(seenKey);
        }
      }
    }
  }
  if (canTrackDiscovery && (newlySeenTiles > 0 || newlySeenChunks > 0)) {
    recordAnalyticsDiscovery(ensureAnalyticsState(state), player.z, newlySeenTiles, newlySeenChunks);
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
  p.effects = ensureArray(p?.effects);
  if (p.poisonImmune) {
    p.effects = (p.effects ?? []).filter((e) => e?.type !== "poison");
  }
  if (!p.effects.length) return;

  for (const e of p.effects) {
    if (e.type === "regen") {
      if (p.hp > 0) {
        const before = p.hp;
        p.hp = clamp(p.hp + e.healPerTurn, 0, p.maxHp);
        if (p.hp > before) recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { healing: p.hp - before });
      }
    }
    if (e.type === "poison") {
      if (p.hp > 0) {
        const dmg = Math.max(1, Math.floor(Number(e.dmgPerTurn ?? 1)));
        p.hp = Math.max(0, p.hp - dmg);
        recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { taken: dmg });
        pushLog(state, `Poison deals ${dmg} damage.`);
      }
    }
    e.turnsLeft -= 1;
  }
  p.effects = p.effects.filter(e => e.turnsLeft > 0);
  if (p.hp <= 0 && !p.dead) killPlayer(state, { cause: "poison", killerType: "poison" });

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
    recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { taken: dmg });
    pushLog(state, `Toxic cloud burns you for ${dmg}.`);
    applyPoisonToPlayer(state, Math.round(base * 0.6), 2, cloud.source ?? "the cloud");
    if (p.hp <= 0 && !p.dead) killPlayer(state, { cause: "poison_cloud", killerType: cloud.source ?? "cloud" });
  }
  for (const k of Object.keys(clouds)) {
    const entry = clouds[k];
    entry.turnsLeft = Math.max(0, Math.floor(entry.turnsLeft ?? 0) - 1);
    if (entry.turnsLeft <= 0) delete clouds[k];
  }
}

function applyReveal(state, radius = 28) {
  const p = state.player;
  let newlySeenTiles = 0;
  let newlySeenChunks = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = p.x + dx, wy = p.y + dy;
      const seenKey = keyXYZ(wx, wy, p.z);
      if (state.seen.has(seenKey)) continue;
      state.seen.add(seenKey);
      newlySeenTiles += 1;
      const { cx, cy } = splitWorldToChunk(wx, wy);
      const chunkKey = keyZCXCY(p.z, cx, cy);
      if (!state.exploredChunks.has(chunkKey)) {
        state.exploredChunks.add(chunkKey);
        newlySeenChunks += 1;
      }
    }
  }
  if (newlySeenTiles > 0 || newlySeenChunks > 0) {
    recordAnalyticsDiscovery(ensureAnalyticsState(state), p.z, newlySeenTiles, newlySeenChunks);
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
  const effectDamageMult = (p.effects ?? [])
    .filter((e) => Number.isFinite(e?.damageMult))
    .reduce((mult, e) => mult * Math.max(0.1, Number(e.damageMult ?? 1)), 1);
  damageMult *= effectDamageMult;

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
  const effectReductionMult = (state.player.effects ?? [])
    .filter((e) => Number.isFinite(e?.incomingDamageMult))
    .reduce((mult, e) => mult * Math.max(0.2, Number(e.incomingDamageMult ?? 1)), 1);
  reduced = Math.max(1, Math.round(reduced * effectReductionMult));
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
function killPlayer(state, options = null) {
  state.player.hp = 0;
  state.player.dead = true;
  const opts = (options && typeof options === "object") ? options : {};
  const cause = String(opts.cause ?? "death");
  const killerType = String(opts.killerType ?? "");
  void endAnalyticsRun(state, {
    status: "dead",
    deathCause: cause,
    deathKillerType: killerType,
    reason: "death",
  });
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
  state.lastPlayerActionKind = "door";

  const keyType = lockToKeyType(t);
  const lockpickEnabled = !!stateDebug(state).lockpick;
  if (!lockpickEnabled && !invConsume(state, keyType, 1)) {
    pushLog(state, `Locked door. Need a ${ITEM_TYPES[keyType].name}.`);
    renderInventory(state);
    return true;
  }

  state.world.setTile(x, y, z, lockToOpenDoorTile(t));
  recordAnalyticsCounter(ensureAnalyticsState(state), "doorsOpened", 1, z);
  analyticsEventAtPlayer(state, "locked_door_opened", {
    keyType,
  }, z, x, y);
  if (lockpickEnabled) pushLog(state, "You pick the lock and open the door.");
  else pushLog(state, "You unlock and open the door.");
  renderInventory(state);
  return true;
}

function tryOpenClosedDoor(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (t !== DOOR_CLOSED) return false;
  state.lastPlayerActionKind = "door";
  state.world.setTile(x, y, z, DOOR_OPEN);
  recordAnalyticsCounter(ensureAnalyticsState(state), "doorsOpened", 1, z);
  pushLog(state, "You open the door.");
  state.visitedDoors?.add(keyXYZ(x, y, z));
  return true;
}

function tryCloseAdjacentDoor(state) {
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(closeDoorCommand(), { reason: "close-door" });
  }
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
    state.lastPlayerActionKind = "door";
    recordAnalyticsCounter(ensureAnalyticsState(state), "doorsClosed", 1, p.z);
    pushLog(state, "You close the door.");
    return true;
  }
  pushLog(state, "No open door adjacent to close.");
  return false;
}

// ---------- Dynamic drops ----------
function spawnDynamicItem(state, type, amount, x, y, z) {
  const normalizedType = normalizeItemType(type);
  const templateId = itemTemplateIdForType(normalizedType) ?? normalizedType;
  const instance = createItemInstance(normalizedType, "world", null, { x, y, z });
  const id = `dyn|${instance.id}|${z}|${x},${y}`;
  const ent = {
    id,
    origin: "dynamic",
    kind: "item",
    type: normalizedType,
    templateId,
    instanceId: instance.id,
    ownerType: "world",
    ownerId: null,
    amount,
    x,
    y,
    z,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  };
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
    const drop = Math.random() < 0.58
      ? weaponForDepth(rollDepth, Math.random, { source: "chest", state })
      : armorForDepth(rollDepth, Math.random, { source: "chest", state });
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
  const trap = getTrapAt(state, tx, ty, tz, { requireArmed: true });
  if (trap) triggerTrapForEntity(state, trap, monster);
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
  const trap = getTrapAt(state, tx, ty, tz, { requireArmed: true });
  if (trap) triggerTrapForEntity(state, trap, p);
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
    const factionId = monsterFactionForType(monster?.type ?? "");
    const drop = Math.random() < 0.5
      ? weaponForDepth(state.player.z, Math.random, { source: "monster", state, factionId })
      : armorForDepth(state.player.z, Math.random, { source: "monster", state, factionId });
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
  state.lastPlayerActionKind = "attack";
  recordAnalyticsCounter(ensureAnalyticsState(state), "attacks", 1, state.player.z);
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
    rememberMonsterPlayerPosition(monster, p, state.turn ?? 0);
    alertMonsterPack(state, monster, p, monsterAlertRadius(mSpec));
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
  rememberMonsterPlayerPosition(monster, p, state.turn ?? 0);
  alertMonsterPack(state, monster, p, monsterAlertRadius(mSpec));
  persistMonsterOverride(state, monster);

  const profileKind = weaponProfile?.kind ?? "melee";
  const nativeFlavor = String(weaponProfile?.flavor ?? "").trim().toLowerCase();
  const isNativeAttackSource = weaponProfile?.source === "class_native" || weaponProfile?.source === "amplified_native";
  const isNativeToxinShot = profileKind === "ranged" && isNativeAttackSource && nativeFlavor === "toxin";
  if (dmg > 0 && monster.hp > 0) {
    const rangedPoison = (classDef?.rangedPoisonOnHit && typeof classDef.rangedPoisonOnHit === "object")
      ? classDef.rangedPoisonOnHit
      : null;
    if (rangedPoison && profileKind === "ranged") {
      const chance = clamp(Number(rangedPoison.chance ?? 1), 0, 1);
      const nativeOnly = !!rangedPoison.nativeOnly;
      const requiredFlavor = String(rangedPoison.requiredFlavor ?? "").trim().toLowerCase();
      const flavorMatch = !requiredFlavor || requiredFlavor === nativeFlavor;
      if ((!nativeOnly || isNativeAttackSource) && flavorMatch && Math.random() < chance) {
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
  const attackName = String(weaponProfile?.attackName ?? "").trim();
  const source = String(weaponProfile?.source ?? "");
  let attackVerb = "You hit";
  if (isNativeToxinShot) {
    attackVerb = source === "amplified_native" ? "You unleash amplified venom at" : "You spit venom at";
  } else if (source === "class_native" && attackName) {
    attackVerb = `You use ${attackName} on`;
  } else if (source === "amplified_native" && attackName) {
    attackVerb = `You channel ${attackName} into`;
  } else if (source === "replacer" && attackName) {
    attackVerb = `You strike with ${attackName} at`;
  }
  pushLog(state, `${attackVerb} the ${monsterDisplayName(monster, p.z)} for ${dmg}${attack.crit ? " (critical)" : ""}.`);
  if (classId === "telekinetic" && firstCombatStrike && monster.hp > 0 && tryKnockbackMonster(state, monster, p.x, p.y)) {
    pushLog(state, `Telekinetic force knocks the ${monsterDisplayName(monster, p.z)} back.`);
  }
  const damageApplied = Math.max(0, Math.min(dmg, hpBefore));
  if (damageApplied > 0) recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { dealt: damageApplied });
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
      recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { taken: reflected });
      pushLog(state, `The ${monsterDisplayName(monster, p.z)} reflects ${reflected} damage.`);
      if (p.hp <= 0) {
        killPlayer(state, { cause: "reflect", killerType: monster?.type ?? "" });
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
  if (isAuthoritativeSessionActive()) {
    const command = moveCommand(dx, dy);
    return command ? performAuthoritativeCommand(command, { reason: "move" }) : false;
  }
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
  state.lastPlayerActionKind = "move";
  recordAnalyticsMovement(ensureAnalyticsState(state), p.z, 1);
  return true;
}

function waitTurn(state) {
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(waitCommand(), { reason: "wait" });
  }
  if (state.player.dead) return false;
  state.player.attackAfterMove = false;
  state.lastPlayerActionKind = "wait";
  recordAnalyticsCounter(ensureAnalyticsState(state), "waits", 1, state.player.z);
  pushLog(state, "You wait.");
  return true;
}

function pickup(state) {
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(pickupCommand(), { reason: "pickup" });
  }
  const p = state.player;
  if (p.dead) return false;
  state.lastPlayerActionKind = "pickup";

  const itemsHere = getItemsAt(state, p.x, p.y, p.z);
  if (!itemsHere.length) { pushLog(state, "Nothing here to pick up."); return false; }

  const it = itemsHere.find((e) => isDirectlyTakeableItem(e.type)) ?? itemsHere[0];
  if (!it) return false;

  if (it.type === "gold") {
    p.gold += it.amount ?? 1;
    recordAnalyticsCounter(ensureAnalyticsState(state), "goldCollected", Math.max(1, Math.floor(it.amount ?? 1)), p.z);
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
        const keyName = ITEM_TYPES[keyType]?.name ?? "matching key";
        pushLog(state, `The chest is locked. Need a ${keyName}.`);
        return false;
      }
      if (lockpickEnabled) pushLog(state, "You pick the chest lock.");
      else pushLog(state, `You use the ${ITEM_TYPES[keyType].name} and open the Chest.`);
    }
    const chestDepth = normalizeChestLootDepth(Math.max(0, Math.floor(it.z ?? p.z ?? 0)), it);
    const g = 15 + Math.floor(Math.random() * (25 + clamp(chestDepth, 0, 55)));
    p.gold += g;
    recordAnalyticsCounter(ensureAnalyticsState(state), "chestsOpened", 1, p.z);
    recordAnalyticsCounter(ensureAnalyticsState(state), "goldCollected", g, p.z);
    analyticsEventAtPlayer(state, "chest_opened", {
      locked: isLocked,
      lootDepth: chestDepth,
      gold: g,
    }, p.z, p.x, p.y);
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
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(useItemCommand(idx), { reason: "use-item" });
  }
  const p = state.player;
  if (p.dead) return;

  const it = state.inv[idx];
  if (!it) return;

  if (it.type === "potion") {
    const heal = Math.max(1, Math.round(potionHealAmount(p.maxHp) * Math.max(0.1, Number(p.healMult ?? 1))));
    const before = p.hp;
    p.hp = clamp(p.hp + heal, 0, p.maxHp);
    recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { healing: Math.max(0, p.hp - before) });
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
    const validation = canPlayerEquipItemType(state, it.type);
    if (!validation.ok) {
      pushLog(state, validation.reason || "That weapon can't be equipped by this character.");
      return;
    }
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
    const validation = canPlayerEquipItemType(state, it.type);
    if (!validation.ok) {
      pushLog(state, validation.reason || "That armor can't be equipped by this character.");
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
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(dropItemCommand(idx), { reason: "drop-item" });
  }
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

  if (canMutateShopStateLocally()) {
    const refreshed = refreshShopStock(state, false);
    if (refreshed) pushLog(state, "The shopkeeper restocked new wares.");
  }
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
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(useShrineCommand(), { reason: "use-shrine" });
  }
  const p = state.player;
  if (p.dead) return false;
  state.lastPlayerActionKind = "shrine";

  const it = findItemAtByType(state, p.x, p.y, p.z, "shrine");
  if (!it || it.type !== "shrine") { pushLog(state, "Nothing to interact with here."); return false; }

  const { cx, cy } = splitWorldToChunk(p.x, p.y);
  const eff = deterministicShrineEffect(state.world.seedStr, p.z, cx, cy);

  if (eff.type === "heal") {
    const before = p.hp;
    p.hp = p.maxHp;
    recordAnalyticsDamage(ensureAnalyticsState(state), p.z, { healing: Math.max(0, p.hp - before) });
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
  recordAnalyticsCounter(ensureAnalyticsState(state), "shrinesUsed", 1, p.z);
  analyticsEventAtPlayer(state, "shrine_used", {
    effect: eff.type,
  }, p.z, p.x, p.y);

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
  const prevZ = p.z;

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
  enterAnalyticsFloor(ensureAnalyticsState(state), p.z, Date.now());
  analyticsEventAtPlayer(state, "floor_enter", {
    fromDepth: prevZ,
    direction,
  }, p.z, p.x, p.y);

  hydrateNearby(state);
  updateAreaRespawnTracking(state, Date.now());
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
}

function tryUseStairs(state, dir) {
  if (isAuthoritativeSessionActive()) {
    const command = stairsCommand(dir);
    return command ? performAuthoritativeCommand(command, { reason: "use-stairs" }) : false;
  }
  const p = state.player;
  if (p.dead) return false;
  state.lastPlayerActionKind = dir === "down" ? "stairs-down" : "stairs-up";
  const fromDepth = p.z;

  const here = state.world.getTile(p.x, p.y, p.z);

  if (dir === "down") {
    if (here !== STAIRS_DOWN) { pushLog(state, "No stairs down here."); return false; }
    goToLevel(state, p.z + 1, "down");
    recordAnalyticsCounter(ensureAnalyticsState(state), "stairsDown", 1, fromDepth);
    analyticsEventAtPlayer(state, "stairs_down", { fromDepth }, fromDepth, p.x, p.y);
    saveRuntime.pendingAutosaveReason = "stairs-transition";
    return true;
  } else {
    if (here !== STAIRS_UP) { pushLog(state, "No stairs up here."); return false; }
    if (p.z <= SURFACE_LEVEL) { pushLog(state, "You can't go up any further."); return false; }
    goToLevel(state, p.z - 1, "up");
    recordAnalyticsCounter(ensureAnalyticsState(state), "stairsUp", 1, fromDepth);
    analyticsEventAtPlayer(state, "stairs_up", { fromDepth }, fromDepth, p.x, p.y);
    saveRuntime.pendingAutosaveReason = "stairs-transition";
    return true;
  }
}

// Contextual interact: stairs first, then shop/shrine
function interactContext(state) {
  if (isAuthoritativeSessionActive()) {
    const p = state?.player;
    const shopkeeper = p ? findItemAtByType(state, p.x, p.y, p.z, "shopkeeper") : null;
    if (shopkeeper?.type === "shopkeeper") {
      return performAuthoritativeCommand(interactCommand(), { reason: "shop-interact" }).then((ok) => {
        if (ok) openShopOverlay(game, "buy");
        return ok;
      });
    }
    return performAuthoritativeCommand(interactCommand(), { reason: "interact" });
  }
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

function ensureMonsterMemory(monster) {
  if (!monster || typeof monster !== "object") return null;
  const raw = (monster.memory && typeof monster.memory === "object") ? monster.memory : {};
  monster.memory = {
    lastSeenPlayerX: Number.isFinite(Number(raw.lastSeenPlayerX)) ? Math.floor(Number(raw.lastSeenPlayerX)) : null,
    lastSeenPlayerY: Number.isFinite(Number(raw.lastSeenPlayerY)) ? Math.floor(Number(raw.lastSeenPlayerY)) : null,
    lastSeenTurn: Number.isFinite(Number(raw.lastSeenTurn)) ? Math.floor(Number(raw.lastSeenTurn)) : -9999,
  };
  return monster.memory;
}

function rememberMonsterPlayerPosition(monster, player, turn) {
  const memory = ensureMonsterMemory(monster);
  if (!memory || !player) return null;
  memory.lastSeenPlayerX = Math.floor(Number(player.x ?? 0));
  memory.lastSeenPlayerY = Math.floor(Number(player.y ?? 0));
  memory.lastSeenTurn = Math.floor(Number(turn ?? 0));
  return memory;
}

function monsterHasFreshPlayerMemory(monster, currentTurn, maxAge = 10) {
  const memory = ensureMonsterMemory(monster);
  if (!memory) return false;
  if (!Number.isFinite(memory.lastSeenTurn)) return false;
  if (!Number.isFinite(memory.lastSeenPlayerX) || !Number.isFinite(memory.lastSeenPlayerY)) return false;
  return (Math.floor(Number(currentTurn ?? 0)) - Math.floor(Number(memory.lastSeenTurn ?? 0))) <= Math.max(1, Math.floor(Number(maxAge) || 10));
}

function clearMonsterIntent(monster) {
  if (!monster || typeof monster !== "object") return;
  monster.intent = null;
}

function monsterAlertRadius(spec) {
  return Math.max(3, Math.floor(Number(spec?.alertRadius ?? ((spec?.range ?? 0) > 0 ? 6 : 4)) || 4));
}

function alertMonsterPack(state, sourceMonster, player, radius = 4) {
  if (!state?.entities || !sourceMonster || !player) return 0;
  const z = Math.floor(Number(sourceMonster.z ?? player.z ?? 0));
  const alertRadius = Math.max(1, Math.floor(Number(radius) || 4));
  let alerted = 0;
  for (const ent of state.entities.values()) {
    if (!ent || ent.kind !== "monster" || ent.id === sourceMonster.id) continue;
    if (ent.z !== z) continue;
    const dist = Math.abs((ent.x ?? 0) - (sourceMonster.x ?? 0)) + Math.abs((ent.y ?? 0) - (sourceMonster.y ?? 0));
    if (dist > alertRadius) continue;
    const wasAwake = !!ent.awake;
    ent.awake = true;
    rememberMonsterPlayerPosition(ent, player, state.turn ?? 0);
    if (!wasAwake) alerted += 1;
    persistMonsterOverride(state, ent);
  }
  return alerted;
}

function monsterUsesIntentTelegraph(monster, spec, ai = "") {
  if (!FEATURE_FLAGS.monsterIntentTelegraphs) return false;
  if ((spec?.range ?? 0) <= 0) return false;
  const type = String(monster?.type ?? "").trim().toLowerCase();
  if (String(ai) === "ranged_artillery") return true;
  if (type === "storm_sniper" || type === "deepcore_ballista_sentinel") return true;
  return String(ai) === "ranged_hold" && Math.floor(Number(spec?.range ?? 0)) >= 6 && Math.floor(Number(spec?.cdTurns ?? 0)) >= 2;
}

function queueMonsterShotIntent(state, monster, spec, player, options = null) {
  if (!monster || !player) return null;
  const opts = (options && typeof options === "object") ? options : {};
  monster.intent = {
    type: String(opts.type ?? "line_shot"),
    targetX: Math.floor(Number(player.x ?? 0)),
    targetY: Math.floor(Number(player.y ?? 0)),
    executeOnTurn: Math.max(Math.floor(Number(state?.turn ?? 0)) + 1, Math.floor(Number(opts.executeOnTurn ?? ((state?.turn ?? 0) + 1)) || ((state?.turn ?? 0) + 1))),
    visible: opts.visible !== false,
  };
  return monster.intent;
}

function executeMonsterShotIntent(state, monster, spec) {
  const intent = (monster?.intent && typeof monster.intent === "object") ? monster.intent : null;
  if (!intent || !monster || !state?.player) return false;
  const player = state.player;
  const z = Math.floor(Number(monster.z ?? player.z ?? 0));
  const targetX = Number.isFinite(Number(intent.targetX)) ? Math.floor(Number(intent.targetX)) : player.x;
  const targetY = Number.isFinite(Number(intent.targetY)) ? Math.floor(Number(intent.targetY)) : player.y;
  const minRange = Math.max(1, Math.floor(Number(spec?.minRange ?? ((spec?.range ?? 0) > 0 ? 2 : 1)) || 1));
  const dist = Math.abs((monster.x ?? 0) - targetX) + Math.abs((monster.y ?? 0) - targetY);
  const hasShot = dist >= minRange && dist <= Math.max(minRange, Math.floor(Number(spec?.range ?? minRange) || minRange));
  const hasLos = hasLineOfSight(state.world, z, monster.x, monster.y, targetX, targetY);
  const hitsPlayer = player.x === targetX && player.y === targetY && hasShot && hasLos;
  clearMonsterIntent(monster);
  if (hitsPlayer) {
    monsterHitPlayer(state, monster, spec.atkLo, spec.atkHi, "shoots");
  } else if (state.visible.has(keyXY(monster.x, monster.y))) {
    pushLog(state, `The ${monsterDisplayName(monster, z)} fires where you stood.`);
  }
  monster.cd = Math.max(0, Math.floor(Number(spec?.cdTurns ?? 2) || 2));
  monster.awake = true;
  return true;
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
  recordAnalyticsDamage(ensureAnalyticsState(state), state.player.z, { taken: dmg });
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
  if (state.player.hp <= 0) killPlayer(state, { cause: "monster", killerType: monster?.type ?? "" });
}

function monstersTurn(state) {
  const p = state.player;
  if (p.dead) return;
  if (stateDebug(state).ghost) return;

  hydrateNearby(state);
  computeVisibility(state);

  const z = p.z;
  const { monsters } = buildOccupancy(state);
  const monsterOccupancy = new Map(monsters);
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
      monsterOccupancy.delete(keyXYZ(m.x, m.y, z));
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
      const occ = monsterOccupancy.get(keyXYZ(nx, ny, z));
      if (occ) return false;
      if (nx === p.x && ny === p.y) return false;
      const oldKey = keyXYZ(m.x, m.y, z);
      const newKey = keyXYZ(nx, ny, z);
      monsterOccupancy.delete(oldKey);
      monsterOccupancy.set(newKey, m.id);
      m.x = nx;
      m.y = ny;
      clearMonsterIntent(m);
      persistOverride();
      const trap = getTrapAt(state, nx, ny, z, { requireArmed: true });
      if (trap) {
        triggerTrapForEntity(state, trap, m);
        if (!state.entities.has(m.id) || (m.hp ?? 0) <= 0) {
          monsterOccupancy.delete(newKey);
        }
      }
      return true;
    };
    const tryStepTowardPoint = (goalX, goalY) => {
      const next = bfsNextStep(state, { x: m.x, y: m.y }, { x: goalX, y: goalY });
      if (!next) return false;
      return tryMoveTo(next.x, next.y);
    };
    const tryStepTowardPlayer = () => {
      return tryStepTowardPoint(p.x, p.y);
    };
    const tryStepAwayFromPlayer = () => {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(() => Math.random() - 0.5);
      let best = null;
      let bestDist = distMan;
      for (const [dx, dy] of dirs) {
        const nx = m.x + dx;
        const ny = m.y + dy;
        if (!state.world.isPassable(nx, ny, z)) continue;
        const occ = monsterOccupancy.get(keyXYZ(nx, ny, z));
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
          const occ = monsterOccupancy.get(keyXYZ(nx, ny, z));
          if (occ) continue;
          if (nx === p.x && ny === p.y) continue;
          const nd = Math.abs(nx - p.x) + Math.abs(ny - p.y);
          candidates.push({ x: nx, y: ny, d: nd });
        }
      }
      if (!candidates.length) return false;
      candidates.sort((a, b) => a.d - b.d);
      const pick = candidates[0];
      const oldKey = keyXYZ(m.x, m.y, z);
      const newKey = keyXYZ(pick.x, pick.y, z);
      monsterOccupancy.delete(oldKey);
      monsterOccupancy.set(newKey, m.id);
      m.x = pick.x;
      m.y = pick.y;
      m.blinkStrikeBonus = pick.d <= 1;
      clearMonsterIntent(m);
      persistOverride();
      const trap = getTrapAt(state, pick.x, pick.y, z, { requireArmed: true });
      if (trap) {
        triggerTrapForEntity(state, trap, m);
        if (!state.entities.has(m.id) || (m.hp ?? 0) <= 0) {
          monsterOccupancy.delete(newKey);
        }
      }
      return true;
    };

    if (m.intent && Number.isFinite(Number(m.intent.executeOnTurn)) && Math.floor(Number(m.intent.executeOnTurn)) < (state.turn ?? 0)) {
      clearMonsterIntent(m);
    }
    if (m.intent && Number.isFinite(Number(m.intent.executeOnTurn)) && Math.floor(Number(m.intent.executeOnTurn)) <= (state.turn ?? 0)) {
      executeMonsterShotIntent(state, m, spec);
      persistOverride();
      continue;
    }

    if (seesPlayer) {
      m.awake = true;
      rememberMonsterPlayerPosition(m, p, state.turn ?? 0);
      alertMonsterPack(state, m, p, monsterAlertRadius(spec));
      persistOverride();
    }

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
          if (monsterOccupancy.get(keyXYZ(nx, ny, z))) continue;
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
          monsterOccupancy.set(keyXYZ(nx, ny, z), sid);
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

    if (canShoot && !m.intent && monsterUsesIntentTelegraph(m, spec, ai)) {
      queueMonsterShotIntent(state, m, spec, p, {
        type: ai === "ranged_artillery" ? "line_shot" : "charged_shot",
      });
      m.awake = true;
      persistOverride();
      continue;
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
      if (tryStepTowardPlayer()) continue;
    } else if (m.awake && monsterHasFreshPlayerMemory(m, state.turn ?? 0, 10)) {
      const memory = ensureMonsterMemory(m);
      if (memory && m.x === memory.lastSeenPlayerX && m.y === memory.lastSeenPlayerY) {
        memory.lastSeenTurn = -9999;
      } else if (memory && tryStepTowardPoint(memory.lastSeenPlayerX, memory.lastSeenPlayerY)) {
        continue;
      }
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
  if (FEATURE_FLAGS.spriteFootprints) {
    ensureSpriteBounds(spriteBoundsCache, id, img, spriteProfileForId(id));
  }
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
function spriteProfileForId(spriteId) {
  const base = defaultSpriteProfile(spriteScalePercentForId(spriteId));
  const raw = spriteOverrideState.profiles?.[spriteId];
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
  };
}
function scaledSpriteSize(baseSize, spriteId) {
  const profile = spriteProfileForId(spriteId);
  const scale = Number.isFinite(profile?.maxHeightPct) ? profile.maxHeightPct : spriteScalePercentForId(spriteId);
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
  slime_green: "slime_green",
  slime_yellow: "slime_yellow",
  slime_orange: "slime_orange",
  slime_red: "slime_red",
  slime_violet: "slime_violet",
  slime_indigo: "slime_indigo",
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
  key_red: ["chest_red"],
  key_green: ["chest_green"],
  key_yellow: ["chest_green"],
  key_orange: ["chest_red"],
  key_violet: ["chest_violet", "chest_purple", "chest_blue"],
  key_indigo: ["chest_indigo", "chest_blue"],
  key_blue: ["chest_blue", "chest_indigo"],
  key_purple: ["chest_purple", "chest_violet", "chest_blue"],
  key_magenta: ["chest_magenta", "chest_indigo", "chest_blue"],
};
const WEAPON_SPRITE_FAMILY_FALLBACK = Object.freeze({
  dagger: ["dagger", "sword", "axe"],
  sword: ["sword", "axe", "dagger"],
  axe: ["axe", "sword", "dagger"],
  shortbow: ["dagger", "sword"],
  longbow: ["sword", "dagger"],
  crossbow: ["axe", "sword", "dagger"],
  wand: ["dagger", "sword"],
  staff: ["sword", "axe"],
  focus: ["dagger", "sword"],
  psi_lens: ["dagger", "sword"],
  emitter: ["dagger", "sword"],
  carbine: ["sword", "dagger"],
  launcher: ["axe", "sword"],
  gland_caster: ["dagger", "sword"],
  stinger_rig: ["dagger", "axe"],
  void_lens: ["dagger", "sword"],
  alchemical_kit: ["dagger", "sword"],
});
const ITEM_SPRITE_MATERIAL_FALLBACK = Object.freeze(["iron", "bronze", "wood"]);
function pushUniqueSpriteCandidate(list, value) {
  if (!value || typeof value !== "string") return;
  if (!list.includes(value)) list.push(value);
}
function spriteCandidatesForWeaponType(type) {
  const out = [];
  const materialId = materialIdFromItemType(type);
  const familyId = normalizeWeaponFamilyId(weaponKindFromItemType(type) ?? "");
  if (!familyId) return out;
  const familyCandidates = WEAPON_SPRITE_FAMILY_FALLBACK[familyId] ?? ["dagger", "sword", "axe"];
  const materialCandidates = [];
  pushUniqueSpriteCandidate(materialCandidates, materialId);
  for (const fallbackMat of ITEM_SPRITE_MATERIAL_FALLBACK) pushUniqueSpriteCandidate(materialCandidates, fallbackMat);
  for (const mat of materialCandidates) {
    for (const fam of familyCandidates) pushUniqueSpriteCandidate(out, weaponType(mat, fam));
  }
  return out;
}
function spriteCandidatesForArmorType(type) {
  const out = [];
  const parsed = parseArmorTypeParts(type);
  if (!parsed?.slot) return out;
  const slot = parsed.slot;
  const family = normalizeArmorFamilyId(parsed.family ?? "");
  pushUniqueSpriteCandidate(out, `armor_${parsed.material}_${slot}`);
  if (family === "leather") pushUniqueSpriteCandidate(out, `armor_leather_${slot}`);
  const materialCandidates = [];
  pushUniqueSpriteCandidate(materialCandidates, parsed.material);
  for (const fallbackMat of ITEM_SPRITE_MATERIAL_FALLBACK) pushUniqueSpriteCandidate(materialCandidates, fallbackMat);
  for (const mat of materialCandidates) pushUniqueSpriteCandidate(out, `armor_${mat}_${slot}`);
  pushUniqueSpriteCandidate(out, `armor_bronze_${slot}`);
  return out;
}
function itemSpriteCandidates(type) {
  const out = [];
  const rawType = String(type ?? "").trim();
  if (!rawType) return out;
  const normalizedType = normalizeItemType(rawType);
  pushUniqueSpriteCandidate(out, rawType);
  pushUniqueSpriteCandidate(out, normalizedType);
  if (normalizedType.startsWith("weapon_")) {
    for (const candidate of spriteCandidatesForWeaponType(normalizedType)) pushUniqueSpriteCandidate(out, candidate);
  } else if (normalizedType.startsWith("armor_")) {
    for (const candidate of spriteCandidatesForArmorType(normalizedType)) pushUniqueSpriteCandidate(out, candidate);
  }
  return out;
}
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
    const lockSpriteCandidates = isLocked ? (CHEST_LOCK_SPRITE_BY_KEY[keyType] ?? null) : null;
    const lockSprite = Array.isArray(lockSpriteCandidates)
      ? firstAvailableSpriteId(...lockSpriteCandidates)
      : null;
    if (lockSprite) return lockSprite;
  }
  for (const spriteId of itemSpriteCandidates(type)) {
    if (!spriteId || !SPRITE_SOURCES[spriteId]) continue;
    return spriteId;
  }
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
    const playerSize = scaledSpriteSize(PLAYER_SPRITE_SIZE, playerCharacterSpriteId(state));
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

function computePlacedSpriteMetrics({
  img,
  spriteId,
  baseTile,
  centerX,
  footY,
  bobPx = 0,
  inCombat = false,
  adjacentCount = 0,
} = {}) {
  if (!img) return null;
  const tile = Math.max(1, Math.floor(Number(baseTile) || TILE));
  const profile = spriteProfileForId(spriteId);
  const bounds = ensureSpriteBounds(spriteBoundsCache, spriteId || "__anon__", img, profile);
  const metrics = computeSpriteDrawMetrics({
    img,
    baseTile: tile,
    profile,
    inCombat,
    adjacentCount,
    bounds,
  });
  const anchorX = Math.round(Number(centerX) || 0) + Math.round(Number(metrics.centerXOffset ?? 0));
  const anchorFootY = Math.round((Number(footY) || 0) + (Number(bobPx) || 0)) + Math.round(Number(metrics.footYOffset ?? 0));
  const drawX = Math.round(anchorX - metrics.drawWidth / 2);
  const drawY = Math.round(anchorFootY - metrics.drawHeight);
  const visibleTopY = Math.round(drawY + Math.max(0, metrics.drawHeight - metrics.visibleDrawHeight));
  return {
    profile,
    bounds,
    metrics,
    centerX: anchorX,
    footY: anchorFootY,
    drawX,
    drawY,
    visibleTopY,
    visibleCenterY: Math.round(visibleTopY + metrics.visibleDrawHeight / 2),
  };
}

function drawSpritePlacement(ctx2d, img, placement) {
  if (!ctx2d || !img || !placement) return;
  ctx2d.drawImage(img, placement.drawX, placement.drawY, placement.metrics.drawWidth, placement.metrics.drawHeight);
}

function drawSpritePlacementShadow(ctx2d, placement, alpha = 0.36, liftPct = 0.06) {
  if (!ctx2d || !placement) return;
  drawFootShadow(
    ctx2d,
    placement.centerX,
    placement.footY - Math.round(TILE * Math.max(0, Number(liftPct) || 0)),
    placement.metrics.shadowWidth,
    placement.metrics.shadowHeight,
    alpha
  );
}

function monsterIntentBadgeSpec(intent, targetsPlayer = false) {
  const type = String(intent?.type ?? "").trim().toLowerCase();
  if (type === "bombard") return { label: "*", color: targetsPlayer ? "#ff5b5b" : "#ff9f66" };
  if (type === "charged_shot") return { label: "!", color: targetsPlayer ? "#ff5f5f" : "#ffd166" };
  return { label: "!", color: targetsPlayer ? "#ff5f5f" : "#ff8b66" };
}

function collectVisibleMonsterIntentTelegraphs(state) {
  if (!FEATURE_FLAGS.monsterIntentTelegraphs) return [];
  const player = state?.player;
  if (!player || player.dead) return [];
  const out = [];
  for (const ent of state.entities.values()) {
    if (!ent || ent.kind !== "monster" || ent.z !== player.z) continue;
    const intent = (ent.intent && typeof ent.intent === "object") ? ent.intent : null;
    if (!intent || intent.visible === false) continue;
    if (!state.visible.has(keyXY(ent.x, ent.y))) continue;
    const targetX = Number.isFinite(Number(intent.targetX)) ? Math.floor(Number(intent.targetX)) : ent.x;
    const targetY = Number.isFinite(Number(intent.targetY)) ? Math.floor(Number(intent.targetY)) : ent.y;
    const targetsPlayer = targetX === player.x && targetY === player.y;
    out.push({
      monsterId: ent.id,
      monsterX: ent.x,
      monsterY: ent.y,
      targetX,
      targetY,
      type: String(intent.type ?? "line_shot"),
      executeOnTurn: Math.max(0, Math.floor(Number(intent.executeOnTurn ?? 0) || 0)),
      targetsPlayer,
      ...monsterIntentBadgeSpec(intent, targetsPlayer),
    });
  }
  return out;
}

function worldToScreenCellCenter(player, wx, wy) {
  const sx = wx - player.x + viewRadiusX;
  const sy = wy - player.y + viewRadiusY;
  return {
    sx,
    sy,
    cx: sx * TILE + TILE / 2,
    cy: sy * TILE + TILE / 2,
  };
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
  const template = itemTemplateForType(type);
  if (template?.materialTierId && MATERIAL_BY_ID[template.materialTierId]) return template.materialTierId;
  if (type.startsWith("weapon_")) {
    const body = String(type).slice("weapon_".length);
    const mats = [...WEAPON_MATERIALS].sort((a, b) => b.length - a.length);
    for (const mat of mats) {
      const prefix = `${mat}_`;
      if (body.startsWith(prefix)) return mat;
    }
    return null;
  }
  if (type.startsWith("armor_")) {
    return parseArmorTypeParts(type)?.material ?? null;
  }
  return null;
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
  if (type === "slime_yellow") return { g: "s", c: "#ffd966" };
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
  head: "Head",
  chest: "Chest",
  legs: "Legs",
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
  if (!payload || typeof payload !== "object") return { overrides: {}, scales: {}, profiles: {}, entries: [] };
  const overrides = normalizeSpriteOverrideMap(payload.overrides ?? {});
  const scales = normalizeSpriteScaleMap(payload.scales ?? {});
  const profiles = normalizeSpriteProfiles(payload.profiles ?? {}, scales);
  const entries = Array.isArray(payload.entries) ? payload.entries.slice() : [];
  return { overrides, scales, profiles, entries };
}

function applySpritePayload(payload) {
  const normalized = normalizeSpriteResponsePayload(payload);
  spriteOverrideState.overrides = normalized.overrides;
  spriteOverrideState.scales = normalized.scales;
  spriteOverrideState.profiles = normalized.profiles;
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
  const speciesId = state?.player?.speciesId ?? profile?.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID;
  const classId = state?.player?.classId ?? profile?.classId ?? DEFAULT_CHARACTER_CLASS_ID;
  const species = characterSpeciesDef(speciesId);
  const klass = characterClassDef(classId);
  const levelUpSpriteDisplay = resolveCharacterSpriteDisplay(speciesId, classId);
  const levelUpSpriteVisual = levelUpSpriteDisplay.src
    ? `<img class="levelUpLargeSprite" src="${levelUpSpriteDisplay.src}" alt="${escapeHtmlText(species.name)} ${escapeHtmlText(klass.name)} sprite" />`
    : `<div class="levelUpLargeSpriteFallback">@</div>`;
  const unspent = Math.max(0, Math.floor(profile?.unspentStatPoints ?? 0));
  const drafted = levelUpDraftSpentTotal();
  const remaining = Math.max(0, unspent - drafted);

  levelUpStatsListEl.innerHTML =
    `<div class="levelUpSpriteCard">` +
    `<div class="levelUpSpriteVisual">${levelUpSpriteVisual}</div>` +
    `<div class="levelUpSpriteMeta">` +
    `<div class="levelUpSpriteTitle">${escapeHtmlText(profile?.name ?? DEFAULT_CHARACTER_NAME)}</div>` +
    `<div class="levelUpSpriteSub">${escapeHtmlText(species.name)} • ${escapeHtmlText(klass.name)}</div>` +
    `<div class="levelUpSpriteHint">Assign points to shape this character's growth.</div>` +
    `</div>` +
    `</div>` +
    CHARACTER_STAT_KEYS.map((key) => {
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

function itemAuthorityEnabledForState(state) {
  if (!isAuthenticatedUser) return false;
  if (isAuthoritativeModeEnabled()) return false;
  if (!state || typeof state !== "object") return false;
  const profile = ensureCharacterState(state);
  const characterId = normalizeCharacterProfileId(profile?.id ?? "");
  return !!characterId;
}

function itemAuthorityCharacterIdForState(state) {
  const profile = ensureCharacterState(state);
  return normalizeCharacterProfileId(profile?.id ?? "");
}

function resetItemAuthorityRuntime(characterId = "") {
  itemAuthorityRuntime.ready = false;
  itemAuthorityRuntime.loading = false;
  itemAuthorityRuntime.processing = false;
  itemAuthorityRuntime.characterId = characterId || "";
  itemAuthorityRuntime.revision = 0;
  itemAuthorityRuntime.queue = [];
  itemAuthorityRuntime.baselineAt = 0;
  itemAuthorityRuntime.lastSnapshotMap = null;
  itemAuthorityRuntime.lastError = "";
}

function itemAuthorityRecordSignature(rec) {
  if (!rec || typeof rec !== "object") return "";
  return [
    String(rec.instance_id ?? ""),
    String(rec.type ?? ""),
    String(rec.template_id ?? ""),
    Math.max(1, Math.floor(Number(rec.amount ?? 1) || 1)),
    String(rec.owner_type ?? ""),
    String(rec.owner_id ?? ""),
    String(rec.slot ?? ""),
    Number.isFinite(rec.x) ? Math.floor(rec.x) : "",
    Number.isFinite(rec.y) ? Math.floor(rec.y) : "",
    Number.isFinite(rec.z) ? Math.floor(rec.z) : "",
  ].join("|");
}

function buildItemAuthoritySnapshotMap(state) {
  const out = new Map();
  if (!state || typeof state !== "object") return out;
  const character = ensureCharacterState(state);
  const ownerId = normalizeCharacterProfileId(character?.id ?? "");
  const addRecord = (recRaw) => {
    if (!recRaw || typeof recRaw !== "object") return;
    const instanceId = String(recRaw.instance_id ?? "").trim();
    const type = String(recRaw.type ?? "").trim();
    if (!instanceId || !type) return;
    const ownerType = String(recRaw.owner_type ?? "").trim().toLowerCase();
    if (!ownerType) return;
    const rec = {
      instance_id: instanceId,
      type,
      template_id: String(recRaw.template_id ?? "").trim(),
      amount: Math.max(1, Math.floor(Number(recRaw.amount ?? 1) || 1)),
      owner_type: ownerType,
      owner_id: String(recRaw.owner_id ?? "").trim(),
      slot: String(recRaw.slot ?? "").trim().toLowerCase(),
      x: Number.isFinite(recRaw.x) ? Math.floor(Number(recRaw.x)) : null,
      y: Number.isFinite(recRaw.y) ? Math.floor(Number(recRaw.y)) : null,
      z: Number.isFinite(recRaw.z) ? Math.floor(Number(recRaw.z)) : null,
      updated_at: String(recRaw.updated_at ?? "").trim() || new Date().toISOString(),
    };
    const prev = out.get(instanceId);
    if (prev && prev.owner_type === rec.owner_type && prev.type === rec.type && isStackable(rec.type)) {
      prev.amount = Math.max(1, Math.floor(Number(prev.amount ?? 1) || 1) + rec.amount);
      prev.updated_at = rec.updated_at;
      out.set(instanceId, prev);
      return;
    }
    out.set(instanceId, rec);
  };

  const inv = Array.isArray(state.inv) ? state.inv : [];
  for (let i = 0; i < inv.length; i++) {
    const it = inv[i];
    if (!it || typeof it !== "object") continue;
    const type = normalizeItemType(it.type, {
      speciesId: character?.speciesId,
      classId: character?.classId,
    });
    if (!type || !ITEM_TYPES[type]) continue;
    const templateId = itemTemplateIdForType(it.templateId ?? type) ?? itemTemplateIdForType(type) ?? type;
    const amount = Math.max(1, Math.floor(Number(it.amount ?? 1) || 1));
    const instanceId = isStackable(type)
      ? `stack_inv_${type}`
      : String(it.instanceId ?? "").trim() || `legacy_inv_${i}_${type}`;
    addRecord({
      instance_id: instanceId,
      type,
      template_id: templateId,
      amount,
      owner_type: "player",
      owner_id: ownerId,
      slot: "",
      updated_at: it.updatedAt ?? it.createdAt ?? "",
    });
  }

  const equip = state?.player?.equip ?? {};
  for (const slot of ["weapon", "head", "chest", "legs"]) {
    const type = normalizeItemType(equip?.[slot], {
      speciesId: character?.speciesId,
      classId: character?.classId,
    });
    if (!type || !ITEM_TYPES[type]) continue;
    const templateId = itemTemplateIdForType(type) ?? type;
    addRecord({
      instance_id: `equip_${slot}_${type}`,
      type,
      template_id: templateId,
      amount: 1,
      owner_type: "equip",
      owner_id: ownerId,
      slot,
      updated_at: new Date().toISOString(),
    });
  }

  const dynamicEntries = state?.dynamic instanceof Map
    ? Array.from(state.dynamic.values())
    : [];
  for (const ent of dynamicEntries) {
    if (!ent || ent.kind !== "item") continue;
    const type = normalizeItemType(ent.type);
    if (!type || !ITEM_TYPES[type]) continue;
    if (type === "shopkeeper" || type === "shrine") continue;
    const templateId = itemTemplateIdForType(ent.templateId ?? type) ?? itemTemplateIdForType(type) ?? type;
    const instanceId = String(ent.instanceId ?? "").trim() || String(ent.id ?? "").trim();
    if (!instanceId) continue;
    addRecord({
      instance_id: instanceId,
      type,
      template_id: templateId,
      amount: Math.max(1, Math.floor(Number(ent.amount ?? 1) || 1)),
      owner_type: String(ent.ownerType ?? "world").trim().toLowerCase() || "world",
      owner_id: ent.ownerId === null || ent.ownerId === undefined ? "" : String(ent.ownerId),
      slot: "",
      x: Number(ent.x),
      y: Number(ent.y),
      z: Number(ent.z),
      updated_at: ent.updatedAt ?? ent.createdAt ?? "",
    });
  }

  return out;
}

function diffItemAuthoritySnapshotMaps(beforeMap, afterMap) {
  const before = beforeMap instanceof Map ? beforeMap : new Map();
  const after = afterMap instanceof Map ? afterMap : new Map();
  const remove = [];
  const upsert = [];
  let hasMint = false;

  for (const [instanceId] of before.entries()) {
    if (after.has(instanceId)) continue;
    remove.push(instanceId);
  }
  for (const [instanceId, rec] of after.entries()) {
    const prev = before.get(instanceId);
    if (!prev) {
      hasMint = true;
      upsert.push(rec);
      continue;
    }
    if (itemAuthorityRecordSignature(prev) !== itemAuthorityRecordSignature(rec)) upsert.push(rec);
  }
  return {
    remove,
    upsert,
    hasChanges: remove.length > 0 || upsert.length > 0,
    hasMint,
  };
}

async function ensureItemAuthoritySession(state) {
  if (!itemAuthorityEnabledForState(state)) return false;
  const characterId = itemAuthorityCharacterIdForState(state);
  if (!characterId) return false;
  if (itemAuthorityRuntime.characterId && itemAuthorityRuntime.characterId !== characterId) {
    resetItemAuthorityRuntime(characterId);
  } else if (!itemAuthorityRuntime.characterId) {
    itemAuthorityRuntime.characterId = characterId;
  }
  if (itemAuthorityRuntime.ready && itemAuthorityRuntime.characterId === characterId) return true;
  if (itemAuthorityRuntime.loading) return false;

  itemAuthorityRuntime.loading = true;
  try {
    let currentRevision = 0;
    try {
      const data = await saveApiRequest("GET", null, `item_character=${encodeURIComponent(characterId)}`);
      currentRevision = Math.max(0, Math.floor(Number(data?.item_state?.revision ?? 0) || 0));
    } catch (err) {
      const statusCode = Number(err?.response?.status_code ?? 0);
      const errorText = String(err?.message ?? err?.response?.error ?? "");
      const looksMissing = statusCode === 404 || /not found/i.test(errorText);
      if (!looksMissing) throw err;
      currentRevision = 0;
    }

    const localSnapshot = buildItemAuthoritySnapshotMap(state);
    const items = Array.from(localSnapshot.values()).sort((a, b) => String(a.instance_id).localeCompare(String(b.instance_id)));
    const profile = ensureCharacterState(state);
    const replace = await saveApiRequest("POST", {
      action: "item_state_replace",
      character_id: characterId,
      name: profile?.name ?? "Adventurer",
      expected_revision: currentRevision,
      items,
    });
    itemAuthorityRuntime.characterId = characterId;
    itemAuthorityRuntime.revision = Math.max(0, Math.floor(Number(replace?.item_state?.revision ?? (currentRevision + 1)) || (currentRevision + 1)));
    itemAuthorityRuntime.baselineAt = Date.now();
    itemAuthorityRuntime.lastSnapshotMap = localSnapshot;
    itemAuthorityRuntime.lastSyncAt = itemAuthorityRuntime.baselineAt;
    itemAuthorityRuntime.ready = true;
    itemAuthorityRuntime.lastError = "";
    return true;
  } catch (err) {
    itemAuthorityRuntime.lastError = String(err?.message ?? "item-authority-bootstrap-failed");
    return false;
  } finally {
    itemAuthorityRuntime.loading = false;
  }
}

async function processItemAuthorityMutationQueue(state) {
  if (!itemAuthorityEnabledForState(state)) return;
  if (itemAuthorityRuntime.processing) return;
  itemAuthorityRuntime.processing = true;
  try {
    while (itemAuthorityRuntime.queue.length > 0) {
      const job = itemAuthorityRuntime.queue[0];
      if (!job || typeof job !== "object") {
        itemAuthorityRuntime.queue.shift();
        continue;
      }
      if (Number.isFinite(itemAuthorityRuntime.baselineAt) && (Number(job.createdAt ?? 0) || 0) <= itemAuthorityRuntime.baselineAt) {
        itemAuthorityRuntime.queue.shift();
        continue;
      }
      const ready = await ensureItemAuthoritySession(state);
      if (!ready) break;
      if (job.characterId !== itemAuthorityRuntime.characterId) {
        itemAuthorityRuntime.queue.shift();
        continue;
      }
      try {
        const data = await saveApiRequest("POST", {
          action: "item_mutate",
          character_id: job.characterId,
          expected_revision: itemAuthorityRuntime.revision,
          mutation: {
            op: job.op || "state_sync",
            remove: job.remove ?? [],
            upsert: job.upsert ?? [],
          },
        });
        itemAuthorityRuntime.revision = Math.max(
          itemAuthorityRuntime.revision + 1,
          Math.floor(Number(data?.item_state?.revision ?? (itemAuthorityRuntime.revision + 1)) || (itemAuthorityRuntime.revision + 1))
        );
        itemAuthorityRuntime.lastSnapshotMap = job.afterMap instanceof Map ? job.afterMap : buildItemAuthoritySnapshotMap(state);
        itemAuthorityRuntime.lastSyncAt = Date.now();
        itemAuthorityRuntime.lastError = "";
        itemAuthorityRuntime.queue.shift();
      } catch (err) {
        const code = String(err?.response?.code ?? "");
        const curRev = Number(err?.response?.current_revision ?? NaN);
        if (code === "ITEM_STATE_REVISION_CONFLICT" && Number.isFinite(curRev)) {
          itemAuthorityRuntime.ready = false;
          itemAuthorityRuntime.revision = Math.max(0, Math.floor(curRev));
          continue;
        }
        if (code === "ITEM_STATE_MISSING_ITEM") {
          itemAuthorityRuntime.ready = false;
          if (Number.isFinite(curRev)) itemAuthorityRuntime.revision = Math.max(0, Math.floor(curRev));
          continue;
        }
        itemAuthorityRuntime.lastError = String(err?.message ?? "item-mutation-failed");
        pushLog(state, `Item authority sync failed: ${itemAuthorityRuntime.lastError}`);
        break;
      }
    }
  } finally {
    itemAuthorityRuntime.processing = false;
  }
}

function queueItemAuthorityMutationFromDiff(state, op, beforeMap, afterMap) {
  if (!itemAuthorityEnabledForState(state)) return;
  const characterId = itemAuthorityCharacterIdForState(state);
  if (!characterId) return;
  if (itemAuthorityRuntime.characterId && itemAuthorityRuntime.characterId !== characterId) {
    resetItemAuthorityRuntime(characterId);
  } else if (!itemAuthorityRuntime.characterId) {
    itemAuthorityRuntime.characterId = characterId;
  }
  const diff = diffItemAuthoritySnapshotMaps(beforeMap, afterMap);
  if (!diff.hasChanges) return;
  const requestedOp = String(op || "state_sync");
  const mintCapableOps = new Set(["system_spawn", "inventory_add", "item_state_replace", "resync"]);
  const resolvedOp = diff.hasMint && !mintCapableOps.has(requestedOp)
    ? "inventory_add"
    : requestedOp;
  itemAuthorityRuntime.queue.push({
    characterId,
    op: resolvedOp,
    remove: diff.remove,
    upsert: diff.upsert,
    afterMap,
    createdAt: Date.now(),
  });
  void processItemAuthorityMutationQueue(state);
}

function recordItemAuthorityMutation(state, op, mutator) {
  if (!itemAuthorityEnabledForState(state) || typeof mutator !== "function") return mutator();
  const beforeMap = buildItemAuthoritySnapshotMap(state);
  const out = mutator();
  const afterMap = buildItemAuthoritySnapshotMap(state);
  queueItemAuthorityMutationFromDiff(state, op, beforeMap, afterMap);
  return out;
}

function itemAuthorityOpForReason(reason = "") {
  const tag = String(reason ?? "").trim().toLowerCase();
  if (!tag) return "state_sync";
  if (tag.includes("equip")) return "equip";
  if (tag.includes("drop")) return "drop";
  if (tag.includes("shop")) return "shop";
  if (tag.includes("use-potion")) return "consume";
  if (tag.includes("pickup")) return "pickup";
  if (tag.includes("turn")) return "state_sync";
  return "state_sync";
}

function syncItemAuthorityFromStateIfChanged(state, reason = "") {
  if (!itemAuthorityEnabledForState(state)) return;
  const characterId = itemAuthorityCharacterIdForState(state);
  if (itemAuthorityRuntime.characterId && itemAuthorityRuntime.characterId !== characterId) {
    resetItemAuthorityRuntime(characterId);
  } else if (!itemAuthorityRuntime.characterId) {
    itemAuthorityRuntime.characterId = characterId;
  }
  const nextMap = buildItemAuthoritySnapshotMap(state);
  const prevMap = itemAuthorityRuntime.lastSnapshotMap;
  if (!(prevMap instanceof Map)) {
    itemAuthorityRuntime.lastSnapshotMap = nextMap;
    void ensureItemAuthoritySession(state);
    return;
  }
  queueItemAuthorityMutationFromDiff(state, itemAuthorityOpForReason(reason), prevMap, nextMap);
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
  if (!!ITEM_TYPES[objectId] || !!MONSTER_TYPES[objectId]) return true;
  return entry?.category === "actor";
}

function spawnSpriteEditorObject(state, entry) {
  if (!canUseAdminControls()) return false;
  if (!state || !entry) return false;
  const objectId = String(entry.objectId ?? "");
  const display = resolveSpriteDisplayForEntry(entry);
  const actorSpriteId = display.spriteId || entry.spriteId || "hero";
  const key = ITEM_TYPES[objectId]
    ? `item:${objectId}`
    : (MONSTER_TYPES[objectId] ? `monster:${objectId}` : (entry?.category === "actor" ? `actor:${actorSpriteId}` : ""));
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
  const canSimulateLocally = canMutateGameplayStateLocally();
  if (canSimulateLocally) {
    touchCharacterProgress(state);
    updateAreaRespawnSystem(state, nowMs);
    applyOutOfCombatRegen(state, nowMs);
  } else {
    updateViewportMetrics();
  }
  computeVisibility(state);
  hydrateNearby(state);
  const shopRestocked = canSimulateLocally ? refreshShopStock(state, false) : false;
  syncMobileUi();

  const { world, player, seen, visible } = state;
  const { monsters, items, traps, actors } = getCachedOccupancy(state);
  const occupancy = { monsters, items, traps, actors };
  updateContextActionButton(state, occupancy);
  const primaryAction = resolveContextAction(state, occupancy);
  const abilityAction = activeAbilityAction(state, occupancy);
  const highlightedMonsterIds = new Set();
  if (primaryAction?.type === "attack" && primaryAction.targetMonsterId) highlightedMonsterIds.add(primaryAction.targetMonsterId);
  if (abilityAction?.type === "active-ability" && abilityAction.targetMonsterId) highlightedMonsterIds.add(abilityAction.targetMonsterId);
  const visibleIntentTelegraphs = collectVisibleMonsterIntentTelegraphs(state);
  const visibleIntentTelegraphByMonsterId = new Map(visibleIntentTelegraphs.map((entry) => [entry.monsterId, entry]));
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
            const trapStyle = trapRevealStyle(trapEnt);
            const trapColor = trapEnt?.armed
              ? trapStyle.color
              : (trapEnt?.triggered ? "#ff6f6f" : "#a7bfd8");
            deferredWorldObjects.push({
              kind: "glyph",
              sortY: wy,
              sortX: wx,
              order: -0.08,
              sx,
              sy,
              glyph: trapStyle.glyph,
              color: trapColor,
            });
          }
        }
      }

      if (isVisible || !fogEnabled) {
        const mk = monsters.get(occKey);
        const ik = items.get(occKey);
        const ak = actors.get(occKey);

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
              entityId: ent?.id ?? "",
              wx,
              wy,
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
        if (ak) {
          const ent = state.entities.get(ak);
          const actorSpriteIdValue = (ent?.spriteId && SPRITE_SOURCES[ent.spriteId]) ? ent.spriteId : (SPRITE_SOURCES.hero ? "hero" : "");
          const actorSprite = actorSpriteIdValue ? getSpriteIfReady(actorSpriteIdValue) : null;
          if (actorSprite) {
            deferredWorldObjects.push({
              kind: "actor-sprite",
              sortY: wy,
              sortX: wx,
              order: 1.5,
              sx,
              sy,
              img: actorSprite,
              spriteId: actorSpriteIdValue,
              entityId: ent?.id ?? "",
              wx,
              wy,
            });
          } else {
            deferredWorldObjects.push({
              kind: "glyph",
              sortY: wy,
              sortX: wx,
              order: 1.5,
              sx,
              sy,
              glyph: "@",
              color: "#d6ebff",
            });
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
      entityId: "__player__",
      wx: player.x,
      wy: player.y,
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
      entityId: "__player__",
      wx: player.x,
      wy: player.y,
    });
  }

  const combatClusterMap = FEATURE_FLAGS.spriteFootprints
    ? buildCombatAdjacencyClusters(
        deferredWorldObjects
          .filter((obj) =>
            (obj.kind === "monster-sprite" || obj.kind === "actor-sprite" || obj.kind === "hero-sprite" || obj.kind === "hero-fallback") &&
            typeof obj.entityId === "string" &&
            obj.entityId
          )
          .map((obj) => ({
            id: obj.entityId,
            x: Math.floor(Number(obj.wx ?? obj.sortX ?? 0)),
            y: Math.floor(Number(obj.wy ?? obj.sortY ?? 0)),
          }))
      )
    : new Map();

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
  for (const telegraph of visibleIntentTelegraphs) {
    const from = worldToScreenCellCenter(player, telegraph.monsterX, telegraph.monsterY);
    const to = worldToScreenCellCenter(player, telegraph.targetX, telegraph.targetY);
    if (from.sx < -1 || from.sy < -1 || from.sx > viewTilesX + 1 || from.sy > viewTilesY + 1) continue;
    if (to.sx < -1 || to.sy < -1 || to.sx > viewTilesX + 1 || to.sy > viewTilesY + 1) continue;
    drawLineTelegraph(ctx, from.cx, from.cy, to.cx, to.cy, {
      color: telegraph.color,
      lineWidth: telegraph.targetsPlayer ? 8 : 6,
      alpha: telegraph.targetsPlayer ? 0.42 : 0.26,
    });
    drawCellHighlight(ctx, to.cx, to.cy, TILE * 0.72, telegraph.color, telegraph.targetsPlayer ? 0.28 : 0.16);
  }
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
      const clusterMeta = combatClusterMap.get(obj.entityId) ?? null;
      const profile = spriteProfileForId(obj.spriteId);
      const combatOffset = getSpriteCombatOffset(obj, clusterMeta, profile);
      const cx = obj.sx * TILE + TILE / 2 + Math.round(TILE * (combatOffset.xPct / 100));
      const footY = (obj.sy + 1) * TILE + Math.round(TILE * (combatOffset.yPct / 100));
      const bob = Math.sin(timeSec * 2 + (obj.sortX + obj.sortY) * 0.65) * TILE * 0.008;
      const placement = computePlacedSpriteMetrics({
        img: obj.img,
        spriteId: obj.spriteId,
        baseTile: MONSTER_SPRITE_SIZE,
        centerX: cx,
        footY,
        bobPx: bob,
        inCombat: (clusterMeta?.adjacentCount ?? 0) > 0,
        adjacentCount: clusterMeta?.adjacentCount ?? 0,
      });
      if (!placement) continue;
      drawSoftGlow(ctx, placement.centerX, placement.visibleCenterY, MONSTER_GLOW_RADIUS, "rgba(255,120,90,0.20)", "rgba(255,120,90,0)");
      drawSpritePlacementShadow(ctx, placement, 0.36, 0.055);
      drawSpritePlacement(ctx, obj.img, placement);
      if (highlightedMonsterIds.has(obj.entityId)) {
        drawTargetRing(ctx, placement.centerX, placement.footY - Math.round(TILE * 0.06), Math.max(12, Math.round(placement.metrics.shadowWidth * 0.58)), "#ffd166");
      }
      const intentOverlay = visibleIntentTelegraphByMonsterId.get(obj.entityId);
      if (intentOverlay) {
        drawIntentBadge(ctx, placement.centerX, placement.visibleTopY - 12, intentOverlay.label, intentOverlay.color);
      }
      continue;
    }
    if (obj.kind === "actor-sprite") {
      const clusterMeta = combatClusterMap.get(obj.entityId) ?? null;
      const profile = spriteProfileForId(obj.spriteId);
      const combatOffset = getSpriteCombatOffset(obj, clusterMeta, profile);
      const cx = obj.sx * TILE + TILE / 2 + Math.round(TILE * (combatOffset.xPct / 100));
      const footY = (obj.sy + 1) * TILE + Math.round(TILE * (combatOffset.yPct / 100));
      const bob = Math.sin(timeSec * 1.7 + (obj.sortX + obj.sortY) * 0.45) * TILE * 0.005;
      const placement = computePlacedSpriteMetrics({
        img: obj.img,
        spriteId: obj.spriteId,
        baseTile: PLAYER_SPRITE_SIZE,
        centerX: cx,
        footY,
        bobPx: bob,
        inCombat: (clusterMeta?.adjacentCount ?? 0) > 0,
        adjacentCount: clusterMeta?.adjacentCount ?? 0,
      });
      if (!placement) continue;
      drawSoftGlow(ctx, placement.centerX, placement.visibleCenterY, HERO_GLOW_RADIUS * 0.72, "rgba(120,220,255,0.14)", "rgba(120,220,255,0)");
      drawSpritePlacementShadow(ctx, placement, 0.3, 0.055);
      drawSpritePlacement(ctx, obj.img, placement);
      continue;
    }
    if (obj.kind === "hero-sprite") {
      const clusterMeta = combatClusterMap.get(obj.entityId) ?? null;
      const profile = spriteProfileForId(obj.spriteId);
      const combatOffset = getSpriteCombatOffset(obj, clusterMeta, profile);
      const cx = obj.sx * TILE + TILE / 2 + Math.round(TILE * (combatOffset.xPct / 100));
      const footY = (obj.sy + 1) * TILE + Math.round(TILE * (combatOffset.yPct / 100));
      const bob = Math.sin(timeSec * 2.4) * TILE * 0.01;
      const placement = computePlacedSpriteMetrics({
        img: obj.img,
        spriteId: obj.spriteId,
        baseTile: PLAYER_SPRITE_SIZE,
        centerX: cx,
        footY,
        bobPx: bob,
        inCombat: (clusterMeta?.adjacentCount ?? 0) > 0,
        adjacentCount: clusterMeta?.adjacentCount ?? 0,
      });
      if (!placement) continue;
      drawSpritePlacementShadow(ctx, placement, 0.44, 0.06);
      drawSoftGlow(ctx, placement.centerX, placement.visibleCenterY, HERO_GLOW_RADIUS, "rgba(120,220,255,0.24)", "rgba(120,220,255,0)");
      drawSpritePlacement(ctx, obj.img, placement);
      if (visibleIntentTelegraphs.some((telegraph) => telegraph.targetsPlayer)) {
        drawTargetRing(ctx, placement.centerX, placement.footY - Math.round(TILE * 0.06), Math.max(14, Math.round(placement.metrics.shadowWidth * 0.7)), "#ff7b6b");
      }
      continue;
    }
    if (obj.kind === "hero-fallback") {
      const cx = Number.isFinite(obj.centerX) ? obj.centerX : heroCx;
      const footY = Number.isFinite(obj.footY) ? obj.footY : ((obj.sy + 1) * TILE);
      const cy = footY - TILE * 0.5;
      const bob = Math.sin(timeSec * 2.4) * TILE * 0.01;
      drawFootShadow(ctx, cx, footY - TILE * 0.06, TILE * 0.38, TILE * 0.17, 0.44);
      drawSoftGlow(ctx, cx, cy, HERO_GLOW_RADIUS, "rgba(120,220,255,0.24)", "rgba(120,220,255,0)");
      ctx.fillStyle = "#ffffff";
      // Fallback player marker while sprite is loading.
      const prad = Math.max(3, TILE / 2 - 2);
      ctx.beginPath();
      ctx.arc(cx, footY - prad + bob, prad, 0, Math.PI * 2);
      ctx.fill();
      if (visibleIntentTelegraphs.some((telegraph) => telegraph.targetsPlayer)) {
        drawTargetRing(ctx, cx, footY - Math.round(TILE * 0.06), Math.max(14, Math.round(TILE * 0.28)), "#ff7b6b");
      }
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
  const activeAbility = playerActiveAbility(state);
  const activeAbilityState = activeAbility ? activeAbilityStatus(player, activeAbility) : null;
  const energyNow = Math.max(0, Math.floor(player.energy ?? 0));
  const energyMax = Math.max(0, Math.floor(player.energyMax ?? 0));
  const abilityMeta = !activeAbility
    ? "None"
    : (activeAbilityState?.ok
      ? `${activeAbility.label} (${activeAbilityCostForPlayer(player, activeAbility)})`
      : `${activeAbility.label} (${activeAbilityState?.reason ?? "Locked"})`);
  metaEl.innerHTML =
    `<div class="meta-row"><div class="meta-col"><span class="label">XP</span><span class="val xp">${player.xp}/${xpToNext(player.level)}</span></div><div class="meta-col"><span class="label">Gold</span><span class="val gold">${player.gold}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">ATK</span><span class="val atk">${Math.max(1, player.atkLo + player.atkBonus)}-${Math.max(1, player.atkHi + player.atkBonus)}</span></div><div class="meta-col"><span class="label">DEF</span><span class="val def">+${player.defBonus}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">ACC</span><span class="val atk">${player.acc ?? 0}</span></div><div class="meta-col"><span class="label">EVA</span><span class="val def">${player.eva ?? 0}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">PTS</span><span class="val gold">${characterUnspentStatPoints(state)}</span></div><div class="meta-col"><span class="label">SPD</span><span class="val def">${(player.spd ?? 1).toFixed(2)}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">EN</span><span class="val atk">${energyNow}/${energyMax}</span></div><div class="meta-col"><span class="label">Q</span><span class="val gold">${escapeHtmlText(abilityMeta)}</span></div></div>`;
  if (vitalsDisplayEl) {
    vitalsDisplayEl.innerHTML =
      `<span class="lbl">HP</span><span class="hp">${player.hp}/${player.maxHp}</span>` +
      `<span class="sep">|</span>` +
      `<span class="lbl">LVL</span><span class="lvl">${player.level}</span>` +
      `<span class="sep">|</span>` +
      `<span class="lbl">EN</span><span class="lvl">${energyNow}/${energyMax}</span>`;
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
  if (isGuestNewCharacterOverlayOpen()) return;
  if (isGuestLoginImportOverlayOpen()) return;
  if (isCharacterSwitchConfirmOpen()) return;
  if (isLevelUpOverlayOpen()) return;
  if (isCharacterOverlayOpen()) return;
  if (didSpendTurn && typeof didSpendTurn.then === "function") {
    void didSpendTurn.catch(() => {});
    return;
  }
  if (!didSpendTurn) return;
  const analytics = ensureAnalyticsState(state);
  const actionKind = String(state.lastPlayerActionKind ?? "turn");
  markAnalyticsInput(analytics, Date.now());
  state.turn += 1;
  advanceAnalyticsTurn(analytics, state.player.z, Date.now());
  if ((state.player.abilityCd ?? 0) > 0) state.player.abilityCd = Math.max(0, Math.floor(state.player.abilityCd ?? 0) - 1);
  maybeGrantExplorationXP(state);
  processPlayerTrapInteractions(state);
  if (state.player.dead) {
    renderInventory(state);
    renderEquipment(state);
    renderEffects(state);
    markSaveDirty(state, "turn");
    state.lastPlayerActionKind = "";
    void flushAnalyticsIfNeeded(state, actionKind, true);
    return;
  }

  applyEffectsAfterPlayerAction(state);
  monstersTurn(state);
  const energyGain = Math.max(8, Math.round((state.player.energyMax ?? 0) * (actionKind === "wait" ? 0.12 : 0.05)));
  restorePlayerEnergy(state, energyGain);

  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  markSaveDirty(state, "turn");
  state.lastPlayerActionKind = "";
  void flushAnalyticsIfNeeded(state, actionKind);
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
  if (isGuestNewCharacterOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") resolveGuestNewCharacterChoice(false);
    return;
  }
  if (isGuestLoginImportOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") resolveGuestLoginImportChoice(false);
    return;
  }
  if (isCharacterSwitchConfirmOpen()) {
    e.preventDefault();
    if (k === "escape") resolveCharacterSwitchConfirm(false);
    return;
  }
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
  if (isAuthoritativeSessionActive() && authoritativeMirror.inFlight) {
    e.preventDefault();
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
  else if (k === "q") {
    e.preventDefault();
    const action = activeAbilityAction(state);
    if (action && !action.disabled) takeTurn(state, action.run());
  }
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
      next.trapFamily = trapFamilyDef(ent.trapFamily ?? ent.trapType ?? "pressure_plate")?.id ?? "pressure_plate";
      next.armed = !!ent.armed;
      next.detected = !!ent.detected;
      next.triggered = !!ent.triggered;
      next.disarmed = !!ent.disarmed;
      next.depth = Math.max(0, Math.floor(ent.depth ?? ent.z ?? 0));
      next.charges = Math.max(1, Math.floor(ent.charges ?? 1));
      next.factionId = String(ent.factionId ?? "").trim().toLowerCase();
      next.payload = (ent.payload && typeof ent.payload === "object") ? { ...ent.payload } : {};
      next.friendlyTo = String(ent.friendlyTo ?? "").trim().toLowerCase();
      next.ownerId = ent.ownerId ?? "";
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
    v: 10,
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
    combat: {
      lastEventMs: Number.isFinite(state?.combat?.lastEventMs) ? Math.max(0, Math.floor(state.combat.lastEventMs)) : 0,
      regenAnchorMs: Number.isFinite(state?.combat?.regenAnchorMs) ? Math.max(0, Math.floor(state.combat.regenAnchorMs)) : 0,
      hudTargets: normalizeCombatHudTargets(state?.combat?.hudTargets ?? {}),
    },
    analytics: analyticsSnapshotForSave(state.analytics),
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function normalizeInventoryEntries(items, options = null) {
  const out = [];
  for (const raw of items ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const type = normalizeItemType(raw.type, options);
    if (!ITEM_TYPES[type]) continue;
    const amount = Math.max(1, Math.floor(raw.amount ?? 1));
    const templateId = itemTemplateIdForType(raw.templateId ?? type) ?? itemTemplateIdForType(type) ?? type;
    if (isStackable(type)) {
      out.push({ type, amount, templateId });
      continue;
    }
    const explicitInstanceId = typeof raw.instanceId === "string" ? raw.instanceId.trim() : "";
    const explicitInstanceIds = Array.isArray(raw.instanceIds)
      ? raw.instanceIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];
    for (let i = 0; i < amount; i++) {
      const chosenInstanceId = explicitInstanceIds[i] || (i === 0 ? explicitInstanceId : "");
      out.push({
        type,
        amount: 1,
        templateId,
        instanceId: chosenInstanceId || createItemInstance(type, "player", options?.ownerId ?? null).id,
      });
    }
  }
  return out;
}

function normalizeCombatHudTargets(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [idRaw, expiresRaw] of Object.entries(raw)) {
    const id = String(idRaw ?? "").trim();
    if (!id) continue;
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt)) continue;
    out[id] = expiresAt;
  }
  return out;
}

function normalizeDynamicEntries(items, options = null) {
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
    if (kind === "trap") {
      const x = Math.floor(Number(raw.x));
      const y = Math.floor(Number(raw.y));
      const z = Math.floor(Number(raw.z));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const trapId = trapFamilyDef(raw.trapFamily ?? raw.trapType ?? "pressure_plate")?.id ?? "pressure_plate";
      const payload = (raw.payload && typeof raw.payload === "object") ? { ...raw.payload } : {};
      out.push({
        ...raw,
        kind: "trap",
        trapType: trapId,
        trapFamily: trapId,
        x,
        y,
        z,
        depth: Math.max(0, Math.floor(Number(raw.depth ?? z))),
        armed: raw.armed !== false,
        detected: !!raw.detected,
        triggered: !!raw.triggered,
        disarmed: !!raw.disarmed,
        charges: Math.max(1, Math.floor(Number(raw.charges ?? 1))),
        factionId: String(raw.factionId ?? "").trim().toLowerCase(),
        payload,
        friendlyTo: String(raw.friendlyTo ?? "").trim().toLowerCase(),
        ownerId: raw.ownerId === null || raw.ownerId === undefined ? "" : String(raw.ownerId),
      });
      continue;
    }
    if (kind === "actor") {
      const x = Math.floor(Number(raw.x));
      const y = Math.floor(Number(raw.y));
      const z = Math.floor(Number(raw.z));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const spriteIdRaw = String(raw.spriteId ?? raw.type ?? "hero").trim();
      const spriteId = (spriteIdRaw && SPRITE_SOURCES[spriteIdRaw]) ? spriteIdRaw : (SPRITE_SOURCES.hero ? "hero" : spriteIdRaw);
      if (!spriteId) continue;
      out.push({
        ...raw,
        kind: "actor",
        type: "hero_actor",
        spriteId,
        x,
        y,
        z,
        ai: "none",
      });
      continue;
    }
    const type = normalizeItemType(raw.type, options);
    if (!ITEM_TYPES[type]) continue;
    const x = Math.floor(Number(raw.x));
    const y = Math.floor(Number(raw.y));
    const z = Math.floor(Number(raw.z));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const amount = Math.max(1, Math.floor(raw.amount ?? 1));
    const templateId = itemTemplateIdForType(raw.templateId ?? type) ?? itemTemplateIdForType(type) ?? type;
    const instanceIdRaw = String(raw.instanceId ?? "").trim();
    const instanceId = instanceIdRaw || createItemInstance(type, "world", null, { x, y, z }).id;
    const ownerType = String(raw.ownerType ?? "world").trim() || "world";
    const ownerId = (raw.ownerId === null || raw.ownerId === undefined) ? null : String(raw.ownerId);
    out.push({
      ...raw,
      kind: "item",
      type,
      x,
      y,
      z,
      amount,
      templateId,
      instanceId,
      ownerType,
      ownerId,
    });
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

function normalizeEquip(equip, options = null) {
  const out = { weapon: null, head: null, chest: null, legs: null };
  const e = equip ?? {};
  const sid = normalizeCharacterSpeciesId(options?.speciesId ?? DEFAULT_CHARACTER_SPECIES_ID);
  const cid = normalizeCharacterClassId(options?.classId ?? defaultClassIdForSpecies(sid), sid);

  const weapon = normalizeItemType(e.weapon ?? null, { speciesId: sid, classId: cid });
  if (weapon && WEAPONS[weapon]) {
    const validation = equipValidationForItemType(weapon, sid, cid);
    if (validation.ok) out.weapon = weapon;
  }

  const candidates = [e.head, e.chest, e.legs, e.armor]
    .map((x) => normalizeItemType(x, { speciesId: sid, classId: cid }))
    .filter(Boolean);

  for (const type of candidates) {
    const piece = ARMOR_PIECES[type];
    if (!piece) continue;
    const validation = equipValidationForItemType(type, sid, cid);
    if (!validation.ok) continue;
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
  const sid = normalizeCharacterSpeciesId(payload?.player?.speciesId ?? payload?.character?.speciesId);
  const cid = normalizeCharacterClassId(payload?.player?.classId ?? payload?.character?.classId, sid);
  payload.player.equip = normalizeEquip(payload.player.equip ?? {}, { speciesId: sid, classId: cid });
  payload.inv = normalizeInventoryEntries(payload.inv ?? [], { speciesId: sid, classId: cid, ownerId: payload?.character?.id ?? null });
  payload.dynamic = normalizeDynamicEntries(payload.dynamic ?? [], { speciesId: sid, classId: cid });
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
function migrateV8toV9(payload) {
  payload.player = payload.player ?? {};
  payload.character = normalizeCharacterProfile(
    payload.character ?? {
      classId: payload?.player?.classId,
      speciesId: payload?.player?.speciesId,
    }
  );
  const sid = normalizeCharacterSpeciesId(payload?.player?.speciesId ?? payload.character.speciesId);
  const cid = normalizeCharacterClassId(payload?.player?.classId ?? payload.character.classId, sid);
  payload.player.classId = cid;
  payload.player.speciesId = sid;
  payload.player.equip = normalizeEquip(payload.player.equip ?? {}, { speciesId: sid, classId: cid });
  payload.inv = normalizeInventoryEntries(payload.inv ?? [], {
    speciesId: sid,
    classId: cid,
    ownerId: payload.character?.id ?? null,
  });
  payload.dynamic = normalizeDynamicEntries(payload.dynamic ?? [], {
    speciesId: sid,
    classId: cid,
  });
  payload.v = 9;
  return payload;
}
function migrateV9toV10(payload) {
  payload.analytics = payload.analytics ?? null;
  payload.v = 10;
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
    if (payload.v === 8) payload = migrateV8toV9(payload);
    if (payload.v === 9) payload = migrateV9toV10(payload);
    if (payload.v !== 10) return null;

    const tileOverrides = new Map(payload.tileOv ?? []);
    const world = new World(payload.seed, tileOverrides);
    const character = normalizeCharacterProfile(
      payload.character ?? {
        classId: payload?.player?.classId,
        speciesId: payload?.player?.speciesId,
      }
    );
    const normalizeOpts = {
      speciesId: character.speciesId,
      classId: character.classId,
      ownerId: character.id,
    };

    const state = {
      world,
      player: payload.player,
      seen: new Set(ensureArray(payload.seen)),
      visible: new Set(),
      log: ensureArray(payload.log),
      entities: new Map(),
      removedIds: new Set(ensureArray(payload.removed)),
      entityOverrides: new Map(ensureArray(payload.entOv)),
      inv: normalizeInventoryEntries(payload.inv ?? [], normalizeOpts),
      dynamic: new Map(),
      turn: payload.turn ?? 0,
      visitedDoors: new Set(ensureArray(payload.visitedDoors)),
      exploredChunks: new Set(ensureArray(payload.exploredChunks)),
      xpDepthKills: normalizeDepthKillCounters(payload.xpDepthKills ?? {}),
      poisonClouds: normalizePoisonCloudState(payload.poisonClouds ?? {}),
      surfaceLink: payload.surfaceLink ?? null,
      startSpawn: payload.startSpawn ?? null,
      lastLadderLanding: normalizeLadderLanding(payload.lastLadderLanding ?? null),
      shop: payload.shop ?? null,
      character,
      combat: {
        lastEventMs: Number.isFinite(payload?.combat?.lastEventMs) ? payload.combat.lastEventMs : 0,
        regenAnchorMs: Number.isFinite(payload?.combat?.regenAnchorMs) ? payload.combat.regenAnchorMs : Date.now(),
        hudTargets: normalizeCombatHudTargets(payload?.combat?.hudTargets ?? {}),
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
      quickSwitch: { active: false, baseCharacterId: "", baseClassId: "", baseSpeciesId: "", baseName: "", startedAt: 0 },
      debug: normalizeDebugFlags(payload.debug),
      analytics: null,
    };

    fogEnabled = !!payload.fog;
    minimapEnabled = payload.minimap !== false;

    for (const e of normalizeDynamicEntries(payload.dynamic ?? [], normalizeOpts)) state.dynamic.set(e.id, e);

    state.player.dead = !!state.player.dead;
    state.player.level = state.player.level ?? 1;
    state.player.xp = Math.max(0, Math.floor(state.player.xp ?? 0));
    state.player.equip = normalizeEquip(state.player.equip ?? {}, {
      speciesId: state.character?.speciesId ?? state.player?.speciesId,
      classId: state.character?.classId ?? state.player?.classId,
    });
    state.player.effects = ensureArray(state.player.effects);
    state.player.maxHp = Math.max(1, Math.floor(state.player.maxHp ?? maxHpForLevel(state.player.level, state.character)));
    state.player.hp = clamp(Math.floor(state.player.hp ?? state.player.maxHp), 0, state.player.maxHp);
    if (!Number.isFinite(state.player.abilityCd)) state.player.abilityCd = 0;
    ensureCharacterState(state);
    state.surfaceLink = resolveSurfaceLink(state);
    state.startSpawn = state.startSpawn ?? computeInitialDepth0Spawn(world);
    if (!normalizeLadderLanding(state.lastLadderLanding)) {
      setLastLadderLanding(state, state.player ?? state.startSpawn);
    }
    ensureSurfaceLinkTile(state);
    if (state.shop && typeof state.shop === "object") {
      const legacyStock = Array.isArray(state.shop.stock) ? state.shop.stock : [];
      if (!Array.isArray(state.shop.coreStock) && legacyStock.length > 0) {
        state.shop.coreStock = legacyStock.slice();
      }
      if (!Array.isArray(state.shop.overflowStock)) state.shop.overflowStock = [];
      state.shop.shopId = String(state.shop.shopId ?? "shop_01").trim() || "shop_01";
      state.shop.shopType = normalizeShopType(state.shop.shopType ?? "general");
      state.shop.coreStock = (Array.isArray(state.shop.coreStock) ? state.shop.coreStock : [])
        .map((entry, idx) => {
          const slotType = SHOP_CORE_SLOT_LAYOUT[idx] ?? "mid_gear";
          return normalizeShopCoreItem(entry, slotType, state, {
            nowMs: Date.now(),
            allowGenerate: canMutateGameplayStateLocally(),
          });
        })
        .filter(Boolean)
        .slice(0, SHOP_CORE_SIZE);
      state.shop.overflowStock = (Array.isArray(state.shop.overflowStock) ? state.shop.overflowStock : [])
        .map((entry) => normalizeShopOverflowItem(entry))
        .filter(Boolean)
        .slice(-SHOP_OVERFLOW_MAX);
      state.shop.lastRefreshMs = Number.isFinite(state.shop.lastRefreshMs)
        ? Math.max(0, Math.floor(state.shop.lastRefreshMs))
        : Date.now();
      state.shop.nextRefreshMs = Number.isFinite(state.shop.nextRefreshMs)
        ? Math.max(0, Math.floor(state.shop.nextRefreshMs))
        : (Date.now() + shopRefreshIntervalMsForLevel(state.player.level));
    } else {
      state.shop = null;
    }
    state.debug = normalizeDebugFlags(state.debug);
    ensureQuickSwitchState(state);
    if (canMutateGameplayStateLocally()) {
      ensureShopState(state);
    }

    recalcDerivedStats(state);
    if (!Number.isFinite(state.player.energy)) state.player.energy = state.player.energyMax;
    state.analytics = initializeAnalyticsForState(state, payload.analytics ?? null, "import-save");

    hydrateNearby(state);
    if (canMutateGameplayStateLocally()) {
      updateAreaRespawnTracking(state, Date.now());
    }
    renderLog(state);
    renderInventory(state);
    renderEquipment(state);
    renderEffects(state);

    return normalizeLoadedStateCollections(state);
  } catch {
    return null;
  }
}

function saveNow(state) {
  if (!state || isQuickSwitchCharacterActive(state)) return;
  const payload = exportSave(state);
  try { localStorage.setItem(SAVE_KEY, payload); } catch {}
  clearSaveDirty();
  syncItemAuthorityFromStateIfChanged(state, "save-now");
}

function saveResumeSnapshot(state) {
  if (!state || isQuickSwitchCharacterActive(state)) return;
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

function deltaToCardinalDir(dx = 0, dy = 0) {
  const mx = Math.trunc(Number(dx) || 0);
  const my = Math.trunc(Number(dy) || 0);
  if (mx === 0 && my === -1) return "N";
  if (mx === 1 && my === 0) return "E";
  if (mx === 0 && my === 1) return "S";
  if (mx === -1 && my === 0) return "W";
  return "";
}

function dirToDelta(dir = "") {
  const d = String(dir ?? "").trim().toUpperCase();
  if (d === "N") return { dx: 0, dy: -1 };
  if (d === "E") return { dx: 1, dy: 0 };
  if (d === "S") return { dx: 0, dy: 1 };
  if (d === "W") return { dx: -1, dy: 0 };
  return null;
}

function buildCarryoverFromCharacterSnapshot(snapshot = null) {
  const profile = normalizeCharacterProfile(snapshot?.character ?? null);
  const player = (snapshot?.player && typeof snapshot.player === "object") ? snapshot.player : {};
  return {
    character: profile,
    level: Math.max(1, Math.floor(player.level ?? 1)),
    xp: Math.max(0, Math.floor(player.xp ?? 0)),
    gold: Math.max(0, Math.floor(player.gold ?? 0)),
    inv: normalizeInventoryEntries(player.inv ?? [], {
      speciesId: profile.speciesId,
      classId: profile.classId,
      ownerId: profile.id,
    }),
    equip: normalizeEquip(player.equip ?? {}, {
      speciesId: profile.speciesId,
      classId: profile.classId,
    }),
    maxHp: Math.max(1, Math.floor(player.maxHp ?? maxHpForLevel(1, profile))),
  };
}

function buildHeadlessStateSnapshot(state, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const snapshot = exportCharacterSnapshot(state);
  return {
    payload: exportSave(state),
    characterSnapshotPayload: encodeCharacterSnapshotPayload(snapshot),
    character: {
      id: normalizeCharacterProfileId(snapshot?.character?.id ?? ""),
      name: String(snapshot?.character?.name ?? DEFAULT_CHARACTER_NAME),
    },
    summary: {
      level: Math.max(1, Math.floor(state?.player?.level ?? 1)),
      depth: Math.trunc(state?.player?.z ?? 0),
      x: Math.trunc(state?.player?.x ?? 0),
      y: Math.trunc(state?.player?.y ?? 0),
      dead: !!state?.player?.dead,
      turn: Math.max(0, Math.floor(state?.turn ?? 0)),
    },
    log: Array.isArray(state?.log) ? state.log.slice(-80) : [],
    events: Array.isArray(state?.log) ? state.log.slice(Math.max(0, Math.floor(opts.logStart ?? 0))) : [],
  };
}

function findMonsterForAuthoritativeCommand(state, command = null) {
  const cmd = (command && typeof command === "object") ? command : {};
  const monsterId = String(cmd.monsterId ?? cmd.targetMonsterId ?? "").trim();
  if (monsterId) {
    const direct = state?.entities?.get(monsterId) ?? null;
    if (direct?.kind === "monster") return direct;
  }
  const targetX = Number(cmd.x ?? cmd.target?.x ?? null);
  const targetY = Number(cmd.y ?? cmd.target?.y ?? null);
  const z = Math.floor(Number(state?.player?.z ?? 0));
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return null;
  const occ = buildOccupancy(state);
  const id = occ.monsters.get(keyXYZ(Math.floor(targetX), Math.floor(targetY), z));
  if (!id) return null;
  const ent = state.entities.get(id);
  return ent?.kind === "monster" ? ent : null;
}

function resolveInventoryIndexFromCommand(state, command = null) {
  const cmd = (command && typeof command === "object") ? command : {};
  if (Number.isFinite(Number(cmd.slot))) return Math.floor(Number(cmd.slot));
  if (Number.isFinite(Number(cmd.invIndex))) return Math.floor(Number(cmd.invIndex));
  return -1;
}

function executeAuthoritativeCommandOnState(state, rawCommand = null) {
  const command = (rawCommand && typeof rawCommand === "object") ? rawCommand : {};
  const type = String(command.type ?? "").trim().toUpperCase();
  const logStart = Array.isArray(state?.log) ? state.log.length : 0;
  if (!state?.player || !type) {
    return {
      ok: false,
      error: "Invalid authoritative command.",
      turnSpent: false,
      snapshot: state ? buildHeadlessStateSnapshot(state, { logStart }) : null,
    };
  }

  let ok = false;
  let turnSpent = false;
  const beforePayload = exportSave(state);

  if (type === "MOVE") {
    const delta = dirToDelta(command.dir);
    if (!delta) {
      return {
        ok: false,
        error: "Invalid move direction.",
        turnSpent: false,
        snapshot: buildHeadlessStateSnapshot(state, { logStart }),
      };
    }
    ok = !!playerMoveOrAttack(state, delta.dx, delta.dy);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "WAIT") {
    ok = !!waitTurn(state);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "USE_STAIRS") {
    const dir = String(command.dir ?? "").trim().toLowerCase();
    if (dir !== "up" && dir !== "down") {
      return {
        ok: false,
        error: "Invalid stairs direction.",
        turnSpent: false,
        snapshot: buildHeadlessStateSnapshot(state, { logStart }),
      };
    }
    ok = !!tryUseStairs(state, dir);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "PICKUP" || type === "OPEN_CHEST") {
    ok = !!pickup(state);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "DROP_ITEM") {
    const idx = resolveInventoryIndexFromCommand(state, command);
    ok = idx >= 0 ? !!dropInventoryIndex(state, idx) : false;
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "USE_ITEM" || type === "EQUIP_ITEM") {
    const idx = resolveInventoryIndexFromCommand(state, command);
    if (idx >= 0) useInventoryIndex(state, idx);
    ok = exportSave(state) !== beforePayload;
  } else if (type === "UNEQUIP_ITEM") {
    ok = !!unequipSlotToInventory(state, String(command.slot ?? "").trim());
  } else if (type === "BUY_SHOP_ITEM") {
    const itemId = String(command.itemId ?? command.id ?? "").trim();
    const index = Math.max(0, Math.floor(Number(command.index ?? command.slot ?? 0) || 0));
    ok = !!buyShopItemByIndex(state, { index, itemId });
  } else if (type === "SELL_SHOP_ITEM") {
    const idx = resolveInventoryIndexFromCommand(state, command);
    ok = idx >= 0 ? !!sellShopInventoryIndex(state, idx) : false;
  } else if (type === "ALLOCATE_STATS") {
    const allocations = (command.allocations && typeof command.allocations === "object") ? command.allocations : {};
    ok = !!applyCharacterStatPointAllocations(state, allocations);
  } else if (type === "ATTACK") {
    const target = findMonsterForAuthoritativeCommand(state, command);
    ok = !!(target && attackMonsterById(state, target.id));
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "ACTIVATE_ABILITY") {
    const ability = playerActiveAbility(state);
    const requestedAbilityId = String(command.abilityId ?? "").trim();
    if (!ability || (requestedAbilityId && requestedAbilityId !== ability.id)) {
      return {
        ok: false,
        error: "Ability is not available.",
        turnSpent: false,
        snapshot: buildHeadlessStateSnapshot(state, { logStart }),
      };
    }
    const target = findMonsterForAuthoritativeCommand(state, command);
    ok = !!usePlayerActiveAbility(state, ability, target);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "OPEN_DOOR") {
    ok = !!tryOpenAdjacentDoor(state);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "CLOSE_DOOR") {
    ok = !!tryCloseAdjacentDoor(state);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "DISARM_TRAP") {
    ok = !!disarmTrapAtPlayer(state);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "USE_SHRINE") {
    ok = !!interactShrine(state);
    turnSpent = ok;
    takeTurn(state, ok);
  } else if (type === "INTERACT") {
    const p = state.player;
    const here = state.world.getTile(p.x, p.y, p.z);
    if (here === STAIRS_DOWN) {
      ok = !!tryUseStairs(state, "down");
      turnSpent = ok;
      takeTurn(state, ok);
    } else if (here === STAIRS_UP) {
      ok = !!tryUseStairs(state, "up");
      turnSpent = ok;
      takeTurn(state, ok);
    } else if (disarmTrapAtPlayer(state)) {
      ok = true;
      turnSpent = true;
      takeTurn(state, true);
    } else {
      const shopkeeper = findItemAtByType(state, p.x, p.y, p.z, "shopkeeper");
      if (shopkeeper?.type === "shopkeeper") {
        ensureShopState(state);
        const refreshed = refreshShopStock(state, false);
        if (refreshed) pushLog(state, "The shopkeeper restocked new wares.");
        ok = true;
      } else {
        ok = !!interactShrine(state);
        turnSpent = ok;
        takeTurn(state, ok);
      }
    }
  } else if (type === "REQUEST_RESYNC" || type === "SAVE_AND_EXIT") {
    ok = true;
  } else {
    return {
      ok: false,
      error: `Unsupported authoritative command: ${type}`,
      turnSpent: false,
      snapshot: buildHeadlessStateSnapshot(state, { logStart }),
    };
  }

  return {
    ok,
    error: ok ? "" : `Command ${type} could not be completed.`,
    turnSpent,
    snapshot: buildHeadlessStateSnapshot(state, { logStart }),
  };
}

function headlessStateFromPayload(payload = "") {
  const src = String(payload ?? "").trim();
  if (!src) return null;
  return importSave(src);
}

function headlessBootstrapState(options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const worldPayload = String(opts.worldPayload ?? "").trim();
  const characterPayload = String(opts.characterPayload ?? "").trim();
  const forceEntrance = opts.forceEntrance === true;

  let state = worldPayload ? headlessStateFromPayload(worldPayload) : null;
  const snapshot = characterPayload ? decodeCharacterSnapshotPayload(characterPayload) : null;
  if (!state) {
    if (snapshot) state = makeNewGame(randomSeedString(), { carryover: buildCarryoverFromCharacterSnapshot(snapshot) });
    else state = makeNewGame();
  }
  if (!state) return null;

  if (snapshot) {
    applyCharacterSnapshot(state, snapshot);
    if (forceEntrance) {
      placePlayerAtDungeonEntrance(state, { resetVision: true });
    } else {
      placePlayerFromCharacterSnapshot(state, snapshot, { resetVision: true });
    }
  } else if (forceEntrance) {
    placePlayerAtDungeonEntrance(state, { resetVision: true });
  }

  return buildHeadlessStateSnapshot(state);
}

function headlessSwitchCharacterPayload(worldPayload = "", characterPayload = "", options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const state = headlessStateFromPayload(worldPayload);
  const snapshot = decodeCharacterSnapshotPayload(characterPayload);
  if (!state || !snapshot) return null;
  applyCharacterSnapshot(state, snapshot);
  if (opts.forceEntrance === true) {
    placePlayerAtDungeonEntrance(state, { resetVision: true });
  } else {
    placePlayerFromCharacterSnapshot(state, snapshot, { resetVision: true });
  }
  return buildHeadlessStateSnapshot(state);
}

function headlessExecuteCommandPayload(worldPayload = "", command = null) {
  const state = headlessStateFromPayload(worldPayload);
  if (!state) {
    return {
      ok: false,
      error: "Invalid canonical run payload.",
      turnSpent: false,
      snapshot: null,
    };
  }
  return executeAuthoritativeCommandOnState(state, command);
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
btnGuestNewCharacterEl?.addEventListener("click", () => {
  void handleGuestNewCharacterRequest();
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
  const result = confirmLevelUpDraft(game);
  if (result && typeof result.then === "function") {
    void result.then((ok) => {
      if (ok) closeLevelUpOverlay();
    });
    return;
  }
  if (!result) return;
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
characterSwitchConfirmConfirmEl?.addEventListener("click", () => {
  resolveCharacterSwitchConfirm(true);
});
characterSwitchConfirmCancelEl?.addEventListener("click", () => {
  resolveCharacterSwitchConfirm(false);
});
newDungeonConfirmOverlayEl?.addEventListener("click", (e) => {
  if (e.target === newDungeonConfirmOverlayEl) resolveNewDungeonConfirm(false);
});
characterSwitchConfirmOverlayEl?.addEventListener("click", (e) => {
  if (e.target === characterSwitchConfirmOverlayEl) resolveCharacterSwitchConfirm(false);
});
guestNewCharacterConfirmEl?.addEventListener("click", () => {
  resolveGuestNewCharacterChoice(true);
});
guestNewCharacterCancelEl?.addEventListener("click", () => {
  resolveGuestNewCharacterChoice(false);
});
guestNewCharacterOverlayEl?.addEventListener("click", (e) => {
  if (e.target === guestNewCharacterOverlayEl) resolveGuestNewCharacterChoice(false);
});
guestLoginImportConfirmEl?.addEventListener("click", () => {
  resolveGuestLoginImportChoice(true);
});
guestLoginImportDeclineEl?.addEventListener("click", () => {
  resolveGuestLoginImportChoice(false);
});
guestLoginImportOverlayEl?.addEventListener("click", (e) => {
  if (e.target === guestLoginImportOverlayEl) resolveGuestLoginImportChoice(false);
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
  if (isGuestNewCharacterOverlayOpen()) {
    e.preventDefault();
    resolveGuestNewCharacterChoice(false);
    return;
  }
  if (isGuestLoginImportOverlayOpen()) {
    e.preventDefault();
    resolveGuestLoginImportChoice(false);
    return;
  }
  if (isLevelUpOverlayOpen()) {
    e.preventDefault();
    closeLevelUpOverlay();
    return;
  }
  if (isCharacterSwitchConfirmOpen()) {
    e.preventDefault();
    resolveCharacterSwitchConfirm(false);
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
const runDebugClearRadius = () => {
  if (!canUseAdminControls()) return;
  if (!game || !debugClearRadiusInputEl) return;
  const parsed = Number(debugClearRadiusInputEl.value.trim());
  if (!Number.isFinite(parsed)) {
    pushLog(game, "Invalid clear radius.");
    return;
  }
  const result = clearMonstersAndActorsAroundPlayer(game, parsed);
  debugClearRadiusInputEl.value = `${result.radius || 10}`;
  if (result.monsterCount === 0 && result.actorCount === 0) {
    pushLog(game, `Clear: no monsters or spawned actors found within radius ${result.radius}.`);
    return;
  }
  pushLog(
    game,
    `Clear: removed ${result.monsterCount} monster${result.monsterCount === 1 ? "" : "s"} and ${result.actorCount} actor${result.actorCount === 1 ? "" : "s"} within radius ${result.radius}.`
  );
};
debugClearGoEl?.addEventListener("click", (e) => {
  e.preventDefault();
  runDebugClearRadius();
});
debugClearRadiusInputEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  runDebugClearRadius();
});
const runDebugSpawnRoster = () => {
  if (!canUseAdminControls()) return;
  if (!game) return;
  const result = spawnMonsterRosterOnSurface(game);
  if (result.total <= 0) {
    pushLog(game, "Roster: no monsters found.");
    return;
  }
  const base = result.truncated
    ? `Roster: spawned ${result.spawned}/${result.total} monsters on surface (space limit reached).`
    : `Roster: spawned ${result.spawned} monsters on surface.`;
  const refreshed = result.removed > 0
    ? `${base} Cleared ${result.removed} previous roster monster${result.removed === 1 ? "" : "s"} first.`
    : base;
  pushLog(game, refreshed);
  if ((game.player?.z ?? 0) !== SURFACE_LEVEL) {
    pushLog(game, "Roster location: surface depth -1 near the top-left.");
  }
};
debugRosterGoEl?.addEventListener("click", (e) => {
  e.preventDefault();
  runDebugSpawnRoster();
});
const runDebugQuickSwitchClass = () => {
  if (!canUseAdminControls()) return;
  if (!game || !debugQuickSwitchClassEl) return;
  const classId = normalizeCharacterClassId(debugQuickSwitchClassEl.value);
  if (!classId || !CLASS_DEFS[classId]) {
    pushLog(game, "Choose a class for Quick Switch.");
    return;
  }
  const ok = applyQuickSwitchClass(game, classId);
  if (!ok) pushLog(game, "Quick Switch failed.");
};
debugQuickSwitchGoEl?.addEventListener("click", (e) => {
  e.preventDefault();
  runDebugQuickSwitchClass();
});
debugQuickSwitchClassEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  runDebugQuickSwitchClass();
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
  const action = currentContextAction ?? resolveContextAction(game);
  if (!action) return;
  takeTurn(game, action.run());
});
contextAbilityBtn?.addEventListener("click", () => {
  if (!game) return;
  const action = currentAbilityContextAction ?? activeAbilityAction(game);
  if (!action || action.disabled) return;
  takeTurn(game, action.run());
});
contextPotionBtn?.addEventListener("click", () => {
  if (!game) return;
  takeTurn(game, usePotionFromContext(game));
});
btnRespawnEl?.addEventListener("click", async () => {
  if (!game || !game.player?.dead) return;
  closeShopOverlay();
  const loadedAutosave = await loadLatestAutosaveForRespawn();
  if (loadedAutosave) {
    pushLog(game, "Loaded your latest autosave.");
    return;
  }
  if (relocatePlayerToLastLadderLanding(game)) {
    applyRespawnRecoveryState(game);
    pushLog(game, "No autosave found. You awaken at your last savepoint.");
    saveNow(game);
    return;
  }
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

if (!HEADLESS_RUNTIME) {
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
    restartAnalyticsHeartbeatLoop(game);
    void flushAnalyticsIfNeeded(game, "startup-init");
    void refreshSpriteOverridesFromServer(true);
    void startCharacterFlow().then(() => {
      void maybeHandlePostLoginGuestImport();
    });
    syncBodyModalLock();
    syncMobileUi(true);
    const flushAutosaveLifecycle = (options = null) => {
      const opts = (options && typeof options === "object") ? options : {};
      const closeRun = opts.closeRun === true;
      if (!game) return;
      saveResumeSnapshot(game);
      if (closeRun) {
        requestLifecycleAuthoritativeClose("lifecycle-close");
        stopAnalyticsHeartbeatLoop();
        void endAnalyticsRun(game, {
          status: "closed",
          reason: "lifecycle-close",
          bestEffortBeacon: true,
        });
      } else {
        void flushAnalyticsIfNeeded(game, "lifecycle", true);
      }
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
    window.addEventListener("pagehide", () => flushAutosaveLifecycle({ closeRun: true }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") return;
      flushAutosaveLifecycle({ closeRun: false });
    });
    window.addEventListener("beforeunload", () => flushAutosaveLifecycle({ closeRun: true }));
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
            const action = currentContextAction ?? resolveContextAction(game);
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
}

function tryOpenAdjacentDoor(state) {
  if (isAuthoritativeSessionActive()) {
    return performAuthoritativeCommand(openDoorCommand(), { reason: "open-door" });
  }
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

export {
  HEADLESS_RUNTIME,
  buildCarryoverFromCharacterSnapshot,
  buildCharacterSnapshotFromCarryover,
  buildHeadlessStateSnapshot,
  createCharacterRunFromCurrentDungeon,
  decodeCharacterSnapshotPayload,
  deltaToCardinalDir,
  dirToDelta,
  encodeCharacterSnapshotPayload,
  executeAuthoritativeCommandOnState,
  exportCharacterSnapshot,
  exportSave,
  headlessBootstrapState,
  headlessExecuteCommandPayload,
  headlessStateFromPayload,
  headlessSwitchCharacterPayload,
  importSave,
  makeNewGame,
  normalizeCharacterProfile,
  placePlayerAtDungeonEntrance,
  placePlayerFromCharacterSnapshot,
  tryOpenAdjacentDoor,
};
