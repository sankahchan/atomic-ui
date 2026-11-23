export interface TelegramWebAppBridge {
  initData: string;
  colorScheme?: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  showToast?: (message: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebAppBridge };
  }
}

export const TELEGRAM_WEBAPP_BRIDGE_POLL_MS = 50;
export const TELEGRAM_WEBAPP_BRIDGE_TIMEOUT_MS = 12_000;
export const TELEGRAM_WEBAPP_BRIDGE_TIMEOUT_ERROR =
  'Telegram Web App bridge was not available';

export function readTelegramWebAppBridge(): TelegramWebAppBridge | null {
  const bridge = window.Telegram?.WebApp;
  return bridge?.initData ? bridge : null;
}

interface WaitForTelegramWebAppBridgeOptions {
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  readBridge?: () => TelegramWebAppBridge | null;
}

/**
 * Telegram's bridge script can finish loading after a framework has hydrated.
 * Wait for it instead of reading window.Telegram once during the first render.
 */
export function waitForTelegramWebAppBridge(
  options: WaitForTelegramWebAppBridgeOptions = {},
): Promise<TelegramWebAppBridge> {
  const {
    pollMs = TELEGRAM_WEBAPP_BRIDGE_POLL_MS,
    timeoutMs = TELEGRAM_WEBAPP_BRIDGE_TIMEOUT_MS,
    signal,
    readBridge = readTelegramWebAppBridge,
  } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const bridge = readBridge();
    if (bridge) {
      resolve(bridge);
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };

    function onAbort() {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });

    interval = setInterval(() => {
      const candidate = readBridge();
      if (!candidate) return;
      cleanup();
      resolve(candidate);
    }, pollMs);

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(TELEGRAM_WEBAPP_BRIDGE_TIMEOUT_ERROR));
    }, timeoutMs);
  });
}
