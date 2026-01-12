import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and tailwind-merge.
 * This utility allows for conditional class names and proper handling of
 * Tailwind CSS class conflicts. When two Tailwind classes conflict (like
 * 'bg-red-500' and 'bg-blue-500'), tailwind-merge will keep only the last one.
 * 
 * Example usage:
 *   cn('px-4 py-2', isActive && 'bg-blue-500', 'text-white')
 *   cn('text-sm', className) // where className might override text-sm
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date to a human-readable string with time.
 * Uses the user's locale for proper formatting.
 * 
 * @param date - Date object or ISO string to format
 * @returns Formatted date string like "Jan 15, 2024, 2:30 PM"
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date to a short date string without time.
 * 
 * @param date - Date object or ISO string to format
 * @returns Formatted date string like "Jan 15, 2024"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a relative time string (e.g., "2 hours ago", "in 3 days").
 * This provides a more natural way to display timestamps for recent events.
 * 
 * @param date - Date object or ISO string to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Handle future dates (negative diff means date is in the future)
  if (diffMs < 0) {
    const absDiffDays = Math.abs(diffDays);
    const absDiffHours = Math.abs(diffHours);
    const absDiffMins = Math.abs(diffMins);

    if (absDiffDays > 0) {
      return absDiffDays === 1 ? 'in 1 day' : `in ${absDiffDays} days`;
    }
    if (absDiffHours > 0) {
      return absDiffHours === 1 ? 'in 1 hour' : `in ${absDiffHours} hours`;
    }
    if (absDiffMins > 0) {
      return absDiffMins === 1 ? 'in 1 minute' : `in ${absDiffMins} minutes`;
    }
    return 'just now';
  }

  // Handle past dates
  if (diffDays > 30) {
    return formatDate(d);
  }
  if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffMins > 0) {
    return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
  }
  return 'just now';
}

/**
 * Format bytes to a human-readable string with appropriate units.
 * Automatically selects the most appropriate unit (B, KB, MB, GB, TB).
 * 
 * @param bytes - Number of bytes to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "1.5 GB" or "256 MB"
 */
export function formatBytes(bytes: number | bigint, decimals = 2): string {
  const numBytes = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  
  if (numBytes === 0) return '0 B';
  if (numBytes < 0) return `-${formatBytes(-numBytes, decimals)}`;

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  const value = numBytes / Math.pow(k, i);

  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Parse a human-readable byte string to a number.
 * Accepts strings like "1.5 GB", "256MB", "1024".
 * 
 * @param str - String to parse
 * @returns Number of bytes, or 0 if parsing fails
 */
export function parseBytes(str: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
    pb: 1024 ** 5,
  };

  const match = str.toLowerCase().match(/^([\d.]+)\s*([a-z]+)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';

  return Math.floor(value * (units[unit] || 1));
}

/**
 * Calculate the percentage of usage and return a formatted string.
 * 
 * @param used - Amount used
 * @param total - Total amount available
 * @returns Percentage as a number (0-100)
 */
export function calculatePercentage(used: number | bigint, total: number | bigint): number {
  const numUsed = typeof used === 'bigint' ? Number(used) : used;
  const numTotal = typeof total === 'bigint' ? Number(total) : total;
  
  if (numTotal === 0) return 0;
  return Math.min(100, Math.round((numUsed / numTotal) * 100));
}

/**
 * Generate a random string for tokens, IDs, etc.
 * Uses cryptographically secure random values when available.
 * 
 * @param length - Length of the string to generate (default: 32)
 * @returns Random alphanumeric string
 */
export function generateRandomString(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  // Use crypto.getRandomValues if available (browser/Node 15+)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    // Fallback to Math.random (less secure, but works everywhere)
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  
  return result;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated.
 * 
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Sleep for a specified number of milliseconds.
 * Useful for adding delays in async functions.
 * 
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce a function to limit how often it can be called.
 * The function will only be called after the specified delay has passed
 * since the last invocation.
 * 
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Check if a string is a valid URL.
 * 
 * @param str - String to check
 * @returns True if the string is a valid URL
 */
export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get country flag emoji from country code.
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "US", "MM")
 * @returns Flag emoji or empty string if invalid
 */
export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}

/**
 * Common country codes with names for the server location selector.
 */
export const COUNTRY_OPTIONS = [
  { code: 'US', name: 'United States' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'DE', name: 'Germany' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FR', name: 'France' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
] as const;

/**
 * Status color mapping for consistent UI styling.
 */
export const STATUS_COLORS = {
  ACTIVE: 'text-green-500',
  DISABLED: 'text-gray-500',
  EXPIRED: 'text-red-500',
  DEPLETED: 'text-orange-500',
  PENDING: 'text-blue-500',
  UP: 'text-green-500',
  DOWN: 'text-red-500',
  SLOW: 'text-yellow-500',
  UNKNOWN: 'text-gray-500',
} as const;

/**
 * Status badge color mapping for background styling.
 */
export const STATUS_BADGE_COLORS = {
  ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
  DISABLED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  EXPIRED: 'bg-red-500/20 text-red-400 border-red-500/30',
  DEPLETED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  PENDING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  UP: 'bg-green-500/20 text-green-400 border-green-500/30',
  DOWN: 'bg-red-500/20 text-red-400 border-red-500/30',
  SLOW: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  UNKNOWN: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
} as const;
