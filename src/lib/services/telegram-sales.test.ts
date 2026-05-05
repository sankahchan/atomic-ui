import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDefaultTelegramSalesSettings,
  normalizeTelegramSalesSettings,
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

test('standard telegram plans may still opt into dynamic delivery', () => {
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
    'DYNAMIC_KEY',
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
