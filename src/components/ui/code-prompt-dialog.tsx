'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export function CodePromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Verification code',
  placeholder = '000000',
  confirmLabel = 'Continue',
  loading = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  loading?: boolean;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!open) {
      setCode('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="ops-code-prompt">{label}</Label>
          <Input
            id="ops-code-prompt"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder={placeholder}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            className="text-center text-xl tracking-[0.4em] font-mono"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(code)} disabled={loading || code.length !== 6}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
