export const ADMIN_SCOPE_VALUES = ['OWNER', 'ADMIN', 'FINANCE', 'SUPPORT'] as const;

export type AdminScope = (typeof ADMIN_SCOPE_VALUES)[number];

export function normalizeAdminScope(value?: string | null): AdminScope | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return ADMIN_SCOPE_VALUES.includes(normalized as AdminScope)
    ? (normalized as AdminScope)
    : null;
}

export function getAdminScopeLabel(scope?: string | null) {
  const normalized = normalizeAdminScope(scope);
  switch (normalized) {
    case 'OWNER':
      return 'Owner';
    case 'ADMIN':
      return 'Admin';
    case 'FINANCE':
      return 'Finance';
    case 'SUPPORT':
      return 'Support';
    default:
      return 'Unassigned';
  }
}

export function hasFinanceManageScope(scope?: string | null) {
  const normalized = normalizeAdminScope(scope);
  return normalized === 'OWNER' || normalized === 'FINANCE';
}

export function hasFinanceConfigureScope(scope?: string | null) {
  return normalizeAdminScope(scope) === 'OWNER';
}

export function isOwnerLikeAdmin(scope?: string | null) {
  return normalizeAdminScope(scope) === 'OWNER';
}

function isOwnerOrAdminScope(scope?: string | null) {
  const normalized = normalizeAdminScope(scope);
  return normalized === 'OWNER' || normalized === 'ADMIN';
}

export function hasNotificationViewScope(scope?: string | null) {
  return Boolean(normalizeAdminScope(scope));
}

export function hasNotificationManageScope(scope?: string | null) {
  return isOwnerOrAdminScope(scope);
}

export function hasOutageManageScope(scope?: string | null) {
  return isOwnerOrAdminScope(scope);
}

export function hasTelegramReviewManageScope(scope?: string | null) {
  const normalized = normalizeAdminScope(scope);
  return normalized === 'OWNER' || normalized === 'ADMIN' || normalized === 'SUPPORT';
}

export function hasTelegramAnnouncementManageScope(scope?: string | null) {
  return isOwnerOrAdminScope(scope);
}

export function hasKeyManageScope(scope?: string | null) {
  return isOwnerOrAdminScope(scope);
}

export function hasUserManageScope(scope?: string | null) {
  return isOwnerLikeAdmin(scope);
}

export function hasBackupManageScope(scope?: string | null) {
  return isOwnerLikeAdmin(scope);
}

export function hasRestoreManageScope(scope?: string | null) {
  return isOwnerLikeAdmin(scope);
}

export function hasKeyExportScope(scope?: string | null) {
  return hasKeyManageScope(scope);
}

export function hasReportDownloadScope(scope?: string | null) {
  return hasFinanceManageScope(scope);
}
