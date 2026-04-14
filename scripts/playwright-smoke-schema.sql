CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#06b6d4',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "ServerTag" (
    "serverId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("serverId", "tagId"),
    CONSTRAINT "ServerTag_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TrafficLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessKeyId" TEXT NOT NULL,
    "bytesUsed" BIGINT NOT NULL,
    "deltaBytes" BIGINT NOT NULL DEFAULT 0,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrafficLog_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ConnectionSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessKeyId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytesUsed" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true, "endedReason" TEXT,
    CONSTRAINT "ConnectionSession_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ArchivedKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalKeyId" TEXT NOT NULL,
    "outlineKeyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "telegramId" TEXT,
    "notes" TEXT,
    "serverName" TEXT NOT NULL,
    "serverLocation" TEXT,
    "accessUrl" TEXT,
    "dataLimitBytes" BIGINT,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "expirationType" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "durationDays" INTEGER,
    "archiveReason" TEXT NOT NULL,
    "originalStatus" TEXT NOT NULL,
    "firstUsedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleteAfter" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "ServerMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "cpuPercent" REAL,
    "memoryPercent" REAL,
    "diskPercent" REAL,
    "bytesIn" BIGINT,
    "bytesOut" BIGINT,
    "activeKeys" INTEGER,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "healthStatus" TEXT, "latencyMs" INTEGER,
    CONSTRAINT "ServerMetric_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "NotificationChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessKeyId" TEXT,
    CONSTRAINT "NotificationLog_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE INDEX "TrafficLog_accessKeyId_recordedAt_idx" ON "TrafficLog"("accessKeyId", "recordedAt");
CREATE INDEX "ConnectionSession_accessKeyId_isActive_idx" ON "ConnectionSession"("accessKeyId", "isActive");
CREATE INDEX "ConnectionSession_accessKeyId_startedAt_idx" ON "ConnectionSession"("accessKeyId", "startedAt");
CREATE INDEX "ArchivedKey_archiveReason_idx" ON "ArchivedKey"("archiveReason");
CREATE INDEX "ArchivedKey_archivedAt_idx" ON "ArchivedKey"("archivedAt");
CREATE INDEX "ArchivedKey_deleteAfter_idx" ON "ArchivedKey"("deleteAfter");
CREATE INDEX "ServerMetric_serverId_recordedAt_idx" ON "ServerMetric"("serverId", "recordedAt");
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE IF NOT EXISTS "SecurityRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'BLOCK',
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "SecurityRule_type_targetType_idx" ON "SecurityRule"("type", "targetType");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE TABLE IF NOT EXISTS "UsageSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "keyId" TEXT,
    "keyType" TEXT,
    "usedBytes" BIGINT NOT NULL,
    "deltaBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "WorkerLock" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'usage-snapshot-worker',
    "workerId" TEXT NOT NULL,
    "lockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "heartbeatAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "UsageSnapshot_keyId_createdAt_idx" ON "UsageSnapshot"("keyId", "createdAt");
CREATE INDEX "UsageSnapshot_serverId_createdAt_idx" ON "UsageSnapshot"("serverId", "createdAt");
CREATE INDEX "UsageSnapshot_createdAt_idx" ON "UsageSnapshot"("createdAt");
CREATE TABLE IF NOT EXISTS "TotpSecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "lastAttemptAt" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "RecoveryCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "WebAuthnCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceType" TEXT,
    "transports" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Security Key',
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "SecurityProbe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "scheme" TEXT,
    "tlsVersion" TEXT,
    "cipherSuite" TEXT,
    "certSubject" TEXT,
    "certIssuer" TEXT,
    "certExpiry" DATETIME,
    "certDaysLeft" INTEGER,
    "hasHsts" BOOLEAN NOT NULL DEFAULT false,
    "hstsMaxAge" INTEGER,
    "result" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "errorMessage" TEXT,
    "lastCheckedAt" DATETIME,
    "nextCheckAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "DashboardSecurityProbe" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'dashboard-security',
    "dashboardUrl" TEXT,
    "scheme" TEXT,
    "tlsVersion" TEXT,
    "hasHsts" BOOLEAN NOT NULL DEFAULT false,
    "hstsMaxAge" INTEGER,
    "hasSecureCookies" BOOLEAN NOT NULL DEFAULT false,
    "hasHttpOnlyCookies" BOOLEAN NOT NULL DEFAULT false,
    "hasSameSiteCookies" BOOLEAN NOT NULL DEFAULT false,
    "hasCsp" BOOLEAN NOT NULL DEFAULT false,
    "cspDirectives" TEXT,
    "hasXFrameOptions" BOOLEAN NOT NULL DEFAULT false,
    "hasXContentTypeOptions" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "errorMessage" TEXT,
    "securityScore" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TotpSecret_userId_key" ON "TotpSecret"("userId");
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");
CREATE UNIQUE INDEX "SecurityProbe_serverId_key" ON "SecurityProbe"("serverId");
CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "reportData" TEXT,
    "totalServers" INTEGER NOT NULL DEFAULT 0,
    "totalKeys" INTEGER NOT NULL DEFAULT 0,
    "totalBytesUsed" BIGINT NOT NULL DEFAULT 0,
    "totalDeltaBytes" BIGINT NOT NULL DEFAULT 0,
    "csvFileName" TEXT,
    "generatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Report_periodStart_periodEnd_idx" ON "Report"("periodStart", "periodEnd");
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" TEXT,
    "payloadMode" TEXT NOT NULL DEFAULT 'WRAPPED',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" DATETIME,
    "processedAt" DATETIME,
    "lastError" TEXT,
    "accessKeyId" TEXT,
    "sourceLogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "cooldownKey" TEXT,
    CONSTRAINT "NotificationDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NotificationDelivery_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_channelId_idx" ON "NotificationDelivery"("channelId");
CREATE INDEX "NotificationDelivery_accessKeyId_idx" ON "NotificationDelivery"("accessKeyId");
CREATE INDEX "NotificationDelivery_sourceLogId_idx" ON "NotificationDelivery"("sourceLogId");
CREATE INDEX "NotificationDelivery_createdAt_idx" ON "NotificationDelivery"("createdAt");
CREATE INDEX "NotificationDelivery_channelId_event_cooldownKey_createdAt_idx" ON "NotificationDelivery"("channelId", "event", "cooldownKey", "createdAt");
CREATE TABLE IF NOT EXISTS "BackupVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "fileSizeBytes" BIGINT NOT NULL,
    "fileHashSha256" TEXT,
    "restoreReady" BOOLEAN NOT NULL DEFAULT false,
    "integrityCheck" TEXT,
    "tableCount" INTEGER,
    "accessKeyCount" INTEGER,
    "userCount" INTEGER,
    "error" TEXT,
    "details" TEXT,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BackupVerification_filename_verifiedAt_idx" ON "BackupVerification"("filename", "verifiedAt");
