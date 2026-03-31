/**
 * Telegram Bot Router
 *
 * This router handles Telegram bot configuration and management.
 * The bot allows users to request their VPN keys via Telegram commands.
 */

import { z } from 'zod';
import { router, adminProcedure, protectedProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';
import { runTelegramDigestCycle } from '@/lib/services/telegram-digest';
import { normalizeLocalizedTemplateMap } from '@/lib/localized-templates';
import { coerceSupportedLocale } from '@/lib/i18n/config';
import {
  buildDefaultTelegramTemplateMap,
  DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
  DEFAULT_TELEGRAM_WELCOME_MESSAGES,
} from '@/lib/services/telegram-copy';
import {
  TELEGRAM_SALES_SETTING_KEY,
  normalizeTelegramSalesSettings,
  telegramSalesPlanCodeSchema,
  telegramSalesSettingsSchema,
} from '@/lib/services/telegram-sales';
import {
  approveTelegramOrder,
  approveTelegramPremiumSupportRequest,
  approveTelegramServerChangeRequest,
  dismissTelegramPremiumSupportRequest,
  handleTelegramPremiumSupportRequest,
  rejectTelegramOrder,
  rejectTelegramServerChangeRequest,
  updateTelegramOrderDraft,
} from '@/lib/services/telegram-bot';
import { parseDynamicRoutingPreferences } from '@/lib/services/dynamic-subscription-routing';

/**
 * Telegram Bot Settings Schema
 */
const telegramSettingsSchema = z.object({
  botToken: z.string().min(1, 'Bot token is required'),
  botUsername: z.string().optional(),
  welcomeMessage: z.string().optional(),
  keyNotFoundMessage: z.string().optional(),
  localizedWelcomeMessages: z.record(z.string(), z.string()).optional().default({}),
  localizedKeyNotFoundMessages: z.record(z.string(), z.string()).optional().default({}),
  isEnabled: z.boolean().default(true),
  adminChatIds: z.array(z.string()).optional().default([]),
  dailyDigestEnabled: z.boolean().default(false),
  dailyDigestHour: z.number().int().min(0).max(23).default(9),
  dailyDigestMinute: z.number().int().min(0).max(59).default(0),
  digestLookbackHours: z.number().int().min(1).max(168).default(24),
  defaultLanguage: z.enum(['en', 'my']).default('en'),
  showLanguageSelectorOnStart: z.boolean().default(true),
});

export const telegramBotRouter = router({
  /**
   * Get Telegram bot settings.
   */
  getSettings: protectedProcedure.query(async () => {
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
    });

    if (!settings) {
      return {
        botToken: '',
        botUsername: '',
        welcomeMessage: DEFAULT_TELEGRAM_WELCOME_MESSAGES.en,
        keyNotFoundMessage: DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES.en,
        localizedWelcomeMessages: buildDefaultTelegramTemplateMap(DEFAULT_TELEGRAM_WELCOME_MESSAGES),
        localizedKeyNotFoundMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
        ),
        isEnabled: false,
        adminChatIds: [],
        dailyDigestEnabled: false,
        dailyDigestHour: 9,
        dailyDigestMinute: 0,
        digestLookbackHours: 24,
        defaultLanguage: 'en',
        showLanguageSelectorOnStart: true,
      };
    }

    try {
      const parsed = JSON.parse(settings.value);
      return {
        botToken: parsed.botToken || '',
        botUsername: parsed.botUsername || '',
        welcomeMessage: parsed.welcomeMessage || DEFAULT_TELEGRAM_WELCOME_MESSAGES.en,
        keyNotFoundMessage: parsed.keyNotFoundMessage || DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES.en,
        localizedWelcomeMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_WELCOME_MESSAGES,
          parsed.localizedWelcomeMessages,
        ),
        localizedKeyNotFoundMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
          parsed.localizedKeyNotFoundMessages,
        ),
        isEnabled: parsed.isEnabled ?? false,
        adminChatIds: parsed.adminChatIds || [],
        dailyDigestEnabled: parsed.dailyDigestEnabled ?? false,
        dailyDigestHour: parsed.dailyDigestHour ?? 9,
        dailyDigestMinute: parsed.dailyDigestMinute ?? 0,
        digestLookbackHours: parsed.digestLookbackHours ?? 24,
        defaultLanguage: coerceSupportedLocale(parsed.defaultLanguage) || 'en',
        showLanguageSelectorOnStart: parsed.showLanguageSelectorOnStart ?? true,
      };
    } catch {
      return {
        botToken: '',
        botUsername: '',
        welcomeMessage: DEFAULT_TELEGRAM_WELCOME_MESSAGES.en,
        keyNotFoundMessage: DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES.en,
        localizedWelcomeMessages: buildDefaultTelegramTemplateMap(DEFAULT_TELEGRAM_WELCOME_MESSAGES),
        localizedKeyNotFoundMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
        ),
        isEnabled: false,
        adminChatIds: [],
        dailyDigestEnabled: false,
        dailyDigestHour: 9,
        dailyDigestMinute: 0,
        digestLookbackHours: 24,
        defaultLanguage: 'en',
        showLanguageSelectorOnStart: true,
      };
    }
  }),

  /**
   * Update Telegram bot settings.
   */
  updateSettings: adminProcedure
    .input(telegramSettingsSchema)
    .mutation(async ({ input }) => {
      await db.settings.upsert({
        where: { key: 'telegram_bot' },
        create: {
          key: 'telegram_bot',
          value: JSON.stringify(input),
        },
        update: {
          value: JSON.stringify(input),
        },
      });

      return { success: true };
    }),

  getSalesConfig: adminProcedure.query(async () => {
    const settings = await db.settings.findUnique({
      where: { key: TELEGRAM_SALES_SETTING_KEY },
      select: { value: true },
    });

    if (!settings) {
      return normalizeTelegramSalesSettings(null);
    }

    try {
      return normalizeTelegramSalesSettings(JSON.parse(settings.value));
    } catch {
      return normalizeTelegramSalesSettings(null);
    }
  }),

  updateSalesConfig: adminProcedure
    .input(telegramSalesSettingsSchema)
    .mutation(async ({ input }) => {
      const normalized = normalizeTelegramSalesSettings(input);

      await db.settings.upsert({
        where: { key: TELEGRAM_SALES_SETTING_KEY },
        create: {
          key: TELEGRAM_SALES_SETTING_KEY,
          value: JSON.stringify(normalized),
        },
        update: {
          value: JSON.stringify(normalized),
        },
      });

      return normalized;
    }),

  listOrders: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          statuses: z.array(z.string()).optional(),
          kinds: z.array(z.enum(['NEW', 'RENEW'])).optional(),
          query: z.string().max(120).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 25;
      const statuses = input?.statuses?.filter(Boolean);
      const kinds = input?.kinds?.filter(Boolean);
      const query = input?.query?.trim();

      const filters: Array<Record<string, unknown>> = [];

      if (statuses?.length) {
        filters.push({
          status: {
            in: statuses,
          },
        });
      }

      if (kinds?.length) {
        filters.push({
          kind: {
            in: kinds,
          },
        });
      }

      if (query) {
        filters.push({
          OR: [
            { orderCode: { contains: query } },
            { telegramUsername: { contains: query } },
            { telegramUserId: { contains: query } },
            { requestedName: { contains: query } },
            { requestedEmail: { contains: query } },
            { planName: { contains: query } },
          ],
        });
      }

      const orders = await db.telegramOrder.findMany({
        where: filters.length ? { AND: filters } : undefined,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: {
          reviewedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      const relatedKeyIds = Array.from(
        new Set(
          orders.flatMap((order) =>
            [order.targetAccessKeyId, order.approvedAccessKeyId].filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ),
      );
      const relatedDynamicKeyIds = Array.from(
        new Set(
          orders.flatMap((order) =>
            [order.targetDynamicKeyId, order.approvedDynamicKeyId].filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ),
      );
      const telegramUserIds = Array.from(new Set(orders.map((order) => order.telegramUserId).filter(Boolean)));
      const telegramChatIds = Array.from(new Set(orders.map((order) => order.telegramChatId).filter(Boolean)));
      const requestedEmails = Array.from(
        new Set(
          orders
            .map((order) => order.requestedEmail?.trim().toLowerCase())
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const keys =
        relatedKeyIds.length || telegramUserIds.length || telegramChatIds.length || requestedEmails.length
        ? await db.accessKey.findMany({
            where: {
              OR: [
                ...(relatedKeyIds.length
                  ? [
                      {
                        id: {
                          in: relatedKeyIds,
                        },
                      },
                    ]
                  : []),
                ...(telegramUserIds.length
                  ? [
                      {
                        telegramId: {
                          in: telegramUserIds,
                        },
                      },
                    ]
                  : []),
                ...(telegramChatIds.length
                  ? [
                      {
                        user: {
                          telegramChatId: {
                            in: telegramChatIds,
                          },
                        },
                      },
                    ]
                  : []),
                ...(requestedEmails.length
                  ? [
                      {
                        email: {
                          in: requestedEmails,
                        },
                      },
                    ]
                  : []),
              ],
            },
            select: {
              id: true,
              name: true,
              status: true,
              email: true,
              telegramId: true,
              usedBytes: true,
              dataLimitBytes: true,
              expiresAt: true,
              publicSlug: true,
              subscriptionToken: true,
              user: {
                select: {
                  telegramChatId: true,
                },
              },
            },
          })
        : [];
      const keysById = new Map(keys.map((key) => [key.id, key]));
      const dynamicKeys =
        relatedDynamicKeyIds.length || telegramUserIds.length || telegramChatIds.length || requestedEmails.length
          ? await db.dynamicAccessKey.findMany({
              where: {
                OR: [
                  ...(relatedDynamicKeyIds.length
                    ? [
                        {
                          id: {
                            in: relatedDynamicKeyIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramUserIds.length
                    ? [
                        {
                          telegramId: {
                            in: telegramUserIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramChatIds.length
                    ? [
                        {
                          user: {
                            telegramChatId: {
                              in: telegramChatIds,
                            },
                          },
                        },
                      ]
                    : []),
                  ...(requestedEmails.length
                    ? [
                        {
                          email: {
                            in: requestedEmails,
                          },
                        },
                      ]
                    : []),
                ],
              },
              select: {
                id: true,
                name: true,
                status: true,
                email: true,
                telegramId: true,
                usedBytes: true,
                dataLimitBytes: true,
                expiresAt: true,
                publicSlug: true,
                dynamicUrl: true,
                user: {
                  select: {
                    telegramChatId: true,
                  },
                },
              },
            })
          : [];
      const dynamicKeysById = new Map(dynamicKeys.map((key) => [key.id, key]));

      const profiles =
        telegramUserIds.length || telegramChatIds.length
          ? await db.telegramUserProfile.findMany({
              where: {
                OR: [
                  ...(telegramUserIds.length
                    ? [
                        {
                          telegramUserId: {
                            in: telegramUserIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramChatIds.length
                    ? [
                        {
                          telegramChatId: {
                            in: telegramChatIds,
                          },
                        },
                      ]
                    : []),
                ],
              },
              select: {
                telegramUserId: true,
                telegramChatId: true,
                username: true,
                displayName: true,
                locale: true,
                createdAt: true,
                updatedAt: true,
              },
            })
          : [];

      const relatedOrders =
        telegramUserIds.length || telegramChatIds.length
          ? await db.telegramOrder.findMany({
              where: {
                OR: [
                  ...(telegramUserIds.length
                    ? [
                        {
                          telegramUserId: {
                            in: telegramUserIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramChatIds.length
                    ? [
                        {
                          telegramChatId: {
                            in: telegramChatIds,
                          },
                        },
                      ]
                    : []),
                ],
              },
              orderBy: [{ createdAt: 'desc' }],
              take: Math.max(limit * 6, 120),
              select: {
                id: true,
                orderCode: true,
                status: true,
                kind: true,
                telegramUserId: true,
                telegramChatId: true,
                requestedEmail: true,
                planName: true,
                approvedAccessKeyId: true,
                approvedDynamicKeyId: true,
                createdAt: true,
                fulfilledAt: true,
                rejectedAt: true,
              },
            })
          : [];

      const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || null;
      const matchesOrderIdentity = (
        order: (typeof orders)[number],
        candidate: {
          telegramUserId?: string | null;
          telegramChatId?: string | null;
          requestedEmail?: string | null;
        },
      ) => {
        if (candidate.telegramUserId && candidate.telegramUserId === order.telegramUserId) {
          return true;
        }

        if (candidate.telegramChatId && candidate.telegramChatId === order.telegramChatId) {
          return true;
        }

        const orderEmail = normalizeEmail(order.requestedEmail);
        const candidateEmail = normalizeEmail(candidate.requestedEmail);
        return Boolean(orderEmail && candidateEmail && orderEmail === candidateEmail);
      };

      type CustomerLinkedKey = {
        id: string;
        type: 'ACCESS_KEY' | 'DYNAMIC_KEY';
        name: string;
        status: string;
        email: string | null;
        publicSlug: string | null;
        usedBytes: string;
        dataLimitBytes: string | null;
        expiresAt: Date | null;
      };

      return orders.map((order) => {
        const accessLinkedEntries: Array<[string, CustomerLinkedKey]> = keys
          .filter((key) => {
            const emailMatch =
              normalizeEmail(order.requestedEmail) &&
              normalizeEmail(key.email) === normalizeEmail(order.requestedEmail);
            return (
              key.id === order.targetAccessKeyId ||
              key.id === order.approvedAccessKeyId ||
              key.telegramId === order.telegramUserId ||
              key.user?.telegramChatId === order.telegramChatId ||
              emailMatch
            );
          })
          .map((key) => [
            `access:${key.id}`,
            {
              id: key.id,
              type: 'ACCESS_KEY',
              name: key.name,
              status: key.status,
              email: key.email,
              publicSlug: key.publicSlug,
              usedBytes: key.usedBytes.toString(),
              dataLimitBytes: key.dataLimitBytes?.toString() ?? null,
              expiresAt: key.expiresAt,
            },
          ]);

        const dynamicLinkedEntries: Array<[string, CustomerLinkedKey]> = dynamicKeys
          .filter((key) => {
            const emailMatch =
              normalizeEmail(order.requestedEmail) &&
              normalizeEmail(key.email) === normalizeEmail(order.requestedEmail);
            return (
              key.id === order.targetDynamicKeyId ||
              key.id === order.approvedDynamicKeyId ||
              key.telegramId === order.telegramUserId ||
              key.user?.telegramChatId === order.telegramChatId ||
              emailMatch
            );
          })
          .map((key) => [
            `dynamic:${key.id}`,
            {
              id: key.id,
              type: 'DYNAMIC_KEY',
              name: key.name,
              status: key.status,
              email: key.email,
              publicSlug: key.publicSlug,
              usedBytes: key.usedBytes.toString(),
              dataLimitBytes: key.dataLimitBytes?.toString() ?? null,
              expiresAt: key.expiresAt,
            },
          ]);

        return {
          ...order,
          dataLimitBytes: order.dataLimitBytes?.toString() ?? null,
          deliveryType: order.deliveryType ?? 'ACCESS_KEY',
          dynamicTemplateId: order.dynamicTemplateId ?? null,
          targetAccessKeyName: order.targetAccessKeyId
            ? keysById.get(order.targetAccessKeyId)?.name ?? null
            : null,
          targetDynamicKeyName: order.targetDynamicKeyId
            ? dynamicKeysById.get(order.targetDynamicKeyId)?.name ?? null
            : null,
          approvedAccessKeyName: order.approvedAccessKeyId
            ? keysById.get(order.approvedAccessKeyId)?.name ?? null
            : null,
          approvedAccessKeySlug: order.approvedAccessKeyId
            ? keysById.get(order.approvedAccessKeyId)?.publicSlug ?? null
            : null,
          approvedDynamicKeyName: order.approvedDynamicKeyId
            ? dynamicKeysById.get(order.approvedDynamicKeyId)?.name ?? null
            : null,
          approvedDynamicKeySlug: order.approvedDynamicKeyId
            ? dynamicKeysById.get(order.approvedDynamicKeyId)?.publicSlug ?? null
            : null,
          customerProfile:
            profiles.find(
              (profile) =>
                profile.telegramUserId === order.telegramUserId ||
                profile.telegramChatId === order.telegramChatId,
            ) ?? null,
          customerLinkedKeys: Array.from(
            new Map<string, CustomerLinkedKey>([
              ...accessLinkedEntries,
              ...dynamicLinkedEntries,
            ]).values(),
          ).slice(0, 5),
          customerRecentOrders: relatedOrders
            .filter((candidate) => candidate.id !== order.id && matchesOrderIdentity(order, candidate))
            .slice(0, 4)
            .map((candidate) => ({
              id: candidate.id,
              orderCode: candidate.orderCode,
              status: candidate.status,
              kind: candidate.kind,
              planName: candidate.planName,
              approvedAccessKeyName: candidate.approvedAccessKeyId
                ? keysById.get(candidate.approvedAccessKeyId)?.name ?? null
                : null,
              approvedDynamicKeyName: candidate.approvedDynamicKeyId
                ? dynamicKeysById.get(candidate.approvedDynamicKeyId)?.name ?? null
                : null,
              createdAt: candidate.createdAt,
              fulfilledAt: candidate.fulfilledAt,
              rejectedAt: candidate.rejectedAt,
            })),
          customerSummary: (() => {
          const identityOrders = relatedOrders.filter((candidate) => matchesOrderIdentity(order, candidate));
          const lastFulfilled = identityOrders.find((candidate) => candidate.status === 'FULFILLED');
          return {
            totalOrders: identityOrders.length,
            pendingOrders: identityOrders.filter((candidate) => candidate.status === 'PENDING_REVIEW').length,
            fulfilledOrders: identityOrders.filter((candidate) => candidate.status === 'FULFILLED').length,
            rejectedOrders: identityOrders.filter((candidate) => candidate.status === 'REJECTED').length,
            lastOrderAt: identityOrders[0]?.createdAt ?? null,
            lastFulfilledAt: lastFulfilled?.fulfilledAt ?? lastFulfilled?.createdAt ?? null,
          };
          })(),
        };
      });
    }),

  listServerChangeRequests: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          statuses: z.array(z.string()).optional(),
          query: z.string().max(120).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 25;
      const statuses = input?.statuses?.filter(Boolean);
      const query = input?.query?.trim();

      const filters: Array<Record<string, unknown>> = [];
      if (statuses?.length) {
        filters.push({
          status: {
            in: statuses,
          },
        });
      }

      if (query) {
        filters.push({
          OR: [
            { requestCode: { contains: query } },
            { telegramUsername: { contains: query } },
            { telegramUserId: { contains: query } },
            { currentServerName: { contains: query } },
            { requestedServerName: { contains: query } },
            {
              accessKey: {
                name: {
                  contains: query,
                },
              },
            },
          ],
        });
      }

      const requests = await db.telegramServerChangeRequest.findMany({
        where: filters.length ? { AND: filters } : undefined,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: {
          accessKey: {
            select: {
              id: true,
              name: true,
              status: true,
              telegramId: true,
              email: true,
              usedBytes: true,
              dataLimitBytes: true,
              expiresAt: true,
              publicSlug: true,
              serverChangeCount: true,
              serverChangeLimit: true,
            },
          },
        },
      });

      return requests.map((request) => ({
        ...request,
        accessKey: {
          ...request.accessKey,
          usedBytes: request.accessKey.usedBytes.toString(),
          dataLimitBytes: request.accessKey.dataLimitBytes?.toString() ?? null,
        },
        remainingChangesBeforeApproval: Math.max(
          0,
          request.accessKey.serverChangeLimit - request.accessKey.serverChangeCount,
        ),
        remainingChangesAfterApproval: Math.max(
          0,
          request.accessKey.serverChangeLimit - request.accessKey.serverChangeCount - 1,
        ),
      }));
    }),

  listPremiumSupportRequests: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          statuses: z.array(z.string()).optional(),
          requestTypes: z.array(z.enum(['REGION_CHANGE', 'ROUTE_ISSUE'])).optional(),
          query: z.string().max(120).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 25;
      const statuses = input?.statuses?.filter(Boolean);
      const requestTypes = input?.requestTypes?.filter(Boolean);
      const query = input?.query?.trim();

      const filters: Array<Record<string, unknown>> = [];
      if (statuses?.length) {
        filters.push({ status: { in: statuses } });
      }
      if (requestTypes?.length) {
        filters.push({ requestType: { in: requestTypes } });
      }
      if (query) {
        filters.push({
          OR: [
            { requestCode: { contains: query } },
            { telegramUsername: { contains: query } },
            { telegramUserId: { contains: query } },
            { requestedRegionCode: { contains: query } },
            { currentResolvedServerName: { contains: query } },
            {
              dynamicAccessKey: {
                name: {
                  contains: query,
                },
              },
            },
          ],
        });
      }

      const requests = await db.telegramPremiumSupportRequest.findMany({
        where: filters.length ? { AND: filters } : undefined,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: {
          reviewedBy: {
            select: {
              id: true,
              email: true,
            },
          },
          dynamicAccessKey: {
            select: {
              id: true,
              name: true,
              status: true,
              dynamicUrl: true,
              publicSlug: true,
              lastResolvedServerId: true,
              lastResolvedAt: true,
              preferredCountryCodesJson: true,
              preferredRegionMode: true,
              pinnedServerId: true,
              pinExpiresAt: true,
              notes: true,
              accessKeys: {
                where: { status: 'ACTIVE' },
                select: {
                  id: true,
                  name: true,
                  server: {
                    select: {
                      id: true,
                      name: true,
                      countryCode: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return requests.map((request) => {
        const preferredCountries = parseDynamicRoutingPreferences({
          preferredCountryCodesJson: request.dynamicAccessKey.preferredCountryCodesJson,
          preferredRegionMode: request.dynamicAccessKey.preferredRegionMode,
        }).preferredCountryCodes;
        const attachedCountries = Array.from(
          new Set(
            request.dynamicAccessKey.accessKeys
              .map((accessKey) => accessKey.server?.countryCode?.toUpperCase())
              .filter((value): value is string => Boolean(value)),
          ),
        );
        const availableRegionCodes = Array.from(
          new Set([
            ...preferredCountries.map((code) => code.toUpperCase()),
            ...attachedCountries,
            request.requestedRegionCode?.toUpperCase() || '',
          ].filter(Boolean)),
        );
        const availablePinServers = Array.from(
          new Map(
            request.dynamicAccessKey.accessKeys
              .filter((accessKey) => accessKey.server)
              .map((accessKey) => [
                accessKey.server!.id,
                {
                  id: accessKey.server!.id,
                  name: accessKey.server!.name,
                  countryCode: accessKey.server!.countryCode || null,
                },
              ]),
          ).values(),
        );

        return {
          ...request,
          dynamicAccessKey: {
            ...request.dynamicAccessKey,
            availableRegionCodes,
            availablePinServers,
          },
        };
      });
    }),

  approveOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return approveTelegramOrder({
        orderId: input.orderId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
      });
    }),

  updateOrderDraft: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        planCode: telegramSalesPlanCodeSchema.optional().nullable(),
        durationMonths: z.number().int().min(1).max(24).optional().nullable(),
        selectedServerId: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return updateTelegramOrderDraft({
        orderId: input.orderId,
        updatedByUserId: ctx.user.id,
        updaterName: ctx.user.email || null,
        planCode: input.planCode,
        durationMonths: input.durationMonths,
        selectedServerId: input.selectedServerId,
      });
    }),

  rejectOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
        reasonCode: z.string().max(64).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return rejectTelegramOrder({
        orderId: input.orderId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
        reasonCode: input.reasonCode,
      });
    }),

  approveServerChangeRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return approveTelegramServerChangeRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
      });
    }),

  rejectServerChangeRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return rejectTelegramServerChangeRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
      });
    }),

  approvePremiumSupportRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
        approvedRegionCode: z.string().max(16).optional().nullable(),
        pinServerId: z.string().optional().nullable(),
        pinExpiresInMinutes: z.number().int().min(5).max(7 * 24 * 60).optional().nullable(),
        appendNoteToKey: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return approveTelegramPremiumSupportRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
        approvedRegionCode: input.approvedRegionCode,
        pinServerId: input.pinServerId,
        pinExpiresInMinutes: input.pinExpiresInMinutes,
        appendNoteToKey: input.appendNoteToKey,
      });
    }),

  handlePremiumSupportRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
        pinServerId: z.string().optional().nullable(),
        pinExpiresInMinutes: z.number().int().min(5).max(7 * 24 * 60).optional().nullable(),
        appendNoteToKey: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return handleTelegramPremiumSupportRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
        pinServerId: input.pinServerId,
        pinExpiresInMinutes: input.pinExpiresInMinutes,
        appendNoteToKey: input.appendNoteToKey,
      });
    }),

  dismissPremiumSupportRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return dismissTelegramPremiumSupportRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
      });
    }),

  /**
   * Test the bot connection.
   */
  testConnection: adminProcedure
    .input(z.object({ botToken: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${input.botToken}/getMe`);
        const data = await response.json();

        if (!data.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: data.description || 'Invalid bot token',
          });
        }

        return {
          success: true,
          botUsername: data.result.username,
          botName: data.result.first_name,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to connect to Telegram: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get webhook info.
   */
  getWebhookInfo: adminProcedure.query(async () => {
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
    });

    if (!settings) {
      return { webhookSet: false };
    }

    try {
      const parsed = JSON.parse(settings.value);
      if (!parsed.botToken) {
        return { webhookSet: false };
      }

      const response = await fetch(`https://api.telegram.org/bot${parsed.botToken}/getWebhookInfo`);
      const data = await response.json();

      return {
        webhookSet: !!data.result?.url,
        webhookUrl: data.result?.url || null,
        pendingUpdateCount: data.result?.pending_update_count || 0,
        lastErrorDate: data.result?.last_error_date || null,
        lastErrorMessage: data.result?.last_error_message || null,
      };
    } catch {
      return { webhookSet: false };
    }
  }),

  /**
   * Set webhook URL for the bot.
   */
  setWebhook: adminProcedure
    .input(z.object({ webhookUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      const settings = await db.settings.findUnique({
        where: { key: 'telegram_bot' },
      });

      if (!settings) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bot settings not configured',
        });
      }

      const parsed = JSON.parse(settings.value);
      if (!parsed.botToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bot token not configured',
        });
      }

      const response = await fetch(
        `https://api.telegram.org/bot${parsed.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: input.webhookUrl,
            allowed_updates: ['message', 'callback_query'],
          }),
        },
      );
      const data = await response.json();

      if (!data.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: data.description || 'Failed to set webhook',
        });
      }

      return { success: true };
    }),

  /**
   * Delete webhook.
   */
  deleteWebhook: adminProcedure.mutation(async () => {
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
    });

    if (!settings) {
      return { success: true };
    }

    const parsed = JSON.parse(settings.value);
    if (!parsed.botToken) {
      return { success: true };
    }

    const response = await fetch(`https://api.telegram.org/bot${parsed.botToken}/deleteWebhook`);
    const data = await response.json();

    return { success: data.ok };
  }),

  runDigestNow: adminProcedure.mutation(async () => {
    const result = await runTelegramDigestCycle({ force: true });

    if (result.skipped) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Telegram digest skipped: ${result.reason}`,
      });
    }

    return result;
  }),
});
