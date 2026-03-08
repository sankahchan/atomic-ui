import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIpAddress } from '../security';

test('normalizeIpAddress handles common proxy-formatted IPv4 values', () => {
  assert.equal(normalizeIpAddress('203.0.113.10:51820'), '203.0.113.10');
  assert.equal(normalizeIpAddress('::ffff:203.0.113.10'), '203.0.113.10');
});

test('normalizeIpAddress keeps valid IPv6 addresses and localhost', () => {
  assert.equal(normalizeIpAddress('::1'), '127.0.0.1');
  assert.equal(normalizeIpAddress('2001:db8::1'), '2001:db8::1');
});

test('normalizeIpAddress rejects malformed addresses', () => {
  assert.equal(normalizeIpAddress('unknown'), null);
  assert.equal(normalizeIpAddress(''), null);
  assert.equal(normalizeIpAddress(null), null);
});
