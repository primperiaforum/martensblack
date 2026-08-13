<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

if (PHP_SAPI !== 'cli' && !isAuthorized($config)) {
    header('WWW-Authenticate: Bearer');
    jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
}

$limit = PHP_SAPI === 'cli'
    ? getCliIntOption('limit', (int)($config['retry_batch_limit'] ?? 20))
    : min(max((int)($_GET['limit'] ?? ($config['retry_batch_limit'] ?? 20)), 1), 100);
$limit = min(max($limit, 1), 100);

$result = retryQueuedLeads($config, $limit);

if (PHP_SAPI === 'cli') {
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit($result['ok'] ? 0 : 1);
}

jsonResponse($result, $result['ok'] ? 200 : 500);

function retryQueuedLeads(array $config, int $limit): array
{
    $webhook = trim((string)$config['bitrix_webhook_url']);
    if (!isSafeHttpsUrl($webhook)) {
        return ['ok' => false, 'error' => 'proxy_not_configured'];
    }

    $pdo = getPdo($config);
    ensureSchema($pdo);
    $now = gmdate('c');
    $maxAttempts = (int)($config['retry_max_attempts'] ?? 6);
    $stmt = $pdo->prepare(
        "SELECT *
         FROM leads
         WHERE forward_status IN ('queued', 'pending')
           AND retry_count < :max_attempts
           AND (next_retry_at IS NULL OR next_retry_at = '' OR next_retry_at <= :now)
         ORDER BY created_at ASC
         LIMIT :limit"
    );
    $stmt->bindValue(':max_attempts', $maxAttempts, PDO::PARAM_INT);
    $stmt->bindValue(':now', $now, PDO::PARAM_STR);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $summary = [
        'ok' => true,
        'checked' => count($rows),
        'forwarded' => 0,
        'queued' => 0,
        'failed' => 0,
        'items' => [],
    ];

    foreach ($rows as $row) {
        $payload = decodePayload($row);
        if (!$payload) {
            updateLeadStatus($pdo, $config, $row, 'failed', 0, 'missing_outbound_payload', '');
            $summary['failed']++;
            $summary['items'][] = ['id' => $row['id'], 'status' => 'failed', 'error' => 'missing_outbound_payload'];
            continue;
        }

        $tracking = decodeJson((string)($row['tracking_json'] ?? ''));
        $crm = postToBitrix($webhook, $payload, (int)$config['bitrix_timeout_seconds'], buildCrmHeaders($tracking, $row));

        if ($crm['ok']) {
            updateLeadStatus($pdo, $config, $row, 'forwarded', $crm['status'], '', $crm['body'] ?? '');
            $summary['forwarded']++;
            $summary['items'][] = ['id' => $row['id'], 'status' => 'forwarded', 'crm_status' => $crm['status']];
            continue;
        }

        $nextRetryCount = ((int)($row['retry_count'] ?? 0)) + 1;
        $status = $nextRetryCount >= $maxAttempts ? 'failed' : 'queued';
        updateLeadStatus($pdo, $config, $row, $status, $crm['status'], $crm['error'], $crm['body'] ?? '');
        if ($status === 'failed') {
            sendFailureAlert($config, (string)$row['id'], $crm['error'], $crm['status']);
        }
        $summary[$status]++;
        $summary['items'][] = [
            'id' => $row['id'],
            'status' => $status,
            'crm_status' => $crm['status'],
            'error' => $crm['error'],
        ];
    }

    appendEventLog($config, 'retry_batch_finished', $summary);
    return $summary;
}

function decodePayload(array $row): array
{
    $payload = decodeJson((string)($row['outbound_json'] ?? ''));
    if ($payload) {
        return $payload;
    }

    $payload = decodeJson((string)($row['payload_json'] ?? ''));
    return $payload ?: [];
}

function decodeJson(string $json): array
{
    if ($json === '') {
        return [];
    }

    $decoded = json_decode($json, true);
    return is_array($decoded) ? $decoded : [];
}

