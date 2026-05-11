import { getCurrentUser } from './auth';
import { getBillingCatalog, getBillingProfile } from './billing';

const CACHE_TTL_MS = 60 * 1000;
const ALLOWED_CUSTOM_AI_TIERS = new Set(['pro', 'enterprise']);
const PROFESSIONAL_SIGNALS = ['pro', 'plus', 'premium', 'professional', 'enterprise', 'team', '专业', '高级', '企业', '团队'];

let cachedEntitlement = null;

function normalizeTier(value) {
    return String(value || '').trim().toLowerCase();
}

function textIncludesProfessionalSignal(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return false;
    return PROFESSIONAL_SIGNALS.some((signal) => text.includes(signal));
}

function valueIncludesProfessionalSignal(value, seen = new Set()) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return textIncludesProfessionalSignal(value);
    }
    if (Array.isArray(value)) {
        return value.some((item) => valueIncludesProfessionalSignal(item, seen));
    }
    if (typeof value === 'object') {
        if (seen.has(value)) return false;
        seen.add(value);
        return Object.values(value).some((item) => valueIncludesProfessionalSignal(item, seen));
    }
    return false;
}

function collectActiveSubscriptionPlanIds(profile = {}) {
    const subscriptions = profile?.raw?.activeSubscriptions;
    if (!Array.isArray(subscriptions)) return new Set();

    return subscriptions.reduce((ids, subscription) => {
        const candidates = [
            subscription?.plan_id,
            subscription?.planId,
            subscription?.plan?.id,
            subscription?.payment_order?.plan_id,
        ];
        candidates.forEach((candidate) => {
            const numericId = Number(candidate);
            if (Number.isFinite(numericId) && numericId > 0) {
                ids.add(numericId);
            }
        });
        return ids;
    }, new Set());
}

function collectActiveSubscriptionGroupIds(profile = {}) {
    const subscriptions = profile?.raw?.activeSubscriptions;
    const summarySubscriptions = profile?.raw?.summary?.subscriptions;
    const sources = [
        ...(Array.isArray(subscriptions) ? subscriptions : []),
        ...(Array.isArray(summarySubscriptions) ? summarySubscriptions : []),
    ];

    return sources.reduce((ids, subscription) => {
        const candidates = [
            subscription?.group_id,
            subscription?.groupId,
            subscription?.group?.id,
        ];
        candidates.forEach((candidate) => {
            const numericId = Number(candidate);
            if (Number.isFinite(numericId) && numericId > 0) {
                ids.add(numericId);
            }
        });
        return ids;
    }, new Set());
}

function canUseCustomAiFromPlan(plan) {
    const tier = normalizeTier(plan?.tier);
    if (ALLOWED_CUSTOM_AI_TIERS.has(tier)) return true;
    return valueIncludesProfessionalSignal({
        tier: plan?.tier,
        planName: plan?.planName,
        name: plan?.name,
        productName: plan?.product_name,
        productCode: plan?.productCode,
    });
}

function canUseCustomAiFromProfile(profile = {}, catalog = null) {
    const tier = normalizeTier(profile?.tier);
    if (ALLOWED_CUSTOM_AI_TIERS.has(tier)) return true;

    if (
        valueIncludesProfessionalSignal({
            tier: profile?.tier,
            tierName: profile?.tierName,
            activeSubscriptions: profile?.raw?.activeSubscriptions,
            summary: profile?.raw?.summary,
        })
    ) {
        return true;
    }

    const plans = catalog?.catalog?.subscriptionPlans;
    if (!Array.isArray(plans)) return false;

    const activePlanIds = collectActiveSubscriptionPlanIds(profile);
    const activeGroupIds = collectActiveSubscriptionGroupIds(profile);
    if (!activePlanIds.size && !activeGroupIds.size) return false;

    const planMatched = plans.some(
        (plan) => activePlanIds.has(Number(plan?.planId ?? plan?.id)) && canUseCustomAiFromPlan(plan)
    );
    if (planMatched) return true;

    return Array.from(activeGroupIds).some((groupId) => {
        const groupPlans = plans.filter((plan) => Number(plan?.group_id ?? plan?.groupId) === groupId);
        return groupPlans.length > 0 && groupPlans.every(canUseCustomAiFromPlan);
    });
}

export function clearAiServiceEntitlementCache() {
    cachedEntitlement = null;
}

export async function getAiServiceEntitlement({ forceRefresh = false } = {}) {
    const { user } = getCurrentUser();
    if (!user) {
        return {
            canUseCustomAiServices: false,
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
    let catalog = null;
    try {
        const [profileResult, catalogResult] = await Promise.all([
            getBillingProfile(user.id),
            getBillingCatalog().catch(() => null),
        ]);
        profile = profileResult?.profile || null;
        catalog = catalogResult || null;
    } catch {
        const value = {
            canUseCustomAiServices: false,
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
        canUseCustomAiServices: canUseCustomAiFromProfile(profile, catalog),
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
