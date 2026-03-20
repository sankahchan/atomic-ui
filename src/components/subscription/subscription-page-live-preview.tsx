"use client";

import { useState } from "react";
import { useLocale } from "@/hooks/use-locale";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  HardDrive,
  MapPin,
  MessageCircle,
  Monitor,
  QrCode,
  RefreshCw,
  Smartphone,
  Sparkles,
} from "lucide-react";
import {
  clientApps,
  defaultBranding,
  getTheme,
  prioritizeSubscriptionApps,
  type SubscriptionBranding,
} from "@/lib/subscription-themes";

const ATOMIC_LOGO_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#06b6d4"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="45" fill="white"/>
  <circle cx="50" cy="50" r="40" fill="url(#grad)" opacity="0.12"/>
  <g fill="none" stroke="url(#grad)" stroke-width="2.5">
    <ellipse cx="50" cy="50" rx="35" ry="12"/>
    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(60 50 50)"/>
    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(120 50 50)"/>
  </g>
  <circle cx="50" cy="50" r="8" fill="url(#grad)"/>
  <circle cx="50" cy="50" r="4" fill="white"/>
</svg>
`)}`;

type PreviewViewport = "desktop" | "mobile";

interface SubscriptionPageLivePreviewProps {
  themeId: string;
  branding: SubscriptionBranding;
  supportLink?: string;
}

const viewportOptions: Array<{
  id: PreviewViewport;
  labelKey: string;
  icon: typeof Monitor;
}> = [
  { id: "desktop", labelKey: "subscription.preview.desktop", icon: Monitor },
  { id: "mobile", labelKey: "subscription.preview.mobile", icon: Smartphone },
];

const radiusClasses: Record<NonNullable<SubscriptionBranding["cardStyle"]>, string> = {
  rounded: "rounded-[30px]",
  sharp: "rounded-[18px]",
  pill: "rounded-[40px]",
};

