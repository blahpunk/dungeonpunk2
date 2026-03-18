<?php
declare(strict_types=1);

function authoritative_run_storage_dir(): string
{
  return app_storage_path('authoritative_runs');
}

function authoritative_run_file_path(string $userEmail): string
{
  return authoritative_run_storage_dir() . DIRECTORY_SEPARATOR . authoritative_user_storage_key($userEmail) . '.json';
}

function authoritative_load_run_record(string $userEmail): ?array
{
  $path = authoritative_run_file_path($userEmail);
  $record = authoritative_json_read_file($path, null);
  if (!is_array($record)) {
    return null;
  }
  $record['payload'] = trim((string) ($record['payload'] ?? ''));
  $record['active_character_id'] = trim((string) ($record['active_character_id'] ?? ''));
  $record['server_revision'] = max(0, (int) ($record['server_revision'] ?? 0));
  return $record['payload'] !== '' ? $record : null;
}

function authoritative_persist_run_record(string $userEmail, array $record): bool
{
  $payload = trim((string) ($record['payload'] ?? ''));
  if ($payload === '') {
    return false;
  }
  $existing = authoritative_load_run_record($userEmail);
  $nowIso = date('c');
  $next = [
    'payload' => $payload,
    'active_character_id' => trim((string) ($record['active_character_id'] ?? '')),
    'server_revision' => max(0, (int) ($record['server_revision'] ?? ($existing['server_revision'] ?? 0))),
    'created_at' => (string) ($existing['created_at'] ?? $nowIso),
    'updated_at' => $nowIso,
  ];
  return authoritative_json_write_file(authoritative_run_file_path($userEmail), $next);
}

/**
 * @param array<int, array<string, mixed>> $entries
 */
function authoritative_find_save_entry_by_id(array $entries, string $saveId): ?array
{
  $id = trim($saveId);
  if ($id === '') {
    return null;
  }
  foreach ($entries as $entry) {
    if ((string) ($entry['id'] ?? '') === $id) {
      return $entry;
    }
  }
  return null;
}

/**
 * @param array<int, array<string, mixed>> $entries
 */
function authoritative_find_latest_save_entry(array $entries, string $characterId = ''): ?array
{
  $targetCharacterId = normalize_character_profile_id($characterId);
  $best = null;
  foreach ($entries as $entry) {
    if (!is_array($entry)) {
      continue;
    }
    $entryCharacterId = normalize_character_profile_id((string) ($entry['character_id'] ?? ''));
    if ($targetCharacterId !== '' && $entryCharacterId !== $targetCharacterId) {
      continue;
    }
    if ($best === null || strcmp((string) ($entry['updated_at'] ?? ''), (string) ($best['updated_at'] ?? '')) > 0) {
      $best = $entry;
    }
  }
  return $best;
}

/**
 * @return array{
 *   save: array<string, mixed>,
 *   saves: array<int, array<string, mixed>>,
 *   created: bool
 * }
 */
function authoritative_persist_named_save_entry(
  string $userEmail,
  string $saveSecret,
  string $payload,
  string $nameInput = '',
  string $overwriteId = ''
): array {
  $savePayload = trim($payload);
  if ($savePayload === '') {
    throw new RuntimeException('Missing canonical run payload.');
  }
  if (strlen($savePayload) > SAVE_PAYLOAD_MAX_LEN) {
    throw new RuntimeException('Save payload is too large.');
  }

  $entries = load_user_saves($userEmail, $saveSecret);
  $characterStates = load_user_character_states($userEmail, $saveSecret);
  $characterMeta = extract_character_meta_from_save_payload($savePayload);
  $characterId = normalize_character_profile_id((string) ($characterMeta['character_id'] ?? ''));
  $characterName = trim_save_name((string) ($characterMeta['character_name'] ?? ''));
  if ($characterId === '') {
    $characterId = 'legacy_' . substr(hash('sha256', $savePayload), 0, 16);
  }
  if ($characterName === '') {
    $characterName = 'Adventurer';
  }

  $summary = $characterMeta['summary'] ?? [];
  $level = max(1, min(9999, (int) ($summary['level'] ?? 1)));
  $depth = max(-1, min(9999, (int) ($summary['depth'] ?? 0)));
  $name = trim_save_name($nameInput);
  if ($name === '') {
    $name = default_save_name($level, $depth);
  }
  $isAutosave = save_name_looks_like_autosave($name);
  $targetOverwriteId = trim($overwriteId);
  if ($targetOverwriteId === '' && $isAutosave) {
    $autosave = null;
    foreach ($entries as $entry) {
      $entryCharacterId = normalize_character_profile_id((string) ($entry['character_id'] ?? ''));
      if ($entryCharacterId !== $characterId || !save_name_looks_like_autosave((string) ($entry['name'] ?? ''))) {
        continue;
      }
      if ($autosave === null || strcmp((string) ($entry['updated_at'] ?? ''), (string) ($autosave['updated_at'] ?? '')) > 0) {
        $autosave = $entry;
      }
    }
    if (is_array($autosave) && trim((string) ($autosave['id'] ?? '')) !== '') {
      $targetOverwriteId = (string) $autosave['id'];
    }
  }

  $knownCharacterIds = collect_user_character_ids($entries, $characterStates);
  if (!isset($knownCharacterIds[$characterId]) && count($knownCharacterIds) >= MAX_SERVER_CHARACTERS) {
    throw new RuntimeException('Character limit reached. Delete an existing character before creating a new one.');
  }

  $nowIso = date('c');
  $updatedEntry = null;
  $created = false;
  if ($targetOverwriteId !== '') {
    foreach ($entries as $idx => $entry) {
      if ((string) ($entry['id'] ?? '') !== $targetOverwriteId) {
        continue;
      }
      $entries[$idx]['name'] = $name;
      $entries[$idx]['character_id'] = $characterId;
      $entries[$idx]['character_name'] = $characterName;
      $entries[$idx]['payload'] = $savePayload;
      $entries[$idx]['level'] = $level;
      $entries[$idx]['depth'] = $depth;
      $entries[$idx]['updated_at'] = $nowIso;
      $updatedEntry = $entries[$idx];
      break;
    }
    if ($updatedEntry === null) {
      throw new RuntimeException('Overwrite target not found.');
    }
  } else {
    if (count($entries) >= MAX_SERVER_SAVES) {
      throw new RuntimeException('Save slot limit reached. Delete or overwrite an existing save.');
    }
    $created = true;
    $updatedEntry = [
      'id' => bin2hex(random_bytes(16)),
      'character_id' => $characterId,
      'character_name' => $characterName,
      'name' => $name,
      'payload' => $savePayload,
      'level' => $level,
      'depth' => $depth,
      'created_at' => $nowIso,
      'updated_at' => $nowIso,
      'sig' => '',
    ];
    $entries[] = $updatedEntry;
  }

  usort(
    $entries,
    static function (array $a, array $b): int {
      return strcmp((string) ($b['updated_at'] ?? ''), (string) ($a['updated_at'] ?? ''));
    }
  );
  $entries = prune_duplicate_autosaves($entries);
  if (!persist_user_saves($userEmail, $entries, $saveSecret)) {
    throw new RuntimeException('Could not persist save data.');
  }
  $entries = load_user_saves($userEmail, $saveSecret);
  $saved = authoritative_find_save_entry_by_id($entries, (string) ($updatedEntry['id'] ?? ''));
  if (!is_array($saved)) {
    $saved = $updatedEntry;
  }
  return [
    'save' => save_entry_public_meta($saved),
    'saves' => save_entries_public_meta($entries),
    'created' => $created,
  ];
}
