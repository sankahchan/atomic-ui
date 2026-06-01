export { handleTelegramUpdate } from '@/lib/services/telegram-bot-dispatch';
export type { TelegramUpdate } from '@/lib/services/telegram-domain-types';
export type { TelegramConfig } from '@/lib/services/telegram-runtime';

export {
  approveTelegramOrder,
  approveTelegramPremiumSupportRequest,
  approveTelegramServerChangeRequest,
  createAccessKeyTelegramConnectLink,
  createDynamicKeyTelegramConnectLink,
  dismissTelegramPremiumSupportRequest,
  replyTelegramPremiumSupportRequest,
  rejectTelegramOrder,
  rejectTelegramServerChangeRequest,
  runTelegramSalesOrderCycle,
  runTelegramSalesDigestCycle,
  sendAccessKeyLifecycleTelegramNotification,
  sendAccessKeyRenewalReminder,
  sendAccessKeySharePageToTelegram,
  sendAccessKeySupportMessage,
  sendAdminAlert,
  sendDynamicKeySharePageToTelegram,
  sendRenewalRequestToAdmins,
  sendServerIssueNoticeToTelegram,
  sendTelegramDigestToAdmins,
  sendTelegramMessage,
  sendTelegramOrderReceiptConfirmation,
  updateTelegramOrderDraft,
  handleTelegramPremiumSupportRequest,
  getTelegramConfig,
} from '@/lib/services/telegram-bot-core';

export { getTelegramBotConfigs } from '@/lib/services/telegram-runtime';
