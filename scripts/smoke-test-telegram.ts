import assert from 'node:assert/strict';

type SmokeCommand = {
  text: string;
  label: string;
  admin?: boolean;
};

function getArg(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

function getRequired(name: string, fallbackEnv?: string) {
  const value = getArg(name) || (fallbackEnv ? process.env[fallbackEnv] : undefined);
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
  update: Record<string, unknown>,
  label: string,
) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(update),
  });

  assert.equal(response.status, 200, `${label} expected webhook 200 but got ${response.status}`);
  const payload = await response.json();
  assert.equal(payload?.ok, true, `${label} expected { ok: true } but got ${JSON.stringify(payload)}`);
}

async function main() {
  const webhookUrl = getRequired('webhook-url', 'TELEGRAM_SMOKE_WEBHOOK_URL');
  const chatId = parseNumeric(getRequired('chat-id', 'TELEGRAM_SMOKE_CHAT_ID'), 'chat-id');
  const userId = parseNumeric(getRequired('user-id', 'TELEGRAM_SMOKE_USER_ID'), 'user-id');
  const username = getArg('username') || process.env.TELEGRAM_SMOKE_USERNAME || 'telegram_smoke_user';
  const adminChatId = parseNumeric(
    getArg('admin-chat-id') || process.env.TELEGRAM_SMOKE_ADMIN_CHAT_ID || String(chatId),
    'admin-chat-id',
  );
  const adminUserId = parseNumeric(
    getArg('admin-user-id') || process.env.TELEGRAM_SMOKE_ADMIN_USER_ID || String(userId),
    'admin-user-id',
  );
  const adminUsername = getArg('admin-username') || process.env.TELEGRAM_SMOKE_ADMIN_USERNAME || username;

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
}

main().catch((error) => {
  console.error('Telegram smoke test failed');
  console.error(error);
  process.exit(1);
});
