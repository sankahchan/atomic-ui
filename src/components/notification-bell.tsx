"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePathname } from "next/navigation";

export function NotificationBell() {
    const pathname = usePathname();
    const unreadCount = 0; // TODO: Fetch real unread count

    return (
        <Button
            variant="ghost"
            size="icon"
            asChild
            className="relative text-muted-foreground hover:text-foreground"
            title="Notifications"
        >
            <Link href="/dashboard/notifications">
                <Bell className="h-5 w-5" />
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
