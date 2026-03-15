<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'analytics_db.php';

/**
 * @return array<string, int>
 */
function analytics_normalize_counter_bag(mixed $raw): array
{
  $source = is_array($raw) ? $raw : [];
  $keys = [
    'turns',
    'moves',
    'waits',
    'attacks',
    'distanceTravelled',
    'tilesDiscovered',
    'chunksDiscovered',
    'doorsOpened',
    'doorsClosed',
    'shrinesUsed',
    'chestsOpened',
    'trapsTriggered',
    'trapsDisarmed',
    'damageDealt',
    'damageTaken',
    'healingReceived',
    'goldCollected',
    'goldSpent',
  ];
  $out = [];
  foreach ($keys as $key) {
    $value = (int) floor((float) ($source[$key] ?? 0));
    $out[$key] = max(0, min(1000000000, $value));
  }
  return $out;
}

function analytics_normalize_text(mixed $value, int $maxLen = 255): string
{
  $text = trim((string) ($value ?? ''));
  if ($text === '') {
    return '';
  }
  return substr($text, 0, max(1, $maxLen));
}

function analytics_normalize_int(mixed $value, int $min = 0, int $max = 1000000000, int $fallback = 0): int
{
  if (!is_scalar($value) && $value !== null) {
    return $fallback;
  }
  $int = (int) floor((float) $value);
  return max($min, min($max, $int));
}

/**
 * @return array{id: string, name: string, species_id: string, class_id: string}
 */
function analytics_normalize_character_payload(array $payload): array
{
  $character = is_array($payload['character'] ?? null) ? $payload['character'] : [];
  return [
    'id' => analytics_normalize_text($character['id'] ?? '', 120),
    'name' => analytics_normalize_text($character['name'] ?? '', 120),
    'species_id' => analytics_normalize_text($character['species_id'] ?? '', 80),
    'class_id' => analytics_normalize_text($character['class_id'] ?? '', 80),
  ];
}

function analytics_require_run_id(array $payload): string
{
  $runId = analytics_normalize_text($payload['run_id'] ?? '', 160);
  if ($runId === '') {
    throw new InvalidArgumentException('Missing run id.');
  }
  return $runId;
}

function analytics_find_run_owner(PDO $db, string $runId): string
{
  $stmt = $db->prepare('SELECT user_email FROM analytics_runs WHERE run_id = :run_id LIMIT 1');
  $stmt->execute([':run_id' => $runId]);
  $row = $stmt->fetch();
  return is_array($row) ? analytics_normalize_text($row['user_email'] ?? '', 190) : '';
}

function analytics_assert_run_owner(PDO $db, string $runId, string $userEmail): void
{
  $owner = analytics_find_run_owner($db, $runId);
  if ($owner !== '' && !hash_equals($owner, $userEmail)) {
    throw new RuntimeException('Run ownership mismatch.');
  }
}

function analytics_ensure_run_stub(PDO $db, string $runId, string $userEmail, array $payload): void
{
  if (analytics_find_run_owner($db, $runId) !== '') {
    return;
  }
  $startedAt = analytics_iso_from_ms($payload['started_at_ms'] ?? null, analytics_db_now_iso());
  $currentDepth = analytics_normalize_int($payload['current_depth'] ?? 0, -1, 100000, 0);
  $seed = analytics_normalize_text($payload['seed'] ?? '', 200);
  $character = analytics_normalize_character_payload($payload);
  $stmt = $db->prepare(
    'INSERT INTO analytics_runs (
      run_id, user_email, character_id, character_name, species_id, class_id,
      seed, started_at, status, start_depth, final_depth, deepest_depth, last_heartbeat_at
    ) VALUES (
      :run_id, :user_email, :character_id, :character_name, :species_id, :class_id,
      :seed, :started_at, :status, :start_depth, :final_depth, :deepest_depth, :last_heartbeat_at
    )'
  );
  $stmt->execute([
    ':run_id' => $runId,
    ':user_email' => $userEmail,
    ':character_id' => $character['id'],
    ':character_name' => $character['name'],
    ':species_id' => $character['species_id'],
    ':class_id' => $character['class_id'],
    ':seed' => $seed,
    ':started_at' => $startedAt,
    ':status' => 'active',
    ':start_depth' => $currentDepth,
    ':final_depth' => $currentDepth,
    ':deepest_depth' => analytics_normalize_int($payload['deepest_depth'] ?? $currentDepth, -1, 100000, $currentDepth),
    ':last_heartbeat_at' => analytics_db_now_iso(),
  ]);
}

