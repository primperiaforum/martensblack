<?php

return [
    'allowed_origins' => [
        'https://apk-forum.ru',
        'https://www.apk-forum.ru',
        'https://primperiaforum.github.io',
    ],

    // Copy this file to config.php on the hosting and paste real values there.
    'bitrix_webhook_url' => 'https://example.invalid/bitrix_hooks/add_deal/',
    'export_token' => 'change-me',
    'alert_email' => '',

    'storage_dir' => __DIR__ . '/storage',
    'min_submit_ms' => 2500,
    'max_body_bytes' => 16000,
    'bitrix_timeout_seconds' => 8,
    'retry_max_attempts' => 6,
    'retry_batch_limit' => 20,
    'retry_delays_seconds' => [60, 300, 900, 3600, 10800, 21600],
    'backup_keep_days' => 30,

    'bitrix_fields' => [
        'title' => 'ф-б-АПМ-26-09-эц-апк-оф',
        'id_category' => '27',
        'formid' => '111',
    ],
];
