import {
  ArrowRightLeft,
  ActivitySquare,
  Bell,
  Flame,
  FileText,
  Key,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Rocket,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';

export const primaryDashboardNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', mobileLabelKey: 'nav.mobile_dashboard' },
  { href: '/dashboard/servers', icon: Server, labelKey: 'nav.servers', mobileLabelKey: 'nav.mobile_servers' },
  { href: '/dashboard/keys', icon: Key, labelKey: 'nav.keys', mobileLabelKey: 'nav.mobile_keys' },
  { href: '/dashboard/dynamic-keys', icon: KeyRound, labelKey: 'nav.dynamic_keys', mobileLabelKey: 'nav.mobile_dynamic_keys' },
  { href: '/dashboard/settings', icon: Settings, labelKey: 'nav.settings', mobileLabelKey: 'nav.mobile_settings' },
] as const;

export const adminToolNavItems = [
  { href: '/dashboard/incidents', icon: Flame, labelKey: 'nav.incidents', descriptionKey: 'tools.incidents.desc' },
  { href: '/dashboard/support', icon: MessageSquare, labelKey: 'nav.support', descriptionKey: 'tools.support.desc' },
  { href: '/dashboard/jobs', icon: ActivitySquare, labelKey: 'nav.jobs', descriptionKey: 'tools.jobs.desc' },
  { href: '/dashboard/monitoring', icon: Bell, labelKey: 'nav.monitoring', descriptionKey: 'tools.monitoring.desc' },
  { href: '/dashboard/reports', icon: FileText, labelKey: 'nav.reports', descriptionKey: 'tools.reports.desc' },
  { href: '/dashboard/audit', icon: ScrollText, labelKey: 'nav.audit', descriptionKey: 'tools.audit.desc' },
  { href: '/dashboard/sessions', icon: Smartphone, labelKey: 'nav.sessions', descriptionKey: 'tools.sessions.desc' },
  { href: '/dashboard/migration', icon: ArrowRightLeft, labelKey: 'nav.migration', descriptionKey: 'tools.migration.desc' },
  { href: '/dashboard/onboarding', icon: Rocket, labelKey: 'nav.onboarding', descriptionKey: 'tools.onboarding.desc' },
] as const;

export const settingsShortcutItems = [
  { href: '/dashboard/settings/account-security', icon: ShieldCheck, labelKey: 'nav.security', descriptionKey: 'settings.hub.security_desc' },
  { href: '/dashboard/users', icon: User, labelKey: 'nav.users', descriptionKey: 'settings.hub.users_desc' },
  { href: '/dashboard/notifications', icon: Bell, labelKey: 'nav.notifications', descriptionKey: 'settings.hub.notifications_desc' },
] as const;
