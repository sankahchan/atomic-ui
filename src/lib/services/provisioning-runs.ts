import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { db } from '@/lib/db';

export const PROVISIONING_RUNS_SETTING_KEY = 'ops_provisioning_runs_v1';
export const MAX_PROVISIONING_RUNS = 20;

export const provisioningStepKeySchema = z.enum([
  'provider_token',
  'droplet_config',
  'create_droplet',
  'wait_for_ip',
  'outline_install',
]);

export const provisioningStepStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'action_required',
]);

export const provisioningRunStatusSchema = z.enum([
  'creating_droplet',
  'waiting_for_ip',
  'ready_for_outline',
  'failed',
  'completed',
]);

export type ProvisioningStepKey = z.infer<typeof provisioningStepKeySchema>;
export type ProvisioningStepStatus = z.infer<typeof provisioningStepStatusSchema>;
export type ProvisioningRunStatus = z.infer<typeof provisioningRunStatusSchema>;

const provisioningStepStatusesSchema = z.object({
  provider_token: provisioningStepStatusSchema,
  droplet_config: provisioningStepStatusSchema,
  create_droplet: provisioningStepStatusSchema,
  wait_for_ip: provisioningStepStatusSchema,
  outline_install: provisioningStepStatusSchema,
});

const provisioningRunSchema = z.object({
  id: z.string().min(1),
  provider: z.literal('digitalocean'),
  name: z.string().min(1),
  region: z.string().min(1),
  size: z.string().min(1),
  status: provisioningRunStatusSchema,
  currentStep: provisioningStepKeySchema,
  summary: z.string().min(1),
  stepStatuses: provisioningStepStatusesSchema,
  attemptCount: z.number().int().min(1),
  failedStep: provisioningStepKeySchema.nullable(),
  lastError: z.string().nullable(),
  dropletId: z.number().int().positive().nullable(),
  dropletStatus: z.string().nullable(),
  dropletIp: z.string().nullable(),
  createdByUserId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastCheckedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

const provisioningRunsSchema = z.array(provisioningRunSchema);

export type ProvisioningRun = z.infer<typeof provisioningRunSchema>;

export type ProvisioningDropletSnapshot = {
  id: number;
  status?: string | null;
  ip?: string | null;
};

function buildDefaultStepStatuses(): ProvisioningRun['stepStatuses'] {
  return {
    provider_token: 'success',
    droplet_config: 'success',
    create_droplet: 'running',
    wait_for_ip: 'pending',
    outline_install: 'pending',
  };
}

function sortRunsDescending(runs: ProvisioningRun[]) {
  return [...runs].sort((left, right) => {
    const updatedDelta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function normalizeProvisioningRuns(value: unknown): ProvisioningRun[] {
  const parsed = provisioningRunsSchema.safeParse(value);
  if (!parsed.success) {
    return [];
  }

  return sortRunsDescending(parsed.data).slice(0, MAX_PROVISIONING_RUNS);
}

export function createProvisioningRunRecord(input: {
  name: string;
  region: string;
  size: string;
  createdByUserId?: string | null;
}): ProvisioningRun {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    provider: 'digitalocean',
    name: input.name.trim(),
    region: input.region.trim(),
    size: input.size.trim(),
    status: 'creating_droplet',
    currentStep: 'create_droplet',
    summary: 'Requesting a new DigitalOcean droplet.',
    stepStatuses: buildDefaultStepStatuses(),
    attemptCount: 1,
    failedStep: null,
    lastError: null,
    dropletId: null,
    dropletStatus: null,
    dropletIp: null,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: null,
    completedAt: null,
  };
}

export function applyProvisioningRunFailure(
  run: ProvisioningRun,
  input: {
    step: ProvisioningStepKey;
    message: string;
  },
): ProvisioningRun {
  const stepStatuses = { ...run.stepStatuses };
  stepStatuses[input.step] = 'failed';
  if (input.step === 'create_droplet') {
    stepStatuses.wait_for_ip = 'pending';
    stepStatuses.outline_install = 'pending';
  }
  if (input.step === 'wait_for_ip') {
    stepStatuses.outline_install = 'pending';
  }

  return {
    ...run,
    status: 'failed',
    currentStep: input.step,
    summary:
      input.step === 'create_droplet'
        ? 'Droplet creation failed. Review the provider error and retry.'
        : 'Droplet lookup failed before a public IP was assigned. Retry the provisioning check.',
    stepStatuses,
    failedStep: input.step,
    lastError: input.message,
    updatedAt: new Date().toISOString(),
  };
}

export function applyProvisioningRetryStart(run: ProvisioningRun): ProvisioningRun {
  const failedStep = run.failedStep ?? 'create_droplet';
  const stepStatuses = { ...run.stepStatuses };

  if (failedStep === 'create_droplet') {
    stepStatuses.create_droplet = 'running';
    stepStatuses.wait_for_ip = 'pending';
    stepStatuses.outline_install = 'pending';
  } else if (failedStep === 'wait_for_ip') {
    stepStatuses.wait_for_ip = 'running';
    stepStatuses.outline_install = 'pending';
  }

  return {
    ...run,
    status: failedStep === 'create_droplet' ? 'creating_droplet' : 'waiting_for_ip',
    currentStep: failedStep,
    summary:
      failedStep === 'create_droplet'
        ? 'Retrying droplet creation with the saved config.'
        : 'Retrying droplet status lookup until a public IP is available.',
    stepStatuses,
    attemptCount: run.attemptCount + 1,
    failedStep: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
}

export function applyProvisioningDropletCreated(
  run: ProvisioningRun,
  droplet: ProvisioningDropletSnapshot,
): ProvisioningRun {
  const now = new Date().toISOString();
  const publicIp = droplet.ip?.trim() || null;

  if (publicIp) {
    return applyProvisioningDropletReady(
      {
        ...run,
        stepStatuses: {
          ...run.stepStatuses,
          create_droplet: 'success',
          wait_for_ip: 'success',
        },
      },
      { ...droplet, ip: publicIp },
    );
  }

  return {
    ...run,
    status: 'waiting_for_ip',
    currentStep: 'wait_for_ip',
    summary: 'Droplet created. Waiting for the public IPv4 address.',
    stepStatuses: {
      ...run.stepStatuses,
      create_droplet: 'success',
      wait_for_ip: 'running',
    },
    failedStep: null,
    lastError: null,
    dropletId: droplet.id,
    dropletStatus: droplet.status?.trim() || 'new',
    dropletIp: null,
    updatedAt: now,
    lastCheckedAt: now,
  };
}

export function applyProvisioningDropletReady(
  run: ProvisioningRun,
  droplet: ProvisioningDropletSnapshot,
): ProvisioningRun {
  const now = new Date().toISOString();

  return {
    ...run,
    status: 'ready_for_outline',
    currentStep: 'outline_install',
    summary: 'Droplet is ready. Run the Outline installer over SSH to finish setup.',
    stepStatuses: {
      ...run.stepStatuses,
      create_droplet: 'success',
      wait_for_ip: 'success',
      outline_install: 'action_required',
    },
    failedStep: null,
    lastError: null,
    dropletId: droplet.id,
    dropletStatus: droplet.status?.trim() || 'active',
    dropletIp: droplet.ip?.trim() || run.dropletIp,
    updatedAt: now,
    lastCheckedAt: now,
  };
}

export function applyProvisioningStatusRefresh(
  run: ProvisioningRun,
  droplet: ProvisioningDropletSnapshot,
): ProvisioningRun {
  if (droplet.ip?.trim()) {
    return applyProvisioningDropletReady(run, droplet);
  }

  return {
    ...run,
    status: 'waiting_for_ip',
    currentStep: 'wait_for_ip',
    summary: 'Droplet exists, but the public IPv4 address is still pending.',
    stepStatuses: {
      ...run.stepStatuses,
      create_droplet: 'success',
      wait_for_ip: 'running',
    },
    dropletId: droplet.id,
    dropletStatus: droplet.status?.trim() || run.dropletStatus,
    updatedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
  };
}

export function applyProvisioningRunCompleted(run: ProvisioningRun): ProvisioningRun {
  const now = new Date().toISOString();

  return {
    ...run,
    status: 'completed',
    currentStep: 'outline_install',
    summary: 'Provisioning handoff marked complete.',
    stepStatuses: {
      ...run.stepStatuses,
      outline_install: 'success',
    },
    updatedAt: now,
    completedAt: now,
  };
}

async function saveProvisioningRuns(runs: ProvisioningRun[]) {
  const normalized = sortRunsDescending(runs).slice(0, MAX_PROVISIONING_RUNS);
  await db.settings.upsert({
    where: { key: PROVISIONING_RUNS_SETTING_KEY },
    update: { value: JSON.stringify(normalized) },
    create: {
      key: PROVISIONING_RUNS_SETTING_KEY,
      value: JSON.stringify(normalized),
    },
  });

  return normalized;
}

export async function getProvisioningRuns(): Promise<ProvisioningRun[]> {
  const setting = await db.settings.findUnique({
    where: { key: PROVISIONING_RUNS_SETTING_KEY },
    select: { value: true },
  });

  if (!setting?.value) {
    return [];
  }

  try {
    return normalizeProvisioningRuns(JSON.parse(setting.value));
  } catch {
    return [];
  }
}

export async function getProvisioningRun(id: string): Promise<ProvisioningRun | null> {
  const runs = await getProvisioningRuns();
  return runs.find((run) => run.id === id) ?? null;
}

async function replaceProvisioningRun(nextRun: ProvisioningRun) {
  const runs = await getProvisioningRuns();
  const nextRuns = [nextRun, ...runs.filter((run) => run.id !== nextRun.id)];
  await saveProvisioningRuns(nextRuns);
  return nextRun;
}

export async function createProvisioningRun(input: {
  name: string;
  region: string;
  size: string;
  createdByUserId?: string | null;
}) {
  const run = createProvisioningRunRecord(input);
  await replaceProvisioningRun(run);
  return run;
}

export async function updateProvisioningRun(run: ProvisioningRun) {
  await replaceProvisioningRun(run);
  return run;
}

export async function completeProvisioningRun(id: string) {
  const run = await getProvisioningRun(id);
  if (!run) {
    return null;
  }

  const nextRun = applyProvisioningRunCompleted(run);
  await replaceProvisioningRun(nextRun);
  return nextRun;
}
