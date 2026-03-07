import nodemailer, { type Transporter } from 'nodemailer';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  auth?: {
    user: string;
    pass: string;
  };
};

let transporterPromise: Promise<Transporter> | null = null;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][^>]*>/i.test(value);
}

function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    throw new Error('SMTP_HOST is not configured');
  }

  const rawPort = process.env.SMTP_PORT?.trim() || '587';
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a valid positive number');
  }

  const secure = port === 465;
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS ?? '';

  if ((smtpUser && !smtpPass) || (!smtpUser && smtpPass)) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured together');
  }

  const from = process.env.SMTP_FROM?.trim() || smtpUser;
  if (!from) {
    throw new Error('SMTP_FROM must be configured for email notifications');
  }

  return {
    host,
    port,
    secure,
    from,
    ...(smtpUser
      ? {
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        }
      : {}),
  };
}

async function getTransporter() {
  if (!transporterPromise) {
    const config = getSmtpConfig();
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.auth ? { auth: config.auth } : {}),
      }),
    );
  }

  return transporterPromise;
}

function formatEventLabel(event: string) {
  const isTest = event.startsWith('TEST_');
  const base = (isTest ? event.slice(5) : event)
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return isTest ? `Test ${base}` : base;
}

function buildHtmlBody(message: string) {
  const content = looksLikeHtml(message) ? message : escapeHtml(message);

  return [
    '<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; white-space: pre-wrap;">',
    content,
    '</div>',
  ].join('');
}

export async function sendNotificationEmail({
  to,
  event,
  message,
}: {
  to: string | string[];
  event: string;
  message: string;
}) {
  const config = getSmtpConfig();
  const transporter = await getTransporter();

  await transporter.sendMail({
    from: config.from,
    to,
    subject: `[Atomic-UI] ${formatEventLabel(event)}`,
    text: stripHtml(message) || message,
    html: buildHtmlBody(message),
  });
}
