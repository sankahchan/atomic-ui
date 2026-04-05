import { db } from '@/lib/db';
import { generateRandomString } from '@/lib/utils';
import {
  buildTelegramSupportReplyMediaUrl,
  resolveTelegramSupportIssueLabel,
} from '@/lib/services/telegram-support-cards';
import { type TelegramSupportIssueCategory } from '@/lib/services/telegram-support-types';

async function resolveTelegramSupportUser(input: {
  telegramChatId: string;
  telegramUserId: string;
}) {
  return db.user.findFirst({
    where: {
      OR: [
        { telegramChatId: input.telegramChatId },
        { accessKeys: { some: { telegramId: { in: [input.telegramChatId, input.telegramUserId] } } } },
        { dynamicAccessKeys: { some: { telegramId: { in: [input.telegramChatId, input.telegramUserId] } } } },
      ],
    },
    select: {
      id: true,
      email: true,
    },
  });
}

async function generateTelegramSupportThreadCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `SUP-${generateRandomString(8).toUpperCase()}`;
    const existing = await db.telegramSupportThread.findUnique({
      where: { threadCode: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  return `SUP-${Date.now().toString(36).toUpperCase()}`;
}

export async function createTelegramSupportThread(input: {
  chatId: number;
  telegramUserId: number;
  username?: string | null;
  locale: import('@/lib/i18n/config').SupportedLocale;
  category: TelegramSupportIssueCategory;
}) {
  const telegramChatId = String(input.chatId);
  const resolvedTelegramUserId = String(input.telegramUserId);
  const linkedUser = await resolveTelegramSupportUser({
    telegramChatId,
    telegramUserId: resolvedTelegramUserId,
  });

  const existing = await db.telegramSupportThread.findFirst({
    where: {
      telegramChatId,
      issueCategory: input.category,
      status: {
        in: ['OPEN', 'ESCALATED'],
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return db.telegramSupportThread.create({
    data: {
      threadCode: await generateTelegramSupportThreadCode(),
      status: 'OPEN',
      waitingOn: 'ADMIN',
      issueCategory: input.category,
      locale: input.locale,
      telegramChatId,
      telegramUserId: resolvedTelegramUserId,
      telegramUsername: input.username || null,
      userId: linkedUser?.id || null,
      subject: resolveTelegramSupportIssueLabel(input.category, input.locale),
      firstResponseDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
  });
}

export async function findTelegramSupportThreadByIdForUser(input: {
  threadId: string;
  chatId: number;
  telegramUserId: number;
}) {
  return db.telegramSupportThread.findFirst({
    where: {
      id: input.threadId,
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 12,
      },
    },
  });
}

export async function listTelegramSupportThreadsForUser(input: {
  chatId: number;
  telegramUserId: number;
  limit?: number;
}) {
  return db.telegramSupportThread.findMany({
    where: {
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: input.limit ?? 8,
  });
}

export async function addTelegramSupportReply(input: {
  threadId: string;
  senderType: 'CUSTOMER' | 'ADMIN';
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  adminUserId?: string | null;
  senderName?: string | null;
  message?: string | null;
  mediaKind?: 'IMAGE' | 'FILE' | null;
  mediaTelegramFileId?: string | null;
  mediaFilename?: string | null;
  mediaContentType?: string | null;
  waitingOn?: 'ADMIN' | 'USER' | 'NONE';
  markHandled?: boolean;
  escalate?: boolean;
  escalationReason?: string | null;
}) {
  const now = new Date();
  const existingThread = await db.telegramSupportThread.findUnique({
    where: { id: input.threadId },
    select: {
      firstAdminReplyAt: true,
    },
  });
  const nextStatus = input.markHandled
    ? 'HANDLED'
    : input.escalate
      ? 'ESCALATED'
      : 'OPEN';
  const nextWaitingOn =
    input.markHandled ? 'NONE' : input.waitingOn || (input.senderType === 'CUSTOMER' ? 'ADMIN' : 'USER');
  const trimmedMessage = input.message?.trim() || '';
  const fallbackMessage =
    input.mediaKind === 'IMAGE'
      ? 'Image attachment'
      : input.mediaKind === 'FILE'
        ? 'File attachment'
        : '';
  const storedMessage = trimmedMessage || fallbackMessage;

  if (!storedMessage) {
    throw new Error('Support reply message is required.');
  }

  return db.$transaction(async (tx) => {
    const createdReply = await tx.telegramSupportReply.create({
      data: {
        threadId: input.threadId,
        senderType: input.senderType,
        telegramUserId: input.telegramUserId || null,
        telegramUsername: input.telegramUsername || null,
        adminUserId: input.adminUserId || null,
        senderName: input.senderName || null,
        message: storedMessage,
        mediaKind: input.mediaKind || null,
        mediaTelegramFileId: input.mediaTelegramFileId || null,
        mediaFilename: input.mediaFilename || null,
        mediaContentType: input.mediaContentType || null,
      },
    });

    const mediaUrl = input.mediaTelegramFileId
      ? buildTelegramSupportReplyMediaUrl({
          threadId: input.threadId,
          replyId: createdReply.id,
        })
      : null;

    const reply = mediaUrl
      ? await tx.telegramSupportReply.update({
          where: { id: createdReply.id },
          data: {
            mediaUrl,
          },
        })
      : createdReply;

    await tx.telegramSupportThread.update({
      where: { id: input.threadId },
      data: {
        status: nextStatus,
        waitingOn: nextWaitingOn,
        lastCustomerReplyAt: input.senderType === 'CUSTOMER' ? now : undefined,
        lastAdminReplyAt: input.senderType === 'ADMIN' ? now : undefined,
        firstAdminReplyAt:
          input.senderType === 'ADMIN'
            ? existingThread?.firstAdminReplyAt || now
            : undefined,
        handledAt: input.markHandled ? now : undefined,
        escalatedAt: input.escalate ? now : undefined,
        escalatedReason: input.escalate ? input.escalationReason?.trim() || null : undefined,
        assignedAdminUserId: input.senderType === 'ADMIN' ? input.adminUserId || null : undefined,
        assignedAdminName: input.senderType === 'ADMIN' ? input.senderName || null : undefined,
      },
    });

    return reply;
  });
}

export async function findTelegramSupportThreadByIdForAdmin(input: {
  threadId: string;
}) {
  return db.telegramSupportThread.findUnique({
    where: { id: input.threadId },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 12,
      },
    },
  });
}
