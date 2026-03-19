const DEFAULT_LOCAL_ORIGIN = 'http://localhost:3000';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeBasePath(value: string) {
  if (!value) {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return trimTrailingSlash(withLeadingSlash);
}

export function getPublicAppOrigin(fallbackOrigin?: string | null) {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    fallbackOrigin ||
    DEFAULT_LOCAL_ORIGIN;

  return trimTrailingSlash(configuredOrigin);
}

export function getPublicBasePath() {
  return normalizeBasePath(
    process.env.NEXT_PUBLIC_BASE_PATH ||
      process.env.NEXT_PUBLIC_PANEL_PATH ||
      process.env.PANEL_PATH ||
      '',
  );
}

export function buildSharePageUrl(
  token: string,
  options?: {
    origin?: string | null;
    source?: string | null;
  },
) {
  const url = new URL(`${getPublicAppOrigin(options?.origin)}${getPublicBasePath()}/sub/${token}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  return url.toString();
}

export function buildSubscriptionApiUrl(
  token: string,
  options?: {
    origin?: string | null;
    source?: string | null;
  },
) {
  const url = new URL(`${getPublicAppOrigin(options?.origin)}${getPublicBasePath()}/api/subscription/${token}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  return url.toString();
}
