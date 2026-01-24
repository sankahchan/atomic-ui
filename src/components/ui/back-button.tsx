'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  /** Custom href to navigate to (defaults to browser back) */
  href?: string;
  /** Label to show next to icon */
  label?: string;
  /** Additional class names */
  className?: string;
}

/**
 * BackButton Component
 *
 * A consistent back navigation button for mobile-friendly navigation.
 * Shows on all screen sizes but is especially useful for mobile users.
 */
export function BackButton({ href, label = 'Back', className }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn(
        'gap-1 text-muted-foreground hover:text-foreground -ml-2',
        className
      )}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="text-sm">{label}</span>
    </Button>
  );
}
