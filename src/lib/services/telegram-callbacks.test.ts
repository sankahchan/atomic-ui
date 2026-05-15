import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramAdminKeyCallbackData,
  buildTelegramAdminRefundCallbackData,
  buildTelegramCommerceViewCallbackData,
  buildTelegramMenuCallbackData,
  buildTelegramOrderReviewCallbackData,
  buildTelegramSupportQueueCallbackData,
  getTelegramAdminBotCommands,
  getCommandKeyboard,
  getTelegramUserBotCommands,
  parseTelegramAdminKeyCallbackData,
  parseTelegramAdminRefundCallbackData,
  parseTelegramCommerceViewCallbackData,
  normalizeTelegramReplyKeyboardCommand,
  parseTelegramMenuCallbackData,
  parseTelegramOrderReviewCallbackData,
  parseTelegramSupportQueueCallbackData,
  resolveTelegramRetentionSourceFromRenewAction,
} from '@/lib/services/telegram-callbacks';

test('getCommandKeyboard renders localized customer labels', () => {
  const english = getCommandKeyboard(false, 'en');
  const myanmar = getCommandKeyboard(false, 'my');
  const adminMyanmar = getCommandKeyboard(true, 'my');

  assert.equal(english.keyboard[0]?.[0]?.text, '🛒 Buy');
  assert.equal(english.keyboard[0]?.[1]?.text, '🗂 Keys');
  assert.equal(english.keyboard[1]?.[0]?.text, '🔄 Renew');
  assert.equal(english.keyboard[1]?.[1]?.text, '📊 Status');
  assert.equal(english.keyboard[2]?.[0]?.text, '🌍 Switch Server');
  assert.equal(english.keyboard[2]?.[1]?.text, '📲 Setup');
  assert.equal(english.keyboard.length, 5);
  assert.equal(myanmar.keyboard[0]?.[0]?.text, '🛒 ဝယ်မည်');
  assert.equal(myanmar.keyboard[0]?.[1]?.text, '🗂 Key များ');
  assert.equal(myanmar.keyboard[4]?.[0]?.text, '❓ အကူအညီ');
  assert.equal(myanmar.keyboard[4]?.[1]?.text, '🌐 ဘာသာစကား');
  assert.equal(adminMyanmar.keyboard[5]?.[0]?.text, '🧭 Admin စင်တာ');
  assert.equal(adminMyanmar.keyboard[6]?.[0]?.text, '➕ ပုံမှန်ကီး');
  assert.equal(adminMyanmar.keyboard[10]?.[1]?.text, '💸 ငွေပြန်အမ်းများ');
});

test('normalizeTelegramReplyKeyboardCommand maps localized shortcut labels back to commands', () => {
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛒 Buy', false), '/buy');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛒 Buy key', false), '/buy');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🗂 Key များ', false), '/mykeys');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🔄 သက်တမ်းတိုး', false), '/renew');
  assert.equal(normalizeTelegramReplyKeyboardCommand('📊 Quick status', false), '/status');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🔄 Switch Server', false), '/switchserver');
  assert.equal(normalizeTelegramReplyKeyboardCommand('📲 Setup Guide', false), '/setup');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🎁 Refer a friend', false), '/referral');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🌐 ဘာသာစကား', false), '/language');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛑 Cancel', false), '/cancel');
});

test('getTelegramUserBotCommands matches the registered storefront command surface', () => {
  assert.deepEqual(
    getTelegramUserBotCommands().map((command) => command.command),
    [
      'start',
      'buy',
      'mykeys',
      'renew',
      'status',
      'switchserver',
      'setup',
      'referral',
      'support',
      'help',
      'language',
      'cancel',
    ],
  );

  assert.equal(
    getTelegramUserBotCommands('my').find((command) => command.command === 'language')?.description,
    '🌐 ဘာသာစကားပြောင်း',
  );
});

test('getTelegramAdminBotCommands extends the command menu for admin chats', () => {
  assert.deepEqual(
    getTelegramAdminBotCommands().map((command) => command.command),
    [
      'start',
      'buy',
      'mykeys',
      'renew',
      'status',
      'switchserver',
      'setup',
      'referral',
      'support',
      'help',
      'language',
      'cancel',
      'admin',
      'reviewqueue',
      'createkey',
      'createdynamic',
      'managekey',
      'managedynamic',
      'expiring',
      'find',
      'announcements',
      'finance',
      'refunds',
    ],
  );

  assert.equal(
    getTelegramAdminBotCommands('my').find((command) => command.command === 'finance')?.description,
    '💼 ငွေစာရင်း',
  );
});

