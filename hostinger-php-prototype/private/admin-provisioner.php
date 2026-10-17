<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function awikValidateInitialAdminInput(array $input): array
{
    $allowed = ['email', 'phone', 'firstName', 'lastName', 'password'];
    foreach (array_keys($input) as $field) {
        if (!in_array($field, $allowed, true)) {
            throw new RuntimeException('Initial administrator input contains an unsupported field');
        }
    }

    $phone = trim((string) ($input['phone'] ?? ''));
    $firstName = trim((string) ($input['firstName'] ?? ''));
    $lastName = trim((string) ($input['lastName'] ?? ''));
    $email = trim((string) ($input['email'] ?? ''));
    $password = $input['password'] ?? null;

    if ($phone === '' || mb_strlen($phone) > 30) {
        throw new RuntimeException('Initial administrator phone is invalid');
    }
    if ($firstName === '' || mb_strlen($firstName) > 100 || $lastName === '' || mb_strlen($lastName) > 100) {
        throw new RuntimeException('Initial administrator name is invalid');
    }
    if ($email !== '' && (mb_strlen($email) > 255 || filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
        throw new RuntimeException('Initial administrator email is invalid');
    }
    if (!is_string($password) || mb_strlen($password) < 12 || strlen($password) > 72) {
        throw new RuntimeException('Initial administrator password must be 12 or more characters and at most 72 bytes');
    }

    return [
        'phone' => $phone,
        'email' => $email === '' ? null : $email,
        'firstName' => $firstName,
        'lastName' => $lastName,
        'password' => $password,
    ];
}

function awikProvisionInitialAdmin(PDO $db, array $input): string
{
    $normalized = awikValidateInitialAdminInput($input);
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql') {
        throw new RuntimeException('Initial administrator provisioning requires MariaDB');
    }

    $lockName = 'awik:initial-admin:v1';
    $lock = $db->prepare('SELECT GET_LOCK(?, 10)');
    $lock->execute([$lockName]);
    if ((int) $lock->fetchColumn() !== 1) {
        throw new RuntimeException('Could not obtain initial administrator provisioning lock');
    }

    try {
        $db->beginTransaction();
        if ((int) $db->query('SELECT COUNT(*) FROM awik_users')->fetchColumn() !== 0) {
            throw new RuntimeException('Initial administrator can only be provisioned in an empty users table');
        }

        $userId = awikUuidV4();
        $statement = $db->prepare(
            'INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $userId,
            $normalized['email'],
            $normalized['phone'],
            $normalized['firstName'],
            $normalized['lastName'],
            password_hash($normalized['password'], PASSWORD_BCRYPT, ['cost' => 12]),
            'ADMIN',
            'ACTIVE',
        ]);
        $db->commit();

        return $userId;
    } catch (Throwable $exception) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $exception;
    } finally {
        $release = $db->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
        if ((int) $release->fetchColumn() !== 1) {
            throw new RuntimeException('Initial administrator provisioning lock was not released');
        }
    }
}