const particles = [
  { left: "10%", top: "18%", size: 8 },
  { left: "20%", top: "72%", size: 6 },
  { left: "34%", top: "24%", size: 5 },
  { left: "46%", top: "78%", size: 7 },
  { left: "63%", top: "16%", size: 6 },
  { left: "75%", top: "70%", size: 8 },
  { left: "88%", top: "32%", size: 5 },
];

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function SubscriptionPageLivePreview({
  themeId,
  branding,
  supportLink,
}: SubscriptionPageLivePreviewProps) {
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const { t } = useLocale();
  const tr = (key: string, values?: Record<string, string | number>) =>
    values ? fillTemplate(t(key), values) : t(key);

  const mergedBranding = { ...defaultBranding, ...branding };
  const theme = getTheme(themeId);
  const isMobile = viewport === "mobile";
  const isGlassTheme = theme.id.startsWith("glass");
  const isNeonTheme = theme.id.startsWith("neon");
  const radiusClass = radiusClasses[mergedBranding.cardStyle || "rounded"];
  const logoUrl = mergedBranding.logoUrl || ATOMIC_LOGO_SVG;
  const enabledAppIds = mergedBranding.enabledApps ?? defaultBranding.enabledApps ?? [];
  const apps = prioritizeSubscriptionApps(
    clientApps.filter((app) => enabledAppIds.includes(app.id)),
    enabledAppIds,
    mergedBranding.primaryAppId,
  );
  const primaryApp = apps[0] || null;
  const visibleApps = apps.slice(0, isMobile ? 2 : 4);
  const usagePercent = 88;
  const pageBackgroundColor = isGlassTheme ? "#020617" : theme.bgPrimary;
  const shellSurface = isGlassTheme ? "rgba(15, 23, 42, 0.88)" : theme.bgCard;
  const softSurface = isGlassTheme ? "rgba(15, 23, 42, 0.68)" : theme.bgSecondary;
  const borderColor = isGlassTheme ? "rgba(255,255,255,0.12)" : theme.border;
  const textPrimary = theme.textPrimary;
  const textMuted = theme.textMuted;
  const textSecondary = theme.textSecondary;
  const controlSurface = "rgba(248,250,252,0.96)";
  const controlBorder = "rgba(148,163,184,0.24)";
  const controlButtonSurface = "#ffffff";
  const controlText = "#0f172a";
  const controlMuted = "#64748b";
  const actionFieldText = "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNT...@sg.example.com:1158/#Singapore";
  const previewPaddingClass =
    mergedBranding.layout === "compact"
      ? "p-4"
      : mergedBranding.layout === "detailed"
        ? "p-5 md:p-6"
        : "p-4 md:p-5";
  const titleSizeClass =
    mergedBranding.layout === "compact"
      ? "text-[1.85rem] md:text-[1.95rem]"
      : mergedBranding.layout === "detailed"
        ? "text-[2.2rem] md:text-[2.35rem]"
        : "text-[2rem] md:text-[2.1rem]";
  const footerText =
    mergedBranding.footerText?.trim() ||
    (mergedBranding.showPoweredBy === false ? "" : defaultBranding.footerText);
  const showConnectionSummary = mergedBranding.showConnectionSummary ?? true;
  const showCompatibleApps = mergedBranding.showCompatibleApps ?? true;
  const showHelpContact = mergedBranding.showHelpContact ?? true;
  const showManualSetupButton = mergedBranding.showManualSetupButton ?? true;
  const hasHelpContactContent = showHelpContact;
  const usageHeadline = t("subscription.preview.usage_headline");
  const usageDetail = t("subscription.preview.usage_detail");
  const serverLabel = "Singapore";

  const renderBackdrop = () => (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(circle at 18% 20%, ${theme.accent}26, transparent 26%)`,
            `radial-gradient(circle at 82% 18%, ${theme.buttonGradientTo}18, transparent 24%)`,
            `linear-gradient(145deg, ${pageBackgroundColor}, ${theme.bgPrimary})`,
          ].join(", "),
        }}
      />
      {isNeonTheme && (
        <>
          <div
            className="absolute inset-0 opacity-45"
            style={{
              background: [
                `radial-gradient(circle at 16% 22%, ${theme.accent}22, transparent 24%)`,
                `radial-gradient(circle at 84% 18%, ${theme.buttonGradientTo}1f, transparent 20%)`,
                `radial-gradient(circle at 54% 84%, ${theme.accent}16, transparent 24%)`,
              ].join(", "),
            }}
          />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
              backgroundSize: "42px 42px",
            }}
          />
        </>
      )}
      {mergedBranding.enableAnimations && mergedBranding.animatedBackground === "particles" && (
        <div className="absolute inset-0">
          {particles.map((particle, index) => (
            <span
              key={index}
              className="absolute rounded-full"
              style={{
                left: particle.left,
                top: particle.top,
                width: particle.size,
                height: particle.size,
                backgroundColor: `${theme.accent}88`,
                boxShadow: `0 0 18px ${theme.accent}44`,
              }}
            />
          ))}
        </div>
      )}
      {mergedBranding.enableAnimations && mergedBranding.animatedBackground === "waves" && (
        <svg
          className="absolute bottom-0 left-0 h-32 w-full opacity-70"
          viewBox="0 0 1200 320"
          preserveAspectRatio="none"
        >
          <path
            fill={`${theme.accent}33`}
            d="M0,224L60,202.7C120,181,240,139,360,128C480,117,600,139,720,170.7C840,203,960,245,1080,240C1140,235,1200,181,1260,154.7L1260,320L0,320Z"
          />
          <path
            fill={`${theme.buttonGradientTo}22`}
            d="M0,256L60,245.3C120,235,240,213,360,197.3C480,181,600,171,720,181.3C840,192,960,224,1080,224C1140,224,1200,192,1260,176L1260,320L0,320Z"
          />
        </svg>
      )}
      {mergedBranding.enableAnimations && mergedBranding.animatedBackground === "gradient" && (
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}12 0%, transparent 35%, ${theme.buttonGradientFrom}14 100%)`,
          }}
        />
      )}
    </>
  );

  const shellStyle = {
    backgroundColor: shellSurface,
    border: `1px solid ${borderColor}`,
    boxShadow: isGlassTheme
      ? "0 28px 80px rgba(15, 23, 42, 0.44)"
      : isNeonTheme
        ? `0 0 0 1px ${theme.border}, 0 24px 70px ${theme.accent}22, inset 0 1px 0 rgba(255,255,255,0.05)`
      : "0 26px 70px rgba(15, 23, 42, 0.12)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  } as const;

  const pillStyle = {
    backgroundColor: softSurface,
    border: `1px solid ${borderColor}`,
    color: textPrimary,
  } as const;

  return (
    <div className="space-y-4">
      {mergedBranding.fontUrl && <link href={mergedBranding.fontUrl} rel="stylesheet" />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("subscription.preview.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("subscription.preview.description")}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border/60 bg-background/80 p-1">
          {viewportOptions.map((option) => {
            const Icon = option.icon;
            const active = viewport === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setViewport(option.id)}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? theme.tabActive : "transparent",
                  color: active ? theme.tabActiveText : "hsl(var(--muted-foreground))",
                }}
              >
                <Icon className="h-4 w-4" />
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[28px] border border-border/60 bg-muted/20 p-3 md:p-4">
        <div
          className={`mx-auto transition-all ${isMobile ? "max-w-[390px]" : "max-w-[1120px]"}`}
          style={{ fontFamily: mergedBranding.fontFamily || "inherit" }}
        >
          <div
            className={`${radiusClass} relative overflow-hidden p-3 md:p-4`}
            style={{
              backgroundColor: pageBackgroundColor,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {renderBackdrop()}

            <div className="relative z-10 space-y-4">
              <section className={`${radiusClass} ${previewPaddingClass}`} style={shellStyle}>
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-5">
                    <div className={`flex flex-col gap-4 ${isMobile ? "" : "lg:flex-row lg:items-start lg:justify-between"}`}>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-start gap-4">
                          <div
                            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
                            style={{ ...pillStyle, backgroundColor: softSurface }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logoUrl} alt={mergedBranding.brandName || "Brand logo"} className="h-10 w-10 object-contain" />
                          </div>
                          <div className="min-w-0">
                            <div
                              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                              style={{
                                backgroundColor: `${theme.accent}18`,
                                color: theme.accent,
                              }}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {mergedBranding.brandName || "Atomic-UI"}
                            </div>
                            <h3 className={`mt-3 font-semibold tracking-tight ${titleSizeClass}`} style={{ color: textPrimary }}>
                              {t("subscription.preview.sample_name")}
                            </h3>
                            <p className="mt-2 max-w-3xl text-sm md:text-base" style={{ color: textMuted }}>
                              {tr("subscription.hero.intro", { server: serverLabel })}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className={`flex ${isMobile ? "justify-start" : "justify-end"}`}>
                        <div
                          className="inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]"
                          style={{ backgroundColor: `${theme.success}18`, color: theme.success }}
                        >
                          {t("subscription.status.active")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {mergedBranding.showWelcome && mergedBranding.welcomeMessage && (
                    <div className="rounded-2xl px-4 py-3 text-sm" style={{ ...pillStyle, backgroundColor: softSurface }}>
                      {mergedBranding.welcomeMessage}
                    </div>
                  )}

                  <div className={`grid min-w-0 gap-3.5 ${isMobile ? "grid-cols-1" : "lg:grid-cols-[256px_minmax(0,1fr)] lg:items-stretch"}`}>
                    <div className={`order-2 flex min-w-0 w-full overflow-hidden h-full flex-col rounded-[22px] border p-3.5 ${isMobile ? "" : "lg:order-1 lg:p-4"}`} style={{ backgroundColor: controlSurface, borderColor: controlBorder }}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMuted }}>
                        {t("subscription.hero.quick_scan")}
                      </p>
                      <div className="mt-3 flex flex-1 items-center justify-center rounded-[16px] border p-3.5" style={{ backgroundColor: controlButtonSurface, borderColor: controlBorder }}>
                        <div className="flex h-full w-full max-h-[148px] max-w-[148px] items-center justify-center rounded-[12px] border border-dashed" style={{ borderColor: controlBorder }}>
                          <QrCode className="h-14 w-14" style={{ color: theme.buttonGradientFrom }} />
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-medium" style={{ color: controlText }}>
                        {tr("subscription.hero.scan_with", { app: primaryApp?.name || t("subscription.defaults.vpn_app") })}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: controlMuted }}>
                        {t("subscription.hero.quick_scan_help")}
                      </p>
                    </div>

                    <div className={`order-1 min-w-0 w-full overflow-hidden h-full rounded-[22px] border p-3.5 ${isMobile ? "" : "lg:order-2 lg:p-4"}`} style={{ backgroundColor: controlSurface, borderColor: controlBorder }}>
                      <div className="space-y-3.5">
                        <div className="rounded-[18px] border p-1" style={{ backgroundColor: controlButtonSurface, borderColor: controlBorder }}>
                          <div className="grid min-w-0 grid-cols-3 gap-1">
                            {[
                              { label: t("subscription.platform.android"), short: t("subscription.platform.android") },
                              { label: t("subscription.platform.ios"), short: t("subscription.platform.ios_short") },
                              { label: t("subscription.platform.windows"), short: t("subscription.platform.windows") },
                            ].map((platformLabel, index) => (
                              <div
                                key={platformLabel.label}
                                className="min-w-0 w-full rounded-[14px] px-2.5 py-2 text-center text-[12px] font-medium leading-tight sm:px-3 sm:text-[13px]"
                                style={{
                                  background: index === 0
                                    ? `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`
                                    : "transparent",
                                  color: index === 0 ? "#ffffff" : controlMuted,
                                  boxShadow: index === 0 ? "0 10px 24px rgba(59,130,246,0.22)" : "none",
                                }}
                              >
                                <span className="block truncate sm:hidden">{platformLabel.short}</span>
                                <span className="hidden truncate sm:inline">{platformLabel.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="min-w-0 space-y-3.5">
                          <div className="min-w-0 space-y-2">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMuted }}>
                                {t("subscription.hero.connection_url")}
                              </p>
                              <div
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border"
                                style={{ backgroundColor: controlButtonSurface, color: controlText, borderColor: controlBorder }}
                              >
                                <Copy className="h-4 w-4" />
                              </div>
                            </div>
                            <div
                              className="min-w-0 rounded-[16px] border px-3.5 py-2.5"
                              style={{ backgroundColor: controlButtonSurface, color: controlText, borderColor: controlBorder }}
                            >
                              <p className="w-full truncate font-mono text-[12px] leading-6">
                                {actionFieldText}
                              </p>
                            </div>
                          </div>

                          <div
                            className="inline-flex min-w-0 items-center justify-center gap-2 overflow-hidden rounded-[16px] px-4 py-3 text-sm font-semibold shadow-lg"
                            style={{
                              background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                              color: "#ffffff",
                            }}
                          >
                            <span className="text-base">{primaryApp?.icon || "🔑"}</span>
                            <span className="truncate">{tr("subscription.hero.open_in", { app: primaryApp?.name || "Outline" })}</span>
                            <ChevronRight className="h-4 w-4" />
                          </div>

                          <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "xl:grid-cols-4 sm:grid-cols-2"}`}>
                            <div className="inline-flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-[16px] px-3.5 py-2.5 text-sm font-medium" style={{ backgroundColor: controlButtonSurface, color: controlText, border: `1px solid ${controlBorder}` }}>
                              <Copy className="h-4 w-4" />
                              <span className="truncate">{t("subscription.hero.copy_url")}</span>
                            </div>
                            {showManualSetupButton && (
                              <div className="inline-flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-[16px] px-3.5 py-2.5 text-sm font-medium" style={{ backgroundColor: controlButtonSurface, color: controlText, border: `1px solid ${controlBorder}` }}>
                                <QrCode className="h-4 w-4" />
                                <span className="truncate">{t("subscription.hero.manual_setup")}</span>
                              </div>
                            )}
                            {primaryApp && (
                              <div className="inline-flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-[16px] px-3.5 py-2.5 text-sm font-medium" style={{ backgroundColor: controlButtonSurface, color: controlText, border: `1px solid ${controlBorder}` }}>
                                <ExternalLink className="h-4 w-4" />
                                <span className="truncate">{tr("subscription.hero.get_app", { app: primaryApp.name })}</span>
                              </div>
                            )}
                            {showHelpContact && supportLink?.trim() && (
                              <div className="inline-flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-[16px] px-3.5 py-2.5 text-sm font-medium" style={{ backgroundColor: controlButtonSurface, color: controlText, border: `1px solid ${controlBorder}` }}>
                                <MessageCircle className="h-4 w-4" />
                                <span className="truncate">{t("subscription.hero.get_support")}</span>
                              </div>
                            )}
                          </div>

                          <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1.25fr)_repeat(2,minmax(0,0.85fr))]"}`}>
                            <div className="min-w-0 rounded-[16px] border px-3.5 py-3" style={{ backgroundColor: controlButtonSurface, borderColor: controlBorder }}>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMuted }}>
                                {t("subscription.hero.quick_tip")}
                              </p>
                              <p className="mt-2 text-sm leading-6" style={{ color: controlText }}>
                                {t("subscription.hero.quick_tip_desc")}
                              </p>
                            </div>
                            <div className="min-w-0 rounded-[16px] border px-3.5 py-3" style={{ backgroundColor: controlButtonSurface, borderColor: controlBorder }}>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMuted }}>
                                {t("subscription.hero.last_updated")}
                              </p>
                              <p className="mt-2 break-words text-sm font-semibold" style={{ color: controlText }}>{t("subscription.status.updated_just_now")}</p>
                            </div>
                            <div className="min-w-0 rounded-[16px] border px-3.5 py-3" style={{ backgroundColor: controlButtonSurface, borderColor: controlBorder }}>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: controlMuted }}>
                                {t("subscription.hero.endpoint")}
                              </p>
                              <p className="mt-2 break-words text-sm font-semibold" style={{ color: controlText }}>{serverLabel}</p>
                              <p className="mt-1 text-xs" style={{ color: controlMuted }}>{tr("subscription.summary.port", { port: 1158 })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {mergedBranding.showUsageAlerts && (
                    <div
                      className="flex items-start gap-3 rounded-2xl px-4 py-3"
                      style={{
                        backgroundColor: `${theme.warning}14`,
                        border: `1px solid ${theme.warning}33`,
                      }}
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.warning }} />
                      <span className="text-sm" style={{ color: textPrimary }}>
                        {t("subscription.preview.usage_alert")}
                      </span>
                    </div>
                  )}

                  {showConnectionSummary && (
                    <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.75fr))]"}`}>
                      <div className="min-w-0 rounded-[20px] border p-4" style={{ ...pillStyle, backgroundColor: softSurface }}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                              {t("subscription.summary.data_usage")}
                            </p>
                            <p className="mt-2 break-words text-[1.7rem] font-semibold" style={{ color: textPrimary }}>{usageHeadline}</p>
                            <p className="mt-2 text-sm" style={{ color: textMuted }}>{usageDetail}</p>
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <div
                              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
                              style={{ backgroundColor: theme.bgCard, color: textPrimary, border: `1px solid ${borderColor}` }}
                            >
                              <RefreshCw className="h-4 w-4" />
                              {t("subscription.summary.refresh_usage")}
                            </div>
                            <span className="text-xs" style={{ color: textMuted }}>{t("subscription.status.updated_just_now")}</span>
                          </div>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ backgroundColor: theme.progressBg }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${usagePercent}%`,
                              background: `linear-gradient(90deg, ${theme.progressFill}, ${theme.buttonGradientTo})`,
                            }}
                          />
                        </div>
                        <p className="mt-3 text-sm" style={{ color: textMuted }}>
                          {t("subscription.preview.usage_total")}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-[20px] border p-4" style={{ ...pillStyle, backgroundColor: softSurface }}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                          {t("subscription.summary.time_left")}
                        </p>
                        <p className="mt-2 break-words text-[1.7rem] font-semibold" style={{ color: textPrimary }}>{t("subscription.preview.time_left_value")}</p>
                        <p className="mt-2 text-sm" style={{ color: textMuted }}>{t("subscription.preview.time_left_detail")}</p>
                      </div>

                      <div className="min-w-0 rounded-[20px] border p-4" style={{ ...pillStyle, backgroundColor: softSurface }}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                          {t("subscription.summary.server")}
                        </p>
                        <p className="mt-2 break-words text-[1.7rem] font-semibold" style={{ color: textPrimary }}>{t("subscription.preview.server_value")}</p>
                        <p className="mt-2 text-sm" style={{ color: textMuted }}>{tr("subscription.summary.port", { port: 1158 })}</p>
                      </div>
                    </div>
                  )}

                </div>
              </section>

              {showCompatibleApps && visibleApps.length > 0 && mergedBranding.layout !== "minimal" && (
                <section className={`${radiusClass} mt-4 ${previewPaddingClass}`} style={shellStyle}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                        {t("subscription.apps.title")}
                      </p>
                      <h4 className="mt-2 text-xl font-semibold" style={{ color: textPrimary }}>
                        {t("subscription.apps.heading")}
                      </h4>
                      <p className="mt-1 text-sm" style={{ color: textMuted }}>
                        {t("subscription.apps.description")}
                      </p>
                    </div>
                    {apps.length > visibleApps.length && (
                      <span className="text-sm font-medium" style={{ color: theme.accent }}>
                        {tr("subscription.apps.more_apps", { count: apps.length - visibleApps.length })}
                      </span>
                    )}
                  </div>

                  <div className={`mt-4 grid gap-3 ${isMobile ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3"}`}>
                    {visibleApps.map((app) => (
                      <div key={app.id} className="min-w-0 rounded-[20px] border p-3.5" style={{ backgroundColor: controlSurface, borderColor: controlBorder }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div
                              className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border text-lg"
                              style={{ backgroundColor: controlButtonSurface, borderColor: controlBorder, color: controlText }}
                            >
                              {app.icon}
                            </div>
                            <p className="mt-2.5 text-[15px] font-semibold" style={{ color: controlText }}>{app.name}</p>
                            <p className="mt-1 line-clamp-2 text-sm" style={{ color: controlMuted }}>
                              {tr("subscription.apps.manual_alternative", { app: app.name })}
                            </p>
                          </div>
                          <div
                            className="max-w-full shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                            style={{ backgroundColor: controlButtonSurface, color: controlMuted, border: `1px solid ${controlBorder}` }}
                          >
                            {t("subscription.apps.client")}
                          </div>
                        </div>
                        <div className="mt-3.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_46px]">
                          <div
                            className="inline-flex min-w-0 items-center justify-center overflow-hidden rounded-[16px] px-4 py-2.5 text-sm font-semibold"
                            style={{
                              background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                              color: "#ffffff",
                            }}
                          >
                            <span className="truncate">{tr("subscription.hero.open_in", { app: app.name })}</span>
                          </div>
                          <div
                            className="inline-flex items-center justify-center rounded-[16px] border"
                            style={{ backgroundColor: controlButtonSurface, color: controlText, borderColor: controlBorder }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 break-words" style={{ color: controlMuted }}>
                            {t("subscription.apps.same_url_flow")}
                          </span>
                          <span
                            className="inline-flex max-w-full shrink-0 rounded-full px-2.5 py-1 font-medium"
                            style={{ backgroundColor: controlButtonSurface, color: controlText, border: `1px solid ${controlBorder}` }}
                          >
                            {t("subscription.platform.ios")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {hasHelpContactContent && (
                <section className={`${radiusClass} mt-4 ${previewPaddingClass}`} style={shellStyle}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                        {t("subscription.help.title")}
                      </p>
                      <h4 className="mt-2 text-xl font-semibold" style={{ color: textPrimary }}>
                        {t("subscription.help.heading")}
                      </h4>
                      <p className="mt-2 text-sm" style={{ color: textMuted }}>
                        {supportLink?.trim()
                          ? t("subscription.preview.help_available")
                          : t("subscription.preview.help_hidden")}
                      </p>
                    </div>
                    <div className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium" style={pillStyle}>
                      {supportLink?.trim() ? <ExternalLink className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                      {supportLink?.trim() ? t("subscription.help.open_support") : t("subscription.hero.get_support")}
                    </div>
                  </div>

                  <div className={`mt-5 grid gap-3 ${isMobile ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
                    {[
                      t("subscription.contact.telegram"),
                      t("subscription.contact.discord"),
                      t("subscription.contact.whatsapp"),
                      t("subscription.contact.email"),
                    ].map((label) => (
                      <div key={label} className="rounded-[22px] border px-4 py-3" style={{ ...pillStyle, backgroundColor: softSurface }}>
                        <p className="text-sm font-medium" style={{ color: textPrimary }}>{label}</p>
                        <p className="mt-1 text-sm" style={{ color: textMuted }}>
                          {t("subscription.help.support_shortcut")}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {footerText && (
                <div className="px-2 pt-1 text-center text-xs" style={{ color: textMuted }}>
                  {footerText}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
