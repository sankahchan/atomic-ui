import {
  ArrowRightLeft,
  Bell,
  Flame,
  FileText,
  Key,
  KeyRound,
  LayoutDashboard,
  Rocket,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';

export const primaryDashboardNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { href: '/dashboard/servers', icon: Server, labelKey: 'nav.servers' },
  { href: '/dashboard/keys', icon: Key, labelKey: 'nav.keys' },
  { href: '/dashboard/dynamic-keys', icon: KeyRound, labelKey: 'nav.dynamic_keys' },
  { href: '/dashboard/settings', icon: Settings, labelKey: 'nav.settings' },
] as const;

export const adminToolNavItems = [
  { href: '/dashboard/incidents', icon: Flame, labelKey: 'nav.incidents', descriptionKey: 'tools.incidents.desc' },
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