CREATE INDEX "BackupVerification_verifiedAt_idx" ON "BackupVerification"("verifiedAt");
CREATE INDEX "ConnectionSession_isActive_lastActiveAt_idx" ON "ConnectionSession"("isActive", "lastActiveAt");
CREATE TABLE IF NOT EXISTS "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL DEFAULT 'SERVER_HEALTH',
    "serverId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "healthStatus" TEXT,
    "countryCode" TEXT,
    "affectedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "affectedUserCount" INTEGER NOT NULL DEFAULT 0,
    "assignedUserId" TEXT,
    "assignedUserEmail" TEXT,
    "acknowledgedByUserId" TEXT,
    "acknowledgedByEmail" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedByEmail" TEXT,
    "notes" TEXT,
    "metadata" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "IncidentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "details" TEXT,
    "notificationLogId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ScheduledReportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT,
    "frequency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "summaryMessage" TEXT,
    "configSnapshot" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "ScheduledReportRun_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ScheduledReportDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "channelId" TEXT,
    "channelName" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "notificationDeliveryId" TEXT,
    "lastError" TEXT,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledReportDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduledReportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Incident_status_severity_idx" ON "Incident"("status", "severity");
CREATE INDEX "Incident_serverId_status_idx" ON "Incident"("serverId", "status");
CREATE INDEX "Incident_openedAt_idx" ON "Incident"("openedAt");
CREATE INDEX "IncidentEvent_incidentId_createdAt_idx" ON "IncidentEvent"("incidentId", "createdAt");
CREATE INDEX "IncidentEvent_notificationLogId_idx" ON "IncidentEvent"("notificationLogId");
CREATE INDEX "ScheduledReportRun_status_createdAt_idx" ON "ScheduledReportRun"("status", "createdAt");
CREATE INDEX "ScheduledReportRun_createdAt_idx" ON "ScheduledReportRun"("createdAt");
CREATE UNIQUE INDEX "ScheduledReportDelivery_notificationDeliveryId_key" ON "ScheduledReportDelivery"("notificationDeliveryId");
CREATE INDEX "ScheduledReportDelivery_runId_createdAt_idx" ON "ScheduledReportDelivery"("runId", "createdAt");
CREATE INDEX "ScheduledReportDelivery_status_createdAt_idx" ON "ScheduledReportDelivery"("status", "createdAt");
CREATE TABLE IF NOT EXISTS "DynamicKeyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SELF_MANAGED',
    "notes" TEXT,
    "dataLimitBytes" BIGINT,
    "dataLimitResetStrategy" TEXT NOT NULL DEFAULT 'NEVER',
    "expirationType" TEXT NOT NULL DEFAULT 'NEVER',
    "durationDays" INTEGER,
    "method" TEXT NOT NULL DEFAULT 'chacha20-ietf-poly1305',
    "serverTagsJson" TEXT NOT NULL DEFAULT '[]',
    "loadBalancerAlgorithm" TEXT NOT NULL DEFAULT 'IP_HASH',
    "preferredServerIdsJson" TEXT NOT NULL DEFAULT '[]',
    "preferredCountryCodesJson" TEXT NOT NULL DEFAULT '[]',
    "preferredServerWeightsJson" TEXT NOT NULL DEFAULT '{}',
    "preferredCountryWeightsJson" TEXT NOT NULL DEFAULT '{}',
    "preferredRegionMode" TEXT NOT NULL DEFAULT 'PREFER',
    "sessionStickinessMode" TEXT NOT NULL DEFAULT 'DRAIN',
    "drainGraceMinutes" INTEGER NOT NULL DEFAULT 20,
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationInterval" TEXT NOT NULL DEFAULT 'NEVER',
    "rotationTriggerMode" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "rotationUsageThresholdPercent" INTEGER NOT NULL DEFAULT 85,
    "rotateOnHealthFailure" BOOLEAN NOT NULL DEFAULT false,
    "sharePageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionTheme" TEXT,
    "subscriptionWelcomeMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "DynamicRoutingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dynamicAccessKeyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "reason" TEXT NOT NULL,
    "fromKeyId" TEXT,
    "fromKeyName" TEXT,
    "fromServerId" TEXT,
    "fromServerName" TEXT,
    "toKeyId" TEXT,
    "toKeyName" TEXT,
    "toServerId" TEXT,
    "toServerName" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "operatorNote" TEXT,
    CONSTRAINT "DynamicRoutingEvent_dynamicAccessKeyId_fkey" FOREIGN KEY ("dynamicAccessKeyId") REFERENCES "DynamicAccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramLinkToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ACCESS_KEY_CONNECT',
    "accessKeyId" TEXT,
    "dynamicAccessKeyId" TEXT,
    "userId" TEXT,
    "createdByUserId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "consumedByChatId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramLinkToken_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelegramLinkToken_dynamicAccessKeyId_fkey" FOREIGN KEY ("dynamicAccessKeyId") REFERENCES "DynamicAccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelegramLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "SubscriptionPageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessKeyId" TEXT,
    "dynamicAccessKeyId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT,
    "platform" TEXT,
    "metadata" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionPageEvent_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionPageEvent_dynamicAccessKeyId_fkey" FOREIGN KEY ("dynamicAccessKeyId") REFERENCES "DynamicAccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DynamicRoutingEvent_dynamicAccessKeyId_createdAt_idx" ON "DynamicRoutingEvent"("dynamicAccessKeyId", "createdAt");
CREATE INDEX "DynamicRoutingEvent_eventType_createdAt_idx" ON "DynamicRoutingEvent"("eventType", "createdAt");
CREATE UNIQUE INDEX "TelegramLinkToken_token_key" ON "TelegramLinkToken"("token");
CREATE INDEX "TelegramLinkToken_accessKeyId_expiresAt_idx" ON "TelegramLinkToken"("accessKeyId", "expiresAt");
CREATE INDEX "TelegramLinkToken_dynamicAccessKeyId_expiresAt_idx" ON "TelegramLinkToken"("dynamicAccessKeyId", "expiresAt");
CREATE INDEX "TelegramLinkToken_userId_expiresAt_idx" ON "TelegramLinkToken"("userId", "expiresAt");
CREATE INDEX "TelegramLinkToken_token_expiresAt_idx" ON "TelegramLinkToken"("token", "expiresAt");
CREATE INDEX "SubscriptionPageEvent_accessKeyId_createdAt_idx" ON "SubscriptionPageEvent"("accessKeyId", "createdAt");
CREATE INDEX "SubscriptionPageEvent_dynamicAccessKeyId_createdAt_idx" ON "SubscriptionPageEvent"("dynamicAccessKeyId", "createdAt");
CREATE INDEX "SubscriptionPageEvent_eventType_createdAt_idx" ON "SubscriptionPageEvent"("eventType", "createdAt");
CREATE TABLE IF NOT EXISTS "AccessKeySlugHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessKeyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessKeySlugHistory_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AdminLoginRestriction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "restrictionType" TEXT NOT NULL,
    "attemptedEmail" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "firstFailedAt" DATETIME NOT NULL,
    "lastFailedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'APP',
    "lastAlertSentAt" DATETIME,
    "lastFail2banEventAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "AccessDistributionLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessKeyId" TEXT,
    "dynamicAccessKeyId" TEXT,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" DATETIME,
    "lastOpenedIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessDistributionLink_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccessDistributionLink_dynamicAccessKeyId_fkey" FOREIGN KEY ("dynamicAccessKeyId") REFERENCES "DynamicAccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccessDistributionLink_token_key" ON "AccessDistributionLink"("token");
