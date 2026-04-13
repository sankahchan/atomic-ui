import { createHash } from 'node:crypto';

export type TelegramAnnouncementExperimentVariantAllocation = {
  variantKey: string;
  allocationPercent: number;
};

function normalizeExperimentVariants(
  variants: TelegramAnnouncementExperimentVariantAllocation[],
) {
  const cleaned = variants
    .map((variant) => ({
      variantKey: variant.variantKey.trim(),
      allocationPercent: Number.isFinite(variant.allocationPercent)
        ? Math.max(0, variant.allocationPercent)
        : 0,
    }))
    .filter((variant) => variant.variantKey.length > 0)
    .sort((left, right) => left.variantKey.localeCompare(right.variantKey));

  if (cleaned.length === 0) {
    return [];
  }

  const total = cleaned.reduce((sum, variant) => sum + variant.allocationPercent, 0);
  if (total <= 0) {
    const equalWeight = 1 / cleaned.length;
    return cleaned.map((variant) => ({
      variantKey: variant.variantKey,
      weight: equalWeight,
    }));
  }

  return cleaned.map((variant) => ({
    variantKey: variant.variantKey,
    weight: variant.allocationPercent / total,
  }));
}

function getAssignmentBucket(seed: string) {
  const digest = createHash('sha256').update(seed).digest();
  const bucket =
    (((digest[0] ?? 0) << 24) |
      ((digest[1] ?? 0) << 16) |
      ((digest[2] ?? 0) << 8) |
      (digest[3] ?? 0)) >>>
    0;

  return bucket / 0x1_0000_0000;
}

export function assignTelegramAnnouncementExperimentVariant(input: {
  experimentId: string;
  chatId: string;
  variants: TelegramAnnouncementExperimentVariantAllocation[];
}) {
  const variants = normalizeExperimentVariants(input.variants);
  if (variants.length === 0) {
    return null;
  }

  const bucket = getAssignmentBucket(`${input.experimentId.trim()}:${input.chatId.trim()}`);
  let cursor = 0;

  for (const variant of variants) {
    cursor += variant.weight;
    if (bucket < cursor) {
      return variant.variantKey;
    }
  }

  return variants[variants.length - 1]?.variantKey ?? null;
}

export function countTelegramAnnouncementExperimentAssignments(input: {
  experimentId: string;
  chatIds: string[];
  variants: TelegramAnnouncementExperimentVariantAllocation[];
}) {
  const counts = new Map<string, number>();

  for (const chatId of input.chatIds) {
    const variantKey = assignTelegramAnnouncementExperimentVariant({
      experimentId: input.experimentId,
      chatId,
      variants: input.variants,
    });
    if (!variantKey) {
      continue;
    }
    counts.set(variantKey, (counts.get(variantKey) || 0) + 1);
  }

  return Object.fromEntries(counts.entries());
}
