import assert from 'node:assert/strict';
import path from 'node:path';
import { applyEnvFileToProcessEnv } from '@/lib/services/production-validation';
import {
  parseTelegramSmokeStoredConfig,
  resolveTelegramSmokeWebhookSecret,
  resolveTelegramSmokeWebhookUrl,
} from '@/lib/services/telegram-smoke';
import { TELEGRAM_WEBHOOK_SECRET_HEADER } from '@/lib/telegram-webhook-secret';

type SmokeCommand = {
  text: string;
  label: string;
  admin?: boolean;
};

function getArg(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

function getOptional(name: string, fallbackEnv?: string) {
  return getArg(name) || (fallbackEnv ? process.env[fallbackEnv] : undefined);
}

function getRequired(name: string, fallbackEnv?: string) {
  const value = getOptional(name, fallbackEnv);
  if (!value) {
    throw new Error(`Missing ${name}. Use --${name}=... or ${fallbackEnv}.`);
  }
  return value;
}

function parseNumeric(value: string, label: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

async function sendWebhookUpdate(
  webhookUrl: string,
  webhookSecret: string,
  update: Record<string, unknown>,
  label: string,
) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [TELEGRAM_WEBHOOK_SECRET_HEADER]: webhookSecret,
    },
    body: JSON.stringify(update),
  });

  assert.equal(response.status, 200, `${label} expected webhook 200 but got ${response.status}`);
  const payload = await response.json();
  assert.equal(payload?.ok, true, `${label} expected { ok: true } but got ${JSON.stringify(payload)}`);
}

async function loadStoredTelegramConfig() {
  if (!process.env.DATABASE_URL) {
    return {
      botToken: null,
      webhookSecretToken: null,
    };
  }

  const { db } = await import('@/lib/db');

  try {
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
      select: { value: true },
    });
    return parseTelegramSmokeStoredConfig(settings?.value);
  } catch (error) {
    console.warn('Unable to load persisted Telegram bot settings for smoke test:', error);
    return {
      botToken: null,
      webhookSecretToken: null,
    };
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const envFile = getOptional('env-file', 'TELEGRAM_SMOKE_ENV_FILE') || '.env';
  applyEnvFileToProcessEnv(path.join(process.cwd(), envFile));

  const webhookUrl = resolveTelegramSmokeWebhookUrl({
    explicitUrl: getArg('webhook-url'),
    env: process.env,
  });
  if (!webhookUrl) {
    throw new Error(
      'Missing webhook-url. Use --webhook-url=..., TELEGRAM_SMOKE_WEBHOOK_URL, or configure APP_URL/NEXT_PUBLIC_APP_URL in your env file.',
    );
  }

  let webhookSecret = resolveTelegramSmokeWebhookSecret({
    explicitSecret: getArg('webhook-secret'),
    env: process.env,
  });
  if (!webhookSecret) {
    const storedConfig = await loadStoredTelegramConfig();
    webhookSecret = resolveTelegramSmokeWebhookSecret({
      explicitSecret: getArg('webhook-secret'),
      env: process.env,
      botToken: storedConfig.botToken,
      persistedSecret: storedConfig.webhookSecretToken,
    });
  }
  if (!webhookSecret) {
    throw new Error(
      'Missing webhook secret. Use --webhook-secret=..., TELEGRAM_SMOKE_WEBHOOK_SECRET, TELEGRAM_WEBHOOK_SECRET, or ensure DATABASE_URL/JWT_SECRET can resolve the persisted telegram_bot settings.',
    );
  }

  const chatId = parseNumeric(getRequired('chat-id', 'TELEGRAM_SMOKE_CHAT_ID'), 'chat-id');
  const userId = parseNumeric(getRequired('user-id', 'TELEGRAM_SMOKE_USER_ID'), 'user-id');
  const username = getOptional('username', 'TELEGRAM_SMOKE_USERNAME') || 'telegram_smoke_user';
  const adminChatId = parseNumeric(
    getOptional('admin-chat-id', 'TELEGRAM_SMOKE_ADMIN_CHAT_ID') || String(chatId),
    'admin-chat-id',
  );
  const adminUserId = parseNumeric(
    getOptional('admin-user-id', 'TELEGRAM_SMOKE_ADMIN_USER_ID') || String(userId),
    'admin-user-id',
  );
  const adminUsername = getOptional('admin-username', 'TELEGRAM_SMOKE_ADMIN_USERNAME') || username;

  const commands: SmokeCommand[] = [
    { text: '/help', label: 'user /help' },
    { text: '/support', label: 'user /support' },
    { text: '/orders', label: 'user /orders' },
    { text: '/inbox', label: 'user /inbox' },
    { text: '/announcements', label: 'admin /announcements', admin: true },
    { text: '/finance', label: 'admin /finance', admin: true },
  ];

  let updateId = Date.now();

  for (const command of commands) {
    const effectiveChatId = command.admin ? adminChatId : chatId;
    const effectiveUserId = command.admin ? adminUserId : userId;
    const effectiveUsername = command.admin ? adminUsername : username;

    await sendWebhookUpdate(
      webhookUrl,
      webhookSecret,
      {
        update_id: updateId++,
        message: {
          message_id: updateId,
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: effectiveChatId,
            type: 'private',
            username: effectiveUsername,
          },
          from: {
            id: effectiveUserId,
            is_bot: false,
            first_name: effectiveUsername,
            username: effectiveUsername,
            language_code: 'en',
          },
          text: command.text,
        },
      },
      command.label,
    );
  }

  console.log('Telegram smoke test passed');
  console.log(`Webhook: ${webhookUrl}`);
}

main().catch((error) => {
  console.error('Telegram smoke test failed');
  console.error(error);
  process.exit(1);
});
