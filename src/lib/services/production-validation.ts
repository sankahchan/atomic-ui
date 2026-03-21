import fs from 'node:fs';

export interface ProductionValidationResult {
  errors: string[];
  warnings: string[];
}

export function loadEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return acc;
      }

      const separator = trimmed.indexOf('=');
      if (separator === -1) {
        return acc;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      acc[key] = value;
      return acc;
    }, {});
}

export function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateProductionEnvironment(
  env: Record<string, string | undefined>,
): ProductionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const required = ['DATABASE_URL', 'JWT_SECRET', 'TOTP_ENCRYPTION_KEY', 'CRON_SECRET'];
  for (const key of required) {
    if (!env[key]?.trim()) {
      errors.push(`${key} is required for production`);
    }
  }

  if (env.JWT_SECRET && env.JWT_SECRET.trim().length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  if (env.TOTP_ENCRYPTION_KEY) {
    const value = env.TOTP_ENCRYPTION_KEY.trim();
    const isHex = /^[a-fA-F0-9]{64,}$/.test(value);
    if (!isHex && value.length < 32) {
      errors.push(
        'TOTP_ENCRYPTION_KEY must be a 64-char hex key or a passphrase of at least 32 characters',
      );
    }
  }

  if (!isHttpUrl(env.APP_URL)) {
    warnings.push('APP_URL is missing or not a valid http(s) URL');
  }

  if (!isHttpUrl(env.NEXT_PUBLIC_APP_URL)) {
    warnings.push('NEXT_PUBLIC_APP_URL is missing or not a valid http(s) URL');
  }

  if (env.APP_URL && env.NEXT_PUBLIC_APP_URL && env.APP_URL !== env.NEXT_PUBLIC_APP_URL) {
    warnings.push('APP_URL and NEXT_PUBLIC_APP_URL do not match');
  }

  if (env.PUBLIC_SHARE_URL && !isHttpUrl(env.PUBLIC_SHARE_URL)) {
    warnings.push('PUBLIC_SHARE_URL is present but not a valid http(s) URL');
  }

  if (env.NEXT_PUBLIC_PUBLIC_SHARE_URL && !isHttpUrl(env.NEXT_PUBLIC_PUBLIC_SHARE_URL)) {
    warnings.push('NEXT_PUBLIC_PUBLIC_SHARE_URL is present but not a valid http(s) URL');
  }

  if (
    env.PUBLIC_SHARE_URL &&
    env.NEXT_PUBLIC_PUBLIC_SHARE_URL &&
    env.PUBLIC_SHARE_URL !== env.NEXT_PUBLIC_PUBLIC_SHARE_URL
  ) {
    warnings.push('PUBLIC_SHARE_URL and NEXT_PUBLIC_PUBLIC_SHARE_URL do not match');
  }

  if (!env.NODE_ENV || env.NODE_ENV !== 'production') {
    warnings.push('NODE_ENV is not set to production in the validated environment');
  }

  if (env.PORT && !/^\d+$/.test(env.PORT)) {
    errors.push('PORT must be numeric');
  }

  if (env.LOG_LEVEL && !['debug', 'info', 'warn', 'error'].includes(env.LOG_LEVEL.toLowerCase())) {
    errors.push('LOG_LEVEL must be one of: debug, info, warn, error');
  }

  if (!env.SMTP_FROM && (env.SMTP_HOST || env.SMTP_USER || env.SMTP_PASS)) {
    warnings.push('SMTP_FROM is missing while SMTP delivery variables are present');
  }

  if (!env.DATABASE_URL?.startsWith('file:') && !env.DATABASE_URL?.startsWith('postgres')) {
    warnings.push('DATABASE_URL does not look like a SQLite or Postgres connection string');
  }

  return { errors, warnings };
}
