'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ScrollToTop Component
 *
 * A floating button that appears when the user scrolls down,
 * allowing them to quickly scroll back to the top of the page.
 * Optimized for mobile UX.
 */
export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      // Show button when page is scrolled down 300px
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility, { passive: true });
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={scrollToTop}
      className={cn(
        'fixed bottom-[calc(var(--bottom-bar-height)+var(--safe-area-bottom)+1rem)] right-4 z-50 h-10 w-10 rounded-full shadow-lg',
        'bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] border border-[var(--glass-border)] text-primary hover:bg-[var(--glass-bg-medium)]',
        'transition-all duration-300 ease-in-out',
        'md:bottom-6 md:right-6 md:h-10 md:w-10',
        isVisible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
      )}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5 md:h-4 md:w-4" />
    </Button>
  );
}
