export const BILLING_TIERS = Object.freeze({
    FREE: 'free',
    BASIC: 'basic',
    PRO: 'pro',
    ENTERPRISE: 'enterprise',
});

export const TIER_RULES = Object.freeze({
    [BILLING_TIERS.FREE]: {
        dailyQuota: 20,
        allowCreditFallback: true,
    },
    [BILLING_TIERS.BASIC]: {
        dailyQuota: 100,
        allowCreditFallback: true,
    },
    [BILLING_TIERS.PRO]: {
        dailyQuota: 500,
        allowCreditFallback: true,
    },
    [BILLING_TIERS.ENTERPRISE]: {
        dailyQuota: -1, // unlimited
        allowCreditFallback: true,
    },
});

export const SUBSCRIPTION_PRODUCTS = Object.freeze({
    membership_basic_month: {
        tier: BILLING_TIERS.BASIC,
        durationDays: 30,
        billingCycle: 'month',
    },
    membership_basic_year: {
        tier: BILLING_TIERS.BASIC,
        durationDays: 365,
        billingCycle: 'year',
    },
    membership_pro_month: {
        tier: BILLING_TIERS.PRO,
        durationDays: 30,
        billingCycle: 'month',
    },
    membership_pro_year: {
        tier: BILLING_TIERS.PRO,
        durationDays: 365,
        billingCycle: 'year',
    },
    membership_enterprise_month: {
        tier: BILLING_TIERS.ENTERPRISE,
        durationDays: 30,
        billingCycle: 'month',
    },
    membership_enterprise_year: {
        tier: BILLING_TIERS.ENTERPRISE,
        durationDays: 365,
        billingCycle: 'year',
    },
});

export function resolveTierRule(tier) {
    const key = String(tier || '')
        .trim()
        .toLowerCase();
    return TIER_RULES[key] || TIER_RULES[BILLING_TIERS.FREE];
}

export function resolveSubscriptionProduct(productCode) {
    const key = String(productCode || '')
        .trim()
        .toLowerCase();
    return SUBSCRIPTION_PRODUCTS[key] || null;
}
