import { BILLING_TIERS, resolveSubscriptionProduct, resolveTierRule } from './plans.js';

export function todayDateString(now = new Date()) {
    return new Date(now).toISOString().slice(0, 10);
}

export function normalizeBillingProfile(profile = {}) {
    return {
        userId: String(profile.userId || profile.user_id || '').trim(),
        tier: String(profile.tier || BILLING_TIERS.FREE).trim().toLowerCase(),
        status: String(profile.status || 'active').trim().toLowerCase(),
        subscriptionExpiresAt: profile.subscriptionExpiresAt || profile.subscription_expires_at || null,
        dailyQuota: Number(profile.dailyQuota ?? profile.daily_quota ?? resolveTierRule(profile.tier).dailyQuota),
        dailyQuotaUsed: Number(profile.dailyQuotaUsed ?? profile.daily_quota_used ?? 0),
        quotaResetAt: String(profile.quotaResetAt || profile.quota_reset_at || todayDateString()),
        bonusCredits: Number(profile.bonusCredits ?? profile.bonus_credits ?? 0),
        aiRequestsTotal: Number(profile.aiRequestsTotal ?? profile.ai_requests_total ?? 0),
        lastConsumedAt: profile.lastConsumedAt || profile.last_consumed_at || null,
    };
}

export function isSubscriptionActive(profile, now = new Date()) {
    const p = normalizeBillingProfile(profile);
    if (p.status !== 'active') return false;
    if (!p.subscriptionExpiresAt) return p.tier !== BILLING_TIERS.FREE;
    return new Date(p.subscriptionExpiresAt).getTime() > new Date(now).getTime();
}

function getEffectiveDailyQuota(profile, now = new Date()) {
    const p = normalizeBillingProfile(profile);
    if (isSubscriptionActive(p, now)) {
        return resolveTierRule(p.tier).dailyQuota;
    }
    const freePlanQuota = resolveTierRule(BILLING_TIERS.FREE).dailyQuota;
    if (p.tier === BILLING_TIERS.FREE) {
        const configuredFreeQuota = Number(p.dailyQuota);
        return Number.isFinite(configuredFreeQuota) ? configuredFreeQuota : freePlanQuota;
    }
    return freePlanQuota;
}

function resetQuotaIfNeeded(profile, now = new Date()) {
    const p = normalizeBillingProfile(profile);
    const today = todayDateString(now);
    if (p.quotaResetAt !== today) {
        return {
            ...p,
            dailyQuotaUsed: 0,
            quotaResetAt: today,
        };
    }
    return p;
}

export function computeUsageDecision(profile, input = {}) {
    const units = Math.max(1, Number(input.units || 1));
    const now = input.now || new Date();
    const allowCreditFallback = input.allowCreditFallback !== false;

    const base = resetQuotaIfNeeded(profile, now);
    const effectiveDailyQuota = getEffectiveDailyQuota(base, now);
    const unlimited = effectiveDailyQuota < 0;
    const quotaRemaining = unlimited ? Number.POSITIVE_INFINITY : effectiveDailyQuota - base.dailyQuotaUsed;

    if (quotaRemaining >= units) {
        return {
            allowed: true,
            chargeType: 'quota',
            reason: '',
            effectiveDailyQuota,
            nextProfile: {
                ...base,
                tier: isSubscriptionActive(base, now) ? base.tier : BILLING_TIERS.FREE,
                dailyQuota: effectiveDailyQuota,
                dailyQuotaUsed: unlimited ? base.dailyQuotaUsed : base.dailyQuotaUsed + units,
                aiRequestsTotal: base.aiRequestsTotal + units,
                lastConsumedAt: new Date(now).toISOString(),
            },
        };
    }

    if (allowCreditFallback && base.bonusCredits >= units) {
        return {
            allowed: true,
            chargeType: 'credits',
            reason: '',
            effectiveDailyQuota,
            nextProfile: {
                ...base,
                tier: isSubscriptionActive(base, now) ? base.tier : BILLING_TIERS.FREE,
                dailyQuota: effectiveDailyQuota,
                bonusCredits: base.bonusCredits - units,
                aiRequestsTotal: base.aiRequestsTotal + units,
                lastConsumedAt: new Date(now).toISOString(),
            },
        };
    }

    return {
        allowed: false,
        chargeType: 'none',
        reason: 'INSUFFICIENT_QUOTA',
        effectiveDailyQuota,
        nextProfile: base,
    };
}

export function computeSubscriptionGrant(profile, productCode, now = new Date()) {
    const product = resolveSubscriptionProduct(productCode);
    if (!product) return null;

    const base = normalizeBillingProfile(profile);
    const currentExpiry = base.subscriptionExpiresAt ? new Date(base.subscriptionExpiresAt) : null;
    const nowTime = new Date(now);
    const start = currentExpiry && currentExpiry.getTime() > nowTime.getTime() ? currentExpiry : nowTime;
    const expiresAt = new Date(start.getTime() + product.durationDays * 24 * 60 * 60 * 1000).toISOString();
    const tierRule = resolveTierRule(product.tier);

    return {
        ...base,
        tier: product.tier,
        status: 'active',
        subscriptionExpiresAt: expiresAt,
        dailyQuota: tierRule.dailyQuota,
    };
}

export function computeTopupCredits(amountCents, creditsPerCny = 100) {
    const cents = Math.max(0, Number(amountCents || 0));
    const factor = Math.max(1, Number(creditsPerCny || 100));
    return Math.max(0, Math.floor((cents / 100) * factor));
}
