<?php
declare(strict_types=1);
require_once __DIR__ . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'bootstrap.php';

@ini_set('upload_max_filesize', '128M');
@ini_set('post_max_size', '132M');
@ini_set('max_file_uploads', '20');

$sessionLifetimeSeconds = 60 * 60 * 24 * 365;
if (PHP_VERSION_ID >= 70300) {
  session_set_cookie_params([
    'lifetime' => $sessionLifetimeSeconds,
    'path' => '/',
    'secure' => (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off'),
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
} else {
  session_set_cookie_params(
    $sessionLifetimeSeconds,
    '/',
    '',
    (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off'),
    true
  );
}
ini_set('session.gc_maxlifetime', (string) $sessionLifetimeSeconds);
session_start();

const ADMIN_EMAIL = 'eric.zeigenbein@gmail.com';
const MAX_SERVER_SAVES = 5;
const SAVE_NAME_MAX_LEN = 48;
const SAVE_PAYLOAD_MAX_LEN = 2000000;
const SPRITE_UPLOAD_MAX_BYTES = 100000000;
const MONSTER_EDITOR_PAYLOAD_MAX_BYTES = 1200000;
const LOCAL_AUTH_COOKIE = 'bp_auth_user';
const LOCAL_AUTH_SIG_COOKIE = 'bp_auth_sig';

function base64url_decode_str(string $value): ?string
{
  $base64 = strtr($value, '-_', '+/');
  $padding = strlen($base64) % 4;
  if ($padding > 0) {
    $base64 .= str_repeat('=', 4 - $padding);
  }
  $decoded = base64_decode($base64, true);
  return is_string($decoded) ? $decoded : null;
}

function current_request_url(): ?string
{
  $host = trim((string) ($_SERVER['HTTP_HOST'] ?? ''));
  if ($host === '') {
    return null;
  }

  $scheme = 'http';
  $forwardedProto = trim((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
  if ($forwardedProto !== '') {
    $scheme = trim(explode(',', $forwardedProto)[0]);
  } elseif (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
    $scheme = 'https';
  }

  $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
  return sprintf('%s://%s%s', $scheme, $host, $uri);
}

function current_request_base_url(): ?string
{
  $host = trim((string) ($_SERVER['HTTP_HOST'] ?? ''));
  if ($host === '') {
    return null;
  }
  $scheme = 'http';
  $forwardedProto = trim((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
  if ($forwardedProto !== '') {
    $scheme = trim(explode(',', $forwardedProto)[0]);
  } elseif (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
    $scheme = 'https';
  }
  $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
  $path = (string) (parse_url($uri, PHP_URL_PATH) ?? '/');
  return sprintf('%s://%s%s', $scheme, $host, $path);
}

function local_auth_secret(): string
{
  $secret = trim((string) (getenv('LOCAL_AUTH_SECRET') ?: ''));
  if ($secret !== '') {
    return $secret;
  }
  return trim((string) (getenv('SECURE_AUTH_SECRET') ?: getenv('FLASK_SECRET_KEY') ?: ''));
}

function clear_local_auth_cookie(): void
{
  $secure = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off');
  if (PHP_VERSION_ID >= 70300) {
    setcookie(LOCAL_AUTH_COOKIE, '', [
      'expires' => time() - 3600,
      'path' => '/',
      'secure' => $secure,
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    setcookie(LOCAL_AUTH_SIG_COOKIE, '', [
      'expires' => time() - 3600,
      'path' => '/',
      'secure' => $secure,
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    return;
  }
  setcookie(LOCAL_AUTH_COOKIE, '', time() - 3600, '/', '', $secure, true);
  setcookie(LOCAL_AUTH_SIG_COOKIE, '', time() - 3600, '/', '', $secure, true);
}

/**
 * @param array{name: string, email: string} $user
 */
function persist_local_auth_cookie(array $user): void
{
  $secret = local_auth_secret();
  if ($secret === '') {
    return;
  }
  $payload = [
    'name' => trim((string) ($user['name'] ?? '')),
    'email' => strtolower(trim((string) ($user['email'] ?? ''))),
  ];
  if ($payload['email'] === '' || filter_var($payload['email'], FILTER_VALIDATE_EMAIL) === false) {
    return;
  }
  if ($payload['name'] === '') {
    $payload['name'] = $payload['email'];
  }
  $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if (!is_string($json) || $json === '') {
    return;
  }
  $value = rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
  $sig = hash_hmac('sha256', $value, $secret);
  $expires = time() + (60 * 60 * 24 * 365);
  $secure = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off');
  if (PHP_VERSION_ID >= 70300) {
    setcookie(LOCAL_AUTH_COOKIE, $value, [
      'expires' => $expires,
      'path' => '/',
      'secure' => $secure,
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    setcookie(LOCAL_AUTH_SIG_COOKIE, $sig, [
      'expires' => $expires,
      'path' => '/',
      'secure' => $secure,
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    return;
  }
  setcookie(LOCAL_AUTH_COOKIE, $value, $expires, '/', '', $secure, true);
  setcookie(LOCAL_AUTH_SIG_COOKIE, $sig, $expires, '/', '', $secure, true);
}

/**
 * @return array{name: string, email: string}|null
 */
function read_local_auth_cookie(): ?array
{
  $value = trim((string) ($_COOKIE[LOCAL_AUTH_COOKIE] ?? ''));
  $sig = trim((string) ($_COOKIE[LOCAL_AUTH_SIG_COOKIE] ?? ''));
  if ($value === '' || $sig === '') {
    return null;
  }
  $secret = local_auth_secret();
  if ($secret === '') {
    return null;
  }
  $expectedSig = hash_hmac('sha256', $value, $secret);
  if (!hash_equals($expectedSig, $sig)) {
    return null;
  }
  $decoded = base64url_decode_str($value);
  if ($decoded === null) {
    return null;
  }
  $payload = json_decode($decoded, true);
  if (!is_array($payload)) {
    return null;
  }
  $email = strtolower(trim((string) ($payload['email'] ?? '')));
  if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    return null;
  }
  $name = trim((string) ($payload['name'] ?? ''));
  if ($name === '') {
    $name = $email;
  }
  return ['name' => $name, 'email' => $email];
}

/**
 * @return array{name: string, email: string}|null
 */
function get_authenticated_user(): ?array
{
  $cookieValue = trim((string) ($_COOKIE['user'] ?? ''));
  if ($cookieValue === '') {
    return read_local_auth_cookie();
  }

  $secret = trim((string) (getenv('SECURE_AUTH_SECRET') ?: getenv('FLASK_SECRET_KEY') ?: ''));
  if ($secret !== '') {
    $providedSig = trim((string) ($_COOKIE['user_sig'] ?? ''));
    $expectedSig = hash_hmac('sha256', $cookieValue, $secret);
    if ($providedSig === '' || !hash_equals($expectedSig, $providedSig)) {
      return null;
    }
  }

  $decoded = base64url_decode_str($cookieValue);
  if ($decoded === null) {
    return null;
  }

  $payload = json_decode($decoded, true);
  if (!is_array($payload)) {
    return null;
  }

  $email = strtolower(trim((string) ($payload['email'] ?? '')));
  if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    return null;
  }

  $name = trim((string) ($payload['name'] ?? ''));
  if ($name === '') {
    $name = $email;
  }

  $user = [
    'name' => $name,
    'email' => $email,
  ];
  persist_local_auth_cookie($user);
  return $user;
}

function h(string $value): string
{
  return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function versioned_relative_asset_url(string $relativePath): string
{
  $trimmed = ltrim(trim($relativePath), './');
  if ($trimmed === '') {
    return './';
  }
  $absolute = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $trimmed);
  $version = app_asset_version($absolute);
  return './' . $trimmed . '?v=' . rawurlencode($version);
}

/**
 * @param array<string, mixed> $payload
 */
function json_response(array $payload, int $status = 200): void
{
  app_apply_baseline_security_headers();
  http_response_code($status);
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('CDN-Cache-Control: no-store');
  header('Surrogate-Control: no-store');
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

/**
 * @return array<string, mixed>|null
 */
function request_json_body(): ?array
{
  $raw = file_get_contents('php://input');
  if (!is_string($raw) || trim($raw) === '') {
    return null;
  }
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : null;
}

/**
 * @return array<int, string>
 */
function sprite_allowed_categories(): array
{
  return ['actors', 'monsters', 'items', 'weapons', 'armor', 'environment'];
}

/**
 * @return array<string, string>
 */
function sprite_allowed_mime_to_ext(): array
{
  return [
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/jpeg' => 'jpg',
  ];
}

/**
 * @return array<string, string>
 */
function sprite_allowed_ext_to_mime(): array
{
  return [
    'png' => 'image/png',
    'webp' => 'image/webp',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
  ];
}

function sprite_custom_canonical_root_path(): string
{
  return __DIR__ . DIRECTORY_SEPARATOR . 'client' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'sprites' . DIRECTORY_SEPARATOR . 'custom';
}

function sprite_custom_primary_root_path(): string
{
  return sprite_custom_canonical_root_path();
}

/**
 * @return array<int, string>
 */
function sprite_custom_roots_for_lookup(): array
{
  return [rtrim(sprite_custom_primary_root_path(), DIRECTORY_SEPARATOR)];
}

/**
 * @return array<int, string>
 */
function sprite_allowed_file_exts(): array
{
  return ['png', 'jpg', 'jpeg', 'webp'];
}

function sprite_metadata_file_path(): string
{
  return sprite_custom_primary_root_path() . DIRECTORY_SEPARATOR . '.metadata.json';
}

/**
 * @return array<int, string>
 */
function sprite_metadata_file_path_candidates(): array
{
  $paths = [];
  foreach (sprite_custom_roots_for_lookup() as $root) {
    $candidate = $root . DIRECTORY_SEPARATOR . '.metadata.json';
    if (!in_array($candidate, $paths, true)) {
      $paths[] = $candidate;
    }
  }
  return $paths;
}

function sprite_custom_asset_url(string $category, string $fileName, int $mtime = 0): string
{
  $version = $mtime > 0 ? $mtime : time();
  return sprintf(
    './index.php?api=sprite_asset&category=%s&file=%s&v=%d',
    rawurlencode($category),
    rawurlencode($fileName),
    $version
  );
}

function sprite_normalize_category(string $value): ?string
{
  $category = strtolower(trim($value));
  if ($category === '') {
    return null;
  }
  foreach (sprite_allowed_categories() as $allowed) {
    if ($category === $allowed) {
      return $allowed;
    }
  }
  return null;
}

function sprite_normalize_id(string $value): ?string
{
  $id = strtolower(trim($value));
  if ($id === '' || !preg_match('/^[a-z0-9_]{1,80}$/', $id)) {
    return null;
  }
  return $id;
}

function ensure_sprite_custom_root(): bool
{
  $root = sprite_custom_primary_root_path();
  if (!is_dir($root) && !(mkdir($root, 0775, true) || is_dir($root))) {
    return false;
  }
  @chmod($root, 0775);

  foreach (sprite_allowed_categories() as $category) {
    $dir = $root . DIRECTORY_SEPARATOR . $category;
    if (!is_dir($dir) && !(mkdir($dir, 0775, true) || is_dir($dir))) {
      return false;
    }
    @chmod($dir, 0775);
  }

  return true;
}

/**
 * @return array{scale: array<string, int>}
 */
function load_sprite_metadata_file(string $filePath): array
{
  $out = ['scale' => []];
  if (!is_file($filePath)) {
    return $out;
  }
  $raw = @file_get_contents($filePath);
  if (!is_string($raw) || trim($raw) === '') {
    return $out;
  }
  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    return $out;
  }

  $scaleRaw = $decoded['scale'] ?? [];
  if (!is_array($scaleRaw)) {
    return $out;
  }
  foreach ($scaleRaw as $spriteIdRaw => $valueRaw) {
    $spriteId = sprite_normalize_id((string) $spriteIdRaw);
    if ($spriteId === null) {
      continue;
    }
    $scale = (int) $valueRaw;
    if ($scale < 25 || $scale > 300 || $scale === 100) {
      continue;
    }
    $out['scale'][$spriteId] = $scale;
  }

  return $out;
}

/**
 * @return array{scale: array<string, int>}
 */
function load_sprite_metadata(): array
{
  $out = ['scale' => []];
  $candidates = sprite_metadata_file_path_candidates();
  for ($idx = count($candidates) - 1; $idx >= 0; $idx--) {
    $candidate = $candidates[$idx];
    $loaded = load_sprite_metadata_file($candidate);
    foreach (($loaded['scale'] ?? []) as $spriteId => $scale) {
      $out['scale'][$spriteId] = (int) $scale;
    }
  }

  ksort($out['scale']);
  return $out;
}

/**
 * @param array{scale: array<string, int>} $meta
 */
function persist_sprite_metadata(array $meta): bool
{
  if (!ensure_sprite_custom_root()) {
    return false;
  }
  $payload = [
    'version' => 1,
    'scale' => $meta['scale'] ?? [],
  ];
  $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if (!is_string($json)) {
    return false;
  }
  $file = sprite_metadata_file_path();
  $written = file_put_contents($file, $json . PHP_EOL, LOCK_EX) !== false;
  if ($written) {
    @chmod($file, 0664);
  }
  return $written;
}

function sprite_normalize_scale_percent(mixed $value): ?int
{
  if (!is_scalar($value) && $value !== null) {
    return null;
  }
  $raw = trim((string) $value);
  if ($raw === '' || !preg_match('/^-?\d+$/', $raw)) {
    return null;
  }
  $num = (int) $raw;
  if ($num < 25 || $num > 300) {
    return null;
  }
  return $num;
}

/**
 * @return array{
 *   overrides: array<string, string>,
 *   scales: array<string, int>,
 *   entries: array<int, array{sprite_id: string, category: string, url: string, updated_at: string, scale_percent: int}>
 * }
 */
function list_custom_sprite_overrides(): array
{
  ensure_sprite_custom_root();
  $roots = sprite_custom_roots_for_lookup();
  $allowedExts = sprite_allowed_file_exts();
  $meta = load_sprite_metadata();
  $scales = $meta['scale'] ?? [];

  $overrides = [];
  $entries = [];

  if (!count($roots)) {
    return ['overrides' => $overrides, 'scales' => $scales, 'entries' => $entries];
  }

  foreach ($roots as $root) {
    if (!is_dir($root)) {
      continue;
    }
    foreach (sprite_allowed_categories() as $category) {
      $dir = $root . DIRECTORY_SEPARATOR . $category;
      if (!is_dir($dir)) {
        continue;
      }
      $names = scandir($dir);
      if (!is_array($names)) {
        continue;
      }
      foreach ($names as $name) {
        if ($name === '.' || $name === '..') {
          continue;
        }
        $fullPath = $dir . DIRECTORY_SEPARATOR . $name;
        if (!is_file($fullPath)) {
          continue;
        }
        if (!is_readable($fullPath)) {
          @chmod($fullPath, 0644);
        }
        if (!is_readable($fullPath)) {
          continue;
        }
        $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExts, true)) {
          continue;
        }
        $spriteIdRaw = (string) pathinfo($name, PATHINFO_FILENAME);
        $spriteId = sprite_normalize_id($spriteIdRaw);
        if ($spriteId === null || isset($overrides[$spriteId])) {
          continue;
        }
        $mtime = (int) (@filemtime($fullPath) ?: time());
        $url = sprite_custom_asset_url($category, $name, $mtime);
        $overrides[$spriteId] = $url;
        $entries[] = [
          'sprite_id' => $spriteId,
          'category' => $category,
          'url' => $url,
          'updated_at' => date('c', $mtime),
          'scale_percent' => (int) ($scales[$spriteId] ?? 100),
        ];
      }
    }
  }

  usort(
    $entries,
    static function (array $a, array $b): int {
      return strcmp(($a['sprite_id'] . '|' . $a['category']), ($b['sprite_id'] . '|' . $b['category']));
    }
  );

  ksort($overrides);
  return ['overrides' => $overrides, 'scales' => $scales, 'entries' => $entries];
}

function sprite_upload_error_message(int $errorCode): string
{
  if ($errorCode === UPLOAD_ERR_INI_SIZE || $errorCode === UPLOAD_ERR_FORM_SIZE) {
    $limit = trim((string) (ini_get('upload_max_filesize') ?: ini_get('post_max_size') ?: 'server limit'));
    return sprintf('Uploaded sprite is too large (PHP limit: %s).', $limit);
  }
  if ($errorCode === UPLOAD_ERR_PARTIAL) {
    return 'Sprite upload was interrupted. Please try again.';
  }
  if ($errorCode === UPLOAD_ERR_NO_FILE) {
    return 'No sprite file was uploaded.';
  }
  if ($errorCode === UPLOAD_ERR_NO_TMP_DIR || $errorCode === UPLOAD_ERR_CANT_WRITE || $errorCode === UPLOAD_ERR_EXTENSION) {
    return 'Server could not store the uploaded sprite.';
  }
  return 'Sprite upload failed.';
}

/**
 * Detect MIME type for uploaded image data without hard dependency on ext-fileinfo.
 */
function normalize_sprite_mime(string $mime): ?string
{
  $normalized = strtolower(trim($mime));
  if ($normalized === 'image/jpg' || $normalized === 'image/pjpeg') {
    $normalized = 'image/jpeg';
  }
  $supported = sprite_allowed_mime_to_ext();
  return isset($supported[$normalized]) ? $normalized : null;
}

function detect_sprite_mime_from_signature(string $path): ?string
{
  $fh = @fopen($path, 'rb');
  if ($fh === false) {
    return null;
  }
  $head = @fread($fh, 16);
  @fclose($fh);
  if (!is_string($head) || $head === '') {
    return null;
  }

  if (strlen($head) >= 8 && substr($head, 0, 8) === "\x89PNG\x0D\x0A\x1A\x0A") {
    return 'image/png';
  }
  if (strlen($head) >= 3 && substr($head, 0, 3) === "\xFF\xD8\xFF") {
    return 'image/jpeg';
  }
  if (strlen($head) >= 12 && substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

function detect_uploaded_sprite_mime(string $tmpPath, string $originalName = ''): ?string
{
  $mime = detect_sprite_mime_from_signature($tmpPath);
  if ($mime !== null) {
    return $mime;
  }

  if (function_exists('finfo_open') && defined('FILEINFO_MIME_TYPE')) {
    $finfo = @finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo !== false) {
      $detected = @finfo_file($finfo, $tmpPath);
      @finfo_close($finfo);
      if (is_string($detected) && trim($detected) !== '') {
        $normalized = normalize_sprite_mime($detected);
        if ($normalized !== null) {
          return $normalized;
        }
      }
    }
  }

  if (function_exists('mime_content_type')) {
    $detected = @mime_content_type($tmpPath);
    if (is_string($detected) && trim($detected) !== '') {
      $normalized = normalize_sprite_mime($detected);
      if ($normalized !== null) {
        return $normalized;
      }
    }
  }

  // Validate image payload by content where possible.
  if (function_exists('getimagesize')) {
    $imgInfo = @getimagesize($tmpPath);
    if (is_array($imgInfo) && isset($imgInfo['mime']) && is_string($imgInfo['mime'])) {
      $normalized = normalize_sprite_mime($imgInfo['mime']);
      if ($normalized !== null) {
        return $normalized;
      }
    }
  }

  if ($originalName !== '') {
    $ext = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
    $extMap = sprite_allowed_ext_to_mime();
    if (isset($extMap[$ext])) {
      return $extMap[$ext];
    }
  }

  return null;
}

/**
 * @return bool true when at least one file was removed
 */
function delete_custom_sprite_files(string $category, string $spriteId): bool
{
  $removed = false;
  foreach (sprite_custom_roots_for_lookup() as $root) {
    $dir = $root . DIRECTORY_SEPARATOR . $category;
    foreach (sprite_allowed_file_exts() as $ext) {
      $target = $dir . DIRECTORY_SEPARATOR . $spriteId . '.' . $ext;
      if (!is_file($target)) {
        continue;
      }
      if (@unlink($target)) {
        $removed = true;
      }
    }
  }
  return $removed;
}

function sprite_resolve_custom_file_path(string $category, string $fileName): ?string
{
  $safeCategory = sprite_normalize_category($category);
  if ($safeCategory === null) {
    return null;
  }
  $trimmed = trim($fileName);
  if (!preg_match('/^[a-z0-9_]{1,80}\.(png|jpe?g|webp)$/i', $trimmed)) {
    return null;
  }
  $nameCandidates = array_values(array_unique([$trimmed, strtolower($trimmed)]));
  foreach (sprite_custom_roots_for_lookup() as $root) {
    foreach ($nameCandidates as $name) {
      $candidate = $root . DIRECTORY_SEPARATOR . $safeCategory . DIRECTORY_SEPARATOR . $name;
      if (is_file($candidate) && is_readable($candidate)) {
        return $candidate;
      }
    }
  }
  return null;
}

function monster_editor_file_path(): string
{
  return app_storage_path('data/monsters.json');
}

function monster_editor_legacy_file_path(): string
{
  return app_storage_path('monster_editor/config.json');
}

function monster_editor_seed_file_path(): string
{
  return __DIR__ . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'content' . DIRECTORY_SEPARATOR . 'monsters.seed.json';
}

function ensure_monster_editor_storage_root(): bool
{
  $dir = dirname(monster_editor_file_path());
  return is_dir($dir) || @mkdir($dir, 0700, true) || is_dir($dir);
}

function rotate_monster_editor_backups(string $path, int $maxBackups = 2): void
{
  $safeMax = max(1, min(9, $maxBackups));
  for ($i = $safeMax; $i >= 1; $i--) {
    $src = $i === 1 ? $path : ($path . '.bak.' . ($i - 1));
    $dest = $path . '.bak.' . $i;
    if (!is_file($src) || !is_readable($src)) {
      continue;
    }
    @unlink($dest);
    if (@copy($src, $dest)) {
      @chmod($dest, 0640);
    }
  }
}

function monster_editor_normalize_id(string $value): ?string
{
  $id = strtolower(trim($value));
  if ($id === '' || !preg_match('/^[a-z0-9_]{1,80}$/', $id)) {
    return null;
  }
  return $id;
}

function monster_editor_title_from_id(string $id): string
{
  $parts = preg_split('/_+/', trim($id)) ?: [];
  $parts = array_filter($parts, static fn (string $part): bool => $part !== '');
  if (!$parts) {
    return 'Monster';
  }
  $named = array_map(static fn (string $part): string => ucfirst($part), $parts);
  return implode(' ', $named);
}

function monster_editor_clamp_int(mixed $value, int $min, int $max, int $fallback): int
{
  if (!is_numeric($value)) {
    return $fallback;
  }
  $n = (int) floor((float) $value);
  if ($n < $min) {
    return $min;
  }
  if ($n > $max) {
    return $max;
  }
  return $n;
}

function monster_editor_clamp_float(mixed $value, float $min, float $max, float $fallback, int $precision = 4): float
{
  if (!is_numeric($value)) {
    return $fallback;
  }
  $n = (float) $value;
  if ($n < $min) {
    $n = $min;
  } elseif ($n > $max) {
    $n = $max;
  }
  return (float) round($n, $precision);
}

/**
 * @param array<string, mixed> $raw
 * @return array{version: int, monsters: array<string, array<string, mixed>>, spawn_rules: array<int, array<string, mixed>>, updated_at: string}
 */
function monster_editor_normalize_payload(array $raw): array
{
  $versionRaw = $raw['version'] ?? 1;
  $version = 1;
  if (is_numeric($versionRaw)) {
    $version = max(1, min(1000, (int) floor((float) $versionRaw)));
  }
  $monstersRaw = $raw['monsters'] ?? [];
  $spawnRulesRaw = $raw['spawn_rules'] ?? [];

  $monsters = [];
  if (is_array($monstersRaw)) {
    foreach ($monstersRaw as $idRaw => $specRaw) {
      $id = monster_editor_normalize_id((string) $idRaw);
      if ($id === null || !is_array($specRaw)) {
        continue;
      }

      $name = trim((string) ($specRaw['name'] ?? ''));
      if ($name === '') {
        $name = monster_editor_title_from_id($id);
      }
      if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 80);
      } else {
        $name = substr($name, 0, 80);
      }

      $glyphRaw = trim((string) ($specRaw['glyph'] ?? ''));
      $glyph = $glyphRaw !== '' ? $glyphRaw : substr($id, 0, 1);
      if (function_exists('mb_substr')) {
        $glyph = mb_substr($glyph, 0, 2);
      } else {
        $glyph = substr($glyph, 0, 2);
      }
      if ($glyph === '') {
        $glyph = 'm';
      }

      $aliasOf = monster_editor_normalize_id((string) ($specRaw['aliasOf'] ?? ''));
      $ai = trim((string) ($specRaw['ai'] ?? ''));
      if (function_exists('mb_substr')) {
        $ai = mb_substr($ai, 0, 40);
      } else {
        $ai = substr($ai, 0, 40);
      }

      $spec = [
        'id' => $id,
        'name' => $name,
        'glyph' => $glyph,
        'sizeGrowth' => isset($specRaw['sizeGrowth']) ? (bool) $specRaw['sizeGrowth'] : true,
        'baseHp' => monster_editor_clamp_int($specRaw['baseHp'] ?? null, 1, 250000, 18),
        'baseAtk' => monster_editor_clamp_int($specRaw['baseAtk'] ?? null, 1, 250000, 6),
        'baseDef' => monster_editor_clamp_int($specRaw['baseDef'] ?? null, 0, 250000, 1),
        'baseAcc' => monster_editor_clamp_int($specRaw['baseAcc'] ?? null, 1, 98, 70),
        'baseEva' => monster_editor_clamp_int($specRaw['baseEva'] ?? null, 0, 95, 8),
        'spd' => monster_editor_clamp_float($specRaw['spd'] ?? null, 0.1, 8.0, 1.0, 3),
        'xp' => monster_editor_clamp_int($specRaw['xp'] ?? null, 1, 250000, 3),
      ];
      if ($aliasOf !== null && $aliasOf !== $id) {
        $spec['aliasOf'] = $aliasOf;
      }
      if ($ai !== '') {
        $spec['ai'] = $ai;
      }

      $optionalInt = [
        'range' => [0, 30],
        'cdTurns' => [0, 12],
        'preferredRange' => [0, 30],
        'blinkRange' => [0, 12],
        'poisonOnHitTurns' => [0, 20],
        'poisonOnHitDmg' => [0, 250000],
        'slowTurns' => [0, 20],
        'summonCooldownTurns' => [0, 30],
        'deathCloudTurns' => [0, 20],
        'deathCloudRadius' => [0, 8],
        'deathCloudDmg' => [0, 250000],
      ];
      foreach ($optionalInt as $key => [$min, $max]) {
        if (!array_key_exists($key, $specRaw)) {
          continue;
        }
        $value = monster_editor_clamp_int($specRaw[$key], $min, $max, $min);
        if ($value > 0) {
          $spec[$key] = $value;
        }
      }

      $optionalFloat = [
        'poisonOnHitChance' => [0.0, 1.0, 3],
        'slowOnHitChance' => [0.0, 1.0, 3],
        'stunOnHitChance' => [0.0, 1.0, 3],
        'knockbackOnHitChance' => [0.0, 1.0, 3],
        'backstabDamageMult' => [0.5, 5.0, 3],
        'meleeReflectPct' => [0.0, 0.95, 3],
      ];
      foreach ($optionalFloat as $key => [$min, $max, $precision]) {
        if (!array_key_exists($key, $specRaw)) {
          continue;
        }
        $value = monster_editor_clamp_float($specRaw[$key], $min, $max, $min, $precision);
        if ($value > $min) {
          $spec[$key] = $value;
        }
      }

      if (!empty($specRaw['immunePoison'])) {
        $spec['immunePoison'] = true;
      }

      $knownKeys = array_fill_keys(array_keys($spec), true);
      foreach ($specRaw as $rawKey => $rawValue) {
        $key = trim((string) $rawKey);
        if ($key === '' || isset($knownKeys[$key])) {
          continue;
        }
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/', $key)) {
          continue;
        }
        if (is_bool($rawValue)) {
          $spec[$key] = $rawValue;
          continue;
        }
        if (is_numeric($rawValue)) {
          $spec[$key] = (float) round((float) $rawValue, 4);
          continue;
        }
        if (is_string($rawValue)) {
          $trimmed = trim($rawValue);
          if ($trimmed === '') {
            continue;
          }
          if (function_exists('mb_substr')) {
            $trimmed = mb_substr($trimmed, 0, 80);
          } else {
            $trimmed = substr($trimmed, 0, 80);
          }
          $spec[$key] = $trimmed;
        }
      }

      $monsters[$id] = $spec;
    }
  }
  ksort($monsters);

  $spawnRules = [];
  if (is_array($spawnRulesRaw)) {
    foreach ($spawnRulesRaw as $ruleRaw) {
      if (!is_array($ruleRaw)) {
        continue;
      }
      $id = monster_editor_normalize_id((string) ($ruleRaw['id'] ?? ''));
      if ($id === null) {
        continue;
      }
      if (!isset($monsters[$id])) {
        continue;
      }
      $minDepth = monster_editor_clamp_int($ruleRaw['minDepth'] ?? null, 0, 5000, 0);
      $maxDepthRaw = $ruleRaw['maxDepth'] ?? null;
      $maxDepth = null;
      if ($maxDepthRaw !== null && $maxDepthRaw !== '') {
        $maxDepth = monster_editor_clamp_int($maxDepthRaw, $minDepth, 5000, $minDepth);
      }
      $spawnRules[] = [
        'id' => $id,
        'minDepth' => $minDepth,
        'maxDepth' => $maxDepth,
        'baseWeight' => monster_editor_clamp_float($ruleRaw['baseWeight'] ?? null, 0, 20, 1, 3),
        'rampFactor' => monster_editor_clamp_float($ruleRaw['rampFactor'] ?? null, -5, 5, 0, 3),
      ];
    }
  }
  usort(
    $spawnRules,
    static function (array $a, array $b): int {
      return ($a['minDepth'] <=> $b['minDepth']) ?: strcmp((string) $a['id'], (string) $b['id']);
    }
  );

  $updatedAt = trim((string) ($raw['updated_at'] ?? ''));
  if ($updatedAt === '') {
    $updatedAt = date('c');
  }

  return [
    'version' => $version,
    'monsters' => $monsters,
    'spawn_rules' => $spawnRules,
    'updated_at' => $updatedAt,
  ];
}

/**
 * @return array{version: int, monsters: array<string, array<string, mixed>>, spawn_rules: array<int, array<string, mixed>>, updated_at: string}
 */
function load_monster_editor_config(): array
{
  $paths = [monster_editor_file_path(), monster_editor_legacy_file_path(), monster_editor_seed_file_path()];
  foreach ($paths as $path) {
    if (!is_file($path) || !is_readable($path)) {
      continue;
    }
    $raw = @file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') {
      continue;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
      continue;
    }
    $normalized = monster_editor_normalize_payload($decoded);
    if ($path !== monster_editor_file_path()) {
      persist_monster_editor_config($normalized);
    }
    return $normalized;
  }
  return ['version' => 1, 'monsters' => [], 'spawn_rules' => [], 'updated_at' => ''];
}

function persist_monster_editor_config(array $payload): bool
{
  if (!ensure_monster_editor_storage_root()) {
    return false;
  }
  $normalized = monster_editor_normalize_payload($payload);
  $normalized['updated_at'] = date('c');
  $json = json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  if (!is_string($json)) {
    return false;
  }
  $path = monster_editor_file_path();
  $tmpSuffix = '';
  try {
    $tmpSuffix = bin2hex(random_bytes(8));
  } catch (Throwable) {
    $tmpSuffix = str_replace('.', '', uniqid('', true));
  }
  $tempPath = $path . '.tmp.' . $tmpSuffix;
  $fp = @fopen($tempPath, 'wb');
  if ($fp === false) {
    return false;
  }
  $written = fwrite($fp, $json . "\n");
  if (is_int($written) && $written > 0) {
    fflush($fp);
    if (function_exists('fsync')) {
      @fsync($fp);
    }
  }
  fclose($fp);
  if (!is_int($written) || $written <= 0) {
    @unlink($tempPath);
    return false;
  }
  if (is_file($path)) {
    rotate_monster_editor_backups($path, 2);
  }
  if (!@rename($tempPath, $path)) {
    @unlink($tempPath);
    return false;
  }
  @chmod($path, 0640);
  return true;
}

function save_storage_root(): string
{
  $configured = trim((string) (getenv('DUNGEON25_SAVE_PATH') ?: getenv('DUNGEON2_SAVE_PATH')));
  if ($configured !== '') {
    return $configured;
  }
  return app_storage_path('savegames');
}

function save_legacy_storage_root(): string
{
  return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'savegames';
}

/**
 * @return array<int, string>
 */
function save_storage_root_candidates(): array
{
  $roots = [];
  foreach ([save_storage_root(), save_legacy_storage_root()] as $root) {
    $trimmed = rtrim(trim($root), DIRECTORY_SEPARATOR);
    if ($trimmed === '' || in_array($trimmed, $roots, true)) {
      continue;
    }
    $roots[] = $trimmed;
  }
  return $roots;
}

function save_signing_secret(): string
{
  return trim((string) (
    getenv('DUNGEON2_SAVE_SECRET') ?: getenv('SECURE_AUTH_SECRET') ?: getenv('FLASK_SECRET_KEY') ?: ''
  ));
}

function safe_file_token(string $value): string
{
  return hash('sha256', strtolower(trim($value)));
}

function user_save_file_path(string $email): string
{
  return save_storage_root() . DIRECTORY_SEPARATOR . safe_file_token($email) . '.json';
}

/**
 * @return array<int, string>
 */
function user_save_file_path_candidates(string $email): array
{
  $token = safe_file_token($email) . '.json';
  $paths = [];
  foreach (save_storage_root_candidates() as $root) {
    $candidate = $root . DIRECTORY_SEPARATOR . $token;
    if (!in_array($candidate, $paths, true)) {
      $paths[] = $candidate;
    }
  }
  return $paths;
}

function ensure_save_storage_root(): bool
{
  $root = save_storage_root();
  if (is_dir($root)) {
    return true;
  }
  return mkdir($root, 0700, true) || is_dir($root);
}

function trim_save_name(string $value): string
{
  $normalized = preg_replace('/[\x00-\x1F\x7F]+/u', '', trim($value));
  if (!is_string($normalized)) {
    $normalized = trim($value);
  }
  if (function_exists('mb_substr')) {
    return mb_substr($normalized, 0, SAVE_NAME_MAX_LEN);
  }
  return substr($normalized, 0, SAVE_NAME_MAX_LEN);
}

function default_save_name(int $level, int $depth): string
{
  $safeLevel = max(1, min(9999, $level));
  $safeDepth = max(-1, min(9999, $depth));
  return trim_save_name(sprintf('Lvl %d, Depth %d, %s', $safeLevel, $safeDepth, date('Y-m-d H:i:s')));
}

function save_entry_signature(array $entry, string $secret): string
{
  $parts = [
    (string) ($entry['id'] ?? ''),
    (string) ($entry['name'] ?? ''),
    (string) ($entry['payload'] ?? ''),
    (string) ($entry['level'] ?? ''),
    (string) ($entry['depth'] ?? ''),
    (string) ($entry['created_at'] ?? ''),
    (string) ($entry['updated_at'] ?? ''),
  ];
  return hash_hmac('sha256', implode('|', $parts), $secret);
}

/**
 * @return array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }|null
 */
function normalize_save_entry(array $entry, string $secret): ?array
{
  $id = trim((string) ($entry['id'] ?? ''));
  $payload = trim((string) ($entry['payload'] ?? ''));
  if ($id === '' || !preg_match('/^[a-f0-9]{16,64}$/', $id)) {
    return null;
  }
  if ($payload === '' || strlen($payload) > SAVE_PAYLOAD_MAX_LEN) {
    return null;
  }

  $level = max(1, min(9999, (int) ($entry['level'] ?? 1)));
  $depth = max(-1, min(9999, (int) ($entry['depth'] ?? 0)));
  $createdAt = trim((string) ($entry['created_at'] ?? ''));
  $updatedAt = trim((string) ($entry['updated_at'] ?? ''));
  if ($createdAt === '') {
    $createdAt = date('c');
  }
  if ($updatedAt === '') {
    $updatedAt = $createdAt;
  }
  $nameRaw = trim((string) ($entry['name'] ?? ''));
  $name = $nameRaw === '' ? default_save_name($level, $depth) : trim_save_name($nameRaw);
  if ($name === '') {
    $name = default_save_name($level, $depth);
  }

  $normalized = [
    'id' => $id,
    'name' => $name,
    'payload' => $payload,
    'level' => $level,
    'depth' => $depth,
    'created_at' => $createdAt,
    'updated_at' => $updatedAt,
    'sig' => '',
  ];

  $providedSig = trim((string) ($entry['sig'] ?? ''));
  if ($secret !== '') {
    $expectedSig = save_entry_signature($normalized, $secret);
    if ($providedSig === '' || !hash_equals($expectedSig, $providedSig)) {
      return null;
    }
    $normalized['sig'] = $expectedSig;
  } else {
    $normalized['sig'] = hash('sha256', implode('|', [$id, $payload, $updatedAt]));
  }

  return $normalized;
}

/**
 * @return array<int, array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }>
 */
function load_user_saves(string $email, string $secret): array
{
  $file = null;
  $bestMtime = -1;
  foreach (user_save_file_path_candidates($email) as $candidate) {
    if (!is_file($candidate)) {
      continue;
    }
    $mtime = (int) (@filemtime($candidate) ?: 0);
    if ($file === null || $mtime > $bestMtime) {
      $file = $candidate;
      $bestMtime = $mtime;
    }
  }
  if ($file === null) {
    return [];
  }
  $raw = file_get_contents($file);
  if (!is_string($raw) || trim($raw) === '') {
    return [];
  }

  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    return [];
  }
  $entriesRaw = $decoded['saves'] ?? [];
  if (!is_array($entriesRaw)) {
    return [];
  }

  $entries = [];
  foreach ($entriesRaw as $entry) {
    if (!is_array($entry)) {
      continue;
    }
    $normalized = normalize_save_entry($entry, $secret);
    if ($normalized === null) {
      continue;
    }
    $entries[] = $normalized;
  }

  usort(
    $entries,
    static function (array $a, array $b): int {
      return strcmp((string) $b['updated_at'], (string) $a['updated_at']);
    }
  );

  return array_slice($entries, 0, MAX_SERVER_SAVES);
}

/**
 * @param array<int, array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }> $entries
 */
function persist_user_saves(string $email, array $entries, string $secret): bool
{
  if (!ensure_save_storage_root()) {
    return false;
  }

  $normalizedEntries = [];
  foreach (array_slice($entries, 0, MAX_SERVER_SAVES) as $entry) {
    $next = $entry;
    if ($secret !== '') {
      $next['sig'] = save_entry_signature($next, $secret);
    } else {
      $next['sig'] = hash('sha256', implode('|', [$next['id'], $next['payload'], $next['updated_at']]));
    }
    $normalizedEntries[] = $next;
  }

  $payload = [
    'version' => 1,
    'saves' => $normalizedEntries,
  ];
  $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if (!is_string($json)) {
    return false;
  }

  $file = user_save_file_path($email);
  $written = file_put_contents($file, $json . PHP_EOL, LOCK_EX) !== false;
  if ($written) {
    @chmod($file, 0600);
  }
  return $written;
}

/**
 * @param array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * } $entry
 * @return array{id: string, name: string, level: int, depth: int, created_at: string, updated_at: string}
 */
function save_entry_public_meta(array $entry): array
{
  return [
    'id' => (string) $entry['id'],
    'name' => (string) $entry['name'],
    'level' => (int) $entry['level'],
    'depth' => (int) $entry['depth'],
    'created_at' => (string) $entry['created_at'],
    'updated_at' => (string) $entry['updated_at'],
  ];
}

/**
 * @param array<int, array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }> $entries
 * @return array<int, array{id: string, name: string, level: int, depth: int, created_at: string, updated_at: string}>
 */
function save_entries_public_meta(array $entries): array
{
  $out = [];
  foreach ($entries as $entry) {
    $out[] = save_entry_public_meta($entry);
  }
  return $out;
}

$currentUrl = current_request_url();
$currentBaseUrl = current_request_base_url();
$pageVersion = app_asset_version(__FILE__) . '-' . app_asset_version(__DIR__ . DIRECTORY_SEPARATOR . 'game.js');
$requestedBust = trim((string) ($_GET['rb'] ?? ''));
$renderCacheBust = $requestedBust !== '' ? $requestedBust : bin2hex(random_bytes(6));
$logoutRequested = trim((string) ($_GET['logout'] ?? '')) === '1';
if ($logoutRequested) {
  clear_local_auth_cookie();
  $_SESSION = [];
  if (session_status() === PHP_SESSION_ACTIVE) {
    if (ini_get('session.use_cookies')) {
      $params = session_get_cookie_params();
      setcookie(
        session_name(),
        '',
        time() - 42000,
        (string) ($params['path'] ?? '/'),
        (string) ($params['domain'] ?? ''),
        (bool) ($params['secure'] ?? false),
        (bool) ($params['httponly'] ?? true)
      );
    }
    session_destroy();
  }
  $logoutRedirect = 'https://secure.blahpunk.com/logout';
  if ($currentBaseUrl !== null) {
    $logoutRedirect .= '?next=' . rawurlencode($currentBaseUrl);
  }
  header('Location: ' . $logoutRedirect, true, 302);
  exit;
}

// Force a versioned page URL so stale edge-cached HTML is less likely to persist.
$apiMode = trim((string) ($_GET['api'] ?? ''));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$requestedVersion = trim((string) ($_GET['v'] ?? ''));
if (
  $apiMode === ''
  && !$logoutRequested
  && $method === 'GET'
  && ($requestedVersion !== $pageVersion || $requestedBust === '')
) {
  $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
  $path = (string) (parse_url($uri, PHP_URL_PATH) ?? '/');
  $queryRaw = (string) (parse_url($uri, PHP_URL_QUERY) ?? '');
  $query = [];
  if ($queryRaw !== '') {
    parse_str($queryRaw, $query);
  }
  $query['v'] = $pageVersion;
  $query['rb'] = bin2hex(random_bytes(6));
  $redirectTarget = $path . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('CDN-Cache-Control: no-store');
  header('Surrogate-Control: no-store');
  header('Location: ' . $redirectTarget, true, 302);
  exit;
}

$user = get_authenticated_user();
$userEmail = strtolower(trim((string) ($user['email'] ?? '')));
$isAdminUser = $userEmail !== '' && $userEmail === ADMIN_EMAIL;

$loginUrl = 'https://secure.blahpunk.com/oauth_login';
if ($currentUrl !== null) {
  $loginUrl .= '?next=' . rawurlencode($currentUrl);
}

$authHref = $user !== null ? '?logout=1' : $loginUrl;
$authLabel = $user !== null ? 'Logout' : 'Login with Google';

if (empty($_SESSION['savegames_csrf'])) {
  $_SESSION['savegames_csrf'] = bin2hex(random_bytes(32));
}
$saveGamesCsrf = (string) $_SESSION['savegames_csrf'];

if ($apiMode === 'sprite_asset') {
  if (!app_rate_limit('api_sprite_asset', 2400, 60)) {
    json_response(['ok' => false, 'error' => 'Too many sprite requests. Please retry shortly.'], 429);
  }
  $category = (string) ($_GET['category'] ?? '');
  $fileName = (string) ($_GET['file'] ?? '');
  $path = sprite_resolve_custom_file_path($category, $fileName);
  if ($path === null) {
    app_apply_baseline_security_headers();
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo 'Sprite not found.';
    exit;
  }
  if (!is_file($path) || !is_readable($path)) {
    app_apply_baseline_security_headers();
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo 'Sprite not found.';
    exit;
  }

  $ext = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));
  $mimeMap = sprite_allowed_ext_to_mime();
  $mime = $mimeMap[$ext] ?? 'application/octet-stream';
  $mtime = (int) (@filemtime($path) ?: time());
  $size = (int) (@filesize($path) ?: 0);
  $etag = '"' . hash('sha256', $path . '|' . $mtime . '|' . $size) . '"';

  app_apply_baseline_security_headers();
  header('Content-Type: ' . $mime);
  if (trim((string) ($_GET['v'] ?? '')) !== '') {
    header('Cache-Control: public, max-age=31536000, immutable');
  } else {
    header('Cache-Control: public, max-age=120, must-revalidate');
  }
  header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
  header('ETag: ' . $etag);

  $ifNoneMatch = trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
  if ($ifNoneMatch !== '' && $ifNoneMatch === $etag) {
    http_response_code(304);
    exit;
  }
  $ifModifiedSince = trim((string) ($_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? ''));
  if ($ifModifiedSince !== '') {
    $ifModifiedTs = strtotime($ifModifiedSince);
    if (is_int($ifModifiedTs) && $ifModifiedTs >= $mtime) {
      http_response_code(304);
      exit;
    }
  }
  if ($size > 0) {
    header('Content-Length: ' . $size);
  }
  readfile($path);
  exit;
}
if ($apiMode === 'sprites') {
  $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  if ($method === 'GET' && !app_rate_limit('api_sprites_get', 240, 60)) {
    json_response(['ok' => false, 'error' => 'Too many requests. Please retry shortly.'], 429);
  }
  if ($method === 'POST' && !app_rate_limit('api_sprites_post', 60, 60)) {
    json_response(['ok' => false, 'error' => 'Too many write requests. Please retry shortly.'], 429);
  }
  if ($method === 'GET') {
    $payload = list_custom_sprite_overrides();
    json_response([
      'ok' => true,
      'max_upload_bytes' => SPRITE_UPLOAD_MAX_BYTES,
      'overrides' => $payload['overrides'],
      'scales' => $payload['scales'],
      'entries' => $payload['entries'],
    ]);
  }

  if ($method !== 'POST') {
    json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
  }
  if (!$isAdminUser) {
    json_response(['ok' => false, 'error' => 'Admin access required.'], 403);
  }
  $csrfHeader = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
  if ($csrfHeader === '' || !hash_equals($saveGamesCsrf, $csrfHeader)) {
    json_response(['ok' => false, 'error' => 'CSRF validation failed.'], 403);
  }
  $action = strtolower(trim((string) ($_POST['action'] ?? '')));
  $spriteId = sprite_normalize_id((string) ($_POST['sprite_id'] ?? ''));
  $category = sprite_normalize_category((string) ($_POST['category'] ?? ''));
  if ($action === '' || $spriteId === null || $category === null) {
    json_response(['ok' => false, 'error' => 'Missing or invalid sprite action fields.'], 400);
  }
  if (!ensure_sprite_custom_root()) {
    json_response(['ok' => false, 'error' => 'Could not initialize sprite storage.'], 500);
  }

  if ($action === 'delete') {
    $removed = delete_custom_sprite_files($category, $spriteId);
    $payload = list_custom_sprite_overrides();
    json_response([
      'ok' => true,
      'message' => $removed ? 'Sprite override removed.' : 'No override existed for this sprite.',
      'removed' => $removed,
      'overrides' => $payload['overrides'],
      'scales' => $payload['scales'],
      'entries' => $payload['entries'],
    ]);
  }

  if ($action === 'scale') {
    $scalePercent = sprite_normalize_scale_percent($_POST['scale_percent'] ?? null);
    if ($scalePercent === null) {
      json_response(['ok' => false, 'error' => 'Scale percent must be between 25 and 300.'], 400);
    }
    $meta = load_sprite_metadata();
    $scaleMap = $meta['scale'] ?? [];
    if ($scalePercent === 100) {
      unset($scaleMap[$spriteId]);
    } else {
      $scaleMap[$spriteId] = $scalePercent;
    }
    ksort($scaleMap);
    if (!persist_sprite_metadata(['scale' => $scaleMap])) {
      json_response(['ok' => false, 'error' => 'Could not persist sprite scale metadata.'], 500);
    }
    $payload = list_custom_sprite_overrides();
    json_response([
      'ok' => true,
      'message' => 'Sprite scale updated.',
      'sprite_id' => $spriteId,
      'scale_percent' => $scalePercent,
      'overrides' => $payload['overrides'],
      'scales' => $payload['scales'],
      'entries' => $payload['entries'],
    ]);
  }

  if ($action !== 'upload') {
    json_response(['ok' => false, 'error' => 'Unsupported action.'], 400);
  }

  $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($contentLength > 0 && $contentLength > (SPRITE_UPLOAD_MAX_BYTES + 65536)) {
    json_response([
      'ok' => false,
      'error' => sprintf(
        'Uploaded sprite is too large (%0.1f MB max).',
        SPRITE_UPLOAD_MAX_BYTES / (1024 * 1024)
      ),
    ], 413);
  }

  $uploaded = $_FILES['sprite_file'] ?? null;
  if (!is_array($uploaded)) {
    json_response(['ok' => false, 'error' => 'Missing sprite upload payload.'], 400);
  }
  $uploadError = (int) ($uploaded['error'] ?? UPLOAD_ERR_NO_FILE);
  if ($uploadError !== UPLOAD_ERR_OK) {
    json_response(['ok' => false, 'error' => sprite_upload_error_message($uploadError)], 400);
  }
  $tmpPath = (string) ($uploaded['tmp_name'] ?? '');
  if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    json_response(['ok' => false, 'error' => 'Uploaded sprite temp file is invalid.'], 400);
  }
  $size = (int) ($uploaded['size'] ?? 0);
  if ($size <= 0) {
    json_response(['ok' => false, 'error' => 'Uploaded sprite is empty.'], 400);
  }
  if ($size > SPRITE_UPLOAD_MAX_BYTES) {
    json_response(['ok' => false, 'error' => 'Uploaded sprite is too large.'], 413);
  }

  $originalName = (string) ($uploaded['name'] ?? '');
  $mime = (string) (detect_uploaded_sprite_mime($tmpPath, $originalName) ?? '');
  $mimeMap = sprite_allowed_mime_to_ext();
  $ext = $mimeMap[$mime] ?? null;
  if ($ext === null) {
    json_response(['ok' => false, 'error' => 'Unsupported sprite format. Use PNG, JPEG, or WEBP.'], 415);
  }

  delete_custom_sprite_files($category, $spriteId);
  $targetDir = sprite_custom_primary_root_path() . DIRECTORY_SEPARATOR . $category;
  $targetName = $spriteId . '.' . $ext;
  $targetPath = $targetDir . DIRECTORY_SEPARATOR . $targetName;
  if (!move_uploaded_file($tmpPath, $targetPath)) {
    json_response(['ok' => false, 'error' => 'Failed to store uploaded sprite.'], 500);
  }
  @chmod($targetPath, 0644);
  $mtime = (int) (@filemtime($targetPath) ?: time());
  $publicUrl = sprite_custom_asset_url($category, $targetName, $mtime);

  $payload = list_custom_sprite_overrides();
  json_response([
    'ok' => true,
    'message' => 'Sprite uploaded.',
    'sprite_id' => $spriteId,
    'category' => $category,
    'url' => $publicUrl,
    'overrides' => $payload['overrides'],
    'scales' => $payload['scales'],
    'entries' => $payload['entries'],
  ]);
}
if ($apiMode === 'monsters') {
  $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  if ($method === 'GET' && !app_rate_limit('api_monsters_get', 240, 60)) {
    json_response(['ok' => false, 'error' => 'Too many requests. Please retry shortly.'], 429);
  }
  if ($method === 'POST' && !app_rate_limit('api_monsters_post', 60, 60)) {
    json_response(['ok' => false, 'error' => 'Too many write requests. Please retry shortly.'], 429);
  }

  if ($method === 'GET') {
    $payload = load_monster_editor_config();
    json_response([
      'ok' => true,
      'version' => (int) ($payload['version'] ?? 1),
      'monsters' => (object) ($payload['monsters'] ?? []),
      'spawn_rules' => $payload['spawn_rules'] ?? [],
      'updated_at' => (string) ($payload['updated_at'] ?? ''),
    ]);
  }

  if ($method !== 'POST') {
    json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
  }
  if (!$isAdminUser) {
    json_response(['ok' => false, 'error' => 'Admin access required.'], 403);
  }
  $csrfHeader = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
  if ($csrfHeader === '' || !hash_equals($saveGamesCsrf, $csrfHeader)) {
    json_response(['ok' => false, 'error' => 'CSRF validation failed.'], 403);
  }
  $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($contentLength > 0 && $contentLength > MONSTER_EDITOR_PAYLOAD_MAX_BYTES) {
    json_response(['ok' => false, 'error' => 'Monster payload is too large.'], 413);
  }

  $body = request_json_body();
  if ($body === null) {
    json_response(['ok' => false, 'error' => 'Invalid JSON body.'], 400);
  }
  $action = strtolower(trim((string) ($body['action'] ?? '')));
  if ($action !== 'save') {
    json_response(['ok' => false, 'error' => 'Unsupported action.'], 400);
  }

  $payload = [
    'version' => max(1, min(1000, (int) floor((float) ($body['version'] ?? 1)))),
    'monsters' => is_array($body['monsters'] ?? null) ? $body['monsters'] : [],
    'spawn_rules' => is_array($body['spawn_rules'] ?? null) ? $body['spawn_rules'] : [],
    'updated_at' => date('c'),
  ];
  if (!persist_monster_editor_config($payload)) {
    json_response(['ok' => false, 'error' => 'Could not persist monster editor data.'], 500);
  }
  $saved = load_monster_editor_config();
  json_response([
    'ok' => true,
    'message' => 'Monster editor data saved.',
    'version' => (int) ($saved['version'] ?? 1),
    'monsters' => (object) ($saved['monsters'] ?? []),
    'spawn_rules' => $saved['spawn_rules'] ?? [],
    'updated_at' => (string) ($saved['updated_at'] ?? ''),
  ]);
}
if ($apiMode === 'savegames') {
  $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  if ($method === 'GET' && !app_rate_limit('api_savegames_get', 240, 60)) {
    json_response(['ok' => false, 'error' => 'Too many save requests. Please retry shortly.'], 429);
  }
  if ($method === 'POST' && !app_rate_limit('api_savegames_post', 90, 60)) {
    json_response(['ok' => false, 'error' => 'Too many save writes. Please retry shortly.'], 429);
  }
  if ($user === null || $userEmail === '') {
    json_response(['ok' => false, 'error' => 'Please log in to manage save games.'], 401);
  }

  $saveSecret = save_signing_secret();
  if ($saveSecret === '') {
    json_response(['ok' => false, 'error' => 'Server save signing key is not configured.'], 500);
  }

  $entries = load_user_saves($userEmail, $saveSecret);

  if ($method === 'GET') {
    $loadId = trim((string) ($_GET['load'] ?? ''));
    if ($loadId !== '') {
      $found = null;
      foreach ($entries as $entry) {
        if ($entry['id'] === $loadId) {
          $found = $entry;
          break;
        }
      }
      if ($found === null) {
        json_response(['ok' => false, 'error' => 'Save not found.'], 404);
      }
      json_response([
        'ok' => true,
        'save' => [
          'id' => (string) $found['id'],
          'name' => (string) $found['name'],
          'payload' => (string) $found['payload'],
          'level' => (int) $found['level'],
          'depth' => (int) $found['depth'],
          'created_at' => (string) $found['created_at'],
          'updated_at' => (string) $found['updated_at'],
        ],
      ]);
    }

    json_response([
      'ok' => true,
      'max_saves' => MAX_SERVER_SAVES,
      'name_max_len' => SAVE_NAME_MAX_LEN,
      'saves' => save_entries_public_meta($entries),
    ]);
  }

  if ($method !== 'POST') {
    json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
  }

  $csrfHeader = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
  if ($csrfHeader === '' || !hash_equals($saveGamesCsrf, $csrfHeader)) {
    json_response(['ok' => false, 'error' => 'CSRF validation failed.'], 403);
  }

  $body = request_json_body();
  if ($body === null) {
    json_response(['ok' => false, 'error' => 'Invalid JSON body.'], 400);
  }

  $action = trim((string) ($body['action'] ?? ''));
  if ($action === 'delete') {
    $targetId = trim((string) ($body['id'] ?? ''));
    if ($targetId === '') {
      json_response(['ok' => false, 'error' => 'Missing save id.'], 400);
    }

    $nextEntries = [];
    $deleted = false;
    foreach ($entries as $entry) {
      if ($entry['id'] === $targetId) {
        $deleted = true;
        continue;
      }
      $nextEntries[] = $entry;
    }
    if (!$deleted) {
      json_response(['ok' => false, 'error' => 'Save not found.'], 404);
    }
    if (!persist_user_saves($userEmail, $nextEntries, $saveSecret)) {
      json_response(['ok' => false, 'error' => 'Failed to delete save.'], 500);
    }
    json_response([
      'ok' => true,
      'message' => 'Save deleted.',
      'max_saves' => MAX_SERVER_SAVES,
      'name_max_len' => SAVE_NAME_MAX_LEN,
      'saves' => save_entries_public_meta($nextEntries),
    ]);
  }

  if ($action !== 'save') {
    json_response(['ok' => false, 'error' => 'Unsupported action.'], 400);
  }

  $payload = trim((string) ($body['payload'] ?? ''));
  if ($payload === '') {
    json_response(['ok' => false, 'error' => 'Missing save payload.'], 400);
  }
  if (strlen($payload) > SAVE_PAYLOAD_MAX_LEN) {
    json_response(['ok' => false, 'error' => 'Save payload is too large.'], 413);
  }

  $level = max(1, min(9999, (int) ($body['level'] ?? 1)));
  $depth = max(-1, min(9999, (int) ($body['depth'] ?? 0)));
  $nameInput = trim((string) ($body['name'] ?? ''));
  $name = trim_save_name($nameInput);
  if ($name === '') {
    $name = default_save_name($level, $depth);
  }

  $overwriteId = trim((string) ($body['overwrite_id'] ?? ''));
  $nowIso = date('c');
  $updatedEntry = null;

  if ($overwriteId !== '') {
    foreach ($entries as $idx => $entry) {
      if ($entry['id'] !== $overwriteId) {
        continue;
      }
      $entries[$idx]['name'] = $name;
      $entries[$idx]['payload'] = $payload;
      $entries[$idx]['level'] = $level;
      $entries[$idx]['depth'] = $depth;
      $entries[$idx]['updated_at'] = $nowIso;
      $updatedEntry = $entries[$idx];
      break;
    }
    if ($updatedEntry === null) {
      json_response(['ok' => false, 'error' => 'Overwrite target not found.'], 404);
    }
  } else {
    if (count($entries) >= MAX_SERVER_SAVES) {
      json_response([
        'ok' => false,
        'error' => 'Save slot limit reached. Delete or overwrite an existing save.',
        'code' => 'SAVE_LIMIT_REACHED',
        'max_saves' => MAX_SERVER_SAVES,
        'name_max_len' => SAVE_NAME_MAX_LEN,
        'saves' => save_entries_public_meta($entries),
      ], 409);
    }
    $id = bin2hex(random_bytes(16));
    $updatedEntry = [
      'id' => $id,
      'name' => $name,
      'payload' => $payload,
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
      return strcmp((string) $b['updated_at'], (string) $a['updated_at']);
    }
  );

  if (!persist_user_saves($userEmail, $entries, $saveSecret)) {
    json_response(['ok' => false, 'error' => 'Could not persist save data.'], 500);
  }

  $entries = load_user_saves($userEmail, $saveSecret);
  $savedMeta = null;
  foreach ($entries as $entry) {
    if ($entry['id'] === ($updatedEntry['id'] ?? '')) {
      $savedMeta = save_entry_public_meta($entry);
      break;
    }
  }
  if ($savedMeta === null) {
    $savedMeta = save_entry_public_meta($updatedEntry);
  }

  json_response([
    'ok' => true,
    'message' => $overwriteId !== '' ? 'Save overwritten.' : 'Game saved.',
    'save' => $savedMeta,
    'max_saves' => MAX_SERVER_SAVES,
    'name_max_len' => SAVE_NAME_MAX_LEN,
    'saves' => save_entries_public_meta($entries),
  ]);
}
app_apply_html_security_headers();
$gameScriptUrl = versioned_relative_asset_url('game.js');
$shopkeeperFullUrl = versioned_relative_asset_url('client/assets/shopkeeper_full.png');
$gameScriptUrl .= '&rb=' . rawurlencode($renderCacheBust);
$shopkeeperFullUrl .= '&rb=' . rawurlencode($renderCacheBust);
$appBuildVersion = $pageVersion . '-' . $renderCacheBust;
$spriteOverridesPayload = list_custom_sprite_overrides();
$spriteOverridesJson = json_encode(
  $spriteOverridesPayload,
  JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
);
if (!is_string($spriteOverridesJson)) {
  $spriteOverridesJson = '{"overrides":{},"scales":{},"entries":[]}';
}
$monsterEditorPayload = load_monster_editor_config();
$monsterEditorJson = json_encode(
  [
    'version' => (int) ($monsterEditorPayload['version'] ?? 1),
    'monsters' => (object) ($monsterEditorPayload['monsters'] ?? []),
    'spawn_rules' => $monsterEditorPayload['spawn_rules'] ?? [],
    'updated_at' => (string) ($monsterEditorPayload['updated_at'] ?? ''),
  ],
  JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
);
if (!is_string($monsterEditorJson)) {
  $monsterEditorJson = '{"version":1,"monsters":{},"spawn_rules":[],"updated_at":""}';
}
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DungeonPunk!</title>
    <style>
      :root {
        color-scheme: dark;
        --ui-text-scale-desktop: 1.16;
        --ui-text-scale-mobile: 1.24;
        --ui-bg-0: #090b10;
        --ui-bg-1: #111722;
        --ui-bg-2: #1a2433;
        --ui-panel: rgba(10, 15, 24, 0.9);
        --ui-panel-strong: rgba(8, 12, 20, 0.96);
        --ui-border: #2e3b54;
        --ui-border-soft: #223149;
        --ui-text: #e9edf6;
        --ui-muted: #b9c5d9;
        --ui-accent: #f5c542;
        --ui-accent-soft: #ffb86c;
      }
      * { box-sizing: border-box; }

      html, body { height: 100%; }
      body {
        margin: 0;
        font-family: "Trebuchet MS", "Lucida Sans Unicode", "Segoe UI", Tahoma, sans-serif;
        font-size: calc(16px * var(--ui-text-scale-desktop));
        background:
          radial-gradient(140% 110% at 24% 0%, #1a2333 0%, rgba(26, 35, 51, 0) 56%),
          radial-gradient(120% 130% at 92% 10%, #291a1f 0%, rgba(41, 26, 31, 0) 62%),
          linear-gradient(180deg, #0d121b 0%, #090b10 100%);
        color: var(--ui-text);

        display: grid;
        grid-template-rows: auto 1fr;
        min-height: 100vh;
        overflow: auto; /* allow page scroll */
      }
      body.modal-open {
        overflow: hidden !important;
        touch-action: none;
      }
      button, input, select, textarea {
        font-size: inherit;
      }

      header {
        padding: 10px 12px;
        border-bottom: 1px solid var(--ui-border);
        background: linear-gradient(180deg, rgba(20, 27, 39, 0.94) 0%, rgba(13, 18, 28, 0.94) 100%);
        box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.03), 0 8px 18px rgba(0, 0, 0, 0.25);
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      header .title { font-weight: 800; letter-spacing: 0.3px; margin-right: 8px; }
      header button,
      header .headerAuthLink {
        font-size: 0.84em;
      }
      #headerInfo {
        margin-left: auto;
        text-align: right;
        font-size: 12px;
        line-height: 1.25;
        opacity: 0.9;
        white-space: nowrap;
      }
      #debugMenuWrap {
        position: relative;
      }
      #debugMenu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 240px;
        background: linear-gradient(180deg, rgba(17, 26, 41, 0.98) 0%, rgba(10, 16, 28, 0.98) 100%);
        border: 1px solid var(--ui-border);
        border-radius: 10px;
        padding: 8px 10px;
        display: none;
        z-index: 1800;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
      }
      #debugMenu.show {
        display: block;
      }
      .adminMenuAction {
        width: 100%;
        display: block;
        text-align: left;
        border: 1px solid #2a3c5f;
        background: linear-gradient(180deg, rgba(34, 56, 92, 0.95) 0%, rgba(22, 35, 58, 0.95) 100%);
        color: var(--text);
        border-radius: 8px;
        padding: 7px 9px;
        font-size: 12px;
        font-weight: 600;
        margin: 0 0 8px 0;
      }
      .adminMenuDivider {
        border-top: 1px solid #27314a;
        margin: 2px 0 6px 0;
      }
      .debugToggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        padding: 6px 2px;
        cursor: pointer;
        user-select: none;
      }
      .debugToggle input {
        width: 16px;
        height: 16px;
        accent-color: #5ca7ff;
      }
      .debugTeleport {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #27314a;
        display: grid;
        gap: 6px;
      }
      .debugTeleportLabel {
        font-size: 12px;
        opacity: 0.9;
      }
      .debugTeleportRow {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .debugTeleportRow input {
        width: 100%;
        min-width: 0;
        height: 30px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 4px 8px;
        font-size: 13px;
      }
      .debugTeleportRow select {
        width: 100%;
        min-width: 0;
        height: 30px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 4px 8px;
        font-size: 13px;
      }
      .debugTeleportRow button {
        height: 30px;
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 13px;
      }
      button, .headerAuthLink {
        background:
          linear-gradient(180deg, rgba(44, 61, 88, 0.92) 0%, rgba(26, 37, 56, 0.96) 100%);
        color: #f0f4ff;
        border: 1px solid #3a4f72;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 1px 0 rgba(0, 0, 0, 0.32);
        transition: filter 120ms ease, transform 90ms ease, box-shadow 120ms ease;
      }
      .headerAuthLink {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
        line-height: 1;
      }
      .headerAuthLink:visited {
        color: #e6e6e6;
      }
      button:hover, .headerAuthLink:hover {
        filter: brightness(1.08);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 0 0 1px rgba(245, 197, 66, 0.24);
      }
      button:active, .headerAuthLink:active {
        transform: translateY(1px);
        filter: brightness(0.98);
      }
      .meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        opacity: 0.95;
        font-size: 13px;
        white-space: pre;
        background: transparent;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        pointer-events: none;
      }
      .meta .meta-seed, .meta .meta-pos { opacity: 0.9; font-size: 12px; }
      .meta .meta-row { display: flex; gap: 12px; margin-top: 6px; justify-content: flex-end; }
      .meta .meta-col { display: flex; gap: 8px; align-items: baseline; min-width: 64px; justify-content: flex-end; }
      .meta .meta-col .label { opacity: 0.85; font-weight: 700; font-size: 13px; }
      .meta .meta-col .val { color: #fff; font-weight: 900; font-size: 15px; margin-left: 6px; }

      /* HP low flashing */
      .meta .val.hp.hp-low, #vitalsDisplay .hp.hp-low { color: #ff6b6b; animation: hp-pulse 1s ease-in-out infinite; }
      @keyframes hp-pulse {
        0%,100% { text-shadow: 0 0 0 rgba(255,107,107,0.0); transform: scale(1); }
        50% { text-shadow: 0 0 8px rgba(255,107,107,0.9); transform: scale(1.03); }
      }

      /* MAIN 2-COLUMN LAYOUT */
      #wrap {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 380px;
        gap: 12px;
        padding: 10px;
        overflow: visible;
        align-items: stretch;
      }

      /* LEFT COLUMN: dungeon view (maximized) */
      #leftCol {
        min-height: 0;
        display: grid;
        grid-template-rows: 1fr;
        gap: 10px;
        overflow: visible;
      }

      /* Main canvas container: center a square canvas that fills the available height */
      #mainCanvasWrap {
        min-height: 0;
        position: relative;
        display: flex;
        align-items: center;   /* center vertically */
        justify-content: center; /* center horizontally */
        overflow: visible; /* avoid internal scrollbars */
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background:
          radial-gradient(120% 90% at 50% 8%, rgba(79, 42, 38, 0.2) 0%, rgba(79, 42, 38, 0) 56%),
          linear-gradient(180deg, #0c111a 0%, #070a10 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 16px 32px rgba(0, 0, 0, 0.35);
        padding: 8px;
      }

      canvas#c {
        display: block;
        image-rendering: auto;
        margin: 0;

        /* Default (mobile-first): keep previous square behavior. */
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        max-width: 100%;
        max-height: 100%;
        box-sizing: border-box;
        object-fit: contain;
      }

      /* Desktop: allow rectangular viewport to reveal more tiles as window grows. */
      @media (min-width: 761px) {
        canvas#c {
          width: 100%;
          height: 100%;
          aspect-ratio: auto;
          object-fit: contain;
        }
      }

      /* When the viewport is taller than it is wide (portrait), make the
         main view use the full available height and compute width from
         the 1:1 aspect so the canvas remains a full-size square. */
      @media (max-aspect-ratio: 1/1), (orientation: portrait) {
        canvas#c {
          width: auto;
          height: 100%;
        }
        /* Ensure the canvas container uses the full row height */
        #mainCanvasWrap { align-items: stretch; }
      }

      #logPanel {
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 0;
        position: absolute;
        bottom: 12px;
        left: 12px;
        z-index: 1200;
        width: min(56%, 520px);
        max-width: calc(100% - 32px);
        pointer-events: auto;
      }
      #invOverlay {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 1300;
        max-width: min(42%, 420px);
        pointer-events: auto;
      }
      #invOverlay .panel { background: transparent; border: none; padding: 0; }
      #invOverlay h3 { margin: 0 0 6px 0; font-size: 13px; }
      #invSections {
        display: grid;
        gap: 4px;
      }
      .invSectionToggle {
        width: 100%;
        text-align: left;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 8px;
        background: rgba(20, 30, 48, 0.82);
        border: 1px solid #2b3956;
      }
      .invSectionBody.hidden {
        display: none;
      }

      #metaWrap { position: absolute; top: 12px; right: 12px; z-index: 1300; pointer-events: none; display:flex; flex-direction:column; align-items:flex-end }
      #logTitle { display: none; }
      #logTitle {
        font-weight: 700;
        margin: 0 0 6px 0;
      }

      #log {
        border: 1px solid var(--ui-border-soft);
        border-radius: 10px;
        padding: 10px;
        background: linear-gradient(180deg, rgba(7, 11, 18, 0.9) 0%, rgba(5, 8, 14, 0.9) 100%);
        /* a compact overlay height and scrollable */
        font-size: 15px;
        line-height: 1.35;
        height: calc(6 * 1.35em + 20px);
        overflow: auto;
        white-space: pre-wrap;
      }
      #mobileOverlayBackdrop {
        position: fixed;
        inset: 0;
        z-index: 1360;
        display: none;
        background: rgba(0, 0, 0, 0.42);
      }
      #mobileOverlayBackdrop.show {
        display: block;
      }
      #mobileQuickBar {
        display: none;
        gap: 8px;
        margin-top: 6px;
      }
      #logTicker {
        display: none;
        margin-top: 6px;
        padding: 2px 6px;
        border-radius: 8px;
        border: 1px solid rgba(50, 66, 98, 0.55);
        background: rgba(8, 12, 18, 0.55);
        font-size: 12px;
        line-height: 1.25;
        opacity: 0.92;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #deathOverlay {
        position: absolute;
        inset: 0;
        z-index: 1600;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        background: rgba(0, 0, 0, 0.55);
      }
      #deathOverlay.show {
        display: flex;
      }
      #newDungeonConfirmOverlay {
        position: fixed;
        inset: 0;
        z-index: 1750;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: rgba(0, 0, 0, 0.62);
      }
      #newDungeonConfirmOverlay.show {
        display: flex;
      }
      #newDungeonConfirmCard {
        width: min(560px, 94vw);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(15, 23, 35, 0.99) 0%, rgba(8, 12, 20, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        padding: 18px 16px;
      }
      #newDungeonConfirmTitle {
        margin: 0 0 8px 0;
        font-size: 22px;
        font-weight: 800;
        color: #ffffff;
      }
      #newDungeonConfirmText {
        margin: 0 0 10px 0;
        font-size: 13px;
        color: #c9d4e8;
      }
      #newDungeonConfirmSummary {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: #0b1322;
        padding: 10px;
        font-size: 13px;
        line-height: 1.35;
        white-space: pre-wrap;
      }
      #newDungeonConfirmButtons {
        margin-top: 12px;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      #newDungeonConfirmStart {
        background: #25406f;
        border-color: #3f68a3;
      }
      #saveGameOverlay {
        position: fixed;
        inset: 0;
        z-index: 1725;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: rgba(0, 0, 0, 0.65);
      }
      #saveGameOverlay.show {
        display: flex;
      }
      #saveGameCard {
        width: min(860px, 96vw);
        height: min(720px, 92vh);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto auto auto 1fr auto;
        overflow: hidden;
      }
      #saveGameHeader {
        padding: 12px 14px 10px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      #saveGameTitle {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
      }
      #saveGameMode {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        font-size: 13px;
        opacity: 0.92;
      }
      #saveGameNameRow {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
      }
      #saveGameNameInput {
        width: 100%;
        min-width: 0;
        height: 36px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 6px 10px;
        font-size: 14px;
      }
      #saveGameList {
        min-height: 0;
        overflow: auto;
        padding: 10px 14px;
        display: grid;
        gap: 8px;
        align-content: start;
      }
      .saveGameEmpty {
        opacity: 0.82;
        font-size: 13px;
      }
      .saveGameRow {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(12, 18, 30, 0.9);
        padding: 10px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
      }
      .saveGameRowMain {
        min-width: 0;
      }
      .saveGameRowName {
        font-size: 14px;
        font-weight: 700;
        color: #f2f6ff;
        margin-bottom: 4px;
        overflow-wrap: anywhere;
      }
      .saveGameRowMeta {
        font-size: 12px;
        color: #b8c6df;
        opacity: 0.92;
      }
      .saveGameRowActions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .saveGameRowActions button {
        min-width: 84px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
      }
      .saveGameDanger {
        background: #382130;
        border-color: #603249;
      }
      #saveGameFooter {
        border-top: 1px solid #1f2a40;
        padding: 8px 14px 12px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #saveGameStatus {
        font-size: 12px;
        opacity: 0.9;
        min-height: 1.2em;
      }
      #characterOverlay {
        position: fixed;
        inset: 0;
        z-index: 1760;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: rgba(0, 0, 0, 0.72);
      }
      #characterOverlay.show {
        display: flex;
      }
      #characterOverlayCard {
        width: min(920px, 96vw);
        min-height: min(560px, 88vh);
        max-height: 92vh;
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        overflow: hidden;
      }
      #characterOverlayHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }
      #characterOverlayHeaderText {
        min-width: 0;
      }
      #characterOverlayCloseBtn {
        min-width: 78px;
        flex: 0 0 auto;
      }
      #characterOverlayTitle {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
      }
      #characterOverlaySubtitle {
        margin-top: 6px;
        font-size: 13px;
        color: #bfd0ea;
      }
      #characterOverlayBody {
        min-height: 0;
        overflow: auto;
        padding: 12px 14px;
      }
      #characterOverlayActions {
        border-top: 1px solid #1f2a40;
        padding: 10px 14px 12px 14px;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .charSlotRow {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(12, 18, 30, 0.9);
        padding: 10px;
        margin-bottom: 8px;
        display: grid;
        grid-template-columns: 62px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
      }
      .charSlotRow:last-child {
        margin-bottom: 0;
      }
      .charSlotVisual {
        width: 62px;
        height: 62px;
        border: 1px solid #2b3956;
        border-radius: 8px;
        background: rgba(9, 13, 22, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .charSlotSprite {
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: pixelated;
      }
      .charSlotSpriteFallback {
        font-size: 28px;
        color: #d9e7ff;
        font-weight: 800;
      }
      .charSlotInfo {
        min-width: 0;
      }
      .charSlotTitle {
        font-size: 14px;
        font-weight: 800;
        color: #f2f6ff;
      }
      .charSlotMeta {
        font-size: 12px;
        color: #b8c6df;
        margin-top: 4px;
        white-space: pre-wrap;
      }
      .charSlotActions {
        margin-top: 8px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .charCreatorGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .charWelcome {
        border: 1px solid #2b3956;
        border-radius: 10px;
        padding: 14px;
        background: rgba(12, 18, 30, 0.9);
        color: #d7e3f8;
        line-height: 1.45;
      }
      .charWelcome h3 {
        margin: 0 0 8px 0;
        font-size: 18px;
      }
      .charWelcome p {
        margin: 0 0 8px 0;
      }
      .charWelcome p:last-child {
        margin-bottom: 0;
      }
      .charStepLead {
        font-size: 13px;
        color: #bfd0ea;
        margin-bottom: 8px;
      }
      .charChoiceGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .charChoiceCard {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(12, 18, 30, 0.9);
        color: #eaf2ff;
        text-align: left;
        padding: 10px;
        min-height: 132px;
      }
      .charChoiceCard.selected {
        border-color: #4f79b7;
        background: rgba(28, 45, 73, 0.92);
      }
      .charChoiceName {
        font-size: 14px;
        font-weight: 800;
      }
      .charChoiceVisual {
        width: 100%;
        min-height: 56px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        margin-bottom: 6px;
      }
      .charChoiceCard.classChoiceCard {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        column-gap: 10px;
        align-items: start;
      }
      .charChoiceCard.speciesChoiceCard {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        column-gap: 10px;
        align-items: start;
      }
      .speciesChoiceCard .charChoiceVisual {
        width: 72px;
        min-height: 72px;
        margin-bottom: 0;
        align-items: flex-start;
        justify-content: center;
      }
      .speciesChoiceCard .charChoiceMeta {
        min-width: 0;
      }
      .speciesChoiceCard .charChoiceSprite,
      .speciesChoiceCard .charChoiceSpriteFallback {
        width: 72px;
        height: 72px;
      }
      .speciesChoiceCard .charChoiceSpriteFallback {
        font-size: 30px;
      }
      .classChoiceCard .charChoiceVisual {
        width: 92px;
        min-height: 92px;
        margin-bottom: 0;
        align-items: flex-start;
        justify-content: center;
      }
      .classChoiceCard .charChoiceMeta {
        min-width: 0;
      }
      .classChoiceCard .charChoiceName {
        margin-top: 0;
      }
      .classChoiceCard .charChoiceBlurb {
        margin-top: 2px;
      }
      .classChoiceCard .charBuffList {
        margin-top: 6px;
      }
      .classChoiceCard .charChoiceSprite,
      .classChoiceCard .charChoiceSpriteFallback {
        width: 92px;
        height: 92px;
      }
      .classChoiceCard .charChoiceSpriteFallback {
        font-size: 34px;
      }
      .charChoiceSprite {
        width: 56px;
        height: 56px;
        object-fit: contain;
        image-rendering: pixelated;
      }
      .charChoiceSpriteFallback {
        width: 56px;
        height: 56px;
        border: 1px solid #2f456b;
        border-radius: 8px;
        background: rgba(11, 18, 30, 0.85);
        color: #d6e4ff;
        display: grid;
        place-items: center;
        font-size: 24px;
        font-weight: 800;
      }
      .charChoiceBlurb {
        font-size: 12px;
        color: #c6d5ef;
        margin-top: 4px;
      }
      .charChoiceSubtle {
        margin-top: 2px;
        font-size: 11px;
        color: #9fb6da;
      }
      .charBuffList {
        margin: 8px 0 0 0;
        padding-left: 16px;
        color: #dce8ff;
        font-size: 12px;
      }
      .charCreatorField {
        display: grid;
        gap: 4px;
      }
      .charCreatorField label {
        font-size: 12px;
        color: #bfd0ea;
      }
      .charCreatorField input,
      .charCreatorField select {
        width: 100%;
        height: 34px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 6px 8px;
        font-size: 13px;
      }
      .charStatsWrap {
        margin-top: 12px;
        border: 1px solid #2b3956;
        border-radius: 10px;
        padding: 10px;
        background: rgba(12, 18, 30, 0.9);
      }
      .charStatsHeader {
        font-size: 13px;
        color: #d7e3f8;
        margin-bottom: 8px;
      }
      .charStatRow {
        display: grid;
        grid-template-columns: 110px auto 44px 44px;
        gap: 6px;
        align-items: center;
        margin-bottom: 6px;
      }
      .charStatRow:last-child {
        margin-bottom: 0;
      }
      .charStatLabel {
        font-size: 12px;
        color: #d2e0f8;
      }
      .charStatValue {
        font-size: 13px;
        font-weight: 700;
      }
      .charStatBtn {
        padding: 4px 0;
        min-width: 0;
      }
      .charNote {
        margin-top: 8px;
        font-size: 12px;
        color: #b8c6df;
        white-space: pre-wrap;
      }
      .charStatus {
        border: 1px solid #2f466d;
        border-radius: 9px;
        padding: 8px 10px;
        margin-bottom: 8px;
        background: rgba(26, 42, 66, 0.88);
        color: #dce8ff;
        font-size: 12px;
      }
      .charStatus.error {
        border-color: #7b3650;
        background: rgba(66, 28, 44, 0.88);
        color: #ffd6de;
      }
      .charDerivedGrid {
        margin-top: 10px;
        border: 1px solid #2b3956;
        border-radius: 10px;
        padding: 8px;
        background: rgba(12, 18, 30, 0.9);
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .charDerivedCell {
        border: 1px solid #253754;
        border-radius: 8px;
        padding: 7px 8px;
        background: rgba(8, 13, 22, 0.84);
        display: grid;
        gap: 3px;
      }
      .charDerivedCell span {
        font-size: 11px;
        color: #aecaef;
      }
      .charDerivedCell strong {
        font-size: 14px;
        color: #eef4ff;
      }
      .charSummaryCard {
        margin-top: 10px;
        border: 1px solid #2b3956;
        border-radius: 10px;
        padding: 10px;
        background: rgba(12, 18, 30, 0.9);
        display: grid;
        gap: 6px;
        color: #dce8ff;
        font-size: 12px;
      }
      @media (max-width: 760px) {
        .charCreatorGrid,
        .charChoiceGrid {
          grid-template-columns: 1fr;
        }
        .charDerivedGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .charStatRow {
          grid-template-columns: 88px auto 40px 40px;
        }
        .charChoiceCard.classChoiceCard {
          grid-template-columns: 74px minmax(0, 1fr);
          column-gap: 8px;
        }
        .charChoiceCard.speciesChoiceCard {
          grid-template-columns: 64px minmax(0, 1fr);
          column-gap: 8px;
        }
        .charSlotRow {
          grid-template-columns: 52px minmax(0, 1fr);
          gap: 8px;
        }
        .charSlotVisual {
          width: 52px;
          height: 52px;
        }
        .speciesChoiceCard .charChoiceVisual {
          width: 64px;
          min-height: 64px;
        }
        .speciesChoiceCard .charChoiceSprite,
        .speciesChoiceCard .charChoiceSpriteFallback {
          width: 64px;
          height: 64px;
        }
        .speciesChoiceCard .charChoiceSpriteFallback {
          font-size: 26px;
        }
        .classChoiceCard .charChoiceVisual {
          width: 74px;
          min-height: 74px;
        }
        .classChoiceCard .charChoiceSprite,
        .classChoiceCard .charChoiceSpriteFallback {
          width: 74px;
          height: 74px;
        }
        .classChoiceCard .charChoiceSpriteFallback {
          font-size: 28px;
        }
      }
      #shopOverlay {
        position: fixed;
        inset: 0;
        z-index: 1700;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.65);
        padding: 12px;
      }
      #shopOverlay.show {
        display: flex;
      }
      #shopCard {
        --shop-item-row-h: 38px;
        --shop-item-gap: 6px;
        --shop-list-pad: 6px;
        width: min(980px, 96vw);
        height: min(760px, 92vh);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto;
        overflow: hidden;
      }
      #shopHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #shopTitle {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
      }
      #shopCloseBtn {
        min-width: 84px;
      }
      #shopMeta {
        padding: 8px 14px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        border-bottom: 1px solid #1f2a40;
      }
      #shopTabs {
        padding: 8px 14px;
        display: flex;
        gap: 8px;
        align-items: stretch;
        min-height: 0;
        height: 100%;
        border-bottom: 1px solid #1f2a40;
      }
      #shopTabsButtons {
        display: flex;
        gap: 8px;
        align-items: center;
        flex: 0 0 auto;
      }
      .shopTab {
        min-width: 120px;
      }
      .shopTab.active {
        background: #25406f;
        border-color: #3f68a3;
      }
      #shopkeeperBuyPortraitWrap {
        margin-left: 0;
        width: 100%;
        height: 100%;
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(9, 13, 22, 0.9);
        display: none;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        align-self: stretch;
        flex: 1 1 auto;
        min-width: 0;
      }
      #shopkeeperBuyPortrait {
        width: auto;
        height: 100%;
        max-width: 100%;
        object-fit: contain;
        display: block;
      }
      #shopBody {
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 10px 14px;
      }
      .shopListWrap {
        border: 1px solid #24304a;
        border-radius: 10px;
        overflow: auto;
        padding: 6px;
        /* Always show exactly 8 item rows before scrolling in buy/sell modes. */
        height: calc((8 * var(--shop-item-row-h)) + (7 * var(--shop-item-gap)) + (2 * var(--shop-list-pad)));
        max-height: calc((8 * var(--shop-item-row-h)) + (7 * var(--shop-item-gap)) + (2 * var(--shop-list-pad)));
      }
      .shopItemBtn {
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        min-height: var(--shop-item-row-h);
        border-radius: 8px;
        margin-bottom: var(--shop-item-gap);
        background: #101828;
        border: 1px solid #23314d;
      }
      .shopItemBtn:last-child {
        margin-bottom: 0;
      }
      .shopItemBtn.active {
        background: #223554;
        border-color: #4f79b7;
      }
      #shopDetail {
        border: 1px solid #24304a;
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #shopDetailTop {
        display: grid;
        grid-template-columns: 96px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      #shopDetailPreview {
        width: 96px;
        height: 96px;
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(9, 13, 22, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      #shopDetailPreview img {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
      }
      .shopDetailPreviewGlyph {
        font-size: 36px;
        font-weight: 800;
        line-height: 1;
      }
      #shopDetailText {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #shopDetailTitle {
        font-size: 16px;
        font-weight: 700;
      }
      #shopDetailBody {
        white-space: pre-wrap;
        font-size: 13px;
        opacity: 0.95;
      }
      #shopActionBtn {
        margin-top: auto;
      }
      #shopFooter {
        padding: 8px 14px 12px 14px;
        border-top: 1px solid #1f2a40;
        font-size: 12px;
        opacity: 0.86;
      }
      #infoOverlay {
        position: fixed;
        inset: 0;
        z-index: 1710;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.66);
        padding: 12px;
      }
      #infoOverlay.show {
        display: flex;
      }
      #infoCard {
        width: min(980px, 96vw);
        height: min(760px, 92vh);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto auto 1fr;
        overflow: hidden;
      }
      #infoHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #infoTitle {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
      }
      #infoLead {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        font-size: 13px;
        color: #bfd0ea;
      }
      #infoBody {
        min-height: 0;
        overflow: auto;
        padding: 10px 14px 14px 14px;
      }
      #weaponTierList {
        display: grid;
        gap: 8px;
      }
      .weaponTierRow {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(12, 18, 30, 0.9);
        padding: 8px 10px;
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
      }
      .weaponTierPreview {
        width: 52px;
        height: 52px;
        border-radius: 8px;
        border: 1px solid #2f3e5b;
        background: #0b1322;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .weaponTierPreview img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .weaponTierPlaceholder {
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
      }
      .weaponTierMeta {
        min-width: 0;
      }
      .weaponTierName {
        font-size: 14px;
        font-weight: 800;
        color: #f2f6ff;
      }
      .weaponTierStats {
        font-size: 12px;
        color: #b8c6df;
        margin-top: 2px;
      }
      .weaponTierDepth {
        font-size: 12px;
        color: #d5dfef;
        margin-top: 2px;
      }
      .weaponTierFlavor {
        margin-top: 4px;
        font-size: 12px;
        color: #dce8ff;
        opacity: 0.95;
      }
      #levelUpOverlay {
        position: fixed;
        inset: 0;
        z-index: 1720;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        padding: 12px;
      }
      #levelUpOverlay.show {
        display: flex;
      }
      #levelUpCard {
        width: min(560px, 94vw);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        overflow: hidden;
      }
      #levelUpHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #levelUpTitle {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
      }
      #levelUpLead {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        font-size: 13px;
        color: #bfd0ea;
      }
      #levelUpStatsList {
        padding: 10px 14px;
        display: grid;
        gap: 8px;
        max-height: min(60vh, 420px);
        overflow: auto;
      }
      .levelUpRow {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(12, 18, 30, 0.9);
        padding: 8px 10px;
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 10px;
        align-items: center;
      }
      .levelUpStatLabel {
        font-size: 13px;
        font-weight: 700;
        color: #f2f6ff;
      }
      .levelUpStatValue {
        font-size: 13px;
        color: #d5dfef;
      }
      .levelUpSpendBtn {
        min-width: 36px;
        height: 28px;
        padding: 0;
        border-radius: 7px;
        font-size: 16px;
        font-weight: 700;
        line-height: 1;
      }
      .levelUpSpendBtn:disabled {
        opacity: 0.45;
      }
      #levelUpFooter {
        padding: 10px 14px 12px 14px;
        border-top: 1px solid #1f2a40;
        display: flex;
        justify-content: flex-end;
      }
      #spriteEditorOverlay {
        position: fixed;
        inset: 0;
        z-index: 1735;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.72);
        padding: 12px;
      }
      #spriteEditorOverlay.show {
        display: flex;
      }
      #spriteEditorCard {
        width: min(1120px, 97vw);
        height: min(780px, 94vh);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        display: grid;
        grid-template-rows: auto auto auto 1fr;
        overflow: hidden;
      }
      #spriteEditorHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #spriteEditorTitle {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
      }
      #spriteEditorControls {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr)) auto;
        gap: 8px;
        align-items: center;
      }
      .spriteCtrl {
        display: grid;
        gap: 4px;
      }
      .spriteCtrlWide {
        grid-column: span 2;
      }
      .spriteCtrlLabel {
        font-size: 11px;
        letter-spacing: 0.02em;
        color: #b8c6df;
      }
      .spriteCtrl select,
      .spriteCtrl input {
        width: 100%;
        min-width: 0;
        height: 34px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 6px 8px;
        font-size: 13px;
      }
      .spriteCheckRow {
        height: 34px;
        display: flex;
        align-items: center;
      }
      .spriteCheckLabel {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #d7e4f7;
        user-select: none;
      }
      .spriteBulkSizeRow {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .spriteBulkSizeRow .spriteBulkSizeInput {
        width: 120px;
        min-width: 120px;
        flex: 0 0 120px;
        height: 34px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 6px 8px;
        font-size: 13px;
      }
      .spriteBulkSizeSuffix {
        font-size: 12px;
        color: #b8c6df;
      }
      #spriteBulkSetSizeBtn {
        min-width: 130px;
      }
      #spriteEditorStatus {
        min-height: 1.2em;
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        font-size: 12px;
        color: #b8c6df;
      }
      #spriteEditorList {
        min-height: 0;
        overflow: auto;
        padding: 10px 14px;
        display: grid;
        gap: 8px;
        align-content: start;
      }
      .spriteEditorRow {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(12, 18, 30, 0.9);
        padding: 10px;
        display: grid;
        grid-template-columns: 26px 56px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
      }
      .spriteSelectCell {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .spriteSelectInput {
        width: 16px;
        height: 16px;
        margin: 0;
      }
      .spritePreview {
        width: 56px;
        height: 56px;
        border-radius: 8px;
        border: 1px solid #2f3e5b;
        background: #0b1322;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .spritePreview img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .spritePreviewGlyph {
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
      }
      .spriteRowMeta {
        min-width: 0;
      }
      .spriteRowName {
        font-size: 14px;
        font-weight: 800;
        color: #f2f6ff;
      }
      .spriteRowSub {
        margin-top: 3px;
        font-size: 12px;
        color: #b8c6df;
        opacity: 0.95;
      }
      .spriteRowActions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
      }
      .spriteRowActions button {
        min-width: 96px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
      }
      .spriteScaleGroup {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid #32415f;
        border-radius: 8px;
        background: #0a1220;
        padding: 4px 6px;
      }
      .spriteScaleInput {
        width: 70px;
        height: 28px;
        border: 1px solid #32415f;
        border-radius: 6px;
        background: #0c1628;
        color: #e6e6e6;
        padding: 2px 6px;
        font-size: 12px;
      }
      .spriteScaleSuffix {
        font-size: 12px;
        color: #b8c6df;
      }
      .spriteDeleteBtn {
        background: #382130;
        border-color: #603249;
      }
      .spriteUploadInput {
        display: none;
      }
      .spriteEditorEmpty {
        opacity: 0.82;
        font-size: 13px;
      }
      #monsterEditorOverlay {
        position: fixed;
        inset: 0;
        z-index: 1736;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.72);
        padding: 12px;
      }
      #monsterEditorOverlay.show {
        display: flex;
      }
      #monsterEditorCard {
        width: min(1180px, 97vw);
        height: min(830px, 95vh);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        display: grid;
        grid-template-rows: auto auto auto 1fr;
        overflow: hidden;
      }
      #monsterEditorHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #monsterEditorTitle {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
      }
      #monsterEditorToolbar {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        display: grid;
        grid-template-columns: minmax(170px, 1fr) 130px repeat(8, auto);
        gap: 8px;
        align-items: end;
      }
      .monsterToolbarField {
        display: grid;
        gap: 4px;
      }
      .monsterToolbarField label {
        font-size: 11px;
        letter-spacing: 0.02em;
        color: #b8c6df;
      }
      .monsterToolbarField input {
        width: 100%;
        min-width: 0;
        height: 34px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 6px 8px;
        font-size: 13px;
      }
      #monsterEditorImportInput {
        display: none;
      }
      #monsterEditorStatus {
        min-height: 1.2em;
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        font-size: 12px;
        color: #b8c6df;
      }
      #monsterEditorBody {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
      }
      #monsterEditorList {
        min-height: 0;
        overflow: auto;
        border-right: 1px solid #223149;
        padding: 10px;
        display: grid;
        gap: 6px;
        align-content: start;
      }
      .monsterEditorListBtn {
        width: 100%;
        text-align: left;
        border: 1px solid #2a3a58;
        border-radius: 8px;
        background: rgba(11, 18, 30, 0.88);
        color: #e9f0ff;
        padding: 8px 10px;
      }
      .monsterEditorListBtn.active {
        border-color: #4a6998;
        box-shadow: 0 0 0 1px rgba(74, 105, 152, 0.36);
      }
      .monsterEditorListName {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.2;
      }
      .monsterEditorListSub {
        margin-top: 3px;
        font-size: 11px;
        color: #b7c6de;
        opacity: 0.95;
        line-height: 1.25;
      }
      #monsterEditorDetail {
        min-height: 0;
        overflow: auto;
        padding: 10px 12px;
        display: grid;
        gap: 10px;
        align-content: start;
      }
      #monsterEditorPreview {
        border: 1px solid #2b3956;
        border-radius: 8px;
        background: rgba(10, 16, 27, 0.9);
        padding: 8px 10px;
        white-space: pre-wrap;
        font-size: 12px;
        color: #c8d6ea;
        line-height: 1.35;
      }
      #monsterEditorForm {
        display: grid;
        gap: 10px;
      }
      .monsterFormGrid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .monsterField {
        display: grid;
        gap: 4px;
      }
      .monsterFieldWide {
        grid-column: span 2;
      }
      .monsterField label {
        font-size: 11px;
        color: #b8c6df;
      }
      .monsterField input,
      .monsterField select {
        width: 100%;
        min-width: 0;
        height: 34px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 6px 8px;
        font-size: 12px;
      }
      .monsterFieldToggle {
        align-content: end;
      }
      .monsterFieldToggle label {
        margin-bottom: 2px;
      }
      .monsterFieldToggle input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin: 0;
      }
      .monsterAdvancedHead {
        display: flex;
        justify-content: flex-start;
      }
      #monsterEditAdvancedToggle {
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
      }
      #monsterEditorAdvancedFields {
        display: none;
      }
      #monsterEditorAdvancedFields.show {
        display: grid;
      }
      @media (max-width: 780px) {
        #shopBody {
          grid-template-columns: 1fr;
        }
        #shopTabs {
          flex-wrap: wrap;
          height: 100%;
        }
        #shopkeeperBuyPortraitWrap {
          margin-left: 0;
          width: 100%;
          height: 100%;
        }
        #spriteEditorControls {
          grid-template-columns: 1fr 1fr;
        }
        .spriteCtrlWide {
          grid-column: span 2;
        }
        .spriteEditorRow {
          grid-template-columns: 26px 56px minmax(0, 1fr);
        }
        .spriteRowActions {
          grid-column: 1 / -1;
          justify-content: flex-start;
        }
        #monsterEditorToolbar {
          grid-template-columns: 1fr 1fr;
        }
        #monsterEditorBody {
          grid-template-columns: 1fr;
        }
        #monsterEditorList {
          border-right: none;
          border-bottom: 1px solid #223149;
          max-height: 34vh;
        }
        .monsterFormGrid {
          grid-template-columns: 1fr 1fr;
        }
        .monsterFieldWide {
          grid-column: span 2;
        }
      }
      #deathCard {
        min-width: min(92vw, 440px);
        max-width: min(92vw, 520px);
        padding: 18px 16px;
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14, 22, 34, 0.99) 0%, rgba(7, 11, 18, 0.99) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        text-align: center;
      }
      #deathTitle {
        margin: 0 0 8px 0;
        font-size: 22px;
        font-weight: 800;
        color: #ffffff;
      }
      #deathText {
        margin: 0 0 14px 0;
        font-size: 13px;
        color: #c9d4e8;
      }
      #deathButtons {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }
      #deathButtons button {
        min-width: 130px;
      }
      #contextActionWrap {
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      #vitalsDisplay {
        margin-bottom: 8px;
        font-size: 18px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      #vitalsDisplay .lbl {
        opacity: 0.9;
        margin-right: 6px;
        font-weight: 900;
      }
      #vitalsDisplay .sep {
        opacity: 0.65;
        margin: 0 10px;
      }
      #depthDisplay {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 800;
        line-height: 1.1;
        color: #f2f6ff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      #contextActionBtn {
        width: auto;
        min-width: 180px;
        max-width: 100%;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      #contextPotionBtn {
        width: auto;
        min-width: 180px;
        max-width: 100%;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      #contextActionBtn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      #contextPotionBtn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      #contextAttackList {
        display: none;
        width: auto;
        max-width: min(100%, 420px);
        gap: 6px;
        flex-direction: column;
        align-items: flex-start;
      }
      #contextAttackList.grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(120px, max-content));
        justify-content: flex-start;
      }
      .contextAttackBtn {
        width: fit-content;
        min-width: 0;
        max-width: min(100%, 320px);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      .contextBtnContent {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
      }
      .contextBtnIcon {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .contextBtnIcon img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .contextBtnGlyph {
        font-size: 16px;
        line-height: 1;
        font-weight: 800;
      }
      .contextBtnText {
        min-width: 0;
        line-height: 1.2;
      }
      #surfaceCompass {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 24px;
        height: 24px;
        z-index: 1450;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        transform: translate(-50%, -50%);
      }
      #surfaceCompassArrow {
        font-size: 16px;
        line-height: 1;
        color: #ff5a5a;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        transform-origin: 50% 55%;
      }

      /* RIGHT COLUMN */
      #rightCol {
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: visible;
      }

      /* Smooth transition for layout (panels are always visible) */
      #wrap { transition: grid-template-columns 220ms ease, padding 180ms ease; }

      #miniWrap {
        border: 1px solid var(--ui-border-soft);
        border-radius: 12px;
        padding: 10px;
        background: linear-gradient(180deg, rgba(14, 21, 33, 0.92) 0%, rgba(8, 12, 20, 0.92) 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        flex: 0 0 auto;
      }
      #miniHeader {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
      }
      #miniHeader b { font-size: 14px; }
      #miniHeader span { opacity: 0.75; font-size: 12px; }

      /* IMPORTANT: do NOT stretch the minimap; keep it at native canvas pixel size */
      canvas#mini {
        display: block;
        margin: 0 auto;

        /* Allow the canvas to scale down responsively so it remains visible
           on narrow/mobile screens while keeping pixelated rendering. */
        max-width: 100%;
        width: 100%;
        height: auto;
        margin: 0 auto; /* center when there is extra space */
      }

      .legend {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.35;
        opacity: 0.85;
      }
      .dot { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:middle; border:1px solid #1f2a40;}
      .dot.red { background:#ff6b6b; }
      .dot.blue { background:#6bb8ff; }
      .dot.green { background:#7dff6b; }
      .dot.shrine { background:#b8f2e6; }

      .panel {
        border: 1px solid var(--ui-border-soft);
        border-radius: 12px;
        padding: 10px;
        background: linear-gradient(180deg, rgba(14, 21, 33, 0.9) 0%, rgba(8, 12, 20, 0.9) 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        flex: 0 0 auto;
        min-height: 0;
      }
      .panel h3 { margin: 0 0 8px 0; font-size: 14px; }

      #invList {
        --inv-row-height: 28px;
        display: grid;
        gap: 0;
        max-height: calc(var(--inv-row-height) * 5);
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 2px;
      }
      #equipBadges {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin: 0 0 8px 0;
      }
      .equipSlot {
        display: grid;
        grid-template-rows: auto auto;
        align-items: start;
        justify-items: center;
        gap: 3px;
        min-width: 0;
      }
      .equipBadge {
        border: 1px solid #344766;
        background: linear-gradient(180deg, rgba(40, 57, 88, 0.92) 0%, rgba(24, 35, 55, 0.92) 100%);
        border-radius: 12px;
        padding: 4px;
        width: 72px;
        height: 72px;
        min-width: 72px;
        min-height: 72px;
        overflow: hidden;
        box-sizing: border-box;
      }
      .equipBadgeIcon {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 0;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        line-height: 1;
        color: #9fb4d8;
        overflow: hidden;
      }
      .equipBadgeIcon img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
      }
      .equipBadgeGlyph {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        font-weight: 800;
        line-height: 1;
      }
      .equipBadgeLabel {
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.25px;
        color: #d6e4ff;
        opacity: 0.92;
        line-height: 1.15;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        width: 72px;
      }
      #characterStatsPanel {
        margin-top: 8px;
        border: 1px solid #2f3f5f;
        border-radius: 10px;
        padding: 8px;
        background: rgba(10, 16, 27, 0.84);
        display: grid;
        gap: 6px;
      }
      #characterStatsPanel,
      #characterStatsToggle {
        display: none !important;
      }
      #characterStatsPanel.hidden {
        display: none;
      }
      #characterStatsToggle {
        width: 100%;
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        text-align: left;
      }
      .charStatsPanelHead {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
        color: #bfd0ea;
      }
      .charStatsPointBadge {
        color: #f4d985;
        font-weight: 700;
      }
      .charStatsSpendRow {
        display: grid;
        grid-template-columns: 42px 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .charStatsSpendLabel {
        font-size: 12px;
        color: #d7e3f8;
      }
      .charStatsSpendValue {
        font-size: 12px;
        color: #eef4ff;
        opacity: 0.95;
      }
      .charStatsSpendBtn {
        min-width: 34px;
        height: 24px;
        padding: 0;
        border-radius: 7px;
        font-size: 14px;
        font-weight: 700;
        line-height: 1;
      }
      .charStatsSpendBtn:disabled {
        opacity: 0.45;
      }
      /* Inventory items are now direct buttons inside #invList */
      #invList > .invLabelBtn {
        display: block;
        width: 100%;
        min-height: var(--inv-row-height);
        text-align: left;
        padding: 0 4px;
        margin: 0;
        border: none;
        background: transparent; /* fully transparent */
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      #invList > .invLabelBtn:focus { outline: none; }
      .invRow {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .invIconWrap {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 20px;
      }
      .invIconWrap img {
        width: 20px;
        height: 20px;
        object-fit: contain;
        display: block;
      }
      .invIconGlyph {
        font-weight: 800;
        line-height: 1;
        font-size: 16px;
      }
      .invLabelText {
        min-width: 0;
      }
      .muted { opacity: 0.75; }

      /* Panels below minimap: scroll internally if needed */
      #rightScroll {
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 2px;
      }

      #log {
        border: none;
        border-radius: 0;
        padding: 6px 8px;
        background: transparent;

        /* a compact overlay height and scrollable */
        font-size: 15px;
        line-height: 1.35;
        height: calc(6 * 1.35em + 20px);
        overflow: auto;
        white-space: pre-wrap;
      }

      /* Responsive fallback */
      @media (max-width: 980px) {
        body { overflow: auto; }
        #wrap {
          grid-template-columns: 1fr;
          height: auto;
          min-height: unset;
        }
        #leftCol, #rightCol { overflow: visible; }
      }

      /* Mobile touch controls (visible on small screens) */
      #touchControls { display: none; }
      @media (max-width: 760px) {
        body {
          font-size: calc(16px * var(--ui-text-scale-mobile));
        }
        #shopOverlay,
        #saveGameOverlay,
        #characterOverlay,
        #infoOverlay,
        #spriteEditorOverlay,
        #monsterEditorOverlay,
        #newDungeonConfirmOverlay,
        #levelUpOverlay {
          align-items: flex-start;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 10px 10px max(14px, env(safe-area-inset-bottom));
        }
        #shopCard,
        #saveGameCard,
        #characterOverlayCard,
        #infoCard,
        #spriteEditorCard,
        #monsterEditorCard,
        #levelUpCard {
          width: min(1120px, calc(100vw - 20px));
          max-height: calc(100dvh - 16px - max(14px, env(safe-area-inset-bottom)));
          margin-top: 2px;
        }
        #newDungeonConfirmCard {
          width: min(560px, calc(100vw - 20px));
          max-height: calc(100dvh - 16px - max(14px, env(safe-area-inset-bottom)));
          overflow: auto;
        }
        #shopBody,
        #saveGameList,
        #characterOverlayBody,
        #infoBody,
        #spriteEditorList,
        #monsterEditorDetail,
        #levelUpStatsList {
          min-height: 0;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: max(18px, env(safe-area-inset-bottom));
        }
        #shopFooter,
        #saveGameFooter,
        #characterOverlayActions,
        #newDungeonConfirmButtons,
        #levelUpFooter {
          position: sticky;
          bottom: 0;
          z-index: 2;
          background: linear-gradient(180deg, rgba(10, 15, 24, 0.96) 0%, rgba(7, 11, 18, 0.99) 100%);
        }
        #characterOverlay {
          align-items: flex-start;
          justify-content: center;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 8px 10px max(14px, env(safe-area-inset-bottom));
        }
        #characterOverlayCard {
          width: min(920px, calc(100vw - 20px));
          min-height: 0;
          max-height: calc(100% - 6px);
          height: calc(100% - 6px);
          margin-top: 6px;
          overflow: hidden;
          grid-template-rows: auto minmax(0, 1fr) auto;
        }
        #characterOverlayBody {
          max-height: none;
          min-height: 0;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: max(18px, env(safe-area-inset-bottom));
        }
        #characterOverlayActions {
          position: static;
          background: linear-gradient(180deg, rgba(10, 15, 24, 0.96) 0%, rgba(7, 11, 18, 0.99) 100%);
          z-index: 2;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
        body {
          background: #131c2b;
        }
        #metaWrap {
          display: none;
        }
        header {
          background: #162133;
          border-bottom-color: #2c3b57;
        }
        #mainCanvasWrap {
          background: #111a29;
          border-color: #324465;
        }
        canvas#c {
          filter: brightness(1.24) contrast(1.08) saturate(1.08);
        }
        #invOverlay {
          position: fixed;
          left: 10px;
          right: 10px;
          top: auto;
          bottom: 108px;
          max-width: none;
          z-index: 1370;
          transform: translateY(calc(100% + 16px));
          opacity: 0;
          pointer-events: none;
          transition: transform 180ms ease, opacity 160ms ease;
        }
        #invOverlay.show {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        #invOverlay #invPanel .panel {
          background: rgba(7, 11, 18, 0.98) !important;
          border: 1px solid #2b3956 !important;
          border-radius: 12px !important;
          padding: 8px !important;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
        }
        #invOverlay #invSections {
          max-height: min(56vh, 420px);
          overflow: auto;
          padding-right: 2px;
        }
        #logPanel {
          width: calc(100% - 24px);
          max-width: none;
          background: rgba(14, 20, 32, 0.58);
          border: 1px solid #324465;
          border-radius: 12px;
          padding: 8px;
        }
        #vitalsDisplay {
          position: static;
          z-index: auto;
          margin: 0;
          padding: 4px 8px;
          border: 1px solid #3a4d74;
          border-radius: 8px;
          background: rgba(11, 17, 28, 0.78);
          font-size: 14px;
          pointer-events: none;
        }
        #depthDisplay {
          margin: 0 0 6px 0;
          font-size: 14px;
          font-weight: 800;
        }
        #log {
          display: none;
          height: min(32vh, 220px);
          border: 1px solid #2d3d5b;
          border-radius: 8px;
          background: rgba(7, 11, 18, 0.88);
          padding: 8px;
          font-size: 15px;
        }
        #logPanel.log-expanded #log {
          display: block;
        }
        #mobileQuickBar {
          display: flex;
        }
        #mobileQuickBar button {
          flex: 1 1 0;
          min-width: 0;
          padding: 6px 8px;
          font-size: 12px;
          border-radius: 8px;
        }
        #logTicker {
          display: block;
        }
        #logPanel.log-expanded #logTicker {
          display: none;
        }

        /* Fixed to bottom-right: actions at left, D-pad at right */
        #touchControls {
          display: flex;
          position: fixed;
          right: 12px;
          left: auto;
          bottom: 12px;
          flex-direction: row-reverse;
          gap: 10px;
          align-items: center;
          pointer-events: auto;
          z-index: 1200;
          max-width: calc(100vw - 24px);
          flex-wrap: nowrap;
        }

        /* Ensure the canvas/log have space so controls stay visible */
        #mainCanvasWrap { padding-bottom: 168px; }

        /* D-pad: up centered above the middle row (left/center/right), down centered below */
        #dpad { display: flex; flex-direction: column; gap: 8px; align-items: center; }
        #dpad > div { display: flex; gap: 8px; justify-content: center; }

        /* Stack action buttons vertically so they sit to the left of the D-pad */
        #actions { display: flex; flex-direction: column; gap: 8px; align-items: center; }

        /* Table layout for touch controls: left = 3x3 D-pad, right = context buttons */
        #touchTable { display: block; }
        #touchTable table { border-collapse: collapse; }
        #touchTable td { vertical-align: middle; padding: 0 6px; }
        .control-grid { border-collapse: collapse; }
        .control-grid td { padding: 6px; }
        .context-buttons { display: flex; flex-direction: column; gap: 8px; }

        .dpad-btn {
          background: rgba(24,32,50,0.98);
          color: #e6e6e6;
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px;
          width: 64px;
          height: 64px;
          font-size: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
          padding: 6px;
        }
        .dpad-btn.center {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          overflow: hidden;
        }
      }
      .dpadCenterIcon {
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transform: scale(2.5);
        transform-origin: center;
        pointer-events: none;
      }
      .dpadCenterIcon img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .dpadCenterGlyph {
        font-size: 15px;
        line-height: 1;
        font-weight: 800;
      }
      .dpadCenterFallback {
        font-size: 24px;
        line-height: 1;
        opacity: 0.9;
      }
    </style>
    <!-- Matomo -->
