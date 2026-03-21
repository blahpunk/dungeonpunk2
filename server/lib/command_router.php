<?php
declare(strict_types=1);

if (!function_exists('authoritative_shop_bind_payload_to_shared')) {
  require_once __DIR__ . DIRECTORY_SEPARATOR . 'shop_manager.php';
}

function authoritative_release_php_session_lock(): void
{
  if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
  }
}

/**
 * @param array<string, mixed> $session
 * @param array<string, mixed> $snapshot
 * @param array<string, mixed> $runRecord
 * @return array<string, mixed>
 */
function authoritative_persist_canonical_snapshot(
  string $userEmail,
  string $saveSecret,
  array $session,
  array $snapshot,
  array $runRecord = [],
  array $options = []
): array {
  $opts = $options;
  $payload = trim((string) ($snapshot['payload'] ?? ''));
  $characterId = normalize_character_profile_id((string) ($snapshot['character']['id'] ?? ($session['character_id'] ?? '')));
  $characterName = trim((string) ($snapshot['character']['name'] ?? 'Adventurer'));
  if ($payload !== '' && function_exists('authoritative_shop_bind_payload_to_shared')) {
    $payload = authoritative_shop_bind_payload_to_shared($payload);
    $snapshot['payload'] = $payload;
  }
  if ($payload === '') {
    throw new RuntimeException('Missing authoritative snapshot payload.');
  }

  $nextRecord = [
    'payload' => $payload,
    'active_character_id' => $characterId,
    'server_revision' => max(0, (int) ($session['server_revision'] ?? ($runRecord['server_revision'] ?? 0))),
  ];
  if (!authoritative_persist_run_record($userEmail, $nextRecord)) {
    throw new RuntimeException('Could not persist canonical run state.');
  }

  $characterSnapshotPayload = trim((string) ($snapshot['characterSnapshotPayload'] ?? ''));
  $persistCharacterState = !array_key_exists('persist_character_state', $opts) || !empty($opts['persist_character_state']);
  if ($persistCharacterState && $characterId !== '' && $characterSnapshotPayload !== '') {
    authoritative_persist_character_state_payload(
      $userEmail,
      $saveSecret,
      $characterId,
      $characterSnapshotPayload,
      $characterName !== '' ? $characterName : 'Adventurer'
    );
  }

  return $nextRecord;
}

/**
 * @param array<string, mixed> $session
 * @param array<string, mixed> $snapshot
 */
function authoritative_should_persist_character_snapshot_checkpoint(array $session, array $snapshot): bool
{
  $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
  $x = array_key_exists('x', $summary) ? (int) $summary['x'] : null;
  $y = array_key_exists('y', $summary) ? (int) $summary['y'] : null;
  $z = array_key_exists('depth', $summary) ? (int) $summary['depth'] : null;
  if (!is_int($x) || !is_int($y) || !is_int($z)) {
    return true;
  }

  $lastX = array_key_exists('last_character_checkpoint_x', $session) ? (int) $session['last_character_checkpoint_x'] : null;
  $lastY = array_key_exists('last_character_checkpoint_y', $session) ? (int) $session['last_character_checkpoint_y'] : null;
  $lastZ = array_key_exists('last_character_checkpoint_z', $session) ? (int) $session['last_character_checkpoint_z'] : null;
  $lastAtMs = max(0, (int) ($session['last_character_checkpoint_at_ms'] ?? 0));
  $nowMs = (int) floor(microtime(true) * 1000);

  if (!is_int($lastX) || !is_int($lastY) || !is_int($lastZ) || $lastAtMs <= 0) {
    return true;
  }
  if ($lastZ !== $z) {
    return true;
  }
  $dist = abs($x - $lastX) + abs($y - $lastY);
  if ($dist >= 3) {
    return true;
  }
  return ($nowMs - $lastAtMs) >= 750;
}

/**
 * @param array<string, mixed> $session
 * @param array<string, mixed> $snapshot
 */
