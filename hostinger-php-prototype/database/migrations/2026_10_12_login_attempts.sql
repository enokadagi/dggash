-- Migration: add persistent login-attempt tracking for account/IP throttling.
-- This table is intentionally keyed by scope type and scope key so the same guard can
-- enforce both per-account and per-IP rate limits without exposing sensitive details.

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
