-- AlterTable
ALTER TABLE "AccessKey" ADD COLUMN "boundDeviceInstallsOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DynamicAccessKey" ADD COLUMN "boundDeviceInstallsOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DynamicKeyTemplate" ADD COLUMN "boundDeviceInstallsOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DeviceInstallClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessKeyId" TEXT,
    "dynamicAccessKeyId" TEXT,
    "deviceTokenHash" TEXT NOT NULL,
    "platform" TEXT,
    "userAgent" TEXT,
    "firstIp" TEXT,
    "lastIp" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceInstallClaim_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviceInstallClaim_dynamicAccessKeyId_fkey" FOREIGN KEY ("dynamicAccessKeyId") REFERENCES "DynamicAccessKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceInstallClaim_accessKeyId_deviceTokenHash_key" ON "DeviceInstallClaim"("accessKeyId", "deviceTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceInstallClaim_dynamicAccessKeyId_deviceTokenHash_key" ON "DeviceInstallClaim"("dynamicAccessKeyId", "deviceTokenHash");

-- CreateIndex
CREATE INDEX "DeviceInstallClaim_accessKeyId_revokedAt_idx" ON "DeviceInstallClaim"("accessKeyId", "revokedAt");

-- CreateIndex
CREATE INDEX "DeviceInstallClaim_dynamicAccessKeyId_revokedAt_idx" ON "DeviceInstallClaim"("dynamicAccessKeyId", "revokedAt");
