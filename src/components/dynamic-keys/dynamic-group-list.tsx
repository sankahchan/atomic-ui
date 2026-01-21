
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
    const [isExpanded, setIsExpanded] = useState(false);
    const status = statusConfig[dak.status as keyof typeof statusConfig] || statusConfig.ACTIVE;

    // Format expiration text
    const getExpirationText = () => {
        if (!dak.expiresAt) return 'Never expires.';
        const date = new Date(dak.expiresAt);
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
                className="flex items-center p-3 hover:bg-muted/30 transition-colors gap-3 cursor-pointer"
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

                {/* Name and token */}
                <div className="flex-1 min-w-0">
                    <Link href={`/dashboard/dynamic-keys/${dak.id}`} className="font-medium text-sm hover:underline truncate block">
                        {dak.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                        {dak.dynamicUrl ? dak.dynamicUrl.substring(0, 16) + '...' : 'No URL'}
                    </div>
                </div>

                {/* Status badge */}
                <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] px-2 h-5 ${dak.status === 'ACTIVE'
                            ? 'text-green-500 border-green-500/30 bg-green-500/10'
                            : 'text-red-500 border-red-500/30 bg-red-500/10'
                        }`}
                >
                    {dak.status === 'ACTIVE' ? 'Active' : dak.status}
                </Badge>

                {/* Compact info */}
                <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <span>{formatBytes(dak.usedBytes)} / {dak.dataLimitBytes ? formatBytes(dak.dataLimitBytes) : '∞'}</span>
                    <span>, Devices {dak.attachedKeysCount || 0}</span>
                    <span>, {getExpirationText()}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                            e.stopPropagation();
                            onShowQR();
                        }}
                    >
                        <QrCode className="h-4 w-4" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => e.stopPropagation()}
                            >
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
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Usage</p>
                            <p className="font-medium">{formatBytes(dak.usedBytes)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Attached Keys</p>
                            <p className="font-medium">{dak.attachedKeysCount || 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Limit</p>
                            <p className="font-medium">{dak.dataLimitBytes ? formatBytes(dak.dataLimitBytes) : 'Unlimited'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Expiration</p>
                            <p className="font-medium">{dak.expiresAt ? new Date(dak.expiresAt).toLocaleDateString() : 'Never'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed">
                        <Button variant="outline" size="sm" onClick={onCopyUrl}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy URL
                        </Button>
                        <Button variant="outline" size="sm" onClick={onShowQR}>
                            <QrCode className="w-4 h-4 mr-2" />
                            Show QR
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onToggleStatus}
                            disabled={isProcessing}
                            className={dak.status === 'ACTIVE' ? 'text-orange-500' : 'text-green-500'}
                        >
                            <Power className="w-4 h-4 mr-2" />
                            {dak.status === 'DISABLED' ? 'Enable' : 'Disable'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
