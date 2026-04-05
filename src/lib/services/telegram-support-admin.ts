import { Prisma } from '@prisma/client';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import {
  addTelegramSupportReply,
  buildTelegramSupportThreadKeyboard,
  buildTelegramSupportThreadStatusMessage,
  findTelegramSupportThreadByIdForAdmin,
  getTelegramSupportThreadState,
  resolveTelegramSupportIssueCategory,
  resolveTelegramSupportIssueLabel,
} from '@/lib/services/telegram-support';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  buildTelegramLatestReplyPreviewLines,
  escapeHtml,
} from '@/lib/services/telegram-ui';

export type TelegramSupportThreadMacro =
  | 'WORKING'
  | 'NEED_DETAILS'
  | 'ESCALATE'
  | 'HANDLED';

export async function listTelegramSupportThreadsForAdminQueue(input: {
  mode: 'all' | 'admin' | 'user';
  limit?: number;
}) {
  const baseWhere: Prisma.TelegramSupportThreadWhereInput = {
    status: {
      in: ['OPEN', 'ESCALATED'],
    },
  };
  const listWhere: Prisma.TelegramSupportThreadWhereInput =
    input.mode === 'admin'
      ? {
          status: 'OPEN',
          NOT: {
            waitingOn: 'USER',
          },
        }
      : input.mode === 'user'
        ? {
            status: 'OPEN',
            waitingOn: 'USER',
          }
        : baseWhere;

  const [totalOpen, waitingAdmin, waitingUser, overdue, threads] = await Promise.all([
    db.telegramSupportThread.count({
      where: baseWhere,
    }),
    db.telegramSupportThread.count({
      where: {
        status: 'OPEN',
        NOT: {
          waitingOn: 'USER',
        },
      },
    }),
    db.telegramSupportThread.count({
      where: {
        status: 'OPEN',
        waitingOn: 'USER',
      },
    }),
    db.telegramSupportThread.count({
      where: {
        ...baseWhere,
        firstAdminReplyAt: null,
        firstResponseDueAt: {
          lte: new Date(),
        },
      },
    }),
    db.telegramSupportThread.findMany({
      where: listWhere,
      include: {
        replies: {
          orderBy: [{ createdAt: 'asc' }],
          take: 8,
        },
      },
      orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
      take: input.limit ?? 4,
    }),
  ]);

  return {
    totalOpen,
    waitingAdmin,
    waitingUser,
    overdue,
    threads,
  };
}

export async function claimTelegramSupportThreadAsAdmin(input: {
  threadId: string;
  adminUserId?: string | null;
  reviewerName?: string | null;
  force?: boolean;
}) {
  const thread = await findTelegramSupportThreadByIdForAdmin({
    threadId: input.threadId,
  });
  if (!thread) {
    throw new Error('Support thread not found.');
  }
  if (thread.status === 'HANDLED') {
    throw new Error('This support thread is already handled.');
  }
  if (
    !input.force
    && thread.assignedAdminUserId
    && thread.assignedAdminUserId !== (input.adminUserId ?? null)
  ) {
    throw new Error(`This support thread is claimed by ${thread.assignedAdminName || 'another admin'}.`);
  }

  const updated = await db.telegramSupportThread.update({
    where: { id: thread.id },
    data: {
      assignedAdminUserId: input.adminUserId ?? null,
      assignedAdminName: input.reviewerName ?? null,
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 12,
      },
    },
  });

  await writeAuditLog({
    userId: input.adminUserId ?? null,
    action: 'TELEGRAM_SUPPORT_THREAD_CLAIMED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      reviewerName: input.reviewerName ?? null,
    },
  });

  return updated;
}

