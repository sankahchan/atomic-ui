export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
