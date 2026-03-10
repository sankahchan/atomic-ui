import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { createOutlineClient, parseOutlineConfig } from '@/lib/outline-api';
import { validateProductionEnvironment } from '@/lib/services/production-validation';
import { syncIncidentState } from '@/lib/services/incidents';

type StepStatus = 'complete' | 'attention' | 'warning' | 'pending';
type PostInstallCheckStatus = 'pass' | 'warn' | 'fail';

interface ParsedImportUser {
  email: string;
  password?: string | null;
  role?: string | null;
}

interface ParsedImportKey {
  name: string;
  server?: string | null;
  accessUrl?: string | null;
  email?: string | null;
  telegramId?: string | null;
  owner?: string | null;
  userEmail?: string | null;
  notes?: string | null;
  expiresAt?: string | null;
  dataLimitBytes?: string | null;
}

function resolveStatus({
  complete,
  warning,
}: {
  complete: boolean;
  warning?: boolean;
}): StepStatus {
  if (complete) {
    return 'complete';
  }

  if (warning) {
    return 'warning';
  }

  return 'attention';
}

function normalizeRole(role?: string | null) {
  if (!role) {
    return 'CLIENT';
  }

  const normalized = role.trim().toUpperCase();
  if (normalized === 'ADMIN') {
    return 'ADMIN';
  }

  return 'CLIENT';
}

function generateTemporaryPassword() {
  return randomBytes(9).toString('base64url');
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function parseJsonImport(input: string) {
  const parsed = JSON.parse(input) as unknown;

  if (Array.isArray(parsed)) {
    return classifyImportRows(parsed);
  }

  if (parsed && typeof parsed === 'object') {
    const objectValue = parsed as Record<string, unknown>;
    const users = Array.isArray(objectValue.users) ? objectValue.users : [];
    const keys = Array.isArray(objectValue.keys) ? objectValue.keys : [];
    const combined = [...users, ...keys];
    const classified = classifyImportRows(combined);
    return {
      users: classified.users,
      keys: classified.keys,
      warnings: classified.warnings,
    };
  }

  throw new Error('Unsupported JSON import shape');
}

function classifyImportRows(rows: unknown[]) {
  const users: ParsedImportUser[] = [];
  const keys: ParsedImportKey[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      warnings.push('Skipped one import row because it was not an object.');
      continue;
    }

    const record = row as Record<string, unknown>;
    const email = typeof record.email === 'string' ? record.email.trim() : '';
    const password = typeof record.password === 'string' ? record.password : null;
    const role = typeof record.role === 'string' ? record.role : null;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const server =
      typeof record.server === 'string'
        ? record.server.trim()
        : typeof record.serverName === 'string'
          ? record.serverName.trim()
          : '';
    const accessUrl = typeof record.accessUrl === 'string' ? record.accessUrl.trim() : '';
    const userEmail =
      typeof record.userEmail === 'string'
        ? record.userEmail.trim()
        : typeof record.ownerEmail === 'string'
          ? record.ownerEmail.trim()
          : '';

    const looksLikeUser = Boolean(email) && !name && !server && !accessUrl;
    const looksLikeKey = Boolean(name) || Boolean(server) || Boolean(accessUrl);

    if (looksLikeUser && !looksLikeKey) {
      users.push({
        email,
        password,
        role,
      });
      continue;
    }

    if (looksLikeKey) {
      keys.push({
        name: name || accessUrl || email || 'Imported Key',
        server: server || null,
        accessUrl: accessUrl || null,
        email: email || null,
        telegramId: typeof record.telegramId === 'string' ? record.telegramId.trim() : null,
        owner: typeof record.owner === 'string' ? record.owner.trim() : null,
        userEmail: userEmail || null,
        notes: typeof record.notes === 'string' ? record.notes : null,
        expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
        dataLimitBytes:
          typeof record.dataLimitBytes === 'string' || typeof record.dataLimitBytes === 'number'
            ? String(record.dataLimitBytes)
            : null,
      });
      continue;
    }

    warnings.push('Skipped one import row because it could not be recognized as a user or key.');
  }

  return { users, keys, warnings };
}

function parseCsvImport(input: string) {
  const rows = parseCsv(input);
  if (rows.length < 2) {
    return { users: [], keys: [], warnings: ['CSV import requires a header row and at least one data row.'] };
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const objects = rows.slice(1).map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? '']),
    ),
  );

  return classifyImportRows(objects);
}

function parseImportContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Import content is empty');
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonImport(trimmed);
  }

  return parseCsvImport(trimmed);
}

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getOnboardingReadiness() {
  const validation = validateProductionEnvironment(process.env as Record<string, string | undefined>);

  const [serverCount, activeServers, onlineServers, accessKeyCount, userCount, latestVerification] =
    await Promise.all([
      db.server.count(),
      db.server.count({ where: { isActive: true } }),
      db.healthCheck.count({
        where: {
          lastStatus: 'UP',
        },
      }),
      db.accessKey.count(),
      db.user.count(),
      db.backupVerification.findFirst({
        orderBy: { verifiedAt: 'desc' },
      }),
    ]);

  const hasServers = activeServers > 0;
  const hasImportedInventory = accessKeyCount > 0 || userCount > 1;
  const backupsVerified = latestVerification?.restoreReady === true;

  const steps = [
    {
      id: 'validate',
      title: 'Validate environment',
      description: 'Check required env vars, app URLs, SMTP setup, and production safety defaults.',
      status: validation.errors.length === 0 ? (validation.warnings.length > 0 ? 'warning' : 'complete') : 'attention',
      href: '/dashboard/onboarding',
      actionLabel: 'Review checks',
      summary:
        validation.errors.length > 0
          ? `${validation.errors.length} blocking issue(s)`
          : validation.warnings.length > 0
            ? `${validation.warnings.length} warning(s)`
            : 'Production env looks ready',
    },
    {
      id: 'server',
      title: 'Connect your first server',
      description: 'Deploy or connect an Outline server, set one as active, then verify health checks.',
      status: resolveStatus({ complete: hasServers, warning: serverCount > 0 }),
      href: hasServers ? '/dashboard/servers' : '/dashboard/servers/deploy',
      actionLabel: hasServers ? 'Open servers' : 'Deploy server',
      summary: hasServers
        ? `${activeServers} active server(s), ${onlineServers} currently healthy`
        : 'No active servers connected yet',
    },
    {
      id: 'import',
      title: 'Import keys and users',
      description: 'Sync existing server keys, migrate from older nodes, or restore from backup before go-live.',
      status: hasImportedInventory ? 'complete' : 'pending',
      href: '/dashboard/migration',
      actionLabel: 'Open migration',
      summary: hasImportedInventory
        ? `${accessKeyCount} key(s) and ${userCount} user(s) detected`
        : 'No imported inventory detected yet',
    },
    {
      id: 'verify',
      title: 'Verify health, alerts, and backups',
      description: 'Confirm health checks, notification delivery, and restore-ready backups before launch.',
      status: resolveStatus({ complete: backupsVerified && onlineServers > 0, warning: hasServers }),
      href: '/dashboard/incidents',
      actionLabel: 'Open incident center',
      summary: backupsVerified
        ? 'Latest backup passed verification'
        : 'Backup verification still needs attention',
    },
  ] as const;

  const completedSteps = steps.filter((step) => step.status === 'complete').length;

  return {
    summary: {
      completedSteps,
      totalSteps: steps.length,
      readyForLaunch: completedSteps === steps.length,
      activeServers,
      onlineServers,
      accessKeyCount,
      userCount,
    },
    validation,
    steps,
    latestBackupVerification: latestVerification
      ? {
          status: latestVerification.status,
          restoreReady: latestVerification.restoreReady,
          verifiedAt: latestVerification.verifiedAt,
          filename: latestVerification.filename,
        }
      : null,
  };
}

export async function previewOnboardingImport(content: string) {
  const parsed = parseImportContent(content);
  const existingUsers = await db.user.findMany({
    select: { id: true, email: true },
  });
  const existingKeys = await db.accessKey.findMany({
    include: {
      server: {
        select: {
          name: true,
        },
      },
    },
  });

  const userEmails = new Set(existingUsers.map((user) => user.email.toLowerCase()));
  const userPreview = parsed.users.map((user) => ({
    email: user.email,
    role: normalizeRole(user.role),
    exists: userEmails.has(user.email.toLowerCase()),
    passwordProvided: Boolean(user.password),
  }));

  const keyPreview = parsed.keys.map((key) => {
    const match = existingKeys.find((existing) => {
      if (key.accessUrl && existing.accessUrl && existing.accessUrl === key.accessUrl) {
        return true;
      }

      if (key.server && existing.server.name === key.server && existing.name === key.name) {
        return true;
      }

      return existing.name === key.name && (!key.server || existing.server.name === key.server);
    });

    return {
      name: key.name,
      server: key.server ?? null,
      accessUrl: key.accessUrl ?? null,
      userEmail: key.userEmail ?? null,
      matchedKeyId: match?.id ?? null,
      matchedKeyName: match?.name ?? null,
      matchedServerName: match?.server.name ?? null,
      matched: Boolean(match),
    };
  });

  return {
    users: userPreview,
    keys: keyPreview,
    warnings: parsed.warnings,
    summary: {
      usersToCreate: userPreview.filter((user) => !user.exists).length,
      usersExisting: userPreview.filter((user) => user.exists).length,
      keysMatched: keyPreview.filter((key) => key.matched).length,
      keysUnmatched: keyPreview.filter((key) => !key.matched).length,
    },
  };
}

