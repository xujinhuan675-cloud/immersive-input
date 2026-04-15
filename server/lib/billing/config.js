import { computeTopupCredits } from './engine.js';
import { BILLING_TIERS, resolveTierRule, SUBSCRIPTION_PRODUCTS } from './plans.js';

const DEFAULT_TOPUP_PRESET_AMOUNTS = Object.freeze([29, 59, 99, 199]);
const DEFAULT_SUBSCRIPTION_PRICE_CNY = Object.freeze({
    membership_basic_month: 29,
    membership_basic_year: 299,
    membership_pro_month: 59,
    membership_pro_year: 599,
    membership_enterprise_month: 199,
    membership_enterprise_year: 1999,
});

function parsePositiveNumber(value, fallback) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    return fallback;
}

function parseJsonObject(value) {
    if (!value) return {};
    try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function normalizeProductEnvSuffix(productCode) {
    return String(productCode || '')
        .trim()
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
}

function parseTopupPresetAmounts() {
    const raw = String(process.env.BILLING_TOPUP_PRESET_AMOUNTS || '')
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    return raw.length > 0 ? raw : [...DEFAULT_TOPUP_PRESET_AMOUNTS];
}

function resolveSubscriptionPrice(productCode) {
    const priceMap = parseJsonObject(process.env.BILLING_PLAN_PRICES_JSON);
    const defaultPrice = DEFAULT_SUBSCRIPTION_PRICE_CNY[productCode] || 0;
    const envKey = `BILLING_PLAN_PRICE_${normalizeProductEnvSuffix(productCode)}`;
    const specific = parsePositiveNumber(process.env[envKey], NaN);
    if (Number.isFinite(specific) && specific > 0) {
        return specific;
    }
    return parsePositiveNumber(priceMap[productCode], defaultPrice);
}

export function getBillingRuntimeConfig() {
    const fallbackFreeQuota = resolveTierRule(BILLING_TIERS.FREE).dailyQuota;
    const freeDailyQuota = Number(process.env.BILLING_FREE_DAILY_QUOTA || fallbackFreeQuota);
    const topupCreditsPerCny = Number(process.env.BILLING_TOPUP_CREDITS_PER_CNY || 100);
    const allowCreditFallback = String(process.env.BILLING_ALLOW_CREDIT_FALLBACK || 'true').toLowerCase() !== 'false';

    return {
        freeDailyQuota: Number.isFinite(freeDailyQuota) ? freeDailyQuota : fallbackFreeQuota,
        topupCreditsPerCny: Number.isFinite(topupCreditsPerCny) ? topupCreditsPerCny : 100,
        allowCreditFallback,
    };
}

export function getBillingCatalog() {
    const runtime = getBillingRuntimeConfig();
    const currency =
        String(process.env.BILLING_CURRENCY || 'CNY')
            .trim()
            .toUpperCase() || 'CNY';
    const topupPresetAmounts = parseTopupPresetAmounts();

    return {
        currency,
        topupCreditsPerCny: runtime.topupCreditsPerCny,
        topupPresets: topupPresetAmounts.map((amount) => {
            const amountCents = Math.round(amount * 100);
            return {
                productCode: 'membership_topup',
                amount,
                amountCents,
                currency,
                credits: computeTopupCredits(amountCents, runtime.topupCreditsPerCny),
            };
        }),
        subscriptionPlans: Object.entries(SUBSCRIPTION_PRODUCTS).map(([productCode, product]) => {
            const tierRule = resolveTierRule(product.tier);
            const amount = resolveSubscriptionPrice(productCode);
            return {
                productCode,
                tier: product.tier,
                durationDays: product.durationDays,
                billingCycle: product.billingCycle || (product.durationDays >= 365 ? 'year' : 'month'),
                amount,
                amountCents: Math.round(amount * 100),
                currency,
                dailyQuota: tierRule.dailyQuota,
                allowCreditFallback: !!tierRule.allowCreditFallback,
            };
        }),
    };
}
