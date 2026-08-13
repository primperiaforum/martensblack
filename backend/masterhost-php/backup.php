<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

if (PHP_SAPI !== 'cli' && !isAuthorized($config)) {
    header('WWW-Authenticate: Bearer');
    jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
}

$result = createBackup($config);

if (PHP_SAPI === 'cli') {
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit($result['ok'] ? 0 : 1);
}

jsonResponse($result, $result['ok'] ? 200 : 500);

function createBackup(array $config): array
{
    $storageDir = ensureStorageDir($config);
    $backupDir = $storageDir . '/backups';
    if (!is_dir($backupDir)) {
        mkdir($backupDir, 0750, true);
    }

    $stamp = gmdate('Ymd-His');
    $created = [];
    $databasePath = $storageDir . '/leads.sqlite';
    if (is_file($databasePath)) {
        $databaseBackup = $backupDir . '/leads-' . $stamp . '.sqlite';
        backupSqlite($config, $databaseBackup);
        $created[] = basename($databaseBackup);
    }

    foreach (['leads-fallback.csv', 'lead-events.log'] as $fileName) {
        $source = $storageDir . '/' . $fileName;
        if (!is_file($source)) {
            continue;
        }

        $target = $backupDir . '/' . pathinfo($fileName, PATHINFO_FILENAME) . '-' . $stamp . '.' . pathinfo($fileName, PATHINFO_EXTENSION);
        copy($source, $target);
        $created[] = basename($target);
    }

    cleanupOldBackups($backupDir, (int)($config['backup_keep_days'] ?? 30));
    appendEventLog($config, 'backup_created', ['files' => $created]);

    return [
        'ok' => true,
        'backup_dir' => $backupDir,
        'files' => $created,
    ];
}

function backupSqlite(array $config, string $target): void
{
    $pdo = getPdo($config);
    ensureSchema($pdo);

    try {
        $pdo->exec('VACUUM main INTO ' . $pdo->quote($target));
        return;
    } catch (Throwable $error) {
        error_log('sqlite_vacuum_backup_failed: ' . $error->getMessage());
    }

    $source = ensureStorageDir($config) . '/leads.sqlite';
    if (!copy($source, $target)) {
        throw new RuntimeException('database_backup_failed');
    }
}

function cleanupOldBackups(string $backupDir, int $keepDays): void
{
    $keepDays = max(1, $keepDays);
    $threshold = time() - ($keepDays * 86400);
    foreach (glob($backupDir . '/*') ?: [] as $path) {
        if (is_file($path) && filemtime($path) < $threshold) {
            unlink($path);
        }
    }
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

function ensureStorageDir(array $config): string
{
    $dir = (string)$config['storage_dir'];
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    return $dir;
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

function jsonResponse(array $payload, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
