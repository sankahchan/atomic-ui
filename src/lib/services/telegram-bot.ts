/**
 * Telegram Bot Service
 *
 * Telegram is treated as a first-class user/admin surface:
 * - onboarding via deep-link /start tokens
 * - direct share-page delivery
 * - user self-service commands
 * - admin operational commands
 * - admin alerts and scheduled digest delivery
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import QRCode from 'qrcode';
import si from 'systeminformation';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { createOutlineClient } from '@/lib/outline-api';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import {
  buildDynamicOutlineUrl,
  buildDynamicSharePageUrl,
  buildDynamicShortClientUrl,
  buildDynamicShortShareUrl,
  buildDynamicSubscriptionApiUrl,
  buildSharePageUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
} from '@/lib/subscription-links';
import {
  recordSubscriptionPageEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import {
  normalizeLocalizedTemplateMap,
  resolveLocalizedTemplate,
  type LocalizedTemplateMap,
} from '@/lib/localized-templates';
import { formatBytes, generateRandomString } from '@/lib/utils';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const TELEGRAM_CONNECT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TelegramParseMode = 'HTML' | 'Markdown';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
}

export interface TelegramConfig {
  botToken: string;
  botUsername?: string;
  adminChatIds: string[];
  welcomeMessage?: string;
  keyNotFoundMessage?: string;
  localizedWelcomeMessages?: LocalizedTemplateMap;
  localizedKeyNotFoundMessages?: LocalizedTemplateMap;
  dailyDigestEnabled?: boolean;
  dailyDigestHour?: number;
  dailyDigestMinute?: number;
  digestLookbackHours?: number;
}

interface SendMessageOptions {
  parseMode?: TelegramParseMode;
  replyMarkup?: Record<string, unknown>;
  disableWebPagePreview?: boolean;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCommandKeyboard(isAdmin: boolean) {
  const keyboard = [
    [{ text: '/usage' }, { text: '/mykeys' }],
    [{ text: '/sub' }, { text: '/support' }],
    [{ text: '/renew' }, { text: '/help' }],
  ];

  if (isAdmin) {
    keyboard.push([{ text: '/status' }, { text: '/expiring' }]);
    keyboard.push([{ text: '/find' }, { text: '/sysinfo' }]);
  }

  return {
    keyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function getFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

async function getTelegramDefaultLocale(): Promise<SupportedLocale> {
  const setting = await db.settings.findUnique({
    where: { key: 'defaultLanguage' },
    select: { value: true },
  });

  return coerceSupportedLocale(setting?.value) || 'en';
}

function getTelegramUi(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';

  return {
    unlimited: isMyanmar ? 'အကန့်အသတ်မရှိ' : 'Unlimited',
    startsOnFirstUse: (days?: number | null) =>
      isMyanmar
        ? days
          ? `ပထမအသုံးပြုချိန်မှ စတင်မည် (${days} ရက်)`
          : 'ပထမအသုံးပြုချိန်မှ စတင်မည်'
        : days
          ? `Starts on first use (${days} days)`
          : 'Starts on first use',
    never: isMyanmar ? 'မကုန်ဆုံးပါ' : 'Never',
    expiredOn: (date: string) => (isMyanmar ? `${date} တွင် သက်တမ်းကုန်ပြီး` : `Expired on ${date}`),
    daysLeft: (days: number, date: string) =>
      isMyanmar ? `${days} ရက်ခန့် ကျန်သည် (${date})` : `${days} day(s) left (${date})`,
    openSharePage: isMyanmar ? 'Share Page ဖွင့်မည်' : 'Open Share Page',
    openSubscriptionUrl: isMyanmar ? 'Subscription URL ဖွင့်မည်' : 'Open Subscription URL',
    openClientEndpoint: isMyanmar ? 'Client Endpoint ဖွင့်မည်' : 'Open Client Endpoint',
    getSupport: isMyanmar ? 'အကူအညီ ရယူမည်' : 'Get Support',
    accessShareFallback: isMyanmar
      ? 'အောက်ပါ share page ကိုဖွင့်ပြီး install လုပ်နည်း၊ manual setup နှင့် နောက်ဆုံး connection အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။'
      : 'Open the share page below for install steps, manual setup, and the latest connection details.',
    dynamicShareFallback: isMyanmar
      ? 'အောက်ပါ share page ကိုဖွင့်ပြီး install လုပ်နည်း၊ manual setup နှင့် backend အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။'
      : 'Open the share page below for install steps, manual setup, and the latest backend details.',
    dynamicShareDisabledFallback: isMyanmar
      ? 'ဤ key အတွက် share page ကို ပိတ်ထားသည်။ Outline သို့မဟုတ် compatible client ထဲတွင် အောက်ပါ client endpoint ကို အသုံးပြုပါ။'
      : 'The share page is disabled for this key. Use the client endpoint below inside Outline or another compatible client.',
    accessQrCaption: isMyanmar
      ? 'Direct import မရပါက ဤ QR code ကို သင့် VPN client ဖြင့် scan လုပ်ပါ။'
      : 'Scan this QR code with your VPN client if direct import is unavailable.',
    dynamicQrCaption: isMyanmar
      ? 'Direct import မရပါက Outline သို့မဟုတ် compatible client ဖြင့် ဤ QR code ကို scan လုပ်ပါ။'
      : 'Scan this QR code with Outline or another compatible client if direct import is unavailable.',
    accessReasonTitle: (reason?: string) =>
      reason === 'CREATED'
        ? (isMyanmar ? '🎉 <b>သင့် access key အသင့်ဖြစ်ပါပြီ</b>' : '🎉 <b>Your access key is ready</b>')
        : reason === 'KEY_ENABLED'
          ? (isMyanmar ? '✅ <b>သင့် access key ကို ပြန်ဖွင့်ပြီးပါပြီ</b>' : '✅ <b>Your access key has been re-enabled</b>')
          : reason === 'LINKED'
            ? (isMyanmar ? '🔗 <b>Telegram ချိတ်ဆက်မှု အောင်မြင်ပါသည်</b>' : '🔗 <b>Telegram linked successfully</b>')
            : reason === 'USAGE_REQUEST'
              ? (isMyanmar ? '📊 <b>သင့် VPN အသုံးပြုမှု အသေးစိတ်</b>' : '📊 <b>Your VPN access details</b>')
              : reason === 'SUBSCRIPTION_REQUEST'
                ? (isMyanmar ? '📎 <b>သင့် subscription link များ</b>' : '📎 <b>Your subscription links</b>')
                : (isMyanmar ? '📨 <b>သင့် share page</b>' : '📨 <b>Your share page</b>'),
    dynamicReasonTitle: (reason?: string) =>
      reason === 'CREATED'
        ? (isMyanmar ? '🎉 <b>သင့် dynamic key အသင့်ဖြစ်ပါပြီ</b>' : '🎉 <b>Your dynamic key is ready</b>')
        : reason === 'KEY_ENABLED'
          ? (isMyanmar ? '✅ <b>သင့် dynamic key ကို ပြန်ဖွင့်ပြီးပါပြီ</b>' : '✅ <b>Your dynamic key has been re-enabled</b>')
          : reason === 'LINKED'
            ? (isMyanmar ? '🔗 <b>Telegram ချိတ်ဆက်မှု အောင်မြင်ပါသည်</b>' : '🔗 <b>Telegram linked successfully</b>')
            : reason === 'USAGE_REQUEST'
              ? (isMyanmar ? '📊 <b>သင့် dynamic VPN အသေးစိတ်</b>' : '📊 <b>Your dynamic VPN access details</b>')
              : reason === 'SUBSCRIPTION_REQUEST'
                ? (isMyanmar ? '📎 <b>သင့် dynamic subscription link များ</b>' : '📎 <b>Your dynamic subscription links</b>')
                : (isMyanmar ? '📨 <b>သင့် dynamic share page</b>' : '📨 <b>Your dynamic share page</b>'),
    modeSelfManaged: isMyanmar ? 'Self-Managed' : 'Self-Managed',
    modeManual: isMyanmar ? 'Manual' : 'Manual',
    coverageAutoSelected: isMyanmar ? 'Fetch လုပ်ချိန်တွင် အလိုအလျောက် ရွေးမည်' : 'Auto-selected at fetch time',
    lifecycleDisabledTitle: isMyanmar ? '⛔ <b>သင့် access key ကို ပိတ်ထားပါသည်</b>' : '⛔ <b>Your access key has been disabled</b>',
    lifecycleDisabledBody: isMyanmar ? 'Administrator က ပြန်ဖွင့်ပေးသည့်အထိ traffic ကို အသုံးမပြုနိုင်ပါ။' : 'Traffic is blocked until the key is re-enabled by an administrator.',
    lifecycleExpiring7Title: isMyanmar ? '⏳ <b>သင့် access key သက်တမ်း မကြာမီကုန်မည်</b>' : '⏳ <b>Your access key will expire soon</b>',
    lifecycleExpiring7Body: (days: number) => isMyanmar ? `သက်တမ်းကုန်ရန် ${days} ရက်ခန့် ကျန်ပါသည်။` : `There are about ${days} day(s) left before expiration.`,
    lifecycleExpiring1Title: isMyanmar ? '⚠️ <b>သင့် access key သက်တမ်း အလွန်နီးကပ်ပါပြီ</b>' : '⚠️ <b>Your access key expires very soon</b>',
    lifecycleExpiring1Body: (days: number) => isMyanmar ? `${days} ရက်ခန့်သာ ကျန်ပါသည်။` : `Only about ${days} day(s) remain.`,
    lifecycleExpiredTitle: isMyanmar ? '⌛ <b>သင့် access key သက်တမ်းကုန်သွားပါပြီ</b>' : '⌛ <b>Your access key has expired</b>',
    lifecycleExpiredBody: isMyanmar ? 'ဤ key ကို မလုပ်ဆောင်နိုင်တော့ပါ။ သက်တမ်းတိုးလိုပါက support ကို ဆက်သွယ်ပါ။' : 'The key is no longer active. Contact support if it should be renewed.',
    startLinked: (username: string) => isMyanmar ? `✅ <b>${username}</b> အတွက် Telegram ချိတ်ဆက်ပြီးပါပြီ။\n\nလိုအပ်သည့်အချိန်တွင် /usage သို့မဟုတ် /mykeys ကို အသုံးပြုနိုင်ပါသည်။` : `✅ Telegram linked for <b>${username}</b>.\n\nUse /usage or /mykeys to fetch your keys any time.`,
    linkExpired: isMyanmar ? '⚠️ ဤ Telegram link သက်တမ်းကုန်သွားပါပြီ။ Admin ထံမှ link အသစ်တောင်းပါ။' : '⚠️ This Telegram link has expired. Ask the admin to generate a new one.',
    linkInvalid: isMyanmar ? '❌ ဤ Telegram link ကို မသုံးနိုင်တော့ပါ။ Admin ထံမှ link အသစ်တောင်းပါ။' : '❌ That Telegram link is not valid anymore. Ask the admin for a fresh link.',
    welcomeBack: (username: string) => isMyanmar ? `✅ ပြန်လည်ကြိုဆိုပါသည်၊ <b>${username}</b>!\n\nသင့် account သည် ချိတ်ဆက်ပြီးဖြစ်သည်။ /usage သို့မဟုတ် /mykeys ကို အချိန်မရွေး အသုံးပြုနိုင်ပါသည်။` : `✅ Welcome back, <b>${username}</b>!\n\nYour account is already linked. Use /usage or /mykeys any time.`,
    accountLinked: (username: string) => isMyanmar ? `✅ Account ချိတ်ဆက်မှု အောင်မြင်ပါသည်!\n\nကြိုဆိုပါသည်၊ <b>${username}</b>! /usage သို့မဟုတ် /mykeys ကို အသုံးပြုနိုင်ပါသည်။` : `✅ Account linked successfully!\n\nWelcome, <b>${username}</b>! Use /usage or /mykeys to fetch your keys.`,
    adminRecognized: isMyanmar ? '\n\nသင့်ကို administrator အဖြစ် သတ်မှတ်ထားပါသည်။' : '\n\nYou are recognized as an administrator.',
    hello: (username: string, welcome: string, telegramUserId: number, adminMsg: string) =>
      isMyanmar
        ? `👋 မင်္ဂလာပါ၊ <b>${username}</b>!${adminMsg}\n\n${welcome}\n\nသင့် Telegram ID: <code>${telegramUserId}</code>`
        : `👋 Hello, <b>${username}</b>!${adminMsg}\n\n${welcome}\n\nYour Telegram ID: <code>${telegramUserId}</code>`,
    defaultWelcome: isMyanmar ? 'သင့် email ကို ပို့ပါ၊ သို့မဟုတ် admin ကို Telegram connect link ဖန်တီးပေးရန် တောင်းဆိုပါ။' : 'Send your email address, or ask your admin to generate a Telegram connect link from your key.',
    emailNoKeys: (email: string) => isMyanmar ? `❌ ${email} အတွက် key မတွေ့ပါ။` : `❌ No keys found for email: ${email}`,
    emailLinked: (count: number) => isMyanmar ? `✅ Key ${count} ခုကို ဤ Telegram account နှင့် ချိတ်ဆက်ပြီးပါပြီ။\n\n/access အသေးစိတ်ရရန် /usage သို့မဟုတ် /sub ကို အသုံးပြုပါ။` : `✅ Linked ${count} key(s) to this Telegram account.\n\nUse /usage or /sub to receive your access details.`,
    keyNotFoundDefault: isMyanmar ? '❌ ဤ Telegram account နှင့် ချိတ်ထားသော VPN key မရှိသေးပါ။\n\nသင့် email ကို ပို့ပါ သို့မဟုတ် admin ထံမှ Telegram connect link အသုံးပြုပါ။' : '❌ No VPN keys are linked to this Telegram account yet.\n\nSend your email address or use a Telegram connect link from the admin.',
    usageTitle: isMyanmar ? '📊 <b>သင့် VPN အသုံးပြုမှု</b>\n\n' : '📊 <b>Your VPN Usage</b>\n\n',
    myKeysEmpty: isMyanmar ? '❌ ဤ Telegram account နှင့် ချိတ်ထားသော key မရှိပါ။' : '❌ No linked keys found for this Telegram account.',
    myKeysTitle: isMyanmar ? '🗂 <b>သင့်နှင့် ချိတ်ထားသော key များ</b>' : '🗂 <b>Your linked keys</b>',
    subEmpty: isMyanmar ? '❌ ဤ Telegram account နှင့် ချိတ်ထားသော active key မရှိပါ။' : '❌ No active keys are linked to this Telegram account.',
    subSent: (count: number) => isMyanmar ? `📎 Share page ${count} ခုကို ဤ chat သို့ ပို့ပြီးပါပြီ။` : `📎 Sent ${count} share page(s) to this chat.`,
    noSupportLink: isMyanmar ? 'ℹ️ လက်ရှိ support link မသတ်မှတ်ရသေးပါ။' : 'ℹ️ No support link is configured right now.',
    supportLabel: isMyanmar ? '🛟 အကူအညီ' : '🛟 Support',
    keyLabel: isMyanmar ? 'Key' : 'Key',
    serverLabel: isMyanmar ? 'Server' : 'Server',
    statusLineLabel: isMyanmar ? 'Status' : 'Status',
    expirationLabel: isMyanmar ? 'Expiration' : 'Expiration',
    quotaLabel: isMyanmar ? 'Quota' : 'Quota',
    sharePageLabel: isMyanmar ? 'Share page' : 'Share page',
    subscriptionUrlLabel: isMyanmar ? 'Subscription URL' : 'Subscription URL',
    clientEndpointLabel: isMyanmar ? 'Client endpoint' : 'Client endpoint',
    outlineClientUrlLabel: isMyanmar ? 'Outline client URL' : 'Outline client URL',
    modeLabel: isMyanmar ? 'Mode' : 'Mode',
    backendsLabel: isMyanmar ? 'Backends' : 'Backends',
    coverageLabel: isMyanmar ? 'Coverage' : 'Coverage',
    idLabel: isMyanmar ? 'ID' : 'ID',
    emailLabel: isMyanmar ? 'Email' : 'Email',
    telegramIdLabel: isMyanmar ? 'Telegram ID' : 'Telegram ID',
    requesterLabel: isMyanmar ? 'Requester' : 'Requester',
    serversTitle: isMyanmar ? '🖥 <b>သင့် server များ</b>' : '🖥 <b>Your servers</b>',
    renewNoMatch: (query: string) => isMyanmar ? `❌ "${query}" နှင့် ကိုက်ညီသော linked key မရှိပါ။` : `❌ No linked key matched "${query}".`,
    renewSent: (count: number) => isMyanmar ? `✅ Key ${count} ခုအတွက် သက်တမ်းတိုးရန် တောင်းဆိုချက် ပို့ပြီးပါပြီ။ Administrator ကို အသိပေးထားပါသည်။` : `✅ Renewal request sent for ${count} key(s). An administrator has been notified.`,
    statusNoServers: isMyanmar ? '❌ Server မသတ်မှတ်ရသေးပါ။' : '❌ No servers configured.',
    statusTitle: isMyanmar ? '🖥️ <b>Server အခြေအနေ</b>\n\n' : '🖥️ <b>Server Status</b>\n\n',
    statusLabel: isMyanmar ? 'အခြေအနေ' : 'Status',
    latencyLabel: isMyanmar ? 'Latency' : 'Latency',
    uptimeLabel: isMyanmar ? 'Uptime' : 'Uptime',
    keysLabel: isMyanmar ? 'Key များ' : 'Keys',
    expiringNone: (days: number) => isMyanmar ? `✅ နောက် ${days} ရက်အတွင်း သက်တမ်းကုန်မည့် key မရှိပါ။` : `✅ No keys are expiring in the next ${days} day(s).`,
    expiringTitle: (days: number) => isMyanmar ? `⏳ <b>နောက် ${days} ရက်အတွင်း သက်တမ်းကုန်မည့် key များ</b>` : `⏳ <b>Keys expiring in the next ${days} day(s)</b>`,
    findUsage: isMyanmar ? '🔎 အသုံးပြုပုံ: /find <name, email, Telegram ID, key ID, or Outline ID>' : '🔎 Usage: /find <name, email, Telegram ID, key ID, or Outline ID>',
    findKeyFound: isMyanmar ? '🔎 <b>Key ကို တွေ့ရှိပါသည်</b>' : '🔎 <b>Key found</b>',
    findNoMatches: (query: string) => isMyanmar ? `❌ "${query}" နှင့် ကိုက်ညီသော access key မရှိပါ။` : `❌ No access keys matched "${query}".`,
    findMatches: (query: string) => isMyanmar ? `🔎 <b>"${query}" အတွက် ကိုက်ညီမှုများ</b>` : `🔎 <b>Matches for "${query}"</b>`,
    findProvideQuery: isMyanmar ? '❌ Key ID သို့မဟုတ် ရှာဖွေရန် စာသားတစ်ခု ထည့်ပါ။' : '❌ Please provide a key identifier or search term.',
    adminOnly: isMyanmar ? '❌ ဤ command ကို administrator များသာ အသုံးပြုနိုင်ပါသည်။' : '❌ This command is only available to administrators.',
    enableUsage: isMyanmar ? 'အသုံးပြုပုံ: /enable <key-id>' : 'Usage: /enable <key-id>',
    disableUsage: isMyanmar ? 'အသုံးပြုပုံ: /disable <key-id>' : 'Usage: /disable <key-id>',
    multiMatchUseIds: isMyanmar ? '⚠️ Key အများအပြား ကိုက်ညီနေပါသည်။ အောက်ပါ ID များထဲမှ တစ်ခုကို တိတိကျကျ အသုံးပြုပါ:' : '⚠️ Multiple keys matched. Use one of these exact IDs:',
    keyNotFound: isMyanmar ? '❌ Key မတွေ့ပါ။' : '❌ Key not found.',
    keyEnabled: (name: string) => isMyanmar ? `✅ <b>${name}</b> ကို ပြန်ဖွင့်ပြီးပါပြီ။` : `✅ Re-enabled <b>${name}</b>.`,
    keyDisabled: (name: string) => isMyanmar ? `⛔ <b>${name}</b> ကို ပိတ်လိုက်ပါပြီ။` : `⛔ Disabled <b>${name}</b>.`,
    resendUsage: isMyanmar ? 'အသုံးပြုပုံ: /resend <key-id>' : 'Usage: /resend <key-id>',
    resendMulti: isMyanmar ? '⚠️ Key အများအပြား ကိုက်ညီနေပါသည်။ တိတိကျကျ ID တစ်ခုကို အသုံးပြုပါ:' : '⚠️ Multiple keys matched. Use one exact ID:',
    resendFailed: (message: string) => isMyanmar ? `❌ ပြန်ပို့မှု မအောင်မြင်ပါ: ${message}` : `❌ Failed to resend: ${message}`,
    resendSuccess: (name: string) => isMyanmar ? `📨 <b>${name}</b> အတွက် share page ကို ပြန်ပို့ပြီးပါပြီ။` : `📨 Resent the share page for <b>${name}</b>.`,
    sysinfoGathering: isMyanmar ? '🔄 System information စုဆောင်းနေပါသည်...' : '🔄 Gathering system information...',
    sysinfoTitle: isMyanmar ? '<b>System Information</b> 🖥️' : '<b>System Information</b> 🖥️',
    sysinfoOs: isMyanmar ? 'OS' : 'OS',
    sysinfoCpu: isMyanmar ? 'CPU Load' : 'CPU Load',
    sysinfoMemory: isMyanmar ? 'Memory' : 'Memory',
    sysinfoDisk: isMyanmar ? 'Disk' : 'Disk',
    sysinfoFailed: isMyanmar ? '❌ System information မရယူနိုင်ပါ။' : '❌ Failed to retrieve system information.',
    backupCreating: isMyanmar ? '📦 Backup ဖန်တီးနေပါသည်... ကျေးဇူးပြု၍ ခဏစောင့်ပါ။' : '📦 Creating backup... please wait.',
    backupCaption: (date: string) => isMyanmar ? `${date} တွင် backup ဖန်တီးထားပါသည်` : `Backup created at ${date}`,
    backupFailed: (message: string) => isMyanmar ? `❌ Backup မအောင်မြင်ပါ: ${message}` : `❌ Backup failed: ${message}`,
    helpTitle: isMyanmar ? '📚 <b>အသုံးပြုနိုင်သော Command များ</b>' : '📚 <b>Available Commands</b>',
    helpEmailHint: isMyanmar ? 'ဤ Telegram account ကို ချိတ်ရန် သင့် email ကို တိုက်ရိုက် ပို့နိုင်ပါသည်။' : 'You can also send your email address directly to link this Telegram account.',
    unknownCommand: isMyanmar ? '❓ မသိသော command ဖြစ်သည်။ အသုံးပြုနိုင်သော command များကို ကြည့်ရန် /help ကို အသုံးပြုပါ။' : '❓ Unknown command. Use /help to see the available commands.',
    digestTitle: isMyanmar ? '🧾 <b>Atomic-UI Telegram အနှစ်ချုပ်</b>' : '🧾 <b>Atomic-UI Telegram Digest</b>',
    digestWindow: (hours: number) => isMyanmar ? `အချိန်ကာလ: နောက်ဆုံး ${hours} နာရီ` : `Window: last ${hours} hour(s)`,
    digestActiveKeys: isMyanmar ? 'Active key များ' : 'Active keys',
    digestPendingKeys: isMyanmar ? 'Pending key များ' : 'Pending keys',
    digestDepletedKeys: isMyanmar ? 'Depleted key များ' : 'Depleted keys',
    digestExpiringSoon: isMyanmar ? '၇ ရက်အတွင်း သက်တမ်းကုန်မည်' : 'Expiring in 7 days',
    digestOpenIncidents: isMyanmar ? 'ဖွင့်ထားသော incident များ' : 'Open incidents',
    digestEvents: isMyanmar ? 'Subscription page event များ' : 'Subscription page events',
    digestServerHealth: isMyanmar ? 'Server health' : 'Server health',
    digestHealthSummary: (up: number, slow: number, down: number, unknown: number) =>
      isMyanmar
        ? `${up} up, ${slow} slow, ${down} down, ${unknown} unknown`
        : `${up} up, ${slow} slow, ${down} down, ${unknown} unknown`,
  };
}

function formatExpirationSummary(key: {
  expiresAt?: Date | null;
  expirationType?: string | null;
  durationDays?: number | null;
}, locale: SupportedLocale = 'en') {
  const ui = getTelegramUi(locale);
  const localeCode = locale === 'my' ? 'my-MM' : 'en-US';
  if (!key.expiresAt) {
    if (key.expirationType === 'START_ON_FIRST_USE') {
      return ui.startsOnFirstUse(key.durationDays);
    }

    return ui.never;
  }

  const remainingMs = key.expiresAt.getTime() - Date.now();
  const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  const dateText = key.expiresAt.toLocaleDateString(localeCode);

  if (daysLeft <= 0) {
    return ui.expiredOn(dateText);
  }

  return ui.daysLeft(daysLeft, dateText);
}

async function getSubscriptionDefaults() {
  const settings = await db.settings.findMany({
    where: {
      key: {
        in: [
          'supportLink',
          'subscriptionWelcomeMessage',
          'subscriptionLocalizedWelcomeMessages',
          'defaultLanguage',
        ],
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  const settingsMap = new Map(settings.map((item) => [item.key, item.value]));

  return {
    supportLink: settingsMap.get('supportLink') || null,
    welcomeMessage: settingsMap.get('subscriptionWelcomeMessage') || null,
    localizedWelcomeMessages: normalizeLocalizedTemplateMap(
      settingsMap.get('subscriptionLocalizedWelcomeMessages'),
    ),
    defaultLanguage: coerceSupportedLocale(settingsMap.get('defaultLanguage')) || 'en',
  };
}

async function getTelegramBotUsername(botToken: string, configuredUsername?: string | null) {
  if (configuredUsername && configuredUsername.trim()) {
    return configuredUsername.replace(/^@/, '').trim();
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/getMe`);
    const data = (await response.json()) as {
      ok?: boolean;
      result?: {
        username?: string;
      };
    };

    if (data.ok && data.result?.username) {
      return data.result.username.replace(/^@/, '').trim();
    }
  } catch (error) {
    console.error('Failed to resolve Telegram bot username:', error);
  }

  return null;
}

async function ensureAccessKeySubscriptionToken(accessKeyId: string, existingToken?: string | null) {
  if (existingToken) {
    return existingToken;
  }

  const token = generateRandomString(32);
  await db.accessKey.update({
    where: { id: accessKeyId },
    data: { subscriptionToken: token },
  });
  return token;
}

async function getActiveNotificationChannelIds(event: string) {
  const { channelSupportsEvent, parseNotificationChannelRecord } = await import(
    '@/lib/services/notification-channels'
  );

  const channels = await db.notificationChannel.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      config: true,
      events: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return channels
    .map((channel) => parseNotificationChannelRecord(channel))
    .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
    .filter((channel) => channelSupportsEvent(channel, event as never))
    .map((channel) => channel.id);
}

async function enqueueChannelNotification(input: {
  event: string;
  message: string;
  accessKeyId?: string;
  payload?: Record<string, unknown>;
  cooldownKey?: string;
}) {
  const channelIds = await getActiveNotificationChannelIds(input.event);
  if (channelIds.length === 0) {
    return null;
  }

  const { enqueueNotificationsForChannels } = await import('@/lib/services/notification-queue');

  return enqueueNotificationsForChannels({
    channelIds,
    event: input.event,
    message: input.message,
    payload: input.payload,
    accessKeyId: input.accessKeyId,
    cooldownKey: input.cooldownKey,
  });
}

/**
 * Get Telegram bot configuration from database.
 */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const settings = await db.settings.findUnique({ where: { key: 'telegram_bot' } });
  if (settings) {
    try {
      const config = JSON.parse(settings.value) as Record<string, unknown>;
      if (config.isEnabled && typeof config.botToken === 'string' && config.botToken.trim()) {
        return {
          botToken: config.botToken,
          botUsername:
            typeof config.botUsername === 'string' && config.botUsername.trim()
              ? config.botUsername
              : undefined,
          adminChatIds: Array.isArray(config.adminChatIds)
            ? config.adminChatIds.filter(
                (value): value is string => typeof value === 'string' && value.trim().length > 0,
              )
            : [],
          welcomeMessage:
            typeof config.welcomeMessage === 'string' && config.welcomeMessage.trim()
              ? config.welcomeMessage
              : undefined,
          keyNotFoundMessage:
            typeof config.keyNotFoundMessage === 'string' && config.keyNotFoundMessage.trim()
              ? config.keyNotFoundMessage
              : undefined,
          localizedWelcomeMessages: normalizeLocalizedTemplateMap(
            config.localizedWelcomeMessages,
          ),
          localizedKeyNotFoundMessages: normalizeLocalizedTemplateMap(
            config.localizedKeyNotFoundMessages,
          ),
          dailyDigestEnabled: Boolean(config.dailyDigestEnabled),
          dailyDigestHour:
            typeof config.dailyDigestHour === 'number' ? config.dailyDigestHour : 9,
          dailyDigestMinute:
            typeof config.dailyDigestMinute === 'number' ? config.dailyDigestMinute : 0,
          digestLookbackHours:
            typeof config.digestLookbackHours === 'number' ? config.digestLookbackHours : 24,
        };
      }
    } catch {
      // Fall through to channel-based configuration.
    }
  }

  const channels = await db.notificationChannel.findMany({
    where: {
      type: 'TELEGRAM',
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  for (const channel of channels) {
    try {
      const config = JSON.parse(channel.config) as Record<string, unknown>;
      const botToken =
        (typeof config.botToken === 'string' && config.botToken.trim()) ||
        process.env.TELEGRAM_BOT_TOKEN ||
        null;
      const adminChatIds = Array.isArray(config.adminChatIds)
        ? config.adminChatIds.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : typeof config.chatId === 'string' && config.chatId.trim().length > 0
          ? [config.chatId]
          : [];

      if (botToken && adminChatIds.length > 0) {
        return {
          botToken,
          botUsername:
            typeof config.botUsername === 'string' && config.botUsername.trim()
              ? config.botUsername
              : undefined,
          adminChatIds,
          dailyDigestEnabled: false,
          dailyDigestHour: 9,
          dailyDigestMinute: 0,
          digestLookbackHours: 24,
        };
      }
    } catch {
      // Ignore malformed channels and keep looking.
    }
  }

  return null;
}

/**
 * Send a message to a Telegram chat.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
): Promise<boolean> {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parseMode || 'HTML',
        reply_markup: options.replyMarkup,
        disable_web_page_preview: options.disableWebPagePreview ?? true,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to send Telegram message to ${chatId}:`, data.description);
    }

    return response.ok;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

/**
 * Send an alert to all admin chat IDs.
 */
export async function sendAdminAlert(
  message: string,
  options: SendMessageOptions = {},
): Promise<void> {
  const config = await getTelegramConfig();
  if (!config) return;

  for (const chatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, chatId, message, options);
  }
}

/**
 * Send a photo to a Telegram chat.
 */
export async function sendTelegramPhoto(
  botToken: string,
  chatId: number | string,
  photo: Buffer,
  caption?: string,
) {
  try {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    const blob = new Blob([new Uint8Array(photo)], { type: 'image/png' });
    formData.append('photo', blob, 'qrcode.png');

    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to send Telegram photo to ${chatId}:`, data.description);
    }
  } catch (error) {
    console.error(`Error sending Telegram photo to ${chatId}:`, error);
  }
}

/**
 * Send a document to a Telegram chat.
 */
export async function sendTelegramDocument(
  botToken: string,
  chatId: number | string,
  document: Buffer,
  filename: string,
  caption?: string,
) {
  try {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    const blob = new Blob([new Uint8Array(document)], { type: 'application/octet-stream' });
    formData.append('document', blob, filename);

    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to send Telegram document to ${chatId}:`, data.description);
    }
  } catch (error) {
    console.error(`Error sending Telegram document to ${chatId}:`, error);
  }
}

