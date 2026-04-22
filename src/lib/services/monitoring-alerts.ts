import { createHash } from 'node:crypto';

import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { getConfiguredPublicAppOrigin, getPublicBasePath } from '@/lib/subscription-links';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import { getTelegramSalesSettings } from '@/lib/services/telegram-sales';
import { type BackupVerificationSummary } from '@/lib/services/backup-verification';
import { escapeHtml, formatTelegramDateTime } from '@/lib/services/telegram-ui';
import {
  getTelegramConfig,
  sendTelegramMessageDetailed,
} from '@/lib/services/telegram-runtime';

const BACKUP_VERIFICATION_ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const TELEGRAM_WEBHOOK_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const ADMIN_QUEUE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const TELEGRAM_WEBHOOK_BACKLOG_THRESHOLD = 20;
const MIN_REVIEW_QUEUE_ALERT_HOURS = 6;

type MonitoringAlertDispatchResult = {
  skipped: boolean;
  reason?: 'not_configured' | 'cooldown';
  delivered: number;
  failed: number;
  errors: string[];
};

type MonitoringAlertKeyboard = {
  inline_keyboard: Array<Array<{
    text: string;
    callback_data?: string;
    url?: string;
  }>>;
};

export type TelegramWebhookMonitorIssue = {
  healthy: boolean;
  issueCode: string | null;
  fingerprint: string | null;
  summary: string | null;
  currentWebhookUrl: string | null;
  expectedWebhookUrl: string | null;
  pendingUpdateCount: number;
  lastErrorMessage: string | null;
  lastErrorAt: Date | null;
};

function formatDurationMinutes(totalMinutes: number, locale: SupportedLocale) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return locale === 'my' ? `${minutes} မိနစ်` : `${minutes}m`;
  }

  if (minutes === 0) {
    return locale === 'my' ? `${hours} နာရီ` : `${hours}h`;
  }

  return locale === 'my'
    ? `${hours} နာရီ ${minutes} မိနစ်`
    : `${hours}h ${minutes}m`;
}

function buildMonitoringEventKey(prefix: string, fingerprint: string) {
  const digest = createHash('sha1').update(fingerprint).digest('hex').slice(0, 16);
  return `${prefix}_${digest}`;
}

async function hasRecentSuccessfulMonitoringAlert(event: string, cooldownMs: number) {
  if (cooldownMs <= 0) {
    return false;
  }

  const recent = await db.notificationLog.findFirst({
    where: {
      event,
      status: 'SUCCESS',
      sentAt: {
        gte: new Date(Date.now() - cooldownMs),
      },
    },
    select: { id: true },
  });

  return Boolean(recent);
}

async function dispatchMonitoringAdminAlert(input: {
  event: string;
  message: string;
  cooldownMs: number;
  replyMarkup?: MonitoringAlertKeyboard;
}) {
  const config = await getTelegramConfig();
  if (!config?.botToken || config.adminChatIds.length === 0) {
    return {
      skipped: true,
      reason: 'not_configured',
      delivered: 0,
      failed: 0,
      errors: [],
    } satisfies MonitoringAlertDispatchResult;
  }

  if (await hasRecentSuccessfulMonitoringAlert(input.event, input.cooldownMs)) {
    return {
      skipped: true,
      reason: 'cooldown',
      delivered: 0,
      failed: 0,
      errors: [],
    } satisfies MonitoringAlertDispatchResult;
  }

  let delivered = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const chatId of config.adminChatIds) {
    const result = await sendTelegramMessageDetailed(config.botToken, chatId, input.message, {
      replyMarkup: input.replyMarkup,
    });

    if (result.success) {
      delivered += 1;
    } else {
      failed += 1;
      errors.push(result.error || `Failed to send Telegram monitoring alert to ${chatId}`);
    }
  }

  await db.notificationLog.create({
    data: {
      event: input.event,
      message: input.message,
      status: delivered > 0 ? 'SUCCESS' : 'FAILED',
      error: errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null,
    },
  });

  return {
    skipped: false,
    delivered,
    failed,
    errors,
  } satisfies MonitoringAlertDispatchResult;
}

