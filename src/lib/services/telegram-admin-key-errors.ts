import { type SupportedLocale } from '@/lib/i18n/config';

export type TelegramAdminKeyErrorNotice = {
  callbackText: string;
  chatTitle: string;
  chatText: string;
};

function resolveTelegramAdminKeyErrorMessage(error: unknown) {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return 'Unknown error';
}

export function buildTelegramAdminKeyErrorNotice(
  error: unknown,
  locale: SupportedLocale,
): TelegramAdminKeyErrorNotice {
  const message = resolveTelegramAdminKeyErrorMessage(error);
  const isMyanmar = locale === 'my';

  if (message.includes('certificate fingerprint mismatch')) {
    return {
      callbackText: isMyanmar ? 'Server cert mismatch.' : 'Server cert mismatch.',
      chatTitle: isMyanmar ? '❌ <b>Key action failed</b>' : '❌ <b>Key action failed</b>',
      chatText: isMyanmar
        ? 'Outline server certificate fingerprint မကိုက်ညီပါ။ Dashboard > Servers တွင် server config ကို စစ်ပြီး ပြန်သိမ်းပါ။'
        : 'The Outline server certificate fingerprint does not match the saved server config. Recheck and re-save the server in Dashboard > Servers, then try again.',
    };
  }

  if (message.includes('Failed to connect to Outline server') || message.includes('Connection timeout')) {
    return {
      callbackText: isMyanmar ? 'Server connection failed.' : 'Server connection failed.',
      chatTitle: isMyanmar ? '❌ <b>Key action failed</b>' : '❌ <b>Key action failed</b>',
      chatText: isMyanmar
        ? 'Outline server ကို ချိတ်ဆက်မရပါ။ Server health, API URL နှင့် firewall ကို စစ်ပြီး ထပ်စမ်းပါ။'
        : 'The Outline server could not be reached. Check server health, API URL, and firewall access, then try again.',
    };
  }

  return {
    callbackText: isMyanmar ? 'Key action failed.' : 'Key action failed.',
    chatTitle: isMyanmar ? '❌ <b>Key action failed</b>' : '❌ <b>Key action failed</b>',
    chatText: message,
  };
}
