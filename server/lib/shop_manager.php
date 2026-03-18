<?php
declare(strict_types=1);

if (!function_exists('authoritative_json_read_file') || !function_exists('authoritative_json_write_file')) {
  require_once __DIR__ . DIRECTORY_SEPARATOR . 'session_manager.php';
}

function authoritative_shop_default_id(): string
{
  return 'shop_01';
}

function authoritative_shop_storage_dir(): string
{
  return app_storage_path('authoritative_shop');
}

function authoritative_shop_file_path(string $shopId = ''): string
{
  $id = trim($shopId) !== '' ? trim($shopId) : authoritative_shop_default_id();
  return authoritative_shop_storage_dir() . DIRECTORY_SEPARATOR . preg_replace('/[^a-z0-9_\-]/i', '_', $id) . '.json';
}

function authoritative_shop_lock_file_path(): string
{
  return authoritative_shop_storage_dir() . DIRECTORY_SEPARATOR . 'shop.lock';
}

function authoritative_shop_now_ms(): int
{
  return (int) floor(microtime(true) * 1000);
}

function authoritative_shop_normalize_tier(mixed $value): string
{
  $tier = strtolower(trim((string) ($value ?? '')));
  if ($tier === 'low' || $tier === 'mid' || $tier === 'high') {
    return $tier;
  }
  return 'mid';
}

function authoritative_shop_normalize_type(mixed $value): string
{
  return trim((string) ($value ?? ''));
}

function authoritative_shop_build_item_id(string $prefix = 'itm'): string
{
  $safePrefix = preg_replace('/[^a-z0-9_]/i', '', $prefix);
  if (!is_string($safePrefix) || $safePrefix === '') {
    $safePrefix = 'itm';
  }
  return strtolower($safePrefix) . '_' . substr(hash('sha256', microtime(true) . '|' . random_int(1000, 999999999)), 0, 16);
}

/**
 * @param array<string, mixed> $raw
 * @return array<string, mixed>|null
 */
function authoritative_shop_normalize_core_item(array $raw): ?array
{
  $templateId = authoritative_shop_normalize_type($raw['templateId'] ?? ($raw['type'] ?? ''));
  if ($templateId === '') {
    return null;
  }
  $itemId = trim((string) ($raw['itemId'] ?? ''));
  if ($itemId === '') {
    $itemId = authoritative_shop_build_item_id('core');
  }
  $amount = max(1, (int) floor((float) ($raw['amount'] ?? 1)));
  return [
    'itemId' => $itemId,
    'templateId' => $templateId,
    'type' => $templateId,
    'tier' => authoritative_shop_normalize_tier($raw['tier'] ?? ''),
    'price' => max(1, (int) floor((float) ($raw['price'] ?? 1))),
    'generatedAt' => max(0, (int) floor((float) ($raw['generatedAt'] ?? $raw['listedAt'] ?? authoritative_shop_now_ms()))),
    'slotType' => trim((string) ($raw['slotType'] ?? '')),
    'amount' => $amount,
    'source' => 'core',
  ];
}

/**
 * @param array<string, mixed> $raw
 * @return array<string, mixed>|null
 */
function authoritative_shop_normalize_overflow_item(array $raw): ?array
{
  $templateId = authoritative_shop_normalize_type($raw['templateId'] ?? ($raw['type'] ?? ''));
  if ($templateId === '') {
    return null;
  }
  $itemId = trim((string) ($raw['itemId'] ?? ''));
  if ($itemId === '') {
    $itemId = authoritative_shop_build_item_id('overflow');
  }
  return [
    'itemId' => $itemId,
    'templateId' => $templateId,
    'type' => $templateId,
    'tier' => authoritative_shop_normalize_tier($raw['tier'] ?? ''),
    'price' => max(1, (int) floor((float) ($raw['price'] ?? 1))),
    'listedAt' => max(0, (int) floor((float) ($raw['listedAt'] ?? $raw['generatedAt'] ?? authoritative_shop_now_ms()))),
    'soldByPlayerId' => trim((string) ($raw['soldByPlayerId'] ?? '')),
    'source' => 'overflow',
  ];
}

/**
 * @param array<string, mixed> $raw
 * @return array<string, mixed>|null
 */
