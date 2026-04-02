import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  buildFinanceDocumentHtml,
  buildFinanceDocumentLines,
  buildSimplePdf,
  formatFinanceDocumentMoney,
  type FinanceDocumentKind,
} from '@/lib/finance-documents';

function formatDate(value?: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatDuration(order: {
  durationMonths?: number | null;
  durationDays?: number | null;
}) {
  if (order.durationMonths) {
    return `${order.durationMonths} month${order.durationMonths === 1 ? '' : 's'}`;
  }
  if (order.durationDays) {
    return `${order.durationDays} day${order.durationDays === 1 ? '' : 's'}`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  const orderCode = searchParams.get('orderCode');
  const format = (searchParams.get('format') || 'html').toLowerCase();
  const kind = ((searchParams.get('type') || 'receipt').toLowerCase() === 'refund'
    ? 'refund'
    : 'receipt') as FinanceDocumentKind;
  const user = await getCurrentUser();

  if (!orderCode && (!user || user.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!orderId && !orderCode) {
    return NextResponse.json({ error: 'Missing order reference' }, { status: 400 });
  }

  const order = await db.telegramOrder.findFirst({
    where: orderId
      ? { id: orderId }
      : {
          orderCode: orderCode || '',
        },
    include: {
      reviewedBy: {
        select: {
          email: true,
        },
      },
      financeActions: {
        where: kind === 'refund' ? { actionType: 'REFUND' } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          createdBy: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (kind === 'receipt' && order.status !== 'FULFILLED') {
    return NextResponse.json({ error: 'Receipt is not available for this order yet.' }, { status: 400 });
  }

  if (kind === 'refund' && order.financeStatus !== 'REFUNDED' && order.refundRequestStatus !== 'APPROVED') {
    return NextResponse.json({ error: 'Refund confirmation is not available for this order.' }, { status: 400 });
  }

  const [approvedAccessKey, approvedDynamicKey] = await Promise.all([
    order.approvedAccessKeyId
      ? db.accessKey.findUnique({
          where: { id: order.approvedAccessKeyId },
          select: { name: true },
        })
      : Promise.resolve(null),
    order.approvedDynamicKeyId
      ? db.dynamicAccessKey.findUnique({
          where: { id: order.approvedDynamicKeyId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const latestRefundAction = order.financeActions[0] || null;
  const documentNumber = `${kind === 'refund' ? 'RFND' : 'RCPT'}-${order.orderCode}`;
  const documentInput = {
    kind,
    documentNumber,
    orderCode: order.orderCode,
    orderTypeLabel:
      kind === 'refund'
        ? 'Refund confirmation'
        : order.kind === 'TRIAL'
          ? 'Free trial key'
          : order.deliveryType === 'DYNAMIC_KEY'
            ? 'Premium dynamic key'
            : 'Standard key',
    statusLabel:
      kind === 'refund'
        ? order.refundRequestStatus === 'APPROVED'
          ? 'Refund approved'
          : order.financeStatus === 'REFUNDED'
            ? 'Refunded'
            : 'Refund reviewed'
        : order.kind === 'TRIAL'
          ? 'Free trial delivered'
          : 'Paid & delivered',
    customerLabel: order.requestedEmail || order.telegramUsername || order.telegramUserId,
    amountLabel: formatFinanceDocumentMoney(order.priceAmount, order.priceCurrency),
    planLabel: order.planName || order.planCode || null,
    paymentMethodLabel: order.paymentMethodLabel || order.paymentMethodCode || null,
    durationLabel: formatDuration(order),
    serverLabel: order.selectedServerName || null,
    keyLabel: approvedAccessKey?.name || approvedDynamicKey?.name || null,
    note:
      kind === 'refund'
        ? order.refundRequestCustomerMessage || latestRefundAction?.note || null
        : latestRefundAction?.note || null,
    reviewedAtLabel: formatDate(
      kind === 'refund'
        ? order.refundRequestReviewedAt || latestRefundAction?.createdAt || null
        : order.reviewedAt || order.fulfilledAt || null,
    ),
    issuedAtLabel: formatDate(
      kind === 'refund'
        ? order.refundRequestReviewedAt || latestRefundAction?.createdAt || new Date()
        : order.fulfilledAt || order.reviewedAt || new Date(),
    ) || '—',
  };

  if (format === 'pdf') {
    const pdf = buildSimplePdf(
      kind === 'refund' ? 'Refund Confirmation' : 'Payment Receipt',
      buildFinanceDocumentLines(documentInput),
    );

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${documentNumber.toLowerCase()}.pdf"`,
      },
    });
  }

  return new NextResponse(buildFinanceDocumentHtml(documentInput), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
