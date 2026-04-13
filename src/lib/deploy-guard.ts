export const APP_BUILD_COOKIE_NAME = 'atomic-app-build';
export const CLIENT_BUILD_HEADER_NAME = 'x-atomic-client-build';

export function normalizeBuildId(value: string | null | undefined) {
  return value?.trim() || '';
}

export function resolveRequestBuildId(options: {
  headerBuildId?: string | null;
  cookieBuildId?: string | null;
}) {
  const headerBuildId = normalizeBuildId(options.headerBuildId);
  if (headerBuildId) {
    return headerBuildId;
  }

  return normalizeBuildId(options.cookieBuildId);
}

export function shouldRejectStaleServerAction(options: {
  currentBuildId?: string | null;
  headerBuildId?: string | null;
  cookieBuildId?: string | null;
}) {
  const currentBuildId = normalizeBuildId(options.currentBuildId);
  const requestBuildId = resolveRequestBuildId({
    headerBuildId: options.headerBuildId,
    cookieBuildId: options.cookieBuildId,
  });

  return Boolean(currentBuildId && requestBuildId && currentBuildId !== requestBuildId);
}
