import type { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { adminProcedure, router } from '../trpc';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import {
  MAX_NOTIFICATION_COOLDOWN_MINUTES,
  MAX_NOTIFICATION_WEBHOOK_HEADERS,
  NOTIFICATION_WEBHOOK_RESERVED_HEADERS,
  channelSupportsEvent,
  isValidWebhookHeaderName,
  notificationChannelTypeSchema,
  notificationEventSchema,
  parseNotificationChannelRecord,
  sendNotificationToChannel,
} from '@/lib/services/notification-channels';
import {
  enqueueNotificationDelivery,
  getNotificationQueueStatus,
  NOTIFICATION_DELIVERY_STATUSES,
  processNotificationQueue,
} from '@/lib/services/notification-queue';

const webhookHeaderSchema = z.object({
  key: z.string().max(100),
  value: z.string().max(1000),
});

const saveChannelSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    type: notificationChannelTypeSchema,
    isActive: z.boolean().default(true),
    events: z.array(notificationEventSchema).max(25).default([]),
    cooldownMinutes: z.number().int().min(0).max(MAX_NOTIFICATION_COOLDOWN_MINUTES).default(0),
    eventCooldowns: z.record(notificationEventSchema, z.number().int().min(0).max(MAX_NOTIFICATION_COOLDOWN_MINUTES)).default({}),
    telegramChatId: z.string().trim().optional(),
    email: z.string().email().optional(),
    webhookUrl: z.string().url().optional(),
    webhookSigningSecret: z.string().trim().max(500).optional(),
    webhookHeaders: z.array(webhookHeaderSchema).max(MAX_NOTIFICATION_WEBHOOK_HEADERS).default([]),
  })
  .superRefine((input, ctx) => {
    if (input.type === 'TELEGRAM' && !input.telegramChatId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Telegram chat ID is required',
        path: ['telegramChatId'],
      });
    }

    if (input.type === 'EMAIL' && !input.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email address is required',
        path: ['email'],
      });
    }

    if (input.type === 'WEBHOOK' && !input.webhookUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Webhook URL is required',
        path: ['webhookUrl'],
      });
    }

    if (input.type === 'WEBHOOK') {
      const seenHeaders = new Set<string>();

      for (let index = 0; index < input.webhookHeaders.length; index += 1) {
        const header = input.webhookHeaders[index];
        const key = header.key.trim();
        const value = header.value.trim();

        if (!key && !value) {
          continue;
        }

        if (!key || !isValidWebhookHeaderName(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Webhook headers must use valid HTTP header names',
            path: ['webhookHeaders', index, 'key'],
          });
          continue;
        }

        const normalizedKey = key.toLowerCase();
        if (NOTIFICATION_WEBHOOK_RESERVED_HEADERS.includes(normalizedKey as (typeof NOTIFICATION_WEBHOOK_RESERVED_HEADERS)[number])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Webhook headers cannot override reserved Atomic-UI headers',
            path: ['webhookHeaders', index, 'key'],
          });
          continue;
        }

        if (seenHeaders.has(normalizedKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Webhook header names must be unique',
            path: ['webhookHeaders', index, 'key'],
          });
          continue;
        }

        seenHeaders.add(normalizedKey);
      }
    }
  });

function parseConfig(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildChannelConfig(
  input: z.infer<typeof saveChannelSchema>,
  existingConfig: Record<string, unknown>,
) {
  switch (input.type) {
    case 'TELEGRAM':
      return {
        ...existingConfig,
        chatId: input.telegramChatId ?? '',
        cooldownMinutes: String(input.cooldownMinutes),
        eventCooldowns: JSON.stringify(input.eventCooldowns),
      };
    case 'EMAIL':
      return {
        ...existingConfig,
        email: input.email ?? '',
        cooldownMinutes: String(input.cooldownMinutes),
        eventCooldowns: JSON.stringify(input.eventCooldowns),
      };
    case 'WEBHOOK':
      return {
        ...existingConfig,
        url: input.webhookUrl ?? '',
        headers: JSON.stringify(buildWebhookHeaders(input.webhookHeaders)),
        signingSecret: input.webhookSigningSecret?.trim() ?? '',
        cooldownMinutes: String(input.cooldownMinutes),
        eventCooldowns: JSON.stringify(input.eventCooldowns),
      };
  }
}

function buildWebhookHeaders(headers: z.infer<typeof webhookHeaderSchema>[]) {
  const next: Record<string, string> = {};

  for (const header of headers) {
    const key = header.key.trim();
    const value = header.value.trim();

    if (!key && !value) {
      continue;
    }

    next[key] = value;
  }

  return next;
}

function getWebhookHeaderCount(config: Record<string, unknown>) {
  const value = config.headers;
  if (typeof value !== 'string') {
    return 0;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 0;
    }

    return Object.keys(parsed).length;
  } catch {
    return 0;
  }
}

const notificationLogFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(15),
  channelId: z.string().min(1).optional(),
  status: z.enum(['ALL', 'SUCCESS', 'FAILED', 'SKIPPED']).default('ALL'),
  search: z.string().trim().max(200).optional(),
});

function buildNotificationLogWhere(
  input?: z.infer<typeof notificationLogFiltersSchema>,
): Prisma.NotificationLogWhereInput {
  const where: Prisma.NotificationLogWhereInput = {};

  if (input?.channelId) {
    where.channelId = input.channelId;
  }

  if (input?.status && input.status !== 'ALL') {
    where.status = input.status;
  }

  if (input?.search) {
    where.OR = [
      { event: { contains: input.search } },
      { message: { contains: input.search } },
      { error: { contains: input.search } },
      { accessKeyId: { contains: input.search } },
    ];
  }

  return where;
}

export const notificationsRouter = router({
  listChannels: adminProcedure.query(async () => {
    const channels = await db.notificationChannel.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return channels
      .map((channel) => parseNotificationChannelRecord(channel))
      .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel));
  }),
  queueStatus: adminProcedure.query(async () => getNotificationQueueStatus()),
  saveChannel: adminProcedure
    .input(saveChannelSchema)
    .mutation(async ({ ctx, input }) => {
      const existingChannel = input.id
        ? await db.notificationChannel.findUnique({
            where: { id: input.id },
          })
        : null;

      if (input.id && !existingChannel) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification channel not found',
        });
      }

      const existingConfig = existingChannel ? parseConfig(existingChannel.config) : {};
      const webhookHeaderCount = input.type === 'WEBHOOK' ? Object.keys(buildWebhookHeaders(input.webhookHeaders)).length : 0;
      const channel = await db.notificationChannel.upsert({
        where: { id: input.id ?? '__create__' },
        create: {
          name: input.name,
          type: input.type,
          isActive: input.isActive,
          config: JSON.stringify(buildChannelConfig(input, existingConfig)),
          events: JSON.stringify(input.events),
        },
        update: {
          name: input.name,
          type: input.type,
          isActive: input.isActive,
          config: JSON.stringify(buildChannelConfig(input, existingConfig)),
          events: JSON.stringify(input.events),
        },
      });

      const parsedChannel = parseNotificationChannelRecord(channel);
      if (!parsedChannel) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to parse saved notification channel',
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: existingChannel ? 'NOTIFICATION_CHANNEL_UPDATE' : 'NOTIFICATION_CHANNEL_CREATE',
        entity: 'NOTIFICATION_CHANNEL',
        entityId: channel.id,
        details: {
          name: parsedChannel.name,
          type: parsedChannel.type,
          isActive: parsedChannel.isActive,
          events: parsedChannel.events,
          cooldownMinutes: input.cooldownMinutes,
          eventCooldowns: input.eventCooldowns,
          webhookHeaderCount,
          webhookSigningEnabled: input.type === 'WEBHOOK' ? Boolean(input.webhookSigningSecret?.trim()) : false,
          previousName: existingChannel?.name ?? null,
          previousType: existingChannel?.type ?? null,
          previousWebhookHeaderCount: existingChannel ? getWebhookHeaderCount(existingConfig) : 0,
          previousWebhookSigningEnabled: Boolean(
            existingChannel && typeof existingConfig.signingSecret === 'string' && existingConfig.signingSecret.trim(),
          ),
        },
      });

      return parsedChannel;
    }),
  deleteChannel: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existingChannel = await db.notificationChannel.findUnique({
        where: { id: input.id },
      });

      if (!existingChannel) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification channel not found',
        });
      }

      await db.notificationChannel.delete({
        where: { id: input.id },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'NOTIFICATION_CHANNEL_DELETE',
        entity: 'NOTIFICATION_CHANNEL',
        entityId: existingChannel.id,
        details: {
          name: existingChannel.name,
          type: existingChannel.type,
        },
      });

      return { success: true };
    }),
  listLogs: adminProcedure
    .input(notificationLogFiltersSchema.optional())
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 15;
      const where = buildNotificationLogWhere(input);

      const [logs, total] = await Promise.all([
        db.notificationLog.findMany({
          where,
          orderBy: { sentAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.notificationLog.count({ where }),
      ]);

      const channelIds = Array.from(
        new Set(logs.map((log) => log.channelId).filter((channelId): channelId is string => Boolean(channelId))),
      );
      const accessKeyIds = Array.from(
        new Set(logs.map((log) => log.accessKeyId).filter((accessKeyId): accessKeyId is string => Boolean(accessKeyId))),
      );
      const logIds = logs.map((log) => log.id);

      const [channels, accessKeys, activeRetryDeliveries] = await Promise.all([
        channelIds.length > 0
          ? db.notificationChannel.findMany({
              where: { id: { in: channelIds } },
              select: {
                id: true,
                name: true,
                type: true,
                isActive: true,
              },
            })
          : [],
        accessKeyIds.length > 0
          ? db.accessKey.findMany({
              where: { id: { in: accessKeyIds } },
              select: {
                id: true,
                name: true,
              },
            })
          : [],
        logIds.length > 0
          ? db.notificationDelivery.findMany({
              where: {
                sourceLogId: { in: logIds },
                status: {
                  in: [
                    NOTIFICATION_DELIVERY_STATUSES.PENDING,
                    NOTIFICATION_DELIVERY_STATUSES.PROCESSING,
                    NOTIFICATION_DELIVERY_STATUSES.RETRYING,
                  ],
                },
              },
              select: {
                sourceLogId: true,
              },
            })
          : [],
      ]);

      const channelById = new Map(channels.map((channel) => [channel.id, channel]));
      const accessKeyById = new Map(accessKeys.map((accessKey) => [accessKey.id, accessKey]));
      const activeRetryLogIds = new Set(
        activeRetryDeliveries
          .map((delivery) => delivery.sourceLogId)
          .filter((sourceLogId): sourceLogId is string => Boolean(sourceLogId)),
      );

      return {
        items: logs.map((log) => {
          const channel = log.channelId ? (channelById.get(log.channelId) ?? null) : null;
          const accessKey = log.accessKeyId ? (accessKeyById.get(log.accessKeyId) ?? null) : null;

          return {
            ...log,
            channelName: channel?.name ?? null,
            channelType: channel?.type ?? null,
            channelIsActive: channel?.isActive ?? null,
            channelMissing: Boolean(log.channelId) && !channel,
            accessKeyName: accessKey?.name ?? null,
            canRetry: log.status === 'FAILED' && Boolean(log.channelId && channel) && !activeRetryLogIds.has(log.id),
            retryQueued: activeRetryLogIds.has(log.id),
          };
        }),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }),
  processQueueNow: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await processNotificationQueue({
        limit: input?.limit ?? 25,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'NOTIFICATION_QUEUE_PROCESS',
        entity: 'NOTIFICATION_CHANNEL',
        details: result,
      });

      return result;
    }),
  testChannel: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const channel = await db.notificationChannel.findUnique({
        where: { id: input.id },
      });

      if (!channel) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification channel not found',
        });
      }

      const parsedChannel = parseNotificationChannelRecord(channel);
      if (!parsedChannel) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Notification channel configuration is invalid',
        });
      }

      const preferredEvent = channelSupportsEvent(parsedChannel, 'AUDIT_ALERT')
        ? 'AUDIT_ALERT'
        : parsedChannel.events[0] ?? 'SERVER_DOWN';

      const result = await sendNotificationToChannel({
        channel: parsedChannel,
        event: `TEST_${preferredEvent}`,
        message: `Test notification from Atomic-UI for channel "${parsedChannel.name}"`,
        payload: {
          type: 'test_notification',
          event: preferredEvent,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error,
        });
      }

      return { success: true };
    }),
  retryLog: adminProcedure
    .input(z.object({ logId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const log = await db.notificationLog.findUnique({
        where: { id: input.logId },
      });

      if (!log) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification log not found',
        });
      }

      if (log.status !== 'FAILED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only failed notification deliveries can be retried',
        });
      }

      if (!log.channelId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This notification was not sent through a retryable channel',
        });
      }

      const existingRetry = await db.notificationDelivery.findFirst({
        where: {
          sourceLogId: log.id,
          status: {
            in: [
              NOTIFICATION_DELIVERY_STATUSES.PENDING,
              NOTIFICATION_DELIVERY_STATUSES.PROCESSING,
              NOTIFICATION_DELIVERY_STATUSES.RETRYING,
            ],
          },
        },
        select: {
          id: true,
        },
      });

      if (existingRetry) {
        return {
          success: true,
          queued: true,
          alreadyQueued: true,
        };
      }

      const channel = await db.notificationChannel.findUnique({
        where: { id: log.channelId },
      });

      if (!channel) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Original notification channel no longer exists',
        });
      }

      const parsedChannel = parseNotificationChannelRecord(channel);
      if (!parsedChannel) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Notification channel configuration is invalid',
        });
      }

      if (!parsedChannel.isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Notification channel is inactive',
        });
      }

      await enqueueNotificationDelivery({
        channelId: parsedChannel.id,
        event: log.event,
        message: log.message,
        payload: {
          type: 'notification_retry',
          retryOfLogId: log.id,
          originalSentAt: log.sentAt.toISOString(),
        },
        accessKeyId: log.accessKeyId ?? undefined,
        sourceLogId: log.id,
        bypassCooldown: true,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'NOTIFICATION_LOG_RETRY',
        entity: 'NOTIFICATION_CHANNEL',
        entityId: channel.id,
        details: {
          logId: log.id,
          originalEvent: log.event,
          originalError: log.error,
          retryQueued: true,
        },
      });

      return {
        success: true,
        queued: true,
        alreadyQueued: false,
      };
    }),
});
