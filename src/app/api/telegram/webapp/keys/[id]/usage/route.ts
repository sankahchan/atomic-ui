import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  findLinkedAccessKeys,
  findLinkedDynamicAccessKeys,
} from '@/lib/services/telegram-keys';
import { authorizeWebAppToken } from '@/lib/magic-link-auth';
import { bucketDailyUsage, getUsageDayKeys } from '../self-service';

export const runtime = 'nodejs';

function readBearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = readBearerToken(request);
  const auth = token ? await authorizeWebAppToken(token) : null;
  if (!auth) {
    return jsonError('Unauthorized', 401);
  }

  const range = new URL(request.url).searchParams.get('range') || '7d';
  const days = range === '7d' ? 7 : range === '30d' ? 30 : null;
  if (!days) {
    return jsonError('Unsupported usage range', 400);
  }

  let keyType: 'ACCESS_KEY' | 'DYNAMIC_KEY';

  if (auth.type === 'magic') {
    if (auth.claims.keyId !== id) {
      return jsonError('Key not found', 404);
    }
    keyType = auth.claims.kind === 'normal' ? 'ACCESS_KEY' : 'DYNAMIC_KEY';
    const exists = keyType === 'ACCESS_KEY'
      ? await db.accessKey.count({ where: { id } })
      : await db.dynamicAccessKey.count({ where: { id } });
    if (exists === 0) {
      return jsonError('Key not found', 404);
    }
  } else {
    const identity = auth.identity;
    const chatId = identity.chatId ?? identity.telegramUserId;
    const [accessKeys, dynamicKeys] = await Promise.all([
      findLinkedAccessKeys(chatId, identity.telegramUserId, true),
      findLinkedDynamicAccessKeys(chatId, identity.telegramUserId, true),
    ]);

    const accessKey = accessKeys.find((key) => key.id === id);
    if (!accessKey && !dynamicKeys.some((key) => key.id === id)) {
      return jsonError('Key not found', 404);
    }
    keyType = accessKey ? 'ACCESS_KEY' : 'DYNAMIC_KEY';
  }
  const cutoff = new Date(`${getUsageDayKeys(days)[0]}T00:00:00.000Z`);
  const snapshots = await db.usageSnapshot.findMany({
    where: {
      keyId: id,
      keyType,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    select: { deltaBytes: true, createdAt: true },
  });

  const usage = bucketDailyUsage(snapshots, days);
  const totalBytes = usage.reduce((total, day) => total + BigInt(day.bytes), BigInt(0));

  return NextResponse.json(
    {
      keyId: id,
      kind: keyType === 'ACCESS_KEY' ? 'normal' : 'dynamic',
      range,
      days: usage,
      totalBytes: totalBytes.toString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
