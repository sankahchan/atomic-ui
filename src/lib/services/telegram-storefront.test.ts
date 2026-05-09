import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramStoreActiveKeysView,
  buildTelegramStoreExpiryReminderView,
  buildTelegramStoreKeyPageView,
  buildTelegramStoreOrderConfirmedView,
  buildTelegramStorePlatformGuideView,
  buildTelegramStorePlatformSelectView,
  buildTelegramStoreTrialKeyPageView,
  buildTelegramStoreMainMenuView,
  buildTelegramStoreMyAccountView,
  buildTelegramStoreOrderSummaryView,
  buildTelegramStorePlanListView,
  buildTelegramStoreQuickStatusView,
  buildTelegramStorefrontCallbackData,
  parseTelegramStorefrontCallbackData,
  progressBar,
  usageBar,
  type TelegramStoreResolvedPlan,
} from '@/lib/services/telegram-storefront';

const samplePlans: TelegramStoreResolvedPlan[] = [
  {
    id: 'plan_basic',
    planCode: '1m_150gb',
    category: 'flash',
    messageIndex: '①',
    buttonLabel: '1️⃣ 🪨 Basic',
    listLabel: '🪨 Basic',
    buttonName: '🪨 Basic',
    detailName: '🪨 Basic',
    badge: null,
    plan: { deliveryType: 'ACCESS_KEY' } as any,
    dataLabel: '150 GB',
    durationLabel: '30 days',
    priceAmount: 5000,
    priceLabel: '5,000 Ks',
    switchesValue: 3,
    switchesLabel: '3 times',
    switchesMaxLabel: '3',
    keyTypeLabel: 'Standard Key',
  },
  {
    id: 'plan_pro',
    planCode: '1m_200gb',
    category: 'flash',
    messageIndex: '②',
    buttonLabel: '2️⃣ 💎 Pro ★',
    listLabel: '💎 Pro',
    buttonName: '💎 Pro ★',
    detailName: '💎 Pro',
    badge: 'popular',
    plan: { deliveryType: 'ACCESS_KEY' } as any,
    dataLabel: '200 GB',
    durationLabel: '30 days',
    priceAmount: 7000,
    priceLabel: '7,000 Ks',
    switchesValue: 3,
    switchesLabel: '3 times',
    switchesMaxLabel: '3',
    keyTypeLabel: 'Standard Key',
  },
  {
    id: 'plan_ultra',
    planCode: '1m_350gb',
    category: 'flash',
    messageIndex: '③',
    buttonLabel: '3️⃣ 🚀 Ultra ★★',
    listLabel: '🚀 Ultra',
    buttonName: '🚀 Ultra ★★',
    detailName: '🚀 Ultra',
    badge: 'best_deal',
    plan: { deliveryType: 'ACCESS_KEY' } as any,
    dataLabel: '350 GB',
    durationLabel: '30 days',
    priceAmount: 11000,
    priceLabel: '11,000 Ks',
    switchesValue: 3,
    switchesLabel: '3 times',
    switchesMaxLabel: '3',
    keyTypeLabel: 'Standard Key',
  },
  {
    id: 'plan_season_lite',
    planCode: '3m_300gb',
    category: 'season',
    messageIndex: '④',
    buttonLabel: '4️⃣ 🌿 Lite',
    listLabel: '🌿 Lite',
    buttonName: '🌿 Lite',
    detailName: '🌿 Lite',
    badge: null,
    plan: { deliveryType: 'ACCESS_KEY' } as any,
    dataLabel: '300 GB',
    durationLabel: '90 days',
    priceAmount: 10000,
    priceLabel: '10,000 Ks',
    switchesValue: 5,
    switchesLabel: '5 times',
    switchesMaxLabel: '5',
    keyTypeLabel: 'Standard Key',
  },
  {
    id: 'plan_season_plus',
    planCode: '3m_600gb',
    category: 'season',
    messageIndex: '⑤',
    buttonLabel: '5️⃣ 🌟 Plus ★',
    listLabel: '🌟 Plus',
    buttonName: '🌟 Plus ★',
    detailName: '🌟 Plus',
    badge: 'popular',
    plan: { deliveryType: 'ACCESS_KEY' } as any,
    dataLabel: '600 GB',
    durationLabel: '90 days',
    priceAmount: 19500,
    priceLabel: '19,500 Ks',
    switchesValue: 5,
    switchesLabel: '5 times',
    switchesMaxLabel: '5',
    keyTypeLabel: 'Standard Key',
  },
  {
    id: 'plan_season_max',
    planCode: '3m_1050gb',
    category: 'season',
    messageIndex: '⑥',
    buttonLabel: '6️⃣ 👑 Max ★★',
    listLabel: '👑 Max',
    buttonName: '👑 Max ★★',
    detailName: '👑 Max',
    badge: 'best_deal',
    plan: { deliveryType: 'ACCESS_KEY' } as any,
    dataLabel: '1050 GB',
    durationLabel: '90 days',
    priceAmount: 34500,
    priceLabel: '34,500 Ks',
    switchesValue: 5,
    switchesLabel: '5 times',
    switchesMaxLabel: '5',
    keyTypeLabel: 'Standard Key',
  },
  {
    id: 'plan_dynamic_standard',
    planCode: '1m_200gb_dynamic',
    category: 'dynamic',
    messageIndex: '⑦',
    buttonLabel: '7️⃣ 🪨 Std',
    listLabel: '🪨 Standard',
    buttonName: '🪨 Std',
    detailName: '🪨 Standard',
    badge: null,
    plan: { deliveryType: 'DYNAMIC_KEY' } as any,
    dataLabel: '200 GB',
    durationLabel: '1 Month',
    priceAmount: 7000,
    priceLabel: '7,000 Ks',
    switchesValue: -1,
    switchesLabel: 'Unlimited ∞',
    switchesMaxLabel: '∞',
    keyTypeLabel: 'Dynamic Key ⚙️',
  },
  {
    id: 'plan_dynamic_pro',
    planCode: '2m_300gb_dynamic',
    category: 'dynamic',
    messageIndex: '⑧',
    buttonLabel: '8️⃣ 💎 Pro ★',
    listLabel: '💎 Pro',
    buttonName: '💎 Pro ★',
    detailName: '💎 Pro',
    badge: 'popular',
    plan: { deliveryType: 'DYNAMIC_KEY' } as any,
    dataLabel: '300 GB',
    durationLabel: '2 Months',
    priceAmount: 12000,
    priceLabel: '12,000 Ks',
    switchesValue: -1,
    switchesLabel: 'Unlimited ∞',
    switchesMaxLabel: '∞',
    keyTypeLabel: 'Dynamic Key ⚙️',
  },
  {
    id: 'plan_dynamic_ultra',
    planCode: '3m_600gb_dynamic',
    category: 'dynamic',
    messageIndex: '⑨',
    buttonLabel: '9️⃣ 🚀 Ultra ★★',
    listLabel: '🚀 Ultra',
    buttonName: '🚀 Ultra ★★',
    detailName: '🚀 Ultra',
    badge: 'best_deal',
    plan: { deliveryType: 'DYNAMIC_KEY' } as any,
    dataLabel: '600 GB',
    durationLabel: '3 Months',
    priceAmount: 23000,
    priceLabel: '23,000 Ks',
    switchesValue: -1,
    switchesLabel: 'Unlimited ∞',
    switchesMaxLabel: '∞',
    keyTypeLabel: 'Dynamic Key ⚙️',
  },
];

