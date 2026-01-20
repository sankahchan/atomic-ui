'use client';

import * as React from 'react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Server, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';

interface ServerGroupRowProps {
    serverName: string;
    serverLocation?: string | null;
    serverCountryCode?: string | null;
    totalKeys: number;
    totalUsedBytes: number;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}

export function ServerGroupRow({
    serverName,
    serverLocation,
    serverCountryCode,
    totalKeys,
    totalUsedBytes,
    open,
    onOpenChange,
    children
}: ServerGroupRowProps) {
    const [isOpen, setIsOpen] = React.useState(open || false);

    const handleOpenChange = (value: boolean) => {
        setIsOpen(value);
        onOpenChange?.(value);
    };

    const getFlagEmoji = (countryCode: string | null | undefined) => {
        if (!countryCode) return '🌐';
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    };

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={handleOpenChange}
            className="border rounded-xl bg-card shadow-sm mb-4 overflow-hidden"
        >
            <div className="flex items-center justify-between p-4 bg-muted/30">
                <div className="flex items-center gap-4">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                            {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </Button>
                    </CollapsibleTrigger>

                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">
                            {getFlagEmoji(serverCountryCode)}
                        </div>
                        <div>
                            <h3 className="font-semibold flex items-center gap-2">
                                {serverName}
                                <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold border border-green-500/20">
                                    ONLINE
                                </span>
                            </h3>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>{serverLocation || 'Unknown Location'}</span>
                                <span>•</span>
                                <span>{totalKeys} Keys</span>
                                <span>•</span>
                                <span>{formatBytes(totalUsedBytes)} Used</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="hidden sm:block">
                    {/* Could add server-level actions here later */}
                </div>
            </div>

            <CollapsibleContent className="border-t">
                <div className="divide-y divide-border">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