export async function applyOnboardingImport({
  content,
  defaultPassword,
}: {
  content: string;
  defaultPassword?: string | null;
}) {
  const parsed = parseImportContent(content);
  const existingUsers = await db.user.findMany({
    select: { id: true, email: true },
  });
  const existingKeys = await db.accessKey.findMany({
    include: {
      server: {
        select: {
          name: true,
        },
      },
    },
  });

  const userByEmail = new Map(existingUsers.map((user) => [user.email.toLowerCase(), user]));
  const createdUsers: Array<{ email: string; temporaryPassword: string | null }> = [];
  const userErrors: string[] = [];

  for (const user of parsed.users) {
    const normalizedEmail = user.email.toLowerCase();
    if (userByEmail.has(normalizedEmail)) {
      continue;
    }

    const password = user.password?.trim() || defaultPassword?.trim() || generateTemporaryPassword();
    const passwordHash = await hashPassword(password);
    const created = await db.user.create({
      data: {
        email: user.email,
        passwordHash,
        role: normalizeRole(user.role),
      },
      select: {
        id: true,
        email: true,
      },
    });
    userByEmail.set(normalizedEmail, created);
    createdUsers.push({
      email: created.email,
      temporaryPassword: user.password?.trim() ? null : password,
    });
  }

  let keysUpdated = 0;
  const keyErrors: string[] = [];

  for (const key of parsed.keys) {
    const match = existingKeys.find((existing) => {
      if (key.accessUrl && existing.accessUrl && existing.accessUrl === key.accessUrl) {
        return true;
      }

      if (key.server && existing.server.name === key.server && existing.name === key.name) {
        return true;
      }

      return existing.name === key.name && (!key.server || existing.server.name === key.server);
    });

    if (!match) {
      keyErrors.push(`Could not match imported key "${key.name}" to an existing server key.`);
      continue;
    }

    let userId: string | null = null;
    if (key.userEmail?.trim()) {
      const normalizedEmail = key.userEmail.trim().toLowerCase();
      let user = userByEmail.get(normalizedEmail) ?? null;

      if (!user) {
        const password = defaultPassword?.trim() || generateTemporaryPassword();
        const passwordHash = await hashPassword(password);
        user = await db.user.create({
          data: {
            email: key.userEmail.trim(),
            passwordHash,
            role: 'CLIENT',
          },
          select: {
            id: true,
            email: true,
          },
        });
        userByEmail.set(normalizedEmail, user);
        createdUsers.push({
          email: user.email,
          temporaryPassword: password,
        });
      }

      userId = user.id;
    }

    await db.accessKey.update({
      where: { id: match.id },
      data: {
        email: key.email ?? match.email,
        telegramId: key.telegramId ?? match.telegramId,
        owner: key.owner ?? match.owner,
        notes: key.notes ?? match.notes,
        userId: userId ?? match.userId,
        expiresAt: parseDate(key.expiresAt) ?? match.expiresAt,
        dataLimitBytes:
          key.dataLimitBytes && /^[0-9]+$/.test(key.dataLimitBytes)
            ? BigInt(key.dataLimitBytes)
            : match.dataLimitBytes,
      },
    });
    keysUpdated += 1;
  }

  return {
    usersCreated: createdUsers.length,
    keysUpdated,
    createdUsers,
    warnings: parsed.warnings,
    errors: [...userErrors, ...keyErrors],
  };
}

