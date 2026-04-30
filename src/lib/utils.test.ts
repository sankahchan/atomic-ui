import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCountLabel } from '@/lib/utils';

test('formatCountLabel handles singular and plural english labels', () => {
  assert.equal(formatCountLabel(1, 'user'), '1 user');
  assert.equal(formatCountLabel(2, 'user'), '2 users');
  assert.equal(formatCountLabel(1, 'active key'), '1 active key');
  assert.equal(formatCountLabel(3, 'active key'), '3 active keys');
});

test('formatCountLabel supports explicit irregular plurals', () => {
  assert.equal(formatCountLabel(1, 'person', 'people'), '1 person');
  assert.equal(formatCountLabel(2, 'person', 'people'), '2 people');
});
