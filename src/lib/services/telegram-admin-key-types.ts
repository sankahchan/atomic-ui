import { type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramAdminActor } from '@/lib/services/telegram-admin-core';
import { type TelegramAdminKeyDeps } from '@/lib/services/telegram-domain-types';
import { type RecipientTarget } from '@/lib/services/telegram-admin-key-recipients';

export type AccessCreateDraft = {
  kind: 'create_access';
  step: 'recipient' | 'name' | 'server' | 'quota_custom' | 'expiry_date' | 'confirm';
  recipient: RecipientTarget | null;
  name: string | null;
  assignmentMode: 'AUTO' | 'MANUAL';
  serverId: string | null;
  dataLimitGB: number | null;
  expirationType: 'NEVER' | 'FIXED_DATE' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE';
  durationDays: number | null;
  expiresAt: string | null;
};

export type DynamicCreateDraft = {
  kind: 'create_dynamic';
  step: 'recipient' | 'name' | 'type' | 'quota_custom' | 'expiry_date' | 'confirm';
  recipient: RecipientTarget | null;
  name: string | null;
  keyType: 'SELF_MANAGED' | 'MANUAL';
  dataLimitGB: number | null;
  expirationType: 'NEVER' | 'FIXED_DATE' | 'DURATION_FROM_CREATION';
  durationDays: number | null;
  expiresAt: string | null;
};

export type AccessManageDraft = {
  kind: 'manage_access';
  step:
    | 'query'
    | 'actions'
    | 'quota_custom'
    | 'add_quota_custom'
    | 'expiry_date'
    | 'confirm_resetusage'
    | 'confirm_toggle';
  keyId: string | null;
};

export type DynamicManageDraft = {
  kind: 'manage_dynamic';
  step:
    | 'query'
    | 'actions'
    | 'quota_custom'
    | 'add_quota_custom'
    | 'expiry_date'
    | 'region_pick'
    | 'confirm_resetusage';
  dynamicKeyId: string | null;
};

export type SupportReplyDraft = {
  kind: 'support_reply';
  step: 'message';
  threadId: string;
  customerChatId: string;
  recipientLabel: string;
};

export type DirectMessageDraft = {
  kind: 'direct_message';
  step: 'message';
  recipientChatId: string;
  recipientLabel: string;
  userId: string | null;
  accessKeyId: string | null;
  dynamicKeyId: string | null;
};

export type PendingAdminFlow =
  | AccessCreateDraft
  | DynamicCreateDraft
  | AccessManageDraft
  | DynamicManageDraft
  | SupportReplyDraft
  | DirectMessageDraft;

export const TELEGRAM_REPLY_RECIPIENT_PREFIX = 'reply-user:';

export type TelegramAdminCreateAccessKeyInput = {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
  argsText: string;
  deps: TelegramAdminKeyDeps;
};

export type TelegramAdminCreateDynamicKeyInput = TelegramAdminCreateAccessKeyInput;

export type TelegramAdminManageAccessKeyInput = {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
  deps: TelegramAdminKeyDeps;
};

export type TelegramAdminManageDynamicKeyInput = TelegramAdminManageAccessKeyInput;
