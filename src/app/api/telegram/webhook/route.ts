/**
 * Telegram Webhook Endpoint
 * 
 * Receives updates from Telegram and responds to bot commands.
 * Set up the webhook using: POST /api/telegram/webhook?setWebhook=true
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  handleTelegramUpdate,
  getTelegramConfig,
  sendTelegramMessage,
  TelegramUpdate
} from '@/lib/services/telegram-bot';
import { TELEGRAM_WEBHOOK_SECRET_HEADER } from '@/lib/telegram-webhook-secret';
import { getConfiguredPublicAppOrigin, getPublicBasePath } from '@/lib/subscription-links';
import { requireAdminRouteScope } from '@/lib/admin-route-guard';
import { hasTelegramAnnouncementManageScope } from '@/lib/admin-scope';

function hasMatchingSecretToken(actual: string | null, expected: string) {
  if (!actual) {
    return false;
  }

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export type TelegramWebhookRouteDeps = {
  getTelegramConfig: () => ReturnType<typeof getTelegramConfig>;
  handleTelegramUpdate: (update: TelegramUpdate) => Promise<string | null>;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
  ) => Promise<boolean>;
  requireAdminRouteScope: typeof requireAdminRouteScope;
  getConfiguredPublicAppOrigin: typeof getConfiguredPublicAppOrigin;
  getPublicBasePath: typeof getPublicBasePath;
  fetchImpl: typeof fetch;
  logError: typeof console.error;
};

const defaultDeps: TelegramWebhookRouteDeps = {
  getTelegramConfig,
  handleTelegramUpdate,
  sendTelegramMessage,
  requireAdminRouteScope,
  getConfiguredPublicAppOrigin,
  getPublicBasePath,
  fetchImpl: fetch,
  logError: console.error,
};

/**
 * POST /api/telegram/webhook
 * 
 * Handles incoming Telegram updates (messages, commands, etc.)
 */
export async function handleTelegramWebhookPost(
  request: NextRequest,
  deps: TelegramWebhookRouteDeps = defaultDeps,
) {
  try {
    const config = await deps.getTelegramConfig();
    if (!config?.botToken || !config.webhookSecretToken) {
      return NextResponse.json({ ok: false, error: 'Telegram bot is not configured' }, { status: 503 });
    }

    if (
      !hasMatchingSecretToken(
        request.headers.get(TELEGRAM_WEBHOOK_SECRET_HEADER),
        config.webhookSecretToken,
      )
    ) {
      return NextResponse.json({ ok: false, error: 'Unauthorized webhook request' }, { status: 401 });
    }

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
    const responseText = await deps.handleTelegramUpdate(update);

    if (responseText && update.message && config) {
      await deps.sendTelegramMessage(
        config.botToken,
        update.message.chat.id,
        responseText
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    deps.logError('Telegram webhook error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleTelegramWebhookPost(request);
}

/**
 * GET /api/telegram/webhook
 * 
 * Used to set up or check the webhook status.
 * Add ?setWebhook=true to register the webhook with Telegram.
 */
export async function handleTelegramWebhookGet(
  request: NextRequest,
  deps: TelegramWebhookRouteDeps = defaultDeps,
) {
  const { response } = await deps.requireAdminRouteScope({
    canAccess: hasTelegramAnnouncementManageScope,
    forbiddenMessage: 'You do not have permission to manage the Telegram webhook.',
  });
  if (response) {
    return response;
  }

  const searchParams = request.nextUrl.searchParams;
  const setWebhook = searchParams.get('setWebhook') === 'true';

  const config = await deps.getTelegramConfig();
  if (!config) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'Telegram bot not configured. Add a TELEGRAM notification channel in Settings.'
    });
  }

  if (setWebhook) {
    const appOrigin = deps.getConfiguredPublicAppOrigin();
    if (!appOrigin) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'APP_URL or NEXT_PUBLIC_APP_URL must be configured before setting the Telegram webhook.',
        },
        { status: 500 },
      );
    }

    const webhookUrl = `${appOrigin}${deps.getPublicBasePath()}/api/telegram/webhook`;

    try {
      const response = await deps.fetchImpl(
        `https://api.telegram.org/bot${config.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query'],
            secret_token: config.webhookSecretToken,
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
    const response = await deps.fetchImpl(
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

export async function GET(request: NextRequest) {
  return handleTelegramWebhookGet(request);
}
