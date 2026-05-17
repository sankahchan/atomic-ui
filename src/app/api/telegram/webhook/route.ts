/**
 * Telegram Webhook Endpoint
 *
 * Receives updates from Telegram and responds to bot commands.
 * Set up the webhook using: POST /api/telegram/webhook?setWebhook=true
 */

import { NextRequest } from 'next/server';
import {
  handleTelegramWebhookGet,
  handleTelegramWebhookPost,
  handleTelegramWebhookSetup,
} from './route-helpers';

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get('setWebhook') === 'true') {
    return handleTelegramWebhookSetup(request);
  }

  return handleTelegramWebhookPost(request);
}

export async function GET(request: NextRequest) {
  return handleTelegramWebhookGet(request);
}
