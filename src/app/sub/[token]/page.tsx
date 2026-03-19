'use client';

/**
 * Subscription Page
 *
 * Beautiful themed subscription page for VPN users with full customization support.
 * Displays key information, usage stats, and quick-connect buttons.
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  HardDrive,
  MapPin,
  MessageCircle,
  QrCode,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';

// Atomic logo as SVG data URL (simple atom symbol)
const ATOMIC_LOGO_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8b5cf6"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="45" fill="white"/>
  <circle cx="50" cy="50" r="40" fill="url(#grad)" opacity="0.1"/>
  <g fill="none" stroke="url(#grad)" stroke-width="2.5">
    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(0 50 50)"/>
    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(60 50 50)"/>
    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(120 50 50)"/>
  </g>
  <circle cx="50" cy="50" r="8" fill="url(#grad)"/>
  <circle cx="50" cy="50" r="4" fill="white"/>
</svg>
`)}`;

import {
  SUBSCRIPTION_EVENT_TYPES,
  type SubscriptionEventType,
} from '@/lib/services/subscription-events';
import {
  getTheme,
  clientApps,
  defaultBranding,
  prioritizeSubscriptionApps,
  type SubscriptionTheme,
  type SubscriptionBranding,
  type CustomApp,
} from '@/lib/subscription-themes';

type Platform = 'android' | 'ios' | 'windows';

interface ContactLink {
  type: 'telegram' | 'discord' | 'whatsapp' | 'phone' | 'email' | 'website' | 'facebook';
  value: string;
}

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
  coverImage: string | null;
  coverImageType: string | null;
  method: string | null;
  port: number | null;
  contactLinks: ContactLink[] | null;
  subscriptionWelcomeMessage: string | null;
}

interface SettingsData {
  supportLink?: string;
  defaultSubscriptionTheme?: string;
  branding?: SubscriptionBranding;
}

interface ManualSetupGuide {
  title: string;
  summary: string;
  steps: string[];
  tip: string;
}

// Contact type icons and colors
const contactConfig: Record<string, { icon: string; color: string; label: string }> = {
  telegram: { icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2s-.18-.05-.26-.03c-.11.02-1.93 1.23-5.46 3.62-.52.36-.99.53-1.41.52-.46-.01-1.35-.26-2.01-.48-.81-.27-1.45-.42-1.4-.88.03-.24.37-.49 1.02-.75 4.02-1.75 6.7-2.91 8.03-3.46 3.83-1.6 4.62-1.88 5.14-1.89.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z', color: '#0088cc', label: 'Telegram' },
  discord: { icon: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z', color: '#5865F2', label: 'Discord' },
  whatsapp: { icon: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z', color: '#25D366', label: 'WhatsApp' },
  phone: { icon: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z', color: '#10b981', label: 'Phone' },
  email: { icon: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z', color: '#ea580c', label: 'Email' },
  website: { icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z', color: '#3b82f6', label: 'Website' },
  facebook: { icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z', color: '#1877F2', label: 'Facebook' },
};

function getManualSetupGuide(platform: Platform, appName?: string | null): ManualSetupGuide {
  const clientName = appName || 'your VPN client';

  switch (platform) {
    case 'ios':
      return {
        title: `Use ${clientName} on iPhone / iPad`,
        summary: `Install ${clientName} first, then import the connection directly or scan the QR code if Safari does not hand off automatically.`,
        steps: [
          `Install ${clientName} from the App Store if it is not already on this device.`,
          `Tap "Open in ${clientName}" below. If iOS stays in Safari, copy the connection URL and import it from inside ${clientName}.`,
          'If direct import still fails, scan the QR code or paste the connection URL manually in the app.',
        ],
        tip: 'On iOS, app handoff usually works only after the client is already installed.',
      };
    case 'windows':
      return {
        title: `Import into ${clientName} on Windows`,
        summary: `Desktop clients are usually more reliable with paste/import than with QR. Use the connection URL first, then fall back to the subscription page link if the client supports it.`,
        steps: [
          `Install ${clientName} on this computer if you have not already.`,
          `Use "Copy URL" below and paste it into ${clientName} using its import or add-server action.`,
          'If the client supports subscription pages, use the subscription page link as the long-term update source.',
        ],
        tip: 'QR import is mainly useful on mobile. On Windows, manual paste is the dependable fallback.',
      };
    default:
      return {
        title: `Use ${clientName} on Android`,
        summary: `Android usually supports direct app handoff. If the app is missing, install it first, then retry the open button or use the QR code.`,
        steps: [
          `Install ${clientName} from Google Play if it is not already on this device.`,
          `Tap "Open in ${clientName}" below. If the app does not open, copy the connection URL and import it from inside ${clientName}.`,
          'If import still fails, scan the QR code or paste the connection URL manually.',
        ],
        tip: 'Most Android clients can import either from the deep link, clipboard, or QR code.',
      };
  }
}

function getPlatformStoreUrl(
  app: { storeUrl?: string | { android?: string; ios?: string; windows?: string; macos?: string } } | null | undefined,
  platform: Platform,
): string | null {
  if (!app?.storeUrl) {
    return null;
  }

  if (typeof app.storeUrl === 'string') {
    return app.storeUrl;
  }

  return app.storeUrl[platform] || null;
}

// Animated background components
function GradientBackground({ theme }: { theme: SubscriptionTheme }) {
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        className="absolute inset-0 animate-gradient-shift"
        style={{
          background: `linear-gradient(-45deg, ${theme.bgPrimary}, ${theme.accent}30, ${theme.buttonGradientFrom}30, ${theme.bgSecondary})`,
          backgroundSize: '400% 400%',
        }}
      />
    </div>
  );
}

function ParticlesBackground({ theme }: { theme: SubscriptionTheme }) {
  const particles = useMemo(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      size: Math.random() * 4 + 2,
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: Math.random() * 20 + 10,
      delay: Math.random() * 5,
    })),
    []
  );

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor: theme.bgPrimary }}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            backgroundColor: theme.accent,
            opacity: 0.3,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function WavesBackground({ theme }: { theme: SubscriptionTheme }) {
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor: theme.bgPrimary }}>
      <svg
        className="absolute bottom-0 w-full h-64 animate-wave"
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
      >
        <path
          fill={theme.accent}
          fillOpacity="0.2"
          d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
        />
      </svg>
      <svg
        className="absolute bottom-0 w-full h-48 animate-wave-slow"
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
      >
        <path
          fill={theme.buttonGradientFrom}
          fillOpacity="0.15"
          d="M0,64L48,80C96,96,192,128,288,128C384,128,480,96,576,90.7C672,85,768,107,864,144C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
        />
      </svg>
    </div>
  );
}

export default function SubscriptionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = (params.token || params.slug) as string;
  const sourceParam = searchParams.get('source');

  const [keyData, setKeyData] = useState<KeyData | null>(null);
  const [settings, setSettings] = useState<SettingsData>({});
  // Detect system dark mode preference for default theme
  const [systemPrefersDark, setSystemPrefersDark] = useState(true);
  const [themeId, setThemeId] = useState<string>('dark');
  const [theme, setTheme] = useState<SubscriptionTheme>(getTheme('dark'));
  const [branding, setBranding] = useState<SubscriptionBranding>(defaultBranding);
  const [platform, setPlatform] = useState<Platform>(() => {
    if (typeof window === 'undefined') {
      return 'android';
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      return 'ios';
    }
    if (/android/.test(userAgent)) {
      return 'android';
    }
    return 'windows';
  });
  const [qrCode, setQrCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [showAdvancedManualSetup, setShowAdvancedManualSetup] = useState(false);
  const [showAllApps, setShowAllApps] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState<ContactLink | null>(null);
  const [usageAlert, setUsageAlert] = useState<number | null>(null);
  const [refreshingUsage, setRefreshingUsage] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [pageViewLogged, setPageViewLogged] = useState(false);

  const trackSubscriptionEvent = useCallback(async (
    eventType: SubscriptionEventType,
    metadata?: Record<string, unknown>,
    eventPlatform?: string | null,
  ) => {
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      await fetch(`${basePath}/api/subscription/${token}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType,
          source: sourceParam,
          platform: eventPlatform ?? null,
          metadata,
        }),
      });
    } catch {
      // Tracking should never interrupt the page flow.
    }
  }, [sourceParam, token]);

  // Listen for system color scheme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Toggle between dark and light (only for generic dark/light themes)
  const handleThemeToggle = () => {
    const newId = themeId === 'dark' ? 'light' : themeId === 'light' ? 'dark' : themeId;
    setThemeId(newId);
    setTheme(getTheme(newId));
  };

  const isDarkTheme = themeId !== 'light';

  // Generate QR code with logo overlay
  async function generateQRCode(accessUrl: string, logoUrl: string, logoSizePercent: number) {
    const qrCanvas = document.createElement('canvas');
    const qrSize = 200;
    qrCanvas.width = qrSize;
    qrCanvas.height = qrSize;

    await QRCode.toCanvas(qrCanvas, accessUrl, {
      width: qrSize,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    const ctx = qrCanvas.getContext('2d');
    if (ctx) {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.onload = () => {
        const logoSize = qrSize * (logoSizePercent / 100);
        const logoX = (qrSize - logoSize) / 2;
        const logoY = (qrSize - logoSize) / 2;

        ctx.beginPath();
        ctx.arc(qrSize / 2, qrSize / 2, logoSize / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        setQrCode(qrCanvas.toDataURL('image/png'));
      };
      logoImg.onerror = () => {
        setQrCode(qrCanvas.toDataURL('image/png'));
      };
      logoImg.src = logoUrl;
    } else {
      setQrCode(qrCanvas.toDataURL('image/png'));
    }
  }

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

        // Fetch settings for support link, default theme, and branding
        let settingsData: SettingsData = {};
        try {
          const settingsRes = await fetch(`${basePath}/api/subscription/${token}/settings`);
          if (settingsRes.ok) {
            settingsData = await settingsRes.json();
            setSettings(settingsData);
            if (settingsData.branding) {
              setBranding({ ...defaultBranding, ...settingsData.branding });
            }
          }
        } catch {
          // Settings fetch failed, use defaults
        }

        // Theme is resolved by the separate useEffect that watches keyData + systemPrefersDark

        // Generate QR code
        if (data.accessUrl) {
          const logoUrl = settingsData.branding?.logoUrl || ATOMIC_LOGO_SVG;
          const logoSize = settingsData.branding?.logoSize || 25;
          await generateQRCode(data.accessUrl, logoUrl, logoSize);
        }

        setLastUpdatedAt(Date.now());
        setLoading(false);
      } catch (err) {
        setError('Failed to load subscription');
        setLoading(false);
      }
    }

    fetchData();
  }, [token, trackSubscriptionEvent]);

  // Update theme when keyData or system preference changes
  useEffect(() => {
    if (keyData) {
      const resolvedId = keyData.subscriptionTheme
        || settings.defaultSubscriptionTheme
        || (systemPrefersDark ? 'dark' : 'light');
      setThemeId(resolvedId);
      setTheme(getTheme(resolvedId));
    }
  }, [keyData, settings.defaultSubscriptionTheme, systemPrefersDark]);

  // Check usage alerts
  useEffect(() => {
    if (keyData && branding.showUsageAlerts && branding.usageAlertThresholds) {
      // Calculate usage percent inline to avoid dependency issues
      let percent = 0;
      if (keyData.dataLimitBytes) {
        const used = parseFloat(keyData.usedBytes);
        const limit = parseFloat(keyData.dataLimitBytes);
        percent = Math.min(Math.round((used / limit) * 100), 100);
      }
      const thresholds = [...branding.usageAlertThresholds].sort((a, b) => b - a);
      for (const threshold of thresholds) {
        if (percent >= threshold) {
          setUsageAlert(threshold);
          break;
        }
      }
    }
  }, [keyData, branding.showUsageAlerts, branding.usageAlertThresholds]);

  useEffect(() => {
    if (!feedback) return;
    const timeoutId = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!showManualSetup) {
      setShowAdvancedManualSetup(false);
    }
  }, [showManualSetup]);

  useEffect(() => {
    if (showManualSetup) {
      void trackSubscriptionEvent(
        SUBSCRIPTION_EVENT_TYPES.OPEN_QR,
        { context: 'manual_setup' },
        platform,
      );
    }
  }, [platform, showManualSetup, trackSubscriptionEvent]);

  useEffect(() => {
    if (!keyData || pageViewLogged) {
      return;
    }

    void trackSubscriptionEvent(
      SUBSCRIPTION_EVENT_TYPES.PAGE_VIEW,
      { status: keyData.status },
      platform,
    );
    setPageViewLogged(true);
  }, [keyData, pageViewLogged, platform, trackSubscriptionEvent]);

  const copyToClipboard = async (
    text: string,
    successMessage = 'Copied to clipboard',
    eventMetadata?: Record<string, unknown>,
  ) => {
    if (!text) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setFeedback(successMessage);
        if (eventMetadata) {
          void trackSubscriptionEvent(SUBSCRIPTION_EVENT_TYPES.COPY_URL, eventMetadata, platform);
        }
        return;
      }
    } catch (err) {
      console.warn("Clipboard API failed, trying fallback...", err);
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        setFeedback(successMessage);
        if (eventMetadata) {
          void trackSubscriptionEvent(SUBSCRIPTION_EVENT_TYPES.COPY_URL, eventMetadata, platform);
        }
        return;
      }
    } catch (err) {
      console.error("Fallback clipboard failed", err);
    }

    alert(`Copy failed. Please copy manually:\n\n${text}`);
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
    if (!expiresAt) return 'Unlimited';
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

  const getLastUpdatedLabel = (): string => {
    if (!lastUpdatedAt) return 'Not checked yet';

    const diffSeconds = Math.floor((Date.now() - lastUpdatedAt) / 1000);
    if (diffSeconds < 10) return 'Updated just now';
    if (diffSeconds < 60) return `Updated ${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    return `Updated ${diffHours}h ago`;
  };

  const getCountryFlag = (countryCode: string | null): string => {
    if (!countryCode) return '';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  // Get enabled apps (built-in + custom)
  const getEnabledApps = () => {
    const enabledIds = branding.enabledApps || defaultBranding.enabledApps!;
    const builtInApps = clientApps.filter(
      (app) => enabledIds.includes(app.id) && app.platforms.includes(platform)
    );

    const customApps = (branding.customApps || [])
      .filter((app) => app.platforms.includes(platform))
      .map((app) => ({
        ...app,
        urlScheme: (accessUrl: string) => app.urlScheme.replace('{url}', encodeURIComponent(accessUrl)),
      }));

    return prioritizeSubscriptionApps(
      [...builtInApps, ...customApps],
      enabledIds,
      branding.primaryAppId,
    );
  };

  const handleAddToApp = (appId: string) => {
    const allApps = [...clientApps, ...(branding.customApps || [])];
    const app = allApps.find((a) => a.id === appId);
    if (!app || !keyData?.accessUrl) return;

    let url: string;
    if ('urlScheme' in app && typeof app.urlScheme === 'function') {
      url = app.urlScheme(keyData.accessUrl);
    } else if ('urlScheme' in app && typeof app.urlScheme === 'string') {
      url = (app as CustomApp).urlScheme.replace('{url}', encodeURIComponent(keyData.accessUrl));
    } else {
      url = keyData.accessUrl;
    }
    void trackSubscriptionEvent(
      SUBSCRIPTION_EVENT_TYPES.OPEN_APP,
      {
        appId,
        destination: url,
      },
      platform,
    );
    window.location.href = url;
  };

  const refreshUsage = async () => {
    try {
      setRefreshingUsage(true);
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const response = await fetch(`${basePath}/api/subscription/${token}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to refresh subscription');
      }

      const data = await response.json();
      setKeyData(data);

      if (data.accessUrl && data.accessUrl !== keyData?.accessUrl) {
        const logoUrl = branding.logoUrl || ATOMIC_LOGO_SVG;
        const logoSize = branding.logoSize || 25;
        await generateQRCode(data.accessUrl, logoUrl, logoSize);
      }

      setLastUpdatedAt(Date.now());
      setFeedback('Usage refreshed');
    } catch {
      setFeedback('Refresh failed');
    } finally {
      setRefreshingUsage(false);
    }
  };

  const getPlatformLabel = (value: Platform): string => {
    if (value === 'ios') return 'iPhone / iPad';
    if (value === 'windows') return 'Windows';
    return 'Android';
  };

  const handleContactClick = (contact: ContactLink) => {
    setShowContactPopup(contact);
  };

  const getContactUrl = (contact: ContactLink): string => {
    switch (contact.type) {
      case 'telegram':
        return contact.value.startsWith('http') ? contact.value : `https://t.me/${contact.value}`;
      case 'whatsapp':
        return contact.value.startsWith('http') ? contact.value : `https://wa.me/${contact.value.replace(/[^0-9]/g, '')}`;
      case 'discord':
        return contact.value.startsWith('http') ? contact.value : `https://discord.gg/${contact.value}`;
      case 'email':
        return `mailto:${contact.value}`;
      case 'phone':
        return `tel:${contact.value}`;
      case 'website':
      case 'facebook':
        return contact.value.startsWith('http') ? contact.value : `https://${contact.value}`;
      default:
        return contact.value;
    }
  };

  // Get card border radius based on cardStyle
  const getCardRadius = () => {
    switch (branding.cardStyle) {
      case 'sharp':
        return 'rounded-lg';
      case 'pill':
        return 'rounded-3xl';
      default:
        return 'rounded-2xl';
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: theme.bgPrimary }}
      >
        <div
          className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
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
          className={`text-center p-8 ${getCardRadius()} max-w-md`}
          style={{ backgroundColor: theme.bgCard }}
        >
          <div className="text-6xl mb-4">X</div>
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

  const apps = getEnabledApps();
  const primaryApp = apps[0] ?? null;
  const visibleApps = showAllApps ? apps : apps.slice(0, 4);
  const remainingApps = Math.max(apps.length - 4, 0);
  const hasImageBackground = keyData.coverImage && keyData.coverImageType === 'url';
  const isGlassTheme = theme.id.startsWith('glass');
  const isNeonTheme = theme.id.startsWith('neon');
  const usagePercent = getUsagePercent();
  const timeRemaining = getTimeRemaining(keyData.expiresAt);
  const supportLink = settings.supportLink || null;
  const showConnectionSummary = branding.showConnectionSummary ?? true;
  const showCompatibleApps = branding.showCompatibleApps ?? true;
  const showHelpContact = branding.showHelpContact ?? true;
  const showManualSetupButton = branding.showManualSetupButton ?? true;
  const statusTone = keyData.status === 'ACTIVE'
    ? { bg: `${theme.success}18`, color: theme.success, label: 'Active' }
    : keyData.status === 'PENDING'
      ? { bg: `${theme.warning}18`, color: theme.warning, label: 'Pending' }
      : { bg: `${theme.warning}18`, color: theme.warning, label: keyData.status };
  const logoUrl = branding.logoUrl || ATOMIC_LOGO_SVG;
  const hasHelpContactContent = showHelpContact && Boolean(supportLink || keyData.contactLinks?.length);
  const installAppUrl = getPlatformStoreUrl(primaryApp, platform);
  const manualSetupGuide = getManualSetupGuide(platform, primaryApp?.name);
  const serverLabel = keyData.server.location || keyData.server.name;
  const usageHeadline = keyData.dataLimitBytes
    ? `${formatBytes(keyData.usedBytes)} / ${formatBytes(keyData.dataLimitBytes)}`
    : 'Unlimited data';
  const usageDetail = keyData.dataLimitBytes
    ? `${usagePercent}% of quota used`
    : `${formatBytes(keyData.usedBytes)} used with no quota limit`;
  const keyWelcomeMessage = keyData.subscriptionWelcomeMessage?.trim() || '';
  const effectiveWelcomeMessage = keyWelcomeMessage || branding.welcomeMessage?.trim() || '';
  const shouldShowWelcome = Boolean(keyWelcomeMessage || (branding.showWelcome && branding.welcomeMessage?.trim()));
  const footerText = branding.footerText?.trim()
    || (branding.showPoweredBy !== false ? `Powered by ${branding.brandName || 'Atomic-UI'}` : '');

  const getCardStyle = () => {
    if (hasImageBackground) {
      return {
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      };
    }
    if (isGlassTheme) {
      return {
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      };
    }
    if (isNeonTheme) {
      return {
        backgroundColor: theme.bgCard,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      };
    }
    return { backgroundColor: theme.bgCard };
  };

  const pageBackgroundColor = isGlassTheme ? '#0f172a' : theme.bgPrimary;
  const outlinedCardStyle = {
    ...getCardStyle(),
    border: hasImageBackground ? '1px solid rgba(255,255,255,0.16)' : `1px solid ${theme.border}`,
    boxShadow: hasImageBackground
      ? '0 18px 48px rgba(0,0,0,0.24)'
      : isNeonTheme
        ? `0 0 0 1px ${theme.border}, 0 20px 60px ${theme.accent}1f, inset 0 1px 0 rgba(255,255,255,0.05)`
        : '0 18px 40px rgba(15,23,42,0.08)',
  };
  const primaryTextColor = hasImageBackground ? '#ffffff' : theme.textPrimary;
  const mutedTextColor = hasImageBackground ? 'rgba(255,255,255,0.72)' : theme.textMuted;
  const controlSurface = hasImageBackground ? 'rgba(255,255,255,0.08)' : 'rgba(248,250,252,0.96)';
  const controlBorder = hasImageBackground ? 'rgba(255,255,255,0.14)' : 'rgba(148,163,184,0.24)';
  const controlButtonSurface = hasImageBackground ? 'rgba(255,255,255,0.1)' : '#ffffff';
  const controlTextColor = hasImageBackground ? '#ffffff' : '#0f172a';
  const controlMutedColor = hasImageBackground ? 'rgba(255,255,255,0.72)' : '#64748b';
  const actionFieldText = keyData.accessUrl;

  // Render animated background
  const renderAnimatedBackground = () => {
    if (hasImageBackground) return null;
    if (!branding.enableAnimations) return null;

    switch (branding.animatedBackground) {
      case 'gradient':
        return <GradientBackground theme={theme} />;
      case 'particles':
        return <ParticlesBackground theme={theme} />;
      case 'waves':
        return <WavesBackground theme={theme} />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Custom Google Font */}
      {branding.fontUrl && (
        <link href={branding.fontUrl} rel="stylesheet" />
      )}

      {/* Custom CSS injection */}
      {branding.customCss && (
        <style dangerouslySetInnerHTML={{ __html: branding.customCss }} />
      )}

      {/* Animation styles */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-shift {
          animation: gradient-shift 15s ease infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          25% { transform: translateY(-20px) translateX(10px); }
          50% { transform: translateY(0) translateX(20px); }
          75% { transform: translateY(20px) translateX(10px); }
        }
        .animate-float {
          animation: float 20s ease-in-out infinite;
        }
        @keyframes wave {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-wave {
          animation: wave 10s linear infinite;
        }
        .animate-wave-slow {
          animation: wave 15s linear infinite reverse;
        }
      `}</style>

      <div
        className="min-h-screen relative overflow-x-hidden"
        style={{
          backgroundColor: pageBackgroundColor,
          fontFamily: branding.fontFamily || 'inherit',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Animated backgrounds */}
        {renderAnimatedBackground()}

        {isNeonTheme && !hasImageBackground && (
          <>
            <div
              className="fixed inset-0"
              style={{
                background: [
                  `radial-gradient(circle at 16% 18%, ${theme.accent}22, transparent 24%)`,
                  `radial-gradient(circle at 82% 16%, ${theme.buttonGradientTo}20, transparent 20%)`,
                  `radial-gradient(circle at 52% 82%, ${theme.accent}14, transparent 22%)`,
                ].join(', '),
              }}
            />
            <div
              className="fixed inset-0 opacity-20"
              style={{
                backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
                backgroundSize: '44px 44px',
              }}
            />
          </>
        )}

        {/* Full-page background image */}
        {hasImageBackground && (
          <>
            <div
              className="fixed inset-0 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${keyData.coverImage})` }}
            />
            <div className="fixed inset-0 bg-black/60" />
          </>
        )}

        <div className="relative z-10 mx-auto w-full space-y-4 px-3 py-8 pb-safe sm:px-4 md:px-6 lg:py-10">

          {/* Dark/Light Theme Toggle */}
          {(themeId === 'dark' || themeId === 'light') && (
            <button
              onClick={handleThemeToggle}
              className="fixed top-4 right-4 z-50 p-2 rounded-full transition-all backdrop-blur-sm"
              style={{
                backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                color: isDarkTheme ? '#e4e4e7' : '#3f3f46',
              }}
              title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkTheme ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              )}
            </button>
          )}

          {feedback && (
            <div
              className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-xl"
              style={{
                backgroundColor: hasImageBackground ? 'rgba(15, 23, 42, 0.86)' : `${theme.bgCard}f2`,
                color: primaryTextColor,
                border: `1px solid ${theme.border}`,
              }}
            >
              {feedback}
            </div>
          )}

          <div className="mx-auto max-w-[68rem] space-y-4 md:px-2">
            <section className={`${getCardRadius()} w-full overflow-hidden p-4 md:p-5 lg:p-6`} style={outlinedCardStyle}>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border"
                          style={{
                            backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.14)' : theme.bgSecondary,
                            borderColor: hasImageBackground ? 'rgba(255,255,255,0.18)' : theme.border,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoUrl} alt={branding.brandName || 'Logo'} className="h-10 w-10 object-contain" />
                        </div>
                        <div className="min-w-0">
                          <div
                            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                            style={{
                              backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : `${theme.accent}14`,
                              color: hasImageBackground ? '#ffffff' : theme.accent,
                            }}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {branding.brandName || 'Atomic-UI'}
                          </div>
                          <h1 className="mt-3 text-[2rem] font-semibold tracking-tight md:text-[2.15rem]" style={{ color: primaryTextColor }}>
                            {keyData.name}
                          </h1>
                          <p className="mt-2 max-w-3xl text-sm leading-6 md:text-[15px]" style={{ color: mutedTextColor }}>
                            Connect on {serverLabel} with the app button below, or open manual setup for the QR code and raw connection URL.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-start lg:justify-end">
                      <div
                        className="inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]"
                        style={{ backgroundColor: statusTone.bg, color: statusTone.color }}
                      >
                        {statusTone.label}
                      </div>
                    </div>
                  </div>
                </div>

                {shouldShowWelcome && effectiveWelcomeMessage && (
                  <div
                    className="rounded-2xl px-4 py-3 text-sm"
                    style={{
                      backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.08)' : theme.bgSecondary,
                      color: primaryTextColor,
                    }}
                  >
                    {effectiveWelcomeMessage}
                  </div>
                )}

                <div className="grid min-w-0 gap-3.5 lg:grid-cols-[256px_minmax(0,1fr)] lg:items-stretch">
                  <div
                    className="order-2 flex min-w-0 w-full overflow-hidden h-full flex-col rounded-[1.35rem] border p-3.5 lg:order-1 lg:p-4"
                    style={{
                      backgroundColor: controlSurface,
                      borderColor: controlBorder,
                    }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMutedColor }}>
                      Quick Scan
                    </p>
                    <div
                      className="mt-3 flex flex-1 items-center justify-center rounded-[1.15rem] border p-3.5"
                      style={{
                        backgroundColor: controlButtonSurface,
                        borderColor: controlBorder,
                      }}
                    >
                      {qrCode ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrCode} alt="Connection QR Code" className="h-full w-full max-h-[156px] max-w-[156px] rounded-[0.9rem]" />
                      ) : (
                        <div className="h-[156px] w-[156px] animate-pulse rounded-[0.9rem]" style={{ backgroundColor: theme.bgSecondary }} />
                      )}
                    </div>
                    <p className="mt-3 text-sm font-medium" style={{ color: controlTextColor }}>
                      Scan with {primaryApp?.name || 'your VPN app'}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: controlMutedColor }}>
                      Fastest on mobile. If scanning fails, use the connection tools in the install card for the same URL.
                    </p>
                  </div>

                  <div
                    className="order-1 min-w-0 w-full overflow-hidden h-full rounded-[1.35rem] border p-3.5 lg:order-2 lg:p-4"
                    style={{
                      backgroundColor: controlSurface,
                      borderColor: controlBorder,
                    }}
                  >
                    <div
                      className="space-y-3.5"
                    >
                      <div
                        className="rounded-[1.1rem] border p-1"
                        style={{
                          backgroundColor: controlButtonSurface,
                          borderColor: controlBorder,
                        }}
                      >
                        <div className="grid min-w-0 grid-cols-3 gap-1">
                          {(['android', 'ios', 'windows'] as Platform[]).map((p) => (
                            <button
                              key={p}
                              onClick={() => setPlatform(p)}
                              className="min-w-0 w-full rounded-[0.9rem] px-2.5 py-2 text-[12px] font-medium leading-tight transition-all sm:px-3 sm:text-[13px]"
                              style={{
                                background: platform === p
                                  ? `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`
                                  : 'transparent',
                                color: platform === p ? '#ffffff' : controlMutedColor,
                                boxShadow: platform === p ? '0 10px 24px rgba(59,130,246,0.22)' : 'none',
                              }}
                            >
                              <span className="sm:hidden">{p === 'ios' ? 'iOS' : p === 'windows' ? 'Windows' : 'Android'}</span>
                              <span className="hidden sm:inline">{getPlatformLabel(p)}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="min-w-0 space-y-3.5">
                        <div className="min-w-0 space-y-2">
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMutedColor }}>
                              Connection URL
                            </p>
                            <button
                              onClick={() =>
                                copyToClipboard(actionFieldText, 'Connection URL copied', {
                                  target: 'connection_url',
                                  placement: 'hero_header',
                                })
                              }
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.9rem] border transition-colors"
                              style={{
                                backgroundColor: controlButtonSurface,
                                color: controlTextColor,
                                borderColor: controlBorder,
                              }}
                              aria-label="Copy connection URL"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                          <div
                            className="min-w-0 rounded-[1rem] border px-3.5 py-2.5 text-sm font-medium"
                            style={{
                              backgroundColor: controlButtonSurface,
                              borderColor: controlBorder,
                              color: controlTextColor,
                            }}
                          >
                            <p className="w-full truncate font-mono text-[12px] leading-6">
                              {actionFieldText}
                            </p>
                          </div>
                        </div>

                        {primaryApp ? (
                          <button
                            onClick={() => handleAddToApp(primaryApp.id)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[1rem] px-4 py-3 text-sm font-semibold shadow-lg"
                            style={{
                              background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                              color: '#ffffff',
                            }}
                          >
                            <span className="text-base">{primaryApp.icon}</span>
                            Open in {primaryApp.name}
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              copyToClipboard(actionFieldText, 'Connection URL copied', {
                                target: 'connection_url',
                                placement: 'hero_primary',
                              })
                            }
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[1rem] px-4 py-3 text-sm font-semibold shadow-lg"
                            style={{
                              background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                              color: '#ffffff',
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            Copy Connection URL
                          </button>
                        )}

                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                          <button
                            onClick={() =>
                              copyToClipboard(actionFieldText, 'Connection URL copied', {
                                target: 'connection_url',
                                placement: 'hero_secondary',
                              })
                            }
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[1rem] px-3.5 py-2.5 text-sm font-medium"
                            style={{
                              backgroundColor: controlButtonSurface,
                              color: controlTextColor,
                              border: `1px solid ${controlBorder}`,
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            Copy URL
                          </button>

                          {showManualSetupButton ? (
                            <button
                              onClick={() => setShowManualSetup(true)}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-[1rem] px-3.5 py-2.5 text-sm font-medium"
                              style={{
                                backgroundColor: controlButtonSurface,
                                color: controlTextColor,
                                border: `1px solid ${controlBorder}`,
                              }}
                            >
                              <QrCode className="h-4 w-4" />
                              Manual Setup
                            </button>
                          ) : null}

                          {installAppUrl ? (
                            <a
                              href={installAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full items-center justify-center gap-2 rounded-[1rem] px-3.5 py-2.5 text-sm font-medium"
                              style={{
                                backgroundColor: controlButtonSurface,
                                color: controlTextColor,
                                border: `1px solid ${controlBorder}`,
                              }}
                            >
                              <Download className="h-4 w-4" />
                              Get {primaryApp?.name ?? 'App'}
                            </a>
                          ) : null}

                          {showHelpContact && supportLink ? (
                            <a
                              href={supportLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full items-center justify-center gap-2 rounded-[1rem] px-3.5 py-2.5 text-sm font-medium"
                              style={{
                                backgroundColor: controlButtonSurface,
                                color: controlTextColor,
                                border: `1px solid ${controlBorder}`,
                              }}
                            >
                              <MessageCircle className="h-4 w-4" />
                              Get Support
                            </a>
                          ) : null}
                        </div>

                        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.25fr)_repeat(2,minmax(0,0.85fr))]">
                          <div
                            className="rounded-[1rem] border px-3.5 py-3"
                            style={{
                              backgroundColor: controlButtonSurface,
                              borderColor: controlBorder,
                            }}
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMutedColor }}>
                              Quick Tip
                            </p>
                            <p className="mt-2 text-sm leading-6" style={{ color: controlTextColor }}>
                              If the app does not open from the main button, copy the URL above and import it from inside the client, or use manual setup for the QR code.
                            </p>
                          </div>

                          <div
                            className="rounded-[1rem] border px-3.5 py-3"
                            style={{
                              backgroundColor: controlButtonSurface,
                              borderColor: controlBorder,
                            }}
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMutedColor }}>
                              Last Updated
                            </p>
                            <p className="mt-2 text-sm font-semibold" style={{ color: controlTextColor }}>
                              {getLastUpdatedLabel()}
                            </p>
                          </div>

                          <div
                            className="rounded-[1rem] border px-3.5 py-3"
                            style={{
                              backgroundColor: controlButtonSurface,
                              borderColor: controlBorder,
                            }}
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMutedColor }}>
                              Endpoint
                            </p>
                            <p className="mt-2 text-sm font-semibold" style={{ color: controlTextColor }}>
                              {serverLabel}
                            </p>
                            <p className="mt-1 text-xs" style={{ color: controlMutedColor }}>
                              {keyData.port ? `Port ${keyData.port}` : 'Ready to connect'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {usageAlert && branding.showUsageAlerts && (
                  <div
                    className="flex items-start gap-3 rounded-2xl px-4 py-3"
                    style={{
                      backgroundColor: usageAlert >= 95 ? `${theme.danger}18` : `${theme.warning}18`,
                      border: `1px solid ${usageAlert >= 95 ? `${theme.danger}44` : `${theme.warning}44`}`,
                    }}
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: usageAlert >= 95 ? theme.danger : theme.warning }}
                    />
                    <span className="text-sm" style={{ color: primaryTextColor }}>
                      {usageAlert >= 95
                        ? 'Data is almost depleted. Reconnect may stop soon if the limit is reached.'
                        : `${usageAlert}% of your available data has already been used.`}
                    </span>
                  </div>
                )}

                {showConnectionSummary && (
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,0.72fr))]">
                    <div
                      className="rounded-[1.3rem] border p-4"
                      style={{
                        backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                        borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                      }}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedTextColor }}>
                            Data Usage
                          </p>
                          <h2 className="mt-2 text-[1.7rem] font-semibold md:text-[1.85rem]" style={{ color: primaryTextColor }}>
                            {usageHeadline}
                          </h2>
                          <p className="mt-2 text-sm" style={{ color: mutedTextColor }}>
                            {usageDetail}
                          </p>
                        </div>

                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <button
                            onClick={refreshUsage}
                            disabled={refreshingUsage}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
                            style={{
                              backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.08)' : theme.bgCard,
                              color: primaryTextColor,
                              border: `1px solid ${hasImageBackground ? 'rgba(255,255,255,0.16)' : theme.border}`,
                              opacity: refreshingUsage ? 0.75 : 1,
                            }}
                          >
                            <RefreshCw className={`h-4 w-4 ${refreshingUsage ? 'animate-spin' : ''}`} />
                            {refreshingUsage ? 'Checking...' : 'Refresh usage'}
                          </button>
                          <span className="text-xs" style={{ color: mutedTextColor }}>
                            {getLastUpdatedLabel()}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ backgroundColor: theme.progressBg }}>
                        <div
                          className={`h-full rounded-full ${branding.enableAnimations ? 'transition-all duration-500' : ''}`}
                          style={{
                            width: keyData.dataLimitBytes ? `${usagePercent}%` : '100%',
                            background: `linear-gradient(90deg, ${theme.progressFill}, ${theme.buttonGradientTo})`,
                          }}
                        />
                      </div>

                      <p className="mt-3 text-sm" style={{ color: mutedTextColor }}>
                        {keyData.dataLimitBytes
                          ? `${formatBytes(keyData.usedBytes)} used of ${formatBytes(keyData.dataLimitBytes)} total`
                          : `${formatBytes(keyData.usedBytes)} used with no quota limit`}
                      </p>
                    </div>

                    <div
                      className="rounded-[1.3rem] border p-4"
                      style={{
                        backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                        borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                      }}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedTextColor }}>
                        Time Left
                      </p>
                      <p className="mt-2 text-[1.7rem] font-semibold" style={{ color: primaryTextColor }}>
                        {timeRemaining}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: mutedTextColor }}>
                        {keyData.expiresAt
                          ? `Expires on ${new Date(keyData.expiresAt).toLocaleDateString()}`
                          : 'No expiry date is set for this key.'}
                      </p>
                    </div>

                    <div
                      className="rounded-[1.3rem] border p-4"
                      style={{
                        backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                        borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                      }}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedTextColor }}>
                        Server
                      </p>
                      <p className="mt-2 text-[1.7rem] font-semibold" style={{ color: primaryTextColor }}>
                        {`${getCountryFlag(keyData.server.countryCode)} ${serverLabel}`.trim()}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: mutedTextColor }}>
                        {keyData.port ? `Port ${keyData.port}` : 'Server is ready for connection.'}
                      </p>
                    </div>
                  </div>
                )}

              </div>
            </section>

            {showCompatibleApps && apps.length > 0 && (
              <section className={`${getCardRadius()} p-5 md:p-6`} style={outlinedCardStyle}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedTextColor }}>
                      Compatible Apps
                    </p>
                    <h2 className="mt-2 text-xl font-semibold" style={{ color: primaryTextColor }}>
                      Other apps for {getPlatformLabel(platform)}
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: mutedTextColor }}>
                      The main button above is the fastest option. Use another client below if you prefer it.
                    </p>
                  </div>
                  {remainingApps > 0 && (
                    <button
                      onClick={() => setShowAllApps((prev) => !prev)}
                      className="inline-flex items-center gap-2 text-sm font-medium"
                      style={{ color: hasImageBackground ? '#ffffff' : theme.accent }}
                    >
                      {showAllApps ? 'Show fewer apps' : `Show ${remainingApps} more`}
                      <ChevronRight className={`h-4 w-4 transition-transform ${showAllApps ? 'rotate-90' : ''}`} />
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleApps.map((app) => (
                    <div
                      key={app.id}
                      className="rounded-[1.25rem] border p-3.5"
                      style={{
                        backgroundColor: controlSurface,
                        borderColor: controlBorder,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[1rem] border text-lg"
                            style={{
                              backgroundColor: controlButtonSurface,
                              borderColor: controlBorder,
                              color: controlTextColor,
                            }}
                          >
                            {app.icon}
                          </div>
                          <p className="mt-2.5 text-[15px] font-semibold" style={{ color: controlTextColor }}>{app.name}</p>
                          <p className="mt-1 text-sm" style={{ color: controlMutedColor }}>
                            Manual alternative for {getPlatformLabel(platform)} if you prefer {app.name}.
                          </p>
                        </div>

                        <div
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                          style={{
                            backgroundColor: controlButtonSurface,
                            color: controlMutedColor,
                            border: `1px solid ${controlBorder}`,
                          }}
                        >
                          Client
                        </div>
                      </div>

                      <div className="mt-3.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_46px]">
                        <button
                          onClick={() => handleAddToApp(app.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-[1rem] px-4 py-2.5 text-sm font-semibold"
                          style={{
                            background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                            color: '#ffffff',
                          }}
                        >
                          Open in {app.name}
                        </button>
                        {getPlatformStoreUrl(app, platform) && (
                          <a
                            href={getPlatformStoreUrl(app, platform) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-[1rem] border"
                            style={{
                              backgroundColor: controlButtonSurface,
                              borderColor: controlBorder,
                              color: controlTextColor,
                            }}
                            aria-label={`Get ${app.name}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span style={{ color: controlMutedColor }}>
                          Uses the same URL and import flow.
                        </span>
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 font-medium"
                          style={{
                            backgroundColor: controlButtonSurface,
                            color: controlTextColor,
                            border: `1px solid ${controlBorder}`,
                          }}
                        >
                          {getPlatformLabel(platform)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {hasHelpContactContent && (
              <section className={`${getCardRadius()} p-5 md:p-6`} style={outlinedCardStyle}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedTextColor }}>
                      Help & Contact
                    </p>
                    <h2 className="mt-2 text-xl font-semibold" style={{ color: primaryTextColor }}>
                      Need help connecting?
                    </h2>
                    <p className="mt-2 text-sm leading-6" style={{ color: mutedTextColor }}>
                      If the import button does nothing, install the recommended app first and then retry. If that still fails, use manual setup or contact support below.
                    </p>
                  </div>

                  {supportLink && (
                    <a
                      href={supportLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
                      style={{
                        backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.08)' : theme.bgSecondary,
                        color: primaryTextColor,
                        border: `1px solid ${hasImageBackground ? 'rgba(255,255,255,0.14)' : theme.border}`,
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Support
                    </a>
                  )}
                </div>

                {keyData.contactLinks && keyData.contactLinks.length > 0 && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {keyData.contactLinks.map((contact, index) => {
                      const config = contactConfig[contact.type];
                      if (!config) return null;

                      return (
                        <button
                          key={index}
                          onClick={() => handleContactClick(contact)}
                          className="flex items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-left transition-transform hover:scale-[1.01]"
                          style={{
                            backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                            borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                          }}
                        >
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                            style={{
                              backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : `${config.color}18`,
                            }}
                          >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill={hasImageBackground ? '#ffffff' : config.color}>
                              <path d={config.icon} />
                            </svg>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium" style={{ color: primaryTextColor }}>
                              {config.label}
                            </span>
                            <span className="block truncate text-sm" style={{ color: mutedTextColor }}>
                              {contact.value}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {footerText && (
              <div className="px-2 text-center text-xs" style={{ color: mutedTextColor }}>
                {footerText}
              </div>
            )}
          </div>
        </div>

        {showManualSetup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setShowManualSetup(false)}
          >
            <div
              className={`max-h-[90vh] w-full max-w-3xl overflow-y-auto ${getCardRadius()} p-5 md:p-6`}
              style={{
                ...outlinedCardStyle,
                backgroundColor: hasImageBackground ? 'rgba(15,23,42,0.92)' : theme.bgCard,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedTextColor }}>
                    Manual Setup
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold" style={{ color: primaryTextColor }}>
                    Import this connection yourself
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm" style={{ color: mutedTextColor }}>
                    Scan the QR code or copy the connection URL below into your client manually.
                  </p>
                </div>
                <button
                  onClick={() => setShowManualSetup(false)}
                  className="rounded-full p-2"
                  style={{
                    backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.08)' : theme.bgSecondary,
                    color: primaryTextColor,
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                  <div
                    className="rounded-[1.45rem] border p-5"
                    style={{
                      backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                      borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                    }}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: mutedTextColor }}>
                          Quick Start
                        </p>
                        <h3 className="mt-2 text-xl font-semibold" style={{ color: primaryTextColor }}>
                          {manualSetupGuide.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6" style={{ color: mutedTextColor }}>
                          {manualSetupGuide.summary}
                        </p>
                      </div>
                      <div
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]"
                        style={{
                          backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.08)' : theme.bgCardHover,
                          color: primaryTextColor,
                        }}
                      >
                        {getPlatformLabel(platform)}
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {manualSetupGuide.steps.map((step, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: theme.accent,
                              color: theme.accentText,
                            }}
                          >
                            {index + 1}
                          </div>
                          <p className="pt-0.5 text-sm leading-6" style={{ color: primaryTextColor }}>
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div
                      className="mt-5 rounded-[1.1rem] border px-4 py-3 text-sm"
                      style={{
                        backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.04)' : theme.bgCard,
                        borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                        color: primaryTextColor,
                      }}
                    >
                      <span className="font-medium">Tip:</span>{' '}
                      <span style={{ color: mutedTextColor }}>{manualSetupGuide.tip}</span>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {installAppUrl && (
                        <a
                          href={installAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
                          style={{
                            backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.08)' : theme.bgCardHover,
                            color: primaryTextColor,
                          }}
                        >
                          <Download className="h-4 w-4" />
                          Get {primaryApp?.name || 'App'}
                        </a>
                      )}
                      {primaryApp && (
                        <button
                          onClick={() => handleAddToApp(primaryApp.id)}
                          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
                          style={{
                            background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                            color: '#ffffff',
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open in {primaryApp.name}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          copyToClipboard(keyData.accessUrl, 'Connection URL copied', {
                            target: 'connection_url',
                            placement: 'manual_setup_primary',
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
                        style={{
                          backgroundColor: theme.accent,
                          color: theme.accentText,
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Copy URL
                      </button>
                    </div>
                  </div>

                  <div
                    className="rounded-[1.35rem] border p-4"
                    style={{
                      backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                      borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium" style={{ color: primaryTextColor }}>Connection URL</p>
                        <p className="mt-2 text-sm leading-6 break-all font-mono" style={{ color: mutedTextColor }}>
                          {keyData.accessUrl}
                        </p>
                        <p className="mt-3 text-sm" style={{ color: mutedTextColor }}>
                          Paste this directly into the client if the app does not open automatically.
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(keyData.accessUrl, 'Connection URL copied', {
                            target: 'connection_url',
                            placement: 'manual_setup_card',
                          })
                        }
                        className="rounded-full p-2"
                        style={{ backgroundColor: theme.accent, color: theme.accentText }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    className="rounded-[1.35rem] border p-4"
                    style={{
                      backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                      borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowAdvancedManualSetup((prev) => !prev)}
                      className="flex w-full items-center justify-between gap-4 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: primaryTextColor }}>Advanced connection details</p>
                        <p className="mt-1 text-sm" style={{ color: mutedTextColor }}>
                          Show encryption, server, port, and the current key status.
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${showAdvancedManualSetup ? 'rotate-180' : ''}`}
                        style={{ color: primaryTextColor }}
                      />
                    </button>

                    {showAdvancedManualSetup && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div
                          className="rounded-[1.1rem] border p-4"
                          style={{
                            backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.04)' : theme.bgCard,
                            borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                          }}
                        >
                          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: mutedTextColor }}>Server</p>
                          <p className="mt-2 text-sm font-medium break-all" style={{ color: primaryTextColor }}>
                            {`${getCountryFlag(keyData.server.countryCode)} ${keyData.server.name}`.trim() || '-'}
                          </p>
                        </div>
                        <div
                          className="rounded-[1.1rem] border p-4"
                          style={{
                            backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.04)' : theme.bgCard,
                            borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                          }}
                        >
                          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: mutedTextColor }}>Method</p>
                          <p className="mt-2 text-sm font-medium break-all" style={{ color: primaryTextColor }}>{keyData.method || '-'}</p>
                        </div>
                        <div
                          className="rounded-[1.1rem] border p-4"
                          style={{
                            backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.04)' : theme.bgCard,
                            borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                          }}
                        >
                          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: mutedTextColor }}>Port</p>
                          <p className="mt-2 text-sm font-medium" style={{ color: primaryTextColor }}>{keyData.port || '-'}</p>
                        </div>
                        <div
                          className="rounded-[1.1rem] border p-4"
                          style={{
                            backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.04)' : theme.bgCard,
                            borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                          }}
                        >
                          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: mutedTextColor }}>Status</p>
                          <p className="mt-2 text-sm font-medium" style={{ color: primaryTextColor }}>{statusTone.label}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div
                    className="rounded-[1.5rem] border p-4 text-center"
                    style={{
                      backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                      borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                    }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: mutedTextColor }}>
                      QR Code
                    </p>
                    <div className={`mx-auto mt-4 inline-block bg-white p-2 ${getCardRadius()}`}>
                      {qrCode ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrCode} alt="QR Code" className="h-44 w-44" />
                        </>
                      ) : (
                        <div className="flex h-44 w-44 items-center justify-center text-sm text-slate-500">
                          QR unavailable
                        </div>
                      )}
                    </div>
                    <p className="mt-4 text-sm" style={{ color: mutedTextColor }}>
                      Scan this with your VPN app if it supports QR import.
                    </p>
                  </div>

                  <div
                    className="rounded-[1.35rem] border p-4"
                    style={{
                      backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.06)' : theme.bgSecondary,
                      borderColor: hasImageBackground ? 'rgba(255,255,255,0.12)' : theme.border,
                    }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: mutedTextColor }}>
                      Live Status
                    </p>
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span style={{ color: mutedTextColor }}>Usage</span>
                        <span className="font-medium" style={{ color: primaryTextColor }}>{usageHeadline}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span style={{ color: mutedTextColor }}>Time left</span>
                        <span className="font-medium" style={{ color: primaryTextColor }}>{timeRemaining}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span style={{ color: mutedTextColor }}>Server</span>
                        <span className="font-medium text-right" style={{ color: primaryTextColor }}>
                          {`${getCountryFlag(keyData.server.countryCode)} ${serverLabel}`.trim()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={refreshUsage}
                      disabled={refreshingUsage}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
                      style={{
                        backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.08)' : theme.bgCardHover,
                        color: primaryTextColor,
                        opacity: refreshingUsage ? 0.75 : 1,
                      }}
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshingUsage ? 'animate-spin' : ''}`} />
                      {refreshingUsage ? 'Checking...' : 'Refresh usage'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contact Popup */}
        {showContactPopup && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowContactPopup(null)}
          >
            <div
              className={`p-6 ${getCardRadius()} max-w-sm w-full`}
              style={{ backgroundColor: theme.bgCard }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: contactConfig[showContactPopup.type]?.color + '20' }}
                >
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill={contactConfig[showContactPopup.type]?.color}>
                    <path d={contactConfig[showContactPopup.type]?.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: theme.textPrimary }}>
                    {contactConfig[showContactPopup.type]?.label}
                  </h3>
                  <p className="text-sm" style={{ color: theme.textMuted }}>
                    {showContactPopup.value}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(showContactPopup.value)}
                  className={`flex-1 py-3 ${getCardRadius()} font-medium text-sm`}
                  style={{
                    backgroundColor: theme.bgSecondary,
                    color: theme.textPrimary,
                  }}
                >
                  Copy
                </button>
                <a
                  href={getContactUrl(showContactPopup)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 py-3 ${getCardRadius()} font-medium text-sm text-center`}
                  style={{
                    background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                    color: '#ffffff',
                  }}
                >
                  Open
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
