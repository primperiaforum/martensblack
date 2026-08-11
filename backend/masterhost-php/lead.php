<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

$fieldRules = [
    'fname' => ['required' => true, 'max' => 60, 'type' => 'person'],
    'lname' => ['required' => true, 'max' => 80, 'type' => 'person'],
    'tname' => ['required' => false, 'max' => 80, 'type' => 'person'],
    'phone' => ['required' => true, 'max' => 24, 'type' => 'phone'],
    'email' => ['required' => true, 'max' => 254, 'type' => 'email'],
    'city' => ['required' => true, 'max' => 80, 'type' => 'city'],
    'status' => ['required' => true, 'max' => 120, 'type' => 'business'],
    'company' => ['required' => true, 'max' => 160, 'type' => 'business'],
    'sfera' => ['required' => true, 'max' => 180, 'type' => 'business'],
];

$trackingRules = [
    'page_url' => 600,
    'source_origin' => 160,
    'source_path' => 400,
    'referrer' => 600,
    'utm_source' => 160,
    'utm_medium' => 160,
    'utm_campaign' => 220,
    'utm_content' => 220,
    'utm_term' => 220,
    'utm_id' => 120,
    'gclid' => 260,
    'yclid' => 260,
    'fbclid' => 260,
];

handleCors($config);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

if (!isAllowedOrigin($config)) {
    jsonResponse(['ok' => false, 'error' => 'forbidden_origin'], 403);
}

$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > (int)$config['max_body_bytes']) {
    jsonResponse(['ok' => false, 'error' => 'payload_too_large'], 413);
}

if (cleanText($_POST['homepage'] ?? '', 120) !== '') {
    jsonResponse(['ok' => true], 200);
}

if (isTooFast($config)) {
    jsonResponse(['ok' => false, 'error' => 'too_fast'], 429);
}

$validation = validatePayload($_POST, $fieldRules, $trackingRules);
if (!$validation['ok']) {
    jsonResponse([
        'ok' => false,
        'error' => 'validation_failed',
        'fields' => $validation['errors'],
    ], 400);
}

$bitrixFields = $config['bitrix_fields'];
$lead = buildLead($validation['data'], $validation['tracking'], $bitrixFields);
$saved = saveLead($config, $lead);

$webhook = trim((string)$config['bitrix_webhook_url']);
if (!isSafeHttpsUrl($webhook)) {
    updateLeadStatus($config, $lead['id'], 'failed', 0, 'proxy_not_configured');
    respondAfterCrmFailure('proxy_not_configured', $saved);
}

$outbound = buildOutboundPayload($validation['data'], $validation['tracking'], $bitrixFields);
$crm = postToBitrix($webhook, $outbound, (int)$config['bitrix_timeout_seconds'], buildCrmHeaders($validation['tracking']));

if (!$crm['ok']) {
    updateLeadStatus($config, $lead['id'], 'failed', $crm['status'], $crm['error']);
    respondAfterCrmFailure($crm['error'], $saved);
}

updateLeadStatus($config, $lead['id'], 'forwarded', $crm['status'], '');
jsonResponse(['ok' => true], 200);

