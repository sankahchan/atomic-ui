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
