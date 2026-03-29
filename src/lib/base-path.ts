function normalizeBasePath(value?: string | null) {
  if (!value) {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

export function getBasePath() {
  return normalizeBasePath(
    process.env.NEXT_PUBLIC_BASE_PATH ||
      process.env.NEXT_PUBLIC_PANEL_PATH ||
      process.env.PANEL_PATH ||
      '',
  );
}

export function withBasePath(path: string) {
  const basePath = getBasePath();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${basePath}${normalizedPath}`;
}
