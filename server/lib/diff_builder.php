<?php
declare(strict_types=1);

/**
 * @param array<string, mixed> $session
 * @param array<string, mixed> $snapshot
 * @param array<string, mixed> $options
 * @return array<string, mixed>
 */
function authoritative_build_snapshot_response(array $session, array $snapshot, array $options = []): array
{
  if (function_exists('authoritative_shop_apply_shared_to_snapshot')) {
    $snapshot = authoritative_shop_apply_shared_to_snapshot($snapshot);
  }

  $snapshotOut = $snapshot;
  if (!empty($options['strip_snapshot_payload'])) {
    $omitSnapshotLogEvents = !empty($options['omit_snapshot_log_events']);
    $snapshotOut = [
      'character' => $snapshot['character'] ?? null,
      'summary' => $snapshot['summary'] ?? null,
    ];
    if (!$omitSnapshotLogEvents) {
      $snapshotOut['log'] = array_values(is_array($snapshot['log'] ?? null) ? $snapshot['log'] : []);
      $snapshotOut['events'] = array_values(is_array($snapshot['events'] ?? null) ? $snapshot['events'] : []);
    }
  }

  $acceptedCommandSeq = max(
    0,
    (int) ($options['accepted_command_seq'] ?? ($session['last_command_seq'] ?? 0))
  );
  $playerView = [
    'character' => $snapshot['character'] ?? null,
    'summary' => $snapshot['summary'] ?? null,
  ];
  if (empty($options['omit_player_view_log'])) {
    $playerView['log'] = $snapshot['log'] ?? [];
  }
  $uiHints = array_merge(
    [
      'inputLocked' => false,
      'duplicate' => !empty($options['duplicate']),
    ],
    (is_array($options['ui_hints'] ?? null) ? $options['ui_hints'] : [])
  );

  $response = [
    'ok' => !empty($options['ok']) || !isset($options['ok']),
    'sessionId' => (string) ($session['session_id'] ?? ''),
    'serverRevision' => max(0, (int) ($session['server_revision'] ?? 0)),
    'acceptedCommandSeq' => $acceptedCommandSeq,
    'events' => !empty($options['omit_top_level_events'])
      ? []
      : array_values(is_array($snapshot['events'] ?? null) ? $snapshot['events'] : []),
    'diff' => (is_array($options['diff'] ?? null) ? $options['diff'] : null),
    'snapshot' => $snapshotOut,
    'playerView' => $playerView,
    'uiHints' => $uiHints,
    'tick' => (is_array($options['tick'] ?? null) ? $options['tick'] : null),
    'perf' => (is_array($options['perf'] ?? null) ? $options['perf'] : null),
    'hotDelta' => (is_array($options['hot_delta'] ?? null) ? $options['hot_delta'] : null),
  ];

  if (isset($options['save']) && is_array($options['save'])) {
    $response['save'] = $options['save'];
  }
  if (isset($options['saves']) && is_array($options['saves'])) {
    $response['saves'] = $options['saves'];
  }
  if (isset($options['character']) && is_array($options['character'])) {
    $response['character'] = $options['character'];
  }
  if (isset($options['message']) && trim((string) $options['message']) !== '') {
    $response['message'] = trim((string) $options['message']);
  }
  if (isset($options['error']) && trim((string) $options['error']) !== '') {
    $response['error'] = trim((string) $options['error']);
  }

  return $response;
}
