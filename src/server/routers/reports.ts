/**
 * Reports Router
 *
 * Handles generating, listing, and managing monthly usage reports.
 * Reports aggregate traffic data per server and per key for a given period.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';
import { generateReportData } from '@/lib/services/report-generator';

export const reportsRouter = router({
  /**
   * List all generated reports with pagination
   */
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
        type: z.enum(['MONTHLY', 'WEEKLY', 'CUSTOM']).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 10;

      const where: Record<string, unknown> = {};
      if (input?.type) {
        where.type = input.type;
      }

      const [reports, total] = await Promise.all([
        db.report.findMany({
          where,
          orderBy: { periodStart: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            periodStart: true,
            periodEnd: true,
            totalServers: true,
            totalKeys: true,
            totalBytesUsed: true,
            totalDeltaBytes: true,
            csvFileName: true,
            generatedBy: true,
            createdAt: true,
          },
        }),
        db.report.count({ where }),
      ]);

      return {
        reports: reports.map((r) => ({
          ...r,
          totalBytesUsed: r.totalBytesUsed.toString(),
          totalDeltaBytes: r.totalDeltaBytes.toString(),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  /**
   * Get a single report with full data
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const report = await db.report.findUnique({
        where: { id: input.id },
      });

      if (!report) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Report not found',
        });
      }

      return {
        ...report,
        totalBytesUsed: report.totalBytesUsed.toString(),
        totalDeltaBytes: report.totalDeltaBytes.toString(),
        reportData: report.reportData ? JSON.parse(report.reportData) : null,
      };
    }),

  /**
   * Generate a new report for a specified date range
   */
  generate: adminProcedure
    .input(
      z.object({
        type: z.enum(['MONTHLY', 'WEEKLY', 'CUSTOM']).default('MONTHLY'),
        // For MONTHLY: pass year/month; for CUSTOM: pass explicit start/end
        year: z.number().int().min(2020).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional(),
        periodStart: z.date().optional(),
        periodEnd: z.date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      let periodStart: Date;
      let periodEnd: Date;
      let reportName: string;

      if (input.type === 'MONTHLY') {
        const now = new Date();
        const year = input.year ?? now.getFullYear();
        const month = input.month ?? now.getMonth() + 1;

        periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
        periodEnd = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month

        const monthName = periodStart.toLocaleDateString('en-US', { month: 'long' });
        reportName = `Monthly Report - ${monthName} ${year}`;
      } else if (input.type === 'WEEKLY') {
        const now = new Date();
        periodEnd = new Date(now);
        periodEnd.setHours(23, 59, 59, 999);
        periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - 7);
        periodStart.setHours(0, 0, 0, 0);

        reportName = `Weekly Report - ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;
      } else {
        // CUSTOM
        if (!input.periodStart || !input.periodEnd) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Custom reports require periodStart and periodEnd',
          });
        }
        periodStart = input.periodStart;
        periodEnd = input.periodEnd;
        reportName = `Custom Report - ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;
      }

      // Check for duplicate reports in the same period
      const existing = await db.report.findFirst({
        where: {
          type: input.type,
          periodStart,
          periodEnd,
          status: 'READY',
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A report for this period already exists: "${existing.name}"`,
        });
      }

      // Create the report record in GENERATING status
      const report = await db.report.create({
        data: {
          name: reportName,
          type: input.type,
          status: 'GENERATING',
          periodStart,
          periodEnd,
          generatedBy: ctx.user?.email || 'Admin',
        },
      });

      // Generate the report data (async but we await it)
      try {
        const data = await generateReportData(periodStart, periodEnd);

        // Update report with generated data
        await db.report.update({
          where: { id: report.id },
          data: {
            status: 'READY',
            reportData: JSON.stringify(data.reportData),
            totalServers: data.totalServers,
            totalKeys: data.totalKeys,
            totalBytesUsed: data.totalBytesUsed,
            totalDeltaBytes: data.totalDeltaBytes,
          },
        });

        return {
          id: report.id,
          name: reportName,
          status: 'READY' as const,
        };
      } catch (error) {
        // Mark report as failed
        await db.report.update({
          where: { id: report.id },
          data: {
            status: 'FAILED',
            reportData: JSON.stringify({ error: (error as Error).message }),
          },
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to generate report: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Delete a report
   */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const report = await db.report.findUnique({
        where: { id: input.id },
      });

      if (!report) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Report not found',
        });
      }

      await db.report.delete({ where: { id: input.id } });

      return { success: true };
    }),
});
