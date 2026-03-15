export function decorateOutlineAccessUrl(
  accessUrl: string | null | undefined,
  keyName?: string | null,
): string | null {
  if (!accessUrl) {
    return null;
  }

  const rawName = keyName?.trim();
  if (!rawName) {
    return accessUrl;
  }

  const suffix = rawName.replace(/^\/+|\/+$/g, '');
  if (!suffix) {
    return accessUrl;
  }

  const queryIndex = accessUrl.indexOf('?');
  const withoutQuery = queryIndex === -1 ? accessUrl : accessUrl.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : accessUrl.slice(queryIndex);

  const schemeIndex = withoutQuery.indexOf('://');
  const firstPathIndex = withoutQuery.indexOf('/', schemeIndex + 3);
  const base = firstPathIndex === -1 ? withoutQuery : withoutQuery.slice(0, firstPathIndex);

  return `${base}/${encodeURIComponent(suffix)}${query}`;
}
