import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramMyKeysEmptyText,
  formatTelegramAccessKeyStatusLabel,
  TELEGRAM_DIVIDER,
} from './telegram-ui';

test('access key status labels share one localized vocabulary', () => {
  const expected = {
    ACTIVE: ['Active', 'အသက်ဝင်'],
    PENDING: ['Pending', 'စောင့်ဆိုင်း'],
    DISABLED: ['Disabled', 'ပိတ်ထား'],
    EXPIRED: ['Expired', 'သက်တမ်းကုန်'],
    DEPLETED: ['Depleted', 'Data ကုန်'],
  } as const;

  for (const [status, [english, myanmar]] of Object.entries(expected)) {
    assert.equal(formatTelegramAccessKeyStatusLabel(status, 'en'), english);
    assert.equal(formatTelegramAccessKeyStatusLabel(status, 'my'), myanmar);
  }

  assert.equal(formatTelegramAccessKeyStatusLabel('CUSTOM_STATE', 'en'), 'Custom state');
  assert.equal(formatTelegramAccessKeyStatusLabel('CUSTOM_STATE', 'my'), 'CUSTOM_STATE');
});

test('bot cards share a single section divider', () => {
  assert.equal(TELEGRAM_DIVIDER, '━'.repeat(26));
});

test('trial variant keeps one status vocabulary with a trial-specific active label', () => {
  assert.equal(formatTelegramAccessKeyStatusLabel('ACTIVE', 'en', 'trial'), 'Trial active');
  assert.equal(formatTelegramAccessKeyStatusLabel('ACTIVE', 'my', 'trial'), 'အစမ်းသုံးနေသည်');
  assert.equal(formatTelegramAccessKeyStatusLabel('ACTIVE', 'en'), 'Active');
  assert.equal(formatTelegramAccessKeyStatusLabel('ACTIVE', 'my'), 'အသက်ဝင်');
  assert.equal(formatTelegramAccessKeyStatusLabel('PENDING', 'my', 'trial'), 'စောင့်ဆိုင်း');
});

test('mykeys empty states share one localized header', () => {
  const english = buildTelegramMyKeysEmptyText({ locale: 'en', guidanceLine: 'Buy a plan.' });
  const myanmar = buildTelegramMyKeysEmptyText({ locale: 'my', guidanceLine: 'Plan ဝယ်ပါ။' });

  assert.equal(
    english,
    ['🔑 *Your Active Keys*', TELEGRAM_DIVIDER, '', 'No active keys right now\\.', '', 'Buy a plan.'].join('\n'),
  );
  assert.equal(
    myanmar,
    ['🔑 *သင်၏ Active Key များ*', TELEGRAM_DIVIDER, '', 'Active key မရှိသေးပါ\\.', '', 'Plan ဝယ်ပါ။'].join('\n'),
  );
});
