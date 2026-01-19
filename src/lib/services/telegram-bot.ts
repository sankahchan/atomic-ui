/**
 * Telegram Bot Service
 * 
 * Provides a Telegram bot for users to check their VPN usage,
 * and for admins to receive alerts about server issues.
 * 
 * Commands:
 * - /start - Register and link Telegram account
 * - /usage - Check data usage for linked keys
 * - /status - Check server status (admin only)
 * - /sysinfo - Check system resource usage (admin only)
 * - /backup - Create and download database backup (admin only)
 * - /help - Show available commands
 */

import { db } from '@/lib/db';
import { formatBytes } from '@/lib/utils';
import fs from 'fs';
import path from 'path';
// Use require for these to avoid potential build issues in some next.js envs if types are missing
// but they are in package.json so imports should work if types are there.
// We'll use imports since types are in devDependencies.
import archiver from 'archiver';
import si from 'systeminformation';
import QRCode from 'qrcode';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramUpdate {
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

export interface TelegramConfig {
    botToken: string;
    adminChatIds: string[];
}

/**
 * Get Telegram bot configuration from database
 */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
    const channel = await db.notificationChannel.findFirst({
        where: {
            type: 'TELEGRAM',
            isActive: true,
        },
    });

    if (!channel) {
        // Fallback to old settings table if exists (migration path)
        const settings = await db.settings.findUnique({ where: { key: 'telegram_bot' } });
        if (settings) {
            try {
                const config = JSON.parse(settings.value);
                if (config.isEnabled && config.botToken) {
                    return {
                        botToken: config.botToken,
                        adminChatIds: config.adminChatIds || [],
                    };
                }
            } catch { }
        }
        return null;
    }

    try {
        const config = JSON.parse(channel.config);
        return {
            botToken: config.botToken,
            adminChatIds: config.adminChatIds || [],
        };
    } catch {
        return null;
    }
}

/**
 * Send a message to a Telegram chat
 */
export async function sendTelegramMessage(
    botToken: string,
    chatId: number | string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
    try {
        const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: parseMode,
            }),
        });

        if (!response.ok) {
            const data = await response.json();
            console.error(`Failed to send Telegram message to ${chatId}:`, data.description);
        }
        return response.ok;
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
        return false;
    }
}

/**
 * Send an alert to all admin chat IDs
 */
export async function sendAdminAlert(message: string): Promise<void> {
    const config = await getTelegramConfig();
    if (!config) return;

    for (const chatId of config.adminChatIds) {
        await sendTelegramMessage(config.botToken, chatId, message);
    }
}

/**
 * Send a photo to a Telegram chat
 */
export async function sendTelegramPhoto(
    botToken: string,
    chatId: number | string,
    photo: Buffer,
    caption?: string
) {
    try {
        const formData = new FormData();
        formData.append('chat_id', chatId.toString());

        const blob = new Blob([new Uint8Array(photo)], { type: 'image/png' });
        formData.append('photo', blob, 'qrcode.png');

        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
        }

        const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const data = await response.json();
            console.error(`Failed to send Telegram photo to ${chatId}:`, data.description);
        }
    } catch (error) {
        console.error(`Error sending Telegram photo to ${chatId}:`, error);
    }
}

/**
 * Send a document to a Telegram chat
 */
