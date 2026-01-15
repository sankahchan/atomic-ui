/**
 * Telegram Bot Utilities
 * Shared logic for sending messages and photos via Telegram Bot API
 */

interface SendMessageOptions {
    parseMode?: 'HTML' | 'Markdown';
}

export async function sendTelegramMessage(
    botToken: string,
    chatId: number | string,
    text: string,
    options: SendMessageOptions = { parseMode: 'HTML' }
) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: options.parseMode,
            }),
        });

        // Log failures but don't throw to prevent crashing loops
        if (!response.ok) {
            const data = await response.json();
            console.error(`Failed to send Telegram message to ${chatId}:`, data.description);
        }
    } catch (error) {
        console.error(`Error sending Telegram message to ${chatId}:`, error);
    }
}

export async function sendTelegramPhoto(
    botToken: string,
    chatId: number | string,
    photo: Buffer,
    caption?: string
) {
    try {
        const formData = new FormData();
        formData.append('chat_id', chatId.toString());

        // Convert Buffer to base64 for Blob creation (Node.js/Next.js polyfill compatible)
        // Note: In newer Node, FormData might accept Buffer directly or Blob from Buffer.
        // Safest cross-env approach for Next.js Edge/Node runtime:
        const blob = new Blob([new Uint8Array(photo)], { type: 'image/png' });

        formData.append('photo', blob, 'qrcode.png');

        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
        }

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
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

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const data = await response.json();
            console.error(`Failed to send Telegram document to ${chatId}:`, data.description);
            // Throw error for backup to know it failed
            throw new Error(data.description || 'Telegram API Error');
        }
    } catch (error) {
        console.error(`Error sending Telegram document to ${chatId}:`, error);
        throw error;
    }
}
