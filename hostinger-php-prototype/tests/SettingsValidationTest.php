<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

function awikSettingsTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikSettingsTestExpectStatus(callable $callback, int $status, string $message): AwikApiException
{
    try {
        $callback();
    } catch (AwikApiException $exception) {
        awikSettingsTestAssert($exception->statusCode === $status, $message . ': wrong status');
        return $exception;
    }

    awikSettingsTestAssert(false, $message . ': expected exception');
    throw new RuntimeException('Unreachable');
}

awikRequireSettingsRole(['role' => 'ADMIN'], 'GET');
awikRequireSettingsRole(['role' => 'STAFF'], 'GET');
awikRequireSettingsRole(['role' => 'ADMIN'], 'PATCH');
awikSettingsTestExpectStatus(
    static fn () => awikRequireSettingsRole(['role' => 'STAFF'], 'PATCH'),
    403,
    'STAFF settings write'
);
awikSettingsTestExpectStatus(
    static fn () => awikRequireSettingsRole(['role' => 'UNKNOWN'], 'GET'),
    403,
    'unknown role settings read'
);

$stringValue = awikValidateSettingUpdateBody(['value' => 'plain text']);
awikSettingsTestAssert($stringValue['value'] === 'plain text', 'string value must remain unchanged');
awikSettingsTestAssert($stringValue['descriptionProvided'] === false, 'missing description must be distinguishable');

awikSettingsTestAssert(awikValidateSettingUpdateBody(['value' => false])['value'] === 'false', 'boolean serialization mismatch');
awikSettingsTestAssert(awikValidateSettingUpdateBody(['value' => 0])['value'] === '0', 'number serialization mismatch');
awikSettingsTestAssert(
    awikValidateSettingUpdateBody(['value' => ['enabled' => true]])['value'] === '{"enabled":true}',
    'object serialization mismatch'
);
awikSettingsTestAssert(
    awikValidateSettingUpdateBody(['value' => (object) []])['value'] === '{}',
    'empty object serialization mismatch'
);
awikSettingsTestAssert(
    awikValidateSettingUpdateBody(['value' => [1, 2]])['value'] === '[1,2]',
    'array serialization mismatch'
);
$decodedEmptyObject = awikDecodeJsonBody('{"value":{}}');
awikSettingsTestAssert(
    awikValidateSettingUpdateBody($decodedEmptyObject)['value'] === '{}',
    'HTTP JSON decoding must preserve empty objects'
);
$decodedEmptyArray = awikDecodeJsonBody('{"value":[]}');
awikSettingsTestAssert(
    awikValidateSettingUpdateBody($decodedEmptyArray)['value'] === '[]',
    'HTTP JSON decoding must preserve empty arrays'
);
$nullableDescription = awikValidateSettingUpdateBody([
    'value' => 'value',
    'category' => 'accepted-but-ignored',
    'description' => null,
]);
awikSettingsTestAssert($nullableDescription['descriptionProvided'] === true, 'present null description must be preserved as an update');
awikSettingsTestAssert($nullableDescription['description'] === null, 'null description mismatch');

foreach ([[], ['value' => null], ['value' => '']] as $invalidBody) {
    awikSettingsTestExpectStatus(
        static fn () => awikValidateSettingUpdateBody($invalidBody),
        400,
        'empty setting value'
    );
}
$unknownField = awikSettingsTestExpectStatus(
    static fn () => awikValidateSettingUpdateBody(['value' => 'x', 'unexpected' => true]),
    400,
    'unknown setting field'
);
awikSettingsTestAssert(
    in_array('property unexpected should not exist', $unknownField->errors, true),
    'unknown-field validation message mismatch'
);
awikSettingsTestExpectStatus(
    static fn () => awikValidateSettingUpdateBody(['value' => 'x', 'category' => 7]),
    400,
    'invalid setting category'
);
awikSettingsTestExpectStatus(
    static fn () => awikValidateSettingUpdateBody(['value' => 'x', 'description' => 7]),
    400,
    'invalid setting description'
);

$setting = awikNormalizeCompanySetting([
    'id' => '00000000-0000-4000-8000-000000000001',
    'key' => 'company.name',
    'value' => 'AWIK NET',
    'description' => null,
    'createdAt' => '2026-10-12 12:00:00.123',
    'updatedAt' => '2026-10-12 12:30:00.456',
]);
awikSettingsTestAssert(array_keys($setting) === ['id', 'key', 'value', 'description', 'createdAt', 'updatedAt'], 'settings response field projection mismatch');
awikSettingsTestAssert($setting['createdAt'] === '2026-10-12T12:00:00.123Z', 'createdAt UTC serialization mismatch');
awikSettingsTestAssert($setting['updatedAt'] === '2026-10-12T12:30:00.456Z', 'updatedAt UTC serialization mismatch');

echo "AWIK settings validation tests passed\n";
