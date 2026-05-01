import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildServerAvailabilityAdminAlertMessage,
  shouldSendAdminAvailabilityAlert,
} from './health-check';
import { validateTelegramHtmlMessage } from './telegram-message-validation';

test('admin availability alerts fire only when a server enters DOWN state', () => {
  assert.equal(
    shouldSendAdminAvailabilityAlert({
      previousStatus: 'UP',
      currentStatus: 'DOWN',
    }),
    true,
  );

  assert.equal(
    shouldSendAdminAvailabilityAlert({
      previousStatus: 'SLOW',
      currentStatus: 'DOWN',
    }),
    true,
  );
});

test('admin availability alerts fire when a server recovers from DOWN to healthy or slow', () => {
  assert.equal(
    shouldSendAdminAvailabilityAlert({
      previousStatus: 'DOWN',
      currentStatus: 'UP',
    }),
    true,
  );

  assert.equal(
    shouldSendAdminAvailabilityAlert({
      previousStatus: 'DOWN',
      currentStatus: 'SLOW',
    }),
    true,
  );
});

test('admin availability alerts stay quiet for non-down transitions', () => {
  assert.equal(
    shouldSendAdminAvailabilityAlert({
      previousStatus: 'UP',
      currentStatus: 'SLOW',
    }),
    false,
  );

  assert.equal(
    shouldSendAdminAvailabilityAlert({
      previousStatus: 'SLOW',
      currentStatus: 'UP',
    }),
    false,
  );

  assert.equal(
    shouldSendAdminAvailabilityAlert({
      previousStatus: undefined,
      currentStatus: 'UP',
    }),
    false,
  );
});

test('admin availability alert message stays compact and html-safe', () => {
  const down = buildServerAvailabilityAdminAlertMessage({
    serverName: 'Malay <primary>',
    status: 'DOWN',
  });
  const up = buildServerAvailabilityAdminAlertMessage({
    serverName: 'Malay <primary>',
    status: 'UP',
  });

  for (const message of [down, up]) {
    assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
    assert.ok(message.split('\n').length <= 1);
    assert.match(message, /Malay &lt;primary&gt;/);
  }
});
