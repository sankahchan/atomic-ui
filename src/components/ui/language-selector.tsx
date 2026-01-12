'use client';

/**
 * LanguageSelector Component
 *
 * A dropdown for selecting the application language.
 * Shows flag emoji and language name, persists selection to localStorage.
 */

import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { useLocale } from '@/hooks/use-locale';
import { locales, localeNames, localeFlags, type Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

interface LanguageSelectorProps {
  className?: string;
}

export function LanguageSelector({ className }: LanguageSelectorProps) {
  const { locale, setLocale, mounted } = useLocale();

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'rounded-full px-3',
          'bg-white/50 dark:bg-gray-800/50',
          'border border-gray-200 dark:border-gray-600',
          'opacity-50',
          className
        )}
      >
        <Globe className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">...</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'rounded-full px-3',
            'bg-white/50 dark:bg-gray-800/50',
            'hover:bg-white dark:hover:bg-gray-700',
            'border border-gray-200 dark:border-gray-600',
            'transition-all duration-200',
            className
          )}
        >
          <span className="mr-2 text-base">{localeFlags[locale]}</span>
          <span className="hidden sm:inline text-sm font-medium">
            {localeNames[locale]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => setLocale(loc)}
            className={cn(
              'cursor-pointer',
              locale === loc && 'bg-accent'
            )}
          >
            <span className="mr-3 text-base">{localeFlags[loc]}</span>
            <span>{localeNames[loc]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
