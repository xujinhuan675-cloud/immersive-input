import { getCurrentUser, requireAccessToken } from './auth';
import { requestSub2Api } from './sub2api';

function resolveUserId(userId) {
    const uid = String(userId || '').trim();
    if (uid) return uid;
    const { user } = getCurrentUser();
    if (!user?.id) throw new Error('Not logged in');
    return String(user.id).trim();
}

function pickFirst(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toFeatureArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
}

function getPlanAmount(plan) {
    return toNumber(pickFirst(plan?.price, plan?.amount), Number.POSITIVE_INFINITY);
}

function unwrapItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function buildAdminAuthHeaders(adminToken) {
    const token = String(adminToken || '').trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function resolveAdminToken(options = {}) {
    return typeof options === 'string' ? options : String(options?.adminToken || '').trim();
}

function inferPlanTier(plan, index) {
    const raw = String(plan?.tier || plan?.name || plan?.product_name || '').trim().toLowerCase();
    if (raw.includes('free')) return 'free';
    if (raw.includes('pro') || raw.includes('plus') || raw.includes('premium')) return 'pro';
    if (raw.includes('enterprise') || raw.includes('team')) return 'enterprise';
    if (raw.includes('basic') || raw.includes('standard')) return 'basic';
    if (index === 1) return 'pro';
    if (index >= 2) return 'enterprise';
    return 'basic';
}

function inferProfileTier(groupName) {
    const raw = String(groupName || '').trim().toLowerCase();
    if (!raw) return 'free';
    if (raw.includes('pro') || raw.includes('plus') || raw.includes('premium')) return 'pro';
    if (raw.includes('enterprise') || raw.includes('team')) return 'enterprise';
    if (raw.includes('basic') || raw.includes('standard')) return 'basic';
    return 'basic';
}

function inferBillingCycle(plan) {
    const unit = String(plan?.validity_unit || '').trim().toLowerCase();
    const days = toNumber(plan?.validity_days, 0);
    if (unit.includes('year') || days >= 365) return 'year';
    return 'month';
}

function normalizePlan(plan, index, currency = 'CNY') {
    const tier = inferPlanTier(plan, index);
    const durationDays = toNumber(plan?.validity_days, 0);
    const dailyQuota = pickFirst(plan?.daily_limit_usd, plan?.group?.daily_limit_usd, plan?.dailyQuota);

    return {
        ...plan,
        planId: plan?.id,
        productCode: String(plan?.productCode || `sub2api_plan_${plan?.id ?? index}`).trim(),
        tier,
        planName: plan?.name || plan?.product_name || `Plan ${plan?.id ?? index + 1}`,
        billingCycle: inferBillingCycle(plan),
        durationDays: durationDays || null,
        amount: toNumber(pickFirst(plan?.price, plan?.amount), 0),
        currency,
        dailyQuota: dailyQuota === null ? -1 : toNumber(dailyQuota, -1),
        allowCreditFallback: false,
        features: toFeatureArray(plan?.features),
    };
}

function makeTopupPresets(currency, multiplier = 1, minAmount = 0) {
    const defaults = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    return defaults
        .filter((amount) => amount >= Number(minAmount || 0))
        .map((amount) => ({
            productCode: `balance_topup_${amount}`,
            amount,
            currency,
            balance: amount * multiplier,
        }));
}

function getBestActiveSubscription(subscriptions = []) {
    const active = subscriptions.filter(
        (item) => String(item?.status || '').trim().toLowerCase() === 'active'
    );
    return (
        active.sort((left, right) => {
            const leftTime = left?.expires_at ? new Date(left.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
            const rightTime = right?.expires_at ? new Date(right.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
            return rightTime - leftTime;
        })[0] || null
    );
}

function secondsToFutureIso(seconds) {
    const numeric = Number(seconds);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return new Date(Date.now() + numeric * 1000).toISOString();
}

function normalizeProfile({ user, affiliate, activeSubscriptions, progress, summary }) {
    const subscriptions = toArray(activeSubscriptions);
    const activeSubscription = getBestActiveSubscription(subscriptions);
    const progressItem = toArray(progress).find(
        (item) => Number(item?.subscription_id) === Number(activeSubscription?.id)
    ) || toArray(progress)[0] || null;
    const summaryItem = toArray(summary?.subscriptions).find(
        (item) => Number(item?.id) === Number(activeSubscription?.id)
    ) || toArray(summary?.subscriptions)[0] || null;
    const group = activeSubscription?.group || {};
    const dailyLimit = activeSubscription
        ? pickFirst(progressItem?.daily?.limit, group?.daily_limit_usd, activeSubscription?.daily_limit_usd, null)
        : 0;
    const groupName = group?.name || summaryItem?.group_name || '';

    return {
        tier: activeSubscription ? inferProfileTier(groupName) : 'free',
        tierName: groupName,
        status: user?.status === 'disabled' ? 'suspended' : 'active',
        dailyQuota: dailyLimit === null ? -1 : toNumber(dailyLimit, -1),
        dailyQuotaUsed: toNumber(
            pickFirst(progressItem?.daily?.used, activeSubscription?.daily_usage_usd),
            0
        ),
        quotaResetAt: secondsToFutureIso(progressItem?.daily?.reset_in_seconds),
        subscriptionExpiresAt:
            activeSubscription?.expires_at || progressItem?.expires_at || summaryItem?.expires_at || null,
        bonusCredits: toNumber(user?.balance, 0),
        balance: toNumber(user?.balance, 0),
        inviteCode: affiliate?.aff_code || '',
        inviteStats: {
            invitedCount: toNumber(affiliate?.aff_count, 0),
            pendingCount: toNumber(affiliate?.aff_frozen_quota, 0),
            rewardedCredits: toNumber(affiliate?.aff_history_quota, 0),
            availableRebate: toNumber(affiliate?.aff_quota, 0),
            rebateRatePercent: toNumber(affiliate?.effective_rebate_rate_percent, 0),
        },
        raw: {
            user,
            affiliate,
            activeSubscriptions,
            progress,
            summary,
        },
    };
}

export async function getBillingProfile(userId, options = {}) {
    const adminToken = resolveAdminToken(options);
    const token = adminToken || (await requireAccessToken());
    const targetUserId = resolveUserId(userId);
    const isAdminLookup = Boolean(adminToken);

    if (isAdminLookup) {
        const [user, subscriptions] = await Promise.all([
            requestSub2Api(`/admin/users/${targetUserId}`, {
                headers: buildAdminAuthHeaders(adminToken),
            }),
            requestSub2Api(`/admin/users/${targetUserId}/subscriptions`, {
                headers: buildAdminAuthHeaders(adminToken),
            }).catch(() => []),
        ]);

        return {
            profile: normalizeProfile({
                user,
                affiliate: null,
                activeSubscriptions: unwrapItems(subscriptions),
                progress: [],
                summary: null,
            }),
        };
    }

    const [user, affiliate, activeSubscriptions, progress, summary] = await Promise.all([
        requestSub2Api('/user/profile', { token }),
        requestSub2Api('/user/aff', { token }).catch(() => null),
        requestSub2Api('/subscriptions/active', { token }).catch(() => []),
        requestSub2Api('/subscriptions/progress', { token }).catch(() => []),
        requestSub2Api('/subscriptions/summary', { token }).catch(() => null),
    ]);

    return {
        profile: normalizeProfile({
            user,
            affiliate,
            activeSubscriptions,
            progress,
            summary,
        }),
    };
}

export async function getBillingCatalog() {
    const token = await requireAccessToken();
    const checkoutInfo = await requestSub2Api('/payment/checkout-info', { token });
    const currency = 'CNY';
    const multiplier = toNumber(checkoutInfo?.balance_recharge_multiplier, 1) || 1;
    const plans = toArray(checkoutInfo?.plans)
        .filter((plan) => plan?.for_sale !== false)
        .sort((left, right) => getPlanAmount(left) - getPlanAmount(right))
        .map((plan, index) => normalizePlan(plan, index, currency));

    return {
        catalog: {
            currency,
            subscriptionPlans: plans,
            topupPresets: makeTopupPresets(currency, multiplier, checkoutInfo?.global_min),
            topupBalanceMultiplier: multiplier,
            balanceDisabled: Boolean(checkoutInfo?.balance_disabled),
            rechargeFeeRate: toNumber(checkoutInfo?.recharge_fee_rate, 0),
            globalMin: toNumber(checkoutInfo?.global_min, 0),
            globalMax: toNumber(checkoutInfo?.global_max, 0),
            paymentMethods: checkoutInfo?.methods || {},
            freeTier: {
                dailyQuota: 0,
                allowCreditFallback: false,
            },
            raw: checkoutInfo,
        },
    };
}

export async function consumeBillingUnits() {
    return {
        skipped: true,
        reason: 'AI usage billing is handled by Sub2API gateway.',
    };
}

export async function updateAdminMembership() {
    throw new Error('Membership management is handled in the Sub2API admin console.');
}

export async function updateAdminMembershipTier() {
    throw new Error('Membership tier management is handled in the Sub2API admin console.');
}
