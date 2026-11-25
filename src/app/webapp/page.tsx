'use client';

import * as React from 'react';
import Script from 'next/script';
import { PlopProvider } from '@plop-ui/react';
import { withBasePath } from '@/lib/base-path';
import {
  TELEGRAM_WEBAPP_BRIDGE_TIMEOUT_ERROR,
  waitForTelegramWebAppBridge,
  type TelegramWebAppBridge,
} from '@/lib/telegram-webapp-bridge';

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

type UsageRange = '7d' | '30d';
type UsageDay = { date: string; bytes: string };
type UsageData = {
  keyId: string;
  kind: 'normal' | 'dynamic';
  range: UsageRange;
  days: UsageDay[];
  totalBytes: string;
};
type ActionEligibility = {
  keyId: string;
  canExtend: boolean;
  extendDays: number | null;
  canRequestData: boolean;
};
type ActionMessage = { text: string; ok: boolean };

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
    usage: 'Usage',
    usageLoading: 'Loading usage…',
    usageError: 'Usage unavailable',
    usage7d: '7D',
    usage30d: '30D',
    usageTotal: 'Total',
    extendDays: 'Extend {days}d',
    requestData: 'Request data',
    actionBusy: 'Working…',
    extendSuccess: 'Key extended',
    requestSuccess: 'Request sent to support',
    actionFailed: 'Action failed. Please try again.',
    usageEmpty: 'No usage in this range',
    statusACTIVE: 'Active',
    statusPENDING: 'Pending',
    statusEXPIRED: 'Expired',
    statusDEPLETED: 'Depleted',
    kindNormal: 'Standard',
    kindDynamic: 'Dynamic',
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
    usage: 'အသုံးပြုမှု',
    usageLoading: 'အသုံးပြုမှု တင်နေသည်…',
    usageError: 'အသုံးပြုမှု မရနိုင်ပါ',
    usage7d: '၇ ရက်',
    usage30d: '၃၀ ရက်',
    usageTotal: 'စုစုပေါင်း',
    extendDays: '{days} ရက် တိုးမည်',
    requestData: 'Data တိုးရန် တောင်းဆိုမည်',
    actionBusy: 'လုပ်ဆောင်နေသည်…',
    extendSuccess: 'သက်တမ်းတိုးပြီး',
    requestSuccess: 'အကူအညီကို တောင်းဆိုပြီး',
    actionFailed: 'မလုပ်ဆောင်နိုင်ပါ။ ပြန်ကြိုးစားပါ။',
    usageEmpty: 'ဒီကာလအတွင်း အသုံးပြုမှု မရှိပါ',
    statusACTIVE: 'အသက်ဝင်',
    statusPENDING: 'စောင့်ဆိုင်း',
    statusEXPIRED: 'သက်တမ်းကုန်',
    statusDEPLETED: 'Data ကုန်',
    kindNormal: 'ပုံမှန်',
    kindDynamic: 'Dynamic',
  },
} as const;

type DisplayLocale = 'en' | 'my';
type WebAppCopy = (typeof COPY)[DisplayLocale];

function localeFromInitData(initData: string): DisplayLocale {
  try {
    const rawUser = new URLSearchParams(initData).get('user') || '{}';
    const languageCode = String((JSON.parse(rawUser) as { language_code?: unknown }).language_code || '');
    return languageCode.toLowerCase().startsWith('my') ? 'my' : 'en';
  } catch {
    return 'en';
  }
}

const MYANMAR_MONTHS = [
  'ဇန်', 'ဖေ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်',
  'ဇူလိုင်', 'ဩဂုတ်', 'စက်', 'အောက်', 'နိုဝ်', 'ဒီ',
] as const;

