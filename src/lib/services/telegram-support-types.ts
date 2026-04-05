import { db } from '@/lib/db';

export type TelegramSupportIssueCategory =
  | 'ORDER'
  | 'KEY'
  | 'SERVER'
  | 'BILLING'
  | 'GENERAL';

export type TelegramSupportThreadRecord = Awaited<
  ReturnType<typeof db.telegramSupportThread.findMany>
>[number];
