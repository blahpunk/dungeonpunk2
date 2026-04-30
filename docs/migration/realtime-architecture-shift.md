# Realtime Architecture Shift

This repository now contains the staged compatibility slice for the realtime migration described in `/var/www/dungeonpunk_data/codebase_migration-2026-25-03.txt`.

## What Landed

### Client transport abstraction
- `client/net/authoritativeApi.js`
  - now exposes a transport selector instead of a single PHP-only implementation
  - keeps the legacy PHP authoritative transport available
  - can select the new realtime socket transport
  - can fall back to PHP if realtime transport connection/setup fails
- `client/net/realtimeSocketTransport.js`
  - persistent websocket transport
  - request/response messages for session open, commands, movement intent, resync, character switch, new dungeon, save, and close
  - push-driven movement delivery through queued `world_delta` messages
  - abort-safe `pollMovement()` compatibility surface so the existing gameplay loop can stop cleanly on character switch and lifecycle shutdown

### Realtime server
- `server/runtime/realtime_server.mjs`
  - dedicated websocket endpoint for staged realtime delivery
  - `/health` and `/healthz` HTTP endpoints
  - proxies the existing authoritative PHP API during the compatibility phase
  - maintains one persistent movement poll loop per connected client/session
  - pushes `world_delta` messages instead of requiring browser long-poll fetches in realtime mode
  - attaches per-client delta sequence counters so the stream can evolve toward explicit gap detection/resync handling

### Page-shell rollout flags
- `index.php`
  - now exposes rollout flags and URL config through body data attributes
  - keeps realtime transport behind environment-driven flags

### Repo operability
- `package.json`
  - `npm run realtime:start`
  - `npm run realtime:check`
- `README.md`
  - updated local startup instructions for staged realtime mode

## Current Phase Coverage

This implementation covers the migration document's Phase 1 and Phase 2 work:
- dedicated realtime transport server
- persistent websocket endpoint
- client transport abstraction with legacy compatibility
- feature-flagged rollout
- push-based movement delivery in realtime mode

## What Is Still Deliberately Deferred

The following phases are not complete yet and still require additional migration work:
- Node-owned simulation tick as the single world authority
- in-memory shared dungeon runtime living fully in the realtime server
- full multiplayer AI/combat/runtime ownership moved out of PHP
- explicit snapshot-plus-delta mirror rewrite with reconnect state machine and gap recovery
- persistence checkpoints driven from the realtime server instead of PHP hot-path execution

## Environment Variables

### Browser/client rollout
- `DUNGEON25_AUTHORITATIVE_ENABLED=1`
  - enables authoritative mode in the browser for authenticated users
- `DUNGEON25_REALTIME_TRANSPORT_ENABLED=1`
  - advertises the realtime transport to the client
- `DUNGEON25_REALTIME_TRANSPORT_MODE=realtime`
  - selects realtime transport mode by default
- `DUNGEON25_REALTIME_URL=ws://127.0.0.1:8787/realtime`
  - websocket URL served to the browser

### Realtime server runtime
- `DUNGEON25_REALTIME_PORT`
- `DUNGEON25_REALTIME_HOST`
- `DUNGEON25_REALTIME_PATH`
- `DUNGEON25_REALTIME_PHP_URL`
- `DUNGEON25_REALTIME_POLL_TIMEOUT_MS`
- `DUNGEON25_REALTIME_POLL_BACKOFF_MS`
- `DUNGEON25_REALTIME_REQUEST_TIMEOUT_MS`

## Startup

1. Run the PHP application normally.
2. Start the websocket transport server:
   - `npm run realtime:start`
3. Enable the browser flags via environment variables.
4. Load the game and confirm the movement badge reports live authoritative movement.
5. Verify `/healthz` on the realtime server.

## Local Storage Overrides

These are useful for dev without touching server env:
- `localStorage.setItem("dungeonpunk.authoritativeTransportMode", "php")`
- `localStorage.setItem("dungeonpunk.authoritativeTransportMode", "realtime")`
- `localStorage.setItem("dungeonpunk.realtimeTransportUrl", "ws://127.0.0.1:8787/realtime")`

## Compatibility / Deprecation Notes

The following PHP authoritative actions remain active and are still used by the staged compatibility layer:
- `open_session`
- `command`
- `set_movement_intent`
- `poll_movement`
- `touch_session`
- `session_lock_audit`
- `request_resync`
- `switch_character`
- `new_dungeon`
- `create_character_and_enter`
- `manual_save`
- `save_and_exit`
- `close_session`

These should be treated as compatibility endpoints now. Once the later migration phases are complete and the realtime service owns the simulation hot path, the PHP-side live gameplay endpoint set becomes the deprecation target.
