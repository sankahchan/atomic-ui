import { redirect } from 'next/navigation';
import SubscriptionPage from '@/app/sub/[token]/page';
import { resolveAccessKeyPublicIdentifier } from '@/lib/access-key-public-identifiers';

function toSearchParamsString(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export default async function ShortSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const nextSearchParams = await searchParams;
  const resolved = await resolveAccessKeyPublicIdentifier(slug);

  if (resolved?.matchedBy === 'historicalSlug' && resolved.redirectSlug) {
    redirect(`/s/${resolved.redirectSlug}${toSearchParamsString(nextSearchParams)}`);
  }

  return <SubscriptionPage />;
}
