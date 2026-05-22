"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/hooks/use-locale";
import { Download, ExternalLink, ShieldCheck, Terminal } from "lucide-react";
import { buildOfflineRestoreCommand } from "@/lib/backup-files";
import { withBasePath } from "@/lib/base-path";

export function BackupSettings() {
    const { toast } = useToast();
    const { locale } = useLocale();
    const isMyanmar = locale === 'my';
    const sqliteRestoreCommand = buildOfflineRestoreCommand('backup.db', '/absolute/path/to/backup.db');
    const postgresRestoreCommand = buildOfflineRestoreCommand('backup.dump', '/absolute/path/to/backup.dump');

    const handleDownload = () => {
        window.location.href = withBasePath('/api/backup');
        toast({
            title: isMyanmar ? "Backup စတင်ပါပြီ" : "Backup Started",
            description: isMyanmar
                ? "စနစ် backup ကို မကြာမီ ဒေါင်းလုဒ် စတင်မည်။"
                : "Your system backup download should begin shortly.",
        });
    };

    const handleShowOfflineRestore = () => {
        toast({
            title: isMyanmar ? "Restore ကို offline ဖြင့်သာ လုပ်နိုင်သည်" : "Restore runs offline only",
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
                            {isMyanmar ? 'အဓိက ဆက်တင်များ နေရာ' : 'Primary settings workspace'}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {isMyanmar
                                ? 'အရန်သိမ်းခြင်းနှင့် ပြန်လည်ထည့်သွင်းခြင်းကို အဓိက ဒက်ရှ်ဘုတ် ဆက်တင်များ စာမျက်နှာတွင်လည်း စီမံနိုင်ပါသည်။ ပိုမိုသစ်လွင်သော အပြင်အဆင်နှင့် ပိုလုံခြုံသော ပြန်လည်ထည့်သွင်းမှု လုပ်ဆောင်ချက်အတွက် ထိုနေရာကို အသုံးပြုပါ။'
                                : 'Backup and restore also live in the main dashboard settings page. Use that workspace for the newer layout and the same safer restore handling.'}
                        </p>
                    </div>
                    <Button asChild variant="outline" className="gap-2">
                        <Link href="/dashboard/settings">
                            {isMyanmar ? 'ဒက်ရှ်ဘုတ် ဆက်တင်များကို ဖွင့်မည်' : 'Open Dashboard Settings'}
                            <ExternalLink className="h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-primary" />
                        {isMyanmar ? 'အရန်သိမ်း စနစ်' : 'Backup System'}
                    </CardTitle>
                    <CardDescription>
                        {isMyanmar
                            ? 'ဒေတာဘေ့စ်နှင့် သော့ဆက်တင် အပြည့်အစုံပါဝင်သော အရန်သိမ်းဖိုင်ကို ဒေါင်းလုဒ်လုပ်ပါ။'
                            : 'Download a full backup of your database key configuration. Includes the database file and environment variables.'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleDownload} variant="outline" className="gap-2">
                        <Download className="w-4 h-4" />
                        {isMyanmar ? 'အရန်သိမ်း (.zip) ကို ဒေါင်းလုဒ်လုပ်မည်' : 'Download Backup (.zip)'}
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-destructive/20 bg-destructive/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <Terminal className="w-5 h-5" />
                        {isMyanmar ? 'အော့ဖ်လိုင်း ပြန်လည်ထည့်သွင်းမှုသာ' : 'Offline Restore Only'}
                    </CardTitle>
                    <CardDescription>
                        {isMyanmar
                            ? 'လက်ရှိ လည်ပတ်နေသော ဝဘ်အက်ပ်အတွင်းမှ ပြန်လည်ထည့်သွင်းမှုကို တမင်ပိတ်ထားသည်။'
                            : 'Restore is intentionally disabled from the running web app.'}
                        <span className="font-bold text-destructive block mt-1">
                            {isMyanmar
                                ? 'ဝန်ဆောင်မှုကို အရင်ပိတ်ပြီးနောက် ဆာဗာပေါ်တွင် CLI ပြန်လည်ထည့်သွင်းမှု အမိန့်ကို လည်ပတ်ပါ။'
                                : 'Stop the service first, then run the CLI restore command on the server.'}
                        </span>
                        <span className="block mt-2 text-xs text-muted-foreground">
                            {isMyanmar
                                ? 'ဒက်ရှ်ဘုတ် ဆက်တင်များတွင် ဖန်တီးထားသော အရန်သိမ်းဖိုင် အမျိုးအစားနှင့် ကိုက်ညီသည့် အမိန့်ကို အသုံးပြုပါ။'
                                : 'Use the command that matches the backup format you created in the dashboard settings workspace:'}
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border bg-background/70 p-4 font-mono text-xs sm:text-sm space-y-2">
                        <div>{sqliteRestoreCommand}</div>
                        <div>{postgresRestoreCommand}</div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {isMyanmar ? 'ဒက်ရှ်ဘုတ် အရန်သိမ်းစာရင်းမှ ဖိုင်ကို အရင်ဒေါင်းလုဒ်လုပ်ပါ၊' : 'Use the dashboard backup list to download the file first, stop'}
                        <code className="mx-1 rounded bg-muted px-1 py-0.5">atomic-ui.service</code>
                        {isMyanmar ? 'ကို ပိတ်ပြီး အမိန့်ကို လည်ပတ်ကာ ဝန်ဆောင်မှုကို ပြန်စတင်ပါ။' : ', run the command, then start the service again.'}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Button variant="destructive" className="gap-2" onClick={handleShowOfflineRestore}>
                            <Terminal className="w-4 h-4" />
                            {isMyanmar ? 'အော့ဖ်လိုင်း ပြန်လည်ထည့်သွင်းမှု အမိန့်ကို ပြမည်' : 'Show Offline Restore Command'}
                        </Button>
                        <Button asChild variant="outline" className="gap-2">
                            <Link href="/dashboard/settings">
                                {isMyanmar ? 'ဒက်ရှ်ဘုတ် ဆက်တင်များကို ဖွင့်မည်' : 'Open Dashboard Settings'}
                                <ExternalLink className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
