# APK forum PHP lead proxy

This is the production PHP endpoint for the APK forum lead form. It hides the Bitrix webhook from the static site, validates requests, stores submitted leads locally, and forwards valid leads to CRM.

## Files

- `lead.php` accepts form POST requests.
- `export.php` exports stored leads as CSV with a bearer token.
- `retry.php` retries leads that were saved locally but not delivered to CRM.
- `backup.php` creates local backups of the SQLite database and lead logs.
- `config.example.php` is the template for hosting secrets.
- `storage/` stores SQLite database and is blocked by `.htaccess`.

## Install on hosting

1. Upload this folder contents to the web root for `api.apk-forum.ru`.
2. Copy `config.example.php` to `config.php`.
3. Put the real Bitrix webhook URL into `bitrix_webhook_url`.
4. Generate a long random `export_token` and put it into `config.php`.
5. Optionally put an email into `alert_email` for delivery failure alerts.
6. Make sure `storage/` is writable by PHP.
7. Open:

```text
https://api.apk-forum.ru/lead.php
```

GET should return `method_not_allowed`. POST from the site should return JSON.

## Reliability

Every valid lead is saved to local SQLite before CRM forwarding.

Statuses:

- `pending` - saved and waiting for forwarding.
- `forwarded` - delivered to CRM.
- `queued` - CRM delivery failed, lead is saved for retry.
- `failed` - retry limit reached or forwarding cannot be configured.

The endpoint writes JSONL logs into `storage/`:

- `lead-events.log` for normal save/forward/retry events.
- `lead-alerts.log` for CRM forwarding failures.

## Retry queue

Run from cron every minute:

```cron
* * * * * www-data php /var/www/api.apk-forum.ru/retry.php --limit=20 >> /var/www/api.apk-forum.ru/storage/retry-cron.log 2>&1
```

Retry behavior is configured in `config.php`:

```php
'retry_max_attempts' => 6,
'retry_batch_limit' => 20,
'retry_delays_seconds' => [60, 300, 900, 3600, 10800, 21600],
```

## Backups

Run from cron daily:

```cron
15 3 * * * www-data php /var/www/api.apk-forum.ru/backup.php >> /var/www/api.apk-forum.ru/storage/backup-cron.log 2>&1
```

Backups are stored in `storage/backups/`. Old backups are removed after `backup_keep_days`.

## Frontend action

The production form action in `index.html` should point to:

```html
action="https://api.apk-forum.ru/lead.php"
```

## Export

Use PowerShell:

```powershell
$token = "PASTE_EXPORT_TOKEN"
curl.exe -H "Authorization: Bearer $token" "https://api.apk-forum.ru/export.php" -o leads.csv
```

You can export only queued or failed leads:

```powershell
curl.exe -H "Authorization: Bearer $token" "https://api.apk-forum.ru/export.php?status=queued" -o queued.csv
curl.exe -H "Authorization: Bearer $token" "https://api.apk-forum.ru/export.php?status=failed" -o failed.csv
```
