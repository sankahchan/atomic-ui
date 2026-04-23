"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function NotificationBell() {
    const { data: alertsData } = trpc.keys.getKeyAlerts.useQuery(undefined, {
        refetchInterval: 60000, // Refresh every minute
    });
    const unreadCount = alertsData?.totalAlerts ?? 0;

    return (
        <Button
            variant="ghost"
            size="icon"
            asChild
            className="relative h-9 w-9 text-muted-foreground hover:text-foreground sm:h-10 sm:w-10"
            title="Notifications"
        >
            <Link href="/dashboard/notifications">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                )}
                {/* Alternative Badge Style if preferred */}
                {/*
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] rounded-full"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
        */}
            </Link>
        </Button>
    );
}
