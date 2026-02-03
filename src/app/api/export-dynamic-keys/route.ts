/**
 * Export Dynamic Keys API Endpoint
 *
 * Exports dynamic access keys in JSON or CSV format for download.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // Check authentication
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const format = searchParams.get('format') || 'json';

  try {
    // Build query
    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    const daks = await db.dynamicAccessKey.findMany({
      where,
      include: {
        _count: {
          select: { accessKeys: true },
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
        'Type',
        'Status',
        'Encryption Method',
        'Dynamic URL',
        'Data Used (bytes)',
        'Data Limit (bytes)',
        'Attached Keys',
        'Expires At',
        'Created At',
      ];

      const rows = daks.map((dak) => [
        dak.name,
        dak.email || '',
        dak.telegramId || '',
        dak.type,
        dak.status,
        dak.method || '',
        dak.dynamicUrl || '',
        dak.usedBytes.toString(),
        dak.dataLimitBytes?.toString() || '',
        dak._count.accessKeys.toString(),
        dak.expiresAt?.toISOString() || '',
        dak.createdAt.toISOString(),
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
          'Content-Disposition': `attachment; filename="dynamic-keys-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Return JSON
    const jsonData = daks.map((dak) => ({
      name: dak.name,
      email: dak.email,
      telegramId: dak.telegramId,
      type: dak.type,
      status: dak.status,
      method: dak.method,
      dynamicUrl: dak.dynamicUrl,
      usedBytes: dak.usedBytes.toString(),
      dataLimitBytes: dak.dataLimitBytes?.toString() || null,
      attachedKeysCount: dak._count.accessKeys,
      expiresAt: dak.expiresAt?.toISOString() || null,
      createdAt: dak.createdAt.toISOString(),
      notes: dak.notes,
    }));

    return new NextResponse(JSON.stringify(jsonData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="dynamic-keys-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export dynamic keys' },
      { status: 500 }
    );
  }
}
