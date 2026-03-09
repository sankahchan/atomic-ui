import { db } from '@/lib/db';

const INCIDENT_ALERT_EVENTS = [
  'SERVER_DOWN',
  'SERVER_UP',
  'SERVER_SLOW',
  'TRAFFIC_WARNING',
  'TRAFFIC_DEPLETED',
  'KEY_EXPIRING',
  'KEY_EXPIRED',
] as const;

type IncidentSeverity = 'critical' | 'warning' | 'info';

interface RelatedUser {
  label: string;
  type: 'account' | 'email' | 'owner';
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function buildRelatedUsers(input: {
  userEmails: Array<string | null | undefined>;
  keyEmails: Array<string | null | undefined>;
  keyOwners: Array<string | null | undefined>;
}): RelatedUser[] {
  const accountUsers = uniqueStrings(input.userEmails).map((label) => ({
    label,
    type: 'account' as const,
  }));
  const keyUsers = uniqueStrings(input.keyEmails)
    .filter((email) => !accountUsers.some((entry) => entry.label === email))
    .map((label) => ({
      label,
      type: 'email' as const,
    }));
  const owners = uniqueStrings(input.keyOwners)
    .filter((owner) => !accountUsers.some((entry) => entry.label === owner) && !keyUsers.some((entry) => entry.label === owner))
    .map((label) => ({
      label,
      type: 'owner' as const,
    }));

  return [...accountUsers, ...keyUsers, ...owners];
}

function getSeverityFromStatus(status: string): IncidentSeverity {
  if (status === 'DOWN') {
    return 'critical';
  }

  if (status === 'SLOW') {
    return 'warning';
  }

  return 'info';
}

function getSeverityFromEvent(event: string): IncidentSeverity {
  if (event === 'SERVER_DOWN' || event === 'TRAFFIC_DEPLETED' || event === 'KEY_EXPIRED') {
    return 'critical';
  }

  if (event === 'SERVER_SLOW' || event === 'TRAFFIC_WARNING' || event === 'KEY_EXPIRING') {
    return 'warning';
  }

  return 'info';
}

function buildIncidentSummary(status: string, serverName: string, keyCount: number) {
  if (status === 'DOWN') {
    return `${serverName} is currently unreachable. ${keyCount} key(s) could be affected.`;
  }

  if (status === 'SLOW') {
    return `${serverName} is responding slowly. ${keyCount} key(s) may experience degraded performance.`;
  }

  return `${serverName} is being monitored.`;
}

function parseAuditDetails(details: string | null) {
  if (!details) {
    return null;
  }

  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function getIncidentCenterOverview(lookbackDays = 14) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const [servers, alertHistory, auditEntries] = await Promise.all([
    db.server.findMany({
      where: {
        isActive: true,
        healthCheck: {
          is: {
            lastStatus: {
              in: ['DOWN', 'SLOW'],
            },
          },
        },
      },
      include: {
        healthCheck: true,
        accessKeys: {
          select: {
            id: true,
            name: true,
            email: true,
            owner: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    db.notificationLog.findMany({
      where: {
        event: {
          in: [...INCIDENT_ALERT_EVENTS],
        },
        sentAt: {
          gte: since,
        },
      },
      orderBy: { sentAt: 'desc' },
      take: 50,
    }),
    db.auditLog.findMany({
      where: {
        createdAt: {
          gte: since,
        },
        OR: [
          { entity: 'SERVER' },
          { entity: 'ACCESS_KEY' },
          { entity: 'USER' },
          { action: { startsWith: 'AUTH_' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const openIncidents = servers.map((server) => {
    const relatedUsers = buildRelatedUsers({
      userEmails: server.accessKeys.map((key) => key.user?.email),
      keyEmails: server.accessKeys.map((key) => key.email),
      keyOwners: server.accessKeys.map((key) => key.owner),
    });
    const status = server.healthCheck?.lastStatus ?? 'UNKNOWN';

    return {
      id: server.id,
      serverId: server.id,
      serverName: server.name,
      countryCode: server.countryCode,
      status,
      severity: getSeverityFromStatus(status),
      latencyMs: server.healthCheck?.lastLatencyMs ?? null,
      startedAt: server.healthCheck?.lastCheckedAt ?? server.updatedAt,
      summary: buildIncidentSummary(status, server.name, server.accessKeys.length),
      affectedKeyCount: server.accessKeys.length,
      affectedUserCount: relatedUsers.length,
      affectedKeys: server.accessKeys.slice(0, 5).map((key) => ({
        id: key.id,
        name: key.name,
      })),
      affectedUsers: relatedUsers.slice(0, 5),
    };
  });

  const timeline = [
    ...alertHistory.map((entry) => ({
      id: `alert-${entry.id}`,
      timestamp: entry.sentAt,
      category: 'alert' as const,
      severity: getSeverityFromEvent(entry.event),
      title: entry.event.replace(/_/g, ' '),
      description: entry.message,
      entity: entry.event.startsWith('SERVER_') ? 'server' : 'key',
      entityId: entry.accessKeyId ?? null,
    })),
    ...auditEntries.map((entry) => ({
      id: `audit-${entry.id}`,
      timestamp: entry.createdAt,
      category: 'audit' as const,
      severity: entry.action === 'AUTH_LOGIN_FAILED' || entry.action === 'AUTH_2FA_FAILED' ? 'warning' as const : 'info' as const,
      title: entry.action.replace(/_/g, ' '),
      description: (() => {
        const details = parseAuditDetails(entry.details);
        if (details?.serverName && typeof details.serverName === 'string') {
          return details.serverName;
        }
        if (details?.email && typeof details.email === 'string') {
          return details.email;
        }
        return entry.entity;
      })(),
      entity: entry.entity.toLowerCase(),
      entityId: entry.entityId ?? null,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 60);

  const criticalOpen = openIncidents.filter((incident) => incident.severity === 'critical').length;
  const affectedKeys = openIncidents.reduce((sum, incident) => sum + incident.affectedKeyCount, 0);
  const affectedUsers = openIncidents.reduce((sum, incident) => sum + incident.affectedUserCount, 0);

  return {
    summary: {
      openIncidents: openIncidents.length,
      criticalOpen,
      recentAlerts: alertHistory.length,
      affectedKeys,
      affectedUsers,
    },
    openIncidents,
    alertHistory: alertHistory.map((entry) => ({
      id: entry.id,
      event: entry.event,
      message: entry.message,
      status: entry.status,
      sentAt: entry.sentAt,
      accessKeyId: entry.accessKeyId,
      severity: getSeverityFromEvent(entry.event),
    })),
    timeline,
  };
}

export async function getIncidentServerDetail(serverId: string, lookbackDays = 30) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: {
      healthCheck: true,
      accessKeys: {
        select: {
          id: true,
          name: true,
          status: true,
          usedBytes: true,
          expiresAt: true,
          email: true,
          owner: true,
          user: {
            select: {
              email: true,
            },
          },
        },
        orderBy: { usedBytes: 'desc' },
      },
    },
  });

  if (!server) {
    return null;
  }

  const [notificationLogs, auditLogs] = await Promise.all([
    db.notificationLog.findMany({
      where: {
        sentAt: {
          gte: since,
        },
        OR: [
          { accessKey: { is: { serverId } } },
          { message: { contains: server.name } },
        ],
      },
      orderBy: { sentAt: 'desc' },
      take: 40,
    }),
    db.auditLog.findMany({
      where: {
        createdAt: {
          gte: since,
        },
        OR: [
          { entity: 'SERVER', entityId: serverId },
          { action: 'SERVER_SYNC_ALL' },
          { action: 'SERVER_REBALANCED' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
  ]);

  const affectedUsers = buildRelatedUsers({
    userEmails: server.accessKeys.map((key) => key.user?.email),
    keyEmails: server.accessKeys.map((key) => key.email),
    keyOwners: server.accessKeys.map((key) => key.owner),
  });

  const timeline = [
    ...(server.healthCheck?.lastCheckedAt
      ? [
          {
            id: `status-${server.id}`,
            timestamp: server.healthCheck.lastCheckedAt,
            category: 'state' as const,
            severity: getSeverityFromStatus(server.healthCheck.lastStatus),
            title: `Current status: ${server.healthCheck.lastStatus}`,
            description:
              server.healthCheck.lastLatencyMs != null
                ? `Last latency ${server.healthCheck.lastLatencyMs} ms`
                : 'Last health check did not return latency.',
          },
        ]
      : []),
    ...notificationLogs.map((entry) => ({
      id: `notification-${entry.id}`,
      timestamp: entry.sentAt,
      category: 'alert' as const,
      severity: getSeverityFromEvent(entry.event),
      title: entry.event.replace(/_/g, ' '),
      description: entry.message,
    })),
    ...auditLogs.map((entry) => ({
      id: `audit-${entry.id}`,
      timestamp: entry.createdAt,
      category: 'audit' as const,
      severity: 'info' as const,
      title: entry.action.replace(/_/g, ' '),
      description: (() => {
        const details = parseAuditDetails(entry.details);
        if (details?.serverName && typeof details.serverName === 'string') {
          return details.serverName;
        }
        return entry.entity;
      })(),
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return {
    server: {
      id: server.id,
      name: server.name,
      countryCode: server.countryCode,
      location: server.location,
      status: server.healthCheck?.lastStatus ?? 'UNKNOWN',
      latencyMs: server.healthCheck?.lastLatencyMs ?? null,
      lastCheckedAt: server.healthCheck?.lastCheckedAt ?? null,
    },
    affectedKeys: server.accessKeys.map((key) => ({
      id: key.id,
      name: key.name,
      status: key.status,
      usedBytes: key.usedBytes.toString(),
      expiresAt: key.expiresAt,
    })),
    affectedUsers,
    timeline,
  };
}