export async function createOnboardingServer(input: {
  name: string;
  configText?: string | null;
  apiUrl?: string | null;
  apiCertSha256?: string | null;
  location?: string | null;
  countryCode?: string | null;
  isDefault?: boolean;
  enableHealthCheck?: boolean;
}) {
  let apiUrl = input.apiUrl?.trim() || '';
  let apiCertSha256 = input.apiCertSha256?.trim() || '';

  if (input.configText?.trim()) {
    const parsed = parseOutlineConfig(input.configText);
    if (!parsed) {
      throw new Error('Failed to parse Outline manager configuration');
    }
    apiUrl = parsed.apiUrl;
    apiCertSha256 = parsed.certSha256;
  }

  if (!apiUrl || !apiCertSha256) {
    throw new Error('API URL and certificate fingerprint are required');
  }

  const existing = await db.server.findFirst({
    where: { apiUrl },
  });
  if (existing) {
    throw new Error('A server with this API URL already exists');
  }

  const client = createOutlineClient(apiUrl, apiCertSha256);
  const serverInfo = await client.getServerInfo();

  if (input.isDefault) {
    await db.server.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const server = await db.server.create({
    data: {
      name: input.name.trim(),
      apiUrl,
      apiCertSha256,
      location: input.location?.trim() || null,
      countryCode: input.countryCode?.trim() || null,
      isDefault: input.isDefault ?? false,
      outlineServerId: serverInfo.serverId,
      outlineName: serverInfo.name,
      outlineVersion: serverInfo.version,
      hostnameForAccessKeys: serverInfo.hostnameForAccessKeys,
      portForNewAccessKeys: serverInfo.portForNewAccessKeys,
      metricsEnabled: serverInfo.metricsEnabled,
      lastSyncAt: new Date(),
    },
  });

  if (input.enableHealthCheck ?? true) {
    await db.healthCheck.create({
      data: {
        serverId: server.id,
        isEnabled: true,
        lastStatus: 'UP',
        lastLatencyMs: 0,
        lastCheckedAt: new Date(),
      },
    });
  }

  return {
    id: server.id,
    name: server.name,
    apiUrl: server.apiUrl,
    countryCode: server.countryCode,
  };
}

export async function runOnboardingPostInstallChecks() {
  await syncIncidentState('query');

  const validation = validateProductionEnvironment(process.env as Record<string, string | undefined>);
  const [
    activeServers,
    healthyServers,
    activeNotificationChannels,
    latestVerification,
    openIncidents,
    staleSyncServers,
  ] = await Promise.all([
    db.server.count({ where: { isActive: true } }),
    db.healthCheck.count({ where: { lastStatus: 'UP' } }),
    db.notificationChannel.count({ where: { isActive: true } }),
    db.backupVerification.findFirst({ orderBy: { verifiedAt: 'desc' } }),
    db.incident.count({
      where: {
        status: {
          in: ['OPEN', 'ACKNOWLEDGED'],
        },
      },
    }),
    db.server.findMany({
      where: {
        isActive: true,
      },
      select: {
        name: true,
        lastSyncAt: true,
      },
    }),
  ]);

  const staleServers = staleSyncServers.filter(
    (server) =>
      !server.lastSyncAt || Date.now() - server.lastSyncAt.getTime() > 24 * 60 * 60 * 1000,
  );

  const checks = [
    {
      id: 'env',
      title: 'Production environment',
      status:
        validation.errors.length > 0
          ? ('fail' as const)
          : validation.warnings.length > 0
            ? ('warn' as const)
            : ('pass' as const),
      summary:
        validation.errors.length > 0
          ? `${validation.errors.length} blocking issue(s)`
          : validation.warnings.length > 0
            ? `${validation.warnings.length} warning(s)`
            : 'Environment checks passed',
      details: [...validation.errors, ...validation.warnings],
    },
    {
      id: 'servers',
      title: 'Server readiness',
      status:
        activeServers === 0
          ? ('fail' as const)
          : healthyServers < activeServers
            ? ('warn' as const)
            : ('pass' as const),
      summary:
        activeServers === 0
          ? 'No active servers are configured'
          : `${healthyServers}/${activeServers} active servers are healthy`,
      details: staleServers.length
        ? [`${staleServers.length} server(s) have not synced in the last 24 hours`, ...staleServers.map((server) => server.name)]
        : [],
    },
    {
      id: 'notifications',
      title: 'Alert delivery',
      status:
        activeNotificationChannels === 0
          ? ('warn' as const)
          : ('pass' as const),
      summary:
        activeNotificationChannels === 0
          ? 'No active notification channels configured'
          : `${activeNotificationChannels} active notification channel(s) configured`,
      details: [],
    },
    {
      id: 'backups',
      title: 'Backup verification',
      status:
        latestVerification?.restoreReady === true
          ? ('pass' as const)
          : latestVerification
            ? ('warn' as const)
            : ('fail' as const),
      summary:
        latestVerification?.restoreReady === true
          ? 'Latest backup is restore-ready'
          : latestVerification
            ? 'Latest backup verification did not pass fully'
            : 'No verified backup found',
      details: latestVerification
        ? [
            latestVerification.filename,
            latestVerification.error || latestVerification.integrityCheck || latestVerification.status,
          ].filter(Boolean)
        : [],
    },
    {
      id: 'incidents',
      title: 'Open incidents',
      status:
        openIncidents > 0
          ? ('warn' as const)
          : ('pass' as const),
      summary:
        openIncidents > 0
          ? `${openIncidents} incident(s) still open`
          : 'No open incidents detected',
      details: [],
    },
  ] satisfies Array<{
    id: string;
    title: string;
    status: PostInstallCheckStatus;
    summary: string;
    details: string[];
  }>;

  return {
    checks,
    summary: {
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: checks.filter((check) => check.status === 'warn').length,
      fail: checks.filter((check) => check.status === 'fail').length,
      total: checks.length,
    },
  };
}
