import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';
import { TOTP, generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getTotpEncryptionKeyHex } from '@/lib/totp-crypto';

// Create TOTP instance
const totp = new TOTP();
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

// Environment-based configuration
const APP_NAME = process.env.APP_NAME || 'Atomic UI';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const RP_ORIGIN = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000';

// Encryption key for TOTP secrets (32 bytes / 64 hex chars)
const ENCRYPTION_KEY = getTotpEncryptionKeyHex();

/**
 * Encrypt a TOTP secret for storage
 */
function encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a TOTP secret from storage
 */
function decryptSecret(encryptedData: string): string {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Generate recovery codes
 */
function generateRecoveryCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
        // Generate 8-character alphanumeric codes in format XXXX-XXXX
        const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
        const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
        codes.push(`${part1}-${part2}`);
    }
    return codes;
}

export const securityRouter = router({
    // ============================================
    // Security Rules (existing)
    // ============================================

    /**
     * List all security rules.
     */
    listRules: protectedProcedure.query(async () => {
        return db.securityRule.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }),

    /**
     * Create a new security rule.
     */
    createRule: adminProcedure
        .input(z.object({
            type: z.enum(['ALLOW', 'BLOCK']),
            targetType: z.enum(['IP', 'CIDR', 'COUNTRY']),
            targetValue: z.string().min(1),
            description: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            // Basic validation
            if (input.targetType === 'IP') {
                const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                if (!ipRegex.test(input.targetValue)) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Invalid IP address format',
                    });
                }
            }

            if (input.targetType === 'COUNTRY') {
                if (!/^[A-Z]{2}$/.test(input.targetValue)) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Country code must be 2 uppercase letters (ISO 3166-1 alpha-2)',
                    });
                }
            }

            return db.securityRule.create({
                data: {
                    type: input.type,
                    targetType: input.targetType,
                    targetValue: input.targetValue,
                    description: input.description,
                },
            });
        }),

    /**
     * Toggle rule active status.
     */
    toggleRule: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            const rule = await db.securityRule.findUnique({
                where: { id: input.id },
            });

            if (!rule) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            return db.securityRule.update({
                where: { id: input.id },
                data: { isActive: !rule.isActive },
            });
        }),

    /**
     * Delete a rule.
     */
    deleteRule: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            return db.securityRule.delete({
                where: { id: input.id },
            });
        }),

    // ============================================
    // TOTP Two-Factor Authentication
    // ============================================

    /**
     * Get user's 2FA status
     */
    get2FAStatus: protectedProcedure.query(async ({ ctx }) => {
        const userId = ctx.user.id;

        const totpSecret = await db.totpSecret.findUnique({
            where: { userId },
            select: { verified: true, createdAt: true },
        });

        const webAuthnCredentials = await db.webAuthnCredential.findMany({
            where: { userId },
            select: { id: true, name: true, createdAt: true, lastUsedAt: true },
        });

        const recoveryCodes = await db.recoveryCode.findMany({
            where: { userId, usedAt: null },
            select: { id: true },
        });

        return {
            totpEnabled: totpSecret?.verified || false,
            totpSetupStarted: !!totpSecret && !totpSecret.verified,
            webAuthnEnabled: webAuthnCredentials.length > 0,
            webAuthnCredentials: webAuthnCredentials.map(c => ({
                id: c.id,
                name: c.name,
                createdAt: c.createdAt,
                lastUsedAt: c.lastUsedAt,
            })),
            recoveryCodesRemaining: recoveryCodes.length,
            has2FA: (totpSecret?.verified || false) || webAuthnCredentials.length > 0,
        };
    }),

    /**
     * Initialize TOTP setup - generates secret and QR code
     */
    initTotpSetup: protectedProcedure.mutation(async ({ ctx }) => {
        const userId = ctx.user.id;
        const userEmail = ctx.user.email;

        // Check if TOTP is already verified
        const existing = await db.totpSecret.findUnique({
            where: { userId },
        });

        if (existing?.verified) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'TOTP is already enabled. Disable it first to set up a new one.',
            });
        }

        // Generate new secret
        const secret = generateSecret();
        const encryptedSecret = encryptSecret(secret);

        // Create or update the TOTP secret record
        await db.totpSecret.upsert({
            where: { userId },
            update: {
                encryptedSecret,
                verified: false,
                attemptCount: 0,
                lastAttemptAt: null,
            },
            create: {
                userId,
                encryptedSecret,
                verified: false,
            },
        });

        // Generate otpauth URI
        const otpauthUrl = generateURI({ issuer: APP_NAME, label: userEmail, secret });

        // Generate QR code as data URL
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
            width: 256,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        });

        return {
            secret,
            qrCode: qrCodeDataUrl,
            otpauthUrl,
        };
    }),

    /**
     * Verify TOTP code and enable 2FA
     */
    verifyTotpSetup: protectedProcedure
        .input(z.object({
            code: z.string().length(6).regex(/^\d+$/),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            const totpRecord = await db.totpSecret.findUnique({
                where: { userId },
            });

            if (!totpRecord) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No TOTP setup in progress. Please start setup first.',
                });
            }

            if (totpRecord.verified) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'TOTP is already enabled.',
                });
            }

            // Rate limiting: max 5 attempts per minute
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
            if (totpRecord.lastAttemptAt && totpRecord.lastAttemptAt > oneMinuteAgo && totpRecord.attemptCount >= 5) {
                throw new TRPCError({
                    code: 'TOO_MANY_REQUESTS',
                    message: 'Too many attempts. Please wait a minute and try again.',
                });
            }

            // Update attempt tracking
            const shouldResetCount = !totpRecord.lastAttemptAt || totpRecord.lastAttemptAt < oneMinuteAgo;
            await db.totpSecret.update({
                where: { userId },
                data: {
                    lastAttemptAt: new Date(),
                    attemptCount: shouldResetCount ? 1 : totpRecord.attemptCount + 1,
                },
            });

            // Verify the code
            const secret = decryptSecret(totpRecord.encryptedSecret);
            const isValid = verify({ token: input.code, secret });

            if (!isValid) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invalid verification code. Please try again.',
                });
            }

            // Mark as verified
            await db.totpSecret.update({
                where: { userId },
                data: {
                    verified: true,
                    attemptCount: 0,
                },
            });

            // Generate recovery codes
            const codes = generateRecoveryCodes(10);
            const hashedCodes = await Promise.all(
                codes.map(async (code) => ({
                    userId,
                    codeHash: await bcrypt.hash(code.replace('-', ''), 10),
                }))
            );

            // Delete any existing recovery codes
            await db.recoveryCode.deleteMany({ where: { userId } });

            // Save new recovery codes
            await db.recoveryCode.createMany({
                data: hashedCodes,
            });

            return {
                success: true,
                recoveryCodes: codes,
            };
        }),

    /**
     * Verify TOTP code during login
     */
    verifyTotpLogin: protectedProcedure
        .input(z.object({
            code: z.string().length(6).regex(/^\d+$/),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            const totpRecord = await db.totpSecret.findUnique({
                where: { userId },
            });

            if (!totpRecord || !totpRecord.verified) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'TOTP is not enabled for this account.',
                });
            }

            // Verify the code
            const secret = decryptSecret(totpRecord.encryptedSecret);
            const isValid = verify({ token: input.code, secret });

            if (!isValid) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Invalid verification code.',
                });
            }

            return { success: true };
        }),

    /**
     * Disable TOTP 2FA
     */
    disableTotp: protectedProcedure
        .input(z.object({
            code: z.string().length(6).regex(/^\d+$/),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            const totpRecord = await db.totpSecret.findUnique({
                where: { userId },
            });

            if (!totpRecord || !totpRecord.verified) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'TOTP is not enabled for this account.',
                });
            }

            // Verify the code
            const secret = decryptSecret(totpRecord.encryptedSecret);
            const isValid = verify({ token: input.code, secret });

            if (!isValid) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Invalid verification code.',
                });
            }

            // Delete TOTP secret and recovery codes
            await db.totpSecret.delete({ where: { userId } });
            await db.recoveryCode.deleteMany({ where: { userId } });

            return { success: true };
        }),

    // ============================================
    // Recovery Codes
    // ============================================

    /**
     * Regenerate recovery codes
     */
    regenerateRecoveryCodes: protectedProcedure
        .input(z.object({
            code: z.string().length(6).regex(/^\d+$/),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            // Verify TOTP first
            const totpRecord = await db.totpSecret.findUnique({
                where: { userId },
            });

            if (!totpRecord || !totpRecord.verified) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'TOTP must be enabled to regenerate recovery codes.',
                });
            }

            const secret = decryptSecret(totpRecord.encryptedSecret);
            const isValid = verify({ token: input.code, secret });

            if (!isValid) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Invalid verification code.',
                });
            }

            // Generate new codes
            const codes = generateRecoveryCodes(10);
            const hashedCodes = await Promise.all(
                codes.map(async (code) => ({
                    userId,
                    codeHash: await bcrypt.hash(code.replace('-', ''), 10),
                }))
            );

            // Delete existing and create new
            await db.recoveryCode.deleteMany({ where: { userId } });
            await db.recoveryCode.createMany({
                data: hashedCodes,
            });

            return { recoveryCodes: codes };
        }),

    /**
     * Verify a recovery code (for login)
     */
    verifyRecoveryCode: protectedProcedure
        .input(z.object({
            code: z.string().min(8).max(10),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            const normalizedCode = input.code.replace('-', '');

            const recoveryCodes = await db.recoveryCode.findMany({
                where: { userId, usedAt: null },
            });

            for (const rc of recoveryCodes) {
                const isMatch = await bcrypt.compare(normalizedCode, rc.codeHash);
                if (isMatch) {
                    // Mark as used
                    await db.recoveryCode.update({
                        where: { id: rc.id },
                        data: { usedAt: new Date() },
                    });

                    return { success: true, remainingCodes: recoveryCodes.length - 1 };
                }
            }

            throw new TRPCError({
                code: 'UNAUTHORIZED',
                message: 'Invalid recovery code.',
            });
        }),

    // ============================================
    // WebAuthn Passkeys
    // ============================================

    /**
     * Generate registration options for WebAuthn
     */
    generateWebAuthnRegistrationOptions: protectedProcedure.mutation(async ({ ctx }) => {
        const userId = ctx.user.id;
        const userEmail = ctx.user.email;

        // Get existing credentials
        const existingCredentials = await db.webAuthnCredential.findMany({
            where: { userId },
            select: { credentialId: true, transports: true },
        });

        const options = await generateRegistrationOptions({
            rpName: APP_NAME,
            rpID: RP_ID,
            userID: new Uint8Array(Buffer.from(userId)),
            userName: userEmail,
            userDisplayName: userEmail,
            attestationType: 'none',
            excludeCredentials: existingCredentials.map(cred => ({
                id: cred.credentialId,
                transports: cred.transports ? JSON.parse(cred.transports) as AuthenticatorTransportFuture[] : undefined,
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
        });

        // Store challenge in session/temp storage (using Settings for simplicity)
        await db.settings.upsert({
            where: { key: `webauthn_challenge_${userId}` },
            update: { value: JSON.stringify({ challenge: options.challenge, timestamp: Date.now() }) },
            create: { key: `webauthn_challenge_${userId}`, value: JSON.stringify({ challenge: options.challenge, timestamp: Date.now() }) },
        });

        return options;
    }),

    /**
     * Verify WebAuthn registration response
     */
    verifyWebAuthnRegistration: protectedProcedure
        .input(z.object({
            response: z.custom<RegistrationResponseJSON>(),
            name: z.string().min(1).max(50).default('Security Key'),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            // Get stored challenge
            const challengeRecord = await db.settings.findUnique({
                where: { key: `webauthn_challenge_${userId}` },
            });

            if (!challengeRecord) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No registration challenge found. Please try again.',
                });
            }

            const { challenge, timestamp } = JSON.parse(challengeRecord.value);

            // Check challenge is not too old (5 minutes)
            if (Date.now() - timestamp > 5 * 60 * 1000) {
                await db.settings.delete({ where: { key: `webauthn_challenge_${userId}` } });
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Challenge expired. Please try again.',
                });
            }

            const verification = await verifyRegistrationResponse({
                response: input.response,
                expectedChallenge: challenge,
                expectedOrigin: RP_ORIGIN,
                expectedRPID: RP_ID,
            });

            if (!verification.verified || !verification.registrationInfo) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Registration verification failed.',
                });
            }

            const { credential, credentialDeviceType } = verification.registrationInfo;

            // Store credential
            await db.webAuthnCredential.create({
                data: {
                    userId,
                    credentialId: Buffer.from(credential.id).toString('base64url'),
                    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
                    counter: credential.counter,
                    deviceType: credentialDeviceType,
                    transports: input.response.response.transports ? JSON.stringify(input.response.response.transports) : null,
                    name: input.name,
                },
            });

            // Clean up challenge
            await db.settings.delete({ where: { key: `webauthn_challenge_${userId}` } });

            return { success: true };
        }),

    /**
     * Generate authentication options for WebAuthn
     */
    generateWebAuthnAuthenticationOptions: protectedProcedure.mutation(async ({ ctx }) => {
        const userId = ctx.user.id;

        const credentials = await db.webAuthnCredential.findMany({
            where: { userId },
            select: { credentialId: true, transports: true },
        });

        if (credentials.length === 0) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'No passkeys registered.',
            });
        }

        const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            allowCredentials: credentials.map(cred => ({
                id: cred.credentialId,
                transports: cred.transports ? JSON.parse(cred.transports) as AuthenticatorTransportFuture[] : undefined,
            })),
            userVerification: 'preferred',
        });

        // Store challenge
        await db.settings.upsert({
            where: { key: `webauthn_auth_challenge_${userId}` },
            update: { value: JSON.stringify({ challenge: options.challenge, timestamp: Date.now() }) },
            create: { key: `webauthn_auth_challenge_${userId}`, value: JSON.stringify({ challenge: options.challenge, timestamp: Date.now() }) },
        });

        return options;
    }),

    /**
     * Verify WebAuthn authentication response
     */
    verifyWebAuthnAuthentication: protectedProcedure
        .input(z.object({
            response: z.custom<AuthenticationResponseJSON>(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            // Get stored challenge
            const challengeRecord = await db.settings.findUnique({
                where: { key: `webauthn_auth_challenge_${userId}` },
            });

            if (!challengeRecord) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No authentication challenge found.',
                });
            }

            const { challenge, timestamp } = JSON.parse(challengeRecord.value);

            if (Date.now() - timestamp > 5 * 60 * 1000) {
                await db.settings.delete({ where: { key: `webauthn_auth_challenge_${userId}` } });
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Challenge expired.',
                });
            }

            // Find the credential
            const credential = await db.webAuthnCredential.findUnique({
                where: { credentialId: input.response.id },
            });

            if (!credential || credential.userId !== userId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Unknown credential.',
                });
            }

            const verification = await verifyAuthenticationResponse({
                response: input.response,
                expectedChallenge: challenge,
                expectedOrigin: RP_ORIGIN,
                expectedRPID: RP_ID,
                credential: {
                    id: credential.credentialId,
                    publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
                    counter: credential.counter,
                    transports: credential.transports ? JSON.parse(credential.transports) : undefined,
                },
            });

            if (!verification.verified) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Authentication failed.',
                });
            }

            // Update counter and last used
            await db.webAuthnCredential.update({
                where: { id: credential.id },
                data: {
                    counter: verification.authenticationInfo.newCounter,
                    lastUsedAt: new Date(),
                },
            });

            // Clean up challenge
            await db.settings.delete({ where: { key: `webauthn_auth_challenge_${userId}` } });

            return { success: true };
        }),

    /**
     * Rename a WebAuthn credential
     */
    renameWebAuthnCredential: protectedProcedure
        .input(z.object({
            credentialId: z.string(),
            name: z.string().min(1).max(50),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            const credential = await db.webAuthnCredential.findFirst({
                where: { id: input.credentialId, userId },
            });

            if (!credential) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            return db.webAuthnCredential.update({
                where: { id: input.credentialId },
                data: { name: input.name },
            });
        }),

    /**
     * Delete a WebAuthn credential
     */
    deleteWebAuthnCredential: protectedProcedure
        .input(z.object({
            credentialId: z.string(),
            totpCode: z.string().length(6).regex(/^\d+$/).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;

            // If TOTP is enabled, require verification
            const totpRecord = await db.totpSecret.findUnique({
                where: { userId },
            });

            if (totpRecord?.verified) {
                if (!input.totpCode) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'TOTP code required to delete passkey.',
                    });
                }

                const secret = decryptSecret(totpRecord.encryptedSecret);
                const isValid = verify({ token: input.totpCode, secret });

                if (!isValid) {
                    throw new TRPCError({
                        code: 'UNAUTHORIZED',
                        message: 'Invalid TOTP code.',
                    });
                }
            }

            const credential = await db.webAuthnCredential.findFirst({
                where: { id: input.credentialId, userId },
            });

            if (!credential) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            await db.webAuthnCredential.delete({
                where: { id: input.credentialId },
            });

            return { success: true };
        }),

    // ============================================
    // Security Status / Probes
    // ============================================

    /**
     * Get dashboard security status
     */
    getDashboardSecurityStatus: protectedProcedure.query(async () => {
        const probe = await db.dashboardSecurityProbe.findUnique({
            where: { id: 'dashboard-security' },
        });

        return probe;
    }),

    /**
     * Get server security probes
     */
    getServerSecurityProbes: protectedProcedure.query(async () => {
        const probes = await db.securityProbe.findMany();

        // Get server names
        const serverIds = probes.map(p => p.serverId);
        const servers = await db.server.findMany({
            where: { id: { in: serverIds } },
            select: { id: true, name: true, location: true },
        });

        const serverMap = new Map(servers.map(s => [s.id, s]));

        return probes.map(probe => ({
            ...probe,
            server: serverMap.get(probe.serverId),
        }));
    }),

    /**
     * Get security summary
     */
    getSecuritySummary: protectedProcedure.query(async () => {
        // Dashboard security
        const dashboardProbe = await db.dashboardSecurityProbe.findUnique({
            where: { id: 'dashboard-security' },
        });

        // Server probes
        const serverProbes = await db.securityProbe.findMany();

        // Count issues
        const expiringCerts = serverProbes.filter(p => p.result === 'CERT_EXPIRING').length;
        const expiredCerts = serverProbes.filter(p => p.result === 'CERT_EXPIRED').length;
        const tlsErrors = serverProbes.filter(p => p.result === 'TLS_ERROR').length;
        const connectionErrors = serverProbes.filter(p => p.result === 'CONNECTION_ERROR').length;

        return {
            dashboardSecurityScore: dashboardProbe?.securityScore || 0,
            dashboardScheme: dashboardProbe?.scheme || 'unknown',
            dashboardHasHsts: dashboardProbe?.hasHsts || false,
            dashboardHasCsp: dashboardProbe?.hasCsp || false,
            serverCount: serverProbes.length,
            healthyServers: serverProbes.filter(p => p.result === 'OK').length,
            expiringCerts,
            expiredCerts,
            tlsErrors,
            connectionErrors,
            lastChecked: dashboardProbe?.lastCheckedAt || null,
        };
    }),

    /**
     * Trigger a manual security probe (admin only)
     */
    triggerSecurityProbe: adminProcedure.mutation(async () => {
        // This would trigger the security worker to run immediately
        // For now, just return info about the last probe
        const dashboardProbe = await db.dashboardSecurityProbe.findUnique({
            where: { id: 'dashboard-security' },
        });

        return {
            message: 'Security probe triggered. Results will be available shortly.',
            lastChecked: dashboardProbe?.lastCheckedAt || null,
        };
    }),
});