async function loadAccessKeyForMessaging(accessKeyId: string) {
  return db.accessKey.findUnique({
    where: { id: accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });
}

async function loadDynamicAccessKeyForMessaging(dynamicAccessKeyId: string) {
  return db.dynamicAccessKey.findUnique({
    where: { id: dynamicAccessKeyId },
    include: {
      user: true,
      accessKeys: {
        include: {
          server: true,
        },
      },
    },
  });
}

function resolveTelegramChatIdForKey(key: {
  telegramId?: string | null;
  user?: { telegramChatId?: string | null } | null;
}) {
  return key.telegramId || key.user?.telegramChatId || null;
}

function resolveTelegramChatIdForDynamicKey(key: {
  telegramId?: string | null;
  user?: { telegramChatId?: string | null } | null;
}) {
  return key.telegramId || key.user?.telegramChatId || null;
}

function resolveTelegramTemplate(
  templates: LocalizedTemplateMap | undefined,
  locale: SupportedLocale,
  fallback?: string,
) {
  return resolveLocalizedTemplate(templates, locale, fallback)?.trim() || '';
}

function getDynamicKeyMessagingUrls(
  key: {
    dynamicUrl?: string | null;
    publicSlug?: string | null;
    name: string;
  },
  source?: string | null,
  lang?: SupportedLocale,
) {
  const sharePageUrl = key.publicSlug
    ? buildDynamicShortShareUrl(key.publicSlug, {
        source: source || undefined,
        lang,
      })
    : key.dynamicUrl
      ? buildDynamicSharePageUrl(key.dynamicUrl, {
          source: source || undefined,
          lang,
        })
      : null;
  const subscriptionUrl = key.publicSlug
    ? buildDynamicShortClientUrl(key.publicSlug, { source: source || undefined })
    : key.dynamicUrl
      ? buildDynamicSubscriptionApiUrl(key.dynamicUrl, { source: source || undefined })
      : null;
  const outlineClientUrl = key.publicSlug
    ? buildDynamicOutlineUrl(key.publicSlug, key.name, {
        source: source || undefined,
        shortPath: true,
      })
    : key.dynamicUrl
      ? buildDynamicOutlineUrl(key.dynamicUrl, key.name, {
          source: source || undefined,
        })
      : null;

  return {
    sharePageUrl,
    subscriptionUrl,
    outlineClientUrl,
  };
}

export async function createAccessKeyTelegramConnectLink(input: {
  accessKeyId: string;
  createdByUserId?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await db.accessKey.findUnique({
    where: { id: input.accessKeyId },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const botUsername = await getTelegramBotUsername(config.botToken, config.botUsername);
  if (!botUsername) {
    throw new Error('Unable to resolve the Telegram bot username.');
  }

  const token = generateRandomString(24);
  const expiresAt = new Date(Date.now() + TELEGRAM_CONNECT_TOKEN_TTL_MS);

  await db.telegramLinkToken.create({
    data: {
      token,
      accessKeyId: key.id,
      userId: key.userId,
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
    },
  });

  return {
    startToken: token,
    botUsername,
    expiresAt,
    url: `https://t.me/${botUsername}?start=${token}`,
  };
}

export async function createDynamicKeyTelegramConnectLink(input: {
  dynamicAccessKeyId: string;
  createdByUserId?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicAccessKeyId },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (!key) {
    throw new Error('Dynamic key not found.');
  }

  const botUsername = await getTelegramBotUsername(config.botToken, config.botUsername);
  if (!botUsername) {
    throw new Error('Unable to resolve the Telegram bot username.');
  }

  const token = generateRandomString(24);
  const expiresAt = new Date(Date.now() + TELEGRAM_CONNECT_TOKEN_TTL_MS);

  await db.telegramLinkToken.create({
    data: {
      token,
      kind: 'DYNAMIC_KEY_CONNECT',
      dynamicAccessKeyId: key.id,
      userId: key.userId,
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
    },
  });

  return {
    startToken: token,
    botUsername,
    expiresAt,
    url: `https://t.me/${botUsername}?start=${token}`,
  };
}

export async function sendAccessKeySharePageToTelegram(input: {
  accessKeyId: string;
  chatId?: string | number | null;
  reason?:
    | 'CREATED'
    | 'RESENT'
    | 'LINKED'
    | 'KEY_ENABLED'
    | 'USAGE_REQUEST'
    | 'SUBSCRIPTION_REQUEST';
  source?: string | null;
  includeQr?: boolean;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const defaults = await getSubscriptionDefaults();
  const locale = defaults.defaultLanguage;
  const ui = getTelegramUi(locale);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'telegram', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'telegram', lang: locale });
  const subscriptionUrl = buildSubscriptionApiUrl(token, { source: input.source || 'telegram' });
  const welcomeMessage =
    key.subscriptionWelcomeMessage?.trim() ||
    resolveTelegramTemplate(
      defaults.localizedWelcomeMessages,
      locale,
      defaults.welcomeMessage ?? undefined,
    );
  const supportLink = defaults.supportLink;
  const reasonTitle = ui.accessReasonTitle(input.reason);

  const lines = [
    reasonTitle,
    '',
    `🔑 ${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `🖥 ${ui.serverLabel}: ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}`,
    `📈 ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
    `⏳ ${ui.expirationLabel}: ${escapeHtml(formatExpirationSummary(key, locale))}`,
    key.dataLimitBytes ? `📦 ${ui.quotaLabel}: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : `📦 ${ui.quotaLabel}: ${ui.unlimited}`,
    '',
    welcomeMessage ? escapeHtml(welcomeMessage) : ui.accessShareFallback,
    '',
    `🌐 ${ui.sharePageLabel}: ${sharePageUrl}`,
    `🔄 ${ui.subscriptionUrlLabel}: ${subscriptionUrl}`,
  ];

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [
    [{ text: ui.openSharePage, url: sharePageUrl }],
    [{ text: ui.openSubscriptionUrl, url: subscriptionUrl }],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (input.includeQr ?? true) {
    try {
      const qrBuffer = await QRCode.toBuffer(key.accessUrl || sharePageUrl, {
        width: 300,
        margin: 2,
      });
      await sendTelegramPhoto(
        config.botToken,
        destinationChatId,
        qrBuffer,
        ui.accessQrCaption,
      );
    } catch (error) {
      console.error('Failed to generate Telegram QR code:', error);
    }
  }

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'telegram',
    metadata: {
      reason: input.reason || 'RESENT',
      destinationChatId,
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SHARE_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageUrl,
    },
  });

  return {
    sharePageUrl,
    subscriptionUrl,
    destinationChatId,
  };
}

export async function sendDynamicKeySharePageToTelegram(input: {
  dynamicAccessKeyId: string;
  chatId?: string | number | null;
  reason?:
    | 'CREATED'
    | 'RESENT'
    | 'LINKED'
    | 'KEY_ENABLED'
    | 'USAGE_REQUEST'
    | 'SUBSCRIPTION_REQUEST';
  source?: string | null;
  includeQr?: boolean;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadDynamicAccessKeyForMessaging(input.dynamicAccessKeyId);
  if (!key) {
    throw new Error('Dynamic key not found.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForDynamicKey(key);
  if (!destinationChatId) {
    throw new Error('This dynamic key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = defaults.defaultLanguage;
  const ui = getTelegramUi(locale);
  const { sharePageUrl, subscriptionUrl, outlineClientUrl } = getDynamicKeyMessagingUrls(
    key,
    input.source || 'telegram',
    locale,
  );
  if (!subscriptionUrl || !outlineClientUrl) {
    throw new Error('This dynamic key does not have a usable client URL yet.');
  }

  const welcomeMessage =
    key.subscriptionWelcomeMessage?.trim() ||
    resolveTelegramTemplate(
      defaults.localizedWelcomeMessages,
      locale,
      defaults.welcomeMessage ?? undefined,
    );
  const supportLink = defaults.supportLink;
  const attachedCount = key.accessKeys.length;
  const uniqueServers = Array.from(
    new Set(
      key.accessKeys
        .map((attachedKey) => attachedKey.server?.name)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const coverageSummary =
    uniqueServers.length > 0
      ? uniqueServers.slice(0, 3).join(', ') + (uniqueServers.length > 3 ? ` +${uniqueServers.length - 3} more` : '')
      : ui.coverageAutoSelected;
  const reasonTitle = ui.dynamicReasonTitle(input.reason);

  const lines = [
    reasonTitle,
    '',
    `🔁 ${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `🧭 ${ui.modeLabel}: ${escapeHtml(key.type === 'SELF_MANAGED' ? ui.modeSelfManaged : ui.modeManual)}`,
    `🖥 ${ui.backendsLabel}: ${attachedCount} attached key(s)`,
    `🌍 ${ui.coverageLabel}: ${escapeHtml(coverageSummary)}`,
    `📈 ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
    `⏳ ${ui.expirationLabel}: ${escapeHtml(formatExpirationSummary(key, locale))}`,
    key.dataLimitBytes ? `📦 ${ui.quotaLabel}: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : `📦 ${ui.quotaLabel}: ${ui.unlimited}`,
    '',
    welcomeMessage
      ? escapeHtml(welcomeMessage)
      : key.sharePageEnabled
        ? ui.dynamicShareFallback
        : ui.dynamicShareDisabledFallback,
  ];

  if (key.sharePageEnabled && sharePageUrl) {
    lines.push('', `🌐 ${ui.sharePageLabel}: ${sharePageUrl}`);
  }

  lines.push(`🔄 ${ui.clientEndpointLabel}: ${subscriptionUrl}`);
  lines.push(`⚡ ${ui.outlineClientUrlLabel}: ${outlineClientUrl}`);

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [];
  if (key.sharePageEnabled && sharePageUrl) {
    inlineKeyboard.push([{ text: ui.openSharePage, url: sharePageUrl }]);
  }
  inlineKeyboard.push([{ text: ui.openClientEndpoint, url: subscriptionUrl }]);

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (input.includeQr ?? true) {
    try {
      const qrBuffer = await QRCode.toBuffer(outlineClientUrl, {
        width: 300,
        margin: 2,
      });
      await sendTelegramPhoto(
        config.botToken,
        destinationChatId,
        qrBuffer,
        ui.dynamicQrCaption,
      );
    } catch (error) {
      console.error('Failed to generate Telegram QR code for dynamic key:', error);
    }
  }

  await recordSubscriptionPageEvent({
    dynamicAccessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'telegram',
    metadata: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageEnabled: key.sharePageEnabled,
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SHARE_SENT',
    entity: 'DYNAMIC_ACCESS_KEY',
    entityId: key.id,
    details: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageUrl,
      subscriptionUrl,
    },
  });

  return {
    sharePageUrl,
    subscriptionUrl,
    outlineClientUrl,
    destinationChatId,
  };
}

export async function sendAccessKeyLifecycleTelegramNotification(input: {
  accessKeyId: string;
  type:
    | 'CREATED'
    | 'DISABLED'
    | 'ENABLED'
    | 'EXPIRING_7D'
    | 'EXPIRING_1D'
    | 'EXPIRED';
  daysLeft?: number;
}) {
  if (input.type === 'CREATED' || input.type === 'ENABLED') {
    return sendAccessKeySharePageToTelegram({
      accessKeyId: input.accessKeyId,
      reason: input.type === 'CREATED' ? 'CREATED' : 'KEY_ENABLED',
      source: 'telegram_notification',
    });
  }

  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    return null;
  }

  if (!key.telegramDeliveryEnabled) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const { supportLink, defaultLanguage } = await getSubscriptionDefaults();
  const ui = getTelegramUi(defaultLanguage);
  const includeSharePage = input.type === 'EXPIRING_7D' || input.type === 'EXPIRING_1D';
  const token = includeSharePage
    ? await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken)
    : null;
  const sharePageUrl = token
    ? (
        key.publicSlug
          ? buildShortShareUrl(key.publicSlug, { source: 'telegram_notification', lang: defaultLanguage })
          : buildSharePageUrl(token, { source: 'telegram_notification', lang: defaultLanguage })
      )
    : null;

  const lines =
    input.type === 'DISABLED'
      ? [
          ui.lifecycleDisabledTitle,
          '',
          `🔑 ${escapeHtml(key.name)}`,
          ui.lifecycleDisabledBody,
        ]
      : input.type === 'EXPIRING_7D'
        ? [
            ui.lifecycleExpiring7Title,
            '',
            `🔑 ${escapeHtml(key.name)}`,
            ui.lifecycleExpiring7Body(input.daysLeft ?? 7),
          ]
        : input.type === 'EXPIRING_1D'
          ? [
              ui.lifecycleExpiring1Title,
              '',
              `🔑 ${escapeHtml(key.name)}`,
              ui.lifecycleExpiring1Body(input.daysLeft ?? 1),
            ]
          : [
              ui.lifecycleExpiredTitle,
              '',
              `🔑 ${escapeHtml(key.name)}`,
              ui.lifecycleExpiredBody,
            ];

  if (sharePageUrl) {
    lines.push('', `${ui.sharePageLabel}: ${sharePageUrl}`);
  }
  if (supportLink) {
    lines.push(`${ui.supportLabel}: ${supportLink}`);
  }

  const buttons = sharePageUrl ? [[{ text: ui.openSharePage, url: sharePageUrl }]] : [];
  if (supportLink) {
    buttons.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: 'telegram_notification',
    metadata: {
      notificationType: input.type,
      destinationChatId,
      sharePageIncluded: Boolean(sharePageUrl),
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_NOTIFICATION_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      notificationType: input.type,
      destinationChatId,
      sharePageIncluded: Boolean(sharePageUrl),
    },
  });

  return {
    sharePageUrl,
    destinationChatId,
  };
}

