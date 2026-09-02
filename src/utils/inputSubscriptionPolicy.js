const DEFAULT_INPUT_FREE_PLAN_ID = 4;
const DEFAULT_INPUT_FREE_GROUP_ID = 9;

function getEnvValue(key) {
    const viteEnv = import.meta.env || {};
    if (viteEnv[key] !== undefined) return viteEnv[key];
    if (typeof process !== 'undefined' && process.env) return process.env[key];
    return undefined;
}

function normalizeId(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
}

function getConfiguredId(keys = []) {
    for (const key of keys) {
        const values = String(getEnvValue(key) || '').split(/[\s,]+/);
        for (const value of values) {
            const id = normalizeId(value);
            if (id) return id;
        }
    }
    return null;
}

export function isInputFreeGatewayForced() {
    const value = String(getEnvValue('VITE_INPUT_FORCE_FREE_GATEWAY') || '')
        .trim()
        .toLowerCase();
    if (!value) return false;
    return !['0', 'false', 'no', 'off'].includes(value);
}

export function getInputFreeTargetIds() {
    return {
        planId: getConfiguredId(['VITE_INPUT_FREE_PLAN_ID']) || DEFAULT_INPUT_FREE_PLAN_ID,
        groupId: getConfiguredId(['VITE_INPUT_FREE_GROUP_ID']) || DEFAULT_INPUT_FREE_GROUP_ID,
    };
}

export function getConfiguredBalanceGroupId() {
    return getConfiguredId([
        'VITE_SUB2API_BALANCE_GROUP_ID',
        'VITE_FLOWGUIDE_BALANCE_GROUP_ID',
        'VITE_INPUT_BALANCE_GROUP_ID',
    ]);
}

export function resolveBalanceGroupId({ availableGroups = [] } = {}) {
    const configuredId = getConfiguredBalanceGroupId();
    if (!configuredId) return null;

    const group = (Array.isArray(availableGroups) ? availableGroups : []).find(
        (item) => normalizeId(item?.id ?? item?.group_id ?? item?.groupId) === configuredId
    );
    if (!group) return null;

    const status = String(group?.status || 'active')
        .trim()
        .toLowerCase();
    const subscriptionType = String(group?.subscription_type || group?.subscriptionType || 'standard')
        .trim()
        .toLowerCase();
    return status === 'active' && subscriptionType !== 'subscription' ? configuredId : null;
}

function getSubscriptionPlanId(subscription) {
    return normalizeId(
        subscription?.plan_id ?? subscription?.planId ?? subscription?.plan?.id ?? subscription?.payment_order?.plan_id
    );
}

function getSubscriptionGroupId(subscription) {
    return normalizeId(subscription?.group_id ?? subscription?.groupId ?? subscription?.group?.id);
}

function getPlanId(plan) {
    return normalizeId(plan?.id ?? plan?.plan_id ?? plan?.planId);
}

function getPlanGroupId(plan) {
    return normalizeId(plan?.group_id ?? plan?.groupId ?? plan?.group?.id);
}

export function resolveInputFreeGroupId({ subscriptions = [], availablePlans = [] } = {}) {
    const { planId, groupId } = getInputFreeTargetIds();
    if (groupId) return groupId;
    if (!planId) return null;

    const subscription = (Array.isArray(subscriptions) ? subscriptions : []).find(
        (item) => getSubscriptionPlanId(item) === planId
    );
    if (subscription) {
        return getSubscriptionGroupId(subscription) || getPlanGroupId(subscription.plan);
    }

    const plan = (Array.isArray(availablePlans) ? availablePlans : []).find((item) => getPlanId(item) === planId);
    return getPlanGroupId(plan);
}