function authoritative_should_persist_canonical_snapshot_checkpoint(array $session, array $snapshot): bool
{
  $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
  $x = array_key_exists('x', $summary) ? (int) $summary['x'] : null;
  $y = array_key_exists('y', $summary) ? (int) $summary['y'] : null;
  $z = array_key_exists('depth', $summary) ? (int) $summary['depth'] : null;
  if (!is_int($x) || !is_int($y) || !is_int($z)) {
    return true;
  }

  $lastX = array_key_exists('last_canonical_checkpoint_x', $session) ? (int) $session['last_canonical_checkpoint_x'] : null;
  $lastY = array_key_exists('last_canonical_checkpoint_y', $session) ? (int) $session['last_canonical_checkpoint_y'] : null;
  $lastZ = array_key_exists('last_canonical_checkpoint_z', $session) ? (int) $session['last_canonical_checkpoint_z'] : null;
  $lastAtMs = max(0, (int) ($session['last_canonical_checkpoint_at_ms'] ?? 0));
  $nowMs = (int) floor(microtime(true) * 1000);

  if (!is_int($lastX) || !is_int($lastY) || !is_int($lastZ) || $lastAtMs <= 0) {
    return true;
  }
  if ($lastZ !== $z) {
    return true;
  }
  $dist = abs($x - $lastX) + abs($y - $lastY);
  if ($dist >= 4) {
    return true;
  }
  return ($nowMs - $lastAtMs) >= 900;
}

/**
 * @param array<string, mixed> $session
 * @param array<string, mixed> $snapshot
 */
function authoritative_update_canonical_snapshot_checkpoint(array &$session, array $snapshot): void
{
  $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
  $session['last_canonical_checkpoint_x'] = (int) ($summary['x'] ?? 0);
  $session['last_canonical_checkpoint_y'] = (int) ($summary['y'] ?? 0);
  $session['last_canonical_checkpoint_z'] = (int) ($summary['depth'] ?? 0);
  $session['last_canonical_checkpoint_at_ms'] = (int) floor(microtime(true) * 1000);
}

/**
 * @param array<string, mixed> $session
 * @param array<string, mixed> $snapshot
 */
function authoritative_update_character_snapshot_checkpoint(array &$session, array $snapshot): void
{
  $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
  $session['last_character_checkpoint_x'] = (int) ($summary['x'] ?? 0);
  $session['last_character_checkpoint_y'] = (int) ($summary['y'] ?? 0);
  $session['last_character_checkpoint_z'] = (int) ($summary['depth'] ?? 0);
  $session['last_character_checkpoint_at_ms'] = (int) floor(microtime(true) * 1000);
}

/**
 * @param array<string, mixed> $options
 * @return array<string, mixed>
 */
