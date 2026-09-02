import { getCurrentUser, requireAccessToken } from './auth';
import { requestSub2Api } from './sub2api';
import {
    getInputFreeTargetIds,
    getConfiguredBalanceGroupId,
    isInputFreeGatewayForced,
    resolveBalanceGroupId,
    resolveInputFreeGroupId,
} from './inputSubscriptionPolicy';

const AUTO_KEY_NAME = 'Immersive Input Gateway';
const CACHE_STORAGE_KEY = 'sub2api_gateway_user_api_key';
const CACHE_TTL_MS = 60 * 1000;

let memoryCache = null;
const memoryGroupCaches = new Map();
const pendingKeyPromises = new Map();

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

function cacheStorageKey(groupId = null) {
    const normalizedGroupId = normalizeId(groupId);
    return normalizedGroupId ? `${CACHE_STORAGE_KEY}:group:${normalizedGroupId}` : CACHE_STORAGE_KEY;
}

function readCachedKey(groupId = null) {
    const normalizedGroupId = normalizeId(groupId);
    if (normalizedGroupId && memoryGroupCaches.has(normalizedGroupId)) {
        return memoryGroupCaches.get(normalizedGroupId);
    }
    if (!normalizedGroupId && memoryCache) return memoryCache;
    try {
        const parsed = JSON.parse(localStorage.getItem(cacheStorageKey(normalizedGroupId)) || 'null');
        if (parsed && typeof parsed === 'object') {
            if (normalizedGroupId) memoryGroupCaches.set(normalizedGroupId, parsed);
            else memoryCache = parsed;
            return parsed;
        }
    } catch {}
    return null;
}

function writeCachedKey(entry, groupId = null) {
    const normalizedGroupId = normalizeId(groupId);
    if (normalizedGroupId) memoryGroupCaches.set(normalizedGroupId, entry);
    else memoryCache = entry;
    try {
        localStorage.setItem(cacheStorageKey(normalizedGroupId), JSON.stringify(entry));
    } catch {}
}

export function clearSub2ApiGatewayKeyCache() {
    memoryCache = null;
    memoryGroupCaches.clear();
    pendingKeyPromises.clear();
    try {
        localStorage.removeItem(CACHE_STORAGE_KEY);
        const keysToRemove = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(`${CACHE_STORAGE_KEY}:group:`)) keysToRemove.push(key);
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {}
}