export function resolveTelegramWebhookMonitorIssue(input: {
  webhookSecretConfigured: boolean;
  expectedWebhookUrl: string | null;
  webhookInfo: {
    url?: string | null;
    pending_update_count?: number | null;
    last_error_date?: number | null;
    last_error_message?: string | null;
  } | null;
}) {
  const currentWebhookUrl =
    typeof input.webhookInfo?.url === 'string' && input.webhookInfo.url.trim().length > 0
      ? input.webhookInfo.url.trim()
      : null;
  const pendingUpdateCount =
    typeof input.webhookInfo?.pending_update_count === 'number' && Number.isFinite(input.webhookInfo.pending_update_count)
      ? Math.max(0, input.webhookInfo.pending_update_count)
      : 0;
  const lastErrorMessage =
    typeof input.webhookInfo?.last_error_message === 'string' && input.webhookInfo.last_error_message.trim().length > 0
      ? input.webhookInfo.last_error_message.trim()
      : null;
  const lastErrorAt =
    typeof input.webhookInfo?.last_error_date === 'number' && input.webhookInfo.last_error_date > 0
      ? new Date(input.webhookInfo.last_error_date * 1000)
      : null;

  const issueCodes: string[] = [];
  const summaries: string[] = [];

  if (!input.webhookSecretConfigured) {
    issueCodes.push('missing_secret');
    summaries.push('missing secret token');
  }

  if (!currentWebhookUrl) {
    issueCodes.push('missing_url');
    summaries.push('webhook is not set');
  }

  if (currentWebhookUrl && input.expectedWebhookUrl && currentWebhookUrl !== input.expectedWebhookUrl) {
    issueCodes.push('url_mismatch');
    summaries.push('URL mismatch');
  }

  if (lastErrorMessage) {
    issueCodes.push('delivery_error');
    summaries.push('Telegram reported delivery errors');
  }

  if (pendingUpdateCount >= TELEGRAM_WEBHOOK_BACKLOG_THRESHOLD) {
    issueCodes.push('pending_backlog');
    summaries.push(`pending backlog (${pendingUpdateCount})`);
  }

  if (issueCodes.length === 0) {
    return {
      healthy: true,
      issueCode: null,
      fingerprint: null,
      summary: null,
      currentWebhookUrl,
      expectedWebhookUrl: input.expectedWebhookUrl,
      pendingUpdateCount,
      lastErrorMessage,
      lastErrorAt,
    } satisfies TelegramWebhookMonitorIssue;
  }

  return {
    healthy: false,
    issueCode: issueCodes.join(','),
    fingerprint: [
      issueCodes.join(','),
      currentWebhookUrl || 'none',
      input.expectedWebhookUrl || 'none',
      String(pendingUpdateCount),
      lastErrorMessage || 'none',
      lastErrorAt?.toISOString() || 'none',
    ].join('|'),
    summary: summaries.join(', '),
    currentWebhookUrl,
    expectedWebhookUrl: input.expectedWebhookUrl,
    pendingUpdateCount,
    lastErrorMessage,
    lastErrorAt,
  } satisfies TelegramWebhookMonitorIssue;
}

