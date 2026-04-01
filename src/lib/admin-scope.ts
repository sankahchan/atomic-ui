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
      return 'Owner';
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
  const normalized = normalizeAdminScope(scope);
  return normalized === null || normalized === 'OWNER';
}
