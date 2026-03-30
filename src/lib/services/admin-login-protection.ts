import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import ipRangeCheck from 'ip-range-check';
import { z } from 'zod';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { getTelegramConfig, sendAdminAlert } from '@/lib/services/telegram-bot';
import { getGeoIpCountry } from '@/lib/security';

export const ADMIN_LOGIN_PROTECTION_SETTINGS_KEY = 'admin_login_protection';
export const ADMIN_LOGIN_FAIL2BAN_LOG =
  process.env.ADMIN_LOGIN_FAIL2BAN_LOG || '/var/log/atomic-ui/admin-login.log';
export const ADMIN_LOGIN_FAIL2BAN_JAIL =
  process.env.ADMIN_LOGIN_FAIL2BAN_JAIL || 'atomic-ui-auth-login';
export const GENERIC_ADMIN_LOGIN_BLOCK_MESSAGE = 'Too many failed attempts. Try again later.';
export const ADMIN_LOGIN_INCIDENT_WORKFLOW_SETTINGS_KEY = 'admin_login_incident_workflow';
export const ADMIN_LOGIN_INCIDENT_DIGEST_STATE_KEY = 'admin_login_incident_digest_last_run';
export const ADMIN_LOGIN_ALERT_SUPPRESSIONS_SETTINGS_KEY = 'admin_login_alert_suppressions';
export const ADMIN_LOGIN_SAVED_VIEWS_SETTINGS_KEY = 'admin_login_saved_views';
export const ADMIN_LOGIN_PENDING_APPROVALS_SETTINGS_KEY = 'admin_login_pending_approvals';
const REPEATED_OFFENDER_ALERT_COOLDOWN_MS = 6 * 60 * 60_000;
const DEFAULT_REPEAT_BAN_LOOKBACK_DAYS = 7;
const DEFAULT_REPEAT_BAN_DURATION_MINUTES = 48 * 60;
const ADMIN_LOGIN_INCIDENT_DIGEST_HOUR = 9;
const ADMIN_LOGIN_INCIDENT_DIGEST_MINUTE = 30;
const ADMIN_LOGIN_INCIDENT_DIGEST_LOOKBACK_HOURS = 24;
const ADMIN_LOGIN_APPROVAL_DURATION_MINUTES = 30;
const IP_ENRICHMENT_TTL_MS = 6 * 60 * 60_000;
const ADMIN_LOGIN_RISK_LEVELS = ['LOW', 'ELEVATED', 'HIGH', 'CRITICAL'] as const;
const ADMIN_LOGIN_CHALLENGE_MODES = ['OFF', 'REQUIRE_2FA', 'BLOCK'] as const;
const ADMIN_LOGIN_APPROVAL_REQUIREMENTS = ['NEW_DEVICE', 'NEW_COUNTRY', 'EITHER', 'BOTH'] as const;
const ADMIN_LOGIN_ALERT_EVENT_TYPES = [
  'threshold',
  'lock',
  'ban',
  'repeatedOffender',
  'unban',
  'fail2banUnavailable',
  'newDevice',
  'newCountry',
] as const;

const adminLoginRiskLevelSchema = z.enum(ADMIN_LOGIN_RISK_LEVELS);
const adminLoginChallengeModeSchema = z.enum(ADMIN_LOGIN_CHALLENGE_MODES);
const adminLoginApprovalRequirementSchema = z.enum(ADMIN_LOGIN_APPROVAL_REQUIREMENTS);
const adminLoginIncidentWorkflowStatusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);
const adminLoginAlertSuppressionScopeSchema = z.enum(['IP', 'INCIDENT']);
const adminLoginApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'COMPLETED',
] as const);
const adminLoginAlertRuleSchema = z.object({
  enabled: z.boolean().default(true),
  cooldownMinutes: z.number().int().min(1).max(10080).default(60),
  minimumReputationLevel: adminLoginRiskLevelSchema.default('LOW'),
});
const adminLoginAlertRulesSchema = z.object({
  threshold: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 30,
    minimumReputationLevel: 'ELEVATED',
  }),
  lock: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 60,
    minimumReputationLevel: 'ELEVATED',
  }),
  ban: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 60,
    minimumReputationLevel: 'HIGH',
  }),
  repeatedOffender: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 360,
    minimumReputationLevel: 'HIGH',
  }),
  unban: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 60,
    minimumReputationLevel: 'LOW',
  }),
  fail2banUnavailable: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 360,
    minimumReputationLevel: 'LOW',
  }),
  newDevice: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 720,
    minimumReputationLevel: 'LOW',
  }),
  newCountry: adminLoginAlertRuleSchema.default({
    enabled: true,
    cooldownMinutes: 1440,
    minimumReputationLevel: 'LOW',
  }),
});

const adminLoginProtectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  softLockThreshold: z.number().int().min(1).max(100).default(5),
  softLockWindowMinutes: z.number().int().min(1).max(1440).default(10),
  softLockDurationMinutes: z.number().int().min(1).max(10080).default(15),
  banThreshold: z.number().int().min(1).max(200).default(8),
  banWindowMinutes: z.number().int().min(1).max(1440).default(10),
  banDurationMinutes: z.number().int().min(1).max(10080).default(720),
  telegramAlertEnabled: z.boolean().default(true),
  alertOnRepeatedOffender: z.boolean().default(true),
  repeatedOffenderThreshold: z.number().int().min(1).max(500).default(12),
  alertOnUnban: z.boolean().default(true),
  fail2banLogEnabled: z.boolean().default(true),
  repeatedBanLookbackDays: z.number().int().min(1).max(365).default(DEFAULT_REPEAT_BAN_LOOKBACK_DAYS),
  repeatedBanDurationMinutes: z.number().int().min(1).max(43200).default(DEFAULT_REPEAT_BAN_DURATION_MINUTES),
  challengeMode: adminLoginChallengeModeSchema.default('OFF'),
  challengeMinimumReputationLevel: adminLoginRiskLevelSchema.default('HIGH'),
  unusualLoginApprovalEnabled: z.boolean().default(false),
  unusualLoginApprovalRequireFor: adminLoginApprovalRequirementSchema.default('EITHER'),
  unusualLoginApprovalDurationMinutes: z.number().int().min(5).max(1440).default(ADMIN_LOGIN_APPROVAL_DURATION_MINUTES),
  incidentDigestEnabled: z.boolean().default(false),
  incidentDigestHour: z.number().int().min(0).max(23).default(ADMIN_LOGIN_INCIDENT_DIGEST_HOUR),
  incidentDigestMinute: z.number().int().min(0).max(59).default(ADMIN_LOGIN_INCIDENT_DIGEST_MINUTE),
  incidentDigestLookbackHours: z.number().int().min(1).max(168).default(ADMIN_LOGIN_INCIDENT_DIGEST_LOOKBACK_HOURS),
  alertRules: adminLoginAlertRulesSchema.default({}),
  trustedIpRanges: z.array(z.string()).default([]),
});

const adminLoginIncidentWorkflowEntrySchema = z.object({
  status: adminLoginIncidentWorkflowStatusSchema.default('OPEN'),
  notes: z.string().default(''),
  assignedToEmail: z.string().nullable().optional(),
  assignedAt: z.string().nullable().optional(),
  assignedByEmail: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  acknowledgedByEmail: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  resolvedByEmail: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  updatedByEmail: z.string().nullable().optional(),
});

const adminLoginIncidentWorkflowMapSchema = z.record(z.string(), adminLoginIncidentWorkflowEntrySchema);
const adminLoginAlertSuppressionEntrySchema = z.object({
  id: z.string(),
  scopeType: adminLoginAlertSuppressionScopeSchema,
  scopeValue: z.string(),
  reason: z.string().default(''),
  createdAt: z.string(),
  createdByEmail: z.string(),
  expiresAt: z.string(),
});
const adminLoginAlertSuppressionsSchema = z.array(adminLoginAlertSuppressionEntrySchema);
const adminLoginSavedViewFiltersSchema = z.object({
  search: z.string().default(''),
  status: z.enum(['ALL', 'ACTIVE', 'CONTAINED', 'RESOLVED']).default('ALL'),
  workflowStatus: z.enum(['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED']).default('ALL'),
  severity: z.enum(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('ALL'),
  country: z.string().default('ALL'),
  assignee: z.string().default('ALL'),
  reputation: z.enum(['ALL', 'LOW', 'ELEVATED', 'HIGH', 'CRITICAL']).default('ALL'),
  timeWindowHours: z.number().int().min(1).max(720).nullable().default(24),
});
const adminLoginSavedViewSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdByEmail: z.string(),
  filters: adminLoginSavedViewFiltersSchema,
});
const adminLoginSavedViewsSchema = z.array(adminLoginSavedViewSchema);
const adminLoginPendingApprovalEntrySchema = z.object({
  id: z.string(),
  tempToken: z.string(),
  userId: z.string(),
  email: z.string(),
  role: z.string(),
  ip: z.string(),
  host: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  deviceFingerprint: z.string().nullable().optional(),
  deviceLabel: z.string().default('Unknown device'),
  browser: z.string().default('Unknown browser'),
  os: z.string().default('Unknown OS'),
  deviceType: z.string().default('Unknown'),
  via2FA: z.boolean().default(false),
  method: z.string().nullable().optional(),
  newDevice: z.boolean().default(false),
  newCountry: z.boolean().default(false),
  status: adminLoginApprovalStatusSchema.default('PENDING'),
  createdAt: z.string(),
  expiresAt: z.string(),
  approvedAt: z.string().nullable().optional(),
  approvedByEmail: z.string().nullable().optional(),
  rejectedAt: z.string().nullable().optional(),
  rejectedByEmail: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});
const adminLoginPendingApprovalsSchema = z.array(adminLoginPendingApprovalEntrySchema);

export type AdminLoginProtectionConfig = z.infer<typeof adminLoginProtectionConfigSchema>;
export type AdminLoginIncidentWorkflowStatus = z.infer<typeof adminLoginIncidentWorkflowStatusSchema>;
type AdminLoginIncidentWorkflowEntry = z.infer<typeof adminLoginIncidentWorkflowEntrySchema>;
export type AdminLoginAlertSuppressionScope = z.infer<typeof adminLoginAlertSuppressionScopeSchema>;
export type AdminLoginApprovalRequirement = z.infer<typeof adminLoginApprovalRequirementSchema>;
export type AdminLoginApprovalStatus = z.infer<typeof adminLoginApprovalStatusSchema>;
type AdminLoginAlertSuppressionEntry = z.infer<typeof adminLoginAlertSuppressionEntrySchema>;
export type AdminLoginSavedView = z.infer<typeof adminLoginSavedViewSchema>;
type AdminLoginPendingApprovalEntry = z.infer<typeof adminLoginPendingApprovalEntrySchema>;

export type AdminLoginRestrictionInfo = {
  id: string;
  ip: string;
  restrictionType: string;
  attemptedEmail: string | null;
  failureCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  expiresAt: Date;
  isActive: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  lastAlertSentAt: Date | null;
  lastFail2banEventAt: Date | null;
};
export type AdminLoginRiskLevel = z.infer<typeof adminLoginRiskLevelSchema>;
export type AdminLoginChallengeMode = z.infer<typeof adminLoginChallengeModeSchema>;
export type AdminLoginAlertEventType = (typeof ADMIN_LOGIN_ALERT_EVENT_TYPES)[number];
export type AdminLoginAlertRule = z.infer<typeof adminLoginAlertRuleSchema>;
export type AdminLoginAlertRules = z.infer<typeof adminLoginAlertRulesSchema>;

type RecordFailedAdminLoginInput = {
  ip: string | null | undefined;
  email: string;
  host?: string | null | undefined;
  path?: string | null | undefined;
};

type Fail2banStatus = {
  available: boolean;
  jail: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
  error: string | null;
};

type FailureSnapshot = {
  ipCount: number;
  pairCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
};

type AdminLoginAuditEvent = {
  id: string;
  action: string;
  ip: string | null;
  details: string | null;
  createdAt: Date;
};

type ParsedAuditDetails = {
  email: string | null;
  role: string | null;
  host: string | null;
  path: string | null;
  restrictionType: string | null;
  countryCode: string | null;
  deviceFingerprint: string | null;
  deviceLabel: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  via2FA: boolean;
  method: string | null;
  newDevice: boolean;
  newCountry: boolean;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
};

type RecordSuccessfulAdminLoginInput = {
  userId: string;
  email: string;
  role: string;
  ip: string | null | undefined;
  userAgent?: string | null | undefined;
  host?: string | null | undefined;
  path?: string | null | undefined;
  via2FA?: boolean;
  method?: string | null;
};

type AdminLoginSignInEntry = {
  id: string;
  userId: string | null;
  email: string | null;
  role: string | null;
  ip: string | null;
  countryCode: string | null;
  deviceFingerprint: string | null;
  deviceLabel: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  host: string | null;
  path: string | null;
  via2FA: boolean;
  method: string | null;
  newDevice: boolean;
  newCountry: boolean;
  createdAt: Date;
};

type AdminLoginIncidentStatus = 'ACTIVE' | 'CONTAINED' | 'RESOLVED';
type AdminLoginIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AdminLoginReputationLevel = 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

type AdminLoginIpEnrichment = {
  reverseDns: string[];
  asn: string | null;
  isp: string | null;
  organization: string | null;
  source: string | null;
};

type AdminLoginAlertSuppression = {
  id: string;
  scopeType: AdminLoginAlertSuppressionScope;
  scopeValue: string;
  reason: string | null;
  createdAt: Date;
  createdByEmail: string;
  expiresAt: Date;
  remainingMinutes: number;
};

type AdminLoginApprovalAssessment = {
  required: boolean;
  normalizedIp: string | null;
  countryCode: string | null;
  deviceFingerprint: string;
  deviceLabel: string;
  browser: string;
  os: string;
  deviceType: string;
  newDevice: boolean;
  newCountry: boolean;
};

type AdminLoginPendingApproval = {
  id: string;
  tempToken: string;
  userId: string;
  email: string;
  role: string;
  ip: string;
  host: string | null;
  path: string | null;
  countryCode: string | null;
  deviceFingerprint: string | null;
  deviceLabel: string;
  browser: string;
  os: string;
  deviceType: string;
  via2FA: boolean;
  method: string | null;
  newDevice: boolean;
  newCountry: boolean;
  status: AdminLoginApprovalStatus;
  createdAt: Date;
  expiresAt: Date;
  approvedAt: Date | null;
  approvedByEmail: string | null;
  rejectedAt: Date | null;
  rejectedByEmail: string | null;
  rejectionReason: string | null;
  completedAt: Date | null;
  remainingMinutes: number;
};

type AdminLoginIncident = {
  id: string;
  ip: string;
  countryCode: string | null;
  startedAt: Date;
  endedAt: Date;
  failureCount: number;
  lockCount: number;
  banCount: number;
  repeatedOffenderCount: number;
  unbanCount: number;
  attemptedEmails: string[];
  hosts: string[];
  paths: string[];
  activeRestrictionType: string | null;
  currentlyBanned: boolean;
  status: AdminLoginIncidentStatus;
  severity: AdminLoginIncidentSeverity;
  summary: string;
  workflowStatus: AdminLoginIncidentWorkflowStatus;
  notes: string | null;
  notesPreview: string | null;
  assignedToEmail: string | null;
  assignedAt: Date | null;
  assignedByEmail: string | null;
  acknowledgedAt: Date | null;
  acknowledgedByEmail: string | null;
  resolvedAt: Date | null;
  resolvedByEmail: string | null;
  enrichment: AdminLoginIpEnrichment;
  alertSuppression: AdminLoginAlertSuppression | null;
};

type RawAdminLoginIncident = Omit<
  AdminLoginIncident,
  | 'countryCode'
  | 'workflowStatus'
  | 'notes'
  | 'notesPreview'
  | 'assignedToEmail'
  | 'assignedAt'
  | 'assignedByEmail'
  | 'acknowledgedAt'
  | 'acknowledgedByEmail'
  | 'resolvedAt'
  | 'resolvedByEmail'
  | 'enrichment'
  | 'alertSuppression'
>;

type AdminLoginIpReputation = {
  ip: string;
  countryCode: string | null;
  score: number;
  level: AdminLoginReputationLevel;
  failures24h: number;
  failures7d: number;
  failures30d: number;
  bans7d: number;
  locks7d: number;
  repeatedAlerts30d: number;
  incidents7d: number;
  attemptedEmails: string[];
  topEmail: string | null;
  lastSeenAt: Date;
  currentlyRestricted: boolean;
  currentlyBanned: boolean;
  enrichment: AdminLoginIpEnrichment;
  alertSuppression: AdminLoginAlertSuppression | null;
};