export function buildBackupVerificationFailureAlertMessage(input: {
  failures: Array<Pick<BackupVerificationSummary, 'filename' | 'error' | 'restoreReady'> & { verifiedAt?: Date }>;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  const lines = [
    isMyanmar
      ? '🚨 <b>Backup verification failed</b>'
      : '🚨 <b>Backup verification failed</b>',
    '',
    isMyanmar
      ? `နောက်ဆုံး verify လုပ်ထားသော backup ${input.failures.length} ခုတွင် failure တွေတွေ့ရှိထားပါသည်။`
      : `The latest backup verification run found ${input.failures.length} failed backup(s).`,
  ];

  for (const failure of input.failures.slice(0, 3)) {
    lines.push(
      '',
      `📦 <b>${escapeHtml(failure.filename)}</b>`,
      `${isMyanmar ? 'Restore ready' : 'Restore ready'}: <b>${failure.restoreReady ? (isMyanmar ? 'Yes' : 'Yes') : (isMyanmar ? 'No' : 'No')}</b>`,
      `${isMyanmar ? 'Checked at' : 'Checked at'}: <b>${escapeHtml(formatTelegramDateTime(failure.verifiedAt || new Date(), input.locale))}</b>`,
      `${isMyanmar ? 'Error' : 'Error'}: ${escapeHtml(failure.error || (isMyanmar ? 'Unknown verification failure' : 'Unknown verification failure'))}`,
    );
  }

  if (input.failures.length > 3) {
    lines.push(
      '',
      isMyanmar
        ? `နောက်ထပ် ${input.failures.length - 3} ခုကို dashboard ၏ Backup & Restore တွင် စစ်နိုင်ပါသည်။`
        : `Check the remaining ${input.failures.length - 3} failure(s) in the Backup & Restore dashboard.`,
    );
  } else {
    lines.push(
      '',
      isMyanmar
        ? 'Backup & Restore dashboard ထဲတွင် failure detail ကို စစ်ဆေးပါ။'
        : 'Open the Backup & Restore dashboard to inspect the failed verification details.',
    );
  }

  return lines.join('\n');
}

export function buildTelegramWebhookHealthAlertMessage(input: {
  issue: TelegramWebhookMonitorIssue;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  const lines = [
    isMyanmar
      ? '🚨 <b>Telegram webhook health issue</b>'
      : '🚨 <b>Telegram webhook health issue</b>',
    '',
    `${isMyanmar ? 'Issue' : 'Issue'}: <b>${escapeHtml(input.issue.summary || (isMyanmar ? 'Unknown issue' : 'Unknown issue'))}</b>`,
    `${isMyanmar ? 'Expected URL' : 'Expected URL'}: <code>${escapeHtml(input.issue.expectedWebhookUrl || (isMyanmar ? 'Not configured' : 'Not configured'))}</code>`,
    `${isMyanmar ? 'Current URL' : 'Current URL'}: <code>${escapeHtml(input.issue.currentWebhookUrl || (isMyanmar ? 'Not set' : 'Not set'))}</code>`,
    `${isMyanmar ? 'Pending updates' : 'Pending updates'}: <b>${escapeHtml(String(input.issue.pendingUpdateCount))}</b>`,
  ];

  if (input.issue.lastErrorMessage) {
    lines.push(
      `${isMyanmar ? 'Last error' : 'Last error'}: ${escapeHtml(input.issue.lastErrorMessage)}`,
    );
  }

  if (input.issue.lastErrorAt) {
    lines.push(
      `${isMyanmar ? 'Last error at' : 'Last error at'}: <b>${escapeHtml(formatTelegramDateTime(input.issue.lastErrorAt, input.locale))}</b>`,
    );
  }

  lines.push(
    '',
    isMyanmar
      ? 'Notifications workspace ထဲတွင် webhook status ကို စစ်ပြီး လိုအပ်ပါက webhook ကို reset လုပ်ပါ။'
      : 'Check the Notifications workspace and reset the webhook if the public URL or HTTPS setup changed.',
  );

  return lines.join('\n');
}

export function buildAdminQueueHealthAlertMessage(input: {
  locale: SupportedLocale;
  supportOverdueCount: number;
  oldestSupportOverdueMinutes: number | null;
  supportThreadCodes: string[];
  pendingReviewCount: number;
  unclaimedReviewCount: number;
  oldestReviewAgeMinutes: number | null;
  reviewOrderCodes: string[];
  reviewThresholdHours: number;
}) {
  const isMyanmar = input.locale === 'my';
  const lines = [
    isMyanmar
      ? '🚨 <b>Admin queue aging</b>'
      : '🚨 <b>Admin queue aging</b>',
    '',
  ];

  if (input.supportOverdueCount > 0) {
    lines.push(
      `${isMyanmar ? 'Support overdue' : 'Support overdue'}: <b>${escapeHtml(String(input.supportOverdueCount))}</b>${input.oldestSupportOverdueMinutes !== null ? ` • <b>${escapeHtml(formatDurationMinutes(input.oldestSupportOverdueMinutes, input.locale))}</b> ${isMyanmar ? 'ကျော်နေ' : 'oldest overdue'}` : ''}`,
    );
    if (input.supportThreadCodes.length > 0) {
      lines.push(
        `${isMyanmar ? 'Threads' : 'Threads'}: <code>${escapeHtml(input.supportThreadCodes.join(', '))}</code>`,
      );
    }
  }

  if (input.pendingReviewCount > 0) {
    lines.push(
      `${isMyanmar ? 'Review pending' : 'Review pending'}: <b>${escapeHtml(String(input.pendingReviewCount))}</b>${input.oldestReviewAgeMinutes !== null ? ` • <b>${escapeHtml(formatDurationMinutes(input.oldestReviewAgeMinutes, input.locale))}</b> ${isMyanmar ? 'စောင့်နေ' : 'oldest waiting'}` : ''}`,
    );
    lines.push(
      `${isMyanmar ? 'Unclaimed' : 'Unclaimed'}: <b>${escapeHtml(String(input.unclaimedReviewCount))}</b>`,
    );
    if (input.reviewOrderCodes.length > 0) {
      lines.push(
        `${isMyanmar ? 'Orders' : 'Orders'}: <code>${escapeHtml(input.reviewOrderCodes.join(', '))}</code>`,
      );
    }
  }

  lines.push(
    '',
    isMyanmar
      ? `Review queue ကို ${input.reviewThresholdHours} နာရီထက် ပိုစောင့်နေသော item များအတွက် alert ပို့ထားပါသည်။`
      : `This alert fires when review items wait longer than ${input.reviewThresholdHours} hour(s) or support first-response SLA is overdue.`,
  );

  return lines.join('\n');
}

function buildAdminQueueHealthKeyboard(locale: SupportedLocale): MonitoringAlertKeyboard {
  return {
    inline_keyboard: [
      [
        {
          text: locale === 'my' ? '📋 Review queue' : '📋 Review queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
        },
        {
          text: locale === 'my' ? '🛟 Support queue' : '🛟 Support queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue'),
        },
      ],
      [
        {
          text: locale === 'my' ? '🧭 Admin home' : '🧭 Admin home',
          callback_data: buildTelegramMenuCallbackData('admin', 'home'),
        },
      ],
    ],
  };
}

export async function runBackupVerificationFailureAlertCycle(input: {
  results: Array<BackupVerificationSummary & { id?: string; verifiedAt?: Date }>;
}) {
  const config = await getTelegramConfig();
  const locale = config?.defaultLanguage || 'en';
  const failures = input.results.filter((item) => item.status === 'FAILED');

  if (failures.length === 0) {
    return {
      skipped: true,
      reason: 'healthy',
      failedCount: 0,
      alerted: 0,
      suppressed: 0,
      errors: [] as string[],
    };
  }

  const event = buildMonitoringEventKey(
    'MONITOR_BACKUP_VERIFICATION_FAILED',
    failures
      .map((item) => [item.filename, item.fileHashSha256, item.error].join('|'))
      .sort()
      .join('||'),
  );

  const dispatch = await dispatchMonitoringAdminAlert({
    event,
    message: buildBackupVerificationFailureAlertMessage({
      failures: failures.map((item) => ({
        filename: item.filename,
        error: item.error,
        verifiedAt: item.verifiedAt,
        restoreReady: item.restoreReady,
      })),
      locale,
    }),
    cooldownMs: BACKUP_VERIFICATION_ALERT_COOLDOWN_MS,
  });

  return {
    skipped: false,
    failedCount: failures.length,
    alerted: dispatch.delivered > 0 ? 1 : 0,
    suppressed: dispatch.skipped ? 1 : 0,
    errors: dispatch.errors,
  };
}

export async function runTelegramWebhookHealthAlertCycle(input?: {
  fetchImpl?: typeof fetch;
}) {
  const config = await getTelegramConfig();
  if (!config?.botToken || config.adminChatIds.length === 0) {
    return {
      skipped: true,
      reason: 'not_configured',
      healthy: true,
      alerted: 0,
      suppressed: 0,
      errors: [] as string[],
      pendingUpdateCount: 0,
    };
  }

  const fetchImpl = input?.fetchImpl || fetch;
  const expectedOrigin = getConfiguredPublicAppOrigin();
  const expectedWebhookUrl = expectedOrigin ? `${expectedOrigin}${getPublicBasePath()}/api/telegram/webhook` : null;
  const locale = config.defaultLanguage || 'en';

  let issue: TelegramWebhookMonitorIssue;
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/getWebhookInfo`);
    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: {
        url?: string | null;
        pending_update_count?: number | null;
        last_error_date?: number | null;
        last_error_message?: string | null;
      } | null;
    };

    if (!response.ok || payload.ok !== true || !payload.result) {
      issue = {
        healthy: false,
        issueCode: 'telegram_api_error',
        fingerprint: ['telegram_api_error', String(response.status), payload.description || 'unknown'].join('|'),
        summary: payload.description || `Telegram API returned ${response.status}`,
        currentWebhookUrl: null,
        expectedWebhookUrl,
        pendingUpdateCount: 0,
        lastErrorMessage: payload.description || null,
        lastErrorAt: null,
      };
    } else {
      issue = resolveTelegramWebhookMonitorIssue({
        webhookSecretConfigured: Boolean(config.webhookSecretToken),
        expectedWebhookUrl,
        webhookInfo: payload.result,
      });
    }
  } catch (error) {
    issue = {
      healthy: false,
      issueCode: 'request_failed',
      fingerprint: ['request_failed', error instanceof Error ? error.message : 'unknown'].join('|'),
      summary: error instanceof Error ? error.message : 'Failed to query Telegram webhook info',
      currentWebhookUrl: null,
      expectedWebhookUrl,
      pendingUpdateCount: 0,
      lastErrorMessage: error instanceof Error ? error.message : 'Failed to query Telegram webhook info',
      lastErrorAt: null,
    };
  }

  if (issue.healthy || !issue.fingerprint) {
    return {
      skipped: true,
      reason: 'healthy',
      healthy: true,
      alerted: 0,
      suppressed: 0,
      errors: [] as string[],
      pendingUpdateCount: issue.pendingUpdateCount,
    };
  }

  const dispatch = await dispatchMonitoringAdminAlert({
    event: buildMonitoringEventKey('MONITOR_TELEGRAM_WEBHOOK_HEALTH', issue.fingerprint),
    message: buildTelegramWebhookHealthAlertMessage({
      issue,
      locale,
    }),
    cooldownMs: TELEGRAM_WEBHOOK_ALERT_COOLDOWN_MS,
  });

  return {
    skipped: false,
    healthy: false,
    issueCode: issue.issueCode,
    alerted: dispatch.delivered > 0 ? 1 : 0,
    suppressed: dispatch.skipped ? 1 : 0,
    errors: dispatch.errors,
    pendingUpdateCount: issue.pendingUpdateCount,
  };
}

export async function runAdminQueueHealthAlertCycle(input?: {
  now?: Date;
}) {
  const config = await getTelegramConfig();
  if (!config?.botToken || config.adminChatIds.length === 0) {
    return {
      skipped: true,
      reason: 'not_configured',
      healthy: true,
      alerted: 0,
      suppressed: 0,
      supportOverdueCount: 0,
      pendingReviewCount: 0,
      errors: [] as string[],
    };
  }

  const now = input?.now || new Date();
  const locale = config.defaultLanguage || 'en';
  const salesSettings = await getTelegramSalesSettings();
  const reviewThresholdHours = Math.max(MIN_REVIEW_QUEUE_ALERT_HOURS, salesSettings.pendingReviewReminderHours * 2);
  const reviewThresholdMs = reviewThresholdHours * 60 * 60 * 1000;

  const [
    supportOverdueCount,
    oldestSupportThreads,
    pendingReviewCount,
    unclaimedReviewCount,
    oldestReviewOrders,
  ] = await Promise.all([
    db.telegramSupportThread.count({
      where: {
        status: { in: ['OPEN', 'ESCALATED'] },
        firstAdminReplyAt: null,
        firstResponseDueAt: { lte: now },
      },
    }),
    db.telegramSupportThread.findMany({
      where: {
        status: { in: ['OPEN', 'ESCALATED'] },
        firstAdminReplyAt: null,
        firstResponseDueAt: { lte: now },
      },
      orderBy: [{ firstResponseDueAt: 'asc' }, { createdAt: 'asc' }],
      take: 3,
      select: {
        id: true,
        threadCode: true,
        firstResponseDueAt: true,
      },
    }),
    db.telegramOrder.count({
      where: {
        status: 'PENDING_REVIEW',
        reviewedAt: null,
      },
    }),
    db.telegramOrder.count({
      where: {
        status: 'PENDING_REVIEW',
        reviewedAt: null,
        assignedReviewerUserId: null,
      },
    }),
    db.telegramOrder.findMany({
      where: {
        status: 'PENDING_REVIEW',
        reviewedAt: null,
      },
      orderBy: [{ paymentSubmittedAt: 'asc' }, { createdAt: 'asc' }],
      take: 3,
      select: {
        id: true,
        orderCode: true,
        paymentSubmittedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const oldestSupportDue = oldestSupportThreads[0]?.firstResponseDueAt || null;
  const oldestSupportOverdueMinutes = oldestSupportDue
    ? Math.max(0, Math.round((now.getTime() - oldestSupportDue.getTime()) / 60000))
    : null;
  const oldestReviewBaseline =
    oldestReviewOrders[0]
      ? (oldestReviewOrders[0].paymentSubmittedAt || oldestReviewOrders[0].updatedAt || oldestReviewOrders[0].createdAt)
      : null;
  const oldestReviewAgeMinutes = oldestReviewBaseline
    ? Math.max(0, Math.round((now.getTime() - oldestReviewBaseline.getTime()) / 60000))
    : null;
  const reviewBreached = oldestReviewBaseline
    ? now.getTime() - oldestReviewBaseline.getTime() >= reviewThresholdMs
    : false;

  if (supportOverdueCount === 0 && !reviewBreached) {
    return {
      skipped: true,
      reason: 'healthy',
      healthy: true,
      alerted: 0,
      suppressed: 0,
      supportOverdueCount,
      pendingReviewCount,
      errors: [] as string[],
    };
  }

  const fingerprint = [
    supportOverdueCount,
    oldestSupportThreads.map((thread) => thread.id).join(','),
    pendingReviewCount,
    unclaimedReviewCount,
    oldestReviewOrders.map((order) => order.id).join(','),
    oldestReviewAgeMinutes ? Math.floor(oldestReviewAgeMinutes / 60) : 'none',
  ].join('|');

  const dispatch = await dispatchMonitoringAdminAlert({
    event: buildMonitoringEventKey('MONITOR_ADMIN_QUEUE_HEALTH', fingerprint),
    message: buildAdminQueueHealthAlertMessage({
      locale,
      supportOverdueCount,
      oldestSupportOverdueMinutes,
      supportThreadCodes: oldestSupportThreads.map((thread) => thread.threadCode),
      pendingReviewCount,
      unclaimedReviewCount,
      oldestReviewAgeMinutes,
      reviewOrderCodes: oldestReviewOrders.map((order) => order.orderCode),
      reviewThresholdHours,
    }),
    cooldownMs: ADMIN_QUEUE_ALERT_COOLDOWN_MS,
    replyMarkup: buildAdminQueueHealthKeyboard(locale),
  });

  return {
    skipped: false,
    healthy: false,
    alerted: dispatch.delivered > 0 ? 1 : 0,
    suppressed: dispatch.skipped ? 1 : 0,
    supportOverdueCount,
    pendingReviewCount,
    unclaimedReviewCount,
    oldestSupportOverdueMinutes,
    oldestReviewAgeMinutes,
    errors: dispatch.errors,
  };
}