test('store main menu matches the paid storefront button layout', () => {
  const view = buildTelegramStoreMainMenuView({
    firstName: 'Sankha',
    activeKeyCount: 3,
    nextExpiryLabel: '02 Jun 2026',
  });

  assert.match(view.text, /🛰 \*VPN Plan Store\*/);
  assert.match(view.text, /🔑 Active keys     :  3/);
  assert.match(view.text, /📅 Next expiry     :  02 Jun 2026/);
  assert.deepEqual(
    view.replyMarkup.inline_keyboard.map((row) => row[0]?.text),
    [
      '⚡ Flash Plans    ·  30 Days  ·  🔄 3×',
      '🌙 Season Plans   ·  90 Days  ·  🔄 5×',
      '🔑 Dynamic Plans  ·  Flexible ·  🔄 ∞',
      '👤 My Account',
    ],
  );
});

test('store usage bars use color semantics and account summary stays compact', () => {
  assert.equal(progressBar(20, 100), '🟩🟩░░░░░░░░ 20%');
  assert.equal(progressBar(60, 100), '🟧🟧🟧🟧🟧🟧░░░░ 60%');
  assert.equal(progressBar(80, 100), '🟥🟥🟥🟥🟥🟥🟥🟥░░ 80%');
  assert.equal(usageBar(40 * 1024 * 1024 * 1024, 100 * 1024 * 1024 * 1024), '🟩🟩🟩🟩░░░░░░  40 GB/100 GB');

  const account = buildTelegramStoreMyAccountView({
    activeKeyCount: 1,
    nextExpiryLabel: '02 Jun 2026',
    dataLeftLabel: '120 GB',
    primaryKey: {
      id: 'key_1',
      kind: 'access',
      planId: 'plan_pro',
      planName: '💎 Pro',
      categoryLabel: 'Flash',
      usedLabel: '80 GB',
      totalLabel: '200 GB',
      progressBar: '🟩🟩🟩🟩░░░░░░',
      percentLabel: '40%',
      expiryLabel: '02 Jun 2026',
      switchesUsed: 0,
      switchesMaxLabel: '3',
      renewPriceLabel: '7,000 Ks',
      currentServerName: 'SG 🇸🇬',
      usedBytes: 80 * 1024 * 1024 * 1024,
      totalBytes: 200 * 1024 * 1024 * 1024,
      expiresAt: new Date('2026-06-02T00:00:00Z'),
    },
  });

  assert.match(account.text, /👤 \*My Account\*/);
  assert.match(account.text, /🔑 Active keys   :  1/);
  assert.match(account.text, /📶 Data left     :  120 GB/);
  assert.match(account.text, /🟩🟩🟩🟩░░░░░░  80 GB\/200 GB/);
  assert.equal(account.replyMarkup.inline_keyboard[0]?.[0]?.text, '🔑 My Keys');
  assert.equal(account.replyMarkup.inline_keyboard[1]?.[0]?.text, '📲 Setup');

  const status = buildTelegramStoreQuickStatusView({
    activeKeyCount: 1,
    nextExpiryLabel: '02 Jun 2026',
    dataLeftLabel: '120 GB',
  });
  assert.match(status.text, /📊 \*Your Status\*/);
  assert.match(status.text, /📶 Data left     :  120 GB/);
});

