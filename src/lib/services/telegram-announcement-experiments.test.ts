import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignTelegramAnnouncementExperimentVariant,
  countTelegramAnnouncementExperimentAssignments,
} from './telegram-announcement-experiments';

const variants = [
  { variantKey: 'A', allocationPercent: 50 },
  { variantKey: 'B', allocationPercent: 50 },
];

test('assignTelegramAnnouncementExperimentVariant is stable for the same chat', () => {
  const first = assignTelegramAnnouncementExperimentVariant({
    experimentId: 'exp-1',
    chatId: '10001',
    variants,
  });
  const second = assignTelegramAnnouncementExperimentVariant({
    experimentId: 'exp-1',
    chatId: '10001',
    variants,
  });

  assert.equal(first, second);
  assert.ok(first === 'A' || first === 'B');
});

test('countTelegramAnnouncementExperimentAssignments respects the configured split', () => {
  const assignments = countTelegramAnnouncementExperimentAssignments({
    experimentId: 'exp-2',
    chatIds: Array.from({ length: 1_000 }, (_, index) => `chat-${index + 1}`),
    variants,
  });

  assert.ok((assignments.A || 0) > 400);
  assert.ok((assignments.B || 0) > 400);
  assert.equal((assignments.A || 0) + (assignments.B || 0), 1_000);
});
