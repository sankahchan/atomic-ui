/**
 * Export Keys API Endpoint
 *
 * Exports access keys in JSON or CSV format for download.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // Check authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const serverIds = searchParams.get('serverIds')?.split(',').filter(Boolean) || [];
  const status = searchParams.get('status');
  const format = searchParams.get('format') || 'json';

  try {
    // Build query
    const where: Record<string, unknown> = {};

    if (serverIds.length > 0) {
      where.serverId = { in: serverIds };
    }

    if (status) {
      where.status = status;
    }

    const keys = await db.accessKey.findMany({
      where,
      include: {
        server: {
          select: {
            name: true,
            countryCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'Name',
        'Email',
        'Telegram ID',
        'Server',
        'Country',
        'Status',
        'Access URL',
        'Data Used (bytes)',
        'Data Limit (bytes)',
        'Expires At',
        'Created At',
      ];

      const rows = keys.map((key) => [
        key.name,
        key.email || '',
        key.telegramId || '',
        key.server.name,
        key.server.countryCode || '',
        key.status,
        key.accessUrl || '',
        key.usedBytes.toString(),
        key.dataLimitBytes?.toString() || '',
        key.expiresAt?.toISOString() || '',
        key.createdAt.toISOString(),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="keys-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Return JSON
    const jsonData = keys.map((key) => ({
      name: key.name,
      email: key.email,
      telegramId: key.telegramId,
      server: key.server.name,
      countryCode: key.server.countryCode,
      status: key.status,
      accessUrl: key.accessUrl,
      usedBytes: key.usedBytes.toString(),
      dataLimitBytes: key.dataLimitBytes?.toString() || null,
      expiresAt: key.expiresAt?.toISOString() || null,
      createdAt: key.createdAt.toISOString(),
    }));

    return new NextResponse(JSON.stringify(jsonData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="keys-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export keys' },
      { status: 500 }
    );
  }
}
