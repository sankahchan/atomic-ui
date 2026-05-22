'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SurfaceSkeleton } from '@/components/ui/surface-skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { formatBytes } from '@/lib/utils';
import { Edit2, FileText, Key, Loader2, Plus, Search, Server, Trash2 } from 'lucide-react';
import { themeList } from '@/lib/subscription-themes';

function getThemeDisplayName(themeId: string, isMyanmar: boolean) {
  const theme = themeList.find((entry) => entry.id === themeId);
  if (!theme) {
    return themeId;
  }

  if (!isMyanmar) {
    return theme.name;
  }

  const labels: Record<string, string> = {
    dark: 'အမှောင်',
    light: 'အလင်း',
    purple: 'ခရမ်း',
    blue: 'ပင်လယ်ပြာ',
    green: 'အစိမ်း',
    sunset: 'နေဝင်ချိန်',
    rose: 'နှင်းဆီ',
    midnight: 'သန်းခေါင်',
    arctic: 'အာတိတ်',
    coral: 'ပန်းနုနီ',
  };

  return labels[theme.id] ?? theme.name;
}

function TemplateDialog({
  open,
  onOpenChange,
  template,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const isEditing = !!template;

  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    namePrefix: template?.namePrefix || '',
    slugPrefix: template?.slugPrefix || '',
    dataLimitGB: template?.dataLimitGB?.toString() || '',
    dataLimitResetStrategy: template?.dataLimitResetStrategy || 'NEVER',
    expirationType: template?.expirationType || 'NEVER',
    durationDays: template?.durationDays?.toString() || '',
    method: template?.method || 'chacha20-ietf-poly1305',
    notes: template?.notes || '',
    serverId: template?.serverId || 'unassigned',
    subscriptionTheme: template?.subscriptionTheme || 'dark',
    subscriptionWelcomeMessage: template?.subscriptionWelcomeMessage || '',
    sharePageEnabled: template?.sharePageEnabled ?? true,
    clientLinkEnabled: template?.clientLinkEnabled ?? true,
    telegramDeliveryEnabled: template?.telegramDeliveryEnabled ?? true,
    autoDisableOnLimit: template?.autoDisableOnLimit ?? true,
    autoDisableOnExpire: template?.autoDisableOnExpire ?? true,
    autoArchiveAfterDays: String(template?.autoArchiveAfterDays ?? 0),
    quotaAlertThresholds: template?.quotaAlertThresholds || '80,90',
    autoRenewPolicy: template?.autoRenewPolicy || 'NONE',
    autoRenewDurationDays: template?.autoRenewDurationDays?.toString() || '',
  });

  const { data: servers } = trpc.servers.list.useQuery();

  const createMutation = trpc.templates.create.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'တမ်းပလိတ် ဖန်တီးပြီးပါပြီ' : 'Template created',
        description: isMyanmar ? 'တမ်းပလိတ်ကို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ။' : 'Template has been created successfully.',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) =>
      toast({
        title: isMyanmar ? 'တမ်းပလိတ် မဖန်တီးနိုင်ပါ' : 'Failed to create',
        description: err.message,
        variant: 'destructive',
      }),
  });

  const updateMutation = trpc.templates.update.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'တမ်းပလိတ်ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Template updated',
        description: isMyanmar ? 'တမ်းပလိတ်ကို အောင်မြင်စွာ အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Template has been updated successfully.',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) =>
      toast({
        title: isMyanmar ? 'တမ်းပလိတ်ကို မအပ်ဒိတ်လုပ်နိုင်ပါ' : 'Failed to update',
        description: err.message,
        variant: 'destructive',
      }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: formData.name,
      description: formData.description || undefined,
      namePrefix: formData.namePrefix || undefined,
      slugPrefix: formData.slugPrefix || undefined,
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      dataLimitResetStrategy: formData.dataLimitResetStrategy,
      expirationType: formData.expirationType,
      durationDays: formData.durationDays ? parseInt(formData.durationDays, 10) : undefined,
      method: formData.method,
      notes: formData.notes || undefined,
      serverId: formData.serverId === 'unassigned' ? null : formData.serverId,
      subscriptionTheme: formData.subscriptionTheme || undefined,
      subscriptionWelcomeMessage: formData.subscriptionWelcomeMessage || undefined,
      sharePageEnabled: formData.sharePageEnabled,
      clientLinkEnabled: formData.clientLinkEnabled,
      telegramDeliveryEnabled: formData.telegramDeliveryEnabled,
      autoDisableOnLimit: formData.autoDisableOnLimit,
      autoDisableOnExpire: formData.autoDisableOnExpire,
      autoArchiveAfterDays: Number.parseInt(formData.autoArchiveAfterDays || '0', 10) || 0,
      quotaAlertThresholds: formData.quotaAlertThresholds,
      autoRenewPolicy: formData.autoRenewPolicy,
      autoRenewDurationDays:
        formData.autoRenewPolicy === 'EXTEND_DURATION' && formData.autoRenewDurationDays
          ? Number.parseInt(formData.autoRenewDurationDays, 10)
          : undefined,
    };

    if (isEditing) {
      updateMutation.mutate({ id: template.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? (isMyanmar ? 'တမ်းပလိတ်ကို ပြင်ဆင်မည်' : 'Edit Template') : (isMyanmar ? 'တမ်းပလိတ် ဖန်တီးမည်' : 'Create Template')}</DialogTitle>
          <DialogDescription>
            {isMyanmar
              ? 'အသုံးပြုခွင့်သော့များကို မြန်မြန်ဆန်ဆန် ဖန်တီးနိုင်ရန် ပြန်လည်အသုံးပြုနိုင်သော သတ်မှတ်ချက်များကို သတ်မှတ်ပါ။'
              : 'Define reusable settings for quickly creating access keys.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{isMyanmar ? 'တမ်းပလိတ် အမည် *' : 'Template Name *'}</Label>
            <Input
              id="name"
              placeholder={isMyanmar ? 'ဥပမာ - ပုံမှန် ရက် 30 Plan' : 'e.g. Standard 30 Day Plan'}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{isMyanmar ? 'ဖော်ပြချက်' : 'Description'}</Label>
            <Input
              id="description"
              placeholder={isMyanmar ? 'အတွင်းပိုင်း ဖော်ပြချက်' : 'Internal description'}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="namePrefix">{isMyanmar ? 'သော့အမည် ရှေ့ဆက်' : 'Key Name Prefix'}</Label>
              <Input
                id="namePrefix"
                placeholder={isMyanmar ? 'ဥပမာ - user_' : 'e.g. user_'}
                value={formData.namePrefix}
                onChange={(e) => setFormData({ ...formData, namePrefix: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slugPrefix">{isMyanmar ? 'အတိုအမည် ရှေ့ဆက်' : 'Short Slug Prefix'}</Label>
              <Input
                id="slugPrefix"
                placeholder="premium"
                value={formData.slugPrefix}
                onChange={(e) => setFormData({ ...formData, slugPrefix: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isMyanmar ? 'မူလဆာဗာ' : 'Default Server'}</Label>
              <Select value={formData.serverId} onValueChange={(val) => setFormData({ ...formData, serverId: val })}>
                <SelectTrigger>
                  <SelectValue placeholder={isMyanmar ? 'မူလ မသတ်မှတ်ရသေး' : 'No default'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">{isMyanmar ? 'မူလဆာဗာ မရှိပါ' : 'No default server'}</SelectItem>
                  {servers?.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataLimit">{isMyanmar ? 'ဒေတာကန့်သတ်ချက် (GB)' : 'Data Limit (GB)'}</Label>
            <Input
              id="dataLimit"
              type="number"
              step="0.1"
              placeholder={isMyanmar ? 'အကန့်အသတ်မရှိရန် အလွတ်ထားပါ' : 'Leave empty for unlimited'}
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>{isMyanmar ? 'သက်တမ်းအမျိုးအစား' : 'Expiration Type'}</Label>
            <Select
              value={formData.expirationType}
              onValueChange={(val) => setFormData({ ...formData, expirationType: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEVER">{isMyanmar ? 'သက်တမ်းမရှိ' : 'Never Expires'}</SelectItem>
                <SelectItem value="DURATION_FROM_CREATION">{isMyanmar ? 'ကာလသတ်မှတ်ချက် (ဖန်တီးသည့်နေ့မှ)' : 'Duration (from creation)'}</SelectItem>
                <SelectItem value="START_ON_FIRST_USE">{isMyanmar ? 'ကာလသတ်မှတ်ချက် (ပထမအသုံးပြုချိန်မှ)' : 'Duration (from first use)'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.expirationType !== 'NEVER' ? (
            <div className="space-y-2">
              <Label htmlFor="duration">{isMyanmar ? 'ကြာချိန် (ရက်)' : 'Duration (Days)'}</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                placeholder="30"
                value={formData.durationDays}
                onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="notes">{isMyanmar ? 'မူလ မှတ်စုများ' : 'Default Notes'}</Label>
            <Input
              id="notes"
              placeholder={isMyanmar ? 'ဤတမ်းပလိတ်ဖြင့် ဖန်တီးသော သော့များတွင် ထည့်သွင်းမည်' : 'Added to keys created with this template'}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="space-y-4 rounded-xl border border-border/60 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{isMyanmar ? 'မျှဝေမှု မူလသတ်မှတ်ချက်များ' : 'Share defaults'}</p>
              <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဤတမ်းပလိတ်ဖြင့် ဖန်တီးသော သော့များအတွက် စာမျက်နှာပုံစံနှင့် ပို့ဆောင်မှု မူလသတ်မှတ်ချက်များ။' : 'Theme and delivery defaults for keys created from this template.'}</p>
            </div>

            <div className="space-y-2">
              <Label>{isMyanmar ? 'စာမျက်နှာ ပုံစံ' : 'Page Theme'}</Label>
              <Select
                value={formData.subscriptionTheme}
                onValueChange={(value) => setFormData({ ...formData, subscriptionTheme: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themeList.map((theme) => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateWelcome">{isMyanmar ? 'ကြိုဆိုစာ' : 'Welcome Message'}</Label>
              <Textarea
                id="templateWelcome"
                className="min-h-[96px]"
                placeholder={isMyanmar ? 'သော့တစ်ခုချင်းအတွက် စိတ်ကြိုက် ကြိုဆိုစာ' : 'Optional per-key welcome message'}
                value={formData.subscriptionWelcomeMessage}
                onChange={(e) => setFormData({ ...formData, subscriptionWelcomeMessage: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Switch
                  checked={formData.sharePageEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, sharePageEnabled: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{isMyanmar ? 'မျှဝေစာမျက်နှာ' : 'Share Page'}</span>
                  <span className="block text-xs text-muted-foreground">{isMyanmar ? 'အများမြင် စာမျက်နှာ ဖော်ပြမှု။' : 'Public page visibility.'}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Switch
                  checked={formData.clientLinkEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, clientLinkEnabled: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{isMyanmar ? 'ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်' : 'Client URL'}</span>
                  <span className="block text-xs text-muted-foreground">{isMyanmar ? 'ကလိုင်းယင့် app များသို့ တိုက်ရိုက်ထည့်သွင်းနိုင်ရန် ဖွင့်ပေးမည်။' : 'Allow client imports.'}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Switch
                  checked={formData.telegramDeliveryEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, telegramDeliveryEnabled: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{isMyanmar ? 'တယ်လီဂရမ် ပို့ဆောင်မှု' : 'Telegram'}</span>
                  <span className="block text-xs text-muted-foreground">{isMyanmar ? 'တယ်လီဂရမ်မှတစ်ဆင့် သော့ပို့ခြင်းကို ဖွင့်မည်။' : 'Enable Telegram delivery.'}</span>
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border/60 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{isMyanmar ? 'အလိုအလျောက် လုပ်ဆောင်မှု မူလသတ်မှတ်ချက်များ' : 'Automation defaults'}</p>
              <p className="text-xs text-muted-foreground">{isMyanmar ? 'သက်တမ်း၊ ဒေတာသတိပေးချက်၊ သိမ်းဆည်းမှုနှင့် သက်တမ်းတိုး လုပ်ဆောင်မှုများကို ထိန်းချုပ်ပါ။' : 'Control expiry, quota alerts, archiving, and renewal behavior.'}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateThresholds">{isMyanmar ? 'ဒေတာသတိပေး အဆင့်များ (%)' : 'Quota Alert Thresholds (%)'}</Label>
              <Input
                id="templateThresholds"
                placeholder="80,90"
                value={formData.quotaAlertThresholds}
                onChange={(e) => setFormData({ ...formData, quotaAlertThresholds: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Switch
                  checked={formData.autoDisableOnLimit}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoDisableOnLimit: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{isMyanmar ? 'ကန့်သတ်ချက်ပြည့်လျှင် အလိုအလျောက် ပိတ်မည်' : 'Auto-disable on limit'}</span>
                  <span className="block text-xs text-muted-foreground">{isMyanmar ? 'ဒေတာကန့်သတ်ချက် ပြည့်သွားသောအခါ သော့များကို ပိတ်မည်။' : 'Disable keys when quota is exhausted.'}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Switch
                  checked={formData.autoDisableOnExpire}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoDisableOnExpire: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{isMyanmar ? 'သက်တမ်းကုန်လျှင် အလိုအလျောက် ပိတ်မည်' : 'Auto-disable on expire'}</span>
                  <span className="block text-xs text-muted-foreground">{isMyanmar ? 'သက်တမ်းကုန်သောအခါ သော့များကို ပိတ်မည်။' : 'Disable keys when they expire.'}</span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateArchiveDays">{isMyanmar ? 'အလိုအလျောက် သိမ်းဆည်းမည့်ကာလ (ရက်)' : 'Auto-archive after (days)'}</Label>
              <Input
                id="templateArchiveDays"
                type="number"
                min="0"
                value={formData.autoArchiveAfterDays}
                onChange={(e) => setFormData({ ...formData, autoArchiveAfterDays: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'အလိုအလျောက် သက်တမ်းတိုး မူဝါဒ' : 'Auto-renew policy'}</Label>
                <Select
                  value={formData.autoRenewPolicy}
                  onValueChange={(value) => setFormData({ ...formData, autoRenewPolicy: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{isMyanmar ? 'အလိုအလျောက် မသက်တမ်းမတိုးပါ' : 'Do not auto-renew'}</SelectItem>
                    <SelectItem value="EXTEND_DURATION">{isMyanmar ? 'သတ်မှတ်ထားသော ကာလအတိုင်း သက်တမ်းတိုးမည်' : 'Extend by fixed duration'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.autoRenewPolicy === 'EXTEND_DURATION' ? (
                <div className="space-y-2">
                  <Label htmlFor="templateAutoRenewDays">{isMyanmar ? 'အလိုအလျောက် သက်တမ်းတိုး ကြာချိန် (ရက်)' : 'Auto-renew duration (days)'}</Label>
                  <Input
                    id="templateAutoRenewDays"
                    type="number"
                    min="1"
                    value={formData.autoRenewDurationDays}
                    onChange={(e) => setFormData({ ...formData, autoRenewDurationDays: e.target.value })}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isEditing ? (isMyanmar ? 'ပြောင်းလဲမှုများကို သိမ်းမည်' : 'Save Changes') : (isMyanmar ? 'တမ်းပလိတ် ဖန်တီးမည်' : 'Create Template')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplatesPage() {
  const { locale, t } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const { data: templates, isLoading, refetch } = trpc.templates.list.useQuery();
  const templateList = useMemo(() => templates ?? [], [templates]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templateList;
    return templateList.filter((template) =>
      [template.name, template.description, template.server?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [search, templateList]);

  const templatesWithLimits = templateList.filter((template) => template.dataLimitBytes).length;
  const templatesWithExpiration = templateList.filter((template) => template.expirationType !== 'NEVER').length;
  const defaultServers = new Set(templateList.map((template) => template.server?.id).filter(Boolean)).size;

  const deleteMutation = trpc.templates.delete.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'တမ်းပလိတ်ကို ဖျက်ပြီးပါပြီ' : 'Template deleted',
        description: isMyanmar ? 'တမ်းပလိတ်ကို ဖယ်ရှားပြီးပါပြီ။' : 'The template has been removed.',
      });
      setDeletingTemplateId(null);
      refetch();
    },
    onError: (err) => {
      toast({
        title: isMyanmar ? 'တမ်းပလိတ်ကို မဖျက်နိုင်ပါ' : 'Failed to delete',
        description: err.message,
        variant: 'destructive',
      });
      setDeletingTemplateId(null);
    },
  });

  const handleDelete = (id: string) => {
    const template = templateList.find((item) => item.id === id);
    setTemplateToDelete({ id, name: template?.name || (isMyanmar ? 'ဤတမ်းပလိတ်' : 'this template') });
  };

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="ops-showcase-grid">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <FileText className="mr-2 h-3.5 w-3.5" />
              {isMyanmar ? 'တမ်းပလိတ် စုစည်းမှု' : 'Template Library'}
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {isMyanmar ? 'သော့ တမ်းပလိတ်များ' : 'Key templates'}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {isMyanmar
                  ? 'ပုံမှန် quota၊ သက်တမ်းကာလနှင့် ဆာဗာမူလသတ်မှတ်ချက်များအတွက် ပြန်သုံးနိုင်သော သော့တမ်းပလိတ်များကို တည်ဆောက်ပြီး create flow ကို မြန်ပြီး တစ်ညီတစ်ညာတည်း ဖြစ်စေပါ။'
                  : 'Build reusable key presets for common quotas, expiry windows, and server defaults so your create flow stays fast and consistent.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'တမ်းပလိတ်များ' : 'Templates'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{templateList.length}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'သိမ်းထားသော ဖန်တီးမှု တမ်းပလိတ်များ။' : 'Saved creation presets.'}</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဒေတာကန့်သတ်' : 'Data-capped'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{templatesWithLimits}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'ဒေတာကန့်သတ်ချက် ပါဝင်ပြီးသား တမ်းပလိတ်များ။' : 'Templates with built-in quotas.'}</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သက်တမ်းပါဝင်' : 'Expiring'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{templatesWithExpiration}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'သက်တမ်းစည်းမျဉ်း ပါဝင်သော တမ်းပလိတ်များ။' : 'Templates that include expiry rules.'}</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'မူလဆာဗာများ' : 'Default servers'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{defaultServers}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'တမ်းပလိတ်မှ သတ်မှတ်ပေးထားသော မူလဆာဗာများ။' : 'Server defaults applied by template.'}</p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'တမ်းပလိတ် ထိန်းချုပ်မှုများ' : 'Template controls'}</p>
                <h2 className="text-xl font-semibold">{t('dashboard.command_rail')}</h2>
                <p className="text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'တမ်းပလိတ် အသစ်တစ်ခု ဖန်တီးပြီးနောက် သော့ဖန်တီးမှုသို့ တိုက်ရိုက်သွားပါ သို့မဟုတ် ဤမူလသတ်မှတ်ချက်များအပေါ် မှီခိုနေသော စာရင်းကို စစ်ဆေးပါ။'
                    : 'Create a new preset, then jump directly into key creation or review the inventory that depends on these defaults.'}
                </p>
              </div>

              <Button className="h-11 w-full rounded-full" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {isMyanmar ? 'တမ်းပလိတ် ဖန်တီးမည်' : 'Create template'}
              </Button>

              <div className="space-y-2">
                <Link href="/dashboard/keys" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Key className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'အသုံးပြုခွင့်သော့များကို ဖွင့်မည်' : 'Open access keys'}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                </Link>
                <Link href="/dashboard/servers" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Server className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'မူလဆာဗာ သတ်မှတ်ချက်များကို စစ်ဆေးမည်' : 'Review server defaults'}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                </Link>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'တမ်းပလိတ် မှတ်ချက်' : 'Template note'}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'အဆင်သင့် သတ်မှတ်ချက် လွှမ်းခြုံမှု' : 'Preset coverage'}</h2>
              </div>
              <div className="ops-detail-card space-y-2">
                <p className="text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'package သို့မဟုတ် user tier တူညီသည်ကို ထပ်တလဲလဲ ဖန်တီးသည့်အခါ တမ်းပလိတ်များက ဒေတာကန့်သတ်ချက်၊ သက်တမ်းနှင့် ဆာဗာသတ်မှတ်ချက်များကို တစ်ညီတစ်ညာတည်း ထိန်းထားပေးသည်။'
                    : 'Templates keep your quota, expiry, and server assignment choices consistent when the same package or user tier is created repeatedly.'}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြန်သုံးနိုင်မှု' : 'Reusable'}</p>
                    <p className="mt-2 text-sm font-medium">{isMyanmar ? 'သော့ဖန်တီးစဉ် တစ်ချက်နှိပ်ရုံ' : 'One-click during key creation'}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သတ်မှတ်နယ်ပယ်' : 'Scoped'}</p>
                    <p className="mt-2 text-sm font-medium">{isMyanmar ? 'ရွေးချယ်နိုင်သော ဆာဗာနှင့် ကန့်သတ်ချက် မူလတန်ဖိုးများ' : 'Optional server and quota defaults'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card className="ops-panel">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-primary" />
            {isMyanmar ? 'တမ်းပလိတ် စာရင်း' : 'Template inventory'}
          </CardTitle>
          <CardDescription>
            {isMyanmar ? 'အမည်၊ ဖော်ပြချက် သို့မဟုတ် မူလဆာဗာအမည်ဖြင့် တမ်းပလိတ်များကို ရှာဖွေပါ။' : 'Search templates by name, description, or default server.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="ops-filter-bar grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="template-search">{isMyanmar ? 'ရှာဖွေမည်' : 'Search'}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="template-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={isMyanmar ? 'တမ်းပလိတ်၊ ဖော်ပြချက် သို့မဟုတ် ဆာဗာအမည်ကို ရှာပါ' : 'Search templates, descriptions, or servers'}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="ops-table-meta">{isMyanmar ? `တမ်းပလိတ် ${filteredTemplates.length} ခု` : `${filteredTemplates.length} templates`}</div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <SurfaceSkeleton key={i} className="min-h-[224px]" lines={5} />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={templateList.length === 0 ? (isMyanmar ? 'တမ်းပလိတ် မရှိသေးပါ' : 'No templates found') : (isMyanmar ? 'လက်ရှိ ရှာဖွေမှုနှင့် ကိုက်ညီသော တမ်းပလိတ် မရှိပါ' : 'No templates match the current search')}
              description={
                templateList.length === 0
                  ? (isMyanmar ? 'သော့ဖန်တီးမှု လုပ်ငန်းစဉ်ကို စံတကျဖြစ်စေရန် တမ်းပလိတ်တစ်ခု ဖန်တီးပါ။' : 'Create a template to standardize your key creation process.')
                  : (isMyanmar ? 'အခြားအမည်၊ ဖော်ပြချက် သို့မဟုတ် ဆာဗာ ရှာဖွေစကားလုံးဖြင့် ထပ်စမ်းကြည့်ပါ။' : 'Try a different name, description, or server query.')
              }
              action={
                templateList.length === 0 ? (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {isMyanmar ? 'ပထမ တမ်းပလိတ်ကို ဖန်တီးမည်' : 'Create first template'}
                  </Button>
                ) : null
              }
              className="min-h-[240px]"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="ops-detail-card group h-full p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 dark:hover:border-cyan-300/22"
                >
                  <CardHeader className="space-y-3 px-5 pb-0 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="line-clamp-1 text-lg" title={template.name}>
                          {template.name}
                        </CardTitle>
                        <CardDescription className="line-clamp-2">
                          {template.description || (isMyanmar ? 'ဖော်ပြချက် မရှိသေးပါ' : 'No description')}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTemplate(template)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(template.id)}
                          disabled={deleteMutation.isPending && deletingTemplateId === template.id}
                        >
                          {deleteMutation.isPending && deletingTemplateId === template.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 px-5 pb-5 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဒေတာကန့်သတ်ချက်' : 'Data limit'}</p>
                        <p className="mt-2 text-sm font-medium">
                          {template.dataLimitBytes ? formatBytes(template.dataLimitBytes) : (isMyanmar ? 'အကန့်အသတ်မရှိ' : 'Unlimited')}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သက်တမ်း' : 'Expiration'}</p>
                        <p className="mt-2 text-sm font-medium">
                          {template.expirationType === 'NEVER' ? (isMyanmar ? 'သက်တမ်းမရှိ' : 'Never') : `${template.durationDays} ${isMyanmar ? 'ရက်' : 'days'}`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {template.expirationType === 'START_ON_FIRST_USE'
                            ? (isMyanmar ? 'ပထမအသုံးပြုချိန်မှ စတင်မည်' : 'Starts on first use')
                            : template.expirationType === 'NEVER'
                              ? (isMyanmar ? 'သက်တမ်းမသတ်မှတ်ထားပါ' : 'No expiry applied')
                              : (isMyanmar ? 'ဖန်တီးသည့်နေ့မှ သတ်မှတ်ထားသော ကာလ' : 'Fixed duration from creation')}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အလိုအလျောက် လုပ်ဆောင်မှု' : 'Automation'}</p>
                        <p className="mt-2 text-sm font-medium">
                          {template.autoDisableOnExpire ? (isMyanmar ? 'သက်တမ်းကုန်လျှင် ပိတ်မည်' : 'Disable on expiry') : (isMyanmar ? 'သက်တမ်းကုန်ပြီးနောက်လည်း ဆက်မြင်နိုင်မည်' : 'Expiry stays readable')}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? `${template.autoArchiveAfterDays ?? 0} ရက်အကြာတွင် သိမ်းဆည်းမည်` : `Archive after ${template.autoArchiveAfterDays ?? 0} day(s)`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'မျှဝေမှု' : 'Sharing'}</p>
                        <p className="mt-2 text-sm font-medium">
                          {getThemeDisplayName(template.subscriptionTheme || 'dark', isMyanmar)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            template.sharePageEnabled ? (isMyanmar ? 'မျှဝေစာမျက်နှာ' : 'Share page') : null,
                            template.clientLinkEnabled ? (isMyanmar ? 'ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်' : 'Client URL') : null,
                            template.telegramDeliveryEnabled ? (isMyanmar ? 'တယ်လီဂရမ်' : 'Telegram') : null,
                          ].filter(Boolean).join(' • ') || (isMyanmar ? 'ပို့ဆောင်မှုအားလုံး ပိတ်ထားသည်' : 'All delivery disabled')}
                        </p>
                      </div>
                    </div>

                    <div className="ops-mini-tile">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'မူလဆာဗာ' : 'Default server'}</p>
                          <p className="mt-2 text-sm font-medium">{template.server?.name || (isMyanmar ? 'မူလဆာဗာ မရှိပါ' : 'No default server')}</p>
                        </div>
                        {template.server?.name ? <Badge variant="outline">{isMyanmar ? 'သတ်မှတ်ထားသည်' : 'Assigned'}</Badge> : null}
                      </div>
                    </div>

                    <div className="ops-mobile-action-bar">
                      <Button variant="secondary" className="w-full sm:flex-1" asChild>
                        <Link href={`/dashboard/keys?action=create&template=${template.id}`}>
                          <Plus className="mr-2 h-4 w-4" />
                          {isMyanmar ? 'ဤတမ်းပလိတ်ကို သုံးမည်' : 'Use template'}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} />

      {editingTemplate ? (
        <TemplateDialog
          open={!!editingTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingTemplate(null);
            }
          }}
          template={editingTemplate}
          onSuccess={() => refetch()}
        />
      ) : null}

      <ConfirmationDialog
        open={!!templateToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setTemplateToDelete(null);
          }
        }}
        title={isMyanmar ? 'တမ်းပလိတ်ကို ဖျက်မည်' : 'Delete template'}
        description={
          templateToDelete
            ? (isMyanmar
              ? `"${templateToDelete.name}" ကို ဖျက်လိုသည်မှာ သေချာပါသလား။`
              : `Are you sure you want to delete "${templateToDelete.name}"?`)
            : ''
        }
        confirmLabel={isMyanmar ? 'တမ်းပလိတ်ကို ဖျက်မည်' : 'Delete template'}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!templateToDelete) return;
          setDeletingTemplateId(templateToDelete.id);
          deleteMutation.mutate({ id: templateToDelete.id });
        }}
      />
    </div>
  );
}