function updateLeadStatus(PDO $pdo, array $config, array $row, string $status, int $crmStatus, string $error, string $responseBody): void
{
    $retryCount = ((int)($row['retry_count'] ?? 0)) + 1;
    $nextRetryAt = $status === 'queued'
        ? gmdate('c', time() + getRetryDelaySeconds($config, $retryCount))
        : null;
    $stmt = $pdo->prepare(
        'UPDATE leads
         SET forward_status = :forward_status,
             crm_status = :crm_status,
             forward_error = :forward_error,
             forwarded_at = :forwarded_at,
             retry_count = :retry_count,
             last_attempt_at = :last_attempt_at,
             next_retry_at = :next_retry_at,
             last_response = :last_response
         WHERE id = :id'
    );
    $stmt->execute([
        ':forward_status' => $status,
        ':crm_status' => $crmStatus,
        ':forward_error' => cleanText($error, 300),
        ':forwarded_at' => $status === 'forwarded' ? gmdate('c') : null,
        ':retry_count' => $retryCount,
        ':last_attempt_at' => gmdate('c'),
        ':next_retry_at' => $nextRetryAt,
        ':last_response' => cleanText($responseBody, 1000),
        ':id' => $row['id'],
    ]);

    appendEventLog($config, 'retry_' . $status, [
        'id' => $row['id'],
        'crm_status' => $crmStatus,
        'error' => cleanText($error, 120),
        'retry_count' => $retryCount,
        'next_retry_at' => $nextRetryAt,
    ]);
}

function getPdo(array $config): PDO
{
    $dir = ensureStorageDir($config);
    $pdo = new PDO('sqlite:' . $dir . '/leads.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function ensureSchema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            fname TEXT,
            lname TEXT,
            tname TEXT,
            phone TEXT,
            email TEXT,
            city TEXT,
            status TEXT,
            company TEXT,
            sfera TEXT,
            consent INTEGER NOT NULL DEFAULT 0,
            source_url TEXT,
            origin TEXT,
            user_agent TEXT,
            payload_json TEXT NOT NULL,
            tracking_json TEXT,
            outbound_json TEXT,
            forward_status TEXT NOT NULL DEFAULT 'pending',
            retry_count INTEGER NOT NULL DEFAULT 0,
            crm_status INTEGER,
            forward_error TEXT,
            forwarded_at TEXT,
            last_attempt_at TEXT,
            next_retry_at TEXT,
            last_response TEXT
        )"
    );
    ensureColumn($pdo, 'leads', 'outbound_json', 'TEXT');
    ensureColumn($pdo, 'leads', 'retry_count', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'leads', 'last_attempt_at', 'TEXT');
    ensureColumn($pdo, 'leads', 'next_retry_at', 'TEXT');
    ensureColumn($pdo, 'leads', 'last_response', 'TEXT');
    $pdo->exec('CREATE INDEX IF NOT EXISTS leads_forward_status_idx ON leads(forward_status)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS leads_next_retry_at_idx ON leads(next_retry_at)');
}

function ensureColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    $stmt = $pdo->query('PRAGMA table_info(' . $table . ')');
    $columns = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
    foreach ($columns as $existingColumn) {
        if (($existingColumn['name'] ?? '') === $column) {
            return;
        }
    }

    $pdo->exec('ALTER TABLE ' . $table . ' ADD COLUMN ' . $column . ' ' . $definition);
}

function postToBitrix(string $url, array $payload, int $timeoutSeconds, array $crmHeaders = []): array
{
    $headers = array_merge(['Content-Type: application/x-www-form-urlencoded'], $crmHeaders);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => $timeoutSeconds,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = (string)curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_errno($ch) ? 'crm_unavailable' : '';
        curl_close($ch);

        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'error' => $error ?: 'crm_rejected', 'body' => $body];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers) . "\r\n",
            'content' => http_build_query($payload),
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);

    $result = @file_get_contents($url, false, $context);
    $status = parseHttpStatus($http_response_header ?? []);
    return ['ok' => $result !== false && $status >= 200 && $status < 300, 'status' => $status, 'error' => $result === false ? 'crm_unavailable' : 'crm_rejected', 'body' => is_string($result) ? $result : ''];
}

