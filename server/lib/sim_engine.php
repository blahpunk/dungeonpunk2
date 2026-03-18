<?php
declare(strict_types=1);

function authoritative_worker_node_binary(): string
{
  $env = trim((string) getenv('NODE_BINARY'));
  return $env !== '' ? $env : 'node';
}

function authoritative_worker_script_path(): string
{
  return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . 'authoritative_worker.mjs';
}

function authoritative_worker_daemon_script_path(): string
{
  return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . 'authoritative_daemon.mjs';
}

function authoritative_worker_cwd(): string
{
  return dirname(__DIR__, 2);
}

function authoritative_worker_runtime_dir(): string
{
  return authoritative_worker_cwd() . DIRECTORY_SEPARATOR . '.runtime' . DIRECTORY_SEPARATOR . 'authoritative_runtime';
}

function authoritative_worker_socket_path(): string
{
  return authoritative_worker_runtime_dir() . DIRECTORY_SEPARATOR . 'worker.sock';
}

function authoritative_worker_log_path(): string
{
  return authoritative_worker_runtime_dir() . DIRECTORY_SEPARATOR . 'worker.log';
}

function authoritative_worker_version_path(): string
{
  return authoritative_worker_runtime_dir() . DIRECTORY_SEPARATOR . 'worker.version';
}

function authoritative_worker_socket_uri(): string
{
  return 'unix://' . authoritative_worker_socket_path();
}

function authoritative_worker_code_version(): string
{
  $paths = [
    authoritative_worker_script_path(),
    authoritative_worker_daemon_script_path(),
    authoritative_worker_cwd() . DIRECTORY_SEPARATOR . 'game.js',
  ];
  $parts = [];
  foreach ($paths as $path) {
    $mtime = @filemtime($path);
    $parts[] = is_int($mtime) && $mtime > 0 ? (string) $mtime : '0';
  }
  return implode(':', $parts);
}

function authoritative_worker_stored_version(): string
{
  $path = authoritative_worker_version_path();
  if (!is_file($path)) return '';
  $raw = @file_get_contents($path);
  return is_string($raw) ? trim($raw) : '';
}

function authoritative_worker_store_version(string $version): void
{
  $path = authoritative_worker_version_path();
  if ($version === '') return;
  @file_put_contents($path, $version . "\n", LOCK_EX);
}

function authoritative_worker_runtime_dir_ready(): bool
{
  $baseDir = authoritative_worker_cwd() . DIRECTORY_SEPARATOR . '.runtime';
  if (!(is_dir($baseDir) || @mkdir($baseDir, 02770, true) || is_dir($baseDir))) {
    return false;
  }
  @chmod($baseDir, 02770);
  $dir = authoritative_worker_runtime_dir();
  $ready = is_dir($dir) || @mkdir($dir, 02770, true) || is_dir($dir);
  if ($ready) {
    @chmod($dir, 02770);
  }
  return $ready;
}

function authoritative_worker_direct_command(): array
{
  return [
    authoritative_worker_node_binary(),
    '--experimental-default-type=module',
    authoritative_worker_script_path(),
  ];
}

function authoritative_worker_daemon_command(): string
{
  return
    'setsid ' .
    escapeshellarg(authoritative_worker_node_binary()) .
    ' --experimental-default-type=module ' .
    escapeshellarg(authoritative_worker_daemon_script_path()) .
    ' ' .
    escapeshellarg(authoritative_worker_socket_path()) .
    ' < /dev/null ' .
    ' >> ' .
    escapeshellarg(authoritative_worker_log_path()) .
    ' 2>&1 &';
}

function authoritative_worker_decode_response(?string $stdout, ?string $stderr = ''): array
{
  $decoded = is_string($stdout) ? json_decode($stdout, true) : null;
  if (!is_array($decoded)) {
    $detail = trim((string) $stderr);
    if ($detail === '') {
      $detail = 'Worker returned invalid JSON.';
    }
    throw new RuntimeException($detail);
  }
  if (($decoded['ok'] ?? false) !== true) {
    $detail = trim((string) ($decoded['error'] ?? 'Authoritative worker failed.'));
    if ($detail === '' && is_string($stderr) && trim($stderr) !== '') {
      $detail = trim($stderr);
    }
    throw new RuntimeException($detail !== '' ? $detail : 'Authoritative worker failed.');
  }
  return $decoded;
}

function authoritative_worker_socket_connect(float $timeoutSeconds = 0.35)
{
  $errno = 0;
  $errstr = '';
  $stream = @stream_socket_client(
    authoritative_worker_socket_uri(),
    $errno,
    $errstr,
    $timeoutSeconds,
    STREAM_CLIENT_CONNECT
  );
  if (!is_resource($stream)) {
    return null;
  }
  stream_set_timeout($stream, max(1, (int) ceil($timeoutSeconds)));
  return $stream;
}

