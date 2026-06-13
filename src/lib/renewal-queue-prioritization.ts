import type { RenewalOutreachState } from './renewal-outreach-tracking';

export type RenewalQueuePriorityCandidate = {
  id: string;
  status: string;
  expiresAt: Date | null;
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
  createdAt: Date;
  outreachState: RenewalOutreachState;
};

function getRenewalQueueOutreachPriorityRank(outreachState: RenewalOutreachState) {
  if (outreachState.neverPrepared) {
    return 0;
  }

  if (outreachState.pendingResult) {
    return 1;
  }

  switch (outreachState.lastOutcome) {
    case 'SENT':
      return 2;
    case 'NO_RESPONSE':
      return 3;
    case 'REPLIED':
      return 4;
    case 'RENEWED':
      return 5;
    case 'DONE':
      return 6;
    default:
      return 7;
  }
}

function getRenewalQueueUrgencyRank(candidate: RenewalQueuePriorityCandidate) {
  const isDepleted = candidate.status === 'DEPLETED'
    || (
      candidate.dataLimitBytes !== null
      && candidate.dataLimitBytes > BigInt(0)
      && candidate.usedBytes >= candidate.dataLimitBytes
    );

  return isDepleted ? 0 : 1;
}

function getRenewalQueueDueTime(candidate: RenewalQueuePriorityCandidate) {
  if (getRenewalQueueUrgencyRank(candidate) === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return candidate.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function compareRenewalQueuePriority(
  left: RenewalQueuePriorityCandidate,
  right: RenewalQueuePriorityCandidate,
) {
  const outreachRankDiff =
    getRenewalQueueOutreachPriorityRank(left.outreachState)
    - getRenewalQueueOutreachPriorityRank(right.outreachState);
  if (outreachRankDiff !== 0) {
    return outreachRankDiff;
  }

  const urgencyRankDiff = getRenewalQueueUrgencyRank(left) - getRenewalQueueUrgencyRank(right);
  if (urgencyRankDiff !== 0) {
    return urgencyRankDiff;
  }

  const leftDueTime = getRenewalQueueDueTime(left);
  const rightDueTime = getRenewalQueueDueTime(right);
  if (leftDueTime !== rightDueTime) {
    return leftDueTime < rightDueTime ? -1 : 1;
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
}