test('store plan list keeps the fixed 9-plan catalog and dynamic ultra pricing', () => {
  const view = buildTelegramStorePlanListView(samplePlans);

  assert.match(view.text, /⑥ 👑 Max\s+1050 GB\s+34,500 Ks\s+★★/);
  assert.match(view.text, /⑨ 🚀 Ultra\s+600 GB\s+23,000 Ks\s+· 3M\s+★★/);
  assert.match(view.text, /★ Popular  ·  ★★ Best Deal/);
  assert.equal(view.replyMarkup.inline_keyboard[0]?.[0]?.text, '1️⃣ 🪨 Basic');
  assert.equal(view.replyMarkup.inline_keyboard[2]?.[2]?.text, '9️⃣ 🚀 Ultra ★★');
});

test('store expiry reminders include data remaining, days left, and remind-later action', () => {
  const reminder = buildTelegramStoreExpiryReminderView({
    firstName: 'Sankha',
    planName: '💎 Pro',
    expiryLabel: '02 Jun 2026',
    priceLabel: '8,800 Ks',
    plan: samplePlans[1]!,
    daysLeft: 3,
    dataRemainingLabel: '80 GB',
  });

  assert.match(reminder.text, /Plan Expiring Soon/);
  assert.match(reminder.text, /expires in \*3 days\*/);
  assert.match(reminder.text, /📶 Data remaining  :  80 GB/);
  assert.match(reminder.text, /⏳ Days left       :  3 days/);
  assert.equal(reminder.replyMarkup.inline_keyboard[0]?.[0]?.text, '🔄 Renew Now — 8,800 Ks');
  assert.equal(reminder.replyMarkup.inline_keyboard[1]?.[0]?.text, '📦 View All Plans');
  assert.equal(reminder.replyMarkup.inline_keyboard[2]?.[0]?.text, 'Remind me later');
  assert.equal(
    reminder.replyMarkup.inline_keyboard[2]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'noop' }),
  );
});

