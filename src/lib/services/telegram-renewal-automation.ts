import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import {
  RENEWAL_AUDIT_ACTIONS,
  RENEWAL_REMINDER_AUDIT_ACTIONS,
  RENEWAL_REMINDER_COOLDOWN_MS,
} from '@/lib/renewal-reminder-tracking';
import type { TelegramSalesSettings } from '@/lib/services/telegram-sales';
import { sendAccessKeyRenewalReminder } from '@/lib/services/telegram-reminders';

export const TELEGRAM_RENEWAL_REMINDER_WAVES = [
  'DEPLETED',
  'EXPIRING_1D',
  'EXPIRING_3D',
] as const;

export type TelegramRenewalReminderWave = (typeof TELEGRAM_RENEWAL_REMINDER_WAVES)[number];

export const TELEGRAM_RENEWAL_REMINDER_BLOCK_REASONS = [
  'WAVE_DISABLED',
  'TELEGRAM_DELIVERY_DISABLED',
  'NO_TELEGRAM_LINK',
  'COOLDOWN',
  'ALREADY_SENT_FOR_WAVE',
] as const;

export type TelegramRenewalReminderBlockReason =
  (typeof TELEGRAM_RENEWAL_REMINDER_BLOCK_REASONS)[number];

export const TELEGRAM_RENEWAL_REMINDER_EXCEPTION_AUDIT_ACTIONS = [
  'ACCESS_KEY_RENEWAL_REMINDER_FAILED',
] as const;

export const TELEGRAM_RENEWAL_REMINDER_EXCEPTION_QUICK_FILTERS = [
  'needsTelegramLink',
  'deliveryDisabled',
  'reminderFailed',
  'automationBlocked',
] as const;

export type TelegramRenewalReminderExceptionQuickFilter =
  (typeof TELEGRAM_RENEWAL_REMINDER_EXCEPTION_QUICK_FILTERS)[number];

export type TelegramRenewalAutomationAuditRow = {
  entityId: string | null;
  action: string;
  details: string | null;
  createdAt: Date;
};

export type TelegramRenewalAutomationSnapshot = {
  lastReminderAt: Date | null;
  lastRenewedAt: Date | null;
  lastReminderByWave: Partial<Record<TelegramRenewalReminderWave, Date>>;
  lastFailedAt: Date | null;
  lastFailedReason: string | null;
};

export type TelegramRenewalReminderCandidate = {
  accessKeyId: string;
  keyName: string;
  status: string;
  expiresAt: Date | null;
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
  telegramDeliveryEnabled: boolean;
  destinationChatId: string | null;
};

export type TelegramRenewalReminderEvaluation = {
  wave: TelegramRenewalReminderWave | null;
  daysLeft: number | null;
  eligible: boolean;
  blockedReason: TelegramRenewalReminderBlockReason | null;
  cooldownUntil: Date | null;
};

export type TelegramRenewalReminderExceptionState = {
  wave: TelegramRenewalReminderWave | null;
  daysLeft: number | null;
  blockedReason: TelegramRenewalReminderBlockReason | null;
  cooldownUntil: Date | null;
  reachable: boolean;
  needsTelegramLink: boolean;
  deliveryDisabled: boolean;
  automationBlocked: boolean;
  reminderFailed: boolean;
  lastFailedAt: Date | null;
  lastFailedReason: string | null;
};

export type TelegramRenewalReminderExceptionSummary = {
  eligible: number;
  reachable: number;
  blocked: number;
  failed: number;
  needsTelegramLink: number;
  deliveryDisabled: number;
  automationBlocked: number;
};

export type TelegramRenewalReminderAudienceCandidate = {
  accessKeyId: string;
  keyName: string;
  status: string;
  destinationChatId: string | null;
  expiresAt: Date | null;
  dataLimitBytes: string | null;
  usedBytes: string;
  wave: TelegramRenewalReminderWave;
  daysLeft: number | null;
  cooldownUntil: Date | null;
  blockedReason: TelegramRenewalReminderBlockReason | null;
  eligible: boolean;
};

export type TelegramRenewalReminderWaveSummary = {
  wave: TelegramRenewalReminderWave;
  enabled: boolean;
  totalCandidates: number;
  eligibleCount: number;
  wouldSendCount: number;
  blockedCount: number;
  deferredByCapCount: number;
  blockedReasons: Array<{
    reason: TelegramRenewalReminderBlockReason;
    count: number;
  }>;
};

