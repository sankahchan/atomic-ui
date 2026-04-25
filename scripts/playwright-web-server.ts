import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { X509Certificate } from 'crypto';

import bcrypt from 'bcryptjs';

const repoRoot = process.cwd();
const appPort = 3100;
const outlinePort = 18443;
const baseUrl = `http://127.0.0.1:${appPort}`;
const outlineUrl = `https://127.0.0.1:${outlinePort}`;
const templateDbPath = path.join(repoRoot, 'prisma', 'data', 'atomic-ui.db');
const templateSchemaPath = path.join(repoRoot, 'scripts', 'playwright-smoke-schema.sql');
const smokeDbPath = path.join(repoRoot, 'prisma', 'data', 'playwright-smoke.db');
const smokeAdminEmail = 'smoke-admin@example.com';
const smokeAdminPassword = 'Admin123!';
const smokePortalEmail = 'smoke-portal@example.com';
const smokePortalPassword = 'Portal123!';
const smokeSupportThreadId = 'smoke-support-thread';
const smokePortalTelegramId = '3001';
const smokeAccessKeyId = 'smoke-access-key';
const smokeDynamicKeyId = 'smoke-dynamic-key';
const smokeDynamicChildKeyId = 'smoke-dynamic-child-key';
const fixedNow = new Date('2026-04-14T03:00:00.000Z');

function setSmokeEnv() {
  process.env.DATABASE_URL = `file:${smokeDbPath}`;
  process.env.APP_URL = baseUrl;
  process.env.NEXT_PUBLIC_APP_URL = baseUrl;
  process.env.NEXTAUTH_URL = baseUrl;
  process.env.NEXT_PUBLIC_BASE_PATH = '';
  process.env.JWT_SECRET = 'playwright-smoke-secret';
  process.env.DISABLE_SCHEDULER = '1';
  process.env.PLAYWRIGHT_SMOKE = '1';
  process.env.NODE_ENV = 'development';
}

type GeneratedSelfSignedCertificate = {
  key: Buffer;
  cert: Buffer;
  fingerprint256: string;
};

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

  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);
  const fingerprint256 = new X509Certificate(cert).fingerprint256;

  return {
    key,
    cert,
    fingerprint256,
  } satisfies GeneratedSelfSignedCertificate;
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

  return {
    fingerprint256: certificate.fingerprint256,
    server: https.createServer(
      {
        key: certificate.key,
        cert: certificate.cert,
      },
      async (request, response) => {
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
      },
    ),
  };
}

