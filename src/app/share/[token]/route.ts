import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  buildSharePageUrl,
  buildShortShareUrl,
  buildDynamicSharePageUrl,
  buildDynamicShortShareUrl,
} from '@/lib/subscription-links';
import {
  recordSubscriptionPageEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';

type InviteLocale = 'en' | 'my';

function resolveInviteLocale(request: NextRequest): InviteLocale {
  const explicit = request.nextUrl.searchParams.get('lang');
  if (explicit === 'my' || explicit === 'mm') {
    return 'my';
  }
  if (explicit === 'en') {
    return 'en';
  }

  const accepted = request.headers.get('accept-language') || '';
  return accepted.toLowerCase().includes('my') ? 'my' : 'en';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildInviteHtmlResponse(input: {
  locale: InviteLocale;
  status: number;
  title: string;
  message: string;
  buttonLabel: string;
  buttonHref?: string;
  autoRedirectTo?: string;
  secondaryLabel?: string;
}) {
  const localized = input.locale === 'my'
    ? {
        siteLabel: 'Atomic-UI အများပြည်သူ share',
        eyebrow: input.status >= 400 ? 'Invite မရနိုင်ပါ' : 'Invite link ကိုဖွင့်နေသည်',
        goBack: 'နောက်သို့ ပြန်ရန်',
      }
    : {
        siteLabel: 'Atomic-UI Public Share',
        eyebrow: input.status >= 400 ? 'Invite unavailable' : 'Opening invite link',
        goBack: 'Go Back',
      };

  const buttonHref = input.buttonHref ? escapeHtml(input.buttonHref) : 'javascript:history.back()';
  const autoRedirectMarkup = input.autoRedirectTo
    ? `<meta http-equiv="refresh" content="1;url=${escapeHtml(input.autoRedirectTo)}">`
    : '';

  const html = `<!doctype html>
<html lang="${input.locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    ${autoRedirectMarkup}
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(34,211,238,0.18), transparent 28%),
          radial-gradient(circle at bottom left, rgba(168,85,247,0.16), transparent 30%),
          linear-gradient(145deg, #07111f 0%, #040815 50%, #07111f 100%);
        color: #f8fafc;
        padding: 24px;
      }
      .card {
        width: min(520px, 100%);
        border-radius: 28px;
        border: 1px solid rgba(103, 232, 249, 0.14);
        background: rgba(9, 17, 32, 0.88);
        box-shadow: 0 28px 72px rgba(1, 6, 20, 0.56), inset 0 1px 0 rgba(125, 211, 252, 0.08);
        padding: 28px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #67e8f9;
        background: rgba(34,211,238,0.12);
      }
      h1 {
        margin: 18px 0 10px;
        font-size: clamp(28px, 5vw, 34px);
        line-height: 1.1;
      }
      p {
        margin: 0;
        font-size: 15px;
        line-height: 1.75;
        color: rgba(226, 232, 240, 0.86);
      }
      .helper {
        margin-top: 16px;
        font-size: 13px;
        color: rgba(148, 163, 184, 0.92);
      }
      .actions {
        margin-top: 24px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        border-radius: 999px;
        padding: 0 18px;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
        color: #f8fafc;
        background: linear-gradient(135deg, #22d3ee, #8b5cf6);
        box-shadow: 0 12px 28px rgba(34, 211, 238, 0.18);
      }
      .button.secondary {
        background: rgba(255,255,255,0.06);
        box-shadow: none;
      }
      .footer {
        margin-top: 20px;
        font-size: 12px;
        color: rgba(148, 163, 184, 0.78);
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="eyebrow">${escapeHtml(localized.eyebrow)}</div>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.message)}</p>
      ${input.secondaryLabel ? `<p class="helper">${escapeHtml(input.secondaryLabel)}</p>` : ''}
      <div class="actions">
        <a class="button" href="${buttonHref}">${escapeHtml(input.buttonLabel)}</a>
        <a class="button secondary" href="javascript:history.back()">${escapeHtml(localized.goBack)}</a>
      </div>
      <p class="footer">${escapeHtml(localized.siteLabel)}</p>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: input.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function buildUnavailableResponse(
  locale: InviteLocale,
  status: number,
  message: 'not_found' | 'expired' | 'used_up' | 'unavailable',
) {
  const copy = {
    en: {
      not_found: {
        title: 'Invite link not found',
        message: 'This invite link could not be found. It may have been removed or entered incorrectly.',
      },
      expired: {
        title: 'Invite link expired',
        message: 'This invite link has expired and can no longer be used.',
      },
      used_up: {
        title: 'Invite link already used',
        message: 'This invite link has already reached its usage limit.',
      },
      unavailable: {
        title: 'Invite link unavailable',
        message: 'This invite link is no longer available for opening the public share page.',
      },
      button: 'Go Back',
    },
    my: {
      not_found: {
        title: 'Invite link ကို မတွေ့ပါ',
        message: 'Invite link ကို မတွေ့ပါ။ ဖျက်ထားပြီးဖြစ်နိုင်သည် သို့မဟုတ် link မှားနေနိုင်သည်။',
      },
      expired: {
        title: 'Invite link သက်တမ်းကုန်သွားပါပြီ',
        message: 'ဤ invite link သည် သက်တမ်းကုန်သွားပြီးဖြစ်သောကြောင့် မသုံးနိုင်တော့ပါ။',
      },
      used_up: {
        title: 'Invite link ကို အားလုံးအသုံးပြုပြီးပါပြီ',
        message: 'ဤ invite link သည် သတ်မှတ်အသုံးပြုမှု အရေအတွက်ကို ပြည့်ပြီးဖြစ်သည်။',
      },
      unavailable: {
        title: 'Invite link မရနိုင်ပါ',
        message: 'ဤ invite link ဖြင့် public share page ကို ဖွင့်မရတော့ပါ။',
      },
      button: 'နောက်သို့ ပြန်ရန်',
    },
  }[locale];

  return buildInviteHtmlResponse({
    locale,
    status,
    title: copy[message].title,
    message: copy[message].message,
    buttonLabel: copy.button,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const locale = resolveInviteLocale(request);
  const now = new Date();
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
  const userAgent = request.headers.get('user-agent');

  const link = await db.accessDistributionLink.findUnique({
    where: { token },
    include: {
      accessKey: {
        select: {
          subscriptionToken: true,
          publicSlug: true,
          sharePageEnabled: true,
          status: true,
        },
      },
      dynamicAccessKey: {
        select: {
          dynamicUrl: true,
          publicSlug: true,
          sharePageEnabled: true,
          status: true,
        },
      },
    },
  });

  if (!link) {
    return buildUnavailableResponse(locale, 404, 'not_found');
  }

  if (link.expiresAt <= now) {
    return buildUnavailableResponse(locale, 410, 'expired');
  }

  if (link.maxUses !== null && link.currentUses >= link.maxUses) {
    return buildUnavailableResponse(locale, 410, 'used_up');
  }

  const accessKeyAvailable = link.accessKey
    ? link.accessKey.sharePageEnabled &&
      (link.accessKey.status === 'ACTIVE' || link.accessKey.status === 'PENDING') &&
      Boolean(link.accessKey.publicSlug || link.accessKey.subscriptionToken)
    : false;
  const dynamicKeyAvailable = link.dynamicAccessKey
    ? link.dynamicAccessKey.sharePageEnabled &&
      (link.dynamicAccessKey.status === 'ACTIVE' || link.dynamicAccessKey.status === 'PENDING') &&
      Boolean(link.dynamicAccessKey.publicSlug || link.dynamicAccessKey.dynamicUrl)
    : false;

  if (!accessKeyAvailable && !dynamicKeyAvailable) {
    return buildUnavailableResponse(locale, 403, 'unavailable');
  }

  const updateResult = await db.accessDistributionLink.updateMany({
    where: {
      id: link.id,
      expiresAt: { gt: now },
      ...(link.maxUses !== null ? { currentUses: { lt: link.maxUses } } : {}),
    },
    data: {
      currentUses: {
        increment: 1,
      },
      lastOpenedAt: now,
      lastOpenedIp: clientIp,
    },
  });

  if (updateResult.count === 0) {
    return buildUnavailableResponse(locale, 410, 'unavailable');
  }

  await recordSubscriptionPageEvent({
    accessKeyId: link.accessKeyId ?? null,
    dynamicAccessKeyId: link.dynamicAccessKeyId ?? null,
    eventType: SUBSCRIPTION_EVENT_TYPES.INVITE_OPEN,
    source: 'distribution',
    metadata: {
      token: link.token,
      maxUses: link.maxUses,
      currentUses: link.currentUses + 1,
      label: link.label,
    },
    ip: clientIp,
    userAgent,
  });

  const destination = accessKeyAvailable
    ? link.accessKey!.publicSlug
      ? buildShortShareUrl(link.accessKey!.publicSlug, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        })
      : buildSharePageUrl(link.accessKey!.subscriptionToken!, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        })
    : link.dynamicAccessKey!.publicSlug
      ? buildDynamicShortShareUrl(link.dynamicAccessKey!.publicSlug, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        })
      : buildDynamicSharePageUrl(link.dynamicAccessKey!.dynamicUrl!, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        });

  const successCopy = locale === 'my'
    ? {
        title: 'Invite link ကို ဖွင့်နေပါသည်',
        message: 'သင့် share page ကို ပြင်ဆင်နေပါသည်။ အလိုအလျောက် မဖွင့်ပါက အောက်ပါခလုတ်ကို နှိပ်ပါ။',
        secondaryLabel: 'စာမျက်နှာမဖွင့်ပါက continue ခလုတ်ကို အသုံးပြုနိုင်သည်။',
        buttonLabel: 'Share page ကိုဖွင့်ရန်',
      }
    : {
        title: 'Opening your invite link',
        message: 'Preparing your secure share page. If it does not open automatically, continue below.',
        secondaryLabel: 'You can continue manually if the redirect does not start.',
        buttonLabel: 'Open share page',
      };

  return buildInviteHtmlResponse({
    locale,
    status: 200,
    title: successCopy.title,
    message: successCopy.message,
    secondaryLabel: successCopy.secondaryLabel,
    buttonLabel: successCopy.buttonLabel,
    buttonHref: destination,
    autoRedirectTo: destination,
  });
}
