import { getCurrentUser, requireAccessToken } from './auth';
import { requestSub2Api } from './sub2api';

const AUTO_KEY_NAME = 'Immersive Input Gateway';
const CACHE_STORAGE_KEY = 'sub2api_gateway_user_api_key';
const CACHE_TTL_MS = 60 * 1000;

let memoryCache = null;
let pendingKeyPromise = null;

function now() {
    return Date.now();
}

function normalizeId(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
}

function normalizeStatus(value) {
    return String(value || '').trim().toLowerCase();
}

function getEnvValue(key) {
    const viteEnv = import.meta.env || {};
    if (viteEnv[key] !== undefined) return viteEnv[key];
    if (typeof process !== 'undefined' && process.env) return process.env[key];
    return undefined;
}

function getConfiguredIds(keys = []) {
    const raw = keys
        .map((key) => getEnvValue(key))
        .filter((value) => value !== undefined && value !== null && value !== '')
        .join(',');

    const ids = raw
        .split(/[,\s]+/)
        .map(normalizeId)
        .filter(Boolean);

    return Array.from(new Set(ids));
}

function getConfiguredDefaultAiPlanIds() {
    return getConfiguredIds([
        'VITE_SUB2API_DEFAULT_AI_PLAN_ID',
        'VITE_FLOWGUIDE_DEFAULT_AI_PLAN_ID',
        'VITE_SUB2API_DEFAULT_AI_PLAN_IDS',
        'VITE_FLOWGUIDE_DEFAULT_AI_PLAN_IDS',
    ]);
}

function getConfiguredDefaultAiGroupIds() {
    return getConfiguredIds([
        'VITE_SUB2API_DEFAULT_AI_GROUP_ID',
        'VITE_FLOWGUIDE_DEFAULT_AI_GROUP_ID',
        'VITE_SUB2API_DEFAULT_AI_GROUP_IDS',
        'VITE_FLOWGUIDE_DEFAULT_AI_GROUP_IDS',
    ]);
}

function getUserId() {
    const { user } = getCurrentUser();
    return String(user?.id || user?.email || '').trim();
}

function readCachedKey() {
    if (memoryCache) return memoryCache;
    try {
        const parsed = JSON.parse(localStorage.getItem(CACHE_STORAGE_KEY) || 'null');
        if (parsed && typeof parsed === 'object') {
            memoryCache = parsed;
            return parsed;
        }
    } catch {}
    return null;
}

function writeCachedKey(entry) {
    memoryCache = entry;
    try {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entry));
    } catch {}
}

export function clearSub2ApiGatewayKeyCache() {
    memoryCache = null;
    pendingKeyPromise = null;
    try {
        localStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {}
}

function isFreshCache(entry, userId) {
    return (
        entry &&
        entry.userId === userId &&
        String(entry.key || '').trim() &&
        Number(entry.expiresAt || 0) > now()
    );
}

function unwrapItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.plans)) return payload.plans;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.keys)) return payload.keys;
    return [];
}

function isActiveKey(key) {
    const status = normalizeStatus(key?.status || 'active');
    return !status || status === 'active';
}

function isAutoKey(key) {
    return String(key?.name || '').trim() === AUTO_KEY_NAME;
}

function getKeyGroupId(key) {
    return normalizeId(key?.group_id ?? key?.groupId ?? key?.group?.id);
}

function getPlanId(plan) {
    return normalizeId(plan?.id ?? plan?.plan_id ?? plan?.planId);
}

function getPlanGroupId(plan) {
    return normalizeId(plan?.group_id ?? plan?.groupId ?? plan?.group?.id);
}

function getSubscriptionPlanId(subscription) {
    return normalizeId(subscription?.plan_id ?? subscription?.planId ?? subscription?.plan?.id ?? subscription?.payment_order?.plan_id);
}

function getSubscriptionGroupId(subscription) {
    return normalizeId(subscription?.group_id ?? subscription?.groupId ?? subscription?.group?.id);
}

