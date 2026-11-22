import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateRandomString } from '@/lib/utils';
import { slugifyPublicName } from '@/lib/public-slug';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import {
  buildDynamicOutlineUrl,
  buildDynamicShortShareUrl,
  buildSharePageUrl,
  buildShortClientUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
} from '@/lib/subscription-links';
import {
  findLinkedAccessKeys,
  findLinkedDynamicAccessKeys,
} from '@/lib/services/telegram-keys';
import { verifyTelegramWebAppSession } from '@/lib/telegram-webapp-auth';

export const runtime = 'nodejs';

function readBearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

async function findAvailableSlug(name: string) {
  const base = slugifyPublicName(name).slice(0, 24).replace(/-+$/, '') || 'key';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${base}-${generateRandomString(6).toLowerCase()}`;
    const [accessConflict, dynamicConflict] = await Promise.all([
      db.accessKey.findFirst({ where: { publicSlug: candidate }, select: { id: true } }),
      db.dynamicAccessKey.findFirst({ where: { publicSlug: candidate }, select: { id: true } }),
    ]);
    if (!accessConflict && !dynamicConflict) return candidate;
  }
  return `${base}-${generateRandomString(10).toLowerCase()}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = readBearerToken(request);
  const identity = token ? await verifyTelegramWebAppSession(token) : null;
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const chatId = identity.chatId ?? identity.telegramUserId;
  const kind = new URL(request.url).searchParams.get('kind') === 'dynamic' ? 'dynamic' : 'normal';

  if (kind === 'normal') {
    const owned = await findLinkedAccessKeys(chatId, identity.telegramUserId, true);
    const key = owned.find((item) => item.id === id);
    if (!key) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    let tokenValue = key.subscriptionToken;
    let publicSlug = key.publicSlug;
    if (!tokenValue || !publicSlug) {
      tokenValue = tokenValue || generateRandomString(32);
      publicSlug = publicSlug || await findAvailableSlug(key.name);
      await db.accessKey.update({
        where: { id: key.id },
        data: { subscriptionToken: tokenValue, publicSlug },
      });
    }

    return NextResponse.json(
      {
        kind: 'normal',
        subscriptionUrl: buildSubscriptionApiUrl(tokenValue),
        sharePageUrl: buildShortShareUrl(publicSlug),
        shortSharePageUrl: buildShortShareUrl(publicSlug),
        shortClientUrl: buildShortClientUrl(publicSlug),
        accessUrl: decorateOutlineAccessUrl(key.accessUrl, key.name),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const ownedDynamic = await findLinkedDynamicAccessKeys(chatId, identity.telegramUserId, true);
  const dynamicKey = ownedDynamic.find((item) => item.id === id);
  if (!dynamicKey) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  let publicSlug = dynamicKey.publicSlug;
  if (!publicSlug) {
    publicSlug = await findAvailableSlug(dynamicKey.name);
    await db.dynamicAccessKey.update({
      where: { id: dynamicKey.id },
      data: { publicSlug },
    });
  }

  return NextResponse.json(
    {
      kind: 'dynamic',
      subscriptionUrl: buildDynamicOutlineUrl(publicSlug, dynamicKey.name, { shortPath: true }),
      sharePageUrl: buildDynamicShortShareUrl(publicSlug),
      shortSharePageUrl: buildDynamicShortShareUrl(publicSlug),
      shortClientUrl: buildDynamicOutlineUrl(publicSlug, dynamicKey.name, { shortPath: true }),
      accessUrl: null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
