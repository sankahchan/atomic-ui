/**
 * Type Definitions for Atomic-UI
 * 
 * This file contains shared TypeScript types and interfaces used throughout
 * the application. By centralizing types here, we ensure consistency across
 * components, API handlers, and database operations.
 * 
 * Note: Since SQLite doesn't support native enums, we define these as string
 * literal types that mirror the valid values documented in the Prisma schema.
 */

// ============================================
// Enum-like Types (SQLite uses strings)
// ============================================

/**
 * User roles for access control.
 * - ADMIN: Full system access, can manage users and settings
 * - STAFF: Can manage servers and keys, limited settings access
 * - VIEWER: Read-only access to dashboards and reports
 */
export type Role = 'ADMIN' | 'STAFF' | 'VIEWER';

/**
 * Access key status values.
 * - ACTIVE: Key is usable and within limits
 * - DISABLED: Key has been manually disabled
 * - EXPIRED: Key has passed its expiration date
 * - DEPLETED: Key has exceeded its data limit
 * - PENDING: Key is waiting for first use (START_ON_FIRST_USE)
 */
export type KeyStatus = 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED' | 'PENDING';

/**
 * Expiration type determines how key lifetime is calculated.
 * - NEVER: Key never expires
 * - FIXED_DATE: Key expires on a specific date
 * - DURATION_FROM_CREATION: Key expires X days after creation
 * - START_ON_FIRST_USE: Key expires X days after first connection
 */
export type ExpirationType = 'NEVER' | 'FIXED_DATE' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE';

/**
 * Dynamic Access Key management types.
 * - SELF_MANAGED: System automatically manages key pool
 * - MANUAL: Admin manually assigns keys to the pool
 */
export type DakType = 'SELF_MANAGED' | 'MANUAL';

/**
 * Health check status for servers.
 * - UP: Server is responding normally
 * - DOWN: Server is not responding
 * - SLOW: Server is responding but with high latency
 * - UNKNOWN: Health check hasn't run yet
 */
export type HealthStatus = 'UP' | 'DOWN' | 'SLOW' | 'UNKNOWN';

/**
 * Notification channel types.
 * - TELEGRAM: Send notifications via Telegram bot
 * - EMAIL: Send notifications via email
 * - WEBHOOK: Send notifications to a webhook URL
 */
export type NotificationType = 'TELEGRAM' | 'EMAIL' | 'WEBHOOK';

// ============================================
// Server Types
// ============================================

/**
 * Server as returned from the database with computed fields.
 * This type extends the Prisma model with additional calculated properties.
 */
export interface ServerWithStats {
  id: string;
  name: string;
  apiUrl: string;
  apiCertSha256: string;
  location: string | null;
  countryCode: string | null;
  isDefault: boolean;
  isActive: boolean;
  maxKeys: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  
  // Outline server info (cached from API)
  outlineServerId: string | null;
  outlineName: string | null;
  outlineVersion: string | null;
  hostnameForAccessKeys: string | null;
  portForNewAccessKeys: number | null;
  metricsEnabled: boolean;
  lastSyncAt: Date | null;
  
  // Computed statistics
  _count?: {
    accessKeys: number;
  };
  tags?: TagInfo[];
  healthCheck?: HealthCheckInfo | null;
}

/**
 * Input for creating a new server.
 * These are the fields required when adding a server to Atomic-UI.
 */
export interface CreateServerInput {
  name: string;
  apiUrl: string;
  apiCertSha256: string;
  location?: string;
  countryCode?: string;
  isDefault?: boolean;
  tagIds?: string[];
  enableHealthCheck?: boolean;
}

/**
 * Input for updating an existing server.
 * All fields are optional since you might only update some properties.
 */
export interface UpdateServerInput {
  name?: string;
  location?: string;
  countryCode?: string;
  isDefault?: boolean;
  isActive?: boolean;
  maxKeys?: number | null;
  tagIds?: string[];
}

// ============================================
// Access Key Types
// ============================================

/**
 * Access key with all related data included.
 * This is the full representation of a key as used in the UI.
 */
export interface AccessKeyWithDetails {
  id: string;
  outlineKeyId: string;
  name: string;
  email: string | null;
  telegramId: string | null;
  notes: string | null;
  
  serverId: string;
  server?: {
    id: string;
    name: string;
    countryCode: string | null;
  };
  
  accessUrl: string | null;
  password: string | null;
  port: number | null;
  method: string | null;
  
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
  
  expirationType: ExpirationType;
  expiresAt: Date | null;
  durationDays: number | null;
  
  status: KeyStatus;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
  
  dynamicKeyId: string | null;
  prefix: string | null;
  subscriptionToken: string | null;
  
  createdAt: Date;
  updatedAt: Date;
  
  // Computed fields
  usagePercent?: number;
  daysRemaining?: number | null;
  isExpiringSoon?: boolean;
  isTrafficWarning?: boolean;
}

/**
 * Input for creating a new access key.
 * Combines Outline key creation with Atomic-UI metadata.
 */
export interface CreateAccessKeyInput {
  serverId: string;
  name: string;
  email?: string;
  telegramId?: string;
  notes?: string;
  
  // Traffic limit in bytes (null = unlimited)
  dataLimitBytes?: bigint | null;
  
  // Expiration settings
  expirationType: ExpirationType;
  expiresAt?: Date;
  durationDays?: number;
  