function formatShortDate(iso: string | null, locale: DisplayLocale) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (locale === 'my') {
    return `${date.getUTCDate()} ${MYANMAR_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function statusLabel(status: string, t: WebAppCopy) {
  const key = `status${status}` as keyof WebAppCopy;
  const value = t[key];
  return typeof value === 'string' ? value : status;
}

function formatBytes(value: string | null) {
  if (!value) return '∞';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '∞';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function UsageSparkline({ days }: { days: UsageDay[] }) {
  const values = days.map((day) => Number(day.bytes) || 0);
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const height = 24;
  const step = values.length > 1 ? 100 / (values.length - 1) : 0;
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 2)).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="h-6 w-full opacity-80"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function TelegramWebAppPage() {
  const [token, setToken] = React.useState<string | null>(null);
  const [data, setData] = React.useState<WebAppData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('dark');
  const [webApp, setWebApp] = React.useState<TelegramWebAppBridge | null>(null);
  const [links, setLinks] = React.useState<Record<string, KeyLinks>>({});
  const [usageRange, setUsageRange] = React.useState<UsageRange>('7d');
  const [usage, setUsage] = React.useState<Record<string, UsageData>>({});
  const [usageErrors, setUsageErrors] = React.useState<Record<string, string>>({});
  const [eligibility, setEligibility] = React.useState<Record<string, ActionEligibility>>({});
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);
  const [actionMessages, setActionMessages] = React.useState<Record<string, ActionMessage>>({});
  const [displayLocale, setDisplayLocale] = React.useState<DisplayLocale>('en');

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        if (new URLSearchParams(window.location.search).get('magic') === '1') {
          const magicToken = window.sessionStorage.getItem('atomic-magic-session');
          if (!magicToken) {
            throw new Error('This self-service session has expired. Open the link again.');
          }

          const magicLocale = window.sessionStorage.getItem('atomic-magic-locale') === 'my'
            ? 'my'
            : 'en';
          setDisplayLocale(magicLocale);
          setTheme('light');
          setToken(magicToken);

          const magicKeysResponse = await fetch(withBasePath('/api/telegram/webapp/keys'), {
            headers: { Authorization: `Bearer ${magicToken}` },
            signal: controller.signal,
          });
          const magicKeysBody = (await magicKeysResponse.json()) as WebAppData & { error?: string };
          if (!magicKeysResponse.ok) throw new Error(magicKeysBody.error || COPY.en.error);
          if (!cancelled) setData(magicKeysBody);
          return;
        }

        // Telegram's bridge script can load after hydration. Wait for it so
        // ready() is always called and the client loading placeholder clears.
        const bridge = await waitForTelegramWebAppBridge({ signal: controller.signal });
        if (cancelled) return;

        bridge.ready();
        bridge.expand();
        setWebApp(bridge);
        setDisplayLocale(localeFromInitData(bridge.initData));
        if (bridge.colorScheme) setTheme(bridge.colorScheme);

        const sessionResponse = await fetch(withBasePath('/api/telegram/webapp/session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: bridge.initData }),
        });
        const sessionBody = (await sessionResponse.json()) as { token?: string; error?: string };
        if (!sessionResponse.ok || !sessionBody.token) {
          throw new Error(sessionBody.error || COPY.en.error);
        }
        if (cancelled) return;
        setToken(sessionBody.token);

        const keysResponse = await fetch(withBasePath('/api/telegram/webapp/keys'), {
          headers: { Authorization: `Bearer ${sessionBody.token}` },
        });
        const keysBody = (await keysResponse.json()) as WebAppData & { error?: string };
        if (!keysResponse.ok) throw new Error(keysBody.error || COPY.en.error);
        if (!cancelled) setData(keysBody);
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        if (
          caught instanceof Error &&
          caught.message === TELEGRAM_WEBAPP_BRIDGE_TIMEOUT_ERROR
        ) {
          setError(COPY.en.unconfigured);
          return;
        }
        setError(caught instanceof Error ? caught.message : COPY.en.error);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // The dashboard's global ThemeProvider defaults the root to `dark`. Telegram
  // sends the user's preferred color scheme in initData, so mirror it here or
  // the Plop light palette ends up with dark card tokens and unreadable text.
  React.useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const previousColorScheme = root.style.colorScheme;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    return () => {
      root.classList.toggle('dark', hadDark);
      root.style.colorScheme = previousColorScheme;
    };
  }, [theme]);

  React.useEffect(() => {
    if (!token || !data) return;
    const controller = new AbortController();
    let cancelled = false;

    void Promise.all(
      data.keys
        .filter((key) => key.kind === 'normal')
        .map(async (key) => {
          try {
            const response = await fetch(
              withBasePath(`/api/telegram/webapp/keys/${encodeURIComponent(key.id)}/actions`),
              { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
            );
            const body = (await response.json()) as ActionEligibility & { error?: string };
            if (!response.ok) throw new Error(body.error || COPY.en.error);
            if (!cancelled) setEligibility((current) => ({ ...current, [key.id]: body }));
          } catch (caught) {
            // Keep self-action buttons hidden when eligibility cannot be confirmed.
            if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) return;
          }
        }),
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [data, token]);

  React.useEffect(() => {
    if (!token || !data) return;
    const controller = new AbortController();
    let cancelled = false;

    void Promise.all(
      data.keys.map(async (key) => {
        try {
          const response = await fetch(
            withBasePath(
              `/api/telegram/webapp/keys/${encodeURIComponent(key.id)}/usage?range=${usageRange}`,
            ),
            { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
          );
          const body = (await response.json()) as UsageData & { error?: string };
          if (!response.ok) throw new Error(body.error || COPY.en.error);
          if (cancelled) return;
          setUsage((current) => ({ ...current, [key.id]: body }));
          setUsageErrors((current) => {
            const next = { ...current };
            delete next[key.id];
            return next;
          });
        } catch (caught) {
          if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) return;
          setUsageErrors((current) => ({
            ...current,
            [key.id]: caught instanceof Error ? caught.message : COPY.en.error,
          }));
        }
      }),
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [data, token, usageRange]);

  const locale: DisplayLocale =
    data?.locale === 'my' || data?.locale === 'en' ? data.locale : displayLocale;
  const t: WebAppCopy = locale === 'my' ? COPY.my : COPY.en;

  const fetchLinks = React.useCallback(
    async (key: WebAppKey) => {
      if (!token) return null;
      const cached = links[key.id];
      if (cached) return cached;
      const response = await fetch(
        withBasePath(
          `/api/telegram/webapp/keys/${encodeURIComponent(key.id)}/links?kind=${key.kind}`,
        ),
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

  const runAction = async (key: WebAppKey, action: 'extend' | 'request-data') => {
    if (!token) return;
    try {
      setActionBusy(key.id);
      setActionMessages((current) => {
        const next = { ...current };
        delete next[key.id];
        return next;
      });
      const response = await fetch(
        withBasePath(`/api/telegram/webapp/keys/${encodeURIComponent(key.id)}/actions`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || t.actionFailed);
      const text = action === 'extend' ? t.extendSuccess : t.requestSuccess;
      setActionMessages((current) => ({ ...current, [key.id]: { text, ok: true } }));
      setNotice(text);
      webApp?.showToast?.(text);
    } catch {
      setActionMessages((current) => ({
        ...current,
        [key.id]: { text: t.actionFailed, ok: false },
      }));
      webApp?.showToast?.(t.actionFailed);
    } finally {
      setActionBusy(null);
    }
  };

  const renewUrl = data?.botUsername
    ? `https://t.me/${data.botUsername}?start=renew`
    : null;
  const setupUrl = data?.botUsername
    ? `https://t.me/${data.botUsername}?start=setup`
    : null;
  const supportUrl = data?.supportUrl
    || (data?.botUsername ? `https://t.me/${data.botUsername}?start=support` : null);

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
            {data?.keys.map((key) => {
              const keyUsage = usage[key.id];
              const keyEligibility = eligibility[key.id];
              const keyActionMessage = actionMessages[key.id];
              const used = Number(key.usedBytes) || 0;
              const limit = Number(key.dataLimitBytes) || 0;
              const percent = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
              const hasUsage = Boolean(keyUsage?.days.some((day) => Number(day.bytes) > 0));
              const rangeButton = (range: UsageRange, label: string) => (
                <button
                  type="button"
                  aria-pressed={usageRange === range}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    usageRange === range
                      ? 'bg-[var(--plop-panel-stroke)] text-[var(--plop-panel-text-on-fill)]'
                      : 'opacity-70'
                  }`}
                  onClick={() => setUsageRange(range)}
                >
                  {label}
                </button>
              );
              return (
              <article key={key.id} className="ops-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold">{key.name}</h2>
                    <p className="mt-1 text-xs opacity-70">
                      {key.kind === 'dynamic' ? t.kindDynamic : t.kindNormal}
                      {key.serverName ? ` · ${key.serverName}` : ''}
                      {key.expiresAt ? ` · ${formatShortDate(key.expiresAt, locale)}` : ''}
                    </p>
                  </div>
                  <span className="ops-badge text-xs">{statusLabel(key.status, t)}</span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 text-xs opacity-80">
                  <span>
                    {formatBytes(key.usedBytes)} / {formatBytes(key.dataLimitBytes)}
                  </span>
                  {limit > 0 ? <span className="tabular-nums">{percent.toFixed(0)}%</span> : null}
                </div>
                {limit > 0 ? (
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--plop-panel-muted)' }}
                    role="progressbar"
                    aria-valuenow={Math.round(percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${percent}%`, backgroundColor: 'var(--plop-panel-stroke)' }}
                    />
                  </div>
                ) : null}

                <div
                  className="mt-3 rounded-lg px-2.5 py-2"
                  style={{ backgroundColor: 'var(--plop-panel-muted)' }}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] opacity-80">
                    <span>
                      {t.usage}
                      {keyUsage ? ` · ${t.usageTotal} ${formatBytes(keyUsage.totalBytes)}` : ''}
                    </span>
                    <span className="flex gap-1">
                      {rangeButton('7d', t.usage7d)}
                      {rangeButton('30d', t.usage30d)}
                    </span>
                  </div>
                  <div className="mt-1 min-h-6">
                    {usageErrors[key.id] ? (
                      <p className="text-[11px] opacity-60">{t.usageError}</p>
                    ) : keyUsage ? (
                      hasUsage ? (
                        <UsageSparkline days={keyUsage.days} />
                      ) : (
                        <p className="text-[11px] opacity-60">{t.usageEmpty}</p>
                      )
                    ) : (
                      <p className="text-[11px] opacity-60">{t.usageLoading}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-plop-button-variant="default"
                      className="ops-button text-sm"
                      disabled={busyKey === key.id}
                      onClick={() => void copyConfig(key)}
                    >
                      {t.copy}
                    </button>
                    <button
                      type="button"
                      data-plop-button-variant="secondary"
                      className="ops-button text-sm"
                      disabled={busyKey === key.id || !key.hasSharePage}
                      onClick={() => void openShare(key)}
                    >
                      {t.share}
                    </button>
                    {keyEligibility?.canExtend && keyEligibility.extendDays ? (
                      <button
                        type="button"
                        data-plop-button-variant="default"
                        className="ops-button text-sm"
                        disabled={busyKey === key.id || actionBusy === key.id}
                        onClick={() => void runAction(key, 'extend')}
                      >
                        {actionBusy === key.id
                          ? t.actionBusy
                          : t.extendDays.replace('{days}', String(keyEligibility.extendDays))}
                      </button>
                    ) : null}
                    {keyEligibility?.canRequestData ? (
                      <button
                        type="button"
                        data-plop-button-variant="secondary"
                        className="ops-button text-sm"
                        disabled={busyKey === key.id || actionBusy === key.id}
                        onClick={() => void runAction(key, 'request-data')}
                      >
                        {actionBusy === key.id ? t.actionBusy : t.requestData}
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {renewUrl ? (
                      <button
                        type="button"
                        data-plop-button-variant="ghost"
                        className="ops-button text-xs"
                        onClick={() => openUrl(renewUrl, true)}
                      >
                        {t.renew}
                      </button>
                    ) : null}
                    {setupUrl ? (
                      <button
                        type="button"
                        data-plop-button-variant="ghost"
                        className="ops-button text-xs"
                        onClick={() => openUrl(setupUrl, true)}
                      >
                        {t.setup}
                      </button>
                    ) : null}
                    {supportUrl ? (
                      <button
                        type="button"
                        data-plop-button-variant="ghost"
                        className="ops-button text-xs"
                        onClick={() => openUrl(supportUrl, true)}
                      >
                        {t.support}
                      </button>
                    ) : null}
                  </div>
                </div>
                {keyActionMessage ? (
                  <p
                    className={`mt-2 text-xs ${keyActionMessage.ok ? 'opacity-80' : 'text-red-400'}`}
                  >
                    {keyActionMessage.text}
                  </p>
                ) : null}
              </article>
              );
            })}
          </div>
        </main>
      </PlopProvider>
    </>
  );
}
