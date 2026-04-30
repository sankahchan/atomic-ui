import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOutageAlertMessage,
  buildOutageFollowUpMessage,
  buildOutageRecoveryMessage,
} from './server-outage';
import { validateTelegramHtmlMessage } from './telegram-message-validation';

test('server outage telegram notices stay compact and html-safe', () => {
  const alert = buildOutageAlertMessage({
    cause: 'HEALTH_SLOW',
    serverName: 'SG <primary>',
    keyNames: ['Onn & iPhone', 'Testing'],
    gracePeriodHours: 3,
    supportLink: 'https://support.example.com/help?a=1&b=2',
  });
  const recovery = buildOutageRecoveryMessage({
    targetServerName: 'MY <fallback>',
    keyNames: ['Onn & iPhone'],
  });
  const followUp = buildOutageFollowUpMessage({
    cause: 'HEALTH_DOWN',
    serverName: 'SG <primary>',
    message: 'Replacement <almost> ready.',
    markRecovered: false,
  });

  for (const message of [alert, recovery, followUp]) {
    assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
    assert.ok(message.split('\n').length <= 7);
    assert.doesNotMatch(message, /You do not need to buy a new key/i);
    assert.doesNotMatch(message, /VPN access is responding too slowly/i);
    assert.doesNotMatch(message, /currently serving your VPN access/i);
  }

  assert.match(alert, /SG &lt;primary&gt;/);
  assert.match(alert, /Onn &amp; iPhone/);
  assert.match(alert, /No new key needed/);
  assert.match(recovery, /MY &lt;fallback&gt;/);
  assert.match(followUp, /Replacement &lt;almost&gt; ready\./);
});
