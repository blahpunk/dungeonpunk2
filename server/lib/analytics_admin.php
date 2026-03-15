<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'analytics_db.php';

function is_analytics_admin(?string $userEmail): bool
{
  $email = strtolower(trim((string) ($userEmail ?? '')));
  if ($email === '') {
    return false;
  }
  $configured = [];
  if (defined('ADMIN_EMAIL')) {
    $configured[] = strtolower(trim((string) constant('ADMIN_EMAIL')));
  }
  $extra = trim((string) getenv('DUNGEON25_ANALYTICS_ADMINS'));
  if ($extra !== '') {
    foreach (explode(',', $extra) as $part) {
      $value = strtolower(trim($part));
      if ($value !== '') {
        $configured[] = $value;
      }
    }
  }
  return in_array($email, array_values(array_unique($configured)), true);
}

/**
 * @return array<string, mixed>
 */
function analytics_admin_overview(PDO $db): array
{
  $summary = [
    'active_runs' => 0,
    'runs_today' => 0,
    'average_run_seconds' => 0,
    'average_deepest_depth' => 0,
  ];
  $summaryRow = $db->query(
    "SELECT
      SUM(CASE WHEN status = 'active' AND (ended_at = '' OR ended_at IS NULL) THEN 1 ELSE 0 END) AS active_runs,
      SUM(CASE WHEN date(started_at) = date('now') THEN 1 ELSE 0 END) AS runs_today,
      AVG(CASE
        WHEN started_at = '' THEN NULL
        WHEN ended_at <> '' THEN (strftime('%s', ended_at) - strftime('%s', started_at))
        WHEN last_heartbeat_at <> '' THEN (strftime('%s', last_heartbeat_at) - strftime('%s', started_at))
        ELSE NULL
      END) AS average_run_seconds,
      AVG(deepest_depth) AS average_deepest_depth
    FROM analytics_runs"
  )->fetch() ?: [];
  foreach ($summary as $key => $value) {
    $summary[$key] = (int) round((float) ($summaryRow[$key] ?? $value));
  }

  $deathsByDepth = $db->query(
    "SELECT final_depth AS depth, COUNT(*) AS count
    FROM analytics_runs
    WHERE status = 'dead'
    GROUP BY final_depth
    ORDER BY final_depth DESC
    LIMIT 20"
  )->fetchAll() ?: [];

  $classes = $db->query(
    "SELECT class_id, COUNT(*) AS count
    FROM analytics_runs
    WHERE class_id <> ''
    GROUP BY class_id
    ORDER BY count DESC, class_id ASC
    LIMIT 12"
  )->fetchAll() ?: [];

  $trapDepths = $db->query(
    "SELECT depth, SUM(traps_triggered) AS triggers
    FROM analytics_run_depths
    GROUP BY depth
    HAVING triggers > 0
    ORDER BY triggers DESC, depth DESC
    LIMIT 12"
  )->fetchAll() ?: [];

  $rates = $db->query(
    "SELECT
      AVG(CASE WHEN turns > 0 THEN shrines_used ELSE NULL END) AS shrine_rate,
      AVG(CASE WHEN turns > 0 THEN chests_opened ELSE NULL END) AS chest_rate
    FROM analytics_runs"
  )->fetch() ?: [];

  return [
    'summary' => $summary,
    'deaths_by_depth' => $deathsByDepth,
    'most_used_classes' => $classes,
    'trap_depths' => $trapDepths,
    'rates' => [
      'shrine_rate' => round((float) ($rates['shrine_rate'] ?? 0), 2),
      'chest_rate' => round((float) ($rates['chest_rate'] ?? 0), 2),
    ],
  ];
}

/**
 * @return array<int, array<string, mixed>>
 */
function analytics_admin_live_sessions(PDO $db, int $limit = 30): array
{
  $stmt = $db->prepare(
    "SELECT
      r.run_id,
      r.user_email,
      r.character_name,
      r.class_id,
      r.species_id,
      r.seed,
      r.final_depth,
      r.deepest_depth,
      r.turns,
      r.last_heartbeat_at,
      (
        SELECT event_type
        FROM analytics_events e
        WHERE e.run_id = r.run_id
        ORDER BY e.seq DESC
        LIMIT 1
      ) AS latest_event
    FROM analytics_runs r
    WHERE r.status = 'active' AND (r.ended_at = '' OR r.ended_at IS NULL)
    ORDER BY r.last_heartbeat_at DESC, r.started_at DESC
    LIMIT :limit"
  );
  $stmt->bindValue(':limit', max(1, min(100, $limit)), PDO::PARAM_INT);
  $stmt->execute();
  return $stmt->fetchAll() ?: [];
}

/**
 * @return array{run: array<string, mixed>|null, depths: array<int, array<string, mixed>>, events: array<int, array<string, mixed>>}
 */
function analytics_admin_run(PDO $db, string $runId): array
{
  $runStmt = $db->prepare('SELECT * FROM analytics_runs WHERE run_id = :run_id LIMIT 1');
  $runStmt->execute([':run_id' => $runId]);
  $run = $runStmt->fetch() ?: null;

  $depthStmt = $db->prepare('SELECT * FROM analytics_run_depths WHERE run_id = :run_id ORDER BY depth ASC');
  $depthStmt->execute([':run_id' => $runId]);
  $depths = $depthStmt->fetchAll() ?: [];

  $eventStmt = $db->prepare('SELECT * FROM analytics_events WHERE run_id = :run_id ORDER BY seq ASC LIMIT 500');
  $eventStmt->execute([':run_id' => $runId]);
  $events = $eventStmt->fetchAll() ?: [];

  return [
    'run' => is_array($run) ? $run : null,
    'depths' => $depths,
    'events' => $events,
  ];
}

/**
 * @return array<string, mixed>
 */
function analytics_admin_player(PDO $db, string $userEmail): array
{
  $email = strtolower(trim($userEmail));
  $totalsStmt = $db->prepare('SELECT * FROM analytics_player_totals WHERE user_email = :user_email LIMIT 1');
  $totalsStmt->execute([':user_email' => $email]);
  $totals = $totalsStmt->fetch() ?: null;
  if (!is_array($totals)) {
    analytics_refresh_player_totals($db, $email);
    $totalsStmt->execute([':user_email' => $email]);
    $totals = $totalsStmt->fetch() ?: [];
  }

  $classStmt = $db->prepare(
    "SELECT class_id, COUNT(*) AS count
    FROM analytics_runs
    WHERE user_email = :user_email AND class_id <> ''
    GROUP BY class_id
    ORDER BY count DESC, class_id ASC"
  );
  $classStmt->execute([':user_email' => $email]);

  $deathStmt = $db->prepare(
    "SELECT death_cause, COUNT(*) AS count
    FROM analytics_runs
    WHERE user_email = :user_email AND death_cause <> ''
    GROUP BY death_cause
    ORDER BY count DESC, death_cause ASC"
  );
  $deathStmt->execute([':user_email' => $email]);

  $runStmt = $db->prepare(
    "SELECT run_id, character_name, class_id, species_id, status, started_at, ended_at, final_depth, deepest_depth, turns
    FROM analytics_runs
    WHERE user_email = :user_email
    ORDER BY started_at DESC
    LIMIT 40"
  );
  $runStmt->execute([':user_email' => $email]);

  return [
    'user_email' => $email,
    'totals' => is_array($totals) ? $totals : [],
    'class_usage' => $classStmt->fetchAll() ?: [],
    'death_causes' => $deathStmt->fetchAll() ?: [],
    'recent_runs' => $runStmt->fetchAll() ?: [],
  ];
}
