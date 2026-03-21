<?php
declare(strict_types=1);

/**
 * @return array<string, mixed>|null
 */
function authoritative_decode_character_snapshot_payload(string $payload): ?array
{
  $raw = trim($payload);
  if ($raw === '') {
    return null;
  }
  $decoded = base64url_decode_str($raw);
  if (!is_string($decoded) || trim($decoded) === '') {
    return null;
  }
  $parsed = json_decode($decoded, true);
  return is_array($parsed) ? $parsed : null;
}

function authoritative_character_name_from_snapshot_payload(string $payload, string $fallback = 'Adventurer'): string
{
  $decoded = authoritative_decode_character_snapshot_payload($payload);
  $name = trim_save_name((string) ($decoded['character']['name'] ?? $decoded['name'] ?? ''));
  return $name !== '' ? $name : trim_save_name($fallback ?: 'Adventurer');
}

function authoritative_character_id_from_snapshot_payload(string $payload, string $fallback = ''): string
{
  $decoded = authoritative_decode_character_snapshot_payload($payload);
  $id = normalize_character_profile_id((string) ($decoded['character']['id'] ?? $decoded['id'] ?? $fallback));
  return $id;
}

function authoritative_character_snapshot_payload_from_save_payload(string $savePayload): string
{
  $raw = trim($savePayload);
  if ($raw === '') {
    return '';
  }
  $decoded = base64url_decode_str($raw);
  if (!is_string($decoded) || trim($decoded) === '') {
    return '';
  }
  $parsed = json_decode($decoded, true);
  if (!is_array($parsed)) {
    return '';
  }

  $character = is_array($parsed['character'] ?? null) ? $parsed['character'] : [];
  $player = is_array($parsed['player'] ?? null) ? $parsed['player'] : [];
  $snapshot = [
    'character' => $character,
    'position' => [
      'x' => isset($player['x']) ? (int) $player['x'] : null,
      'y' => isset($player['y']) ? (int) $player['y'] : null,
      'depth' => isset($player['z']) ? (int) $player['z'] : null,
    ],
    'player' => [
      'level' => max(1, (int) ($player['level'] ?? 1)),
      'xp' => max(0, (int) ($player['xp'] ?? 0)),
      'hp' => max(0, (int) ($player['hp'] ?? 0)),
      'maxHp' => max(1, (int) ($player['maxHp'] ?? 1)),
      'gold' => max(0, (int) ($player['gold'] ?? 0)),
      'inv' => is_array($parsed['inv'] ?? null) ? $parsed['inv'] : [],
      'equip' => is_array($player['equip'] ?? null) ? $player['equip'] : [],
      'classId' => (string) ($player['classId'] ?? ($character['classId'] ?? '')),
      'speciesId' => (string) ($player['speciesId'] ?? ($character['speciesId'] ?? '')),
    ],
  ];

  $json = json_encode($snapshot, JSON_UNESCAPED_SLASHES);
  if (!is_string($json) || $json === '') {
    return '';
  }
  return base64_encode($json);
}

/**
 * @param array<string, mixed> $snapshot
 */
function authoritative_encode_character_snapshot_payload(array $snapshot): string
{
  $json = json_encode($snapshot, JSON_UNESCAPED_SLASHES);
  if (!is_string($json) || $json === '') {
    return '';
  }
  return base64_encode($json);
}

/**
 * @param array<string, mixed> $snapshot
 * @return array<string, mixed>
 */
function authoritative_clear_character_snapshot_position(array $snapshot): array
{
  $next = $snapshot;
  $resetPosition = [
    'x' => null,
    'y' => null,
    'depth' => null,
    'z' => null,
  ];
  $next['position'] = $resetPosition;
  $character = is_array($next['character'] ?? null) ? $next['character'] : [];
  $character['position'] = $resetPosition;
  $next['character'] = $character;
  return $next;
}

