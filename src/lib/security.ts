import { db } from './db';
import geoip from 'geoip-lite';
import ipRangeCheck from 'ip-range-check';
import { isIP } from 'node:net';

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
        if (matchesRule(ip, rule)) {
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
            if (matchesRule(ip, rule)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            return { allowed: false, reason: 'Access denied: not in whitelist' };
        }
    }

    return { allowed: true };
}

function matchesRule(ip: string, rule: { targetType: string; targetValue: string }): boolean {
    try {
        if (rule.targetType === 'IP') {
            return ip === rule.targetValue;
        }

        if (rule.targetType === 'CIDR') {
            return ipRangeCheck(ip, rule.targetValue);
        }

        if (rule.targetType === 'COUNTRY') {
            const geo = geoip.lookup(ip);
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
