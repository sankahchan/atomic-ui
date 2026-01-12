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
  Copy,
  ExternalLink,
} from 'lucide-react';

/**
 * SettingsPage Component
 * 
 * The main settings page with multiple configuration sections.
 * Each section is contained in its own card for visual organization.
 */
export default function SettingsPage() {
  const { toast } = useToast();
  
  // Fetch current settings
  const { data: settings, isLoading, refetch } = trpc.settings.getAll.useQuery();
  
  // Get current user
  const { data: currentUser } = trpc.auth.me.useQuery();
  
  // Update setting mutation
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Settings saved',
        description: 'Your changes have been saved successfully.',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to save',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Password change mutation
  const passwordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast({
        title: 'Password changed',
        description: 'Your password has been updated. Please log in again.',
      });
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      toast({
        title: 'Failed to change password',
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
  const [isTelegramEnabled, setIsTelegramEnabled] = useState(false);

  // Telegram bot queries and mutations
  const { data: telegramSettings, refetch: refetchTelegram } = trpc.telegramBot.getSettings.useQuery();
  const { data: webhookInfo, refetch: refetchWebhook } = trpc.telegramBot.getWebhookInfo.useQuery();

  const testConnectionMutation = trpc.telegramBot.testConnection.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Connection successful',
        description: `Connected to @${data.botUsername}`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Connection failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateTelegramMutation = trpc.telegramBot.updateSettings.useMutation({
    onSuccess: () => {
      toast({
        title: 'Telegram settings saved',
        description: 'Your Telegram bot settings have been updated.',
      });
      refetchTelegram();
    },
    onError: (error) => {
      toast({
        title: 'Failed to save',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setWebhookMutation = trpc.telegramBot.setWebhook.useMutation({
    onSuccess: () => {
      toast({
        title: 'Webhook set',
        description: 'Telegram webhook has been configured.',
      });
      refetchWebhook();
    },
    onError: (error) => {
      toast({
        title: 'Failed to set webhook',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteWebhookMutation = trpc.telegramBot.deleteWebhook.useMutation({
    onSuccess: () => {
      toast({
        title: 'Webhook deleted',
        description: 'Telegram webhook has been removed.',
      });
      refetchWebhook();
    },
  });

  // Initialize telegram form when settings load
  useState(() => {
    if (telegramSettings) {
      setBotToken(telegramSettings.botToken || '');
      setWelcomeMessage(telegramSettings.welcomeMessage || '');
      setKeyNotFoundMessage(telegramSettings.keyNotFoundMessage || '');
      setIsTelegramEnabled(telegramSettings.isEnabled || false);
    }
  });

  const handleSaveTelegram = () => {
    updateTelegramMutation.mutate({
      botToken: botToken || telegramSettings?.botToken || '',
      welcomeMessage: welcomeMessage || telegramSettings?.welcomeMessage || '',
      keyNotFoundMessage: keyNotFoundMessage || telegramSettings?.keyNotFoundMessage || '',
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
        title: 'Passwords do not match',
        description: 'Please make sure your new passwords match.',
        variant: 'destructive',
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
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
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your Atomic-UI installation and preferences.
        </p>
      </div>

      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              General Settings
            </CardTitle>
            <CardDescription>
              Basic application configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="siteName">Site Name</Label>
                <Input
                  id="siteName"
                  defaultValue={settings?.siteName as string || 'Atomic-UI'}
                  onBlur={(e) => handleSaveSetting('siteName', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The name displayed in the browser title and header
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="defaultTheme">Default Theme</Label>
                <Select
                  defaultValue={settings?.defaultTheme as string || 'dark'}
                  onValueChange={(value) => handleSaveSetting('defaultTheme', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Default color theme for new users
                </p>
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultLanguage">Default Language</Label>
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
              Health Monitoring
            </CardTitle>
            <CardDescription>
              Configure server health check behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="healthCheckInterval">Check Interval (minutes)</Label>
                <Input
                  id="healthCheckInterval"
                  type="number"
                  min="1"
                  max="60"
                  defaultValue={settings?.healthCheckIntervalMins as number || 5}
                  onBlur={(e) => handleSaveSetting('healthCheckIntervalMins', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  How often to check server health (1-60 minutes)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="keyExpiryWarning">Expiry Warning (days)</Label>
                <Input
                  id="keyExpiryWarning"
                  type="number"
                  min="1"
                  max="30"
                  defaultValue={settings?.keyExpiryWarningDays as number || 3}
                  onBlur={(e) => handleSaveSetting('keyExpiryWarningDays', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Days before expiry to show warning
                </p>
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trafficWarning">Traffic Warning (%)</Label>
                <Input
                  id="trafficWarning"
                  type="number"
                  min="50"
                  max="99"
                  defaultValue={settings?.trafficWarningPercent as number || 80}
                  onBlur={(e) => handleSaveSetting('trafficWarningPercent', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Usage percentage to trigger warning
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>
              Configure alert and notification settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Configure notification channels in the{' '}
              <a href="/dashboard/notifications" className="text-primary hover:underline">
                Notifications
              </a>{' '}
              section.
            </p>

            <div className="flex items-center gap-4">
              <Button variant="outline" asChild>
                <a href="/dashboard/notifications">
                  <Bell className="w-4 h-4 mr-2" />
                  Configure Notifications
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
              Telegram Bot
            </CardTitle>
            <CardDescription>
              Allow users to get their VPN keys via Telegram bot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bot Token */}
            <div className="space-y-2">
              <Label htmlFor="botToken">Bot Token</Label>
              <div className="flex gap-2">
                <Input
                  id="botToken"
                  type="password"
                  placeholder="Enter your Telegram bot token"
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
                    'Test'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get a token from{' '}
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

            {/* Webhook Status */}
            <div className="space-y-2">
              <Label>Webhook Status</Label>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                {webhookInfo?.webhookSet ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Webhook active</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm">Webhook not set</span>
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
                    toast({ title: 'Copied!', description: 'Webhook URL copied to clipboard.' });
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
                  Set Webhook
                </Button>
                {webhookInfo?.webhookSet && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteWebhookMutation.mutate()}
                    disabled={deleteWebhookMutation.isPending}
                  >
                    Remove Webhook
                  </Button>
                )}
              </div>
            </div>

            {/* Welcome Message */}
            <div className="space-y-2">
              <Label htmlFor="welcomeMessage">Welcome Message</Label>
              <Input
                id="welcomeMessage"
                placeholder="Welcome! Send /mykey to get your VPN key."
                defaultValue={telegramSettings?.welcomeMessage || ''}
                onChange={(e) => setWelcomeMessage(e.target.value)}
              />
            </div>

            {/* Key Not Found Message */}
            <div className="space-y-2">
              <Label htmlFor="keyNotFoundMessage">Key Not Found Message</Label>
              <Input
                id="keyNotFoundMessage"
                placeholder="No key found for your account."
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
              Save Telegram Settings
            </Button>
          </CardContent>
        </Card>

        {/* Account Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Account Security
            </CardTitle>
            <CardDescription>
              Change your password and manage security settings
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
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter your new password"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  disabled={passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                >
                  {passwordMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Change Password
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
              About Atomic-UI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">1.0.0</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Author</span>
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
                <span className="text-muted-foreground">Repository</span>
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
                <span className="text-muted-foreground">License</span>
                <span>MIT</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
