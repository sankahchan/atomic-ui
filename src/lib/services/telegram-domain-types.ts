import { type SupportedLocale } from '@/lib/i18n/config';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    chat: {
      id: number;
      type: string;
    };
    from: {
      id: number;
      is_bot: boolean;
      username?: string;
      first_name: string;
    };
    reply_to_message?: {
      message_id?: number;
      from?: {
        id: number;
        is_bot: boolean;
        username?: string;
        first_name: string;
      };
      chat?: {
        id: number;
        type?: string;
      };
      text?: string;
      caption?: string;
    };
    photo?: Array<{
      file_id: string;
      file_unique_id?: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id?: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      username?: string;
      first_name: string;
    };
    message?: {
      chat: {
        id: number;
        type?: string;
      };
      message_id?: number;
    };
    data?: string;
  };
}

export type TelegramLocaleSelectorContext = 'start' | 'switch';

export type TelegramOrderReviewAction =
  | 'approve'
  | 'claim'
  | 'next'
  | 'prev'
  | 'reject'
  | 'reject_duplicate'
  | 'reject_blurry'
  | 'reject_wrong_amount';

export type TelegramOrderUserAction =
  | 'pl'
  | 'ky'
  | 'sv'
  | 'pm'
  | 'pay'
  | 'up'
  | 'st'
  | 'rf'
  | 'ca'
  | 'by'
  | 'cp'
  | 'rt'
  | 'sh'
  | 'rc';

export type TelegramServerChangeReviewAction = 'approve' | 'reject';
export type TelegramServerChangeUserAction = 'ky' | 'sv' | 'st' | 'ca';
export type TelegramDynamicSupportUserAction = 'rg' | 'rv' | 'is' | 'st' | 'rp' | 'ca';
export type TelegramMenuSection = 'admin' | 'inbox' | 'offers' | 'support' | 'orders';

export type TelegramAdminMenuAction =
  | 'home'
  | 'createkey'
  | 'createdynamic'
  | 'managekey'
  | 'managedynamic'
  | 'reviewqueue'
  | 'reviewqueue_mine'
  | 'reviewqueue_unclaimed'
  | 'supportpremium'
  | 'supportthreads'
  | 'refunds'
  | 'announcements'
  | 'finance'
  | 'status'
  | 'servernotices'
  | 'supportqueue'
  | 'supportqueue_admin'
  | 'supportqueue_user';

export type TelegramInboxMenuAction =
  | 'all'
  | 'unread'
  | 'pinned'
  | 'orders'
  | 'support'
  | 'refunds'
  | 'announcements'
  | 'premium';

export type TelegramOffersMenuAction = 'all' | 'active' | 'used' | 'unavailable';
export type TelegramOrdersMenuAction = 'all' | 'action' | 'review' | 'completed';

export type TelegramSupportMenuAction =
  | 'home'
  | 'orders'
  | 'refunds'
  | 'inbox'
  | 'server'
  | 'premium'
  | 'keys';

export type TelegramSupportQueueAction = 'wk' | 'nd' | 'hd' | 'nx' | 'cl' | 'uc' | 'rp' | 'es';
export type TelegramSupportThreadAction = 'new' | 'reply' | 'status' | 'escalate';

export type TelegramNotificationPreferenceKey =
  | 'promo'
  | 'maintenance'
  | 'receipt'
  | 'support';

export type TelegramRetentionSource =
  | 'trial_expiry'
  | 'trial_coupon'
  | 'trial_expired'
  | 'renewal_coupon'
  | 'renewal_7d'
  | 'renewal_3d'
  | 'renewal_manual'
  | 'premium_upsell_coupon'
  | 'premium_renewal_7d'
  | 'premium_renewal_3d'
  | 'winback_coupon'
  | 'expired_recovery'
  | 'order_retry';

export type TelegramLocaleCallbackPayload = {
  locale: SupportedLocale;
  context: TelegramLocaleSelectorContext;
  startArgs: string;
};

export type TelegramOrderReviewCallbackPayload = {
  action: TelegramOrderReviewAction;
  orderId: string;
  secondary: string | null;
};

export type TelegramOrderActionCallbackPayload = {
  action: TelegramOrderUserAction;
  primary: string;
  secondary: string | null;
};

