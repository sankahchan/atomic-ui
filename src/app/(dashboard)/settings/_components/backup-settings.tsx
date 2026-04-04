"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, AlertTriangle, RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function BackupSettings() {
    const router = useRouter();
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);

    const handleDownload = () => {
        window.location.href = withBasePath('/api/backup');
        toast({
            title: "Backup Started",
            description: "Your system backup download should begin shortly.",
        });
    };

    const handleRestore = async () => {
        if (!file) return;

        setIsRestoring(true);
        const formData = new FormData();
        formData.append('backup', file);

        try {
            const res = await fetch(withBasePath('/api/restore'), {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Restore failed');
            }

            toast({
                title: "Restore Successful",
                description: data.message,
                variant: "default",
            });

            // Optional: reload page after a delay
            setTimeout(() => {
                router.refresh();
            }, 2000);

        } catch (error) {
            toast({
                title: "Restore Failed",
                description: (error as Error).message,
                variant: "destructive",
            });
        } finally {
            setIsRestoring(false);
            setFile(null);
        }
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
                        <Upload className="w-5 h-5" />
                        Restore System
                    </CardTitle>
                    <CardDescription>
                        Restore your system from a backup file.
                        <span className="font-bold text-destructive block mt-1">
                            WARNING: This will overwrite your current database and configuration!
                        </span>
                        <span className="block mt-2 text-xs text-muted-foreground">
                            Upload a valid backup <code className="rounded bg-muted px-1 py-0.5">.zip</code> file. Invalid uploads are rejected safely before restore starts.
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="backup-file">Backup File (.zip)</Label>
                        <Input
                            id="backup-file"
                            type="file"
                            accept=".zip"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                    </div>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="destructive"
                                disabled={!file || isRestoring}
                                className="gap-2"
                            >
                                {isRestoring ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <AlertTriangle className="w-4 h-4" />
                                )}
                                {isRestoring ? 'Restoring...' : 'Restore Backup'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete your current
                                    configuration and replace it with the data from the backup file.
                                    The system service may need to be restarted manually if it fails to reload.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleRestore} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Yes, Restore Everything
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>
        </div>
    );
}
