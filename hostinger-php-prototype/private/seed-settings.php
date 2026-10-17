<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/bootstrap.php';

$defaults = [
    ['company.name', 'AWIK NET', 'Company display name'],
    ['company.tagline', 'INTERNET SERVICE PROVIDER', 'Company tagline'],
    ['company.phone', '', 'Company phone number'],
    ['company.whatsapp', '', 'Company WhatsApp phone number for sending messages'],
    ['company.email', '', 'Company email'],
    ['company.website', '', 'Company website'],
    ['company.taxId', '', 'Tax/VAT ID'],
    ['company.logo', '', 'Company logo URL'],
    ['company.address', '', 'Company address'],
    ['company.currency', 'USD', 'Default currency'],
    ['company.timezone', 'Asia/Beirut', 'Business timezone'],
    ['whatsapp.reminder_5d_template', "Hello {{customer_name}},\n\nYour AWIK NET internet plan will expire in {{days_remaining}} days on {{expiry_date}}.\n\nPlease visit AWIK NET or contact us to recharge/renew your internet service.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} â€” INTERNET SERVICE PROVIDER", '5-day expiry reminder message'],
    ['whatsapp.reminder_3d_template', "Hello {{customer_name}},\n\nYour AWIK NET internet plan will expire in {{days_remaining}} days on {{expiry_date}}.\n\nPlease visit AWIK NET or contact us to recharge/renew your internet service.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} â€” INTERNET SERVICE PROVIDER", '3-day expiry reminder message'],
    ['whatsapp.reminder_1d_template', "Hello {{customer_name}},\n\nYour AWIK NET internet plan expires TOMORROW on {{expiry_date}}.\n\nPlease visit AWIK NET or contact us to recharge/renew your internet service.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} â€” INTERNET SERVICE PROVIDER", '1-day expiry reminder message'],
    ['whatsapp.reminder_expiry_template', "Hello {{customer_name}},\n\nYour AWIK NET internet plan expired today ({{expiry_date}}).\n\nTo restore your internet service, please visit AWIK NET or contact us to renew.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} â€” INTERNET SERVICE PROVIDER", 'Expiry-day message'],
    ['whatsapp.renewal_confirmation_template', "Hello {{customer_name}},\n\nYour AWIK NET internet plan has been renewed.\n\nPlan: {{plan_name}}\nNew expiry date: {{expiry_date}}\n\nThank you,\n{{company_name}} â€” INTERNET SERVICE PROVIDER", 'Renewal confirmation message'],
    ['reminder.offset_5d', '5', 'Days before expiry for 5-day reminder'],
    ['reminder.offset_3d', '3', 'Days before expiry for 3-day reminder'],
    ['reminder.offset_1d', '1', 'Days before expiry for 1-day reminder'],
    ['reminder.enabled_5d', 'true', 'Send 5-day reminder'],
    ['reminder.enabled_3d', 'true', 'Send 3-day reminder'],
    ['reminder.enabled_1d', 'true', 'Send 1-day reminder'],
    ['reminder.enabled_expiry', 'true', 'Send expiry-day message'],
    ['inventory.default_min_stock', '5', 'Default minimum stock for new products'],
    ['sales.require_customer', 'false', 'Whether customer is required on sales'],
];

$db = null;
try {
    $db = awikDatabase();
    $insert = $db->prepare(
        'INSERT INTO awik_company_settings (id, `key`, `value`, description) VALUES (?, ?, ?, ?) '
        . 'ON DUPLICATE KEY UPDATE `key` = VALUES(`key`)'
    );
    $db->beginTransaction();
    foreach ($defaults as [$key, $value, $description]) {
        $insert->execute([awikUuidV4(), $key, $value, $description]);
    }
    $db->commit();
    fwrite(STDOUT, 'Company setting defaults inserted where missing; existing values were preserved.' . PHP_EOL);
} catch (Throwable) {
    if ($db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'Company setting seeding failed; no values or database details were emitted.' . PHP_EOL);
    exit(1);
}