export type TelegramServerChangeReviewCallbackPayload = {
  action: TelegramServerChangeReviewAction;
  requestId: string;
};

export type TelegramServerChangeActionCallbackPayload = {
  action: TelegramServerChangeUserAction;
  primary: string;
  secondary: string | null;
};

export type TelegramDynamicSupportActionCallbackPayload = {
  action: TelegramDynamicSupportUserAction;
  primary: string;
  secondary: string | null;
};

export type TelegramNotificationPreferenceCallbackPayload = {
  preference: TelegramNotificationPreferenceKey;
  enabled: boolean;
};

export type TelegramMenuCallbackPayload = {
  section: TelegramMenuSection;
  action: string;
};

export type TelegramSupportQueueCallbackPayload = {
  action: TelegramSupportQueueAction;
  requestId: string;
  secondary: string | null;
};

export type TelegramSupportThreadCallbackPayload = {
  action: TelegramSupportThreadAction;
  primary: string;
  secondary: string | null;
};

export type TelegramAdminKeyCallbackPayload = {
  action: string;
  primary: string | null;
  secondary: string | null;
};

export type TelegramSupportQueueMode = 'all' | 'admin' | 'user';
export type TelegramReviewQueueMode = 'all' | 'mine' | 'unclaimed';

export type TelegramSupportThreadQueueSnapshot<TThread> = {
  totalOpen: number;
  waitingAdmin: number;
  waitingUser: number;
  overdue: number;
  threads: TThread[];
};

export type TelegramPremiumSupportQueueSnapshot<TRequest> = {
  totalOpen: number;
  waitingAdmin: number;
  waitingUser: number;
  requests: TRequest[];
};

export type TelegramDeliveryMode = 'DIRECT' | 'CONNECT_LINK' | 'CREATE_ONLY';

export type TelegramDeliveryResult = {
  mode: TelegramDeliveryMode;
  delivered: boolean;
  recipientChatId: string | null;
  connectUrl?: string | null;
  connectExpiresAt?: Date | null;
};

export type SendTelegramMessageResult =
  | {
      success: true;
      status: number;
    }
  | {
      success: false;
      status: number | null;
      error: string;
    };

export type SendTelegramMessageFn = (
  botToken: string,
  chatId: number | string,
  text: string,
  options?: {
    parseMode?: 'HTML' | 'Markdown';
    replyMarkup?: Record<string, unknown>;
    disableWebPagePreview?: boolean;
  },
) => Promise<boolean>;

export type SendAccessKeyShareFn = (input: {
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
  locale?: SupportedLocale;
}) => Promise<unknown>;

export type SendDynamicKeyShareFn = (input: {
  dynamicAccessKeyId: string;
  chatId?: string | number | null;
  planName?: string | null;
  reason?:
    | 'CREATED'
    | 'RESENT'
    | 'LINKED'
    | 'KEY_ENABLED'
    | 'USAGE_REQUEST'
    | 'SUBSCRIPTION_REQUEST';
  source?: string | null;
  includeQr?: boolean;
  locale?: SupportedLocale;
}) => Promise<unknown>;

export type CreateAccessKeyConnectLinkFn = (input: {
  accessKeyId: string;
  createdByUserId?: string | null;
}) => Promise<{
  url: string;
  expiresAt: Date;
}>;

export type CreateDynamicKeyConnectLinkFn = (input: {
  dynamicAccessKeyId: string;
  createdByUserId?: string | null;
}) => Promise<{
  url: string;
  expiresAt: Date;
}>;

export type CopyTelegramMessageFn = (
  botToken: string,
  fromChatId: number | string,
  messageId: number,
  toChatId: number | string,
) => Promise<boolean>;

export type TelegramAdminKeyDeps = {
  sendTelegramMessage: SendTelegramMessageFn;
  sendAccessKeySharePageToTelegram: SendAccessKeyShareFn;
  sendDynamicKeySharePageToTelegram: SendDynamicKeyShareFn;
  createAccessKeyTelegramConnectLink: CreateAccessKeyConnectLinkFn;
  createDynamicKeyTelegramConnectLink: CreateDynamicKeyConnectLinkFn;
  copyTelegramMessage: CopyTelegramMessageFn;
};