function buildCrmHeaders(array $tracking, array $row): array
{
    $pageUrl = $tracking['page_url'] ?? ($row['source_url'] ?? '');
    $origin = $row['origin'] ?? '';
    $headers = [];

    if ($pageUrl !== '') {
        $headers[] = 'Referer: ' . $pageUrl;
    }

    if ($origin !== '') {
        $headers[] = 'Origin: ' . $origin;
    }

    return $headers;
}

function parseHttpStatus(array $headers): int
{
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            return (int)$matches[1];
        }
    }

    return 0;
}

function isAuthorized(array $config): bool
{
    $expected = trim((string)$config['export_token']);
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');

    if ($expected === '' || stripos($header, 'Bearer ') !== 0) {
        return false;
    }

    $actual = trim(substr($header, 7));
    return hash_equals($expected, $actual);
}

function getCliIntOption(string $name, int $default): int
{
    global $argv;
    foreach ($argv as $arg) {
        if (strpos($arg, '--' . $name . '=') === 0) {
            return (int)substr($arg, strlen($name) + 3);
        }
    }

    return $default;
}

function getRetryDelaySeconds(array $config, int $retryCount): int
{
    $schedule = $config['retry_delays_seconds'] ?? [60, 300, 900, 3600, 10800];
    if (!is_array($schedule) || count($schedule) === 0) {
        return 300;
    }

    $index = max(0, min($retryCount - 1, count($schedule) - 1));
    return max(60, (int)$schedule[$index]);
}

function ensureStorageDir(array $config): string
{
    $dir = (string)$config['storage_dir'];
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    return $dir;
}

function cleanText($value, int $maxLength): string
{
    $text = is_scalar($value) ? (string)$value : '';
    $text = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text);
    $text = preg_replace('/\s+/u', ' ', $text);
    $text = trim($text);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength + 1, 'UTF-8');
    }

    return substr($text, 0, $maxLength + 1);
}

function isSafeHttpsUrl(string $value): bool
{
    return preg_match('/^https:\/\/[^\s<>"\']+$/i', $value) === 1;
}

function appendEventLog(array $config, string $event, array $context = []): void
{
    try {
        $storageDir = ensureStorageDir($config);
        $line = json_encode([
            'ts' => gmdate('c'),
            'event' => $event,
            'context' => $context,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($line !== false) {
            file_put_contents($storageDir . '/lead-events.log', $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    } catch (Throwable $error) {
        error_log('lead_event_log_failed: ' . $error->getMessage());
    }
}

function sendFailureAlert(array $config, string $leadId, string $error, int $crmStatus): void
{
    $context = [
        'id' => $leadId,
        'error' => cleanText($error, 120),
        'crm_status' => $crmStatus,
    ];
    appendAlertLog($config, 'bitrix_retry_failed', $context);

    $email = trim((string)($config['alert_email'] ?? ''));
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false || !function_exists('mail')) {
        return;
    }

    $subject = 'APK Forum lead retry failed';
    $message = implode("\n", [
        'Lead ID: ' . $leadId,
        'Error: ' . $error,
        'CRM status: ' . $crmStatus,
        'Time UTC: ' . gmdate('c'),
    ]);
    @mail($email, $subject, $message, 'Content-Type: text/plain; charset=UTF-8');
}

function appendAlertLog(array $config, string $event, array $context = []): void
{
    try {
        $storageDir = ensureStorageDir($config);
        $line = json_encode([
            'ts' => gmdate('c'),
            'event' => $event,
            'context' => $context,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($line !== false) {
            file_put_contents($storageDir . '/lead-alerts.log', $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    } catch (Throwable $error) {
        error_log('lead_alert_log_failed: ' . $error->getMessage());
    }
}

function jsonResponse(array $payload, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