function analytics_refresh_player_totals(PDO $db, string $userEmail): void
{
  $stmt = $db->prepare(
    'SELECT
      COUNT(*) AS total_runs,
      SUM(CASE WHEN status = \'dead\' THEN 1 ELSE 0 END) AS total_deaths,
      MAX(deepest_depth) AS deepest_depth,
      SUM(turns) AS total_turns,
      SUM(distance_travelled) AS total_distance_travelled,
      SUM(tiles_discovered) AS total_tiles_discovered,
      SUM(damage_dealt) AS total_damage_dealt,
      SUM(damage_taken) AS total_damage_taken,
      SUM(gold_collected) AS total_gold_collected
    FROM analytics_runs
    WHERE user_email = :user_email'
  );
  $stmt->execute([':user_email' => $userEmail]);
  $row = $stmt->fetch() ?: [];
  $upsert = $db->prepare(
    'INSERT INTO analytics_player_totals (
      user_email, total_runs, total_deaths, deepest_depth, total_turns,
      total_distance_travelled, total_tiles_discovered, total_damage_dealt,
      total_damage_taken, total_gold_collected, updated_at
    ) VALUES (
      :user_email, :total_runs, :total_deaths, :deepest_depth, :total_turns,
      :total_distance_travelled, :total_tiles_discovered, :total_damage_dealt,
      :total_damage_taken, :total_gold_collected, :updated_at
    )
    ON CONFLICT(user_email) DO UPDATE SET
      total_runs = excluded.total_runs,
      total_deaths = excluded.total_deaths,
      deepest_depth = excluded.deepest_depth,
      total_turns = excluded.total_turns,
      total_distance_travelled = excluded.total_distance_travelled,
      total_tiles_discovered = excluded.total_tiles_discovered,
      total_damage_dealt = excluded.total_damage_dealt,
      total_damage_taken = excluded.total_damage_taken,
      total_gold_collected = excluded.total_gold_collected,
      updated_at = excluded.updated_at'
  );
  $upsert->execute([
    ':user_email' => $userEmail,
    ':total_runs' => analytics_normalize_int($row['total_runs'] ?? 0),
    ':total_deaths' => analytics_normalize_int($row['total_deaths'] ?? 0),
    ':deepest_depth' => analytics_normalize_int($row['deepest_depth'] ?? 0, -1),
    ':total_turns' => analytics_normalize_int($row['total_turns'] ?? 0),
    ':total_distance_travelled' => analytics_normalize_int($row['total_distance_travelled'] ?? 0),
    ':total_tiles_discovered' => analytics_normalize_int($row['total_tiles_discovered'] ?? 0),
    ':total_damage_dealt' => analytics_normalize_int($row['total_damage_dealt'] ?? 0),
    ':total_damage_taken' => analytics_normalize_int($row['total_damage_taken'] ?? 0),
    ':total_gold_collected' => analytics_normalize_int($row['total_gold_collected'] ?? 0),
    ':updated_at' => analytics_db_now_iso(),
  ]);
}

