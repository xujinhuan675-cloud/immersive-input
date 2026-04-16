import { computeTopupCredits } from './engine.js';
import { BILLING_TIERS, resolveTierRule, SUBSCRIPTION_PRODUCTS } from './plans.js';
import { getPaymentRuntimeConfig } from '../payment/config.js';

const DEFAULT_TOPUP_PRESET_AMOUNTS = Object.freeze({
    CNY: Object.freeze([29, 59, 99, 199]),
    USD: Object.freeze([4.99, 8.99, 14.99, 29.99]),
});
const DEFAULT_SUBSCRIPTION_PRICE = Object.freeze({
    CNY: Object.freeze({
        membership_basic_month: 29,
        membership_basic_year: 299,
        membership_pro_month: 59,
        membership_pro_year: 599,
        membership_enterprise_month: 199,
        membership_enterprise_year: 1999,
    }),
    USD: Object.freeze({
        membership_basic_month: 4.99,
        membership_basic_year: 49.99,
        membership_pro_month: 9.99,
        membership_pro_year: 99.99,
        membership_enterprise_month: 29.99,
        membership_enterprise_year: 299.99,
    }),
});
const DEFAULT_TOPUP_CREDITS_PER_UNIT = Object.freeze({
    CNY: 100,
    USD: 700,
});

function resolveUsdToCnyRate() {
    const rate = Number(process.env.BILLING_USD_TO_CNY_RATE || 7.2);
    return Number.isFinite(rate) && rate > 0 ? rate : 7.2;
}

function normalizeCurrency(value, fallback = 'CNY') {
    const normalized = String(value || '')
        .trim()
        .toUpperCase();
    return normalized || fallback;
}

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

function parseNumberList(value) {
    return String(value || '')
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
}

function parseTopupPresetAmounts(currency = 'CNY') {
    const normalizedCurrency = normalizeCurrency(currency);
    const currencySpecific = parseNumberList(
        process.env[`BILLING_TOPUP_PRESET_AMOUNTS_${normalizedCurrency}`]
    );
    if (currencySpecific.length > 0) {
        return currencySpecific;
    }
    if (normalizedCurrency === 'CNY') {
        const generic = parseNumberList(process.env.BILLING_TOPUP_PRESET_AMOUNTS);
        if (generic.length > 0) {
            return generic;
        }
    }
    return [...(DEFAULT_TOPUP_PRESET_AMOUNTS[normalizedCurrency] || DEFAULT_TOPUP_PRESET_AMOUNTS.CNY)];
}

function resolveSubscriptionPrice(productCode, currency = 'CNY') {
    const normalizedCurrency = normalizeCurrency(currency);
    const priceMap = parseJsonObject(
        process.env[`BILLING_PLAN_PRICES_JSON_${normalizedCurrency}`] ||
            (normalizedCurrency === 'CNY' ? process.env.BILLING_PLAN_PRICES_JSON : '')
    );
    const defaultPrice =
        DEFAULT_SUBSCRIPTION_PRICE[normalizedCurrency]?.[productCode] ||
        DEFAULT_SUBSCRIPTION_PRICE.CNY[productCode] ||
        0;
    const envKey = `BILLING_PLAN_PRICE_${normalizedCurrency}_${normalizeProductEnvSuffix(productCode)}`;
    const specific = parsePositiveNumber(process.env[envKey], NaN);
    if (Number.isFinite(specific) && specific > 0) {
        return specific;
    }
    if (normalizedCurrency === 'CNY') {
        const legacyEnvKey = `BILLING_PLAN_PRICE_${normalizeProductEnvSuffix(productCode)}`;
        const legacySpecific = parsePositiveNumber(process.env[legacyEnvKey], NaN);
        if (Number.isFinite(legacySpecific) && legacySpecific > 0) {
            return legacySpecific;
        }
    }
    return parsePositiveNumber(priceMap[productCode], defaultPrice);
}

