-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `totpSecret` VARCHAR(191) NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Machine` (
    `id` VARCHAR(191) NOT NULL,
    `hostname` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `agentVersion` VARCHAR(191) NULL,
    `osVersion` VARCHAR(191) NULL,
    `lastHeartbeatAt` DATETIME(3) NULL,
    `lastSeenOnlineAt` DATETIME(3) NULL,
    `lastOfflineAt` DATETIME(3) NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `bootTimeAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Machine_hostname_key`(`hostname`),
    UNIQUE INDEX `Machine_agentId_key`(`agentId`),
    INDEX `Machine_isOnline_idx`(`isOnline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MachineHealthSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `machineId` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cpuPercent` DOUBLE NULL,
    `ramTotalMb` INTEGER NULL,
    `ramUsedMb` INTEGER NULL,
    `diskTotalMb` INTEGER NULL,
    `diskUsedMb` INTEGER NULL,
    `uptimeSeconds` INTEGER NULL,
    `chromeProcessCount` INTEGER NULL,
    `chromeMemoryMb` INTEGER NULL,
    `raw` JSON NULL,

    INDEX `MachineHealthSnapshot_machineId_capturedAt_idx`(`machineId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `machineId` VARCHAR(191) NOT NULL,
    `adapterKey` VARCHAR(191) NOT NULL,
    `supportsCommands` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `status` ENUM('HEALTHY', 'RUNNING', 'IDLE', 'DEGRADED', 'STUCK', 'FAILED', 'STOPPED', 'OFFLINE', 'UNREACHABLE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `statusReason` VARCHAR(191) NULL,
    `statusUpdatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Project_slug_key`(`slug`),
    INDEX `Project_machineId_idx`(`machineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectHealthSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('HEALTHY', 'RUNNING', 'IDLE', 'DEGRADED', 'STUCK', 'FAILED', 'STOPPED', 'OFFLINE', 'UNREACHABLE', 'UNKNOWN') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `heartbeatAgeSeconds` DOUBLE NULL,
    `raw` JSON NULL,

    INDEX `ProjectHealthSnapshot_projectId_capturedAt_idx`(`projectId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Run` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `externalRunId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `durationSeconds` INTEGER NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'NO_WORK', 'DEGRADED', 'FAILED', 'BLOCKED', 'PARTIAL', 'CANCELLED', 'UNKNOWN') NOT NULL DEFAULT 'RUNNING',
    `trigger` VARCHAR(191) NULL,
    `itemsTotal` INTEGER NULL,
    `itemsSuccess` INTEGER NULL,
    `itemsFailed` INTEGER NULL,
    `successRate` DOUBLE NULL,
    `currentStage` VARCHAR(191) NULL,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `warningCount` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Run_projectId_startedAt_idx`(`projectId`, `startedAt`),
    INDEX `Run_projectId_status_idx`(`projectId`, `status`),
    UNIQUE INDEX `Run_projectId_externalRunId_key`(`projectId`, `externalRunId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RunStage` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `durationSeconds` INTEGER NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'NO_WORK', 'DEGRADED', 'FAILED', 'BLOCKED', 'PARTIAL', 'CANCELLED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `itemsTotal` INTEGER NULL,
    `itemsSuccess` INTEGER NULL,
    `itemsFailed` INTEGER NULL,
    `errorSummary` VARCHAR(191) NULL,
    `channel` VARCHAR(191) NULL,
    `metadata` JSON NULL,

    INDEX `RunStage_runId_idx`(`runId`),
    INDEX `RunStage_runId_channel_idx`(`runId`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Incident` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'WARNING',
    `status` ENUM('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'ACTIVE',
    `firstSeenAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `occurrenceCount` INTEGER NOT NULL DEFAULT 1,
    `affectedRunCount` INTEGER NOT NULL DEFAULT 1,
    `channel` VARCHAR(191) NULL,
    `recoveredAt` DATETIME(3) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Incident_projectId_status_idx`(`projectId`, `status`),
    UNIQUE INDEX `Incident_projectId_fingerprint_key`(`projectId`, `fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncidentOccurrence` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `message` TEXT NOT NULL,
    `metadata` JSON NULL,

    INDEX `IncidentOccurrence_incidentId_occurredAt_idx`(`incidentId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LogEvent` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `level` ENUM('DEBUG', 'INFO', 'WARNING', 'ERROR') NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LogEvent_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
    INDEX `LogEvent_projectId_level_occurredAt_idx`(`projectId`, `level`, `occurredAt`),
    INDEX `LogEvent_dedupeKey_idx`(`dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyMetric` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `runCount` INTEGER NOT NULL DEFAULT 0,
    `runSuccessCount` INTEGER NOT NULL DEFAULT 0,
    `runFailedCount` INTEGER NOT NULL DEFAULT 0,
    `runDegradedCount` INTEGER NOT NULL DEFAULT 0,
    `itemsTotal` INTEGER NOT NULL DEFAULT 0,
    `itemsSuccess` INTEGER NOT NULL DEFAULT 0,
    `incidentCount` INTEGER NOT NULL DEFAULT 0,
    `availabilitySeconds` INTEGER NULL,
    `channelStats` JSON NULL,

    INDEX `DailyMetric_projectId_date_idx`(`projectId`, `date`),
    UNIQUE INDEX `DailyMetric_projectId_date_key`(`projectId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiBrief` (
    `id` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `windowEnd` DATETIME(3) NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `overallStatus` VARCHAR(191) NOT NULL,
    `executiveSummary` TEXT NOT NULL,
    `payload` JSON NOT NULL,
    `promptFingerprint` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `AiBrief_windowStart_windowEnd_key`(`windowStart`, `windowEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `target` ENUM('INCIDENT', 'RUN') NOT NULL,
    `incidentId` VARCHAR(191) NULL,
    `runId` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `requestedBy` VARCHAR(191) NOT NULL DEFAULT 'admin',
    `model` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `cacheKey` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `AiAnalysis_cacheKey_key`(`cacheKey`),
    INDEX `AiAnalysis_incidentId_idx`(`incidentId`),
    INDEX `AiAnalysis_runId_idx`(`runId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentCommand` (
    `id` VARCHAR(191) NOT NULL,
    `machineId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `type` ENUM('START', 'STOP', 'RESTART', 'RUN_NOW', 'PAUSE_SCHEDULE', 'RESUME_SCHEDULE') NOT NULL,
    `status` ENUM('PENDING', 'PICKED_UP', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `requestedBy` VARCHAR(191) NOT NULL DEFAULT 'admin',
    `pickedUpAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `result` JSON NULL,
    `exitCode` INTEGER NULL,
    `error` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `AgentCommand_idempotencyKey_key`(`idempotencyKey`),
    INDEX `AgentCommand_machineId_status_idx`(`machineId`, `status`),
    INDEX `AgentCommand_projectId_requestedAt_idx`(`projectId`, `requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor` VARCHAR(191) NOT NULL DEFAULT 'admin',
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NULL,
    `targetId` VARCHAR(191) NULL,
    `metadata` JSON NULL,

    INDEX `AuditEvent_occurredAt_idx`(`occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(768) NOT NULL,
    `p256dh` VARCHAR(191) NOT NULL,
    `auth` VARCHAR(191) NOT NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('MACHINE_OFFLINE', 'MACHINE_RECOVERED', 'PROJECT_STUCK', 'PROJECT_CRASHED', 'SCHEDULER_DISABLED', 'INCIDENT_CRITICAL', 'SESSION_EXPIRED', 'PROJECT_RECOVERED') NOT NULL,
    `incidentId` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payload` JSON NULL,

    UNIQUE INDEX `NotificationEvent_dedupeKey_key`(`dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SessionHealth` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `sessionType` VARCHAR(191) NOT NULL,
    `status` ENUM('AUTHENTICATED', 'EXPIRED', 'CHALLENGE', 'BROWSER_ERROR', 'UNKNOWN') NOT NULL,
    `checkedAt` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NULL,

    INDEX `SessionHealth_projectId_sessionType_checkedAt_idx`(`projectId`, `sessionType`, `checkedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchedulerState` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `taskName` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastRunResult` VARCHAR(191) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SchedulerState_projectId_taskName_key`(`projectId`, `taskName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MachineHealthSnapshot` ADD CONSTRAINT `MachineHealthSnapshot_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `Machine`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `Machine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectHealthSnapshot` ADD CONSTRAINT `ProjectHealthSnapshot_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Run` ADD CONSTRAINT `Run_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RunStage` ADD CONSTRAINT `RunStage_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `Run`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Incident` ADD CONSTRAINT `Incident_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentOccurrence` ADD CONSTRAINT `IncidentOccurrence_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `Incident`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentOccurrence` ADD CONSTRAINT `IncidentOccurrence_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `Run`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogEvent` ADD CONSTRAINT `LogEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogEvent` ADD CONSTRAINT `LogEvent_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `Run`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyMetric` ADD CONSTRAINT `DailyMetric_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiAnalysis` ADD CONSTRAINT `AiAnalysis_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `Incident`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiAnalysis` ADD CONSTRAINT `AiAnalysis_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `Run`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentCommand` ADD CONSTRAINT `AgentCommand_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `Machine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentCommand` ADD CONSTRAINT `AgentCommand_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationEvent` ADD CONSTRAINT `NotificationEvent_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `Incident`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionHealth` ADD CONSTRAINT `SessionHealth_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchedulerState` ADD CONSTRAINT `SchedulerState_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

