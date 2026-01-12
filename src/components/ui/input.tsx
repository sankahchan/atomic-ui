import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Input Props Interface
 * 
 * Extends the standard HTML input attributes with no additional props.
 * The interface is here for consistency and future extensibility.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input Component
 * 
 * A styled input field with consistent appearance across the application.
 * Features proper focus states with the atomic cyan ring color and
 * smooth transitions for a polished user experience.
 * 
 * The component uses forwardRef to allow parent components to access
 * the underlying input element directly when needed (e.g., for focus management).
 * 
 * @example
 * // Basic text input
 * <Input type="text" placeholder="Enter your name" />
 * 
 * @example
 * // With label
 * <Label htmlFor="email">Email</Label>
 * <Input id="email" type="email" placeholder="you@example.com" />
 * 
 * @example
 * // Controlled input
 * <Input value={value} onChange={(e) => setValue(e.target.value)} />
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles: full width, consistent height, padding, and border radius
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
          // Typography: consistent text size
          'text-sm',
          // Focus states: ring effect with primary color for accessibility
          'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // File input specific styles
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          // Placeholder styling
          'placeholder:text-muted-foreground',
          // Disabled state
          'disabled:cursor-not-allowed disabled:opacity-50',
          // Allow custom classes to override defaults
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