function analytics_write_run_start(PDO $db, string $userEmail, array $payload): array
{
  $runId = analytics_require_run_id($payload);
  analytics_assert_run_owner($db, $runId, $userEmail);

  $character = analytics_normalize_character_payload($payload);
  $currentDepth = analytics_normalize_int($payload['current_depth'] ?? 0, -1, 100000, 0);
  $deepestDepth = analytics_normalize_int($payload['deepest_depth'] ?? $currentDepth, -1, 100000, $currentDepth);
  $startedAt = analytics_iso_from_ms($payload['started_at_ms'] ?? null, analytics_db_now_iso());

  $stmt = $db->prepare(
    'INSERT INTO analytics_runs (
      run_id, user_email, character_id, character_name, species_id, class_id,
      seed, started_at, status, start_depth, final_depth, deepest_depth, last_heartbeat_at
    ) VALUES (
      :run_id, :user_email, :character_id, :character_name, :species_id, :class_id,
      :seed, :started_at, :status, :start_depth, :final_depth, :deepest_depth, :last_heartbeat_at
    )
    ON CONFLICT(run_id) DO UPDATE SET
      character_id = excluded.character_id,
      character_name = excluded.character_name,
      species_id = excluded.species_id,
      class_id = excluded.class_id,
      seed = excluded.seed,
      started_at = CASE WHEN analytics_runs.started_at = \'\' THEN excluded.started_at ELSE analytics_runs.started_at END,
      status = CASE WHEN analytics_runs.ended_at = \'\' THEN \'active\' ELSE analytics_runs.status END,
      start_depth = CASE WHEN analytics_runs.start_depth = 0 THEN excluded.start_depth ELSE analytics_runs.start_depth END,
      final_depth = excluded.final_depth,
      deepest_depth = MAX(analytics_runs.deepest_depth, excluded.deepest_depth),
      last_heartbeat_at = excluded.last_heartbeat_at'
  );
  $stmt->execute([
    ':run_id' => $runId,
    ':user_email' => $userEmail,
    ':character_id' => $character['id'],
    ':character_name' => $character['name'],
    ':species_id' => $character['species_id'],
    ':class_id' => $character['class_id'],
    ':seed' => analytics_normalize_text($payload['seed'] ?? '', 200),
    ':started_at' => $startedAt,
    ':status' => 'active',
    ':start_depth' => $currentDepth,
    ':final_depth' => $currentDepth,
    ':deepest_depth' => $deepestDepth,
    ':last_heartbeat_at' => analytics_db_now_iso(),
  ]);

  return [
    'run_id' => $runId,
    'status' => 'active',
    'started_at' => $startedAt,
  ];
}

