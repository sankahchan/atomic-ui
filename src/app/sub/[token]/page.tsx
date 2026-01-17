'use client';

/**
 * Subscription Page
 *
 * Beautiful themed subscription page for VPN users.
 * Displays key information, usage stats, and quick-connect buttons.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import {
  getTheme,
  getAppsForPlatform,
  clientApps,
  type SubscriptionTheme,
} from '@/lib/subscription-themes';

type Platform = 'android' | 'ios' | 'windows';

interface KeyData {
  id: string;
  name: string;
  accessUrl: string;
  status: string;
  server: {
    name: string;
    countryCode: string | null;
    location: string | null;
  };
  usedBytes: string;
  dataLimitBytes: string | null;
  expiresAt: string | null;
  subscriptionTheme: string | null;
  method: string | null;
  port: number | null;
}

interface SettingsData {
  supportLink?: string;
  defaultSubscriptionTheme?: string;
}

export default function SubscriptionPage() {
  const params = useParams();
  const token = params.token as string;

  const [keyData, setKeyData] = useState<KeyData | null>(null);
  const [settings, setSettings] = useState<SettingsData>({});
  const [theme, setTheme] = useState<SubscriptionTheme>(getTheme('dark'));
  const [platform, setPlatform] = useState<Platform>('android');
  const [appType, setAppType] = useState<'outline' | 'hiddify'>('outline');
  const [qrCode, setQrCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Fetch key data
  useEffect(() => {
    async function fetchData() {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const response = await fetch(`${basePath}/api/subscription/${token}`, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to load subscription');
          setLoading(false);
          return;
        }

        const data = await response.json();
        setKeyData(data);

        // Fetch settings for support link and default theme
        try {
          const settingsRes = await fetch(`${basePath}/api/subscription/${token}/settings`);
          if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            setSettings(settingsData);
          }
        } catch {
          // Settings fetch failed, use defaults
        }

        // Set theme
        const themeId = data.subscriptionTheme || settings.defaultSubscriptionTheme || 'dark';
        setTheme(getTheme(themeId));

        // Generate QR code
        if (data.accessUrl) {
          const qr = await QRCode.toDataURL(data.accessUrl, {
            width: 200,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });
          setQrCode(qr);
        }

        setLoading(false);
      } catch (err) {
        setError('Failed to load subscription');
        setLoading(false);
      }
    }

    fetchData();
  }, [token, settings.defaultSubscriptionTheme]);

  // Update theme when keyData changes
  useEffect(() => {
    if (keyData) {
      const themeId = keyData.subscriptionTheme || settings.defaultSubscriptionTheme || 'dark';
      setTheme(getTheme(themeId));
    }
  }, [keyData, settings.defaultSubscriptionTheme]);

  // Detect platform on mount
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setPlatform('android');
    } else {
      setPlatform('windows');
    }
  }, []);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes: string | number): string => {
    const b = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTimeRemaining = (expiresAt: string | null): string => {
    if (!expiresAt) return 'Never expires';
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getUsagePercent = (): number => {
    if (!keyData?.dataLimitBytes) return 0;
    const used = parseFloat(keyData.usedBytes);
    const limit = parseFloat(keyData.dataLimitBytes);
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  const getCountryFlag = (countryCode: string | null): string => {
    if (!countryCode) return '🌐';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  const handleAddToApp = (appId: string) => {
    const app = clientApps.find((a) => a.id === appId);
    if (!app || !keyData?.accessUrl) return;

    const url = app.urlScheme(keyData.accessUrl);
    window.location.href = url;
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: theme.bgPrimary }}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
          style={{ borderColor: theme.accent, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: theme.bgPrimary }}
      >
        <div
          className="text-center p-8 rounded-2xl max-w-md"
          style={{ backgroundColor: theme.bgCard }}
        >
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: theme.textPrimary }}>
            {error}
          </h1>
          <p style={{ color: theme.textMuted }}>
            This subscription link may be invalid, expired, or deactivated.
          </p>
        </div>
      </div>
    );
  }

  if (!keyData) return null;

  const apps = getAppsForPlatform(platform);

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: theme.bgPrimary }}
    >
      <div className="max-w-md mx-auto space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Data Usage Card */}
          <div
            className="p-4 rounded-2xl"
            style={{ backgroundColor: theme.bgCard }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📊</span>
              <span style={{ color: theme.textMuted }} className="text-sm">
                Data Usage
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: theme.textPrimary }}>
              {formatBytes(keyData.usedBytes)}
            </div>
            {keyData.dataLimitBytes && (
              <div className="mt-2">
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: theme.progressBg }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${getUsagePercent()}%`,
                      backgroundColor: theme.progressFill,
                    }}
                  />
                </div>
                <div className="text-xs mt-1" style={{ color: theme.textMuted }}>
                  of {formatBytes(keyData.dataLimitBytes)}
                </div>
              </div>
            )}
          </div>

          {/* Time Remaining Card */}
          <div
            className="p-4 rounded-2xl"
            style={{ backgroundColor: theme.bgCard }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⏱️</span>
              <span style={{ color: theme.textMuted }} className="text-sm">
                Time Left
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: theme.textPrimary }}>
              {getTimeRemaining(keyData.expiresAt)}
            </div>
          </div>
        </div>

        {/* Server Info Card */}
        <div
          className="p-4 rounded-2xl"
          style={{ backgroundColor: theme.bgCard }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">
                {getCountryFlag(keyData.server.countryCode)}
              </span>
              <div>
                <div className="font-semibold" style={{ color: theme.textPrimary }}>
                  {keyData.server.name}
                </div>
                {keyData.server.location && (
                  <div className="text-sm" style={{ color: theme.textMuted }}>
                    {keyData.server.location}
                  </div>
                )}
              </div>
            </div>
            <div
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{
                backgroundColor: keyData.status === 'ACTIVE' ? theme.success + '20' : theme.warning + '20',
                color: keyData.status === 'ACTIVE' ? theme.success : theme.warning,
              }}
            >
              {keyData.status === 'ACTIVE' ? '● Online' : keyData.status}
            </div>
          </div>
        </div>

        {/* Platform Tabs */}
        <div className="flex gap-2">
          {(['android', 'ios', 'windows'] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className="flex-1 py-3 rounded-full font-medium transition-all"
              style={{
                backgroundColor: platform === p ? theme.tabActive : theme.tabInactive,
                color: platform === p ? theme.tabActiveText : theme.tabInactiveText,
              }}
            >
              {p === 'android' ? 'Android' : p === 'ios' ? 'iOS' : 'Windows'}
            </button>
          ))}
        </div>

        {/* App Type Selector */}
        <div
          className="p-1 rounded-full flex gap-1"
          style={{ backgroundColor: theme.bgCard }}
        >
          {(['outline', 'hiddify'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setAppType(type)}
              className="flex-1 py-2 rounded-full font-medium transition-all flex items-center justify-center gap-2"
              style={{
                backgroundColor: appType === type ? theme.bgPrimary : 'transparent',
                color: appType === type ? theme.textPrimary : theme.textMuted,
              }}
            >
              <span>▶</span>
              {type === 'outline' ? 'Outline' : 'Hiddify'}
            </button>
          ))}
        </div>

        {/* Quick Connect Buttons */}
        <div className="space-y-3">
          {/* Copy URL Button */}
          <button
            onClick={() => copyToClipboard(keyData.accessUrl)}
            className="w-full py-4 rounded-2xl font-semibold transition-all"
            style={{
              background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
              color: '#ffffff',
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy Connection URL'}
          </button>

          {/* App-specific buttons */}
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => handleAddToApp(app.id)}
              className="w-full py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${theme.buttonGradientFrom}dd, ${theme.buttonGradientTo}dd)`,
                color: '#ffffff',
              }}
            >
              <span>{app.icon}</span>
              Add to {app.name}
            </button>
          ))}
        </div>

        {/* QR Code Section */}
        {qrCode && (
          <div
            className="p-6 rounded-2xl text-center"
            style={{ backgroundColor: theme.bgCard }}
          >
            <h3 className="font-semibold mb-4" style={{ color: theme.textPrimary }}>
              Scan QR Code
            </h3>
            <div className="inline-block p-3 bg-white rounded-xl">
              <img src={qrCode} alt="QR Code" className="w-48 h-48" />
            </div>
            <p className="mt-3 text-sm" style={{ color: theme.textMuted }}>
              Scan with your VPN app to connect
            </p>
          </div>
        )}

        {/* Connection Details */}
        <div
          className="p-4 rounded-2xl space-y-3"
          style={{ backgroundColor: theme.bgCard }}
        >
          <h3 className="font-semibold" style={{ color: theme.textPrimary }}>
            Connection Details
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div style={{ color: theme.textMuted }}>Port</div>
              <div style={{ color: theme.textPrimary }}>{keyData.port || 'Auto'}</div>
            </div>
            <div>
              <div style={{ color: theme.textMuted }}>Encryption</div>
              <div style={{ color: theme.textPrimary }}>{keyData.method || 'Auto'}</div>
            </div>
          </div>
        </div>

        {/* Support Button */}
        {settings.supportLink && (
          <a
            href={settings.supportLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-4 rounded-full font-semibold text-center transition-all"
            style={{
              backgroundColor: theme.bgCard,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
            }}
          >
            💬 Contact Support
          </a>
        )}

        {/* Footer */}
        <div className="text-center text-sm" style={{ color: theme.textMuted }}>
          <p>Powered by Atomic-UI</p>
        </div>
      </div>
    </div>
  );
}
