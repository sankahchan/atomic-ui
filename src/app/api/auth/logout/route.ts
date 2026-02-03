import { NextResponse } from 'next/server';
import { clearSessionCookie, getSessionToken, invalidateSession } from '@/lib/auth';

export async function POST() {
  const token = await getSessionToken();
  if (token) {
    await invalidateSession(token);
  }

  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
