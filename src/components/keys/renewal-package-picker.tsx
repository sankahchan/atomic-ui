'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RenewalPackagePreset } from '@/lib/renewal-package-presets';

function formatMonthsLabel(months: number, isMyanmar: boolean) {
  if (isMyanmar) {
    return `${months} လ`;
  }

  return months === 1 ? '1 month' : `${months} months`;
}

export function RenewalPackagePicker({
  presets,
  selectedCode,
  onSelect,
  isMyanmar,
}: {
  presets: RenewalPackagePreset[];
  selectedCode: string | null;
  onSelect: (preset: RenewalPackagePreset) => void;
  isMyanmar: boolean;
}) {
  if (presets.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {presets.map((preset) => {
        const isSelected = preset.code === selectedCode;

        return (
          <Button
            key={preset.code}
            type="button"
            variant="outline"
            className={cn(
              'h-auto flex-col items-start justify-start whitespace-normal rounded-2xl px-4 py-3 text-left',
              isSelected && 'border-primary bg-primary/10',
            )}
            onClick={() => onSelect(preset)}
          >
            <span className="text-sm font-semibold">{preset.label}</span>
            <span className="mt-1 text-xs text-muted-foreground">
              {formatMonthsLabel(preset.months, isMyanmar)} + {preset.dataLimitGB} GB
            </span>
            {preset.priceLabel || preset.badge ? (
              <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {preset.priceLabel ? <span>{preset.priceLabel}</span> : null}
                {preset.badge ? <span>{preset.badge}</span> : null}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
