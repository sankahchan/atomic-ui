import { NextResponse } from 'next/server';
import { getAppBuildInfo } from '@/lib/app-build';

export const dynamic = 'force-dynamic';
const APP_BUILD_COOKIE_NAME = 'atomic-app-build';

export async function GET() {
  const buildInfo = getAppBuildInfo();
  const response = NextResponse.json(buildInfo, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });

  if (buildInfo.buildId && buildInfo.buildId !== 'unknown') {
    response.cookies.set(APP_BUILD_COOKIE_NAME, buildInfo.buildId, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
