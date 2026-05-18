import { refreshAccessToken } from './auth';
import { getFlowGuideApiBase, normalizeBaseUrl, parseFlowGuideErrorPayload } from './flowguide';

const DEFAULT_SUB2API_API_BASE = 'https://ai.flowguide.cc/api/v1';

function trimSlashes(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function getEnvValue(key) {
    const viteEnv = import.meta.env || {};
    if (viteEnv[key] !== undefined) return viteEnv[key];
    if (typeof process !== 'undefined' && process.env) return process.env[key];
    return undefined;
}

function normalizeApiBase(value) {
    const normalized = normalizeBaseUrl(value, '');
    if (!normalized) return '';

    if (/\/api\/v1$/i.test(normalized)) return normalized;
    if (/\/api$/i.test(normalized)) return `${normalized}/v1`;
    return `${normalized}/api/v1`;
}

export function getSub2ApiBase() {
    const explicit =
        String(getEnvValue('VITE_SUB2API_API_BASE') || '').trim() ||
        String(getEnvValue('VITE_FLOWGUIDE_REST_API_BASE') || '').trim();
    if (explicit) {
        return /\/api\/v1$/i.test(trimSlashes(explicit)) ? trimSlashes(explicit) : normalizeApiBase(explicit);
    }

    const flowGuideBase = getFlowGuideApiBase();
    return normalizeApiBase(flowGuideBase) || DEFAULT_SUB2API_API_BASE;
}

export function getSub2WebBase() {
    const explicit =
        String(getEnvValue('VITE_SUB2API_WEB_BASE') || '').trim() ||
        String(getEnvValue('VITE_FLOWGUIDE_WEB_BASE') || '').trim();
    if (explicit) return normalizeBaseUrl(explicit, 'https://ai.flowguide.cc');

    const apiBase = getSub2ApiBase()
        .replace(/\/api\/v1$/i, '')
        .replace(/\/api$/i, '');
    return normalizeBaseUrl(apiBase, 'https://ai.flowguide.cc');
}

function normalizePath(path) {
    const raw = String(path || '').trim();
    if (!raw) return '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
}

function normalizeSub2Path(path) {
    const normalized = normalizePath(path);
    if (normalized === '/api/v1') return '/';
    if (normalized.startsWith('/api/v1/')) return normalized.slice('/api/v1'.length) || '/';
    return normalized;
}

export function buildSub2ApiUrl(path, { query } = {}) {
    const base = getSub2ApiBase().replace(/\/+$/, '');
    const normalizedPath = normalizeSub2Path(path);
    const url = `${base}${normalizedPath}`;
    if (!query) return url;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    }
    const suffix = params.toString();
    return suffix ? `${url}?${suffix}` : url;
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

function unwrapSub2Payload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (!Object.prototype.hasOwnProperty.call(payload, 'code')) return payload;

    const code = Number(payload.code);
    if (Number.isFinite(code) && code !== 0) {
        const error = new Error(payload.message || `Sub2API request failed (${payload.code})`);
        error.code = payload.code;
        error.payload = payload;
        throw error;
    }
    return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

export async function requestSub2Api(
    path,
    { method = 'GET', headers = {}, body, query, token } = {}
) {
    const requestHeaders = {
        accept: 'application/json',
        ...headers,
    };

    const explicitToken = String(token || '').trim();
    const authToken = explicitToken;
    if (authToken && !requestHeaders.Authorization && !requestHeaders.authorization) {
        requestHeaders.Authorization = `Bearer ${authToken}`;
    }

    let requestBody;
    if (body !== undefined) {
        requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
        requestBody = JSON.stringify(body);
    }

    const url = buildSub2ApiUrl(path, { query });
    let response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
    });
    if (response.status === 401 && explicitToken && !headers.Authorization && !headers.authorization) {
        const refreshedToken = await refreshAccessToken().catch(() => null);
        if (refreshedToken && refreshedToken !== explicitToken) {
            requestHeaders.Authorization = `Bearer ${refreshedToken}`;
            response = await fetch(url, {
                method,
                headers: requestHeaders,
                body: requestBody,
            });
        }
    }
    const payload = await parseResponsePayload(response);

    if (!response.ok) {
        const error = new Error(parseFlowGuideErrorPayload(payload, `Request failed (${response.status})`));
        error.status = response.status;
        error.payload = payload;
        error.url = url;
        throw error;
    }

    return unwrapSub2Payload(payload);
}