export async function sendAccessKeyRenewalReminder(input: {
  accessKeyId: string;
  chatId?: string | number | null;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = defaults.defaultLanguage;
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'renewal_reminder', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'renewal_reminder', lang: locale });
  const subscriptionUrl = buildSubscriptionApiUrl(token, { source: input.source || 'renewal_reminder' });
  const supportLink = defaults.supportLink;

  const lines = locale === 'my'
    ? [
        '🔔 <b>သက်တမ်းတိုးခြင်း အသိပေးချက်</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        `🖥 Server: ${escapeHtml(key.server.name)}`,
        `⏳ လက်ရှိသက်တမ်း: ${escapeHtml(formatExpirationSummary(key, locale))}`,
        key.dataLimitBytes
          ? `📦 အသုံးပြုမှု: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
          : `📦 အသုံးပြုမှု: ${ui.unlimited}`,
        '',
        'သင့် key ကို ဆက်လက်အသုံးပြုလိုပါက administrator ထံ ဆက်သွယ်ပြီး သက်တမ်းတိုးနိုင်ပါသည်။',
        '',
        `🌐 Share page: ${sharePageUrl}`,
        `🔄 Subscription URL: ${subscriptionUrl}`,
      ]
    : [
        '🔔 <b>Renewal Reminder</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        `🖥 Server: ${escapeHtml(key.server.name)}`,
        `⏳ Current expiration: ${escapeHtml(formatExpirationSummary(key, locale))}`,
        key.dataLimitBytes
          ? `📦 Usage: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
          : `📦 Usage: ${ui.unlimited}`,
        '',
        'If you want to keep using this key, please contact your administrator to renew it.',
        '',
        `🌐 Share page: ${sharePageUrl}`,
        `🔄 Subscription URL: ${subscriptionUrl}`,
      ];

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [
    [{ text: ui.openSharePage, url: sharePageUrl }],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'renewal_reminder',
    metadata: {
      destinationChatId,
      notificationType: 'RENEWAL_REMINDER',
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_RENEWAL_REMINDER_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      sharePageUrl,
      subscriptionUrl,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
    subscriptionUrl,
  };
}

