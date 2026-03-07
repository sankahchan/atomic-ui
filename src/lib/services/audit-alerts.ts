import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { enqueueNotificationDelivery } from '@/lib/services/notification-queue';
import {
  channelSupportsEvent,
  parseNotificationChannelRecord,
  sendNotificationToChannel,
} from '@/lib/services/notification-channels';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/services/telegram-bot';

export const AUDIT_ALERT_RULES_KEY = 'audit_alert_rules';
export const MAX_AUDIT_ALERT_RULES = 50;
export const MAX_AUDIT_ALERT_THROTTLE_MINUTES = 24 * 60;
export const MAX_AUDIT_ALERT_MATCH_WINDOW_MINUTES = 24 * 60;
export const MAX_AUDIT_ALERT_MIN_MATCHES = 50;

const auditAlertRuleBaseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean().default(true),
  actions: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  entities: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  actorIds: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  keywords: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  throttleMinutes: z.number().int().min(0).max(MAX_AUDIT_ALERT_THROTTLE_MINUTES).default(30),
  matchWindowMinutes: z.number().int().min(1).max(MAX_AUDIT_ALERT_MATCH_WINDOW_MINUTES).default(10),
  minMatches: z.number().int().min(1).max(MAX_AUDIT_ALERT_MIN_MATCHES).default(1),
});

export const auditAlertRuleSchema = auditAlertRuleBaseSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const upsertAuditAlertRuleSchema = auditAlertRuleBaseSchema.extend({
  id: z.string().min(1).optional(),
});

export type AuditAlertRule = z.infer<typeof auditAlertRuleSchema>;
export type AuditAlertRuleInput = z.infer<typeof upsertAuditAlertRuleSchema>;

interface AuditLogRecord {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: Date;
}

interface AuditAlertLogContext extends AuditLogRecord {
  userEmail: string | null;
  parsedDetails: Record<string, unknown> | null;
}

function parseDetails(details: string | null) {
  if (!details) return null;

  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return { raw: details };
  }
}

function normalizeStringList(values: string[], transform?: (value: string) => string) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => (transform ? transform(value) : value)),
    ),
  );
}

function normalizeRule(input: AuditAlertRuleInput, existingRule?: AuditAlertRule): AuditAlertRule {
  const now = new Date().toISOString();

  return {
    id: existingRule?.id ?? input.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    isActive: input.isActive,
    actions: normalizeStringList(input.actions, (value) => value.toUpperCase()),
    entities: normalizeStringList(input.entities, (value) => value.toUpperCase()),
    actorIds: normalizeStringList(input.actorIds),
    keywords: normalizeStringList(input.keywords, (value) => value.toLowerCase()),
    throttleMinutes: input.throttleMinutes,
    matchWindowMinutes: input.matchWindowMinutes,
    minMatches: input.minMatches,
    createdAt: existingRule?.createdAt ?? now,
    updatedAt: now,
  };
}

async function saveAuditAlertRules(rules: AuditAlertRule[]) {
  await db.settings.upsert({
    where: { key: AUDIT_ALERT_RULES_KEY },
    create: {
      key: AUDIT_ALERT_RULES_KEY,
      value: JSON.stringify(rules),
    },
    update: {
      value: JSON.stringify(rules),
    },
  });
}

