import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card Component
 * 
 * A container component that provides a visually distinct surface for grouping
 * related content. Cards use subtle borders and rounded corners to create
 * hierarchy in the interface.
 * 
 * The Card component system consists of multiple sub-components that can be
 * composed together to create consistent card layouts:
 * - Card: The outer container
 * - CardHeader: Top section typically containing title and description
 * - CardTitle: The card's main heading
 * - CardDescription: Secondary text below the title
 * - CardContent: The main body content area
 * - CardFooter: Bottom section for actions or additional info
 */

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative overflow-hidden rounded-[1.75rem] border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,249,252,0.84))] text-card-foreground shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur-[var(--glass-blur-lg)] [-webkit-backdrop-filter:blur(var(--glass-blur-lg))] transition-all duration-200 dark:border-[rgba(34,211,238,0.18)] dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.11),transparent_24%),linear-gradient(180deg,rgba(4,10,23,0.94),rgba(6,14,28,0.82))] dark:shadow-[0_24px_70px_rgba(1,6,20,0.5),0_0_0_1px_rgba(34,211,238,0.04),inset_0_1px_0_rgba(125,211,252,0.06)]',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

/**
 * CardHeader Component
 * 
 * The top section of a card, typically containing the title and description.
 * Uses flexbox with column direction to stack title and description vertically.
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

/**
 * CardTitle Component
 * 
 * The main heading within a card. Renders as an h3 by default with
 * semibold weight and tracking adjustments for better readability.
 */
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

/**
 * CardDescription Component
 * 
 * Secondary text that provides additional context below the card title.
 * Uses muted foreground color to establish visual hierarchy.
 */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

/**
 * CardContent Component
 * 
 * The main body area of the card where primary content is placed.
 * Has horizontal padding and bottom padding; top padding is removed
 * to allow seamless connection with CardHeader when used together.
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

/**
 * CardFooter Component
 * 
 * The bottom section of a card, typically used for action buttons
 * or supplementary information. Uses flexbox for easy button alignment.
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