  // Optional features
  prefix?: string;
  dynamicKeyId?: string;
}

/**
 * Input for updating an existing access key.
 */
export interface UpdateAccessKeyInput {
  name?: string;
  email?: string;
  telegramId?: string;
  notes?: string;
  dataLimitBytes?: bigint | null;
  expirationType?: ExpirationType;
  expiresAt?: Date;
  durationDays?: number;
  status?: KeyStatus;
  prefix?: string;
}

/**
 * Bulk operation input for creating multiple keys.
 */
export interface BulkCreateKeysInput {
  serverIds: string[]; // Create on multiple servers
  count: number;
  namePrefix: string;
  dataLimitBytes?: bigint | null;
  expirationType: ExpirationType;
  durationDays?: number;
}

// ============================================
// Dynamic Access Key Types
// ============================================

/**
 * Dynamic access key with related access keys.
 */
export interface DynamicKeyWithDetails {
  id: string;
  name: string;
  type: DakType;
  serverTagsJson: string;
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
  expiresAt: Date | null;
  durationDays: number | null;
  expirationType: ExpirationType;
  status: KeyStatus;
  firstUsedAt: Date | null;
  dynamicUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  
  accessKeys?: AccessKeyWithDetails[];
  _count?: {
    accessKeys: number;
  };
}

/**
 * Input for creating a dynamic access key.
 */
export interface CreateDynamicKeyInput {
  name: string;
  type: DakType;
  serverTags?: string[];
  dataLimitBytes?: bigint | null;
  expirationType: ExpirationType;
  expiresAt?: Date;
  durationDays?: number;
}

// ============================================
// Tag Types
// ============================================

/**
 * Tag with server count.
 */
export interface TagInfo {
  id: string;
  name: string;
  color: string;
  description: string | null;
  _count?: {
    servers: number;
  };
}

/**
 * Input for creating or updating a tag.
 */
export interface TagInput {
  name: string;
  color?: string;
  description?: string;
}

// ============================================
// Health Check Types
// ============================================

/**
 * Health check status with last check info.
 */
export interface HealthCheckInfo {
  id: string;
  serverId: string;
  isEnabled: boolean;
  checkIntervalMins: number;
  notifyCooldownMins: number;
  latencyThresholdMs: number;
  lastStatus: HealthStatus;
  lastLatencyMs: number | null;
  lastCheckedAt: Date | null;
  lastNotifiedAt: Date | null;
  uptimePercent: number;
  totalChecks: number;
  successfulChecks: number;
}

/**
 * Input for updating health check settings.
 */
export interface UpdateHealthCheckInput {
  isEnabled?: boolean;
  checkIntervalMins?: number;
  notifyCooldownMins?: number;
  latencyThresholdMs?: number;
}

// ============================================
// Notification Types
// ============================================

/**
 * Notification channel configuration.
 */
export interface NotificationChannelInfo {
  id: string;
  type: NotificationType;
  name: string;
  config: TelegramConfig | EmailConfig | WebhookConfig;
  events: NotificationEvent[];
  isActive: boolean;
  createdAt: Date;
}

/**
 * Telegram notification configuration.
 */
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * Email notification configuration.
 */
export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  toAddresses: string[];
}

/**
 * Webhook notification configuration.
 */
export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
}

/**
 * Events that can trigger notifications.
 */
export type NotificationEvent =
  | 'SERVER_DOWN'
  | 'SERVER_UP'
  | 'KEY_EXPIRING'
  | 'KEY_EXPIRED'
  | 'TRAFFIC_WARNING'
  | 'TRAFFIC_DEPLETED'
  | 'LOGIN_ALERT'
  | 'DAILY_REPORT';

// ============================================
// Dashboard Types
// ============================================

/**
 * Dashboard statistics overview.
 */
export interface DashboardStats {
  totalServers: number;
  activeServers: number;
  downServers: number;
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  depletedKeys: number;
  pendingKeys: number;
  totalTrafficBytes: bigint;
  onlineClients: number;
  expiringIn24h: number;
  trafficWarningCount: number;
}

/**
 * Traffic data point for charts.
 */
export interface TrafficDataPoint {
  date: string;
  bytesIn: number;
  bytesOut: number;
  total: number;
}

/**
 * Server status for dashboard.
 */
export interface ServerStatusInfo {
  id: string;
  name: string;
  countryCode: string | null;
  status: HealthStatus;
  latencyMs: number | null;
  keyCount: number;
  trafficBytes: bigint;
}

// ============================================
// Settings Types
// ============================================

/**
 * Application settings structure.
 */
export interface AppSettings {
  siteName: string;
  siteDescription: string;
  defaultLanguage: 'en' | 'my';
  defaultTheme: 'light' | 'dark' | 'system';
  enableHealthChecks: boolean;
  healthCheckIntervalMins: number;
  enableNotifications: boolean;
  keyExpiryWarningDays: number;
  trafficWarningPercent: number;
  enableSubscriptionService: boolean;
  subscriptionPath: string;
}

// ============================================
// API Response Types
// ============================================

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * API error response.
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================
// Form Types
// ============================================

/**
 * Login form data.
 */
export interface LoginFormData {
  username: string;
  password: string;
  totpCode?: string;
  rememberMe?: boolean;
}

/**
 * Change password form data.
 */
export interface ChangePasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
