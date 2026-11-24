import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  findLinkedAccessKeys,
  findLinkedDynamicAccessKeys,
} from '@/lib/services/telegram-keys';
import { verifyTelegramWebAppSession } from '@/lib/telegram-webapp-auth';
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
  const identity = token ? await verifyTelegramWebAppSession(token) : null;
  if (!identity) {
    return jsonError('Unauthorized', 401);
  }

  const range = new URL(request.url).searchParams.get('range') || '7d';
  const days = range === '7d' ? 7 : range === '30d' ? 30 : null;
  if (!days) {
    return jsonError('Unsupported usage range', 400);
  }

  const chatId = identity.chatId ?? identity.telegramUserId;
  const [accessKeys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(chatId, identity.telegramUserId, true),
    findLinkedDynamicAccessKeys(chatId, identity.telegramUserId, true),
  ]);

  const accessKey = accessKeys.find((key) => key.id === id);
  const dynamicKey = accessKey ? null : dynamicKeys.find((key) => key.id === id);
  if (!accessKey && !dynamicKey) {
    return jsonError('Key not found', 404);
  }

  const keyType = accessKey ? 'ACCESS_KEY' : 'DYNAMIC_KEY';
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
      kind: accessKey ? 'normal' : 'dynamic',
      range,
      days: usage,
      totalBytes: totalBytes.toString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
