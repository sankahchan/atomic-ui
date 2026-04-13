import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { snapshotTraffic } from '@/lib/services/analytics';
import { checkExpirations } from '@/lib/services/expiration';
import { checkBandwidthAlerts } from '@/lib/services/bandwidth-alerts';
import { getRequestIpFromHeaders, writeAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET;

    let user = null;
    const hasValidSecret = !!expectedSecret && cronSecret === expectedSecret;

    if (expectedSecret) {
      if (!hasValidSecret) {
        user = await getCurrentUser();
        if (!user || user.role !== 'ADMIN') {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }
    } else {
      user = await getCurrentUser();
      if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const trafficSnapshot = await snapshotTraffic();
    const expirationResult = await checkExpirations();
    const bandwidthResult = await checkBandwidthAlerts();

    await writeAuditLog({
      userId: user?.id ?? null,
      ip: getRequestIpFromHeaders(request.headers),
      action: 'MAINTENANCE_RUN',
      entity: 'TASK',
      entityId: 'check-expirations',
      details: {
        triggeredBy: hasValidSecret ? 'cron' : 'admin',
        trafficSnapshots: trafficSnapshot.success,
        trafficSnapshotFailures: trafficSnapshot.failed,
        expiredKeys: expirationResult.expiredKeys,
        depletedKeys: expirationResult.depletedKeys,
        archivedKeys: expirationResult.archivedKeys,
        alertsSentTotal: bandwidthResult.alertsSentTotal,
        alertsSentByThreshold: bandwidthResult.alertsSentByThreshold,
        pendingAlertsTotal: bandwidthResult.pendingAlertsTotal,
        pendingAlertsByThreshold: bandwidthResult.pendingAlertsByThreshold,
        autoDisabled: bandwidthResult.autoDisabled,
      },
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        trafficSnapshots: trafficSnapshot.success,
        trafficSnapshotFailures: trafficSnapshot.failed,
        expiredKeys: expirationResult.expiredKeys,
        depletedKeys: expirationResult.depletedKeys,
        archivedKeys: expirationResult.archivedKeys,
        alertsSentTotal: bandwidthResult.alertsSentTotal,
        alertsSentByThreshold: bandwidthResult.alertsSentByThreshold,
        pendingAlertsTotal: bandwidthResult.pendingAlertsTotal,
        pendingAlertsByThreshold: bandwidthResult.pendingAlertsByThreshold,
        autoDisabled: bandwidthResult.autoDisabled,
        errors: [
          ...trafficSnapshot.errors,
          ...expirationResult.errors,
          ...bandwidthResult.errors,
        ],
      },
    });
  } catch (error) {
    console.error('Expiration check error:', error);
    return NextResponse.json(
      { error: 'Expiration check failed', details: String(error) },
      { status: 500 }
    );
  }
}
