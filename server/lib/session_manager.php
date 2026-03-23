<?php
declare(strict_types=1);

function authoritative_normalize_email(string $email): string
{
  return strtolower(trim($email));
}

function authoritative_user_storage_key(string $email): string
{
  return hash('sha256', authoritative_normalize_email($email));
}

function authoritative_json_read_file(string $path, $default = [])
{
  if (!is_file($path)) {
    return $default;
  }
  $raw = @file_get_contents($path);
  if (!is_string($raw) || trim($raw) === '') {
    return $default;
  }
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : $default;
}

function authoritative_json_write_file(string $path, array $payload): bool
{
  $dir = dirname($path);
  if (!(is_dir($dir) || @mkdir($dir, 0700, true) || is_dir($dir))) {
    return false;
  }
  $tmp = $path . '.tmp';
  $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if (!is_string($json)) {
    return false;
  }
  if (@file_put_contents($tmp, $json . "\n", LOCK_EX) === false) {
    return false;
  }
  return @rename($tmp, $path);
}

function authoritative_session_storage_dir(): string
{
  return app_storage_path('authoritative_sessions');
}

function authoritative_normalize_session_id(string $value): string
{
  $id = trim($value);
  if ($id === '' || !preg_match('/^[a-zA-Z0-9_\-]{16,120}$/', $id)) {
    return '';
  }
  return $id;
}

function authoritative_session_file_path(string $sessionId): string
{
  return authoritative_session_storage_dir() . DIRECTORY_SEPARATOR . authoritative_normalize_session_id($sessionId) . '.json';
}

function authoritative_normalize_browser_instance_id(string $value): string
{
  $id = strtolower(trim($value));
  if ($id === '' || !preg_match('/^[a-z0-9_\-]{12,120}$/', $id)) {
    return '';
  }
  return $id;
}

function authoritative_session_ttl_seconds(): int
{
  $raw = getenv('DUNGEON25_AUTH_SESSION_TTL');
  $seconds = is_string($raw) ? (int) floor((float) $raw) : 0;
  if ($seconds <= 0) {
    $seconds = 900;
  }
  return max(60, min(86400, $seconds));
}

function authoritative_character_lock_ttl_seconds(): int
{
  $raw = getenv('DUNGEON25_CHARACTER_LOCK_TTL');
  $seconds = is_string($raw) ? (int) floor((float) $raw) : 0;
  if ($seconds <= 0) {
    // Short lock window keeps stale browser crashes from blocking character switching.
    $seconds = 20;
  }
  return max(8, min(300, $seconds));
}

