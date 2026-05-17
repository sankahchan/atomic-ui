/**
 * Subscription Settings API
 *
 * GET: Fetch subscription page settings including branding
 * POST: Update subscription page settings (admin only)
 */

import { NextRequest } from 'next/server';
import {
  handleSubscriptionSettingsGet,
  handleSubscriptionSettingsPost,
} from './route-helpers';

export async function GET() {
  return handleSubscriptionSettingsGet();
}

export async function POST(request: NextRequest) {
  return handleSubscriptionSettingsPost(request);
}