function isFreshCache(entry, userId, requestedGroupId = null) {
    const { planId, groupId } = getInputFreeTargetIds();
    const normalizedRequestedGroupId = normalizeId(requestedGroupId);
    const matchesForcedTarget =
        Boolean(normalizedRequestedGroupId) ||
        !isInputFreeGatewayForced() ||
        (entry?.targetPlanId === planId && (!groupId || entry?.groupId === groupId));

    return (
        entry &&
        entry.userId === userId &&
        (!normalizedRequestedGroupId || entry.groupId === normalizedRequestedGroupId) &&
        String(entry.key || '').trim() &&
        Number(entry.expiresAt || 0) > now() &&
        matchesForcedTarget
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

function inferTierRank(value) {
    const text = String(value || '')
        .trim()
        .toLowerCase();
    if (!text) return 0;
    if (text.includes('enterprise') || text.includes('team') || text.includes('企业') || text.includes('团队'))
        return 400;
    if (
        text.includes('pro') ||
        text.includes('plus') ||
        text.includes('premium') ||
        text.includes('professional') ||
        text.includes('专业') ||
        text.includes('高级')
    )
        return 300;
    if (text.includes('basic') || text.includes('standard') || text.includes('基础') || text.includes('标准'))
        return 200;
    if (text.includes('free') || text.includes('trial') || text.includes('免费') || text.includes('试用')) return 100;
    return 0;
}

function subscriptionTierRank(subscription, group, plan) {
    return Math.max(
        inferTierRank(subscription?.tier),
        inferTierRank(subscription?.plan?.tier),
        inferTierRank(subscription?.plan?.name),
        inferTierRank(plan?.tier),
        inferTierRank(plan?.name),
        inferTierRank(group?.name),
        inferTierRank(subscription?.group?.name)
    );
}

function choosePreferredGroupId(activeSubscriptions = [], availableGroups = [], availablePlans = []) {
    const groups = unwrapItems(availableGroups).filter((group) => getGroupId(group) && isGroupActive(group));
    const groupById = new Map(groups.map((group) => [getGroupId(group), group]));
    const subscriptions = unwrapItems(activeSubscriptions);

    if (isInputFreeGatewayForced()) {
        const targetGroupId = resolveInputFreeGroupId({
            subscriptions,
            availablePlans: unwrapItems(availablePlans),
        });
        if (!targetGroupId) return null;

        const targetIsKnown =
            groupById.has(targetGroupId) ||
            subscriptions.some((subscription) => getSubscriptionGroupId(subscription) === targetGroupId) ||
            unwrapItems(availablePlans).some((plan) => getPlanGroupId(plan) === targetGroupId);
        return targetIsKnown ? targetGroupId : null;
    }

    const defaultPlanIds = getConfiguredDefaultAiPlanIds();
    const subscriptionGroupIds = subscriptions.map(getSubscriptionGroupId).filter(Boolean);
    const defaultGroupIds = Array.from(
        new Set([
            ...getConfiguredDefaultAiGroupIds(),
            ...resolveDefaultGroupIds(defaultPlanIds, availablePlans, subscriptions),
        ])
    );

    const planByGroupId = new Map(
        unwrapItems(availablePlans)
            .map((plan) => [getPlanGroupId(plan), plan])
            .filter(([id]) => Boolean(id))
    );
    const paidSubscribedOpenAiGroupId = subscriptions
        .filter((subscription) => {
            const groupId = getSubscriptionGroupId(subscription);
            const planId = getSubscriptionPlanId(subscription);
            const group = groupById.get(groupId) || getSubscriptionGroup(subscription);
            return (
                groupId &&
                isOpenAiLikeGroup(group) &&
                !isConfiguredDefaultAiGroupId(groupId, defaultGroupIds) &&
                !isConfiguredDefaultAiPlanId(planId, defaultPlanIds)
            );
        })
        .sort((left, right) => {
            const leftGroupId = getSubscriptionGroupId(left);
            const rightGroupId = getSubscriptionGroupId(right);
            const leftGroup = groupById.get(leftGroupId) || getSubscriptionGroup(left);
            const rightGroup = groupById.get(rightGroupId) || getSubscriptionGroup(right);
            const leftPlan = planByGroupId.get(leftGroupId);
            const rightPlan = planByGroupId.get(rightGroupId);
            return (
                subscriptionTierRank(right, rightGroup, rightPlan) - subscriptionTierRank(left, leftGroup, leftPlan) ||
                new Date(right?.expires_at || 0).getTime() - new Date(left?.expires_at || 0).getTime() ||
                new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
            );
        })[0];
    if (paidSubscribedOpenAiGroupId) return getSubscriptionGroupId(paidSubscribedOpenAiGroupId);

    const hasOpenAiSubscription = subscriptions.some((subscription) => {
        const groupId = getSubscriptionGroupId(subscription);
        const group = groupById.get(groupId) || getSubscriptionGroup(subscription);
        return groupId && isOpenAiLikeGroup(group);
    });
    if (!hasOpenAiSubscription) {
        const balanceGroupId = resolveBalanceGroupId({ availableGroups: groups });
        if (getConfiguredBalanceGroupId()) return balanceGroupId;
    }

    const allowedDefaultGroupId =
        defaultGroupIds.find((groupId) => subscriptionGroupIds.includes(groupId) || groupById.has(groupId)) ||
        defaultGroupIds[0];
    if (allowedDefaultGroupId) return allowedDefaultGroupId;

    const subscribedOpenAiGroupId = subscriptions
        .filter((subscription) => {
            const groupId = getSubscriptionGroupId(subscription);
            const group = groupById.get(groupId) || getSubscriptionGroup(subscription);
            return groupId && isOpenAiLikeGroup(group);
        })
        .sort((left, right) => {
            const leftGroupId = getSubscriptionGroupId(left);
            const rightGroupId = getSubscriptionGroupId(right);
            const leftGroup = groupById.get(leftGroupId) || getSubscriptionGroup(left);
            const rightGroup = groupById.get(rightGroupId) || getSubscriptionGroup(right);
            const leftPlan = planByGroupId.get(leftGroupId);
            const rightPlan = planByGroupId.get(rightGroupId);
            return (
                subscriptionTierRank(right, rightGroup, rightPlan) - subscriptionTierRank(left, leftGroup, leftPlan) ||
                new Date(right?.expires_at || 0).getTime() - new Date(left?.expires_at || 0).getTime()
            );
        })[0];
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
        targetPlanId: getInputFreeTargetIds().planId,
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

export async function getSub2ApiGatewayKey({ forceRefresh = false, groupId = null, cacheAsPreferred = false } = {}) {
    const userId = getUserId();
    if (!userId) {
        throw new Error('Please sign in to use FlowGuide AI.');
    }

    const requestedGroupId = normalizeId(groupId);
    if (!forceRefresh) {
        const cached = readCachedKey(requestedGroupId);
        if (isFreshCache(cached, userId, requestedGroupId)) {
            return cached.key;
        }
    }

    const pendingKey = requestedGroupId || 'preferred';
    if (!pendingKeyPromises.has(pendingKey) || forceRefresh) {
        const pendingPromise = (async () => {
            const token = await requireAccessToken();
            const resolvedUserId = getUserId();
            if (!resolvedUserId) {
                throw new Error('Please sign in to use FlowGuide AI.');
            }

            const { keys, subscriptions, groups, plans } = await requestUserKeyData(token);
            const preferredGroupId = requestedGroupId || choosePreferredGroupId(subscriptions, groups, plans);
            if (!preferredGroupId) {
                if (isInputFreeGatewayForced()) {
                    throw new Error('Configured Input free subscription group is unavailable.');
                }
                throw new Error('No usable FlowGuide AI gateway group is available.');
            }
            if (
                requestedGroupId &&
                !resolveBalanceGroupId({ availableGroups: groups }) &&
                requestedGroupId === getConfiguredBalanceGroupId()
            ) {
                throw new Error('Configured FlowGuide balance gateway group is unavailable.');
            }
            const reusableKey = findReusableKey(keys, preferredGroupId);
            const key = reusableKey || (await createUserGatewayKey(token, preferredGroupId));
            if (isInputFreeGatewayForced() && !requestedGroupId && getKeyGroupId(key) !== preferredGroupId) {
                throw new Error('Input free gateway key was not bound to the configured group.');
            }
            const entry = cacheEntryFromKey(resolvedUserId, key);
            if (!entry) {
                throw new Error('Sub2API did not return a usable API key.');
            }
            writeCachedKey(entry, requestedGroupId);
            if (cacheAsPreferred && requestedGroupId) {
                writeCachedKey(entry);
            }
            return entry.key;
        })();
        const trackedPromise = pendingPromise.finally(() => {
            if (pendingKeyPromises.get(pendingKey) === trackedPromise) {
                pendingKeyPromises.delete(pendingKey);
            }
        });
        pendingKeyPromises.set(pendingKey, trackedPromise);
    }

    return pendingKeyPromises.get(pendingKey);
}
