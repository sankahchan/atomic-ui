"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SubscriptionPageLivePreview } from "@/components/subscription/subscription-page-live-preview";
import { useLocale } from "@/hooks/use-locale";
import { useToast } from "@/hooks/use-toast";
import { localeFlags, localeNames, supportedLocales, type SupportedLocale } from "@/lib/i18n/config";
import type { LocalizedTemplateMap } from "@/lib/localized-templates";
import {
    ArrowDown,
    ArrowUp,
    Loader2,
    Save,
    Palette,
    MessageSquare,
    ExternalLink,
    Camera,
    Eye,
    EyeOff,
    ChevronDown,
    Image as ImageIcon,
    Layout,
    Sparkles,
    Bell,
    Smartphone,
    Code,
    FileText,
} from "lucide-react";
import {
    themeList,
    clientApps,
    SubscriptionBranding,
    defaultBranding,
    subscriptionPagePresets,
} from "@/lib/subscription-themes";

interface BrandingState extends SubscriptionBranding {
    // All fields from SubscriptionBranding
}

export function SubscriptionSettings() {
    const { toast } = useToast();
    const { locale } = useLocale();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const isMyanmar = locale === "my";

    // Basic settings
    const [supportLink, setSupportLink] = useState("");
    const [defaultTheme, setDefaultTheme] = useState("dark");
    const [defaultLanguage, setDefaultLanguage] = useState<SupportedLocale>("en");
    const [unsplashApiKey, setUnsplashApiKey] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);

    // Branding settings
    const [branding, setBranding] = useState<BrandingState>({
        ...defaultBranding,
    });

    // Collapsible sections
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        presets: true,
        basic: true,
        theme: true,
        branding: false,
        footer: false,
        welcome: false,
        layout: false,
        visibility: false,
        animations: false,
        alerts: false,
        apps: false,
        css: false,
    });

    const toggleSection = (section: string) => {
        setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    // Fetch current settings
    useEffect(() => {
        async function fetchSettings() {
            try {
                const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
                const response = await fetch(`${basePath}/api/settings/subscription`);
                if (response.ok) {
                    const data = await response.json();
                    setSupportLink(data.supportLink || "");
                    setDefaultTheme(data.defaultSubscriptionTheme || "dark");
                    setDefaultLanguage(data.defaultLanguage || "en");
                    setUnsplashApiKey(data.unsplashApiKey || "");

                    // Load branding settings
                    if (data.branding) {
                        setBranding({
                            ...defaultBranding,
                            ...data.branding,
                        });
                    }
                }
            } catch (error) {
                console.error("Failed to fetch settings:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
            const response = await fetch(`${basePath}/api/settings/subscription`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    supportLink,
                    defaultSubscriptionTheme: defaultTheme,
                    defaultLanguage,
                    unsplashApiKey,
                    branding,
                }),
            });

            if (response.ok) {
                toast({
                    title: isMyanmar ? "ဆက်တင်များကို သိမ်းပြီးပါပြီ" : "Settings saved",
                    description: isMyanmar ? "Subscription page ဆက်တင်များကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။" : "Subscription page settings have been updated.",
                });
            } else {
                throw new Error("Failed to save settings");
            }
        } catch (error) {
            toast({
                title: isMyanmar ? "သိမ်းဆည်းမှု မအောင်မြင်ပါ" : "Save failed",
                description: isMyanmar ? "ဆက်တင်များကို မသိမ်းနိုင်ခဲ့ပါ။ ထပ်မံကြိုးစားပါ။" : "Failed to save settings. Please try again.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const settingsUi = {
        livePreviewTitle: isMyanmar ? "တိုက်ရိုက် အကြိုကြည့်မည်" : "Live Preview",
        livePreviewDesc: isMyanmar ? "Theme၊ branding၊ support၊ layout နှင့် app ဆက်တင်များကို ပြင်ဆင်နေစဉ် user မြင်မည့် subscription page ကို စစ်ဆေးပါ။" : "Review the actual subscription page structure while you adjust theme, branding, support, layout, and app settings.",
        presetsTitle: isMyanmar ? "Preset များ" : "Presets",
        presetsDesc: isMyanmar ? "Theme၊ layout၊ card ပုံစံနှင့် motion အတွက် စတင်အသုံးပြုရန် အဆင်သင့်ဖြစ်သော preset များကို ရွေးပါ။" : "Apply a curated starting point for theme, layout, card shape, and motion.",
        presetActive: isMyanmar ? "လက်ရှိ" : "Active",
        supportTitle: isMyanmar ? "အကူအညီ ဆက်သွယ်ရန်" : "Support Contact",
        supportDesc: isMyanmar ? "User subscription page များပေါ်တွင် ပြသမည့် support link ကို သတ်မှတ်ပါ။" : "Configure the support link shown on user subscription pages.",
        supportLink: isMyanmar ? "Support Link" : "Support Link",
        supportPlaceholder: isMyanmar ? "https://t.me/yourusername သို့မဟုတ် မည်သည့် URL မဆို" : "https://t.me/yourusername or any URL",
        supportHelp: isMyanmar ? "Telegram၊ WhatsApp၊ email (mailto:) သို့မဟုတ် website URL ကို ထည့်နိုင်သည်။ မဖြည့်ပါက support button ကို ဝှက်ထားမည်။" : "Enter any URL - Telegram, WhatsApp, email (mailto:), or your website. Leave empty to hide the support button.",
        testLink: isMyanmar ? "Link စမ်းမည်" : "Test link",
        themeTitle: isMyanmar ? "မူလ Theme" : "Default Theme",
        themeDesc: isMyanmar ? "Subscription page များအတွက် မူလ theme ကို သတ်မှတ်ပါ။ Key အလိုက် ပြန်လည် အစားထိုးနိုင်သည်။" : "Set the default theme for subscription pages. This can be overridden per-key.",
        defaultLanguage: isMyanmar ? "မူလ ဘာသာစကား" : "Default Language",
        defaultLanguageHelp: isMyanmar ? "Share page နှင့် subscription page များကို ပထမဆုံး ဖွင့်ချိန်တွင် အသုံးပြုမည့် ဘာသာစကား ဖြစ်သည်။ User သည် နောက်ပိုင်း ပြောင်းနိုင်ပြီး browser ထဲတွင် မှတ်ထားမည်။" : "This is the starting language for share and subscription pages. Users can switch later and the choice will persist in their browser.",
        themeLabel: isMyanmar ? "Theme" : "Theme",
        selectTheme: isMyanmar ? "Theme ကို ရွေးပါ" : "Select theme",
        previewThemeHelp: isMyanmar ? "အပေါ်ဘက်ရှိ preview သည် theme ပြောင်းလိုက်သည်နှင့် ချက်ချင်း အပ်ဒိတ်ဖြစ်မည်။" : "The live preview above updates instantly as you switch themes.",
        brandingTitle: isMyanmar ? "လိုဂို နှင့် Branding" : "Logo & Branding",
        brandingDesc: isMyanmar ? "Subscription page များပေါ်ရှိ logo နှင့် brand name ကို စိတ်ကြိုက် ပြင်ဆင်ပါ။" : "Customize your logo and brand name on subscription pages.",
        logoUrl: isMyanmar ? "Logo URL" : "Logo URL",
        logoUrlHelp: isMyanmar ? "ကိုယ်ပိုင် logo URL ဖြစ်ပါသည်။ QR code အလယ်တွင် ပြသမည်။ မဖြည့်ပါက default logo ကို သုံးမည်။" : "URL to your custom logo. Appears in the QR code center. Leave empty for default.",
        logoSize: isMyanmar ? "QR Code အတွင်း Logo အရွယ်အစား" : "Logo Size in QR Code",
        logoSizeHelp: isMyanmar ? "QR code အတွင်း logo overlay အရွယ်အစား (15-40%)" : "Size of the logo overlay in the QR code (15-40%)",
        brandName: isMyanmar ? "Brand Name" : "Brand Name",
        brandNameHelp: isMyanmar ? "Page title နှင့် footer တွင် ပြသမည့် brand name ဖြစ်သည်။" : "Your brand name shown in the page title and footer.",
        logoPreview: isMyanmar ? "Logo အကြိုကြည့်မည်" : "Logo Preview",
        brandFallback: isMyanmar ? "သင့် Brand" : "Your Brand",
        footerTitle: isMyanmar ? "Footer" : "Footer",
        footerDesc: isMyanmar ? "Subscription page များတွင် footer စာသားကို စိတ်ကြိုက် ပြင်ဆင်ပါ။" : "Customize the footer text displayed on subscription pages.",
        footerText: isMyanmar ? "Custom Footer Text" : "Custom Footer Text",
        footerHelp: isMyanmar ? "Footer တွင် ပြသမည့် စာသား။ မဖြည့်ပါက default ကို အသုံးပြုမည်။" : "Custom footer text. Leave empty for default.",
        localizedFooter: isMyanmar ? "Footer ဘာသာပြန် template များ" : "Localized Footer Templates",
        localizedFooterDesc: isMyanmar ? "Share page ၏ ဘာသာစကားအလိုက် footer ကို သီးခြား သတ်မှတ်ပါ။ မဖြည့်ပါက အထက်ပါ fallback footer စာသားကို သုံးမည်။" : "Set footer copy per share-page language. Leave these empty to fall back to the default footer text above.",
        showPoweredBy: isMyanmar ? '"Powered by" စာသားကို ပြမည်' : 'Show "Powered by" Text',
        showPoweredByDesc: isMyanmar ? 'Footer တွင် "Powered by Atomic-UI" ကို ပြသမည်။' : 'Display "Powered by Atomic-UI" in the footer.',
        welcomeTitle: isMyanmar ? "ကြိုဆိုစာ" : "Welcome Message",
        welcomeDesc: isMyanmar ? "အသုံးပြုသူများအတွက် စိတ်ကြိုက် ကြိုဆိုစာကို ပြသပါ။" : "Display a custom welcome message to users.",
        showWelcome: isMyanmar ? "ကြိုဆိုစာကို ပြမည်" : "Show Welcome Message",
        showWelcomeDesc: isMyanmar ? "စာမျက်နှာ အပေါ်ဘက်တွင် ကြိုဆိုစာတစ်ခုကို ပြသမည်။" : "Display a greeting message at the top of the page.",
        welcomeMessage: isMyanmar ? "ကြိုဆိုစာ" : "Welcome Message",
        welcomePlaceholder: isMyanmar ? "မင်္ဂလာပါ။ ဒီမှာ သင့် VPN subscription အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။" : "Welcome! Here's your VPN subscription details.",
        localizedWelcome: isMyanmar ? "ကြိုဆိုစာ ဘာသာပြန် template များ" : "Localized Welcome Templates",
        localizedWelcomeDesc: isMyanmar ? "Share page ကို English သို့မဟုတ် မြန်မာဖြင့် ဖွင့်သည့်အခါ အသုံးပြုမည့် ကြိုဆိုစာကို သီးခြားရေးနိုင်သည်။ မဖြည့်ပါက အထက်ပါ fallback ကြိုဆိုစာကို သုံးမည်။" : "Set separate welcome copy for English and Burmese share-page visits. Leave empty to reuse the default welcome message above.",
        englishTemplate: isMyanmar ? "English Template" : "English Template",
        burmeseTemplate: isMyanmar ? "မြန်မာ Template" : "Burmese Template",
        layoutTitle: isMyanmar ? "Layout နှင့် စာလုံးပုံစံ" : "Layout & Typography",
        layoutDesc: isMyanmar ? "Page layout၊ card ပုံစံနှင့် font များကို စိတ်ကြိုက် ပြင်ဆင်ပါ။" : "Customize the page layout, card styles, and fonts.",
        layoutStyle: isMyanmar ? "Layout Style" : "Layout Style",
        cardStyle: isMyanmar ? "Card Style" : "Card Style",
        themeDefault: isMyanmar ? "မူလ" : "Default",
        themeCompact: isMyanmar ? "ကျစ်လစ်" : "Compact",
        themeDetailed: isMyanmar ? "အသေးစိတ်" : "Detailed",
        themeMinimal: isMyanmar ? "အနည်းဆုံး" : "Minimal",
        cardRounded: isMyanmar ? "ဝိုင်း" : "Rounded",
        cardSharp: isMyanmar ? "ထောင့်ရှင်း" : "Sharp",
        cardPill: isMyanmar ? "လုံးဝိုင်း" : "Pill",
        customFont: isMyanmar ? "Custom Font (Google Fonts)" : "Custom Font (Google Fonts)",
        customFontHelp: isMyanmar ? "Google Font အမည်ကို ထည့်ပါ။ မဖြည့်ပါက system default ကို သုံးမည်။" : "Enter a Google Font name. Leave empty for system default.",
        fontUrl: isMyanmar ? "Font URL (ရွေးချယ်နိုင်သည်)" : "Font URL (optional)",
        fontUrlHelp: isMyanmar ? "Google Fonts URL အပြည့်အစုံ။ မဖြည့်ပါက အလိုအလျောက် ဖန်တီးမည်။" : "Full Google Fonts URL. Auto-generated if left empty.",
        visibilityTitle: isMyanmar ? "Section များ ပြသမှု" : "Section Visibility",
        visibilityDesc: isMyanmar ? "User များအတွက် subscription page ပေါ်တွင် ပြနေမည့် section များကို ရွေးပါ။" : "Choose which subscription page sections stay visible to end users.",
        animationsTitle: isMyanmar ? "Animation များ" : "Animations",
        animationsDesc: isMyanmar ? "Page animation နှင့် နောက်ခံ effect များကို သတ်မှတ်ပါ။" : "Configure page animations and background effects.",
        enableAnimations: isMyanmar ? "Animation များကို ဖွင့်မည်" : "Enable Animations",
        enableAnimationsDesc: isMyanmar ? "ပြောင်းလဲမှုများနှင့် hover effect များကို ချောမွေ့စေမည်။" : "Enable smooth transitions and hover effects.",
        animatedBackground: isMyanmar ? "Animated Background" : "Animated Background",
        animatedBackgroundHelp: isMyanmar ? "Subscription page နောက်ခံတွင် dynamic effect များ ထည့်မည်။" : "Add dynamic background effects to the subscription page.",
        animationNone: isMyanmar ? "မရှိ" : "None",
        animationGradient: isMyanmar ? "လှုပ်ရှား Gradient" : "Animated Gradient",
        animationParticles: isMyanmar ? "Particles" : "Particles",
        animationWaves: isMyanmar ? "လှိုင်းများ" : "Waves",
        alertsTitle: isMyanmar ? "အသုံးပြုမှု သတိပေးချက်များ" : "Usage Alerts",
        alertsDesc: isMyanmar ? "အသုံးပြုမှုသည် သတ်မှတ်ထားသော အဆင့်သို့ ရောက်သောအခါ မြင်သာသော သတိပေးချက်များကို ပြသပါ။" : "Show visual alerts when usage reaches certain thresholds.",
        showUsageAlerts: isMyanmar ? "အသုံးပြုမှု သတိပေးချက်ကို ပြမည်" : "Show Usage Alerts",
        showUsageAlertsDesc: isMyanmar ? "ဒေတာအသုံးပြုမှုသည် threshold များသို့ ရောက်သောအခါ သတိပေးချက်ပြမည်။" : "Display warnings when data usage reaches thresholds.",
        alertThresholds: isMyanmar ? "သတိပေး Threshold များ (%)" : "Alert Thresholds (%)",
        alertThresholdsHelp: isMyanmar ? "ဤအသုံးပြုမှု ရာခိုင်နှုန်းများတွင် သတိပေးချက်ပြမည် (ဥပမာ 80%, 90%, 95%)။" : "Show alerts at these usage percentages (e.g., 80%, 90%, 95%).",
        appsTitle: isMyanmar ? "App Button များ" : "App Buttons",
        appsDesc: isMyanmar ? "Subscription page များပေါ်တွင် ပြသမည့် VPN client app များကို ရွေးပါ။" : "Choose which VPN client apps to show on subscription pages.",
        appsIntro: isMyanmar ? "Public page ပေါ်ရှိ ပထမဆုံး install button သည် သင်ရွေးထားသော primary app မှ လာမည်။ ကျန် app များကို အောက်တွင် ယခင်အစဉ်အတိုင်း ပြသမည်။" : "The first install button on the public page comes from your selected primary app. The remaining enabled apps appear below it in the order shown here.",
        primary: isMyanmar ? "အဓိက" : "Primary",
        primaryAppCta: isMyanmar ? "Primary App CTA" : "Primary App CTA",
        selectPrimaryApp: isMyanmar ? "Primary app ကို ရွေးပါ" : "Select primary app",
        primaryAppHelp: isMyanmar ? "ဤ app သည် hero section ထဲရှိ main install button ဖြစ်လာမည်။" : "This app becomes the main install button in the hero section.",
        secondaryAppOrder: isMyanmar ? "Secondary App အစဉ်" : "Secondary App Order",
        primaryCta: isMyanmar ? "Primary CTA" : "Primary CTA",
        orderPosition: (index: number) => isMyanmar ? `အစဉ် ${index}` : `Order position ${index}`,
        noApps: isMyanmar ? "Subscription page ပေါ်တွင် install button ပြသရန် အနည်းဆုံး app တစ်ခုကို ဖွင့်ပါ။" : "Enable at least one app to show install buttons on the subscription page.",
        customCssTitle: isMyanmar ? "Custom CSS" : "Custom CSS",
        customCssDesc: isMyanmar ? "အဆင့်မြင့် styling စိတ်ကြိုက် ပြင်ဆင်မှုများအတွက် custom CSS ထည့်သွင်းပါ။" : "Inject custom CSS for advanced styling customizations.",
        customCssHelp: isMyanmar ? "အဆင့်မြင့်: default style များကို override လုပ်ရန် custom CSS ထည့်နိုင်သည်။" : "Advanced: Add custom CSS to override default styles.",
        unsplashTitle: isMyanmar ? "Unsplash ချိတ်ဆက်မှု" : "Unsplash Integration",
        unsplashDesc: isMyanmar ? "Subscription page များအတွက် Unsplash မှ cover image များကို အသုံးပြုရန် ဖွင့်ပါ။ အခမဲ့ API key ကို unsplash.com/developers မှ ရယူနိုင်သည်။" : "Enable cover images from Unsplash for subscription pages. Get a free API key at unsplash.com/developers",
        unsplashAccessKey: isMyanmar ? "Access Key" : "Access Key",
        unsplashPlaceholder: isMyanmar ? "သင့် Unsplash Access Key ကို ထည့်ပါ" : "Enter your Unsplash Access Key",
        unsplashHelp: isMyanmar ? "Unsplash မှ photo ရှာဖွေရန်နှင့် ရွေးချယ်ရန် လိုအပ်သည်။ မဖြည့်ပါက gradient နှင့် custom upload များကိုသာ သုံးမည်။" : "Required for searching and selecting photos from Unsplash. Leave empty to use only gradients and custom uploads.",
        unsplashEnabled: isMyanmar ? "Unsplash ချိတ်ဆက်မှုကို ဖွင့်ထားသည်" : "Unsplash integration enabled",
        saveAll: isMyanmar ? "ဆက်တင်အားလုံးကို သိမ်းမည်" : "Save All Settings",
    };

    const presetCopy: Record<string, { name: string; description: string }> = isMyanmar
        ? {
            minimal: { name: "Minimal", description: "အနည်းဆုံး အချက်အလက်နှင့် သန့်ရှင်းသော layout ကို အသုံးပြုသည်။" },
            glass: { name: "Glass", description: "ဖန်သားပုံစံ card များနှင့် နူးညံ့သော အလင်းရောင်ကို အသုံးပြုသည်။" },
            business: { name: "Business", description: "တည်ငြိမ်ပြီး စနစ်တကျဖြစ်သော professional layout ကို အသုံးပြုသည်။" },
            bold: { name: "Bold", description: "CTA နှင့် အရေးကြီးသော အချက်အလက်များကို ပြင်းထန်စွာ မီးမောင်းထိုးပြသည်။" },
            neon: { name: "Neon", description: "တောက်ပသော neon အရောင်နှင့် futuristic surface များကို အသုံးပြုသည်။" },
        }
        : {};

    const updateBranding = <K extends keyof BrandingState>(key: K, value: BrandingState[K]) => {
        setBranding((prev) => ({ ...prev, [key]: value }));
    };

    const updateLocalizedBrandingText = (
        key: "localizedFooterTexts" | "localizedWelcomeMessages",
        localeCode: SupportedLocale,
        value: string,
    ) => {
        setBranding((prev) => ({
            ...prev,
            [key]: {
                ...((prev[key] as LocalizedTemplateMap | undefined) || {}),
                [localeCode]: value,
            },
        }));
    };

    const toggleApp = (appId: string) => {
        setBranding((prev) => {
            const current = prev.enabledApps ?? [];
            if (current.includes(appId)) {
                const nextEnabledApps = current.filter((id) => id !== appId);
                return {
                    ...prev,
                    enabledApps: nextEnabledApps,
                    primaryAppId:
                        prev.primaryAppId === appId
                            ? nextEnabledApps[0] || ""
                            : prev.primaryAppId,
                };
            }

            return {
                ...prev,
                enabledApps: [...current, appId],
                primaryAppId: prev.primaryAppId || appId,
            };
        });
    };

    const applyPreset = (presetId: string) => {
        const preset = subscriptionPagePresets.find((item) => item.id === presetId);
        if (!preset) return;

        setDefaultTheme(preset.themeId);
        setBranding((prev) => {
            const enabledApps = prev.enabledApps ?? defaultBranding.enabledApps ?? [];
            const nextPrimaryAppId =
                prev.primaryAppId && enabledApps.includes(prev.primaryAppId)
                    ? prev.primaryAppId
                    : enabledApps[0] || "";

            return {
                ...prev,
                ...preset.branding,
                enabledApps,
                primaryAppId: nextPrimaryAppId,
            };
        });
    };

    const moveEnabledApp = (appId: string, direction: "up" | "down") => {
        setBranding((prev) => {
            const current = [...(prev.enabledApps ?? [])];
            const index = current.indexOf(appId);
            if (index === -1) return prev;

            const targetIndex = direction === "up" ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= current.length) {
                return prev;
            }

            const [moved] = current.splice(index, 1);
            current.splice(targetIndex, 0, moved);

            return {
                ...prev,
                enabledApps: current,
            };
        });
    };

    const activePresetId =
        subscriptionPagePresets.find((preset) => (
            defaultTheme === preset.themeId
            && Object.entries(preset.branding).every(([key, value]) => branding[key as keyof BrandingState] === value)
        ))?.id || null;

    const enabledAppIds = branding.enabledApps ?? defaultBranding.enabledApps ?? [];
    const enabledApps = enabledAppIds
        .map((id) => clientApps.find((app) => app.id === id))
        .filter((app): app is (typeof clientApps)[number] => Boolean(app));
    const resolvedPrimaryAppId =
        (branding.primaryAppId && enabledAppIds.includes(branding.primaryAppId))
            ? branding.primaryAppId
            : enabledAppIds[0] || "";
    const visibilityOptions: Array<{
        key: keyof BrandingState;
        label: string;
        description: string;
    }> = [
        {
            key: "showConnectionSummary",
            label: isMyanmar ? "Connection Summary" : "Connection Summary",
            description: isMyanmar ? "အသုံးပြုမှုနှင့် expiration ပါသော summary card ကို desktop/mobile တွင် ပြသမည်။" : "Show the right-side or mobile summary card with usage and expiry.",
        },
        {
            key: "showCompatibleApps",
            label: isMyanmar ? "Compatible Apps" : "Compatible Apps",
            description: isMyanmar ? "Hero area အောက်တွင် secondary app grid ကို ပြသမည်။" : "Show the secondary app grid below the hero area.",
        },
        {
            key: "showHelpContact",
            label: isMyanmar ? "Help & Contact" : "Help & Contact",
            description: isMyanmar ? "Support shortcut နှင့် contact action များကို ပြသမည်။" : "Show support shortcuts and contact actions.",
        },
        {
            key: "showManualSetupButton",
            label: isMyanmar ? "Manual Setup Button" : "Manual Setup Button",
            description: isMyanmar ? "Hero action များထဲတွင် QR/manual setup trigger ကို ဆက်လက် ပြသမည်။" : "Keep the QR/manual setup trigger visible in the hero actions.",
        },
    ];

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{settingsUi.livePreviewTitle}</CardTitle>
                    <CardDescription>
                        {settingsUi.livePreviewDesc}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <SubscriptionPageLivePreview
                        themeId={defaultTheme}
                        branding={branding}
                        supportLink={supportLink}
                    />
                </CardContent>
            </Card>

            <Collapsible open={openSections.presets} onOpenChange={() => toggleSection("presets")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.presetsTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.presets ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.presetsDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                {subscriptionPagePresets.map((preset) => {
                                    const isActive = activePresetId === preset.id;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => applyPreset(preset.id)}
                                            className="rounded-2xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold">{presetCopy[preset.id]?.name || preset.name}</span>
                                                        {isActive && (
                                                            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                                                {settingsUi.presetActive}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {presetCopy[preset.id]?.description || preset.description}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="h-3.5 w-3.5 rounded-full border" style={{ backgroundColor: themeList.find((theme) => theme.id === preset.themeId)?.bgPrimary }} />
                                                    <div className="h-3.5 w-3.5 rounded-full border" style={{ backgroundColor: themeList.find((theme) => theme.id === preset.themeId)?.accent }} />
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                <span className="rounded-full bg-muted px-2.5 py-1">{preset.branding.layout || "default"} layout</span>
                                                <span className="rounded-full bg-muted px-2.5 py-1">{preset.branding.cardStyle || "rounded"} cards</span>
                                                <span className="rounded-full bg-muted px-2.5 py-1">{preset.themeId}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Support Link Settings */}
            <Collapsible open={openSections.basic} onOpenChange={() => toggleSection("basic")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.supportTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.basic ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.supportDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="supportLink">{settingsUi.supportLink}</Label>
                                <Input
                                    id="supportLink"
                                    placeholder={settingsUi.supportPlaceholder}
                                    value={supportLink}
                                    onChange={(e) => setSupportLink(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.supportHelp}
                                </p>
                            </div>
                            {supportLink && (
                                <div className="flex items-center gap-2 text-sm">
                                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                    <a
                                        href={supportLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                    >
                                        {settingsUi.testLink}
                                    </a>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Default Theme Settings */}
            <Collapsible open={openSections.theme} onOpenChange={() => toggleSection("theme")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Palette className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.themeTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.theme ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.themeDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label>{settingsUi.defaultLanguage}</Label>
                                <Select value={defaultLanguage} onValueChange={(value) => setDefaultLanguage(value as SupportedLocale)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {supportedLocales.map((localeOption) => (
                                            <SelectItem key={localeOption} value={localeOption}>
                                                <div className="flex items-center gap-2">
                                                    <span>{localeFlags[localeOption]}</span>
                                                    <span>{localeNames[localeOption]}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.defaultLanguageHelp}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>{settingsUi.themeLabel}</Label>
                                <Select value={defaultTheme} onValueChange={setDefaultTheme}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={settingsUi.selectTheme} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {themeList.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-4 h-4 rounded-full border"
                                                        style={{ backgroundColor: t.bgPrimary, borderColor: t.accent }}
                                                    />
                                                    {t.name}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {settingsUi.previewThemeHelp}
                            </p>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Logo & Branding */}
            <Collapsible open={openSections.branding} onOpenChange={() => toggleSection("branding")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ImageIcon className="w-5 h-5" aria-hidden="true" />
                                    <CardTitle className="text-base">{settingsUi.brandingTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.branding ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.brandingDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="logoUrl">{settingsUi.logoUrl}</Label>
                                <Input
                                    id="logoUrl"
                                    placeholder="https://example.com/logo.png"
                                    value={branding.logoUrl || ""}
                                    onChange={(e) => updateBranding("logoUrl", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.logoUrlHelp}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>{settingsUi.logoSize}: {branding.logoSize || 25}%</Label>
                                <Slider
                                    value={[branding.logoSize || 25]}
                                    onValueChange={([value]) => updateBranding("logoSize", value)}
                                    min={15}
                                    max={40}
                                    step={5}
                                    className="w-full"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.logoSizeHelp}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="brandName">{settingsUi.brandName}</Label>
                                <Input
                                    id="brandName"
                                    placeholder="Atomic-UI"
                                    value={branding.brandName || ""}
                                    onChange={(e) => updateBranding("brandName", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.brandNameHelp}
                                </p>
                            </div>

                            {branding.logoUrl && (
                                <div className="space-y-2">
                                    <Label className="text-sm text-muted-foreground">{settingsUi.logoPreview}</Label>
                                    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={branding.logoUrl}
                                            alt="Custom logo preview"
                                            className="w-16 h-16 object-contain"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = "none";
                                            }}
                                        />
                                        <span className="text-sm text-muted-foreground">
                                            {branding.brandName || settingsUi.brandFallback}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Footer Settings */}
            <Collapsible open={openSections.footer} onOpenChange={() => toggleSection("footer")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.footerTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.footer ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.footerDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="footerText">{settingsUi.footerText}</Label>
                                <Input
                                    id="footerText"
                                    placeholder="Powered by Atomic-UI"
                                    value={branding.footerText || ""}
                                    onChange={(e) => updateBranding("footerText", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.footerHelp}
                                </p>
                            </div>

                            <div className="space-y-3 rounded-xl border border-border/60 p-4">
                                <div>
                                    <Label>{settingsUi.localizedFooter}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {settingsUi.localizedFooterDesc}
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="footerTextEn">{settingsUi.englishTemplate}</Label>
                                        <Textarea
                                            id="footerTextEn"
                                            placeholder="Powered by Atomic-UI"
                                            value={branding.localizedFooterTexts?.en || ""}
                                            onChange={(e) => updateLocalizedBrandingText("localizedFooterTexts", "en", e.target.value)}
                                            rows={3}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="footerTextMy">{settingsUi.burmeseTemplate}</Label>
                                        <Textarea
                                            id="footerTextMy"
                                            placeholder="Atomic-UI ဖြင့် စွမ်းဆောင်ထားသည်"
                                            value={branding.localizedFooterTexts?.my || ""}
                                            onChange={(e) => updateLocalizedBrandingText("localizedFooterTexts", "my", e.target.value)}
                                            rows={3}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>{settingsUi.showPoweredBy}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {settingsUi.showPoweredByDesc}
                                    </p>
                                </div>
                                <Switch
                                    checked={branding.showPoweredBy ?? true}
                                    onCheckedChange={(checked) => updateBranding("showPoweredBy", checked)}
                                />
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Welcome Message */}
            <Collapsible open={openSections.welcome} onOpenChange={() => toggleSection("welcome")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.welcomeTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.welcome ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.welcomeDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>{settingsUi.showWelcome}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {settingsUi.showWelcomeDesc}
                                    </p>
                                </div>
                                <Switch
                                    checked={branding.showWelcome ?? false}
                                    onCheckedChange={(checked) => updateBranding("showWelcome", checked)}
                                />
                            </div>

                            {branding.showWelcome && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="welcomeMessage">{settingsUi.welcomeMessage}</Label>
                                        <Textarea
                                            id="welcomeMessage"
                                            placeholder={settingsUi.welcomePlaceholder}
                                            value={branding.welcomeMessage || ""}
                                            onChange={(e) => updateBranding("welcomeMessage", e.target.value)}
                                            rows={3}
                                        />
                                    </div>

                                    <div className="space-y-3 rounded-xl border border-border/60 p-4">
                                        <div>
                                            <Label>{settingsUi.localizedWelcome}</Label>
                                            <p className="text-xs text-muted-foreground">
                                                {settingsUi.localizedWelcomeDesc}
                                            </p>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="welcomeMessageEn">{settingsUi.englishTemplate}</Label>
                                                <Textarea
                                                    id="welcomeMessageEn"
                                                    placeholder="Welcome! Here is your VPN setup page."
                                                    value={branding.localizedWelcomeMessages?.en || ""}
                                                    onChange={(e) => updateLocalizedBrandingText("localizedWelcomeMessages", "en", e.target.value)}
                                                    rows={4}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="welcomeMessageMy">{settingsUi.burmeseTemplate}</Label>
                                                <Textarea
                                                    id="welcomeMessageMy"
                                                    placeholder="မင်္ဂလာပါ။ ဤနေရာတွင် သင့် VPN setup စာမျက်နှာကို တွေ့နိုင်ပါသည်။"
                                                    value={branding.localizedWelcomeMessages?.my || ""}
                                                    onChange={(e) => updateLocalizedBrandingText("localizedWelcomeMessages", "my", e.target.value)}
                                                    rows={4}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Layout & Style */}
            <Collapsible open={openSections.layout} onOpenChange={() => toggleSection("layout")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layout className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.layoutTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.layout ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.layoutDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{settingsUi.layoutStyle}</Label>
                                    <Select
                                        value={branding.layout || "default"}
                                        onValueChange={(value) =>
                                            updateBranding("layout", value as BrandingState["layout"])
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="default">{settingsUi.themeDefault}</SelectItem>
                                            <SelectItem value="compact">{settingsUi.themeCompact}</SelectItem>
                                            <SelectItem value="detailed">{settingsUi.themeDetailed}</SelectItem>
                                            <SelectItem value="minimal">{settingsUi.themeMinimal}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>{settingsUi.cardStyle}</Label>
                                    <Select
                                        value={branding.cardStyle || "rounded"}
                                        onValueChange={(value) =>
                                            updateBranding("cardStyle", value as BrandingState["cardStyle"])
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="rounded">{settingsUi.cardRounded}</SelectItem>
                                            <SelectItem value="sharp">{settingsUi.cardSharp}</SelectItem>
                                            <SelectItem value="pill">{settingsUi.cardPill}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="fontFamily">{settingsUi.customFont}</Label>
                                <Input
                                    id="fontFamily"
                                    placeholder="Inter, Roboto, Open Sans..."
                                    value={branding.fontFamily || ""}
                                    onChange={(e) => updateBranding("fontFamily", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.customFontHelp}
                                </p>
                            </div>

                            {branding.fontFamily && (
                                <div className="space-y-2">
                                    <Label htmlFor="fontUrl">{settingsUi.fontUrl}</Label>
                                    <Input
                                        id="fontUrl"
                                        placeholder="https://fonts.googleapis.com/css2?family=Inter..."
                                        value={branding.fontUrl || ""}
                                        onChange={(e) => updateBranding("fontUrl", e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {settingsUi.fontUrlHelp}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Collapsible open={openSections.visibility} onOpenChange={() => toggleSection("visibility")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layout className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.visibilityTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.visibility ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.visibilityDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-3 pt-0">
                            {visibilityOptions.map((option) => (
                                <div
                                    key={option.key}
                                    className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3"
                                >
                                    <div className="space-y-0.5">
                                        <Label>{option.label}</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {option.description}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={Boolean(branding[option.key] ?? defaultBranding[option.key])}
                                        onCheckedChange={(checked) => updateBranding(option.key, checked as BrandingState[typeof option.key])}
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Animations */}
            <Collapsible open={openSections.animations} onOpenChange={() => toggleSection("animations")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.animationsTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.animations ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.animationsDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>{settingsUi.enableAnimations}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {settingsUi.enableAnimationsDesc}
                                    </p>
                                </div>
                                <Switch
                                    checked={branding.enableAnimations ?? true}
                                    onCheckedChange={(checked) => updateBranding("enableAnimations", checked)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>{settingsUi.animatedBackground}</Label>
                                <Select
                                    value={branding.animatedBackground || "none"}
                                    onValueChange={(value) =>
                                        updateBranding("animatedBackground", value as BrandingState["animatedBackground"])
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{settingsUi.animationNone}</SelectItem>
                                        <SelectItem value="gradient">{settingsUi.animationGradient}</SelectItem>
                                        <SelectItem value="particles">{settingsUi.animationParticles}</SelectItem>
                                        <SelectItem value="waves">{settingsUi.animationWaves}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.animatedBackgroundHelp}
                                </p>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Usage Alerts */}
            <Collapsible open={openSections.alerts} onOpenChange={() => toggleSection("alerts")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Bell className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.alertsTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.alerts ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.alertsDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>{settingsUi.showUsageAlerts}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {settingsUi.showUsageAlertsDesc}
                                    </p>
                                </div>
                                <Switch
                                    checked={branding.showUsageAlerts ?? true}
                                    onCheckedChange={(checked) => updateBranding("showUsageAlerts", checked)}
                                />
                            </div>

                            {branding.showUsageAlerts && (
                                <div className="space-y-2">
                                    <Label>{settingsUi.alertThresholds}</Label>
                                    <div className="flex gap-2">
                                        {(branding.usageAlertThresholds || [80, 90, 95]).map((threshold, index) => (
                                            <Input
                                                key={index}
                                                type="number"
                                                min={1}
                                                max={100}
                                                value={threshold}
                                                onChange={(e) => {
                                                    const newThresholds = [
                                                        ...(branding.usageAlertThresholds || [80, 90, 95]),
                                                    ];
                                                    newThresholds[index] = parseInt(e.target.value) || 0;
                                                    updateBranding("usageAlertThresholds", newThresholds);
                                                }}
                                                className="w-20"
                                            />
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {settingsUi.alertThresholdsHelp}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* App Buttons */}
            <Collapsible open={openSections.apps} onOpenChange={() => toggleSection("apps")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Smartphone className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.appsTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.apps ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.appsDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                                {settingsUi.appsIntro}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {clientApps.map((app) => (
                                    <div
                                        key={app.id}
                                        className="flex items-center space-x-3 p-3 border rounded-lg"
                                    >
                                        <Checkbox
                                            id={`app-${app.id}`}
                                            checked={(branding.enabledApps || []).includes(app.id)}
                                            onCheckedChange={() => toggleApp(app.id)}
                                        />
                                        <label
                                            htmlFor={`app-${app.id}`}
                                            className="flex-1 cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{app.icon}</span>
                                                <span className="font-medium">{app.name}</span>
                                                {resolvedPrimaryAppId === app.id && (
                                                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                                        {settingsUi.primary}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {app.platforms.join(", ")}
                                            </p>
                                        </label>
                                    </div>
                                ))}
                            </div>

                            {enabledApps.length > 0 ? (
                                <div className="space-y-4 rounded-2xl border border-border/60 p-4">
                                    <div className="space-y-2">
                                        <Label>{settingsUi.primaryAppCta}</Label>
                                        <Select
                                            value={resolvedPrimaryAppId}
                                            onValueChange={(value) => updateBranding("primaryAppId", value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={settingsUi.selectPrimaryApp} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {enabledApps.map((app) => (
                                                    <SelectItem key={app.id} value={app.id}>
                                                        <div className="flex items-center gap-2">
                                                            <span>{app.icon}</span>
                                                            <span>{app.name}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            {settingsUi.primaryAppHelp}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>{settingsUi.secondaryAppOrder}</Label>
                                        <div className="space-y-2">
                                            {enabledApps.map((app, index) => (
                                                <div
                                                    key={app.id}
                                                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg">{app.icon}</span>
                                                            <span className="font-medium">{app.name}</span>
                                                            {resolvedPrimaryAppId === app.id && (
                                                                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                                                    {settingsUi.primaryCta}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {settingsUi.orderPosition(index + 1)}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            disabled={index === 0}
                                                            onClick={() => moveEnabledApp(app.id, "up")}
                                                        >
                                                            <ArrowUp className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            disabled={index === enabledApps.length - 1}
                                                            onClick={() => moveEnabledApp(app.id, "down")}
                                                        >
                                                            <ArrowDown className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                                    {settingsUi.noApps}
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Custom CSS */}
            <Collapsible open={openSections.css} onOpenChange={() => toggleSection("css")}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Code className="w-5 h-5" />
                                    <CardTitle className="text-base">{settingsUi.customCssTitle}</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.css ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                {settingsUi.customCssDesc}
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="customCss">{settingsUi.customCssTitle}</Label>
                                <Textarea
                                    id="customCss"
                                    placeholder={`.subscription-page {
  /* Your custom styles */
}

.qr-code {
  border-radius: 12px;
}`}
                                    value={branding.customCss || ""}
                                    onChange={(e) => updateBranding("customCss", e.target.value)}
                                    rows={8}
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {settingsUi.customCssHelp}
                                </p>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Unsplash API Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Camera className="w-5 h-5" />
                        {settingsUi.unsplashTitle}
                    </CardTitle>
                    <CardDescription>
                        {settingsUi.unsplashDesc}{" "}
                        <a
                            href="https://unsplash.com/developers"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                        >
                            unsplash.com/developers
                        </a>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="unsplashApiKey">{settingsUi.unsplashAccessKey}</Label>
                        <div className="relative">
                            <Input
                                id="unsplashApiKey"
                                type={showApiKey ? "text" : "password"}
                                placeholder={settingsUi.unsplashPlaceholder}
                                value={unsplashApiKey}
                                onChange={(e) => setUnsplashApiKey(e.target.value)}
                                className="pr-10"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowApiKey(!showApiKey)}
                            >
                                {showApiKey ? (
                                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <Eye className="w-4 h-4 text-muted-foreground" />
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {settingsUi.unsplashHelp}
                        </p>
                    </div>
                    {unsplashApiKey && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            {settingsUi.unsplashEnabled}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end sticky bottom-4">
                <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg">
                    {saving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4 mr-2" />
                    )}
                    {settingsUi.saveAll}
                </Button>
            </div>
        </div>
    );
}