function resolveTopupCreditsPerUnit(currency = 'CNY') {
    const normalizedCurrency = normalizeCurrency(currency);
    const envKey = `BILLING_TOPUP_CREDITS_PER_${normalizedCurrency}`;
    const fallback =
        DEFAULT_TOPUP_CREDITS_PER_UNIT[normalizedCurrency] || DEFAULT_TOPUP_CREDITS_PER_UNIT.CNY;
    const specific = Number(process.env[envKey]);
    if (Number.isFinite(specific) && specific > 0) {
        return specific;
    }
    if (normalizedCurrency === 'CNY') {
        const legacy = Number(process.env.BILLING_TOPUP_CREDITS_PER_CNY || fallback);
        return Number.isFinite(legacy) ? legacy : fallback;
    }
    return fallback;
}

function getProviderCurrencyMap() {
    const paymentConfig = getPaymentRuntimeConfig().customOrchestrator;
    return {
        stripe: normalizeCurrency(paymentConfig?.stripe?.defaultCurrency, 'USD'),
        alipay: normalizeCurrency(paymentConfig?.alipay?.defaultCurrency, 'CNY'),
        wxpay: normalizeCurrency(paymentConfig?.wxpay?.defaultCurrency, 'CNY'),
        easypay: normalizeCurrency(process.env.EASYPAY_DEFAULT_CURRENCY, 'CNY'),
        noop: normalizeCurrency(process.env.NOOP_DEFAULT_CURRENCY || process.env.BILLING_CURRENCY, 'CNY'),
    };
}

export function resolveBillingCurrency(paymentProvider = '') {
    const providerName = String(paymentProvider || '')
        .trim()
        .toLowerCase();
    const providerCurrencyMap = getProviderCurrencyMap();
    if (providerName && providerCurrencyMap[providerName]) {
        return providerCurrencyMap[providerName];
    }
    return normalizeCurrency(
        process.env.BILLING_DEFAULT_DISPLAY_CURRENCY || process.env.BILLING_CURRENCY,
        'USD'
    );
}

export function getBillingRuntimeConfig(options = {}) {
    const currency = options?.currency
        ? normalizeCurrency(options.currency, 'CNY')
        : resolveBillingCurrency(options?.paymentProvider);
    const fallbackFreeQuota = resolveTierRule(BILLING_TIERS.FREE).dailyQuota;
    const freeDailyQuota = Number(process.env.BILLING_FREE_DAILY_QUOTA || fallbackFreeQuota);
    const allowCreditFallback = String(process.env.BILLING_ALLOW_CREDIT_FALLBACK || 'true').toLowerCase() !== 'false';
    const topupCreditsPerUnit = resolveTopupCreditsPerUnit(currency);

    return {
        currency,
        freeDailyQuota: Number.isFinite(freeDailyQuota) ? freeDailyQuota : fallbackFreeQuota,
        topupCreditsPerUnit,
        topupCreditsPerCny: topupCreditsPerUnit,
        allowCreditFallback,
    };
}

export function getBillingCatalog(options = {}) {
    const runtime = getBillingRuntimeConfig(options);
    const currency = runtime.currency;
    const topupPresetAmounts = parseTopupPresetAmounts(currency);

    return {
        currency,
        topupCreditsPerUnit: runtime.topupCreditsPerUnit,
        topupCreditsPerCny: runtime.topupCreditsPerUnit,
        displayExchangeRates: {
            usdToCnyRate: resolveUsdToCnyRate(),
        },
        freeTier: {
            tier: BILLING_TIERS.FREE,
            dailyQuota: runtime.freeDailyQuota,
            allowCreditFallback: runtime.allowCreditFallback,
        },
        topupPresets: topupPresetAmounts.map((amount) => {
            const amountCents = Math.round(amount * 100);
            return {
                productCode: 'membership_topup',
                amount,
                amountCents,
                currency,
                credits: computeTopupCredits(amountCents, runtime.topupCreditsPerUnit),
            };
        }),
        subscriptionPlans: Object.entries(SUBSCRIPTION_PRODUCTS).map(([productCode, product]) => {
            const tierRule = resolveTierRule(product.tier);
            const amount = resolveSubscriptionPrice(productCode, currency);
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