export async function unclaimTelegramSupportThreadAsAdmin(input: {
  threadId: string;
  adminUserId?: string | null;
  reviewerName?: string | null;
  force?: boolean;
}) {
  const thread = await findTelegramSupportThreadByIdForAdmin({
    threadId: input.threadId,
  });
  if (!thread) {
    throw new Error('Support thread not found.');
  }
  if (thread.status === 'HANDLED') {
    throw new Error('This support thread is already handled.');
  }
  if (
    !input.force
    && thread.assignedAdminUserId
    && thread.assignedAdminUserId !== (input.adminUserId ?? null)
  ) {
    throw new Error(`Only ${thread.assignedAdminName || 'the assigned admin'} can unclaim this thread.`);
  }

  const updated = await db.telegramSupportThread.update({
    where: { id: thread.id },
    data: {
      assignedAdminUserId: null,
      assignedAdminName: null,
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 12,
      },
    },
  });

  await writeAuditLog({
    userId: input.adminUserId ?? null,
    action: 'TELEGRAM_SUPPORT_THREAD_UNCLAIMED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      reviewerName: input.reviewerName ?? null,
    },
  });

  return updated;
}

export async function assignTelegramSupportThreadToAdmin(input: {
  threadId: string;
  changedByUserId?: string | null;
  changedByName?: string | null;
  assignedAdminUserId?: string | null;
  assignedAdminName?: string | null;
}) {
  const thread = await findTelegramSupportThreadByIdForAdmin({
    threadId: input.threadId,
  });
  if (!thread) {
    throw new Error('Support thread not found.');
  }

  const updated = await db.telegramSupportThread.update({
    where: { id: thread.id },
    data: {
      assignedAdminUserId: input.assignedAdminUserId || null,
      assignedAdminName: input.assignedAdminName || null,
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 24,
      },
    },
  });

  await writeAuditLog({
    userId: input.changedByUserId ?? null,
    action: 'TELEGRAM_SUPPORT_THREAD_ASSIGNED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      changedByName: input.changedByName ?? null,
      assignedAdminUserId: input.assignedAdminUserId || null,
      assignedAdminName: input.assignedAdminName || null,
    },
  });

  return updated;
}