function authoritative_shop_normalize_state(array $raw): ?array
{
  $shopId = trim((string) ($raw['shopId'] ?? authoritative_shop_default_id()));
  if ($shopId === '') {
    $shopId = authoritative_shop_default_id();
  }
  $shopType = strtolower(trim((string) ($raw['shopType'] ?? 'general')));
  if ($shopType === '') {
    $shopType = 'general';
  }

  $coreRaw = [];
  if (is_array($raw['coreStock'] ?? null)) {
    $coreRaw = $raw['coreStock'];
  } elseif (is_array($raw['stock'] ?? null)) {
    // Legacy migration path: old single stock pool becomes core stock.
    $coreRaw = $raw['stock'];
  }
  $overflowRaw = is_array($raw['overflowStock'] ?? null) ? $raw['overflowStock'] : [];

  $coreStock = [];
  foreach ($coreRaw as $entry) {
    if (!is_array($entry)) {
      continue;
    }
    $normalized = authoritative_shop_normalize_core_item($entry);
    if (is_array($normalized)) {
      $coreStock[] = $normalized;
    }
  }

  $overflowStock = [];
  foreach ($overflowRaw as $entry) {
    if (!is_array($entry)) {
      continue;
    }
    $normalized = authoritative_shop_normalize_overflow_item($entry);
    if (is_array($normalized)) {
      $overflowStock[] = $normalized;
    }
  }

  return [
    'shopId' => $shopId,
    'shopType' => $shopType,
    'coreStock' => $coreStock,
    'overflowStock' => $overflowStock,
    'lastRefreshMs' => max(0, (int) floor((float) ($raw['lastRefreshMs'] ?? $raw['lastRefreshAt'] ?? 0))),
    'nextRefreshMs' => max(0, (int) floor((float) ($raw['nextRefreshMs'] ?? $raw['nextRefreshAt'] ?? 0))),
    'refreshSeed' => max(0, (int) floor((float) ($raw['refreshSeed'] ?? 0))),
    'updatedAt' => date('c'),
  ];
}

/**
 * @param array<string, mixed> $shopState
 */
function authoritative_shop_is_structured_state_valid(array $shopState): bool
{
  $core = is_array($shopState['coreStock'] ?? null) ? $shopState['coreStock'] : [];
  $overflow = is_array($shopState['overflowStock'] ?? null) ? $shopState['overflowStock'] : [];
  if (count($core) !== 16) {
    return false;
  }
  if (count($overflow) > 32) {
    return false;
  }
  return true;
}

/**
 * @return array<string, mixed>|null
 */
function authoritative_shop_decode_payload(string $payload): ?array
{
  $src = trim($payload);
  if ($src === '') {
    return null;
  }
  $raw = base64_decode($src, true);
  if (!is_string($raw) || $raw === '') {
    return null;
  }
  if (function_exists('iconv')) {
    $json = @iconv('UTF-8', 'UTF-8//IGNORE', $raw);
    if (!is_string($json) || $json === '') {
      $json = $raw;
    }
  } else {
    $json = $raw;
  }
  $decoded = json_decode($json, true);
  return is_array($decoded) ? $decoded : null;
}

function authoritative_shop_encode_payload(array $decoded): string
{
  $json = json_encode($decoded, JSON_UNESCAPED_SLASHES);
  if (!is_string($json) || $json === '') {
    return '';
  }
  return base64_encode($json);
}

/**
 * @return array<string, mixed>|null
 */
function authoritative_shop_extract_from_world_payload(string $payload): ?array
{
  $decoded = authoritative_shop_decode_payload($payload);
  if (!is_array($decoded)) {
    return null;
  }
  $shop = is_array($decoded['shop'] ?? null) ? $decoded['shop'] : null;
  if (!is_array($shop)) {
    return null;
  }
  return authoritative_shop_normalize_state($shop);
}

function authoritative_shop_inject_into_world_payload(string $payload, array $shopState): string
{
  $decoded = authoritative_shop_decode_payload($payload);
  if (!is_array($decoded)) {
    return '';
  }
  $normalized = authoritative_shop_normalize_state($shopState);
  if (!is_array($normalized)) {
    return '';
  }
  $decoded['shop'] = $normalized;
  return authoritative_shop_encode_payload($decoded);
}

/**
 * @return array<string, mixed>|null
 */
