CREATE TABLE IF NOT EXISTS `awik_users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(30) NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'STAFF') NOT NULL DEFAULT 'STAFF',
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_awik_users_email` (`email`),
    UNIQUE KEY `uq_awik_users_phone` (`phone`),
    KEY `idx_awik_users_role_status` (`role`, `status`),
    KEY `idx_awik_users_deleted_status` (`deletedAt`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_user_tokens` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `tokenType` ENUM('access', 'refresh') NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    KEY `idx_awik_user_tokens_user_type` (`userId`, `tokenType`),
    KEY `idx_awik_user_tokens_expires` (`expiresAt`),
    UNIQUE KEY `uq_awik_user_tokens_hash` (`tokenHash`),
    CONSTRAINT `fk_awik_user_tokens_user` FOREIGN KEY (`userId`) REFERENCES `awik_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_plans` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `description` TEXT NULL,
    `speed` TEXT NOT NULL,
    `durationDays` INT NOT NULL,
    `price` DECIMAL(65,30) NOT NULL,
    `currency` TEXT NOT NULL,
    `isActive` TINYINT(1) NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    KEY `idx_awik_plans_active_price` (`isActive`, `price`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_company_settings` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `value` LONGTEXT NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_awik_company_settings_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_audit_logs` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity` VARCHAR(80) NOT NULL,
    `entityId` CHAR(36) NULL,
    `oldValues` LONGTEXT NULL,
    `newValues` LONGTEXT NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_awik_audit_logs_user` (`userId`),
    KEY `idx_awik_audit_logs_action` (`action`),
    KEY `idx_awik_audit_logs_entity` (`entity`),
    KEY `idx_awik_audit_logs_created` (`createdAt`),
    CONSTRAINT `fk_awik_audit_logs_user` FOREIGN KEY (`userId`) REFERENCES `awik_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
