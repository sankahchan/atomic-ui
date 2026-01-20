'use client';

import { formatBytes } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
    QrCode,
    Copy,
    Pencil,
    Trash2,
    Calendar,
    HardDrive
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

    const used = Number(usedBytes);
    const limit = dataLimitBytes ? Number(dataLimitBytes) : null;
    const percentage = limit ? Math.min(Math.round((used / limit) * 100), 100) : 0;

    const isExpired = expiresAt && new Date(expiresAt) < new Date();
    const isActive = status === 'ACTIVE' && !isExpired;

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center p-4 border-b last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors gap-4">
            {/* 1. ID/Name/Status */}
            <div className="flex items-center gap-3 w-full sm:w-[250px] shrink-0">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium truncate text-sm" title={name}>{name}</span>
                        {!isActive && (
                            <Badge variant="outline" className="text-[10px] px-1 h-5 text-red-500 border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900">
                                {isExpired ? 'EXPIRED' : 'DISABLED'}
                            </Badge>
                        )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                        ID: {id.substring(0, 8)}...
                    </div>
                </div>

                <Switch
                    checked={status === 'ACTIVE'}
                    onCheckedChange={onToggleStatus}
                    disabled={isProcessing}
                    className="data-[state=checked]:bg-green-500"
                />
            </div>

            {/* 2. Usage Bar */}
            <div className="flex-1 w-full sm:w-auto min-w-[200px]">
                <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground flex items-center gap-1">
                        <HardDrive className="h-3 w-3" /> Usage
                    </span>
                    <span className="font-mono">
                        {formatBytes(used)}
                        {limit && <span className="text-muted-foreground"> / {formatBytes(limit)}</span>}
                    </span>
                </div>
                <div className="relative h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${percentage > 90 ? 'bg-red-500' :
                            percentage > 75 ? 'bg-orange-500' :
                                'bg-blue-500'
                            }`}
                        style={{ width: limit ? `${percentage}%` : '5%' }}
                    />
                </div>
            </div>

            {/* 3. Expiration */}
            <div className="w-full sm:w-[150px] shrink-0 text-right sm:text-left">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Calendar className="h-3 w-3" /> Expiration
                </div>
                {expiresAt ? (
                    <Badge variant="secondary" className="font-mono text-xs font-normal">
                        {new Date(expiresAt).toLocaleDateString()}
                    </Badge>
                ) : (
                    <span className="text-xs text-muted-foreground">Unlimited</span>
                )}
            </div>

            {/* 4. Actions */}
            <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                <Button variant="ghost" size="icon" onClick={onQr} title="Show QR">
                    <QrCode className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onCopy} title="Copy Key">
                    <Copy className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onEdit} title="Edit">
                    <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onDelete} title="Delete" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
