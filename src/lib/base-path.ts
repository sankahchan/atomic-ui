function normalizeBasePath(value?: string | null) {
  if (!value) {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function normalizeOrigin(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
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

export function getAppOrigin() {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.APP_URL) ||
    normalizeOrigin(process.env.NEXTAUTH_URL) ||
    'http://localhost:3000'
  );
}

export function withAbsoluteBasePath(path: string) {
  return `${getAppOrigin()}${withBasePath(path)}`;
}
