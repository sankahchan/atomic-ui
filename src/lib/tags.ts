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
    .map((tag) => tag.trim())
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
 * Check if a tag exists in stored tags string
 */
export function tagMatchesFilter(storedTags: string, filterTag: string): boolean {
  if (!storedTags || !filterTag) return false;
  const normalizedFilter = filterTag.trim().toLowerCase();
  return storedTags.includes(`,${normalizedFilter},`);
}