function authoritative_clear_inactive_character_positions_for_new_dungeon(
  string $userEmail,
  string $saveSecret,
  string $activeCharacterId
): void {
  $states = load_user_character_states($userEmail, $saveSecret);
  if (count($states) <= 0) {
    return;
  }
  $activeId = normalize_character_profile_id($activeCharacterId);
  $updated = false;
  $nowIso = date('c');
  foreach ($states as $stateId => $entryRaw) {
    if (!is_array($entryRaw)) {
      continue;
    }
    $entry = $entryRaw;
    $characterId = normalize_character_profile_id((string) ($entry['id'] ?? $stateId));
    if ($characterId === '' || ($activeId !== '' && $characterId === $activeId)) {
      continue;
    }
    $payload = trim((string) ($entry['payload'] ?? ''));
    if ($payload === '') {
      continue;
    }
    $decoded = authoritative_decode_character_snapshot_payload($payload);
    if (!is_array($decoded)) {
      continue;
    }
    $resetSnapshot = authoritative_clear_character_snapshot_position($decoded);
    $resetPayload = authoritative_encode_character_snapshot_payload($resetSnapshot);
    if ($resetPayload === '' || $resetPayload === $payload) {
      continue;
    }
    $entry['id'] = $characterId;
    if (trim_save_name((string) ($entry['name'] ?? '')) === '') {
      $entry['name'] = authoritative_character_name_from_snapshot_payload($resetPayload, 'Adventurer');
    }
    $entry['payload'] = $resetPayload;
    $entry['updated_at'] = $nowIso;
    $entry['sig'] = '';
    $states[$characterId] = $entry;
    if ((string) $stateId !== $characterId) {
      unset($states[$stateId]);
    }
    $updated = true;
  }
  if (!$updated) {
    return;
  }
  if (!persist_user_character_states($userEmail, $states, $saveSecret)) {
    throw new RuntimeException('Could not reset character positions for the new dungeon.');
  }
}

/**
 * @param array<string, array<string, mixed>> $characterStates
 * @return array<string, array<string, mixed>>
 */
function authoritative_upsert_character_state_entry(
  array $characterStates,
  string $characterId,
  string $snapshotPayload,
  string $fallbackName = 'Adventurer'
): array {
  $id = normalize_character_profile_id($characterId);
  $payload = trim($snapshotPayload);
  if ($id === '' || $payload === '') {
    return $characterStates;
  }
  $existing = $characterStates[$id] ?? [];
  $name = authoritative_character_name_from_snapshot_payload($payload, (string) ($existing['name'] ?? $fallbackName));
  $characterStates[$id] = [
    'id' => $id,
    'name' => $name !== '' ? $name : 'Adventurer',
    'payload' => $payload,
    'updated_at' => date('c'),
    'sig' => '',
  ];
  return $characterStates;
}

/**
 * @return array{id: string, name: string, updated_at: string}
 */
function authoritative_persist_character_state_payload(
  string $userEmail,
  string $saveSecret,
  string $characterId,
  string $snapshotPayload,
  string $fallbackName = 'Adventurer'
): array {
  $states = load_user_character_states($userEmail, $saveSecret);
  $states = authoritative_upsert_character_state_entry($states, $characterId, $snapshotPayload, $fallbackName);
  $id = normalize_character_profile_id($characterId);
  if ($id === '' || !isset($states[$id])) {
    throw new RuntimeException('Could not prepare character state payload.');
  }
  if (!persist_user_character_states($userEmail, $states, $saveSecret)) {
    throw new RuntimeException('Could not persist character state.');
  }
  $entry = $states[$id];
  return [
    'id' => (string) ($entry['id'] ?? $id),
    'name' => (string) ($entry['name'] ?? 'Adventurer'),
    'updated_at' => (string) ($entry['updated_at'] ?? date('c')),
  ];
}

/**
 * @param array<string, mixed> $options
 * @return array{
 *   entries: array<int, array<string, mixed>>,
 *   character_states: array<string, array<string, mixed>>,
 *   run_record: ?array,
 *   save_entry: ?array,
 *   world_payload: string,
 *   character_payload: string,
 *   character_id: string,
 *   server_revision: int,
 *   source: string
 * }
 */
