import type { SupportedLocale } from '@/lib/i18n/config';
import { db } from '@/lib/db';
import {
  buildDynamicOutlineUrl,
  buildDynamicSharePageUrl,
  buildDynamicShortClientUrl,
  buildDynamicShortShareUrl,
  buildDynamicSubscriptionApiUrl,
} from '@/lib/subscription-links';
import { generateRandomString } from '@/lib/utils';

export async function ensureAccessKeySubscriptionToken(
  accessKeyId: string,
  existingToken?: string | null,
) {
  if (existingToken) {
    return existingToken;
  }

  const token = generateRandomString(32);
  await db.accessKey.update({
    where: { id: accessKeyId },
    data: { subscriptionToken: token },
  });
  return token;
}

export function getDynamicKeyMessagingUrls(
  key: {
    dynamicUrl?: string | null;
    publicSlug?: string | null;
    name: string;
  },
  source?: string | null,
  lang?: SupportedLocale,
) {
  const sharePageUrl = key.publicSlug
    ? buildDynamicShortShareUrl(key.publicSlug, {
        source: source || undefined,
        lang,
      })
    : key.dynamicUrl
      ? buildDynamicSharePageUrl(key.dynamicUrl, {
          source: source || undefined,
          lang,
        })
      : null;
  const subscriptionUrl = key.publicSlug
    ? buildDynamicShortClientUrl(key.publicSlug, { source: source || undefined })
    : key.dynamicUrl
      ? buildDynamicSubscriptionApiUrl(key.dynamicUrl, { source: source || undefined })
      : null;
  const outlineClientUrl = key.publicSlug
    ? buildDynamicOutlineUrl(key.publicSlug, key.name, {
        source: source || undefined,
        shortPath: true,
      })
    : key.dynamicUrl
      ? buildDynamicOutlineUrl(key.dynamicUrl, key.name, {
          source: source || undefined,
        })
      : null;

  return {
    sharePageUrl,
    subscriptionUrl,
    outlineClientUrl,
  };
}
