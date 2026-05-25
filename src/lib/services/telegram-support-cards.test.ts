import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramSupportHubKeyboard,
  buildTelegramSupportStatusSummaryKeyboard,
  buildTelegramSupportThreadKeyboard,
} from '@/lib/services/telegram-support-cards';
import {
  buildTelegramMenuCallbackData,
  buildTelegramSupportThreadCallbackData,
} from '@/lib/services/telegram-callbacks';

test('support thread keyboard adapts the primary CTA to thread state', () => {
  const handled = buildTelegramSupportThreadKeyboard({
    locale: 'en',
    threadId: 'thread_123',
    threadStatus: 'HANDLED',
    waitingOn: 'NONE',
    attachmentUrl: 'https://example.com/attachment.png',
    supportLink: 'https://t.me/outlineadminsupport',
  });

  assert.equal(handled.inline_keyboard[0]?.[0]?.text, '🔁 Reopen thread');
  assert.equal(
    handled.inline_keyboard[0]?.[1]?.callback_data,
    buildTelegramSupportThreadCallbackData('status', 'list'),
  );
  assert.equal(
    handled.inline_keyboard.flat().some((button) => button.text === '📌 Escalate'),
    false,
  );
  assert.equal(
    handled.inline_keyboard.flat().some((button) => button.url === 'https://example.com/attachment.png'),
    true,
  );

  const waitingOnUser = buildTelegramSupportThreadKeyboard({
    locale: 'my',
    threadId: 'thread_456',
    threadStatus: 'OPEN',
    waitingOn: 'USER',
  });

  assert.equal(waitingOnUser.inline_keyboard[0]?.[0]?.text, '✍️ အချက်အလက် ထပ်ပို့မည်');
  assert.equal(waitingOnUser.inline_keyboard[0]?.[1]?.text, '🧵 ကျွန်ုပ်၏ စာတွဲများ');
});

test('support status summary keyboard offers direct category shortcuts', () => {
  const keyboard = buildTelegramSupportStatusSummaryKeyboard({
    locale: 'en',
    threads: [{ id: 'thread_123', threadCode: 'SUP-AAA111' }],
    premiumRequests: [{ id: 'req_1', requestCode: 'PRM-123' }],
    supportLink: 'https://t.me/outlineadminsupport',
  });

  assert.equal(keyboard.inline_keyboard[0]?.[0]?.text, '🧵 SUP-AAA111');
  assert.equal(keyboard.inline_keyboard[1]?.[0]?.text, '💎 PRM-123');
  assert.equal(keyboard.inline_keyboard[2]?.[0]?.text, '🧾 Order / payment');
  assert.equal(
    keyboard.inline_keyboard[2]?.[0]?.callback_data,
    buildTelegramSupportThreadCallbackData('new', 'order'),
  );
  assert.equal(keyboard.inline_keyboard[2]?.[1]?.text, '🔑 Key / usage');
  assert.equal(keyboard.inline_keyboard[3]?.[0]?.text, '🛠 Server / route');
  assert.equal(keyboard.inline_keyboard[3]?.[1]?.text, '💳 Billing / coupon');
  assert.equal(keyboard.inline_keyboard[4]?.[0]?.text, '💬 General help');
  assert.equal(
    keyboard.inline_keyboard[4]?.[1]?.callback_data,
    buildTelegramMenuCallbackData('support', 'home'),
  );
  assert.equal(keyboard.inline_keyboard[5]?.[0]?.text, '🗂 My keys');
  assert.equal(keyboard.inline_keyboard[6]?.[0]?.url, 'https://t.me/outlineadminsupport');
});

test('support hub keyboard still exposes premium shortcut without losing category entry points', () => {
  const keyboard = buildTelegramSupportHubKeyboard({
    locale: 'en',
    showPremiumShortcut: true,
  });

  assert.equal(keyboard.inline_keyboard[0]?.[0]?.text, '🧾 Order / payment');
  assert.equal(keyboard.inline_keyboard[3]?.[0]?.text, '🗂 My keys');
  assert.equal(keyboard.inline_keyboard[3]?.[1]?.text, '💎 Premium help');
});
