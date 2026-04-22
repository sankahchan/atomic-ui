
/**
 * Server Provisioning Router
 * 
 * Handles interaction with cloud providers (DigitalOcean) to deploy new servers.
 */

import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import {
    decryptSettingSecret,
    encryptSettingSecret,
    isEncryptedSettingSecret,
} from '@/lib/settings-crypto';
import {
    applyProvisioningDropletCreated,
    applyProvisioningRunFailure,
    applyProvisioningRetryStart,
    applyProvisioningStatusRefresh,
    completeProvisioningRun,
    createProvisioningRun,
    getProvisioningRun,
    getProvisioningRuns,
    updateProvisioningRun,
} from '@/lib/services/provisioning-runs';
import digitalocean from 'digitalocean';

const DIGITALOCEAN_TOKEN_SETTING_KEY = 'digitalOceanToken';

export interface ProvisionTokenInspection {
    hasToken: boolean;
    token?: string;
    encrypted: boolean;
    needsMigration: boolean;
    error: string | null;
}

export function parseProvisionTokenValue(value: string) {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'string' || parsed.trim().length === 0) {
        throw new Error('Stored provider token is invalid.');
    }

    return decryptSettingSecret(parsed);
}

export function serializeProvisionTokenValue(token: string) {
    return JSON.stringify(encryptSettingSecret(token));
}

export function isProvisionTokenValueEncrypted(value: string) {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' && isEncryptedSettingSecret(parsed);
}

export function inspectProvisionTokenValue(value: string | null | undefined): ProvisionTokenInspection {
    if (!value?.trim()) {
        return {
            hasToken: false,
            encrypted: false,
            needsMigration: false,
            error: null,
        };
    }

    try {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'string' || parsed.trim().length === 0) {
            return {
                hasToken: false,
                encrypted: false,
                needsMigration: false,
                error: 'Stored DigitalOcean token is invalid.',
            };
        }

        const encrypted = isEncryptedSettingSecret(parsed);
        const token = decryptSettingSecret(parsed).trim();
        if (!token) {
            return {
                hasToken: false,
                encrypted,
                needsMigration: false,
                error: 'Stored DigitalOcean token is empty.',
            };
        }

        return {
            hasToken: true,
            token,
            encrypted,
            needsMigration: !encrypted,
            error: null,
        };
    } catch {
        return {
            hasToken: false,
            encrypted: false,
            needsMigration: false,
            error: 'Stored DigitalOcean token could not be decrypted. Save the provider token again.',
        };
    }
}

function getEnvDigitalOceanToken() {
    return (
        process.env.DIGITALOCEAN_ACCESS_TOKEN?.trim() ||
        process.env.DIGITALOCEAN_TOKEN?.trim() ||
        ''
    );
}

function getDropletPublicIp(droplet: any) {
    return droplet.networks?.v4?.find((ip: any) => ip.type === 'public')?.ip_address ?? null;
}

// Helper to get DO client
async function getDOClient() {
    const setting = await db.settings.findUnique({
        where: { key: DIGITALOCEAN_TOKEN_SETTING_KEY },
    });

    let token: string | undefined;
    if (setting) {
        const inspection = inspectProvisionTokenValue(setting.value);
        if (!inspection.hasToken || !inspection.token) {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: inspection.error || 'DigitalOcean API Token not configured.',
            });
        }
        token = inspection.token;
    } else {
        token = getEnvDigitalOceanToken();
    }

    if (!token) {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'DigitalOcean API Token not configured.',
        });
    }

    return digitalocean.client(token);
}

