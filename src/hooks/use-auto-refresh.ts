'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'atomic-ui-auto-refresh-interval';
const DEFAULT_INTERVAL = 0; // Off by default

export interface UseAutoRefreshOptions {
    onRefresh: () => void;
    defaultInterval?: number;
}

export interface UseAutoRefreshReturn {
    interval: number;
    setInterval: (interval: number) => void;
    countdown: number;
    isActive: boolean;
    isVisible: boolean;
}

/**
 * Custom hook for auto-refresh functionality with:
 * - localStorage persistence (shared across pages)
 * - Tab visibility handling (pause when tab is hidden)
 * - Countdown timer
 */
export function useAutoRefresh({ onRefresh, defaultInterval }: UseAutoRefreshOptions): UseAutoRefreshReturn {
    const [interval, setIntervalState] = useState<number>(defaultInterval ?? DEFAULT_INTERVAL);
    const [countdown, setCountdown] = useState<number>(0);
    const [isVisible, setIsVisible] = useState<boolean>(true);
    const [isInitialized, setIsInitialized] = useState(false);

    const intervalRef = useRef<number | null>(null);
    const countdownRef = useRef<number | null>(null);
    const onRefreshRef = useRef(onRefresh);

    // Keep onRefresh ref updated
    onRefreshRef.current = onRefresh;

    // Load from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored !== null) {
                const parsed = parseInt(stored, 10);
                if (!isNaN(parsed) && parsed >= 0) {
                    setIntervalState(parsed);
                }
            }
            setIsInitialized(true);
        }
    }, []);

    // Save to localStorage when interval changes
    const updateInterval = useCallback((newInterval: number) => {
        setIntervalState(newInterval);
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, newInterval.toString());
        }
    }, []);

    // Handle tab visibility
    useEffect(() => {
        if (typeof document === 'undefined') return;

        const handleVisibilityChange = () => {
            setIsVisible(document.visibilityState === 'visible');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        setIsVisible(document.visibilityState === 'visible');

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Main refresh logic
    useEffect(() => {
        // Clear existing intervals
        if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (countdownRef.current) {
            window.clearInterval(countdownRef.current);
            countdownRef.current = null;
        }

        // Only run if initialized, interval > 0, and tab is visible
        if (!isInitialized || interval <= 0 || !isVisible) {
            setCountdown(0);
            return;
        }

        // Set initial countdown
        setCountdown(interval);

        // Countdown timer (updates every second)
        countdownRef.current = window.setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    return interval;
                }
                return prev - 1;
            });
        }, 1000);

        // Refresh timer
        intervalRef.current = window.setInterval(() => {
            onRefreshRef.current();
        }, interval * 1000);

        return () => {
            if (intervalRef.current) {
                window.clearInterval(intervalRef.current);
            }
            if (countdownRef.current) {
                window.clearInterval(countdownRef.current);
            }
        };
    }, [interval, isVisible, isInitialized]);

    return {
        interval,
        setInterval: updateInterval,
        countdown,
        isActive: interval > 0 && isVisible,
        isVisible,
    };
}
