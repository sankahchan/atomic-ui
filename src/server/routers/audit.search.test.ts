import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuditLogWhere } from './audit';

test('search matches all searchable audit fields case-insensitively on Postgres', () => {
  const where = buildAuditLogWhere(
    { page: 1, pageSize: 20, search: '  Server Sync  ' },
    { insensitiveSearch: true },
  );

  assert.deepEqual(where, {
    OR: [
      { action: { contains: 'Server Sync', mode: 'insensitive' } },
      { entity: { contains: 'Server Sync', mode: 'insensitive' } },
      { entityId: { contains: 'Server Sync', mode: 'insensitive' } },
      { ip: { contains: 'Server Sync', mode: 'insensitive' } },
      { details: { contains: 'Server Sync', mode: 'insensitive' } },
    ],
  });
});

test('search omits the unsupported Prisma mode on SQLite', () => {
  const where = buildAuditLogWhere({ search: 'renew' });

  assert.deepEqual(where, {
    OR: [
      { action: { contains: 'renew' } },
      { entity: { contains: 'renew' } },
      { entityId: { contains: 'renew' } },
      { ip: { contains: 'renew' } },
      { details: { contains: 'renew' } },
    ],
  });
});

test('blank search is ignored while the ip filter uses case-insensitive contains', () => {
  const where = buildAuditLogWhere(
    { page: 1, pageSize: 20, search: '   ', ip: '  10.0.0.  ' },
    { insensitiveSearch: true },
  );

  assert.deepEqual(where, { ip: { contains: '10.0.0.', mode: 'insensitive' } });
});

test('search and ip combine with the existing action, entity, actor, and date filters', () => {
  const dateFrom = new Date('2026-01-01T00:00:00.000Z');
  const dateTo = new Date('2026-01-31T23:59:59.999Z');

  const where = buildAuditLogWhere(
    {
      page: 1,
      pageSize: 20,
      action: 'USER_CREATE',
      entity: 'USER',
      userId: 'user-1',
      search: 'alice',
      ip: '10.0.0.1',
      dateFrom,
      dateTo,
    },
    { insensitiveSearch: true },
  );

  assert.deepEqual(where, {
    action: 'USER_CREATE',
    entity: 'USER',
    userId: 'user-1',
    OR: [
      { action: { contains: 'alice', mode: 'insensitive' } },
      { entity: { contains: 'alice', mode: 'insensitive' } },
      { entityId: { contains: 'alice', mode: 'insensitive' } },
      { ip: { contains: 'alice', mode: 'insensitive' } },
      { details: { contains: 'alice', mode: 'insensitive' } },
    ],
    ip: { contains: '10.0.0.1', mode: 'insensitive' },
    createdAt: { gte: dateFrom, lte: dateTo },
  });
});
