import { getTelegramWebAppUrl } from './telegram-keys';

export type TelegramMenuButtonSyncResult = {
  attempted: boolean;
  ok: boolean;
  description?: string | null;
};

/**
 * Give the bot a persistent Mini App button so users do not have to discover
 * the /webapp command. Failures never block webhook setup; Telegram admits
 * only one private-chat menu button per bot, so this is safe to re-run.
 */
export async function syncTelegramWebAppMenuButton(options: {
  botToken: string;
  fetchImpl?: typeof fetch;
  webAppUrl?: string | null;
}): Promise<TelegramMenuButtonSyncResult> {
  const webAppUrl = options.webAppUrl ?? getTelegramWebAppUrl();
  if (!options.botToken || !webAppUrl) {
    return { attempted: false, ok: false };
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(
      `https://api.telegram.org/bot${options.botToken}/setChatMenuButton`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: '📲 Mini App',
            web_app: { url: webAppUrl },
          },
        }),
      },
    );
    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;

    return {
      attempted: true,
      ok: response.ok && result?.ok === true,
      description: result?.description ?? null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      description: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