<script>
  var _paq = window._paq = window._paq || [];
  /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  (function() {
    var u="//anal.blahpunk.com/";
    _paq.push(['setTrackerUrl', u+'matomo.php']);
    _paq.push(['setSiteId', '7']);
    var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
    g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
  })();
</script>
<!-- End Matomo Code -->

  </head>

  <body
    data-can-admin-controls="<?php echo $isAdminUser ? '1' : '0'; ?>"
    data-is-authenticated="<?php echo $user !== null ? '1' : '0'; ?>"
    data-save-csrf="<?php echo h($saveGamesCsrf); ?>"
    data-save-max-slots="<?php echo MAX_SERVER_SAVES; ?>"
    data-save-name-max-len="<?php echo SAVE_NAME_MAX_LEN; ?>"
    data-app-version="<?php echo h($appBuildVersion); ?>"
  >
    <header>
      <div class="title">DungeonPunk!</div>
      <a id="btnHome" class="headerAuthLink" href="https://blahpunk.com/">Home</a>
      <button id="btnNew">New Dungeon</button>
      <?php if ($isAdminUser): ?>
        <button id="btnFog">Toggle fog</button>
      <?php endif; ?>
      <button id="btnExport">Save Game</button>
      <button id="btnImport">Load Game</button>
      <?php if ($user !== null): ?>
        <button id="btnChooseCharacter" type="button">Choose Character</button>
      <?php endif; ?>
      <button id="btnInfo" type="button">Info</button>
      <?php if ($isAdminUser): ?>
        <div id="debugMenuWrap">
          <button id="btnDebugMenu" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="debugMenu">Admin</button>
          <div id="debugMenu" aria-hidden="true">
            <button id="btnSpriteEditor" type="button" class="adminMenuAction">Sprite Editor</button>
            <button id="btnMonsterEditor" type="button" class="adminMenuAction">Monster Editor</button>
            <div class="adminMenuDivider"></div>
            <label class="debugToggle" for="toggleGodmode">
              <span>Godmode</span>
              <input id="toggleGodmode" type="checkbox" />
            </label>
            <label class="debugToggle" for="toggleFreeShopping">
              <span>Free shopping</span>
              <input id="toggleFreeShopping" type="checkbox" />
            </label>
            <label class="debugToggle" for="toggleGhost">
              <span>Ghost</span>
              <input id="toggleGhost" type="checkbox" />
            </label>
            <label class="debugToggle" for="toggleLockpick">
              <span>Lockpick</span>
              <input id="toggleLockpick" type="checkbox" />
            </label>
            <div class="debugTeleport">
              <label class="debugTeleportLabel" for="debugDepthInput">Teleport depth</label>
              <div class="debugTeleportRow">
                <input id="debugDepthInput" type="number" step="1" inputmode="numeric" placeholder="Depth" />
                <button id="debugDepthGo" type="button">Go</button>
              </div>
            </div>
            <div class="debugTeleport">
              <label class="debugTeleportLabel" for="debugLevelInput">Set level</label>
              <div class="debugTeleportRow">
                <input id="debugLevelInput" type="number" min="1" step="1" inputmode="numeric" placeholder="Level" />
                <button id="debugLevelGo" type="button">Go</button>
              </div>
            </div>
          </div>
        </div>
      <?php endif; ?>
      <div id="headerInfo"></div>
      <a id="authBtn" class="headerAuthLink" href="<?php echo h($authHref); ?>"><?php echo h($authLabel); ?></a>
    </header>

    <div id="wrap">
      <!-- LEFT COLUMN -->
      <div id="leftCol">
        <div id="mainCanvasWrap">
          <canvas id="c"></canvas>
          <div id="surfaceCompass" aria-hidden="true"><div id="surfaceCompassArrow">&#9650;</div></div>
          <div id="mobileOverlayBackdrop" aria-hidden="true"></div>

          <div id="invOverlay">
            <div id="invPanel">
              <div class="panel" style="background:transparent;border:none;padding:0;">
                <div id="invSections">
                  <button id="equipSectionToggle" class="invSectionToggle" type="button" aria-expanded="true">Equipment -</button>
                  <div id="equipSectionBody" class="invSectionBody">
                    <div id="equipBadges">
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeWeapon"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelWeapon">Weapon</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeHead"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelHead">Head</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeTorso"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelTorso">Torso</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeLegs"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelLegs">Legs</div></div>
                    </div>
                  </div>
                  <button id="inventorySectionToggle" class="invSectionToggle" type="button" aria-expanded="true">Inventory -</button>
                  <div id="inventorySectionBody" class="invSectionBody">
                    <div id="invList"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="metaWrap">
            <div class="meta" id="meta"></div>
            <div id="metaExtras" style="margin-top:8px; text-align:right; pointer-events:none;">
              <div style="font-size:12px; opacity:0.9;">Effects</div>
              <div id="effectsText" class="muted" style="white-space:pre-wrap; font-size:13px;"></div>
            </div>
          </div>

          <div id="logPanel">
            <div id="logTitle">Message log</div>
            <div id="vitalsDisplay">HP: 0/0 | LVL: 1</div>
            <div id="contextActionWrap">
              <button id="contextActionBtn" type="button" title="Contextual action">No action</button>
              <button id="contextPotionBtn" type="button" title="Use potion" style="display:none;">Use Potion</button>
              <div id="contextAttackList"></div>
            </div>
            <div id="depthDisplay">Depth: 0</div>
            <div id="mobileQuickBar" aria-hidden="true">
              <button id="btnMobileGear" type="button" aria-expanded="false" aria-controls="invOverlay">Gear +</button>
              <button id="btnMobileLog" type="button" aria-expanded="false" aria-controls="log">Log +</button>
            </div>
            <div id="logTicker" aria-live="polite"></div>
            <div id="log"></div>
          </div>

          <div id="deathOverlay" aria-hidden="true">
            <div id="deathCard">
              <h2 id="deathTitle">You Died</h2>
              <p id="deathText">Respawn to continue this run, or start a new dungeon.</p>
              <div id="deathButtons">
                <button id="btnRespawn" type="button">Respawn</button>
                <button id="btnNewDungeon" type="button">New Dungeon</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div id="rightCol">
        <div id="miniWrap">
          <div id="miniHeader">
            <b>Minimap</b>
            <span>(M)</span>
          </div>
          <canvas id="mini"></canvas>
          <div class="legend">
            Locked doors need matching keys:
            <div style="margin-top:6px;">
              <span class="dot red"></span>Red &nbsp;
              <span class="dot blue"></span>Blue &nbsp;
              <span class="dot green"></span>Green &nbsp;|&nbsp;
              <span class="dot shrine"></span>Shrine
            </div>
          </div>
        </div>

        <div id="rightScroll">
          <div id="help">
            Move: <code>Arrow</code>/<code>WASD</code> &middot; Wait: <code>.</code>/<code>Space</code><br />
            Pickup: <code>G</code> &middot; Use/Equip: <code>1&ndash;9</code> &middot; Drop: <code>Shift+1&ndash;9</code> &middot; Inventory: <code>I</code><br />
            Doors: bump to open, <code>C</code> close adjacent open door<br />
            
            Interact shrine/take stairs: <code>E</code> &middot; Toggle minimap: <code>M</code> &middot; New dungeon: <code>R</code> &middot; Weapon tier details: <code>Info</code> button
          </div>
        </div>
      </div>
    </div>
    <div id="shopOverlay" aria-hidden="true">
      <div id="shopCard">
        <div id="shopHeader">
          <h2 id="shopTitle">Shopkeeper</h2>
          <button id="shopCloseBtn" type="button">Close</button>
        </div>
        <div id="shopMeta">
          <div id="shopGold">Gold: 0</div>
          <div id="shopRefresh">Refresh in --:--</div>
        </div>
        <div id="shopTabs">
          <div id="shopTabsButtons">
            <button id="shopTabBuy" class="shopTab active" type="button">Buy</button>
            <button id="shopTabSell" class="shopTab" type="button">Sell</button>
          </div>
          <div id="shopkeeperBuyPortraitWrap" aria-hidden="true">
            <img id="shopkeeperBuyPortrait" src="<?php echo h($shopkeeperFullUrl); ?>" alt="Shopkeeper portrait" />
          </div>
        </div>
        <div id="shopBody">
          <div id="shopList" class="shopListWrap"></div>
          <div id="shopDetail">
            <div id="shopDetailTop">
              <div id="shopDetailPreview" aria-hidden="true"></div>
              <div id="shopDetailText">
                <div id="shopDetailTitle">Select an item</div>
                <div id="shopDetailBody">Tap an item to view details.</div>
              </div>
            </div>
            <button id="shopActionBtn" type="button" disabled>Choose</button>
          </div>
        </div>
        <div id="shopFooter">Buy and sell with tap-friendly controls. Sell value is 25% of listed item value.</div>
      </div>
    </div>
    <div id="infoOverlay" aria-hidden="true">
      <div id="infoCard" role="dialog" aria-modal="true" aria-labelledby="infoTitle">
        <div id="infoHeader">
          <h2 id="infoTitle">Run Info</h2>
          <button id="infoCloseBtn" type="button">Close</button>
        </div>
        <div id="infoLead">Weapon tiers update directly from live game balance values. Depth windows indicate when drops start, peak, and taper.</div>
        <div id="infoBody">
          <div id="weaponTierList"></div>
        </div>
      </div>
    </div>
    <div id="levelUpOverlay" aria-hidden="true">
      <div id="levelUpCard" role="dialog" aria-modal="true" aria-labelledby="levelUpTitle">
        <div id="levelUpHeader">
          <h2 id="levelUpTitle">Level Up</h2>
        </div>
        <div id="levelUpLead">Spend your new attribute point(s).</div>
        <div id="levelUpStatsList"></div>
        <div id="levelUpFooter">
          <button id="levelUpCloseBtn" type="button">Done</button>
        </div>
      </div>
    </div>
    <div id="spriteEditorOverlay" aria-hidden="true">
      <div id="spriteEditorCard" role="dialog" aria-modal="true" aria-labelledby="spriteEditorTitle">
        <div id="spriteEditorHeader">
          <h2 id="spriteEditorTitle">Sprite Editor (Admin)</h2>
          <button id="spriteEditorCloseBtn" type="button">Close</button>
        </div>
        <div id="spriteEditorControls">
          <div class="spriteCtrl">
            <label class="spriteCtrlLabel" for="spriteFilterCategory">Type</label>
            <select id="spriteFilterCategory"></select>
          </div>
          <div class="spriteCtrl">
            <label class="spriteCtrlLabel" for="spriteFilterArmorType">Armor type</label>
            <select id="spriteFilterArmorType"></select>
          </div>
          <div class="spriteCtrl">
            <label class="spriteCtrlLabel" for="spriteFilterMetalType">Metal type</label>
            <select id="spriteFilterMetalType"></select>
          </div>
          <div class="spriteCtrl">
            <label class="spriteCtrlLabel" for="spriteFilterSource">Sprite source</label>
            <select id="spriteFilterSource">
              <option value="all">All</option>
              <option value="has">Has sprite</option>
              <option value="missing">Missing sprite</option>
            </select>
          </div>
          <div class="spriteCtrl">
            <label class="spriteCtrlLabel" for="spriteFilterSearch">Search</label>
            <input id="spriteFilterSearch" type="text" placeholder="name or id" autocomplete="off" />
          </div>
          <div class="spriteCtrl">
            <label class="spriteCtrlLabel" for="spriteSelectAll">Selection</label>
            <div class="spriteCheckRow">
              <label class="spriteCheckLabel">
                <input id="spriteSelectAll" type="checkbox" />
                <span>Select all visible</span>
              </label>
            </div>
          </div>
          <div class="spriteCtrl spriteCtrlWide">
            <label class="spriteCtrlLabel" for="spriteBulkScaleInput">Bulk world size</label>
            <div class="spriteBulkSizeRow">
              <input id="spriteBulkScaleInput" class="spriteBulkSizeInput" type="number" min="25" max="300" step="1" value="100" />
              <span class="spriteBulkSizeSuffix">%</span>
              <button id="spriteBulkSetSizeBtn" type="button">Set Selected</button>
            </div>
          </div>
          <button id="spriteEditorRefreshBtn" type="button">Refresh</button>
        </div>
        <div id="spriteEditorStatus"></div>
        <div id="spriteEditorList"></div>
      </div>
    </div>
    <div id="monsterEditorOverlay" aria-hidden="true">
      <div id="monsterEditorCard" role="dialog" aria-modal="true" aria-labelledby="monsterEditorTitle">
        <div id="monsterEditorHeader">
          <h2 id="monsterEditorTitle">Monster Editor (Admin)</h2>
          <button id="monsterEditorCloseBtn" type="button">Close</button>
        </div>
        <div id="monsterEditorToolbar">
          <div class="monsterToolbarField">
            <label for="monsterEditorSearchInput">Search</label>
            <input id="monsterEditorSearchInput" type="text" placeholder="name or id" autocomplete="off" />
          </div>
          <div class="monsterToolbarField">
            <label for="monsterEditorPreviewDepthInput">Preview depth</label>
            <input id="monsterEditorPreviewDepthInput" type="number" min="0" step="1" value="1" />
          </div>
          <button id="monsterEditorNewBtn" type="button">New</button>
          <button id="monsterEditorDuplicateBtn" type="button">Duplicate</button>
          <button id="monsterEditorDeleteBtn" type="button">Delete</button>
          <button id="monsterEditorExportBtn" type="button">Export</button>
          <button id="monsterEditorImportBtn" type="button">Import</button>
          <input id="monsterEditorImportInput" type="file" accept="application/json,.json" />
          <button id="monsterEditorRefreshBtn" type="button">Refresh</button>
          <button id="monsterEditorRevertBtn" type="button">Revert</button>
          <button id="monsterEditorSaveBtn" type="button">Save</button>
        </div>
        <div id="monsterEditorStatus"></div>
        <div id="monsterEditorBody">
          <div id="monsterEditorList"></div>
          <div id="monsterEditorDetail">
            <div id="monsterEditorPreview"></div>
            <form id="monsterEditorForm" autocomplete="off">
              <div class="monsterFormGrid">
                <div class="monsterField">
                  <label for="monsterEditId">ID</label>
                  <input id="monsterEditId" type="text" readonly />
                </div>
                <div class="monsterField monsterFieldWide">
                  <label for="monsterEditName">Name</label>
                  <input id="monsterEditName" type="text" maxlength="80" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditGlyph">Glyph</label>
                  <input id="monsterEditGlyph" type="text" maxlength="2" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditAliasOf">Alias of</label>
                  <input id="monsterEditAliasOf" type="text" placeholder="optional id" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditAi">AI</label>
                  <select id="monsterEditAi">
                    <option value="">(default melee chase)</option>
                    <option value="melee_chase">melee_chase</option>
                    <option value="tank">tank</option>
                    <option value="blink_flanker">blink_flanker</option>
                    <option value="support_undead">support_undead</option>
                    <option value="ranged_hold">ranged_hold</option>
                    <option value="ranged_kite">ranged_kite</option>
                    <option value="ranged_artillery">ranged_artillery</option>
                  </select>
                </div>
                <div class="monsterField monsterFieldToggle">
                  <label for="monsterEditSizeGrowth">Size growth</label>
                  <input id="monsterEditSizeGrowth" type="checkbox" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditBaseHp">Base HP</label>
                  <input id="monsterEditBaseHp" type="number" min="1" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditBaseAtk">Base ATK</label>
                  <input id="monsterEditBaseAtk" type="number" min="1" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditBaseDef">Base DEF</label>
                  <input id="monsterEditBaseDef" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditBaseAcc">Base ACC</label>
                  <input id="monsterEditBaseAcc" type="number" min="1" max="98" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditBaseEva">Base EVA</label>
                  <input id="monsterEditBaseEva" type="number" min="0" max="95" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSpd">Speed</label>
                  <input id="monsterEditSpd" type="number" min="0.1" max="8" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditXp">Base XP</label>
                  <input id="monsterEditXp" type="number" min="1" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditRange">Range</label>
                  <input id="monsterEditRange" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditCdTurns">CD turns</label>
                  <input id="monsterEditCdTurns" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditPreferredRange">Preferred range</label>
                  <input id="monsterEditPreferredRange" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditBlinkRange">Blink range</label>
                  <input id="monsterEditBlinkRange" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSummonCooldownTurns">Summon CD</label>
                  <input id="monsterEditSummonCooldownTurns" type="number" min="0" step="1" />
                </div>
                <div class="monsterField monsterFieldToggle">
                  <label for="monsterEditSpawnEnabled">Spawn enabled</label>
                  <input id="monsterEditSpawnEnabled" type="checkbox" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSpawnMinDepth">Spawn min depth</label>
                  <input id="monsterEditSpawnMinDepth" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSpawnMaxDepth">Spawn max depth</label>
                  <input id="monsterEditSpawnMaxDepth" type="number" min="0" step="1" placeholder="blank = no max" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSpawnBaseWeight">Spawn base weight</label>
                  <input id="monsterEditSpawnBaseWeight" type="number" min="0" max="20" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSpawnRampFactor">Spawn ramp/depth</label>
                  <input id="monsterEditSpawnRampFactor" type="number" min="-5" max="5" step="0.01" />
                </div>
              </div>
              <div class="monsterAdvancedHead">
                <button id="monsterEditAdvancedToggle" type="button">Advanced +</button>
              </div>
              <div id="monsterEditorAdvancedFields" class="monsterFormGrid">
                <div class="monsterField">
                  <label for="monsterEditPoisonOnHitChance">Poison chance</label>
                  <input id="monsterEditPoisonOnHitChance" type="number" min="0" max="1" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditPoisonOnHitTurns">Poison turns</label>
                  <input id="monsterEditPoisonOnHitTurns" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditPoisonOnHitDmg">Poison damage</label>
                  <input id="monsterEditPoisonOnHitDmg" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSlowOnHitChance">Slow chance</label>
                  <input id="monsterEditSlowOnHitChance" type="number" min="0" max="1" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditSlowTurns">Slow turns</label>
                  <input id="monsterEditSlowTurns" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditStunOnHitChance">Stun chance</label>
                  <input id="monsterEditStunOnHitChance" type="number" min="0" max="1" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditKnockbackOnHitChance">Knockback chance</label>
                  <input id="monsterEditKnockbackOnHitChance" type="number" min="0" max="1" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditBackstabDamageMult">Backstab mult</label>
                  <input id="monsterEditBackstabDamageMult" type="number" min="0.5" max="5" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditMeleeReflectPct">Melee reflect</label>
                  <input id="monsterEditMeleeReflectPct" type="number" min="0" max="0.95" step="0.01" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditDeathCloudTurns">Death cloud turns</label>
                  <input id="monsterEditDeathCloudTurns" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditDeathCloudRadius">Death cloud radius</label>
                  <input id="monsterEditDeathCloudRadius" type="number" min="0" step="1" />
                </div>
                <div class="monsterField">
                  <label for="monsterEditDeathCloudDmg">Death cloud damage</label>
                  <input id="monsterEditDeathCloudDmg" type="number" min="0" step="1" />
                </div>
                <div class="monsterField monsterFieldToggle">
                  <label for="monsterEditImmunePoison">Immune poison</label>
                  <input id="monsterEditImmunePoison" type="checkbox" />
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    <div id="newDungeonConfirmOverlay" aria-hidden="true">
      <div id="newDungeonConfirmCard" role="dialog" aria-modal="true" aria-labelledby="newDungeonConfirmTitle">
        <h2 id="newDungeonConfirmTitle">Start New Dungeon?</h2>
        <p id="newDungeonConfirmText">This action resets dungeon progress, not character progression.</p>
        <div id="newDungeonConfirmSummary">Current run summary unavailable.</div>
        <div id="newDungeonConfirmButtons">
          <button id="newDungeonConfirmCancel" type="button">Cancel</button>
          <button id="newDungeonConfirmStart" type="button">Start New Dungeon</button>
        </div>
      </div>
    </div>
    <div id="saveGameOverlay" aria-hidden="true">
      <div id="saveGameCard" role="dialog" aria-modal="true" aria-labelledby="saveGameTitle">
        <div id="saveGameHeader">
          <h2 id="saveGameTitle">Load Game</h2>
          <button id="saveGameCloseBtn" type="button">Close</button>
        </div>
        <div id="saveGameMode">Your save slots are stored securely on the server.</div>
        <div id="saveGameNameRow">
          <input
            id="saveGameNameInput"
            type="text"
            maxlength="<?php echo SAVE_NAME_MAX_LEN; ?>"
            placeholder="Lvl 1, Depth 0, 2026-02-23 12:34:56"
            autocomplete="off"
          />
          <button id="saveGameCreateBtn" type="button">Save New Slot</button>
        </div>
        <div id="saveGameList"></div>
        <div id="saveGameFooter">
          <div id="saveGameStatus"></div>
          <button id="saveGameRefreshBtn" type="button">Refresh</button>
        </div>
      </div>
    </div>
    <div id="characterOverlay" aria-hidden="true">
      <div id="characterOverlayCard" role="dialog" aria-modal="true" aria-labelledby="characterOverlayTitle">
        <div id="characterOverlayHeader">
          <div id="characterOverlayHeaderText">
            <h2 id="characterOverlayTitle">Character Setup</h2>
            <div id="characterOverlaySubtitle"></div>
          </div>
          <button id="characterOverlayCloseBtn" type="button">Cancel</button>
        </div>
        <div id="characterOverlayBody"></div>
        <div id="characterOverlayActions">
          <button id="characterOverlayTertiary" type="button" style="display:none;">Delete</button>
          <button id="characterOverlaySecondary" type="button" style="display:none;">Back</button>
          <button id="characterOverlayPrimary" type="button">Continue</button>
        </div>
      </div>
    </div>

    <script id="spriteOverridesData" type="application/json"><?php echo $spriteOverridesJson; ?></script>
    <script id="monsterEditorData" type="application/json"><?php echo $monsterEditorJson; ?></script>
    <script type="module" src="<?php echo h($gameScriptUrl); ?>"></script>
    <!-- Mobile touch controls (table: left = 3x3 directional, right = context buttons) -->
    <div id="touchControls" aria-hidden="false">
      <div id="touchTable">
        <table role="presentation">
          <tr>
            <td>
              <table class="control-grid" role="presentation">
                <tr>
                  <td></td>
                  <td><button class="dpad-btn" data-dx="0" data-dy="-1" title="Move Up">&#8593;</button></td>
                  <td></td>
                </tr>
                <tr>
                  <td><button class="dpad-btn" data-dx="-1" data-dy="0" title="Move Left">&#8592;</button></td>
                  <td><button class="dpad-btn center" data-dx="0" data-dy="0" title="Context Action"><span class="dpadCenterFallback" aria-hidden="true">&#9679;</span></button></td>
                  <td><button class="dpad-btn" data-dx="1" data-dy="0" title="Move Right">&#8594;</button></td>
                </tr>
                <tr>
                  <td></td>
                  <td><button class="dpad-btn" data-dx="0" data-dy="1" title="Move Down">&#8595;</button></td>
                  <td></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </div>
  </body>
</html>