export async function sendAccessKeySupportMessage(input: {
  accessKeyId: string;
  message: string;
  chatId?: string | number | null;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const trimmedMessage = input.message.trim();
  if (!trimmedMessage) {
    throw new Error('Support message cannot be empty.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = defaults.defaultLanguage;
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'support_message', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'support_message', lang: locale });

  const lines = locale === 'my'
    ? [
        '💬 <b>Administrator မှ စာပို့ထားပါသည်</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        '',
        escapeHtml(trimmedMessage),
        '',
        `🌐 Share page: ${sharePageUrl}`,
      ]
    : [
        '💬 <b>Message from your administrator</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        '',
        escapeHtml(trimmedMessage),
        '',
        `🌐 Share page: ${sharePageUrl}`,
      ];

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: {
      inline_keyboard: [[{ text: ui.openSharePage, url: sharePageUrl }]],
    },
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'support_message',
    metadata: {
      destinationChatId,
      notificationType: 'SUPPORT_MESSAGE',
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_SUPPORT_MESSAGE_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      message: trimmedMessage,
      sharePageUrl,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
  };
}

export async function sendRenewalRequestToAdmins(input: {
  accessKeyId: string;
  requesterTelegramId: string;
  requesterName: string;
}) {
  const key = await db.accessKey.findUnique({
    where: { id: input.accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: 'telegram_renew_request', lang: locale })
    : buildSharePageUrl(token, { source: 'telegram_renew_request', lang: locale });
  const message = [
    locale === 'my' ? '🔁 <b>Telegram မှ သက်တမ်းတိုးရန် တောင်းဆိုထားပါသည်</b>' : '🔁 <b>Renewal requested from Telegram</b>',
    '',
    `${ui.requesterLabel}: <b>${escapeHtml(input.requesterName)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(input.requesterTelegramId)}</code>`,
    `${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
    key.email ? `${ui.emailLabel}: ${escapeHtml(key.email)}` : '',
    '',
    `${ui.sharePageLabel}: ${sharePageUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  await sendAdminAlert(message);
  await writeAuditLog({
    action: 'TELEGRAM_RENEWAL_REQUEST',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      requesterTelegramId: input.requesterTelegramId,
      requesterName: input.requesterName,
      sharePageUrl,
    },
  });

  return {
    keyId: key.id,
    sharePageUrl,
  };
}

async function markTelegramLinkTokenConsumed(input: {
  token: string;
  chatId: string;
  telegramUserId: string;
}) {
  const linkToken = await db.telegramLinkToken.findUnique({
    where: { token: input.token },
    include: {
      accessKey: {
        include: {
          server: true,
          user: true,
        },
      },
      dynamicAccessKey: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!linkToken) {
    return { status: 'missing' as const };
  }

  if (linkToken.consumedAt && linkToken.consumedByChatId === input.chatId) {
    return {
      status: 'already-linked' as const,
      accessKeyId: linkToken.accessKey?.id ?? null,
      dynamicAccessKeyId: linkToken.dynamicAccessKey?.id ?? null,
    };
  }

  if (linkToken.expiresAt.getTime() < Date.now()) {
    return { status: 'expired' as const };
  }

  if (!linkToken.accessKey && !linkToken.dynamicAccessKey) {
    return { status: 'missing-key' as const };
  }

  await db.$transaction(async (tx) => {
    if (linkToken.accessKey) {
      await tx.accessKey.update({
        where: { id: linkToken.accessKey.id },
        data: {
          telegramId: input.telegramUserId,
        },
      });
    }

    if (linkToken.dynamicAccessKey) {
      await tx.dynamicAccessKey.update({
        where: { id: linkToken.dynamicAccessKey.id },
        data: {
          telegramId: input.telegramUserId,
        },
      });
    }

    if (linkToken.userId) {
      await tx.user.update({
        where: { id: linkToken.userId },
        data: {
          telegramChatId: input.chatId,
        },
      });
    }

    await tx.telegramLinkToken.update({
      where: { id: linkToken.id },
      data: {
        consumedAt: new Date(),
        consumedByChatId: input.chatId,
      },
    });
  });

  if (linkToken.accessKey) {
    await recordSubscriptionPageEvent({
      accessKeyId: linkToken.accessKey.id,
      eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED,
      source: 'telegram_start',
      metadata: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });

    await writeAuditLog({
      action: 'TELEGRAM_LINK_COMPLETED',
      entity: 'ACCESS_KEY',
      entityId: linkToken.accessKey.id,
      details: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });
  }

  if (linkToken.dynamicAccessKey) {
    await recordSubscriptionPageEvent({
      dynamicAccessKeyId: linkToken.dynamicAccessKey.id,
      eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED,
      source: 'telegram_start',
      metadata: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });

    await writeAuditLog({
      action: 'TELEGRAM_LINK_COMPLETED',
      entity: 'DYNAMIC_ACCESS_KEY',
      entityId: linkToken.dynamicAccessKey.id,
      details: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });
  }

  return {
    status: 'linked' as const,
    accessKeyId: linkToken.accessKey?.id ?? null,
    dynamicAccessKeyId: linkToken.dynamicAccessKey?.id ?? null,
  };
}

async function findLinkedAccessKeys(chatId: number, telegramUserId: number, includeInactive = false) {
  return db.accessKey.findMany({
    where: {
      OR: [{ telegramId: String(telegramUserId) }, { user: { telegramChatId: String(chatId) } }],
      ...(includeInactive
        ? {}
        : {
            status: {
              in: ['ACTIVE', 'PENDING'],
            },
          }),
    },
    include: {
      server: true,
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function resolveAdminKeyQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kind: 'empty' as const };
  }

  const byId = await db.accessKey.findUnique({
    where: { id: trimmed },
    include: {
      server: true,
      user: true,
    },
  });

  if (byId) {
    return { kind: 'single' as const, key: byId };
  }

  const byOutlineId = await db.accessKey.findFirst({
    where: { outlineKeyId: trimmed },
    include: {
      server: true,
      user: true,
    },
  });

  if (byOutlineId) {
    return { kind: 'single' as const, key: byOutlineId };
  }

  const matches = await db.accessKey.findMany({
    where: {
      OR: [
        { name: { contains: trimmed } },
        { email: { contains: trimmed } },
        { telegramId: { contains: trimmed } },
        { user: { email: { contains: trimmed } } },
      ],
    },
    include: {
      server: true,
      user: true,
    },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });

  if (matches.length === 1) {
    return { kind: 'single' as const, key: matches[0] };
  }

  return {
    kind: 'many' as const,
    matches,
  };
}

async function setAccessKeyEnabledState(accessKeyId: string, enable: boolean) {
  const key = await db.accessKey.findUnique({
    where: { id: accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
  const isCurrentlyDisabled = key.status === 'DISABLED';

  if (enable) {
    if (!isCurrentlyDisabled) {
      return key;
    }

    const assignmentCheck = canAssignKeysToServer(key.server);
    if (!assignmentCheck.allowed) {
      throw new Error(assignmentCheck.reason);
    }

    const recreated = await client.createAccessKey({
      name: key.name,
      method: key.method || undefined,
    });

    if (key.dataLimitBytes) {
      await client.setAccessKeyDataLimit(recreated.id, Number(key.dataLimitBytes));
    }

    return db.accessKey.update({
      where: { id: key.id },
      data: {
        status: 'ACTIVE',
        outlineKeyId: recreated.id,
        accessUrl: decorateOutlineAccessUrl(recreated.accessUrl, key.name),
        password: recreated.password,
        port: recreated.port,
        method: recreated.method,
        disabledAt: null,
        disabledOutlineKeyId: null,
        usageOffset: BigInt(-Number(key.usedBytes)),
      },
      include: {
        server: true,
        user: true,
      },
    });
  }

  if (isCurrentlyDisabled) {
    return key;
  }

  try {
    await client.deleteAccessKey(key.outlineKeyId);
  } catch (error) {
    console.warn(`Failed to delete key ${key.outlineKeyId} from Outline:`, error);
  }

  await db.connectionSession.updateMany({
    where: {
      accessKeyId: key.id,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
      endedReason: 'KEY_DISABLED',
    },
  });

  return db.accessKey.update({
    where: { id: key.id },
    data: {
      status: 'DISABLED',
      disabledAt: new Date(),
      disabledOutlineKeyId: key.outlineKeyId,
      estimatedDevices: 0,
    },
    include: {
      server: true,
      user: true,
    },
  });
}

async function handleStartCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  isAdmin: boolean,
  botToken: string,
  argsText: string,
): Promise<string | null> {
  const trimmedArgs = argsText.trim();
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);

  if (trimmedArgs) {
    const linkResult = await markTelegramLinkTokenConsumed({
      token: trimmedArgs,
      chatId: String(chatId),
      telegramUserId: String(telegramUserId),
    });

    if (linkResult.status === 'linked' || linkResult.status === 'already-linked') {
      await sendTelegramMessage(
        botToken,
        chatId,
        ui.startLinked(escapeHtml(username)),
        {
          replyMarkup: getCommandKeyboard(isAdmin),
        },
      );

      if (linkResult.accessKeyId) {
        try {
          await sendAccessKeySharePageToTelegram({
            accessKeyId: linkResult.accessKeyId,
            chatId: String(chatId),
            reason: 'LINKED',
            source: 'telegram_start',
          });
        } catch (error) {
          console.error('Failed to send share page after Telegram link:', error);
        }
      }

      if (linkResult.dynamicAccessKeyId) {
        try {
          await sendDynamicKeySharePageToTelegram({
            dynamicAccessKeyId: linkResult.dynamicAccessKeyId,
            chatId: String(chatId),
            reason: 'LINKED',
            source: 'telegram_start',
          });
        } catch (error) {
          console.error('Failed to send dynamic share page after Telegram link:', error);
        }
      }

      return null;
    }

    const errorMessage =
      linkResult.status === 'expired'
        ? ui.linkExpired
        : ui.linkInvalid;

    await sendTelegramMessage(botToken, chatId, errorMessage, {
      replyMarkup: getCommandKeyboard(isAdmin),
    });
    return null;
  }

  const existingUser = await db.user.findFirst({
    where: { telegramChatId: String(chatId) },
  });

  if (existingUser) {
    await sendTelegramMessage(
      botToken,
      chatId,
      ui.welcomeBack(escapeHtml(username)),
      {
        replyMarkup: getCommandKeyboard(isAdmin),
      },
    );
    return null;
  }

  const key = await db.accessKey.findFirst({
    where: { telegramId: String(telegramUserId) },
    include: { user: true },
  });

  if (key?.user) {
    await db.user.update({
      where: { id: key.user.id },
      data: { telegramChatId: String(chatId) },
    });

    await sendTelegramMessage(
      botToken,
      chatId,
      ui.accountLinked(escapeHtml(username)),
      {
        replyMarkup: getCommandKeyboard(isAdmin),
      },
    );
    return null;
  }

  const config = await getTelegramConfig();
  const adminMsg = isAdmin ? ui.adminRecognized : '';
  const welcomeMessage = resolveTelegramTemplate(
    config?.localizedWelcomeMessages,
    locale,
    config?.welcomeMessage || ui.defaultWelcome,
  );

  await sendTelegramMessage(
    botToken,
    chatId,
    ui.hello(escapeHtml(username), escapeHtml(welcomeMessage), telegramUserId, adminMsg),
    {
      replyMarkup: getCommandKeyboard(isAdmin),
    },
  );
  return null;
}

async function handleEmailLink(chatId: number, telegramUserId: number, email: string) {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const keys = await db.accessKey.findMany({
    where: {
      email: email.toLowerCase(),
      status: { in: ['ACTIVE', 'PENDING', 'DISABLED'] },
    },
  });

  if (keys.length === 0) {
    return ui.emailNoKeys(escapeHtml(email));
  }

  await db.accessKey.updateMany({
    where: { email: email.toLowerCase() },
    data: { telegramId: String(telegramUserId) },
  });

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    await db.user.update({
      where: { id: user.id },
      data: { telegramChatId: String(chatId) },
    });
  }

  return ui.emailLinked(keys.length);
}

async function handleUsageCommand(
  chatId: number,
  telegramUserId: number,
  botToken: string,
): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, false);

  if (keys.length === 0) {
    const config = await getTelegramConfig();
    return resolveTelegramTemplate(
      config?.localizedKeyNotFoundMessages,
      locale,
      config?.keyNotFoundMessage || ui.keyNotFoundDefault,
    );
  }

  let response = ui.usageTitle;

  for (const key of keys) {
    const usedBytes = Number(key.usedBytes);
    const limitBytes = key.dataLimitBytes ? Number(key.dataLimitBytes) : null;
    const usageText = limitBytes
      ? `${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes!)} (${Math.round((usedBytes / limitBytes) * 100)}%)`
      : `${formatBytes(key.usedBytes)} / Unlimited`;

    response += `${key.status === 'ACTIVE' ? '🟢' : '🔵'} <b>${escapeHtml(key.name)}</b>\n`;
    response += `   📡 ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}\n`;
    response += `   📈 ${usageText}\n`;
    response += `   ⏳ ${escapeHtml(formatExpirationSummary(key, locale))}\n\n`;

    if (key.accessUrl) {
      setTimeout(async () => {
        try {
          await sendAccessKeySharePageToTelegram({
            accessKeyId: key.id,
            chatId: String(chatId),
            reason: 'USAGE_REQUEST',
            source: 'telegram_usage',
            includeQr: true,
          });
        } catch (error) {
          console.error('Failed to send usage share page via Telegram:', error);
        }
      }, 500);
    }
  }

  return response;
}

async function handleMyKeysCommand(chatId: number, telegramUserId: number): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return ui.myKeysEmpty;
  }

  const lines = [ui.myKeysTitle, ''];

  for (const key of keys) {
    const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
    const sharePageUrl = key.publicSlug
      ? buildShortShareUrl(key.publicSlug, { source: 'telegram_mykeys', lang: locale })
      : buildSharePageUrl(token, { source: 'telegram_mykeys', lang: locale });
    lines.push(
      `• <b>${escapeHtml(key.name)}</b>`,
      `  ${ui.idLabel}: <code>${key.id}</code>`,
      `  ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
      `  ${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
      `  ${ui.sharePageLabel}: ${sharePageUrl}`,
      '',
    );
  }

  return lines.join('\n');
}

async function handleSubscriptionLinksCommand(
  chatId: number,
  telegramUserId: number,
): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, false);

  if (keys.length === 0) {
    return ui.subEmpty;
  }

  for (const key of keys) {
    try {
      await sendAccessKeySharePageToTelegram({
        accessKeyId: key.id,
        chatId: String(chatId),
        reason: 'SUBSCRIPTION_REQUEST',
        source: 'telegram_sub',
        includeQr: true,
      });
    } catch (error) {
      console.error('Failed to send subscription link via Telegram:', error);
    }
  }

  return ui.subSent(keys.length);
}

async function handleSupportCommand(): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const { supportLink } = await getSubscriptionDefaults();

  if (!supportLink) {
    return ui.noSupportLink;
  }

  return `${ui.supportLabel}: ${supportLink}`;
}

