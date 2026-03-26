export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_PUBLIC_SLUGS = new Set([
  '_next',
  'admin',
  'api',
  'auth',
  'c',
  'dashboard',
  'favicon',
  'favicon-ico',
  'health',
  'health-check',
  'incidents',
  'login',
  'logout',
  'panel',
  'portal',
  'robots',
  'robots-txt',
  's',
  'settings',
  'share',
  'sub',
  'support',
  'tasks',
  'telegram',
  'uploads',
  'verify-2fa',
  'webhook',
]);

export function normalizePublicSlug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

export function slugifyPublicName(value: string) {
  const normalized = normalizePublicSlug(value);
  return normalized || 'key';
}

export function isValidPublicSlug(value: string) {
  return PUBLIC_SLUG_PATTERN.test(value);
}

export function isReservedPublicSlug(value: string) {
  const normalized = normalizePublicSlug(value);
  return RESERVED_PUBLIC_SLUGS.has(normalized);
}

export function buildPublicSlugSuggestionCandidates(value: string, limit = 10) {
  const base = slugifyPublicName(value);
  const now = new Date();
  const yearSuffix = String(now.getFullYear()).slice(-2);
  const rawCandidates = [
    base,
    `${base}-vpn`,
    `${base}-link`,
    `${base}-access`,
    `${base}-share`,
    `${base}-01`,
    `${base}-${yearSuffix}`,
    `${base}-go`,
    `${base}-plus`,
    `${base}-direct`,
  ];

  const results: string[] = [];
  for (const candidate of rawCandidates) {
    const normalized = normalizePublicSlug(candidate);
    if (!normalized || !isValidPublicSlug(normalized) || isReservedPublicSlug(normalized)) {
      continue;
    }

    if (!results.includes(normalized)) {
      results.push(normalized);
    }

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
