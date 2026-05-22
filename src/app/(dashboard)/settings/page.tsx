"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupSettings } from "./_components/backup-settings";
import { SubscriptionSettings } from "./_components/subscription-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Shield, User, Palette, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

export default function SettingsPage() {
    const { locale } = useLocale();
    const isMyanmar = locale === "my";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{isMyanmar ? "ဆက်တင်များ" : "Settings"}</h1>
                <p className="text-muted-foreground">
                    {isMyanmar
                        ? "Application ဆိုင်ရာ configuration နှင့် preference များကို စီမံနိုင်ပါသည်။"
                        : "Manage your application configuration and preferences."}
                </p>
            </div>

            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium">{isMyanmar ? "ဟောင်းသော settings မျက်နှာစာ" : "Legacy settings view"}</p>
                        <p className="text-sm text-muted-foreground">
                            {isMyanmar
                                ? "အဓိက dashboard settings စာမျက်နှာတွင် backup၊ restore၊ security နှင့် automation control အသစ်များကို တစ်နေရာတည်းတွင် ထည့်ထားပါသည်။"
                                : "The main dashboard settings page now contains the newer backup, restore, security, and automation controls in one place."}
                        </p>
                    </div>
                    <Button asChild variant="outline" className="gap-2">
                        <Link href="/dashboard/settings">
                            {isMyanmar ? "Dashboard settings ဖွင့်မည်" : "Open Dashboard Settings"}
                            <ExternalLink className="h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Tabs defaultValue="subscription" className="space-y-4">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-[1.25rem] p-1.5">
                    <TabsTrigger
                        value="subscription"
                        className="h-auto min-h-11 min-w-0 flex-1 basis-[calc(50%-0.125rem)] justify-start gap-2 whitespace-normal rounded-[1rem] px-3 py-2.5 text-left leading-tight sm:flex-none sm:basis-auto sm:justify-center"
                    >
                        <Palette className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">{isMyanmar ? "Subscription စာမျက်နှာ" : "Subscription Page"}</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="backup"
                        className="h-auto min-h-11 min-w-0 flex-1 basis-[calc(50%-0.125rem)] justify-start gap-2 whitespace-normal rounded-[1rem] px-3 py-2.5 text-left leading-tight sm:flex-none sm:basis-auto sm:justify-center"
                    >
                        <Shield className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">{isMyanmar ? "Backup နှင့် Restore" : "Backup & Restore"}</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="general"
                        disabled
                        className="h-auto min-h-11 min-w-0 flex-1 basis-[calc(50%-0.125rem)] justify-start gap-2 whitespace-normal rounded-[1rem] px-3 py-2.5 text-left leading-tight sm:flex-none sm:basis-auto sm:justify-center"
                    >
                        <Settings className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">{isMyanmar ? "အထွေထွေ" : "General"}</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="account"
                        disabled
                        className="h-auto min-h-11 min-w-0 flex-1 basis-[calc(50%-0.125rem)] justify-start gap-2 whitespace-normal rounded-[1rem] px-3 py-2.5 text-left leading-tight sm:flex-none sm:basis-auto sm:justify-center"
                    >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">{isMyanmar ? "အကောင့်" : "Account"}</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="subscription">
                    <SubscriptionSettings />
                </TabsContent>

                <TabsContent value="general">
                    <Card>
                        <CardHeader>
                            <CardTitle>{isMyanmar ? "အထွေထွေ ဆက်တင်များ" : "General Settings"}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? "Application အထွေထွေ ဆက်တင်များကို ပြင်ဆင်နိုင်ပါသည်။" : "Configure general application settings."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{isMyanmar ? "မကြာမီ ထည့်သွင်းပေးပါမည်..." : "Coming soon..."}</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="account">
                    <Card>
                        <CardHeader>
                            <CardTitle>{isMyanmar ? "အကောင့် ဆက်တင်များ" : "Account Settings"}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? "သင်၏ admin account ကို စီမံနိုင်ပါသည်။" : "Manage your admin account."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{isMyanmar ? "မကြာမီ ထည့်သွင်းပေးပါမည်..." : "Coming soon..."}</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="backup">
                    <BackupSettings />
                </TabsContent>
            </Tabs>
        </div>
    );
}
