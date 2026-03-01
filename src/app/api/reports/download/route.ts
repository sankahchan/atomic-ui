/**
 * Report Download API Endpoint
 *
 * Downloads a generated report as CSV or JSON file.
 * Requires authentication and ADMIN role.
 *
 * Usage:
 *   GET /api/reports/download?id=<reportId>&format=csv
 *   GET /api/reports/download?id=<reportId>&format=json
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateReportCSV } from '@/lib/services/report-generator';

export async function GET(request: NextRequest) {
  // Check authentication
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      return NextResponse.json(
        { error: 'Report is not ready for download' },
        { status: 400 }
      );
    }

    const reportData = JSON.parse(report.reportData);
    const dateStr = report.periodStart.toISOString().split('T')[0];

    if (format === 'csv') {
      const csvContent = generateReportCSV(reportData);

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="report-${dateStr}.csv"`,
        },
      });
    }

    // JSON format
    return new NextResponse(JSON.stringify(reportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="report-${dateStr}.json"`,
      },
    });
  } catch (error) {
    console.error('Report download error:', error);
    return NextResponse.json(
      { error: 'Failed to download report' },
      { status: 500 }
    );
  }
}
