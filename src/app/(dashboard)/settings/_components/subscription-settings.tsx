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
import { useToast } from "@/hooks/use-toast";
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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Basic settings
    const [supportLink, setSupportLink] = useState("");
    const [defaultTheme, setDefaultTheme] = useState("dark");
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
                    unsplashApiKey,
                    branding,
                }),
            });

            if (response.ok) {
                toast({
                    title: "Settings saved",
                    description: "Subscription page settings have been updated.",
                });
            } else {
                throw new Error("Failed to save settings");
            }
        } catch (error) {
            toast({
                title: "Save failed",
                description: "Failed to save settings. Please try again.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const updateBranding = <K extends keyof BrandingState>(key: K, value: BrandingState[K]) => {
        setBranding((prev) => ({ ...prev, [key]: value }));
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
            label: "Connection Summary",
            description: "Show the right-side or mobile summary card with usage and expiry.",
        },
        {
            key: "showCompatibleApps",
            label: "Compatible Apps",
            description: "Show the secondary app grid below the hero area.",
        },
        {
            key: "showHelpContact",
            label: "Help & Contact",
            description: "Show support shortcuts and contact actions.",
        },
        {
            key: "showManualSetupButton",
            label: "Manual Setup Button",
            description: "Keep the QR/manual setup trigger visible in the hero actions.",
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
                    <CardTitle className="text-base">Live Preview</CardTitle>
                    <CardDescription>
                        Review the actual subscription page structure while you adjust theme, branding,
                        support, layout, and app settings.
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
                                    <CardTitle className="text-base">Presets</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.presets ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Apply a curated starting point for theme, layout, card shape, and motion.
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
                                                        <span className="text-sm font-semibold">{preset.name}</span>
                                                        {isActive && (
                                                            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {preset.description}
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
                                    <CardTitle className="text-base">Support Contact</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.basic ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Configure the support link shown on user subscription pages.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="supportLink">Support Link</Label>
                                <Input
                                    id="supportLink"
                                    placeholder="https://t.me/yourusername or any URL"
                                    value={supportLink}
                                    onChange={(e) => setSupportLink(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Enter any URL - Telegram, WhatsApp, email (mailto:), or your website.
                                    Leave empty to hide the support button.
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
                                        Test link
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
                                    <CardTitle className="text-base">Default Theme</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.theme ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Set the default theme for subscription pages. This can be overridden per-key.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label>Theme</Label>
                                <Select value={defaultTheme} onValueChange={setDefaultTheme}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select theme" />
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
                                The live preview above updates instantly as you switch themes.
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
                                    <CardTitle className="text-base">Logo & Branding</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.branding ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Customize your logo and brand name on subscription pages.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="logoUrl">Logo URL</Label>
                                <Input
                                    id="logoUrl"
                                    placeholder="https://example.com/logo.png"
                                    value={branding.logoUrl || ""}
                                    onChange={(e) => updateBranding("logoUrl", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    URL to your custom logo. Appears in the QR code center. Leave empty for default.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Logo Size in QR Code: {branding.logoSize || 25}%</Label>
                                <Slider
                                    value={[branding.logoSize || 25]}
                                    onValueChange={([value]) => updateBranding("logoSize", value)}
                                    min={15}
                                    max={40}
                                    step={5}
                                    className="w-full"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Size of the logo overlay in the QR code (15-40%)
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="brandName">Brand Name</Label>
                                <Input
                                    id="brandName"
                                    placeholder="Atomic-UI"
                                    value={branding.brandName || ""}
                                    onChange={(e) => updateBranding("brandName", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Your brand name shown in the page title and footer.
                                </p>
                            </div>

                            {branding.logoUrl && (
                                <div className="space-y-2">
                                    <Label className="text-sm text-muted-foreground">Logo Preview</Label>
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
                                            {branding.brandName || "Your Brand"}
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
                                    <CardTitle className="text-base">Footer</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.footer ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Customize the footer text displayed on subscription pages.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="footerText">Custom Footer Text</Label>
                                <Input
                                    id="footerText"
                                    placeholder="Powered by Atomic-UI"
                                    value={branding.footerText || ""}
                                    onChange={(e) => updateBranding("footerText", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Custom footer text. Leave empty for default.
                                </p>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Show &quot;Powered by&quot; Text</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Display &quot;Powered by Atomic-UI&quot; in the footer.
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
                                    <CardTitle className="text-base">Welcome Message</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.welcome ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Display a custom welcome message to users.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Show Welcome Message</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Display a greeting message at the top of the page.
                                    </p>
                                </div>
                                <Switch
                                    checked={branding.showWelcome ?? false}
                                    onCheckedChange={(checked) => updateBranding("showWelcome", checked)}
                                />
                            </div>

                            {branding.showWelcome && (
                                <div className="space-y-2">
                                    <Label htmlFor="welcomeMessage">Welcome Message</Label>
                                    <Textarea
                                        id="welcomeMessage"
                                        placeholder="Welcome! Here's your VPN subscription details."
                                        value={branding.welcomeMessage || ""}
                                        onChange={(e) => updateBranding("welcomeMessage", e.target.value)}
                                        rows={3}
                                    />
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
                                    <CardTitle className="text-base">Layout & Typography</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.layout ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Customize the page layout, card styles, and fonts.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Layout Style</Label>
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
                                            <SelectItem value="default">Default</SelectItem>
                                            <SelectItem value="compact">Compact</SelectItem>
                                            <SelectItem value="detailed">Detailed</SelectItem>
                                            <SelectItem value="minimal">Minimal</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Card Style</Label>
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
                                            <SelectItem value="rounded">Rounded</SelectItem>
                                            <SelectItem value="sharp">Sharp</SelectItem>
                                            <SelectItem value="pill">Pill</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="fontFamily">Custom Font (Google Fonts)</Label>
                                <Input
                                    id="fontFamily"
                                    placeholder="Inter, Roboto, Open Sans..."
                                    value={branding.fontFamily || ""}
                                    onChange={(e) => updateBranding("fontFamily", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Enter a Google Font name. Leave empty for system default.
                                </p>
                            </div>

                            {branding.fontFamily && (
                                <div className="space-y-2">
                                    <Label htmlFor="fontUrl">Font URL (optional)</Label>
                                    <Input
                                        id="fontUrl"
                                        placeholder="https://fonts.googleapis.com/css2?family=Inter..."
                                        value={branding.fontUrl || ""}
                                        onChange={(e) => updateBranding("fontUrl", e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Full Google Fonts URL. Auto-generated if left empty.
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
                                    <CardTitle className="text-base">Section Visibility</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.visibility ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Choose which subscription page sections stay visible to end users.
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
                                    <CardTitle className="text-base">Animations</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.animations ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Configure page animations and background effects.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Enable Animations</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Enable smooth transitions and hover effects.
                                    </p>
                                </div>
                                <Switch
                                    checked={branding.enableAnimations ?? true}
                                    onCheckedChange={(checked) => updateBranding("enableAnimations", checked)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Animated Background</Label>
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
                                        <SelectItem value="none">None</SelectItem>
                                        <SelectItem value="gradient">Animated Gradient</SelectItem>
                                        <SelectItem value="particles">Particles</SelectItem>
                                        <SelectItem value="waves">Waves</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Add dynamic background effects to the subscription page.
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
                                    <CardTitle className="text-base">Usage Alerts</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.alerts ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Show visual alerts when usage reaches certain thresholds.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Show Usage Alerts</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Display warnings when data usage reaches thresholds.
                                    </p>
                                </div>
                                <Switch
                                    checked={branding.showUsageAlerts ?? true}
                                    onCheckedChange={(checked) => updateBranding("showUsageAlerts", checked)}
                                />
                            </div>

                            {branding.showUsageAlerts && (
                                <div className="space-y-2">
                                    <Label>Alert Thresholds (%)</Label>
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
                                        Show alerts at these usage percentages (e.g., 80%, 90%, 95%).
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
                                    <CardTitle className="text-base">App Buttons</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.apps ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Choose which VPN client apps to show on subscription pages.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                                The first install button on the public page comes from your selected primary app.
                                The remaining enabled apps appear below it in the order shown here.
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
                                                        Primary
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
                                        <Label>Primary App CTA</Label>
                                        <Select
                                            value={resolvedPrimaryAppId}
                                            onValueChange={(value) => updateBranding("primaryAppId", value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select primary app" />
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
                                            This app becomes the main install button in the hero section.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Secondary App Order</Label>
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
                                                                    Primary CTA
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            Order position {index + 1}
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
                                    Enable at least one app to show install buttons on the subscription page.
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
                                    <CardTitle className="text-base">Custom CSS</CardTitle>
                                </div>
                                <ChevronDown
                                    className={`w-5 h-5 transition-transform ${openSections.css ? "rotate-180" : ""}`}
                                />
                            </div>
                            <CardDescription>
                                Inject custom CSS for advanced styling customizations.
                            </CardDescription>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="space-y-2">
                                <Label htmlFor="customCss">Custom CSS</Label>
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
                                    Advanced: Add custom CSS to override default styles.
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
                        Unsplash Integration
                    </CardTitle>
                    <CardDescription>
                        Enable cover images from Unsplash for subscription pages.
                        Get a free API key at{" "}
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
                        <Label htmlFor="unsplashApiKey">Access Key</Label>
                        <div className="relative">
                            <Input
                                id="unsplashApiKey"
                                type={showApiKey ? "text" : "password"}
                                placeholder="Enter your Unsplash Access Key"
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
                            Required for searching and selecting photos from Unsplash.
                            Leave empty to use only gradients and custom uploads.
                        </p>
                    </div>
                    {unsplashApiKey && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            Unsplash integration enabled
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
                    Save All Settings
                </Button>
            </div>
        </div>
    );
}
