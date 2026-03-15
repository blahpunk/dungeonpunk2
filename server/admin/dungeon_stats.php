<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'bootstrap.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'analytics_db.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'analytics_write.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'analytics_admin.php';

if (!defined('ADMIN_EMAIL')) {
  define('ADMIN_EMAIL', 'eric.zeigenbein@gmail.com');
}

function analytics_page_h(string $value): string
{
  return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function analytics_page_base64url_decode(string $value): ?string
{
  $base64 = strtr($value, '-_', '+/');
  $padding = strlen($base64) % 4;
  if ($padding > 0) {
    $base64 .= str_repeat('=', 4 - $padding);
  }
  $decoded = base64_decode($base64, true);
  return is_string($decoded) ? $decoded : null;
}

/**
 * @return array<int, string>
 */
function analytics_page_auth_secrets(): array
{
  $current = trim((string) (getenv('SECURE_AUTH_SECRET') ?: getenv('FLASK_SECRET_KEY') ?: ''));
  $previousRaw = trim((string) (getenv('SECURE_AUTH_PREVIOUS_SECRETS') ?: ''));
  $out = [];
  if ($current !== '') {
    $out[] = $current;
  }
  if ($previousRaw !== '') {
    foreach (explode(',', $previousRaw) as $part) {
      $value = trim($part);
      if ($value !== '') {
        $out[] = $value;
      }
    }
  }
  $local = trim((string) (getenv('LOCAL_AUTH_SECRET') ?: ''));
  if ($local !== '') {
    $out[] = $local;
  }
  return array_values(array_unique($out));
}

function analytics_page_is_valid_signature(string $value, string $sig): bool
{
  if ($value === '' || $sig === '') {
    return false;
  }
  foreach (analytics_page_auth_secrets() as $secret) {
    $expected = hash_hmac('sha256', $value, $secret);
    if (hash_equals($expected, $sig)) {
      return true;
    }
  }
  return false;
}

/**
 * @return array{name: string, email: string}|null
 */
function analytics_page_authenticated_user(): ?array
{
  $pairs = [
    ['user', 'user_sig'],
    ['bp_auth_user', 'bp_auth_sig'],
  ];
  foreach ($pairs as [$valueKey, $sigKey]) {
    $value = trim((string) ($_COOKIE[$valueKey] ?? ''));
    $sig = trim((string) ($_COOKIE[$sigKey] ?? ''));
    if (!analytics_page_is_valid_signature($value, $sig)) {
      continue;
    }
    $decoded = analytics_page_base64url_decode($value);
    if ($decoded === null) {
      continue;
    }
    $payload = json_decode($decoded, true);
    if (!is_array($payload)) {
      continue;
    }
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
      continue;
    }
    $name = trim((string) ($payload['name'] ?? ''));
    if ($name === '') {
      $name = $email;
    }
    return ['name' => $name, 'email' => $email];
  }
  return null;
}

app_apply_html_security_headers();

