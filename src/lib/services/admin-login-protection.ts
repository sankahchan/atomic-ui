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
const REPEATED_OFFENDER_ALERT_COOLDOWN_MS = 6 * 60 * 60_000;

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
};

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

async function sendRestrictionAlert(
  type: 'LOCK' | 'BAN',
  ip: string,
  email: string,
  failureCount: number,
  expiresAt: Date,
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';
  const durationMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));

  await sendAdminAlert(
    [
      type === 'BAN' ? '🚫 <b>Admin login IP banned</b>' : '⚠️ <b>Admin login IP temporarily locked</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Email: <code>${email}</code>`,
      `Failures: <b>${failureCount}</b>`,
      `Active for: <b>${durationMinutes} min</b>`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

async function sendRepeatedOffenderAlert(
  ip: string,
  email: string,
  failureCount: number,
  lastAttemptAt: Date,
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';

  await sendAdminAlert(
    [
      '🛡️ <b>Repeated admin login offender detected</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Email: <code>${email}</code>`,
      `Failures in last 24h: <b>${failureCount}</b>`,
      `Last attempt: <b>${lastAttemptAt.toISOString()}</b>`,
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
    reason:
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
  const repeatedAlertCooldownStart = new Date(now.getTime() - REPEATED_OFFENDER_ALERT_COOLDOWN_MS);

  const [softFailures, banFailures, repeatedFailures, existing, recentRepeatedAlert] = await Promise.all([
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
        createdAt: { gte: banWindowStart },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: repeatedWindowStart },
      },
    }),
    db.adminLoginRestriction.findUnique({
      where: { ip: normalizedIp },
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

  let restrictionType: 'LOCK' | 'BAN' | null = null;
  let failureCount = softFailures;
  let expiresAt: Date | null = null;

  if (banFailures >= config.banThreshold) {
    restrictionType = 'BAN';
    failureCount = banFailures;
    expiresAt = new Date(now.getTime() + config.banDurationMinutes * 60_000);
  } else if (softFailures >= config.softLockThreshold) {
    restrictionType = 'LOCK';
    failureCount = softFailures;
    expiresAt = new Date(now.getTime() + config.softLockDurationMinutes * 60_000);
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
        existing?.isActive && existing.firstFailedAt < softWindowStart ? existing.firstFailedAt : softWindowStart,
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
      firstFailedAt: restrictionType === 'BAN' ? banWindowStart : softWindowStart,
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
    existing.expiresAt <= now;

  if (shouldAlert) {
    await writeAuditLog({
      action: restrictionType === 'BAN' ? 'AUTH_LOGIN_BANNED' : 'AUTH_LOGIN_LOCKED',
      entity: 'AUTH',
      entityId: restriction.id,
      ip: normalizedIp,
      details: {
        email: input.email,
        failureCount,
        restrictionType,
        expiresAt: expiresAt.toISOString(),
      },
    });

    if (config.telegramAlertEnabled) {
      try {
        await sendRestrictionAlert(restrictionType, normalizedIp, input.email, failureCount, expiresAt);
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
    repeatedFailures >= config.repeatedOffenderThreshold &&
    !recentRepeatedAlert &&
    !(shouldAlert && restrictionType)
  ) {
    try {
      await sendRepeatedOffenderAlert(normalizedIp, input.email, repeatedFailures, now);
      await writeAuditLog({
        action: 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT',
        entity: 'AUTH',
        entityId: restriction.id,
        ip: normalizedIp,
        details: {
          email: input.email,
          failureCount: repeatedFailures,
          threshold: config.repeatedOffenderThreshold,
          lastAttemptAt: now.toISOString(),
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

  await db.adminLoginRestriction.updateMany({
    where: {
      isActive: true,
      expiresAt: { lte: now },
    },
    data: { isActive: false },
  });

  const [activeRestrictions, recentFailures, failuresLastHour, failuresLastDay] = await Promise.all([
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
  ]);

  const recentFailuresWithGeo = await Promise.all(
    recentFailures.map(async (failure) => {
      let email: string | null = null;

      if (failure.details) {
        try {
          const details = JSON.parse(failure.details) as { email?: string };
          email = details.email || null;
        } catch {
          email = null;
        }
      }

      const geo = await getGeoIpCountry(failure.ip);
      return {
        id: failure.id,
        ip: failure.ip,
        email,
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
  };
}
