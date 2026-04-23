import { coerceSupportedLocale } from '@/lib/i18n/config';

const DEFAULT_LOCAL_ORIGIN = 'http://localhost:3000';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeOrigin(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return trimTrailingSlash(new URL(normalized).origin);
  } catch {
    return null;
  }
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
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.APP_URL) ||
    normalizeOrigin(fallbackOrigin) ||
    DEFAULT_LOCAL_ORIGIN;

  return trimTrailingSlash(configuredOrigin);
}

export function getConfiguredPublicAppOrigin() {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.APP_URL) ||
    null
  );
}

export function getPublicShareOrigin(fallbackOrigin?: string | null) {
  const configuredOrigin =
    normalizeOrigin(process.env.NEXT_PUBLIC_PUBLIC_SHARE_URL) ||
    normalizeOrigin(process.env.PUBLIC_SHARE_URL) ||
    getPublicAppOrigin(fallbackOrigin);

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
    lang?: string | null;
  },
) {
  const url = new URL(`${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/sub/${token}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  const locale = coerceSupportedLocale(options?.lang);
  if (locale) {
    url.searchParams.set('lang', locale);
  }

  return url.toString();
}

export function buildShortShareUrl(
  slug: string,
  options?: {
    origin?: string | null;
    source?: string | null;
    lang?: string | null;
  },
) {
  const url = new URL(`${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/s/${slug}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  const locale = coerceSupportedLocale(options?.lang);
  if (locale) {
    url.searchParams.set('lang', locale);
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
  const url = new URL(
    `${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/api/subscription/${token}`,
  );

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  return url.toString();
}

export function buildSubscriptionClientUrl(
  tokenOrSlug: string,
  name?: string | null,
  options?: {
    origin?: string | null;
    source?: string | null;
    shortPath?: boolean;
  },
) {
  const subscriptionUrl = options?.shortPath
    ? buildShortClientUrl(tokenOrSlug, options)
    : buildSubscriptionApiUrl(tokenOrSlug, options);
  const normalizedUrl = subscriptionUrl
    .replace(/^ssconf:\/\//, '')
    .replace(/^https?:\/\//, '');
  const suffix = (name || 'Access Key').trim();

  return `ssconf://${normalizedUrl}#${encodeURIComponent(suffix)}`;
}

export function buildShortClientUrl(
  slug: string,
  options?: {
    origin?: string | null;
    source?: string | null;
  },
) {
  const url = new URL(`${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/c/${slug}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  return url.toString();
}

export function buildDynamicSubscriptionApiUrl(
  token: string,
  options?: {
    origin?: string | null;
    source?: string | null;
  },
) {
  const url = new URL(`${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/api/sub/${token}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  return url.toString();
}

export function buildDynamicOutlineUrl(
  token: string,
  name?: string | null,
  options?: {
    origin?: string | null;
    source?: string | null;
    shortPath?: boolean;
  },
) {
  const subscriptionUrl = options?.shortPath
    ? buildDynamicShortClientUrl(token, options)
    : buildDynamicSubscriptionApiUrl(token, options);
  const normalizedUrl = subscriptionUrl
    .replace(/^ssconf:\/\//, '')
    .replace(/^https?:\/\//, '');
  const suffix = (name || 'Dynamic Key').trim();

  return `ssconf://${normalizedUrl}#${encodeURIComponent(suffix)}`;
}

export function buildDynamicDistributionLinkUrl(
  token: string,
  options?: {
    origin?: string | null;
    source?: string | null;
    lang?: string | null;
  },
) {
  const url = new URL(`${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/share/${token}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  const locale = coerceSupportedLocale(options?.lang);
  if (locale) {
    url.searchParams.set('lang', locale);
  }

  return url.toString();
}

export function buildAccessDistributionLinkUrl(
  token: string,
  options?: {
    origin?: string | null;
    source?: string | null;
    lang?: string | null;
  },
) {
  const url = new URL(`${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/share/${token}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  const locale = coerceSupportedLocale(options?.lang);
  if (locale) {
    url.searchParams.set('lang', locale);
  }

  return url.toString();
}

export function buildDynamicSharePageUrl(
  token: string,
  options?: {
    origin?: string | null;
    source?: string | null;
    lang?: string | null;
  },
) {
  const url = new URL(`${getPublicShareOrigin(options?.origin)}${getPublicBasePath()}/sub/${token}`);

  if (options?.source) {
    url.searchParams.set('source', options.source);
  }

  const locale = coerceSupportedLocale(options?.lang);
  if (locale) {
    url.searchParams.set('lang', locale);
  }

  return url.toString();
}

export function buildDynamicShortShareUrl(
  slug: string,
  options?: {
    origin?: string | null;
    source?: string | null;
    lang?: string | null;
  },
) {
  return buildShortShareUrl(slug, options);
}

export function buildDynamicShortClientUrl(
  slug: string,
  options?: {
    origin?: string | null;
    source?: string | null;
  },
) {
  return buildShortClientUrl(slug, options);
}
