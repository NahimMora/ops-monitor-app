-- AlterTable: two new NotificationEventType values (additive, MySQL ENUM redefinition)
ALTER TABLE `NotificationEvent` MODIFY `type` ENUM('MACHINE_OFFLINE', 'MACHINE_RECOVERED', 'PROJECT_STUCK', 'PROJECT_CRASHED', 'SCHEDULER_DISABLED', 'INCIDENT_CRITICAL', 'SESSION_EXPIRED', 'PROJECT_RECOVERED', 'ALERT_FIRING', 'ALERT_RESOLVED') NOT NULL;

-- CreateTable
CREATE TABLE `AlertRule` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `scope` VARCHAR(191) NOT NULL,
    `projectSlug` VARCHAR(191) NULL,
    `config` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AlertRule_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NOT NULL,
    `projectSlug` VARCHAR(191) NULL,
    `status` ENUM('OK', 'PENDING', 'FIRING', 'ACKNOWLEDGED', 'SILENCED', 'RESOLVED') NOT NULL DEFAULT 'PENDING',
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `value` JSON NULL,
    `firstFiredAt` DATETIME(3) NOT NULL,
    `lastEvaluatedAt` DATETIME(3) NOT NULL,
    `firingAt` DATETIME(3) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `silencedUntil` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Alert_status_idx`(`status`),
    UNIQUE INDEX `Alert_ruleId_projectSlug_key`(`ruleId`, `projectSlug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `AlertRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
