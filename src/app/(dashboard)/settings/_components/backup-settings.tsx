"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Download, ExternalLink, ShieldCheck, Terminal } from "lucide-react";
import { buildOfflineRestoreCommand } from "@/lib/backup-files";
import { withBasePath } from "@/lib/base-path";

export function BackupSettings() {
    const { toast } = useToast();
    const sqliteRestoreCommand = buildOfflineRestoreCommand('backup.db', '/absolute/path/to/backup.db');
    const postgresRestoreCommand = buildOfflineRestoreCommand('backup.dump', '/absolute/path/to/backup.dump');

    const handleDownload = () => {
        window.location.href = withBasePath('/api/backup');
        toast({
            title: "Backup Started",
            description: "Your system backup download should begin shortly.",
        });
    };

    const handleShowOfflineRestore = () => {
        toast({
            title: "Restore runs offline only",
            description: `SQLite: ${sqliteRestoreCommand} | Postgres: ${postgresRestoreCommand}`,
            variant: "destructive",
        });
    };

    return (
        <div className="space-y-6">
            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Primary settings workspace
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Backup and restore also live in the main dashboard settings page. Use that workspace for the newer layout and the same safer restore handling.
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

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-primary" />
                        Backup System
                    </CardTitle>
                    <CardDescription>
                        Download a full backup of your database key configuration.
                        Includes the database file and environment variables.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleDownload} variant="outline" className="gap-2">
                        <Download className="w-4 h-4" />
                        Download Backup (.zip)
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-destructive/20 bg-destructive/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <Terminal className="w-5 h-5" />
                        Offline Restore Only
                    </CardTitle>
                    <CardDescription>
                        Restore is intentionally disabled from the running web app.
                        <span className="font-bold text-destructive block mt-1">
                            Stop the service first, then run the CLI restore command on the server.
                        </span>
                        <span className="block mt-2 text-xs text-muted-foreground">
                            Use the command that matches the backup format you created in the dashboard settings workspace:
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border bg-background/70 p-4 font-mono text-xs sm:text-sm space-y-2">
                        <div>{sqliteRestoreCommand}</div>
                        <div>{postgresRestoreCommand}</div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Use the dashboard backup list to download the file first, stop
                        <code className="mx-1 rounded bg-muted px-1 py-0.5">atomic-ui.service</code>
                        , run the command, then start the service again.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Button variant="destructive" className="gap-2" onClick={handleShowOfflineRestore}>
                            <Terminal className="w-4 h-4" />
                            Show Offline Restore Command
                        </Button>
                        <Button asChild variant="outline" className="gap-2">
                            <Link href="/dashboard/settings">
                                Open Dashboard Settings
                                <ExternalLink className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
