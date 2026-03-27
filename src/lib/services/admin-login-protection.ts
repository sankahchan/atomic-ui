import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
import ipRangeCheck from 'ip-range-check';
import { z } from 'zod';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { sendAdminAlert } from '@/lib/services/telegram-bot';
import { getGeoIpCountry } from '@/lib/security';

export const ADMIN_LOGIN_PROTECTION_SETTINGS_KEY = 'admin_login_protection';
export const ADMIN_LOGIN_FAIL2BAN_LOG =
  process.env.ADMIN_LOGIN_FAIL2BAN_LOG || '/tmp/atomic-ui-admin-login.log';
export const ADMIN_LOGIN_FAIL2BAN_JAIL =
  process.env.ADMIN_LOGIN_FAIL2BAN_JAIL || 'atomic-ui-auth-login';
export const GENERIC_ADMIN_LOGIN_BLOCK_MESSAGE = 'Too many failed attempts. Try again later.';
const REPEATED_OFFENDER_ALERT_COOLDOWN_MS = 6 * 60 * 60_000;
const DEFAULT_REPEAT_BAN_LOOKBACK_DAYS = 7;
const DEFAULT_REPEAT_BAN_DURATION_MINUTES = 48 * 60;

const adminLoginProtectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  softLockThreshold: z.number().int().min(1).max(100).default(5),
  softLockWindowMinutes: z.number().int().min(1).max(1440).default(10),
  softLockDurationMinutes: z.number().int().min(1).max(10080).default(15),
  banThreshold: z.number().int().min(1).max(200).default(8),
  banWindowMinutes: z.number().int().min(1).max(1440).default(10),
  banDurationMinutes: z.number().int().min(1).max(10080).default(720),
  telegramAlertEnabled: z.boolean().default(true),
  alertOnRepeatedOffender: z.boolean().default(true),
  repeatedOffenderThreshold: z.number().int().min(1).max(500).default(12),
  alertOnUnban: z.boolean().default(true),
  fail2banLogEnabled: z.boolean().default(true),
  repeatedBanLookbackDays: z.number().int().min(1).max(365).default(DEFAULT_REPEAT_BAN_LOOKBACK_DAYS),
  repeatedBanDurationMinutes: z.number().int().min(1).max(43200).default(DEFAULT_REPEAT_BAN_DURATION_MINUTES),
  trustedIpRanges: z.array(z.string()).default([]),
});

export type AdminLoginProtectionConfig = z.infer<typeof adminLoginProtectionConfigSchema>;

export type AdminLoginRestrictionInfo = {
  id: string;
  ip: string;
  restrictionType: string;
  attemptedEmail: string | null;
  failureCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  expiresAt: Date;
  isActive: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  lastAlertSentAt: Date | null;
  lastFail2banEventAt: Date | null;
};

type RecordFailedAdminLoginInput = {
  ip: string | null | undefined;
  email: string;
  host?: string | null | undefined;
  path?: string | null | undefined;
};

type Fail2banStatus = {
  available: boolean;
  jail: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
  error: string | null;
};

type FailureSnapshot = {
  ipCount: number;
  pairCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
};

type AdminLoginAuditEvent = {
  id: string;
  action: string;
  ip: string | null;
  details: string | null;
  createdAt: Date;
};

type ParsedAuditDetails = {
  email: string | null;
  host: string | null;
  path: string | null;
  restrictionType: string | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
};

type AdminLoginIncidentStatus = 'ACTIVE' | 'CONTAINED' | 'RESOLVED';
type AdminLoginIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AdminLoginReputationLevel = 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

type AdminLoginIncident = {
  id: string;
  ip: string;
  countryCode: string | null;
  startedAt: Date;
  endedAt: Date;
  failureCount: number;
  lockCount: number;
  banCount: number;
  repeatedOffenderCount: number;
  unbanCount: number;
  attemptedEmails: string[];
  hosts: string[];
  paths: string[];
  activeRestrictionType: string | null;
  currentlyBanned: boolean;
  status: AdminLoginIncidentStatus;
  severity: AdminLoginIncidentSeverity;
  summary: string;
};

type AdminLoginIpReputation = {
  ip: string;
  countryCode: string | null;
  score: number;
  level: AdminLoginReputationLevel;
  failures24h: number;
  failures7d: number;
  failures30d: number;
  bans7d: number;
  locks7d: number;
  repeatedAlerts30d: number;
  incidents7d: number;
  attemptedEmails: string[];
  topEmail: string | null;
  lastSeenAt: Date;
  currentlyRestricted: boolean;
  currentlyBanned: boolean;
};

const INCIDENT_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
const REPUTATION_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const INCIDENT_IDLE_GAP_MS = 45 * 60_000;
const INCIDENT_ACTIVE_WINDOW_MS = 30 * 60_000;
const INCIDENT_ACTIONS = [
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGIN_LOCKED',
  'AUTH_LOGIN_BANNED',
  'AUTH_LOGIN_REPEATED_OFFENDER_ALERT',
  'AUTH_LOGIN_UNBANNED',
] as const;

