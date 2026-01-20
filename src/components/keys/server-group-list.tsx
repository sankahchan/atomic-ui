'use client';

import { ServerGroupRow } from './server-group-row';
import { KeyRowItem } from './key-row-item';
import { useMemo } from 'react';

// Define the shape of key data expected by this component
export interface GroupableKey {
    id: string;
    name: string;
    accessUrl: string | null;
    status: string;
    usedBytes: number | string | bigint;
    dataLimitBytes: number | string | bigint | null;
    expiresAt: string | Date | null;
    server: {
        id: string;
        name: string;
        location?: string | null;
        countryCode?: string | null;
    };
}

interface ServerGroupListProps<T extends GroupableKey> {
    keys: T[];
    onToggleStatus: (key: T, checked: boolean) => void;
    onEdit: (key: T) => void;
    onDelete: (key: T) => void;
    onCopy: (key: T) => void;
    onQr: (key: T) => void;
    isProcessingId?: string | null;
}

export function ServerGroupList<T extends GroupableKey>({
    keys,
    onToggleStatus,
    onEdit,
    onDelete,
    onCopy,
    onQr,
    isProcessingId
}: ServerGroupListProps<T>) {

    // Group keys by server ID
    const groups = useMemo(() => {
        const grouped = new Map<string, {
            server: T['server'];
            keys: T[];
            totalUsed: number;
        }>();

        keys.forEach(key => {
            const serverId = key.server.id;
            if (!grouped.has(serverId)) {
                grouped.set(serverId, {
                    server: key.server,
                    keys: [],
                    totalUsed: 0
                });
            }

            const group = grouped.get(serverId)!;
            group.keys.push(key);
            group.totalUsed += Number(key.usedBytes);
        });

        return Array.from(grouped.values());
    }, [keys]);

    if (keys.length === 0) {
        return (
            <div className="text-center py-12 border rounded-xl bg-card border-dashed">
                <p className="text-muted-foreground">No keys found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {groups.map((group) => (
                <ServerGroupRow
                    key={group.server.id}
                    serverName={group.server.name}
                    serverLocation={group.server.location}
                    serverCountryCode={group.server.countryCode}
                    totalKeys={group.keys.length}
                    totalUsedBytes={group.totalUsed}
                    open={true} // Default open for better visibility
                >
                    {group.keys.map(key => (
                        <KeyRowItem
                            key={key.id}
                            id={key.id}
                            name={key.name}
                            status={key.status}
                            usedBytes={key.usedBytes}
                            dataLimitBytes={key.dataLimitBytes}
                            expiresAt={key.expiresAt}
                            onToggleStatus={(checked) => onToggleStatus(key, checked)}
                            onEdit={() => onEdit(key)}
                            onDelete={() => onDelete(key)}
                            onCopy={() => onCopy(key)}
                            onQr={() => onQr(key)}
                            isProcessing={isProcessingId === key.id}
                        />
                    ))}
                </ServerGroupRow>
            ))}
        </div>
    );
}
