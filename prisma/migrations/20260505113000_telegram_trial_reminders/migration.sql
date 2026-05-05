-- AlterTable
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialMidpointReminderSentAt" DATETIME;
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialExpiringReminderSentAt" DATETIME;
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialExpiredNoticeSentAt" DATETIME;
ALTER TABLE "TelegramUserProfile" ADD COLUMN "trialWinbackNudgeSentAt" DATETIME;
