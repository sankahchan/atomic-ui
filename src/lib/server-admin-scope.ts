import { db } from '@/lib/db';

let legacyAdminScopeNormalizationPromise: Promise<void> | null = null;

async function normalizeLegacyAdminScopesInternal() {
  const legacyAdmins = await db.user.findMany({
    where: {
      role: 'ADMIN',
      adminScope: null,
    },
    select: {
      id: true,
      createdAt: true,
      email: true,
    },
    orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
  });

  if (legacyAdmins.length === 0) {
    return;
  }

  const ownerCount = await db.user.count({
    where: {
      role: 'ADMIN',
      adminScope: 'OWNER',
    },
  });

  let shouldAssignOwner = ownerCount === 0;

  await db.$transaction(
    legacyAdmins.map((admin) => {
      const nextScope = shouldAssignOwner ? 'OWNER' : 'ADMIN';
      shouldAssignOwner = false;

      return db.user.update({
        where: { id: admin.id },
        data: {
          adminScope: nextScope,
        },
      });
    }),
  );
}

export async function normalizeLegacyAdminScopes() {
  if (!legacyAdminScopeNormalizationPromise) {
    legacyAdminScopeNormalizationPromise = normalizeLegacyAdminScopesInternal().finally(() => {
      legacyAdminScopeNormalizationPromise = null;
    });
  }

  await legacyAdminScopeNormalizationPromise;
}

export async function resolveLinkedOrAutoLinkedTelegramAdmin(input: {
  telegramUserId: number;
  chatId: number;
}) {
  await normalizeLegacyAdminScopes();

  const chatId = String(input.chatId);
  const telegramUserId = String(input.telegramUserId);

  const linkedAdmin = await db.user.findFirst({
    where: {
      role: 'ADMIN',
      OR: [{ telegramChatId: chatId }, { telegramChatId: telegramUserId }],
    },
    select: {
      id: true,
      email: true,
      adminScope: true,
      telegramChatId: true,
    },
  });

  if (linkedAdmin) {
    return linkedAdmin;
  }

  const adminUsers = await db.user.findMany({
    where: {
      role: 'ADMIN',
    },
    select: {
      id: true,
      email: true,
      adminScope: true,
      telegramChatId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
  });

  if (adminUsers.length === 1 && !adminUsers[0]?.telegramChatId) {
    return db.user.update({
      where: { id: adminUsers[0].id },
      data: {
        telegramChatId: chatId,
      },
      select: {
        id: true,
        email: true,
        adminScope: true,
        telegramChatId: true,
      },
    });
  }

  return null;
}
