import { useState, useEffect, useCallback } from 'react';

// Window in milliseconds to consider a key "online" after activity
// 30 seconds provides responsive status while avoiding flicker
const ONLINE_WINDOW_MS = 30000; // 30 seconds

interface KeyUsage {
    id: string;
    usedBytes: string;
}

interface ActivityState {
    lastUsedBytes: bigint;
    lastActiveAt: number;
}

interface UseKeyActivityReturn {
    isOnline: (id: string) => boolean;
    onlineCount: number;
    onlineKeyIds: Set<string>;
}

export function useKeyActivity(keys: KeyUsage[] | undefined): UseKeyActivityReturn {
    const [activityMap, setActivityMap] = useState<Record<string, ActivityState>>({});
    const [now, setNow] = useState(Date.now());

    // Update "now" periodically to ensure online status expires even if no data comes in
    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 5000); // Check every 5s for expiration
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!keys) return;

        setActivityMap(prevMap => {
            const newMap = { ...prevMap };
            const currentTime = Date.now();
            let hasChanges = false;

            keys.forEach(key => {
                const currentBytes = BigInt(key.usedBytes);
                const existing = newMap[key.id];

                if (!existing) {
                    // First time seeing this key - set baseline, don't mark active yet
                    // We need at least 2 polls to detect traffic increase (delta-based)
                    newMap[key.id] = {
                        lastUsedBytes: currentBytes,
                        lastActiveAt: 0, // Start as offline, will go online on next poll if traffic increases
                    };
                    hasChanges = true;
                } else {
                    if (currentBytes > existing.lastUsedBytes) {
                        // Usage increased -> Mark active
                        newMap[key.id] = {
                            lastUsedBytes: currentBytes,
                            lastActiveAt: currentTime,
                        };
                        hasChanges = true;
                    } else if (currentBytes < existing.lastUsedBytes) {
                        // Counter reset (e.g. server restart) -> Update baseline
                        // Reset to offline state since we can't trust the old values
                        newMap[key.id] = {
                            lastUsedBytes: currentBytes,
                            lastActiveAt: 0,
                        };
                        hasChanges = true;
                    }
                    // If bytes equal, do nothing (keep existing state)
                }
            });

            return hasChanges ? newMap : prevMap;
        });
    }, [keys]);

    const isOnline = useCallback((id: string) => {
        const state = activityMap[id];
        if (!state) return false;
        return (now - state.lastActiveAt) <= ONLINE_WINDOW_MS;
    }, [activityMap, now]);

    const onlineKeyIds = new Set(
        Object.keys(activityMap).filter(id => isOnline(id))
    );

    return {
        isOnline,
        onlineCount: onlineKeyIds.size,
        onlineKeyIds,
    };
}
