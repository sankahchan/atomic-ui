"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupSettings } from "./_components/backup-settings";
import { SubscriptionSettings } from "./_components/subscription-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Shield, User, Palette, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your application configuration and preferences.
                </p>
            </div>

            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium">Legacy settings view</p>
                        <p className="text-sm text-muted-foreground">
                            The main dashboard settings page now contains the newer backup, restore, security, and automation controls in one place.
                        </p>
                    </div>
                    <Button asChild variant="outline" className="gap-2">
                        <Link href="/dashboard/settings">
                            Open Dashboard Settings
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
                        <span className="min-w-0 break-words">Subscription Page</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="backup"
                        className="h-auto min-h-11 min-w-0 flex-1 basis-[calc(50%-0.125rem)] justify-start gap-2 whitespace-normal rounded-[1rem] px-3 py-2.5 text-left leading-tight sm:flex-none sm:basis-auto sm:justify-center"
                    >
                        <Shield className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">Backup & Restore</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="general"
                        disabled
                        className="h-auto min-h-11 min-w-0 flex-1 basis-[calc(50%-0.125rem)] justify-start gap-2 whitespace-normal rounded-[1rem] px-3 py-2.5 text-left leading-tight sm:flex-none sm:basis-auto sm:justify-center"
                    >
                        <Settings className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">General</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="account"
                        disabled
                        className="h-auto min-h-11 min-w-0 flex-1 basis-[calc(50%-0.125rem)] justify-start gap-2 whitespace-normal rounded-[1rem] px-3 py-2.5 text-left leading-tight sm:flex-none sm:basis-auto sm:justify-center"
                    >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">Account</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="subscription">
                    <SubscriptionSettings />
                </TabsContent>

                <TabsContent value="general">
                    <Card>
                        <CardHeader>
                            <CardTitle>General Settings</CardTitle>
                            <CardDescription>
                                Configure general application settings.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Coming soon...</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="account">
                    <Card>
                        <CardHeader>
                            <CardTitle>Account Settings</CardTitle>
                            <CardDescription>
                                Manage your admin account.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Coming soon...</p>
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
