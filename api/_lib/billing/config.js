import { BILLING_TIERS, resolveTierRule } from './plans.js';

export function getBillingRuntimeConfig() {
    const fallbackFreeQuota = resolveTierRule(BILLING_TIERS.FREE).dailyQuota;
    const freeDailyQuota = Number(process.env.BILLING_FREE_DAILY_QUOTA || fallbackFreeQuota);
    const topupCreditsPerCny = Number(process.env.BILLING_TOPUP_CREDITS_PER_CNY || 100);
    const allowCreditFallback =
        String(process.env.BILLING_ALLOW_CREDIT_FALLBACK || 'true').toLowerCase() !== 'false';

    return {
        freeDailyQuota: Number.isFinite(freeDailyQuota) ? freeDailyQuota : fallbackFreeQuota,
        topupCreditsPerCny: Number.isFinite(topupCreditsPerCny) ? topupCreditsPerCny : 100,
        allowCreditFallback,
    };
}
