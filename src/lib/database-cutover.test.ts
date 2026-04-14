import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDatabaseCutoverModelOrder,
  getDatabaseCutoverModelPlans,
  parseCutoverRow,
  redactDatabaseUrl,
  stringifyCutoverRow,
} from '@/lib/database-cutover';

test('database cutover model order keeps parent models before dependent models', () => {
  const order = getDatabaseCutoverModelOrder();
  const indexOf = (modelName: string) => order.indexOf(modelName);

  assert.ok(indexOf('User') > -1);
  assert.ok(indexOf('Session') > -1);
  assert.ok(indexOf('User') < indexOf('Session'));
  assert.ok(indexOf('Server') < indexOf('AccessKey'));
  assert.ok(indexOf('AccessKey') < indexOf('TrafficLog'));
  assert.ok(indexOf('TelegramSupportThread') < indexOf('TelegramSupportReply'));
});

test('database cutover plans are unique and include order metadata', () => {
  const plans = getDatabaseCutoverModelPlans();
  const names = plans.map((plan) => plan.modelName);
  assert.equal(new Set(names).size, names.length);
  assert.ok(plans.every((plan) => plan.delegateName.length > 0));
  assert.ok(plans.every((plan) => Array.isArray(plan.scalarFields)));
});

test('cutover row serialization preserves bigint markers and datetime conversion', () => {
  const accessKeyPlan = getDatabaseCutoverModelPlans().find((plan) => plan.modelName === 'AccessKey');
  assert.ok(accessKeyPlan);

  const encoded = stringifyCutoverRow({
    id: 'key_1',
    usedBytes: BigInt(1234),
    createdAt: new Date('2026-04-14T00:00:00.000Z'),
  });
  const decoded = parseCutoverRow(encoded, accessKeyPlan!);

  assert.equal(decoded.id, 'key_1');
  assert.equal(decoded.usedBytes, BigInt(1234));
  assert.ok(decoded.createdAt instanceof Date);
  assert.equal((decoded.createdAt as Date).toISOString(), '2026-04-14T00:00:00.000Z');
});

test('redactDatabaseUrl masks passwords in connection strings', () => {
  assert.equal(
    redactDatabaseUrl('postgresql://atomic:secret@localhost:5432/atomic_ui'),
    'postgresql://atomic:***@localhost:5432/atomic_ui',
  );
});
