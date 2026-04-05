import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTelegramBrandMediaUrl,
  getTelegramProofExampleUrls,
} from '@/lib/services/telegram-branding';
import { buildTelegramSupportThreadKeyboard } from '@/lib/services/telegram-support';

test('telegram branding helpers point to the expected public assets', () => {
  assert.match(getTelegramBrandMediaUrl('paymentGuide'), /\/telegram\/brand-payment-guide\.png$/);
  assert.match(getTelegramBrandMediaUrl('receiptPaid'), /\/telegram\/brand-receipt-paid\.png$/);
  assert.match(getTelegramBrandMediaUrl('premiumShowcase'), /\/telegram\/brand-premium-showcase\.png$/);

  const proof = getTelegramProofExampleUrls();
  assert.match(proof.good, /\/telegram\/proof-example-good\.png$/);
  assert.match(proof.bad, /\/telegram\/proof-example-bad\.png$/);
  assert.match(proof.common, /\/telegram\/proof-example-common-mistake\.png$/);
});

test('support thread keyboard exposes an attachment button when media is present', () => {
  const keyboard = buildTelegramSupportThreadKeyboard({
    locale: 'en',
    threadId: 'thread_123',
    attachmentUrl: 'https://example.com/attachment.png',
  });

  const attachmentRow = keyboard.inline_keyboard.find((row) =>
    row.some((button) => button.url === 'https://example.com/attachment.png'),
  );

  assert.ok(attachmentRow);
});
