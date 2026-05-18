import { NextResponse } from 'next/server';
import { getAppBuildInfo } from '@/lib/app-build';

export const dynamic = 'force-dynamic';

export async function GET() {
  const buildInfo = getAppBuildInfo();
  return NextResponse.json(buildInfo, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
