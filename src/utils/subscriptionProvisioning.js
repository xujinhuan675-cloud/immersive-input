const DEFAULT_PROVISION_PATH = '/api/flowguide-provision';
const PROVISION_TIMEOUT_MS = 8000;

function getEnvValue(key) {
    const viteEnv = import.meta.env || {};
    if (viteEnv[key] !== undefined) return viteEnv[key];
    if (typeof process !== 'undefined' && process.env) return process.env[key];
    return undefined;
}

function trimTrailingSlash(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function trimLeadingSlash(value) {
    return String(value || '').trim().replace(/^\/+/, '');
}

function getProvisionBase() {
    return trimTrailingSlash(
        getEnvValue('VITE_INPUT_PROVISIONING_API_BASE') ||
            getEnvValue('VITE_FLOWGUIDE_PROVISIONING_BASE') ||
            getEnvValue('VITE_PRODUCT_API_BASE') ||
            getEnvValue('VITE_APP_BASE_URL')
    );
}

function getProvisionPath() {
    const path = String(getEnvValue('VITE_INPUT_SUBSCRIPTION_PROVISION_PATH') || DEFAULT_PROVISION_PATH).trim();
    return path.startsWith('/') ? path : `/${path}`;
}

function canUseSameOriginProvisioning() {
    if (typeof window === 'undefined') return false;
    const { protocol, hostname } = window.location || {};
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return !/^(tauri\.localhost|localhost|127\.0\.0\.1)$/i.test(hostname || '');
}

function buildProvisionUrl() {
    const path = getProvisionPath();
    const base = getProvisionBase();
    if (base) return `${base}/${trimLeadingSlash(path)}`;
    if (canUseSameOriginProvisioning()) return path;
    return '';
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

export async function ensureInputFreeSubscription({ token } = {}) {
    const authToken = String(token || '').trim();
    if (!authToken) {
        return {
            ok: false,
            skipped: true,
            reason: 'missing_token',
        };
    }

    const url = buildProvisionUrl();
    if (!url) {
        return {
            ok: false,
            skipped: true,
            reason: 'missing_provisioning_endpoint',
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                product: 'input',
                entitlement: 'free',
            }),
            signal: controller.signal,
        });
        const payload = await parseResponsePayload(response);
        if (!response.ok) {
            const error = new Error(payload?.message || `Provisioning failed (${response.status})`);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload || { ok: true };
    } finally {
        clearTimeout(timeout);
    }
}

export async function ensureInputFreeSubscriptionBestEffort({ token } = {}) {
    try {
        return await ensureInputFreeSubscription({ token });
    } catch (error) {
        console.warn('Failed to provision Input free subscription:', error);
        return {
            ok: false,
            error: error?.message || 'Failed to provision subscription',
        };
    }
}
