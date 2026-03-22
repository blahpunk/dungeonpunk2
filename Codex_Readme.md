# Codex Readme: Full Instruction Manual for Updating and Reviewing This Codebase

This guide is for coding agents (and humans) working in this repository.
It is intentionally operational: where to look, how to change things safely, and how to validate without breaking live behavior.

---

## 1) What This Project Is

`dungeonpunk2.blahpunk.com` is a browser-based dungeon crawler with:

- A large client game runtime in `game.js`
- PHP API/router in `index.php`
- Server libs in `server/lib/*.php`
- Optional Node authoritative runtime in `server/runtime/*.mjs`
- Assets and modular client helpers under `client/*`

Current architecture mixes:

- Local live simulation in the browser
- Shared dungeon synchronization through `savegames` API (`shared_run`)
- A server runtime path used for canonical shared dungeon stepping

---

## 2) High-Value File Map

### Core gameplay/runtime

- `game.js`
  - Main gameplay logic, simulation, rendering, UI, shared sync, debug/admin controls

### Web API and server routes

- `index.php`
  - Main HTTP entrypoint and API router
  - `savegames` routes, shared dungeon read/write, admin actions

### Server simulation/runtime glue

- `server/lib/sim_engine.php`
  - PHP -> Node worker/daemon bridge
- `server/runtime/authoritative_daemon.mjs`
  - Persistent socket daemon
- `server/runtime/authoritative_worker.mjs`
  - Direct worker fallback and op handlers
- `server/runtime/headless_env.mjs`
  - Headless browser shim used by worker runtime importing `game.js`

### Shared/session/state management

- `server/lib/session_manager.php`
  - Character/browser lock sessions
- `server/lib/command_router.php`
  - Authoritative command/movement handlers
- `server/lib/diff_builder.php`
  - Snapshot/hot-delta response construction
- `server/lib/run_loader.php`
  - Character/run loading

### Bootstrap/storage roots

- `src/bootstrap.php`
  - Storage root resolution and app paths

---

## 3) Runtime and Storage Facts You Must Respect

### Storage root

Project runtime data is expected under:

- `.runtime/*`

Important runtime dirs:

- `.runtime/savegames`
- `.runtime/authoritative_runtime`
- `.runtime/authoritative_sessions`
- `.runtime/authoritative_runs`

Never assume external runtime paths. Confirm storage root in `src/bootstrap.php`.

### Daemon reality

Canonical runtime manager:

- `dungeonpunk2.service` (systemd)

Operational policy:

- Treat `dungeonpunk2.service` as the source of truth for runtime lifecycle.
- Do not leave orphan standalone daemons running outside systemd.
- Always verify both service state and process/socket state.

Useful checks:

- `systemctl is-active dungeonpunk2.service`
- `systemctl is-enabled dungeonpunk2.service`
- `systemctl status dungeonpunk2.service --no-pager --full`
- `ps -ef | rg 'authoritative_daemon\\.mjs .*worker\\.sock'`
- `ss -xl | rg 'worker\\.sock'`

---

## 4) Shared Dungeon Model (Current)

Universal shared dungeon is stored as:

- `.runtime/savegames/global.shared-run.json`

Shared sync API:

- GET `savegames?shared_run=1`
- POST `action=shared_run_sync`
- POST `action=admin_universal_new_dungeon` (admin only)

Server currently:

1. Locks shared run
2. Merges incoming payload
3. Advances shared dungeon via worker op (`shared_dungeon_step`)
4. Persists shared run and per-character snapshots
5. Returns shared payload + active character state

Client currently:

1. Pushes shared payload when dirty
2. Pulls shared payload periodically
3. Rebuilds state from shared payload + current character payload
4. Injects remote player actors from active character state

---

## 5) Golden Rules for Safe Changes

1. Do not trust assumptions about architecture mode. Verify in code path first.
2. Do not mix stale in-memory daemon code with fresh file edits. Recycle runtime after critical `game.js` server-used changes.
3. Treat merge paths as high-risk:
   - stale overwrite bugs
   - resurrection/rollback bugs
   - cross-tab desync
4. Avoid hidden fallbacks that silently switch runtime model.
5. Keep one source-of-truth per state category:
   - If server canonical for monsters, clients must not overwrite monster motion/AI state.
6. Preserve user-facing continuity:
   - refresh position
   - character lock behavior
   - admin menu usability

---

## 6) Update Workflow (Required)

### Step A: Gather context quickly

- Use `rg` to find all call sites before editing a subsystem.
- Identify both:
  - write path
  - read/apply path

### Step B: Plan by state ownership

For each changed datum ask:

- Who owns this (`client`, `shared payload`, `server runtime`)?
- Who can mutate it?
- Who can overwrite it?

### Step C: Edit minimally, preserve compatibility

