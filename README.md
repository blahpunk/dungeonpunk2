# DungeonPunk (`dungeon25`)

Browser-based roguelike dungeon crawler with a shared dungeon, server-backed saves/characters, procedural generation, depth-scaling loot/enemies, and admin sprite tooling.

## Tech Stack
- Frontend gameplay/runtime: vanilla JavaScript
- Page shell, auth, persistence, admin APIs: PHP
- Authoritative worker/runtime: Node.js
- Staged realtime transport server: Node.js WebSocket compatibility layer
- Assets: `client/assets/...`

No build step is required for core gameplay. The current migration keeps PHP in place for auth/persistence/admin flows while introducing a dedicated realtime transport server for live gameplay delivery.

## Realtime Migration Status
- `server/runtime/realtime_server.mjs` adds a persistent WebSocket transport that proxies the existing authoritative PHP API during the compatibility phase.
- `client/net/authoritativeApi.js` now selects between:
  - legacy PHP authoritative transport
  - realtime socket transport with PHP fallback
- Transport selection is flag-driven from `index.php` body data attributes or local storage overrides.
- This is the staged Phase 1/2 migration slice. PHP is still in the hot path for simulation ownership until the later runtime migration lands.

## Core Gameplay Features
- Infinite procedural dungeon in chunked world coordinates.
- Surface level (`z=-1`) plus descending depth levels.
- Dynamic LOS/fog, minimap, and tile visibility memory.
- Doors: regular, locked color variants, key consumption, open/close interactions.
- Stairs up/down traversal with robust landing carving and surface link handling.
- Turn-based movement, waiting, contextual interaction (`E`/center action), pickup, inventory use/drop.
- Combat:
  - Depth-scaled monster stats and AI.
  - Melee and ranged monster attacks.
  - Player attack/defense progression and XP gain.
  - Out-of-combat health regeneration after 3s.
  - Combat HP bars over player/enemies with numeric HP.
  - Disengage grace: stepping one tile away grants one-turn pursuit delay.
- Equipment and progression:
  - Multi-tier materials for weapons/armor (wood -> singularity steel).
  - Equipment slots: weapon/head/chest/legs.
  - Leveling, HP scaling, XP-to-next, exploration XP.
  - Gear and currency are character-bound.

## World/Spawn Systems
- Chunk-based procedural rooms/corridors with deterministic edge connectivity.
- Special room generation: shrine/treasure.
- Locked chokepoint/reward chest system.
- Dynamic entity hydration around player.
- Area-based respawn system:
  - Timer starts when player leaves a chunk area.
  - Respawns monsters/items when timer expires.
  - Respawn delay scales by depth from 90s toward 45s cap.

## Economy and Shop
- Surface shopkeeper with buy/sell UI tabs.
- Buy stock generated from progression-weighted catalog.
- Sell value and market-value model for item categories.
- Shop restocking timer and metadata display.
- Shopkeeper portrait in Buy mode (`shopkeeper_full.png`) aligned to container height.

## Save/Load and Character Model
- Local save cache in browser localStorage.
- Server save API (`?api=savegames`) with CSRF validation and signed payload entries.
- Max server slots currently set to 5 (used as character slots).
- Character-forward model scaffolded for future class/species systems:
  - Character profile object (`id`, `name`, `classId`, `speciesId`).
  - New Dungeon now resets run map/progression while preserving character-bound progression.
- Login/logout via external auth flow; long-lived PHP session cookie configured.

## Info and Admin Overlays
- Info overlay:
  - Weapon tier list with sprite/placeholder, stat summaries, and depth windows.
  - Data is generated from live tier configuration.
- Admin-only Sprite Editor:
  - Lists all object sprite targets (monsters, weapons, armor, environment, actor, items).
  - Filtering by type, source status, search, and dynamic armor-type filter.
  - Upload/delete per sprite.
  - Per-sprite world display size controls (25%-300%).
  - Preview rendering and source metadata.

## Sprite System
- Default sprite map plus custom override map.
- Server sprite API (`?api=sprites`) supports:
  - `GET`: list overrides/scales/entries + upload max.
  - `POST action=upload|delete|scale`.
- Sprite metadata persisted in:
  - `client/assets/sprites/custom/.metadata.json`
- Runtime rendering respects per-sprite scale.
- Tier glow effect for dropped weapons embersteel and above.

## Authentication / Permissions
- Admin actions are gated by `ADMIN_EMAIL` in `index.php`.
- Sprite modification endpoints enforce:
  - Auth admin check.
  - CSRF token check.

## API Summary
- `GET/POST ?api=savegames`
  - list/load/save/delete server save slots.
- `GET/POST ?api=sprites`
  - list/upload/delete/scale custom sprite overrides.
- `POST ?api=authoritative`
  - compatibility authoritative API used by the legacy transport and by the staged realtime proxy.

## Project Layout
- `index.php`: page shell, CSS, auth/session config, save/sprite APIs, rollout flags.
- `game.js`: full game runtime.
- `client/net/authoritativeApi.js`: transport selector with legacy PHP compatibility.
- `client/net/realtimeSocketTransport.js`: persistent realtime client transport.
- `server/runtime/realtime_server.mjs`: staged WebSocket realtime transport server.
- `server/runtime/authoritative_worker.mjs`: existing authoritative worker/runtime.
- `client/assets/`: sprites, portraits, and visual assets.
- `all_objects_sprites.csv`: object/sprite coverage export.

## Running Locally
1. Use a PHP-capable web server and point document root to this directory.
2. Optional but recommended for the migration path: start the staged realtime transport server with `npm run realtime:start`.
3. Set rollout env vars if you want the browser to use the new transport:
   - `DUNGEON25_AUTHORITATIVE_ENABLED=1`
   - `DUNGEON25_REALTIME_TRANSPORT_ENABLED=1`
   - `DUNGEON25_REALTIME_TRANSPORT_MODE=realtime`
   - `DUNGEON25_REALTIME_URL=ws://127.0.0.1:8787/realtime` (or `wss://...` behind TLS)
4. Open `index.php` in the browser.
5. Optional: configure auth/save secrets and storage env vars for secure signed saves and shared-run persistence.

## Transport Overrides
- Client local storage override: `dungeonpunk.authoritativeTransportMode`
  - `php`
  - `realtime`
- Client local storage override: `dungeonpunk.realtimeTransportUrl`
  - explicit websocket URL for dev/testing

## Migration Notes
- Detailed staged notes live in `docs/migration/realtime-architecture-shift.md`.
- The compatibility layer keeps `?api=authoritative` available while realtime parity is proven.

## Operational Notes
- Sprite uploads can still be blocked upstream by reverse proxy/web server body limits even if app limits are higher.
- Save data and sprite APIs depend on writable server directories under project paths used by `index.php`.

## Known Future Extensions (already scaffold-aware)
- Multiple characters per user (up to 5 slots).
- Expanded class/species gameplay differentiation.
- Additional Info overlay sections beyond weapon tiers.
