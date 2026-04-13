import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { execFileSync, spawn, type ChildProcess } from 'child_process';

import bcrypt from 'bcryptjs';

const repoRoot = process.cwd();
const appPort = 3100;
const outlinePort = 18443;
const baseUrl = `http://127.0.0.1:${appPort}`;
const outlineUrl = `https://127.0.0.1:${outlinePort}`;
const templateDbPath = path.join(repoRoot, 'prisma', 'data', 'atomic-ui.db');
const smokeDbPath = path.join(repoRoot, 'prisma', 'data', 'playwright-smoke.db');
const smokeAdminEmail = 'smoke-admin@example.com';
const smokeAdminPassword = 'Admin123!';
const smokeSupportThreadId = 'smoke-support-thread';

function setSmokeEnv() {
  process.env.DATABASE_URL = `file:${smokeDbPath}`;
  process.env.APP_URL = baseUrl;
  process.env.NEXT_PUBLIC_APP_URL = baseUrl;
  process.env.NEXTAUTH_URL = baseUrl;
  process.env.NEXT_PUBLIC_BASE_PATH = '';
  process.env.JWT_SECRET = 'playwright-smoke-secret';
  process.env.DISABLE_SCHEDULER = '1';
  process.env.NODE_ENV = 'development';
}

function generateSelfSignedCertificate() {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ui-playwright-'));
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-sha256',
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
      ],
      { stdio: 'ignore' },
    );
  } catch (error) {
    throw new Error(
      `OpenSSL is required to run Playwright smoke tests: ${(error as Error).message}`,
    );
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

function readJsonBody(request: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk.toString();
    });
    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function createMockOutlineServer() {
  const certificate = generateSelfSignedCertificate();
  const keys = new Map<
    string,
    {
      id: string;
      name: string;
      password: string;
      port: number;
      method: string;
      accessUrl: string;
      dataLimitBytes?: number;
    }
  >();
  let keyCounter = 1;

  return https.createServer(certificate, async (request, response) => {
    const requestUrl = new URL(request.url || '/', outlineUrl);

    if (request.method === 'GET' && requestUrl.pathname === '/server') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          name: 'Playwright SG',
          serverId: 'playwright-outline',
          metricsEnabled: true,
          createdTimestampMs: Date.now(),
          version: '1.0.0',
          portForNewAccessKeys: 12345,
          hostnameForAccessKeys: '127.0.0.1',
        }),
      );
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/access-keys') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ accessKeys: Array.from(keys.values()) }));
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/metrics/transfer') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ bytesTransferredByUserId: {} }));
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/access-keys') {
      const body = await readJsonBody(request).catch(() => ({}));
      const id = `mock-key-${keyCounter++}`;
      const name =
        typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : `Mock ${id}`;
      const method =
        typeof body.method === 'string' && body.method.trim().length > 0
          ? body.method.trim()
          : 'chacha20-ietf-poly1305';
      const password = `pw-${id}`;
      const accessUrl = `ss://${method}:${password}@127.0.0.1:12345#${encodeURIComponent(name)}`;
      const record = {
        id,
        name,
        password,
        port: 12345,
        method,
        accessUrl,
      };
      keys.set(id, record);
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify(record));
      return;
    }

    if (request.method === 'PUT' && /^\/access-keys\/[^/]+$/.test(requestUrl.pathname)) {
      const body = await readJsonBody(request).catch(() => ({}));
      const id = requestUrl.pathname.split('/').pop() || '';
      const name =
        typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : `Mock ${id}`;
      const method =
        typeof body.method === 'string' && body.method.trim().length > 0
          ? body.method.trim()
          : 'chacha20-ietf-poly1305';
      const password =
        typeof body.password === 'string' && body.password.trim().length > 0
          ? body.password.trim()
          : `pw-${id}`;
      const accessUrl = `ss://${method}:${password}@127.0.0.1:12345#${encodeURIComponent(name)}`;
      const record = {
        id,
        name,
        password,
        port: 12345,
        method,
        accessUrl,
      };
      keys.set(id, record);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(record));
      return;
    }

    if (
      request.method === 'PUT' &&
      /^\/access-keys\/[^/]+\/data-limit$/.test(requestUrl.pathname)
    ) {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found', path: requestUrl.pathname }));
  });
}