function getGroupId(group) {
    return normalizeId(group?.id ?? group?.group_id ?? group?.groupId);
}

function getSubscriptionGroup(subscription) {
    return subscription?.group || subscription?.plan?.group || subscription?.payment_order?.group || null;
}

function isConfiguredDefaultAiPlanId(planId, defaultPlanIds = getConfiguredDefaultAiPlanIds()) {
    const normalizedPlanId = normalizeId(planId);
    return Boolean(normalizedPlanId && defaultPlanIds.includes(normalizedPlanId));
}

function isOpenAiLikeGroup(group) {
    const platform = String(group?.platform || group?.provider || '').trim().toLowerCase();
    return !platform || platform === 'openai' || platform === 'openai-compatible' || platform === 'compatible';
}

function isGroupActive(group) {
    const status = normalizeStatus(group?.status || 'active');
    return !status || status === 'active';
}

function isConfiguredDefaultAiGroupId(groupId, defaultGroupIds = getConfiguredDefaultAiGroupIds()) {
    const normalizedGroupId = normalizeId(groupId);
    return Boolean(normalizedGroupId && defaultGroupIds.includes(normalizedGroupId));
}

function resolveDefaultGroupIds(defaultPlanIds = [], availablePlans = [], subscriptions = []) {
    const plans = unwrapItems(availablePlans);
    const planById = new Map(plans.map((plan) => [getPlanId(plan), plan]).filter(([id]) => Boolean(id)));
    const subscriptionsByPlanId = new Map(
        unwrapItems(subscriptions)
            .map((subscription) => [getSubscriptionPlanId(subscription), subscription])
            .filter(([id]) => Boolean(id))
    );

    const resolvedGroupIds = defaultPlanIds
        .map((planId) => {
            const subscription = subscriptionsByPlanId.get(planId);
            return (
                getSubscriptionGroupId(subscription) ||
                getPlanGroupId(subscription?.plan) ||
                getPlanGroupId(planById.get(planId))
            );
        })
        .map(normalizeId)
        .filter(Boolean);

    return Array.from(new Set(resolvedGroupIds));
}

function choosePreferredGroupId(activeSubscriptions = [], availableGroups = [], availablePlans = []) {
    const groups = unwrapItems(availableGroups).filter((group) => getGroupId(group) && isGroupActive(group));
    const groupById = new Map(groups.map((group) => [getGroupId(group), group]));
    const subscriptions = unwrapItems(activeSubscriptions);
    const defaultPlanIds = getConfiguredDefaultAiPlanIds();
    const subscriptionGroupIds = subscriptions.map(getSubscriptionGroupId).filter(Boolean);
    const defaultGroupIds = Array.from(
        new Set([
            ...getConfiguredDefaultAiGroupIds(),
            ...resolveDefaultGroupIds(defaultPlanIds, availablePlans, subscriptions),
        ])
    );

    const paidSubscribedOpenAiGroupId = subscriptions.find((subscription) => {
        const groupId = getSubscriptionGroupId(subscription);
        const planId = getSubscriptionPlanId(subscription);
        const group = groupById.get(groupId) || getSubscriptionGroup(subscription);
        return (
            groupId &&
            isOpenAiLikeGroup(group) &&
            !isConfiguredDefaultAiGroupId(groupId, defaultGroupIds) &&
            !isConfiguredDefaultAiPlanId(planId, defaultPlanIds)
        );
    });
    if (paidSubscribedOpenAiGroupId) return getSubscriptionGroupId(paidSubscribedOpenAiGroupId);

    const allowedDefaultGroupId =
        defaultGroupIds.find((groupId) => subscriptionGroupIds.includes(groupId) || groupById.has(groupId)) ||
        defaultGroupIds[0];
    if (allowedDefaultGroupId) return allowedDefaultGroupId;

    const subscribedOpenAiGroupId = subscriptions.find((subscription) => {
        const groupId = getSubscriptionGroupId(subscription);
        const group = groupById.get(groupId) || getSubscriptionGroup(subscription);
        return groupId && isOpenAiLikeGroup(group);
    });
    if (subscribedOpenAiGroupId) return getSubscriptionGroupId(subscribedOpenAiGroupId);

    if (subscriptionGroupIds[0]) return subscriptionGroupIds[0];

    const openAiGroup = groups.find(isOpenAiLikeGroup);
    if (openAiGroup) return getGroupId(openAiGroup);

    return getGroupId(groups[0]);
}

