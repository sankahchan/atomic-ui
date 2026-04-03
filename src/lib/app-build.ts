import fs from 'node:fs';
import path from 'node:path';

export type AppBuildInfo = {
  buildId: string;
  builtAt: string | null;
};

function resolveBuildIdCandidates() {
  const cwd = process.cwd();
  return [
    path.join(cwd, '.next', 'BUILD_ID'),
    path.join(cwd, '.next', 'standalone', '.next', 'BUILD_ID'),
    path.join(cwd, '.next', 'standalone', 'BUILD_ID'),
  ];
}

export function getAppBuildInfo(): AppBuildInfo {
  for (const candidate of resolveBuildIdCandidates()) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      const buildId = fs.readFileSync(candidate, 'utf8').trim();
      const stat = fs.statSync(candidate);
      return {
        buildId: buildId || 'unknown',
        builtAt: Number.isFinite(stat.mtimeMs) ? new Date(stat.mtimeMs).toISOString() : null,
      };
    } catch {
      continue;
    }
  }

  return {
    buildId:
      process.env.NEXT_PUBLIC_APP_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.npm_package_version ||
      'unknown',
    builtAt: null,
  };
}
