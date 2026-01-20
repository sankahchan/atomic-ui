
import { useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    MoreVertical,
    Power,
    Trash2,
    QrCode,
    Copy,
    Eye,
    Share2,
    Settings,
    Shuffle,
    Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

// Reusing DAK_TYPES and statusConfig logic conceptually
const DAK_TYPES = {
    SELF_MANAGED: {
        labelKey: 'dynamic_keys.type.self_managed',
        icon: Shuffle,
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/10',
    },
    MANUAL: {
        labelKey: 'dynamic_keys.type.manual',
        icon: Settings,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
    },
};

const statusConfig = {
    ACTIVE: { color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    DISABLED: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    EXPIRED: { color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    DEPLETED: { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    PENDING: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

interface DynamicGroupListProps {
    keys: any[]; // Using any to avoid complex type imports for now, but should ideally be DAKData
    onToggleStatus: (key: any) => void;
    onDelete: (key: any) => void;
    onCopyUrl: (key: any) => void;
    onShowQR: (key: any) => void;
    isProcessingId: string | null;
}

export function DynamicGroupList({
    keys,
    onToggleStatus,
    onDelete,
    onCopyUrl,
    onShowQR,
    isProcessingId
}: DynamicGroupListProps) {
    const { t } = useLocale();

    // Group by Type
    const groupedKeys = keys.reduce((acc, key) => {
        const type = key.type || 'MANUAL';
        if (!acc[type]) acc[type] = [];
        acc[type].push(key);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <div className="space-y-4">
            {Object.entries(DAK_TYPES).map(([type, config]) => {
                const groupKeys = groupedKeys[type as keyof typeof DAK_TYPES] || [];
                if (groupKeys.length === 0) return null;

                return (
                    <GroupSection
                        key={type}
                        type={type}
                        config={config}
                        keys={groupKeys}
                        t={t}
                        onToggleStatus={onToggleStatus}
                        onDelete={onDelete}
                        onCopyUrl={onCopyUrl}
                        onShowQR={onShowQR}
                        isProcessingId={isProcessingId}
                    />
                );
            })}
        </div>
    );
}

function GroupSection({
    type,
    config,
    keys,
    t,
    onToggleStatus,
    onDelete,
    onCopyUrl,
    onShowQR,
    isProcessingId
}: any) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
            <div className="flex items-center justify-between px-2">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent">
                        {isOpen ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                        <div className="flex items-center gap-2">
                            <config.icon className={cn("w-4 h-4", config.color)} />
                            <span className="font-semibold text-sm">{t(config.labelKey)}</span>
                            <Badge variant="secondary" className="ml-2 text-xs">
                                {keys.length}
                            </Badge>
                        </div>
                    </Button>
                </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
                <Card className="overflow-hidden">
                    <div className="divide-y divide-border">
                        {keys.map((key: any) => (
                            <DynamicKeyRow
                                key={key.id}
                                dak={key}
                                t={t}
                                onToggleStatus={() => onToggleStatus(key)}
                                onDelete={() => onDelete(key)}
                                onCopyUrl={() => onCopyUrl(key)}
                                onShowQR={() => onShowQR(key)}
                                isProcessing={isProcessingId === key.id}
                            />
                        ))}
                    </div>
                </Card>
            </CollapsibleContent>
        </Collapsible>
    );
}

function DynamicKeyRow({
    dak,
    t,
    onToggleStatus,
    onDelete,
    onCopyUrl,
    onShowQR,
    isProcessing
}: any) {
    const status = statusConfig[dak.status as keyof typeof statusConfig] || statusConfig.ACTIVE;

    return (
        <div className="p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Link href={`/dashboard/dynamic-keys/${dak.id}`} className="font-medium hover:underline truncate">
                            {dak.name}
                        </Link>
                        <div className={cn("w-2 h-2 rounded-full shrink-0",
                            dak.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'
                        )} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{dak.attachedKeysCount} attached</span>
                        <span>•</span>
                        <span>{formatBytes(dak.usedBytes)} used</span>
                        {dak.dataLimitBytes && (
                            <>
                                <span>•</span>
                                <span>Limit: {formatBytes(dak.dataLimitBytes)}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onCopyUrl}>
                        <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:inline-flex" onClick={onShowQR}>
                        <QrCode className="h-4 w-4" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onCopyUrl}>
                                <Link2 className="w-4 h-4 mr-2" />
                                Copy URL
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onShowQR}>
                                <QrCode className="w-4 h-4 mr-2" />
                                Show QR
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onToggleStatus}>
                                <Power className="w-4 h-4 mr-2" />
                                {dak.status === 'DISABLED' ? 'Enable' : 'Disable'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onDelete} className="text-destructive">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
}