test('store order summary and active keys keep the polished storefront labels', () => {
  const summary = buildTelegramStoreOrderSummaryView({
    plan: samplePlans[8]!,
    couponCode: 'HELLO10',
    originalPriceAmount: 23000,
    discountAmount: 1000,
    finalPriceAmount: 22000,
  });

  assert.match(summary.text, /💰 Final price :  \*22,000 Ks\*/);
  assert.equal(summary.replyMarkup.inline_keyboard[0]?.[0]?.text, '✅  Confirm & Pay   22,000 Ks');
  assert.equal(summary.replyMarkup.inline_keyboard[1]?.[0]?.text, '🏷  Change Coupon');
  assert.equal(summary.replyMarkup.inline_keyboard[2]?.[0]?.text, '◀   Back to Plans');

  const active = buildTelegramStoreActiveKeysView([
    {
      id: 'key_1',
      kind: 'access',
      planId: 'plan_basic',
      planName: '🪨 Basic',
      categoryLabel: 'Flash',
      usedLabel: '80 GB',
      totalLabel: '150 GB',
      progressBar: '█████░░░░░',
      percentLabel: '53%',
      expiryLabel: '02 Jun 2026',
      switchesUsed: 1,
      switchesMaxLabel: '3',
      renewPriceLabel: '5,000 Ks',
      currentServerName: 'SG 🇸🇬',
    },
  ]);

  assert.match(active.text, /1️⃣ 🪨 Basic  ·  Flash/);
  assert.match(active.text, /🔄 Switches: 1 \/ 3/);
  assert.match(active.text, /Tap a key below to open details/);
  assert.equal(active.replyMarkup.inline_keyboard[0]?.[0]?.text, '📄 Open 🪨 Basic');
  assert.equal(active.replyMarkup.inline_keyboard[0]?.[1]?.text, '🔄 Renew');
  assert.equal(active.replyMarkup.inline_keyboard[1]?.[0]?.text, '➕  Buy New Plan');
});

test('store paid key detail screen becomes a persistent hub', () => {
  const paid = buildTelegramStoreKeyPageView({
    kind: 'access',
    variant: 'paid',
    planName: '💎 Pro',
    categoryLabel: 'Flash',
    statusLabel: 'Active',
    currentServerName: 'Malaysia 🇲🇾',
    keyTypeLabel: 'Standard Key',
    usedLabel: '80 GB',
    totalLabel: '200 GB',
    progressBar: '████░░░░░░',
    percentLabel: '40%',
    expiryLabel: '02 Jun 2026',
    switchesUsed: 1,
    switchesMaxLabel: '3',
    paidLabel: '7,000 Ks',
    keyId: 'key_123',
    renewPlanId: 'plan_pro',
    renewPriceLabel: '7,000 Ks',
    deviceLimitLabel: '1 device on protected install',
    showSwitchButton: true,
  });

  assert.match(paid.text, /Key Details/);
  assert.match(paid.text, /Malaysia/);
  assert.match(paid.text, /📶 Usage       :  80 GB \/ 200 GB/);
  assert.match(paid.text, /📱 Device      :  1 device on protected install/);
  assert.equal(
    paid.replyMarkup.inline_keyboard[0]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'platform_select', keyId: 'key_123' }),
  );
  assert.equal(
    paid.replyMarkup.inline_keyboard[1]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'renew_plan', planId: 'plan_pro', keyId: 'key_123', kind: 'access' }),
  );
  assert.equal(
    paid.replyMarkup.inline_keyboard[2]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'switch', keyId: 'key_123' }),
  );
});