function authoritative_open_session_for_character(
  string $userEmail,
  string $saveSecret,
  string $characterId,
  array $options = []
): array {
  authoritative_release_php_session_lock();
  $requestedCharacterId = normalize_character_profile_id($characterId);
  $browserInstanceId = authoritative_normalize_browser_instance_id((string) ($options['browser_instance_id'] ?? ''));
  if ($requestedCharacterId !== '' && $browserInstanceId !== '') {
    $existingSession = authoritative_find_browser_character_session($userEmail, $requestedCharacterId, $browserInstanceId);
    if (is_array($existingSession)) {
      $existingSessionId = authoritative_normalize_session_id((string) ($existingSession['session_id'] ?? ''));
      if ($existingSessionId !== '') {
        $loaded = authoritative_load_session_snapshot($userEmail, $existingSessionId);
        $session = $loaded['session'];
        $snapshot = $loaded['snapshot'];
        authoritative_clear_pending_close($session);
        if (!authoritative_persist_session($session)) {
          throw new RuntimeException('Could not refresh authoritative session.');
        }
        return authoritative_build_snapshot_response($session, $snapshot, [
          'message' => 'Authoritative session resumed.',
        ]);
      }
    }
  }
  $context = authoritative_bootstrap_context($userEmail, $saveSecret, $characterId, $options);
  $snapshotResponse = authoritative_worker_bootstrap(
    (string) ($context['world_payload'] ?? ''),
    (string) ($context['character_payload'] ?? ''),
    [
      'force_entrance' => !empty($options['force_entrance']),
      'live_tick_combat' => $options['live_tick_combat'] ?? null,
    ]
  );
  $snapshot = is_array($snapshotResponse['snapshot'] ?? null) ? $snapshotResponse['snapshot'] : null;
  if (!is_array($snapshot)) {
    throw new RuntimeException('Could not bootstrap authoritative snapshot.');
  }

  $resolvedCharacterId = normalize_character_profile_id((string) ($snapshot['character']['id'] ?? ($context['character_id'] ?? '')));
  if ($resolvedCharacterId !== '') {
    authoritative_close_matching_browser_character_sessions($userEmail, $resolvedCharacterId, $browserInstanceId);
    $conflict = authoritative_find_character_session_conflict($userEmail, $resolvedCharacterId, $browserInstanceId);
    if (is_array($conflict)) {
      throw new RuntimeException('This character is already active in another browser instance. Choose a different character.');
    }
  }
  $session = authoritative_create_session(
    $userEmail,
    $resolvedCharacterId,
    max(0, (int) ($context['server_revision'] ?? 0)),
    $browserInstanceId
  );
  authoritative_persist_canonical_snapshot($userEmail, $saveSecret, $session, $snapshot, (array) ($context['run_record'] ?? []));
  try {
    authoritative_worker_snapshot((string) ($snapshot['payload'] ?? ''), (string) ($session['session_id'] ?? ''));
  } catch (RuntimeException $err) {
    // Non-fatal: the canonical snapshot is already persisted, but caching the
    // live session state here makes same-browser refresh resume exact position.
  }
  if (!authoritative_persist_session($session)) {
    throw new RuntimeException('Could not persist authoritative session.');
  }
  return authoritative_build_snapshot_response($session, $snapshot, [
    'message' => 'Authoritative session ready.',
  ]);
}

/**
 * @return array{session: array<string, mixed>}
 */
function authoritative_load_session_context(
  string $userEmail,
  string $sessionId
): array {
  $session = authoritative_load_session($sessionId, $userEmail);
  if (!is_array($session)) {
    throw new RuntimeException('Authoritative session not found.');
  }
  return [
    'session' => $session,
  ];
}

function authoritative_bind_run_payload_for_worker(string $payload): string
{
  $worldPayload = trim($payload);
  if ($worldPayload !== '' && function_exists('authoritative_shop_bind_payload_to_shared')) {
    $worldPayload = authoritative_shop_bind_payload_to_shared($worldPayload);
  }
  return $worldPayload;
}

/**
 * @return array{session: array<string, mixed>, run_record: array<string, mixed>}
 */
function authoritative_load_session_run_context(
  string $userEmail,
  string $sessionId
): array {
  $loaded = authoritative_load_session_context($userEmail, $sessionId);
  $session = $loaded['session'];
  $runRecord = authoritative_load_run_record($userEmail);
  if (!is_array($runRecord) || trim((string) ($runRecord['payload'] ?? '')) === '') {
    throw new RuntimeException('Canonical run state not found.');
  }
  return [
    'session' => $session,
    'run_record' => $runRecord,
  ];
}

/**
 * @return array{session: array<string, mixed>, run_record: array<string, mixed>, snapshot: array<string, mixed>}
 */
function authoritative_load_session_snapshot(
  string $userEmail,
  string $sessionId
): array {
  $context = authoritative_load_session_run_context($userEmail, $sessionId);
  $session = $context['session'];
  $runRecord = $context['run_record'];
  $snapshotResponse = null;
  try {
    $snapshotResponse = authoritative_worker_snapshot('', $sessionId);
  } catch (RuntimeException $err) {
    $snapshotResponse = null;
  }
  if (!is_array($snapshotResponse)) {
    $worldPayload = trim((string) ($runRecord['payload'] ?? ''));
    if ($worldPayload !== '' && function_exists('authoritative_shop_bind_payload_to_shared')) {
      $worldPayload = authoritative_shop_bind_payload_to_shared($worldPayload);
    }
    $snapshotResponse = authoritative_worker_snapshot($worldPayload, $sessionId);
  }
  $snapshot = is_array($snapshotResponse['snapshot'] ?? null) ? $snapshotResponse['snapshot'] : null;
  if (!is_array($snapshot)) {
    throw new RuntimeException('Could not build authoritative snapshot.');
  }
  return [
    'session' => $session,
    'run_record' => $runRecord,
    'snapshot' => $snapshot,
  ];
}