CREATE INDEX "AccessDistributionLink_accessKeyId_expiresAt_idx" ON "AccessDistributionLink"("accessKeyId", "expiresAt");
CREATE INDEX "AccessDistributionLink_dynamicAccessKeyId_expiresAt_idx" ON "AccessDistributionLink"("dynamicAccessKeyId", "expiresAt");
CREATE INDEX "AccessDistributionLink_token_expiresAt_idx" ON "AccessDistributionLink"("token", "expiresAt");
CREATE TABLE IF NOT EXISTS "KeyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "namePrefix" TEXT,
    "slugPrefix" TEXT,
    "dataLimitBytes" BIGINT,
    "dataLimitResetStrategy" TEXT NOT NULL DEFAULT 'NEVER',
    "expirationType" TEXT NOT NULL DEFAULT 'NEVER',
    "durationDays" INTEGER,
    "method" TEXT NOT NULL DEFAULT 'chacha20-ietf-poly1305',
    "subscriptionTheme" TEXT,
    "subscriptionWelcomeMessage" TEXT,
    "sharePageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "clientLinkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoDisableOnLimit" BOOLEAN NOT NULL DEFAULT true,
    "autoDisableOnExpire" BOOLEAN NOT NULL DEFAULT true,
    "autoArchiveAfterDays" INTEGER NOT NULL DEFAULT 0,
    "quotaAlertThresholds" TEXT NOT NULL DEFAULT '80,90',
    "autoRenewPolicy" TEXT NOT NULL DEFAULT 'NONE',
    "autoRenewDurationDays" INTEGER,
    "notes" TEXT,
    "serverId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeyTemplate_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccessKeySlugHistory_slug_key" ON "AccessKeySlugHistory"("slug");
CREATE INDEX "AccessKeySlugHistory_accessKeyId_createdAt_idx" ON "AccessKeySlugHistory"("accessKeyId", "createdAt");
CREATE UNIQUE INDEX "AdminLoginRestriction_ip_key" ON "AdminLoginRestriction"("ip");
CREATE INDEX "AdminLoginRestriction_isActive_expiresAt_idx" ON "AdminLoginRestriction"("isActive", "expiresAt");
CREATE INDEX "AdminLoginRestriction_restrictionType_isActive_expiresAt_idx" ON "AdminLoginRestriction"("restrictionType", "isActive", "expiresAt");
CREATE INDEX "AuditLog_action_ip_createdAt_idx" ON "AuditLog"("action", "ip", "createdAt");
CREATE TABLE IF NOT EXISTS "TelegramServerChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "telegramChatId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "accessKeyId" TEXT NOT NULL,
    "currentServerId" TEXT NOT NULL,
    "currentServerName" TEXT NOT NULL,
    "currentServerCountryCode" TEXT,
    "requestedServerId" TEXT NOT NULL,
    "requestedServerName" TEXT NOT NULL,
    "requestedServerCountryCode" TEXT,
    "adminNote" TEXT,
    "customerMessage" TEXT,
    "reviewedByUserId" TEXT,
    "reviewerName" TEXT,
    "reviewedAt" DATETIME,
    "fulfilledAt" DATETIME,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramServerChangeRequest_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramPremiumSupportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "telegramChatId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "dynamicAccessKeyId" TEXT NOT NULL,
    "requestedRegionCode" TEXT,
    "currentPoolSummary" TEXT,
    "currentResolvedServerId" TEXT,
    "currentResolvedServerName" TEXT,
    "currentResolvedServerCountryCode" TEXT,
    "linkedOutageIncidentId" TEXT,
    "linkedOutageServerId" TEXT,
    "linkedOutageServerName" TEXT,
    "appliedPinServerId" TEXT,
    "appliedPinServerName" TEXT,
    "appliedPinExpiresAt" DATETIME,
    "followUpPending" BOOLEAN NOT NULL DEFAULT false,
    "lastFollowUpAt" DATETIME,
    "lastAdminReplyAt" DATETIME,
    "adminNote" TEXT,
    "customerMessage" TEXT,
    "reviewedByUserId" TEXT,
    "reviewerName" TEXT,
    "reviewedAt" DATETIME,
    "handledAt" DATETIME,
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramPremiumSupportRequest_dynamicAccessKeyId_fkey" FOREIGN KEY ("dynamicAccessKeyId") REFERENCES "DynamicAccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelegramPremiumSupportRequest_linkedOutageIncidentId_fkey" FOREIGN KEY ("linkedOutageIncidentId") REFERENCES "ServerOutageIncident" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TelegramPremiumSupportRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramPremiumSupportReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "telegramUsername" TEXT,
    "adminUserId" TEXT,
    "senderName" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramPremiumSupportReply_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TelegramPremiumSupportRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ServerOutageIncidentUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "updateType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "visibleToUsers" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "sentToTelegramUsers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerOutageIncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ServerOutageIncident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TelegramServerChangeRequest_requestCode_key" ON "TelegramServerChangeRequest"("requestCode");