async function handleUserServerCommand(chatId: number, telegramUserId: number): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return ui.myKeysEmpty;
  }

  const grouped = new Map<
    string,
    { name: string; countryCode: string | null; keyCount: number; activeCount: number }
  >();

  for (const key of keys) {
    const current = grouped.get(key.serverId) || {
      name: key.server.name,
      countryCode: key.server.countryCode,
      keyCount: 0,
      activeCount: 0,
    };

    current.keyCount += 1;
    if (key.status === 'ACTIVE' || key.status === 'PENDING') {
      current.activeCount += 1;
    }
    grouped.set(key.serverId, current);
  }

  const lines = [ui.serversTitle, ''];
  for (const server of Array.from(grouped.values())) {
    lines.push(
      `• ${escapeHtml(server.name)}${server.countryCode ? ` ${getFlagEmoji(server.countryCode)}` : ''}`,
      `  ${ui.keysLabel}: ${server.keyCount} total, ${server.activeCount} active`,
      '',
    );
  }

  return lines.join('\n');
}

async function handleRenewCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  argsText: string,
): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return ui.myKeysEmpty;
  }

  const requestedKeys =
    argsText.trim().length > 0
      ? keys.filter((key) => key.name.toLowerCase().includes(argsText.trim().toLowerCase()))
      : keys;

  if (requestedKeys.length === 0) {
    return ui.renewNoMatch(escapeHtml(argsText.trim()));
  }

  for (const key of requestedKeys) {
    await sendRenewalRequestToAdmins({
      accessKeyId: key.id,
      requesterTelegramId: String(telegramUserId),
      requesterName: username,
    });
  }

  return ui.renewSent(requestedKeys.length);
}

