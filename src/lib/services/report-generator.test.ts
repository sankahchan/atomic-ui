import assert from 'node:assert/strict';
import test from 'node:test';
import { generateReportCSV } from './report-generator';

test('generateReportCSV includes hourly usage rows when provided', () => {
  const csv = generateReportCSV({
    periodStart: '2026-04-01T00:00:00.000Z',
    periodEnd: '2026-04-30T23:59:59.999Z',
    servers: [
      {
        serverId: 'srv-1',
        serverName: 'Tokyo-1',
        location: 'Tokyo',
        countryCode: 'JP',
        totalKeys: 1,
        activeKeys: 1,
        totalUsedBytes: '2048',
        deltaBytes: '512',
        keys: [
          {
            keyId: 'key-1',
            keyName: 'Customer A',
            email: 'customer@example.com',
            telegramId: '123',
            status: 'ACTIVE',
            usedBytes: '2048',
            dataLimitBytes: '4096',
            usagePercent: 50,
            createdAt: '2026-04-01T00:00:00.000Z',
            expiresAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      },
    ],
    hourlyUsage: [
      { hourUtc: 0, deltaBytes: '128' },
      { hourUtc: 1, deltaBytes: '256' },
    ],
  });

  assert.match(csv, /Hour \(UTC\),Delta Bytes/);
  assert.match(csv, /0,"128"/);
  assert.match(csv, /1,"256"/);
  assert.match(csv, /"Tokyo-1","Tokyo","Customer A"/);
});
