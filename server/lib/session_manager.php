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

function authoritative_create_session(string $userEmail, string $characterId, int $revision = 0): array
{
  return [
    'session_id' => 'sess_' . bin2hex(random_bytes(16)),
    'user_key' => authoritative_user_storage_key($userEmail),
    'character_id' => trim($characterId),
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
  return $session;
}

function authoritative_close_session(string $sessionId, string $userEmail): bool
{
  $session = authoritative_load_session($sessionId, $userEmail);
  if ($session === null) {
    return false;
  }
  return @unlink(authoritative_session_file_path($sessionId));
}