export async function sendTelegramDocument(
    botToken: string,
    chatId: number | string,
    document: Buffer,
    filename: string,
    caption?: string
) {
    try {
        const formData = new FormData();
        formData.append('chat_id', chatId.toString());

        const blob = new Blob([new Uint8Array(document)], { type: 'application/octet-stream' });
        formData.append('document', blob, filename);

        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
        }

        const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendDocument`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const data = await response.json();
            console.error(`Failed to send Telegram document to ${chatId}:`, data.description);
        }
    } catch (error) {
        console.error(`Error sending Telegram document to ${chatId}:`, error);
    }
}

/**
 * Handle incoming Telegram message
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
    const message = update.message;
    if (!message || !message.text) return null;

    const chatId = message.chat.id;
    const userId = message.from.id;
    const username = message.from.username || message.from.first_name;
    const text = (message.text || '').trim();

    // Check configuration first
    const config = await getTelegramConfig();
    if (!config) return null;

    // Check if text looks like an email - Link account
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(text)) {
        return handleEmailLink(chatId, userId, text);
    }

    // Extract command
    const commandMatch = text.match(/^\/(\w+)(@\w+)?/);
    if (!commandMatch) return null;

    const command = commandMatch[1].toLowerCase();

    // Admin check helper
    const isAdmin = config.adminChatIds.includes(String(userId)) || config.adminChatIds.includes(String(chatId));

    switch (command) {
        case 'start':
            return handleStartCommand(chatId, userId, username, isAdmin);
        case 'usage':
        case 'mykey':
        case 'key':
            return handleUsageCommand(chatId, userId, config.botToken);
        case 'status':
            return isAdmin ? handleStatusCommand() : '❌ This command is only available to administrators.';
        case 'sysinfo':
            return isAdmin ? handleSysInfoCommand(chatId, config.botToken) : null;
        case 'backup':
            return isAdmin ? handleBackupCommand(chatId, config.botToken) : null;
        case 'help':
            return handleHelpCommand(isAdmin);
        default:
            return '❓ Unknown command. Use /help to see available commands.';
    }
}

/**
 * Handle /start command
 */
async function handleStartCommand(chatId: number, telegramId: number, username: string, isAdmin: boolean): Promise<string> {
    // Check if user exists with this Telegram ID
    const existingUser = await db.user.findFirst({
        where: { telegramChatId: String(chatId) },
    });

    if (existingUser) {
        return `✅ Welcome back, <b>${username}</b>!\n\nYour account is already linked.\n\nUse /usage to check your VPN data usage.`;
    }

    // Check if there's a user with matching telegramId in access keys
    const key = await db.accessKey.findFirst({
        where: { telegramId: String(telegramId) },
        include: { user: true },
    });

    if (key?.user) {
        // Link the chat ID to this user
        await db.user.update({
            where: { id: key.user.id },
            data: { telegramChatId: String(chatId) },
        });

        return `✅ Account linked successfully!\n\nWelcome, <b>${username}</b>!\n\nYou can now use:\n• /usage - Check your data usage\n• /help - See all commands`;
    }

    const adminMsg = isAdmin ? '\n\nYou are recognized as an Admin.' : '';
    return `👋 Hello, <b>${username}</b>!${adminMsg}\n\nTo link your VPN account, please send your email address or ask your admin to add your Telegram ID (<code>${telegramId}</code>) to your access key.`;
}

/**
 * Handle email message for measuring linking
 */
async function handleEmailLink(chatId: number, telegramId: number, email: string) {
    const keys = await db.accessKey.findMany({
        where: {
            email: email.toLowerCase(),
            status: { in: ['ACTIVE', 'PENDING'] },
        },
    });

    if (keys.length === 0) {
        return `❌ No active keys found for email: ${email}`;
    }

    // Update keys with telegram ID
    await db.accessKey.updateMany({
        where: { email: email.toLowerCase() },
        data: { telegramId: String(telegramId) },
    });

    // Also link User if exists
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
        await db.user.update({
            where: { id: user.id },
            data: { telegramChatId: String(chatId) },
        });
    }

    return `✅ Found ${keys.length} key(s)! Your Telegram account has been linked.\n\nUse /usage to check your stats.`;
}

/**
 * Handle /usage and /mykey command
 * Sends usage stats text AND QR codes
 */
async function handleUsageCommand(chatId: number, telegramId: number, botToken: string): Promise<string> {
    // Find access keys linked to this Telegram ID
    const keys = await db.accessKey.findMany({
        where: {
            OR: [
                { telegramId: String(telegramId) },
                { user: { telegramChatId: String(chatId) } },
            ],
            status: { in: ['ACTIVE', 'PENDING'] },
        },
        include: { server: true },
    });

    if (keys.length === 0) {
        return '❌ No VPN keys found linked to your account.\n\nPlease contact your admin to link your Telegram ID or send your email address.';
    }

    // Send summary first
    let response = '📊 <b>Your VPN Usage</b>\n\n';

    for (const key of keys) {
        const usedBytes = Number(key.usedBytes);
        const limitBytes = key.dataLimitBytes ? Number(key.dataLimitBytes) : null;
        const usedFormatted = formatBytes(usedBytes);

        let usageText = usedFormatted;
        if (limitBytes) {
            const percentage = Math.round((usedBytes / limitBytes) * 100);
            usageText = `${usedFormatted} / ${formatBytes(limitBytes)} (${percentage}%)`;
        }

        const statusEmoji = key.status === 'ACTIVE' ? '🟢' : '🔴';
        const countryFlag = key.server.countryCode ? getFlagEmoji(key.server.countryCode) : '🌐';

        response += `${statusEmoji} <b>${key.name}</b> ${countryFlag}\n`;
        response += `   📡 Server: ${key.server.name}\n`;
        response += `   📈 Usage: ${usageText}\n`;

        if (key.expiresAt) {
            const daysLeft = Math.ceil((new Date(key.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            response += `   ⏰ Expires: ${daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}\n`;
        }
        response += '\n';

        // Send individual key details with QR code
        setTimeout(async () => {
            const keyDetail = `
<b>${countryFlag} ${key.server.name}</b>
Key: ${key.name}

<code>${key.accessUrl}</code>

Tap the code above to copy.
            `.trim();

            await sendTelegramMessage(botToken, chatId, keyDetail);

            if (key.accessUrl) {
                try {
                    const qrBuffer = await QRCode.toBuffer(key.accessUrl, { width: 300, margin: 2 });
                    await sendTelegramPhoto(botToken, chatId, qrBuffer, 'Scan this QR code with your VPN app');
                } catch (e) {
                    console.error('QR Gen error', e);
                }
            }
        }, 1000); // Small delay to ensure order
    }

    return response;
}

/**
 * Handle /status command (Admin)
 */
async function handleStatusCommand(): Promise<string> {
    const servers = await db.server.findMany({
        where: { isActive: true },
        include: { healthCheck: true, _count: { select: { accessKeys: true } } },
    });

    if (servers.length === 0) return '❌ No servers configured.';

    let response = '🖥️ <b>Server Status</b>\n\n';

    for (const server of servers) {
        const status = server.healthCheck?.lastStatus || 'UNKNOWN';
        const statusEmoji = status === 'UP' ? '🟢' : status === 'DOWN' ? '🔴' : status === 'SLOW' ? '🟡' : '⚪';
        const latency = server.healthCheck?.lastLatencyMs;
        const uptime = server.healthCheck?.uptimePercent?.toFixed(1) || '-';

        response += `${statusEmoji} <b>${server.name}</b>\n`;
        response += `   • Status: ${status}\n`;
        response += `   • Latency: ${latency ? `${latency}ms` : '-'}\n`;
        response += `   • Uptime: ${uptime}%\n`;
        response += `   • Keys: ${server._count.accessKeys}\n\n`;
    }

    return response;
}

/**
 * Handle /sysinfo command (Admin)
 */
async function handleSysInfoCommand(chatId: number, botToken: string): Promise<string> {
    await sendTelegramMessage(botToken, chatId, '🔄 Gathering system information...');

    try {
        const [cpu, mem, disk, osInfo] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.osInfo(),
        ]);

        const totalDisk = disk.reduce((acc, d) => acc + d.size, 0);
        const usedDisk = disk.reduce((acc, d) => acc + d.used, 0);
        const usedDiskPercent = (usedDisk / totalDisk) * 100;

        return `
<b>System Information</b> 🖥️

<b>OS:</b> ${osInfo.distro} ${osInfo.release}
<b>CPU Load:</b> ${cpu.currentLoad.toFixed(1)}%
<b>Memory:</b> ${formatBytes(mem.active)} / ${formatBytes(mem.total)} (${((mem.active / mem.total) * 100).toFixed(1)}%)
<b>Disk:</b> ${formatBytes(usedDisk)} / ${formatBytes(totalDisk)} (${usedDiskPercent.toFixed(1)}%)
        `.trim();
    } catch (e) {
        console.error('Sysinfo error:', e);
        return '❌ Failed to retrieve system info.';
    }
}

/**
 * Handle /backup command (Admin)
 */
async function handleBackupCommand(chatId: number, botToken: string): Promise<string | null> {
    await sendTelegramMessage(botToken, chatId, '📦 Creating backup... please wait.');

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

            // Add DB file if sqlite
            const dbUrl = process.env.DATABASE_URL;
            if (dbUrl && dbUrl.includes('file:')) {
                const relativePath = dbUrl.replace('file:', '');
                // Check if it's absolute or relative
                const dbPath = path.isAbsolute(relativePath)
                    ? relativePath
                    : path.resolve(process.cwd(), 'prisma', relativePath.replace(/^\.\//, ''));

                if (fs.existsSync(dbPath)) {
                    archive.file(dbPath, { name: 'atomic-ui.db' });
                }
            }

            // Could add other files here (cert, env, etc.)

            archive.finalize();
        });

        // Read file buffer to send
        const fileBuffer = fs.readFileSync(filePath);

        // Send document
        await sendTelegramDocument(
            botToken,
            chatId,
            fileBuffer,
            filename,
            `Backup created at ${new Date().toLocaleString()}`
        );

        return null; // Message sent via document
    } catch (err: any) {
        console.error('Backup error:', err);
        return `❌ Backup failed: ${err.message}`;
    }
}

/**
 * Handle /help command
 */
function handleHelpCommand(isAdmin: boolean): string {
    let msg = `📚 <b>Available Commands</b>

/start - Link your Telegram account
/usage - Get your VPN keys and QR code
/help - Show this help message`;

    if (isAdmin) {
        msg += `\n\n<b>Admin Commands</b>
/status - Check server status
/sysinfo - System Resource Usage
/backup - Download Backup`;
    }

    msg += `\n\nYou can also send your email address to find keys associated with it.`;

    return msg;
}

function getFlagEmoji(countryCode: string) {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}
