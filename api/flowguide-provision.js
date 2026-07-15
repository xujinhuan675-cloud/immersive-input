import { createHttpError, getErrorStatus, getHeader, sendJson, setCors } from '../server/lib/http.js';

const DEFAULT_FLOWGUIDE_BASE = 'https://ai.flowguide.cc';
const INPUT_FREE_PLAN_ID = 4;
const INPUT_FREE_GROUP_ID = 9;
const INPUT_FREE_GROUP_NAME = 'Input-\u514d\u8d39\u8ba2\u9605';
const INPUT_FREE_VALIDITY_DAYS = 3650;

function trim(value) {
    return String(value || '').trim();
}

function getEnvValue(...keys) {
    for (const key of keys) {
        const value = trim(process.env[key]);
        if (value) return value;
    }
    return '';
}

function normalizeBaseUrl(value) {
    return (trim(value) || DEFAULT_FLOWGUIDE_BASE).replace(/\/+$/, '');
}

function getFlowGuideApiBase() {
    const base = normalizeBaseUrl(
        getEnvValue('FLOWGUIDE_API_BASE', 'VITE_FLOWGUIDE_API_BASE')
    );
    if (/\/api\/v1$/i.test(base)) return base;
    if (/\/api$/i.test(base)) return `${base}/v1`;
    return `${base}/api/v1`;
}

function getAdminToken() {
    return getEnvValue(
        'FLOWGUIDE_ADMIN_TOKEN',
        'FLOWGUIDE_ADMIN_API_KEY',
        'FLOWGUIDE_ADMIN_API_TOKEN',
        'SUB2API_ADMIN_TOKEN'
    );
}

function getBearerToken(req) {
    const authorization = getHeader(req?.headers, 'authorization');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return trim(match?.[1]);
}

function unwrapPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (Object.prototype.hasOwnProperty.call(payload, 'code')) {
        const code = Number(payload.code);
        if (Number.isFinite(code) && code !== 0) {
            throw createHttpError(502, payload.message || `FlowGuide request failed (${payload.code})`);
        }
        return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    }
    return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

async function parseResponsePayload(response) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
        return response.json().catch(() => null);
    }

    const text = await response.text().catch(() => '');
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

async function requestFlowGuide(path, { method = 'GET', token, apiKey, body, query } = {}) {
    const url = new URL(`${getFlowGuideApiBase()}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, String(value));
            }
        }
    }

    const headers = {
        accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (apiKey) headers['x-api-key'] = apiKey;
    if (token) {
        headers.Authorization = /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await parseResponsePayload(response);

    if (!response.ok) {
        throw createHttpError(response.status, payload?.message || payload?.detail || `FlowGuide request failed (${response.status})`);
    }

    return unwrapPayload(payload);
}

function unwrapItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function pickUserId(profile) {
    const user = profile?.user || profile?.account || profile?.profile || profile;
    const value = user?.id || user?.user_id || user?.userId;
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric) && numeric > 0) return numeric;
    return trim(value);
}

function getSubscriptionGroupId(subscription) {
    return Number(subscription?.group_id || subscription?.groupId || subscription?.group?.id || 0);
}

function hasActiveSubscription(subscriptions, groupId) {
    return unwrapItems(subscriptions).some((subscription) => {
        const status = trim(subscription?.status).toLowerCase();
        return getSubscriptionGroupId(subscription) === Number(groupId) && (!status || status === 'active');
    });
}

function getInputFreeSubscriptionTarget() {
    return {
        groupId: INPUT_FREE_GROUP_ID,
        planId: INPUT_FREE_PLAN_ID,
        groupName: INPUT_FREE_GROUP_NAME,
        validityDays: INPUT_FREE_VALIDITY_DAYS,
        source: 'input_free',
    };
}

async function provisionInputFreeSubscription(userToken) {
    const adminToken = getAdminToken();
    if (!adminToken) {
        throw createHttpError(500, 'Missing FLOWGUIDE_ADMIN_TOKEN');
    }

    const target = getInputFreeSubscriptionTarget();
    const profile = await requestFlowGuide('/user/profile', { token: userToken });
    const { groupId, validityDays } = target;
    const userId = pickUserId(profile);
    if (!userId) {
        throw createHttpError(502, 'FlowGuide user profile did not include a user id');
    }

    const activeSubscriptions = await requestFlowGuide('/subscriptions/active', { token: userToken }).catch(() => []);
    if (hasActiveSubscription(activeSubscriptions, groupId)) {
        return {
            ok: true,
            provisioned: false,
            reason: 'already_active',
            groupId,
            planId: target.planId,
            groupName: target.groupName,
            source: target.source,
        };
    }

    const assigned = await requestFlowGuide('/admin/subscriptions/assign', {
        method: 'POST',
        apiKey: adminToken,
        body: {
            user_id: userId,
            group_id: groupId,
            validity_days: validityDays,
        },
    });

    return {
        ok: true,
        provisioned: true,
        groupId,
        planId: target.planId,
        groupName: target.groupName,
        validityDays,
        source: target.source,
        subscription: assigned,
    };
}

export default async function handler(req, res) {
    const cors = setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const userToken = getBearerToken(req);
        if (!userToken) {
            throw createHttpError(401, 'Missing Authorization bearer token');
        }

        const result = await provisionInputFreeSubscription(userToken);
        return sendJson(res, 200, result);
    } catch (error) {
        return sendJson(res, getErrorStatus(error, 500), {
            ok: false,
            message: error?.message || 'Failed to provision subscription',
        });
    }
}
