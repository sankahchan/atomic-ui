'use client';

/**
 * Settings Page
 * 
 * This page provides configuration options for the Atomic-UI application.
 * It allows administrators to customize various aspects of the system
 * including general settings, notification preferences, and user management.
 * 
 * The settings are organized into logical sections with clear descriptions
 * to help administrators understand the impact of each option.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import {
  Settings,
  Bell,
  Shield,
  Globe,
  Save,
  Loader2,
  RefreshCw,
  User,
  Key,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Upload,
  Download,
  Trash2,
  FileText,
  AlertTriangle,
  History,
  Copy,
} from 'lucide-react';

/**
 * SettingsPage Component
 * 
 * The main settings page with multiple configuration sections.
 * Each section is contained in its own card for visual organization.
 */
export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useLocale();

  // Fetch current settings
  const { data: settings, isLoading, refetch } = trpc.settings.getAll.useQuery();

  // Get current user
  const { data: currentUser } = trpc.auth.me.useQuery();

  // Update setting mutation
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast({
        title: t('settings.toast.saved'),
        description: t('settings.toast.saved_desc'),
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Password change mutation
  const passwordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast({
        title: t('settings.toast.password_changed'),
        description: t('settings.toast.password_changed_desc'),
      });
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Telegram bot state
  const [botToken, setBotToken] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [keyNotFoundMessage, setKeyNotFoundMessage] = useState('');
  const [adminChatIds, setAdminChatIds] = useState('');
  const [isTelegramEnabled, setIsTelegramEnabled] = useState(false);

  // Telegram bot queries and mutations
  const { data: telegramSettings, refetch: refetchTelegram } = trpc.telegramBot.getSettings.useQuery();
  const { data: webhookInfo, refetch: refetchWebhook } = trpc.telegramBot.getWebhookInfo.useQuery();

  const testConnectionMutation = trpc.telegramBot.testConnection.useMutation({
    onSuccess: (data) => {
      toast({
        title: t('settings.toast.connection_success'),
        description: `Connected to @${data.botUsername}`,
      });
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.connection_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateTelegramMutation = trpc.telegramBot.updateSettings.useMutation({
    onSuccess: () => {
      toast({
        title: t('settings.toast.telegram_saved'),
        description: t('settings.toast.telegram_saved_desc'),
      });
      refetchTelegram();
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setWebhookMutation = trpc.telegramBot.setWebhook.useMutation({
    onSuccess: () => {
      toast({
        title: t('settings.toast.webhook_set'),
        description: t('settings.toast.webhook_set_desc'),
      });
      refetchWebhook();
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteWebhookMutation = trpc.telegramBot.deleteWebhook.useMutation({
    onSuccess: () => {
      toast({
        title: t('settings.toast.webhook_deleted'),
        description: t('settings.toast.webhook_deleted_desc'),
      });
      refetchWebhook();
    },
  });

  // Backup & Restore
  const { data: backups, refetch: refetchBackups } = trpc.backup.list.useQuery();
  const createBackupMutation = trpc.backup.create.useMutation({
    onSuccess: () => {
      toast({ title: t('settings.backup.create_success') });
      refetchBackups();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const restoreBackupMutation = trpc.backup.restore.useMutation({
    onSuccess: () => {
      toast({ title: t('settings.backup.restore_success') });
      window.location.reload();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteBackupMutation = trpc.backup.delete.useMutation({
    onSuccess: () => {
      toast({ title: t('settings.backup.delete_success') });
      refetchBackups();
    },
  });

  const handleCreateBackup = () => {
    createBackupMutation.mutate();
  };

  const handleRestoreBackup = (filename: string) => {
    if (confirm(t('settings.backup.restore_desc'))) {
      restoreBackupMutation.mutate({ filename });
    }
  };

  const handleDeleteBackup = (filename: string) => {
    if (confirm('Are you sure you want to delete this backup?')) {
      deleteBackupMutation.mutate({ filename });
    }
  };

  const handleDownloadBackup = (filename: string) => {
    window.open(`/api/backup/download?filename=${filename}`, '_blank');
  };

  // Initialize telegram form when settings load
  useState(() => {
    if (telegramSettings) {
      setBotToken(telegramSettings.botToken || '');
      setWelcomeMessage(telegramSettings.welcomeMessage || '');
      setKeyNotFoundMessage(telegramSettings.keyNotFoundMessage || '');
      setAdminChatIds(telegramSettings.adminChatIds?.join(', ') || '');
      setIsTelegramEnabled(telegramSettings.isEnabled || false);
    }
  });

  const handleSaveTelegram = () => {
    updateTelegramMutation.mutate({
      botToken: botToken || telegramSettings?.botToken || '',
      welcomeMessage: welcomeMessage || telegramSettings?.welcomeMessage || '',
      keyNotFoundMessage: keyNotFoundMessage || telegramSettings?.keyNotFoundMessage || '',
      adminChatIds: adminChatIds.split(',').map(id => id.trim()).filter(id => id),
      isEnabled: isTelegramEnabled,
    });
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/telegram/webhook`
    : '';

  const handleSaveSetting = (key: string, value: unknown) => {
    updateMutation.mutate({ key, value });
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: t('settings.toast.password_mismatch'),
        description: t('settings.toast.password_mismatch_desc'),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: t('settings.toast.password_short'),
        description: t('settings.toast.password_short_desc'),
        variant: 'destructive',
      });
      return;
    }

    passwordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {t('settings.general.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.general.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="siteName">{t('settings.general.site_name')}</Label>
                <Input
                  id="siteName"
                  defaultValue={settings?.siteName as string || 'Atomic-UI'}
                  onBlur={(e) => handleSaveSetting('siteName', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.general.site_name_desc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultTheme">{t('settings.general.theme')}</Label>
                <Select
                  defaultValue={settings?.defaultTheme as string || 'dark'}
                  onValueChange={(value) => handleSaveSetting('defaultTheme', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('settings.general.theme.light')}</SelectItem>
                    <SelectItem value="dark">{t('settings.general.theme.dark')}</SelectItem>
                    <SelectItem value="system">{t('settings.general.theme.system')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('settings.general.theme_desc')}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultLanguage">{t('settings.general.language')}</Label>
                <Select
                  defaultValue={settings?.defaultLanguage as string || 'en'}
                  onValueChange={(value) => handleSaveSetting('defaultLanguage', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="my">မြန်မာ (Burmese)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Health Check Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {t('settings.health.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.health.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="healthCheckInterval">{t('settings.health.interval')}</Label>
                <Input
                  id="healthCheckInterval"
                  type="number"
                  min="1"
                  max="60"
                  defaultValue={settings?.healthCheckIntervalMins as number || 5}
                  onBlur={(e) => handleSaveSetting('healthCheckIntervalMins', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.health.interval_desc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keyExpiryWarning">{t('settings.health.expiry')}</Label>
                <Input
                  id="keyExpiryWarning"
                  type="number"
                  min="1"
                  max="30"
                  defaultValue={settings?.keyExpiryWarningDays as number || 3}
                  onBlur={(e) => handleSaveSetting('keyExpiryWarningDays', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.health.expiry_desc')}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trafficWarning">{t('settings.health.traffic')}</Label>
                <Input
                  id="trafficWarning"
                  type="number"
                  min="50"
                  max="99"
                  defaultValue={settings?.trafficWarningPercent as number || 80}
                  onBlur={(e) => handleSaveSetting('trafficWarningPercent', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.health.traffic_desc')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backup & Restore */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              {t('settings.backup.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.backup.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Button onClick={handleCreateBackup} disabled={createBackupMutation.isPending}>
                {createBackupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                {t('settings.backup.create')}
              </Button>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm text-muted-foreground">
                <div className="col-span-6">{t('settings.backup.filename')}</div>
                <div className="col-span-3">{t('settings.backup.size')}</div>
                <div className="col-span-3 text-right">{t('settings.backup.actions')}</div>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {backups?.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {t('settings.backup.empty')}
                  </div>
                ) : (
                  backups?.map((backup) => (
                    <div key={backup.filename} className="grid grid-cols-12 gap-4 p-4 border-b last:border-0 items-center hover:bg-muted/50">
                      <div className="col-span-6 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{backup.filename}</span>
                      </div>
                      <div className="col-span-3 text-sm text-muted-foreground">
                        {Math.round(backup.size / 1024)} KB
                      </div>
                      <div className="col-span-3 flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownloadBackup(backup.filename)}
                          title={t('settings.backup.download')}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRestoreBackup(backup.filename)}
                          title={t('settings.backup.restore')}
                          disabled={restoreBackupMutation.isPending}
                        >
                          <RefreshCw className={`w-4 h-4 ${restoreBackupMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteBackup(backup.filename)}
                          title={t('settings.backup.delete')}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              {t('settings.notifications.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.notifications.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.notifications.info')}{' '}
              <a href="/dashboard/notifications" className="text-primary hover:underline">
                {t('settings.notifications.link')}
              </a>{' '}
              {t('settings.notifications.section')}
            </p>

            <div className="flex items-center gap-4">
              <Button variant="outline" asChild>
                <a href="/dashboard/notifications">
                  <Bell className="w-4 h-4 mr-2" />
                  {t('settings.notifications.btn')}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Telegram Bot Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              {t('settings.telegram.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.telegram.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bot Token */}
            <div className="space-y-2">
              <Label htmlFor="botToken">{t('settings.telegram.token')}</Label>
              <div className="flex gap-2">
                <Input
                  id="botToken"
                  type="password"
                  placeholder={t('settings.telegram.token_placeholder')}
                  defaultValue={telegramSettings?.botToken || ''}
                  onChange={(e) => setBotToken(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => testConnectionMutation.mutate({ botToken: botToken || telegramSettings?.botToken || '' })}
                  disabled={testConnectionMutation.isPending || (!botToken && !telegramSettings?.botToken)}
                >
                  {testConnectionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('settings.telegram.test')
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.telegram.help')}{' '}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  @BotFather
                </a>
              </p>
            </div>

            {/* Admin Chat IDs */}
            <div className="space-y-2">
              <Label htmlFor="adminChatIds">{t('settings.telegram.admin_ids')}</Label>
              <Input
                id="adminChatIds"
                placeholder={t('settings.telegram.admin_ids_placeholder')}
                defaultValue={telegramSettings?.adminChatIds?.join(', ') || ''}
                onChange={(e) => setAdminChatIds(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                IDs of users authorized to use admin commands like /sysinfo and /backup
              </p>
            </div>

            {/* Webhook Status */}
            <div className="space-y-2">
              <Label>{t('settings.telegram.webhook_status')}</Label>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                {webhookInfo?.webhookSet ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm">{t('settings.telegram.webhook_active')}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm">{t('settings.telegram.webhook_inactive')}</span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast({ title: t('settings.toast.copied'), description: t('settings.toast.copied_desc') });
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWebhookMutation.mutate({ webhookUrl })}
                  disabled={setWebhookMutation.isPending || !telegramSettings?.botToken}
                >
                  {setWebhookMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {t('settings.telegram.set_webhook')}
                </Button>
                {webhookInfo?.webhookSet && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteWebhookMutation.mutate()}
                    disabled={deleteWebhookMutation.isPending}
                  >
                    {t('settings.telegram.remove_webhook')}
                  </Button>
                )}
              </div>
            </div>

            {/* Welcome Message */}
            <div className="space-y-2">
              <Label htmlFor="welcomeMessage">{t('settings.telegram.welcome')}</Label>
              <Input
                id="welcomeMessage"
                placeholder={t('settings.telegram.welcome_placeholder')}
                defaultValue={telegramSettings?.welcomeMessage || ''}
                onChange={(e) => setWelcomeMessage(e.target.value)}
              />
            </div>

            {/* Key Not Found Message */}
            <div className="space-y-2">
              <Label htmlFor="keyNotFoundMessage">{t('settings.telegram.not_found')}</Label>
              <Input
                id="keyNotFoundMessage"
                placeholder={t('settings.telegram.not_found_placeholder')}
                defaultValue={telegramSettings?.keyNotFoundMessage || ''}
                onChange={(e) => setKeyNotFoundMessage(e.target.value)}
              />
            </div>

            {/* Save Button */}
            <Button
              onClick={handleSaveTelegram}
              disabled={updateTelegramMutation.isPending}
            >
              {updateTelegramMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {t('settings.telegram.save')}
            </Button>
          </CardContent>
        </Card>

        {/* Account Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              {t('settings.security.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.security.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-w-md">
              {currentUser && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-6">
                  <User className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{currentUser.username}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentUser.email || 'No email set'} • {currentUser.role}
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t('settings.security.current')}</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('settings.security.current_placeholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t('settings.security.new')}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('settings.security.new_placeholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('settings.security.confirm')}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('settings.security.confirm_placeholder')}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                >
                  {passwordMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {t('settings.security.change_btn')}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* About Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              {t('settings.about.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">{t('settings.about.version')}</span>
                <span className="font-mono">1.0.0</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">{t('settings.about.author')}</span>
                <a
                  href="https://github.com/sankahchan"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  sankahchan
                </a>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">{t('settings.about.repo')}</span>
                <a
                  href="https://github.com/sankahchan/atomic-ui"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">{t('settings.about.license')}</span>
                <span>MIT</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
