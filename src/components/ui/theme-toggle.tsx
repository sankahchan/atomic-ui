'use client';

/**
 * ThemeToggle Component
 *
 * A button that toggles between light and dark themes.
 * Uses next-themes for theme management and shows a lightbulb icon (x-ui style).
 */

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'rounded-full bg-white/50 dark:bg-gray-800/50',
          'border border-gray-200 dark:border-gray-600',
          'opacity-50',
          className
        )}
      >
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'rounded-full',
        'bg-white/50 dark:bg-gray-800/50',
        'hover:bg-white dark:hover:bg-gray-700',
        'border border-gray-200 dark:border-gray-600',
        'transition-all duration-200',
        className
      )}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Moon className="h-5 w-5 text-blue-400" />
      ) : (
        <Sun className="h-5 w-5 text-yellow-500" />
      )}
    </Button>
  );
}
