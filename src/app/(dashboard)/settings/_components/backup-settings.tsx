"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
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
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);

    const handleDownload = () => {
        window.location.href = '/api/backup';
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
            const res = await fetch('/api/restore', {
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
                window.location.reload();
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
