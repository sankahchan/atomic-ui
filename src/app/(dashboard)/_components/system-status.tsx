"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Activity, Cpu, HardDrive, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";

function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatUptime(seconds: number) {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || '< 1m';
}

export function SystemStatus() {
    // Poll every 5 seconds
    const { data: stats, isLoading } = trpc.system.getStats.useQuery(undefined, {
        refetchInterval: 5000,
    });

    if (isLoading || !stats) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-medium">System Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                        <div className="h-4 bg-muted animate-pulse rounded" />
                        <div className="h-4 bg-muted animate-pulse rounded" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    System Status
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* CPU */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-muted-foreground" />
                            <span>CPU Load</span>
                        </div>
                        <span className="font-medium">{stats.cpu.percent}%</span>
                    </div>
                    <Progress value={stats.cpu.percent} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">
                        {stats.cpu.cores} Cores
                    </p>
                </div>

                {/* Memory */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            <span>Memory</span>
                        </div>
                        <span className="font-medium">{stats.memory.percent}%</span>
                    </div>
                    <Progress value={stats.memory.percent} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">
                        {formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)}
                    </p>
                </div>

                {/* Disk */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-muted-foreground" />
                            <span>Disk Storage</span>
                        </div>
                        <span className="font-medium">{stats.disk.percent}%</span>
                    </div>
                    <Progress value={stats.disk.percent} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">
                        {formatBytes(stats.disk.used)} / {formatBytes(stats.disk.total)}
                    </p>
                </div>

                {/* Uptime */}
                <div className="pt-2 border-t flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Uptime</span>
                    </div>
                    <span className="font-medium font-mono">
                        {formatUptime(stats.os.uptime)}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}
