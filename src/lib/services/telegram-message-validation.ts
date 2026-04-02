const TELEGRAM_ALLOWED_HTML_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'code',
  'del',
  'em',
  'i',
  'ins',
  'pre',
  's',
  'strong',
  'tg-spoiler',
  'u',
]);

const TELEGRAM_TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9-]*)(\s[^<>]*?)?>/g;

export function findUnsupportedTelegramHtmlTags(input: string) {
  const tags = new Set<string>();
  const pattern = new RegExp(TELEGRAM_TAG_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const tagName = match[1]?.toLowerCase();
    if (!tagName || TELEGRAM_ALLOWED_HTML_TAGS.has(tagName)) {
      continue;
    }
    tags.add(tagName);
  }

  return Array.from(tags);
}

export function sanitizeTelegramHtmlMessage(input: string) {
  const invalidTags = new Set<string>();

  const text = input.replace(TELEGRAM_TAG_PATTERN, (match, rawTagName: string) => {
    const tagName = rawTagName.toLowerCase();
    if (TELEGRAM_ALLOWED_HTML_TAGS.has(tagName)) {
      return match;
    }

    invalidTags.add(tagName);
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });

  return {
    text,
    changed: text !== input,
    invalidTags: Array.from(invalidTags),
  };
}

export function validateTelegramHtmlMessage(input: string) {
  const invalidTags = findUnsupportedTelegramHtmlTags(input);

  return {
    valid: invalidTags.length === 0,
    invalidTags,
  };
}
