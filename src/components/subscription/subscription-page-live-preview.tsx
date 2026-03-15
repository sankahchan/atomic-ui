"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  HardDrive,
  Link2,
  MapPin,
  MessageCircle,
  Monitor,
  QrCode,
  Smartphone,
  Sparkles,
} from "lucide-react";
import {
  clientApps,
  defaultBranding,
  getTheme,
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
  label: string;
  icon: typeof Monitor;
}> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "mobile", label: "Mobile", icon: Smartphone },
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

export function SubscriptionPageLivePreview({
  themeId,
  branding,
  supportLink,
}: SubscriptionPageLivePreviewProps) {
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");

  const mergedBranding = { ...defaultBranding, ...branding };
  const theme = getTheme(themeId);
  const isMobile = viewport === "mobile";
  const isGlassTheme = theme.id.startsWith("glass");
  const radiusClass = radiusClasses[mergedBranding.cardStyle || "rounded"];
  const logoUrl = mergedBranding.logoUrl || ATOMIC_LOGO_SVG;
  const enabledAppIds = mergedBranding.enabledApps?.length
    ? mergedBranding.enabledApps
    : defaultBranding.enabledApps || [];
  const apps = clientApps.filter((app) => enabledAppIds.includes(app.id));
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
  const previewPaddingClass =
    mergedBranding.layout === "compact"
      ? "p-4 md:p-5"
      : mergedBranding.layout === "detailed"
        ? "p-6 md:p-7"
        : "p-5 md:p-6";
  const titleSizeClass =
    mergedBranding.layout === "compact"
      ? "text-2xl md:text-[2rem]"
      : mergedBranding.layout === "detailed"
        ? "text-3xl md:text-[2.55rem]"
        : "text-3xl md:text-[2.25rem]";
  const summaryColumnsClass = isMobile ? "grid-cols-1" : "grid-cols-2";
  const footerText =
    mergedBranding.footerText?.trim() ||
    (mergedBranding.showPoweredBy === false ? "" : defaultBranding.footerText);

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
          <p className="text-sm font-semibold text-foreground">Live Preview</p>
          <p className="text-xs text-muted-foreground">
            Mirrors the current install-first subscription page layout.
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
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[28px] border border-border/60 bg-muted/20 p-3 md:p-4">
        <div
          className={`mx-auto transition-all ${isMobile ? "max-w-[390px]" : "max-w-[1180px]"}`}
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
              <div className={`grid gap-4 ${isMobile ? "" : "xl:grid-cols-[minmax(0,1.35fr)_300px]"}`}>
                <section className={`${radiusClass} ${previewPaddingClass}`} style={shellStyle}>
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start justify-between gap-4">
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
                            Singapore Premium
                          </h3>
                          <p className="mt-2 max-w-2xl text-sm md:text-base" style={{ color: textMuted }}>
                            Ready to connect on Singapore. Start with the app button below, or open manual setup for the QR and raw link.
                          </p>
                        </div>
                      </div>
                      <div
                        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]"
                        style={{ backgroundColor: `${theme.success}18`, color: theme.success }}
                      >
                        Active
                      </div>
                    </div>

                    {mergedBranding.showWelcome && mergedBranding.welcomeMessage && (
                      <div className="rounded-2xl px-4 py-3 text-sm" style={{ ...pillStyle, backgroundColor: softSurface }}>
                        {mergedBranding.welcomeMessage}
                      </div>
                    )}

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
                          88% of the included data has already been used. Users should expect a prominent warning here.
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Server", value: "Singapore", icon: MapPin },
                        { label: "Usage", value: "176 GB / 200 GB", icon: HardDrive },
                        { label: "Expires", value: "12 days left", icon: Clock3 },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.label}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
                            style={pillStyle}
                          >
                            <Icon className="h-4 w-4" style={{ color: theme.accent }} />
                            <span className="font-medium">{item.label}:</span>
                            <span style={{ color: textSecondary }}>{item.value}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <div
                        className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold shadow-lg"
                        style={{
                          background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                          color: "#ffffff",
                        }}
                      >
                        <span className="text-base">{primaryApp?.icon || "🔑"}</span>
                        Open in {primaryApp?.name || "Outline"}
                        <ChevronRight className="h-4 w-4" />
                      </div>
                      <div className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium" style={pillStyle}>
                        <QrCode className="h-4 w-4" />
                        Manual Setup
                      </div>
                      <div className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium" style={pillStyle}>
                        <Copy className="h-4 w-4" />
                        Copy URL
                      </div>
                      {supportLink?.trim() && (
                        <div className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium" style={pillStyle}>
                          <MessageCircle className="h-4 w-4" />
                          Get Support
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {!isMobile && (
                  <aside className="space-y-4">
                    <div className={`${radiusClass} p-5`} style={shellStyle}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                        Connection Summary
                      </p>
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <p className="text-sm" style={{ color: textMuted }}>Usage</p>
                              <p className="mt-1 text-2xl font-semibold" style={{ color: textPrimary }}>88%</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm" style={{ color: textMuted }}>Time left</p>
                              <p className="mt-1 text-lg font-semibold" style={{ color: textPrimary }}>12 days</p>
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
                          <p className="mt-2 text-sm" style={{ color: textMuted }}>
                            176 GB used of 200 GB available.
                          </p>
                        </div>

                        <div className="rounded-2xl border px-4 py-3" style={{ ...pillStyle, backgroundColor: softSurface }}>
                          <p className="text-sm font-medium">Share this page</p>
                          <p className="mt-1 text-sm" style={{ color: textMuted }}>
                            Users copy the page link more often than the raw connection string.
                          </p>
                          <div
                            className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
                            style={{ backgroundColor: theme.accent, color: theme.accentText }}
                          >
                            <Link2 className="h-4 w-4" />
                            Copy Page URL
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`${radiusClass} p-5`} style={shellStyle}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                        Help & Contact
                      </p>
                      <p className="mt-3 text-sm" style={{ color: textPrimary }}>
                        {supportLink?.trim()
                          ? "A support shortcut is visible so users can get help without leaving the page."
                          : "No support link is configured. The support action stays hidden until you add one."}
                      </p>
                      <div className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium" style={pillStyle}>
                        {supportLink?.trim() ? <ExternalLink className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                        {supportLink?.trim() ? "Open Support" : "Support Hidden"}
                      </div>
                    </div>
                  </aside>
                )}
              </div>

              {isMobile && (
                <div className={`${radiusClass} mt-4 p-4`} style={shellStyle}>
                  <div className={`grid gap-3 ${summaryColumnsClass}`}>
                    <div className="rounded-2xl px-4 py-3" style={pillStyle}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: textMuted }}>Usage</p>
                      <p className="mt-2 text-xl font-semibold" style={{ color: textPrimary }}>176 / 200 GB</p>
                    </div>
                    <div className="rounded-2xl px-4 py-3" style={pillStyle}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: textMuted }}>Share Link</p>
                      <p className="mt-2 text-sm font-medium" style={{ color: textPrimary }}>Subscription page URL</p>
                    </div>
                  </div>
                </div>
              )}

              {visibleApps.length > 0 && mergedBranding.layout !== "minimal" && (
                <section className={`${radiusClass} mt-4 ${previewPaddingClass}`} style={shellStyle}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                        Compatible Apps
                      </p>
                      <h4 className="mt-2 text-xl font-semibold" style={{ color: textPrimary }}>
                        Alternate client options
                      </h4>
                      <p className="mt-1 text-sm" style={{ color: textMuted }}>
                        Enabled apps appear here as secondary install choices.
                      </p>
                    </div>
                    {apps.length > visibleApps.length && (
                      <span className="text-sm font-medium" style={{ color: theme.accent }}>
                        +{apps.length - visibleApps.length} more apps
                      </span>
                    )}
                  </div>

                  <div className={`mt-5 grid gap-3 ${isMobile ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-4"}`}>
                    {visibleApps.map((app) => (
                      <div key={app.id} className="rounded-[22px] border p-4" style={{ ...pillStyle, backgroundColor: softSurface }}>
                        <div className="text-2xl">{app.icon}</div>
                        <p className="mt-3 text-base font-semibold" style={{ color: textPrimary }}>{app.name}</p>
                        <p className="mt-1 text-sm" style={{ color: textMuted }}>
                          Secondary install option for users who prefer {app.name}.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <div
                            className="inline-flex flex-1 items-center justify-center rounded-full px-3 py-2.5 text-sm font-medium"
                            style={{ backgroundColor: theme.accent, color: theme.accentText }}
                          >
                            Open
                          </div>
                          <div className="inline-flex items-center justify-center rounded-full px-3 py-2.5 text-sm font-medium" style={pillStyle}>
                            <ExternalLink className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {mergedBranding.layout !== "minimal" && (
                <section className={`${radiusClass} mt-4 ${previewPaddingClass}`} style={shellStyle}>
                  <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_300px]"}`}>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                        Share Links
                      </p>
                      <h4 className="mt-2 text-xl font-semibold" style={{ color: textPrimary }}>
                        Keep the important links close
                      </h4>
                      <div className={`mt-4 grid gap-3 ${isMobile ? "grid-cols-1" : "md:grid-cols-2"}`}>
                        <div className="rounded-[22px] border p-4" style={{ ...pillStyle, backgroundColor: softSurface }}>
                          <p className="text-sm font-medium" style={{ color: textPrimary }}>Subscription page</p>
                          <p className="mt-1 text-sm leading-6 break-all" style={{ color: textMuted }}>
                            https://panel.example.com/sub/sg-premium
                          </p>
                        </div>
                        <div className="rounded-[22px] border p-4" style={{ ...pillStyle, backgroundColor: softSurface }}>
                          <p className="text-sm font-medium" style={{ color: textPrimary }}>Connection URL</p>
                          <p className="mt-1 text-sm leading-6 break-all" style={{ color: textMuted }}>
                            ss://base64@143.198.197.158:1158/#Singapore%20Premium
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[22px] border p-4" style={{ ...pillStyle, backgroundColor: softSurface }}>
                      <p className="text-sm font-medium" style={{ color: textPrimary }}>Footer</p>
                      <p className="mt-2 text-sm" style={{ color: textMuted }}>
                        {footerText || "Footer text hidden"}
                      </p>
                      <p className="mt-4 text-xs uppercase tracking-[0.18em]" style={{ color: textMuted }}>
                        {mergedBranding.showPoweredBy === false ? "Powered by label hidden" : "Powered by label visible"}
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