CREATE INDEX "TelegramServerChangeRequest_telegramChatId_status_createdAt_idx" ON "TelegramServerChangeRequest"("telegramChatId", "status", "createdAt");
CREATE INDEX "TelegramServerChangeRequest_telegramUserId_status_createdAt_idx" ON "TelegramServerChangeRequest"("telegramUserId", "status", "createdAt");
CREATE INDEX "TelegramServerChangeRequest_accessKeyId_status_createdAt_idx" ON "TelegramServerChangeRequest"("accessKeyId", "status", "createdAt");
CREATE INDEX "TelegramServerChangeRequest_status_createdAt_idx" ON "TelegramServerChangeRequest"("status", "createdAt");
CREATE UNIQUE INDEX "TelegramPremiumSupportRequest_requestCode_key" ON "TelegramPremiumSupportRequest"("requestCode");
CREATE INDEX "TelegramPremiumSupportRequest_telegramChatId_status_createdAt_idx" ON "TelegramPremiumSupportRequest"("telegramChatId", "status", "createdAt");
CREATE INDEX "TelegramPremiumSupportRequest_telegramUserId_status_createdAt_idx" ON "TelegramPremiumSupportRequest"("telegramUserId", "status", "createdAt");
CREATE INDEX "TelegramPremiumSupportRequest_dynamicAccessKeyId_status_createdAt_idx" ON "TelegramPremiumSupportRequest"("dynamicAccessKeyId", "status", "createdAt");
CREATE INDEX "TelegramPremiumSupportRequest_status_requestType_createdAt_idx" ON "TelegramPremiumSupportRequest"("status", "requestType", "createdAt");
CREATE INDEX "TelegramPremiumSupportRequest_linkedOutageIncidentId_status_createdAt_idx" ON "TelegramPremiumSupportRequest"("linkedOutageIncidentId", "status", "createdAt");
CREATE INDEX "TelegramPremiumSupportRequest_followUpPending_updatedAt_idx" ON "TelegramPremiumSupportRequest"("followUpPending", "updatedAt");
CREATE INDEX "TelegramPremiumSupportReply_requestId_createdAt_idx" ON "TelegramPremiumSupportReply"("requestId", "createdAt");
CREATE INDEX "TelegramPremiumSupportReply_senderType_createdAt_idx" ON "TelegramPremiumSupportReply"("senderType", "createdAt");
CREATE INDEX "ServerOutageIncidentUpdate_incidentId_createdAt_idx" ON "ServerOutageIncidentUpdate"("incidentId", "createdAt");
CREATE INDEX "ServerOutageIncidentUpdate_updateType_createdAt_idx" ON "ServerOutageIncidentUpdate"("updateType", "createdAt");
CREATE TABLE IF NOT EXISTS "ServerOutageIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentCode" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "cause" TEXT NOT NULL DEFAULT 'HEALTH_DOWN',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gracePeriodHours" INTEGER NOT NULL DEFAULT 3,
    "userAlertScheduledFor" DATETIME,
    "userAlertSentAt" DATETIME,
    "initialAffectedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "migratedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "failedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "recoveryNotificationCount" INTEGER NOT NULL DEFAULT 0,
    "migrationTargetServerId" TEXT,
    "migrationTargetServerName" TEXT,
    "migrationTriggeredAt" DATETIME,
    "migrationCompletedAt" DATETIME,
    "recoveryNotifiedAt" DATETIME,
    "recoveredAt" DATETIME,
    "affectedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "affectedTelegramUsers" INTEGER NOT NULL DEFAULT 0,
    "affectedAccessKeyIdsJson" TEXT NOT NULL DEFAULT '[]',
    "affectedTelegramChatIdsJson" TEXT NOT NULL DEFAULT '[]',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerOutageIncident_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServerOutageIncident_incidentCode_key" ON "ServerOutageIncident"("incidentCode");
CREATE INDEX "ServerOutageIncident_serverId_startedAt_idx" ON "ServerOutageIncident"("serverId", "startedAt");
CREATE INDEX "ServerOutageIncident_status_startedAt_idx" ON "ServerOutageIncident"("status", "startedAt");
CREATE TABLE IF NOT EXISTS "ServerOutageState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "incidentId" TEXT,
    "cause" TEXT NOT NULL DEFAULT 'HEALTH_DOWN',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" DATETIME,
    "gracePeriodHours" INTEGER NOT NULL DEFAULT 3,
    "userAlertScheduledFor" DATETIME NOT NULL,
    "userAlertSentAt" DATETIME,
    "initialAffectedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "migratedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "failedKeyCount" INTEGER NOT NULL DEFAULT 0,
    "recoveryNotificationCount" INTEGER NOT NULL DEFAULT 0,
    "migrationTargetServerId" TEXT,
    "migrationTargetServerName" TEXT,
    "migrationTriggeredAt" DATETIME,
    "migrationCompletedAt" DATETIME,
    "recoveryNotifiedAt" DATETIME,
    "affectedAccessKeyIdsJson" TEXT NOT NULL DEFAULT '[]',
    "affectedTelegramChatIdsJson" TEXT NOT NULL DEFAULT '[]',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerOutageState_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServerOutageState_serverId_key" ON "ServerOutageState"("serverId");
