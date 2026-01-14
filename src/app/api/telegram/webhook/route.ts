/**
 * Telegram Webhook API Endpoint
 *
 * Handles incoming messages from Telegram bot.
 * Users can request their VPN keys by sending their Telegram ID or email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { sendTelegramMessage, sendTelegramPhoto } from '@/lib/telegram';

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
    const { botToken, welcomeMessage, keyNotFoundMessage, isEnabled } = botSettings;

    if (!isEnabled || !botToken) {
      return NextResponse.json({ ok: true });
    }

    // Handle /start command
    if (text === '/start') {
      await sendTelegramMessage(
        botToken,
        chatId,
        welcomeMessage || 'Welcome! Send /mykey to get your VPN key or send your email address.'
      );
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
        const countryFlag = key.server.countryCode
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
          statusMessage += `Expires: ${daysLeft > 0 ? `${daysLeft} days` : 'Expired'}\n`;
        }
        statusMessage += '\n';
      }

      await sendTelegramMessage(botToken, chatId, statusMessage);
      return NextResponse.json({ ok: true });
    }

    // Handle /help command
    if (text === '/help') {
      const helpMessage = `
<b>Available Commands:</b>

/start - Welcome message
/mykey - Get your VPN key and QR code
/status - Check your keys status
/help - Show this help message

You can also send your email address to find keys associated with it.
      `.trim();

      await sendTelegramMessage(botToken, chatId, helpMessage);
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
