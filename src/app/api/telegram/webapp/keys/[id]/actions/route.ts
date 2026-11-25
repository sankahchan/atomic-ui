import { NextResponse } from 'next/server';
import { writeAuditLog, getRequestIpFromHeaders } from '@/lib/audit';
import { db } from '@/lib/db';
import { escapeHtml } from '@/lib/services/telegram-ui';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/services/telegram-runtime';
import { findLinkedAccessKeys } from '@/lib/services/telegram-keys';
import { authorizeWebAppToken } from '@/lib/magic-link-auth';
import { getSelfActionEligibility } from '../self-service';

export const runtime = 'nodejs';

const MAX_REQUEST_MESSAGE_LENGTH = 800;

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

async function loadOwnedKey(request: Request, id: string) {
  const token = readBearerToken(request);
  const auth = token ? await authorizeWebAppToken(token) : null;
  if (!auth) {
    return { error: jsonError('Unauthorized', 401) } as const;
  }

  if (auth.type === 'magic') {
    if (auth.claims.keyId !== id || auth.claims.kind !== 'normal') {
      return { error: jsonError('Key not found', 404) } as const;
    }
    const key = await db.accessKey.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        userId: true,
        usedBytes: true,
        dataLimitBytes: true,
        expiresAt: true,
        autoRenewPolicy: true,
        autoRenewDurationDays: true,
      },
    });
    if (!key) {
      return { error: jsonError('Key not found', 404) } as const;
    }
    return { key, source: { type: 'magic' as const } } as const;
  }

  const identity = auth.identity;
  const chatId = identity.chatId ?? identity.telegramUserId;
  const owned = await findLinkedAccessKeys(chatId, identity.telegramUserId, true);
  const key = owned.find((candidate) => candidate.id === id);
  if (!key) {
    return { error: jsonError('Key not found', 404) } as const;
  }

  return { key, source: { type: 'telegram' as const, telegramUserId: identity.telegramUserId } } as const;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await loadOwnedKey(request, id);
  if ('error' in loaded) return loaded.error;

  return NextResponse.json(
    { keyId: id, ...getSelfActionEligibility(loaded.key) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function parseRequestBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await loadOwnedKey(request, id);
  if ('error' in loaded) return loaded.error;
  const { key, source } = loaded;
  const telegramUserId = source.type === 'telegram' ? source.telegramUserId : null;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('Invalid request body', 400);
  }
  const payload = parseRequestBody(rawBody);
  if (!payload) {
    return jsonError('Invalid request body', 400);
  }

  const ip = getRequestIpFromHeaders(request.headers);
  const eligibility = getSelfActionEligibility(key);

  if (payload.action === 'extend') {
    const configuredDays = eligibility.extendDays;
    if (!configuredDays) {
      return jsonError('This key is not eligible for self-extension.', 400);
    }

    const requestedDays = payload.days;
    if (requestedDays !== undefined && requestedDays !== configuredDays) {
      return jsonError('Unsupported extension length', 400);
    }
    const days = configuredDays;

    // Same safety rule as keys.selfExtend: extend from the existing future
    // expiry when present, otherwise from now, and keep the key active.
    const now = new Date();
    const baseDate = key.expiresAt && key.expiresAt > now ? key.expiresAt : now;
    const newExpiresAt = new Date(baseDate);
    newExpiresAt.setDate(newExpiresAt.getDate() + days);

    const updated = await db.accessKey.update({
      where: { id },
      data: {
        expiresAt: newExpiresAt,
        expirationType: 'FIXED_DATE',
        status: 'ACTIVE',
      },
      select: { expiresAt: true },
    });

    await writeAuditLog({
      userId: key.userId,
      ip,
      action: 'ACCESS_KEY_SELF_EXTENDED',
      entity: 'ACCESS_KEY',
      entityId: id,
      details: {
        days,
        expiresAt: newExpiresAt.toISOString(),
        source: source.type === 'telegram' ? 'TELEGRAM_WEBAPP' : 'MAGIC_LINK',
        telegramUserId,
      },
    });

    return NextResponse.json(
      { action: 'extend', days, expiresAt: updated.expiresAt?.toISOString() ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (payload.action === 'request-data') {
    if (!eligibility.canRequestData || !key.userId) {
      return jsonError('This key is not assigned to a user.', 400);
    }

    const rawMessage = payload.message;
    if (rawMessage !== undefined && rawMessage !== null && typeof rawMessage !== 'string') {
      return jsonError('Invalid message', 400);
    }
    const message = typeof rawMessage === 'string'
      ? rawMessage.trim().slice(0, MAX_REQUEST_MESSAGE_LENGTH) || null
      : null;

    const note = await db.customerSupportNote.create({
      data: {
        userId: key.userId,
        createdByUserId: key.userId,
        kind: 'USAGE_REQUEST',
        note: [
          `Customer requested more data for key "${key.name}".`,
          `Used: ${key.usedBytes.toString()} / ${key.dataLimitBytes?.toString() ?? 'unlimited'}`,
          message ? `Message: ${message}` : null,
          'Source: Telegram Mini App',
        ].filter(Boolean).join('\n'),
      },
      select: { id: true },
    });

    const telegramConfig = await getTelegramConfig();
    if (telegramConfig) {
      const adminMessage = [
        '📈 <b>Data increase request</b>',
        `Key: <b>${escapeHtml(key.name)}</b>`,
        `Usage: ${key.usedBytes.toString()} / ${key.dataLimitBytes?.toString() ?? 'unlimited'}`,
        message ? `Message: ${escapeHtml(message)}` : null,
        source.type === 'telegram'
          ? `Source: Telegram Mini App (user ${source.telegramUserId})`
          : 'Source: magic-link self-service',
      ].filter(Boolean).join('\n');

      for (const adminId of telegramConfig.adminChatIds) {
        try {
          await sendTelegramMessage(telegramConfig.botToken, adminId, adminMessage);
        } catch (error) {
          console.error('Failed to notify admin about Telegram data request:', error);
        }
      }
    }

    await writeAuditLog({
      userId: key.userId,
      ip,
      action: 'ACCESS_KEY_DATA_INCREASE_REQUESTED',
      entity: 'ACCESS_KEY',
      entityId: id,
      details: {
        noteId: note.id,
        source: source.type === 'telegram' ? 'TELEGRAM_WEBAPP' : 'MAGIC_LINK',
        telegramUserId,
      },
    });

    return NextResponse.json(
      { action: 'request-data', success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return jsonError('Unsupported action', 400);
}
