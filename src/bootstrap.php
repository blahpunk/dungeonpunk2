<?php
declare(strict_types=1);

function app_apply_baseline_security_headers(): void
{
  header('X-Content-Type-Options: nosniff');
  header('Referrer-Policy: strict-origin-when-cross-origin');
  header('X-Frame-Options: SAMEORIGIN');
  header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
  header('Cross-Origin-Resource-Policy: same-origin');
  header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
}

function app_apply_html_security_headers(): void
{
  app_apply_baseline_security_headers();
  header("Content-Security-Policy: default-src 'self'; base-uri 'self'; frame-ancestors 'self'; img-src 'self' data: blob: https://anal.blahpunk.com; script-src 'self' 'unsafe-inline' https://anal.blahpunk.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://anal.blahpunk.com; form-action 'self' https://secure.blahpunk.com");
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('CDN-Cache-Control: no-store');
  header('Surrogate-Control: no-store');
}

function app_resolve_storage_root(): string
{
  static $resolved = null;
  if (is_string($resolved) && $resolved !== '') {
    return $resolved;
  }

  $envRoot = trim((string) getenv('DUNGEON25_STORAGE_ROOT'));
  $candidates = [];
  if ($envRoot !== '') {
    $candidates[] = $envRoot;
  }

  $candidates[] = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . '.runtime';
  $candidates[] = '/var/www/blahpunk_runtime/dungeon25';
  $candidates[] = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'blahpunk_runtime' . DIRECTORY_SEPARATOR . 'dungeon25';
  $candidates[] = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'data'; // legacy fallback

  foreach ($candidates as $candidate) {
    $root = rtrim($candidate, DIRECTORY_SEPARATOR);
    if ($root === '') {
      continue;
    }
    if (is_dir($root) || @mkdir($root, 0700, true) || is_dir($root)) {
      $resolved = $root;
      return $resolved;
    }
  }

  $resolved = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'data';
  return $resolved;
}

function app_storage_path(string $suffix = ''): string
{
  $root = app_resolve_storage_root();
  $trimmed = trim($suffix, "/\\");
  if ($trimmed === '') {
    return $root;
  }
  return $root . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $trimmed);
}

function app_client_ip(): string
{
  $remote = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
  if ($remote === '') {
    return 'unknown';
  }
  return preg_replace('/[^0-9a-fA-F:\.]/', '', $remote) ?: 'unknown';
}

function app_rate_limit(string $scope, int $limit, int $windowSeconds): bool
{
  $safeLimit = max(1, $limit);
  $safeWindow = max(1, $windowSeconds);
  $slot = (int) floor(time() / $safeWindow);
  $ip = app_client_ip();
  $bucket = hash('sha256', $scope . '|' . $ip . '|' . $slot);
  $dir = app_storage_path('rate_limit');
  if (!(is_dir($dir) || @mkdir($dir, 0700, true) || is_dir($dir))) {
    return true;
  }

  $path = $dir . DIRECTORY_SEPARATOR . $bucket . '.json';
  $fp = @fopen($path, 'c+');
  if ($fp === false) {
    return true;
  }

  $count = 0;
  if (@flock($fp, LOCK_EX)) {
    $raw = stream_get_contents($fp);
    if (is_string($raw) && trim($raw) !== '') {
      $decoded = json_decode($raw, true);
      if (is_array($decoded) && isset($decoded['count'])) {
        $count = (int) $decoded['count'];
      }
    }
    $count++;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode(['count' => $count, 'ts' => time()], JSON_UNESCAPED_SLASHES) . "\n");
    fflush($fp);
    @flock($fp, LOCK_UN);
  }
  fclose($fp);

  if (random_int(1, 200) === 1) {
    $ttl = $safeWindow * 4;
    $threshold = time() - $ttl;
    $names = @scandir($dir);
    if (is_array($names)) {
      foreach ($names as $name) {
        if ($name === '.' || $name === '..') {
          continue;
        }
        $full = $dir . DIRECTORY_SEPARATOR . $name;
        $mtime = (int) (@filemtime($full) ?: 0);
        if ($mtime > 0 && $mtime < $threshold) {
          @unlink($full);
        }
      }
    }
  }

  return $count <= $safeLimit;
}

function app_asset_version(string $absolutePath): string
{
  $mtime = @filemtime($absolutePath);
  $size = @filesize($absolutePath);
  if (!is_int($mtime) || $mtime <= 0) {
    return '0';
  }
  $sizeInt = is_int($size) && $size > 0 ? $size : 0;
  return dechex($mtime) . dechex($sizeInt);
}
