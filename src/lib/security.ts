import { db } from './db';
import ipRangeCheck from 'ip-range-check';
import fs from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { getAdminLoginRestrictionStatus } from '@/lib/services/admin-login-protection';

export function normalizeIpAddress(rawIp: string | null | undefined): string | null {
    if (!rawIp) {
        return null;
    }

    let ip = rawIp.trim();
    if (!ip) {
        return null;
    }

    if (ip.startsWith('[') && ip.includes(']')) {
        ip = ip.slice(1, ip.indexOf(']'));
    }

    if (ip.startsWith('::ffff:')) {
        ip = ip.slice(7);
    }

    const zoneIndex = ip.indexOf('%');
    if (zoneIndex !== -1) {
        ip = ip.slice(0, zoneIndex);
    }

    const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort) {
        ip = ipv4WithPort[1];
    }

    if (ip === '::1') {
        return '127.0.0.1';
    }

    return isIP(ip) ? ip : null;
}

type GeoIpLookupResult = {
    country?: string;
} | null;

type GeoIpLookupFn = (ip: string) => GeoIpLookupResult;

let geoIpLookupPromise: Promise<GeoIpLookupFn | null> | null = null;

function getGeoIpDataDirCandidates() {
    return [
        process.env.GEODATADIR,
        path.join(process.cwd(), 'node_modules', 'geoip-lite', 'data'),
        path.join(process.cwd(), '.next', 'server', 'data'),
        path.join(process.cwd(), '.next', 'standalone', 'node_modules', 'geoip-lite', 'data'),
        path.join(process.cwd(), '.next', 'standalone', '.next', 'server', 'data'),
    ].filter((candidate): candidate is string => Boolean(candidate));
}

async function getGeoIpLookup(): Promise<GeoIpLookupFn | null> {
    if (!geoIpLookupPromise) {
        geoIpLookupPromise = (async () => {
            const dataDir = getGeoIpDataDirCandidates().find((candidate) => fs.existsSync(candidate));

            if (dataDir) {
                process.env.GEODATADIR = dataDir;
                (globalThis as typeof globalThis & { geodatadir?: string }).geodatadir = dataDir;
            }

            try {
                const geoIpModule = await import('geoip-lite');
                const geoIp = ('default' in geoIpModule ? geoIpModule.default : geoIpModule) as {
                    lookup?: (ip: string) => GeoIpLookupResult;
                };

                if (typeof geoIp.lookup !== 'function') {
                    return null;
                }

                return (ip: string) => {
                    try {
                        return geoIp.lookup?.(ip) ?? null;
                    } catch (error) {
                        console.error('Error running geoip lookup:', error);
                        return null;
                    }
                };
            } catch (error) {
                console.error('Failed to load geoip-lite:', error);
                return null;
            }
        })();
    }

    return geoIpLookupPromise;
}

export async function getGeoIpCountry(ip: string | null | undefined) {
    const normalizedIp = normalizeIpAddress(ip);
    if (!normalizedIp) {
        return {
            ip: null,
            countryCode: null,
        };
    }

    const geoIpLookup = await getGeoIpLookup();
    if (!geoIpLookup) {
        return {
            ip: normalizedIp,
            countryCode: null,
        };
    }

    const geo = geoIpLookup(normalizedIp);
    return {
        ip: normalizedIp,
        countryCode: geo?.country ?? null,
    };
}

/**
 * Checks if an IP address is allowed based on the active Security Rules.
 * 
 * Logic:
 * 1. Localhost and private networks are always allowed.
 * 2. If IP matches a BLOCK rule -> Denied.
 * 3. If ALLOW rules exist (Whitelist mode active) and IP does NOT match any -> Denied.
 * 4. Otherwise -> Allowed.
 */
export async function checkIpAllowed(ip: string): Promise<{ allowed: boolean; reason?: string }> {
    const normalizedIp = normalizeIpAddress(ip);
    if (!normalizedIp) {
        return { allowed: true };
    }

    ip = normalizedIp;

    // Allow localhost and private networks
    // IPv4 private ranges plus common IPv6 local/link-local ranges
    if (
        ipRangeCheck(ip, ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1', 'fc00::/7', 'fe80::/10'])
    ) {
        return { allowed: true };
    }

    const rules = await db.securityRule.findMany({
        where: { isActive: true },
    });

    const blockRules = rules.filter(r => r.type === 'BLOCK');
    const allowRules = rules.filter(r => r.type === 'ALLOW');

    // 1. Check BLOCK rules
    for (const rule of blockRules) {
        if (await matchesRule(ip, rule)) {
            return {
                allowed: false,
                reason: `Access blocked by rule: ${rule.description || rule.targetType + ' ' + rule.targetValue}`
            };
        }
    }

    // 2. Check ALLOW rules
    if (allowRules.length > 0) {
        let matched = false;
        for (const rule of allowRules) {
            if (await matchesRule(ip, rule)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            return { allowed: false, reason: 'Access denied: not in whitelist' };
        }
    }

    const loginRestriction = await getAdminLoginRestrictionStatus(ip);
    if (loginRestriction.blocked) {
        return {
            allowed: false,
            reason: loginRestriction.reason,
        };
    }

    return { allowed: true };
}

async function matchesRule(ip: string, rule: { targetType: string; targetValue: string }): Promise<boolean> {
    try {
        if (rule.targetType === 'IP') {
            return ip === rule.targetValue;
        }

        if (rule.targetType === 'CIDR') {
            return ipRangeCheck(ip, rule.targetValue);
        }

        if (rule.targetType === 'COUNTRY') {
            const geoIpLookup = await getGeoIpLookup();
            if (!geoIpLookup) {
                return false;
            }

            const geo = geoIpLookup(ip);
            // geoip.lookup returns null for private IPs or unknown
            if (!geo) return false;
            return geo.country === rule.targetValue;
        }
    } catch (error) {
        console.error('Error matching security rule:', error);
        return false;
    }

    return false;
}