function analytics_write_heartbeat(PDO $db, string $userEmail, array $payload): array
{
  $runId = analytics_require_run_id($payload);
  analytics_assert_run_owner($db, $runId, $userEmail);
  analytics_ensure_run_stub($db, $runId, $userEmail, $payload);

  $counters = analytics_normalize_counter_bag($payload['counters'] ?? []);
  $currentDepth = analytics_normalize_int($payload['current_depth'] ?? 0, -1, 100000, 0);
  $deepestDepth = analytics_normalize_int($payload['deepest_depth'] ?? $currentDepth, -1, 100000, $currentDepth);
  $heartbeatAt = analytics_db_now_iso();

  $stmt = $db->prepare(
    'UPDATE analytics_runs SET
      seed = CASE WHEN :seed = \'\' THEN seed ELSE :seed END,
      final_depth = :final_depth,
      deepest_depth = MAX(deepest_depth, :deepest_depth),
      turns = :turns,
      moves = :moves,
      waits = :waits,
      attacks = :attacks,
      distance_travelled = :distance_travelled,
      tiles_discovered = :tiles_discovered,
      chunks_discovered = :chunks_discovered,
      doors_opened = :doors_opened,
      doors_closed = :doors_closed,
      shrines_used = :shrines_used,
      chests_opened = :chests_opened,
      traps_triggered = :traps_triggered,
      traps_disarmed = :traps_disarmed,
      damage_dealt = :damage_dealt,
      damage_taken = :damage_taken,
      healing_received = :healing_received,
      gold_collected = :gold_collected,
      gold_spent = :gold_spent,
      last_heartbeat_at = :last_heartbeat_at,
      status = CASE WHEN ended_at = \'\' THEN \'active\' ELSE status END
    WHERE run_id = :run_id AND user_email = :user_email'
  );
  $stmt->execute([
    ':seed' => analytics_normalize_text($payload['seed'] ?? '', 200),
    ':final_depth' => $currentDepth,
    ':deepest_depth' => $deepestDepth,
    ':turns' => $counters['turns'],
    ':moves' => $counters['moves'],
    ':waits' => $counters['waits'],
    ':attacks' => $counters['attacks'],
    ':distance_travelled' => $counters['distanceTravelled'],
    ':tiles_discovered' => $counters['tilesDiscovered'],
    ':chunks_discovered' => $counters['chunksDiscovered'],
    ':doors_opened' => $counters['doorsOpened'],
    ':doors_closed' => $counters['doorsClosed'],
    ':shrines_used' => $counters['shrinesUsed'],
    ':chests_opened' => $counters['chestsOpened'],
    ':traps_triggered' => $counters['trapsTriggered'],
    ':traps_disarmed' => $counters['trapsDisarmed'],
    ':damage_dealt' => $counters['damageDealt'],
    ':damage_taken' => $counters['damageTaken'],
    ':healing_received' => $counters['healingReceived'],
    ':gold_collected' => $counters['goldCollected'],
    ':gold_spent' => $counters['goldSpent'],
    ':last_heartbeat_at' => $heartbeatAt,
    ':run_id' => $runId,
    ':user_email' => $userEmail,
  ]);

  $floorRows = is_array($payload['floors'] ?? null) ? $payload['floors'] : [];
  $floorStmt = $db->prepare(
    'INSERT INTO analytics_run_depths (
      run_id, depth, entered_at, left_at, active_seconds, turns, moves,
      distance_travelled, tiles_discovered, chunks_discovered, damage_dealt,
      damage_taken, shrines_used, chests_opened, traps_triggered, traps_disarmed, kills_json
    ) VALUES (
      :run_id, :depth, :entered_at, :left_at, :active_seconds, :turns, :moves,
      :distance_travelled, :tiles_discovered, :chunks_discovered, :damage_dealt,
      :damage_taken, :shrines_used, :chests_opened, :traps_triggered, :traps_disarmed, :kills_json
    )
    ON CONFLICT(run_id, depth) DO UPDATE SET
      entered_at = CASE WHEN analytics_run_depths.entered_at = \'\' THEN excluded.entered_at ELSE analytics_run_depths.entered_at END,
      left_at = excluded.left_at,
      active_seconds = excluded.active_seconds,
      turns = excluded.turns,
      moves = excluded.moves,
      distance_travelled = excluded.distance_travelled,
      tiles_discovered = excluded.tiles_discovered,
      chunks_discovered = excluded.chunks_discovered,
      damage_dealt = excluded.damage_dealt,
      damage_taken = excluded.damage_taken,
      shrines_used = excluded.shrines_used,
      chests_opened = excluded.chests_opened,
      traps_triggered = excluded.traps_triggered,
      traps_disarmed = excluded.traps_disarmed,
      kills_json = excluded.kills_json'
  );

  foreach ($floorRows as $depthKey => $floorRaw) {
    if (!is_array($floorRaw)) {
      continue;
    }
    $depth = analytics_normalize_int($depthKey, -1, 100000, -1);
    if ($depth < -1) {
      continue;
    }
    $killsJson = '{}';
    if (is_array($floorRaw['killsByType'] ?? null)) {
      $json = json_encode($floorRaw['killsByType'], JSON_UNESCAPED_SLASHES);
      if (is_string($json) && $json !== '') {
        $killsJson = $json;
      }
    }
    $floorStmt->execute([
      ':run_id' => $runId,
      ':depth' => $depth,
      ':entered_at' => analytics_iso_from_ms($floorRaw['enteredAtMs'] ?? null, $heartbeatAt),
      ':left_at' => $depth === $currentDepth ? '' : $heartbeatAt,
      ':active_seconds' => analytics_normalize_int($floorRaw['activeSecondsApprox'] ?? 0),
      ':turns' => analytics_normalize_int($floorRaw['turns'] ?? 0),
      ':moves' => analytics_normalize_int($floorRaw['moves'] ?? 0),
      ':distance_travelled' => analytics_normalize_int($floorRaw['distanceTravelled'] ?? 0),
      ':tiles_discovered' => analytics_normalize_int($floorRaw['tilesDiscovered'] ?? 0),
      ':chunks_discovered' => analytics_normalize_int($floorRaw['chunksDiscovered'] ?? 0),
      ':damage_dealt' => analytics_normalize_int($floorRaw['damageDealt'] ?? 0),
      ':damage_taken' => analytics_normalize_int($floorRaw['damageTaken'] ?? 0),
      ':shrines_used' => analytics_normalize_int($floorRaw['shrinesUsed'] ?? 0),
      ':chests_opened' => analytics_normalize_int($floorRaw['chestsOpened'] ?? 0),
      ':traps_triggered' => analytics_normalize_int($floorRaw['trapsTriggered'] ?? 0),
      ':traps_disarmed' => analytics_normalize_int($floorRaw['trapsDisarmed'] ?? 0),
      ':kills_json' => $killsJson,
    ]);
  }

  return [
    'run_id' => $runId,
    'status' => 'active',
    'last_heartbeat_at' => $heartbeatAt,
  ];
}

