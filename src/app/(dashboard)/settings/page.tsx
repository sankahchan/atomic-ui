"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupSettings } from "./_components/backup-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Shield, User } from "lucide-react";

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your application configuration and preferences.
                </p>
            </div>

            <Tabs defaultValue="backup" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="general" disabled>
                        <Settings className="w-4 h-4 mr-2" />
                        General
                    </TabsTrigger>
                    <TabsTrigger value="account" disabled>
                        <User className="w-4 h-4 mr-2" />
                        Account
                    </TabsTrigger>
                    <TabsTrigger value="backup">
                        <Shield className="w-4 h-4 mr-2" />
                        Backup & Restore
                    </TabsTrigger>
                </TabsList>

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
