'use client';

import { formatBytes } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SegmentedUsageBarCompact } from '@/components/ui/segmented-usage-bar';
import {
    QrCode,
    Copy,
    Pencil,
    Trash2,
    Calendar,
    HardDrive,
    Smartphone
} from 'lucide-react';
import { useState } from 'react';

// Define a flexible type for both AccessKey and DynamicKey
interface KeyItemProps {
    id: string;
    name: string;
    status: string;
    usedBytes: number | string | bigint;
    dataLimitBytes: number | string | bigint | null;
    expiresAt: string | Date | null;
    onToggleStatus: (checked: boolean) => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopy: () => void;
    onQr: () => void;
    isProcessing?: boolean;
}

export function KeyRowItem({
    id,
    name,
    status,
    usedBytes,
    dataLimitBytes,
    expiresAt,
    onToggleStatus,
    onEdit,
    onDelete,
    onCopy,
    onQr,
    isProcessing = false
}: KeyItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const used = Number(usedBytes);
    const limit = dataLimitBytes ? Number(dataLimitBytes) : null;
    const percentage = limit ? Math.min(Math.round((used / limit) * 100), 100) : 0;

    const isExpired = expiresAt && new Date(expiresAt) < new Date();
    const isActive = status === 'ACTIVE' && !isExpired;

    // Format expiration text
    const getExpirationText = () => {
        if (!expiresAt) return 'Never expires.';
        const date = new Date(expiresAt);
        const now = new Date();
        const diffTime = date.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'Expired';
        if (diffDays === 0) return 'Expires today';
        return `${diffDays}d left`;
    };

    return (
        <div className="border-b last:border-0">
            {/* Compact Row */}
            <div
                className="flex items-center p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors gap-3 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Info button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                    }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                    </svg>
                </Button>

                {/* Name and truncated ID */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                        {id.substring(0, 16)}...
                    </div>
                </div>

                {/* Status badge */}
                <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] px-2 h-5 ${isActive
                            ? 'text-green-500 border-green-500/30 bg-green-500/10'
                            : 'text-red-500 border-red-500/30 bg-red-500/10'
                        }`}
                >
                    {isActive ? 'Active' : isExpired ? 'Expired' : 'Disabled'}
                </Badge>

                {/* Compact info */}
                <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {formatBytes(used)} / {limit ? formatBytes(limit) : '∞'}
                    </span>
                    <span className="flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        0
                    </span>
                    <span>{getExpirationText()}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                            e.stopPropagation();
                            onQr();
                        }}
                    >
                        <QrCode className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                            e.stopPropagation();
                            // More options dropdown
                        }}
                    >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="5" r="1" />
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="12" cy="19" r="1" />
                        </svg>
                    </Button>

                    {/* Expand chevron */}
                    <svg
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
                <div className="px-3 pb-3 pt-1 bg-muted/30 border-t border-dashed">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div className="col-span-2">
                            <p className="text-xs text-muted-foreground mb-1">Usage</p>
                            <SegmentedUsageBarCompact
                                valueBytes={used}
                                limitBytes={limit || undefined}
                            />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Expiration</p>
                            <p className="font-medium flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Never'}
                            </p>
                        </div>
                        <div className="flex items-end gap-2">
                            <Switch
                                checked={status === 'ACTIVE'}
                                onCheckedChange={onToggleStatus}
                                disabled={isProcessing}
                                className="data-[state=checked]:bg-green-500"
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCopy}>
                                <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={onDelete}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
