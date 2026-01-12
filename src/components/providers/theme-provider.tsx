'use client';

/**
 * Theme Provider Component
 * 
 * This component manages the application's theme (light/dark mode) using
 * next-themes. It persists the user's preference and handles system theme
 * detection automatically.
 */

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes/dist/types';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
