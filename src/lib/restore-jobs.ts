import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { resolveAppRootDir } from '@/lib/backup-storage';

export const RESTORE_JOB_TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED'] as const;
export const RESTORE_JOB_ACTIVE_STATUSES = ['SCHEDULED', 'STOPPING_SERVICE', 'RESTORING', 'STARTING_SERVICE'] as const;

export type RestoreJobTerminalStatus = (typeof RESTORE_JOB_TERMINAL_STATUSES)[number];
export type RestoreJobActiveStatus = (typeof RESTORE_JOB_ACTIVE_STATUSES)[number];
export type RestoreJobStatus = RestoreJobActiveStatus | RestoreJobTerminalStatus;

export type RestoreJobRecord = {
  jobId: string;
  unitName: string;
  status: RestoreJobStatus;
  backupFilename: string;
  backupPath: string;
  requestedAt: string;
  requestedByUserId: string;
  requestedByEmail: string | null;
  requestedByIp: string | null;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  safetyBackupFilename?: string | null;
  error?: string | null;
};

export function resolveRestoreJobsDir(cwd = process.cwd()) {
  return path.join(resolveAppRootDir(cwd), 'storage', 'restore-jobs');
}

export function ensureRestoreJobsDir(cwd = process.cwd()) {
  const jobsDir = resolveRestoreJobsDir(cwd);
  fs.mkdirSync(jobsDir, { recursive: true });
  return jobsDir;
}

export function resolveRestoreJobPath(jobId: string, cwd = process.cwd()) {
  return path.join(ensureRestoreJobsDir(cwd), `${jobId}.json`);
}

function writeJsonAtomic(filePath: string, value: unknown) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
}

export function writeRestoreJob(record: RestoreJobRecord, cwd = process.cwd()) {
  const filePath = resolveRestoreJobPath(record.jobId, cwd);
  writeJsonAtomic(filePath, record);
  return filePath;
}

export function readRestoreJob(jobId: string, cwd = process.cwd()) {
  const filePath = resolveRestoreJobPath(jobId, cwd);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as RestoreJobRecord;
}

export function listRestoreJobs(limit = 10, cwd = process.cwd()) {
  const jobsDir = ensureRestoreJobsDir(cwd);
  const jobs = fs
    .readdirSync(jobsDir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(jobsDir, entry), 'utf8')) as RestoreJobRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is RestoreJobRecord => Boolean(record))
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

  return jobs.slice(0, limit);
}

export function hasActiveRestoreJob(cwd = process.cwd()) {
  return listRestoreJobs(20, cwd).some((job) => RESTORE_JOB_ACTIVE_STATUSES.includes(job.status as RestoreJobActiveStatus));
}

export function createRestoreJobRecord(input: {
  backupFilename: string;
  backupPath: string;
  requestedByUserId: string;
  requestedByEmail?: string | null;
  requestedByIp?: string | null;
  safetyBackupFilename?: string | null;
}) {
  const now = new Date().toISOString();
  const jobId = `restore-${now.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;

  return {
    jobId,
    unitName: `atomic-ui-restore-${jobId}`,
    status: 'SCHEDULED' as const,
    backupFilename: input.backupFilename,
    backupPath: input.backupPath,
    requestedAt: now,
    requestedByUserId: input.requestedByUserId,
    requestedByEmail: input.requestedByEmail ?? null,
    requestedByIp: input.requestedByIp ?? null,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    safetyBackupFilename: input.safetyBackupFilename ?? null,
    error: null,
  } satisfies RestoreJobRecord;
}

export function isRestoreJobActive(status: RestoreJobStatus) {
  return RESTORE_JOB_ACTIVE_STATUSES.includes(status as RestoreJobActiveStatus);
}

export function isRestoreJobTerminal(status: RestoreJobStatus) {
  return RESTORE_JOB_TERMINAL_STATUSES.includes(status as RestoreJobTerminalStatus);
}
