import { defaultLocale, supportedLocales, type SupportedLocale } from '@/lib/i18n/config';

export type LocalizedTemplateMap = Partial<Record<SupportedLocale, string>>;

export function normalizeLocalizedTemplateMap(value: unknown): LocalizedTemplateMap {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const normalized: LocalizedTemplateMap = {};

  for (const locale of supportedLocales) {
    const raw = (value as Record<string, unknown>)[locale];
    if (typeof raw === 'string') {
      normalized[locale] = raw;
    }
  }

  return normalized;
}

export function resolveLocalizedTemplate(
  templates: LocalizedTemplateMap | null | undefined,
  locale: SupportedLocale,
  fallback?: string | null,
) {
  const direct = templates?.[locale]?.trim();
  if (direct) {
    return direct;
  }

  const defaultValue = templates?.[defaultLocale]?.trim();
  if (defaultValue) {
    return defaultValue;
  }

  return fallback?.trim() || '';
}
