const DEFAULT_ALLOWED_ORIGINS = [
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
    'http://localhost',
    'http://127.0.0.1',
    'https://localhost',
    'https://127.0.0.1',
];

function trim(value) {
    return String(value || '').trim();
}

function parseCsv(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function toOrigin(value) {
    const raw = trim(value);
    if (!raw) return '';
    try {
        return new URL(raw).origin;
    } catch {
        return '';
    }
}

function getAllowedOrigins() {
    const values = new Set(DEFAULT_ALLOWED_ORIGINS);
    parseCsv(process.env.CORS_ALLOWED_ORIGINS).forEach((origin) => values.add(origin));
    parseCsv(process.env.PAYMENT_ALLOWED_ORIGINS).forEach((origin) => values.add(origin));

    [
        process.env.APP_BASE_URL,
        process.env.STRIPE_SUCCESS_URL,
        process.env.STRIPE_CANCEL_URL,
        process.env.EASYPAY_RETURN_URL,
        process.env.ALIPAY_RETURN_URL,
    ]
        .map(toOrigin)
        .filter(Boolean)
        .forEach((origin) => values.add(origin));

    return Array.from(values);
}

export function getHeader(headers, name) {
    const key = trim(name).toLowerCase();
    if (!key) return '';
    const value = headers?.[key] ?? headers?.[name];
    if (Array.isArray(value)) return trim(value[0]);
    return trim(value);
}

export function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = Number.isFinite(Number(statusCode)) ? Math.trunc(Number(statusCode)) : 500;
    return error;
}

export function getErrorStatus(error, fallback = 500) {
    const statusCode = Number(error?.statusCode);
    if (Number.isFinite(statusCode) && statusCode >= 100 && statusCode <= 599) {
        return Math.trunc(statusCode);
    }
    return fallback;
}

export function isOriginAllowed(origin, { allowAnyOrigin = false } = {}) {
    const normalized = trim(origin);
    if (!normalized) return true;
    if (allowAnyOrigin) return true;
    return getAllowedOrigins().includes(normalized);
}

export function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', () => {
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

export function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', () => resolve(raw));
        req.on('error', reject);
    });
}

export function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

export function setCors(req, res, options = {}) {
    const origin = getHeader(req.headers, 'origin');
    const methods = options.methods || 'POST, OPTIONS';
    const headers = options.headers || 'Content-Type, Authorization';
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
    res.setHeader('Access-Control-Max-Age', String(options.maxAge || 600));

    const originAllowed = isOriginAllowed(origin, options);
    if (origin && originAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    return {
        origin,
        originAllowed,
    };
}
