"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Palette, MessageSquare, ExternalLink, Camera, Eye, EyeOff } from "lucide-react";
import { themeList, getTheme } from "@/lib/subscription-themes";

export function SubscriptionSettings() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [supportLink, setSupportLink] = useState("");
    const [defaultTheme, setDefaultTheme] = useState("dark");
    const [unsplashApiKey, setUnsplashApiKey] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);

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

    const theme = getTheme(defaultTheme);

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
        <div className="space-y-6">
            {/* Support Link Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5" />
                        Support Contact
                    </CardTitle>
                    <CardDescription>
                        Configure the support link shown on user subscription pages.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
            </Card>

            {/* Default Theme Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Palette className="w-5 h-5" />
                        Default Theme
                    </CardTitle>
                    <CardDescription>
                        Set the default theme for subscription pages. This can be overridden per-key.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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

                    {/* Theme Preview */}
                    <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Preview</Label>
                        <div
                            className="rounded-lg p-4 border transition-colors"
                            style={{
                                backgroundColor: theme.bgPrimary,
                                borderColor: theme.border,
                            }}
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                                    style={{ backgroundColor: theme.bgCard }}
                                >
                                    📊
                                </div>
                                <div>
                                    <div className="text-sm font-medium" style={{ color: theme.textPrimary }}>
                                        Data Usage
                                    </div>
                                    <div className="text-xs" style={{ color: theme.textMuted }}>
                                        400.51 GB
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 mb-3">
                                <div
                                    className="flex-1 h-2 rounded-full"
                                    style={{ backgroundColor: theme.progressBg }}
                                >
                                    <div
                                        className="h-full rounded-full w-2/3"
                                        style={{ backgroundColor: theme.progressFill }}
                                    />
                                </div>
                            </div>
                            <div
                                className="py-2 px-3 rounded-lg text-center text-xs font-medium"
                                style={{
                                    background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                                    color: "#fff",
                                }}
                            >
                                Add to Outline
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Unsplash API Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
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
            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Settings
                </Button>
            </div>
        </div>
    );
}
