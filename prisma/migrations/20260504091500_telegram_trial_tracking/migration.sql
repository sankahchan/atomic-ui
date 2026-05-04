-- AlterTable
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialKeyId" TEXT;
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialStartedAt" DATETIME;
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialExpiresAt" DATETIME;
