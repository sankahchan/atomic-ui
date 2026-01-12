'use client';

/**
 * useLocale Hook
 *
 * Provides locale management with localStorage persistence.
 * Handles SSR/hydration by using mounted state.
 * Syncs across components using custom storage event.
 */

import { useState, useEffect, useCallback } from 'react';
import { type Locale, defaultLocale, locales } from '@/lib/i18n/config';
import { translations } from '@/lib/i18n/translations';

const LOCALE_STORAGE_KEY = 'atomic-ui-locale';
const LOCALE_CHANGE_EVENT = 'atomic-ui-locale-change';

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    if (stored && locales.includes(stored)) {
      setLocaleState(stored);
    }

    // Listen for locale changes from other components
    const handleLocaleChange = (event: CustomEvent<Locale>) => {
      if (event.detail && locales.includes(event.detail)) {
        setLocaleState(event.detail);
      }
    };

    // Listen for storage changes from other tabs
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY && event.newValue) {
        const newLocale = event.newValue as Locale;
        if (locales.includes(newLocale)) {
          setLocaleState(newLocale);
        }
      }
    };

    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    // Dispatch custom event to notify other components in the same tab
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: newLocale }));
  }, []);

  const t = useCallback(
    (key: string): string => {
      return translations[locale]?.[key] ?? translations[defaultLocale]?.[key] ?? key;
    },
    [locale]
  );

  return { locale, setLocale, t, mounted };
}
