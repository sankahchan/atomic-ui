import { NextRequest } from 'next/server';
import { handleSubscriptionRequest } from '@/app/api/sub/[token]/route';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handleSubscriptionRequest(request, slug);
}