async function handleStatusCommand(): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const servers = await db.server.findMany({
    where: { isActive: true },
    include: { healthCheck: true, _count: { select: { accessKeys: true } } },
  });

  if (servers.length === 0) return ui.statusNoServers;

  let response = ui.statusTitle;

  for (const server of servers) {
    const status = server.healthCheck?.lastStatus || 'UNKNOWN';
    const statusEmoji =
      status === 'UP' ? '🟢' : status === 'DOWN' ? '🔴' : status === 'SLOW' ? '🟡' : '⚪';
    const latency = server.healthCheck?.lastLatencyMs;
    const uptime = server.healthCheck?.uptimePercent?.toFixed(1) || '-';

    response += `${statusEmoji} <b>${escapeHtml(server.name)}</b>\n`;
    response += `   • ${ui.statusLabel}: ${status}\n`;
    response += `   • ${ui.latencyLabel}: ${latency ? `${latency}ms` : '-'}\n`;
    response += `   • ${ui.uptimeLabel}: ${uptime}%\n`;
    response += `   • ${ui.keysLabel}: ${server._count.accessKeys}\n\n`;
  }

  return response;
}

async function handleExpiringCommand(argsText: string): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const requestedDays = Number.parseInt(argsText.trim(), 10);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 30) : 7;
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const keys = await db.accessKey.findMany({
    where: {
      status: { in: ['ACTIVE', 'PENDING'] },
      expiresAt: {
        gte: now,
        lte: end,
      },
    },
    include: {
      server: true,
    },
    orderBy: {
      expiresAt: 'asc',
    },
    take: 10,
  });

  if (keys.length === 0) {
    return ui.expiringNone(days);
  }

  const lines = [ui.expiringTitle(days), ''];
  for (const key of keys) {
    lines.push(
      `• <b>${escapeHtml(key.name)}</b>`,
      `  ID: <code>${key.id}</code>`,
      `  Server: ${escapeHtml(key.server.name)}`,
      `  Expires: ${key.expiresAt?.toLocaleString() || 'Unknown'}`,
      '',
    );
  }

  return lines.join('\n');
}

