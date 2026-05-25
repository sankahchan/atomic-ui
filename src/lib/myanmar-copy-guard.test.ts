import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as ts from 'typescript';

type LocalizationBranch = 'whenTrue' | 'whenFalse';

type MyanmarString = {
  line: number;
  text: string;
};

type GuardRule = {
  file: string;
  banned: Array<{ label: string; pattern: RegExp }>;
};

type Finding = {
  file: string;
  line: number;
  label: string;
  text: string;
};

const guardRules: GuardRule[] = [
  {
    file: 'src/app/(dashboard)/dashboard/servers/[id]/page.tsx',
    banned: [
      { label: 'Server Detail', pattern: /\bServer Detail\b/ },
      { label: 'Managed Outline server', pattern: /\bManaged Outline server\b/ },
      { label: 'No recent probe', pattern: /\bNo recent probe\b/ },
      { label: 'Active Keys', pattern: /\bActive Keys\b/ },
      { label: 'total assigned', pattern: /\btotal assigned\b/i },
      { label: 'keys expiring within 7 days', pattern: /\bkeys expiring within 7 days\b/i },
      { label: 'Sync pending', pattern: /\bSync pending\b/ },
      { label: 'Server workspace', pattern: /\bServer workspace\b/ },
      { label: 'Outage history', pattern: /\bOutage history\b/ },
      { label: 'Open outage', pattern: /\bOpen outage\b/ },
      { label: 'Manual Telegram notice', pattern: /\bManual Telegram notice\b/ },
      { label: 'No outage history for this server yet', pattern: /\bNo outage history for this server yet\b/ },
      { label: 'There is no active outage on this server right now', pattern: /\bThere is no active outage on this server right now\b/ },
    ],
  },
  {
    file: 'src/app/(dashboard)/dashboard/servers/deploy/page.tsx',
    banned: [
      { label: 'Required', pattern: /\bRequired\b/ },
      { label: 'Configured', pattern: /\bConfigured\b/ },
      { label: 'Needs resave', pattern: /\bNeeds resave\b/ },
      { label: 'Invalid', pattern: /\bInvalid\b/ },
    ],
  },
  {
    file: 'src/lib/services/telegram-storefront.ts',
    banned: [
      { label: 'Subscription URL', pattern: /\bSubscription URL\b/ },
      { label: 'Client URL', pattern: /\bClient URL\b/ },
      { label: 'Flash Plans', pattern: /\bFlash Plans\b/ },
      { label: 'Season Plans', pattern: /\bSeason Plans\b/ },
      { label: 'Dynamic Plans', pattern: /\bDynamic Plans\b/ },
      { label: 'Key type', pattern: /\bKey type\b/ },
    ],
  },
  {
    file: 'src/lib/services/telegram-support-cards.ts',
    banned: [
      { label: 'Premium help', pattern: /\bPremium help\b/ },
      { label: 'Reply now', pattern: /\bReply now\b/ },
    ],
  },
];

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function identifyMyanmarBranch(condition: ts.Expression): LocalizationBranch | null {
  const current = unwrapExpression(condition);

  if (ts.isIdentifier(current) && current.text === 'isMyanmar') {
    return 'whenTrue';
  }

  if (
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.expression.text === 'isLocaleMyanmar'
  ) {
    return 'whenTrue';
  }

  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = unwrapExpression(current.operand);
    if (ts.isIdentifier(inner) && inner.text === 'isMyanmar') {
      return 'whenFalse';
    }
    if (
      ts.isCallExpression(inner) &&
      ts.isIdentifier(inner.expression) &&
      inner.expression.text === 'isLocaleMyanmar'
    ) {
      return 'whenFalse';
    }
  }

  if (
    ts.isBinaryExpression(current) &&
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
    ].includes(current.operatorToken.kind)
  ) {
    const left = unwrapExpression(current.left);
    const right = unwrapExpression(current.right);
    const leftIsMyanmarLiteral = ts.isStringLiteral(left) && left.text === 'my';
    const rightIsMyanmarLiteral = ts.isStringLiteral(right) && right.text === 'my';
    const comparesLocale =
      (leftIsMyanmarLiteral && /(?:locale|lang|language)/i.test(right.getText())) ||
      (rightIsMyanmarLiteral && /(?:locale|lang|language)/i.test(left.getText()));

    if (comparesLocale) {
      return [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
      ].includes(current.operatorToken.kind)
        ? 'whenTrue'
        : 'whenFalse';
    }
  }

  return null;
}

function extractLiteralText(node: ts.StringLiteral | ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return node.head.text + node.templateSpans.map((span) => `•${span.literal.text}`).join('');
}

function collectMyanmarStrings(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  strings: MyanmarString[],
  insideMyanmarBranch = false,
) {
  if (ts.isConditionalExpression(node)) {
    const branch = identifyMyanmarBranch(node.condition);
    if (branch) {
      collectMyanmarStrings(
        branch === 'whenTrue' ? node.whenTrue : node.whenFalse,
        sourceFile,
        strings,
        true,
      );
      return;
    }
  }

  if (ts.isIfStatement(node)) {
    const branch = identifyMyanmarBranch(node.expression);
    if (branch) {
      collectMyanmarStrings(
        branch === 'whenTrue' ? node.thenStatement : node.elseStatement ?? node.thenStatement,
        sourceFile,
        strings,
        true,
      );
      return;
    }
  }

  if (insideMyanmarBranch && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    strings.push({
      line: position.line + 1,
      text: extractLiteralText(node),
    });
    return;
  }

  node.forEachChild((child) => collectMyanmarStrings(child, sourceFile, strings, insideMyanmarBranch));
}

test('guarded Myanmar locale phrases stay translated on critical surfaces', () => {
  const findings: Finding[] = [];

  for (const rule of guardRules) {
    const absoluteFile = path.resolve(process.cwd(), rule.file);
    assert.equal(fs.existsSync(absoluteFile), true, `missing guarded file: ${rule.file}`);

    const sourceText = fs.readFileSync(absoluteFile, 'utf8');
    const sourceFile = ts.createSourceFile(absoluteFile, sourceText, ts.ScriptTarget.Latest, true);
    const strings: MyanmarString[] = [];

    collectMyanmarStrings(sourceFile, sourceFile, strings);

    for (const entry of strings) {
      for (const banned of rule.banned) {
        if (banned.pattern.test(entry.text)) {
          findings.push({
            file: rule.file,
            line: entry.line,
            label: banned.label,
            text: entry.text,
          });
        }
      }
    }
  }

  assert.deepEqual(
    findings,
    [],
    findings
      .map((finding) => {
        const preview = finding.text.length > 120 ? `${finding.text.slice(0, 117)}...` : finding.text;
        return `${finding.file}:${finding.line} -> found banned phrase "${finding.label}" in "${preview}"`;
      })
      .join('\n'),
  );
});