function normalizeIpAddress(rawIp: string | null | undefined): string | null {
  if (!rawIp) {
    return null;
  }

  let ip = rawIp.trim();
  if (!ip) {
    return null;
  }

  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) {
    ip = ip.slice(0, zoneIndex);
  }

  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort) {
    ip = ipv4WithPort[1];
  }

  if (ip === '::1') {
    return '127.0.0.1';
  }

  return isIP(ip) ? ip : null;
}

function isLocalOrPrivateIp(ip: string) {
  return ipRangeCheck(ip, [
    '127.0.0.1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '::1',
    'fc00::/7',
    'fe80::/10',
  ]);
}

function normalizeTrustedIpRanges(values: string[] | null | undefined) {
  return Array.from(new Set(
    (values || [])
      .flatMap((value) => value.split(/[\n,]/))
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

function buildAuditEmailNeedle(email: string) {
  return `"email":${JSON.stringify(email)}`;
}

function buildFailureSnapshot(
  ipCount: number,
  pairCount: number,
  firstSeenAt: Date | null,
  lastSeenAt: Date | null,
): FailureSnapshot {
  return {
    ipCount,
    pairCount,
    firstSeenAt,
    lastSeenAt,
  };
}

function parseAuditDetails(rawValue: string | null | undefined): ParsedAuditDetails {
  if (!rawValue) {
    return {
      email: null,
      host: null,
      path: null,
      restrictionType: null,
      firstSeenAt: null,
      lastSeenAt: null,
    };
  }

  try {
    const details = JSON.parse(rawValue) as Record<string, unknown>;
    const asDate = (value: unknown) => {
      if (typeof value !== 'string') {
        return null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    return {
      email: typeof details.email === 'string' ? details.email : null,
      host: typeof details.host === 'string' ? details.host : null,
      path: typeof details.path === 'string' ? details.path : null,
      restrictionType:
        typeof details.restrictionType === 'string' ? details.restrictionType : null,
      firstSeenAt: asDate(details.firstSeenAt),
      lastSeenAt: asDate(details.lastSeenAt ?? details.lastAttemptAt),
    };
  } catch {
    return {
      email: null,
      host: null,
      path: null,
      restrictionType: null,
      firstSeenAt: null,
      lastSeenAt: null,
    };
  }
}

function buildIncidentSummary(incident: {
  failureCount: number;
  lockCount: number;
  banCount: number;
  repeatedOffenderCount: number;
  unbanCount: number;
}) {
  const parts = [`${incident.failureCount} failed login${incident.failureCount === 1 ? '' : 's'}`];

  if (incident.lockCount > 0) {
    parts.push(`${incident.lockCount} lock${incident.lockCount === 1 ? '' : 's'}`);
  }

  if (incident.banCount > 0) {
    parts.push(`${incident.banCount} ban${incident.banCount === 1 ? '' : 's'}`);
  }

  if (incident.repeatedOffenderCount > 0) {
    parts.push(
      `${incident.repeatedOffenderCount} repeat alert${incident.repeatedOffenderCount === 1 ? '' : 's'}`,
    );
  }

  if (incident.unbanCount > 0) {
    parts.push(`${incident.unbanCount} unban${incident.unbanCount === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}

function buildIncidentStatus(
  endedAt: Date,
  now: Date,
  activeRestrictionType: string | null,
  currentlyBanned: boolean,
  lockCount: number,
  banCount: number,
): AdminLoginIncidentStatus {
  if (currentlyBanned || activeRestrictionType) {
    return 'ACTIVE';
  }

  if (now.getTime() - endedAt.getTime() <= INCIDENT_ACTIVE_WINDOW_MS) {
    return 'ACTIVE';
  }

  if (lockCount > 0 || banCount > 0) {
    return 'CONTAINED';
  }

  return 'RESOLVED';
}

function buildIncidentSeverity(incident: {
  failureCount: number;
  lockCount: number;
  banCount: number;
  repeatedOffenderCount: number;
  currentlyBanned: boolean;
}): AdminLoginIncidentSeverity {
  if (incident.currentlyBanned || incident.banCount > 0) {
    return 'CRITICAL';
  }

  if (incident.repeatedOffenderCount > 0 || incident.lockCount > 0 || incident.failureCount >= 10) {
    return 'HIGH';
  }

  if (incident.failureCount >= 5) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function buildReputationLevel(score: number): AdminLoginReputationLevel {
  if (score >= 75) {
    return 'CRITICAL';
  }

  if (score >= 50) {
    return 'HIGH';
  }

  if (score >= 20) {
    return 'ELEVATED';
  }

  return 'LOW';
}

function buildSecurityIncidents(
  logs: AdminLoginAuditEvent[],
  {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  }: {
    activeRestrictionByIp: Map<string, AdminLoginRestrictionInfo>;
    fail2banBannedIps: Set<string>;
    now: Date;
  },
) {
  const incidents: Array<Omit<AdminLoginIncident, 'countryCode'>> = [];
  const groupedLogs = new Map<string, AdminLoginAuditEvent[]>();

  for (const log of logs) {
    if (!log.ip) {
      continue;
    }

    const ipLogs = groupedLogs.get(log.ip) ?? [];
    ipLogs.push(log);
    groupedLogs.set(log.ip, ipLogs);
  }

  for (const [ip, ipLogs] of Array.from(groupedLogs.entries())) {
    const sortedLogs = [...ipLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let cursor:
      | {
          startedAt: Date;
          endedAt: Date;
          failureCount: number;
          lockCount: number;
          banCount: number;
          repeatedOffenderCount: number;
          unbanCount: number;
          attemptedEmails: Set<string>;
          hosts: Set<string>;
          paths: Set<string>;
        }
      | null = null;

    const flush = () => {
      if (!cursor) {
        return;
      }

      const activeRestriction = activeRestrictionByIp.get(ip);
      const currentlyBanned =
        fail2banBannedIps.has(ip) || activeRestriction?.restrictionType === 'BAN';
      const activeRestrictionType = activeRestriction?.restrictionType ?? null;

      const incident = {
        id: `${ip}:${cursor.startedAt.getTime()}`,
        ip,
        startedAt: cursor.startedAt,
        endedAt: cursor.endedAt,
        failureCount: cursor.failureCount,
        lockCount: cursor.lockCount,
        banCount: cursor.banCount,
        repeatedOffenderCount: cursor.repeatedOffenderCount,
        unbanCount: cursor.unbanCount,
        attemptedEmails: Array.from(cursor.attemptedEmails).slice(0, 5),
        hosts: Array.from(cursor.hosts).slice(0, 3),
        paths: Array.from(cursor.paths).slice(0, 3),
        activeRestrictionType,
        currentlyBanned,
        status: buildIncidentStatus(
          cursor.endedAt,
          now,
          activeRestrictionType,
          currentlyBanned,
          cursor.lockCount,
          cursor.banCount,
        ),
        severity: buildIncidentSeverity({
          failureCount: cursor.failureCount,
          lockCount: cursor.lockCount,
          banCount: cursor.banCount,
          repeatedOffenderCount: cursor.repeatedOffenderCount,
          currentlyBanned,
        }),
        summary: buildIncidentSummary(cursor),
      };

      incidents.push(incident);
      cursor = null;
    };

    for (const log of sortedLogs) {
      const details = parseAuditDetails(log.details);

      if (!cursor || log.createdAt.getTime() - cursor.endedAt.getTime() > INCIDENT_IDLE_GAP_MS) {
        flush();
        cursor = {
          startedAt: details.firstSeenAt ?? log.createdAt,
          endedAt: details.lastSeenAt ?? log.createdAt,
          failureCount: 0,
          lockCount: 0,
          banCount: 0,
          repeatedOffenderCount: 0,
          unbanCount: 0,
          attemptedEmails: new Set<string>(),
          hosts: new Set<string>(),
          paths: new Set<string>(),
        };
      }

      cursor.endedAt = new Date(
        Math.max(cursor.endedAt.getTime(), (details.lastSeenAt ?? log.createdAt).getTime()),
      );
      cursor.startedAt = new Date(
        Math.min(cursor.startedAt.getTime(), (details.firstSeenAt ?? log.createdAt).getTime()),
      );

      if (details.email) {
        cursor.attemptedEmails.add(details.email);
      }
      if (details.host) {
        cursor.hosts.add(details.host);
      }
      if (details.path) {
        cursor.paths.add(details.path);
      }

      switch (log.action) {
        case 'AUTH_LOGIN_FAILED':
          cursor.failureCount += 1;
          break;
        case 'AUTH_LOGIN_LOCKED':
          cursor.lockCount += 1;
          break;
        case 'AUTH_LOGIN_BANNED':
          cursor.banCount += 1;
          break;
        case 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT':
          cursor.repeatedOffenderCount += 1;
          break;
        case 'AUTH_LOGIN_UNBANNED':
          cursor.unbanCount += 1;
          break;
        default:
          break;
      }
    }

    flush();
  }

  return incidents.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime()).slice(0, 20);
}

function buildIpReputation(
  logs: AdminLoginAuditEvent[],
  incidents: Array<Omit<AdminLoginIncident, 'countryCode'>>,
  {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  }: {
    activeRestrictionByIp: Map<string, AdminLoginRestrictionInfo>;
    fail2banBannedIps: Set<string>;
    now: Date;
  },
) {
  const dayAgo = now.getTime() - 24 * 60 * 60_000;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60_000;
  const ipMap = new Map<
    string,
    {
      failures24h: number;
      failures7d: number;
      failures30d: number;
      bans7d: number;
      locks7d: number;
      repeatedAlerts30d: number;
      lastSeenAt: Date;
      attemptedEmails: Set<string>;
      emailCounts: Map<string, number>;
    }
  >();

  for (const log of logs) {
    if (!log.ip) {
      continue;
    }

    const details = parseAuditDetails(log.details);
    const current = ipMap.get(log.ip) ?? {
      failures24h: 0,
      failures7d: 0,
      failures30d: 0,
      bans7d: 0,
      locks7d: 0,
      repeatedAlerts30d: 0,
      lastSeenAt: log.createdAt,
      attemptedEmails: new Set<string>(),
      emailCounts: new Map<string, number>(),
    };

    current.lastSeenAt = current.lastSeenAt > log.createdAt ? current.lastSeenAt : log.createdAt;

    if (details.email) {
      current.attemptedEmails.add(details.email);
      current.emailCounts.set(details.email, (current.emailCounts.get(details.email) ?? 0) + 1);
    }

    if (log.action === 'AUTH_LOGIN_FAILED') {
      current.failures30d += 1;
      if (log.createdAt.getTime() >= weekAgo) {
        current.failures7d += 1;
      }
      if (log.createdAt.getTime() >= dayAgo) {
        current.failures24h += 1;
      }
    }

    if (log.action === 'AUTH_LOGIN_BANNED' && log.createdAt.getTime() >= weekAgo) {
      current.bans7d += 1;
    }

    if (log.action === 'AUTH_LOGIN_LOCKED' && log.createdAt.getTime() >= weekAgo) {
      current.locks7d += 1;
    }

    if (log.action === 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT') {
      current.repeatedAlerts30d += 1;
    }

    ipMap.set(log.ip, current);
  }

  const incidents7dByIp = new Map<string, number>();
  for (const incident of incidents) {
    if (incident.startedAt.getTime() >= weekAgo) {
      incidents7dByIp.set(incident.ip, (incidents7dByIp.get(incident.ip) ?? 0) + 1);
    }
  }

  return Array.from(ipMap.entries())
    .map(([ip, value]) => {
      const currentlyRestricted = activeRestrictionByIp.has(ip);
      const currentlyBanned =
        fail2banBannedIps.has(ip) || activeRestrictionByIp.get(ip)?.restrictionType === 'BAN';
      const score = Math.min(
        100,
        value.failures24h * 4 +
          Math.max(0, value.failures7d - value.failures24h) * 2 +
          value.bans7d * 22 +
          value.locks7d * 10 +
          value.repeatedAlerts30d * 14 +
          (incidents7dByIp.get(ip) ?? 0) * 3 +
          (currentlyBanned ? 18 : currentlyRestricted ? 8 : 0),
      );

      let topEmail: string | null = null;
      let topEmailCount = -1;
      for (const [email, count] of Array.from(value.emailCounts.entries())) {
        if (count > topEmailCount) {
          topEmail = email;
          topEmailCount = count;
        }
      }

      return {
        ip,
        countryCode: null,
        score,
        level: buildReputationLevel(score),
        failures24h: value.failures24h,
        failures7d: value.failures7d,
        failures30d: value.failures30d,
        bans7d: value.bans7d,
        locks7d: value.locks7d,
        repeatedAlerts30d: value.repeatedAlerts30d,
        incidents7d: incidents7dByIp.get(ip) ?? 0,
        attemptedEmails: Array.from(value.attemptedEmails).slice(0, 5),
        topEmail,
        lastSeenAt: value.lastSeenAt,
        currentlyRestricted,
        currentlyBanned,
      };
    })
    .sort((a, b) => b.score - a.score || b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .slice(0, 20);
}

function isTrustedIp(ip: string, config: AdminLoginProtectionConfig) {
  return normalizeTrustedIpRanges(config.trustedIpRanges).some((range) => {
    if (range === ip) {
      return true;
    }

    try {
      return ipRangeCheck(ip, range);
    } catch {
      return false;
    }
  });
}

function parseConfig(rawValue: string | null | undefined): AdminLoginProtectionConfig {
  if (!rawValue) {
    return adminLoginProtectionConfigSchema.parse({});
  }

  try {
    return adminLoginProtectionConfigSchema.parse(JSON.parse(rawValue));
  } catch {
    return adminLoginProtectionConfigSchema.parse({});
  }
}

function ensureLogDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function appendFail2banEvent(ip: string, email: string) {
  const safeEmail = email.replaceAll(/\s+/g, '_').slice(0, 256);
  const line = `${new Date().toISOString()} ip=${ip} event=AUTH_LOGIN_FAILED email=${safeEmail}\n`;
  ensureLogDir(ADMIN_LOGIN_FAIL2BAN_LOG);
  fs.appendFileSync(ADMIN_LOGIN_FAIL2BAN_LOG, line, { encoding: 'utf8' });
}

function tryFail2banUnban(ip: string) {
  try {
    execFileSync('fail2ban-client', ['set', ADMIN_LOGIN_FAIL2BAN_JAIL, 'unbanip', ip], {
      stdio: 'ignore',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function parseFail2banMetric(output: string, label: string) {
  const match = output.match(new RegExp(`${label}:\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

function parseFail2banBannedIps(output: string) {
  const match = output.match(/Banned IP list:\s*(.*)/);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .trim()
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getFail2banStatus(): Fail2banStatus {
  try {
    const output = execFileSync('fail2ban-client', ['status', ADMIN_LOGIN_FAIL2BAN_JAIL], {
      encoding: 'utf8',
      timeout: 5000,
    });

    return {
      available: true,
      jail: ADMIN_LOGIN_FAIL2BAN_JAIL,
      currentlyFailed: parseFail2banMetric(output, 'Currently failed'),
      totalFailed: parseFail2banMetric(output, 'Total failed'),
      currentlyBanned: parseFail2banMetric(output, 'Currently banned'),
      totalBanned: parseFail2banMetric(output, 'Total banned'),
      bannedIps: parseFail2banBannedIps(output),
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      jail: ADMIN_LOGIN_FAIL2BAN_JAIL,
      currentlyFailed: 0,
      totalFailed: 0,
      currentlyBanned: 0,
      totalBanned: 0,
      bannedIps: [],
      error: error instanceof Error ? error.message : 'fail2ban unavailable',
    };
  }
}

async function sendRestrictionAlert(
  type: 'LOCK' | 'BAN',
  {
    ip,
    email,
    failureCount,
    pairFailureCount,
    expiresAt,
    firstSeenAt,
    lastSeenAt,
    host,
    path,
    escalated,
  }: {
    ip: string;
    email: string;
    failureCount: number;
    pairFailureCount: number;
    expiresAt: Date;
    firstSeenAt: Date | null;
    lastSeenAt: Date | null;
    host?: string | null;
    path?: string | null;
    escalated?: boolean;
  },
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';
  const durationMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const hostPart = host ? `\nHost: <code>${host}</code>` : '';
  const pathPart = path ? `\nPath: <code>${path}</code>` : '';
  const firstSeenPart = firstSeenAt ? `\nFirst seen: <b>${firstSeenAt.toISOString()}</b>` : '';
  const lastSeenPart = lastSeenAt ? `\nLast seen: <b>${lastSeenAt.toISOString()}</b>` : '';
  const escalatedPart = escalated ? '\nEscalation: <b>repeat offender window triggered</b>' : '';

  await sendAdminAlert(
    [
      type === 'BAN' ? '🚫 <b>Admin login IP banned</b>' : '⚠️ <b>Admin login IP temporarily locked</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Email: <code>${email}</code>`,
      `Failures (IP window): <b>${failureCount}</b>`,
      `Failures (email+IP window): <b>${pairFailureCount}</b>`,
      `Active for: <b>${durationMinutes} min</b>`,
      `${firstSeenPart}${lastSeenPart}${hostPart}${pathPart}${escalatedPart}`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

async function sendRepeatedOffenderAlert(
  {
    ip,
    email,
    failureCount,
    pairFailureCount,
    firstSeenAt,
    lastAttemptAt,
    host,
    path,
  }: {
    ip: string;
    email: string;
    failureCount: number;
    pairFailureCount: number;
    firstSeenAt: Date | null;
    lastAttemptAt: Date;
    host?: string | null;
    path?: string | null;
  },
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';
  const firstSeenPart = firstSeenAt ? `\nFirst seen: <b>${firstSeenAt.toISOString()}</b>` : '';
  const hostPart = host ? `\nHost: <code>${host}</code>` : '';
  const pathPart = path ? `\nPath: <code>${path}</code>` : '';

  await sendAdminAlert(
    [
      '🛡️ <b>Repeated admin login offender detected</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Email: <code>${email}</code>`,
      `Failures in last 24h: <b>${failureCount}</b>`,
      `Failures for same email+IP: <b>${pairFailureCount}</b>`,
      `Last attempt: <b>${lastAttemptAt.toISOString()}</b>`,
      `${firstSeenPart}${hostPart}${pathPart}`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

async function sendUnbanAlert(
  ip: string,
  restrictionType: string,
  attemptedEmail: string | null,
  fail2banUnbanned: boolean,
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';

  await sendAdminAlert(
    [
      '✅ <b>Admin login IP restriction cleared</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Restriction: <b>${restrictionType}</b>`,
      `Email: <code>${attemptedEmail || 'unknown'}</code>`,
      `fail2ban sync: <b>${fail2banUnbanned ? 'removed' : 'not found'}</b>`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

export async function getAdminLoginProtectionConfig(): Promise<AdminLoginProtectionConfig> {
  const setting = await db.settings.findUnique({
    where: { key: ADMIN_LOGIN_PROTECTION_SETTINGS_KEY },
    select: { value: true },
  });

  const config = parseConfig(setting?.value);
  return {
    ...config,
    trustedIpRanges: normalizeTrustedIpRanges(config.trustedIpRanges),
  };
}

export async function saveAdminLoginProtectionConfig(
  config: Partial<AdminLoginProtectionConfig>,
) {
  const current = await getAdminLoginProtectionConfig();
  const next = adminLoginProtectionConfigSchema.parse({
    ...current,
    ...config,
    trustedIpRanges: normalizeTrustedIpRanges(config.trustedIpRanges ?? current.trustedIpRanges),
  });

  await db.settings.upsert({
    where: { key: ADMIN_LOGIN_PROTECTION_SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: {
      key: ADMIN_LOGIN_PROTECTION_SETTINGS_KEY,
      value: JSON.stringify(next),
    },
  });

  return next;
}

export async function getActiveAdminLoginRestriction(ip: string | null | undefined) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return null;
  }

  const restriction = await db.adminLoginRestriction.findUnique({
    where: { ip: normalizedIp },
  });

  if (!restriction || !restriction.isActive) {
    return null;
  }

  if (restriction.expiresAt <= new Date()) {
    await db.adminLoginRestriction.update({
      where: { ip: normalizedIp },
      data: { isActive: false },
    });
    return null;
  }

  return restriction;
}

export async function getAdminLoginRestrictionStatus(ip: string | null | undefined) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return { blocked: false as const };
  }

  const config = await getAdminLoginProtectionConfig();
  if (!config.enabled || isLocalOrPrivateIp(normalizedIp) || isTrustedIp(normalizedIp, config)) {
    return { blocked: false as const };
  }

  const restriction = await getActiveAdminLoginRestriction(normalizedIp);
  if (!restriction) {
    return { blocked: false as const };
  }

  return {
    blocked: true as const,
    restriction,
    reason: GENERIC_ADMIN_LOGIN_BLOCK_MESSAGE,
    internalReason:
      restriction.restrictionType === 'BAN'
        ? `Access temporarily banned after repeated failed admin logins until ${restriction.expiresAt.toISOString()}`
        : `Access temporarily locked after repeated failed admin logins until ${restriction.expiresAt.toISOString()}`,
  };
}

export async function recordFailedAdminLogin(input: RecordFailedAdminLoginInput) {
  const normalizedIp = normalizeIpAddress(input.ip);
  const config = await getAdminLoginProtectionConfig();

  if (!normalizedIp || !config.enabled || isLocalOrPrivateIp(normalizedIp) || isTrustedIp(normalizedIp, config)) {
    return null;
  }

  if (config.fail2banLogEnabled) {
    try {
      await appendFail2banEvent(normalizedIp, input.email);
    } catch (error) {
      console.error('Failed to append admin login fail2ban event:', error);
    }
  }

  const now = new Date();
  const softWindowStart = new Date(now.getTime() - config.softLockWindowMinutes * 60_000);
  const banWindowStart = new Date(now.getTime() - config.banWindowMinutes * 60_000);
  const repeatedWindowStart = new Date(now.getTime() - 24 * 60 * 60_000);
  const repeatBanWindowStart = new Date(now.getTime() - config.repeatedBanLookbackDays * 24 * 60 * 60_000);
  const repeatedAlertCooldownStart = new Date(now.getTime() - REPEATED_OFFENDER_ALERT_COOLDOWN_MS);
  const emailNeedle = buildAuditEmailNeedle(input.email);

  const [
    softFailures,
    softPairFailures,
    softFirstSeen,
    softLastSeen,
    banFailures,
    banPairFailures,
    banFirstSeen,
    banLastSeen,
    repeatedFailures,
    repeatedPairFailures,
    repeatedFirstSeen,
    existing,
    repeatBanCount,
    recentRepeatedAlert,
  ] = await Promise.all([
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
        details: { contains: emailNeedle },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
        details: { contains: emailNeedle },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: repeatedWindowStart },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: repeatedWindowStart },
        details: { contains: emailNeedle },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: repeatedWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.adminLoginRestriction.findUnique({
      where: { ip: normalizedIp },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_BANNED',
        ip: normalizedIp,
        createdAt: { gte: repeatBanWindowStart },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT',
        ip: normalizedIp,
        createdAt: { gte: repeatedAlertCooldownStart },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  const softSnapshot = buildFailureSnapshot(
    softFailures,
    softPairFailures,
    softFirstSeen?.createdAt ?? null,
    softLastSeen?.createdAt ?? now,
  );
  const banSnapshot = buildFailureSnapshot(
    banFailures,
    banPairFailures,
    banFirstSeen?.createdAt ?? null,
    banLastSeen?.createdAt ?? now,
  );
  const repeatedSnapshot = buildFailureSnapshot(
    repeatedFailures,
    repeatedPairFailures,
    repeatedFirstSeen?.createdAt ?? null,
    now,
  );

  let restrictionType: 'LOCK' | 'BAN' | null = null;
  let failureCount = softSnapshot.ipCount;
  let pairFailureCount = softSnapshot.pairCount;
  let expiresAt: Date | null = null;
  let firstSeenAt: Date | null = softSnapshot.firstSeenAt;
  let lastSeenAt: Date | null = softSnapshot.lastSeenAt;
  let escalatedRepeatBan = false;

  if (banSnapshot.ipCount >= config.banThreshold) {
    restrictionType = 'BAN';
    failureCount = banSnapshot.ipCount;
    pairFailureCount = banSnapshot.pairCount;
    expiresAt = new Date(now.getTime() + config.banDurationMinutes * 60_000);
    firstSeenAt = banSnapshot.firstSeenAt;
    lastSeenAt = banSnapshot.lastSeenAt;
    if (repeatBanCount > 0) {
      const escalatedExpiresAt = new Date(now.getTime() + config.repeatedBanDurationMinutes * 60_000);
      if (escalatedExpiresAt > expiresAt) {
        expiresAt = escalatedExpiresAt;
        escalatedRepeatBan = true;
      }
    }
  } else if (softSnapshot.ipCount >= config.softLockThreshold) {
    restrictionType = 'LOCK';
    failureCount = softSnapshot.ipCount;
    pairFailureCount = softSnapshot.pairCount;
    expiresAt = new Date(now.getTime() + config.softLockDurationMinutes * 60_000);
    firstSeenAt = softSnapshot.firstSeenAt;
    lastSeenAt = softSnapshot.lastSeenAt;
  }

  if (!restrictionType || !expiresAt) {
    return null;
  }

  const restriction = await db.adminLoginRestriction.upsert({
    where: { ip: normalizedIp },
    update: {
      restrictionType,
      attemptedEmail: input.email,
      failureCount,
      firstFailedAt:
        existing?.isActive && existing.firstFailedAt < (firstSeenAt ?? softWindowStart)
          ? existing.firstFailedAt
          : (firstSeenAt ?? softWindowStart),
      lastFailedAt: now,
      expiresAt,
      isActive: true,
      source: 'APP',
    },
    create: {
      ip: normalizedIp,
      restrictionType,
      attemptedEmail: input.email,
      failureCount,
      firstFailedAt: firstSeenAt ?? (restrictionType === 'BAN' ? banWindowStart : softWindowStart),
      lastFailedAt: now,
      expiresAt,
      isActive: true,
      source: 'APP',
    },
  });

  const shouldAlert =
    !existing ||
    !existing.isActive ||
    existing.restrictionType !== restrictionType ||
    existing.expiresAt <= now ||
    existing.expiresAt < expiresAt;

  if (shouldAlert) {
    await writeAuditLog({
      action: restrictionType === 'BAN' ? 'AUTH_LOGIN_BANNED' : 'AUTH_LOGIN_LOCKED',
      entity: 'AUTH',
      entityId: restriction.id,
      ip: normalizedIp,
      details: {
        email: input.email,
        failureCount,
        pairFailureCount,
        restrictionType,
        expiresAt: expiresAt.toISOString(),
        firstSeenAt: firstSeenAt?.toISOString() ?? null,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        host: input.host ?? null,
        path: input.path ?? null,
        repeatBanCount,
        escalatedRepeatBan,
      },
    });

    if (config.telegramAlertEnabled) {
      try {
        await sendRestrictionAlert(restrictionType, {
          ip: normalizedIp,
          email: input.email,
          failureCount,
          pairFailureCount,
          expiresAt,
          firstSeenAt,
          lastSeenAt,
          host: input.host,
          path: input.path,
          escalated: escalatedRepeatBan,
        });
        await db.adminLoginRestriction.update({
          where: { ip: normalizedIp },
          data: { lastAlertSentAt: new Date() },
        });
      } catch (error) {
        console.error('Failed to send admin login restriction alert:', error);
      }
    }
  }

  if (
    config.telegramAlertEnabled &&
    config.alertOnRepeatedOffender &&
    repeatedSnapshot.ipCount >= config.repeatedOffenderThreshold &&
    !recentRepeatedAlert &&
    !(shouldAlert && restrictionType)
  ) {
    try {
      await sendRepeatedOffenderAlert({
        ip: normalizedIp,
        email: input.email,
        failureCount: repeatedSnapshot.ipCount,
        pairFailureCount: repeatedSnapshot.pairCount,
        firstSeenAt: repeatedSnapshot.firstSeenAt,
        lastAttemptAt: now,
        host: input.host,
        path: input.path,
      });
      await writeAuditLog({
        action: 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT',
        entity: 'AUTH',
        entityId: restriction.id,
        ip: normalizedIp,
        details: {
          email: input.email,
          failureCount: repeatedSnapshot.ipCount,
          pairFailureCount: repeatedSnapshot.pairCount,
          threshold: config.repeatedOffenderThreshold,
          firstSeenAt: repeatedSnapshot.firstSeenAt?.toISOString() ?? null,
          lastAttemptAt: now.toISOString(),
          host: input.host ?? null,
          path: input.path ?? null,
        },
      });
    } catch (error) {
      console.error('Failed to send repeated offender alert:', error);
    }
  }

  return restriction;
}

export async function unbanAdminLoginIp(ip: string) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return { success: false, unbanned: false };
  }

  const existing = await db.adminLoginRestriction.findUnique({
    where: { ip: normalizedIp },
  });

  if (existing) {
    await db.adminLoginRestriction.update({
      where: { ip: normalizedIp },
      data: {
        isActive: false,
        expiresAt: new Date(),
      },
    });

    await writeAuditLog({
      action: 'AUTH_LOGIN_UNBANNED',
      entity: 'AUTH',
      entityId: existing.id,
      ip: normalizedIp,
      details: {
        restrictionType: existing.restrictionType,
      },
    });
  }

  const fail2banUnbanned = tryFail2banUnban(normalizedIp);

  if (existing) {
    const config = await getAdminLoginProtectionConfig();
    if (config.telegramAlertEnabled && config.alertOnUnban) {
      try {
        await sendUnbanAlert(
          normalizedIp,
          existing.restrictionType,
          existing.attemptedEmail,
          fail2banUnbanned,
        );
      } catch (error) {
        console.error('Failed to send unban alert:', error);
      }
    }
  }

  return {
    success: Boolean(existing) || fail2banUnbanned,
    unbanned: Boolean(existing),
    fail2banUnbanned,
  };
}

export async function getAdminLoginAbuseOverview() {
  const config = await getAdminLoginProtectionConfig();
  const now = new Date();
  const incidentWindowStart = new Date(now.getTime() - INCIDENT_LOOKBACK_MS);
  const reputationWindowStart = new Date(now.getTime() - REPUTATION_LOOKBACK_MS);

  await db.adminLoginRestriction.updateMany({
    where: {
      isActive: true,
      expiresAt: { lte: now },
    },
    data: { isActive: false },
  });

  const [
    activeRestrictions,
    recentFailures,
    failuresLastHour,
    failuresLastDay,
    incidentLogs,
    reputationLogs,
  ] = await Promise.all([
    db.adminLoginRestriction.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: now },
      },
      orderBy: [{ restrictionType: 'desc' }, { lastFailedAt: 'desc' }],
      take: 100,
    }),
    db.auditLog.findMany({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        createdAt: { gte: new Date(now.getTime() - 60 * 60_000) },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
    }),
    db.auditLog.findMany({
      where: {
        action: { in: [...INCIDENT_ACTIONS] },
        ip: { not: null },
        createdAt: { gte: incidentWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        ip: true,
        details: true,
        createdAt: true,
      },
    }),
    db.auditLog.findMany({
      where: {
        action: { in: [...INCIDENT_ACTIONS] },
        ip: { not: null },
        createdAt: { gte: reputationWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        ip: true,
        details: true,
        createdAt: true,
      },
    }),
  ]);

  const fail2banStatus = getFail2banStatus();
  const fail2banBannedIps = new Set(fail2banStatus.bannedIps);
  const activeRestrictionByIp = new Map(
    activeRestrictions.map((restriction) => [restriction.ip, restriction as AdminLoginRestrictionInfo]),
  );
  const geoIpCache = new Map<string, ReturnType<typeof getGeoIpCountry>>();
  const getCachedGeo = (ip: string) => {
    if (!geoIpCache.has(ip)) {
      geoIpCache.set(ip, getGeoIpCountry(ip));
    }

    return geoIpCache.get(ip)!;
  };
  const securityIncidents = buildSecurityIncidents(incidentLogs, {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  });
  const ipReputation = buildIpReputation(reputationLogs, securityIncidents, {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  });

  const recentFailuresWithGeo = await Promise.all(
    recentFailures.map(async (failure) => {
      const details = parseAuditDetails(failure.details);
      const geo = failure.ip ? await getCachedGeo(failure.ip) : { countryCode: null };
      return {
        id: failure.id,
        ip: failure.ip,
        email: details.email,
        createdAt: failure.createdAt,
        countryCode: geo.countryCode,
      };
    }),
  );

  const topOffenders = new Map<string, { ip: string; count: number; lastAttemptAt: Date; email: string | null }>();
  for (const failure of recentFailuresWithGeo) {
    const key = failure.ip || 'unknown';
    const current = topOffenders.get(key);
    if (!current) {
      topOffenders.set(key, {
        ip: key,
        count: 1,
        lastAttemptAt: failure.createdAt,
        email: failure.email,
      });
      continue;
    }

    current.count += 1;
    if (failure.createdAt > current.lastAttemptAt) {
      current.lastAttemptAt = failure.createdAt;
      current.email = failure.email;
    }
  }

  return {
    config,
    summary: {
      failuresLastHour,
      failuresLastDay,
      activeRestrictions: activeRestrictions.length,
      activeBans: activeRestrictions.filter((item) => item.restrictionType === 'BAN').length,
    },
    activeRestrictions,
    recentFailures: recentFailuresWithGeo,
    topOffenders: Array.from(topOffenders.values())
      .sort((a, b) => b.count - a.count || b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime())
      .slice(0, 20),
    securityIncidents: await Promise.all(
      securityIncidents.map(async (incident) => ({
        ...incident,
        countryCode: (await getCachedGeo(incident.ip)).countryCode,
      })),
    ),
    ipReputation: await Promise.all(
      ipReputation.map(async (entry) => ({
        ...entry,
        countryCode: (await getCachedGeo(entry.ip)).countryCode,
      })),
    ),
    fail2banStatus,
  };
}
