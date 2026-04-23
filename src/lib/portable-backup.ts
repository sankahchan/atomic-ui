export const POSTGRES_BACKUP_BUNDLE_FORMAT = 'atomic-ui.postgres.bundle.v1';
export const POSTGRES_BACKUP_BUNDLE_MANIFEST = 'atomic-ui-backup-manifest.json';
export const POSTGRES_BACKUP_BUNDLE_RESTORE_ENV = 'atomic-ui-restore.env';
export const POSTGRES_BACKUP_BUNDLE_DUMP = 'backup.dump';

export const POSTGRES_BACKUP_RESTORE_ENV_KEYS = [
  'SETTINGS_ENCRYPTION_KEY',
  'TOTP_ENCRYPTION_KEY',
  'JWT_SECRET',
  'TELEGRAM_WEBHOOK_SECRET',
] as const;

export type PostgresBackupRestoreEnvKey = (typeof POSTGRES_BACKUP_RESTORE_ENV_KEYS)[number];

export interface PostgresBackupBundleManifest {
  format: typeof POSTGRES_BACKUP_BUNDLE_FORMAT;
  createdAt: string;
  databaseEngine: 'postgres';
  payload: typeof POSTGRES_BACKUP_BUNDLE_DUMP;
  restoreEnv: typeof POSTGRES_BACKUP_BUNDLE_RESTORE_ENV;
  restoreEnvKeys: PostgresBackupRestoreEnvKey[];
}

function quoteEnvValue(value: string) {
  return JSON.stringify(value);
}

export function buildPostgresBackupBundleManifest(
  createdAt = new Date(),
): PostgresBackupBundleManifest {
  return {
    format: POSTGRES_BACKUP_BUNDLE_FORMAT,
    createdAt: createdAt.toISOString(),
    databaseEngine: 'postgres',
    payload: POSTGRES_BACKUP_BUNDLE_DUMP,
    restoreEnv: POSTGRES_BACKUP_BUNDLE_RESTORE_ENV,
    restoreEnvKeys: [...POSTGRES_BACKUP_RESTORE_ENV_KEYS],
  };
}

export function buildPostgresBackupRestoreEnvFile(
  env: Record<string, string | undefined> = process.env,
) {
  return POSTGRES_BACKUP_RESTORE_ENV_KEYS
    .map((key) => {
      const value = env[key]?.trim();
      return value ? `${key}=${quoteEnvValue(value)}` : null;
    })
    .filter((line): line is string => Boolean(line))
    .join('\n')
    .concat('\n');
}
