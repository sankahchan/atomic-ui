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
  const hashIndex = accessUrl.indexOf('#');
  const cutIndex =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);
  const sanitizedUrl = cutIndex === -1 ? accessUrl : accessUrl.slice(0, cutIndex);

  const schemeIndex = sanitizedUrl.indexOf('://');
  const firstPathIndex = sanitizedUrl.indexOf('/', schemeIndex + 3);
  const base = firstPathIndex === -1 ? sanitizedUrl : sanitizedUrl.slice(0, firstPathIndex);

  return `${base}/#${encodeURIComponent(suffix)}`;
}