async function handleFindCommand(argsText: string): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const query = argsText.trim();
  if (!query) {
    return ui.findUsage;
  }

  const result = await resolveAdminKeyQuery(query);

  if (result.kind === 'single') {
    const key = result.key;
    return [
      ui.findKeyFound,
      '',
      `Name: <b>${escapeHtml(key.name)}</b>`,
      `${ui.idLabel}: <code>${key.id}</code>`,
      `Outline ID: <code>${escapeHtml(key.outlineKeyId)}</code>`,
      `${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
      `${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
      key.email ? `${ui.emailLabel}: ${escapeHtml(key.email)}` : '',
      key.telegramId ? `Telegram: <code>${escapeHtml(key.telegramId)}</code>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (result.kind === 'many') {
    if (result.matches.length === 0) {
      return ui.findNoMatches(escapeHtml(query));
    }

    return [
      ui.findMatches(escapeHtml(query)),
      '',
        ...result.matches.flatMap((key) => [
          `• <b>${escapeHtml(key.name)}</b>`,
          `  ${ui.idLabel}: <code>${key.id}</code>`,
          `  ${ui.statusLineLabel}: ${escapeHtml(key.status)} • ${escapeHtml(key.server.name)}`,
          '',
        ]),
    ].join('\n');
  }

  return ui.findProvideQuery;
}

async function handleAdminToggleCommand(
  argsText: string,
  enable: boolean,
): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const query = argsText.trim();
  if (!query) {
    return enable ? ui.enableUsage : ui.disableUsage;
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        ui.multiMatchUseIds,
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return ui.keyNotFound;
  }

  const updatedKey = await setAccessKeyEnabledState(result.key.id, enable);
  await sendAccessKeyLifecycleTelegramNotification({
    accessKeyId: updatedKey.id,
    type: enable ? 'ENABLED' : 'DISABLED',
  });

  await writeAuditLog({
    action: enable ? 'TELEGRAM_ADMIN_KEY_ENABLED' : 'TELEGRAM_ADMIN_KEY_DISABLED',
    entity: 'ACCESS_KEY',
    entityId: updatedKey.id,
    details: {
      via: 'telegram_bot',
    },
  });

  return enable
    ? ui.keyEnabled(escapeHtml(updatedKey.name))
    : ui.keyDisabled(escapeHtml(updatedKey.name));
}

async function handleResendCommand(argsText: string): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const query = argsText.trim();
  if (!query) {
    return ui.resendUsage;
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        ui.resendMulti,
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return ui.keyNotFound;
  }

  try {
    await sendAccessKeySharePageToTelegram({
      accessKeyId: result.key.id,
      reason: 'RESENT',
      source: 'telegram_admin_resend',
      includeQr: true,
    });
  } catch (error) {
    return ui.resendFailed(escapeHtml((error as Error).message));
  }

  return ui.resendSuccess(escapeHtml(result.key.name));
}

async function handleSysInfoCommand(chatId: number, botToken: string): Promise<string> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  await sendTelegramMessage(botToken, chatId, ui.sysinfoGathering);

  try {
    const [cpu, mem, disk, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
    ]);

    const totalDisk = disk.reduce((acc, item) => acc + item.size, 0);
    const usedDisk = disk.reduce((acc, item) => acc + item.used, 0);
    const usedDiskPercent = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;

    return [
      ui.sysinfoTitle,
      '',
      `<b>${ui.sysinfoOs}:</b> ${escapeHtml(`${osInfo.distro} ${osInfo.release}`)}`,
      `<b>${ui.sysinfoCpu}:</b> ${cpu.currentLoad.toFixed(1)}%`,
      `<b>${ui.sysinfoMemory}:</b> ${formatBytes(BigInt(mem.active))} / ${formatBytes(BigInt(mem.total))} (${((mem.active / mem.total) * 100).toFixed(1)}%)`,
      `<b>${ui.sysinfoDisk}:</b> ${formatBytes(BigInt(usedDisk))} / ${formatBytes(BigInt(totalDisk))} (${usedDiskPercent.toFixed(1)}%)`,
    ].join('\n');
  } catch (error) {
    console.error('Sysinfo error:', error);
    return ui.sysinfoFailed;
  }
}

async function handleBackupCommand(chatId: number, botToken: string): Promise<string | null> {
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  await sendTelegramMessage(botToken, chatId, ui.backupCreating);

  try {
    const backupDir = path.join(process.cwd(), 'storage', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.zip`;
    const filePath = path.join(backupDir, filename);
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);

      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl && dbUrl.includes('file:')) {
        const relativePath = dbUrl.replace('file:', '');
        const dbPath = path.isAbsolute(relativePath)
          ? relativePath
          : path.resolve(process.cwd(), 'prisma', relativePath.replace(/^\.\//, ''));

        if (fs.existsSync(dbPath)) {
          archive.file(dbPath, { name: 'atomic-ui.db' });
        }
      }

      archive.finalize();
    });

    const fileBuffer = fs.readFileSync(filePath);
    await sendTelegramDocument(
      botToken,
      chatId,
      fileBuffer,
      filename,
      ui.backupCaption(new Date().toLocaleString()),
    );

    return null;
  } catch (error) {
    console.error('Backup error:', error);
    return ui.backupFailed(escapeHtml((error as Error).message));
  }
}

