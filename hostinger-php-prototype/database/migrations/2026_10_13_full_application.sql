-- Draft MariaDB 10.5 application schema expansion.
-- Requires private/schema/auth-slice.sql to have been applied first.
-- This file has NOT been executed. Review charset/collation, field bounds,
-- defaults, foreign keys, and SQL mode against the approved source contract.
-- IDs and FK columns intentionally inherit the auth baseline's CHAR(36)
-- utf8mb4 collation so InnoDB foreign keys remain type-compatible.

CREATE TABLE IF NOT EXISTS `awik_customers` (
    `id` CHAR(36) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `email` VARCHAR(255) NULL,
    `whatsappNumber` VARCHAR(30) NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `address` TEXT NULL,
    `area` TEXT NULL,
    `city` TEXT NULL,
    `location` TEXT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_awik_customers_phone` (`phone`),
    KEY `idx_awik_customers_status` (`status`),
    KEY `idx_awik_customers_city` (`city`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_subscriptions` (
    `id` CHAR(36) NOT NULL,
    `customerId` CHAR(36) NOT NULL,
    `planId` CHAR(36) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `expiryDate` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `paymentStatus` VARCHAR(32) NOT NULL DEFAULT 'paid',
    `notes` TEXT NULL,
    `lastRenewalDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    KEY `idx_awik_subscriptions_customer` (`customerId`),
    KEY `idx_awik_subscriptions_status` (`status`),
    KEY `idx_awik_subscriptions_expiry` (`expiryDate`),
    CONSTRAINT `fk_awik_subscriptions_customer` FOREIGN KEY (`customerId`) REFERENCES `awik_customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_awik_subscriptions_plan` FOREIGN KEY (`planId`) REFERENCES `awik_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_subscription_renewals` (
    `id` CHAR(36) NOT NULL,
    `subscriptionId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `previousPlanId` CHAR(36) NOT NULL,
    `newPlanId` CHAR(36) NOT NULL,
    `previousExpiryDate` DATETIME(3) NOT NULL,
    `newExpiryDate` DATETIME(3) NOT NULL,
    `durationDays` INT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_awik_subscription_renewals_subscription` (`subscriptionId`),
    KEY `idx_awik_subscription_renewals_created` (`createdAt`),
    CONSTRAINT `fk_awik_subscription_renewals_subscription` FOREIGN KEY (`subscriptionId`) REFERENCES `awik_subscriptions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_whatsapp_reminders` (
    `id` CHAR(36) NOT NULL,
    `subscriptionId` CHAR(36) NOT NULL,
    `customerId` CHAR(36) NOT NULL,
    `reminderType` ENUM('DAYS_5', 'DAYS_3', 'DAYS_1', 'EXPIRY_DAY') NOT NULL,
    `scheduledFor` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_awik_whatsapp_reminders_subscription_type` (`subscriptionId`, `reminderType`),
    KEY `idx_awik_whatsapp_reminders_customer` (`customerId`),
    KEY `idx_awik_whatsapp_reminders_status` (`status`),
    KEY `idx_awik_whatsapp_reminders_scheduled` (`scheduledFor`),
    CONSTRAINT `fk_awik_whatsapp_reminders_subscription` FOREIGN KEY (`subscriptionId`) REFERENCES `awik_subscriptions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_awik_whatsapp_reminders_customer` FOREIGN KEY (`customerId`) REFERENCES `awik_customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_whatsapp_messages` (
    `id` CHAR(36) NOT NULL,
    `recipientPhone` VARCHAR(30) NOT NULL,
    `customerId` CHAR(36) NULL,
    `messageBody` LONGTEXT NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `externalMessageId` VARCHAR(255) NULL,
    `errorMessage` TEXT NULL,
    `retryCount` INT NOT NULL DEFAULT 0,
    `sentAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `scheduledFor` DATETIME(3) NULL,
    `referenceId` VARCHAR(191) NULL,
    `templateType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_awik_whatsapp_messages_recipient` (`recipientPhone`),
    KEY `idx_awik_whatsapp_messages_status` (`status`),
    KEY `idx_awik_whatsapp_messages_sent` (`sentAt`),
    CONSTRAINT `fk_awik_whatsapp_messages_customer` FOREIGN KEY (`customerId`) REFERENCES `awik_customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_inventory_categories` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_awik_inventory_categories_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_products` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `sku` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `barcode` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `categoryId` CHAR(36) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` TEXT NULL,
    `purchasePrice` DECIMAL(65,30) NOT NULL,
    `sellingPrice` DECIMAL(65,30) NOT NULL,
    `currency` VARCHAR(16) NOT NULL DEFAULT 'USD',
    `currentStock` INT NOT NULL DEFAULT 0,
    `minStock` INT NOT NULL DEFAULT 0,
    `unit` VARCHAR(80) NOT NULL DEFAULT 'piece',
    `isActive` TINYINT(1) NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_awik_products_sku` (`sku`),
    UNIQUE KEY `uq_awik_products_barcode` (`barcode`),
    KEY `idx_awik_products_category` (`categoryId`),
    KEY `idx_awik_products_active` (`isActive`),
    CONSTRAINT `chk_awik_products_stock_nonnegative` CHECK (`currentStock` >= 0),
    CONSTRAINT `fk_awik_products_category` FOREIGN KEY (`categoryId`) REFERENCES `awik_inventory_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_stock_movements` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `movementType` ENUM('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'LOST', 'CORRECTION') NOT NULL,
    `quantity` INT NOT NULL,
    `previousStock` INT NOT NULL,
    `newStock` INT NOT NULL,
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_awik_stock_movements_product` (`productId`),
    KEY `idx_awik_stock_movements_type` (`movementType`),
    KEY `idx_awik_stock_movements_created` (`createdAt`),
    CONSTRAINT `fk_awik_stock_movements_product` FOREIGN KEY (`productId`) REFERENCES `awik_products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_awik_stock_movements_user` FOREIGN KEY (`userId`) REFERENCES `awik_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_sales` (
    `id` CHAR(36) NOT NULL,
    `saleNumber` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `customerId` CHAR(36) NULL,
    `userId` CHAR(36) NULL,
    `totalAmount` DECIMAL(65,30) NOT NULL,
    `currency` VARCHAR(16) NOT NULL DEFAULT 'USD',
    `paymentMethod` VARCHAR(64) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_awik_sales_number` (`saleNumber`),
    KEY `idx_awik_sales_customer` (`customerId`),
    KEY `idx_awik_sales_created` (`createdAt`),
    CONSTRAINT `fk_awik_sales_customer` FOREIGN KEY (`customerId`) REFERENCES `awik_customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_awik_sales_user` FOREIGN KEY (`userId`) REFERENCES `awik_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `awik_sale_items` (
    `id` CHAR(36) NOT NULL,
    `saleId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `quantity` INT NOT NULL,
    `unitPrice` DECIMAL(65,30) NOT NULL,
    `totalPrice` DECIMAL(65,30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_awik_sale_items_sale` (`saleId`),
    KEY `idx_awik_sale_items_product` (`productId`),
    CONSTRAINT `chk_awik_sale_items_quantity_positive` CHECK (`quantity` > 0),
    CONSTRAINT `fk_awik_sale_items_sale` FOREIGN KEY (`saleId`) REFERENCES `awik_sales` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_awik_sale_items_product` FOREIGN KEY (`productId`) REFERENCES `awik_products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
