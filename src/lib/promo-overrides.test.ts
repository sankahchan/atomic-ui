import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPromoEligibilityOverride,
  parsePromoEligibilityOverrides,
  serializePromoEligibilityOverrides,
  setPromoEligibilityOverride,
} from '@/lib/promo-overrides';

test('promo overrides parse and serialize supported campaign modes', () => {
  const serialized = serializePromoEligibilityOverrides({
    TRIAL_TO_PAID: {
      mode: 'FORCE_ALLOW',
      updatedAt: '2026-04-03T00:00:00.000Z',
      updatedByEmail: 'admin@example.com',
    },
  });

  const parsed = parsePromoEligibilityOverrides(serialized);
  assert.deepEqual(parsed, {
    TRIAL_TO_PAID: {
      mode: 'FORCE_ALLOW',
      note: null,
      updatedAt: '2026-04-03T00:00:00.000Z',
      updatedByUserId: null,
      updatedByEmail: 'admin@example.com',
    },
  });
});

test('promo overrides can be cleared back to default rules', () => {
  const next = setPromoEligibilityOverride(
    {
      WINBACK: {
        mode: 'FORCE_BLOCK',
        updatedAt: '2026-04-03T01:00:00.000Z',
      },
    },
    'WINBACK',
    null,
  );

  assert.equal(getPromoEligibilityOverride(next, 'WINBACK'), null);
});
