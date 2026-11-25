import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  findLinkedAccessKeys,
  findLinkedDynamicAccessKeys,
} from '@/lib/services/telegram-keys';
import { getTelegramConfig, getTelegramSupportLink } from '@/lib/services/telegram-runtime';
import { authorizeWebAppToken } from '@/lib/magic-link-auth';

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
  const auth = token ? await authorizeWebAppToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (auth.type === 'magic') {
    const [supportUrl, config] = await Promise.all([
      getTelegramSupportLink(),
      getTelegramConfig(),
    ]);
    const keys: Array<{
      id: string;
      kind: 'normal' | 'dynamic';
      name: string;
      status: string;
      serverName: string | null;
      usedBytes: string;
      dataLimitBytes: string | null;
      expiresAt: string | null;
      hasSharePage: boolean;
    }> = [];

    if (auth.claims.kind === 'normal') {
      const key = await db.accessKey.findUnique({
        where: { id: auth.claims.keyId },
        select: {
          id: true,
          name: true,
          status: true,
          usedBytes: true,
          dataLimitBytes: true,
          expiresAt: true,
          publicSlug: true,
          subscriptionToken: true,
          server: { select: { name: true } },
        },
      });
      if (key) {
        keys.push({
          id: key.id,
          kind: 'normal',
          name: key.name,
          status: key.status,
          serverName: key.server?.name ?? null,
          usedBytes: key.usedBytes.toString(),
          dataLimitBytes: key.dataLimitBytes?.toString() ?? null,
          expiresAt: toIso(key.expiresAt),
          hasSharePage: Boolean(key.publicSlug || key.subscriptionToken),
        });
      }
    } else {
      const key = await db.dynamicAccessKey.findUnique({
        where: { id: auth.claims.keyId },
        select: {
          id: true,
          name: true,
          status: true,
          usedBytes: true,
          dataLimitBytes: true,
          expiresAt: true,
          publicSlug: true,
          dynamicUrl: true,
          accessKeys: { take: 1, select: { server: { select: { name: true } } } },
        },
      });
      if (key) {
        keys.push({
          id: key.id,
          kind: 'dynamic',
          name: key.name,
          status: key.status,
          serverName: key.accessKeys[0]?.server?.name ?? null,
          usedBytes: key.usedBytes.toString(),
          dataLimitBytes: key.dataLimitBytes?.toString() ?? null,
          expiresAt: toIso(key.expiresAt),
          hasSharePage: Boolean(key.publicSlug || key.dynamicUrl),
        });
      }
    }

    return NextResponse.json(
      {
        locale: auth.claims.locale,
        supportUrl,
        botUsername: config?.botUsername ? config.botUsername.replace(/^@/, '') : null,
        keys,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const identity = auth.identity;
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