function authoritative_bootstrap_context(
  string $userEmail,
  string $saveSecret,
  string $requestedCharacterId = '',
  array $options = []
): array {
  $entries = load_user_saves($userEmail, $saveSecret);
  $characterStates = load_user_character_states($userEmail, $saveSecret);
  $runRecord = authoritative_load_run_record($userEmail);
  $characterId = normalize_character_profile_id($requestedCharacterId);
  $saveId = trim((string) ($options['save_id'] ?? ''));
  $saveEntry = $saveId !== '' ? authoritative_find_save_entry_by_id($entries, $saveId) : null;
  if ($saveId !== '' && !is_array($saveEntry)) {
    throw new RuntimeException('Save not found.');
  }
  if (is_array($saveEntry) && $characterId === '') {
    $characterId = normalize_character_profile_id((string) ($saveEntry['character_id'] ?? ''));
  }
  $freshWorld = !empty($options['fresh_world']);

  $worldPayload = '';
  $source = 'new';
  $serverRevision = max(0, (int) ($runRecord['server_revision'] ?? 0));
  if ($freshWorld) {
    $source = 'fresh_world';
    $serverRevision = 0;
  } elseif (is_array($saveEntry)) {
    $worldPayload = trim((string) ($saveEntry['payload'] ?? ''));
    $source = 'save';
    $serverRevision = 0;
  } elseif (is_array($runRecord) && trim((string) ($runRecord['payload'] ?? '')) !== '') {
    $worldPayload = trim((string) ($runRecord['payload'] ?? ''));
    $source = 'run_record';
    if ($characterId === '') {
      $characterId = normalize_character_profile_id((string) ($runRecord['active_character_id'] ?? ''));
    }
  } else {
    $latestOverall = authoritative_find_latest_save_entry($entries);
    if (is_array($latestOverall)) {
      $worldPayload = trim((string) ($latestOverall['payload'] ?? ''));
      $source = 'latest_save';
      if ($characterId === '') {
        $characterId = normalize_character_profile_id((string) ($latestOverall['character_id'] ?? ''));
      }
    }
  }

  $characterPayload = '';
  if ($characterId !== '' && isset($characterStates[$characterId])) {
    $characterPayload = trim((string) ($characterStates[$characterId]['payload'] ?? ''));
    if (
      $characterPayload !== ''
      && $source === 'run_record'
      && $characterId !== ''
      && $characterId === normalize_character_profile_id((string) ($runRecord['active_character_id'] ?? ''))
    ) {
      // The canonical run payload already contains the latest authoritative
      // state and position for the active character. Do not layer a potentially
      // stale per-character snapshot on top of it during refresh/reopen.
      $characterPayload = '';
    }
  }
  if ($characterPayload === '' && $characterId !== '') {
    $latestForCharacter = authoritative_find_latest_save_entry($entries, $characterId);
    if (is_array($latestForCharacter)) {
      $characterPayload = authoritative_character_snapshot_payload_from_save_payload((string) ($latestForCharacter['payload'] ?? ''));
      if ($characterPayload !== '' && $source === 'run_record') {
        // The active canonical run is already selected; do not trust historical
        // save position data from a different dungeon instance.
        $decodedCharacterPayload = authoritative_decode_character_snapshot_payload($characterPayload);
        if (is_array($decodedCharacterPayload)) {
          $clearedCharacterPayload = authoritative_encode_character_snapshot_payload(
            authoritative_clear_character_snapshot_position($decodedCharacterPayload)
          );
          if ($clearedCharacterPayload !== '') {
            $characterPayload = $clearedCharacterPayload;
          }
        }
      }
      if ($worldPayload === '' && !$freshWorld) {
        $worldPayload = trim((string) ($latestForCharacter['payload'] ?? ''));
        $source = 'character_save';
      } elseif ($characterPayload !== '') {
        $source = $source === 'run_record' ? 'character_state_from_save' : $source;
      }
    }
  }
  if ($characterId === '' && $characterPayload !== '') {
    $characterId = authoritative_character_id_from_snapshot_payload($characterPayload, '');
  }
  if ($characterId === '' && $worldPayload !== '') {
    $meta = extract_character_meta_from_save_payload($worldPayload);
    if (is_array($meta)) {
      $characterId = normalize_character_profile_id((string) ($meta['character_id'] ?? ''));
    }
  }

  return [
    'entries' => $entries,
    'character_states' => $characterStates,
    'run_record' => $runRecord,
    'save_entry' => $saveEntry,
    'world_payload' => $worldPayload,
    'character_payload' => $characterPayload,
    'character_id' => $characterId,
    'server_revision' => $serverRevision,
    'source' => $source,
  ];
}
