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

    'storage_dir' => __DIR__ . '/storage',
    'min_submit_ms' => 2500,
    'max_body_bytes' => 16000,
    'bitrix_timeout_seconds' => 8,

    'bitrix_fields' => [
        'title' => 'f-b-APM-26-09-ec-apk-of',
        'id_category' => '27',
        'formid' => '111',
    ],
];