function handleCors(array $config): void
{
    $origin = getOrigin();
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Max-Age: 86400');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');

    if ($origin !== '' && in_array($origin, $config['allowed_origins'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
}

function isAllowedOrigin(array $config): bool
{
    $origin = getOrigin();
    return $origin !== '' && in_array($origin, $config['allowed_origins'], true);
}

function getOrigin(): string
{
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    return rtrim($origin, '/');
}

function isTooFast(array $config): bool
{
    $startedAt = (int)($_POST['form_started_at'] ?? 0);
    if ($startedAt <= 0) {
        return false;
    }

    $elapsed = (int)(round(microtime(true) * 1000) - $startedAt);
    return $elapsed >= 0 && $elapsed < (int)$config['min_submit_ms'];
}

function validatePayload(array $source, array $fieldRules, array $trackingRules): array
{
    $errors = [];
    $data = [];

    foreach ($fieldRules as $name => $rule) {
        $value = cleanText($source[$name] ?? '', (int)$rule['max']);
        $error = validateField($value, $rule);

        if ($error !== '') {
            $errors[$name] = $error;
            continue;
        }

        $data[$name] = $rule['type'] === 'email' ? textLower($value) : $value;
    }

    $checkbox = cleanText($source['checkbox'] ?? '', 20);
    if (!in_array($checkbox, ['Да', 'on', 'true', '1'], true)) {
        $errors['checkbox'] = 'required';
    }

    $tracking = [];
    foreach ($trackingRules as $name => $max) {
        $value = cleanText($source[$name] ?? '', (int)$max);
        if ($value === '' || containsDangerousChars($value)) {
            continue;
        }
        $tracking[$name] = $value;
    }

    return [
        'ok' => count($errors) === 0,
        'data' => $data,
        'tracking' => $tracking,
        'errors' => $errors,
    ];
}

function validateField(string $value, array $rule): string
{
    if ($rule['required'] && $value === '') {
        return 'required';
    }

    if ($value === '') {
        return '';
    }

    if (textLength($value) > (int)$rule['max']) {
        return 'too_long';
    }

    if (containsDangerousChars($value)) {
        return 'bad_chars';
    }

    if ($rule['type'] === 'email' && filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
        return 'bad_email';
    }

    if ($rule['type'] === 'phone') {
        $digits = preg_replace('/\D+/', '', $value);
        if (!preg_match('/^\+?[\d\s()\-]+$/u', $value) || strlen($digits) < 10 || strlen($digits) > 15) {
            return 'bad_phone';
        }
    }

    if ($rule['type'] === 'person' && !preg_match('/^\p{L}+(?:[\s\'-]\p{L}+)*$/u', $value)) {
        return 'bad_person';
    }

    if ($rule['type'] === 'city' && !preg_match('/^\p{L}+(?:[\s.\'-]\p{L}+)*$/u', $value)) {
        return 'bad_city';
    }

    if ($rule['type'] === 'business') {
        $letters = preg_match_all('/\p{L}/u', $value);
        if (!preg_match('/^[\p{L}\p{N}\s"\'«».,:;()№&+\/-]+$/u', $value) || $letters < 2) {
            return 'bad_business_text';
        }
    }

    return '';
}

function cleanText($value, int $maxLength): string
{
    $text = is_scalar($value) ? (string)$value : '';
    $text = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text);
    $text = preg_replace('/\s+/u', ' ', $text);
    $text = trim($text);
    return textSlice($text, $maxLength + 1);
}

function textLower(string $value): string
{
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($value, 'UTF-8');
    }

    return strtolower($value);
}

function textLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    return strlen($value);
}

function textSlice(string $value, int $length): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $length, 'UTF-8');
    }

    return substr($value, 0, $length);
}

function containsDangerousChars(string $value): bool
{
    return preg_match('/[<>{}\[\]`\\\\]/u', $value) === 1;
}

function buildLead(array $data, array $tracking, array $bitrixFields): array
{
    $origin = getOrigin();
    $sourceUrl = $tracking['page_url'] ?? $origin;
    $payload = array_merge($bitrixFields, $data, [
        'checkbox' => 'Да',
        'source' => [
            'origin' => $origin,
            'url' => $sourceUrl,
            'referrer' => $tracking['referrer'] ?? '',
            'path' => $tracking['source_path'] ?? '',
        ],
        'tracking' => $tracking,
    ]);

    return [
        'id' => generateUuid(),
        'created_at' => gmdate('c'),
        'fname' => $data['fname'],
        'lname' => $data['lname'],
        'tname' => $data['tname'],
        'phone' => $data['phone'],
        'email' => $data['email'],
        'city' => $data['city'],
        'status' => $data['status'],
        'company' => $data['company'],
        'sfera' => $data['sfera'],
        'consent' => 1,
        'source_url' => $sourceUrl,
        'origin' => $origin,
        'user_agent' => cleanText($_SERVER['HTTP_USER_AGENT'] ?? '', 500),
        'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'tracking_json' => json_encode($tracking, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'forward_status' => 'pending',
    ];
}

function saveLead(array $config, array $lead): bool
{
    try {
        $pdo = getPdo($config);
        ensureSchema($pdo);
        $stmt = $pdo->prepare(
            'INSERT INTO leads (
                id, created_at, fname, lname, tname, phone, email, city, status,
                company, sfera, consent, source_url, origin, user_agent,
                payload_json, tracking_json, forward_status
            ) VALUES (
                :id, :created_at, :fname, :lname, :tname, :phone, :email, :city, :status,
                :company, :sfera, :consent, :source_url, :origin, :user_agent,
                :payload_json, :tracking_json, :forward_status
            )'
        );
        $stmt->execute($lead);
        return true;
    } catch (Throwable $error) {
        error_log('lead_save_failed: ' . $error->getMessage());
        return appendLeadCsv($config, $lead);
    }
}

