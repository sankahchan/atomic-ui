import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStoredNotificationChannelConfig,
  parseNotificationChannelRecord,
  sanitizeNotificationChannelForClient,
} from './notification-channels';

test('notification channel parsing decrypts webhook signing secrets and headers', () => {
  const config = buildStoredNotificationChannelConfig(
    {
      signingSecret: 'signing-secret-123',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    },
    {},
  );

  const parsed = parseNotificationChannelRecord({
    id: 'channel-1',
    name: 'Webhook',
    type: 'WEBHOOK',
    isActive: true,
    config: JSON.stringify({
      ...config,
      url: 'https://example.com/webhook',
    }),
    events: '[]',
  });

  assert.equal(parsed?.config.signingSecret, 'signing-secret-123');
  assert.equal(
    typeof parsed?.config.headers === 'string' && parsed.config.headers.includes('super-secret'),
    true,
  );
});

test('notification channel client payload masks webhook secrets', () => {
  const parsed = parseNotificationChannelRecord({
    id: 'channel-1',
    name: 'Webhook',
    type: 'WEBHOOK',
    isActive: true,
    config: JSON.stringify(
      buildStoredNotificationChannelConfig(
        {
          signingSecret: 'signing-secret-123',
          headers: {
            Authorization: 'Bearer super-secret',
          },
        },
        {},
      ),
    ),
    events: '[]',
  });

  assert.ok(parsed);

  const sanitized = sanitizeNotificationChannelForClient(parsed);

  assert.equal(sanitized.config.signingSecret, '********');
  assert.equal(
    typeof sanitized.config.headers === 'string' && sanitized.config.headers.includes('super-secret'),
    false,
  );
  assert.equal(
    typeof sanitized.config.headers === 'string' && sanitized.config.headers.includes('********'),
    true,
  );
});
