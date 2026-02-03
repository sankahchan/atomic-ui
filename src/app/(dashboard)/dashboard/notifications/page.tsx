'use client';

/**
 * Notifications Page
 *
 * This page allows administrators to configure notification channels for
 * receiving alerts about important system events and view key alerts.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes } from '@/lib/utils';
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
];

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
  events: string[];
};

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
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: editChannel?.name || '',
    type: editChannel?.type || 'TELEGRAM' as ChannelType,
    telegramChatId: editChannel?.type === 'TELEGRAM' ? editChannel.config.chatId : '',
    email: editChannel?.type === 'EMAIL' ? editChannel.config.email : '',
    webhookUrl: editChannel?.type === 'WEBHOOK' ? editChannel.config.url : '',
    events: editChannel?.events || [],
  });

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

    setIsLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: editChannel ? t('notifications.toast.channel_updated') : t('notifications.toast.channel_created'),
      description: t('notifications.toast.success_desc'),
    });

    setIsLoading(false);
    onSuccess();
    onOpenChange(false);
  };

  const toggleEvent = (eventId: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

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
            </div>
          )}

          {formData.type === 'WEBHOOK' && (
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
          )}

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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('notifications.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
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
                      className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                    >
                      <div className="flex items-center gap-3">
                        <KeyRound className="w-4 h-4 text-red-500" />
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">{key.serverName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="destructive" className="text-xs">
                          {key.daysRemaining === 0
                            ? t('notifications.key_alerts.expires_today')
                            : key.daysRemaining === 1
                              ? t('notifications.key_alerts.day_left')
                              : `${key.daysRemaining} ${t('notifications.key_alerts.days_left')}`}
                        </Badge>
                        <Link href={`/dashboard/keys`}>
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
                      className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20"
                    >
                      <div className="flex items-center gap-3">
                        <KeyRound className="w-4 h-4 text-orange-500" />
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">{key.serverName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
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
                        <Link href={`/dashboard/keys`}>
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

/**
 * NotificationsPage Component
 */
export default function NotificationsPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);

  const handleEdit = (channel: Channel) => {
    setEditChannel(channel);
    setDialogOpen(true);
  };

  const handleDelete = (channel: Channel) => {
    if (confirm(`${t('notifications.confirm_delete')} "${channel.name}"?`)) {
      setChannels(channels.filter((c) => c.id !== channel.id));
      toast({
        title: t('notifications.toast.deleted'),
        description: t('notifications.toast.deleted_desc'),
      });
    }
  };

  const handleTest = async (channel: Channel) => {
    toast({
      title: t('notifications.toast.test_sent'),
      description: t('notifications.toast.test_desc'),
    });
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
        <Button onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-2" />
          {t('notifications.add_channel')}
        </Button>
      </div>

      {/* Key Alerts Card - Primary feature */}
      <KeyAlertsCard />

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
      {channels.length > 0 ? (
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

      {/* Channel dialog */}
      <ChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editChannel={editChannel}
        onSuccess={() => {
          // In production, this would refetch from the API
        }}
      />
    </div>
  );
}
