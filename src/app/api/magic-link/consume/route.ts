import { NextResponse } from 'next/server';
import { getRequestIpFromHeaders, writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import {
  createMagicLinkSession,
  MAGIC_LINK_TOKEN_KIND,
  type MagicLinkKeyKind,
} from '@/lib/magic-link-auth';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const ip = getRequestIpFromHeaders(request.headers);
  const rateLimit = consumeRateLimit(`magic-link-consume:${ip}`, {
    limit: 10,
    windowMs: 5 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return jsonError('Too many attempts. Please try again later.', 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request body', 400);
  }

  const token = body && typeof body === 'object' && 'token' in body
    ? (body as { token?: unknown }).token
    : null;
  if (typeof token !== 'string' || !token.trim()) {
    return jsonError('Missing magic-link token', 400);
  }

  const locale = body && typeof body === 'object' && 'locale' in body
    ? (body as { locale?: unknown }).locale
    : null;

  const record = await db.telegramLinkToken.findFirst({
    where: {
      token: token.trim(),
      kind: MAGIC_LINK_TOKEN_KIND,
    },
    select: {
      id: true,
      accessKeyId: true,
      dynamicAccessKeyId: true,
      expiresAt: true,
      consumedAt: true,
      userId: true,
    },
  });

  if (!record || record.consumedAt || record.expiresAt <= new Date()) {
    return jsonError('This link is invalid or has expired.', 401);
  }

  const keyId = record.accessKeyId || record.dynamicAccessKeyId;
  const kind: MagicLinkKeyKind | null = record.accessKeyId
    ? 'normal'
    : record.dynamicAccessKeyId
      ? 'dynamic'
      : null;
  if (!keyId || !kind) {
    return jsonError('This link is invalid or has expired.', 401);
  }

  // Atomic single-use claim: only one request can flip consumedAt.
  const claimed = await db.telegramLinkToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return jsonError('This link has already been used.', 401);
  }

  const sessionToken = await createMagicLinkSession({
    keyId,
    kind,
    locale: locale === 'my' ? 'my' : 'en',
  });

  await writeAuditLog({
    userId: record.userId ?? undefined,
    ip,
    action: 'MAGIC_LINK_CONSUMED',
    entity: kind === 'dynamic' ? 'DYNAMIC_ACCESS_KEY' : 'ACCESS_KEY',
    entityId: keyId,
    details: { tokenId: record.id },
  });

  return NextResponse.json(
    { token: sessionToken, keyId, kind },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