/**
 * @param array<string, mixed> $options
 * @return array<string, mixed>
 */
function authoritative_switch_session_character(
  string $userEmail,
  string $saveSecret,
  string $sessionId,
  string $characterId,
  array $options = []
): array {
  authoritative_release_php_session_lock();
  $loaded = authoritative_load_session_snapshot($userEmail, $sessionId);
  $session = $loaded['session'];
  $sessionIdNorm = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
  $sessionBrowserInstanceId = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
  $runRecord = $loaded['run_record'];
  $snapshot = $loaded['snapshot'];
  $outgoingCharacterId = normalize_character_profile_id((string) ($snapshot['character']['id'] ?? ($session['character_id'] ?? '')));
  $outgoingCharacterPayload = trim((string) ($snapshot['characterSnapshotPayload'] ?? ''));
  if ($outgoingCharacterId !== '' && $outgoingCharacterPayload !== '') {
    authoritative_persist_character_state_payload(
      $userEmail,
      $saveSecret,
      $outgoingCharacterId,
      $outgoingCharacterPayload,
      (string) ($snapshot['character']['name'] ?? 'Adventurer')
    );
  }

  $context = authoritative_bootstrap_context($userEmail, $saveSecret, $characterId, []);
  $targetCharacterPayload = trim((string) ($context['character_payload'] ?? ''));
  if ($targetCharacterPayload === '') {
    throw new RuntimeException('Target character state not found.');
  }
  $targetCharacterId = normalize_character_profile_id($characterId);
  if ($targetCharacterId !== '') {
    authoritative_close_matching_browser_character_sessions(
      $userEmail,
      $targetCharacterId,
      $sessionBrowserInstanceId,
      $sessionIdNorm
    );
    $conflict = authoritative_find_character_session_conflict(
      $userEmail,
      $targetCharacterId,
      $sessionBrowserInstanceId,
      $sessionIdNorm
    );
    if (is_array($conflict)) {
      throw new RuntimeException('That character is already active in another browser instance. Choose a different character.');
    }
  }

  $switchResponse = authoritative_worker_switch_character(
    (string) ($runRecord['payload'] ?? ''),
    $targetCharacterPayload,
    [
      'force_entrance' => !empty($options['force_entrance']),
      'live_tick_combat' => $options['live_tick_combat'] ?? null,
      'session_id' => (string) ($session['session_id'] ?? ''),
    ]
  );
  $nextSnapshot = is_array($switchResponse['snapshot'] ?? null) ? $switchResponse['snapshot'] : null;
  if (!is_array($nextSnapshot)) {
    throw new RuntimeException('Could not switch authoritative character.');
  }
  $session['character_id'] = normalize_character_profile_id((string) ($nextSnapshot['character']['id'] ?? $characterId));
  authoritative_persist_canonical_snapshot($userEmail, $saveSecret, $session, $nextSnapshot, $runRecord);
  if (!authoritative_persist_session($session)) {
    throw new RuntimeException('Could not persist switched authoritative session.');
  }
  return authoritative_build_snapshot_response($session, $nextSnapshot, [
    'message' => 'Character switched.',
  ]);
}

/**
 * @return array<string, mixed>
 */
