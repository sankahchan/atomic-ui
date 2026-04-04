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
                <TabsList>
                    <TabsTrigger value="subscription">
                        <Palette className="w-4 h-4 mr-2" />
                        Subscription Page
                    </TabsTrigger>
                    <TabsTrigger value="backup">
                        <Shield className="w-4 h-4 mr-2" />
                        Backup & Restore
                    </TabsTrigger>
                    <TabsTrigger value="general" disabled>
                        <Settings className="w-4 h-4 mr-2" />
                        General
                    </TabsTrigger>
                    <TabsTrigger value="account" disabled>
                        <User className="w-4 h-4 mr-2" />
                        Account
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
