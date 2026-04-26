import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTelegramAdminKeyErrorNotice } from '@/lib/services/telegram-admin-key-errors';

test('telegram admin key error notice explains certificate mismatches', () => {
  const notice = buildTelegramAdminKeyErrorNotice(
    new Error('Failed to connect to Outline server: Outline server certificate fingerprint mismatch'),
    'en',
  );

  assert.equal(notice.callbackText, 'Server cert mismatch.');
  assert.match(notice.chatText, /certificate fingerprint/i);
  assert.match(notice.chatText, /Dashboard > Servers/);
});

test('telegram admin key error notice keeps generic runtime failures readable', () => {
  const notice = buildTelegramAdminKeyErrorNotice(
    new Error('Access key not found.'),
    'en',
  );

  assert.equal(notice.callbackText, 'Key action failed.');
  assert.equal(notice.chatText, 'Access key not found.');
});

test('telegram admin key error notice localizes server connection failures', () => {
  const notice = buildTelegramAdminKeyErrorNotice(
    new Error('Connection timeout'),
    'my',
  );

  assert.equal(notice.callbackText, 'Server connection failed.');
  assert.match(notice.chatText, /Outline server/u);
});