function authoritative_start_new_dungeon(
  string $userEmail,
  string $saveSecret,
  string $sessionId,
  array $options = []
): array {
  authoritative_release_php_session_lock();
  $loaded = authoritative_load_session_snapshot($userEmail, $sessionId);
  $session = $loaded['session'];
  $runRecord = $loaded['run_record'];
  $snapshot = $loaded['snapshot'];
  $characterPayload = trim((string) ($snapshot['characterSnapshotPayload'] ?? ''));
  if ($characterPayload === '') {
    throw new RuntimeException('Current character state not found.');
  }

  $bootstrapResponse = authoritative_worker_bootstrap('', $characterPayload, [
    'force_entrance' => true,
    'live_tick_combat' => $options['live_tick_combat'] ?? null,
    'session_id' => (string) ($session['session_id'] ?? ''),
  ]);
  $nextSnapshot = is_array($bootstrapResponse['snapshot'] ?? null) ? $bootstrapResponse['snapshot'] : null;
  if (!is_array($nextSnapshot)) {
    throw new RuntimeException('Could not create a fresh authoritative dungeon.');
  }

  $session['character_id'] = normalize_character_profile_id((string) ($nextSnapshot['character']['id'] ?? ($session['character_id'] ?? '')));
  authoritative_persist_canonical_snapshot($userEmail, $saveSecret, $session, $nextSnapshot, $runRecord);
  authoritative_clear_inactive_character_positions_for_new_dungeon(
    $userEmail,
    $saveSecret,
    (string) ($session['character_id'] ?? '')
  );
  if (!authoritative_persist_session($session)) {
    throw new RuntimeException('Could not persist authoritative new dungeon session.');
  }

  return authoritative_build_snapshot_response($session, $nextSnapshot, [
    'message' => 'New dungeon ready.',
  ]);
}

/**
 * @param array<string, mixed> $command
 * @return array<string, mixed>
 */
function authoritative_handle_command(
  string $userEmail,
  string $saveSecret,
  string $sessionId,
  int $clientCommandSeq,
  array $command
): array {
  authoritative_release_php_session_lock();
  if ($clientCommandSeq <= 0) {
    throw new RuntimeException('Missing client command sequence.');
  }
  $loaded = authoritative_load_session_run_context($userEmail, $sessionId);
  $session = $loaded['session'];
  $runRecord = $loaded['run_record'];
  $sessionCharacterId = normalize_character_profile_id((string) ($session['character_id'] ?? ''));
  $requiresShopLock = function_exists('authoritative_shop_command_requires_lock')
    ? authoritative_shop_command_requires_lock($command)
    : false;
  $sessionIdNorm = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
  $sessionBrowserInstanceId = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));

  $snapshotFromCanonicalPayload = function (array $runRecordInput) use ($sessionIdNorm): array {
    $worldPayload = trim((string) ($runRecordInput['payload'] ?? ''));
    if ($worldPayload !== '' && function_exists('authoritative_shop_bind_payload_to_shared')) {
      $worldPayload = authoritative_shop_bind_payload_to_shared($worldPayload);
    }
    $snapshotResponse = authoritative_worker_snapshot($worldPayload, $sessionIdNorm);
    $snapshot = is_array($snapshotResponse['snapshot'] ?? null) ? $snapshotResponse['snapshot'] : null;
    if (!is_array($snapshot)) {
      throw new RuntimeException('Could not build authoritative snapshot.');
    }
    return $snapshot;
  };
  if ($sessionCharacterId !== '') {
    $conflict = authoritative_find_character_session_conflict(
      $userEmail,
      $sessionCharacterId,
      $sessionBrowserInstanceId,
      $sessionIdNorm
    );
    if (is_array($conflict)) {
      $snapshot = $snapshotFromCanonicalPayload($runRecord);
      return authoritative_build_snapshot_response($session, $snapshot, [
        'ok' => false,
        'accepted_command_seq' => max(0, (int) ($session['last_command_seq'] ?? 0)),
        'error' => 'This character is active in another browser instance. Choose a different character.',
        'ui_hints' => ['resyncRecommended' => true],
      ]);
    }
  }

  $lastSeq = max(0, (int) ($session['last_command_seq'] ?? 0));
  if ($clientCommandSeq < $lastSeq) {
    $snapshot = $snapshotFromCanonicalPayload($runRecord);
    return authoritative_build_snapshot_response($session, $snapshot, [
      'ok' => false,
      'accepted_command_seq' => $lastSeq,
      'error' => 'Stale command sequence.',
      'ui_hints' => ['resyncRecommended' => true],
    ]);
  }
  if ($clientCommandSeq === $lastSeq) {
    $snapshot = $snapshotFromCanonicalPayload($runRecord);
    return authoritative_build_snapshot_response($session, $snapshot, [
      'accepted_command_seq' => $lastSeq,
      'message' => 'Duplicate command ignored.',
      'duplicate' => true,
    ]);
  }

  $execute = function () use (
    $userEmail,
    $saveSecret,
    &$session,
    $runRecord,
    $command,
    $clientCommandSeq,
    $requiresShopLock,
    $sessionIdNorm
  ): array {
    $worldPayload = trim((string) ($runRecord['payload'] ?? ''));
    if ($worldPayload !== '' && function_exists('authoritative_shop_bind_payload_to_shared')) {
      $worldPayload = authoritative_shop_bind_payload_to_shared($worldPayload);
    }
    $result = authoritative_worker_execute_command($worldPayload, $command, '', $sessionIdNorm);
    $snapshot = is_array($result['snapshot'] ?? null) ? $result['snapshot'] : null;
    if (!is_array($snapshot)) {
      throw new RuntimeException('Authoritative command returned no snapshot.');
    }

    $session['last_command_seq'] = $clientCommandSeq;
    $commandOk = !empty($result['ok']);
    if ($commandOk) {
      if ($requiresShopLock && function_exists('authoritative_shop_capture_snapshot')) {
        authoritative_shop_capture_snapshot($snapshot);
      }
      $session['server_revision'] = max(0, (int) ($session['server_revision'] ?? 0)) + 1;
      $session['character_id'] = normalize_character_profile_id((string) ($snapshot['character']['id'] ?? ($session['character_id'] ?? '')));
      authoritative_persist_canonical_snapshot($userEmail, $saveSecret, $session, $snapshot, $runRecord, [
        'persist_character_state' => false,
      ]);
    }
    if (!authoritative_persist_session($session)) {
      throw new RuntimeException('Could not persist authoritative command session.');
    }

    $resultDiff = is_array($result['diff'] ?? null) ? $result['diff'] : null;
    $resultTick = is_array($result['tick'] ?? null) ? $result['tick'] : null;
    $resultPerf = is_array($result['perf'] ?? null) ? $result['perf'] : null;
    $resultHotDelta = is_array($result['hotDelta'] ?? null) ? $result['hotDelta'] : null;
    $sendDiff = $commandOk && is_array($resultDiff);

    return authoritative_build_snapshot_response($session, $snapshot, [
      'ok' => $commandOk,
      'accepted_command_seq' => $clientCommandSeq,
      'error' => $commandOk ? '' : trim((string) ($result['error'] ?? 'Command rejected.')),
      'diff' => $sendDiff ? $resultDiff : null,
      'strip_snapshot_payload' => $sendDiff,
      'tick' => $resultTick,
      'perf' => $resultPerf,
      // Hot delta is useful even when payload diff is unavailable.
      'hot_delta' => $commandOk ? $resultHotDelta : null,
      'save' => null,
      'saves' => [],
    ]);
  };

  if ($requiresShopLock && function_exists('authoritative_shop_with_lock')) {
    return authoritative_shop_with_lock($execute);
  }
  return $execute();
}

