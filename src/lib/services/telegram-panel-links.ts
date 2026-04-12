import { withAbsoluteBasePath } from '@/lib/base-path';

function getTelegramPanelOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  );
}

function getTelegramPanelBasePath() {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

export async function buildTelegramOrderPanelUrl(orderId: string) {
  return `${getTelegramPanelOrigin()}${getTelegramPanelBasePath()}/dashboard/notifications?telegramOrder=${encodeURIComponent(orderId)}`;
}

export async function buildTelegramServerChangePanelUrl(requestId: string) {
  return `${getTelegramPanelOrigin()}${getTelegramPanelBasePath()}/dashboard/notifications?serverChangeRequest=${encodeURIComponent(requestId)}`;
}

export async function buildTelegramPremiumSupportPanelUrl(requestId: string) {
  return `${getTelegramPanelOrigin()}${getTelegramPanelBasePath()}/dashboard/notifications?premiumSupportRequest=${encodeURIComponent(requestId)}`;
}

export async function buildTelegramDynamicKeyPanelUrl(dynamicAccessKeyId: string) {
  return withAbsoluteBasePath(`/dashboard/dynamic-keys/${encodeURIComponent(dynamicAccessKeyId)}`);
}
