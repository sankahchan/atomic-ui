import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramCommerceViewCallbackData,
  type TelegramCommerceViewSection,
} from '@/lib/services/telegram-callbacks';

export const TELEGRAM_COMMERCE_PAGE_SIZE = 3;

export type TelegramInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramInlineKeyboard = {
  inline_keyboard: TelegramInlineButton[][];
};

export function clampTelegramCommercePage(
  page: number,
  totalItems: number,
  pageSize = TELEGRAM_COMMERCE_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(Number.isFinite(page) ? page : 1, 1), totalPages);
}

export function paginateTelegramCommerce<T>(
  items: T[],
  requestedPage: number,
  pageSize = TELEGRAM_COMMERCE_PAGE_SIZE,
) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clampTelegramCommercePage(requestedPage, totalItems, pageSize);
  const startIndex = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    pageItems: items.slice(startIndex, startIndex + pageSize),
  };
}

export function truncateTelegramCommerceButtonLabel(value: string, maxLength = 28) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function buildTelegramCommerceCard(
  title: string,
  lines: Array<string | null | undefined>,
) {
  return [title, ...lines.filter(Boolean)].join('\n');
}

export function buildTelegramCommerceMessage(input: {
  title: string;
  statsLine?: string | null;
  intro?: string | null;
  cards?: Array<string | null | undefined>;
  footerLines?: Array<string | null | undefined>;
}) {
  const sections: string[] = [input.title];

  if (input.statsLine) {
    sections.push(input.statsLine);
  }

  if (input.intro) {
    sections.push(input.intro);
  }

  if (input.cards?.length) {
    sections.push(...(input.cards.filter(Boolean) as string[]));
  }

  if (input.footerLines?.length) {
    sections.push(...(input.footerLines.filter(Boolean) as string[]));
  }

  return sections.join('\n\n');
}

export function buildTelegramCommercePagerRow(input: {
  locale: SupportedLocale;
  section: TelegramCommerceViewSection;
  page: number;
  totalItems: number;
  secondary?: string | null;
  pageSize?: number;
}) {
  const pagination = paginateTelegramCommerce(
    new Array(Math.max(input.totalItems, 0)).fill(null),
    input.page,
    input.pageSize,
  );

  if (pagination.totalPages <= 1) {
    return null;
  }

  const isMyanmar = input.locale === 'my';
  const row: TelegramInlineButton[] = [];

  if (pagination.page > 1) {
    row.push({
      text: isMyanmar ? '‹ ရှေ့' : '‹ Prev',
      callback_data: buildTelegramCommerceViewCallbackData(
        input.section,
        'page',
        String(pagination.page - 1),
        input.secondary || undefined,
      ),
    });
  }

  row.push({
    text: `${pagination.page}/${pagination.totalPages}`,
    callback_data: buildTelegramCommerceViewCallbackData(
      input.section,
      'home',
      String(pagination.page),
      input.secondary || undefined,
    ),
  });

  if (pagination.page < pagination.totalPages) {
    row.push({
      text: isMyanmar ? 'နောက် ›' : 'Next ›',
      callback_data: buildTelegramCommerceViewCallbackData(
        input.section,
        'page',
        String(pagination.page + 1),
        input.secondary || undefined,
      ),
    });
  }

  return row;
}
