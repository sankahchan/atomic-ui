import { type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type DetailHeroProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

type DetailKpiTileProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  valueClassName?: string;
};

type DetailMiniTileProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  valueClassName?: string;
  metaClassName?: string;
};

type DetailHeroAsideProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
};

export function DetailHero({ className, children, ...props }: DetailHeroProps) {
  return (
    <section className={cn('ops-hero', className)} {...props}>
      {children}
    </section>
  );
}

export function DetailHeroGrid({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px] xl:items-start', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DetailHeroMain({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-6', className)} {...props}>
      {children}
    </div>
  );
}

export function DetailMetricGrid({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)} {...props}>
      {children}
    </div>
  );
}

export function DetailKpiTile({
  label,
  value,
  meta,
  className,
  valueClassName,
  ...props
}: DetailKpiTileProps) {
  return (
    <div className={cn('ops-kpi-tile', className)} {...props}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className={cn('mt-3 text-2xl font-semibold', valueClassName)}>{value}</div>
      {meta ? <p className="mt-2 text-sm text-muted-foreground">{meta}</p> : null}
    </div>
  );
}

export function DetailHeroAside({
  title,
  description,
  className,
  children,
  ...props
}: DetailHeroAsideProps) {
  return (
    <aside className={cn('ops-hero-aside space-y-4', className)} {...props}>
      <div className="space-y-1">
        <p className="ops-section-heading">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </aside>
  );
}

export function DetailMiniTileGrid({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-1', className)} {...props}>
      {children}
    </div>
  );
}

export function DetailMiniTile({
  label,
  value,
  meta,
  className,
  valueClassName,
  metaClassName,
  ...props
}: DetailMiniTileProps) {
  return (
    <div className={cn('ops-mini-tile', className)} {...props}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className={cn('mt-2 text-sm font-medium', valueClassName)}>{value}</div>
      {meta ? <p className={cn('mt-1 text-xs text-muted-foreground', metaClassName)}>{meta}</p> : null}
    </div>
  );
}

export function DetailNoteBlock({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[1.15rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
