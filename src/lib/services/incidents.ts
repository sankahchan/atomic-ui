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

export const incidentSeveritySchemaValues = ['critical', 'warning', 'info'] as const;
export type IncidentSeverity = (typeof incidentSeveritySchemaValues)[number];

export const incidentStatusSchemaValues = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type IncidentStatus = (typeof incidentStatusSchemaValues)[number];

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
    .filter(
      (owner) =>
        !accountUsers.some((entry) => entry.label === owner) &&
        !keyUsers.some((entry) => entry.label === owner),
    )
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

function parseJsonRecord(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeIncidentStatus(status: string): IncidentStatus {
  if (status === 'ACKNOWLEDGED' || status === 'RESOLVED') {
    return status;
  }

  return 'OPEN';
}

async function createIncidentEvent(input: {
  incidentId: string;
  type: string;
  title: string;
  message?: string | null;
  severity?: IncidentSeverity | null;
  details?: Record<string, unknown> | null;
  notificationLogId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
}) {
  await db.incidentEvent.create({
    data: {
      incidentId: input.incidentId,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      severity: input.severity ?? null,
      details: input.details ? JSON.stringify(input.details) : null,
      notificationLogId: input.notificationLogId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
    },
  });
}

async function attachRecentNotificationEvents(incidentId: string, serverId: string, serverName: string, openedAt: Date) {
  const existingLinks = await db.incidentEvent.findMany({
    where: {
      incidentId,
      notificationLogId: {
        not: null,
      },
    },
    select: {
      notificationLogId: true,
    },
  });

  const existingLogIds = new Set(
    existingLinks
      .map((entry) => entry.notificationLogId)
      .filter((entry): entry is string => Boolean(entry)),
  );

  const logs = await db.notificationLog.findMany({
    where: {
      event: {
        in: [...INCIDENT_ALERT_EVENTS],
      },
      sentAt: {
        gte: openedAt,
      },
      OR: [
        { message: { contains: serverName } },
        { accessKey: { is: { serverId } } },
      ],
    },
    orderBy: { sentAt: 'asc' },
    take: 20,
  });

  for (const log of logs) {
    if (existingLogIds.has(log.id)) {
      continue;
    }

    await createIncidentEvent({
      incidentId,
      type: 'NOTIFICATION',
      title: log.event.replace(/_/g, ' '),
      message: log.message,
      severity: getSeverityFromEvent(log.event),
      notificationLogId: log.id,
      details: {
        status: log.status,
        error: log.error,
        channelId: log.channelId,
        sentAt: log.sentAt.toISOString(),
      },
    });
  }
}

export async function syncIncidentState(triggeredBy: 'query' | 'scheduler' = 'query') {
  const [servers, unresolvedIncidents] = await Promise.all([
    db.server.findMany({
      where: {
        isActive: true,
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
    db.incident.findMany({
      where: {
        status: {
          in: ['OPEN', 'ACKNOWLEDGED'],
        },
        sourceType: 'SERVER_HEALTH',
      },
      orderBy: { openedAt: 'desc' },
    }),
  ]);

  const unresolvedByServerId = new Map(unresolvedIncidents.map((incident) => [incident.serverId, incident]));
  const activeIncidentServerIds = new Set<string>();
  const now = new Date();

  for (const server of servers) {
    const healthStatus = server.healthCheck?.lastStatus ?? 'UNKNOWN';
    const hasOpenHealthIncident = healthStatus === 'DOWN' || healthStatus === 'SLOW';

    if (!hasOpenHealthIncident) {
      continue;
    }

    activeIncidentServerIds.add(server.id);

    const relatedUsers = buildRelatedUsers({
      userEmails: server.accessKeys.map((key) => key.user?.email),
      keyEmails: server.accessKeys.map((key) => key.email),
      keyOwners: server.accessKeys.map((key) => key.owner),
    });
    const severity = getSeverityFromStatus(healthStatus);
    const summary = buildIncidentSummary(healthStatus, server.name, server.accessKeys.length);
    const existing = unresolvedByServerId.get(server.id);

    if (!existing) {
      const created = await db.incident.create({
        data: {
          sourceType: 'SERVER_HEALTH',
          serverId: server.id,
          title: `${server.name} ${healthStatus === 'DOWN' ? 'incident' : 'performance incident'}`,
          summary,
          severity,
          status: 'OPEN',
          healthStatus,
          countryCode: server.countryCode,
          affectedKeyCount: server.accessKeys.length,
          affectedUserCount: relatedUsers.length,
          openedAt: server.healthCheck?.lastCheckedAt ?? now,
          lastSeenAt: now,
          metadata: JSON.stringify({
            serverName: server.name,
            latencyMs: server.healthCheck?.lastLatencyMs ?? null,
            triggeredBy,
          }),
        },
      });

      await createIncidentEvent({
        incidentId: created.id,
        type: 'OPENED',
        title: `Incident opened: ${healthStatus}`,
        message: summary,
        severity,
        details: {
          serverId: server.id,
          serverName: server.name,
          latencyMs: server.healthCheck?.lastLatencyMs ?? null,
          affectedKeyCount: server.accessKeys.length,
          affectedUserCount: relatedUsers.length,
          triggeredBy,
        },
      });

      await attachRecentNotificationEvents(created.id, server.id, server.name, created.openedAt);
      continue;
    }

    const patch: Record<string, unknown> = {
      summary,
      severity,
      healthStatus,
      countryCode: server.countryCode,
      affectedKeyCount: server.accessKeys.length,
      affectedUserCount: relatedUsers.length,
      lastSeenAt: now,
      metadata: JSON.stringify({
        serverName: server.name,
        latencyMs: server.healthCheck?.lastLatencyMs ?? null,
        triggeredBy,
      }),
    };

    if (normalizeIncidentStatus(existing.status) === 'RESOLVED') {
      patch.status = 'OPEN';
      patch.resolvedAt = null;
      patch.resolvedByEmail = null;
      patch.resolvedByUserId = null;
    }

    await db.incident.update({
      where: { id: existing.id },
      data: patch,
    });

    if (existing.healthStatus !== healthStatus || existing.severity !== severity || existing.summary !== summary) {
      await createIncidentEvent({
        incidentId: existing.id,
        type: 'STATUS_CHANGED',
        title: `Incident updated: ${healthStatus}`,
        message: summary,
        severity,
        details: {
          previousHealthStatus: existing.healthStatus,
          healthStatus,
          latencyMs: server.healthCheck?.lastLatencyMs ?? null,
          triggeredBy,
        },
      });
    }

    await attachRecentNotificationEvents(existing.id, server.id, server.name, existing.openedAt);
  }

  for (const incident of unresolvedIncidents) {
    if (!incident.serverId || activeIncidentServerIds.has(incident.serverId)) {
      continue;
    }

    await db.incident.update({
      where: { id: incident.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        resolvedByEmail: 'system',
        resolvedByUserId: null,
        lastSeenAt: now,
      },
    });

    await createIncidentEvent({
      incidentId: incident.id,
      type: 'RESOLVED',
      title: 'Incident resolved automatically',
      message: 'Server health recovered and the incident was closed automatically.',
      severity: 'info',
      details: {
        triggeredBy,
      },
      actorEmail: 'system',
    });
  }
}

export async function listIncidentAssignees() {
  const users = await db.user.findMany({
    where: {
      role: 'ADMIN',
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return users;
}

export async function getIncidentCenterOverview(lookbackDays = 14) {
  await syncIncidentState('query');

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const [incidents, alertHistory, auditEntries, assignees] = await Promise.all([
    db.incident.findMany({
      where: {
        OR: [
          {
            status: {
              in: ['OPEN', 'ACKNOWLEDGED'],
            },
          },
          {
            resolvedAt: {
              gte: since,
            },
          },
        ],
      },
      orderBy: [
        {
          status: 'asc',
        },
        {
          openedAt: 'desc',
        },
      ],
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
          { entity: 'INCIDENT' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    listIncidentAssignees(),
  ]);

  const openIncidents = incidents
    .filter((incident) => incident.status !== 'RESOLVED')
    .map((incident) => ({
      id: incident.id,
      serverId: incident.serverId,
      serverName:
        parseJsonRecord(incident.metadata)?.serverName && typeof parseJsonRecord(incident.metadata)?.serverName === 'string'
          ? (parseJsonRecord(incident.metadata)?.serverName as string)
          : incident.title.replace(/ incident$/, ''),
      countryCode: incident.countryCode,
      status: incident.healthStatus ?? 'UNKNOWN',
      severity: incident.severity as IncidentSeverity,
      latencyMs: (() => {
        const metadata = parseJsonRecord(incident.metadata);
        return typeof metadata?.latencyMs === 'number' ? metadata.latencyMs : null;
      })(),
      startedAt: incident.openedAt,
      summary: incident.summary,
      affectedKeyCount: incident.affectedKeyCount,
      affectedUserCount: incident.affectedUserCount,
      assignedUserEmail: incident.assignedUserEmail,
      workflowStatus: normalizeIncidentStatus(incident.status),
      notesPreview: incident.notes ? incident.notes.split('\n').slice(-1)[0] : null,
    }));

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
      severity:
        entry.action === 'AUTH_LOGIN_FAILED' || entry.action === 'AUTH_2FA_FAILED'
          ? ('warning' as const)
          : ('info' as const),
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
  const acknowledgedOpen = openIncidents.filter((incident) => incident.workflowStatus === 'ACKNOWLEDGED').length;

  return {
    summary: {
      openIncidents: openIncidents.length,
      criticalOpen,
      acknowledgedOpen,
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
      channelId: entry.channelId ?? null,
    })),
    timeline,
    assignees,
  };
}

export async function getIncidentDetail(incidentId: string, lookbackDays = 30) {
  await syncIncidentState('query');

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      events: {
        orderBy: { createdAt: 'desc' },
        take: 80,
      },
    },
  });

  if (!incident) {
    return null;
  }

  const server = incident.serverId
    ? await db.server.findUnique({
        where: { id: incident.serverId },
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
      })
    : null;

  const [notificationLogs, auditLogs, channels] = await Promise.all([
    incident.serverId
      ? db.notificationLog.findMany({
          where: {
            sentAt: {
              gte: since,
            },
            OR: [
              { message: { contains: server?.name ?? '' } },
              { accessKey: { is: { serverId: incident.serverId } } },
            ],
          },
          orderBy: { sentAt: 'desc' },
          take: 30,
        })
      : Promise.resolve([]),
    incident.serverId
      ? db.auditLog.findMany({
          where: {
            createdAt: {
              gte: since,
            },
            OR: [
              { entity: 'SERVER', entityId: incident.serverId },
              { action: 'SERVER_SYNC_ALL' },
              { action: 'SERVER_REBALANCED' },
              { entity: 'INCIDENT', entityId: incident.id },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 40,
        })
      : Promise.resolve([]),
    db.notificationChannel.findMany({
      select: {
        id: true,
        name: true,
        type: true,
      },
    }),
  ]);

  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const affectedUsers = server
    ? buildRelatedUsers({
        userEmails: server.accessKeys.map((key) => key.user?.email),
        keyEmails: server.accessKeys.map((key) => key.email),
        keyOwners: server.accessKeys.map((key) => key.owner),
      })
    : [];

  const eventTimeline = incident.events.map((entry) => ({
    id: entry.id,
    timestamp: entry.createdAt,
    category:
      entry.type === 'NOTIFICATION'
        ? ('alert' as const)
        : entry.type === 'OPENED' || entry.type === 'RESOLVED' || entry.type === 'STATUS_CHANGED'
          ? ('state' as const)
          : ('workflow' as const),
    severity: (entry.severity as IncidentSeverity | null) ?? 'info',
    title: entry.title,
    description: entry.message ?? '',
    notificationLogId: entry.notificationLogId,
    actorEmail: entry.actorEmail,
  }));

  const auditTimeline = auditLogs.map((entry) => ({
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
    notificationLogId: null,
    actorEmail: null,
  }));

  return {
    incident: {
      id: incident.id,
      title: incident.title,
      summary: incident.summary,
      severity: incident.severity as IncidentSeverity,
      status: normalizeIncidentStatus(incident.status),
      healthStatus: incident.healthStatus,
      notes: incident.notes,
      openedAt: incident.openedAt,
      lastSeenAt: incident.lastSeenAt,
      acknowledgedAt: incident.acknowledgedAt,
      acknowledgedByEmail: incident.acknowledgedByEmail,
      resolvedAt: incident.resolvedAt,
      resolvedByEmail: incident.resolvedByEmail,
      assignedUserId: incident.assignedUserId,
      assignedUserEmail: incident.assignedUserEmail,
      affectedKeyCount: incident.affectedKeyCount,
      affectedUserCount: incident.affectedUserCount,
    },
    server: server
      ? {
          id: server.id,
          name: server.name,
          countryCode: server.countryCode,
          location: server.location,
          status: server.healthCheck?.lastStatus ?? 'UNKNOWN',
          latencyMs: server.healthCheck?.lastLatencyMs ?? null,
          lastCheckedAt: server.healthCheck?.lastCheckedAt ?? null,
        }
      : null,
    affectedKeys: server
      ? server.accessKeys.map((key) => ({
          id: key.id,
          name: key.name,
          status: key.status,
          usedBytes: key.usedBytes.toString(),
          expiresAt: key.expiresAt,
        }))
      : [],
    affectedUsers,
    notifications: notificationLogs.map((entry) => ({
      id: entry.id,
      event: entry.event,
      message: entry.message,
      status: entry.status,
      error: entry.error,
      sentAt: entry.sentAt,
      channelId: entry.channelId,
      channelName: entry.channelId ? channelById.get(entry.channelId)?.name ?? null : null,
      channelType: entry.channelId ? channelById.get(entry.channelId)?.type ?? null : null,
    })),
    timeline: [...eventTimeline, ...auditTimeline].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    ),
  };
}

async function getIncidentOrThrow(incidentId: string) {
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
  });

  if (!incident) {
    throw new Error('Incident not found');
  }

  return incident;
}

export async function acknowledgeIncident(input: {
  incidentId: string;
  note?: string | null;
  userId: string;
  userEmail: string;
}) {
  const incident = await getIncidentOrThrow(input.incidentId);
  const now = new Date();

  const updated = await db.incident.update({
    where: { id: input.incidentId },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: now,
      acknowledgedByUserId: input.userId,
      acknowledgedByEmail: input.userEmail,
      ...(input.note?.trim()
        ? {
            notes: incident.notes
              ? `${incident.notes}\n\n[${now.toISOString()}] ${input.userEmail}: ${input.note.trim()}`
              : `[${now.toISOString()}] ${input.userEmail}: ${input.note.trim()}`,
          }
        : {}),
    },
  });

  await createIncidentEvent({
    incidentId: input.incidentId,
    type: 'ACKNOWLEDGED',
    title: 'Incident acknowledged',
    message: input.note?.trim() || 'Incident ownership acknowledged.',
    severity: updated.severity as IncidentSeverity,
    actorUserId: input.userId,
    actorEmail: input.userEmail,
  });

  return updated;
}

export async function assignIncident(input: {
  incidentId: string;
  assigneeUserId?: string | null;
  note?: string | null;
  actorUserId: string;
  actorEmail: string;
}) {
  const incident = await getIncidentOrThrow(input.incidentId);
  let assigneeEmail: string | null = null;

  if (input.assigneeUserId) {
    const assignee = await db.user.findUnique({
      where: { id: input.assigneeUserId },
      select: { id: true, email: true },
    });

    if (!assignee) {
      throw new Error('Assignee not found');
    }

    assigneeEmail = assignee.email;
  }

  const updated = await db.incident.update({
    where: { id: input.incidentId },
    data: {
      assignedUserId: input.assigneeUserId ?? null,
      assignedUserEmail: assigneeEmail,
      ...(input.note?.trim()
        ? {
            notes: incident.notes
              ? `${incident.notes}\n\n[${new Date().toISOString()}] ${input.actorEmail}: ${input.note.trim()}`
              : `[${new Date().toISOString()}] ${input.actorEmail}: ${input.note.trim()}`,
          }
        : {}),
    },
  });

  await createIncidentEvent({
    incidentId: input.incidentId,
    type: 'ASSIGNED',
    title: assigneeEmail ? `Assigned to ${assigneeEmail}` : 'Assignment cleared',
    message: input.note?.trim() || null,
    severity: updated.severity as IncidentSeverity,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    details: {
      assigneeUserId: input.assigneeUserId ?? null,
      assigneeEmail,
    },
  });

  return updated;
}

export async function addIncidentNote(input: {
  incidentId: string;
  note: string;
  userId: string;
  userEmail: string;
}) {
  const incident = await getIncidentOrThrow(input.incidentId);
  const now = new Date();
  const nextNotes = incident.notes
    ? `${incident.notes}\n\n[${now.toISOString()}] ${input.userEmail}: ${input.note.trim()}`
    : `[${now.toISOString()}] ${input.userEmail}: ${input.note.trim()}`;

  const updated = await db.incident.update({
    where: { id: input.incidentId },
    data: {
      notes: nextNotes,
    },
  });

  await createIncidentEvent({
    incidentId: input.incidentId,
    type: 'NOTE',
    title: 'Incident note added',
    message: input.note.trim(),
    severity: updated.severity as IncidentSeverity,
    actorUserId: input.userId,
    actorEmail: input.userEmail,
  });

  return updated;
}

export async function resolveIncident(input: {
  incidentId: string;
  note?: string | null;
  userId: string;
  userEmail: string;
}) {
  const incident = await getIncidentOrThrow(input.incidentId);
  const now = new Date();
  const updated = await db.incident.update({
    where: { id: input.incidentId },
    data: {
      status: 'RESOLVED',
      resolvedAt: now,
      resolvedByUserId: input.userId,
      resolvedByEmail: input.userEmail,
      notes: input.note?.trim()
        ? incident.notes
          ? `${incident.notes}\n\n[${now.toISOString()}] ${input.userEmail}: ${input.note.trim()}`
          : `[${now.toISOString()}] ${input.userEmail}: ${input.note.trim()}`
        : incident.notes,
    },
  });

  await createIncidentEvent({
    incidentId: input.incidentId,
    type: 'RESOLVED',
    title: 'Incident resolved',
    message: input.note?.trim() || 'Resolved manually.',
    severity: 'info',
    actorUserId: input.userId,
    actorEmail: input.userEmail,
  });

  return updated;
}

export async function updateIncidentSeverity(input: {
  incidentId: string;
  severity: IncidentSeverity;
  userId: string;
  userEmail: string;
}) {
  const incident = await getIncidentOrThrow(input.incidentId);
  const updated = await db.incident.update({
    where: { id: input.incidentId },
    data: {
      severity: input.severity,
    },
  });

  await createIncidentEvent({
    incidentId: input.incidentId,
    type: 'STATUS_CHANGED',
    title: `Severity changed to ${input.severity}`,
    message: `Severity updated from ${incident.severity} to ${input.severity}.`,
    severity: input.severity,
    actorUserId: input.userId,
    actorEmail: input.userEmail,
  });

  return updated;
}
