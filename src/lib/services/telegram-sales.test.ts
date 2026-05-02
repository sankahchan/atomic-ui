import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDefaultTelegramSalesSettings,
  normalizeTelegramSalesSettings,
} from '@/lib/services/telegram-sales';

test('built-in premium telegram plans stay on dynamic delivery after normalization', () => {
  const defaults = getDefaultTelegramSalesSettings();
  const normalized = normalizeTelegramSalesSettings({
    ...defaults,
    plans: defaults.plans.map((plan) => ({
      ...plan,
      deliveryType: 'ACCESS_KEY',
    })),
  });

  for (const plan of normalized.plans.filter((item) => item.code.startsWith('premium_') || item.code === '3plus_unlimited')) {
    assert.equal(plan.deliveryType, 'DYNAMIC_KEY');
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
