import { type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramAdminKeyDeps } from '@/lib/services/telegram-domain-types';
import {
  buildCancelKeyboard,
  createAccessManageDraft,
  createDynamicManageDraft,
  savePendingAdminFlow,
} from '@/lib/services/telegram-admin-key-flow-state';
import { resolveAdminKeyQuery } from '@/lib/services/telegram-admin-review';
import {
  promptManageMatches,
  resolveDynamicKeyQuery,
  showAccessManageActions,
  showDynamicManageActions,
} from '@/lib/services/telegram-admin-key-handlers';
import { formatExpirationSummary, formatTelegramDynamicPoolSummary, getTelegramUi } from '@/lib/services/telegram-ui';
import { formatBytes } from '@/lib/utils';

export async function handleAdminManageAccessKeyCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
  deps: TelegramAdminKeyDeps;
}) {
  const draft = createAccessManageDraft();
  const query = input.argsText.trim();
  if (!query) {
    await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '🛠 Manage normal key အတွက် KEY ID, Outline ID, name, email, သို့မဟုတ် Telegram ID ကို ပို့ပါ။'
        : '🛠 Send the KEY ID, Outline ID, name, email, or Telegram ID for the normal key you want to manage.',
      {
        replyMarkup: buildCancelKeyboard(input.locale),
      },
    );
    return null;
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind === 'single') {
    const nextDraft = {
      kind: 'manage_access' as const,
      step: 'actions' as const,
      keyId: result.key.id,
    };
    await savePendingAdminFlow(input.telegramUserId, input.chatId, nextDraft);
    await showAccessManageActions({
      chatId: input.chatId,
      botToken: input.botToken,
      locale: input.locale,
      keyId: result.key.id,
      deps: input.deps,
    });
    return null;
  }

  await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
  if (result.kind === 'many' && result.matches.length > 0) {
    await promptManageMatches({
      chatId: input.chatId,
      botToken: input.botToken,
      locale: input.locale,
      type: 'access',
      matches: result.matches.map((key) => ({
        id: key.id,
        name: key.name,
        status: key.status,
        details: [
          `${key.server?.name || 'Unknown server'}${key.dataLimitBytes ? ` • ${formatBytes(key.dataLimitBytes)}` : ' • Unlimited'}`,
          formatExpirationSummary(
            {
              expiresAt: key.expiresAt,
              expirationType: key.expirationType,
              durationDays: key.durationDays,
            },
            input.locale,
          ),
          key.email || key.telegramId || 'No recipient',
        ],
      })),
      deps: input.deps,
    });
    return null;
  }

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    input.locale === 'my' ? 'Access key ကို မတွေ့ပါ။' : 'Access key not found.',
    {
      replyMarkup: buildCancelKeyboard(input.locale),
    },
  );
  return null;
}

export async function handleAdminManageDynamicKeyCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
  deps: TelegramAdminKeyDeps;
}) {
  const draft = createDynamicManageDraft();
  const query = input.argsText.trim();
  if (!query) {
    await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '🧭 Manage dynamic key အတွက် key ID, name, email, public slug, သို့မဟုတ် Telegram ID ကို ပို့ပါ။'
        : '🧭 Send the dynamic key ID, name, email, public slug, or Telegram ID you want to manage.',
      {
        replyMarkup: buildCancelKeyboard(input.locale),
      },
    );
    return null;
  }

  const result = await resolveDynamicKeyQuery(query);
  if (result.kind === 'single') {
    const nextDraft = {
      kind: 'manage_dynamic' as const,
      step: 'actions' as const,
      dynamicKeyId: result.key.id,
    };
    await savePendingAdminFlow(input.telegramUserId, input.chatId, nextDraft);
    await showDynamicManageActions({
      chatId: input.chatId,
      botToken: input.botToken,
      locale: input.locale,
      dynamicKeyId: result.key.id,
      deps: input.deps,
    });
    return null;
  }

  await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
  if (result.kind === 'many' && result.matches.length > 0) {
    await promptManageMatches({
      chatId: input.chatId,
      botToken: input.botToken,
      locale: input.locale,
      type: 'dynamic',
      matches: result.matches.map((key) => ({
        id: key.id,
        name: key.name,
        status: key.status,
        details: [
          `${key.type}${key.dataLimitBytes ? ` • ${formatBytes(key.dataLimitBytes)}` : ' • Unlimited'}`,
          formatExpirationSummary(
            {
              expiresAt: key.expiresAt,
              expirationType: key.expirationType,
              durationDays: key.durationDays,
            },
            input.locale,
          ),
          formatTelegramDynamicPoolSummary(key, getTelegramUi(input.locale)),
          key.email || key.telegramId || 'No recipient',
        ],
      })),
      deps: input.deps,
    });
    return null;
  }

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    input.locale === 'my' ? 'Dynamic key ကို မတွေ့ပါ။' : 'Dynamic key not found.',
    {
      replyMarkup: buildCancelKeyboard(input.locale),
    },
  );
  return null;
}
