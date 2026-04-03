export type PromoCampaignType =
  | 'TRIAL_TO_PAID'
  | 'RENEWAL_SOON'
  | 'PREMIUM_UPSELL'
  | 'WINBACK';

export type PromoEligibilityOverrideMode = 'FORCE_ALLOW' | 'FORCE_BLOCK';

export type PromoEligibilityOverride = {
  mode: PromoEligibilityOverrideMode;
  note?: string | null;
  updatedAt?: string | null;
  updatedByUserId?: string | null;
  updatedByEmail?: string | null;
};

export type PromoEligibilityOverrideMap = Partial<Record<PromoCampaignType, PromoEligibilityOverride>>;

const PROMO_CAMPAIGN_TYPES: PromoCampaignType[] = [
  'TRIAL_TO_PAID',
  'RENEWAL_SOON',
  'PREMIUM_UPSELL',
  'WINBACK',
];

function isPromoCampaignType(value: string): value is PromoCampaignType {
  return PROMO_CAMPAIGN_TYPES.includes(value as PromoCampaignType);
}

function isPromoEligibilityOverrideMode(value: string): value is PromoEligibilityOverrideMode {
  return value === 'FORCE_ALLOW' || value === 'FORCE_BLOCK';
}

export function parsePromoEligibilityOverrides(
  value: string | null | undefined,
): PromoEligibilityOverrideMap {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const normalized: PromoEligibilityOverrideMap = {};

    for (const [key, rawOverride] of Object.entries(parsed)) {
      if (!isPromoCampaignType(key) || !rawOverride || typeof rawOverride !== 'object') {
        continue;
      }

      const mode = (rawOverride as { mode?: unknown }).mode;
      if (typeof mode !== 'string' || !isPromoEligibilityOverrideMode(mode)) {
        continue;
      }

      normalized[key] = {
        mode,
        note:
          typeof (rawOverride as { note?: unknown }).note === 'string'
            ? (rawOverride as { note: string }).note.trim() || null
            : null,
        updatedAt:
          typeof (rawOverride as { updatedAt?: unknown }).updatedAt === 'string'
            ? (rawOverride as { updatedAt: string }).updatedAt
            : null,
        updatedByUserId:
          typeof (rawOverride as { updatedByUserId?: unknown }).updatedByUserId === 'string'
            ? (rawOverride as { updatedByUserId: string }).updatedByUserId
            : null,
        updatedByEmail:
          typeof (rawOverride as { updatedByEmail?: unknown }).updatedByEmail === 'string'
            ? (rawOverride as { updatedByEmail: string }).updatedByEmail
            : null,
      };
    }

    return normalized;
  } catch {
    return {};
  }
}

export function serializePromoEligibilityOverrides(
  overrides: PromoEligibilityOverrideMap,
): string {
  const normalized: PromoEligibilityOverrideMap = {};

  for (const campaignType of PROMO_CAMPAIGN_TYPES) {
    const override = overrides[campaignType];
    if (!override || !isPromoEligibilityOverrideMode(override.mode)) {
      continue;
    }

    normalized[campaignType] = {
      mode: override.mode,
      note: override.note?.trim() || null,
      updatedAt: override.updatedAt || null,
      updatedByUserId: override.updatedByUserId || null,
      updatedByEmail: override.updatedByEmail || null,
    };
  }

  return JSON.stringify(normalized);
}

export function getPromoEligibilityOverride(
  overrides: PromoEligibilityOverrideMap | null | undefined,
  campaignType: PromoCampaignType,
): PromoEligibilityOverride | null {
  if (!overrides) {
    return null;
  }

  const override = overrides[campaignType];
  return override && isPromoEligibilityOverrideMode(override.mode) ? override : null;
}

export function setPromoEligibilityOverride(
  overrides: PromoEligibilityOverrideMap,
  campaignType: PromoCampaignType,
  override: PromoEligibilityOverride | null,
): PromoEligibilityOverrideMap {
  const next = { ...overrides };

  if (!override) {
    delete next[campaignType];
    return next;
  }

  next[campaignType] = {
    mode: override.mode,
    note: override.note?.trim() || null,
    updatedAt: override.updatedAt || null,
    updatedByUserId: override.updatedByUserId || null,
    updatedByEmail: override.updatedByEmail || null,
  };
  return next;
}
