import { db } from '@/lib/db';
import { validateProductionEnvironment } from '@/lib/services/production-validation';

type StepStatus = 'complete' | 'attention' | 'warning' | 'pending';

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
