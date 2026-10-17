INSERT IGNORE INTO `hostinger_migration_test_users`
    (`id`, `email`, `phone`, `firstName`, `lastName`, `passwordHash`, `role`, `status`, `lastLoginAt`, `deletedAt`)
VALUES
    ('00000000-0000-4000-8000-000000000101', 'admin@test.local', '+15550000001', 'System', 'Admin', '$2y$10$5n9W5r31Ffr8nI4d.Ipv4u3g0tQxGgJPevFCuN6lWbNwS0vD9iWwa', 'ADMIN', 'ACTIVE', NULL, NULL),
    ('00000000-0000-4000-8000-000000000102', 'staff@test.local', '+15550000002', 'Test', 'Staff', '$2y$10$VavFaYVnWwKXeaJqR8vOquXN3FDvZcQzDawT8WqYVOU0Jk7P7NAO2', 'STAFF', 'ACTIVE', NULL, NULL),
    ('00000000-0000-4000-8000-000000000103', 'inactive@test.local', '+15550000003', 'Inactive', 'User', '$2y$10$6j4IQ0v6rR2B/pM5xc0C2e0zpJjzTawlf0p7muhdUe8f7mF0ENcVm', 'STAFF', 'INACTIVE', NULL, NULL),
    ('00000000-0000-4000-8000-000000000104', 'deleted@test.local', '+15550000004', 'Deleted', 'User', '$2y$10$0M21adV2sE3fS9GmXh0F0u4U2Q0m5oV1NXhT0wZQgvnNk4d8ZJsW2', 'STAFF', 'ACTIVE', NULL, CURRENT_TIMESTAMP);

INSERT IGNORE INTO `hostinger_migration_test_user_tokens`
    (`id`, `userId`, `tokenHash`, `tokenType`, `expiresAt`, `revokedAt`, `createdAt`, `lastUsedAt`)
VALUES
    ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000101', 'synthetic-token-do-not-use', 'access', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NOW(), NOW());

INSERT IGNORE INTO `hostinger_migration_test_plans`
    (`id`, `name`, `description`, `speed`, `durationDays`, `price`, `currency`, `isActive`, `deletedAt`)
VALUES
    ('00000000-0000-4000-8000-000000000001', 'Test plan 10 Mbps', 'Synthetic migration fixture', '10 Mbps', 30, 12.50, 'USD', 1, NULL),
    ('00000000-0000-4000-8000-000000000002', 'Test plan 20 Mbps', 'Synthetic migration fixture', '20 Mbps', 30, 20.00, 'USD', 1, NULL),
    ('00000000-0000-4000-8000-000000000003', 'Inactive test plan', 'Synthetic migration fixture', '5 Mbps', 30, 5.00, 'USD', 0, NULL),
    ('00000000-0000-4000-8000-000000000004', 'Deleted test plan', 'Synthetic migration fixture', '50 Mbps', 30, 40.00, 'USD', 1, CURRENT_TIMESTAMP);