test('normalizeTelegramReplyKeyboardCommand keeps admin labels admin-only', () => {
  assert.equal(normalizeTelegramReplyKeyboardCommand('🧭 Admin home', false), null);
  assert.equal(normalizeTelegramReplyKeyboardCommand('📢 Broadcasts', false), null);
  assert.equal(normalizeTelegramReplyKeyboardCommand('🧭 Admin home', true), '/admin');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🧭 Admin စင်တာ', true), '/admin');
  assert.equal(normalizeTelegramReplyKeyboardCommand('📋 Review queue', true), '/reviewqueue');
  assert.equal(normalizeTelegramReplyKeyboardCommand('📋 စစ်ဆေးရန်', true), '/reviewqueue');
  assert.equal(normalizeTelegramReplyKeyboardCommand('📢 Broadcasts', true), '/announcements');
  assert.equal(normalizeTelegramReplyKeyboardCommand('➕ Normal key', true), '/createkey');
  assert.equal(normalizeTelegramReplyKeyboardCommand('💎 Dynamic key', true), '/createdynamic');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛠 Manage key', true), '/managekey');
  assert.equal(normalizeTelegramReplyKeyboardCommand('💸 ငွေပြန်အမ်းများ', true), '/refunds');
});

test('telegram order review callbacks support quick reject presets', () => {
  const data = buildTelegramOrderReviewCallbackData('reject_duplicate', 'ord_123');
  assert.deepEqual(parseTelegramOrderReviewCallbackData(data), {
    action: 'reject_duplicate',
    orderId: 'ord_123',
    secondary: null,
  });

  assert.deepEqual(
    parseTelegramOrderReviewCallbackData(
      buildTelegramOrderReviewCallbackData('reject_blurry', 'ord_456'),
    ),
    {
      action: 'reject_blurry',
      orderId: 'ord_456',
      secondary: null,
    },
  );

  assert.deepEqual(
    parseTelegramOrderReviewCallbackData(
      buildTelegramOrderReviewCallbackData('reject_wrong_amount', 'ord_789'),
    ),
    {
      action: 'reject_wrong_amount',
      orderId: 'ord_789',
      secondary: null,
    },
  );

  assert.deepEqual(
    parseTelegramOrderReviewCallbackData(
      buildTelegramOrderReviewCallbackData('prev', 'ord_prev', 'mine'),
    ),
    {
      action: 'prev',
      orderId: 'ord_prev',
      secondary: 'mine',
    },
  );

  assert.deepEqual(
    parseTelegramOrderReviewCallbackData(
      buildTelegramOrderReviewCallbackData('detail', 'ord_detail', 'all'),
    ),
    {
      action: 'detail',
      orderId: 'ord_detail',
      secondary: 'all',
    },
  );
});

test('telegram admin refund callbacks round-trip compact queue actions', () => {
  assert.deepEqual(
    parseTelegramAdminRefundCallbackData(
      buildTelegramAdminRefundCallbackData('claim', 'ord_123'),
    ),
    {
      action: 'claim',
      orderId: 'ord_123',
      secondary: null,
    },
  );
  assert.deepEqual(
    parseTelegramAdminRefundCallbackData(
      buildTelegramAdminRefundCallbackData('next', 'ord_123', 'queue'),
    ),
    {
      action: 'next',
      orderId: 'ord_123',
      secondary: 'queue',
    },
  );
  assert.deepEqual(
    parseTelegramAdminRefundCallbackData(
      buildTelegramAdminRefundCallbackData('detail', 'ord_456'),
    ),
    {
      action: 'detail',
      orderId: 'ord_456',
      secondary: null,
    },
  );
  assert.equal(parseTelegramAdminRefundCallbackData('admrefund:refund:ord_1'), null);
});