CREATE INDEX "ServerOutageState_recoveredAt_userAlertScheduledFor_idx" ON "ServerOutageState"("recoveredAt", "userAlertScheduledFor");
CREATE INDEX "ServerOutageState_migrationCompletedAt_recoveryNotifiedAt_idx" ON "ServerOutageState"("migrationCompletedAt", "recoveryNotifiedAt");
CREATE TABLE IF NOT EXISTS "TelegramCouponRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignType" TEXT NOT NULL,
    "couponCode" TEXT NOT NULL,
    "couponDiscountAmount" INTEGER NOT NULL,
    "couponDiscountLabel" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "telegramChatId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "accessKeyId" TEXT,
    "dynamicAccessKeyId" TEXT,
    "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
    "stopAfterConversion" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "redeemedOrderId" TEXT,
    "redeemedOrderCode" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "redeemedAt" DATETIME,
    "cancelledAt" DATETIME,
    "statusUpdatedByUserId" TEXT,
    "statusUpdatedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "TelegramOrderFinanceAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "amount" INTEGER,
    "currency" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramOrderFinanceAction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TelegramOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelegramOrderFinanceAction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramSupportThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "waitingOn" TEXT NOT NULL DEFAULT 'ADMIN',
    "issueCategory" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "telegramChatId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "userId" TEXT,
    "subject" TEXT,
    "relatedOrderCode" TEXT,
    "relatedKeyName" TEXT,
    "relatedKeyType" TEXT,
    "relatedServerName" TEXT,
    "firstResponseDueAt" DATETIME,
    "firstAdminReplyAt" DATETIME,
    "lastCustomerReplyAt" DATETIME,
    "lastAdminReplyAt" DATETIME,
    "handledAt" DATETIME,
    "escalatedAt" DATETIME,
    "escalatedReason" TEXT,
    "assignedAdminUserId" TEXT,
    "assignedAdminName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "firstResponseAlertSentAt" DATETIME, "firstResponseLastAlertAt" DATETIME,
    CONSTRAINT "TelegramSupportThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramSupportReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "telegramUsername" TEXT,
    "adminUserId" TEXT,
    "senderName" TEXT,
    "message" TEXT NOT NULL,
    "mediaKind" TEXT,
    "mediaUrl" TEXT,
    "mediaTelegramFileId" TEXT,
    "mediaFilename" TEXT,
    "mediaContentType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramSupportReply_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TelegramSupportThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramAnnouncementDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "announcementId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "sentAt" DATETIME,
    "readAt" DATETIME,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" DATETIME,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramAnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "TelegramAnnouncement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramAnnouncementTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetTag" TEXT,
    "targetSegment" TEXT,
    "targetServerId" TEXT,
    "targetServerName" TEXT,
    "targetCountryCode" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "cardStyle" TEXT NOT NULL DEFAULT 'DEFAULT',
    "includeSupportButton" BOOLEAN NOT NULL DEFAULT true,
    "pinToInbox" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceType" TEXT,
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "CustomerSupportNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'INTERNAL',
    "note" TEXT NOT NULL,
    "telegramMessageTitle" TEXT,
    "telegramCardStyle" TEXT,
    "telegramMediaKind" TEXT,
    "telegramMediaUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerSupportNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerSupportNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "DynamicAccessKey" (
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
CREATE UNIQUE INDEX "DynamicAccessKey_dynamicUrl_key" ON "DynamicAccessKey"("dynamicUrl");
CREATE UNIQUE INDEX "DynamicAccessKey_publicSlug_key" ON "DynamicAccessKey"("publicSlug");
CREATE INDEX "DynamicAccessKey_userId_idx" ON "DynamicAccessKey"("userId");
CREATE INDEX "DynamicAccessKey_status_lastTrafficAt_idx" ON "DynamicAccessKey"("status", "lastTrafficAt");
CREATE INDEX "DynamicAccessKey_appliedTemplateId_idx" ON "DynamicAccessKey"("appliedTemplateId");
CREATE TABLE IF NOT EXISTS "HealthCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "checkIntervalMins" INTEGER NOT NULL DEFAULT 5,
    "notifyCooldownMins" INTEGER NOT NULL DEFAULT 30,
    "latencyThresholdMs" INTEGER NOT NULL DEFAULT 500,
    "slowConsecutiveCount" INTEGER NOT NULL DEFAULT 0,
    "slowAutoDrainEnabled" BOOLEAN NOT NULL DEFAULT true,
    "slowAutoDrainThreshold" INTEGER NOT NULL DEFAULT 3,
    "slowAutoMigrateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slowAutoMigrateThreshold" INTEGER NOT NULL DEFAULT 6,
    "slowAutoMigrateGraceHours" INTEGER NOT NULL DEFAULT 2,
    "slowUserNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "slowUserNotifyThreshold" INTEGER NOT NULL DEFAULT 3,
    "slowUserNotifyCooldownMins" INTEGER NOT NULL DEFAULT 180,
    "lastStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastLatencyMs" INTEGER,
    "lastCheckedAt" DATETIME,
    "lastNotifiedAt" DATETIME,
    "slowUserAlertSentAt" DATETIME,
    "uptimePercent" REAL NOT NULL DEFAULT 100,
    "totalChecks" INTEGER NOT NULL DEFAULT 0,
    "successfulChecks" INTEGER NOT NULL DEFAULT 0,
    "failedChecks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HealthCheck_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HealthCheck_serverId_key" ON "HealthCheck"("serverId");
CREATE TABLE IF NOT EXISTS "Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "apiCertSha256" TEXT NOT NULL,
    "location" TEXT,
    "countryCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxKeys" INTEGER,
    "lifecycleMode" TEXT NOT NULL DEFAULT 'ACTIVE',
    "allowManualAssignmentsWhenDraining" BOOLEAN NOT NULL DEFAULT false,
    "lifecycleNote" TEXT,
    "lifecycleChangedAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "outlineServerId" TEXT,
    "outlineName" TEXT,
    "outlineVersion" TEXT,
    "hostnameForAccessKeys" TEXT,
    "portForNewAccessKeys" INTEGER,
    "metricsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME
);
CREATE TABLE IF NOT EXISTS "TelegramUserProfile" (
    "telegramUserId" TEXT NOT NULL PRIMARY KEY,
    "telegramChatId" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "locale" TEXT,
    "allowPromoAnnouncements" BOOLEAN NOT NULL DEFAULT true,
    "allowMaintenanceNotices" BOOLEAN NOT NULL DEFAULT true,
    "allowReceiptNotifications" BOOLEAN NOT NULL DEFAULT true,
    "allowSupportUpdates" BOOLEAN NOT NULL DEFAULT true,
    "pendingPremiumSupportRequestId" TEXT,
    "pendingPremiumReplyStartedAt" DATETIME,
    "pendingSupportThreadId" TEXT,
    "pendingSupportReplyStartedAt" DATETIME,
    "pendingAdminFlow" TEXT,
    "pendingAdminFlowStartedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
, "lastReferralAcceptedAt" DATETIME, "pendingReferralCode" TEXT, "referralCode" TEXT, "referredByCode" TEXT);
CREATE INDEX "TelegramUserProfile_telegramChatId_idx" ON "TelegramUserProfile"("telegramChatId");
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "adminScope" TEXT,
    "telegramChatId" TEXT,
    "marketingTags" TEXT NOT NULL DEFAULT '',
    "promoEligibilityOverrides" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "TelegramCouponRedemption_campaignType_status_createdAt_idx" ON "TelegramCouponRedemption"("campaignType", "status", "createdAt");
