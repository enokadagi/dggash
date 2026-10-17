-- Add CompanySetting storage for the PHP prototype.
-- MariaDB 10.5-compatible additive DDL. Not executed by this change.
-- Existing values are preserved; default-setting seeding is a separate CLI step.
-- Legacy upgrade helper for installations that applied auth-slice.sql before
-- company settings were added. The current clean-install baseline already has
-- this table; do not apply this file as part of the clean-install chain.

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
