export type FinanceDocumentKind = 'receipt' | 'refund';

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatFinanceDocumentMoney(amount?: number | null, currency?: string | null) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }

  const normalizedCurrency = (currency || 'MMK').trim().toUpperCase();
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  if (normalizedCurrency === 'MMK') {
    return `${formatted} Kyat`;
  }
  if (normalizedCurrency === 'USD') {
    return `$${formatted}`;
  }
  return `${formatted} ${normalizedCurrency}`;
}

export function buildSimplePdf(title: string, lines: string[]) {
  const pageLines = [title, '', ...lines].slice(0, 34);
  const textStream = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    ...pageLines.flatMap((line, index) =>
      index === 0 ? [`(${escapePdfText(line)}) Tj`] : ['0 -20 Td', `(${escapePdfText(line)}) Tj`],
    ),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${Buffer.byteLength(textStream, 'utf8')} >>\nstream\n${textStream}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

export type FinanceDocumentInput = {
  kind: FinanceDocumentKind;
  documentNumber: string;
  orderCode: string;
  orderTypeLabel: string;
  statusLabel: string;
  customerLabel: string;
  amountLabel: string;
  planLabel?: string | null;
  paymentMethodLabel?: string | null;
  durationLabel?: string | null;
  serverLabel?: string | null;
  keyLabel?: string | null;
  note?: string | null;
  reviewedAtLabel?: string | null;
  issuedAtLabel: string;
};

export function buildFinanceDocumentLines(input: FinanceDocumentInput) {
  return [
    `Document: ${input.documentNumber}`,
    `Order: ${input.orderCode}`,
    `Status: ${input.statusLabel}`,
    `Type: ${input.orderTypeLabel}`,
    `Customer: ${input.customerLabel}`,
    `Amount: ${input.amountLabel}`,
    input.planLabel ? `Plan: ${input.planLabel}` : null,
    input.paymentMethodLabel ? `Payment method: ${input.paymentMethodLabel}` : null,
    input.durationLabel ? `Duration: ${input.durationLabel}` : null,
    input.serverLabel ? `Server: ${input.serverLabel}` : null,
    input.keyLabel ? `Key: ${input.keyLabel}` : null,
    input.note ? `Note: ${input.note}` : null,
    input.reviewedAtLabel ? `Reviewed: ${input.reviewedAtLabel}` : null,
    `Issued: ${input.issuedAtLabel}`,
  ].filter(Boolean) as string[];
}

export function buildFinanceDocumentHtml(input: FinanceDocumentInput) {
  const title = input.kind === 'refund' ? 'Refund Confirmation' : 'Payment Receipt';
  const detailRows = [
    ['Document', input.documentNumber],
    ['Order', input.orderCode],
    ['Status', input.statusLabel],
    ['Type', input.orderTypeLabel],
    ['Customer', input.customerLabel],
    ['Amount', input.amountLabel],
    ['Plan', input.planLabel || '—'],
    ['Payment method', input.paymentMethodLabel || '—'],
    ['Duration', input.durationLabel || '—'],
    ['Server', input.serverLabel || '—'],
    ['Delivered key', input.keyLabel || '—'],
    ['Reviewed', input.reviewedAtLabel || '—'],
    ['Issued', input.issuedAtLabel],
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} • ${escapeHtml(input.orderCode)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111f;
        --card: rgba(9, 18, 33, 0.92);
        --line: rgba(132, 156, 190, 0.22);
        --text: #f3f7ff;
        --muted: #9fb1cb;
        --accent: #67d7ff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(79, 172, 254, 0.18), transparent 34%),
          radial-gradient(circle at top right, rgba(103, 215, 255, 0.16), transparent 28%),
          linear-gradient(180deg, #081220 0%, #050a14 100%);
        color: var(--text);
      }
      .wrap {
        max-width: 840px;
        margin: 0 auto;
      }
      .card {
        border: 1px solid var(--line);
        background: var(--card);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(103, 215, 255, 0.12);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
      h1 {
        margin: 18px 0 6px;
        font-size: 34px;
        line-height: 1.1;
      }
      .subtitle {
        color: var(--muted);
        margin-bottom: 24px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      td {
        padding: 12px 0;
        border-top: 1px solid var(--line);
        vertical-align: top;
      }
      td:first-child {
        width: 34%;
        color: var(--muted);
      }
      .note {
        margin-top: 20px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        color: var(--muted);
        white-space: pre-wrap;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 16px;
        border-radius: 999px;
        background: linear-gradient(135deg, #67d7ff, #5ac8ff);
        color: #03111f;
        text-decoration: none;
        font-weight: 700;
      }
      @media print {
        body { background: white; color: black; padding: 0; }
        .card { box-shadow: none; border-color: #ccc; background: white; }
        .actions { display: none; }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        <div class="eyebrow">${escapeHtml(title)}</div>
        <h1>${escapeHtml(input.orderCode)}</h1>
        <p class="subtitle">Printable ${escapeHtml(title.toLowerCase())} generated by Atomic-UI.</p>
        <table>
          <tbody>
            ${detailRows
              .map(
                ([label, value]) =>
                  `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
              )
              .join('')}
          </tbody>
        </table>
        ${input.note ? `<div class="note">${escapeHtml(input.note)}</div>` : ''}
        <div class="actions">
          <a class="button" href="javascript:window.print()">Print confirmation</a>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