CREATE INDEX "TelegramCouponRedemption_couponCode_status_createdAt_idx" ON "TelegramCouponRedemption"("couponCode", "status", "createdAt");
CREATE INDEX "TelegramCouponRedemption_telegramUserId_status_createdAt_idx" ON "TelegramCouponRedemption"("telegramUserId", "status", "createdAt");
CREATE INDEX "TelegramCouponRedemption_telegramChatId_status_createdAt_idx" ON "TelegramCouponRedemption"("telegramChatId", "status", "createdAt");
CREATE INDEX "TelegramCouponRedemption_accessKeyId_status_createdAt_idx" ON "TelegramCouponRedemption"("accessKeyId", "status", "createdAt");
CREATE INDEX "TelegramCouponRedemption_dynamicAccessKeyId_status_createdAt_idx" ON "TelegramCouponRedemption"("dynamicAccessKeyId", "status", "createdAt");
CREATE INDEX "TelegramCouponRedemption_statusUpdatedByUserId_status_createdAt_idx" ON "TelegramCouponRedemption"("statusUpdatedByUserId", "status", "createdAt");
CREATE INDEX "TelegramOrderFinanceAction_orderId_createdAt_idx" ON "TelegramOrderFinanceAction"("orderId", "createdAt");
CREATE INDEX "TelegramOrderFinanceAction_actionType_createdAt_idx" ON "TelegramOrderFinanceAction"("actionType", "createdAt");
CREATE INDEX "TelegramOrderFinanceAction_createdByUserId_createdAt_idx" ON "TelegramOrderFinanceAction"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "TelegramSupportThread_threadCode_key" ON "TelegramSupportThread"("threadCode");
CREATE INDEX "TelegramSupportThread_telegramChatId_status_createdAt_idx" ON "TelegramSupportThread"("telegramChatId", "status", "createdAt");
CREATE INDEX "TelegramSupportThread_telegramUserId_status_createdAt_idx" ON "TelegramSupportThread"("telegramUserId", "status", "createdAt");
CREATE INDEX "TelegramSupportThread_userId_status_createdAt_idx" ON "TelegramSupportThread"("userId", "status", "createdAt");
CREATE INDEX "TelegramSupportThread_status_waitingOn_updatedAt_idx" ON "TelegramSupportThread"("status", "waitingOn", "updatedAt");
CREATE INDEX "TelegramSupportThread_issueCategory_status_createdAt_idx" ON "TelegramSupportThread"("issueCategory", "status", "createdAt");
CREATE INDEX "TelegramSupportReply_threadId_createdAt_idx" ON "TelegramSupportReply"("threadId", "createdAt");
CREATE INDEX "TelegramSupportReply_senderType_createdAt_idx" ON "TelegramSupportReply"("senderType", "createdAt");
CREATE INDEX "TelegramAnnouncementDelivery_announcementId_status_idx" ON "TelegramAnnouncementDelivery"("announcementId", "status");
CREATE INDEX "TelegramAnnouncementDelivery_chatId_isPinned_readAt_createdAt_idx" ON "TelegramAnnouncementDelivery"("chatId", "isPinned", "readAt", "createdAt");
CREATE INDEX "TelegramAnnouncementDelivery_chatId_createdAt_idx" ON "TelegramAnnouncementDelivery"("chatId", "createdAt");
CREATE UNIQUE INDEX "TelegramAnnouncementDelivery_announcementId_chatId_key" ON "TelegramAnnouncementDelivery"("announcementId", "chatId");
CREATE INDEX "TelegramAnnouncementTemplate_createdAt_idx" ON "TelegramAnnouncementTemplate"("createdAt");
CREATE INDEX "TelegramAnnouncementTemplate_createdByUserId_createdAt_idx" ON "TelegramAnnouncementTemplate"("createdByUserId", "createdAt");
CREATE INDEX "TelegramAnnouncementTemplate_targetSegment_createdAt_idx" ON "TelegramAnnouncementTemplate"("targetSegment", "createdAt");
CREATE INDEX "CustomerSupportNote_userId_createdAt_idx" ON "CustomerSupportNote"("userId", "createdAt");
CREATE INDEX "CustomerSupportNote_createdByUserId_createdAt_idx" ON "CustomerSupportNote"("createdByUserId", "createdAt");
CREATE TABLE IF NOT EXISTS "AccessKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outlineKeyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "telegramId" TEXT,
    "notes" TEXT,
    "userId" TEXT,
    "serverId" TEXT NOT NULL,
    "accessUrl" TEXT,
    "password" TEXT,
    "port" INTEGER,
    "method" TEXT,
    "dataLimitBytes" BIGINT,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "dataLimitResetStrategy" TEXT NOT NULL DEFAULT 'NEVER',
    "lastDataLimitReset" DATETIME,
    "usageOffset" BIGINT NOT NULL DEFAULT 0,
    "expirationType" TEXT NOT NULL DEFAULT 'NEVER',
    "expiresAt" DATETIME,
    "durationDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "firstUsedAt" DATETIME,
    "lastTrafficAt" DATETIME,
    "lastUsedAt" DATETIME,
    "lastWarningSentAt" DATETIME,
    "expirationWarningStage" TEXT,
    "bandwidthAlertAt80" BOOLEAN NOT NULL DEFAULT false,
    "bandwidthAlertAt90" BOOLEAN NOT NULL DEFAULT false,
    "autoDisableOnLimit" BOOLEAN NOT NULL DEFAULT true,
    "quotaAlertThresholds" TEXT NOT NULL DEFAULT '80,90',
    "quotaAlertsSent" TEXT NOT NULL DEFAULT '[]',
    "disabledAt" DATETIME,
    "disabledOutlineKeyId" TEXT,
    "autoDisableOnExpire" BOOLEAN NOT NULL DEFAULT true,
    "autoArchiveAfterDays" INTEGER NOT NULL DEFAULT 0,
    "archiveAfterAt" DATETIME,
    "autoRenewPolicy" TEXT NOT NULL DEFAULT 'NONE',
    "autoRenewDurationDays" INTEGER,
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationInterval" TEXT NOT NULL DEFAULT 'NEVER',
    "lastRotatedAt" DATETIME,
    "nextRotationAt" DATETIME,
    "rotationCount" INTEGER NOT NULL DEFAULT 0,
    "dynamicKeyId" TEXT,
    "prefix" TEXT,
    "subscriptionToken" TEXT,
    "publicSlug" TEXT,
    "subscriptionTheme" TEXT,
    "coverImageType" TEXT,
    "coverImage" TEXT,
    "contactLinks" TEXT,
    "subscriptionWelcomeMessage" TEXT,
    "sharePageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "clientLinkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sharePagePasswordHash" TEXT,
    "sharePageAccessExpiresAt" DATETIME,
    "serverChangeCount" INTEGER NOT NULL DEFAULT 0,
    "serverChangeLimit" INTEGER NOT NULL DEFAULT 3,
    "lastServerChangeAt" DATETIME,
    "estimatedDevices" INTEGER NOT NULL DEFAULT 0,
    "peakDevices" INTEGER NOT NULL DEFAULT 0,
    "maxDevices" INTEGER,
    "deviceLimitExceededAt" DATETIME,
    "deviceLimitWarningSentAt" DATETIME,
    "deviceLimitLastObservedDevices" INTEGER,
    "deviceLimitSuppressedUntil" DATETIME,
    "deviceLimitAutoDisabledAt" DATETIME,
    "owner" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccessKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccessKey_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccessKey_dynamicKeyId_fkey" FOREIGN KEY ("dynamicKeyId") REFERENCES "DynamicAccessKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccessKey_subscriptionToken_key" ON "AccessKey"("subscriptionToken");