async function resetAndSeedDatabase(outlineCertSha256: string) {
  fs.mkdirSync(path.dirname(smokeDbPath), { recursive: true });
  if (fs.existsSync(smokeDbPath)) {
    fs.rmSync(smokeDbPath, { force: true });
  }
  const journalPath = `${smokeDbPath}-journal`;
  if (fs.existsSync(journalPath)) {
    fs.rmSync(journalPath, { force: true });
  }
  const walPath = `${smokeDbPath}-wal`;
  if (fs.existsSync(walPath)) {
    fs.rmSync(walPath, { force: true });
  }
  const shmPath = `${smokeDbPath}-shm`;
  if (fs.existsSync(shmPath)) {
    fs.rmSync(shmPath, { force: true });
  }

  if (fs.existsSync(templateDbPath)) {
    execFileSync('sqlite3', [templateDbPath, `.backup ${smokeDbPath}`], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } else if (fs.existsSync(templateSchemaPath)) {
    execFileSync('sqlite3', [smokeDbPath], {
      cwd: repoRoot,
      input: fs.readFileSync(templateSchemaPath),
      stdio: ['pipe', 'ignore', 'inherit'],
    });
  } else {
    throw new Error(
      `Smoke database bootstrap is missing both ${templateDbPath} and ${templateSchemaPath}.`,
    );
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const now = fixedNow;

  try {
    const passwordHash = await bcrypt.hash(smokeAdminPassword, 10);
    const portalPasswordHash = await bcrypt.hash(smokePortalPassword, 10);

    await prisma.telegramSupportReply.deleteMany({
      where: { threadId: smokeSupportThreadId },
    });
    await prisma.telegramSupportThread.deleteMany({
      where: { id: smokeSupportThreadId },
    });
    await prisma.telegramOrder.deleteMany({
      where: { id: 'smoke-order-fulfilled' },
    });
    await prisma.telegramOrder.deleteMany({
      where: { id: 'smoke-order-review' },
    });
    await prisma.telegramUserProfile.deleteMany({
      where: { telegramUserId: smokePortalTelegramId },
    });
    await prisma.accessKey.deleteMany({
      where: { id: { in: [smokeAccessKeyId, smokeDynamicChildKeyId] } },
    });
    await prisma.dynamicAccessKey.deleteMany({
      where: { id: smokeDynamicKeyId },
    });
    await prisma.healthCheck.deleteMany({});
    await prisma.server.deleteMany({});
    await prisma.user.deleteMany({
      where: { id: 'smoke-admin-user' },
    });
    await prisma.user.deleteMany({
      where: { id: 'smoke-portal-user' },
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
        createdAt: new Date('2026-03-01T08:00:00.000Z'),
        updatedAt: new Date('2026-04-14T03:00:00.000Z'),
      },
    });
    await prisma.user.create({
      data: {
        id: 'smoke-portal-user',
        email: smokePortalEmail,
        passwordHash: portalPasswordHash,
        role: 'USER',
        telegramChatId: smokePortalTelegramId,
        createdAt: new Date('2026-03-05T10:35:00.000Z'),
        updatedAt: new Date('2026-04-14T02:45:00.000Z'),
      },
    });

    await prisma.telegramUserProfile.create({
      data: {
        telegramUserId: smokePortalTelegramId,
        telegramChatId: smokePortalTelegramId,
        username: 'pw_portal',
        displayName: 'Playwright Portal User',
        locale: 'en',
        referralCode: 'PWREF',
        createdAt: new Date('2026-03-05T10:35:00.000Z'),
        updatedAt: new Date('2026-04-14T02:45:00.000Z'),
      },
    });

    await prisma.server.create({
      data: {
        id: 'smoke-server',
        name: 'Playwright SG',
        apiUrl: outlineUrl,
        apiCertSha256: outlineCertSha256,
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

    await prisma.accessKey.create({
      data: {
        id: smokeAccessKeyId,
        outlineKeyId: 'outline-smoke-access',
        name: 'Playwright Access Key',
        email: smokePortalEmail,
        telegramId: smokePortalTelegramId,
        notes: 'High-touch customer key for desktop and mobile detail-page visual checks.',
        userId: 'smoke-portal-user',
        serverId: 'smoke-server',
        accessUrl: 'ss://chacha20-ietf-poly1305:pw-smoke-access@127.0.0.1:12345#Playwright%20Access%20Key',
        password: 'pw-smoke-access',
        port: 12345,
        method: 'chacha20-ietf-poly1305',
        dataLimitBytes: BigInt(30 * 1024 * 1024 * 1024),
        usedBytes: BigInt(12 * 1024 * 1024 * 1024),
        expirationType: 'FIXED_DATE',
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        status: 'ACTIVE',
        lastTrafficAt: new Date('2026-04-14T02:35:00.000Z'),
        lastUsedAt: new Date('2026-04-14T02:20:00.000Z'),
        sharePageEnabled: true,
        clientLinkEnabled: true,
        telegramDeliveryEnabled: true,
        subscriptionToken: 'smoke-access-subscription-token',
        publicSlug: 'playwright-access-key',
        quotaAlertThresholds: '70,85,95',
        quotaAlertsSent: JSON.stringify([70]),
        estimatedDevices: 2,
        maxDevices: 4,
        createdAt: new Date('2026-03-25T10:00:00.000Z'),
        updatedAt: new Date('2026-04-14T02:35:00.000Z'),
      },
    });

    await prisma.dynamicAccessKey.create({
      data: {
        id: smokeDynamicKeyId,
        name: 'Playwright Dynamic Key',
        type: 'SELF_MANAGED',
        email: smokePortalEmail,
        telegramId: smokePortalTelegramId,
        notes: 'Premium subscription fixture with routing and rotation state for visual coverage.',
        userId: 'smoke-portal-user',
        dataLimitBytes: BigInt(120 * 1024 * 1024 * 1024),
        usedBytes: BigInt(48 * 1024 * 1024 * 1024),
        dynamicUrl: 'pw-dynamic-001',
        publicSlug: 'playwright-dynamic-key',
        status: 'ACTIVE',
        method: 'chacha20-ietf-poly1305',
        loadBalancerAlgorithm: 'LEAST_LOAD',
        preferredCountryCodesJson: JSON.stringify(['SG']),
        sharePageEnabled: true,
        rotationEnabled: true,
        rotationInterval: 'WEEKLY',
        nextRotationAt: new Date('2026-04-18T03:00:00.000Z'),
        lastRotatedAt: new Date('2026-04-11T03:00:00.000Z'),
        rotationCount: 3,
        lastResolvedAccessKeyId: smokeDynamicChildKeyId,
        lastResolvedServerId: 'smoke-server',
        lastResolvedAt: new Date('2026-04-14T02:32:00.000Z'),
        quotaAlertThresholds: '70,85,95',
        quotaAlertsSent: JSON.stringify([70]),
        createdAt: new Date('2026-03-20T09:00:00.000Z'),
        updatedAt: new Date('2026-04-14T02:40:00.000Z'),
        accessKeys: {
          create: {
            id: smokeDynamicChildKeyId,
            outlineKeyId: 'outline-smoke-dynamic-child',
            name: 'Playwright Dynamic Backend',
            email: smokePortalEmail,
            telegramId: smokePortalTelegramId,
            serverId: 'smoke-server',
            accessUrl: 'ss://chacha20-ietf-poly1305:pw-smoke-dynamic@127.0.0.1:12345#Playwright%20Dynamic%20Backend',
            password: 'pw-smoke-dynamic',
            port: 12345,
            method: 'chacha20-ietf-poly1305',
            dataLimitBytes: BigInt(120 * 1024 * 1024 * 1024),
            usedBytes: BigInt(24 * 1024 * 1024 * 1024),
            expirationType: 'NEVER',
            status: 'ACTIVE',
            lastTrafficAt: new Date('2026-04-14T02:32:00.000Z'),
            lastUsedAt: new Date('2026-04-14T02:18:00.000Z'),
            sharePageEnabled: true,
            clientLinkEnabled: true,
            telegramDeliveryEnabled: true,
            estimatedDevices: 3,
            maxDevices: 5,
            createdAt: new Date('2026-03-20T09:15:00.000Z'),
            updatedAt: new Date('2026-04-14T02:32:00.000Z'),
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

    await prisma.telegramOrder.create({
      data: {
        id: 'smoke-order-fulfilled',
        orderCode: 'PW-ORDER-002',
        kind: 'RENEW',
        orderMode: 'SELF',
        status: 'FULFILLED',
        telegramChatId: smokePortalTelegramId,
        telegramUserId: smokePortalTelegramId,
        telegramUsername: 'pw_portal',
        locale: 'en',
        requestedName: 'Playwright Renewal',
        requestedEmail: smokePortalEmail,
        planCode: 'PREM30',
        planName: 'Premium 30 Days',
        priceAmount: 12000,
        priceCurrency: 'MMK',
        priceLabel: '12,000 Kyat',
        selectedServerId: 'smoke-server',
        selectedServerName: 'Playwright SG',
        selectedServerCountryCode: 'SG',
        paymentMethodCode: 'KBZPAY',
        paymentMethodLabel: 'KBZPay',
        targetAccessKeyId: smokeAccessKeyId,
        approvedAccessKeyId: smokeAccessKeyId,
        paymentSubmittedAt: new Date('2026-04-12T12:00:00.000Z'),
        reviewedByUserId: 'smoke-admin-user',
        reviewedAt: new Date('2026-04-12T12:15:00.000Z'),
        fulfilledAt: new Date('2026-04-12T12:18:00.000Z'),
        financeStatus: 'VERIFIED',
        createdAt: new Date('2026-04-12T11:45:00.000Z'),
        updatedAt: new Date('2026-04-12T12:18:00.000Z'),
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
        telegramChatId: smokePortalTelegramId,
        telegramUserId: smokePortalTelegramId,
        telegramUsername: 'pw_portal',
        userId: 'smoke-portal-user',
        subject: 'Playwright support thread',
        relatedOrderCode: 'PW-ORDER-002',
        relatedKeyName: 'Playwright Access Key',
        relatedServerName: 'Playwright SG',
        firstResponseDueAt: new Date('2026-04-14T04:00:00.000Z'),
        lastCustomerReplyAt: new Date('2026-04-14T02:42:00.000Z'),
        createdAt: new Date('2026-04-13T18:00:00.000Z'),
        updatedAt: new Date('2026-04-14T02:42:00.000Z'),
        replies: {
          create: [
            {
              senderType: 'USER',
              telegramUserId: smokePortalTelegramId,
              telegramUsername: 'pw_portal',
              senderName: 'pw_portal',
              message: 'My subscription is connecting, but the mobile client keeps dropping after a few minutes.',
              createdAt: new Date('2026-04-14T02:10:00.000Z'),
            },
            {
              senderType: 'USER',
              telegramUserId: smokePortalTelegramId,
              telegramUsername: 'pw_portal',
              senderName: 'pw_portal',
              message: 'Here is the screenshot from the app so you can see the server warning.',
              mediaKind: 'IMAGE',
              mediaUrl: 'https://example.com/playwright-support-proof.png',
              mediaFilename: 'support-proof.png',
              mediaContentType: 'image/png',
              createdAt: new Date('2026-04-14T02:42:00.000Z'),
            },
          ],
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
  const { server: outlineServer, fingerprint256 } = createMockOutlineServer();
  await resetAndSeedDatabase(fingerprint256);

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
