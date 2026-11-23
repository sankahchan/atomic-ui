import test from 'node:test';
import assert from 'node:assert/strict';

import { selectDepletedAlertCandidates } from './telegram-lifecycle-alerts';

test('only depleted keys without a Telegram notice are candidates', () => {
  const candidates = selectDepletedAlertCandidates(
    [{ id: 'key-1' }, { id: 'key-2' }, { id: 'key-3' }],
    ['key-2'],
  );
  assert.deepEqual(candidates, [{ id: 'key-1' }, { id: 'key-3' }]);
});

test('all keys are skipped when notices were already sent', () => {
  assert.deepEqual(
    selectDepletedAlertCandidates([{ id: 'key-1' }], new Set(['key-1'])),
    [],
  );
});
