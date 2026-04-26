import {
  CLIENT_BUILD_HEADER_NAME,
  CLIENT_BUILD_QUERY_PARAM_NAME,
} from '@/lib/deploy-guard';

export type GuardedFetchArgs = readonly [RequestInfo | URL, RequestInit | undefined];

export function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

export function isSameOriginUrl(url: string, currentHref: string) {
  try {
    return new URL(url, currentHref).origin === new URL(currentHref).origin;
  } catch {
    return false;
  }
}

export function getFetchHeaders(input: RequestInfo | URL, init: RequestInit | undefined) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

export function isNextRouterRscFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  currentHref: string,
) {
  const requestUrl = getRequestUrl(input);
  if (!isSameOriginUrl(requestUrl, currentHref)) {
    return false;
  }

  try {
    if (new URL(requestUrl, currentHref).searchParams.has('_rsc')) {
      return true;
    }
  } catch {
    return false;
  }

  const headers = getFetchHeaders(input, init);
  return headers.has('rsc') || headers.has('next-router-state-tree') || headers.has('next-url');
}

export function buildFetchRequestWithClientBuild(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  buildId: string,
  currentHref: string,
): GuardedFetchArgs {
  if (!buildId) {
    return [input, init] as const;
  }

  const requestUrl = getRequestUrl(input);
  if (!isSameOriginUrl(requestUrl, currentHref)) {
    return [input, init] as const;
  }

  const headers = getFetchHeaders(input, init);
  headers.set(CLIENT_BUILD_HEADER_NAME, buildId);
  return [input, { ...init, headers }] as const;
}

export function buildFormActionWithClientBuild(
  action: string | null | undefined,
  buildId: string,
  currentHref: string,
) {
  const normalizedBuildId = buildId.trim();
  if (!normalizedBuildId) {
    return action ?? null;
  }

  const requestUrl = action?.trim() || currentHref;
  if (!isSameOriginUrl(requestUrl, currentHref)) {
    return action ?? null;
  }

  try {
    const url = new URL(requestUrl, currentHref);
    url.searchParams.set(CLIENT_BUILD_QUERY_PARAM_NAME, normalizedBuildId);
    return url.toString();
  } catch {
    return action ?? null;
  }
}
