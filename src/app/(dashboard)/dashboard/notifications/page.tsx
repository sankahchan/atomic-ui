'use client';

/**
 * Notifications Page
 *
 * This page allows administrators to configure notification channels for
 * receiving alerts about important system events and view key alerts.
 */

import { keepPreviousData } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import {
  Plus,
  Bell,
  Send,
  Mail,
  Globe,
  Trash2,
  Edit,
  CheckCircle2,
  Loader2,
  TestTube,
  MessageSquare,
  AlertTriangle,
  Clock,
  KeyRound,
  HardDrive,
  ExternalLink,
  RefreshCw,
  History,
  RotateCcw,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';

/**
 * Notification channel type definitions
 */
type ChannelType = 'TELEGRAM' | 'EMAIL' | 'WEBHOOK';

/**
 * Event types that can trigger notifications
 */
const EVENT_TYPES = [
  { id: 'SERVER_DOWN', labelKey: 'notifications.event.SERVER_DOWN' },
  { id: 'SERVER_UP', labelKey: 'notifications.event.SERVER_UP' },
  { id: 'SERVER_SLOW', labelKey: 'notifications.event.SERVER_SLOW' },
  { id: 'KEY_EXPIRING', labelKey: 'notifications.event.KEY_EXPIRING' },
  { id: 'KEY_EXPIRED', labelKey: 'notifications.event.KEY_EXPIRED' },
  { id: 'TRAFFIC_WARNING', labelKey: 'notifications.event.TRAFFIC_WARNING' },
  { id: 'TRAFFIC_DEPLETED', labelKey: 'notifications.event.TRAFFIC_DEPLETED' },
  { id: 'AUDIT_ALERT', labelKey: 'notifications.event.AUDIT_ALERT' },
] as const;

type NotificationEventId = (typeof EVENT_TYPES)[number]['id'];
const MAX_NOTIFICATION_COOLDOWN_MINUTES = 24 * 60;
const WEBHOOK_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const RESERVED_WEBHOOK_HEADERS = new Set([
  'content-type',
  'content-length',
  'host',
  'user-agent',
  'x-atomic-event',
  'x-atomic-timestamp',
  'x-atomic-signature',
]);

/**
 * Channel type configuration with icons and descriptions
 */
const CHANNEL_TYPES = {
  TELEGRAM: {
    icon: Send,
    labelKey: 'notifications.type.TELEGRAM',
    descriptionKey: 'notifications.channel_desc.telegram', // We can simplify or reuse
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  EMAIL: {
    icon: Mail,
    labelKey: 'notifications.type.EMAIL',
    descriptionKey: 'notifications.channel_desc.email',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  WEBHOOK: {
    icon: Globe,
    labelKey: 'notifications.type.WEBHOOK',
    descriptionKey: 'notifications.channel_desc.webhook',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
};

// Channel type for state
type Channel = {
  id: string;
  name: string;
  type: ChannelType;
  isActive: boolean;
  config: Record<string, string>;
  events: NotificationEventId[];
};

type DeliveryStatusFilter = 'ALL' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
type EventCooldownInputs = Partial<Record<NotificationEventId, string>>;
type WebhookHeaderRow = {
  id: string;
  key: string;
  value: string;
};

type DeliveryLog = {
  id: string;
  channelId: string | null;
  channelName: string | null;
  channelType: string | null;
  channelIsActive: boolean | null;
  channelMissing: boolean;
  event: string;
  message: string;
  status: string;
  error: string | null;
  sentAt: Date;
  accessKeyId: string | null;
  accessKeyName: string | null;
  canRetry: boolean;
  retryQueued?: boolean;
};

function getEventLabel(eventId: string, t: (key: string) => string) {
  const isTestEvent = eventId.startsWith('TEST_');
  const normalizedEventId = isTestEvent ? eventId.slice(5) : eventId;
  const knownEvent = EVENT_TYPES.find((event) => event.id === normalizedEventId);
  const baseLabel = knownEvent ? t(knownEvent.labelKey) : normalizedEventId.replaceAll('_', ' ');

  return isTestEvent ? `${t('notifications.delivery.test_prefix')} ${baseLabel}` : baseLabel;
}

function getChannelLabel(log: DeliveryLog, t: (key: string) => string) {
  if (log.channelName) {
    return log.channelName;
  }

  if (log.channelId && log.channelMissing) {
    return t('notifications.delivery.deleted_channel');
  }

  return t('notifications.delivery.system');
}

function getStatusLabel(status: string, t: (key: string) => string) {
  if (status === 'SUCCESS' || status === 'FAILED' || status === 'SKIPPED') {
    return t(`notifications.status.${status}`);
  }

  return status;
}

function getStatusBadgeClass(status: string) {
  if (status === 'SUCCESS') {
    return 'border-emerald-500/40 text-emerald-500';
  }

  if (status === 'SKIPPED') {
    return 'border-amber-500/40 text-amber-500';
  }

  return '';
}

function parseStoredEventCooldowns(value?: string): EventCooldownInputs {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, rawValue]) => EVENT_TYPES.some((event) => event.id === key) && typeof rawValue === 'number')
        .map(([key, rawValue]) => [key, String(rawValue)]),
    ) as EventCooldownInputs;
  } catch {
    return {};
  }
}

function parseCooldownNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_NOTIFICATION_COOLDOWN_MINUTES) {
    return null;
  }

  return parsed;
}

function createWebhookHeaderRow(key = '', value = ''): WebhookHeaderRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    key,
    value,
  };
}

function parseStoredWebhookHeaders(value?: string): WebhookHeaderRow[] {
  if (!value) {
    return [createWebhookHeaderRow()];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [createWebhookHeaderRow()];
    }

    const rows = Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, headerValue]) => createWebhookHeaderRow(key, headerValue));

    return rows.length > 0 ? rows : [createWebhookHeaderRow()];
  } catch {
    return [createWebhookHeaderRow()];
  }
}

function buildWebhookHeadersPayload(headers: WebhookHeaderRow[]) {
  const next: Record<string, string> = {};
  const seenHeaders = new Set<string>();

  for (const header of headers) {
    const key = header.key.trim();
    const value = header.value.trim();

    if (!key && !value) {
      continue;
    }

    if (!key || !WEBHOOK_HEADER_NAME_PATTERN.test(key)) {
      return null;
    }

    const normalizedKey = key.toLowerCase();
    if (RESERVED_WEBHOOK_HEADERS.has(normalizedKey) || seenHeaders.has(normalizedKey)) {
      return null;
    }

    seenHeaders.add(normalizedKey);
    next[key] = value;
  }

  return next;
}

function buildEventCooldownPayload(eventCooldowns: EventCooldownInputs) {
  const next: Partial<Record<NotificationEventId, number>> = {};

  for (const [eventId, rawValue] of Object.entries(eventCooldowns) as Array<[NotificationEventId, string]>) {
    if (!rawValue.trim()) {
      continue;
    }

    const parsed = parseCooldownNumber(rawValue);
    if (parsed === null) {
      return null;
    }

    next[eventId] = parsed;
  }

  return next;
}

function getChannelRuleSummary(channel: Channel, t: (key: string) => string) {
  const defaultCooldown = parseCooldownNumber(channel.config.cooldownMinutes || '0') ?? 0;
  const eventCooldowns = parseStoredEventCooldowns(channel.config.eventCooldowns);
  const overrideCount = Object.keys(eventCooldowns).length;

  if (defaultCooldown === 0 && overrideCount === 0) {
    return t('notifications.rules.none');
  }

  const parts = [];
  if (defaultCooldown > 0) {
    parts.push(`${t('notifications.rules.default_short')} ${defaultCooldown}m`);
  }
  if (overrideCount > 0) {
    parts.push(`${overrideCount} ${t('notifications.rules.overrides_short')}`);
  }

  return parts.join(' · ');
}

/**
 * ChannelDialog Component
 */