CREATE UNIQUE INDEX "AccessKey_publicSlug_key" ON "AccessKey"("publicSlug");
CREATE INDEX "AccessKey_status_idx" ON "AccessKey"("status");
CREATE INDEX "AccessKey_status_lastTrafficAt_idx" ON "AccessKey"("status", "lastTrafficAt");
CREATE INDEX "AccessKey_expiresAt_idx" ON "AccessKey"("expiresAt");
CREATE INDEX "AccessKey_userId_idx" ON "AccessKey"("userId");
CREATE INDEX "AccessKey_serverId_idx" ON "AccessKey"("serverId");
CREATE UNIQUE INDEX "AccessKey_serverId_outlineKeyId_key" ON "AccessKey"("serverId", "outlineKeyId");
CREATE TABLE IF NOT EXISTS "TelegramAnnouncementExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "audience" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetTag" TEXT,
    "targetSegment" TEXT,
    "targetServerId" TEXT,
    "targetServerName" TEXT,
    "targetCountryCode" TEXT,
    "includeSupportButton" BOOLEAN NOT NULL DEFAULT true,
    "pinToInbox" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "launchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "TelegramAnnouncementExperimentVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "allocationPercent" INTEGER NOT NULL DEFAULT 50,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "cardStyle" TEXT NOT NULL DEFAULT 'DEFAULT',
    "templateId" TEXT,
    "templateName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramAnnouncementExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "TelegramAnnouncementExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "SupportReplyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "message" TEXT NOT NULL,
    "statusAction" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportReplyTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TelegramAnnouncement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT,
    "experimentVariantKey" TEXT,
    "experimentVariantLabel" TEXT,
    "audience" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "templateId" TEXT,
    "templateName" TEXT,
    "targetTag" TEXT,
    "targetSegment" TEXT,
    "targetServerId" TEXT,
    "targetServerName" TEXT,
    "targetCountryCode" TEXT,
    "targetDirectChatId" TEXT,
    "targetDirectUserLabel" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "cardStyle" TEXT NOT NULL DEFAULT 'DEFAULT',
    "includeSupportButton" BOOLEAN NOT NULL DEFAULT true,
    "pinToInbox" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" DATETIME,
    "recurrenceType" TEXT,
    "recurrenceParentId" TEXT,
    "lastAttemptedAt" DATETIME,
    "sentAt" DATETIME,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "resendAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "resendRecoveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramAnnouncement_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "TelegramAnnouncementExperiment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "TelegramAnnouncement_status_scheduledFor_idx" ON "TelegramAnnouncement"("status", "scheduledFor");
