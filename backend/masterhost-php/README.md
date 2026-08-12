# APK forum PHP lead proxy

This is the production PHP endpoint for the APK forum lead form. It hides the Bitrix webhook from the static site, validates requests, stores submitted leads locally, and forwards valid leads to CRM.

## Files

- `lead.php` accepts form POST requests.
- `export.php` exports stored leads as CSV with a bearer token.
- `config.example.php` is the template for hosting secrets.
- `storage/` stores SQLite database and is blocked by `.htaccess`.

## Install on hosting

1. Upload this folder contents to the web root for `api.apk-forum.ru`.
2. Copy `config.example.php` to `config.php`.
3. Put the real Bitrix webhook URL into `bitrix_webhook_url`.
4. Generate a long random `export_token` and put it into `config.php`.
5. Make sure `storage/` is writable by PHP.
6. Open:

```text
https://api.apk-forum.ru/lead.php
```

GET should return `method_not_allowed`. POST from the site should return JSON.

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