export async function getAuditAlertRules(): Promise<AuditAlertRule[]> {
  const setting = await db.settings.findUnique({
    where: { key: AUDIT_ALERT_RULES_KEY },
    select: { value: true },
  });

  if (!setting) {
    return [];
  }

  try {
    const parsed = JSON.parse(setting.value);
    const result = z.array(auditAlertRuleSchema).safeParse(parsed);

    if (!result.success) {
      return [];
    }

    return result.data.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function upsertAuditAlertRule(input: AuditAlertRuleInput) {
  const currentRules = await getAuditAlertRules();
  const existingRule = input.id ? currentRules.find((rule) => rule.id === input.id) : undefined;

  if (!existingRule && currentRules.length >= MAX_AUDIT_ALERT_RULES) {
    throw new Error(`You can create up to ${MAX_AUDIT_ALERT_RULES} audit alert rules.`);
  }

  const nextRule = normalizeRule(input, existingRule);
  const nextRules = existingRule
    ? currentRules.map((rule) => (rule.id === nextRule.id ? nextRule : rule))
    : [nextRule, ...currentRules];

  await saveAuditAlertRules(nextRules);

  return {
    rule: nextRule,
    created: !existingRule,
    previousRule: existingRule ?? null,
  };
}

export async function deleteAuditAlertRule(id: string) {
  const currentRules = await getAuditAlertRules();
  const ruleToDelete = currentRules.find((rule) => rule.id === id) ?? null;

  if (!ruleToDelete) {
    return null;
  }

  await saveAuditAlertRules(currentRules.filter((rule) => rule.id !== id));
  return ruleToDelete;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSearchText(log: AuditAlertLogContext) {
  return [
    log.action,
    log.entity,
    log.entityId ?? '',
    log.userId ?? '',
    log.userEmail ?? '',
    log.ip ?? '',
    log.details ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function matchesRule(rule: AuditAlertRule, log: AuditAlertLogContext) {
  if (!rule.isActive) {
    return false;
  }

  if (rule.actions.length > 0 && !rule.actions.includes(log.action.toUpperCase())) {
    return false;
  }

  if (rule.entities.length > 0 && !rule.entities.includes(log.entity.toUpperCase())) {
    return false;
  }

  if (rule.actorIds.length > 0 && (!log.userId || !rule.actorIds.includes(log.userId))) {
    return false;
  }

  if (rule.keywords.length > 0) {
    const searchText = buildSearchText(log);
    if (!rule.keywords.some((keyword) => searchText.includes(keyword))) {
      return false;
    }
  }

  return true;
}

function formatAuditAlertMessage(rule: AuditAlertRule, log: AuditAlertLogContext) {
  const actor = log.userEmail || log.userId || 'System';
  const details = log.parsedDetails
    ? JSON.stringify(log.parsedDetails, null, 2).slice(0, 1200)
    : 'No structured details';

  return [
    '🚨 <b>Audit Alert</b>',
    '',
    `Rule: <b>${escapeHtml(rule.name)}</b>`,
    `Action: <code>${escapeHtml(log.action)}</code>`,
    `Entity: <code>${escapeHtml(log.entity)}</code>`,
    `Actor: <code>${escapeHtml(actor)}</code>`,
    `Target: <code>${escapeHtml(log.entityId ?? '-')}</code>`,
    `IP: <code>${escapeHtml(log.ip ?? '-')}</code>`,
    `Time: <code>${escapeHtml(log.createdAt.toISOString())}</code>`,
    rule.minMatches > 1
      ? `Threshold: <code>${escapeHtml(String(rule.minMatches))} events in ${escapeHtml(String(rule.matchWindowMinutes))} minutes</code>`
      : '',
    '',
    '<b>Details</b>',
    `<pre>${escapeHtml(details)}</pre>`,
  ].filter(Boolean).join('\n');
}

function formatAuditAlertTestMessage(rule: AuditAlertRule) {
  return [
    '🧪 <b>Audit Alert Test</b>',
    '',
    `Rule: <b>${escapeHtml(rule.name)}</b>`,
    'This is a test delivery for the audit alert rule.',
    '',
    `Actions: <code>${escapeHtml(rule.actions.join(', ') || 'Any')}</code>`,
    `Entities: <code>${escapeHtml(rule.entities.join(', ') || 'Any')}</code>`,
    `Keywords: <code>${escapeHtml(rule.keywords.join(', ') || 'Any')}</code>`,
    `Throttle: <code>${escapeHtml(String(rule.throttleMinutes))} minutes</code>`,
    `Threshold: <code>${escapeHtml(String(rule.minMatches))} in ${escapeHtml(String(rule.matchWindowMinutes))} minutes</code>`,
  ].join('\n');
}

export function shouldTriggerAuditAlert(rule: Pick<AuditAlertRule, 'minMatches'>, matchCount: number) {
  if (rule.minMatches <= 1) {
    return matchCount >= 1;
  }

  return matchCount === rule.minMatches;
}

async function countMatchingLogsForRule(rule: AuditAlertRule, currentLog: AuditAlertLogContext) {
  if (rule.minMatches <= 1) {
    return 1;
  }

  const windowStart = new Date(currentLog.createdAt.getTime() - rule.matchWindowMinutes * 60 * 1000);
  const logs = await db.auditLog.findMany({
    where: {
      createdAt: {
        gte: windowStart,
        lte: currentLog.createdAt,
      },
      ...(rule.actions.length > 0 ? { action: { in: rule.actions } } : {}),
      ...(rule.entities.length > 0 ? { entity: { in: rule.entities } } : {}),
      ...(rule.actorIds.length > 0 ? { userId: { in: rule.actorIds } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      action: true,
      entity: true,
      entityId: true,
      details: true,
      ip: true,
      createdAt: true,
    },
  });

  const userIds = Array.from(
    new Set(logs.map((log) => log.userId).filter((userId): userId is string => Boolean(userId))),
  );
  const users = userIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      })
    : [];
  const userEmailById = new Map(users.map((user) => [user.id, user.email]));

  return logs.filter((log) =>
    matchesRule(rule, {
      ...log,
      userEmail: log.userId ? (userEmailById.get(log.userId) ?? null) : null,
      parsedDetails: parseDetails(log.details),
    }),
  ).length;
}

async function shouldThrottleRule(rule: AuditAlertRule) {
  if (rule.throttleMinutes === 0) {
    return false;
  }

  const lastNotification = await db.notificationLog.findFirst({
    where: {
      event: `AUDIT_ALERT_${rule.id}`,
      status: 'SUCCESS',
      sentAt: {
        gte: new Date(Date.now() - rule.throttleMinutes * 60 * 1000),
      },
    },
    orderBy: { sentAt: 'desc' },
    select: { id: true },
  });

  return Boolean(lastNotification);
}

async function getActiveAuditAlertChannels() {
  const channels = await db.notificationChannel.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      isActive: true,
      config: true,
      events: true,
    },
  });

  return channels
    .map((channel) => parseNotificationChannelRecord(channel))
    .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
    .filter((channel) => channelSupportsEvent(channel, 'AUDIT_ALERT'));
}

async function sendAuditAlertToChannel(
  channel: Awaited<ReturnType<typeof getActiveAuditAlertChannels>>[number],
  payload: Record<string, unknown>,
  event: string,
  message: string,
) {
  const result = await sendNotificationToChannel({
    channel,
    event,
    message,
    payload,
    rawWebhookBody: channel.type === 'WEBHOOK',
  });

  return result.success ? { delivered: 1, failed: 0 } : { delivered: 0, failed: 1 };
}

async function sendTelegramAlert(
  rule: AuditAlertRule,
  event: string,
  message: string,
  logMessage: string,
) {
  const config = await getTelegramConfig();
  if (!config || !config.botToken || config.adminChatIds.length === 0) {
    return { delivered: 0, failed: 0, recipients: 0 };
  }

  let delivered = 0;
  let failed = 0;

  for (const chatId of config.adminChatIds) {
    const success = await sendTelegramMessage(config.botToken, chatId, message);

    await db.notificationLog.create({
      data: {
        event,
        message: logMessage,
        status: success ? 'SUCCESS' : 'FAILED',
        error: success ? null : `Failed to send Telegram alert to ${chatId}`,
      },
    });

    if (success) {
      delivered += 1;
    } else {
      failed += 1;
    }
  }

  return {
    delivered,
    failed,
    recipients: config.adminChatIds.length,
  };
}

async function dispatchAuditAlert(
  rule: AuditAlertRule,
  message: string,
  payload: Record<string, unknown>,
  event: string,
  logMessage: string,
  options?: {
    queueChannelDeliveries?: boolean;
  },
) {
  const channels = await getActiveAuditAlertChannels();
  const telegramResult = await sendTelegramAlert(rule, event, message, logMessage);

  let delivered = telegramResult.delivered;
  let failed = telegramResult.failed;
  let recipients = telegramResult.recipients;

  const queueChannelDeliveries = options?.queueChannelDeliveries ?? true;

  if (queueChannelDeliveries) {
    await Promise.all(
      channels.map((channel) =>
        enqueueNotificationDelivery({
          channelId: channel.id,
          event,
          message: logMessage,
          payload,
          payloadMode: channel.type === 'WEBHOOK' ? 'RAW' : 'WRAPPED',
        }),
      ),
    );
    recipients += channels.length;
  } else {
    for (const channel of channels) {
      const result = await sendAuditAlertToChannel(channel, payload, event, logMessage);
      delivered += result.delivered;
      failed += result.failed;
      recipients += 1;
    }
  }

  return {
    delivered,
    failed,
    recipients,
  };
}

async function buildAuditAlertLogContext(log: AuditLogRecord): Promise<AuditAlertLogContext> {
  const user = log.userId
    ? await db.user.findUnique({
        where: { id: log.userId },
        select: { email: true },
      })
    : null;

  return {
    ...log,
    userEmail: user?.email ?? null,
    parsedDetails: parseDetails(log.details),
  };
}

export async function testAuditAlertRule(id: string) {
  const rules = await getAuditAlertRules();
  const rule = rules.find((candidate) => candidate.id === id);

  if (!rule) {
    throw new Error('Audit alert rule not found.');
  }

  const message = formatAuditAlertTestMessage(rule);
  const result = await dispatchAuditAlert(
    rule,
    message,
    {
      type: 'audit_alert_test',
      rule,
      timestamp: new Date().toISOString(),
    },
    `AUDIT_ALERT_TEST_${rule.id}`,
    `Audit alert test sent for rule "${rule.name}"`,
    {
      queueChannelDeliveries: false,
    },
  );

  return {
    rule,
    ...result,
  };
}

export async function processAuditAlertForLog(log: AuditLogRecord) {
  const rules = await getAuditAlertRules();
  if (rules.length === 0) {
    return;
  }

  const logContext = await buildAuditAlertLogContext(log);

  for (const rule of rules) {
    if (!matchesRule(rule, logContext)) {
      continue;
    }

    const matchCount = await countMatchingLogsForRule(rule, logContext);
    if (!shouldTriggerAuditAlert(rule, matchCount)) {
      continue;
    }

    if (await shouldThrottleRule(rule)) {
      continue;
    }

    const message = formatAuditAlertMessage(rule, logContext);
    await dispatchAuditAlert(
      rule,
      message,
      {
        type: 'audit_alert',
        rule: {
          id: rule.id,
          name: rule.name,
          minMatches: rule.minMatches,
          matchWindowMinutes: rule.matchWindowMinutes,
        },
        matchCount,
        auditLog: {
          id: logContext.id,
          action: logContext.action,
          entity: logContext.entity,
          entityId: logContext.entityId,
          userId: logContext.userId,
          userEmail: logContext.userEmail,
          ip: logContext.ip,
          createdAt: logContext.createdAt.toISOString(),
          details: logContext.parsedDetails,
        },
      },
      `AUDIT_ALERT_${rule.id}`,
      `Audit alert rule "${rule.name}" matched ${logContext.action} on ${logContext.entity}`,
    );
  }
}
