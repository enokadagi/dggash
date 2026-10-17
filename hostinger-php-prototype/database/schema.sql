CREATE TABLE IF NOT EXISTS `hostinger_migration_test_users` (
    `id` CHAR(36) NOT NULL PRIMARY KEY,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(30) NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `lastLoginAt` DATETIME NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deletedAt` DATETIME NULL,
    UNIQUE KEY `uq_hostinger_test_users_email` (`email`),
    UNIQUE KEY `uq_hostinger_test_users_phone` (`phone`),
    INDEX `idx_hostinger_test_users_role_status` (`role`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hostinger_migration_test_user_tokens` (
    `id` CHAR(36) NOT NULL PRIMARY KEY,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `tokenType` VARCHAR(16) NOT NULL,
    `expiresAt` DATETIME NOT NULL,
    `revokedAt` DATETIME NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `lastUsedAt` DATETIME NULL,
    INDEX `idx_hostinger_test_user_tokens_user_type` (`userId`, `tokenType`),
    INDEX `idx_hostinger_test_user_tokens_hash` (`tokenHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hostinger_migration_test_plans` (
    `id` CHAR(36) NOT NULL PRIMARY KEY,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `speed` VARCHAR(80) NOT NULL,
    `durationDays` INT NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `isActive` TINYINT(1) NOT NULL DEFAULT 1,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deletedAt` DATETIME NULL,
    INDEX `idx_hostinger_test_plans_active_price` (`isActive`, `price`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_login_attempts` (
    `scopeType` VARCHAR(16) NOT NULL,
    `scopeKey` VARCHAR(255) NOT NULL,
    `failedCount` INT UNSIGNED NOT NULL DEFAULT 0,
    `windowStartedAt` DATETIME(3) NOT NULL,
    `lastFailedAt` DATETIME(3) NULL,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`scopeType`, `scopeKey`),
    INDEX `idx_awik_login_attempts_locked_until` (`lockedUntil`),
    INDEX `idx_awik_login_attempts_last_failed_at` (`scopeType`, `lastFailedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;