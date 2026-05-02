import { createHash, randomUUID } from 'crypto';
import { db } from '@/lib/db';

export const DEVICE_INSTALL_QUERY_PARAM = 'device';
export const DEVICE_INSTALL_TOKEN_MIN_LENGTH = 12;
export const DEVICE_INSTALL_TOKEN_MAX_LENGTH = 200;
export const DEVICE_INSTALL_TOKEN_REQUIRED_CODE = 'DEVICE_TOKEN_REQUIRED';
export const DEVICE_INSTALL_LIMIT_REACHED_CODE = 'DEVICE_LIMIT_FULL';

export type DeviceInstallClaimResult =
  | {
      ok: true;
      created: boolean;
      claimedDevices: number;
      maxDevices: number;
    }
  | {
      ok: false;
      code: typeof DEVICE_INSTALL_TOKEN_REQUIRED_CODE | typeof DEVICE_INSTALL_LIMIT_REACHED_CODE;
      claimedDevices: number;
      maxDevices: number;
    };

type ClaimInput = {
  accessKeyId?: string | null;
  dynamicAccessKeyId?: string | null;
  deviceToken?: string | null;
  maxDevices: number;
  platform?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  now?: Date;
};

export function normalizeDeviceInstallToken(token?: string | null) {
  const value = token?.trim();
  if (!value) {
    return null;
  }

  if (value.length < DEVICE_INSTALL_TOKEN_MIN_LENGTH || value.length > DEVICE_INSTALL_TOKEN_MAX_LENGTH) {
    return null;
  }

  return value;
}

export function generateDeviceInstallToken() {
  return randomUUID();
}

export function hashDeviceInstallToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function shouldUseBoundDeviceInstalls(input: {
  maxDevices?: number | null;
  boundDeviceInstallsOnly?: boolean | null;
}) {
  return Boolean(input.boundDeviceInstallsOnly && input.maxDevices && input.maxDevices > 0);
}

export function appendDeviceInstallToken(url: string, deviceToken?: string | null) {
  const normalizedToken = normalizeDeviceInstallToken(deviceToken);
  if (!normalizedToken) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set(DEVICE_INSTALL_QUERY_PARAM, normalizedToken);
  return parsed.toString();
}

async function claimDeviceInstall(input: ClaimInput): Promise<DeviceInstallClaimResult> {
  const normalizedToken = normalizeDeviceInstallToken(input.deviceToken);
  const now = input.now ?? new Date();

  if (!normalizedToken) {
    return {
      ok: false,
      code: DEVICE_INSTALL_TOKEN_REQUIRED_CODE,
      claimedDevices: 0,
      maxDevices: input.maxDevices,
    };
  }

  const whereParent =
    input.accessKeyId
      ? { accessKeyId: input.accessKeyId }
      : { dynamicAccessKeyId: input.dynamicAccessKeyId ?? undefined };

  const tokenHash = hashDeviceInstallToken(normalizedToken);

  return db.$transaction(async (tx) => {
    const existing = await tx.deviceInstallClaim.findFirst({
      where: {
        ...whereParent,
        deviceTokenHash: tokenHash,
        revokedAt: null,
      },
    });

    const claimedDevices = await tx.deviceInstallClaim.count({
      where: {
        ...whereParent,
        revokedAt: null,
      },
    });

    if (existing) {
      await tx.deviceInstallClaim.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          lastIp: input.ip ?? existing.lastIp,
          platform: input.platform ?? existing.platform,
          userAgent: input.userAgent ?? existing.userAgent,
        },
      });

      return {
        ok: true,
        created: false,
        claimedDevices,
        maxDevices: input.maxDevices,
      };
    }

    if (claimedDevices >= input.maxDevices) {
      return {
        ok: false,
        code: DEVICE_INSTALL_LIMIT_REACHED_CODE,
        claimedDevices,
        maxDevices: input.maxDevices,
      };
    }

    await tx.deviceInstallClaim.create({
      data: {
        accessKeyId: input.accessKeyId ?? null,
        dynamicAccessKeyId: input.dynamicAccessKeyId ?? null,
        deviceTokenHash: tokenHash,
        platform: input.platform ?? null,
        userAgent: input.userAgent ?? null,
        firstIp: input.ip ?? null,
        lastIp: input.ip ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });

    return {
      ok: true,
      created: true,
      claimedDevices: claimedDevices + 1,
      maxDevices: input.maxDevices,
    };
  });
}

export async function claimAccessKeyDeviceInstall(input: Omit<ClaimInput, 'dynamicAccessKeyId'>) {
  return claimDeviceInstall({
    ...input,
    accessKeyId: input.accessKeyId,
    dynamicAccessKeyId: null,
  });
}

export async function claimDynamicKeyDeviceInstall(input: Omit<ClaimInput, 'accessKeyId'>) {
  return claimDeviceInstall({
    ...input,
    accessKeyId: null,
    dynamicAccessKeyId: input.dynamicAccessKeyId,
  });
}
