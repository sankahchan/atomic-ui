import assert from 'node:assert/strict';
import test from 'node:test';

import { formatTelegramAccessKeyStatusLabel, TELEGRAM_DIVIDER } from './telegram-ui';

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