export function buildTelegramSupportMacroMessage(input: {
  action: TelegramSupportThreadMacro;
  category: string;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  const categoryCode = resolveTelegramSupportIssueCategory(input.category) || 'GENERAL';

  if (input.action === 'WORKING') {
    switch (categoryCode) {
      case 'ORDER':
        return isMyanmar
          ? 'Payment and order review ကို စစ်ဆေးနေပါသည်။ Update ကို မကြာမီ ပြန်ပို့ပါမည်။'
          : 'We are checking the payment and order review now. We will update you again shortly.';
      case 'KEY':
        return isMyanmar
          ? 'Key issue ကို စစ်ဆေးနေပါသည်။ Key name / usage / server side ကို review လုပ်နေပါသည်။'
          : 'We are checking the key issue now, including the key, usage, and server side.';
      case 'SERVER':
        return isMyanmar
          ? 'Server or route issue ကို စစ်ဆေးနေပါသည်။ Recovery or replacement လိုအပ်သလားကို ကြည့်နေပါသည်။'
          : 'We are checking the server or route issue now, including whether recovery or replacement is needed.';
      case 'BILLING':
        return isMyanmar
          ? 'Billing or refund issue ကို စစ်ဆေးနေပါသည်။ Update ကို မကြာမီ ပြန်ပို့ပါမည်။'
          : 'We are checking the billing or refund issue now. We will update you again shortly.';
      default:
        return isMyanmar
          ? 'Issue ကို စစ်ဆေးနေပါသည်။ Update ကို မကြာမီ ပြန်ပို့ပါမည်။'
          : 'We are checking this now and will update you again shortly.';
    }
  }

  if (input.action === 'NEED_DETAILS') {
    switch (categoryCode) {
      case 'ORDER':
        return isMyanmar
          ? 'Order code, payment amount, and a clearer screenshot ကို ထပ်ပို့ပေးပါ။'
          : 'Please send the order code, payment amount, and a clearer screenshot so we can continue.';
      case 'KEY':
        return isMyanmar
          ? 'Key name, current server, and the exact issue detail ကို ထပ်ပို့ပေးပါ။'
          : 'Please send the key name, current server, and the exact issue detail so we can continue.';
      case 'SERVER':
        return isMyanmar
          ? 'Server/region name, issue time, and a screenshot or error detail ကို ထပ်ပို့ပေးပါ။'
          : 'Please send the server or region name, issue time, and a screenshot or error detail.';
      case 'BILLING':
        return isMyanmar
          ? 'Receipt, payment screenshot, and the billing/refund detail ကို ထပ်ပို့ပေးပါ။'
          : 'Please send the receipt, payment screenshot, and the billing or refund detail.';
      default:
        return isMyanmar
          ? 'ဆက်လုပ်ရန် detail or screenshot အနည်းငယ် ထပ်ပို့ပေးပါ။'
          : 'Please send a little more detail or a clearer screenshot so we can continue.';
    }
  }

  if (input.action === 'ESCALATE') {
    return isMyanmar
      ? 'ဤ issue ကို deeper review အတွက် dashboard panel သို့ escalate လုပ်ထားပါသည်။'
      : 'This issue has been escalated to the dashboard panel for deeper review.';
  }

  return isMyanmar
    ? 'ဤ issue ကို ကိုင်တွယ်ပြီးပါပြီ။ လိုအပ်ပါက ဤ thread ကို reply လုပ်ပြီး ပြန်ဆက်သွယ်နိုင်ပါသည်။'
    : 'This issue has been handled. If you still need help, reply here and we can continue in the same thread.';
}

export async function replyTelegramSupportThreadAsAdmin(input: {
  threadId: string;
  adminUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage: string;
  mediaKind?: 'IMAGE' | 'FILE' | null;
  mediaTelegramFileId?: string | null;
  mediaFilename?: string | null;
  mediaContentType?: string | null;
  notifyCustomer?: boolean;
}) {
  const thread = await findTelegramSupportThreadByIdForAdmin({
    threadId: input.threadId,
  });
  if (!thread) {
    throw new Error('Support thread not found.');
  }

  if (thread.status === 'HANDLED') {
    throw new Error('This support thread is already handled.');
  }

  const locale = thread.locale === 'my' ? 'my' : 'en';
  const message = input.customerMessage.trim();
  if (!message) {
    throw new Error('Customer message is required.');
  }

  await addTelegramSupportReply({
    threadId: thread.id,
    senderType: 'ADMIN',
    adminUserId: input.adminUserId ?? null,
    senderName: input.reviewerName ?? null,
    message,
    mediaKind: input.mediaKind || null,
    mediaTelegramFileId: input.mediaTelegramFileId || null,
    mediaFilename: input.mediaFilename || null,
    mediaContentType: input.mediaContentType || null,
    waitingOn: 'USER',
  });

  const updatedThread = await findTelegramSupportThreadByIdForAdmin({
    threadId: thread.id,
  });
  if (!updatedThread) {
    throw new Error('Support thread not found after reply.');
  }

  const config = await getTelegramConfig();
  const supportLink = await getTelegramSupportLink();
  if (config?.botToken && input.notifyCustomer !== false) {
    await sendTelegramMessage(
      config.botToken,
      thread.telegramChatId,
      buildTelegramSupportThreadStatusMessage({
        thread: updatedThread,
        locale,
      }),
      {
        replyMarkup: buildTelegramSupportThreadKeyboard({
          locale,
          threadId: updatedThread.id,
          supportLink,
          attachmentUrl:
            updatedThread.replies[updatedThread.replies.length - 1]?.mediaUrl || null,
        }),
      },
    );
  }

  await writeAuditLog({
    userId: input.adminUserId ?? null,
    action: 'TELEGRAM_SUPPORT_THREAD_REPLIED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      reviewerName: input.reviewerName ?? null,
      adminNote: input.adminNote?.trim() || null,
    },
  });

  return updatedThread;
}

