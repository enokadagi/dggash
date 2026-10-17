-- Password recovery tokens store only SHA-256 token hashes.
-- Rate-limit keys are hashes of normalized email and client IP values.

CREATE TABLE IF NOT EXISTS `awik_password_recovery_tokens` (
    `tokenHash` CHAR(64) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`tokenHash`),
    KEY `idx_awik_password_recovery_user_expiry` (`userId`, `expiresAt`),
    KEY `idx_awik_password_recovery_expiry` (`expiresAt`),
    CONSTRAINT `fk_awik_password_recovery_user` FOREIGN KEY (`userId`) REFERENCES `awik_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_password_recovery_limits` (
    `scopeType` VARCHAR(8) NOT NULL,
    `scopeHash` CHAR(64) NOT NULL,
    `requestCount` INT UNSIGNED NOT NULL DEFAULT 0,
    `windowStartedAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`scopeType`, `scopeHash`),
    KEY `idx_awik_password_recovery_limits_window` (`windowStartedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
