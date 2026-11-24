import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

type UnicodeRange = readonly [number, number];

const repoRoot = process.cwd();
const fontSource = readFileSync(path.join(repoRoot, 'src/lib/fonts.ts'), 'utf8');
const sharePageSource = readFileSync(
  path.join(repoRoot, 'src/app/share/[token]/route.ts'),
  'utf8',
);
const translationSource = readFileSync(
  path.join(repoRoot, 'src/lib/i18n/translations.ts'),
  'utf8',
);

function parseUnicodeRanges(source: string): UnicodeRange[] {
  const ranges: UnicodeRange[] = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/g)) {
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    ranges.push([start, end]);
  }
  return ranges;
}

function isMyanmarCodepoint(codepoint: number) {
  return (
    (codepoint >= 0x1000 && codepoint <= 0x109f) ||
    (codepoint >= 0xa9e0 && codepoint <= 0xa9ff) ||
    (codepoint >= 0xaa60 && codepoint <= 0xaa7f) ||
    codepoint === 0x25cc
  );
}

function isCovered(codepoint: number, ranges: UnicodeRange[]) {
  return ranges.some(([start, end]) => codepoint >= start && codepoint <= end);
}

const fontRanges = parseUnicodeRanges(fontSource);
const sharePageRanges = parseUnicodeRanges(sharePageSource);

test('custom Myanmar font declares the expected unicode ranges', () => {
  assert.ok(fontRanges.length > 0);
  for (const codepoint of [0x1000, 0x1031, 0x1038, 0x104a, 0x25cc, 0xaa60]) {
    assert.equal(isCovered(codepoint, fontRanges), true, `Missing U+${codepoint.toString(16)}`);
  }
});

test('standalone share page uses the same unicode ranges as the dashboard font', () => {
  assert.deepEqual(sharePageRanges, fontRanges);
});

test('every Myanmar character used in translations falls inside the declared ranges', () => {
  const used = new Set<number>();
  for (const character of translationSource) {
    const codepoint = character.codePointAt(0);
    if (codepoint !== undefined && isMyanmarCodepoint(codepoint)) {
      used.add(codepoint);
    }
  }

  assert.ok(used.size > 0);
  const uncovered = [...used].filter((codepoint) => !isCovered(codepoint, fontRanges));
  assert.deepEqual(
    uncovered.map((codepoint) => `U+${codepoint.toString(16).toUpperCase()}`),
    [],
  );
});
