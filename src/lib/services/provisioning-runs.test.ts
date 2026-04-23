import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyProvisioningDropletCreated,
  applyProvisioningDropletReady,
  applyProvisioningRetryStart,
  applyProvisioningRunCompleted,
  applyProvisioningRunFailure,
  applyProvisioningStatusRefresh,
  createProvisioningRunRecord,
  normalizeProvisioningRuns,
} from './provisioning-runs';

test('createProvisioningRunRecord starts at droplet creation with running state', () => {
  const run = createProvisioningRunRecord({
    name: 'edge-1',
    region: 'sgp1',
    size: 's-1vcpu-1gb',
    createdByUserId: 'user-1',
  });

  assert.equal(run.status, 'creating_droplet');
  assert.equal(run.currentStep, 'create_droplet');
  assert.equal(run.stepStatuses.provider_token, 'success');
  assert.equal(run.stepStatuses.droplet_config, 'success');
  assert.equal(run.stepStatuses.create_droplet, 'running');
  assert.equal(run.attemptCount, 1);
  assert.equal(run.createdByUserId, 'user-1');
});

test('applyProvisioningRunFailure records the failed step and summary', () => {
  const run = createProvisioningRunRecord({
    name: 'edge-1',
    region: 'sgp1',
    size: 's-1vcpu-1gb',
  });

  const failed = applyProvisioningRunFailure(run, {
    step: 'create_droplet',
    message: 'quota exceeded',
  });

  assert.equal(failed.status, 'failed');
  assert.equal(failed.failedStep, 'create_droplet');
  assert.equal(failed.lastError, 'quota exceeded');
  assert.equal(failed.stepStatuses.create_droplet, 'failed');
  assert.match(failed.summary, /creation failed/i);
});

test('applyProvisioningRetryStart clears the error and increments attempts', () => {
  const run = applyProvisioningRunFailure(
    createProvisioningRunRecord({
      name: 'edge-1',
      region: 'sgp1',
      size: 's-1vcpu-1gb',
    }),
    {
      step: 'wait_for_ip',
      message: 'api timeout',
    },
  );

  const retried = applyProvisioningRetryStart(run);

  assert.equal(retried.status, 'waiting_for_ip');
  assert.equal(retried.failedStep, null);
  assert.equal(retried.lastError, null);
  assert.equal(retried.stepStatuses.wait_for_ip, 'running');
  assert.equal(retried.attemptCount, 2);
});

test('droplet creation transitions into waiting state until a public ip is available', () => {
  const run = createProvisioningRunRecord({
    name: 'edge-1',
    region: 'sgp1',
    size: 's-1vcpu-1gb',
  });

  const waiting = applyProvisioningDropletCreated(run, {
    id: 42,
    status: 'new',
    ip: null,
  });

  assert.equal(waiting.status, 'waiting_for_ip');
  assert.equal(waiting.currentStep, 'wait_for_ip');
  assert.equal(waiting.dropletId, 42);
  assert.equal(waiting.stepStatuses.create_droplet, 'success');
  assert.equal(waiting.stepStatuses.wait_for_ip, 'running');
});

test('ip discovery transitions the run into outline handoff state', () => {
  const waiting = applyProvisioningDropletCreated(
    createProvisioningRunRecord({
      name: 'edge-1',
      region: 'sgp1',
      size: 's-1vcpu-1gb',
    }),
    {
      id: 42,
      status: 'new',
      ip: null,
    },
  );

  const ready = applyProvisioningStatusRefresh(waiting, {
    id: 42,
    status: 'active',
    ip: '203.0.113.9',
  });

  assert.equal(ready.status, 'ready_for_outline');
  assert.equal(ready.currentStep, 'outline_install');
  assert.equal(ready.dropletIp, '203.0.113.9');
  assert.equal(ready.stepStatuses.outline_install, 'action_required');
});

test('applyProvisioningDropletReady can promote directly when create returns an ip', () => {
  const ready = applyProvisioningDropletReady(
    createProvisioningRunRecord({
      name: 'edge-1',
      region: 'sgp1',
      size: 's-1vcpu-1gb',
    }),
    {
      id: 42,
      status: 'active',
      ip: '203.0.113.9',
    },
  );

  assert.equal(ready.status, 'ready_for_outline');
  assert.equal(ready.stepStatuses.create_droplet, 'success');
  assert.equal(ready.stepStatuses.wait_for_ip, 'success');
});

test('applyProvisioningRunCompleted marks the manual handoff as complete', () => {
  const completed = applyProvisioningRunCompleted(
    applyProvisioningDropletReady(
      createProvisioningRunRecord({
        name: 'edge-1',
        region: 'sgp1',
        size: 's-1vcpu-1gb',
      }),
      {
        id: 42,
        status: 'active',
        ip: '203.0.113.9',
      },
    ),
  );

  assert.equal(completed.status, 'completed');
  assert.equal(completed.stepStatuses.outline_install, 'success');
  assert.ok(completed.completedAt);
});

test('normalizeProvisioningRuns rejects malformed payloads and sorts newest first', () => {
  const oldRun = createProvisioningRunRecord({
    name: 'old-run',
    region: 'nyc1',
    size: 's-1vcpu-1gb',
  });
  oldRun.updatedAt = '2026-01-01T00:00:00.000Z';

  const newRun = createProvisioningRunRecord({
    name: 'new-run',
    region: 'sgp1',
    size: 's-1vcpu-1gb',
  });
  newRun.updatedAt = '2026-01-02T00:00:00.000Z';

  assert.deepEqual(normalizeProvisioningRuns('{bad-json'), []);
  assert.deepEqual(
    normalizeProvisioningRuns([oldRun, newRun]).map((run) => run.name),
    ['new-run', 'old-run'],
  );
});