function findReusableKey(keys = [], preferredGroupId = null) {
    const activeKeys = unwrapItems(keys).filter((key) => isActiveKey(key) && String(key?.key || '').trim());
    const groupMatches = (key) => {
        if (!preferredGroupId) return getKeyGroupId(key) === null;
        return getKeyGroupId(key) === preferredGroupId;
    };

    if (preferredGroupId) {
        return activeKeys.find((key) => isAutoKey(key) && groupMatches(key)) || activeKeys.find(groupMatches) || null;
    }

    return (
        activeKeys.find((key) => isAutoKey(key) && groupMatches(key)) ||
        activeKeys.find(groupMatches) ||
        activeKeys.find(isAutoKey) ||
        activeKeys[0] ||
        null
    );
}

function cacheEntryFromKey(userId, key) {
    const apiKey = String(key?.key || '').trim();
    if (!apiKey) return null;
    return {
        userId,
        key: apiKey,
        keyId: normalizeId(key?.id),
        groupId: getKeyGroupId(key),
        name: String(key?.name || AUTO_KEY_NAME),
        expiresAt: now() + CACHE_TTL_MS,
    };
}

async function requestUserKeyData(token) {
    const [keysResult, subscriptionsResult, groupsResult, checkoutInfoResult] = await Promise.all([
        requestSub2Api('/keys', {
            token,
            query: {
                page: 1,
                page_size: 100,
                status: 'active',
            },
        }),
        requestSub2Api('/subscriptions/active', { token }).catch(() => []),
        requestSub2Api('/groups/available', { token }).catch(() => []),
        requestSub2Api('/payment/checkout-info', { token }).catch(() => ({ plans: [] })),
    ]);

    return {
        keys: unwrapItems(keysResult),
        subscriptions: unwrapItems(subscriptionsResult),
        groups: unwrapItems(groupsResult),
        plans: unwrapItems(checkoutInfoResult),
    };
}

async function createUserGatewayKey(token, groupId) {
    const body = {
        name: AUTO_KEY_NAME,
    };
    if (groupId) {
        body.group_id = groupId;
    }
    return requestSub2Api('/keys', {
        method: 'POST',
        token,
        body,
    });
}

async function resolveSub2ApiGatewayKey() {
    const token = await requireAccessToken();
    const userId = getUserId();
    if (!userId) {
        throw new Error('Please sign in to use FlowGuide AI.');
    }

    const { keys, subscriptions, groups, plans } = await requestUserKeyData(token);
    const preferredGroupId = choosePreferredGroupId(subscriptions, groups, plans);
    const reusableKey = findReusableKey(keys, preferredGroupId);
    const key = reusableKey || (await createUserGatewayKey(token, preferredGroupId));
    const entry = cacheEntryFromKey(userId, key);
    if (!entry) {
        throw new Error('Sub2API did not return a usable API key.');
    }

    writeCachedKey(entry);
    return entry.key;
}

export async function getSub2ApiGatewayKey({ forceRefresh = false } = {}) {
    const userId = getUserId();
    if (!userId) {
        throw new Error('Please sign in to use FlowGuide AI.');
    }

    if (!forceRefresh) {
        const cached = readCachedKey();
        if (isFreshCache(cached, userId)) {
            return cached.key;
        }
    }

    if (!pendingKeyPromise || forceRefresh) {
        pendingKeyPromise = resolveSub2ApiGatewayKey().finally(() => {
            pendingKeyPromise = null;
        });
    }

    return pendingKeyPromise;
}
