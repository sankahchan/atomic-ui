import { db } from '@/lib/db';

export const ADMIN_REQUIRE_2FA_SETTING_KEY = 'auth_require_admin_2fa';

export interface UserSecondFactorSummary {
  totpEnabled: boolean;
  webAuthnEnabled: boolean;
  webAuthnCount: number;
  has2FA: boolean;
}

export interface Admin2FAPolicyUserSummary extends UserSecondFactorSummary {
  id: string;
  email: string;
}

export interface Admin2FAPolicyOverview {
  required: boolean;
  adminCount: number;
  protectedAdminCount: number;
  unprotectedAdmins: Admin2FAPolicyUserSummary[];
  canEnable: boolean;
}

function parseBooleanSetting(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'boolean') return parsed;
    if (parsed && typeof parsed === 'object' && 'required' in parsed) {
      return Boolean((parsed as { required?: unknown }).required);
    }
  } catch {
    return value === 'true';
  }
  return false;
}

export async function isAdmin2FARequired(): Promise<boolean> {
  const setting = await db.settings.findUnique({
    where: { key: ADMIN_REQUIRE_2FA_SETTING_KEY },
    select: { value: true },
  });

  return parseBooleanSetting(setting?.value);
}

export async function setAdmin2FARequired(required: boolean): Promise<void> {
  await db.settings.upsert({
    where: { key: ADMIN_REQUIRE_2FA_SETTING_KEY },
    update: { value: JSON.stringify({ required }) },
    create: { key: ADMIN_REQUIRE_2FA_SETTING_KEY, value: JSON.stringify({ required }) },
  });
}

export async function getUserSecondFactorSummary(userId: string): Promise<UserSecondFactorSummary> {
  const [totp, webAuthnCount] = await Promise.all([
    db.totpSecret.findUnique({
      where: { userId },
      select: { verified: true },
    }),
    db.webAuthnCredential.count({
      where: { userId },
    }),
  ]);

  const totpEnabled = Boolean(totp?.verified);
  const webAuthnEnabled = webAuthnCount > 0;

  return {
    totpEnabled,
    webAuthnEnabled,
    webAuthnCount,
    has2FA: totpEnabled || webAuthnEnabled,
  };
}

export async function getAdmin2FAPolicyOverview(): Promise<Admin2FAPolicyOverview> {
  const [required, admins, totpRecords, webAuthnUsers] = await Promise.all([
    isAdmin2FARequired(),
    db.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
      },
      orderBy: { email: 'asc' },
    }),
    db.totpSecret.findMany({
      where: { verified: true },
      select: { userId: true },
    }),
    db.webAuthnCredential.findMany({
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  const totpUserIds = new Set(totpRecords.map((entry) => entry.userId));
  const webAuthnUserIds = new Set(webAuthnUsers.map((entry) => entry.userId));

  const adminEntries: Admin2FAPolicyUserSummary[] = admins.map((admin) => {
    const totpEnabled = totpUserIds.has(admin.id);
    const webAuthnEnabled = webAuthnUserIds.has(admin.id);
    return {
      id: admin.id,
      email: admin.email,
      has2FA: totpEnabled || webAuthnEnabled,
      totpEnabled,
      webAuthnEnabled,
      webAuthnCount: webAuthnEnabled ? 1 : 0,
    };
  });

  const unprotectedAdmins = adminEntries.filter((admin) => !admin.has2FA);

  return {
    required,
    adminCount: adminEntries.length,
    protectedAdminCount: adminEntries.filter((admin) => admin.has2FA).length,
    unprotectedAdmins,
    canEnable: unprotectedAdmins.length === 0,
  };
}

export async function canRemoveAdminSecondFactor(params: {
  userId: string;
  role: string;
  removeTotp?: boolean;
  removeWebAuthnCount?: number;
}) {
  const { userId, role, removeTotp = false, removeWebAuthnCount = 0 } = params;

  if (role !== 'ADMIN') {
    return { allowed: true as const };
  }

  const required = await isAdmin2FARequired();
  if (!required) {
    return { allowed: true as const };
  }

  const summary = await getUserSecondFactorSummary(userId);
  const remainingTotp = removeTotp ? false : summary.totpEnabled;
  const remainingWebAuthnCount = Math.max(0, summary.webAuthnCount - removeWebAuthnCount);
  const remainingHas2FA = remainingTotp || remainingWebAuthnCount > 0;

  if (remainingHas2FA) {
    return { allowed: true as const };
  }

  return {
    allowed: false as const,
    reason: 'Admin two-factor policy requires at least one second factor. Add another factor before removing the last one.',
  };
}
