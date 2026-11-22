import { NextResponse } from 'next/server';
import { getTelegramConfig } from '@/lib/services/telegram-runtime';
import {
  createTelegramWebAppSession,
  TELEGRAM_WEBAPP_SESSION_TTL_SECONDS,
  verifyTelegramWebAppInitData,
} from '@/lib/telegram-webapp-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { initData?: unknown };
  try {
    body = (await request.json()) as { initData?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const initData = typeof body.initData === 'string' ? body.initData.trim() : '';
  if (!initData) {
    return NextResponse.json({ error: 'Missing Telegram Web App initData' }, { status: 400 });
  }

  const config = await getTelegramConfig();
  if (!config?.botToken) {
    return NextResponse.json({ error: 'Telegram bot is not configured' }, { status: 503 });
  }

  let identity;
  try {
    identity = verifyTelegramWebAppInitData(initData, config.botToken);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid Telegram Web App data' },
      { status: 401 },
    );
  }

  const token = await createTelegramWebAppSession(identity);

  return NextResponse.json(
    {
      token,
      expiresIn: TELEGRAM_WEBAPP_SESSION_TTL_SECONDS,
      identity: {
        username: identity.username ?? null,
        locale: identity.locale ?? null,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