function authoritative_close_grace_seconds(): int
{
  $raw = getenv('DUNGEON25_AUTH_CLOSE_GRACE');
  $seconds = is_string($raw) ? (int) floor((float) $raw) : 0;
  if ($seconds <= 0) {
    $seconds = 8;
  }
  return max(2, min(60, $seconds));
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_session_pending_close_timestamp(array $session): int
{
  $closeRequestedAt = trim((string) ($session['close_requested_at'] ?? ''));
  $closeRequestedTs = $closeRequestedAt !== '' ? strtotime($closeRequestedAt) : false;
  return (is_int($closeRequestedTs) && $closeRequestedTs > 0) ? $closeRequestedTs : 0;
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_session_is_pending_close(array $session): bool
{
  return authoritative_session_pending_close_timestamp($session) > 0;
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_session_pending_close_expired(array $session, ?int $nowTs = null): bool
{
  $closeRequestedTs = authoritative_session_pending_close_timestamp($session);
  if ($closeRequestedTs <= 0) {
    return false;
  }
  $now = $nowTs ?? time();
  return ($now - $closeRequestedTs) >= authoritative_close_grace_seconds();
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_clear_pending_close(array &$session): void
{
  unset($session['close_requested_at'], $session['close_reason']);
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_session_last_touch_timestamp(array $session): int
{
  $updatedAt = trim((string) ($session['updated_at'] ?? ''));
  $updatedTs = $updatedAt !== '' ? strtotime($updatedAt) : false;
  if (is_int($updatedTs) && $updatedTs > 0) {
    return $updatedTs;
  }
  $createdAt = trim((string) ($session['created_at'] ?? ''));
  $createdTs = $createdAt !== '' ? strtotime($createdAt) : false;
  if (is_int($createdTs) && $createdTs > 0) {
    return $createdTs;
  }
  return 0;
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_session_is_fresh(array $session, ?int $nowTs = null): bool
{
  $lastTouchTs = authoritative_session_last_touch_timestamp($session);
  if ($lastTouchTs <= 0) {
    return false;
  }
  $now = $nowTs ?? time();
  return ($now - $lastTouchTs) <= authoritative_session_ttl_seconds();
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_session_is_recent_for_character_lock(array $session, ?int $nowTs = null): bool
{
  $lastTouchTs = authoritative_session_last_touch_timestamp($session);
  if ($lastTouchTs <= 0) {
    return false;
  }
  $now = $nowTs ?? time();
  return ($now - $lastTouchTs) <= authoritative_character_lock_ttl_seconds();
}

/**
 * @param array<string, mixed> $session
 */
function authoritative_session_blocks_character_lock(array $session, ?int $nowTs = null): bool
{
  if (authoritative_session_is_pending_close($session)) {
    return false;
  }
  return authoritative_session_is_recent_for_character_lock($session, $nowTs);
}

function authoritative_create_session(
  string $userEmail,
  string $characterId,
  int $revision = 0,
  string $browserInstanceId = ''
): array
{
  return [
    'session_id' => 'sess_' . bin2hex(random_bytes(16)),
    'user_key' => authoritative_user_storage_key($userEmail),
    'character_id' => trim($characterId),
    'browser_instance_id' => authoritative_normalize_browser_instance_id($browserInstanceId),
    'server_revision' => max(0, $revision),
    'last_command_seq' => 0,
    'created_at' => date('c'),
    'updated_at' => date('c'),
  ];
}

function authoritative_persist_session(array $session): bool
{
  $sessionId = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
  if ($sessionId === '') {
    return false;
  }
  $next = $session;
  $next['session_id'] = $sessionId;
  $next['character_id'] = trim((string) ($session['character_id'] ?? ''));
  $next['browser_instance_id'] = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
  if (!empty($session['close_requested_at'])) {
    $next['close_requested_at'] = trim((string) $session['close_requested_at']);
    $next['close_reason'] = trim((string) ($session['close_reason'] ?? ''));
  } else {
    unset($next['close_requested_at'], $next['close_reason']);
  }
  $next['updated_at'] = date('c');
  return authoritative_json_write_file(authoritative_session_file_path($sessionId), $next);
}

function authoritative_load_session(string $sessionId, string $userEmail): ?array
{
  $id = authoritative_normalize_session_id($sessionId);
  if ($id === '') {
    return null;
  }
  $session = authoritative_json_read_file(authoritative_session_file_path($id), null);
  if (!is_array($session)) {
    return null;
  }
  $expectedUserKey = authoritative_user_storage_key($userEmail);
  if (!hash_equals((string) ($session['user_key'] ?? ''), $expectedUserKey)) {
    return null;
  }
  $session['session_id'] = $id;
  $session['server_revision'] = max(0, (int) ($session['server_revision'] ?? 0));
  $session['last_command_seq'] = max(0, (int) ($session['last_command_seq'] ?? 0));
  $session['character_id'] = trim((string) ($session['character_id'] ?? ''));
  $session['browser_instance_id'] = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
  if (!authoritative_session_is_fresh($session, time())) {
    @unlink(authoritative_session_file_path($id));
    return null;
  }
  if (authoritative_session_pending_close_expired($session, time())) {
    @unlink(authoritative_session_file_path($id));
    return null;
  }
  return $session;
}

/**
 * @return array<int, array<string, mixed>>
 */
function authoritative_list_user_sessions(string $userEmail, bool $pruneStale = true): array
{
  $dir = authoritative_session_storage_dir();
  if (!is_dir($dir)) {
    return [];
  }
  $pattern = $dir . DIRECTORY_SEPARATOR . '*.json';
  $files = glob($pattern);
  if (!is_array($files) || !$files) {
    return [];
  }

  $expectedUserKey = authoritative_user_storage_key($userEmail);
  $now = time();
  $out = [];
  foreach ($files as $path) {
    if (!is_string($path) || $path === '') {
      continue;
    }
    $raw = authoritative_json_read_file($path, null);
    if (!is_array($raw)) {
      continue;
    }
    if (!hash_equals((string) ($raw['user_key'] ?? ''), $expectedUserKey)) {
      continue;
    }
    $sessionId = authoritative_normalize_session_id((string) ($raw['session_id'] ?? pathinfo($path, PATHINFO_FILENAME)));
    if ($sessionId === '') {
      continue;
    }
    $session = $raw;
    $session['session_id'] = $sessionId;
    $session['server_revision'] = max(0, (int) ($session['server_revision'] ?? 0));
    $session['last_command_seq'] = max(0, (int) ($session['last_command_seq'] ?? 0));
    $session['character_id'] = trim((string) ($session['character_id'] ?? ''));
    $session['browser_instance_id'] = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
    if (!authoritative_session_is_fresh($session, $now)) {
      if ($pruneStale) {
        @unlink($path);
      }
      continue;
    }
    if (authoritative_session_pending_close_expired($session, $now)) {
      if ($pruneStale) {
        @unlink($path);
      }
      continue;
    }
    $out[] = $session;
  }
  return $out;
}

/**
 * @return array<int, array<string, mixed>>
 */
function authoritative_list_all_sessions(bool $pruneStale = true): array
{
  $dir = authoritative_session_storage_dir();
  if (!is_dir($dir)) {
    return [];
  }
  $pattern = $dir . DIRECTORY_SEPARATOR . '*.json';
  $files = glob($pattern);
  if (!is_array($files) || !$files) {
    return [];
  }

  $now = time();
  $out = [];
  foreach ($files as $path) {
    if (!is_string($path) || $path === '') {
      continue;
    }
    $raw = authoritative_json_read_file($path, null);
    if (!is_array($raw)) {
      continue;
    }
    $sessionId = authoritative_normalize_session_id((string) ($raw['session_id'] ?? pathinfo($path, PATHINFO_FILENAME)));
    if ($sessionId === '') {
      continue;
    }
    $session = $raw;
    $session['session_id'] = $sessionId;
    $session['server_revision'] = max(0, (int) ($session['server_revision'] ?? 0));
    $session['last_command_seq'] = max(0, (int) ($session['last_command_seq'] ?? 0));
    $session['character_id'] = trim((string) ($session['character_id'] ?? ''));
    $session['browser_instance_id'] = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
    if (!authoritative_session_is_fresh($session, $now)) {
      if ($pruneStale) {
        @unlink($path);
      }
      continue;
    }
    if (authoritative_session_pending_close_expired($session, $now)) {
      if ($pruneStale) {
        @unlink($path);
      }
      continue;
    }
    $out[] = $session;
  }
  return $out;
}

/**
 * @return array<string, mixed>|null
 */
function authoritative_find_character_session_conflict(
  string $userEmail,
  string $characterId,
  string $browserInstanceId = '',
  string $excludeSessionId = ''
): ?array {
  $targetCharacterId = trim($characterId);
  if ($targetCharacterId === '') {
    return null;
  }
  $targetBrowserId = authoritative_normalize_browser_instance_id($browserInstanceId);
  $exclude = authoritative_normalize_session_id($excludeSessionId);
  $now = time();

  foreach (authoritative_list_user_sessions($userEmail, true) as $session) {
    $sessionId = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
    if ($sessionId === '' || ($exclude !== '' && hash_equals($sessionId, $exclude))) {
      continue;
    }
    if (trim((string) ($session['character_id'] ?? '')) !== $targetCharacterId) {
      continue;
    }
    if (!authoritative_session_blocks_character_lock($session, $now)) {
      @unlink(authoritative_session_file_path($sessionId));
      continue;
    }
    $sessionBrowserId = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
    if ($targetBrowserId !== '' && $sessionBrowserId !== '' && hash_equals($sessionBrowserId, $targetBrowserId)) {
      continue;
    }
    return $session;
  }
  return null;
}

function authoritative_close_matching_browser_character_sessions(
  string $userEmail,
  string $characterId,
  string $browserInstanceId,
  string $excludeSessionId = ''
): void {
  $targetCharacterId = trim($characterId);
  $targetBrowserId = authoritative_normalize_browser_instance_id($browserInstanceId);
  if ($targetCharacterId === '' || $targetBrowserId === '') {
    return;
  }
  $exclude = authoritative_normalize_session_id($excludeSessionId);
  $now = time();

  foreach (authoritative_list_user_sessions($userEmail, true) as $session) {
    $sessionId = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
    if ($sessionId === '' || ($exclude !== '' && hash_equals($sessionId, $exclude))) {
      continue;
    }
    if (trim((string) ($session['character_id'] ?? '')) !== $targetCharacterId) {
      continue;
    }
    if (!authoritative_session_blocks_character_lock($session, $now)) {
      @unlink(authoritative_session_file_path($sessionId));
      continue;
    }
    $sessionBrowserId = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
    // Reclaim stale/legacy sessions for the same character in this browser instance.
    if ($sessionBrowserId === '' || hash_equals($sessionBrowserId, $targetBrowserId)) {
      @unlink(authoritative_session_file_path($sessionId));
    }
  }
}

/**
 * @return array<string, mixed>|null
 */
function authoritative_find_browser_character_session(
  string $userEmail,
  string $characterId,
  string $browserInstanceId
): ?array {
  $targetCharacterId = trim($characterId);
  $targetBrowserId = authoritative_normalize_browser_instance_id($browserInstanceId);
  if ($targetCharacterId === '' || $targetBrowserId === '') {
    return null;
  }
  $now = time();
  foreach (authoritative_list_user_sessions($userEmail, true) as $session) {
    $sessionId = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
    if ($sessionId === '') continue;
    if (trim((string) ($session['character_id'] ?? '')) !== $targetCharacterId) continue;
    if (!authoritative_session_blocks_character_lock($session, $now)) continue;
    $sessionBrowserId = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
    if ($sessionBrowserId === '' || !hash_equals($sessionBrowserId, $targetBrowserId)) continue;
    return $session;
  }
  return null;
}

function authoritative_close_browser_sessions(
  string $userEmail,
  string $browserInstanceId,
  string $excludeSessionId = ''
): void {
  $targetBrowserId = authoritative_normalize_browser_instance_id($browserInstanceId);
  if ($targetBrowserId === '') {
    return;
  }
  $exclude = authoritative_normalize_session_id($excludeSessionId);
  $now = time();
  foreach (authoritative_list_user_sessions($userEmail, true) as $session) {
    $sessionId = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
    if ($sessionId === '' || ($exclude !== '' && hash_equals($sessionId, $exclude))) {
      continue;
    }
    if (!authoritative_session_blocks_character_lock($session, $now)) {
      @unlink(authoritative_session_file_path($sessionId));
      continue;
    }
    $sessionBrowserId = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
    if ($sessionBrowserId === '' || !hash_equals($sessionBrowserId, $targetBrowserId)) {
      continue;
    }
    @unlink(authoritative_session_file_path($sessionId));
  }
}

/**
 * @return array{ok: bool, sessionId: string, updatedAt: string}
 */
function authoritative_touch_session(
  string $sessionId,
  string $userEmail,
  string $browserInstanceId = '',
  array $presence = []
): array {
  $session = authoritative_load_session($sessionId, $userEmail);
  if ($session === null) {
    throw new RuntimeException('Authoritative session not found.');
  }
  $incomingBrowserId = authoritative_normalize_browser_instance_id($browserInstanceId);
  $sessionBrowserId = authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? ''));
  if ($incomingBrowserId !== '' && $sessionBrowserId !== '' && !hash_equals($incomingBrowserId, $sessionBrowserId)) {
    throw new RuntimeException('Session is active in another browser instance.');
  }
  if ($sessionBrowserId === '' && $incomingBrowserId !== '') {
    $session['browser_instance_id'] = $incomingBrowserId;
  }
  if ($presence) {
    $session['presence'] = [
      'name' => trim((string) ($presence['name'] ?? '')),
      'species_id' => trim((string) ($presence['species_id'] ?? '')),
      'class_id' => trim((string) ($presence['class_id'] ?? '')),
      'dungeon_instance_id' => trim((string) ($presence['dungeon_instance_id'] ?? '')),
      'x' => array_key_exists('x', $presence) && is_numeric($presence['x']) ? (int) $presence['x'] : null,
      'y' => array_key_exists('y', $presence) && is_numeric($presence['y']) ? (int) $presence['y'] : null,
      'z' => array_key_exists('z', $presence) && is_numeric($presence['z']) ? (int) $presence['z'] : null,
      'hp' => max(0, (int) ($presence['hp'] ?? 0)),
      'max_hp' => max(1, (int) ($presence['max_hp'] ?? 1)),
      'updated_at' => date('c'),
    ];
  }
  authoritative_clear_pending_close($session);
  if (!authoritative_persist_session($session)) {
    throw new RuntimeException('Could not refresh authoritative session.');
  }
  return [
    'ok' => true,
    'sessionId' => authoritative_normalize_session_id((string) ($session['session_id'] ?? '')),
    'characterId' => trim((string) ($session['character_id'] ?? '')),
    'updatedAt' => date('c'),
  ];
}

/**
 * @param array<string, mixed> $presence
 */
function authoritative_update_browser_character_presence(
  string $userEmail,
  string $characterId,
  string $browserInstanceId,
  array $presence
): bool {
  $targetCharacterId = trim($characterId);
  $targetBrowserId = authoritative_normalize_browser_instance_id($browserInstanceId);
  if ($targetCharacterId === '' || $targetBrowserId === '') {
    return false;
  }
  $session = authoritative_find_browser_character_session($userEmail, $targetCharacterId, $targetBrowserId);
  if (!is_array($session)) {
    return false;
  }
  $session['presence'] = [
    'name' => trim((string) ($presence['name'] ?? '')),
    'species_id' => trim((string) ($presence['species_id'] ?? '')),
    'class_id' => trim((string) ($presence['class_id'] ?? '')),
    'dungeon_instance_id' => trim((string) ($presence['dungeon_instance_id'] ?? '')),
    'x' => array_key_exists('x', $presence) && is_numeric($presence['x']) ? (int) $presence['x'] : null,
    'y' => array_key_exists('y', $presence) && is_numeric($presence['y']) ? (int) $presence['y'] : null,
    'z' => array_key_exists('z', $presence) && is_numeric($presence['z']) ? (int) $presence['z'] : null,
    'hp' => max(0, (int) ($presence['hp'] ?? 0)),
    'max_hp' => max(1, (int) ($presence['max_hp'] ?? 1)),
    'updated_at' => date('c'),
  ];
  authoritative_clear_pending_close($session);
  return authoritative_persist_session($session);
}

function authoritative_close_session(string $sessionId, string $userEmail, bool $immediate = false, string $reason = ''): bool
{
  $session = authoritative_load_session($sessionId, $userEmail);
  if ($session === null) {
    return false;
  }
  if (!$immediate) {
    $session['close_requested_at'] = date('c');
    $session['close_reason'] = trim($reason);
    return authoritative_persist_session($session);
  }
  return @unlink(authoritative_session_file_path($sessionId));
}

/**
 * @return array{
 *   active: array<int, array<string, mixed>>,
 *   duplicates: array<int, array<string, mixed>>
 * }
 */
function authoritative_character_lock_audit(string $userEmail): array
{
  $now = time();
  $active = [];
  $byCharacter = [];
  foreach (authoritative_list_user_sessions($userEmail, true) as $session) {
    $sessionId = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
    if ($sessionId === '') continue;
    if (!authoritative_session_blocks_character_lock($session, $now)) continue;
    $characterId = trim((string) ($session['character_id'] ?? ''));
    if ($characterId === '') continue;
    $entry = [
      'session_id' => $sessionId,
      'character_id' => $characterId,
      'browser_instance_id' => authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? '')),
      'updated_at' => (string) ($session['updated_at'] ?? ''),
      'presence' => is_array($session['presence'] ?? null) ? $session['presence'] : null,
    ];
    $active[] = $entry;
    if (!isset($byCharacter[$characterId]) || !is_array($byCharacter[$characterId])) {
      $byCharacter[$characterId] = [];
    }
    $byCharacter[$characterId][] = $entry;
  }

  $duplicates = [];
  foreach ($byCharacter as $characterId => $rows) {
    if (!is_array($rows) || count($rows) <= 1) continue;
    $browserIds = [];
    foreach ($rows as $row) {
      $browserIds[(string) ($row['browser_instance_id'] ?? '')] = true;
    }
    $duplicates[] = [
      'character_id' => (string) $characterId,
      'count' => count($rows),
      'browser_count' => count($browserIds),
      'sessions' => array_values($rows),
    ];
  }
  return [
    'active' => array_values($active),
    'duplicates' => array_values($duplicates),
  ];
}

/**
 * @return array{
 *   active: array<int, array<string, mixed>>,
 *   duplicates: array<int, array<string, mixed>>
 * }
 */
function authoritative_character_lock_audit_all(): array
{
  $now = time();
  $active = [];
  $byCharacter = [];
  foreach (authoritative_list_all_sessions(true) as $session) {
    $sessionId = authoritative_normalize_session_id((string) ($session['session_id'] ?? ''));
    if ($sessionId === '') continue;
    if (!authoritative_session_blocks_character_lock($session, $now)) continue;
    $characterId = trim((string) ($session['character_id'] ?? ''));
    if ($characterId === '') continue;
    $entry = [
      'session_id' => $sessionId,
      'character_id' => $characterId,
      'browser_instance_id' => authoritative_normalize_browser_instance_id((string) ($session['browser_instance_id'] ?? '')),
      'updated_at' => (string) ($session['updated_at'] ?? ''),
      'presence' => is_array($session['presence'] ?? null) ? $session['presence'] : null,
    ];
    $active[] = $entry;
    if (!isset($byCharacter[$characterId]) || !is_array($byCharacter[$characterId])) {
      $byCharacter[$characterId] = [];
    }
    $byCharacter[$characterId][] = $entry;
  }

  $duplicates = [];
  foreach ($byCharacter as $characterId => $rows) {
    if (!is_array($rows) || count($rows) <= 1) continue;
    $browserIds = [];
    foreach ($rows as $row) {
      $browserIds[(string) ($row['browser_instance_id'] ?? '')] = true;
    }
    $duplicates[] = [
      'character_id' => (string) $characterId,
      'count' => count($rows),
      'browser_count' => count($browserIds),
      'sessions' => array_values($rows),
    ];
  }
  return [
    'active' => array_values($active),
    'duplicates' => array_values($duplicates),
  ];
}
