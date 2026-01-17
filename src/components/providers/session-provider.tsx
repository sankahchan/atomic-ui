'use client';

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface SessionContextType {
    lastActivity: number;
}

const SessionContext = createContext<SessionContextType>({
    lastActivity: Date.now(),
});

interface SessionProviderProps {
    children: React.ReactNode;
    timeoutMinutes?: number;
}

// Events to track activity
const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

export function SessionProvider({
    children,
    timeoutMinutes = 15
}: SessionProviderProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();
    const [lastActivity, setLastActivity] = useState(Date.now());
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const resetTimer = () => {
        setLastActivity(Date.now());
    };

    const logout = useCallback(() => {
        // Clear any local storage auth tokens if you use them
        // Call logout endpoint
        fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
            router.push('/login?reason=timeout');
            toast({
                title: "Session Expired",
                description: "You have been logged out due to inactivity.",
                variant: "destructive",
            });
        });
    }, [router, toast]);

    useEffect(() => {
        // Check periodically if timeout has been reached
        const checkTimeout = () => {
            const now = Date.now();
            const timeSinceLastActivity = now - lastActivity;
            const timeoutMs = timeoutMinutes * 60 * 1000;

            if (timeSinceLastActivity > timeoutMs) {
                // Only logout if we are not already on the login page
                if (pathname !== '/login') {
                    logout();
                }
            }
        };

        // Set up activity listeners
        const handleActivity = () => {
            resetTimer();
        };

        // Throttle activity updates to avoid excessive state updates
        let lastUpdate = 0;
        const throttledHandler = () => {
            const now = Date.now();
            if (now - lastUpdate > 1000) { // Update at most once per second
                lastUpdate = now;
                handleActivity();
            }
        };

        // Check interval
        const interval = setInterval(checkTimeout, 60000); // Check every minute

        // Initial setup
        resetTimer();

        // Add listeners
        EVENTS.forEach(event => {
            window.addEventListener(event, throttledHandler);
        });

        // Copy ref for cleanup
        const timer = timerRef.current;

        return () => {
            EVENTS.forEach((event) => {
                window.removeEventListener(event, resetTimer);
            });
            if (timer) clearTimeout(timer);
            clearInterval(interval);
            EVENTS.forEach(event => {
                window.removeEventListener(event, throttledHandler);
            });
        };
    }, [pathname, timeoutMinutes, lastActivity, logout]);

    return (
        <SessionContext.Provider value={{ lastActivity }}>
            {children}
        </SessionContext.Provider>
    );
}

export const useSession = () => useContext(SessionContext);