/**
 * @return array<string, mixed>
 */
function authoritative_set_movement_intent(
  string $userEmail,
  string $saveSecret,
  string $sessionId,
  string $holdDir = '',
  bool $active = false,
  string $enqueueDir = '',
  int $intentSeq = 0
): array {
  authoritative_release_php_session_lock();
  $loaded = authoritative_load_session_context($userEmail, $sessionId);
  $session = $loaded['session'];
  $sessionIdNorm = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));

  try {
    $result = authoritative_worker_set_movement_intent(
      '',
      $sessionIdNorm,
      $holdDir,
      $active,
      $enqueueDir,
      $intentSeq
    );
  } catch (RuntimeException $err) {
    $runRecord = authoritative_load_run_record($userEmail);
    if (!is_array($runRecord) || trim((string) ($runRecord['payload'] ?? '')) === '') {
      throw $err;
    }
    $worldPayload = authoritative_bind_run_payload_for_worker((string) ($runRecord['payload'] ?? ''));
    $result = authoritative_worker_set_movement_intent(
      $worldPayload,
      $sessionIdNorm,
      $holdDir,
      $active,
      $enqueueDir,
      $intentSeq
    );
  }
  return [
    'ok' => true,
    'sessionId' => $sessionIdNorm,
    'serverRevision' => max(0, (int) ($session['server_revision'] ?? 0)),
    'acceptedCommandSeq' => max(0, (int) ($session['last_command_seq'] ?? 0)),
    'tick' => (is_array($result['tick'] ?? null) ? $result['tick'] : null),
    'intent' => (is_array($result['intent'] ?? null) ? $result['intent'] : null),
  ];
}

