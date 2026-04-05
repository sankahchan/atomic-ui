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

export function normalizeTelegramUtf8Text(input: string) {
  let output = '';

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += input[index] + input[index + 1];
        index += 1;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    if ((code >= 0 && code <= 0x08) || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || code === 0x7f) {
      continue;
    }

    output += input[index];
  }

  return {
    text: output,
    changed: output !== input,
  };
}

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
  const normalized = normalizeTelegramUtf8Text(text);

  return {
    text: normalized.text,
    changed: normalized.text !== input,
    invalidTags: Array.from(invalidTags),
    invalidCharactersRemoved: normalized.changed,
  };
}

export function validateTelegramHtmlMessage(input: string) {
  const invalidTags = findUnsupportedTelegramHtmlTags(input);

  return {
    valid: invalidTags.length === 0,
    invalidTags,
  };
}
