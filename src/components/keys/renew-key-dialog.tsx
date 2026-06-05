'use client';

import { useEffect, useMemo, useState } from 'react';

import { Calendar, Loader2, RefreshCw } from 'lucide-react';

import { useLocale } from '@/hooks/use-locale';
import { addCalendarMonths, getRenewalBaseDate } from '@/lib/access-key-renewal';
import { formatBytes, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionDescription,
  DialogSectionHeader,
  DialogSectionTitle,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RenewalPackagePicker } from '@/components/keys/renewal-package-picker';
import type { RenewalPackagePreset } from '@/lib/renewal-package-presets';

const MONTH_OPTIONS = [1, 2, 3] as const;
const GB = 1024 * 1024 * 1024;

export type RenewKeyDialogKeyData = {
  id: string;
  name: string;
  status: string;
  expiresAt: Date | string | null;
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
};

type RenewKeyDialogSubmit = {
  months: 1 | 2 | 3;
  addDataLimitGB: number | null;
};

export function RenewKeyDialog({
  open,
  onOpenChange,
  keyData,
  presets = [],
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyData: RenewKeyDialogKeyData | null;
  presets?: RenewalPackagePreset[];
  isPending: boolean;
  onConfirm: (input: RenewKeyDialogSubmit) => void;
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const [months, setMonths] = useState<1 | 2 | 3>(1);
  const [addDataLimitGB, setAddDataLimitGB] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMonths(1);
      setAddDataLimitGB('');
      setValidationMessage(null);
    }
  }, [open, keyData?.id]);

  const normalizedExpiry = useMemo(() => {
    if (!keyData?.expiresAt) {
      return null;
    }

    return keyData.expiresAt instanceof Date ? keyData.expiresAt : new Date(keyData.expiresAt);
  }, [keyData?.expiresAt]);

  const parsedAddGb = useMemo(() => {
    if (!addDataLimitGB.trim()) {
      return null;
    }

    const parsed = Number(addDataLimitGB);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return Number.NaN;
    }

    return parsed;
  }, [addDataLimitGB]);

  const previewExpiry = useMemo(() => {
    const base = getRenewalBaseDate(normalizedExpiry);
    return addCalendarMonths(base, months);
  }, [months, normalizedExpiry]);

  const previewDataLimitBytes = useMemo(() => {
    if (parsedAddGb == null || Number.isNaN(parsedAddGb)) {
      return keyData?.dataLimitBytes ?? null;
    }

    const addBytes = BigInt(Math.round(parsedAddGb * GB));
    return (keyData?.dataLimitBytes ?? BigInt(0)) + addBytes;
  }, [keyData?.dataLimitBytes, parsedAddGb]);

  const renewalBlocked = keyData?.status === 'DISABLED';
  const selectedPresetCode = presets.find((preset) => preset.months === months && preset.dataLimitGB === parsedAddGb)?.code ?? null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (renewalBlocked) {
      return;
    }

    if (parsedAddGb !== null && Number.isNaN(parsedAddGb)) {
      setValidationMessage(
        isMyanmar
          ? 'ထည့်မည့် data ပမာဏသည် 0 ထက်ကြီးသော GB တန်ဖိုး ဖြစ်ရပါမည်။'
          : 'Added data must be a positive GB value.',
      );
      return;
    }

    setValidationMessage(null);
    onConfirm({
      months,
      addDataLimitGB: parsedAddGb,
    });
  };

  const currentQuotaLabel = keyData?.dataLimitBytes != null
    ? formatBytes(keyData.dataLimitBytes)
    : (isMyanmar ? 'Unlimited' : 'Unlimited');
  const nextQuotaLabel = previewDataLimitBytes != null
    ? formatBytes(previewDataLimitBytes)
    : (isMyanmar ? 'Unlimited' : 'Unlimited');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isMyanmar ? 'သော့ သက်တမ်းတိုးမည်' : 'Renew key'}</DialogTitle>
          <DialogDescription>
            {isMyanmar
              ? 'Sales package preset ကို ရွေးနိုင်ပြီး လိုအပ်သလို လနှင့် data quota ကို ကိုယ်တိုင် ပြင်နိုင်သည်။'
              : 'Pick a sales package preset, then adjust the months or data top-up manually if needed.'}
          </DialogDescription>
        </DialogHeader>

        {keyData ? (
          <form onSubmit={handleSubmit}>
            <DialogBody>
              {presets.length > 0 ? (
                <DialogSection>
                  <DialogSectionHeader>
                    <DialogSectionTitle>{isMyanmar ? 'Package presets' : 'Package presets'}</DialogSectionTitle>
                    <DialogSectionDescription>
                      {isMyanmar
                        ? 'Telegram sales settings မှ access-key plan များကို အသုံးပြုပြီး renewal လနှင့် GB ကို တစ်ချက်နှိပ်ဖြင့် ဖြည့်မည်။'
                        : 'Reuse access-key plans from Telegram sales settings to fill the renewal months and GB in one tap.'}
                    </DialogSectionDescription>
                  </DialogSectionHeader>
                  <RenewalPackagePicker
                    presets={presets}
                    selectedCode={selectedPresetCode}
                    isMyanmar={isMyanmar}
                    onSelect={(preset) => {
                      setMonths(preset.months);
                      setAddDataLimitGB(String(preset.dataLimitGB));
                      setValidationMessage(null);
                    }}
                  />
                </DialogSection>
              ) : null}

              <DialogSection>
                <DialogSectionHeader>
                  <DialogSectionTitle>{keyData.name}</DialogSectionTitle>
                  <DialogSectionDescription>
                    {renewalBlocked
                      ? (isMyanmar
                        ? 'Disabled ဖြစ်နေသော သော့ကို တိုက်ရိုက် renew မလုပ်နိုင်ပါ။ အရင် enable ပြန်လုပ်ပါ။'
                        : 'Disabled keys cannot be renewed directly. Enable the key first.')
                      : (isMyanmar
                        ? 'Renew လုပ်သောအခါ သက်တမ်းသည် လက်ရှိ expiry သို့မဟုတ် ယခုအချိန်ထဲမှ နောက်ဆုံးအချိန်မှ စတင်၍ တိုးမည်။'
                        : 'Renewal extends from the later of the current expiry or now.')}
                  </DialogSectionDescription>
                </DialogSectionHeader>
              </DialogSection>

              <DialogSection>
                <DialogSectionHeader>
                  <DialogSectionTitle>{isMyanmar ? 'Manual adjustment' : 'Manual adjustment'}</DialogSectionTitle>
                  <DialogSectionDescription>
                    {isMyanmar
                      ? 'Preset ကို ရွေးပြီးနောက် လပိုင်း သို့မဟုတ် top-up data ကို ကိုယ်တိုင် ပြင်နိုင်သည်။'
                      : 'After choosing a preset, you can still fine-tune the months or quota top-up.'}
                  </DialogSectionDescription>
                </DialogSectionHeader>
                <Label className="mb-3 block">{isMyanmar ? 'သက်တမ်းတိုးမည့် လရွေးချယ်ပါ' : 'Choose renewal length'}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {MONTH_OPTIONS.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={months === option ? 'default' : 'outline'}
                      className="justify-center"
                      onClick={() => setMonths(option)}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {option} {isMyanmar ? 'လ' : option === 1 ? 'month' : 'months'}
                    </Button>
                  ))}
                </div>
              </DialogSection>

              <DialogSection>
                <Label htmlFor="renew-add-gb">{isMyanmar ? 'ထပ်ထည့်မည့် data (GB)' : 'Add data (GB)'}</Label>
                <Input
                  id="renew-add-gb"
                  type="number"
                  min="0"
                  step="0.1"
                  value={addDataLimitGB}
                  onChange={(event) => setAddDataLimitGB(event.target.value)}
                  placeholder={isMyanmar ? 'ဥပမာ 10' : 'For example, 10'}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {isMyanmar
                    ? 'ဒီ field သည် လက်ရှိ quota ကို အစားထိုးမည် မဟုတ်ပါ။ ရှိပြီးသား quota ပေါ်သို့ ထပ်ထည့်မည်။'
                    : 'This tops up the existing quota. It does not replace the current total.'}
                </p>
              </DialogSection>

              <DialogSection>
                <DialogSectionHeader>
                  <DialogSectionTitle>{isMyanmar ? 'Preview' : 'Preview'}</DialogSectionTitle>
                </DialogSectionHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'Expiry' : 'Expiry'}
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{isMyanmar ? 'လက်ရှိ' : 'Current'}</span>
                        <span className="text-right font-medium">
                          {normalizedExpiry
                            ? formatDateTime(normalizedExpiry)
                            : (isMyanmar ? 'မသတ်မှတ်ထား' : 'Not set')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{isMyanmar ? 'Renew ပြီးနောက်' : 'After renewal'}</span>
                        <span className="text-right font-medium">{formatDateTime(previewExpiry)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'Quota' : 'Quota'}
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{isMyanmar ? 'လက်ရှိ' : 'Current'}</span>
                        <span className="text-right font-medium">{currentQuotaLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{isMyanmar ? 'Renew ပြီးနောက်' : 'After renewal'}</span>
                        <span className="text-right font-medium">{nextQuotaLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </DialogSection>

              {validationMessage ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {validationMessage}
                </div>
              ) : null}

              {renewalBlocked ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  {isMyanmar
                    ? 'Disabled သော့များသည် Outline တွင် ပြန်မဖန်တီးမချင်း quota renewal မလုပ်နိုင်ပါ။'
                    : 'Disabled keys cannot renew quota until they are enabled and recreated on Outline.'}
                </div>
              ) : null}
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={isPending || renewalBlocked}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {isMyanmar ? 'Renew လုပ်မည်' : 'Renew key'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
