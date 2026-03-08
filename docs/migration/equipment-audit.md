# Combat 2.0 Equipment Audit

## Source docs reviewed
- `/var/www/blahpunk.com/dungeonpunk_data/combat 2.0/Combat 2.0 upgrade checklist.odt`
- `/var/www/blahpunk.com/dungeonpunk_data/combat 2.0/Combat 2.0 upgrade path.odt`

## Legacy assumptions located
- Weapon families hardcoded to six (`dagger`, `sword`, `axe`, `shortbow`, `longbow`, `crossbow`).
- Armor encoded as universal `armor_${material}_${slot}` with no family axis.
- Combat attack resolver only handled:
  - equipped weapon profile
  - class-native profile for a subset of classes
  - unarmed fallback
- Loot generation selected weapon/armor families from static random weights, not biome/source/faction tables.
- Equip flow lacked species/body-model validation.
- Save schema version `v8` normalized legacy IDs but not family-based armor or amplifier/replacer behavior.

## File/function migration map

### Item/equipment model
- `game.js`
  - `WEAPON_KINDS`, `ARMOR_SLOTS`, `ITEM_TYPES`, `WEAPONS`, `ARMOR_PIECES`
  - `weaponType(...)`, `armorType(...)`, `materialIdFromItemType(...)`
  - `normalizeItemType(...)`, `LEGACY_ITEM_MAP`
  - `normalizeInventoryEntries(...)`, `normalizeDynamicEntries(...)`, `normalizeEquip(...)`

### Combat resolver + native attacks
- `game.js`
  - `CLASS_NATIVE_ATTACKS`
  - `resolvePlayerAttackProfile(...)`
  - `playerAttack(...)`
  - `playerWeaponAttackProfile(...)`
  - `playerCanAttackMonster(...)`

### Loot generation
- `game.js`
  - `weaponForDepth(...)`, `armorForDepth(...)`
  - `chunkBaseSpawns(...)`
  - `dropEquipmentFromChest(...)`
  - `handleMonsterDefeat(...)`
  - `buildShopGearTypesForLevel(...)`

### Save/load + migration
- `game.js`
  - `exportSave(...)`
  - `importSave(...)`
  - `migrateV3toV4(...)` ... `migrateV7toV8(...)` (extended with next migration stage)

### UI naming/tooltips/equip feedback
- `game.js`
  - `renderInventory(...)`
  - `renderShopOverlay(...)`
  - `renderEquipment(...)`
  - `useInventoryIndex(...)`
  - `itemGlyph(...)`

## Legacy ID compatibility map to preserve
- Weapons:
  - `weapon_dagger` -> `weapon_bronze_dagger`
  - `weapon_sword` -> `weapon_bronze_sword`
  - `weapon_axe` -> `weapon_bronze_axe`
  - `weapon_mace` -> `weapon_iron_axe`
  - `weapon_greatsword` -> `weapon_steel_sword`
  - `weapon_runeblade` -> `weapon_steel_axe`
- Armor:
  - `armor_${material}_${slot}` -> `armor_${family}_${material}_${slot}` via species/class default family mapping
  - `armor_leather` / `armor_leather_chest` / `armor_leather_legs` -> family-based leather/chest|legs mapping
  - `armor_chain`, `armor_plate` -> family-based plate mapping

## Save/load formats requiring compatibility
- Local save payload (`exportSave`/`importSave`) versions:
  - existing: `v8`
  - migration target: add next version for Combat 2.0 canonical item resolution
- Dynamic world entities:
  - keep legacy `type` strings loadable
  - tolerate missing template metadata and synthesize from type
- Character equipment:
  - convert old armor IDs to family-aware IDs based on species/class

## Implementation status
- `Phase 1 (data model)`: implemented in `game.js` with template registry + instance IDs + legacy adapters.
- `Phase 2 (native fallback for all classes)`: implemented with class-wide native attack table and full attack resolver order.
- `Phase 3 (new families)`: implemented with replacer/amplifier families and equip validation.
- `Phase 4 (armor families)`: implemented with `armor_${family}_${material}_${slot}` and species/class migration mapping.
- `Phase 5 (18-tier inclusion)`: implemented for all registered weapon and armor families.
- `Phase 6 (species affinity/restrictions)`: implemented through equip rules, affinity multipliers, and tooltip metadata.
- `Phase 7/8 (biome + source + faction weighted loot)`: implemented through weighted family tables and source/faction multipliers.
- `Save migration`: implemented via `migrateV8toV9(...)`, plus normalized inventory/dynamic/equip migration paths.
- `UI updates`: implemented for inventory/shop/equipment/combat log; includes unusable reasons and replacer/amplifier labeling.

## Remaining architecture gap
- Full shared-world `server-auth` item authority is **not fully implemented** in this codebase yet.
- Current implementation adds per-item instance IDs, owner metadata, and canonical type/template handling, but item pickup/drop/equip authority is still primarily client-side in `game.js`.
