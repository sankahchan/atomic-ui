export type TelegramSalesFunnelProfile = {
  telegramUserId: string | null;
  telegramChatId?: string | null;
};

export type TelegramSalesFunnelOrder = {
  telegramUserId?: string | null;
  telegramChatId?: string | null;
  status: string;
  paymentMethodCode?: string | null;
  paymentMethodLabel?: string | null;
  paymentSubmittedAt?: Date | null;
  reviewedAt?: Date | null;
  fulfilledAt?: Date | null;
};

export type TelegramSalesFunnel = {
  botStarted: number;
  created: number;
  paymentMethodSelected: number;
  proofUploaded: number;
  reviewed: number;
  fulfilled: number;
};

type FunnelStageState = Omit<TelegramSalesFunnel, 'botStarted'>;

function normalizeTelegramIdentity(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function createEmptyFunnelStageState(): FunnelStageState {
  return {
    created: 0,
    paymentMethodSelected: 0,
    proofUploaded: 0,
    reviewed: 0,
    fulfilled: 0,
  };
}

export function buildTelegramSalesFunnel(
  profiles: TelegramSalesFunnelProfile[],
  orders: TelegramSalesFunnelOrder[],
): TelegramSalesFunnel {
  const identityToProfileKey = new Map<string, string>();
  const stagesByProfile = new Map<string, FunnelStageState>();

  for (const profile of profiles) {
    const profileKey =
      normalizeTelegramIdentity(profile.telegramUserId) ||
      normalizeTelegramIdentity(profile.telegramChatId);
    if (!profileKey) {
      continue;
    }

    stagesByProfile.set(profileKey, createEmptyFunnelStageState());

    for (const identity of [profile.telegramUserId, profile.telegramChatId]) {
      const normalizedIdentity = normalizeTelegramIdentity(identity);
      if (normalizedIdentity) {
        identityToProfileKey.set(normalizedIdentity, profileKey);
      }
    }
  }

  for (const order of orders) {
    const profileKey =
      identityToProfileKey.get(normalizeTelegramIdentity(order.telegramUserId) || '') ||
      identityToProfileKey.get(normalizeTelegramIdentity(order.telegramChatId) || '');
    if (!profileKey) {
      continue;
    }

    const stages = stagesByProfile.get(profileKey);
    if (!stages) {
      continue;
    }

    stages.created = 1;
    if (order.paymentMethodCode || order.paymentMethodLabel) {
      stages.paymentMethodSelected = 1;
    }
    if (
      order.paymentSubmittedAt ||
      order.status === 'PENDING_REVIEW' ||
      order.reviewedAt ||
      order.fulfilledAt
    ) {
      stages.proofUploaded = 1;
    }
    if (order.reviewedAt || order.status === 'FULFILLED' || order.status === 'REJECTED') {
      stages.reviewed = 1;
    }
    if (order.status === 'FULFILLED' || order.fulfilledAt) {
      stages.fulfilled = 1;
    }
  }

  const funnel = Array.from(stagesByProfile.values()).reduce<TelegramSalesFunnel>(
    (total, stages) => ({
      botStarted: total.botStarted,
      created: total.created + stages.created,
      paymentMethodSelected: total.paymentMethodSelected + stages.paymentMethodSelected,
      proofUploaded: total.proofUploaded + stages.proofUploaded,
      reviewed: total.reviewed + stages.reviewed,
      fulfilled: total.fulfilled + stages.fulfilled,
    }),
    {
      botStarted: stagesByProfile.size,
      created: 0,
      paymentMethodSelected: 0,
      proofUploaded: 0,
      reviewed: 0,
      fulfilled: 0,
    },
  );

  return funnel;
}
