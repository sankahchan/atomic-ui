import {
  getTelegramPendingAdminFlow,
  setTelegramPendingAdminFlow,
} from '@/lib/services/telegram-runtime';
import {
  type AccessCreateDraft,
  type AccessManageDraft,
  type DynamicCreateDraft,
  type DynamicManageDraft,
  type PendingAdminFlow,
} from '@/lib/services/telegram-admin-key-types';
import { type SupportedLocale } from '@/lib/i18n/config';
import { buildTelegramAdminKeyCallbackData } from '@/lib/services/telegram-callbacks';

export function createEmptyAccessDraft(): AccessCreateDraft {
  return {
    kind: 'create_access',
    step: 'recipient',
    recipient: null,
    name: null,
    assignmentMode: 'AUTO',
    serverId: null,
    dataLimitGB: null,
    expirationType: 'NEVER',
    durationDays: null,
    expiresAt: null,
  };
}

export function createEmptyDynamicDraft(): DynamicCreateDraft {
  return {
    kind: 'create_dynamic',
    step: 'recipient',
    recipient: null,
    name: null,
    keyType: 'SELF_MANAGED',
    dataLimitGB: null,
    expirationType: 'NEVER',
    durationDays: null,
    expiresAt: null,
  };
}

export function createAccessManageDraft(): AccessManageDraft {
  return {
    kind: 'manage_access',
    step: 'query',
    keyId: null,
  };
}

export function createDynamicManageDraft(): DynamicManageDraft {
  return {
    kind: 'manage_dynamic',
    step: 'query',
    dynamicKeyId: null,
  };
}

function parsePendingAdminFlow(raw?: string | null): PendingAdminFlow | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingAdminFlow;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string' || typeof parsed.step !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function savePendingAdminFlow(
  telegramUserId: number,
  chatId: number,
  flow: PendingAdminFlow | null,
) {
  await setTelegramPendingAdminFlow({
    telegramUserId: String(telegramUserId),
    telegramChatId: String(chatId),
    flow: flow ? JSON.stringify(flow) : null,
  });
}

export async function loadPendingAdminFlow(
  telegramUserId: number,
  chatId: number,
) {
  const pending = await getTelegramPendingAdminFlow({
    telegramUserId: String(telegramUserId),
    telegramChatId: String(chatId),
  });
  return parsePendingAdminFlow(pending?.flow);
}

export async function clearPendingAdminFlow(telegramUserId: number, chatId: number) {
  await savePendingAdminFlow(telegramUserId, chatId, null);
}

export function buildCancelKeyboard(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  return {
    inline_keyboard: [[
      {
        text: isMyanmar ? '🛑 Wizard ပယ်ဖျက်မည်' : '🛑 Cancel wizard',
        callback_data: buildTelegramAdminKeyCallbackData('cancel'),
      },
    ]],
  };
}

export function buildRecipientKeyboard(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '⏭ Recipient မသတ်မှတ်ပါ' : '⏭ Skip recipient',
          callback_data: buildTelegramAdminKeyCallbackData('skip'),
        },
      ],
      buildCancelKeyboard(locale).inline_keyboard[0],
    ],
  };
}
