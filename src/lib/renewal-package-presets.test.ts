import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAccessKeyRenewalPresets } from '@/lib/renewal-package-presets';
import { getDefaultTelegramSalesSettings } from '@/lib/services/telegram-sales';

test('resolveAccessKeyRenewalPresets returns enabled access-key plans up to 3 months', () => {
  const settings = getDefaultTelegramSalesSettings();
  const presets = resolveAccessKeyRenewalPresets(settings, 'en');

  assert.deepEqual(
    presets.map((preset) => preset.code),
    ['1m_150gb', '1m_200gb', '1m_350gb', '3m_300gb', '3m_600gb', '3m_1050gb'],
  );
});

test('resolveAccessKeyRenewalPresets excludes dynamic and disabled plans', () => {
  const settings = getDefaultTelegramSalesSettings();
  settings.plans = settings.plans.map((plan) => (
    plan.code === '1m_200gb'
      ? { ...plan, enabled: false }
      : plan
  ));

  const presets = resolveAccessKeyRenewalPresets(settings, 'en');

  assert.equal(presets.some((preset) => preset.code === '1m_200gb'), false);
  assert.equal(presets.some((preset) => preset.code === '1m_200gb_dynamic'), false);
});

test('resolveAccessKeyRenewalPresets localizes labels and preserves package metadata', () => {
  const settings = getDefaultTelegramSalesSettings();
  const presets = resolveAccessKeyRenewalPresets(settings, 'my');
  const popularPreset = presets.find((preset) => preset.code === '1m_200gb');

  assert.ok(popularPreset);
  assert.equal(popularPreset?.label, '၁ လ / 200 GB');
  assert.equal(popularPreset?.priceLabel, '၇,၀၀၀ ကျပ်');
  assert.equal(popularPreset?.months, 1);
  assert.equal(popularPreset?.dataLimitGB, 200);
  assert.equal(popularPreset?.badge, 'Popular');
});
