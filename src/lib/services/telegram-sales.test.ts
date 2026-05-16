import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDefaultTelegramSalesSettings,
  normalizeTelegramSupportLink,
  normalizeTelegramSalesSettings,
  resolveTelegramSalesPriceLabel,
} from '@/lib/services/telegram-sales';

test('built-in dynamic telegram plans stay on dynamic delivery after normalization', () => {
  const defaults = getDefaultTelegramSalesSettings();
  const normalized = normalizeTelegramSalesSettings({
    ...defaults,
    plans: defaults.plans.map((plan) => ({
      ...plan,
      deliveryType: 'ACCESS_KEY',
    })),
  });

  for (const defaultPlan of defaults.plans.filter((item) => item.deliveryType === 'DYNAMIC_KEY')) {
    assert.equal(
      normalized.plans.find((plan) => plan.code === defaultPlan.code)?.deliveryType,
      'DYNAMIC_KEY',
    );
  }
});

test('built-in standard telegram plans stay on access-key delivery after normalization', () => {
  const defaults = getDefaultTelegramSalesSettings();
  const normalized = normalizeTelegramSalesSettings({
    ...defaults,
    plans: defaults.plans.map((plan) =>
      plan.code === '1m_150gb'
        ? {
            ...plan,
            deliveryType: 'DYNAMIC_KEY',
          }
        : plan,
    ),
  });

  assert.equal(
    normalized.plans.find((plan) => plan.code === '1m_150gb')?.deliveryType,
    'ACCESS_KEY',
  );
});

test('built-in trial plan keeps the enforced 2-day 5 GB defaults after normalization', () => {
  const defaults = getDefaultTelegramSalesSettings();
  const normalized = normalizeTelegramSalesSettings({
    ...defaults,
    plans: defaults.plans.map((plan) =>
      plan.code === 'trial_1d_3gb'
        ? {
            ...plan,
            label: 'Free Trial / 1 Day / 3 GB',
            localizedLabels: { en: 'Free Trial / 1 Day / 3 GB', my: 'Free Trial / ၁ ရက် / 3 GB' },
            fixedDurationDays: 1,
            dataLimitGB: 3,
            priceLabel: 'Legacy Trial',
          }
        : plan,
    ),
  });

  const trialPlan = normalized.plans.find((plan) => plan.code === 'trial_1d_3gb');
  assert.equal(trialPlan?.label, 'Free Trial / 2 Days / 5 GB');
  assert.equal(trialPlan?.localizedLabels.en, undefined);
  assert.equal(trialPlan?.localizedLabels.my, 'Free Trial / ၂ ရက် / 5 GB');
  assert.equal(trialPlan?.fixedDurationDays, 2);
  assert.equal(trialPlan?.dataLimitGB, 5);
  assert.equal(trialPlan?.priceLabel, 'Free Trial');
});

test('built-in storefront catalog keeps the fixed dynamic ultra pricing and routing defaults', () => {
  const defaults = getDefaultTelegramSalesSettings();
  const normalized = normalizeTelegramSalesSettings({
    ...defaults,
    plans: defaults.plans.map((plan) =>
      plan.code === '3m_600gb_dynamic'
        ? {
            ...plan,
            priceAmount: 19500,
            priceLabel: '19,500 Kyat',
            localizedPriceLabels: { en: '19,500 Kyat', my: '၁၉,၅၀၀ ကျပ်' },
            serverSwitches: 3,
            badge: 'None',
            planCategory: 'Flash',
            deliveryType: 'ACCESS_KEY',
          }
        : plan,
    ),
  });

  const dynamicUltra = normalized.plans.find((plan) => plan.code === '3m_600gb_dynamic');
  assert.equal(dynamicUltra?.priceAmount, 23000);
  assert.equal(dynamicUltra?.priceLabel, '23,000 Ks');
  assert.equal(dynamicUltra?.localizedPriceLabels.en, '23,000 Ks');
  assert.equal(dynamicUltra?.serverSwitches, -1);
  assert.equal(dynamicUltra?.badge, 'Best Deal');
  assert.equal(dynamicUltra?.planCategory, 'Dynamic');
  assert.equal(dynamicUltra?.deliveryType, 'DYNAMIC_KEY');
});

test('built-in storefront plans render MMK fallback labels with Ks in english', () => {
  const defaults = getDefaultTelegramSalesSettings();
  const plan = defaults.plans.find((item) => item.code === '1m_200gb');
  assert.ok(plan);
  assert.equal(resolveTelegramSalesPriceLabel(plan!, 'en'), '7,000 Ks');
});

test('telegram support link normalization accepts @username shortcuts', () => {
  assert.equal(normalizeTelegramSupportLink('@outlineadmin_support'), 'https://t.me/outlineadmin_support');
  assert.equal(normalizeTelegramSupportLink('outlineadmin_support'), 'https://t.me/outlineadmin_support');
});

test('telegram support link normalization canonicalizes telegram hostnames', () => {
  assert.equal(normalizeTelegramSupportLink('t.me/outlineadmin_support'), 'https://t.me/outlineadmin_support');
  assert.equal(
    normalizeTelegramSupportLink('https://telegram.me/outlineadmin_support'),
    'https://t.me/outlineadmin_support',
  );
});

test('telegram sales settings normalize support link before runtime reads it', () => {
  const defaults = getDefaultTelegramSalesSettings();
  const normalized = normalizeTelegramSalesSettings({
    ...defaults,
    supportLink: '@outlineadmin_support',
  });

  assert.equal(normalized.supportLink, 'https://t.me/outlineadmin_support');
});