function authoritative_shop_load_shared_state(string $shopId = ''): ?array
{
  $path = authoritative_shop_file_path($shopId);
  $raw = authoritative_json_read_file($path, null);
  if (!is_array($raw)) {
    return null;
  }
  return authoritative_shop_normalize_state($raw);
}

function authoritative_shop_persist_shared_state(array $shopState): bool
{
  $normalized = authoritative_shop_normalize_state($shopState);
  if (!is_array($normalized) || !authoritative_shop_is_structured_state_valid($normalized)) {
    return false;
  }
  return authoritative_json_write_file(authoritative_shop_file_path((string) ($normalized['shopId'] ?? '')), $normalized);
}

/**
 * @template T
 * @param callable():T $callback
 * @return T
 */
function authoritative_shop_with_lock(callable $callback)
{
  $dir = authoritative_shop_storage_dir();
  if (!(is_dir($dir) || @mkdir($dir, 0700, true) || is_dir($dir))) {
    throw new RuntimeException('Could not initialize shared shop storage.');
  }

  $lockPath = authoritative_shop_lock_file_path();
  $fp = @fopen($lockPath, 'c+');
  if (!is_resource($fp)) {
    throw new RuntimeException('Could not acquire shared shop lock.');
  }
  if (!@flock($fp, LOCK_EX)) {
    fclose($fp);
    throw new RuntimeException('Could not lock shared shop state.');
  }

  try {
    return $callback();
  } finally {
    @flock($fp, LOCK_UN);
    fclose($fp);
  }
}

/**
 * @param array<string, mixed> $snapshot
 * @return array<string, mixed>
 */
function authoritative_shop_apply_shared_to_snapshot(array $snapshot): array
{
  $payload = trim((string) ($snapshot['payload'] ?? ''));
  if ($payload === '') {
    return $snapshot;
  }

  $shared = authoritative_shop_load_shared_state(authoritative_shop_default_id());
  if (is_array($shared) && !authoritative_shop_is_structured_state_valid($shared)) {
    $shared = null;
  }
  if (!is_array($shared)) {
    $embedded = authoritative_shop_extract_from_world_payload($payload);
    if (is_array($embedded) && authoritative_shop_is_structured_state_valid($embedded)) {
      authoritative_shop_persist_shared_state($embedded);
      $shared = $embedded;
    }
  }

  if (!is_array($shared)) {
    return $snapshot;
  }

  $patchedPayload = authoritative_shop_inject_into_world_payload($payload, $shared);
  if ($patchedPayload !== '') {
    $snapshot['payload'] = $patchedPayload;
  }
  $snapshot['shop'] = $shared;
  return $snapshot;
}

/**
 * @param array<string, mixed> $snapshot
 * @return array<string, mixed>|null
 */
function authoritative_shop_capture_snapshot(array $snapshot): ?array
{
  $payload = trim((string) ($snapshot['payload'] ?? ''));
  if ($payload === '') {
    return null;
  }
  $shop = authoritative_shop_extract_from_world_payload($payload);
  if (!is_array($shop) || !authoritative_shop_is_structured_state_valid($shop)) {
    return null;
  }
  authoritative_shop_persist_shared_state($shop);
  return $shop;
}

function authoritative_shop_bind_payload_to_shared(string $payload): string
{
  $src = trim($payload);
  if ($src === '') {
    return $src;
  }
  $shared = authoritative_shop_load_shared_state(authoritative_shop_default_id());
  if (is_array($shared) && !authoritative_shop_is_structured_state_valid($shared)) {
    $shared = null;
  }
  if (!is_array($shared)) {
    $embedded = authoritative_shop_extract_from_world_payload($src);
    if (is_array($embedded) && authoritative_shop_is_structured_state_valid($embedded)) {
      authoritative_shop_persist_shared_state($embedded);
      return $src;
    }
    return $src;
  }
  $patched = authoritative_shop_inject_into_world_payload($src, $shared);
  return $patched !== '' ? $patched : $src;
}

/**
 * @param array<string, mixed> $command
 */
function authoritative_shop_command_requires_lock(array $command): bool
{
  $type = strtoupper(trim((string) ($command['type'] ?? '')));
  return $type === 'BUY_SHOP_ITEM' || $type === 'SELL_SHOP_ITEM' || $type === 'INTERACT';
}
