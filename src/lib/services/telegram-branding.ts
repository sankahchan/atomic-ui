import { withAbsoluteBasePath } from '@/lib/base-path';

const TELEGRAM_BRAND_MEDIA = {
  paymentGuide: 'brand-payment-guide.png',
  receiptPaid: 'brand-receipt-paid.png',
  receiptRefund: 'brand-receipt-refund.png',
  premiumShowcase: 'brand-premium-showcase.png',
  offersWallet: 'brand-offers-wallet.png',
  proofGood: 'proof-example-good.png',
  proofBad: 'proof-example-bad.png',
  proofCommonMistake: 'proof-example-common-mistake.png',
} as const;

export type TelegramBrandMediaAsset = keyof typeof TELEGRAM_BRAND_MEDIA;

export function getTelegramBrandMediaUrl(asset: TelegramBrandMediaAsset) {
  return withAbsoluteBasePath(`/telegram/${TELEGRAM_BRAND_MEDIA[asset]}`);
}

export function getTelegramProofExampleUrls() {
  return {
    good: getTelegramBrandMediaUrl('proofGood'),
    bad: getTelegramBrandMediaUrl('proofBad'),
    common: getTelegramBrandMediaUrl('proofCommonMistake'),
  };
}