type AdminLoginIncidentDetailEvent = {
  id: string;
  action: string;
  label: string;
  createdAt: Date;
  email: string | null;
  host: string | null;
  path: string | null;
  restrictionType: string | null;
  ip: string | null;
  details: string | null;
};

type AssignAdminLoginIncidentInput = {
  incidentId: string;
  actorEmail: string;
  assignedToEmail?: string | null;
  note?: string | null;
};

type AdminLoginIncidentNoteEntry = {
  timestamp: Date | null;
  actorEmail: string | null;
  body: string;
  raw: string;
};

type AdminLoginReputationHistoryPoint = {
  date: string;
  label: string;
  failures: number;
  locks: number;
  bans: number;
  repeatedAlerts: number;
  uniqueIps: number;
  highRiskIps: number;
  peakScore: number;
};

type AdminLoginRiskSnapshot = {
  ip: string;
  score: number;
  level: AdminLoginReputationLevel;
  failures24h: number;
  failures7d: number;
  failures30d: number;
  bans7d: number;
  locks7d: number;
  repeatedAlerts30d: number;
  sameEmailFailures30d: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  currentlyRestricted: boolean;
  currentlyBanned: boolean;
};

type AdminLoginChallengeDecision = {
  mode: 'ALLOW' | 'REQUIRE_2FA' | 'BLOCK';
  score: number;
  level: AdminLoginReputationLevel;
};

type AdminLoginIncidentDigestResult =
  | { skipped: true; reason: string }
  | { skipped: false; incidentCount: number; adminChats: number; lookbackHours: number };

const INCIDENT_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
const REPUTATION_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const INCIDENT_IDLE_GAP_MS = 45 * 60_000;
const INCIDENT_ACTIVE_WINDOW_MS = 30 * 60_000;
const INCIDENT_ACTIONS = [
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGIN_LOCKED',
  'AUTH_LOGIN_BANNED',
  'AUTH_LOGIN_REPEATED_OFFENDER_ALERT',
  'AUTH_LOGIN_UNBANNED',
] as const;

const ipEnrichmentCache = new Map<
  string,
  { expiresAt: number; value: AdminLoginIpEnrichment }
>();

function normalizeIpAddress(rawIp: string | null | undefined): string | null {
  if (!rawIp) {
    return null;
  }

  let ip = rawIp.trim();
  if (!ip) {
    return null;
  }

  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) {
    ip = ip.slice(0, zoneIndex);
  }

  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort) {
    ip = ipv4WithPort[1];
  }

  if (ip === '::1') {
    return '127.0.0.1';
  }

  return isIP(ip) ? ip : null;
}

function isLocalOrPrivateIp(ip: string) {
  return ipRangeCheck(ip, [
    '127.0.0.1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '::1',
    'fc00::/7',
    'fe80::/10',
  ]);
}

