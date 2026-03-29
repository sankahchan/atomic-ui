/**
 * Split input by comma, trim, lowercase, dedupe, remove empties
 */
export function normalizeTags(input: string): string[] {
  const tags = input
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);

  return Array.from(new Set(tags));
}

export const KEY_SOURCE_TAGS = ['web', 'tele', 'trial', 'reseller'] as const;
export const KEY_TAG_PRESETS = ['trial', 'premium', 'reseller', 'vip'] as const;

const TAG_LABELS: Record<string, string> = {
  web: 'Web',
  tele: 'Tele',
  trial: 'Trial',
  reseller: 'Reseller',
  premium: 'Premium',
  vip: 'VIP',
};

const TAG_TONE_CLASSES: Record<string, string> = {
  web: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 hover:border-cyan-500/35 hover:text-cyan-800 dark:text-cyan-300',
  tele: 'border-violet-500/20 bg-violet-500/10 text-violet-700 hover:border-violet-500/35 hover:text-violet-800 dark:text-violet-300',
  trial: 'border-amber-500/20 bg-amber-500/10 text-amber-700 hover:border-amber-500/35 hover:text-amber-800 dark:text-amber-300',
  reseller: 'border-rose-500/20 bg-rose-500/10 text-rose-700 hover:border-rose-500/35 hover:text-rose-800 dark:text-rose-300',
  premium: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/35 hover:text-emerald-800 dark:text-emerald-300',
  vip: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 hover:border-fuchsia-500/35 hover:text-fuchsia-800 dark:text-fuchsia-300',
};

/**
 * Join normalized tags with comma for storage
 */
export function tagsToString(tags: string[]): string {
  return normalizeTags(tags.join(',')).join(',');
}

/**
 * Split stored string back to array
 */
export function stringToTags(str: string): string[] {
  if (!str) return [];
  return str
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
}

/**
 * Normalize and convert to storage format with leading/trailing commas
 * e.g. ",tag1,tag2," for safer SQL contains filtering
 */
export function formatTagsForStorage(input: string): string {
  const tags = normalizeTags(input);
  if (tags.length === 0) return '';
  return `,${tags.join(',')},`;
}

/**
 * Merge multiple tag inputs and return storage format with leading/trailing commas.
 */
export function mergeTagsForStorage(...inputs: Array<string | null | undefined>): string {
  const merged = normalizeTags(
    inputs
      .filter(Boolean)
      .join(',')
  );

  if (merged.length === 0) {
    return '';
  }

  return `,${merged.join(',')},`;
}

/**
 * Check if a tag exists in stored tags string
 */
export function tagMatchesFilter(storedTags: string, filterTag: string): boolean {
  if (!storedTags || !filterTag) return false;
  const normalizedFilter = filterTag.trim().toLowerCase();
  return storedTags.includes(`,${normalizedFilter},`);
}

export function getTagDisplayLabel(tag: string): string {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  return TAG_LABELS[normalized] || normalized.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getTagToneClassName(tag: string): string {
  return TAG_TONE_CLASSES[tag.trim().toLowerCase()] || 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-primary dark:bg-white/[0.03]';
}

export function toggleEditableTagList(input: string, tag: string): string {
  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag) {
    return normalizeTags(input).join(', ');
  }

  const current = normalizeTags(input);
  const next = current.includes(normalizedTag)
    ? current.filter((item) => item !== normalizedTag)
    : [...current, normalizedTag];

  return next.join(', ');
}

export function summarizeStoredTags(storedTags: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  let untaggedCount = 0;

  for (const stored of storedTags) {
    const tags = stringToTags(stored || '');
    if (tags.length === 0) {
      untaggedCount += 1;
      continue;
    }

    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const sourceCounts = {
    web: counts.get('web') || 0,
    tele: counts.get('tele') || 0,
    trial: counts.get('trial') || 0,
    reseller: counts.get('reseller') || 0,
    untagged: untaggedCount,
  };

  const topTags = Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([tag, count]) => ({ tag, count }));

  return {
    sourceCounts,
    topTags,
  };
}
