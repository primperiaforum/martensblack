<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

if (!isAuthorized($config)) {
    header('WWW-Authenticate: Bearer');
    jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
}

$limit = isset($_GET['limit']) ? min(max((int)$_GET['limit'], 1), 2000) : 500;
$status = cleanText($_GET['status'] ?? '', 24);
$columns = [
    'id',
    'created_at',
    'fname',
    'lname',
    'tname',
    'phone',
    'email',
    'city',
    'status',
    'company',
    'sfera',
    'source_url',
    'origin',
    'forward_status',
    'crm_status',
    'forward_error',
    'forwarded_at',
];

try {
    $pdo = getPdo($config);
    ensureSchema($pdo);

    if ($status !== '') {
        $stmt = $pdo->prepare('SELECT ' . implode(', ', $columns) . ' FROM leads WHERE forward_status = :status ORDER BY created_at DESC LIMIT :limit');
        $stmt->bindValue(':status', $status, PDO::PARAM_STR);
    } else {
        $stmt = $pdo->prepare('SELECT ' . implode(', ', $columns) . ' FROM leads ORDER BY created_at DESC LIMIT :limit');
    }

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $error) {
    error_log('lead_export_failed: ' . $error->getMessage());
    exportFallbackCsv($config);
}

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="apk-forum-leads-' . gmdate('Y-m-d') . '.csv"');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$output = fopen('php://output', 'wb');
fputcsv($output, $columns);
foreach ($rows as $row) {
    $line = [];
    foreach ($columns as $column) {
        $line[] = $row[$column] ?? '';
    }
    fputcsv($output, $line);
}
fclose($output);
exit;

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

function getPdo(array $config): PDO
{
    $dir = (string)$config['storage_dir'];
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

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
            forward_status TEXT NOT NULL DEFAULT 'pending',
            crm_status INTEGER,
            forward_error TEXT,
            forwarded_at TEXT
        )"
    );
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

function exportFallbackCsv(array $config): void
{
    $path = rtrim((string)$config['storage_dir'], '/\\') . '/leads-fallback.csv';
    if (!is_file($path)) {
        jsonResponse(['ok' => false, 'error' => 'export_failed'], 500);
    }

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="apk-forum-leads-fallback-' . gmdate('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
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
