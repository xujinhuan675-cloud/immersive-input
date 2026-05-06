import { sendJson, setCors } from './http.js';

const DEFAULT_FLOWGUIDE_BASE = 'https://ai.flowguide.cc';
const ROUTE_MODE_GONE = 'gone';
const ROUTE_MODE_PASSTHROUGH = 'passthrough';

function normalizeMode(value, fallback = ROUTE_MODE_GONE) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    if (normalized === ROUTE_MODE_PASSTHROUGH) return ROUTE_MODE_PASSTHROUGH;
    if (normalized === ROUTE_MODE_GONE) return ROUTE_MODE_GONE;
    return fallback;
}

function getEnvValue(...keys) {
    for (const key of keys) {
        const value = String(process.env[key] || '').trim();
        if (value) return value;
    }
    return '';
}

export function getFlowGuideServerBase() {
    return (
        getEnvValue('FLOWGUIDE_API_BASE', 'VITE_FLOWGUIDE_API_BASE', 'VITE_AUTH_API_BASE') ||
        DEFAULT_FLOWGUIDE_BASE
    ).replace(/\/+$/, '');
}

export function getLegacyRouteMode(scope = '') {
    const normalizedScope = String(scope || '')
        .trim()
        .replace(/[^a-z0-9]+/gi, '_')
        .toUpperCase();

    return normalizeMode(
        getEnvValue(
            normalizedScope ? `FLOWGUIDE_LEGACY_${normalizedScope}_MODE` : '',
            'FLOWGUIDE_LEGACY_ROUTE_MODE'
        )
    );
}

export function shouldPassthroughLegacyRoute(scope = '') {
    return getLegacyRouteMode(scope) === ROUTE_MODE_PASSTHROUGH;
}

export function handleLegacyRouteRetired(req, res, options = {}) {
    const scope = String(options.scope || 'api').trim() || 'api';
    const route = String(options.route || '').trim() || '*';
    const methods = options.methods || 'GET, POST, OPTIONS';
    const headers = options.headers || 'Content-Type, Authorization';
    const base = getFlowGuideServerBase();

    const cors = setCors(req, res, {
        methods,
        headers,
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    res.setHeader('X-Legacy-Route-Mode', ROUTE_MODE_GONE);
    res.setHeader('X-FlowGuide-Base', base);
    return sendJson(res, 410, {
        ok: false,
        retired: true,
        scope,
        route,
        mode: ROUTE_MODE_GONE,
        message:
            options.message ||
            `Legacy ${scope} route has been retired. Use the FlowGuideAI service at ${base}.`,
        flowGuideBase: base,
    });
}
