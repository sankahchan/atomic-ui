'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

const STORAGE_VERSION = 'v1';
const DEBOUNCE_MS = 300;

const quickFiltersSchema = z.object({
  online: z.boolean().optional(),
  expiring7d: z.boolean().optional(),
  overQuota: z.boolean().optional(),
  inactive30d: z.boolean().optional(),
});

const filtersSchema = z.object({
  quickFilters: quickFiltersSchema,
  tagFilter: z.string().optional(),
  ownerFilter: z.string().optional(),
});

export type QuickFilters = z.infer<typeof quickFiltersSchema>;
export type Filters = z.infer<typeof filtersSchema>;

type PageKey = 'access-keys' | 'dynamic-keys';

const STORAGE_KEYS: Record<PageKey, string> = {
  'access-keys': `atomic:filters:access-keys:${STORAGE_VERSION}`,
  'dynamic-keys': `atomic:filters:dynamic-keys:${STORAGE_VERSION}`,
};

const DEFAULT_FILTERS: Filters = {
  quickFilters: {},
  tagFilter: undefined,
  ownerFilter: undefined,
};

function loadFilters(pageKey: PageKey): Filters {
  if (typeof window === 'undefined') {
    return DEFAULT_FILTERS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS[pageKey]);
    if (!stored) {
      return DEFAULT_FILTERS;
    }

    const parsed = JSON.parse(stored);
    const result = filtersSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    localStorage.removeItem(STORAGE_KEYS[pageKey]);
    return DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(pageKey: PageKey, filters: Filters): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEYS[pageKey], JSON.stringify(filters));
  } catch {
    // Storage full or unavailable
  }
}

export function usePersistedFilters(pageKey: PageKey) {
  const [filters, setFilters] = useState<Filters>(() => loadFilters(pageKey));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFilters(loadFilters(pageKey));
  }, [pageKey]);

  const persistFilters = useCallback(
    (newFilters: Filters) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        saveFilters(pageKey, newFilters);
      }, DEBOUNCE_MS);
    },
    [pageKey]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const setQuickFilter = useCallback(
    <K extends keyof QuickFilters>(key: K, value: QuickFilters[K]) => {
      setFilters((prev) => {
        const newFilters: Filters = {
          ...prev,
          quickFilters: {
            ...prev.quickFilters,
            [key]: value,
          },
        };
        persistFilters(newFilters);
        return newFilters;
      });
    },
    [persistFilters]
  );

  const setTagFilter = useCallback(
    (value: string | undefined) => {
      setFilters((prev) => {
        const newFilters: Filters = {
          ...prev,
          tagFilter: value,
        };
        persistFilters(newFilters);
        return newFilters;
      });
    },
    [persistFilters]
  );

  const setOwnerFilter = useCallback(
    (value: string | undefined) => {
      setFilters((prev) => {
        const newFilters: Filters = {
          ...prev,
          ownerFilter: value,
        };
        persistFilters(newFilters);
        return newFilters;
      });
    },
    [persistFilters]
  );

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    persistFilters(DEFAULT_FILTERS);
  }, [persistFilters]);

  return {
    filters,
    setQuickFilter,
    setTagFilter,
    setOwnerFilter,
    clearFilters,
  };
}