async function resetAndSeedDatabase() {
  fs.mkdirSync(path.dirname(smokeDbPath), { recursive: true });
  if (!fs.existsSync(templateDbPath)) {
    throw new Error(
      `Smoke database template is missing at ${templateDbPath}. Run the normal local setup first.`,
    );
  }
  if (fs.existsSync(smokeDbPath)) {
    fs.rmSync(smokeDbPath, { force: true });
  }
  const journalPath = `${smokeDbPath}-journal`;
  if (fs.existsSync(journalPath)) {
    fs.rmSync(journalPath, { force: true });
  }
  execFileSync('sqlite3', [templateDbPath, `.backup ${smokeDbPath}`], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const now = new Date();

  try {
    const passwordHash = await bcrypt.hash(smokeAdminPassword, 10);

    await prisma.telegramSupportReply.deleteMany({
      where: { threadId: smokeSupportThreadId },
    });
    await prisma.telegramSupportThread.deleteMany({
      where: { id: smokeSupportThreadId },
    });
    await prisma.telegramOrder.deleteMany({
      where: { id: 'smoke-order-review' },
    });
    await prisma.healthCheck.deleteMany({
      where: { serverId: 'smoke-server' },
    });
    await prisma.server.deleteMany({
      where: { id: 'smoke-server' },
    });
    await prisma.user.deleteMany({
      where: { id: 'smoke-admin-user' },
    });

    await prisma.settings.upsert({
      where: { key: 'auth_require_admin_2fa' },
      update: { value: JSON.stringify({ required: false }) },
      create: {
        key: 'auth_require_admin_2fa',
        value: JSON.stringify({ required: false }),
      },
    });
    await prisma.settings.upsert({
      where: { key: 'admin_login_protection' },
      update: {
        value: JSON.stringify({
          challengeMode: 'OFF',
          unusualLoginApprovalEnabled: false,
          incidentDigestEnabled: false,
        }),
      },
      create: {
        key: 'admin_login_protection',
        value: JSON.stringify({
          challengeMode: 'OFF',
          unusualLoginApprovalEnabled: false,
          incidentDigestEnabled: false,
        }),
      },
    });

    await prisma.user.create({
      data: {
        id: 'smoke-admin-user',
        email: smokeAdminEmail,
        passwordHash,
        role: 'ADMIN',
        adminScope: 'OWNER',
      },
    });

    await prisma.server.create({
      data: {
        id: 'smoke-server',
        name: 'Playwright SG',
        apiUrl: outlineUrl,
        apiCertSha256: 'playwright-smoke',
        countryCode: 'SG',
        location: 'Singapore',
        isActive: true,
        isDefault: true,
        lifecycleMode: 'ACTIVE',
        maxKeys: 100,
        metricsEnabled: true,
        healthCheck: {
          create: {
            isEnabled: true,
            checkIntervalMins: 5,
            notifyCooldownMins: 30,
            latencyThresholdMs: 800,
            lastStatus: 'UP',
            lastLatencyMs: 120,
            lastCheckedAt: now,
            totalChecks: 1,
            successfulChecks: 1,
            failedChecks: 0,
          },
        },
      },
    });

    await prisma.telegramOrder.create({
      data: {
        id: 'smoke-order-review',
        orderCode: 'PW-ORDER-001',
        kind: 'BUY',
        orderMode: 'SELF',
        status: 'PENDING_REVIEW',
        telegramChatId: '1001',
        telegramUserId: '1001',
        telegramUsername: 'pw_customer',
        locale: 'en',
        requestedName: 'Playwright Order',
        requestedEmail: 'customer@example.com',
        planCode: 'STD30',
        planName: 'Standard 30 Days',
        priceAmount: 5000,
        priceCurrency: 'MMK',
        priceLabel: '5,000 Kyat',
        selectedServerId: 'smoke-server',
        selectedServerName: 'Playwright SG',
        selectedServerCountryCode: 'SG',
        paymentMethodCode: 'KBZPAY',
        paymentMethodLabel: 'KBZPay',
        paymentProofType: 'IMAGE',
        paymentSubmittedAt: now,
        customerMessage: 'Please approve this payment proof.',
      },
    });

    await prisma.telegramSupportThread.create({
      data: {
        id: smokeSupportThreadId,
        threadCode: 'SUP-PLAYWRIGHT',
        status: 'OPEN',
        waitingOn: 'ADMIN',
        issueCategory: 'KEY',
        locale: 'en',
        telegramChatId: '2001',
        telegramUserId: '2001',
        telegramUsername: 'pw_support_user',
        subject: 'Playwright support thread',
        relatedKeyName: 'PW-Key',
        firstResponseDueAt: new Date(now.getTime() + 60 * 60 * 1000),
        replies: {
          create: {
            senderType: 'USER',
            telegramUserId: '2001',
            telegramUsername: 'pw_support_user',
            senderName: 'pw_support_user',
            message: 'I need help with my key.',
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

function startNextServer(): ChildProcess {
  return spawn(
    'npx',
    ['next', 'dev', '-p', String(appPort), '--hostname', '127.0.0.1'],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );
}

async function main() {
  setSmokeEnv();
  await resetAndSeedDatabase();

  const outlineServer = createMockOutlineServer();
  await new Promise<void>((resolve) => {
    outlineServer.listen(outlinePort, '127.0.0.1', () => resolve());
  });

  const nextServer = startNextServer();

  const cleanup = () => {
    outlineServer.close();
    if (!nextServer.killed) {
      nextServer.kill('SIGTERM');
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  nextServer.on('exit', (code) => {
    outlineServer.close();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
