import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAbsoluteBasePath } from '@/lib/base-path';
import { getTelegramSupportLink } from '@/lib/services/telegram-runtime';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ deliveryId: string }> },
) {
  const { deliveryId } = await context.params;
  const delivery = await db.telegramAnnouncementDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      announcement: true,
    },
  });

  if (!delivery) {
    return new NextResponse('Announcement not found', { status: 404 });
  }

  await db.telegramAnnouncementDelivery.update({
    where: { id: delivery.id },
    data: {
      readAt: delivery.readAt || new Date(),
      openCount: { increment: 1 },
      lastOpenedAt: new Date(),
    },
  });

  const supportLink = delivery.announcement.includeSupportButton
    ? await getTelegramSupportLink()
    : null;
  const supportUrl = supportLink
    ? withAbsoluteBasePath(`/api/telegram/announcements/${delivery.id}/click?target=support`)
    : null;
  const title = delivery.announcement.title.trim();
  const message = delivery.announcement.message.trim();
  const typeLabel = delivery.announcement.type.replaceAll('_', ' ');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
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
      .wrap { max-width: 820px; margin: 0 auto; }
      .card {
        border: 1px solid var(--line);
        background: var(--card);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }
      .eyebrow {
        display: inline-flex;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(103, 215, 255, 0.12);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
      h1 { margin: 18px 0 10px; font-size: 34px; line-height: 1.1; }
      p { color: var(--muted); line-height: 1.7; white-space: pre-wrap; }
      img {
        display: block;
        width: 100%;
        max-height: 320px;
        object-fit: cover;
        border-radius: 18px;
        margin: 18px 0 22px;
        border: 1px solid var(--line);
      }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
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
      .subtle { background: rgba(255,255,255,0.04); color: var(--text); border: 1px solid var(--line); }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        <div class="eyebrow">${escapeHtml(typeLabel)}</div>
        <h1>${escapeHtml(title)}</h1>
        ${delivery.announcement.heroImageUrl ? `<img src="${escapeHtml(delivery.announcement.heroImageUrl)}" alt="${escapeHtml(title)}" />` : ''}
        <p>${escapeHtml(message)}</p>
        <div class="actions">
          ${supportUrl ? `<a class="button" href="${escapeHtml(supportUrl)}">Support</a>` : ''}
          <a class="button subtle" href="javascript:window.close()">Close</a>
        </div>
      </section>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