CREATE INDEX "TelegramAnnouncement_createdAt_idx" ON "TelegramAnnouncement"("createdAt");
CREATE INDEX "TelegramAnnouncement_createdByUserId_createdAt_idx" ON "TelegramAnnouncement"("createdByUserId", "createdAt");
CREATE INDEX "TelegramAnnouncement_templateId_createdAt_idx" ON "TelegramAnnouncement"("templateId", "createdAt");
CREATE INDEX "TelegramAnnouncement_templateName_createdAt_idx" ON "TelegramAnnouncement"("templateName", "createdAt");
CREATE INDEX "TelegramAnnouncement_targetServerId_status_createdAt_idx" ON "TelegramAnnouncement"("targetServerId", "status", "createdAt");
CREATE INDEX "TelegramAnnouncement_targetCountryCode_status_createdAt_idx" ON "TelegramAnnouncement"("targetCountryCode", "status", "createdAt");
CREATE INDEX "TelegramAnnouncement_targetTag_status_createdAt_idx" ON "TelegramAnnouncement"("targetTag", "status", "createdAt");
CREATE INDEX "TelegramAnnouncement_targetSegment_status_createdAt_idx" ON "TelegramAnnouncement"("targetSegment", "status", "createdAt");
CREATE INDEX "TelegramAnnouncement_targetDirectChatId_status_createdAt_idx" ON "TelegramAnnouncement"("targetDirectChatId", "status", "createdAt");
CREATE INDEX "TelegramAnnouncement_recurrenceParentId_createdAt_idx" ON "TelegramAnnouncement"("recurrenceParentId", "createdAt");
CREATE INDEX "TelegramAnnouncement_experimentId_createdAt_idx" ON "TelegramAnnouncement"("experimentId", "createdAt");
CREATE INDEX "TelegramAnnouncement_experimentVariantKey_createdAt_idx" ON "TelegramAnnouncement"("experimentVariantKey", "createdAt");
CREATE TABLE IF NOT EXISTS "TelegramOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orderMode" TEXT NOT NULL DEFAULT 'SELF',
    "status" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "requestedName" TEXT,
    "requestedEmail" TEXT,
    "planCode" TEXT,
    "planName" TEXT,
    "priceAmount" INTEGER,
    "priceCurrency" TEXT,
    "priceLabel" TEXT,
    "originalPriceAmount" INTEGER,
    "couponCampaignType" TEXT,
    "couponCode" TEXT,
    "couponDiscountAmount" INTEGER,
    "couponDiscountLabel" TEXT,
    "referralCode" TEXT,
    "giftRecipientTelegramUsername" TEXT,
    "giftRecipientTelegramUserId" TEXT,
    "giftRecipientChatId" TEXT,
    "giftRecipientLabel" TEXT,
    "giftMessage" TEXT,
    "durationMonths" INTEGER,
    "durationDays" INTEGER,
    "dataLimitBytes" BIGINT,
    "unlimitedQuota" BOOLEAN NOT NULL DEFAULT false,
    "templateId" TEXT,
    "dynamicTemplateId" TEXT,
    "deliveryType" TEXT NOT NULL DEFAULT 'ACCESS_KEY',
    "selectedServerId" TEXT,
    "selectedServerName" TEXT,
    "selectedServerCountryCode" TEXT,
    "paymentMethodCode" TEXT,
    "paymentMethodLabel" TEXT,
    "paymentMethodAccountName" TEXT,
    "paymentMethodAccountNumber" TEXT,
    "targetAccessKeyId" TEXT,
    "targetDynamicKeyId" TEXT,
    "approvedAccessKeyId" TEXT,
    "approvedDynamicKeyId" TEXT,
    "paymentProofFileId" TEXT,
    "paymentProofUniqueId" TEXT,
    "paymentProofType" TEXT,
    "paymentProofRevision" INTEGER NOT NULL DEFAULT 0,
    "duplicateProofOrderId" TEXT,
    "duplicateProofOrderCode" TEXT,
    "duplicateProofDetectedAt" DATETIME,
    "paymentMessageId" INTEGER,
    "paymentCaption" TEXT,
    "paymentStageEnteredAt" DATETIME,
    "paymentReminderSentAt" DATETIME,
    "reviewReminderSentAt" DATETIME,
    "rejectedFollowUpSentAt" DATETIME,
    "retryReminderSentAt" DATETIME,
    "paymentSubmittedAt" DATETIME,
    "expiredAt" DATETIME,
    "retryOfOrderId" TEXT,
    "retentionSource" TEXT,
    "adminNote" TEXT,
    "customerMessage" TEXT,
    "rejectionReasonCode" TEXT,
    "assignedReviewerUserId" TEXT,
    "assignedReviewerEmail" TEXT,
    "assignedAt" DATETIME,
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "fulfilledAt" DATETIME,
    "rejectedAt" DATETIME,
    "refundRequestedAt" DATETIME,
    "refundRequestStatus" TEXT,
    "refundRequestMessage" TEXT,
    "refundRequestCustomerMessage" TEXT,
    "refundReviewReasonCode" TEXT,
    "refundAssignedReviewerUserId" TEXT,
    "refundAssignedReviewerEmail" TEXT,
    "refundAssignedAt" DATETIME,
    "refundRequestReviewedAt" DATETIME,
    "refundRequestReviewedByUserId" TEXT,
    "refundRequestReviewerEmail" TEXT,
    "financeStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "financeNote" TEXT,
    "financeUpdatedAt" DATETIME,
    "financeUpdatedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramOrder_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TelegramOrder_financeUpdatedByUserId_fkey" FOREIGN KEY ("financeUpdatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TelegramOrder_orderCode_key" ON "TelegramOrder"("orderCode");
CREATE INDEX "TelegramOrder_telegramChatId_status_createdAt_idx" ON "TelegramOrder"("telegramChatId", "status", "createdAt");
CREATE INDEX "TelegramOrder_telegramUserId_status_createdAt_idx" ON "TelegramOrder"("telegramUserId", "status", "createdAt");
CREATE INDEX "TelegramOrder_status_createdAt_idx" ON "TelegramOrder"("status", "createdAt");
CREATE INDEX "TelegramOrder_reviewedByUserId_status_idx" ON "TelegramOrder"("reviewedByUserId", "status");
CREATE INDEX "TelegramOrder_financeStatus_createdAt_idx" ON "TelegramOrder"("financeStatus", "createdAt");
CREATE INDEX "TelegramOrder_financeUpdatedByUserId_financeUpdatedAt_idx" ON "TelegramOrder"("financeUpdatedByUserId", "financeUpdatedAt");
CREATE INDEX "TelegramOrder_refundRequestStatus_refundRequestedAt_idx" ON "TelegramOrder"("refundRequestStatus", "refundRequestedAt");
CREATE INDEX "TelegramOrder_refundAssignedReviewerUserId_refundRequestStatus_refundRequestedAt_idx" ON "TelegramOrder"("refundAssignedReviewerUserId", "refundRequestStatus", "refundRequestedAt");
CREATE INDEX "TelegramOrder_assignedReviewerUserId_status_createdAt_idx" ON "TelegramOrder"("assignedReviewerUserId", "status", "createdAt");
CREATE INDEX "TelegramOrder_retryOfOrderId_createdAt_idx" ON "TelegramOrder"("retryOfOrderId", "createdAt");
CREATE INDEX "TelegramOrder_retentionSource_createdAt_idx" ON "TelegramOrder"("retentionSource", "createdAt");
CREATE INDEX "TelegramOrder_paymentProofUniqueId_createdAt_idx" ON "TelegramOrder"("paymentProofUniqueId", "createdAt");
CREATE INDEX "TelegramOrder_couponCampaignType_createdAt_idx" ON "TelegramOrder"("couponCampaignType", "createdAt");
CREATE INDEX "TelegramOrder_couponCode_createdAt_idx" ON "TelegramOrder"("couponCode", "createdAt");
CREATE INDEX "TelegramOrder_referralCode_createdAt_idx" ON "TelegramOrder"("referralCode", "createdAt");
CREATE INDEX "TelegramOrder_orderMode_createdAt_idx" ON "TelegramOrder"("orderMode", "createdAt");
CREATE INDEX "TelegramAnnouncementExperiment_status_createdAt_idx" ON "TelegramAnnouncementExperiment"("status", "createdAt");
CREATE INDEX "TelegramAnnouncementExperiment_createdByUserId_createdAt_idx" ON "TelegramAnnouncementExperiment"("createdByUserId", "createdAt");
CREATE INDEX "TelegramAnnouncementExperimentVariant_experimentId_createdAt_idx" ON "TelegramAnnouncementExperimentVariant"("experimentId", "createdAt");
CREATE UNIQUE INDEX "TelegramAnnouncementExperimentVariant_experimentId_variantKey_key" ON "TelegramAnnouncementExperimentVariant"("experimentId", "variantKey");
CREATE INDEX "SupportReplyTemplate_category_locale_createdAt_idx" ON "SupportReplyTemplate"("category", "locale", "createdAt");
CREATE INDEX "SupportReplyTemplate_statusAction_createdAt_idx" ON "SupportReplyTemplate"("statusAction", "createdAt");
CREATE INDEX "SupportReplyTemplate_createdByUserId_createdAt_idx" ON "SupportReplyTemplate"("createdByUserId", "createdAt");
CREATE INDEX "TelegramSupportThread_firstResponseDueAt_firstAdminReplyAt_status_idx" ON "TelegramSupportThread"("firstResponseDueAt", "firstAdminReplyAt", "status");
CREATE UNIQUE INDEX "TelegramUserProfile_referralCode_key" ON "TelegramUserProfile"("referralCode");
CREATE INDEX "TelegramUserProfile_referralCode_idx" ON "TelegramUserProfile"("referralCode");
CREATE INDEX "TelegramUserProfile_referredByCode_idx" ON "TelegramUserProfile"("referredByCode");
CREATE TABLE IF NOT EXISTS "SchedulerJobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "summary" TEXT,
    "error" TEXT,
    "resultPreview" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchedulerJobRun_jobKey_fkey" FOREIGN KEY ("jobKey") REFERENCES "SchedulerJob" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SchedulerJobRun_jobKey_startedAt_idx" ON "SchedulerJobRun"("jobKey", "startedAt");
CREATE INDEX "SchedulerJobRun_status_startedAt_idx" ON "SchedulerJobRun"("status", "startedAt");
CREATE TABLE IF NOT EXISTS "SchedulerJob" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "cadenceLabel" TEXT,
    "cronExpression" TEXT,
    "startupOnly" BOOLEAN NOT NULL DEFAULT false,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" DATETIME,
    "pausedReason" TEXT,
    "pausedBy" TEXT,
    "lastStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "lastTrigger" TEXT,
    "lastStartedAt" DATETIME,
    "lastFinishedAt" DATETIME,
    "lastSucceededAt" DATETIME,
    "lastDurationMs" INTEGER,
    "lastSummary" TEXT,
    "lastError" TEXT,
    "nextRunAt" DATETIME,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "SchedulerJob_category_updatedAt_idx" ON "SchedulerJob"("category", "updatedAt");
CREATE INDEX "SchedulerJob_lastStatus_updatedAt_idx" ON "SchedulerJob"("lastStatus", "updatedAt");