export const provisionRouter = router({
    /**
     * Check if provider is configured.
     */
    checkConfig: adminProcedure.query(async () => {
        const setting = await db.settings.findUnique({
            where: { key: DIGITALOCEAN_TOKEN_SETTING_KEY },
        });

        if (setting) {
            const inspection = inspectProvisionTokenValue(setting.value);
            return {
                hasToken: inspection.hasToken,
                source: 'settings' as const,
                tokenEncrypted: inspection.encrypted,
                needsTokenMigration: inspection.needsMigration,
                tokenError: inspection.error,
            };
        }

        const envToken = getEnvDigitalOceanToken();
        return {
            hasToken: envToken.length > 0,
            source: envToken ? 'env' as const : null,
            tokenEncrypted: null,
            needsTokenMigration: false,
            tokenError: null,
        };
    }),

    /**
     * Save API Token.
     */
    setToken: adminProcedure
        .input(z.object({ token: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            await db.settings.upsert({
                where: { key: DIGITALOCEAN_TOKEN_SETTING_KEY },
                create: {
                    key: DIGITALOCEAN_TOKEN_SETTING_KEY,
                    value: serializeProvisionTokenValue(input.token),
                },
                update: {
                    value: serializeProvisionTokenValue(input.token),
                },
            });

            await writeAuditLog({
                userId: ctx.user.id,
                ip: ctx.clientIp,
                action: 'PROVISION_PROVIDER_TOKEN_SAVE',
                entity: 'SETTINGS',
                entityId: DIGITALOCEAN_TOKEN_SETTING_KEY,
                details: {
                    provider: 'digitalocean',
                    encrypted: true,
                },
            });
            return { success: true };
        }),

    listRuns: adminProcedure.query(async () => {
        return getProvisioningRuns();
    }),

    getRun: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ input }) => {
            const run = await getProvisioningRun(input.id);
            if (!run) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Provisioning run not found.',
                });
            }

            if ((run.status === 'waiting_for_ip' || run.status === 'creating_droplet') && run.dropletId) {
                try {
                    const client = await getDOClient();
                    const droplet = await client.droplets.get(run.dropletId);
                    const nextRun = applyProvisioningStatusRefresh(run, {
                        id: droplet.id,
                        status: droplet.status,
                        ip: getDropletPublicIp(droplet),
                    });
                    await updateProvisioningRun(nextRun);
                    return nextRun;
                } catch (error) {
                    const failedRun = applyProvisioningRunFailure(run, {
                        step: 'wait_for_ip',
                        message: (error as Error).message,
                    });
                    await updateProvisioningRun(failedRun);
                    return failedRun;
                }
            }

            return run;
        }),

    /**
     * List available regions.
     */
    listRegions: adminProcedure.query(async () => {
        const client = await getDOClient();
        try {
            const regions = await client.regions.list();
            return regions
                .filter((r: any) => r.available && r.sizes.length > 0)
                .map((r: any) => ({
                    slug: r.slug,
                    name: r.name,
                    sizes: r.sizes,
                }));
        } catch (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch regions: ' + (error as Error).message,
            });
        }
    }),

    /**
     * List available sizes.
     */
    listSizes: adminProcedure.query(async () => {
        const client = await getDOClient();
        try {
            const sizes = await client.sizes.list();
            return sizes
                .filter((s: any) => s.available)
                .map((s: any) => ({
                    slug: s.slug,
                    memory: s.memory,
                    vcpus: s.vcpus,
                    disk: s.disk,
                    priceMonthly: s.price_monthly,
                    description: s.description, // e.g. "Basic"
                }));
        } catch (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch sizes: ' + (error as Error).message,
            });
        }
    }),

    /**
     * Create a new Droplet.
     */
    createDroplet: adminProcedure
        .input(z.object({
            name: z.string().min(1),
            region: z.string(),
            size: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const client = await getDOClient();
            const run = await createProvisioningRun({
                name: input.name,
                region: input.region,
                size: input.size,
                createdByUserId: ctx.user.id,
            });

            await writeAuditLog({
                userId: ctx.user.id,
                ip: ctx.clientIp,
                action: 'PROVISION_RUN_CREATED',
                entity: 'PROVISION_RUN',
                entityId: run.id,
                details: {
                    provider: 'digitalocean',
                    name: input.name,
                    region: input.region,
                    size: input.size,
                },
            });

            const cloudInit = `#cloud-config
package_update: true
package_upgrade: true
packages:
  - docker.io
  - curl
runcmd:
  - systemctl start docker
  - systemctl enable docker
`;

            try {
                const droplet = await client.droplets.create({
                    name: input.name,
                    region: input.region,
                    size: input.size,
                    image: 'ubuntu-22-04-x64',
                    user_data: cloudInit,
                    tags: ['atomic-ui'],
                });

                const nextRun = applyProvisioningDropletCreated(run, {
                    id: droplet.id,
                    status: droplet.status,
                    ip: getDropletPublicIp(droplet),
                });
                await updateProvisioningRun(nextRun);

                await writeAuditLog({
                    userId: ctx.user.id,
                    ip: ctx.clientIp,
                    action: 'PROVISION_DROPLET_CREATED',
                    entity: 'PROVISION_RUN',
                    entityId: run.id,
                    details: {
                        dropletId: droplet.id,
                        status: droplet.status,
                        ip: getDropletPublicIp(droplet),
                    },
                });

                return {
                    run: nextRun,
                };
            } catch (error) {
                const failedRun = applyProvisioningRunFailure(run, {
                    step: 'create_droplet',
                    message: (error as Error).message,
                });
                await updateProvisioningRun(failedRun);

                await writeAuditLog({
                    userId: ctx.user.id,
                    ip: ctx.clientIp,
                    action: 'PROVISION_DROPLET_CREATE_FAILED',
                    entity: 'PROVISION_RUN',
                    entityId: run.id,
                    details: {
                        error: (error as Error).message,
                        region: input.region,
                        size: input.size,
                    },
                });

                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create droplet: ' + (error as Error).message,
                });
            }
        }),

    retryRun: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const existingRun = await getProvisioningRun(input.id);
            if (!existingRun) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Provisioning run not found.',
                });
            }

            if (existingRun.status !== 'failed' && existingRun.status !== 'waiting_for_ip' && existingRun.status !== 'creating_droplet') {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'This provisioning run does not have a retryable step.',
                });
            }

            const client = await getDOClient();
            const retryRun = existingRun.status === 'failed' ? applyProvisioningRetryStart(existingRun) : existingRun;
            await updateProvisioningRun(retryRun);

            await writeAuditLog({
                userId: ctx.user.id,
                ip: ctx.clientIp,
                action: 'PROVISION_RUN_RETRY',
                entity: 'PROVISION_RUN',
                entityId: retryRun.id,
                details: {
                    status: existingRun.status,
                    failedStep: existingRun.failedStep,
                    dropletId: existingRun.dropletId,
                    attemptCount: retryRun.attemptCount,
                },
            });

            try {
                if (retryRun.currentStep === 'create_droplet' || !retryRun.dropletId) {
                    const cloudInit = `#cloud-config
package_update: true
package_upgrade: true
packages:
  - docker.io
  - curl
runcmd:
  - systemctl start docker
  - systemctl enable docker
`;

                    const droplet = await client.droplets.create({
                        name: retryRun.name,
                        region: retryRun.region,
                        size: retryRun.size,
                        image: 'ubuntu-22-04-x64',
                        user_data: cloudInit,
                        tags: ['atomic-ui'],
                    });

                    const nextRun = applyProvisioningDropletCreated(retryRun, {
                        id: droplet.id,
                        status: droplet.status,
                        ip: getDropletPublicIp(droplet),
                    });
                    await updateProvisioningRun(nextRun);
                    return nextRun;
                }

                const droplet = await client.droplets.get(retryRun.dropletId);
                const nextRun = applyProvisioningStatusRefresh(retryRun, {
                    id: droplet.id,
                    status: droplet.status,
                    ip: getDropletPublicIp(droplet),
                });
                await updateProvisioningRun(nextRun);
                return nextRun;
            } catch (error) {
                const failedRun = applyProvisioningRunFailure(retryRun, {
                    step: retryRun.dropletId ? 'wait_for_ip' : 'create_droplet',
                    message: (error as Error).message,
                });
                await updateProvisioningRun(failedRun);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to retry provisioning: ' + (error as Error).message,
                });
            }
        }),

    completeRun: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const run = await completeProvisioningRun(input.id);
            if (!run) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Provisioning run not found.',
                });
            }

            await writeAuditLog({
                userId: ctx.user.id,
                ip: ctx.clientIp,
                action: 'PROVISION_RUN_COMPLETED',
                entity: 'PROVISION_RUN',
                entityId: run.id,
                details: {
                    dropletId: run.dropletId,
                    dropletIp: run.dropletIp,
                },
            });

            return run;
        }),

    /**
     * Get Droplet status (for polling).
     */
    getDroplet: adminProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
            const client = await getDOClient();
            try {
                const droplet = await client.droplets.get(input.id);
                return {
                    id: droplet.id,
                    status: droplet.status,
                    ip: getDropletPublicIp(droplet),
                };
            } catch (error) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to get droplet: ' + (error as Error).message,
                });
            }
        }),
});
