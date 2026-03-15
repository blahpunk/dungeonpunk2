<?php
declare(strict_types=1);

function analytics_storage_dir(): string
{
  return app_storage_path('analytics');
}

function analytics_db_path(): string
{
  return analytics_storage_dir() . DIRECTORY_SEPARATOR . 'dungeon_stats.sqlite';
}

function analytics_db_now_iso(): string
{
  return gmdate('c');
}

function analytics_iso_from_ms(mixed $value, ?string $fallbackIso = null): string
{
  $fallback = $fallbackIso ?? analytics_db_now_iso();
  if (!is_scalar($value) && $value !== null) {
    return $fallback;
  }
  $raw = (float) $value;
  if (!is_finite($raw) || $raw <= 0) {
    return $fallback;
  }
  $seconds = (int) floor($raw / 1000);
  if ($seconds <= 0) {
    return $fallback;
  }
  return gmdate('c', $seconds);
}

function analytics_sqlite_available(): bool
{
  return class_exists('PDO') && in_array('sqlite', \PDO::getAvailableDrivers(), true);
}

function analytics_db(): PDO
{
  static $db = null;
  if ($db instanceof PDO) {
    return $db;
  }
  if (!analytics_sqlite_available()) {
    throw new RuntimeException('SQLite support is not available on this server.');
  }

  $dir = analytics_storage_dir();
  if (!is_dir($dir) && !(mkdir($dir, 0700, true) || is_dir($dir))) {
    throw new RuntimeException('Could not initialize analytics storage.');
  }

  $db = new PDO('sqlite:' . analytics_db_path());
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  $db->exec('PRAGMA journal_mode = WAL');
  $db->exec('PRAGMA synchronous = NORMAL');
  $db->exec('PRAGMA busy_timeout = 5000');
  analytics_db_bootstrap($db);
  return $db;
}

function analytics_db_bootstrap(PDO $db): void
{
  $db->exec(
    'CREATE TABLE IF NOT EXISTS analytics_runs (
      run_id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      character_id TEXT NOT NULL DEFAULT \'\',
      character_name TEXT NOT NULL DEFAULT \'\',
      species_id TEXT NOT NULL DEFAULT \'\',
      class_id TEXT NOT NULL DEFAULT \'\',
      seed TEXT NOT NULL DEFAULT \'\',
      started_at TEXT NOT NULL DEFAULT \'\',
      ended_at TEXT NOT NULL DEFAULT \'\',
      status TEXT NOT NULL DEFAULT \'active\',
      start_depth INTEGER NOT NULL DEFAULT 0,
      final_depth INTEGER NOT NULL DEFAULT 0,
      deepest_depth INTEGER NOT NULL DEFAULT 0,
      turns INTEGER NOT NULL DEFAULT 0,
      moves INTEGER NOT NULL DEFAULT 0,
      waits INTEGER NOT NULL DEFAULT 0,
      attacks INTEGER NOT NULL DEFAULT 0,
      distance_travelled INTEGER NOT NULL DEFAULT 0,
      tiles_discovered INTEGER NOT NULL DEFAULT 0,
      chunks_discovered INTEGER NOT NULL DEFAULT 0,
      doors_opened INTEGER NOT NULL DEFAULT 0,
      doors_closed INTEGER NOT NULL DEFAULT 0,
      shrines_used INTEGER NOT NULL DEFAULT 0,
      chests_opened INTEGER NOT NULL DEFAULT 0,
      traps_triggered INTEGER NOT NULL DEFAULT 0,
      traps_disarmed INTEGER NOT NULL DEFAULT 0,
      damage_dealt INTEGER NOT NULL DEFAULT 0,
      damage_taken INTEGER NOT NULL DEFAULT 0,
      healing_received INTEGER NOT NULL DEFAULT 0,
      gold_collected INTEGER NOT NULL DEFAULT 0,
      gold_spent INTEGER NOT NULL DEFAULT 0,
      death_cause TEXT NOT NULL DEFAULT \'\',
      death_killer_type TEXT NOT NULL DEFAULT \'\',
      last_heartbeat_at TEXT NOT NULL DEFAULT \'\'
    )'
  );

  $db->exec(
    'CREATE TABLE IF NOT EXISTS analytics_run_depths (
      run_id TEXT NOT NULL,
      depth INTEGER NOT NULL,
      entered_at TEXT NOT NULL DEFAULT \'\',
      left_at TEXT NOT NULL DEFAULT \'\',
      active_seconds INTEGER NOT NULL DEFAULT 0,
      turns INTEGER NOT NULL DEFAULT 0,
      moves INTEGER NOT NULL DEFAULT 0,
      distance_travelled INTEGER NOT NULL DEFAULT 0,
      tiles_discovered INTEGER NOT NULL DEFAULT 0,
      chunks_discovered INTEGER NOT NULL DEFAULT 0,
      damage_dealt INTEGER NOT NULL DEFAULT 0,
      damage_taken INTEGER NOT NULL DEFAULT 0,
      shrines_used INTEGER NOT NULL DEFAULT 0,
      chests_opened INTEGER NOT NULL DEFAULT 0,
      traps_triggered INTEGER NOT NULL DEFAULT 0,
      traps_disarmed INTEGER NOT NULL DEFAULT 0,
      kills_json TEXT NOT NULL DEFAULT \'{}\',
      PRIMARY KEY (run_id, depth)
    )'
  );

  $db->exec(
    'CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_time TEXT NOT NULL DEFAULT \'\',
      depth INTEGER NOT NULL DEFAULT 0,
      x INTEGER,
      y INTEGER,
      event_type TEXT NOT NULL DEFAULT \'\',
      payload_json TEXT NOT NULL DEFAULT \'{}\'
    )'
  );

  $db->exec(
    'CREATE TABLE IF NOT EXISTS analytics_player_totals (
      user_email TEXT PRIMARY KEY,
      total_runs INTEGER NOT NULL DEFAULT 0,
      total_deaths INTEGER NOT NULL DEFAULT 0,
      deepest_depth INTEGER NOT NULL DEFAULT 0,
      total_turns INTEGER NOT NULL DEFAULT 0,
      total_distance_travelled INTEGER NOT NULL DEFAULT 0,
      total_tiles_discovered INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt INTEGER NOT NULL DEFAULT 0,
      total_damage_taken INTEGER NOT NULL DEFAULT 0,
      total_gold_collected INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT \'\'
    )'
  );

  $db->exec('CREATE INDEX IF NOT EXISTS idx_analytics_runs_user_started ON analytics_runs (user_email, started_at DESC)');
  $db->exec('CREATE INDEX IF NOT EXISTS idx_analytics_runs_class_started ON analytics_runs (class_id, started_at DESC)');
  $db->exec('CREATE INDEX IF NOT EXISTS idx_analytics_runs_species_started ON analytics_runs (species_id, started_at DESC)');
  $db->exec('CREATE INDEX IF NOT EXISTS idx_analytics_runs_status_started ON analytics_runs (status, started_at DESC)');
  $db->exec('CREATE INDEX IF NOT EXISTS idx_analytics_depths_run_depth ON analytics_run_depths (run_id, depth)');
  $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_events_run_seq ON analytics_events (run_id, seq)');
  $db->exec('CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time ON analytics_events (event_type, event_time DESC)');
}