export type TelegramRenewalReminderAutomationMetrics = {
  automatedReminders24h: number;
  manualReminders24h: number;
};

export type TelegramRenewalReminderSimulation = {
  automationEnabled: boolean;
  maxRecipientsPerRun: number;
  totalCandidates: number;
  eligibleCount: number;
  wouldSendCount: number;
  blockedCount: number;
  deferredByCapCount: number;
  waves: TelegramRenewalReminderWaveSummary[];
  previewRecipients: TelegramRenewalReminderAudienceCandidate[];
  recentMetrics: TelegramRenewalReminderAutomationMetrics;
};

type RenewalAudienceComputation = TelegramRenewalReminderSimulation & {
  recipientsToSend: TelegramRenewalReminderAudienceCandidate[];
};

function parseAuditDetails(rawValue: string | null | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeReminderWave(value: unknown): TelegramRenewalReminderWave | null {
  if (typeof value !== 'string') {
    return null;
  }

  return TELEGRAM_RENEWAL_REMINDER_WAVES.includes(value as TelegramRenewalReminderWave)
    ? (value as TelegramRenewalReminderWave)
    : null;
}

export function buildTelegramRenewalAutomationSnapshotMap(rows: TelegramRenewalAutomationAuditRow[]) {
  const snapshots = new Map<string, TelegramRenewalAutomationSnapshot>();

  for (const row of rows) {
    if (!row.entityId) {
      continue;
    }

    const snapshot = snapshots.get(row.entityId) ?? {
      lastReminderAt: null,
      lastRenewedAt: null,
      lastReminderByWave: {},
      lastFailedAt: null,
      lastFailedReason: null,
    };

    if (RENEWAL_REMINDER_AUDIT_ACTIONS.includes(row.action as (typeof RENEWAL_REMINDER_AUDIT_ACTIONS)[number])) {
      if (!snapshot.lastReminderAt || row.createdAt > snapshot.lastReminderAt) {
        snapshot.lastReminderAt = row.createdAt;
      }

      if (row.action === 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED') {
        const details = parseAuditDetails(row.details);
        const wave = normalizeReminderWave(details?.wave);
        if (wave) {
          const previousWaveReminder = snapshot.lastReminderByWave[wave];
          if (!previousWaveReminder || row.createdAt > previousWaveReminder) {
            snapshot.lastReminderByWave[wave] = row.createdAt;
          }
        }
      }
    }

    if (RENEWAL_AUDIT_ACTIONS.includes(row.action as (typeof RENEWAL_AUDIT_ACTIONS)[number])) {
      if (!snapshot.lastRenewedAt || row.createdAt > snapshot.lastRenewedAt) {
        snapshot.lastRenewedAt = row.createdAt;
      }
    }

    if (
      TELEGRAM_RENEWAL_REMINDER_EXCEPTION_AUDIT_ACTIONS.includes(
        row.action as (typeof TELEGRAM_RENEWAL_REMINDER_EXCEPTION_AUDIT_ACTIONS)[number],
      )
    ) {
      if (!snapshot.lastFailedAt || row.createdAt > snapshot.lastFailedAt) {
        const details = parseAuditDetails(row.details);
        snapshot.lastFailedAt = row.createdAt;
        snapshot.lastFailedReason =
          typeof details?.error === 'string'
            ? details.error
            : typeof details?.message === 'string'
              ? details.message
              : typeof details?.reason === 'string'
                ? details.reason
                : 'Failed to send renewal reminder';
      }
    }

    snapshots.set(row.entityId, snapshot);
  }

  return snapshots;
}

function isWaveEnabled(settings: TelegramSalesSettings, wave: TelegramRenewalReminderWave) {
  switch (wave) {
    case 'DEPLETED':
      return settings.renewalReminderDepletedEnabled;
    case 'EXPIRING_1D':
      return settings.renewalReminderExpiring1dEnabled;
    case 'EXPIRING_3D':
      return settings.renewalReminderExpiring3dEnabled;
    default:
      return false;
  }
}

function resolveRenewalWave(input: {
  now: Date;
  status: string;
  expiresAt: Date | null;
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
}) {
  const isDepleted = input.status === 'DEPLETED'
    || (input.dataLimitBytes !== null && input.usedBytes >= input.dataLimitBytes);
  if (isDepleted) {
    return {
      wave: 'DEPLETED' as const,
      daysLeft: null,
    };
  }

  if (!input.expiresAt) {
    return {
      wave: null,
      daysLeft: null,
    };
  }

  const remainingMs = input.expiresAt.getTime() - input.now.getTime();
  if (remainingMs <= 0) {
    return {
      wave: null,
      daysLeft: null,
    };
  }

  const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  if (daysLeft <= 1) {
    return {
      wave: 'EXPIRING_1D' as const,
      daysLeft,
    };
  }

  if (daysLeft <= 3) {
    return {
      wave: 'EXPIRING_3D' as const,
      daysLeft,
    };
  }

  return {
    wave: null,
    daysLeft: null,
  };
}

export function evaluateTelegramRenewalReminderCandidate(input: {
  candidate: TelegramRenewalReminderCandidate;
  snapshot?: TelegramRenewalAutomationSnapshot | null;
  settings: TelegramSalesSettings;
  now: Date;
}): TelegramRenewalReminderEvaluation {
  const { candidate, snapshot, settings, now } = input;
  const resolvedWave = resolveRenewalWave({
    now,
    status: candidate.status,
    expiresAt: candidate.expiresAt,
    dataLimitBytes: candidate.dataLimitBytes,
    usedBytes: candidate.usedBytes,
  });

  if (!resolvedWave.wave) {
    return {
      wave: null,
      daysLeft: resolvedWave.daysLeft,
      eligible: false,
      blockedReason: null,
      cooldownUntil: null,
    };
  }

  if (!isWaveEnabled(settings, resolvedWave.wave)) {
    return {
      wave: resolvedWave.wave,
      daysLeft: resolvedWave.daysLeft,
      eligible: false,
      blockedReason: 'WAVE_DISABLED',
      cooldownUntil: null,
    };
  }

  if (!candidate.telegramDeliveryEnabled) {
    return {
      wave: resolvedWave.wave,
      daysLeft: resolvedWave.daysLeft,
      eligible: false,
      blockedReason: 'TELEGRAM_DELIVERY_DISABLED',
      cooldownUntil: null,
    };
  }

  if (!candidate.destinationChatId) {
    return {
      wave: resolvedWave.wave,
      daysLeft: resolvedWave.daysLeft,
      eligible: false,
      blockedReason: 'NO_TELEGRAM_LINK',
      cooldownUntil: null,
    };
  }

  const lastRenewedAt = snapshot?.lastRenewedAt ?? null;
  const lastWaveReminderAt = snapshot?.lastReminderByWave[resolvedWave.wave] ?? null;
  if (lastWaveReminderAt && (!lastRenewedAt || lastWaveReminderAt > lastRenewedAt)) {
    return {
      wave: resolvedWave.wave,
      daysLeft: resolvedWave.daysLeft,
      eligible: false,
      blockedReason: 'ALREADY_SENT_FOR_WAVE',
      cooldownUntil: null,
    };
  }

  const lastReminderAt = snapshot?.lastReminderAt ?? null;
  const reminderStillActive = Boolean(lastReminderAt && (!lastRenewedAt || lastReminderAt > lastRenewedAt));
  const cooldownUntil = lastReminderAt
    ? new Date(lastReminderAt.getTime() + RENEWAL_REMINDER_COOLDOWN_MS)
    : null;

  if (
    reminderStillActive &&
    cooldownUntil &&
    cooldownUntil.getTime() > now.getTime()
  ) {
    return {
      wave: resolvedWave.wave,
      daysLeft: resolvedWave.daysLeft,
      eligible: false,
      blockedReason: 'COOLDOWN',
      cooldownUntil,
    };
  }

  return {
    wave: resolvedWave.wave,
    daysLeft: resolvedWave.daysLeft,
    eligible: true,
    blockedReason: null,
    cooldownUntil,
  };
}

export function deriveTelegramRenewalReminderExceptionState(input: {
  candidate: TelegramRenewalReminderCandidate;
  snapshot?: TelegramRenewalAutomationSnapshot | null;
  settings: TelegramSalesSettings;
  now: Date;
}): TelegramRenewalReminderExceptionState {
  const evaluation = evaluateTelegramRenewalReminderCandidate(input);
  const lastResolvedAtCandidates = [
    input.snapshot?.lastReminderAt ?? null,
    input.snapshot?.lastRenewedAt ?? null,
  ].filter((value): value is Date => Boolean(value));
  const lastResolvedAt = lastResolvedAtCandidates.length > 0
    ? new Date(Math.max(...lastResolvedAtCandidates.map((value) => value.getTime())))
    : null;
  const lastFailedAt = input.snapshot?.lastFailedAt ?? null;
  const reminderFailed = Boolean(
    lastFailedAt && (!lastResolvedAt || lastFailedAt.getTime() > lastResolvedAt.getTime()),
  );
  const needsTelegramLink = evaluation.blockedReason === 'NO_TELEGRAM_LINK';
  const deliveryDisabled = evaluation.blockedReason === 'TELEGRAM_DELIVERY_DISABLED';
  const automationBlocked = Boolean(
    evaluation.wave
      && evaluation.blockedReason
      && !needsTelegramLink
      && !deliveryDisabled,
  );

  return {
    wave: evaluation.wave,
    daysLeft: evaluation.daysLeft,
    blockedReason: evaluation.blockedReason,
    cooldownUntil: evaluation.cooldownUntil,
    reachable: Boolean(
      evaluation.wave
        && input.candidate.telegramDeliveryEnabled
        && input.candidate.destinationChatId,
    ),
    needsTelegramLink,
    deliveryDisabled,
    automationBlocked,
    reminderFailed,
    lastFailedAt: reminderFailed ? lastFailedAt : null,
    lastFailedReason: reminderFailed ? (input.snapshot?.lastFailedReason ?? null) : null,
  };
}

export function matchesTelegramRenewalReminderExceptionQuickFilter(
  state: TelegramRenewalReminderExceptionState,
  filter: TelegramRenewalReminderExceptionQuickFilter,
) {
  switch (filter) {
    case 'needsTelegramLink':
      return state.needsTelegramLink;
    case 'deliveryDisabled':
      return state.deliveryDisabled;
    case 'reminderFailed':
      return state.reminderFailed;
    case 'automationBlocked':
      return state.automationBlocked;
    default:
      return false;
  }
}

export function summarizeTelegramRenewalReminderExceptionStates(
  states: Iterable<TelegramRenewalReminderExceptionState>,
): TelegramRenewalReminderExceptionSummary {
  const summary: TelegramRenewalReminderExceptionSummary = {
    eligible: 0,
    reachable: 0,
    blocked: 0,
    failed: 0,
    needsTelegramLink: 0,
    deliveryDisabled: 0,
    automationBlocked: 0,
  };

  for (const state of states) {
    if (state.wave) {
      summary.eligible += 1;
    }

    if (state.reachable) {
      summary.reachable += 1;
    }

    if (state.deliveryDisabled) {
      summary.deliveryDisabled += 1;
    }

    if (state.needsTelegramLink) {
      summary.needsTelegramLink += 1;
    }

    if (state.automationBlocked) {
      summary.automationBlocked += 1;
    }

    if (state.deliveryDisabled || state.needsTelegramLink || state.automationBlocked) {
      summary.blocked += 1;
    }

    if (state.reminderFailed) {
      summary.failed += 1;
    }
  }

  return summary;
}

function compareReminderCandidates(
  left: TelegramRenewalReminderAudienceCandidate,
  right: TelegramRenewalReminderAudienceCandidate,
) {
  const wavePriority: Record<TelegramRenewalReminderWave, number> = {
    DEPLETED: 0,
    EXPIRING_1D: 1,
    EXPIRING_3D: 2,
  };

  const waveDiff = wavePriority[left.wave] - wavePriority[right.wave];
  if (waveDiff !== 0) {
    return waveDiff;
  }

  const leftExpiresAt = left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightExpiresAt = right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (leftExpiresAt !== rightExpiresAt) {
    return leftExpiresAt - rightExpiresAt;
  }

  return left.keyName.localeCompare(right.keyName);
}

async function countRecentAutomationMetrics(now: Date): Promise<TelegramRenewalReminderAutomationMetrics> {
  const since = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const [automatedReminders24h, manualReminders24h] = await Promise.all([
    db.auditLog.count({
      where: {
        entity: 'ACCESS_KEY',
        action: 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
        createdAt: { gte: since },
        details: { contains: '"automation":true' },
      },
    }),
    db.auditLog.count({
      where: {
        entity: 'ACCESS_KEY',
        action: 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
        createdAt: { gte: since },
        details: { not: { contains: '"automation":true' } },
      },
    }),
  ]);

  return {
    automatedReminders24h,
    manualReminders24h,
  };
}

async function loadRenewalAudienceComputation(input: {
  settings: TelegramSalesSettings;
  now: Date;
}): Promise<RenewalAudienceComputation> {
  const threshold = new Date(input.now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const keys = await db.accessKey.findMany({
    where: {
      status: {
        in: ['ACTIVE', 'PENDING', 'DEPLETED'],
      },
      OR: [
        { status: 'DEPLETED' },
        {
          expiresAt: {
            not: null,
            gt: input.now,
            lte: threshold,
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      status: true,
      telegramId: true,
      telegramDeliveryEnabled: true,
      expiresAt: true,
      dataLimitBytes: true,
      usedBytes: true,
      user: {
        select: {
          telegramChatId: true,
        },
      },
    },
  });

  const keyIds = keys.map((key) => key.id);
  const auditRows = keyIds.length
    ? await db.auditLog.findMany({
        where: {
          entity: 'ACCESS_KEY',
          entityId: { in: keyIds },
          action: {
            in: [...RENEWAL_REMINDER_AUDIT_ACTIONS, ...RENEWAL_AUDIT_ACTIONS],
          },
        },
        select: {
          entityId: true,
          action: true,
          details: true,
          createdAt: true,
        },
      })
    : [];

  const snapshotMap = buildTelegramRenewalAutomationSnapshotMap(auditRows);

  const audience = keys
    .map((key) => {
      const candidate: TelegramRenewalReminderCandidate = {
        accessKeyId: key.id,
        keyName: key.name,
        status: key.status,
        expiresAt: key.expiresAt,
        dataLimitBytes: key.dataLimitBytes,
        usedBytes: key.usedBytes,
        telegramDeliveryEnabled: key.telegramDeliveryEnabled,
        destinationChatId: key.telegramId || key.user?.telegramChatId || null,
      };
      const evaluation = evaluateTelegramRenewalReminderCandidate({
        candidate,
        snapshot: snapshotMap.get(key.id),
        settings: input.settings,
        now: input.now,
      });

      if (!evaluation.wave) {
        return null;
      }

      return {
        accessKeyId: candidate.accessKeyId,
        keyName: candidate.keyName,
        status: candidate.status,
        destinationChatId: candidate.destinationChatId,
        expiresAt: candidate.expiresAt,
        dataLimitBytes: candidate.dataLimitBytes?.toString() ?? null,
        usedBytes: candidate.usedBytes.toString(),
        wave: evaluation.wave,
        daysLeft: evaluation.daysLeft,
        cooldownUntil: evaluation.cooldownUntil,
        blockedReason: evaluation.blockedReason,
        eligible: evaluation.eligible,
      } satisfies TelegramRenewalReminderAudienceCandidate;
    })
    .filter((candidate): candidate is TelegramRenewalReminderAudienceCandidate => Boolean(candidate));

  const eligibleCandidates = audience
    .filter((candidate) => candidate.eligible)
    .sort(compareReminderCandidates);
  const maxRecipientsPerRun = Math.max(0, input.settings.renewalReminderMaxRecipientsPerRun);
  const recipientsToSend =
    maxRecipientsPerRun > 0
      ? eligibleCandidates.slice(0, maxRecipientsPerRun)
      : eligibleCandidates;
  const recipientsToSendIdSet = new Set(recipientsToSend.map((candidate) => candidate.accessKeyId));
  const waves = TELEGRAM_RENEWAL_REMINDER_WAVES.map((wave) => {
    const waveCandidates = audience.filter((candidate) => candidate.wave === wave);
    const waveEligible = waveCandidates.filter((candidate) => candidate.eligible);
    const waveWouldSend = waveEligible.filter((candidate) => recipientsToSendIdSet.has(candidate.accessKeyId));
    const blockedReasons = new Map<TelegramRenewalReminderBlockReason, number>();

    for (const candidate of waveCandidates) {
      if (candidate.eligible || !candidate.blockedReason) {
        continue;
      }

      blockedReasons.set(
        candidate.blockedReason,
        (blockedReasons.get(candidate.blockedReason) || 0) + 1,
      );
    }

    return {
      wave,
      enabled: isWaveEnabled(input.settings, wave),
      totalCandidates: waveCandidates.length,
      eligibleCount: waveEligible.length,
      wouldSendCount: waveWouldSend.length,
      blockedCount: waveCandidates.length - waveEligible.length,
      deferredByCapCount: waveEligible.length - waveWouldSend.length,
      blockedReasons: Array.from(blockedReasons.entries()).map(([reason, count]) => ({
        reason,
        count,
      })),
    } satisfies TelegramRenewalReminderWaveSummary;
  });

  const recentMetrics = await countRecentAutomationMetrics(input.now);

  return {
    automationEnabled: input.settings.renewalReminderAutomationEnabled,
    maxRecipientsPerRun,
    totalCandidates: audience.length,
    eligibleCount: eligibleCandidates.length,
    wouldSendCount: recipientsToSend.length,
    blockedCount: audience.length - eligibleCandidates.length,
    deferredByCapCount: eligibleCandidates.length - recipientsToSend.length,
    waves,
    previewRecipients: recipientsToSend.slice(0, 10),
    recentMetrics,
    recipientsToSend,
  };
}

export async function simulateTelegramRenewalReminderAudience(input: {
  settings: TelegramSalesSettings;
  now?: Date;
}): Promise<TelegramRenewalReminderSimulation> {
  const computation = await loadRenewalAudienceComputation({
    settings: input.settings,
    now: input.now ?? new Date(),
  });

  return {
    automationEnabled: computation.automationEnabled,
    maxRecipientsPerRun: computation.maxRecipientsPerRun,
    totalCandidates: computation.totalCandidates,
    eligibleCount: computation.eligibleCount,
    wouldSendCount: computation.wouldSendCount,
    blockedCount: computation.blockedCount,
    deferredByCapCount: computation.deferredByCapCount,
    waves: computation.waves,
    previewRecipients: computation.previewRecipients,
    recentMetrics: computation.recentMetrics,
  };
}

function resolveReminderSource(wave: TelegramRenewalReminderWave) {
  switch (wave) {
    case 'DEPLETED':
      return 'automation_depleted';
    case 'EXPIRING_1D':
      return 'automation_expiring_1d';
    case 'EXPIRING_3D':
      return 'automation_expiring_3d';
    default:
      return 'automation_renewal';
  }
}

export async function runTelegramRenewalReminderAutomation(input: {
  settings: TelegramSalesSettings;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!input.settings.renewalReminderAutomationEnabled) {
    return {
      skipped: true as const,
      reason: 'renewal-automation-disabled' as const,
      totalCandidates: 0,
      eligibleCount: 0,
      sentCount: 0,
      sentByWave: {
        DEPLETED: 0,
        EXPIRING_1D: 0,
        EXPIRING_3D: 0,
      },
      errors: [] as string[],
    };
  }

  const computation = await loadRenewalAudienceComputation({
    settings: input.settings,
    now,
  });
  const sentByWave: Record<TelegramRenewalReminderWave, number> = {
    DEPLETED: 0,
    EXPIRING_1D: 0,
    EXPIRING_3D: 0,
  };
  const errors: string[] = [];

  for (const candidate of computation.recipientsToSend) {
    try {
      const source = resolveReminderSource(candidate.wave);
      const result = await sendAccessKeyRenewalReminder({
        accessKeyId: candidate.accessKeyId,
        chatId: candidate.destinationChatId,
        source,
      });

      await writeAuditLog({
        action: 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
        entity: 'ACCESS_KEY',
        entityId: candidate.accessKeyId,
        details: {
          automation: true,
          scheduler: true,
          wave: candidate.wave,
          daysLeft: candidate.daysLeft,
          destinationChatId: result.destinationChatId,
          source,
        },
      });

      sentByWave[candidate.wave] += 1;
    } catch (error) {
      await writeAuditLog({
        action: 'ACCESS_KEY_RENEWAL_REMINDER_FAILED',
        entity: 'ACCESS_KEY',
        entityId: candidate.accessKeyId,
        details: {
          automation: true,
          scheduler: true,
          wave: candidate.wave,
          destinationChatId: candidate.destinationChatId,
          error: (error as Error).message,
          source: resolveReminderSource(candidate.wave),
        },
      });
      errors.push(`${candidate.accessKeyId}:${candidate.wave}:${(error as Error).message}`);
    }
  }

  return {
    skipped: false as const,
    totalCandidates: computation.totalCandidates,
    eligibleCount: computation.eligibleCount,
    sentCount: Object.values(sentByWave).reduce((sum, count) => sum + count, 0),
    sentByWave,
    errors,
  };
}
