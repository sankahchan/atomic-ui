import { db } from '@/lib/db';

export async function resolveAccessKeyPublicIdentifier(identifier: string) {
  const current = await db.accessKey.findFirst({
    where: {
      OR: [
        { subscriptionToken: identifier },
        { publicSlug: identifier },
      ],
    },
    select: {
      id: true,
      publicSlug: true,
      subscriptionToken: true,
    },
  });

  if (current) {
    return {
      id: current.id,
      publicSlug: current.publicSlug,
      subscriptionToken: current.subscriptionToken,
      matchedBy:
        current.publicSlug === identifier ? 'publicSlug' : 'subscriptionToken',
      redirectSlug:
        current.publicSlug && current.publicSlug !== identifier ? current.publicSlug : null,
    } as const;
  }

  const historical = await (db as any).accessKeySlugHistory.findUnique({
    where: { slug: identifier },
    select: {
      slug: true,
      accessKey: {
        select: {
          id: true,
          publicSlug: true,
          subscriptionToken: true,
        },
      },
    },
  });

  if (!historical?.accessKey) {
    return null;
  }

  return {
    id: historical.accessKey.id,
    publicSlug: historical.accessKey.publicSlug,
    subscriptionToken: historical.accessKey.subscriptionToken,
    matchedBy: 'historicalSlug',
    redirectSlug:
      historical.accessKey.publicSlug && historical.accessKey.publicSlug !== identifier
        ? historical.accessKey.publicSlug
        : null,
  } as const;
}