function ChannelDialog({
  open,
  onOpenChange,
  editChannel,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editChannel?: Channel | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const saveChannelMutation = trpc.notifications.saveChannel.useMutation({
    onSuccess: async () => {
      toast({
        title: editChannel ? t('notifications.toast.channel_updated') : t('notifications.toast.channel_created'),
        description: t('notifications.toast.success_desc'),
      });
      await Promise.all([
        utils.notifications.listChannels.invalidate(),
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const [formData, setFormData] = useState({
    id: editChannel?.id,
    name: editChannel?.name || '',
    type: editChannel?.type || 'TELEGRAM' as ChannelType,
    isActive: editChannel?.isActive ?? true,
    cooldownMinutes: editChannel?.config.cooldownMinutes || '0',
    eventCooldowns: parseStoredEventCooldowns(editChannel?.config.eventCooldowns),
    telegramChatId: editChannel?.type === 'TELEGRAM' ? editChannel.config.chatId || '' : '',
    email: editChannel?.type === 'EMAIL' ? editChannel.config.email || '' : '',
    webhookUrl: editChannel?.type === 'WEBHOOK' ? editChannel.config.url || '' : '',
    webhookSigningSecret: editChannel?.type === 'WEBHOOK' ? editChannel.config.signingSecret || '' : '',
    webhookHeaders: parseStoredWebhookHeaders(editChannel?.type === 'WEBHOOK' ? editChannel.config.headers : undefined),
    events: editChannel?.events || [],
  });

  useEffect(() => {
    setFormData({
      id: editChannel?.id,
      name: editChannel?.name || '',
      type: editChannel?.type || 'TELEGRAM',
      isActive: editChannel?.isActive ?? true,
      cooldownMinutes: editChannel?.config.cooldownMinutes || '0',
      eventCooldowns: parseStoredEventCooldowns(editChannel?.config.eventCooldowns),
      telegramChatId: editChannel?.type === 'TELEGRAM' ? editChannel.config.chatId || '' : '',
      email: editChannel?.type === 'EMAIL' ? editChannel.config.email || '' : '',
      webhookUrl: editChannel?.type === 'WEBHOOK' ? editChannel.config.url || '' : '',
      webhookSigningSecret: editChannel?.type === 'WEBHOOK' ? editChannel.config.signingSecret || '' : '',
      webhookHeaders: parseStoredWebhookHeaders(editChannel?.type === 'WEBHOOK' ? editChannel.config.headers : undefined),
      events: editChannel?.events || [],
    });
  }, [editChannel, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.name_required'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.type === 'TELEGRAM' && !formData.telegramChatId) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.chat_id_required'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.type === 'EMAIL' && !formData.email) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.email_required'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.type === 'WEBHOOK' && !formData.webhookUrl) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.webhook_required'),
        variant: 'destructive',
      });
      return;
    }

    const webhookHeaders = buildWebhookHeadersPayload(formData.webhookHeaders);
    if (formData.type === 'WEBHOOK' && !webhookHeaders) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.webhook_headers_invalid'),
        variant: 'destructive',
      });
      return;
    }

    const cooldownMinutes = parseCooldownNumber(formData.cooldownMinutes);
    if (cooldownMinutes === null) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.cooldown_invalid'),
        variant: 'destructive',
      });
      return;
    }

    const eventCooldowns = buildEventCooldownPayload(formData.eventCooldowns);
    if (!eventCooldowns) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.cooldown_invalid'),
        variant: 'destructive',
      });
      return;
    }

    saveChannelMutation.mutate({
      id: formData.id,
      name: formData.name.trim(),
      type: formData.type,
      isActive: formData.isActive,
      cooldownMinutes,
      eventCooldowns,
      telegramChatId: formData.type === 'TELEGRAM' ? formData.telegramChatId.trim() : undefined,
      email: formData.type === 'EMAIL' ? formData.email.trim() : undefined,
      webhookUrl: formData.type === 'WEBHOOK' ? formData.webhookUrl.trim() : undefined,
      webhookSigningSecret: formData.type === 'WEBHOOK' ? formData.webhookSigningSecret.trim() : undefined,
      webhookHeaders: formData.type === 'WEBHOOK' ? formData.webhookHeaders.map((header) => ({
        key: header.key,
        value: header.value,
      })) : [],
      events: formData.events,
    });
  };

  const toggleEvent = (eventId: NotificationEventId) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
      eventCooldowns: prev.events.includes(eventId)
        ? Object.fromEntries(
            Object.entries(prev.eventCooldowns).filter(([key]) => key !== eventId),
          ) as EventCooldownInputs
        : prev.eventCooldowns,
    }));
  };

  const cooldownEvents = formData.events.length > 0
    ? EVENT_TYPES.filter((event) => formData.events.includes(event.id))
    : EVENT_TYPES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            {editChannel ? t('notifications.edit_channel') : t('notifications.create_channel')}
          </DialogTitle>
          <DialogDescription>
            {t('notifications.dialog.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Channel name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('notifications.dialog.name')}</Label>
            <Input
              id="name"
              placeholder={t('notifications.dialog.name_placeholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Channel Active</p>
              <p className="text-xs text-muted-foreground">Inactive channels are kept but won&apos;t receive alerts.</p>
            </div>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
          </div>

          {/* Channel type */}
          <div className="space-y-2">
            <Label>{t('notifications.dialog.type')}</Label>
            <Select
              value={formData.type}
              onValueChange={(value: ChannelType) => setFormData({ ...formData, type: value })}
              disabled={!!editChannel}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_TYPES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <config.icon className={cn('w-4 h-4', config.color)} />
                      {t(config.labelKey)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type-specific configuration */}
          {formData.type === 'TELEGRAM' && (
            <div className="space-y-2">
              <Label htmlFor="chatId">{t('notifications.dialog.chat_id')}</Label>
              <Input
                id="chatId"
                placeholder={t('notifications.dialog.chat_id_placeholder')}
                value={formData.telegramChatId}
                onChange={(e) => setFormData({ ...formData, telegramChatId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('notifications.dialog.chat_id_help')}
              </p>
            </div>
          )}

          {formData.type === 'EMAIL' && (
            <div className="space-y-2">
              <Label htmlFor="email">{t('notifications.dialog.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('notifications.dialog.email_placeholder')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('notifications.dialog.email_help')}
              </p>
            </div>
          )}

          {formData.type === 'WEBHOOK' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">{t('notifications.dialog.webhook')}</Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  placeholder={t('notifications.dialog.webhook_placeholder')}
                  value={formData.webhookUrl}
                  onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('notifications.dialog.webhook_help')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhookSigningSecret">{t('notifications.dialog.webhook_signing')}</Label>
                <Input
                  id="webhookSigningSecret"
                  type="password"
                  placeholder={t('notifications.dialog.webhook_signing_placeholder')}
                  value={formData.webhookSigningSecret}
                  onChange={(e) => setFormData({ ...formData, webhookSigningSecret: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('notifications.dialog.webhook_signing_help')}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <Label>{t('notifications.dialog.webhook_headers')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('notifications.dialog.webhook_headers_help')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      webhookHeaders: [...prev.webhookHeaders, createWebhookHeaderRow()],
                    }))}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t('notifications.dialog.webhook_add_header')}
                  </Button>
                </div>

                <div className="space-y-2">
                  {formData.webhookHeaders.map((header) => (
                    <div key={header.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                      <Input
                        placeholder={t('notifications.dialog.webhook_header_name')}
                        value={header.key}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          webhookHeaders: prev.webhookHeaders.map((row) =>
                            row.id === header.id ? { ...row, key: e.target.value } : row,
                          ),
                        }))}
                      />
                      <Input
                        placeholder={t('notifications.dialog.webhook_header_value')}
                        value={header.value}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          webhookHeaders: prev.webhookHeaders.map((row) =>
                            row.id === header.id ? { ...row, value: e.target.value } : row,
                          ),
                        }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setFormData((prev) => ({
                          ...prev,
                          webhookHeaders:
                            prev.webhookHeaders.length === 1
                              ? [createWebhookHeaderRow()]
                              : prev.webhookHeaders.filter((row) => row.id !== header.id),
                        }))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cooldownMinutes">{t('notifications.rules.default')}</Label>
            <Input
              id="cooldownMinutes"
              type="number"
              min={0}
              max={MAX_NOTIFICATION_COOLDOWN_MINUTES}
              value={formData.cooldownMinutes}
              onChange={(e) => setFormData({ ...formData, cooldownMinutes: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t('notifications.rules.default_help')}
            </p>
          </div>

          {/* Event subscriptions */}
          <div className="space-y-3">
            <Label>{t('notifications.dialog.events')}</Label>
            <div className="grid grid-cols-1 gap-2">
              {EVENT_TYPES.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => toggleEvent(event.id)}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors text-left',
                    formData.events.includes(event.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <div>
                    <p className="font-medium text-sm">{t(event.labelKey)}</p>
                  </div>
                  <div className={cn(
                    'w-5 h-5 rounded border flex items-center justify-center',
                    formData.events.includes(event.id)
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30'
                  )}>
                    {formData.events.includes(event.id) && (
                      <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t('notifications.rules.overrides')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('notifications.rules.overrides_help')}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {cooldownEvents.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{t(event.labelKey)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('notifications.rules.override_hint')}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={MAX_NOTIFICATION_COOLDOWN_MINUTES}
                      className="w-28"
                      value={formData.eventCooldowns[event.id] ?? ''}
                      placeholder={t('notifications.rules.use_default')}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        eventCooldowns: {
                          ...prev.eventCooldowns,
                          [event.id]: e.target.value,
                        },
                      }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('notifications.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={saveChannelMutation.isPending}>
              {saveChannelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editChannel ? t('notifications.dialog.save') : t('notifications.dialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ChannelCard Component
 */
function ChannelCard({
  channel,
  onEdit,
  onDelete,
  onTest,
}: {
  channel: Channel;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const { t } = useLocale();
  const config = CHANNEL_TYPES[channel.type];
  const Icon = config.icon;

  return (
    <Card className="group hover:border-primary/30 transition-colors">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn('p-2.5 rounded-lg', config.bgColor)}>
              <Icon className={cn('w-5 h-5', config.color)} />
            </div>
            <div>
              <h3 className="font-semibold">{channel.name}</h3>
              <p className="text-sm text-muted-foreground">{t(config.labelKey)}</p>
            </div>
          </div>
          <Badge variant={channel.isActive ? 'default' : 'secondary'}>
            {channel.isActive ? t('notifications.channel_active') : t('notifications.channel_inactive')}
          </Badge>
        </div>

        {/* Subscribed events */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">{t('notifications.events.subscribed')}</p>
          <div className="flex flex-wrap gap-1.5">
            {channel.events.length > 0 ? (
              channel.events.map((eventId) => {
                const event = EVENT_TYPES.find((e) => e.id === eventId);
                return (
                  <Badge key={eventId} variant="outline" className="text-xs">
                    {event ? t(event.labelKey) : eventId}
                  </Badge>
                );
              })
            ) : (
              <span className="text-sm text-muted-foreground">{t('notifications.events.none')}</span>
            )}
          </div>
        </div>

        <div className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t('notifications.rules.title')}:</span>{' '}
          {getChannelRuleSummary(channel, t)}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <Button
            variant="outline"
            size="sm"
            className="min-w-[132px] flex-1"
            onClick={onTest}
          >
            <TestTube className="w-4 h-4 mr-2" />
            {t('notifications.actions.test')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onEdit}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * KeyAlertsCard Component
 *
 * Displays alerts for keys that are:
 * - Reaching 80% data usage
 * - Expiring within 7 days
 */
function KeyAlertsCard() {
  const { t } = useLocale();
  const { data: alertsData, isLoading, refetch } = trpc.keys.getKeyAlerts.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            {t('notifications.key_alerts.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAlerts = alertsData && alertsData.totalAlerts > 0;

  return (
    <Card className={cn(
      hasAlerts && 'border-orange-500/30 bg-orange-500/5'
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className={cn(
              'w-5 h-5',
              hasAlerts ? 'text-orange-500' : 'text-muted-foreground'
            )} />
            {t('notifications.key_alerts.title')}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <CardDescription>
          {t('notifications.key_alerts.desc')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAlerts ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
            <p className="font-medium text-green-600">{t('notifications.key_alerts.all_healthy')}</p>
            <p className="text-sm text-muted-foreground">
              {t('notifications.key_alerts.no_issues')}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className={cn(
                'p-4 rounded-lg border',
                alertsData.expiringCount > 0
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-muted/50 border-border'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={cn(
                    'w-4 h-4',
                    alertsData.expiringCount > 0 ? 'text-red-500' : 'text-muted-foreground'
                  )} />
                  <span className="text-sm font-medium">{t('notifications.key_alerts.expiring')}</span>
                </div>
                <p className={cn(
                  'text-2xl font-bold',
                  alertsData.expiringCount > 0 ? 'text-red-500' : 'text-muted-foreground'
                )}>
                  {alertsData.expiringCount} keys
                </p>
                <p className="text-xs text-muted-foreground">{t('notifications.key_alerts.expiring_desc')}</p>
              </div>

              <div className={cn(
                'p-4 rounded-lg border',
                alertsData.trafficWarningCount > 0
                  ? 'bg-orange-500/10 border-orange-500/30'
                  : 'bg-muted/50 border-border'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <HardDrive className={cn(
                    'w-4 h-4',
                    alertsData.trafficWarningCount > 0 ? 'text-orange-500' : 'text-muted-foreground'
                  )} />
                  <span className="text-sm font-medium">{t('notifications.key_alerts.high_usage')}</span>
                </div>
                <p className={cn(
                  'text-2xl font-bold',
                  alertsData.trafficWarningCount > 0 ? 'text-orange-500' : 'text-muted-foreground'
                )}>
                  {alertsData.trafficWarningCount} keys
                </p>
                <p className="text-xs text-muted-foreground">{t('notifications.key_alerts.high_usage_desc')}</p>
              </div>
            </div>

            {/* Expiring keys list */}
            {alertsData.expiringKeys.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-500" />
                  {t('notifications.key_alerts.expiring_title')}
                </h4>
                <div className="space-y-2">
                  {alertsData.expiringKeys.slice(0, 5).map((key) => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <KeyRound className="w-4 h-4 text-red-500" />
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">{key.serverName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <Badge variant="destructive" className="text-xs">
                          {key.daysRemaining === 0
                            ? t('notifications.key_alerts.expires_today')
                            : key.daysRemaining === 1
                              ? t('notifications.key_alerts.day_left')
                              : `${key.daysRemaining} ${t('notifications.key_alerts.days_left')}`}
                        </Badge>
                        <Link href={`/dashboard/keys/${key.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                  {alertsData.expiringKeys.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      +{alertsData.expiringKeys.length - 5} {t('notifications.key_alerts.more')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Traffic warning keys list */}
            {alertsData.trafficWarningKeys.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-orange-500" />
                  {t('notifications.key_alerts.usage_title')}
                </h4>
                <div className="space-y-2">
                  {alertsData.trafficWarningKeys.slice(0, 5).map((key) => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <KeyRound className="w-4 h-4 text-orange-500" />
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">{key.serverName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="w-24">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span>{formatBytes(BigInt(key.usedBytes))}</span>
                            <span className="text-muted-foreground">{formatBytes(BigInt(key.dataLimitBytes))}</span>
                          </div>
                          <Progress
                            value={key.usagePercent}
                            className={cn(
                              'h-1.5',
                              key.usagePercent >= 90 && '[&>div]:bg-red-500',
                              key.usagePercent >= 80 && key.usagePercent < 90 && '[&>div]:bg-orange-500'
                            )}
                          />
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            key.usagePercent >= 90
                              ? 'border-red-500/50 text-red-500'
                              : 'border-orange-500/50 text-orange-500'
                          )}
                        >
                          {key.usagePercent}%
                        </Badge>
                        <Link href={`/dashboard/keys/${key.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                  {alertsData.trafficWarningKeys.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      +{alertsData.trafficWarningKeys.length - 5} {t('notifications.key_alerts.more')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueueStatusCard() {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const { data, isLoading, isFetching } = trpc.notifications.queueStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const processQueueMutation = trpc.notifications.processQueueNow.useMutation({
    onSuccess: async (result) => {
      toast({
        title: t('notifications.queue.processed'),
        description:
          result.claimed > 0
            ? `${result.delivered} ${t('notifications.queue.delivered')}, ${result.rescheduled} ${t('notifications.queue.rescheduled')}, ${result.failed} ${t('notifications.queue.failed_count')}`
            : t('notifications.queue.nothing_due'),
      });

      await Promise.all([
        utils.notifications.queueStatus.invalidate(),
        utils.notifications.listLogs.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: t('notifications.queue.process_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{t('notifications.queue.title')}</CardTitle>
            <CardDescription>{t('notifications.queue.desc')}</CardDescription>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {isFetching && !isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => processQueueMutation.mutate({ limit: 50 })}
              disabled={processQueueMutation.isPending || isLoading}
            >
              {processQueueMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {t('notifications.queue.process_now')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.due_now')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.dueNowCount ?? 0}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.pending')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.pendingCount ?? 0}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.retrying')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.retryingCount ?? 0}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.processing')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.processingCount ?? 0}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.failed')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.failedCount ?? 0}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t('notifications.queue.success_today')}: <span className="font-medium text-foreground">{data?.successTodayCount ?? 0}</span>
              </span>
              <span>
                {data?.nextDelivery
                  ? `${t('notifications.queue.next_attempt')}: ${formatDateTime(data.nextDelivery.nextAttemptAt)}`
                  : t('notifications.queue.empty')}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DeliveryHistoryCard({ channels }: { channels: Channel[] }) {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [status, setStatus] = useState<DeliveryStatusFilter>('ALL');
  const [channelId, setChannelId] = useState('ALL');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    setPage(1);
  }, [status, channelId, deferredSearch]);

  const { data, isLoading, isFetching } = trpc.notifications.listLogs.useQuery(
    {
      page,
      pageSize: 15,
      status,
      channelId: channelId === 'ALL' ? undefined : channelId,
      search: deferredSearch || undefined,
    },
    {
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  );

  const retryLogMutation = trpc.notifications.retryLog.useMutation({
    onSuccess: async (result) => {
      toast({
        title: result.alreadyQueued ? t('notifications.toast.retry_already_queued') : t('notifications.toast.retry_queued'),
        description: result.alreadyQueued
          ? t('notifications.toast.retry_already_queued_desc')
          : t('notifications.toast.retry_queued_desc'),
      });
      await Promise.all([
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: t('notifications.toast.retry_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const logs: DeliveryLog[] = data?.items ?? [];
  const retryingLogId = retryLogMutation.isPending ? retryLogMutation.variables?.logId : null;
  const hasActiveFilters = Boolean(deferredSearch || channelId !== 'ALL' || status !== 'ALL');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              {t('notifications.delivery.title')}
            </CardTitle>
            <CardDescription>{t('notifications.delivery.desc')}</CardDescription>
          </div>
          {isFetching && !isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                id="delivery-search-mobile"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('notifications.delivery.search_placeholder')}
              />
            </div>
            <Button
              variant={hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMobileFilterOpen(true)}
            >
              <Filter className="w-4 h-4 mr-2" />
              {t('notifications.delivery.filters')}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span>
              {data?.total ?? 0} {t('notifications.delivery.results')}
            </span>
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setStatus('ALL');
                  setChannelId('ALL');
                  setSearch('');
                }}
              >
                {t('notifications.delivery.clear_filters')}
              </Button>
            ) : (
              <span>
                {t('notifications.delivery.page')} {data?.page ?? 1} / {data?.totalPages ?? 1}
              </span>
            )}
          </div>
        </div>

        <div className="hidden gap-3 md:grid md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="delivery-search">{t('notifications.delivery.search')}</Label>
            <Input
              id="delivery-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('notifications.delivery.search_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('notifications.delivery.channel')}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('notifications.delivery.all_channels')}</SelectItem>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('notifications.delivery.status')}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as DeliveryStatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('notifications.delivery.all_statuses')}</SelectItem>
                <SelectItem value="SUCCESS">{t('notifications.status.SUCCESS')}</SelectItem>
                <SelectItem value="FAILED">{t('notifications.status.FAILED')}</SelectItem>
                <SelectItem value="SKIPPED">{t('notifications.status.SKIPPED')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Dialog open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('notifications.delivery.filters')}</DialogTitle>
              <DialogDescription>{t('notifications.delivery.filters_desc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('notifications.delivery.channel')}</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('notifications.delivery.all_channels')}</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('notifications.delivery.status')}</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as DeliveryStatusFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('notifications.delivery.all_statuses')}</SelectItem>
                    <SelectItem value="SUCCESS">{t('notifications.status.SUCCESS')}</SelectItem>
                    <SelectItem value="FAILED">{t('notifications.status.FAILED')}</SelectItem>
                    <SelectItem value="SKIPPED">{t('notifications.status.SKIPPED')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setStatus('ALL');
                  setChannelId('ALL');
                  setSearch('');
                }}
              >
                {t('notifications.delivery.clear_filters')}
              </Button>
              <Button onClick={() => setMobileFilterOpen(false)}>{t('notifications.dialog.cancel')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {data?.total ?? 0} {t('notifications.delivery.results')}
          </span>
          <span>
            {t('notifications.delivery.page')} {data?.page ?? 1} / {data?.totalPages ?? 1}
          </span>
        </div>

        <div className="space-y-3 md:hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('notifications.delivery.empty')}
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{getEventLabel(log.event, t)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(log.sentAt)} · {formatRelativeTime(log.sentAt)}
                    </p>
                  </div>
                  <Badge
                    variant={log.status === 'FAILED' ? 'destructive' : 'outline'}
                    className={cn(getStatusBadgeClass(log.status))}
                  >
                    {getStatusLabel(log.status, t)}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">{t('notifications.delivery.channel')}: </span>
                    {getChannelLabel(log, t)}
                  </p>
                  <p className="break-words">
                    <span className="text-muted-foreground">{t('notifications.delivery.message')}: </span>
                    {log.message}
                  </p>
                  {log.error ? (
                    <p className="break-words text-destructive">
                      <span className="text-muted-foreground">{t('notifications.delivery.error')}: </span>
                      {log.error}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-muted-foreground">{t('notifications.delivery.key')}: </span>
                    {log.accessKeyName ?? '-'}
                  </p>
                </div>
                <div className="flex justify-end">
                  {log.canRetry ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => retryLogMutation.mutate({ logId: log.id })}
                      disabled={retryingLogId === log.id}
                    >
                      {retryingLogId === log.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-2" />
                      )}
                      {t('notifications.delivery.retry')}
                    </Button>
                  ) : log.retryQueued ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                      {t('notifications.delivery.retry_queued')}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('notifications.delivery.time')}</TableHead>
                <TableHead>{t('notifications.delivery.channel')}</TableHead>
                <TableHead>{t('notifications.delivery.event')}</TableHead>
                <TableHead>{t('notifications.delivery.status')}</TableHead>
                <TableHead>{t('notifications.delivery.message')}</TableHead>
                <TableHead>{t('notifications.delivery.error')}</TableHead>
                <TableHead>{t('notifications.delivery.key')}</TableHead>
                <TableHead className="text-right">{t('notifications.delivery.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    {t('notifications.delivery.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="min-w-40">
                      <div className="space-y-1">
                        <p className="text-sm">{formatDateTime(log.sentAt)}</p>
                        <p className="text-xs text-muted-foreground">{formatRelativeTime(log.sentAt)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40">
                      <div className="space-y-1">
                        <p className="font-medium">{getChannelLabel(log, t)}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.channelType ? t(`notifications.type.${log.channelType}`) : t('notifications.delivery.system')}
                          {log.channelIsActive === false ? ` · ${t('notifications.channel_inactive')}` : ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-36">{getEventLabel(log.event, t)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={log.status === 'FAILED' ? 'destructive' : 'outline'}
                        className={cn(getStatusBadgeClass(log.status))}
                      >
                        {getStatusLabel(log.status, t)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal break-words text-sm">{log.message}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal break-words text-sm text-destructive">
                      {log.error ?? '—'}
                    </TableCell>
                    <TableCell>{log.accessKeyName ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {log.canRetry ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryLogMutation.mutate({ logId: log.id })}
                          disabled={retryingLogId === log.id}
                        >
                          {retryingLogId === log.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                          )}
                          {t('notifications.delivery.retry')}
                        </Button>
                      ) : log.retryQueued ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                          {t('notifications.delivery.retry_queued')}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {logs.length > 0 ? `${logs.length} / ${data?.total ?? logs.length}` : `0 / ${data?.total ?? 0}`} {t('notifications.delivery.visible')}
          </div>
          <div className="flex items-center gap-2 self-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page <= 1 || isLoading}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('notifications.delivery.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={isLoading || (data?.page ?? 1) >= (data?.totalPages ?? 1)}
            >
              {t('notifications.delivery.next')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * NotificationsPage Component
 */
export default function NotificationsPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);

  const { data: channels = [], isLoading: isChannelsLoading } = trpc.notifications.listChannels.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
    },
  );
  const deleteChannelMutation = trpc.notifications.deleteChannel.useMutation({
    onSuccess: async () => {
      toast({
        title: t('notifications.toast.deleted'),
        description: t('notifications.toast.deleted_desc'),
      });
      await Promise.all([
        utils.notifications.listChannels.invalidate(),
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const testChannelMutation = trpc.notifications.testChannel.useMutation({
    onSuccess: async () => {
      toast({
        title: t('notifications.toast.test_sent'),
        description: t('notifications.toast.test_desc'),
      });
      await Promise.all([
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: 'Test failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (channel: Channel) => {
    setEditChannel(channel);
    setDialogOpen(true);
  };

  const handleDelete = (channel: Channel) => {
    if (confirm(`${t('notifications.confirm_delete')} "${channel.name}"?`)) {
      deleteChannelMutation.mutate({ id: channel.id });
    }
  };

  const handleTest = async (channel: Channel) => {
    testChannelMutation.mutate({ id: channel.id });
  };

  const handleOpenCreate = () => {
    setEditChannel(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <BackButton href="/dashboard" label={t('nav.dashboard')} />
          <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
          <p className="text-muted-foreground">
            {t('notifications.subtitle')}
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          {t('notifications.add_channel')}
        </Button>
      </div>

      {/* Key Alerts Card - Primary feature */}
      <KeyAlertsCard />

      <QueueStatusCard />

      {/* Info card */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Bell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('notifications.info.title')}</p>
              <p className="text-sm text-muted-foreground">
                {t('notifications.info.desc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Telegram bot setup note */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <MessageSquare className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('notifications.telegram.title')}</p>
              <p className="text-sm text-muted-foreground">
                {t('notifications.telegram.desc')}{' '}
                <code className="bg-muted px-1 rounded">TELEGRAM_BOT_TOKEN</code> setting.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channels grid */}
      {isChannelsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((item) => (
            <Card key={item}>
              <CardContent className="p-5">
                <div className="space-y-3 animate-pulse">
                  <div className="h-5 w-32 rounded bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-16 rounded bg-muted" />
                  <div className="h-9 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : channels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onEdit={() => handleEdit(channel)}
              onDelete={() => handleDelete(channel)}
              onTest={() => handleTest(channel)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bell className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('notifications.empty.title')}</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {t('notifications.empty.desc')}
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              {t('notifications.empty.btn')}
            </Button>
          </CardContent>
        </Card>
      )}

      <DeliveryHistoryCard channels={channels} />

      {/* Channel dialog */}
      <ChannelDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditChannel(null);
          }
        }}
        editChannel={editChannel}
        onSuccess={() => {
          setEditChannel(null);
        }}
      />
    </div>
  );
}
