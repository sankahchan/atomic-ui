'use client';

/**
 * Settings Page - Redesigned with Collapsible Sections
 *
 * All settings sections are visible on one screen as tappable cards.
 * Tap a section to expand and see its details.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { BackButton } from '@/components/ui/back-button';
import { cn } from '@/lib/utils';
import {
  Bell,
  Shield,
  Globe,
  Save,
  Loader2,
  RefreshCw,
  User,
  Key,
  Download,
  Trash2,
  FileText,
  History,
  ChevronRight,
  Info,
  Palette,
} from 'lucide-react';
import Link from 'next/link';

// Section type for the collapsible cards
type SectionId = 'general' | 'health' | 'backup' | 'notifications' | 'security' | 'about' | 'subscription' | null;

/**
 * Collapsible Section Card
 */
function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  isOpen,
  onToggle,
  children,
}: {
  id: SectionId;
  icon: React.ElementType;
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('transition-all duration-200', isOpen && 'ring-1 ring-primary/20')}>
      <CardHeader
        className="cursor-pointer select-none py-4"
        onClick={() => onToggle(isOpen ? null : id)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              isOpen ? 'bg-primary/10' : 'bg-muted'
            )}>
              <Icon className={cn('w-5 h-5', isOpen ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <ChevronRight className={cn(
            'w-5 h-5 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-90'
          )} />
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="pt-0 pb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="border-t pt-4">
            {children}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const [openSection, setOpenSection] = useState<SectionId>(null);

  // Fetch current settings
  const { data: settings, isLoading, refetch } = trpc.settings.getAll.useQuery();
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

  // Password/Profile change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (currentUser?.email) {
      setUsername(currentUser.email);
    }
  }, [currentUser?.email]);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      toast({
        title: t('settings.toast.password_mismatch'),
        description: t('settings.toast.password_mismatch_desc'),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword && newPassword.length < 6) {
      toast({
        title: t('settings.toast.password_short'),
        description: t('settings.toast.password_short_desc'),
        variant: 'destructive',
      });
      return;
    }

    passwordMutation.mutate({
      currentPassword,
      newPassword: newPassword || undefined,
      newUsername: username !== currentUser?.email ? username : undefined,
    });
  };

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

  const handleSaveSetting = (key: string, value: unknown) => {
    updateMutation.mutate({ key, value });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="space-y-1">
        <BackButton href="/dashboard" label={t('nav.dashboard')} />
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('settings.subtitle')}
        </p>
      </div>

      {/* Collapsible Sections */}
      <div className="space-y-2">
        {/* General Settings */}
        <SectionCard
          id="general"
          icon={Globe}
          title={t('settings.general.title')}
          description={t('settings.general.desc')}
          isOpen={openSection === 'general'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="space-y-2">
              <Label htmlFor="defaultLanguage">{t('settings.general.language')}</Label>
              <Select
                defaultValue={settings?.defaultLanguage as string || 'en'}
                onValueChange={(value) => handleSaveSetting('defaultLanguage', value)}
              >
                <SelectTrigger className="sm:w-1/2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="my">မြန်မာ (Burmese)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {/* Subscription Page Customization */}
        <SectionCard
          id="subscription"
          icon={Palette}
          title="Subscription Page"
          description="Customize the user subscription page appearance"
          isOpen={openSection === 'subscription'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Customize how your users see their subscription pages - including themes, branding, logos, and more.
            </p>
            <Link href="/settings">
              <Button variant="outline" size="sm">
                <Palette className="w-4 h-4 mr-2" />
                Open Subscription Settings
              </Button>
            </Link>
          </div>
        </SectionCard>

        {/* Health Monitoring */}
        <SectionCard
          id="health"
          icon={Shield}
          title={t('settings.health.title')}
          description={t('settings.health.desc')}
          isOpen={openSection === 'health'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="space-y-2">
              <Label htmlFor="trafficWarning">{t('settings.health.traffic')}</Label>
              <Input
                id="trafficWarning"
                type="number"
                min="50"
                max="99"
                className="sm:w-1/2"
                defaultValue={settings?.trafficWarningPercent as number || 80}
                onBlur={(e) => handleSaveSetting('trafficWarningPercent', parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.health.traffic_desc')}
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Backup & Restore */}
        <SectionCard
          id="backup"
          icon={History}
          title={t('settings.backup.title')}
          description={t('settings.backup.desc')}
          isOpen={openSection === 'backup'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <Button onClick={handleCreateBackup} disabled={createBackupMutation.isPending} size="sm">
              {createBackupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              {t('settings.backup.create')}
            </Button>

            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
                <div className="col-span-6">{t('settings.backup.filename')}</div>
                <div className="col-span-3">{t('settings.backup.size')}</div>
                <div className="col-span-3 text-right">{t('settings.backup.actions')}</div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {backups?.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    {t('settings.backup.empty')}
                  </div>
                ) : (
                  backups?.map((backup) => (
                    <div key={backup.filename} className="grid grid-cols-12 gap-2 p-3 border-t items-center hover:bg-muted/30 text-sm">
                      <div className="col-span-6 flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono text-xs truncate">{backup.filename}</span>
                      </div>
                      <div className="col-span-3 text-xs text-muted-foreground">
                        {Math.round(backup.size / 1024)} KB
                      </div>
                      <div className="col-span-3 flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDownloadBackup(backup.filename)}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleRestoreBackup(backup.filename)}
                          disabled={restoreBackupMutation.isPending}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${restoreBackupMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteBackup(backup.filename)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Notifications */}
        <SectionCard
          id="notifications"
          icon={Bell}
          title={t('settings.notifications.title')}
          description={t('settings.notifications.desc')}
          isOpen={openSection === 'notifications'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.notifications.info')}
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/notifications">
                <Bell className="w-4 h-4 mr-2" />
                {t('settings.notifications.btn')}
              </a>
            </Button>
          </div>
        </SectionCard>

        {/* Account Security */}
        <SectionCard
          id="security"
          icon={Key}
          title={t('settings.security.title')}
          description={t('settings.security.desc')}
          isOpen={openSection === 'security'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            {currentUser && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <User className="w-6 h-6 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{currentUser.email}</p>
                  <p className="text-xs text-muted-foreground">{currentUser.role}</p>
                </div>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('settings.security.username') || 'Username'}</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                />
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">{t('settings.security.change_password') || 'Change Password'}</p>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">{t('settings.security.current')}</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t('settings.security.current_placeholder')}
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
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
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={passwordMutation.isPending || !currentPassword || (!newPassword && username === currentUser?.email)}
              >
                {passwordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('settings.security.change_btn')}
              </Button>
            </form>
          </div>
        </SectionCard>

        {/* About */}
        <SectionCard
          id="about"
          icon={Info}
          title={t('settings.about.title')}
          description="Version and credits"
          isOpen={openSection === 'about'}
          onToggle={setOpenSection}
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-muted-foreground">{t('settings.about.version')}</span>
              <span className="font-mono">1.0.0</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
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
            <div className="flex items-center justify-between py-2 border-b">
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
        </SectionCard>
      </div>
    </div>
  );
}