/**
 * @return array<string, mixed>
 */
function authoritative_poll_movement(
  string $userEmail,
  string $saveSecret,
  string $sessionId,
  int $timeoutMs = 25000,
  int $minResponseMs = 8
): array {
  authoritative_release_php_session_lock();
  $loaded = authoritative_load_session_context($userEmail, $sessionId);
  $session = $loaded['session'];
  $sessionIdNorm = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));

  try {
    $result = authoritative_worker_poll_movement('', $sessionIdNorm, $timeoutMs, $minResponseMs);
  } catch (RuntimeException $err) {
    $runRecord = authoritative_load_run_record($userEmail);
    if (!is_array($runRecord) || trim((string) ($runRecord['payload'] ?? '')) === '') {
      throw $err;
    }
    $worldPayload = authoritative_bind_run_payload_for_worker((string) ($runRecord['payload'] ?? ''));
    $result = authoritative_worker_poll_movement($worldPayload, $sessionIdNorm, $timeoutMs, $minResponseMs);
  }
  $resultTick = is_array($result['tick'] ?? null) ? $result['tick'] : null;
  $resultPerf = is_array($result['perf'] ?? null) ? $result['perf'] : null;
  $resultIntent = is_array($result['intent'] ?? null) ? $result['intent'] : null;

  if (empty($result['changed'])) {
    return [
      'ok' => true,
      'changed' => false,
      'sessionId' => $sessionIdNorm,
      'serverRevision' => max(0, (int) ($session['server_revision'] ?? 0)),
      'acceptedCommandSeq' => max(0, (int) ($session['last_command_seq'] ?? 0)),
      'tick' => $resultTick,
      'perf' => $resultPerf,
      'intent' => $resultIntent,
    ];
  }

  $snapshot = is_array($result['snapshot'] ?? null) ? $result['snapshot'] : null;
  if (!is_array($snapshot)) {
    throw new RuntimeException('Movement poll returned no snapshot.');
  }

  $moved = !empty($result['ok']);
  if ($moved) {
    $session['server_revision'] = max(0, (int) ($session['server_revision'] ?? 0)) + 1;
    $session['character_id'] = normalize_character_profile_id((string) ($snapshot['character']['id'] ?? ($session['character_id'] ?? '')));
    $persistCanonicalState = authoritative_should_persist_canonical_snapshot_checkpoint($session, $snapshot);
    $persistCharacterState = authoritative_should_persist_character_snapshot_checkpoint($session, $snapshot);
    if ($persistCanonicalState) {
      authoritative_persist_canonical_snapshot($userEmail, $saveSecret, $session, $snapshot, [], [
        'persist_character_state' => $persistCharacterState,
      ]);
      authoritative_update_canonical_snapshot_checkpoint($session, $snapshot);
    }
    if ($persistCharacterState) {
      if (!$persistCanonicalState) {
        authoritative_persist_canonical_snapshot($userEmail, $saveSecret, $session, $snapshot, [], [
          'persist_character_state' => true,
        ]);
        authoritative_update_canonical_snapshot_checkpoint($session, $snapshot);
      }
      authoritative_update_character_snapshot_checkpoint($session, $snapshot);
    }
    if (!authoritative_persist_session($session)) {
      throw new RuntimeException('Could not persist authoritative movement session.');
    }
  }

  $resultDiff = is_array($result['diff'] ?? null) ? $result['diff'] : null;
  $resultHotDelta = is_array($result['hotDelta'] ?? null) ? $result['hotDelta'] : null;
  // For live movement polls, prefer hot deltas over payload diffs so we avoid
  // rebuilding and shipping large payload patches on every streamed step.
  $sendHotDelta = is_array($resultHotDelta);
  $sendDiff = !$sendHotDelta && is_array($resultDiff);

  $response = authoritative_build_snapshot_response($session, $snapshot, [
    'ok' => $moved,
    'accepted_command_seq' => max(0, (int) ($session['last_command_seq'] ?? 0)),
    'error' => $moved ? '' : trim((string) ($result['error'] ?? 'Movement blocked.')),
    'diff' => $sendDiff ? $resultDiff : null,
    'strip_snapshot_payload' => ($sendDiff || $sendHotDelta),
    'omit_snapshot_log_events' => $sendHotDelta,
    'omit_player_view_log' => $sendHotDelta,
    'omit_top_level_events' => $sendHotDelta,
    'tick' => $resultTick,
    'perf' => $resultPerf,
    'hot_delta' => $moved ? ($sendHotDelta ? $resultHotDelta : null) : null,
    'save' => null,
    'saves' => [],
  ]);
  if ($resultIntent !== null) {
    $response['intent'] = $resultIntent;
  }
  $response['changed'] = true;
  return $response;
}