export async function handleTelegramSupportThreadAsAdmin(input: {
  threadId: string;
  adminUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
}) {
  const thread = await findTelegramSupportThreadByIdForAdmin({
    threadId: input.threadId,
  });
  if (!thread) {
    throw new Error('Support thread not found.');
  }

  if (thread.status === 'HANDLED') {
    throw new Error('This support thread is already handled.');
  }

  const locale = thread.locale === 'my' ? 'my' : 'en';
  const defaultMessage =
    locale === 'my'
      ? 'ဤ issue ကို ကိုင်တွယ်ပြီးပါပြီ။ လိုအပ်ပါက ဤ thread ကို reply လုပ်ပြီး ပြန်ဆက်သွယ်နိုင်ပါသည်။'
      : 'This issue has been handled. If you still need help, reply here and we can continue in the same thread.';
  const message = input.customerMessage?.trim() || defaultMessage;

  await addTelegramSupportReply({
    threadId: thread.id,
    senderType: 'ADMIN',
    adminUserId: input.adminUserId ?? null,
    senderName: input.reviewerName ?? null,
    message,
    waitingOn: 'NONE',
    markHandled: true,
  });

  const updatedThread = await findTelegramSupportThreadByIdForAdmin({
    threadId: thread.id,
  });
  if (!updatedThread) {
    throw new Error('Support thread not found after handling.');
  }

  const config = await getTelegramConfig();
  const supportLink = await getTelegramSupportLink();
  if (config?.botToken) {
    await sendTelegramMessage(
      config.botToken,
      thread.telegramChatId,
      buildTelegramSupportThreadStatusMessage({
        thread: updatedThread,
        locale,
      }),
      {
        replyMarkup: buildTelegramSupportThreadKeyboard({
          locale,
          threadId: updatedThread.id,
          supportLink,
          attachmentUrl:
            updatedThread.replies[updatedThread.replies.length - 1]?.mediaUrl || null,
        }),
      },
    );
  }

  await writeAuditLog({
    userId: input.adminUserId ?? null,
    action: 'TELEGRAM_SUPPORT_THREAD_HANDLED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      reviewerName: input.reviewerName ?? null,
      adminNote: input.adminNote?.trim() || null,
    },
  });

  return updatedThread;
}

export async function escalateTelegramSupportThreadToPanel(input: {
  threadId: string;
  adminUserId?: string | null;
  reviewerName?: string | null;
  escalationReason?: string | null;
  customerMessage?: string | null;
}) {
  const thread = await findTelegramSupportThreadByIdForAdmin({
    threadId: input.threadId,
  });
  if (!thread) {
    throw new Error('Support thread not found.');
  }

  if (thread.status === 'HANDLED') {
    throw new Error('This support thread is already handled.');
  }

  const locale = thread.locale === 'my' ? 'my' : 'en';
  const message =
    input.customerMessage?.trim()
    || (locale === 'my'
      ? 'ဤ issue ကို dashboard panel သို့ escalate လုပ်ထားပါသည်။ Panel ထဲမှ review ဆက်လုပ်ပါမည်။'
      : 'This issue has been escalated to the dashboard panel for deeper review.');

  await addTelegramSupportReply({
    threadId: thread.id,
    senderType: 'ADMIN',
    adminUserId: input.adminUserId ?? null,
    senderName: input.reviewerName ?? null,
    message,
    waitingOn: 'ADMIN',
    escalate: true,
    escalationReason: input.escalationReason ?? null,
  });

  const updatedThread = await findTelegramSupportThreadByIdForAdmin({
    threadId: thread.id,
  });
  if (!updatedThread) {
    throw new Error('Support thread not found after escalation.');
  }

  const config = await getTelegramConfig();
  const supportLink = await getTelegramSupportLink();
  if (config?.botToken) {
    await sendTelegramMessage(
      config.botToken,
      thread.telegramChatId,
      buildTelegramSupportThreadStatusMessage({
        thread: updatedThread,
        locale,
      }),
      {
        replyMarkup: buildTelegramSupportThreadKeyboard({
          locale,
          threadId: updatedThread.id,
          supportLink,
          includeEscalate: false,
          attachmentUrl:
            updatedThread.replies[updatedThread.replies.length - 1]?.mediaUrl || null,
        }),
      },
    );
  }

  await writeAuditLog({
    userId: input.adminUserId ?? null,
    action: 'TELEGRAM_SUPPORT_THREAD_ESCALATED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      reviewerName: input.reviewerName ?? null,
      escalationReason: input.escalationReason?.trim() || null,
    },
  });

  return updatedThread;
}

