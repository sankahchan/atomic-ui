/**
 * Telegram Webhook Endpoint
 * 
 * Receives updates from Telegram and responds to bot commands.
 * Set up the webhook using: POST /api/telegram/webhook?setWebhook=true
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handleTelegramUpdate,
  getTelegramConfig,
  sendTelegramMessage,
  TelegramUpdate
} from '@/lib/services/telegram-bot';
import { getPublicAppOrigin, getPublicBasePath } from '@/lib/subscription-links';

/**
 * POST /api/telegram/webhook
 * 
 * Handles incoming Telegram updates (messages, commands, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const config = await getTelegramConfig();
    let update: TelegramUpdate;
    try {
      update = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid Telegram update payload' },
        { status: 400 },
      );
    }

    if (!update || typeof update !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid Telegram update payload' },
        { status: 400 },
      );
    }

    // Process the update and get a response
    // If config is missing, handleTelegramUpdate will return null or help msg regarding config if we modify it, 
    // but better to just let it handle logic.
    const responseText = await handleTelegramUpdate(update);

    if (responseText && update.message && config) {
      await sendTelegramMessage(
        config.botToken,
        update.message.chat.id,
        responseText
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/telegram/webhook
 * 
 * Used to set up or check the webhook status.
 * Add ?setWebhook=true to register the webhook with Telegram.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const setWebhook = searchParams.get('setWebhook') === 'true';

  const config = await getTelegramConfig();
  if (!config) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'Telegram bot not configured. Add a TELEGRAM notification channel in Settings.'
    });
  }

  if (setWebhook) {
    // Get the base URL from environment or request
    const webhookUrl = `${getPublicAppOrigin(request.nextUrl.origin)}${getPublicBasePath()}/api/telegram/webhook`;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${config.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query'],
          }),
        }
      );

      const result = await response.json();

      return NextResponse.json({
        status: result.ok ? 'webhook_set' : 'error',
        webhookUrl,
        telegramResponse: result,
      });
    } catch (error) {
      return NextResponse.json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to set webhook'
      }, { status: 500 });
    }
  }

  // Get current webhook info
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/getWebhookInfo`
    );
    const result = await response.json();

    return NextResponse.json({
      status: 'configured',
      webhookInfo: result.result,
    });
  } catch {
    return NextResponse.json({
      status: 'configured',
      message: 'Bot token configured but could not fetch webhook info',
    });
  }
}
