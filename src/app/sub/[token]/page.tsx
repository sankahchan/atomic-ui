'use client';

/**
 * Subscription Page
 *
 * Beautiful themed subscription page for VPN users with full customization support.
 * Displays key information, usage stats, and quick-connect buttons.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';

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
  getTheme,
  clientApps,
  defaultBranding,
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
}

interface SettingsData {
  supportLink?: string;
  defaultSubscriptionTheme?: string;
  branding?: SubscriptionBranding;
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
  const token = params.token as string;

  const [keyData, setKeyData] = useState<KeyData | null>(null);
  const [settings, setSettings] = useState<SettingsData>({});
  const [theme, setTheme] = useState<SubscriptionTheme>(getTheme('dark'));
  const [branding, setBranding] = useState<SubscriptionBranding>(defaultBranding);
  const [platform, setPlatform] = useState<Platform>('android');
  const [qrCode, setQrCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState<ContactLink | null>(null);
  const [usageAlert, setUsageAlert] = useState<number | null>(null);

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

        // Set theme
        const themeId = data.subscriptionTheme || settingsData.defaultSubscriptionTheme || 'dark';
        setTheme(getTheme(themeId));

        // Generate QR code
        if (data.accessUrl) {
          const logoUrl = settingsData.branding?.logoUrl || ATOMIC_LOGO_SVG;
          const logoSize = settingsData.branding?.logoSize || 25;
          await generateQRCode(data.accessUrl, logoUrl, logoSize);
        }

        setLoading(false);
      } catch (err) {
        setError('Failed to load subscription');
        setLoading(false);
      }
    }

    fetchData();
  }, [token]);

  // Update theme when keyData changes
  useEffect(() => {
    if (keyData) {
      const themeId = keyData.subscriptionTheme || settings.defaultSubscriptionTheme || 'dark';
      setTheme(getTheme(themeId));
    }
  }, [keyData, settings.defaultSubscriptionTheme]);

  // Check usage alerts
  useEffect(() => {
    if (keyData && branding.showUsageAlerts && branding.usageAlertThresholds) {
      const percent = getUsagePercent();
      const thresholds = [...branding.usageAlertThresholds].sort((a, b) => b - a);
      for (const threshold of thresholds) {
        if (percent >= threshold) {
          setUsageAlert(threshold);
          break;
        }
      }
    }
  }, [keyData, branding.showUsageAlerts, branding.usageAlertThresholds]);

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
    if (!text) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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

    return [...builtInApps, ...customApps];
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
    window.location.href = url;
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
  const hasImageBackground = keyData.coverImage && keyData.coverImageType === 'url';
  const isGlassTheme = theme.id.startsWith('glass');

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
    return { backgroundColor: theme.bgCard };
  };

  const pageBackgroundColor = isGlassTheme ? '#0f172a' : theme.bgPrimary;

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

        <div className="relative z-10 max-w-md mx-auto space-y-4 px-4 py-8 pb-safe">

          {/* Welcome Message */}
          {branding.showWelcome && branding.welcomeMessage && (
            <div
              className={`p-4 ${getCardRadius()} text-center`}
              style={getCardStyle()}
            >
              <p style={{ color: hasImageBackground ? '#ffffff' : theme.textPrimary }}>
                {branding.welcomeMessage}
              </p>
            </div>
          )}

          {/* Usage Alert */}
          {usageAlert && branding.showUsageAlerts && (
            <div
              className={`p-3 ${getCardRadius()} flex items-center gap-3`}
              style={{
                backgroundColor: usageAlert >= 95 ? theme.danger + '20' : theme.warning + '20',
                borderLeft: `4px solid ${usageAlert >= 95 ? theme.danger : theme.warning}`,
              }}
            >
              <span className="text-xl">!</span>
              <span style={{ color: hasImageBackground ? '#ffffff' : theme.textPrimary }}>
                {usageAlert >= 95
                  ? 'Data almost depleted! Consider upgrading.'
                  : `${usageAlert}% of your data has been used.`}
              </span>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* Data Usage Card */}
            <div className={`p-4 ${getCardRadius()}`} style={getCardStyle()}>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: theme.accent + '20' }}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill={theme.accent}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2v-2zm0-2h2V7h-2v7z" />
                  </svg>
                </div>
              </div>
              <div className="text-xs mb-1" style={{ color: hasImageBackground ? 'rgba(255,255,255,0.7)' : theme.textMuted }}>
                Data Usage
              </div>
              <div className="text-xl font-bold" style={{ color: hasImageBackground ? '#ffffff' : theme.textPrimary }}>
                {keyData.dataLimitBytes ? (
                  <>
                    <span>{formatBytes(keyData.usedBytes)}</span>
                    <span className="text-sm font-normal" style={{ color: hasImageBackground ? 'rgba(255,255,255,0.6)' : theme.textMuted }}> / {formatBytes(keyData.dataLimitBytes)}</span>
                  </>
                ) : (
                  formatBytes(keyData.usedBytes)
                )}
              </div>
              {keyData.dataLimitBytes && (
                <div className="mt-2">
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: theme.progressBg }}
                  >
                    <div
                      className={`h-full rounded-full ${branding.enableAnimations ? 'transition-all duration-500' : ''}`}
                      style={{
                        width: `${getUsagePercent()}%`,
                        backgroundColor: theme.progressFill,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Time Remaining Card */}
            <div className={`p-4 ${getCardRadius()}`} style={getCardStyle()}>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#ec4899' + '20' }}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#ec4899">
                    <path d="M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z" />
                  </svg>
                </div>
              </div>
              <div className="text-xs mb-1" style={{ color: hasImageBackground ? 'rgba(255,255,255,0.7)' : theme.textMuted }}>
                Time Left
              </div>
              <div className="text-xl font-bold" style={{ color: hasImageBackground ? '#ffffff' : theme.textPrimary }}>
                {getTimeRemaining(keyData.expiresAt)}
              </div>
            </div>
          </div>

          {/* Server Info Card */}
          <div className={`p-4 ${getCardRadius()}`} style={getCardStyle()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">
                  {getCountryFlag(keyData.server.countryCode)}
                </span>
                <div>
                  <div className="font-semibold" style={{ color: hasImageBackground ? '#ffffff' : theme.textPrimary }}>
                    {keyData.server.name}
                  </div>
                  {keyData.server.location && (
                    <div className="text-sm" style={{ color: hasImageBackground ? 'rgba(255,255,255,0.7)' : theme.textMuted }}>
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
                {keyData.status === 'ACTIVE' ? 'ACTIVE' : keyData.status}
              </div>
            </div>
          </div>

          {/* Platform Tabs */}
          <div className="p-1 rounded-full flex" style={getCardStyle()}>
            {(['android', 'ios', 'windows'] as Platform[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`flex-1 py-2.5 rounded-full font-medium text-sm ${branding.enableAnimations ? 'transition-all' : ''}`}
                style={{
                  backgroundColor: platform === p ? theme.tabActive : 'transparent',
                  color: platform === p ? theme.tabActiveText : theme.tabInactiveText,
                }}
              >
                {p === 'android' ? 'Android' : p === 'ios' ? 'iOS' : 'Windows'}
              </button>
            ))}
          </div>

          {/* App Buttons */}
          {apps.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {apps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleAddToApp(app.id)}
                  className={`py-3 px-4 ${getCardRadius()} font-medium flex items-center justify-center gap-2 text-sm ${branding.enableAnimations ? 'transition-all hover:scale-[1.02]' : ''}`}
                  style={{
                    ...getCardStyle(),
                    color: hasImageBackground ? '#ffffff' : theme.textPrimary,
                    border: hasImageBackground ? '1px solid rgba(255,255,255,0.2)' : `1px solid ${theme.border}`,
                  }}
                >
                  <span className="text-lg">{app.icon}</span>
                  {app.name}
                </button>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <div className="space-y-2">
            <button
              onClick={() => copyToClipboard(keyData.accessUrl)}
              className={`w-full py-3.5 ${getCardRadius()} font-semibold text-sm ${branding.enableAnimations ? 'transition-all hover:scale-[1.01]' : ''}`}
              style={{
                background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                color: '#ffffff',
              }}
            >
              {copied ? 'Copied!' : 'Copy Connection URL'}
            </button>
          </div>

          {/* QR Code Section */}
          {qrCode && (
            <div className={`p-5 ${getCardRadius()} text-center`} style={getCardStyle()}>
              <h3 className="font-semibold mb-3 text-sm" style={{ color: hasImageBackground ? '#ffffff' : theme.textPrimary }}>
                Scan QR Code
              </h3>
              <div className={`inline-block p-2 bg-white ${getCardRadius()}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="QR Code" className="w-40 h-40" />
              </div>
              <p className="mt-2 text-xs" style={{ color: hasImageBackground ? 'rgba(255,255,255,0.7)' : theme.textMuted }}>
                Scan with your VPN app to connect
              </p>
            </div>
          )}

          {/* Contact Icons */}
          {keyData.contactLinks && keyData.contactLinks.length > 0 && (
            <div className="flex justify-center gap-4 py-2">
              {keyData.contactLinks.map((contact, index) => {
                const config = contactConfig[contact.type];
                if (!config) return null;
                return (
                  <button
                    key={index}
                    onClick={() => handleContactClick(contact)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${branding.enableAnimations ? 'transition-transform hover:scale-110' : ''}`}
                    style={{
                      backgroundColor: hasImageBackground ? 'rgba(255,255,255,0.15)' : config.color + '20',
                      backdropFilter: hasImageBackground ? 'blur(8px)' : undefined,
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill={hasImageBackground ? '#ffffff' : config.color}>
                      <path d={config.icon} />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-xs pt-4" style={{ color: hasImageBackground ? 'rgba(255,255,255,0.5)' : theme.textMuted }}>
            {branding.showPoweredBy !== false && (
              <p>{branding.footerText || `Powered by ${branding.brandName || 'Atomic-UI'}`}</p>
            )}
          </div>
        </div>

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