/**
 * @param array<string, mixed> $characterPayload
 * @return array<string, mixed>
 */
function authoritative_create_character_and_enter(
  string $userEmail,
  string $saveSecret,
  string $sessionId,
  string $characterPayload,
  string $characterName = '',
  array $options = []
): array {
  authoritative_release_php_session_lock();
  $payload = trim($characterPayload);
  if ($payload === '') {
    throw new RuntimeException('Missing character payload.');
  }
  if (strlen($payload) > CHARACTER_STATE_PAYLOAD_MAX_LEN) {
    throw new RuntimeException('Character payload is too large.');
  }
  $characterId = authoritative_character_id_from_snapshot_payload($payload, '');
  if ($characterId === '') {
    throw new RuntimeException('Character payload is missing a valid id.');
  }

  $entries = load_user_saves($userEmail, $saveSecret);
  $states = load_user_character_states($userEmail, $saveSecret);
  $knownCharacterIds = collect_user_character_ids($entries, $states);
  if (!isset($knownCharacterIds[$characterId]) && count($knownCharacterIds) >= MAX_SERVER_CHARACTERS) {
    throw new RuntimeException('Character limit reached. Delete an existing character before creating a new one.');
  }

  authoritative_persist_character_state_payload(
    $userEmail,
    $saveSecret,
    $characterId,
    $payload,
    $characterName !== '' ? $characterName : 'Adventurer'
  );
  return authoritative_switch_session_character(
    $userEmail,
    $saveSecret,
    $sessionId,
    $characterId,
    [
      'force_entrance' => true,
      'live_tick_combat' => $options['live_tick_combat'] ?? null,
    ]
  );
}

/**
 * @return array<string, mixed>
 */
function authoritative_manual_save_current_run(
  string $userEmail,
  string $saveSecret,
  string $sessionId,
  string $nameInput = '',
  string $overwriteId = '',
  bool $autosave = false
): array {
  authoritative_release_php_session_lock();
  $loaded = authoritative_load_session_snapshot($userEmail, $sessionId);
  $session = $loaded['session'];
  $snapshot = $loaded['snapshot'];
  $characterId = normalize_character_profile_id((string) ($snapshot['character']['id'] ?? ($session['character_id'] ?? '')));
  $characterPayload = trim((string) ($snapshot['characterSnapshotPayload'] ?? ''));
  if ($characterId !== '' && $characterPayload !== '') {
    authoritative_persist_character_state_payload(
      $userEmail,
      $saveSecret,
      $characterId,
      $characterPayload,
      (string) ($snapshot['character']['name'] ?? 'Adventurer')
    );
  }
  return authoritative_build_snapshot_response($session, $snapshot, [
    'message' => 'Character progress autosaved.',
    'save' => null,
    'saves' => [],
  ]);
}

/**
 * @return array<string, mixed>
 */
function authoritative_save_and_exit(
  string $userEmail,
  string $saveSecret,
  string $sessionId
): array {
  authoritative_release_php_session_lock();
  $response = authoritative_manual_save_current_run($userEmail, $saveSecret, $sessionId, '', '', true);
  authoritative_close_session($sessionId, $userEmail, true, 'save-and-exit');
  $response['message'] = 'Character progress saved and session closed.';
  return $response;
}