$user = analytics_page_authenticated_user();
$userEmail = strtolower(trim((string) ($user['email'] ?? '')));
if (!is_analytics_admin($userEmail)) {
  http_response_code(403);
  ?>
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Dungeon Stats</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0b1118; color: #eef4ff; padding: 32px; }
        a { color: #8fc2ff; }
      </style>
    </head>
    <body>
      <h1>Dungeon Stats</h1>
      <p>Admin access is required for this page.</p>
      <p><a href="../../index.php">Return to the game</a></p>
    </body>
  </html>
  <?php
  exit;
}

$db = null;
try {
  $db = analytics_db();
} catch (Throwable $e) {
  http_response_code(500);
  ?>
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Dungeon Stats</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0b1118; color: #eef4ff; padding: 32px; }
        a { color: #8fc2ff; }
      </style>
    </head>
    <body>
      <h1>Dungeon Stats</h1>
      <p><?php echo analytics_page_h($e->getMessage()); ?></p>
      <p><a href="../../index.php">Return to the game</a></p>
    </body>
  </html>
  <?php
  exit;
}
$overview = analytics_admin_overview($db);
$liveSessions = analytics_admin_live_sessions($db);
$selectedRunId = trim((string) ($_GET['run_id'] ?? ''));
$selectedUser = strtolower(trim((string) ($_GET['user'] ?? '')));
$runDetail = $selectedRunId !== '' ? analytics_admin_run($db, $selectedRunId) : ['run' => null, 'depths' => [], 'events' => []];
$playerDetail = ($selectedUser !== '' && filter_var($selectedUser, FILTER_VALIDATE_EMAIL) !== false)
  ? analytics_admin_player($db, $selectedUser)
  : ['user_email' => '', 'totals' => [], 'class_usage' => [], 'death_causes' => [], 'recent_runs' => []];

?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dungeon Stats</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #091017;
        --panel: #0f1822;
        --panel-2: #152131;
        --text: #edf4ff;
        --muted: #9fb2c9;
        --line: #243549;
        --accent: #7ec3ff;
        --accent-2: #ffd166;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: linear-gradient(180deg, #091017 0%, #0d1622 100%);
        color: var(--text);
      }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .wrap {
        max-width: 1440px;
        margin: 0 auto;
        padding: 28px;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 22px;
      }
      .topbar p {
        margin: 6px 0 0 0;
        color: var(--muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        margin-bottom: 18px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
      }
      .stat {
        font-size: 32px;
        font-weight: 800;
        margin-top: 6px;
      }
      .muted { color: var(--muted); }
      .tables {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: 18px;
        margin-bottom: 18px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th, td {
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 12px;
      }
      .forms {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 18px;
      }
      .forms form {
        display: flex;
        gap: 8px;
        align-items: center;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px 12px;
      }
      input, button {
        border-radius: 10px;
        border: 1px solid var(--line);
        background: var(--panel-2);
        color: var(--text);
        padding: 8px 10px;
      }
      button {
        cursor: pointer;
        background: linear-gradient(180deg, #1f3550 0%, #152536 100%);
      }
      h1, h2, h3 { margin: 0; }
      h2 { margin-bottom: 12px; font-size: 20px; }
      pre {
        background: #08111b;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="topbar">
        <div>
          <h1>Dungeon Stats</h1>
          <p>Signed in as <?php echo analytics_page_h($userEmail); ?>.</p>
        </div>
        <a href="../../index.php">Back to the game</a>
      </div>

      <div class="grid">
        <div class="card"><div class="muted">Active Runs</div><div class="stat"><?php echo (int) ($overview['summary']['active_runs'] ?? 0); ?></div></div>
        <div class="card"><div class="muted">Runs Today</div><div class="stat"><?php echo (int) ($overview['summary']['runs_today'] ?? 0); ?></div></div>
        <div class="card"><div class="muted">Avg Run Seconds</div><div class="stat"><?php echo (int) ($overview['summary']['average_run_seconds'] ?? 0); ?></div></div>
        <div class="card"><div class="muted">Avg Deepest Depth</div><div class="stat"><?php echo (int) ($overview['summary']['average_deepest_depth'] ?? 0); ?></div></div>
      </div>

      <div class="forms">
        <form method="get">
          <label for="run_id">Run Inspector</label>
          <input id="run_id" name="run_id" type="text" value="<?php echo analytics_page_h($selectedRunId); ?>" placeholder="run id" />
          <button type="submit">Open</button>
        </form>
        <form method="get">
          <label for="user">Player Profile</label>
          <input id="user" name="user" type="email" value="<?php echo analytics_page_h($selectedUser); ?>" placeholder="player@example.com" />
          <button type="submit">Open</button>
        </form>
      </div>

      <div class="tables">
        <div class="card">
          <h2>Live Sessions</h2>
          <table>
            <thead>
              <tr><th>Player</th><th>Character</th><th>Run</th><th>Depth</th><th>Turns</th><th>Latest</th></tr>
            </thead>
            <tbody>
              <?php foreach ($liveSessions as $row): ?>
                <tr>
                  <td><a href="?user=<?php echo rawurlencode((string) ($row['user_email'] ?? '')); ?>"><?php echo analytics_page_h((string) ($row['user_email'] ?? '')); ?></a></td>
                  <td><?php echo analytics_page_h((string) ($row['character_name'] ?? '')); ?><div class="muted"><?php echo analytics_page_h((string) ($row['class_id'] ?? '')); ?> / <?php echo analytics_page_h((string) ($row['species_id'] ?? '')); ?></div></td>
                  <td><a href="?run_id=<?php echo rawurlencode((string) ($row['run_id'] ?? '')); ?>"><code><?php echo analytics_page_h((string) ($row['run_id'] ?? '')); ?></code></a></td>
                  <td><?php echo (int) ($row['final_depth'] ?? 0); ?> / <?php echo (int) ($row['deepest_depth'] ?? 0); ?></td>
                  <td><?php echo (int) ($row['turns'] ?? 0); ?></td>
                  <td><?php echo analytics_page_h((string) ($row['latest_event'] ?? '')); ?><div class="muted"><?php echo analytics_page_h((string) ($row['last_heartbeat_at'] ?? '')); ?></div></td>
                </tr>
              <?php endforeach; ?>
              <?php if (!$liveSessions): ?>
                <tr><td colspan="6" class="muted">No active runs.</td></tr>
              <?php endif; ?>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h2>Usage Snapshot</h2>
          <table>
            <thead>
              <tr><th>Class</th><th>Runs</th></tr>
            </thead>
            <tbody>
              <?php foreach (($overview['most_used_classes'] ?? []) as $row): ?>
                <tr><td><?php echo analytics_page_h((string) ($row['class_id'] ?? '')); ?></td><td><?php echo (int) ($row['count'] ?? 0); ?></td></tr>
              <?php endforeach; ?>
              <?php if (!(count($overview['most_used_classes'] ?? []) > 0)): ?>
                <tr><td colspan="2" class="muted">No run data yet.</td></tr>
              <?php endif; ?>
            </tbody>
          </table>
          <h3 style="margin-top:14px;">Deaths by Depth</h3>
          <table>
            <thead>
              <tr><th>Depth</th><th>Deaths</th></tr>
            </thead>
            <tbody>
              <?php foreach (($overview['deaths_by_depth'] ?? []) as $row): ?>
                <tr><td><?php echo (int) ($row['depth'] ?? 0); ?></td><td><?php echo (int) ($row['count'] ?? 0); ?></td></tr>
              <?php endforeach; ?>
              <?php if (!(count($overview['deaths_by_depth'] ?? []) > 0)): ?>
                <tr><td colspan="2" class="muted">No death records yet.</td></tr>
              <?php endif; ?>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h2>Trap and Interaction Rates</h2>
          <table>
            <thead>
              <tr><th>Metric</th><th>Value</th></tr>
            </thead>
            <tbody>
              <tr><td>Average shrines used/run</td><td><?php echo analytics_page_h((string) ($overview['rates']['shrine_rate'] ?? '0')); ?></td></tr>
              <tr><td>Average chests opened/run</td><td><?php echo analytics_page_h((string) ($overview['rates']['chest_rate'] ?? '0')); ?></td></tr>
            </tbody>
          </table>
          <h3 style="margin-top:14px;">Highest Trap Trigger Depths</h3>
          <table>
            <thead>
              <tr><th>Depth</th><th>Triggers</th></tr>
            </thead>
            <tbody>
              <?php foreach (($overview['trap_depths'] ?? []) as $row): ?>
                <tr><td><?php echo (int) ($row['depth'] ?? 0); ?></td><td><?php echo (int) ($row['triggers'] ?? 0); ?></td></tr>
              <?php endforeach; ?>
              <?php if (!(count($overview['trap_depths'] ?? []) > 0)): ?>
                <tr><td colspan="2" class="muted">No trap data yet.</td></tr>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>

      <?php if (is_array($runDetail['run'] ?? null)): ?>
        <div class="card" style="margin-bottom:18px;">
          <h2>Run Inspector</h2>
          <table>
            <tbody>
              <?php foreach (($runDetail['run'] ?? []) as $key => $value): ?>
                <tr><th><?php echo analytics_page_h((string) $key); ?></th><td><?php echo analytics_page_h((string) $value); ?></td></tr>
              <?php endforeach; ?>
            </tbody>
          </table>
          <div class="tables" style="margin-top:16px;">
            <div class="card">
              <h3>Per-Depth Breakdown</h3>
              <table>
                <thead>
                  <tr><th>Depth</th><th>Turns</th><th>Moves</th><th>Damage</th><th>Discovery</th><th>Kills</th></tr>
                </thead>
                <tbody>
                  <?php foreach (($runDetail['depths'] ?? []) as $row): ?>
                    <tr>
                      <td><?php echo (int) ($row['depth'] ?? 0); ?></td>
                      <td><?php echo (int) ($row['turns'] ?? 0); ?></td>
                      <td><?php echo (int) ($row['moves'] ?? 0); ?></td>
                      <td><?php echo (int) ($row['damage_dealt'] ?? 0); ?> / <?php echo (int) ($row['damage_taken'] ?? 0); ?></td>
                      <td><?php echo (int) ($row['tiles_discovered'] ?? 0); ?> tiles</td>
                      <td><code><?php echo analytics_page_h((string) ($row['kills_json'] ?? '{}')); ?></code></td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
            <div class="card">
              <h3>Event Timeline</h3>
              <table>
                <thead>
                  <tr><th>#</th><th>Time</th><th>Type</th><th>Depth</th><th>Payload</th></tr>
                </thead>
                <tbody>
                  <?php foreach (($runDetail['events'] ?? []) as $row): ?>
                    <tr>
                      <td><?php echo (int) ($row['seq'] ?? 0); ?></td>
                      <td><?php echo analytics_page_h((string) ($row['event_time'] ?? '')); ?></td>
                      <td><?php echo analytics_page_h((string) ($row['event_type'] ?? '')); ?></td>
                      <td><?php echo (int) ($row['depth'] ?? 0); ?></td>
                      <td><code><?php echo analytics_page_h((string) ($row['payload_json'] ?? '{}')); ?></code></td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      <?php endif; ?>

      <?php if ($playerDetail['user_email'] !== ''): ?>
        <div class="card">
          <h2>Player Profile: <?php echo analytics_page_h((string) $playerDetail['user_email']); ?></h2>
          <div class="tables">
            <div class="card">
              <h3>Totals</h3>
              <table>
                <tbody>
                  <?php foreach (($playerDetail['totals'] ?? []) as $key => $value): ?>
                    <tr><th><?php echo analytics_page_h((string) $key); ?></th><td><?php echo analytics_page_h((string) $value); ?></td></tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
            <div class="card">
              <h3>Class Usage</h3>
              <table>
                <thead><tr><th>Class</th><th>Runs</th></tr></thead>
                <tbody>
                  <?php foreach (($playerDetail['class_usage'] ?? []) as $row): ?>
                    <tr><td><?php echo analytics_page_h((string) ($row['class_id'] ?? '')); ?></td><td><?php echo (int) ($row['count'] ?? 0); ?></td></tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
              <h3 style="margin-top:14px;">Death Causes</h3>
              <table>
                <thead><tr><th>Cause</th><th>Count</th></tr></thead>
                <tbody>
                  <?php foreach (($playerDetail['death_causes'] ?? []) as $row): ?>
                    <tr><td><?php echo analytics_page_h((string) ($row['death_cause'] ?? '')); ?></td><td><?php echo (int) ($row['count'] ?? 0); ?></td></tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
            <div class="card">
              <h3>Recent Runs</h3>
              <table>
                <thead><tr><th>Run</th><th>Status</th><th>Depth</th><th>Turns</th><th>Started</th></tr></thead>
                <tbody>
                  <?php foreach (($playerDetail['recent_runs'] ?? []) as $row): ?>
                    <tr>
                      <td><a href="?run_id=<?php echo rawurlencode((string) ($row['run_id'] ?? '')); ?>"><code><?php echo analytics_page_h((string) ($row['run_id'] ?? '')); ?></code></a></td>
                      <td><?php echo analytics_page_h((string) ($row['status'] ?? '')); ?></td>
                      <td><?php echo (int) ($row['final_depth'] ?? 0); ?> / <?php echo (int) ($row['deepest_depth'] ?? 0); ?></td>
                      <td><?php echo (int) ($row['turns'] ?? 0); ?></td>
                      <td><?php echo analytics_page_h((string) ($row['started_at'] ?? '')); ?></td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      <?php endif; ?>
    </div>
  </body>
</html>
