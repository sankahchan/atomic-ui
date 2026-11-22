'use client';

import * as React from 'react';
import Script from 'next/script';
import { PlopProvider } from '@plop-ui/react';

type WebAppKey = {
  id: string;
  kind: 'normal' | 'dynamic';
  name: string;
  status: string;
  serverName: string | null;
  usedBytes: string;
  dataLimitBytes: string | null;
  expiresAt: string | null;
  hasSharePage: boolean;
};

type KeyLinks = {
  kind: 'normal' | 'dynamic';
  subscriptionUrl: string;
  sharePageUrl: string;
  shortSharePageUrl: string | null;
  shortClientUrl: string | null;
  accessUrl: string | null;
};

type WebAppData = {
  locale: string;
  supportUrl: string | null;
  botUsername: string | null;
  keys: WebAppKey[];
};

interface TelegramWebAppBridge {
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

const COPY = {
  en: {
    title: 'My VPN keys',
    subtitle: 'One-tap access from Telegram',
    loading: 'Loading your keys…',
    empty: 'No linked keys yet. Open the bot and use /setup to connect one.',
    copy: 'Copy config',
    share: 'Open share page',
    renew: 'Renew',
    setup: 'Setup guide',
    support: 'Support',
    copied: 'Config copied',
    copyFailed: 'Could not copy. Open the share page instead.',
    unconfigured: 'Open this page from the Telegram bot.',
    error: 'Could not load your keys. Please try again from Telegram.',
  },
  my: {
    title: 'ကျွန်တော့် VPN keys',
    subtitle: 'Telegram ကနေ တစ်နှိပ်တည်း',
    loading: 'Key တွေ တင်နေသည်…',
    empty: 'ချိတ်ထားတဲ့ key မရှိသေးပါ။ Bot ထဲမှာ /setup သုံးပြီး ချိတ်ပါ။',
    copy: 'Config ကူးမည်',
    share: 'Share page ဖွင့်မည်',
    renew: 'သက်တမ်းတိုး',
    setup: 'ချိတ်ဆက်နည်း',
    support: 'အကူအညီ',
    copied: 'Config ကူးပြီး',
    copyFailed: 'ကူးလို့မရပါ။ Share page ကို ဖွင့်ပါ။',
    unconfigured: 'ဒီစာမျက်နှာကို Telegram bot ကနေ ဖွင့်ပါ။',
    error: 'Key တွေ မရနိုင်ပါ။ Telegram ကနေ ပြန်ကြိုးစားပါ။',
  },
} as const;

function formatBytes(value: string | null) {
  if (!value) return '∞';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '∞';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function TelegramWebAppPage() {
  const [token, setToken] = React.useState<string | null>(null);
  const [data, setData] = React.useState<WebAppData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('dark');
  const [links, setLinks] = React.useState<Record<string, KeyLinks>>({});

  React.useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) {
      setError(COPY.en.unconfigured);
      return;
    }

    webApp.ready();
    webApp.expand();
    if (webApp.colorScheme) setTheme(webApp.colorScheme);

    let cancelled = false;

    (async () => {
      try {
        const sessionResponse = await fetch('/api/telegram/webapp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: webApp.initData }),
        });
        const sessionBody = (await sessionResponse.json()) as { token?: string; error?: string };
        if (!sessionResponse.ok || !sessionBody.token) {
          throw new Error(sessionBody.error || COPY.en.error);
        }
        if (cancelled) return;
        setToken(sessionBody.token);

        const keysResponse = await fetch('/api/telegram/webapp/keys', {
          headers: { Authorization: `Bearer ${sessionBody.token}` },
        });
        const keysBody = (await keysResponse.json()) as WebAppData & { error?: string };
        if (!keysResponse.ok) throw new Error(keysBody.error || COPY.en.error);
        if (!cancelled) setData(keysBody);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : COPY.en.error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const t = data?.locale === 'my' ? COPY.my : COPY.en;
  const webApp = typeof window === 'undefined' ? null : window.Telegram?.WebApp;

  const fetchLinks = React.useCallback(
    async (key: WebAppKey) => {
      if (!token) return null;
      const cached = links[key.id];
      if (cached) return cached;
      const response = await fetch(
        `/api/telegram/webapp/keys/${encodeURIComponent(key.id)}/links?kind=${key.kind}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = (await response.json()) as KeyLinks & { error?: string };
      if (!response.ok) throw new Error(body.error || t.copyFailed);
      setLinks((current) => ({ ...current, [key.id]: body }));
      return body;
    },
    [links, t.copyFailed, token],
  );

  const copyConfig = async (key: WebAppKey) => {
    try {
      setBusyKey(key.id);
      const keyLinks = await fetchLinks(key);
      if (!keyLinks) return;
      const value = keyLinks.accessUrl || keyLinks.subscriptionUrl;
      await navigator.clipboard.writeText(value);
      webApp?.showToast?.(t.copied);
      setNotice(t.copied);
    } catch {
      webApp?.showToast?.(t.copyFailed);
      setNotice(t.copyFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const openShare = async (key: WebAppKey) => {
    try {
      setBusyKey(key.id);
      const keyLinks = await fetchLinks(key);
      if (!keyLinks) return;
      const url = keyLinks.sharePageUrl || keyLinks.shortSharePageUrl || keyLinks.subscriptionUrl;
      if (webApp) webApp.openLink(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusyKey(null);
    }
  };

  const openUrl = (url: string, telegramLink = false) => {
    if (!url) return;
    if (webApp) {
      if (telegramLink) webApp.openTelegramLink(url);
      else webApp.openLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const renewUrl = data?.botUsername
    ? `https://t.me/${data.botUsername}?start=renew`
    : null;
  const setupUrl = data?.botUsername
    ? `https://t.me/${data.botUsername}?start=setup`
    : null;

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <PlopProvider surface="poster" theme={theme} toaster={false} className="plop-dashboard min-h-screen">
        <main className="mx-auto w-full max-w-2xl px-4 py-6">
          <header className="mb-5">
            <h1 className="text-2xl font-black tracking-tight">{t.title}</h1>
            <p className="mt-1 text-sm opacity-75">{t.subtitle}</p>
          </header>

          {notice ? <p className="ops-card mb-4 p-3 text-sm">{notice}</p> : null}
          {error ? <p className="ops-card mb-4 p-3 text-sm">{error}</p> : null}
          {!error && !data ? <p className="ops-card p-4 text-sm">{t.loading}</p> : null}
          {data && data.keys.length === 0 ? <p className="ops-card p-4 text-sm">{t.empty}</p> : null}

          <div className="space-y-3">
            {data?.keys.map((key) => (
              <article key={key.id} className="ops-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold">{key.name}</h2>
                    <p className="mt-1 text-xs opacity-70">
                      {key.kind === 'dynamic' ? 'Dynamic' : 'Standard'} · {key.status}
                      {key.serverName ? ` · ${key.serverName}` : ''}
                    </p>
                  </div>
                  <span className="ops-badge text-xs">{formatBytes(key.usedBytes)}</span>
                </div>

                <p className="mt-2 text-xs opacity-70">
                  {formatBytes(key.usedBytes)} / {formatBytes(key.dataLimitBytes)}
                  {key.expiresAt ? ` · ${new Date(key.expiresAt).toLocaleDateString()}` : ''}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ops-button text-sm"
                    disabled={busyKey === key.id}
                    onClick={() => void copyConfig(key)}
                  >
                    {t.copy}
                  </button>
                  <button
                    type="button"
                    className="ops-button text-sm"
                    disabled={busyKey === key.id || !key.hasSharePage}
                    onClick={() => void openShare(key)}
                  >
                    {t.share}
                  </button>
                  {renewUrl ? (
                    <button
                      type="button"
                      className="ops-button text-sm"
                      onClick={() => openUrl(renewUrl, true)}
                    >
                      {t.renew}
                    </button>
                  ) : null}
                  {setupUrl ? (
                    <button
                      type="button"
                      className="ops-button text-sm"
                      onClick={() => openUrl(setupUrl, true)}
                    >
                      {t.setup}
                    </button>
                  ) : null}
                  {data.supportUrl ? (
                    <button
                      type="button"
                      className="ops-button text-sm"
                      onClick={() => openUrl(data.supportUrl as string, true)}
                    >
                      {t.support}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </main>
      </PlopProvider>
    </>
  );
}
