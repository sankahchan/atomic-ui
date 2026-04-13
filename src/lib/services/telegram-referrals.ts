import { db } from '@/lib/db';
import { generateRandomString } from '@/lib/utils';

function normalizeReferralCode(code?: string | null) {
  const normalized = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

async function generateUniqueReferralCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `AT${generateRandomString(6).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}`;
    const existing = await db.telegramUserProfile.findFirst({
      where: { referralCode: code },
      select: { telegramUserId: true },
    });
    if (!existing) {
      return code;
    }
  }

  return `AT${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export async function ensureTelegramReferralCode(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  username?: string | null;
  displayName?: string | null;
}) {
  const existing = await db.telegramUserProfile.findUnique({
    where: { telegramUserId: input.telegramUserId },
    select: {
      telegramUserId: true,
      referralCode: true,
    },
  });

  if (existing?.referralCode) {
    if (input.telegramChatId || input.username || input.displayName) {
      await db.telegramUserProfile.update({
        where: { telegramUserId: input.telegramUserId },
        data: {
          telegramChatId: input.telegramChatId || undefined,
          username: input.username || undefined,
          displayName: input.displayName || undefined,
        },
      });
    }
    return existing.referralCode;
  }

  const referralCode = await generateUniqueReferralCode();
  await db.telegramUserProfile.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId || null,
      username: input.username || null,
      displayName: input.displayName || null,
      referralCode,
    },
    update: {
      telegramChatId: input.telegramChatId || undefined,
      username: input.username || undefined,
      displayName: input.displayName || undefined,
      referralCode,
    },
  });

  return referralCode;
}

export async function acceptTelegramReferralCode(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  referralCode: string;
}) {
  const referralCode = normalizeReferralCode(input.referralCode);
  if (!referralCode) {
    return { status: 'invalid' as const };
  }

  const [profile, owner] = await Promise.all([
    db.telegramUserProfile.findUnique({
      where: { telegramUserId: input.telegramUserId },
      select: {
        telegramUserId: true,
        referralCode: true,
        referredByCode: true,
        pendingReferralCode: true,
      },
    }),
    db.telegramUserProfile.findFirst({
      where: { referralCode },
      select: {
        telegramUserId: true,
        referralCode: true,
        username: true,
      },
    }),
  ]);

  if (!owner?.referralCode) {
    return { status: 'invalid' as const };
  }

  if (owner.telegramUserId === input.telegramUserId) {
    return { status: 'self' as const };
  }

  if (profile?.referredByCode === owner.referralCode || profile?.pendingReferralCode === owner.referralCode) {
    return { status: 'already-applied' as const, referralCode: owner.referralCode };
  }

  await db.telegramUserProfile.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId || null,
      referredByCode: owner.referralCode,
      pendingReferralCode: owner.referralCode,
      lastReferralAcceptedAt: new Date(),
    },
    update: {
      telegramChatId: input.telegramChatId || undefined,
      referredByCode: profile?.referredByCode || owner.referralCode,
      pendingReferralCode: owner.referralCode,
      lastReferralAcceptedAt: new Date(),
    },
  });

  return {
    status: 'accepted' as const,
    referralCode: owner.referralCode,
    ownerTelegramUserId: owner.telegramUserId,
    ownerUsername: owner.username || null,
  };
}

export async function consumePendingTelegramReferralCode(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
}) {
  const profile = await db.telegramUserProfile.findFirst({
    where: {
      OR: [
        { telegramUserId: input.telegramUserId },
        ...(input.telegramChatId ? [{ telegramChatId: input.telegramChatId }] : []),
      ],
    },
    select: {
      telegramUserId: true,
      pendingReferralCode: true,
    },
  });

  const pendingReferralCode = normalizeReferralCode(profile?.pendingReferralCode);
  if (!profile?.telegramUserId || !pendingReferralCode) {
    return null;
  }

  await db.telegramUserProfile.update({
    where: { telegramUserId: profile.telegramUserId },
    data: {
      pendingReferralCode: null,
    },
  });

  return pendingReferralCode;
}

export async function getTelegramReferralSummary(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  username?: string | null;
  displayName?: string | null;
}) {
  const referralCode = await ensureTelegramReferralCode(input);
  const [fulfilledOrders, totalRevenue] = await Promise.all([
    db.telegramOrder.count({
      where: {
        referralCode,
        status: 'FULFILLED',
      },
    }),
    db.telegramOrder.aggregate({
      where: {
        referralCode,
        status: 'FULFILLED',
      },
      _sum: {
        priceAmount: true,
      },
    }),
  ]);

  return {
    referralCode,
    fulfilledOrders,
    revenue: totalRevenue._sum.priceAmount ?? 0,
  };
}

export function parseReferralStartArg(value?: string | null) {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase().startsWith('ref_')) {
    return normalizeReferralCode(trimmed.slice(4));
  }

  if (trimmed.toLowerCase().startsWith('ref-')) {
    return normalizeReferralCode(trimmed.slice(4));
  }

  if (trimmed.toLowerCase().startsWith('ref:')) {
    return normalizeReferralCode(trimmed.slice(4));
  }

  return null;
}

export function parseReferralCodeToken(value?: string | null) {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase().startsWith('ref:')) {
    return normalizeReferralCode(trimmed.slice(4));
  }

  return null;
}
