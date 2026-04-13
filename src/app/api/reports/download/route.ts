/**
 * Report Download API Endpoint
 *
 * Downloads a generated report as CSV, JSON, or PDF.
 * Requires authentication and ADMIN role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminRouteScope } from '@/lib/admin-route-guard';
import { hasReportDownloadScope } from '@/lib/admin-scope';
import { generateReportCSV } from '@/lib/services/report-generator';

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdf(title: string, lines: string[]) {
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

function buildScheduledSummaryCsv(reportData: Record<string, any>) {
  const summary = reportData.summary ?? {};
  const usageSummary = reportData.usage?.summary ?? {};
  const health = summary.serverHealth ?? {};

  return [
    'Metric,Value',
    `Revenue,${summary.revenueAmount != null ? `${summary.revenueAmount} ${summary.revenueCurrency ?? 'USD'}` : 'Not configured'}`,
    `Expiring Soon,${summary.expiringSoon ?? 0}`,
    `Expired Keys,${summary.expiredKeys ?? 0}`,
    `Failed Logins,${summary.failedLogins ?? 0}`,
    `Servers Up,${health.up ?? 0}`,
    `Servers Slow,${health.slow ?? 0}`,
    `Servers Down,${health.down ?? 0}`,
    `Servers Unknown,${health.unknown ?? 0}`,
    `Active Keys,${usageSummary.activeKeys ?? 0}`,
    `Traffic Delta,${usageSummary.totalDeltaBytes ?? '0'}`,
  ].join('\n');
}

function buildPdfLines(report: { name: string; periodStart: Date; periodEnd: Date }, reportData: Record<string, any>) {
  if (reportData.kind === 'scheduled-summary') {
    const summary = reportData.summary ?? {};
    const usageSummary = reportData.usage?.summary ?? {};
    const health = summary.serverHealth ?? {};
    return [
      `Report: ${report.name}`,
      `Period: ${report.periodStart.toISOString()} to ${report.periodEnd.toISOString()}`,
      `Revenue: ${summary.revenueAmount != null ? `${summary.revenueAmount} ${summary.revenueCurrency ?? 'USD'}` : 'Not configured'}`,
      `Expiring soon: ${summary.expiringSoon ?? 0}`,
      `Expired keys: ${summary.expiredKeys ?? 0}`,
      `Failed logins: ${summary.failedLogins ?? 0}`,
      `Server health: ${health.up ?? 0} up / ${health.slow ?? 0} slow / ${health.down ?? 0} down / ${health.unknown ?? 0} unknown`,
      `Active keys: ${usageSummary.activeKeys ?? 0}`,
      `Traffic delta bytes: ${usageSummary.totalDeltaBytes ?? '0'}`,
    ];
  }

  return [
    `Report: ${report.name}`,
    `Period: ${report.periodStart.toISOString()} to ${report.periodEnd.toISOString()}`,
    `Total servers: ${reportData.summary?.totalServers ?? 0}`,
    `Total keys: ${reportData.summary?.totalKeys ?? 0}`,
    `Active keys: ${reportData.summary?.activeKeys ?? 0}`,
    `Expired keys: ${reportData.summary?.expiredKeys ?? 0}`,
    `Depleted keys: ${reportData.summary?.depletedKeys ?? 0}`,
    `Total used bytes: ${reportData.summary?.totalBytesUsed ?? '0'}`,
    `Total delta bytes: ${reportData.summary?.totalDeltaBytes ?? '0'}`,
    reportData.summary?.peakHourUtc != null ? `Peak hour (UTC): ${reportData.summary?.peakHourUtc}:00` : 'Peak hour (UTC): N/A',
  ];
}

export async function GET(request: NextRequest) {
  const { response } = await requireAdminRouteScope({
    canAccess: hasReportDownloadScope,
    forbiddenMessage: 'You do not have permission to download reports.',
  });
  if (response) {
    return response;
  }

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get('id');
  const format = searchParams.get('format') || 'csv';

  if (!reportId) {
    return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
  }

  try {
    const report = await db.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    if (report.status !== 'READY' || !report.reportData) {
      return NextResponse.json({ error: 'Report is not ready for download' }, { status: 400 });
    }

    const reportData = JSON.parse(report.reportData) as Record<string, any>;
    const dateStr = report.periodStart.toISOString().split('T')[0];

    if (format === 'csv') {
      const csvContent =
        reportData.kind === 'scheduled-summary'
          ? buildScheduledSummaryCsv(reportData)
          : generateReportCSV(reportData as { servers: never[]; periodStart: string; periodEnd: string });

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="report-${dateStr}.csv"`,
        },
      });
    }

    if (format === 'pdf') {
      const pdfBuffer = buildSimplePdf(report.name, buildPdfLines(report, reportData));

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="report-${dateStr}.pdf"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(reportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="report-${dateStr}.json"`,
      },
    });
  } catch (error) {
    console.error('Report download error:', error);
    return NextResponse.json({ error: 'Failed to download report' }, { status: 500 });
  }
}