function normalizeTrustedIpRanges(values: string[] | null | undefined) {
  return Array.from(new Set(
    (values || [])
      .flatMap((value) => value.split(/[\n,]/))
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

function buildAuditEmailNeedle(email: string) {
  return `"email":${JSON.stringify(email)}`;
}

function buildFailureSnapshot(
  ipCount: number,
  pairCount: number,
  firstSeenAt: Date | null,
  lastSeenAt: Date | null,
): FailureSnapshot {
  return {
    ipCount,
    pairCount,
    firstSeenAt,
    lastSeenAt,
  };
}

function parseAuditDetails(rawValue: string | null | undefined): ParsedAuditDetails {
  if (!rawValue) {
    return {
      email: null,
      role: null,
      host: null,
      path: null,
      restrictionType: null,
      countryCode: null,
      deviceFingerprint: null,
      deviceLabel: null,
      browser: null,
      os: null,
      deviceType: null,
      via2FA: false,
      method: null,
      newDevice: false,
      newCountry: false,
      firstSeenAt: null,
      lastSeenAt: null,
    };
  }

  try {
    const details = JSON.parse(rawValue) as Record<string, unknown>;
    const asDate = (value: unknown) => {
      if (typeof value !== 'string') {
        return null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    return {
      email: typeof details.email === 'string' ? details.email : null,
      role: typeof details.role === 'string' ? details.role : null,
      host: typeof details.host === 'string' ? details.host : null,
      path: typeof details.path === 'string' ? details.path : null,
      restrictionType:
        typeof details.restrictionType === 'string' ? details.restrictionType : null,
      countryCode:
        typeof details.countryCode === 'string' && details.countryCode.trim()
          ? details.countryCode
          : null,
      deviceFingerprint:
        typeof details.deviceFingerprint === 'string' && details.deviceFingerprint.trim()
          ? details.deviceFingerprint
          : null,
      deviceLabel:
        typeof details.deviceLabel === 'string' && details.deviceLabel.trim()
          ? details.deviceLabel
          : null,
      browser:
        typeof details.browser === 'string' && details.browser.trim() ? details.browser : null,
      os: typeof details.os === 'string' && details.os.trim() ? details.os : null,
      deviceType:
        typeof details.deviceType === 'string' && details.deviceType.trim()
          ? details.deviceType
          : null,
      via2FA: details.via2FA === true,
      method: typeof details.method === 'string' ? details.method : null,
      newDevice: details.newDevice === true,
      newCountry: details.newCountry === true,
      firstSeenAt: asDate(details.firstSeenAt),
      lastSeenAt: asDate(details.lastSeenAt ?? details.lastAttemptAt),
    };
  } catch {
    return {
      email: null,
      role: null,
      host: null,
      path: null,
      restrictionType: null,
      countryCode: null,
      deviceFingerprint: null,
      deviceLabel: null,
      browser: null,
      os: null,
      deviceType: null,
      via2FA: false,
      method: null,
      newDevice: false,
      newCountry: false,
      firstSeenAt: null,
      lastSeenAt: null,
    };
  }
}

function parseAdminLoginUserAgent(userAgent: string | null | undefined) {
  const source = (userAgent ?? '').trim();
  const lower = source.toLowerCase();

  let browser = 'Unknown browser';
  if (lower.includes('edg/')) browser = 'Microsoft Edge';
  else if (lower.includes('opr/') || lower.includes('opera')) browser = 'Opera';
  else if (lower.includes('samsungbrowser')) browser = 'Samsung Internet';
  else if (lower.includes('chrome/') && !lower.includes('edg/')) browser = 'Google Chrome';
  else if (lower.includes('firefox/')) browser = 'Mozilla Firefox';
  else if (lower.includes('safari/') && !lower.includes('chrome/')) browser = 'Safari';

  let os = 'Unknown OS';
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) os = 'iOS';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('mac os x') || lower.includes('macintosh')) os = 'macOS';
  else if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('linux')) os = 'Linux';

  let deviceType = 'Desktop';
  if (lower.includes('ipad') || lower.includes('tablet')) deviceType = 'Tablet';
  else if (lower.includes('iphone') || lower.includes('android') || lower.includes('mobile')) {
    deviceType = 'Mobile';
  }

  const label = `${deviceType} · ${browser}`;
  return {
    browser,
    os,
    deviceType,
    label,
    fingerprint: `${deviceType}:${os}:${browser}`,
  };
}

function buildSuccessfulLoginAlertScope(
  event: 'newDevice' | 'newCountry',
  userId: string,
  fingerprintOrCountry: string,
) {
  return `${event}:${userId}:${fingerprintOrCountry}`;
}

function shouldRequireApprovalForAssessment(
  requirement: AdminLoginApprovalRequirement,
  assessment: Pick<AdminLoginApprovalAssessment, 'newDevice' | 'newCountry'>,
) {
  switch (requirement) {
    case 'NEW_DEVICE':
      return assessment.newDevice;
    case 'NEW_COUNTRY':
      return assessment.newCountry;
    case 'BOTH':
      return assessment.newDevice && assessment.newCountry;
    case 'EITHER':
    default:
      return assessment.newDevice || assessment.newCountry;
  }
}

async function assessAdminLoginApproval(
  input: Pick<
    RecordSuccessfulAdminLoginInput,
    'userId' | 'role' | 'ip' | 'userAgent'
  >,
): Promise<AdminLoginApprovalAssessment> {
  const normalizedIp = normalizeIpAddress(input.ip);
  const parsedUserAgent = parseAdminLoginUserAgent(input.userAgent);
  const countryCode = normalizedIp ? (await getGeoIpCountry(normalizedIp)).countryCode : null;

  if (input.role !== 'ADMIN') {
    return {
      required: false,
      normalizedIp,
      countryCode,
      deviceFingerprint: parsedUserAgent.fingerprint,
      deviceLabel: parsedUserAgent.label,
      browser: parsedUserAgent.browser,
      os: parsedUserAgent.os,
      deviceType: parsedUserAgent.deviceType,
      newDevice: false,
      newCountry: false,
    };
  }

  const previousLogins = await db.auditLog.findMany({
    where: {
      action: 'AUTH_LOGIN_SUCCESS',
      userId: input.userId,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      details: true,
    },
  });

  const knownDeviceFingerprints = new Set(
    previousLogins
      .map((entry) => parseAuditDetails(entry.details).deviceFingerprint)
      .filter((value): value is string => Boolean(value)),
  );
  const knownCountries = new Set(
    previousLogins
      .map((entry) => parseAuditDetails(entry.details).countryCode)
      .filter((value): value is string => Boolean(value)),
  );

  const newDevice =
    knownDeviceFingerprints.size > 0 && !knownDeviceFingerprints.has(parsedUserAgent.fingerprint);
  const newCountry =
    Boolean(countryCode) && knownCountries.size > 0 && !knownCountries.has(countryCode!);

  return {
    required: false,
    normalizedIp,
    countryCode,
    deviceFingerprint: parsedUserAgent.fingerprint,
    deviceLabel: parsedUserAgent.label,
    browser: parsedUserAgent.browser,
    os: parsedUserAgent.os,
    deviceType: parsedUserAgent.deviceType,
    newDevice,
    newCountry,
  };
}

function buildIncidentSummary(incident: {
  failureCount: number;
  lockCount: number;
  banCount: number;
  repeatedOffenderCount: number;
  unbanCount: number;
}) {
  const parts = [`${incident.failureCount} failed login${incident.failureCount === 1 ? '' : 's'}`];

  if (incident.lockCount > 0) {
    parts.push(`${incident.lockCount} lock${incident.lockCount === 1 ? '' : 's'}`);
  }

  if (incident.banCount > 0) {
    parts.push(`${incident.banCount} ban${incident.banCount === 1 ? '' : 's'}`);
  }

  if (incident.repeatedOffenderCount > 0) {
    parts.push(
      `${incident.repeatedOffenderCount} repeat alert${incident.repeatedOffenderCount === 1 ? '' : 's'}`,
    );
  }

  if (incident.unbanCount > 0) {
    parts.push(`${incident.unbanCount} unban${incident.unbanCount === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}

function buildIncidentStatus(
  endedAt: Date,
  now: Date,
  activeRestrictionType: string | null,
  currentlyBanned: boolean,
  lockCount: number,
  banCount: number,
): AdminLoginIncidentStatus {
  if (currentlyBanned || activeRestrictionType) {
    return 'ACTIVE';
  }

  if (now.getTime() - endedAt.getTime() <= INCIDENT_ACTIVE_WINDOW_MS) {
    return 'ACTIVE';
  }

  if (lockCount > 0 || banCount > 0) {
    return 'CONTAINED';
  }

  return 'RESOLVED';
}

function buildIncidentSeverity(incident: {
  failureCount: number;
  lockCount: number;
  banCount: number;
  repeatedOffenderCount: number;
  currentlyBanned: boolean;
}): AdminLoginIncidentSeverity {
  if (incident.currentlyBanned || incident.banCount > 0) {
    return 'CRITICAL';
  }

  if (incident.repeatedOffenderCount > 0 || incident.lockCount > 0 || incident.failureCount >= 10) {
    return 'HIGH';
  }

  if (incident.failureCount >= 5) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function buildReputationLevel(score: number): AdminLoginReputationLevel {
  if (score >= 75) {
    return 'CRITICAL';
  }

  if (score >= 50) {
    return 'HIGH';
  }

  if (score >= 20) {
    return 'ELEVATED';
  }

  return 'LOW';
}

const ADMIN_LOGIN_RISK_LEVEL_ORDER: Record<AdminLoginReputationLevel, number> = {
  LOW: 0,
  ELEVATED: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function meetsRiskThreshold(level: AdminLoginReputationLevel, minimum: AdminLoginReputationLevel) {
  return ADMIN_LOGIN_RISK_LEVEL_ORDER[level] >= ADMIN_LOGIN_RISK_LEVEL_ORDER[minimum];
}

function buildReputationScore({
  failures24h,
  failures7d,
  failures30d,
  bans7d,
  locks7d,
  repeatedAlerts30d,
  incidents7d = 0,
  currentlyRestricted = false,
  currentlyBanned = false,
}: {
  failures24h: number;
  failures7d: number;
  failures30d: number;
  bans7d: number;
  locks7d: number;
  repeatedAlerts30d: number;
  incidents7d?: number;
  currentlyRestricted?: boolean;
  currentlyBanned?: boolean;
}) {
  return Math.min(
    100,
    failures24h * 4 +
      Math.max(0, failures7d - failures24h) * 2 +
      Math.max(0, failures30d - failures7d) +
      bans7d * 22 +
      locks7d * 10 +
      repeatedAlerts30d * 14 +
      incidents7d * 3 +
      (currentlyBanned ? 18 : currentlyRestricted ? 8 : 0),
  );
}

function buildSecurityIncidents(
  logs: AdminLoginAuditEvent[],
  {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  }: {
    activeRestrictionByIp: Map<string, AdminLoginRestrictionInfo>;
    fail2banBannedIps: Set<string>;
    now: Date;
  },
) {
  const incidents: RawAdminLoginIncident[] = [];
  const groupedLogs = new Map<string, AdminLoginAuditEvent[]>();

  for (const log of logs) {
    if (!log.ip) {
      continue;
    }

    const ipLogs = groupedLogs.get(log.ip) ?? [];
    ipLogs.push(log);
    groupedLogs.set(log.ip, ipLogs);
  }

  for (const [ip, ipLogs] of Array.from(groupedLogs.entries())) {
    const sortedLogs = [...ipLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let cursor:
      | {
          startedAt: Date;
          endedAt: Date;
          failureCount: number;
          lockCount: number;
          banCount: number;
          repeatedOffenderCount: number;
          unbanCount: number;
          attemptedEmails: Set<string>;
          hosts: Set<string>;
          paths: Set<string>;
        }
      | null = null;

    const flush = () => {
      if (!cursor) {
        return;
      }

      const activeRestriction = activeRestrictionByIp.get(ip);
      const currentlyBanned =
        fail2banBannedIps.has(ip) || activeRestriction?.restrictionType === 'BAN';
      const activeRestrictionType = activeRestriction?.restrictionType ?? null;

      const incident = {
        id: `${ip}:${cursor.startedAt.getTime()}`,
        ip,
        startedAt: cursor.startedAt,
        endedAt: cursor.endedAt,
        failureCount: cursor.failureCount,
        lockCount: cursor.lockCount,
        banCount: cursor.banCount,
        repeatedOffenderCount: cursor.repeatedOffenderCount,
        unbanCount: cursor.unbanCount,
        attemptedEmails: Array.from(cursor.attemptedEmails).slice(0, 5),
        hosts: Array.from(cursor.hosts).slice(0, 3),
        paths: Array.from(cursor.paths).slice(0, 3),
        activeRestrictionType,
        currentlyBanned,
        status: buildIncidentStatus(
          cursor.endedAt,
          now,
          activeRestrictionType,
          currentlyBanned,
          cursor.lockCount,
          cursor.banCount,
        ),
        severity: buildIncidentSeverity({
          failureCount: cursor.failureCount,
          lockCount: cursor.lockCount,
          banCount: cursor.banCount,
          repeatedOffenderCount: cursor.repeatedOffenderCount,
          currentlyBanned,
        }),
        summary: buildIncidentSummary(cursor),
      };

      incidents.push(incident);
      cursor = null;
    };

    for (const log of sortedLogs) {
      const details = parseAuditDetails(log.details);

      if (!cursor || log.createdAt.getTime() - cursor.endedAt.getTime() > INCIDENT_IDLE_GAP_MS) {
        flush();
        cursor = {
          startedAt: details.firstSeenAt ?? log.createdAt,
          endedAt: details.lastSeenAt ?? log.createdAt,
          failureCount: 0,
          lockCount: 0,
          banCount: 0,
          repeatedOffenderCount: 0,
          unbanCount: 0,
          attemptedEmails: new Set<string>(),
          hosts: new Set<string>(),
          paths: new Set<string>(),
        };
      }

      cursor.endedAt = new Date(
        Math.max(cursor.endedAt.getTime(), (details.lastSeenAt ?? log.createdAt).getTime()),
      );
      cursor.startedAt = new Date(
        Math.min(cursor.startedAt.getTime(), (details.firstSeenAt ?? log.createdAt).getTime()),
      );

      if (details.email) {
        cursor.attemptedEmails.add(details.email);
      }
      if (details.host) {
        cursor.hosts.add(details.host);
      }
      if (details.path) {
        cursor.paths.add(details.path);
      }

      switch (log.action) {
        case 'AUTH_LOGIN_FAILED':
          cursor.failureCount += 1;
          break;
        case 'AUTH_LOGIN_LOCKED':
          cursor.lockCount += 1;
          break;
        case 'AUTH_LOGIN_BANNED':
          cursor.banCount += 1;
          break;
        case 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT':
          cursor.repeatedOffenderCount += 1;
          break;
        case 'AUTH_LOGIN_UNBANNED':
          cursor.unbanCount += 1;
          break;
        default:
          break;
      }
    }

    flush();
  }

  return incidents.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime()).slice(0, 20);
}

function buildIpReputation(
  logs: AdminLoginAuditEvent[],
  incidents: RawAdminLoginIncident[],
  {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  }: {
    activeRestrictionByIp: Map<string, AdminLoginRestrictionInfo>;
    fail2banBannedIps: Set<string>;
    now: Date;
  },
) {
  const dayAgo = now.getTime() - 24 * 60 * 60_000;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60_000;
  const ipMap = new Map<
    string,
    {
      failures24h: number;
      failures7d: number;
      failures30d: number;
      bans7d: number;
      locks7d: number;
      repeatedAlerts30d: number;
      lastSeenAt: Date;
      attemptedEmails: Set<string>;
      emailCounts: Map<string, number>;
    }
  >();

  for (const log of logs) {
    if (!log.ip) {
      continue;
    }

    const details = parseAuditDetails(log.details);
    const current = ipMap.get(log.ip) ?? {
      failures24h: 0,
      failures7d: 0,
      failures30d: 0,
      bans7d: 0,
      locks7d: 0,
      repeatedAlerts30d: 0,
      lastSeenAt: log.createdAt,
      attemptedEmails: new Set<string>(),
      emailCounts: new Map<string, number>(),
    };

    current.lastSeenAt = current.lastSeenAt > log.createdAt ? current.lastSeenAt : log.createdAt;

    if (details.email) {
      current.attemptedEmails.add(details.email);
      current.emailCounts.set(details.email, (current.emailCounts.get(details.email) ?? 0) + 1);
    }

    if (log.action === 'AUTH_LOGIN_FAILED') {
      current.failures30d += 1;
      if (log.createdAt.getTime() >= weekAgo) {
        current.failures7d += 1;
      }
      if (log.createdAt.getTime() >= dayAgo) {
        current.failures24h += 1;
      }
    }

    if (log.action === 'AUTH_LOGIN_BANNED' && log.createdAt.getTime() >= weekAgo) {
      current.bans7d += 1;
    }

    if (log.action === 'AUTH_LOGIN_LOCKED' && log.createdAt.getTime() >= weekAgo) {
      current.locks7d += 1;
    }

    if (log.action === 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT') {
      current.repeatedAlerts30d += 1;
    }

    ipMap.set(log.ip, current);
  }

  const incidents7dByIp = new Map<string, number>();
  for (const incident of incidents) {
    if (incident.startedAt.getTime() >= weekAgo) {
      incidents7dByIp.set(incident.ip, (incidents7dByIp.get(incident.ip) ?? 0) + 1);
    }
  }

  return Array.from(ipMap.entries())
    .map(([ip, value]) => {
      const currentlyRestricted = activeRestrictionByIp.has(ip);
      const currentlyBanned =
        fail2banBannedIps.has(ip) || activeRestrictionByIp.get(ip)?.restrictionType === 'BAN';
      const score = buildReputationScore({
        failures24h: value.failures24h,
        failures7d: value.failures7d,
        failures30d: value.failures30d,
        bans7d: value.bans7d,
        locks7d: value.locks7d,
        repeatedAlerts30d: value.repeatedAlerts30d,
        incidents7d: incidents7dByIp.get(ip) ?? 0,
        currentlyRestricted,
        currentlyBanned,
      });

      let topEmail: string | null = null;
      let topEmailCount = -1;
      for (const [email, count] of Array.from(value.emailCounts.entries())) {
        if (count > topEmailCount) {
          topEmail = email;
          topEmailCount = count;
        }
      }

      return {
        ip,
        countryCode: null,
        score,
        level: buildReputationLevel(score),
        failures24h: value.failures24h,
        failures7d: value.failures7d,
        failures30d: value.failures30d,
        bans7d: value.bans7d,
        locks7d: value.locks7d,
        repeatedAlerts30d: value.repeatedAlerts30d,
        incidents7d: incidents7dByIp.get(ip) ?? 0,
        attemptedEmails: Array.from(value.attemptedEmails).slice(0, 5),
        topEmail,
        lastSeenAt: value.lastSeenAt,
        currentlyRestricted,
        currentlyBanned,
      };
    })
    .sort((a, b) => b.score - a.score || b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .slice(0, 20);
}

function buildReputationHistory(logs: AdminLoginAuditEvent[], now: Date, days = 14) {
  const dayStarts = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - index));
    return date;
  });

  const buckets = new Map<string, AdminLoginReputationHistoryPoint & { ipStats: Map<string, {
    failures: number;
    locks: number;
    bans: number;
    repeatedAlerts: number;
  }> }>();

  for (const day of dayStarts) {
    const key = day.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      failures: 0,
      locks: 0,
      bans: 0,
      repeatedAlerts: 0,
      uniqueIps: 0,
      highRiskIps: 0,
      peakScore: 0,
      ipStats: new Map(),
    });
  }

  for (const log of logs) {
    if (!log.ip) {
      continue;
    }

    const key = log.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) {
      continue;
    }

    const ipStats = bucket.ipStats.get(log.ip) ?? {
      failures: 0,
      locks: 0,
      bans: 0,
      repeatedAlerts: 0,
    };

    switch (log.action) {
      case 'AUTH_LOGIN_FAILED':
        bucket.failures += 1;
        ipStats.failures += 1;
        break;
      case 'AUTH_LOGIN_LOCKED':
        bucket.locks += 1;
        ipStats.locks += 1;
        break;
      case 'AUTH_LOGIN_BANNED':
        bucket.bans += 1;
        ipStats.bans += 1;
        break;
      case 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT':
        bucket.repeatedAlerts += 1;
        ipStats.repeatedAlerts += 1;
        break;
      default:
        break;
    }

    bucket.ipStats.set(log.ip, ipStats);
  }

  return Array.from(buckets.values()).map((bucket) => {
    const ipStatsList = Array.from(bucket.ipStats.values());
    const peakScore = ipStatsList.reduce((highest, stat) => {
      const score = buildReputationScore({
        failures24h: stat.failures,
        failures7d: stat.failures,
        failures30d: stat.failures,
        bans7d: stat.bans,
        locks7d: stat.locks,
        repeatedAlerts30d: stat.repeatedAlerts,
      });
      return Math.max(highest, score);
    }, 0);

    return {
      date: bucket.date,
      label: bucket.label,
      failures: bucket.failures,
      locks: bucket.locks,
      bans: bucket.bans,
      repeatedAlerts: bucket.repeatedAlerts,
      uniqueIps: bucket.ipStats.size,
      highRiskIps: ipStatsList.filter((stat) => buildReputationScore({
        failures24h: stat.failures,
        failures7d: stat.failures,
        failures30d: stat.failures,
        bans7d: stat.bans,
        locks7d: stat.locks,
        repeatedAlerts30d: stat.repeatedAlerts,
      }) >= 50).length,
      peakScore,
    };
  });
}

function isTrustedIp(ip: string, config: AdminLoginProtectionConfig) {
  return normalizeTrustedIpRanges(config.trustedIpRanges).some((range) => {
    if (range === ip) {
      return true;
    }

    try {
      return ipRangeCheck(ip, range);
    } catch {
      return false;
    }
  });
}

function parseConfig(rawValue: string | null | undefined): AdminLoginProtectionConfig {
  if (!rawValue) {
    return adminLoginProtectionConfigSchema.parse({});
  }

  try {
    return adminLoginProtectionConfigSchema.parse(JSON.parse(rawValue));
  } catch {
    return adminLoginProtectionConfigSchema.parse({});
  }
}

function parseWorkflowMap(rawValue: string | null | undefined) {
  if (!rawValue) {
    return {} as Record<string, AdminLoginIncidentWorkflowEntry>;
  }

  try {
    return adminLoginIncidentWorkflowMapSchema.parse(JSON.parse(rawValue));
  } catch {
    return {} as Record<string, AdminLoginIncidentWorkflowEntry>;
  }
}

function parseAlertSuppressions(rawValue: string | null | undefined) {
  if (!rawValue) {
    return [] as AdminLoginAlertSuppressionEntry[];
  }

  try {
    return adminLoginAlertSuppressionsSchema.parse(JSON.parse(rawValue));
  } catch {
    return [] as AdminLoginAlertSuppressionEntry[];
  }
}

function parseSavedViews(rawValue: string | null | undefined) {
  if (!rawValue) {
    return [] as AdminLoginSavedView[];
  }

  try {
    return adminLoginSavedViewsSchema.parse(JSON.parse(rawValue));
  } catch {
    return [] as AdminLoginSavedView[];
  }
}

function parsePendingApprovals(rawValue: string | null | undefined) {
  if (!rawValue) {
    return [] as AdminLoginPendingApprovalEntry[];
  }

  try {
    return adminLoginPendingApprovalsSchema.parse(JSON.parse(rawValue));
  } catch {
    return [] as AdminLoginPendingApprovalEntry[];
  }
}

function parseStoredDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePendingApprovalEntry(
  entry: AdminLoginPendingApprovalEntry,
): AdminLoginPendingApproval | null {
  const createdAt = parseStoredDate(entry.createdAt);
  const expiresAt = parseStoredDate(entry.expiresAt);
  const approvedAt = parseStoredDate(entry.approvedAt);
  const rejectedAt = parseStoredDate(entry.rejectedAt);
  const completedAt = parseStoredDate(entry.completedAt);

  if (!createdAt || !expiresAt) {
    return null;
  }

  let status = entry.status;
  if (status === 'PENDING' && expiresAt.getTime() <= Date.now()) {
    status = 'EXPIRED';
  }

  return {
    id: entry.id,
    tempToken: entry.tempToken,
    userId: entry.userId,
    email: entry.email,
    role: entry.role,
    ip: entry.ip,
    host: entry.host?.trim() || null,
    path: entry.path?.trim() || null,
    countryCode: entry.countryCode?.trim() || null,
    deviceFingerprint: entry.deviceFingerprint?.trim() || null,
    deviceLabel: entry.deviceLabel,
    browser: entry.browser,
    os: entry.os,
    deviceType: entry.deviceType,
    via2FA: entry.via2FA,
    method: entry.method?.trim() || null,
    newDevice: entry.newDevice,
    newCountry: entry.newCountry,
    status,
    createdAt,
    expiresAt,
    approvedAt,
    approvedByEmail: entry.approvedByEmail?.trim() || null,
    rejectedAt,
    rejectedByEmail: entry.rejectedByEmail?.trim() || null,
    rejectionReason: entry.rejectionReason?.trim() || null,
    completedAt,
    remainingMinutes: Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000)),
  };
}

function appendIncidentNote(existingNotes: string | undefined, actorEmail: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) {
    return existingNotes?.trim() || '';
  }

  const line = `[${new Date().toISOString()}] ${actorEmail}: ${trimmed}`;
  return existingNotes?.trim() ? `${existingNotes.trim()}\n${line}` : line;
}

function parseIncidentNotes(notes: string | null | undefined): AdminLoginIncidentNoteEntry[] {
  if (!notes?.trim()) {
    return [];
  }

  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[([^\]]+)\]\s+([^:]+):\s+([\s\S]+)$/);
      if (!match) {
        return {
          timestamp: null,
          actorEmail: null,
          body: line,
          raw: line,
        };
      }

      const [, timestamp, actorEmail, body] = match;
      const parsedTimestamp = new Date(timestamp);
      return {
        timestamp: Number.isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp,
        actorEmail: actorEmail.trim() || null,
        body: body.trim(),
        raw: line,
      };
    });
}

function getAdminLoginEventLabel(action: string) {
  switch (action) {
    case 'AUTH_LOGIN_FAILED':
      return 'Failed login';
    case 'AUTH_LOGIN_THRESHOLD_ALERT':
      return 'Threshold alert';
    case 'AUTH_LOGIN_LOCKED':
      return 'Temporary lock applied';
    case 'AUTH_LOGIN_BANNED':
      return 'Ban applied';
    case 'AUTH_LOGIN_UNBANNED':
      return 'Unbanned';
    case 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT':
      return 'Repeated offender alert';
    case 'AUTH_LOGIN_NEW_DEVICE':
      return 'New device sign-in';
    case 'AUTH_LOGIN_NEW_COUNTRY':
      return 'New country sign-in';
    case 'AUTH_LOGIN_APPROVAL_REQUESTED':
      return 'Approval requested';
    case 'AUTH_LOGIN_APPROVAL_APPROVED':
      return 'Approval approved';
    case 'AUTH_LOGIN_APPROVAL_REJECTED':
      return 'Approval rejected';
    case 'AUTH_LOGIN_APPROVAL_COMPLETED':
      return 'Approval completed';
    case 'AUTH_LOGIN_INCIDENT_ACKNOWLEDGED':
      return 'Incident acknowledged';
    case 'AUTH_LOGIN_INCIDENT_RESOLVED':
      return 'Incident resolved';
    case 'AUTH_LOGIN_INCIDENT_NOTE_ADDED':
      return 'Incident note added';
    case 'AUTH_LOGIN_INCIDENT_ASSIGNED':
      return 'Incident assigned';
    case 'AUTH_LOGIN_INCIDENT_UNASSIGNED':
      return 'Incident unassigned';
    case 'AUTH_LOGIN_ALERT_SUPPRESSED':
      return 'Alerts muted';
    case 'AUTH_LOGIN_ALERT_UNSUPPRESSED':
      return 'Alerts unmuted';
    case 'AUTH_LOGIN_PERMANENT_BLOCK_RULE':
      return 'Permanent block rule';
    case 'AUTH_LOGIN_ALLOWLIST_RULE':
      return 'Allowlist rule';
    default:
      return action;
  }
}

async function getIncidentWorkflowMap() {
  const setting = await db.settings.findUnique({
    where: { key: ADMIN_LOGIN_INCIDENT_WORKFLOW_SETTINGS_KEY },
    select: { value: true },
  });

  return parseWorkflowMap(setting?.value);
}

async function saveIncidentWorkflowMap(map: Record<string, AdminLoginIncidentWorkflowEntry>) {
  await db.settings.upsert({
    where: { key: ADMIN_LOGIN_INCIDENT_WORKFLOW_SETTINGS_KEY },
    update: { value: JSON.stringify(map) },
    create: {
      key: ADMIN_LOGIN_INCIDENT_WORKFLOW_SETTINGS_KEY,
      value: JSON.stringify(map),
    },
  });
}

function normalizeAlertSuppressionEntry(entry: AdminLoginAlertSuppressionEntry): AdminLoginAlertSuppression | null {
  const createdAt = parseStoredDate(entry.createdAt);
  const expiresAt = parseStoredDate(entry.expiresAt);
  if (!createdAt || !expiresAt || expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return {
    id: entry.id,
    scopeType: entry.scopeType,
    scopeValue: entry.scopeValue,
    reason: entry.reason.trim() || null,
    createdAt,
    createdByEmail: entry.createdByEmail,
    expiresAt,
    remainingMinutes: Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000)),
  };
}

async function getAlertSuppressionsMap() {
  const setting = await db.settings.findUnique({
    where: { key: ADMIN_LOGIN_ALERT_SUPPRESSIONS_SETTINGS_KEY },
    select: { value: true },
  });

  const parsed = parseAlertSuppressions(setting?.value);
  const active = parsed.filter((entry) => {
    const expiresAt = parseStoredDate(entry.expiresAt);
    return Boolean(expiresAt && expiresAt.getTime() > Date.now());
  });

  if (active.length !== parsed.length) {
    await db.settings.upsert({
      where: { key: ADMIN_LOGIN_ALERT_SUPPRESSIONS_SETTINGS_KEY },
      update: { value: JSON.stringify(active) },
      create: {
        key: ADMIN_LOGIN_ALERT_SUPPRESSIONS_SETTINGS_KEY,
        value: JSON.stringify(active),
      },
    });
  }

  return active;
}

async function saveAlertSuppressions(entries: AdminLoginAlertSuppressionEntry[]) {
  await db.settings.upsert({
    where: { key: ADMIN_LOGIN_ALERT_SUPPRESSIONS_SETTINGS_KEY },
    update: { value: JSON.stringify(entries) },
    create: {
      key: ADMIN_LOGIN_ALERT_SUPPRESSIONS_SETTINGS_KEY,
      value: JSON.stringify(entries),
    },
  });
}

async function getSavedViews() {
  const setting = await db.settings.findUnique({
    where: { key: ADMIN_LOGIN_SAVED_VIEWS_SETTINGS_KEY },
    select: { value: true },
  });

  return parseSavedViews(setting?.value);
}

async function saveSavedViews(views: AdminLoginSavedView[]) {
  await db.settings.upsert({
    where: { key: ADMIN_LOGIN_SAVED_VIEWS_SETTINGS_KEY },
    update: { value: JSON.stringify(views) },
    create: {
      key: ADMIN_LOGIN_SAVED_VIEWS_SETTINGS_KEY,
      value: JSON.stringify(views),
    },
  });
}

async function getPendingApprovalsMap() {
  const setting = await db.settings.findUnique({
    where: { key: ADMIN_LOGIN_PENDING_APPROVALS_SETTINGS_KEY },
    select: { value: true },
  });

  return parsePendingApprovals(setting?.value);
}

async function savePendingApprovals(entries: AdminLoginPendingApprovalEntry[]) {
  await db.settings.upsert({
    where: { key: ADMIN_LOGIN_PENDING_APPROVALS_SETTINGS_KEY },
    update: { value: JSON.stringify(entries) },
    create: {
      key: ADMIN_LOGIN_PENDING_APPROVALS_SETTINGS_KEY,
      value: JSON.stringify(entries),
    },
  });
}

async function updateIncidentWorkflowEntry(
  incidentId: string,
  updater: (current: AdminLoginIncidentWorkflowEntry | null) => AdminLoginIncidentWorkflowEntry,
) {
  const workflowMap = await getIncidentWorkflowMap();
  const nextEntry = updater(workflowMap[incidentId] ?? null);
  workflowMap[incidentId] = nextEntry;
  await saveIncidentWorkflowMap(workflowMap);
  return nextEntry;
}

async function getAdminLoginPendingApprovalsInternal() {
  const stored = await getPendingApprovalsMap();
  let changed = false;
  const normalized = stored
    .map((entry) => {
      const parsed = normalizePendingApprovalEntry(entry);
      if (!parsed) {
        changed = true;
        return null;
      }

      if (parsed.status !== entry.status) {
        changed = true;
        return {
          ...entry,
          status: parsed.status,
        } satisfies AdminLoginPendingApprovalEntry;
      }

      return entry;
    })
    .filter(Boolean) as AdminLoginPendingApprovalEntry[];

  if (changed) {
    await savePendingApprovals(normalized);
  }

  return normalized
    .map((entry) => normalizePendingApprovalEntry(entry))
    .filter((entry): entry is AdminLoginPendingApproval => Boolean(entry));
}

function deriveWorkflowStatus(
  incident: Pick<RawAdminLoginIncident, 'endedAt' | 'status'>,
  entry: AdminLoginIncidentWorkflowEntry | null,
): AdminLoginIncidentWorkflowStatus {
  if (!entry) {
    return incident.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
  }

  if (entry.status === 'RESOLVED') {
    const resolvedAt = parseStoredDate(entry.resolvedAt);
    if (resolvedAt && incident.endedAt.getTime() > resolvedAt.getTime()) {
      return 'OPEN';
    }
  }

  return entry.status;
}

async function lookupReverseDns(ip: string) {
  try {
    const result = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((_, reject) => {
        setTimeout(() => reject(new Error('reverse-dns-timeout')), 1500);
      }),
    ]);

    return Array.isArray(result) ? result.slice(0, 3) : [];
  } catch {
    return [];
  }
}

async function lookupIpWhois(ip: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (data.success === false) {
      return null;
    }

    const connection =
      data.connection && typeof data.connection === 'object'
        ? (data.connection as Record<string, unknown>)
        : null;

    return {
      asn:
        typeof connection?.asn === 'number'
          ? `AS${connection.asn}`
          : typeof connection?.asn === 'string' && connection.asn.trim()
            ? connection.asn
            : null,
      isp:
        typeof connection?.isp === 'string' && connection.isp.trim() ? connection.isp : null,
      organization:
        typeof connection?.org === 'string' && connection.org.trim() ? connection.org : null,
      source: 'ipwho.is',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getIpEnrichment(ip: string): Promise<AdminLoginIpEnrichment> {
  if (isLocalOrPrivateIp(ip)) {
    return {
      reverseDns: [],
      asn: null,
      isp: null,
      organization: null,
      source: null,
    };
  }

  const cached = ipEnrichmentCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [reverseDns, whois] = await Promise.all([lookupReverseDns(ip), lookupIpWhois(ip)]);
  const enrichment: AdminLoginIpEnrichment = {
    reverseDns,
    asn: whois?.asn ?? null,
    isp: whois?.isp ?? null,
    organization: whois?.organization ?? null,
    source: whois?.source ?? null,
  };

  ipEnrichmentCache.set(ip, {
    expiresAt: Date.now() + IP_ENRICHMENT_TTL_MS,
    value: enrichment,
  });

  return enrichment;
}

function buildAlertStateKey(event: AdminLoginAlertEventType, scope: string) {
  return `admin_login_alert_state:${event}:${scope}`;
}

function buildIncidentId(ip: string, startedAt: Date | null) {
  if (!startedAt) {
    return null;
  }

  return `${ip}:${startedAt.getTime()}`;
}

async function findActiveAlertSuppression(options: {
  ip?: string | null;
  incidentId?: string | null;
}) {
  const active = await getAlertSuppressionsMap();
  const match = active.find((entry) => {
    if (options.incidentId && entry.scopeType === 'INCIDENT' && entry.scopeValue === options.incidentId) {
      return true;
    }
    if (options.ip && entry.scopeType === 'IP' && entry.scopeValue === options.ip) {
      return true;
    }
    return false;
  });

  return match ? normalizeAlertSuppressionEntry(match) : null;
}

async function getRealtimeRiskSnapshot(
  ip: string,
  options?: {
    email?: string | null;
    now?: Date;
  },
): Promise<AdminLoginRiskSnapshot> {
  const now = options?.now ?? new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const emailNeedle = options?.email ? buildAuditEmailNeedle(options.email) : null;

  const [
    failures24h,
    failures7d,
    failures30d,
    bans7d,
    locks7d,
    repeatedAlerts30d,
    sameEmailFailures30d,
    firstSeen,
    lastSeen,
    activeRestriction,
  ] = await Promise.all([
    db.auditLog.count({
      where: { action: 'AUTH_LOGIN_FAILED', ip, createdAt: { gte: dayAgo } },
    }),
    db.auditLog.count({
      where: { action: 'AUTH_LOGIN_FAILED', ip, createdAt: { gte: weekAgo } },
    }),
    db.auditLog.count({
      where: { action: 'AUTH_LOGIN_FAILED', ip, createdAt: { gte: monthAgo } },
    }),
    db.auditLog.count({
      where: { action: 'AUTH_LOGIN_BANNED', ip, createdAt: { gte: weekAgo } },
    }),
    db.auditLog.count({
      where: { action: 'AUTH_LOGIN_LOCKED', ip, createdAt: { gte: weekAgo } },
    }),
    db.auditLog.count({
      where: { action: 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT', ip, createdAt: { gte: monthAgo } },
    }),
    emailNeedle
      ? db.auditLog.count({
          where: {
            action: 'AUTH_LOGIN_FAILED',
            ip,
            createdAt: { gte: monthAgo },
            details: { contains: emailNeedle },
          },
        })
      : Promise.resolve(0),
    db.auditLog.findFirst({
      where: { action: 'AUTH_LOGIN_FAILED', ip, createdAt: { gte: monthAgo } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: { action: 'AUTH_LOGIN_FAILED', ip, createdAt: { gte: monthAgo } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    getActiveAdminLoginRestriction(ip),
  ]);

  const fail2banStatus = getFail2banStatus();
  const currentlyBanned =
    fail2banStatus.bannedIps.includes(ip) || activeRestriction?.restrictionType === 'BAN';
  const currentlyRestricted = Boolean(activeRestriction);
  const score = buildReputationScore({
    failures24h,
    failures7d,
    failures30d,
    bans7d,
    locks7d,
    repeatedAlerts30d,
    currentlyRestricted,
    currentlyBanned,
  });

  return {
    ip,
    score,
    level: buildReputationLevel(score),
    failures24h,
    failures7d,
    failures30d,
    bans7d,
    locks7d,
    repeatedAlerts30d,
    sameEmailFailures30d,
    firstSeenAt: firstSeen?.createdAt ?? null,
    lastSeenAt: lastSeen?.createdAt ?? null,
    currentlyRestricted,
    currentlyBanned,
  };
}

async function shouldSendAlertForEvent(
  config: AdminLoginProtectionConfig,
  event: AdminLoginAlertEventType,
  {
    scope,
    level,
  }: {
    scope: string;
    level: AdminLoginReputationLevel;
  },
) {
  if (!config.telegramAlertEnabled) {
    return false;
  }

  if (event === 'repeatedOffender' && !config.alertOnRepeatedOffender) {
    return false;
  }

  if (event === 'unban' && !config.alertOnUnban) {
    return false;
  }

  const rule = config.alertRules[event];
  if (!rule?.enabled || !meetsRiskThreshold(level, rule.minimumReputationLevel)) {
    return false;
  }

  const state = await db.settings.findUnique({
    where: { key: buildAlertStateKey(event, scope) },
    select: { value: true },
  });

  if (!state?.value) {
    return true;
  }

  const previousSentAt = new Date(state.value);
  if (Number.isNaN(previousSentAt.getTime())) {
    return true;
  }

  return Date.now() - previousSentAt.getTime() >= rule.cooldownMinutes * 60_000;
}

async function markAlertSent(event: AdminLoginAlertEventType, scope: string, sentAt: Date) {
  await db.settings.upsert({
    where: { key: buildAlertStateKey(event, scope) },
    update: { value: sentAt.toISOString() },
    create: {
      key: buildAlertStateKey(event, scope),
      value: sentAt.toISOString(),
    },
  });
}

async function maybeSendFail2banUnavailableAlert(
  config: AdminLoginProtectionConfig,
  status: Fail2banStatus,
) {
  if (status.available) {
    return;
  }

  const canSend = await shouldSendAlertForEvent(config, 'fail2banUnavailable', {
    scope: 'global',
    level: 'LOW',
  });
  if (!canSend) {
    return;
  }

  await sendAdminAlert(
    [
      '⚠️ <b>fail2ban jail unavailable</b>',
      '',
      `Jail: <code>${status.jail}</code>`,
      `Error: <code>${status.error || 'unknown'}</code>`,
      'Admin login protection is still active at the app layer, but server-side hard bans may not be applying.',
    ].join('\n'),
    { parseMode: 'HTML' },
  );

  await writeAuditLog({
    action: 'AUTH_LOGIN_FAIL2BAN_UNAVAILABLE_ALERT',
    entity: 'AUTH',
    details: {
      jail: status.jail,
      error: status.error,
    },
  });
  await markAlertSent('fail2banUnavailable', 'global', new Date());
}

export async function getAdminLoginChallengeDecision(
  ip: string | null | undefined,
  email?: string | null,
): Promise<AdminLoginChallengeDecision> {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return { mode: 'ALLOW', score: 0, level: 'LOW' };
  }

  const config = await getAdminLoginProtectionConfig();
  if (
    !config.enabled ||
    config.challengeMode === 'OFF' ||
    isLocalOrPrivateIp(normalizedIp) ||
    isTrustedIp(normalizedIp, config)
  ) {
    return { mode: 'ALLOW', score: 0, level: 'LOW' };
  }

  const snapshot = await getRealtimeRiskSnapshot(normalizedIp, { email });
  if (!meetsRiskThreshold(snapshot.level, config.challengeMinimumReputationLevel)) {
    return { mode: 'ALLOW', score: snapshot.score, level: snapshot.level };
  }

  return {
    mode: config.challengeMode === 'BLOCK' ? 'BLOCK' : 'REQUIRE_2FA',
    score: snapshot.score,
    level: snapshot.level,
  };
}

export async function getAdminLoginApprovalDecision(input: {
  userId: string;
  email: string;
  role: string;
  ip: string | null | undefined;
  userAgent?: string | null | undefined;
}) {
  const config = await getAdminLoginProtectionConfig();
  const assessment = await assessAdminLoginApproval(input);

  if (
    input.role !== 'ADMIN' ||
    !config.enabled ||
    !config.unusualLoginApprovalEnabled ||
    !assessment.normalizedIp ||
    isLocalOrPrivateIp(assessment.normalizedIp) ||
    isTrustedIp(assessment.normalizedIp, config)
  ) {
    return {
      required: false,
      config,
      assessment,
    };
  }

  return {
    required: shouldRequireApprovalForAssessment(config.unusualLoginApprovalRequireFor, assessment),
    config,
    assessment,
  };
}

export async function createAdminLoginApprovalRequest(input: {
  tempToken: string;
  userId: string;
  email: string;
  role: string;
  ip: string;
  host?: string | null;
  path?: string | null;
  via2FA?: boolean;
  method?: string | null;
  assessment: AdminLoginApprovalAssessment;
  expiresAt: Date;
}) {
  const approvals = await getPendingApprovalsMap();
  const now = new Date();
  const existingIndex = approvals.findIndex((entry) => entry.tempToken === input.tempToken);
  const nextEntry = adminLoginPendingApprovalEntrySchema.parse({
    id: existingIndex >= 0 ? approvals[existingIndex]?.id : randomUUID(),
    tempToken: input.tempToken,
    userId: input.userId,
    email: input.email,
    role: input.role,
    ip: input.ip,
    host: input.host ?? null,
    path: input.path ?? null,
    countryCode: input.assessment.countryCode,
    deviceFingerprint: input.assessment.deviceFingerprint,
    deviceLabel: input.assessment.deviceLabel,
    browser: input.assessment.browser,
    os: input.assessment.os,
    deviceType: input.assessment.deviceType,
    via2FA: input.via2FA === true,
    method: input.method ?? null,
    newDevice: input.assessment.newDevice,
    newCountry: input.assessment.newCountry,
    status: 'PENDING',
    createdAt: existingIndex >= 0 ? approvals[existingIndex]?.createdAt : now.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    approvedAt: null,
    approvedByEmail: null,
    rejectedAt: null,
    rejectedByEmail: null,
    rejectionReason: null,
    completedAt: null,
  });

  const next = [...approvals];
  if (existingIndex >= 0) {
    next[existingIndex] = nextEntry;
  } else {
    next.push(nextEntry);
  }
  await savePendingApprovals(next);

  await writeAuditLog({
    userId: input.userId,
    ip: input.ip,
    action: 'AUTH_LOGIN_APPROVAL_REQUESTED',
    entity: 'AUTH',
    entityId: nextEntry.id,
    details: {
      email: input.email,
      role: input.role,
      host: input.host ?? null,
      path: input.path ?? null,
      countryCode: input.assessment.countryCode,
      deviceFingerprint: input.assessment.deviceFingerprint,
      deviceLabel: input.assessment.deviceLabel,
      browser: input.assessment.browser,
      os: input.assessment.os,
      deviceType: input.assessment.deviceType,
      via2FA: input.via2FA === true,
      method: input.method ?? null,
      newDevice: input.assessment.newDevice,
      newCountry: input.assessment.newCountry,
      expiresAt: input.expiresAt.toISOString(),
    },
  });

  try {
    const countryPart = input.assessment.countryCode ? `\nCountry: ${input.assessment.countryCode}` : '';
    const hostPart = input.host ? `\nHost: <code>${input.host}</code>` : '';
    const pathPart = input.path ? `\nPath: <code>${input.path}</code>` : '';
    const reasonParts = [
      input.assessment.newDevice ? 'new device' : null,
      input.assessment.newCountry ? 'new country' : null,
    ].filter(Boolean);
    await sendAdminAlert(
      [
        '⏳ <b>Admin sign-in approval required</b>',
        '',
        `Email: <code>${input.email}</code>`,
        `IP: <code>${input.ip}</code>${countryPart}`,
        `Device: <b>${input.assessment.deviceLabel}</b>`,
        `Reason: <b>${reasonParts.join(' + ') || 'unusual login'}</b>`,
        `Approval expires: <b>${input.expiresAt.toISOString()}</b>`,
        `${hostPart}${pathPart}`,
      ].join('\n'),
      { parseMode: 'HTML' },
    );
  } catch (error) {
    console.error('Failed to send admin login approval alert:', error);
  }

  return normalizePendingApprovalEntry(nextEntry);
}

export async function getAdminLoginApprovalStatusByTempToken(tempToken: string) {
  const approvals = await getAdminLoginPendingApprovalsInternal();
  const approval = approvals.find((entry) => entry.tempToken === tempToken);
  if (!approval) {
    return {
      status: 'EXPIRED' as AdminLoginApprovalStatus,
      approval: null,
    };
  }

  return {
    status: approval.status,
    approval,
  };
}

export async function approveAdminLoginApproval(input: {
  approvalId: string;
  actorEmail: string;
}) {
  const approvals = await getPendingApprovalsMap();
  const index = approvals.findIndex((entry) => entry.id === input.approvalId);
  if (index < 0) {
    throw new Error('Admin login approval not found');
  }

  const current = normalizePendingApprovalEntry(approvals[index]!);
  if (!current) {
    throw new Error('Admin login approval not found');
  }
  if (current.status !== 'PENDING') {
    return current;
  }

  const now = new Date();
  const updated = adminLoginPendingApprovalEntrySchema.parse({
    ...approvals[index],
    status: 'APPROVED',
    approvedAt: now.toISOString(),
    approvedByEmail: input.actorEmail,
  });
  approvals[index] = updated;
  await savePendingApprovals(approvals);

  await writeAuditLog({
    userId: current.userId,
    ip: current.ip,
    action: 'AUTH_LOGIN_APPROVAL_APPROVED',
    entity: 'AUTH',
    entityId: current.id,
    details: {
      email: current.email,
      actorEmail: input.actorEmail,
    },
  });

  return normalizePendingApprovalEntry(updated);
}

export async function rejectAdminLoginApproval(input: {
  approvalId: string;
  actorEmail: string;
  note?: string | null;
}) {
  const approvals = await getPendingApprovalsMap();
  const index = approvals.findIndex((entry) => entry.id === input.approvalId);
  if (index < 0) {
    throw new Error('Admin login approval not found');
  }

  const current = normalizePendingApprovalEntry(approvals[index]!);
  if (!current) {
    throw new Error('Admin login approval not found');
  }

  const now = new Date();
  const updated = adminLoginPendingApprovalEntrySchema.parse({
    ...approvals[index],
    status: 'REJECTED',
    rejectedAt: now.toISOString(),
    rejectedByEmail: input.actorEmail,
    rejectionReason: input.note?.trim() || null,
  });
  approvals[index] = updated;
  await savePendingApprovals(approvals);

  await writeAuditLog({
    userId: current.userId,
    ip: current.ip,
    action: 'AUTH_LOGIN_APPROVAL_REJECTED',
    entity: 'AUTH',
    entityId: current.id,
    details: {
      email: current.email,
      actorEmail: input.actorEmail,
      note: input.note?.trim() || null,
    },
  });

  return normalizePendingApprovalEntry(updated);
}

export async function completeAdminLoginApproval(tempToken: string) {
  const approvals = await getPendingApprovalsMap();
  const index = approvals.findIndex((entry) => entry.tempToken === tempToken);
  if (index < 0) {
    throw new Error('Admin login approval not found');
  }

  const current = normalizePendingApprovalEntry(approvals[index]!);
  if (!current) {
    throw new Error('Admin login approval not found');
  }
  if (current.status !== 'APPROVED') {
    return current;
  }

  const updated = adminLoginPendingApprovalEntrySchema.parse({
    ...approvals[index],
    status: 'COMPLETED',
    completedAt: new Date().toISOString(),
  });
  approvals[index] = updated;
  await savePendingApprovals(approvals);

  await writeAuditLog({
    userId: current.userId,
    ip: current.ip,
    action: 'AUTH_LOGIN_APPROVAL_COMPLETED',
    entity: 'AUTH',
    entityId: current.id,
    details: {
      email: current.email,
      approvedByEmail: current.approvedByEmail,
    },
  });

  return normalizePendingApprovalEntry(updated);
}

function ensureLogDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function appendFail2banEvent(ip: string, email: string) {
  const safeEmail = email.replaceAll(/\s+/g, '_').slice(0, 256);
  const line = `${new Date().toISOString()} ip=${ip} event=AUTH_LOGIN_FAILED email=${safeEmail}\n`;
  ensureLogDir(ADMIN_LOGIN_FAIL2BAN_LOG);
  fs.appendFileSync(ADMIN_LOGIN_FAIL2BAN_LOG, line, { encoding: 'utf8' });
}

function tryFail2banUnban(ip: string) {
  try {
    execFileSync('fail2ban-client', ['set', ADMIN_LOGIN_FAIL2BAN_JAIL, 'unbanip', ip], {
      stdio: 'ignore',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function parseFail2banMetric(output: string, label: string) {
  const match = output.match(new RegExp(`${label}:\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

function parseFail2banBannedIps(output: string) {
  const match = output.match(/Banned IP list:\s*(.*)/);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .trim()
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getFail2banStatus(): Fail2banStatus {
  try {
    const output = execFileSync('fail2ban-client', ['status', ADMIN_LOGIN_FAIL2BAN_JAIL], {
      encoding: 'utf8',
      timeout: 5000,
    });

    return {
      available: true,
      jail: ADMIN_LOGIN_FAIL2BAN_JAIL,
      currentlyFailed: parseFail2banMetric(output, 'Currently failed'),
      totalFailed: parseFail2banMetric(output, 'Total failed'),
      currentlyBanned: parseFail2banMetric(output, 'Currently banned'),
      totalBanned: parseFail2banMetric(output, 'Total banned'),
      bannedIps: parseFail2banBannedIps(output),
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      jail: ADMIN_LOGIN_FAIL2BAN_JAIL,
      currentlyFailed: 0,
      totalFailed: 0,
      currentlyBanned: 0,
      totalBanned: 0,
      bannedIps: [],
      error: error instanceof Error ? error.message : 'fail2ban unavailable',
    };
  }
}

async function sendRestrictionAlert(
  type: 'LOCK' | 'BAN',
  {
    ip,
    email,
    failureCount,
    pairFailureCount,
    expiresAt,
    firstSeenAt,
    lastSeenAt,
    host,
    path,
    escalated,
  }: {
    ip: string;
    email: string;
    failureCount: number;
    pairFailureCount: number;
    expiresAt: Date;
    firstSeenAt: Date | null;
    lastSeenAt: Date | null;
    host?: string | null;
    path?: string | null;
    escalated?: boolean;
  },
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';
  const durationMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const hostPart = host ? `\nHost: <code>${host}</code>` : '';
  const pathPart = path ? `\nPath: <code>${path}</code>` : '';
  const firstSeenPart = firstSeenAt ? `\nFirst seen: <b>${firstSeenAt.toISOString()}</b>` : '';
  const lastSeenPart = lastSeenAt ? `\nLast seen: <b>${lastSeenAt.toISOString()}</b>` : '';
  const escalatedPart = escalated ? '\nEscalation: <b>repeat offender window triggered</b>' : '';

  await sendAdminAlert(
    [
      type === 'BAN' ? '🚫 <b>Admin login IP banned</b>' : '⚠️ <b>Admin login IP temporarily locked</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Email: <code>${email}</code>`,
      `Failures (IP window): <b>${failureCount}</b>`,
      `Failures (email+IP window): <b>${pairFailureCount}</b>`,
      `Active for: <b>${durationMinutes} min</b>`,
      `${firstSeenPart}${lastSeenPart}${hostPart}${pathPart}${escalatedPart}`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

async function sendThresholdAlert({
  ip,
  email,
  failureCount,
  pairFailureCount,
  firstSeenAt,
  lastSeenAt,
  host,
  path,
}: {
  ip: string;
  email: string;
  failureCount: number;
  pairFailureCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  host?: string | null;
  path?: string | null;
}) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';
  const hostPart = host ? `\nHost: <code>${host}</code>` : '';
  const pathPart = path ? `\nPath: <code>${path}</code>` : '';
  const firstSeenPart = firstSeenAt ? `\nFirst seen: <b>${firstSeenAt.toISOString()}</b>` : '';
  const lastSeenPart = lastSeenAt ? `\nLast seen: <b>${lastSeenAt.toISOString()}</b>` : '';

  await sendAdminAlert(
    [
      '🟠 <b>Admin login threshold reached</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Email: <code>${email}</code>`,
      `Failures (IP window): <b>${failureCount}</b>`,
      `Failures (email+IP window): <b>${pairFailureCount}</b>`,
      `${firstSeenPart}${lastSeenPart}${hostPart}${pathPart}`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

async function sendRepeatedOffenderAlert(
  {
    ip,
    email,
    failureCount,
    pairFailureCount,
    firstSeenAt,
    lastAttemptAt,
    host,
    path,
  }: {
    ip: string;
    email: string;
    failureCount: number;
    pairFailureCount: number;
    firstSeenAt: Date | null;
    lastAttemptAt: Date;
    host?: string | null;
    path?: string | null;
  },
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';
  const firstSeenPart = firstSeenAt ? `\nFirst seen: <b>${firstSeenAt.toISOString()}</b>` : '';
  const hostPart = host ? `\nHost: <code>${host}</code>` : '';
  const pathPart = path ? `\nPath: <code>${path}</code>` : '';

  await sendAdminAlert(
    [
      '🛡️ <b>Repeated admin login offender detected</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Email: <code>${email}</code>`,
      `Failures in last 24h: <b>${failureCount}</b>`,
      `Failures for same email+IP: <b>${pairFailureCount}</b>`,
      `Last attempt: <b>${lastAttemptAt.toISOString()}</b>`,
      `${firstSeenPart}${hostPart}${pathPart}`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

async function sendUnbanAlert(
  ip: string,
  restrictionType: string,
  attemptedEmail: string | null,
  fail2banUnbanned: boolean,
) {
  const { countryCode } = await getGeoIpCountry(ip);
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';

  await sendAdminAlert(
    [
      '✅ <b>Admin login IP restriction cleared</b>',
      '',
      `IP: <code>${ip}</code>${countryPart}`,
      `Restriction: <b>${restrictionType}</b>`,
      `Email: <code>${attemptedEmail || 'unknown'}</code>`,
      `fail2ban sync: <b>${fail2banUnbanned ? 'removed' : 'not found'}</b>`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

async function sendSuccessfulLoginAlert(
  event: 'newDevice' | 'newCountry',
  {
    ip,
    email,
    countryCode,
    host,
    path,
    deviceLabel,
    browser,
    os,
    via2FA,
    method,
  }: {
    ip: string;
    email: string;
    countryCode: string | null;
    host?: string | null;
    path?: string | null;
    deviceLabel: string;
    browser: string;
    os: string;
    via2FA?: boolean;
    method?: string | null;
  },
) {
  const countryPart = countryCode ? `\nCountry: ${countryCode}` : '';
  const hostPart = host ? `\nHost: <code>${host}</code>` : '';
  const pathPart = path ? `\nPath: <code>${path}</code>` : '';
  const authPart = via2FA
    ? `\nVerification: <b>${method === 'WEBAUTHN' ? 'Passkey' : '2FA'}</b>`
    : '\nVerification: <b>Password only</b>';

  await sendAdminAlert(
    [
      event === 'newDevice'
        ? '🆕 <b>Admin sign-in from a new device</b>'
        : '🌍 <b>Admin sign-in from a new country</b>',
      '',
      `Email: <code>${email}</code>`,
      `IP: <code>${ip}</code>${countryPart}`,
      `Device: <b>${deviceLabel}</b>`,
      `Browser / OS: <b>${browser}</b> / <b>${os}</b>`,
      `${authPart}${hostPart}${pathPart}`,
    ].join('\n'),
    { parseMode: 'HTML' },
  );
}

export async function getAdminLoginProtectionConfig(): Promise<AdminLoginProtectionConfig> {
  const setting = await db.settings.findUnique({
    where: { key: ADMIN_LOGIN_PROTECTION_SETTINGS_KEY },
    select: { value: true },
  });

  const config = parseConfig(setting?.value);
  return {
    ...config,
    trustedIpRanges: normalizeTrustedIpRanges(config.trustedIpRanges),
  };
}

export async function saveAdminLoginProtectionConfig(
  config: Partial<AdminLoginProtectionConfig>,
) {
  const current = await getAdminLoginProtectionConfig();
  const next = adminLoginProtectionConfigSchema.parse({
    ...current,
    ...config,
    trustedIpRanges: normalizeTrustedIpRanges(config.trustedIpRanges ?? current.trustedIpRanges),
  });

  await db.settings.upsert({
    where: { key: ADMIN_LOGIN_PROTECTION_SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: {
      key: ADMIN_LOGIN_PROTECTION_SETTINGS_KEY,
      value: JSON.stringify(next),
    },
  });

  return next;
}

export async function getActiveAdminLoginRestriction(ip: string | null | undefined) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return null;
  }

  const restriction = await db.adminLoginRestriction.findUnique({
    where: { ip: normalizedIp },
  });

  if (!restriction || !restriction.isActive) {
    return null;
  }

  if (restriction.expiresAt <= new Date()) {
    await db.adminLoginRestriction.update({
      where: { ip: normalizedIp },
      data: { isActive: false },
    });
    return null;
  }

  return restriction;
}

export async function getAdminLoginRestrictionStatus(ip: string | null | undefined) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return { blocked: false as const };
  }

  const config = await getAdminLoginProtectionConfig();
  if (!config.enabled || isLocalOrPrivateIp(normalizedIp) || isTrustedIp(normalizedIp, config)) {
    return { blocked: false as const };
  }

  const restriction = await getActiveAdminLoginRestriction(normalizedIp);
  if (!restriction) {
    return { blocked: false as const };
  }

  return {
    blocked: true as const,
    restriction,
    reason: GENERIC_ADMIN_LOGIN_BLOCK_MESSAGE,
    internalReason:
      restriction.restrictionType === 'BAN'
        ? `Access temporarily banned after repeated failed admin logins until ${restriction.expiresAt.toISOString()}`
        : `Access temporarily locked after repeated failed admin logins until ${restriction.expiresAt.toISOString()}`,
  };
}

export async function recordSuccessfulAdminLogin(input: RecordSuccessfulAdminLoginInput) {
  const assessment = await assessAdminLoginApproval(input);
  const normalizedIp = assessment.normalizedIp;

  const detailsBase = {
    email: input.email,
    role: input.role,
    host: input.host ?? null,
    path: input.path ?? null,
    countryCode: assessment.countryCode,
    deviceFingerprint: assessment.deviceFingerprint,
    deviceLabel: assessment.deviceLabel,
    browser: assessment.browser,
    os: assessment.os,
    deviceType: assessment.deviceType,
    via2FA: input.via2FA === true,
    method: input.method ?? null,
  };

  if (input.role !== 'ADMIN') {
    await writeAuditLog({
      userId: input.userId,
      ip: normalizedIp,
      action: 'AUTH_LOGIN_SUCCESS',
      entity: 'AUTH',
      entityId: input.userId,
      details: detailsBase,
    });
    return {
      newDevice: false,
      newCountry: false,
      countryCode: assessment.countryCode,
      deviceLabel: assessment.deviceLabel,
    };
  }
  const newDevice = assessment.newDevice;
  const newCountry = assessment.newCountry;

  await writeAuditLog({
    userId: input.userId,
    ip: normalizedIp,
    action: 'AUTH_LOGIN_SUCCESS',
    entity: 'AUTH',
    entityId: input.userId,
    details: {
      ...detailsBase,
      newDevice,
      newCountry,
    },
  });

  if (!normalizedIp) {
    return {
      newDevice,
      newCountry,
      countryCode: assessment.countryCode,
      deviceLabel: assessment.deviceLabel,
    };
  }

  const config = await getAdminLoginProtectionConfig();
  if (
    !config.enabled ||
    !config.telegramAlertEnabled ||
    isLocalOrPrivateIp(normalizedIp) ||
    isTrustedIp(normalizedIp, config)
  ) {
    return {
      newDevice,
      newCountry,
      countryCode: assessment.countryCode,
      deviceLabel: assessment.deviceLabel,
    };
  }

  const riskSnapshot = await getRealtimeRiskSnapshot(normalizedIp, { email: input.email });
  const suppression = await findActiveAlertSuppression({ ip: normalizedIp });
  const emittedAt = new Date();

  if (newDevice) {
    await writeAuditLog({
      userId: input.userId,
      ip: normalizedIp,
      action: 'AUTH_LOGIN_NEW_DEVICE',
      entity: 'AUTH',
      entityId: input.userId,
      details: {
        ...detailsBase,
        newDevice: true,
      },
    });

    if (!suppression) {
      const scope = buildSuccessfulLoginAlertScope('newDevice', input.userId, assessment.deviceFingerprint);
      const shouldAlert = await shouldSendAlertForEvent(config, 'newDevice', {
        scope,
        level: riskSnapshot.level,
      });
      if (shouldAlert) {
        try {
          await sendSuccessfulLoginAlert('newDevice', {
            ip: normalizedIp,
            email: input.email,
            countryCode: assessment.countryCode,
            host: input.host,
            path: input.path,
            deviceLabel: assessment.deviceLabel,
            browser: assessment.browser,
            os: assessment.os,
            via2FA: input.via2FA,
            method: input.method,
          });
          await markAlertSent('newDevice', scope, emittedAt);
        } catch (error) {
          console.error('Failed to send new-device admin login alert:', error);
        }
      }
    }
  }

  if (newCountry) {
    await writeAuditLog({
      userId: input.userId,
      ip: normalizedIp,
      action: 'AUTH_LOGIN_NEW_COUNTRY',
      entity: 'AUTH',
      entityId: input.userId,
      details: {
        ...detailsBase,
        newCountry: true,
      },
    });

    if (!suppression && assessment.countryCode) {
      const scope = buildSuccessfulLoginAlertScope('newCountry', input.userId, assessment.countryCode);
      const shouldAlert = await shouldSendAlertForEvent(config, 'newCountry', {
        scope,
        level: riskSnapshot.level,
      });
      if (shouldAlert) {
        try {
          await sendSuccessfulLoginAlert('newCountry', {
            ip: normalizedIp,
            email: input.email,
            countryCode: assessment.countryCode,
            host: input.host,
            path: input.path,
            deviceLabel: assessment.deviceLabel,
            browser: assessment.browser,
            os: assessment.os,
            via2FA: input.via2FA,
            method: input.method,
          });
          await markAlertSent('newCountry', scope, emittedAt);
        } catch (error) {
          console.error('Failed to send new-country admin login alert:', error);
        }
      }
    }
  }

  return {
    newDevice,
    newCountry,
    countryCode: assessment.countryCode,
    deviceLabel: assessment.deviceLabel,
  };
}

export async function recordFailedAdminLogin(input: RecordFailedAdminLoginInput) {
  const normalizedIp = normalizeIpAddress(input.ip);
  const config = await getAdminLoginProtectionConfig();

  if (!normalizedIp || !config.enabled || isLocalOrPrivateIp(normalizedIp) || isTrustedIp(normalizedIp, config)) {
    return null;
  }

  const fail2banStatus = getFail2banStatus();
  try {
    await maybeSendFail2banUnavailableAlert(config, fail2banStatus);
  } catch (error) {
    console.error('Failed to send fail2ban unavailable alert:', error);
  }

  if (config.fail2banLogEnabled) {
    try {
      await appendFail2banEvent(normalizedIp, input.email);
    } catch (error) {
      console.error('Failed to append admin login fail2ban event:', error);
    }
  }

  const now = new Date();
  const softWindowStart = new Date(now.getTime() - config.softLockWindowMinutes * 60_000);
  const banWindowStart = new Date(now.getTime() - config.banWindowMinutes * 60_000);
  const repeatedWindowStart = new Date(now.getTime() - 24 * 60 * 60_000);
  const repeatBanWindowStart = new Date(now.getTime() - config.repeatedBanLookbackDays * 24 * 60 * 60_000);
  const repeatedAlertCooldownStart = new Date(now.getTime() - REPEATED_OFFENDER_ALERT_COOLDOWN_MS);
  const emailNeedle = buildAuditEmailNeedle(input.email);

  const [
    softFailures,
    softPairFailures,
    softFirstSeen,
    softLastSeen,
    banFailures,
    banPairFailures,
    banFirstSeen,
    banLastSeen,
    repeatedFailures,
    repeatedPairFailures,
    repeatedFirstSeen,
    existing,
    repeatBanCount,
    recentRepeatedAlert,
  ] = await Promise.all([
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
        details: { contains: emailNeedle },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: softWindowStart },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
        details: { contains: emailNeedle },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: banWindowStart },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: repeatedWindowStart },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: repeatedWindowStart },
        details: { contains: emailNeedle },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        ip: normalizedIp,
        createdAt: { gte: repeatedWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.adminLoginRestriction.findUnique({
      where: { ip: normalizedIp },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_BANNED',
        ip: normalizedIp,
        createdAt: { gte: repeatBanWindowStart },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT',
        ip: normalizedIp,
        createdAt: { gte: repeatedAlertCooldownStart },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  const softSnapshot = buildFailureSnapshot(
    softFailures,
    softPairFailures,
    softFirstSeen?.createdAt ?? null,
    softLastSeen?.createdAt ?? now,
  );
  const banSnapshot = buildFailureSnapshot(
    banFailures,
    banPairFailures,
    banFirstSeen?.createdAt ?? null,
    banLastSeen?.createdAt ?? now,
  );
  const repeatedSnapshot = buildFailureSnapshot(
    repeatedFailures,
    repeatedPairFailures,
    repeatedFirstSeen?.createdAt ?? null,
    now,
  );
  const riskSnapshot = await getRealtimeRiskSnapshot(normalizedIp, {
    email: input.email,
    now,
  });

  let restrictionType: 'LOCK' | 'BAN' | null = null;
  let failureCount = softSnapshot.ipCount;
  let pairFailureCount = softSnapshot.pairCount;
  let expiresAt: Date | null = null;
  let firstSeenAt: Date | null = softSnapshot.firstSeenAt;
  let lastSeenAt: Date | null = softSnapshot.lastSeenAt;
  let escalatedRepeatBan = false;

  if (banSnapshot.ipCount >= config.banThreshold) {
    restrictionType = 'BAN';
    failureCount = banSnapshot.ipCount;
    pairFailureCount = banSnapshot.pairCount;
    expiresAt = new Date(now.getTime() + config.banDurationMinutes * 60_000);
    firstSeenAt = banSnapshot.firstSeenAt;
    lastSeenAt = banSnapshot.lastSeenAt;
    if (repeatBanCount > 0) {
      const escalatedExpiresAt = new Date(now.getTime() + config.repeatedBanDurationMinutes * 60_000);
      if (escalatedExpiresAt > expiresAt) {
        expiresAt = escalatedExpiresAt;
        escalatedRepeatBan = true;
      }
    }
  } else if (softSnapshot.ipCount >= config.softLockThreshold) {
    restrictionType = 'LOCK';
    failureCount = softSnapshot.ipCount;
    pairFailureCount = softSnapshot.pairCount;
    expiresAt = new Date(now.getTime() + config.softLockDurationMinutes * 60_000);
    firstSeenAt = softSnapshot.firstSeenAt;
    lastSeenAt = softSnapshot.lastSeenAt;
  }

  if (!restrictionType || !expiresAt) {
    const thresholdTrigger =
      softSnapshot.ipCount >= Math.max(1, config.softLockThreshold - 1) &&
      softSnapshot.ipCount < config.softLockThreshold;
    if (thresholdTrigger) {
      try {
        const thresholdIncidentId = buildIncidentId(normalizedIp, softSnapshot.firstSeenAt);
        const suppression = await findActiveAlertSuppression({
          ip: normalizedIp,
          incidentId: thresholdIncidentId,
        });
        const shouldThresholdAlert = await shouldSendAlertForEvent(config, 'threshold', {
          scope: normalizedIp,
          level: riskSnapshot.level,
        });
        if (shouldThresholdAlert && !suppression) {
          await sendThresholdAlert({
            ip: normalizedIp,
            email: input.email,
            failureCount: softSnapshot.ipCount,
            pairFailureCount: softSnapshot.pairCount,
            firstSeenAt: softSnapshot.firstSeenAt,
            lastSeenAt: softSnapshot.lastSeenAt,
            host: input.host,
            path: input.path,
          });
          await writeAuditLog({
            action: 'AUTH_LOGIN_THRESHOLD_ALERT',
            entity: 'AUTH',
            ip: normalizedIp,
            details: {
              email: input.email,
              failureCount: softSnapshot.ipCount,
              pairFailureCount: softSnapshot.pairCount,
              firstSeenAt: softSnapshot.firstSeenAt?.toISOString() ?? null,
              lastSeenAt: softSnapshot.lastSeenAt?.toISOString() ?? null,
              host: input.host ?? null,
              path: input.path ?? null,
              riskScore: riskSnapshot.score,
              riskLevel: riskSnapshot.level,
            },
          });
          await markAlertSent('threshold', normalizedIp, now);
        }
      } catch (error) {
        console.error('Failed to send threshold alert:', error);
      }
    }
    return null;
  }

  const restriction = await db.adminLoginRestriction.upsert({
    where: { ip: normalizedIp },
    update: {
      restrictionType,
      attemptedEmail: input.email,
      failureCount,
      firstFailedAt:
        existing?.isActive && existing.firstFailedAt < (firstSeenAt ?? softWindowStart)
          ? existing.firstFailedAt
          : (firstSeenAt ?? softWindowStart),
      lastFailedAt: now,
      expiresAt,
      isActive: true,
      source: 'APP',
    },
    create: {
      ip: normalizedIp,
      restrictionType,
      attemptedEmail: input.email,
      failureCount,
      firstFailedAt: firstSeenAt ?? (restrictionType === 'BAN' ? banWindowStart : softWindowStart),
      lastFailedAt: now,
      expiresAt,
      isActive: true,
      source: 'APP',
    },
  });

  const shouldAlert =
    !existing ||
    !existing.isActive ||
    existing.restrictionType !== restrictionType ||
    existing.expiresAt <= now ||
    existing.expiresAt < expiresAt;

  if (shouldAlert) {
    await writeAuditLog({
      action: restrictionType === 'BAN' ? 'AUTH_LOGIN_BANNED' : 'AUTH_LOGIN_LOCKED',
      entity: 'AUTH',
      entityId: restriction.id,
      ip: normalizedIp,
      details: {
        email: input.email,
        failureCount,
        pairFailureCount,
        restrictionType,
        expiresAt: expiresAt.toISOString(),
        firstSeenAt: firstSeenAt?.toISOString() ?? null,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        host: input.host ?? null,
        path: input.path ?? null,
        repeatBanCount,
        escalatedRepeatBan,
      },
    });

    if (config.telegramAlertEnabled) {
      try {
        const restrictionIncidentId = buildIncidentId(normalizedIp, firstSeenAt);
        const suppression = await findActiveAlertSuppression({
          ip: normalizedIp,
          incidentId: restrictionIncidentId,
        });
        const shouldRestrictionAlert = await shouldSendAlertForEvent(
          config,
          restrictionType === 'BAN' ? 'ban' : 'lock',
          {
            scope: normalizedIp,
            level: riskSnapshot.level,
          },
        );
        if (shouldRestrictionAlert && !suppression) {
          await sendRestrictionAlert(restrictionType, {
            ip: normalizedIp,
            email: input.email,
            failureCount,
            pairFailureCount,
            expiresAt,
            firstSeenAt,
            lastSeenAt,
            host: input.host,
            path: input.path,
            escalated: escalatedRepeatBan,
          });
          await db.adminLoginRestriction.update({
            where: { ip: normalizedIp },
            data: { lastAlertSentAt: new Date() },
          });
          await markAlertSent(restrictionType === 'BAN' ? 'ban' : 'lock', normalizedIp, now);
        }
      } catch (error) {
        console.error('Failed to send admin login restriction alert:', error);
      }
    }
  }

  if (
    config.telegramAlertEnabled &&
    config.alertOnRepeatedOffender &&
    repeatedSnapshot.ipCount >= config.repeatedOffenderThreshold &&
    !recentRepeatedAlert &&
    !(shouldAlert && restrictionType)
  ) {
    try {
      const repeatedIncidentId = buildIncidentId(normalizedIp, repeatedSnapshot.firstSeenAt);
      const suppression = await findActiveAlertSuppression({
        ip: normalizedIp,
        incidentId: repeatedIncidentId,
      });
      const shouldRepeatedOffenderAlert = await shouldSendAlertForEvent(config, 'repeatedOffender', {
        scope: normalizedIp,
        level: riskSnapshot.level,
      });
      if (shouldRepeatedOffenderAlert && !suppression) {
        await sendRepeatedOffenderAlert({
          ip: normalizedIp,
          email: input.email,
          failureCount: repeatedSnapshot.ipCount,
          pairFailureCount: repeatedSnapshot.pairCount,
          firstSeenAt: repeatedSnapshot.firstSeenAt,
          lastAttemptAt: now,
          host: input.host,
          path: input.path,
        });
        await writeAuditLog({
          action: 'AUTH_LOGIN_REPEATED_OFFENDER_ALERT',
          entity: 'AUTH',
          entityId: restriction.id,
          ip: normalizedIp,
          details: {
            email: input.email,
            failureCount: repeatedSnapshot.ipCount,
            pairFailureCount: repeatedSnapshot.pairCount,
            threshold: config.repeatedOffenderThreshold,
            firstSeenAt: repeatedSnapshot.firstSeenAt?.toISOString() ?? null,
            lastAttemptAt: now.toISOString(),
            host: input.host ?? null,
            path: input.path ?? null,
            riskScore: riskSnapshot.score,
            riskLevel: riskSnapshot.level,
          },
        });
        await markAlertSent('repeatedOffender', normalizedIp, now);
      }
    } catch (error) {
      console.error('Failed to send repeated offender alert:', error);
    }
  }

  return restriction;
}

export async function unbanAdminLoginIp(ip: string) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return { success: false, unbanned: false };
  }

  const existing = await db.adminLoginRestriction.findUnique({
    where: { ip: normalizedIp },
  });

  if (existing) {
    await db.adminLoginRestriction.update({
      where: { ip: normalizedIp },
      data: {
        isActive: false,
        expiresAt: new Date(),
      },
    });

    await writeAuditLog({
      action: 'AUTH_LOGIN_UNBANNED',
      entity: 'AUTH',
      entityId: existing.id,
      ip: normalizedIp,
      details: {
        restrictionType: existing.restrictionType,
      },
    });
  }

  const fail2banUnbanned = tryFail2banUnban(normalizedIp);

  if (existing) {
    const config = await getAdminLoginProtectionConfig();
    const riskSnapshot = await getRealtimeRiskSnapshot(normalizedIp, {
      email: existing.attemptedEmail,
    });
    if (
      config.telegramAlertEnabled &&
      config.alertOnUnban &&
      (await shouldSendAlertForEvent(config, 'unban', {
        scope: normalizedIp,
        level: riskSnapshot.level,
      }))
    ) {
      try {
        await sendUnbanAlert(
          normalizedIp,
          existing.restrictionType,
          existing.attemptedEmail,
          fail2banUnbanned,
        );
        await markAlertSent('unban', normalizedIp, new Date());
      } catch (error) {
        console.error('Failed to send unban alert:', error);
      }
    }
  }

  return {
    success: Boolean(existing) || fail2banUnbanned,
    unbanned: Boolean(existing),
    fail2banUnbanned,
  };
}

async function getSecurityIncidentOrThrow(incidentId: string) {
  const overview = await getAdminLoginAbuseOverview();
  const incident = overview.securityIncidents.find((entry) => entry.id === incidentId);
  if (!incident) {
    throw new Error('Admin login incident not found');
  }

  return incident;
}

function buildSecurityRuleDescription(prefix: string, actorEmail: string, note?: string | null) {
  const suffix = note?.trim() ? ` — ${note.trim()}` : '';
  return `${prefix} by ${actorEmail}${suffix}`.slice(0, 255);
}

async function upsertSecurityRuleForIp(
  type: 'ALLOW' | 'BLOCK',
  ip: string,
  description: string,
) {
  const existing = await db.securityRule.findFirst({
    where: {
      type,
      targetType: 'IP',
      targetValue: ip,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return db.securityRule.update({
      where: { id: existing.id },
      data: {
        description,
        isActive: true,
      },
    });
  }

  return db.securityRule.create({
    data: {
      type,
      targetType: 'IP',
      targetValue: ip,
      description,
      isActive: true,
    },
  });
}

async function disableConflictingSecurityRules(ip: string, type: 'ALLOW' | 'BLOCK') {
  const conflictingType = type === 'ALLOW' ? 'BLOCK' : 'ALLOW';
  await db.securityRule.updateMany({
    where: {
      type: conflictingType,
      targetType: 'IP',
      targetValue: ip,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });
}

export async function acknowledgeAdminLoginIncident(
  incidentId: string,
  actorEmail: string,
  note?: string | null,
) {
  const incident = await getSecurityIncidentOrThrow(incidentId);
  const now = new Date();
  const entry = await updateIncidentWorkflowEntry(incidentId, (current) => ({
    status: 'ACKNOWLEDGED',
    notes: appendIncidentNote(current?.notes, actorEmail, note || ''),
    assignedToEmail: current?.assignedToEmail ?? null,
    assignedAt: current?.assignedAt ?? null,
    assignedByEmail: current?.assignedByEmail ?? null,
    acknowledgedAt: current?.acknowledgedAt ?? now.toISOString(),
    acknowledgedByEmail: current?.acknowledgedByEmail ?? actorEmail,
    resolvedAt: current?.resolvedAt ?? null,
    resolvedByEmail: current?.resolvedByEmail ?? null,
    updatedAt: now.toISOString(),
    updatedByEmail: actorEmail,
  }));

  await writeAuditLog({
    action: 'AUTH_LOGIN_INCIDENT_ACKNOWLEDGED',
    entity: 'AUTH',
    entityId: incidentId,
    ip: incident.ip,
    details: {
      actorEmail,
      note: note?.trim() || null,
      status: entry.status,
    },
  });

  return incident;
}

export async function resolveAdminLoginIncident(
  incidentId: string,
  actorEmail: string,
  note?: string | null,
) {
  const incident = await getSecurityIncidentOrThrow(incidentId);
  const now = new Date();
  const entry = await updateIncidentWorkflowEntry(incidentId, (current) => ({
    status: 'RESOLVED',
    notes: appendIncidentNote(current?.notes, actorEmail, note || ''),
    assignedToEmail: current?.assignedToEmail ?? null,
    assignedAt: current?.assignedAt ?? null,
    assignedByEmail: current?.assignedByEmail ?? null,
    acknowledgedAt: current?.acknowledgedAt ?? null,
    acknowledgedByEmail: current?.acknowledgedByEmail ?? null,
    resolvedAt: now.toISOString(),
    resolvedByEmail: actorEmail,
    updatedAt: now.toISOString(),
    updatedByEmail: actorEmail,
  }));

  await writeAuditLog({
    action: 'AUTH_LOGIN_INCIDENT_RESOLVED',
    entity: 'AUTH',
    entityId: incidentId,
    ip: incident.ip,
    details: {
      actorEmail,
      note: note?.trim() || null,
      status: entry.status,
    },
  });

  return incident;
}

export async function addAdminLoginIncidentNote(
  incidentId: string,
  actorEmail: string,
  note: string,
) {
  const incident = await getSecurityIncidentOrThrow(incidentId);
  const now = new Date();
  const entry = await updateIncidentWorkflowEntry(incidentId, (current) => ({
    status: current?.status ?? 'OPEN',
    notes: appendIncidentNote(current?.notes, actorEmail, note),
    assignedToEmail: current?.assignedToEmail ?? null,
    assignedAt: current?.assignedAt ?? null,
    assignedByEmail: current?.assignedByEmail ?? null,
    acknowledgedAt: current?.acknowledgedAt ?? null,
    acknowledgedByEmail: current?.acknowledgedByEmail ?? null,
    resolvedAt: current?.resolvedAt ?? null,
    resolvedByEmail: current?.resolvedByEmail ?? null,
    updatedAt: now.toISOString(),
    updatedByEmail: actorEmail,
  }));

  await writeAuditLog({
    action: 'AUTH_LOGIN_INCIDENT_NOTE_ADDED',
    entity: 'AUTH',
    entityId: incidentId,
    ip: incident.ip,
    details: {
      actorEmail,
      note: note.trim(),
      status: entry.status,
    },
  });

  return incident;
}

export async function assignAdminLoginIncident(input: AssignAdminLoginIncidentInput) {
  const incident = await getSecurityIncidentOrThrow(input.incidentId);
  const now = new Date();
  const normalizedAssignee = input.assignedToEmail?.trim().toLowerCase() || null;
  const assignmentMessage = normalizedAssignee
    ? `Assigned incident to ${normalizedAssignee}`
    : 'Cleared incident assignee';
  const entry = await updateIncidentWorkflowEntry(input.incidentId, (current) => ({
    status: current?.status ?? 'OPEN',
    notes: appendIncidentNote(
      current?.notes,
      input.actorEmail,
      input.note?.trim() ? `${assignmentMessage}. ${input.note.trim()}` : assignmentMessage,
    ),
    assignedToEmail: normalizedAssignee,
    assignedAt: normalizedAssignee ? now.toISOString() : null,
    assignedByEmail: normalizedAssignee ? input.actorEmail : null,
    acknowledgedAt: current?.acknowledgedAt ?? null,
    acknowledgedByEmail: current?.acknowledgedByEmail ?? null,
    resolvedAt: current?.resolvedAt ?? null,
    resolvedByEmail: current?.resolvedByEmail ?? null,
    updatedAt: now.toISOString(),
    updatedByEmail: input.actorEmail,
  }));

  await writeAuditLog({
    action: normalizedAssignee ? 'AUTH_LOGIN_INCIDENT_ASSIGNED' : 'AUTH_LOGIN_INCIDENT_UNASSIGNED',
    entity: 'AUTH',
    entityId: input.incidentId,
    ip: incident.ip,
    details: {
      actorEmail: input.actorEmail,
      note: input.note?.trim() || null,
      assignedToEmail: normalizedAssignee,
      status: entry.status,
    },
  });

  return incident;
}

export async function blockAdminLoginIpPermanently(
  ip: string,
  actorEmail: string,
  note?: string | null,
) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    throw new Error('Invalid IP address');
  }

  await disableConflictingSecurityRules(normalizedIp, 'BLOCK');
  const rule = await upsertSecurityRuleForIp(
    'BLOCK',
    normalizedIp,
    buildSecurityRuleDescription('Permanent admin-login block', actorEmail, note),
  );

  await writeAuditLog({
    action: 'AUTH_LOGIN_PERMANENT_BLOCK_RULE',
    entity: 'AUTH',
    entityId: rule.id,
    ip: normalizedIp,
    details: {
      actorEmail,
      note: note?.trim() || null,
    },
  });

  return rule;
}

export async function allowlistAdminLoginIp(
  ip: string,
  actorEmail: string,
  note?: string | null,
) {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    throw new Error('Invalid IP address');
  }

  await disableConflictingSecurityRules(normalizedIp, 'ALLOW');
  const rule = await upsertSecurityRuleForIp(
    'ALLOW',
    normalizedIp,
    buildSecurityRuleDescription('Admin-login allowlist', actorEmail, note),
  );

  await unbanAdminLoginIp(normalizedIp);

  await writeAuditLog({
    action: 'AUTH_LOGIN_ALLOWLIST_RULE',
    entity: 'AUTH',
    entityId: rule.id,
    ip: normalizedIp,
    details: {
      actorEmail,
      note: note?.trim() || null,
    },
  });

  return rule;
}

export async function promoteAdminLoginIpToPermanentRule(
  ip: string,
  actorEmail: string,
  note?: string | null,
) {
  return blockAdminLoginIpPermanently(ip, actorEmail, note || 'Promoted from security incident');
}

export async function saveAdminLoginSavedView(input: {
  id?: string | null;
  name: string;
  filters: AdminLoginSavedView['filters'];
  actorEmail: string;
}) {
  const now = new Date().toISOString();
  const existing = await getSavedViews();
  const id = input.id?.trim() || `view_${Date.now().toString(36)}`;
  const nextView = adminLoginSavedViewSchema.parse({
    id,
    name: input.name.trim(),
    createdAt: existing.find((view) => view.id === id)?.createdAt ?? now,
    updatedAt: now,
    createdByEmail: existing.find((view) => view.id === id)?.createdByEmail ?? input.actorEmail,
    filters: input.filters,
  });

  const updated = [
    ...existing.filter((view) => view.id !== id),
    nextView,
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  await saveSavedViews(updated);
  return nextView;
}

export async function deleteAdminLoginSavedView(id: string) {
  const existing = await getSavedViews();
  const next = existing.filter((view) => view.id !== id);
  await saveSavedViews(next);
  return { success: existing.length !== next.length };
}

export async function suppressAdminLoginAlerts(input: {
  scopeType: AdminLoginAlertSuppressionScope;
  scopeValue: string;
  durationMinutes: number;
  actorEmail: string;
  reason?: string | null;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(1, input.durationMinutes) * 60_000);
  const active = await getAlertSuppressionsMap();
  const nextEntry = adminLoginAlertSuppressionEntrySchema.parse({
    id: `${input.scopeType}:${input.scopeValue}`,
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
    reason: input.reason?.trim() || '',
    createdAt: now.toISOString(),
    createdByEmail: input.actorEmail,
    expiresAt: expiresAt.toISOString(),
  });

  const next = [
    ...active.filter(
      (entry) => !(entry.scopeType === input.scopeType && entry.scopeValue === input.scopeValue),
    ),
    nextEntry,
  ];
  await saveAlertSuppressions(next);

  await writeAuditLog({
    action: 'AUTH_LOGIN_ALERT_SUPPRESSED',
    entity: 'AUTH',
    entityId: nextEntry.id,
    ip: input.scopeType === 'IP' ? input.scopeValue : null,
    details: {
      actorEmail: input.actorEmail,
      scopeType: input.scopeType,
      scopeValue: input.scopeValue,
      reason: input.reason?.trim() || null,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return normalizeAlertSuppressionEntry(nextEntry);
}

export async function removeAdminLoginAlertSuppression(input: {
  scopeType: AdminLoginAlertSuppressionScope;
  scopeValue: string;
  actorEmail: string;
}) {
  const active = await getAlertSuppressionsMap();
  const next = active.filter(
    (entry) => !(entry.scopeType === input.scopeType && entry.scopeValue === input.scopeValue),
  );
  await saveAlertSuppressions(next);

  await writeAuditLog({
    action: 'AUTH_LOGIN_ALERT_UNSUPPRESSED',
    entity: 'AUTH',
    entityId: `${input.scopeType}:${input.scopeValue}`,
    ip: input.scopeType === 'IP' ? input.scopeValue : null,
    details: {
      actorEmail: input.actorEmail,
      scopeType: input.scopeType,
      scopeValue: input.scopeValue,
    },
  });

  return { success: active.length !== next.length };
}

export async function bulkUpdateAdminLoginIncidents(input: {
  incidentIds: string[];
  action: 'ACKNOWLEDGE' | 'RESOLVE' | 'MUTE' | 'UNMUTE' | 'ASSIGN' | 'UNASSIGN';
  actorEmail: string;
  note?: string | null;
  durationMinutes?: number | null;
  assignedToEmail?: string | null;
}) {
  const incidentIds = Array.from(new Set(input.incidentIds.map((id) => id.trim()).filter(Boolean)));
  if (incidentIds.length === 0) {
    return { success: true, processed: 0 };
  }

  for (const incidentId of incidentIds) {
    switch (input.action) {
      case 'ACKNOWLEDGE':
        await acknowledgeAdminLoginIncident(incidentId, input.actorEmail, input.note);
        break;
      case 'RESOLVE':
        await resolveAdminLoginIncident(incidentId, input.actorEmail, input.note);
        break;
      case 'MUTE':
        await suppressAdminLoginAlerts({
          scopeType: 'INCIDENT',
          scopeValue: incidentId,
          durationMinutes: Math.max(1, input.durationMinutes ?? 60),
          actorEmail: input.actorEmail,
          reason: input.note,
        });
        break;
      case 'UNMUTE':
        await removeAdminLoginAlertSuppression({
          scopeType: 'INCIDENT',
          scopeValue: incidentId,
          actorEmail: input.actorEmail,
        });
        break;
      case 'ASSIGN':
        await assignAdminLoginIncident({
          incidentId,
          actorEmail: input.actorEmail,
          assignedToEmail: input.assignedToEmail,
          note: input.note,
        });
        break;
      case 'UNASSIGN':
        await assignAdminLoginIncident({
          incidentId,
          actorEmail: input.actorEmail,
          assignedToEmail: null,
          note: input.note,
        });
        break;
    }
  }

  return { success: true, processed: incidentIds.length };
}

export async function bulkUpdateAdminLoginIps(input: {
  ips: string[];
  action: 'BLOCK' | 'ALLOWLIST' | 'PROMOTE' | 'MUTE' | 'UNMUTE' | 'UNBAN';
  actorEmail: string;
  note?: string | null;
  durationMinutes?: number | null;
}) {
  const ips = Array.from(new Set(input.ips.map((ip) => normalizeIpAddress(ip)).filter(Boolean))) as string[];
  if (ips.length === 0) {
    return { success: true, processed: 0 };
  }

  for (const ip of ips) {
    switch (input.action) {
      case 'BLOCK':
        await blockAdminLoginIpPermanently(ip, input.actorEmail, input.note);
        break;
      case 'ALLOWLIST':
        await allowlistAdminLoginIp(ip, input.actorEmail, input.note);
        break;
      case 'PROMOTE':
        await promoteAdminLoginIpToPermanentRule(ip, input.actorEmail, input.note);
        break;
      case 'MUTE':
        await suppressAdminLoginAlerts({
          scopeType: 'IP',
          scopeValue: ip,
          durationMinutes: Math.max(1, input.durationMinutes ?? 60),
          actorEmail: input.actorEmail,
          reason: input.note,
        });
        break;
      case 'UNMUTE':
        await removeAdminLoginAlertSuppression({
          scopeType: 'IP',
          scopeValue: ip,
          actorEmail: input.actorEmail,
        });
        break;
      case 'UNBAN':
        await unbanAdminLoginIp(ip);
        break;
    }
  }

  return { success: true, processed: ips.length };
}

export async function getAdminLoginIncidentDetail(incidentId: string) {
  const overview = await getAdminLoginAbuseOverview();
  const incident = overview.securityIncidents.find((entry) => entry.id === incidentId);
  if (!incident) {
    throw new Error('Admin login incident not found');
  }

  const detailWindowStart = new Date(incident.startedAt.getTime() - 30 * 60_000);
  const detailWindowEnd = new Date(Math.max(Date.now(), incident.endedAt.getTime() + 30 * 60_000));
  const relevantActions = [
    ...INCIDENT_ACTIONS,
    'AUTH_LOGIN_THRESHOLD_ALERT',
    'AUTH_LOGIN_INCIDENT_ACKNOWLEDGED',
    'AUTH_LOGIN_INCIDENT_RESOLVED',
    'AUTH_LOGIN_INCIDENT_NOTE_ADDED',
    'AUTH_LOGIN_ALERT_SUPPRESSED',
    'AUTH_LOGIN_ALERT_UNSUPPRESSED',
    'AUTH_LOGIN_PERMANENT_BLOCK_RULE',
    'AUTH_LOGIN_ALLOWLIST_RULE',
  ];

  const rawEvents = await db.auditLog.findMany({
    where: {
      action: { in: relevantActions },
      OR: [
        {
          ip: incident.ip,
          createdAt: {
            gte: detailWindowStart,
            lte: detailWindowEnd,
          },
        },
        {
          entity: 'AUTH',
          entityId: incident.id,
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      action: true,
      ip: true,
      details: true,
      createdAt: true,
    },
    take: 100,
  });

  const events: AdminLoginIncidentDetailEvent[] = rawEvents.map((event) => {
    const details = parseAuditDetails(event.details);
    let freeformDetails: string | null = null;

    if (event.details) {
      try {
        const parsed = JSON.parse(event.details) as Record<string, unknown>;
        freeformDetails =
          typeof parsed.note === 'string'
            ? parsed.note
            : typeof parsed.reason === 'string'
              ? parsed.reason
              : typeof parsed.status === 'string'
                ? parsed.status
                : null;
      } catch {
        freeformDetails = null;
      }
    }

    return {
      id: event.id,
      action: event.action,
      label: getAdminLoginEventLabel(event.action),
      createdAt: event.createdAt,
      email: details.email,
      host: details.host,
      path: details.path,
      restrictionType: details.restrictionType,
      ip: event.ip,
      details: freeformDetails,
    };
  });

  const relatedRestrictions = overview.activeRestrictions.filter((entry) => entry.ip === incident.ip);
  const reputation = overview.ipReputation.find((entry) => entry.ip === incident.ip) ?? null;

  return {
    incident,
    noteEntries: parseIncidentNotes(incident.notes),
    events,
    relatedRestrictions,
    reputation,
  };
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export async function sendAdminLoginIncidentDigest(options?: {
  now?: Date;
  lookbackHours?: number;
  includeResolved?: boolean;
}) {
  const now = options?.now ?? new Date();
  const lookbackHours = Math.max(1, options?.lookbackHours ?? ADMIN_LOGIN_INCIDENT_DIGEST_LOOKBACK_HOURS);
  const includeResolved = options?.includeResolved ?? false;
  const overview = await getAdminLoginAbuseOverview();
  const config = await getTelegramConfig();

  if (!config || config.adminChatIds.length === 0) {
    return { sent: false as const, reason: 'telegram-not-configured' };
  }

  const windowStart = now.getTime() - lookbackHours * 60 * 60_000;
  const incidents = overview.securityIncidents.filter((incident) => {
    if (!includeResolved && incident.workflowStatus === 'RESOLVED') {
      return false;
    }
    if (incident.alertSuppression) {
      return false;
    }
    return incident.endedAt.getTime() >= windowStart;
  });

  const topIncidents = incidents.slice(0, 5);
  const lines = [
    '🛡️ <b>Admin login security digest</b>',
    '',
    `Window: last ${lookbackHours} hour(s)`,
    `Incidents: <b>${incidents.length}</b>`,
    `High-risk IPs: <b>${overview.ipReputation.filter((entry) => entry.level === 'HIGH' || entry.level === 'CRITICAL').length}</b>`,
    `Active restrictions: <b>${overview.summary.activeRestrictions}</b>`,
    `fail2ban currently banned: <b>${overview.fail2banStatus.currentlyBanned}</b>`,
  ];

  if (topIncidents.length > 0) {
    lines.push('', '<b>Top incidents</b>');
    for (const incident of topIncidents) {
      lines.push(
        `• <code>${incident.ip}</code> ${incident.countryCode ? `(${incident.countryCode}) ` : ''}- ${incident.summary}`,
      );
      lines.push(
        `  Status: ${incident.workflowStatus} · Severity: ${incident.severity} · Last seen: ${incident.endedAt.toISOString()}`,
      );
    }
  } else {
    lines.push('', 'No matching incidents in the selected window.');
  }

  await sendAdminAlert(lines.join('\n'), { parseMode: 'HTML' });

  await writeAuditLog({
    action: 'AUTH_LOGIN_INCIDENT_DIGEST_SENT',
    entity: 'AUTH',
    details: {
      lookbackHours,
      incidentCount: incidents.length,
      includeResolved,
    },
  });

  return {
    sent: true as const,
    incidentCount: incidents.length,
    adminChats: config.adminChatIds.length,
    lookbackHours,
  };
}

export async function runAdminLoginIncidentDigestCycle(input?: {
  force?: boolean;
  now?: Date;
}): Promise<AdminLoginIncidentDigestResult> {
  const force = input?.force ?? false;
  const now = input?.now ?? new Date();
  const config = await getAdminLoginProtectionConfig();

  if (!force && !config.incidentDigestEnabled) {
    return { skipped: true, reason: 'disabled' };
  }

  const telegramConfig = await getTelegramConfig();
  if (!telegramConfig || telegramConfig.adminChatIds.length === 0) {
    return { skipped: true, reason: 'telegram-not-configured' };
  }

  const lastRun = await db.settings.findUnique({
    where: { key: ADMIN_LOGIN_INCIDENT_DIGEST_STATE_KEY },
    select: { value: true },
  });

  if (!force) {
    const scheduled = new Date(now);
    scheduled.setHours(config.incidentDigestHour, config.incidentDigestMinute, 0, 0);

    if (now.getTime() < scheduled.getTime()) {
      return { skipped: true, reason: 'scheduled-time-not-reached' };
    }

    if (lastRun?.value) {
      const lastRunAt = new Date(lastRun.value);
      if (!Number.isNaN(lastRunAt.getTime()) && isSameLocalDay(lastRunAt, now)) {
        return { skipped: true, reason: 'already-ran-today' };
      }
    }
  }

  const result = await sendAdminLoginIncidentDigest({
    now,
    lookbackHours: config.incidentDigestLookbackHours,
    includeResolved: false,
  });

  if (!result.sent) {
    return { skipped: true, reason: result.reason };
  }

  await db.settings.upsert({
    where: { key: ADMIN_LOGIN_INCIDENT_DIGEST_STATE_KEY },
    create: {
      key: ADMIN_LOGIN_INCIDENT_DIGEST_STATE_KEY,
      value: now.toISOString(),
    },
    update: {
      value: now.toISOString(),
    },
  });

  return {
    skipped: false,
    incidentCount: result.incidentCount,
    adminChats: result.adminChats,
    lookbackHours: result.lookbackHours,
  };
}

export async function getAdminLoginAbuseOverview() {
  const config = await getAdminLoginProtectionConfig();
  const now = new Date();
  const incidentWindowStart = new Date(now.getTime() - INCIDENT_LOOKBACK_MS);
  const reputationWindowStart = new Date(now.getTime() - REPUTATION_LOOKBACK_MS);

  await db.adminLoginRestriction.updateMany({
    where: {
      isActive: true,
      expiresAt: { lte: now },
    },
    data: { isActive: false },
  });

  const [
    activeRestrictions,
    recentFailures,
    failuresLastHour,
    failuresLastDay,
    newDeviceLoginsLastDay,
    newCountryLoginsLastDay,
    recentAdminLogins,
    incidentLogs,
    reputationLogs,
    workflowMap,
    alertSuppressions,
    savedViews,
  ] = await Promise.all([
    db.adminLoginRestriction.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: now },
      },
      orderBy: [{ restrictionType: 'desc' }, { lastFailedAt: 'desc' }],
      take: 100,
    }),
    db.auditLog.findMany({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        createdAt: { gte: new Date(now.getTime() - 60 * 60_000) },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_NEW_DEVICE',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
    }),
    db.auditLog.count({
      where: {
        action: 'AUTH_LOGIN_NEW_COUNTRY',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
    }),
    db.auditLog.findMany({
      where: {
        action: 'AUTH_LOGIN_SUCCESS',
        userId: { not: null },
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        userId: true,
        ip: true,
        details: true,
        createdAt: true,
      },
    }),
    db.auditLog.findMany({
      where: {
        action: { in: [...INCIDENT_ACTIONS] },
        ip: { not: null },
        createdAt: { gte: incidentWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        ip: true,
        details: true,
        createdAt: true,
      },
    }),
    db.auditLog.findMany({
      where: {
        action: { in: [...INCIDENT_ACTIONS] },
        ip: { not: null },
        createdAt: { gte: reputationWindowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        ip: true,
        details: true,
        createdAt: true,
      },
    }),
    getIncidentWorkflowMap(),
    getAlertSuppressionsMap(),
    getSavedViews(),
  ]);

  const fail2banStatus = getFail2banStatus();
  try {
    await maybeSendFail2banUnavailableAlert(config, fail2banStatus);
  } catch (error) {
    console.error('Failed to send fail2ban overview alert:', error);
  }
  const fail2banBannedIps = new Set(fail2banStatus.bannedIps);
  const pendingApprovals = (await getAdminLoginPendingApprovalsInternal())
    .filter((entry) => entry.status === 'PENDING')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const activeRestrictionByIp = new Map(
    activeRestrictions.map((restriction) => [restriction.ip, restriction as AdminLoginRestrictionInfo]),
  );
  const geoIpCache = new Map<string, ReturnType<typeof getGeoIpCountry>>();
  const getCachedGeo = (ip: string) => {
    if (!geoIpCache.has(ip)) {
      geoIpCache.set(ip, getGeoIpCountry(ip));
    }

    return geoIpCache.get(ip)!;
  };
  const rawSecurityIncidents = buildSecurityIncidents(incidentLogs, {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  });
  const normalizedSuppressions = alertSuppressions
    .map((entry) => normalizeAlertSuppressionEntry(entry))
    .filter((entry): entry is AdminLoginAlertSuppression => Boolean(entry));
  const suppressionByIp = new Map(
    normalizedSuppressions
      .filter((entry) => entry.scopeType === 'IP')
      .map((entry) => [entry.scopeValue, entry]),
  );
  const suppressionByIncidentId = new Map(
    normalizedSuppressions
      .filter((entry) => entry.scopeType === 'INCIDENT')
      .map((entry) => [entry.scopeValue, entry]),
  );
  const ipReputation = buildIpReputation(reputationLogs, rawSecurityIncidents, {
    activeRestrictionByIp,
    fail2banBannedIps,
    now,
  });
  const reputationHistory = buildReputationHistory(reputationLogs, now, 14);

  const recentFailuresWithGeo = await Promise.all(
    recentFailures.map(async (failure) => {
      const details = parseAuditDetails(failure.details);
      const geo = failure.ip ? await getCachedGeo(failure.ip) : { countryCode: null };
      return {
        id: failure.id,
        ip: failure.ip,
        email: details.email,
        createdAt: failure.createdAt,
        countryCode: geo.countryCode,
      };
    }),
  );

  const recentAdminLoginsWithGeo = (
    await Promise.all(
      recentAdminLogins.map(async (entry) => {
        const details = parseAuditDetails(entry.details);
        if (details.role !== 'ADMIN') {
          return null;
        }
        const geo = entry.ip ? await getCachedGeo(entry.ip) : { countryCode: null };
        return {
          id: entry.id,
          userId: entry.userId,
          email: details.email,
          role: details.role,
          ip: entry.ip,
          countryCode: details.countryCode ?? geo.countryCode,
          deviceFingerprint: details.deviceFingerprint,
          deviceLabel: details.deviceLabel,
          browser: details.browser,
          os: details.os,
          deviceType: details.deviceType,
          host: details.host,
          path: details.path,
          via2FA: details.via2FA,
          method: details.method,
          newDevice: details.newDevice,
          newCountry: details.newCountry,
          createdAt: entry.createdAt,
        };
      }),
    )
  ).filter(Boolean) as AdminLoginSignInEntry[];

  const topOffenders = new Map<string, { ip: string; count: number; lastAttemptAt: Date; email: string | null }>();
  for (const failure of recentFailuresWithGeo) {
    const key = failure.ip || 'unknown';
    const current = topOffenders.get(key);
    if (!current) {
      topOffenders.set(key, {
        ip: key,
        count: 1,
        lastAttemptAt: failure.createdAt,
        email: failure.email,
      });
      continue;
    }

    current.count += 1;
    if (failure.createdAt > current.lastAttemptAt) {
      current.lastAttemptAt = failure.createdAt;
      current.email = failure.email;
    }
  }

  const securityIncidents = await Promise.all(
    rawSecurityIncidents.map(async (incident) => {
      const workflow = workflowMap[incident.id] ?? null;
      const assignedAt = parseStoredDate(workflow?.assignedAt);
      const acknowledgedAt = parseStoredDate(workflow?.acknowledgedAt);
      const resolvedAt = parseStoredDate(workflow?.resolvedAt);
      const notes = workflow?.notes?.trim() || null;
      const geo = await getCachedGeo(incident.ip);
      const enrichment = await getIpEnrichment(incident.ip);
      return {
        ...incident,
        countryCode: geo.countryCode,
        workflowStatus: deriveWorkflowStatus(incident, workflow),
        notes,
        notesPreview: notes ? notes.split('\n').slice(-1)[0] : null,
        assignedToEmail: workflow?.assignedToEmail?.trim() || null,
        assignedAt,
        assignedByEmail: workflow?.assignedByEmail?.trim() || null,
        acknowledgedAt,
        acknowledgedByEmail: workflow?.acknowledgedByEmail ?? null,
        resolvedAt,
        resolvedByEmail: workflow?.resolvedByEmail ?? null,
        enrichment,
        alertSuppression:
          suppressionByIncidentId.get(incident.id) ??
          suppressionByIp.get(incident.ip) ??
          null,
      };
    }),
  );

  const enrichedReputation = await Promise.all(
    ipReputation.map(async (entry) => ({
      ...entry,
      countryCode: (await getCachedGeo(entry.ip)).countryCode,
      enrichment: await getIpEnrichment(entry.ip),
      alertSuppression: suppressionByIp.get(entry.ip) ?? null,
    })),
  );

  return {
    config,
    summary: {
      failuresLastHour,
      failuresLastDay,
      activeRestrictions: activeRestrictions.length,
      activeBans: activeRestrictions.filter((item) => item.restrictionType === 'BAN').length,
      newDeviceLoginsLastDay,
      newCountryLoginsLastDay,
      pendingApprovals: pendingApprovals.length,
    },
    activeRestrictions,
    pendingApprovals,
    recentFailures: recentFailuresWithGeo,
    recentAdminLogins: recentAdminLoginsWithGeo,
    topOffenders: Array.from(topOffenders.values())
      .sort((a, b) => b.count - a.count || b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime())
      .slice(0, 20),
    securityIncidents,
    ipReputation: enrichedReputation,
    reputationHistory,
    fail2banStatus,
    activeAlertSuppressions: normalizedSuppressions,
    savedViews,
  };
}

function csvEscape(value: string | number | boolean | null | undefined) {
  const normalized = value == null ? '' : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

export async function exportAdminLoginIncidents(format: 'csv' | 'json') {
  const overview = await getAdminLoginAbuseOverview();
  const rows = overview.securityIncidents.map((incident) => ({
    ip: incident.ip,
    countryCode: incident.countryCode || '',
    severity: incident.severity,
    status: incident.status,
    activeRestrictionType: incident.activeRestrictionType || '',
    currentlyBanned: incident.currentlyBanned,
    startedAt: incident.startedAt.toISOString(),
    endedAt: incident.endedAt.toISOString(),
    failureCount: incident.failureCount,
    lockCount: incident.lockCount,
    banCount: incident.banCount,
    repeatedOffenderCount: incident.repeatedOffenderCount,
    unbanCount: incident.unbanCount,
    attemptedEmails: incident.attemptedEmails.join('; '),
    hosts: incident.hosts.join('; '),
    paths: incident.paths.join('; '),
    summary: incident.summary,
    assignedToEmail: incident.assignedToEmail || '',
  }));

  if (format === 'json') {
    return {
      filename: `admin-login-incidents-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(rows, null, 2),
      type: 'application/json',
    };
  }

  const headers = [
    'ip',
    'countryCode',
    'severity',
    'status',
    'activeRestrictionType',
    'currentlyBanned',
    'startedAt',
    'endedAt',
    'failureCount',
    'lockCount',
    'banCount',
    'repeatedOffenderCount',
    'unbanCount',
    'attemptedEmails',
    'hosts',
    'paths',
    'summary',
  ];
  const content = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(',')),
  ].join('\n');

  return {
    filename: `admin-login-incidents-${new Date().toISOString().slice(0, 10)}.csv`,
    content,
    type: 'text/csv;charset=utf-8;',
  };
}