test('store order confirmed and trial activated screens keep direct setup shortcuts', () => {
  const paid = buildTelegramStoreOrderConfirmedView({
    firstName: 'Sankha',
    plan: samplePlans[1]!,
    accessKey: 'ss://example-key',
    expiryLabel: '02 Jun 2026',
    paidLabel: '7,000 Ks',
    keyId: 'key_123',
  });

  assert.match(paid.text, /Order Confirmed/);
  assert.match(paid.text, /Tap Setup Guide to connect in 2 minutes/);
  assert.equal(
    paid.replyMarkup.inline_keyboard[1]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'guide_platform', keyId: 'key_123', platform: 'android' }),
  );
  assert.equal(
    paid.replyMarkup.inline_keyboard[3]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'switch', keyId: 'key_123' }),
  );

  const trial = buildTelegramStoreTrialKeyPageView({
    firstName: 'Sankha',
    accessKey: 'ss://trial-key',
    expiryLabel: '02 Jun 2026',
    keyId: 'trial_123',
  });

  assert.match(trial.text, /Trial Activated/);
  assert.match(trial.text, /FREE/);
  assert.equal(
    trial.replyMarkup.inline_keyboard[3]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
  );
});

test('store setup guide platform select and platform screens keep key-specific callbacks', () => {
  const select = buildTelegramStorePlatformSelectView({
    keyId: 'key_123',
    accessKey: 'ss://example-key',
  });

  assert.match(select.text, /📱 \*Let's Get You Connected\\!\*/);
  assert.match(select.text, /Setting up takes less than \*2 minutes\*/);
  assert.match(select.text, /Your key works on all devices/);
  assert.match(select.text, /`ss:\/\/example-key`/);
  assert.equal(select.replyMarkup.inline_keyboard[0]?.[0]?.text, '🤖 Android');
  assert.equal(select.replyMarkup.inline_keyboard[2]?.[0]?.text, '◀ Back');
  assert.equal(
    select.replyMarkup.inline_keyboard[2]?.[0]?.callback_data,
    buildTelegramStorefrontCallbackData({ action: 'key_page', keyId: 'key_123' }),
  );

  const guide = buildTelegramStorePlatformGuideView({
    keyId: 'key_123',
    platform: 'android',
    accessKey: 'ss://example-key',
  });

  assert.match(guide.text, /🤖 \*Android  —  You're almost connected\\!\*/);
  assert.match(guide.text, /You're almost connected\\!/);
  assert.match(guide.text, /Download your app/);
  assert.match(guide.text, /🔵 OUTLINE/);
  assert.match(guide.text, /Tap \*Connect\* 🟢/);
  const download1 = guide.replyMarkup.inline_keyboard[0]?.[0];
  const download2 = guide.replyMarkup.inline_keyboard[1]?.[0];
  const download3 = guide.replyMarkup.inline_keyboard[2]?.[0];
  const backButton = guide.replyMarkup.inline_keyboard[4]?.[0];
  assert.equal(download1 && 'url' in download1 ? download1.url : null, 'https://play.google.com/store/apps/details?id=org.outline.android.client');
  assert.equal(download2 && 'url' in download2 ? download2.url : null, 'https://play.google.com/store/apps/details?id=app.hiddify.com');
  assert.equal(download3 && 'url' in download3 ? download3.url : null, 'https://play.google.com/store/apps/details?id=com.v2ray.ang');
  assert.equal(guide.replyMarkup.inline_keyboard[3]?.length, 3);
  assert.equal(
    backButton && 'callback_data' in backButton ? backButton.callback_data : null,
    buildTelegramStorefrontCallbackData({ action: 'platform_select', keyId: 'key_123' }),
  );
});

test('storefront callback parser handles setup-guide platform routes', () => {
  assert.deepEqual(parseTelegramStorefrontCallbackData('my_account'), { action: 'my_account' });
  assert.deepEqual(parseTelegramStorefrontCallbackData('noop'), { action: 'noop' });
  assert.deepEqual(
    parseTelegramStorefrontCallbackData('setup_guide_key_123'),
    { action: 'setup_guide', keyId: 'key_123' },
  );
  assert.deepEqual(
    parseTelegramStorefrontCallbackData('platform_select_key_123'),
    { action: 'platform_select', keyId: 'key_123' },
  );
  assert.deepEqual(
    parseTelegramStorefrontCallbackData('guide_ios_key_123'),
    { action: 'guide_platform', platform: 'ios', keyId: 'key_123' },
  );
  assert.deepEqual(
    parseTelegramStorefrontCallbackData('key_page_key_123'),
    { action: 'key_page', keyId: 'key_123' },
  );
});