- Prefer narrow edits in existing flow.
- Avoid broad rewrites unless requested.

### Step D: Validate syntax immediately

Run:

- `node --check game.js`
- `php -l index.php`
- `php -l server/lib/*.php` (changed files)
- `node --check server/runtime/*.mjs` (changed files)

### Step E: Restart runtime when needed

If edits affect server-used `game.js` or worker runtime:

1. Stop stale daemon process
2. Start fresh daemon through `sim_engine.php` startup path
3. Verify new PID and socket timestamp

### Step F: Verify behavior with targeted checks

Use task-specific reproduction, not only syntax:

- movement/combat sync
- kill persistence
- character switching
- admin toggles/menu

---

## 7) Review Workflow (Code Review Checklist)

When asked to review, prioritize findings by severity:

1. Data ownership violations
2. Cross-tab desync/regression risk
3. Persist/restore regressions
4. Session/lock conflicts
5. Performance regressions in hot loops

Mandatory review questions:

- Can stale payload overwrite canonical state?
- Can same action be applied twice?
- Does refresh preserve correct character location?
- Are admin/debug controls overridden by sync loops?
- Does one browser tab interfere with another character incorrectly?

---

## 8) Common Pitfalls in This Repo

### 1) Daemon appears “off” but old process still running

- Service status can be inactive while daemon continues.
- Always inspect process list and `worker.sock`.

### 2) Shared sync overwrites local runtime state too aggressively

- Watch for `game = nextState` style rebuilds in loops.
- Preserve local UI/runtime state where intended (e.g., debug panel state).

### 3) Monster resurrection bugs

Typical causes:

- stale payload overwrite after local kill
- merge logic that reintroduces old monster rows
- sending full stale monster state from client

### 4) Admin toggles “don’t work”

Typical causes:

- menu force-closing every sync
- toggle state not marked dirty/synced
- state rebuild replacing debug flags

### 5) Cache confusion vs runtime confusion

- Distinguish browser cache from stale daemon memory.
- Both can happen simultaneously.

---

## 9) Practical Diagnostics

### Process/runtime checks

- `systemctl is-active dungeonpunk2.service`
- `systemctl status dungeonpunk2.service --no-pager --full`
- `ps -ef | rg 'authoritative_daemon\\.mjs|authoritative_worker\\.mjs'`
- `ls -l .runtime/authoritative_runtime/worker.sock`
- `ss -xl | rg 'worker\\.sock'`

### Syntax checks

- `node --check game.js`
- `php -l index.php`
- `php -l server/lib/command_router.php`
- `php -l server/lib/sim_engine.php`

### Shared state files

- `.runtime/savegames/global.shared-run.json`
- `.runtime/savegames/*.characters.json`

### Client telemetry (browser console)

- `window.dumpAuthoritativeMoveTelemetry?.()`

---

## 10) Restart/Recycle Procedure (Safe)

Use this when server-used gameplay code changes:

1. Restart systemd service: `sudo systemctl restart dungeonpunk2.service`
2. Verify service health:
   - `systemctl is-active dungeonpunk2.service` should be `active`
   - `systemctl status dungeonpunk2.service --no-pager --full` shows running Main PID
3. Verify process/socket:
   - daemon PID exists in `ps`
   - socket exists at `.runtime/authoritative_runtime/worker.sock`
4. Verify:
   - new PID
   - fresh `worker.sock` timestamp
   - fresh `worker.log` writes

Do not assume code edits are active until this is complete.

---

## 11) Coding Standards for This Repo

- Keep edits targeted and readable.
- Prefer existing helpers over duplicate logic.
- Preserve runtime guards and capability checks.
- Avoid side effects in utility functions unless explicit.
- Keep serialization formats backward-compatible where practical.

For large state merges, add comments explaining ownership rules.

---

## 12) If You’re Fixing Shared Combat/Respawn Bugs

Work in this order:

1. Confirm ownership model for monster state.
2. Confirm kill tombstone/removal path.
3. Confirm client push does not send stale canonical fields.
4. Confirm server merge cannot resurrect dead entities.
5. Confirm pull/apply path cannot rollback fresh local/server state during active combat.
6. Re-test with two tabs.

---

## 13) Deployment/Validation Minimum Before Hand-Off

Before reporting “fixed,” do all of:

1. Syntax checks for all edited JS/PHP runtime files.
2. Runtime recycle if server-used code changed.
3. Verify daemon PID/socket freshness.
4. Reproduce the user issue at least once in expected mode.
5. State exactly what was changed and where.

---

## 14) Notes for Future Refactors

The long-term stable direction is:

- Single canonical server simulation for shared world combat/AI
- Client sends intents/actions, not full world monster bodies
- Clear ownership boundaries for:
  - player local UX state
  - canonical world simulation state
  - shared presentation state

Until then, treat shared merge/apply logic as a critical safety boundary.
