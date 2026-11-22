import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  findLinkedAccessKeys,
  findLinkedDynamicAccessKeys,
} from '@/lib/services/telegram-keys';
import { getTelegramConfig, getTelegramSupportLink } from '@/lib/services/telegram-runtime';
import { verifyTelegramWebAppSession } from '@/lib/telegram-webapp-auth';

export const runtime = 'nodejs';

function readBearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function GET(request: Request) {
  const token = readBearerToken(request);
  const identity = token ? await verifyTelegramWebAppSession(token) : null;
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const chatId = identity.chatId ?? identity.telegramUserId;
  const [accessKeys, dynamicKeys, supportUrl, config] = await Promise.all([
    findLinkedAccessKeys(chatId, identity.telegramUserId, false),
    findLinkedDynamicAccessKeys(chatId, identity.telegramUserId, false),
    getTelegramSupportLink(),
    getTelegramConfig(),
  ]);

  const keys = [
    ...accessKeys.map((key) => ({
      id: key.id,
      kind: 'normal' as const,
      name: key.name,
      status: key.status,
      serverName: key.server?.name ?? null,
      usedBytes: key.usedBytes.toString(),
      dataLimitBytes: key.dataLimitBytes ? key.dataLimitBytes.toString() : null,
      expiresAt: toIso(key.expiresAt),
      hasSharePage: Boolean(key.publicSlug || key.subscriptionToken),
    })),
    ...dynamicKeys.map((key) => ({
      id: key.id,
      kind: 'dynamic' as const,
      name: key.name,
      status: key.status,
      serverName: key.accessKeys[0]?.server?.name ?? null,
      usedBytes: key.usedBytes.toString(),
      dataLimitBytes: key.dataLimitBytes ? key.dataLimitBytes.toString() : null,
      expiresAt: toIso(key.expiresAt),
      hasSharePage: Boolean(key.publicSlug || key.dynamicUrl),
    })),
  ];

  const profile = await db.telegramUserProfile.findUnique({
    where: { telegramUserId: String(identity.telegramUserId) },
    select: { locale: true },
  });

  return NextResponse.json(
    {
      locale: profile?.locale || identity.locale || 'en',
      supportUrl,
      botUsername: config?.botUsername ? config.botUsername.replace(/^@/, '') : null,
      keys,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