function authoritative_worker_daemon_start(): bool
{
  if (!authoritative_worker_runtime_dir_ready()) {
    return false;
  }

  $currentVersion = authoritative_worker_code_version();
  $storedVersion = authoritative_worker_stored_version();
  $socketPath = authoritative_worker_socket_path();
  if ($currentVersion !== '' && $storedVersion !== '' && !hash_equals($storedVersion, $currentVersion)) {
    @unlink($socketPath);
  }
  $existing = authoritative_worker_socket_connect(0.1);
  if (is_resource($existing)) {
    fclose($existing);
    if ($currentVersion !== '' && ($storedVersion === '' || !hash_equals($storedVersion, $currentVersion))) {
      // Socket reachable but code changed; force daemon recycle.
      @unlink($socketPath);
    } else {
      return true;
    }
  }
  if (is_file($socketPath) || file_exists($socketPath)) {
    @unlink($socketPath);
  }

  @pclose(@popen(authoritative_worker_daemon_command(), 'r'));

  $deadline = microtime(true) + 3.0;
  while (microtime(true) < $deadline) {
    usleep(100000);
    $probe = authoritative_worker_socket_connect(0.15);
    if (is_resource($probe)) {
      fclose($probe);
      authoritative_worker_store_version($currentVersion);
      return true;
    }
  }
  return false;
}

/**
 * @return array<string, mixed>|null
 */
function authoritative_worker_call_via_daemon(array $input): ?array
{
  if (!authoritative_worker_daemon_start()) {
    return null;
  }

  $stream = authoritative_worker_socket_connect(1.5);
  if (!is_resource($stream)) {
    return null;
  }

  $stdin = json_encode($input, JSON_UNESCAPED_SLASHES);
  if (!is_string($stdin)) {
    fclose($stream);
    throw new RuntimeException('Could not encode authoritative worker input.');
  }

  fwrite($stream, $stdin . "\n");
  stream_socket_shutdown($stream, STREAM_SHUT_WR);
  $stdout = stream_get_contents($stream);
  fclose($stream);
  try {
    return authoritative_worker_decode_response($stdout, '');
  } catch (RuntimeException $err) {
    @unlink(authoritative_worker_socket_path());
    return null;
  }
}

/**
 * @return array<string, mixed>
 */
function authoritative_worker_call_direct(array $input): array
{
  $descriptorSpec = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
  ];
  $process = @proc_open(authoritative_worker_direct_command(), $descriptorSpec, $pipes, authoritative_worker_cwd());
  if (!is_resource($process)) {
    throw new RuntimeException('Could not launch authoritative worker.');
  }

  $stdin = json_encode($input, JSON_UNESCAPED_SLASHES);
  if (!is_string($stdin)) {
    @proc_terminate($process);
    throw new RuntimeException('Could not encode authoritative worker input.');
  }

  fwrite($pipes[0], $stdin);
  fclose($pipes[0]);
  $stdout = stream_get_contents($pipes[1]);
  fclose($pipes[1]);
  $stderr = stream_get_contents($pipes[2]);
  fclose($pipes[2]);
  $exitCode = proc_close($process);

  $decoded = authoritative_worker_decode_response($stdout, $stderr);
  if ($exitCode !== 0) {
    throw new RuntimeException('Authoritative worker exited unexpectedly.');
  }
  return $decoded;
}

/**
 * @return array<string, mixed>
 */
function authoritative_worker_call(array $input): array
{
  $daemon = authoritative_worker_call_via_daemon($input);
  if (is_array($daemon)) {
    return $daemon;
  }
  return authoritative_worker_call_direct($input);
}

/**
 * @return array<string, mixed>
 */
function authoritative_worker_snapshot(string $worldPayload): array
{
  return authoritative_worker_call([
    'operation' => 'snapshot',
    'worldPayload' => $worldPayload,
  ]);
}

/**
 * @param array<string, mixed> $options
 * @return array<string, mixed>
 */
function authoritative_worker_bootstrap(?string $worldPayload, ?string $characterPayload, array $options = []): array
{
  return authoritative_worker_call([
    'operation' => 'bootstrap',
    'options' => [
      'worldPayload' => trim((string) ($worldPayload ?? '')),
      'characterPayload' => trim((string) ($characterPayload ?? '')),
      'forceEntrance' => !empty($options['force_entrance']),
    ],
  ]);
}

/**
 * @param array<string, mixed> $options
 * @return array<string, mixed>
 */
function authoritative_worker_switch_character(string $worldPayload, string $characterPayload, array $options = []): array
{
  return authoritative_worker_call([
    'operation' => 'switch_character',
    'worldPayload' => $worldPayload,
    'characterPayload' => $characterPayload,
    'options' => [
      'forceEntrance' => !empty($options['force_entrance']),
    ],
  ]);
}

/**
 * @param array<string, mixed> $command
 * @return array<string, mixed>
 */
function authoritative_worker_execute_command(string $worldPayload, array $command, string $characterPayload = ''): array
{
  return authoritative_worker_call([
    'operation' => 'command',
    'worldPayload' => $worldPayload,
    'characterPayload' => trim($characterPayload),
    'command' => $command,
  ]);
}
