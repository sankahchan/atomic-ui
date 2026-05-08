import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramStoreActiveKeysView,
  buildTelegramStoreMainMenuView,
  buildTelegramStoreOrderSummaryView,
  buildTelegramStorePlanListView,
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
      '💬 Live Support',
    ],
  );
});

test('store plan list keeps the fixed 9-plan catalog and dynamic ultra pricing', () => {
  const view = buildTelegramStorePlanListView(samplePlans);

  assert.match(view.text, /⑥ 👑 Max\s+1050 GB\s+34,500 Ks\s+★★/);
  assert.match(view.text, /⑨ 🚀 Ultra\s+600 GB\s+23,000 Ks\s+· 3M\s+★★/);
  assert.match(view.text, /★ Popular  ·  ★★ Best Deal/);
  assert.equal(view.replyMarkup.inline_keyboard[0]?.[0]?.text, '1️⃣ 🪨 Basic');
  assert.equal(view.replyMarkup.inline_keyboard[2]?.[2]?.text, '9️⃣ 🚀 Ultra ★★');
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
  assert.equal(active.replyMarkup.inline_keyboard[0]?.[0]?.text, '🔄 Renew 🪨 Basic  —  5,000 Ks');
  assert.equal(active.replyMarkup.inline_keyboard[1]?.[0]?.text, '➕  Buy New Plan');
});