test('telegram menu callbacks support admin and user filters', () => {
  assert.deepEqual(
    parseTelegramMenuCallbackData(buildTelegramMenuCallbackData('admin', 'supportqueue_user')),
    {
      section: 'admin',
      action: 'supportqueue_user',
    },
  );
  assert.deepEqual(
    parseTelegramMenuCallbackData(buildTelegramMenuCallbackData('inbox', 'premium')),
    {
      section: 'inbox',
      action: 'premium',
    },
  );
  assert.deepEqual(
    parseTelegramMenuCallbackData(buildTelegramMenuCallbackData('offers', 'unavailable')),
    {
      section: 'offers',
      action: 'unavailable',
    },
  );
  assert.deepEqual(
    parseTelegramMenuCallbackData(buildTelegramMenuCallbackData('orders', 'review')),
    {
      section: 'orders',
      action: 'review',
    },
  );
  assert.deepEqual(
    parseTelegramMenuCallbackData(buildTelegramMenuCallbackData('support', 'server')),
    {
      section: 'support',
      action: 'server',
    },
  );
  assert.deepEqual(
    parseTelegramMenuCallbackData(buildTelegramMenuCallbackData('trial', 'claim')),
    {
      section: 'trial',
      action: 'claim',
    },
  );
});

test('telegram commerce view callbacks round-trip compact payloads', () => {
  assert.deepEqual(
    parseTelegramCommerceViewCallbackData(
      buildTelegramCommerceViewCallbackData('buy', 'page', '2'),
    ),
    {
      section: 'buy',
      action: 'page',
      primary: '2',
      secondary: null,
    },
  );

  assert.deepEqual(
    parseTelegramCommerceViewCallbackData(
      buildTelegramCommerceViewCallbackData('orders', 'filter', 'review', '2'),
    ),
    {
      section: 'orders',
      action: 'filter',
      primary: 'review',
      secondary: '2',
    },
  );

  assert.deepEqual(
    parseTelegramCommerceViewCallbackData(
      buildTelegramCommerceViewCallbackData('premium', 'detail', 'dak_123'),
    ),
    {
      section: 'premium',
      action: 'detail',
      primary: 'dak_123',
      secondary: null,
    },
  );
});

test('telegram support queue callbacks preserve queue mode secondary', () => {
  assert.deepEqual(
    parseTelegramSupportQueueCallbackData(
      buildTelegramSupportQueueCallbackData('nx', 'req_123', 'user'),
    ),
    {
      action: 'nx',
      requestId: 'req_123',
      secondary: 'user',
    },
  );

  assert.deepEqual(
    parseTelegramSupportQueueCallbackData(
      buildTelegramSupportQueueCallbackData('dt', 'req_123', 'admin'),
    ),
    {
      action: 'dt',
      requestId: 'req_123',
      secondary: 'admin',
    },
  );
});

test('telegram support thread queue callbacks support ownership and reply actions', () => {
  assert.deepEqual(
    parseTelegramSupportQueueCallbackData(
      buildTelegramSupportQueueCallbackData('cl', 'thr_thread123', 'admin'),
    ),
    {
      action: 'cl',
      requestId: 'thr_thread123',
      secondary: 'admin',
    },
  );

  assert.deepEqual(
    parseTelegramSupportQueueCallbackData(
      buildTelegramSupportQueueCallbackData('rp', 'thr_thread123', 'all'),
    ),
    {
      action: 'rp',
      requestId: 'thr_thread123',
      secondary: 'all',
    },
  );

  assert.deepEqual(
    parseTelegramSupportQueueCallbackData(
      buildTelegramSupportQueueCallbackData('es', 'thr_thread123', 'user'),
    ),
    {
      action: 'es',
      requestId: 'thr_thread123',
      secondary: 'user',
    },
  );
});

test('resolveTelegramRetentionSourceFromRenewAction supports dynamic coupon renewals', () => {
  assert.equal(
    resolveTelegramRetentionSourceFromRenewAction('dynamic_renewal_coupon'),
    'renewal_coupon',
  );
});

test('telegram admin key callbacks preserve action arguments', () => {
  assert.deepEqual(
    parseTelegramAdminKeyCallbackData(
      buildTelegramAdminKeyCallbackData('quota', 'key_123', '30'),
    ),
    {
      action: 'quota',
      primary: 'key_123',
      secondary: '30',
    },
  );
});
