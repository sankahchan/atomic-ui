'use client';

/**
 * Tabs Component
 * 
 * This component provides a fully accessible tabbed interface built on top of
 * Radix UI's Tabs primitive. Tabs are used to organize content into multiple
 * panels where only one panel is visible at a time. This is particularly useful
 * for settings pages, detail views, and any interface where you want to show
 * related but distinct content sections without navigating to a new page.
 * 
 * The component follows the WAI-ARIA Tabs Pattern for accessibility, which means
 * users can navigate between tabs using arrow keys and activate them with Enter
 * or Space. The currently selected tab is automatically focused and announced
 * to screen readers.
 * 
 * Composed Components:
 * - Tabs: The root container that manages tab state
 * - TabsList: The container for tab triggers (the clickable tab headers)
 * - TabsTrigger: An individual tab button
 * - TabsContent: The panel that shows when its corresponding tab is active
 */

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/**
 * Tabs Root Component
 * 
 * This is the main wrapper component that manages the tab state. It provides
 * the context for all child components and handles keyboard navigation. You can
 * control the selected tab either through the defaultValue prop for uncontrolled
 * usage or through the value and onValueChange props for controlled usage.
 * 
 * Example:
 * <Tabs defaultValue="overview">
 *   <TabsList>
 *     <TabsTrigger value="overview">Overview</TabsTrigger>
 *     <TabsTrigger value="settings">Settings</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="overview">Overview content...</TabsContent>
 *   <TabsContent value="settings">Settings content...</TabsContent>
 * </Tabs>
 */
const Tabs = TabsPrimitive.Root;

/**
 * TabsList Component
 * 
 * This component serves as the container for all TabsTrigger elements. It renders
 * as a horizontal bar with a subtle background to visually group the tabs together.
 * The list uses inline-flex to ensure tabs sit side by side and don't stretch to
 * fill the container width.
 * 
 * The styling includes rounded corners and a muted background that works well in
 * both light and dark themes. The height and padding are carefully chosen to create
 * comfortable touch targets on mobile while looking proportional on desktop.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Layout: horizontal arrangement with consistent spacing
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1',
      // Text styling for the tab triggers
      'text-muted-foreground',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/**
 * TabsTrigger Component
 * 
 * This is an individual tab button that users click to switch between panels.
 * Each trigger must have a unique value prop that matches a TabsContent value
 * to establish the relationship between trigger and content.
 * 
 * The styling changes based on the tab's state. When inactive, triggers show
 * muted styling. When active, they appear elevated with a white/dark background
 * and a subtle shadow. The transition between states is smooth to provide
 * visual feedback without being jarring.
 * 
 * Focus styling uses a ring pattern consistent with other interactive elements
 * in the design system. This ensures keyboard users can always see which tab
 * is currently focused.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base layout and sizing
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5',
      // Typography
      'text-sm font-medium',
      // Focus ring for keyboard navigation
      'ring-offset-background',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      // Disabled state
      'disabled:pointer-events-none disabled:opacity-50',
      // Active state - elevated appearance with shadow
      'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      // Smooth transition between states
      'transition-all',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/**
 * TabsContent Component
 * 
 * This is the panel that displays content for a specific tab. Each content
 * panel must have a value prop that matches a TabsTrigger's value. When that
 * trigger is activated, this content becomes visible while other panels hide.
 * 
 * The component includes focus styling for accessibility. When a user navigates
 * to a tab using the keyboard, focus moves to the content panel, allowing them
 * to immediately start interacting with its contents.
 * 
 * The margin-top provides visual separation from the TabsList, creating a clear
 * hierarchy between the tab navigation and the content area.
 */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // Spacing from the tabs list
      'mt-2',
      // Focus ring for accessibility
      'ring-offset-background',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