function analytics_write_event_batch(PDO $db, string $userEmail, array $payload): array
{
  $runId = analytics_require_run_id($payload);
  analytics_assert_run_owner($db, $runId, $userEmail);
  analytics_ensure_run_stub($db, $runId, $userEmail, $payload);

  $events = is_array($payload['events'] ?? null) ? $payload['events'] : [];
  $stmt = $db->prepare(
    'INSERT OR IGNORE INTO analytics_events (
      run_id, seq, event_time, depth, x, y, event_type, payload_json
    ) VALUES (
      :run_id, :seq, :event_time, :depth, :x, :y, :event_type, :payload_json
    )'
  );
  $inserted = 0;
  foreach ($events as $eventRaw) {
    if (!is_array($eventRaw)) {
      continue;
    }
    $eventType = analytics_normalize_text($eventRaw['type'] ?? '', 120);
    $seq = analytics_normalize_int($eventRaw['seq'] ?? 0);
    if ($eventType === '' || $seq <= 0) {
      continue;
    }
    $payloadJson = '{}';
    if (is_array($eventRaw['payload'] ?? null)) {
      $json = json_encode($eventRaw['payload'], JSON_UNESCAPED_SLASHES);
      if (is_string($json) && $json !== '') {
        $payloadJson = $json;
      }
    }
    $stmt->execute([
      ':run_id' => $runId,
      ':seq' => $seq,
      ':event_time' => analytics_iso_from_ms($eventRaw['ts'] ?? null, analytics_db_now_iso()),
      ':depth' => analytics_normalize_int($eventRaw['depth'] ?? 0, -1, 100000, 0),
      ':x' => array_key_exists('x', $eventRaw) && $eventRaw['x'] !== null ? analytics_normalize_int($eventRaw['x'], -100000, 100000, 0) : null,
      ':y' => array_key_exists('y', $eventRaw) && $eventRaw['y'] !== null ? analytics_normalize_int($eventRaw['y'], -100000, 100000, 0) : null,
      ':event_type' => $eventType,
      ':payload_json' => $payloadJson,
    ]);
    $inserted += $stmt->rowCount() > 0 ? 1 : 0;
  }

  return [
    'run_id' => $runId,
    'inserted' => $inserted,
  ];
}

function analytics_write_run_end(PDO $db, string $userEmail, array $payload): array
{
  $runId = analytics_require_run_id($payload);
  analytics_assert_run_owner($db, $runId, $userEmail);
  analytics_write_heartbeat($db, $userEmail, $payload);

  $endedAt = analytics_db_now_iso();
  $stmt = $db->prepare(
    'UPDATE analytics_runs SET
      status = :status,
      ended_at = :ended_at,
      death_cause = :death_cause,
      death_killer_type = :death_killer_type,
      final_depth = :final_depth,
      deepest_depth = MAX(deepest_depth, :deepest_depth),
      last_heartbeat_at = :last_heartbeat_at
    WHERE run_id = :run_id AND user_email = :user_email'
  );
  $stmt->execute([
    ':status' => analytics_normalize_text($payload['status'] ?? 'ended', 40) ?: 'ended',
    ':ended_at' => $endedAt,
    ':death_cause' => analytics_normalize_text($payload['death_cause'] ?? '', 120),
    ':death_killer_type' => analytics_normalize_text($payload['death_killer_type'] ?? '', 120),
    ':final_depth' => analytics_normalize_int($payload['current_depth'] ?? 0, -1, 100000, 0),
    ':deepest_depth' => analytics_normalize_int($payload['deepest_depth'] ?? 0, -1, 100000, 0),
    ':last_heartbeat_at' => $endedAt,
    ':run_id' => $runId,
    ':user_email' => $userEmail,
  ]);

  analytics_refresh_player_totals($db, $userEmail);

  return [
    'run_id' => $runId,
    'status' => analytics_normalize_text($payload['status'] ?? 'ended', 40) ?: 'ended',
    'ended_at' => $endedAt,
  ];
}
