/**
 * Telegram Webhook API Endpoint
 *
 * Handles incoming messages from Telegram bot.
 * Users can request their VPN keys by sending their Telegram ID or email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { sendTelegramMessage, sendTelegramPhoto, sendTelegramDocument } from '@/lib/telegram';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    // Only process messages
    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const { message } = update;
    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const telegramId = message.from.id.toString();
    const telegramUsername = message.from.username;

    // Get bot settings
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
    });

    if (!settings) {
      return NextResponse.json({ ok: true });
    }

    const botSettings = JSON.parse(settings.value);
    const { botToken, welcomeMessage, keyNotFoundMessage, isEnabled, adminChatIds = [] } = botSettings;

    if (!isEnabled || !botToken) {
      return NextResponse.json({ ok: true });
    }

    // AUTH: Check if sender is admin
    const isAdmin = adminChatIds.includes(chatId.toString());

    // Handle /sysinfo command (ADMIN ONLY)
    if (text === '/sysinfo') {
      if (!isAdmin) {
        // Silently ignore or send unauthorized message? Better to ignore to prevent spam
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(botToken, chatId, 'Gathering system information... please wait.');

      try {
        const si = require('systeminformation');
        const [cpu, mem, disk, osInfo] = await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.fsSize(),
          si.osInfo(),
        ]);

        const totalDisk = disk.reduce((acc: number, d: any) => acc + d.size, 0);
        const usedDisk = disk.reduce((acc: number, d: any) => acc + d.used, 0);

        const formatBytes = (bytes: number) => {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const msg = `
<b>System Status</b> 🖥️

<b>OS:</b> ${osInfo.distro} ${osInfo.release}
<b>CPU Load:</b> ${cpu.currentLoad.toFixed(1)}%
<b>Memory:</b> ${formatBytes(mem.active)} / ${formatBytes(mem.total)} (${((mem.active / mem.total) * 100).toFixed(1)}%)
<b>Disk:</b> ${formatBytes(usedDisk)} / ${formatBytes(totalDisk)} (${((usedDisk / totalDisk) * 100).toFixed(1)}%)
        `.trim();

        await sendTelegramMessage(botToken, chatId, msg);
      } catch (err) {
        console.error('Sysinfo error:', err);
        await sendTelegramMessage(botToken, chatId, 'Failed to retrieve system info.');
      }
      return NextResponse.json({ ok: true });
    }

    // Handle /backup command (ADMIN ONLY)
    if (text === '/backup') {
      if (!isAdmin) return NextResponse.json({ ok: true });

      await sendTelegramMessage(botToken, chatId, 'Creating backup... please wait.');

      try {
        const BACKUP_DIR = path.join(process.cwd(), 'storage', 'backups');
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.zip`;
        const filePath = path.join(BACKUP_DIR, filename);
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        await new Promise<void>((resolve, reject) => {
          output.on('close', () => resolve());
          archive.on('error', reject);
          archive.pipe(output);

          // Add DB file
          const dbUrl = process.env.DATABASE_URL?.replace('file:', '');
          if (dbUrl) {
            const dbPath = path.resolve(process.cwd(), 'prisma', dbUrl);
            if (fs.existsSync(dbPath)) {
              archive.file(dbPath, { name: 'dev.db' });
            }
          }

          archive.finalize();
        });

        // Read file buffer to send
        const fileBuffer = fs.readFileSync(filePath);

        // Send document using helper
        await sendTelegramDocument(
          botToken,
          chatId,
          fileBuffer,
          filename,
          `Backup created at ${new Date().toLocaleString()}`
        );

      } catch (err) {
        console.error('Backup bot error:', err);
        await sendTelegramMessage(botToken, chatId, 'Backup failed: ' + (err as Error).message);
      }
      return NextResponse.json({ ok: true });
    }

    // Handle /start command
    if (text === '/start') {
      await sendTelegramMessage(
        botToken,
        chatId,
        isAdmin
          ? `Welcome Admin! \n\n<b>Commands:</b>\n/sysinfo - System Status\n/backup - Download Backup\n/mykey - Your Keys`
          : (welcomeMessage || 'Welcome! Send /mykey to get your VPN key or send your email address.')
      );
      return NextResponse.json({ ok: true });
    }

    // Update help command to show admin options if admin
    if (text === '/help') {
      let helpMessage = `
<b>Available Commands:</b>

/start - Welcome message
/mykey - Get your VPN key and QR code
/status - Check your keys status
/help - Show this help message
       `.trim();

      if (isAdmin) {
        helpMessage += `\n\n<b>Admin Commands:</b>\n/sysinfo - System Resource Usage\n/backup - Create & Download Backup`;
      }

      helpMessage += `\n\nYou can also send your email address to find keys associated with it.`;

      await sendTelegramMessage(botToken, chatId, helpMessage);
      return NextResponse.json({ ok: true });
    }


    // Handle /mykey command
    if (text === '/mykey' || text === '/key') {
      // Search for keys by Telegram ID or username
      const keys = await db.accessKey.findMany({
        where: {
          OR: [
            { telegramId: telegramId },
            { telegramId: `@${telegramUsername}` },
            { telegramId: telegramUsername || '' },
          ],
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        include: {
          server: {
            select: {
              name: true,
              countryCode: true,
            },
          },
        },
      });

      if (keys.length === 0) {
        await sendTelegramMessage(
          botToken,
          chatId,
          keyNotFoundMessage || 'No active key found for your Telegram account. Please contact the administrator.'
        );
        return NextResponse.json({ ok: true });
      }

      // Send each key
      for (const key of keys) {
        const countryFlag = key.server.countryCode && key.server.countryCode.length > 0
          ? String.fromCodePoint(...key.server.countryCode.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0)))
          : '';

        const keyInfo = `
<b>${countryFlag} ${key.name}</b>
<b>Server:</b> ${key.server.name}
<b>Status:</b> ${key.status}

<code>${key.accessUrl}</code>

Tap the code above to copy.
        `.trim();

        await sendTelegramMessage(botToken, chatId, keyInfo);

        // Generate and send QR code
        if (key.accessUrl) {
          try {
            const qrBuffer = await QRCode.toBuffer(key.accessUrl, {
              width: 300,
              margin: 2,
            });
            await sendTelegramPhoto(botToken, chatId, qrBuffer, 'Scan this QR code with your VPN app');
          } catch (err) {
            console.error('Failed to generate QR code:', err);
          }
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Handle /status command
    if (text === '/status') {
      const keys = await db.accessKey.findMany({
        where: {
          OR: [
            { telegramId: telegramId },
            { telegramId: `@${telegramUsername}` },
          ],
        },
        include: {
          server: { select: { name: true } },
        },
      });

      if (keys.length === 0) {
        await sendTelegramMessage(botToken, chatId, 'No keys found for your account.');
        return NextResponse.json({ ok: true });
      }

      let statusMessage = '<b>Your Keys Status:</b>\n\n';
      for (const key of keys) {
        const usedGB = Number(key.usedBytes) / (1024 * 1024 * 1024);
        const limitGB = key.dataLimitBytes ? Number(key.dataLimitBytes) / (1024 * 1024 * 1024) : null;
        const usage = limitGB ? `${usedGB.toFixed(2)}/${limitGB.toFixed(0)} GB` : `${usedGB.toFixed(2)} GB`;

        statusMessage += `<b>${key.name}</b>\n`;
        statusMessage += `Status: ${key.status}\n`;
        statusMessage += `Server: ${key.server.name}\n`;
        statusMessage += `Usage: ${usage}\n`;
        if (key.expiresAt) {
          const daysLeft = Math.ceil((key.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          statusMessage += `Expires: ${daysLeft >= 0 ? `${daysLeft} days` : 'Expired'}\n`;
        }
        statusMessage += '\n';
      }

      await sendTelegramMessage(botToken, chatId, statusMessage);
      return NextResponse.json({ ok: true });
    }



    // Check if text looks like an email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(text)) {
      const keys = await db.accessKey.findMany({
        where: {
          email: text.toLowerCase(),
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        include: {
          server: {
            select: {
              name: true,
              countryCode: true,
            },
          },
        },
      });

      if (keys.length === 0) {
        await sendTelegramMessage(
          botToken,
          chatId,
          `No active keys found for email: ${text}`
        );
        return NextResponse.json({ ok: true });
      }

      // Update the Telegram ID for found keys
      await db.accessKey.updateMany({
        where: { email: text.toLowerCase() },
        data: { telegramId: telegramId },
      });

      await sendTelegramMessage(
        botToken,
        chatId,
        `Found ${keys.length} key(s) for your email. Your Telegram account has been linked. Use /mykey to get your keys.`
      );

      return NextResponse.json({ ok: true });
    }

    // Default response for unknown commands
    await sendTelegramMessage(
      botToken,
      chatId,
      'Unknown command. Use /help to see available commands.'
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true }); // Always return ok to Telegram
  }
}