function updateLeadStatus(array $config, string $id, string $status, int $crmStatus, string $error): void
{
    try {
        $pdo = getPdo($config);
        ensureSchema($pdo);
        $stmt = $pdo->prepare(
            'UPDATE leads
             SET forward_status = :forward_status,
                 crm_status = :crm_status,
                 forward_error = :forward_error,
                 forwarded_at = :forwarded_at
             WHERE id = :id'
        );
        $stmt->execute([
            ':forward_status' => $status,
            ':crm_status' => $crmStatus,
            ':forward_error' => cleanText($error, 300),
            ':forwarded_at' => $status === 'forwarded' ? gmdate('c') : null,
            ':id' => $id,
        ]);
    } catch (Throwable $updateError) {
        error_log('lead_status_update_failed: ' . $updateError->getMessage());
    }
}

function getPdo(array $config): PDO
{
    $storageDir = ensureStorageDir($config);
    $pdo = new PDO('sqlite:' . $storageDir . '/leads.sqlite');
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
            forward_status TEXT NOT NULL DEFAULT 'pending',
            crm_status INTEGER,
            forward_error TEXT,
            forwarded_at TEXT
        )"
    );
    $pdo->exec('CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS leads_forward_status_idx ON leads(forward_status)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email)');
}

function appendLeadCsv(array $config, array $lead): bool
{
    $storageDir = ensureStorageDir($config);
    $path = $storageDir . '/leads-fallback.csv';
    $isNew = !file_exists($path);
    $handle = fopen($path, 'ab');
    if (!$handle) {
        return false;
    }

    flock($handle, LOCK_EX);
    if ($isNew) {
        fputcsv($handle, array_keys($lead));
    }
    fputcsv($handle, array_values($lead));
    flock($handle, LOCK_UN);
    fclose($handle);
    return true;
}

function ensureStorageDir(array $config): string
{
    $dir = (string)$config['storage_dir'];
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    return $dir;
}

function buildOutboundPayload(array $data, array $tracking, array $bitrixFields): array
{
    $pageUrl = $tracking['page_url'] ?? getOrigin();
    $origin = getOrigin();
    $sourceHost = parse_url($origin, PHP_URL_HOST) ?: '';
    $payload = array_merge($bitrixFields, $data, [
        'checkbox' => 'Да',
        'website' => $pageUrl,
        'source_website' => $sourceHost,
        'source_origin' => $origin,
        'page_url' => $pageUrl,
        'PAGE_URL' => $pageUrl,
        'landing_page' => $pageUrl,
        'LANDING_PAGE' => $pageUrl,
        'source_path' => $tracking['source_path'] ?? '',
        'referrer' => $tracking['referrer'] ?? '',
        'referer' => $pageUrl,
        'HTTP_REFERER' => $pageUrl,
        'url' => $pageUrl,
        'URL' => $pageUrl,
        'page' => $pageUrl,
        'pageUrl' => $pageUrl,
        'form_url' => $pageUrl,
        'form_page' => $pageUrl,
        'source_url' => $pageUrl,
        'SOURCE_URL' => $pageUrl,
        'site' => $sourceHost,
        'site_url' => $origin,
    ]);

    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'gclid', 'yclid', 'fbclid'] as $name) {
        $payload[$name] = $tracking[$name] ?? '';
        $payload[strtoupper($name)] = $tracking[$name] ?? '';
    }

    return $payload;
}

function buildCrmHeaders(array $tracking): array
{
    $pageUrl = $tracking['page_url'] ?? getOrigin();
    $origin = getOrigin();
    $headers = [];

    if ($pageUrl !== '') {
        $headers[] = 'Referer: ' . $pageUrl;
    }

    if ($origin !== '') {
        $headers[] = 'Origin: ' . $origin;
    }

    return $headers;
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
        curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_errno($ch) ? 'crm_unavailable' : '';
        curl_close($ch);

        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'error' => $error ?: 'crm_rejected'];
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
    return ['ok' => $result !== false && $status >= 200 && $status < 300, 'status' => $status, 'error' => $result === false ? 'crm_unavailable' : 'crm_rejected'];
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

function respondAfterCrmFailure(string $error, bool $saved): void
{
    if ($saved) {
        jsonResponse(['ok' => true, 'queued' => true, 'warning' => $error], 200);
    }

    jsonResponse(['ok' => false, 'error' => $error], 502);
}

function isSafeHttpsUrl(string $value): bool
{
    return preg_match('/^https:\/\/[^\s<>"\']+$/i', $value) === 1;
}

function generateUuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
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
