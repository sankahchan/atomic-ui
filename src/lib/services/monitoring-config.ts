import { db } from '@/lib/db';
import { getTelegramSalesSettings } from '@/lib/services/telegram-sales';

export const MONITORING_SETTINGS_KEY = 'ops_monitoring_settings';

export const MONITORING_SETTINGS_LIMITS = {
  backupVerificationAlertCooldownHours: { min: 0, max: 24 * 7 },
  telegramWebhookAlertCooldownMinutes: { min: 0, max: 24 * 60 },
  telegramWebhookPendingUpdateThreshold: { min: 1, max: 500 },
  adminQueueAlertCooldownHours: { min: 0, max: 24 * 7 },
  reviewQueueAlertHours: { min: 1, max: 24 * 7 },
} as const;

export type MonitoringSettings = {
  backupVerificationAlertCooldownHours: number;
  telegramWebhookAlertCooldownMinutes: number;
  telegramWebhookPendingUpdateThreshold: number;
  adminQueueAlertCooldownHours: number;
  reviewQueueAlertHours: number;
};

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function getDefaultMonitoringSettings(input?: {
  pendingReviewReminderHours?: number | null;
}): MonitoringSettings {
  const pendingReviewReminderHours =
    typeof input?.pendingReviewReminderHours === 'number' && Number.isFinite(input.pendingReviewReminderHours)
      ? Math.max(1, Math.trunc(input.pendingReviewReminderHours))
      : 6;

  return {
    backupVerificationAlertCooldownHours: 20,
    telegramWebhookAlertCooldownMinutes: 60,
    telegramWebhookPendingUpdateThreshold: 20,
    adminQueueAlertCooldownHours: 6,
    reviewQueueAlertHours: Math.max(6, pendingReviewReminderHours * 2),
  };
}

export function normalizeMonitoringSettings(
  value: unknown,
  input?: { pendingReviewReminderHours?: number | null },
): MonitoringSettings {
  const defaults = getDefaultMonitoringSettings(input);
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    backupVerificationAlertCooldownHours: clampInteger(
      record.backupVerificationAlertCooldownHours,
      defaults.backupVerificationAlertCooldownHours,
      MONITORING_SETTINGS_LIMITS.backupVerificationAlertCooldownHours.min,
      MONITORING_SETTINGS_LIMITS.backupVerificationAlertCooldownHours.max,
    ),
    telegramWebhookAlertCooldownMinutes: clampInteger(
      record.telegramWebhookAlertCooldownMinutes,
      defaults.telegramWebhookAlertCooldownMinutes,
      MONITORING_SETTINGS_LIMITS.telegramWebhookAlertCooldownMinutes.min,
      MONITORING_SETTINGS_LIMITS.telegramWebhookAlertCooldownMinutes.max,
    ),
    telegramWebhookPendingUpdateThreshold: clampInteger(
      record.telegramWebhookPendingUpdateThreshold,
      defaults.telegramWebhookPendingUpdateThreshold,
      MONITORING_SETTINGS_LIMITS.telegramWebhookPendingUpdateThreshold.min,
      MONITORING_SETTINGS_LIMITS.telegramWebhookPendingUpdateThreshold.max,
    ),
    adminQueueAlertCooldownHours: clampInteger(
      record.adminQueueAlertCooldownHours,
      defaults.adminQueueAlertCooldownHours,
      MONITORING_SETTINGS_LIMITS.adminQueueAlertCooldownHours.min,
      MONITORING_SETTINGS_LIMITS.adminQueueAlertCooldownHours.max,
    ),
    reviewQueueAlertHours: clampInteger(
      record.reviewQueueAlertHours,
      defaults.reviewQueueAlertHours,
      MONITORING_SETTINGS_LIMITS.reviewQueueAlertHours.min,
      MONITORING_SETTINGS_LIMITS.reviewQueueAlertHours.max,
    ),
  };
}

export async function getMonitoringSettings(): Promise<MonitoringSettings> {
  const [salesSettings, setting] = await Promise.all([
    getTelegramSalesSettings(),
    db.settings.findUnique({
      where: { key: MONITORING_SETTINGS_KEY },
      select: { value: true },
    }),
  ]);

  if (!setting?.value) {
    return getDefaultMonitoringSettings({
      pendingReviewReminderHours: salesSettings.pendingReviewReminderHours,
    });
  }

  try {
    return normalizeMonitoringSettings(JSON.parse(setting.value), {
      pendingReviewReminderHours: salesSettings.pendingReviewReminderHours,
    });
  } catch {
    return getDefaultMonitoringSettings({
      pendingReviewReminderHours: salesSettings.pendingReviewReminderHours,
    });
  }
}

export async function saveMonitoringSettings(input: MonitoringSettings): Promise<MonitoringSettings> {
  const salesSettings = await getTelegramSalesSettings();
  const normalized = normalizeMonitoringSettings(input, {
    pendingReviewReminderHours: salesSettings.pendingReviewReminderHours,
  });

  await db.settings.upsert({
    where: { key: MONITORING_SETTINGS_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: MONITORING_SETTINGS_KEY, value: JSON.stringify(normalized) },
  });

  return normalized;
}
