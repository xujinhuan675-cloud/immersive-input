import { getCurrentUser } from './auth';
import { getBillingProfile } from './billing';

const CACHE_TTL_MS = 60 * 1000;

let cachedEntitlement = null;

export function clearAiServiceEntitlementCache() {
    cachedEntitlement = null;
}

export async function getAiServiceEntitlement({ forceRefresh = false } = {}) {
    const { user } = getCurrentUser();
    if (!user) {
        return {
            canUseCustomAiServices: true,
            tier: 'free',
            tierName: '',
            profile: null,
            source: 'anonymous',
        };
    }

    const userId = String(user.id || user.email || '');
    const now = Date.now();
    if (
        !forceRefresh &&
        cachedEntitlement &&
        cachedEntitlement.userId === userId &&
        cachedEntitlement.expiresAt > now
    ) {
        return cachedEntitlement.value;
    }

    let profile = null;
    try {
        const profileResult = await getBillingProfile(user.id);
        profile = profileResult?.profile || null;
    } catch {
        const value = {
            canUseCustomAiServices: true,
            tier: 'free',
            tierName: '',
            profile: null,
            source: 'unavailable',
        };
        cachedEntitlement = {
            userId,
            expiresAt: now + CACHE_TTL_MS,
            value,
        };
        return value;
    }

    const value = {
        // BYOK custom services do not consume the hosted gateway quota.
        canUseCustomAiServices: true,
        tier: profile?.tier || 'free',
        tierName: profile?.tierName || '',
        profile,
        source: 'sub2api',
    };
    cachedEntitlement = {
        userId,
        expiresAt: now + CACHE_TTL_MS,
        value,
    };
    return value;
}
