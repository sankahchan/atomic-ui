-- AlterTable
ALTER TABLE "DynamicKeyTemplate" ADD COLUMN "maxDevices" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DynamicAccessKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SELF_MANAGED',
    "email" TEXT,
    "telegramId" TEXT,
    "notes" TEXT,
    "userId" TEXT,
    "serverTagsJson" TEXT NOT NULL DEFAULT '[]',
    "dataLimitBytes" BIGINT,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "bandwidthAlertAt80" BOOLEAN NOT NULL DEFAULT false,
    "bandwidthAlertAt90" BOOLEAN NOT NULL DEFAULT false,
    "quotaAlertThresholds" TEXT NOT NULL DEFAULT '80,90',
    "quotaAlertsSent" TEXT NOT NULL DEFAULT '[]',
    "autoDisableOnLimit" BOOLEAN NOT NULL DEFAULT true,
    "dataLimitResetStrategy" TEXT NOT NULL DEFAULT 'NEVER',
    "lastDataLimitReset" DATETIME,
    "usageOffset" BIGINT NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "durationDays" INTEGER,
    "expirationType" TEXT NOT NULL DEFAULT 'NEVER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "firstUsedAt" DATETIME,
    "lastTrafficAt" DATETIME,
    "estimatedDevices" INTEGER NOT NULL DEFAULT 0,
    "peakDevices" INTEGER NOT NULL DEFAULT 0,
    "maxDevices" INTEGER,
    "deviceLimitExceededAt" DATETIME,
    "deviceLimitWarningSentAt" DATETIME,
    "deviceLimitLastObservedDevices" INTEGER,
    "deviceLimitSuppressedUntil" DATETIME,
    "deviceLimitAutoDisabledAt" DATETIME,
    "lastWarningSentAt" DATETIME,
    "expirationWarningStage" TEXT,
    "dynamicUrl" TEXT,
    "publicSlug" TEXT,
    "prefix" TEXT,
    "method" TEXT NOT NULL DEFAULT 'chacha20-ietf-poly1305',
    "owner" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "loadBalancerAlgorithm" TEXT NOT NULL DEFAULT 'IP_HASH',
    "preferredServerIdsJson" TEXT NOT NULL DEFAULT '[]',
    "preferredCountryCodesJson" TEXT NOT NULL DEFAULT '[]',
    "preferredServerWeightsJson" TEXT NOT NULL DEFAULT '{}',
    "preferredCountryWeightsJson" TEXT NOT NULL DEFAULT '{}',
    "preferredRegionMode" TEXT NOT NULL DEFAULT 'PREFER',
    "sessionStickinessMode" TEXT NOT NULL DEFAULT 'DRAIN',
    "drainGraceMinutes" INTEGER NOT NULL DEFAULT 20,
    "lastSelectedKeyIndex" INTEGER NOT NULL DEFAULT 0,
    "lastResolvedAccessKeyId" TEXT,
    "lastResolvedServerId" TEXT,
    "lastResolvedAt" DATETIME,
    "pinnedAccessKeyId" TEXT,
    "pinnedServerId" TEXT,
    "pinnedAt" DATETIME,
    "pinExpiresAt" DATETIME,
    "subscriptionTheme" TEXT,
    "coverImageType" TEXT,
    "coverImage" TEXT,
    "contactLinks" TEXT,
    "subscriptionWelcomeMessage" TEXT,
    "sharePageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationInterval" TEXT NOT NULL DEFAULT 'NEVER',
    "rotationTriggerMode" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "rotationUsageThresholdPercent" INTEGER NOT NULL DEFAULT 85,
    "rotateOnHealthFailure" BOOLEAN NOT NULL DEFAULT false,
    "lastRotatedAt" DATETIME,
    "nextRotationAt" DATETIME,
    "rotationCount" INTEGER NOT NULL DEFAULT 0,
    "lastRoutingAlertAt" DATETIME,
    "autoClearStalePins" BOOLEAN NOT NULL DEFAULT true,
    "autoFallbackToPrefer" BOOLEAN NOT NULL DEFAULT false,
    "autoSkipUnhealthy" BOOLEAN NOT NULL DEFAULT false,
    "routingAlertRules" TEXT,
    "welcomeMessage" TEXT,
    "appliedTemplateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DynamicAccessKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DynamicAccessKey_appliedTemplateId_fkey" FOREIGN KEY ("appliedTemplateId") REFERENCES "DynamicKeyTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DynamicAccessKey" ("appliedTemplateId", "autoClearStalePins", "autoDisableOnLimit", "autoFallbackToPrefer", "autoSkipUnhealthy", "bandwidthAlertAt80", "bandwidthAlertAt90", "contactLinks", "coverImage", "coverImageType", "createdAt", "dataLimitBytes", "dataLimitResetStrategy", "drainGraceMinutes", "durationDays", "dynamicUrl", "email", "expirationType", "expirationWarningStage", "expiresAt", "firstUsedAt", "id", "lastDataLimitReset", "lastResolvedAccessKeyId", "lastResolvedAt", "lastResolvedServerId", "lastRotatedAt", "lastRoutingAlertAt", "lastSelectedKeyIndex", "lastTrafficAt", "lastWarningSentAt", "loadBalancerAlgorithm", "method", "name", "nextRotationAt", "notes", "owner", "pinExpiresAt", "pinnedAccessKeyId", "pinnedAt", "pinnedServerId", "preferredCountryCodesJson", "preferredCountryWeightsJson", "preferredRegionMode", "preferredServerIdsJson", "preferredServerWeightsJson", "prefix", "publicSlug", "quotaAlertThresholds", "quotaAlertsSent", "rotateOnHealthFailure", "rotationCount", "rotationEnabled", "rotationInterval", "rotationTriggerMode", "rotationUsageThresholdPercent", "routingAlertRules", "serverTagsJson", "sessionStickinessMode", "sharePageEnabled", "status", "subscriptionTheme", "subscriptionWelcomeMessage", "tags", "telegramId", "type", "updatedAt", "usageOffset", "usedBytes", "userId", "welcomeMessage") SELECT "appliedTemplateId", "autoClearStalePins", "autoDisableOnLimit", "autoFallbackToPrefer", "autoSkipUnhealthy", "bandwidthAlertAt80", "bandwidthAlertAt90", "contactLinks", "coverImage", "coverImageType", "createdAt", "dataLimitBytes", "dataLimitResetStrategy", "drainGraceMinutes", "durationDays", "dynamicUrl", "email", "expirationType", "expirationWarningStage", "expiresAt", "firstUsedAt", "id", "lastDataLimitReset", "lastResolvedAccessKeyId", "lastResolvedAt", "lastResolvedServerId", "lastRotatedAt", "lastRoutingAlertAt", "lastSelectedKeyIndex", "lastTrafficAt", "lastWarningSentAt", "loadBalancerAlgorithm", "method", "name", "nextRotationAt", "notes", "owner", "pinExpiresAt", "pinnedAccessKeyId", "pinnedAt", "pinnedServerId", "preferredCountryCodesJson", "preferredCountryWeightsJson", "preferredRegionMode", "preferredServerIdsJson", "preferredServerWeightsJson", "prefix", "publicSlug", "quotaAlertThresholds", "quotaAlertsSent", "rotateOnHealthFailure", "rotationCount", "rotationEnabled", "rotationInterval", "rotationTriggerMode", "rotationUsageThresholdPercent", "routingAlertRules", "serverTagsJson", "sessionStickinessMode", "sharePageEnabled", "status", "subscriptionTheme", "subscriptionWelcomeMessage", "tags", "telegramId", "type", "updatedAt", "usageOffset", "usedBytes", "userId", "welcomeMessage" FROM "DynamicAccessKey";
DROP TABLE "DynamicAccessKey";
ALTER TABLE "new_DynamicAccessKey" RENAME TO "DynamicAccessKey";
CREATE UNIQUE INDEX "DynamicAccessKey_dynamicUrl_key" ON "DynamicAccessKey"("dynamicUrl");
CREATE UNIQUE INDEX "DynamicAccessKey_publicSlug_key" ON "DynamicAccessKey"("publicSlug");
CREATE INDEX "DynamicAccessKey_userId_idx" ON "DynamicAccessKey"("userId");
CREATE INDEX "DynamicAccessKey_status_lastTrafficAt_idx" ON "DynamicAccessKey"("status", "lastTrafficAt");
CREATE INDEX "DynamicAccessKey_appliedTemplateId_idx" ON "DynamicAccessKey"("appliedTemplateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