async function handleHelpCommand(
  chatId: number,
  botToken: string,
  isAdmin: boolean,
): Promise<null> {
  const locale = await getTelegramDefaultLocale();
  const isMyanmar = locale === 'my';
  let message = isMyanmar
    ? `📚 <b>အသုံးပြုနိုင်သော Command များ</b>

/start - Telegram account ကို ချိတ်ဆက်မည်
/usage - အသုံးပြုမှုနှင့် QR/setup အချက်အလက်ကို ရယူမည်
/mykeys - ချိတ်ထားသော key များနှင့် ID များကို ကြည့်မည်
/sub - Share page များကို လက်ခံမည်
/support - သတ်မှတ်ထားသော support link ကို ကြည့်မည်
/server - သင့် key များအတွက် server များကို ကြည့်မည်
/renew - Admin ထံသို့ သက်တမ်းတိုးရန် တောင်းမည်
/help - ဤ help စာမျက်နှာကို ပြမည်`
    : `📚 <b>Available Commands</b>

/start - Link your Telegram account
/usage - Fetch your usage and QR/setup info
/mykeys - List linked keys and IDs
/sub - Receive your share pages
/support - Show the configured support link
/server - Show the servers behind your keys
/renew - Request renewal from an admin
/help - Show this help message`;

  if (isAdmin) {
    message += isMyanmar
      ? `\n\n<b>Admin Commands</b>
/status - Server အခြေအနေအနှစ်ချုပ်
/expiring [days] - မကြာမီ သက်တမ်းကုန်မည့် key များ
/find &lt;query&gt; - Key ကို ရှာမည်
/disable &lt;key-id&gt; - Key ကို ပိတ်မည်
/enable &lt;key-id&gt; - Key ကို ပြန်ဖွင့်မည်
/resend &lt;key-id&gt; - Share page ကို ပြန်ပို့မည်
/sysinfo - System resource usage
/backup - Backup ဖန်တီးပြီး ဒေါင်းလုဒ်ဆွဲမည်`
      : `\n\n<b>Admin Commands</b>
/status - Server status summary
/expiring [days] - Keys expiring soon
/find &lt;query&gt; - Search for a key
/disable &lt;key-id&gt; - Disable a key
/enable &lt;key-id&gt; - Re-enable a key
/resend &lt;key-id&gt; - Resend the share page
/sysinfo - System resource usage
/backup - Create and download a backup`;
  }

  message += isMyanmar
    ? `\n\nဤ Telegram account ကို ချိတ်ရန် သင့် email ကိုလည်း တိုက်ရိုက် ပို့နိုင်ပါသည်။`
    : `\n\nYou can also send your email address directly to link this Telegram account.`;

  await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: getCommandKeyboard(isAdmin),
  });

  return null;
}

/**
 * Handle incoming Telegram message.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
  const message = update.message;
  if (!message || !message.text) return null;

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const username = message.from.username || message.from.first_name;
  const text = message.text.trim();

  const config = await getTelegramConfig();
  if (!config) return null;
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(text)) {
    return handleEmailLink(chatId, telegramUserId, text);
  }

  const commandMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);
  if (!commandMatch) return null;

  const command = commandMatch[1].toLowerCase();
  const argsText = commandMatch[2] || '';
  const isAdmin =
    config.adminChatIds.includes(String(telegramUserId)) ||
    config.adminChatIds.includes(String(chatId));

  switch (command) {
    case 'start':
      return handleStartCommand(
        chatId,
        telegramUserId,
        username,
        isAdmin,
        config.botToken,
        argsText,
      );
    case 'usage':
    case 'mykey':
    case 'key':
      return handleUsageCommand(chatId, telegramUserId, config.botToken);
    case 'mykeys':
      return handleMyKeysCommand(chatId, telegramUserId);
    case 'sub':
      return handleSubscriptionLinksCommand(chatId, telegramUserId);
    case 'support':
      return handleSupportCommand();
    case 'server':
      return isAdmin && !argsText.trim() ? handleStatusCommand() : handleUserServerCommand(chatId, telegramUserId);
    case 'renew':
      return handleRenewCommand(chatId, telegramUserId, username, argsText);
    case 'status':
      return isAdmin ? handleStatusCommand() : ui.adminOnly;
    case 'expiring':
      return isAdmin ? handleExpiringCommand(argsText) : ui.adminOnly;
    case 'find':
      return isAdmin ? handleFindCommand(argsText) : ui.adminOnly;
    case 'disable':
      return isAdmin ? handleAdminToggleCommand(argsText, false) : ui.adminOnly;
    case 'enable':
      return isAdmin ? handleAdminToggleCommand(argsText, true) : ui.adminOnly;
    case 'resend':
      return isAdmin ? handleResendCommand(argsText) : ui.adminOnly;
    case 'sysinfo':
      return isAdmin ? handleSysInfoCommand(chatId, config.botToken) : ui.adminOnly;
    case 'backup':
      return isAdmin ? handleBackupCommand(chatId, config.botToken) : ui.adminOnly;
    case 'help':
      return handleHelpCommand(chatId, config.botToken, isAdmin);
    default:
      return ui.unknownCommand;
  }
}

export async function sendTelegramDigestToAdmins(input?: {
  now?: Date;
}) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return { sent: false, reason: 'not-configured' as const };
  }

  const now = input?.now || new Date();
  const lookbackHours = config.digestLookbackHours || 24;
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const since = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  const [activeKeys, pendingKeys, depletedKeys, expiringSoon, openIncidents, healthCounts, recentViews] =
    await Promise.all([
      db.accessKey.count({ where: { status: 'ACTIVE' } }),
      db.accessKey.count({ where: { status: 'PENDING' } }),
      db.accessKey.count({ where: { status: 'DEPLETED' } }),
      db.accessKey.count({
        where: {
          status: { in: ['ACTIVE', 'PENDING'] },
          expiresAt: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.incident.count({
        where: {
          status: 'OPEN',
        },
      }),
      db.healthCheck.groupBy({
        by: ['lastStatus'],
        _count: { lastStatus: true },
      }),
      db.subscriptionPageEvent.count({
        where: {
          createdAt: {
            gte: since,
          },
        },
      }),
    ]);

  const healthSummary = {
    up: 0,
    slow: 0,
    down: 0,
    unknown: 0,
  };

  for (const row of healthCounts) {
    switch (row.lastStatus) {
      case 'UP':
        healthSummary.up = row._count.lastStatus;
        break;
      case 'SLOW':
        healthSummary.slow = row._count.lastStatus;
        break;
      case 'DOWN':
        healthSummary.down = row._count.lastStatus;
        break;
      default:
        healthSummary.unknown += row._count.lastStatus;
        break;
    }
  }

  const message = [
    ui.digestTitle,
    '',
    ui.digestWindow(lookbackHours),
    `${ui.digestActiveKeys}: ${activeKeys}`,
    `${ui.digestPendingKeys}: ${pendingKeys}`,
    `${ui.digestDepletedKeys}: ${depletedKeys}`,
    `${ui.digestExpiringSoon}: ${expiringSoon}`,
    `${ui.digestOpenIncidents}: ${openIncidents}`,
    `${ui.digestEvents}: ${recentViews}`,
    '',
    `${ui.digestServerHealth}: ${ui.digestHealthSummary(healthSummary.up, healthSummary.slow, healthSummary.down, healthSummary.unknown)}`,
  ].join('\n');

  for (const chatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, chatId, message);
  }

  await writeAuditLog({
    action: 'TELEGRAM_DIGEST_SENT',
    entity: 'TELEGRAM',
    details: {
      adminChats: config.adminChatIds.length,
      lookbackHours,
      activeKeys,
      expiringSoon,
      openIncidents,
      recentViews,
    },
  });

  return {
    sent: true as const,
    adminChats: config.adminChatIds.length,
    lookbackHours,
  };
}
