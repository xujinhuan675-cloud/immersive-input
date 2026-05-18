const DEFAULT_FLOWGUIDE_API_BASE = 'https://ai.flowguide.cc';

const DEFAULT_AUTH_PATHS = Object.freeze({
    login: '/api/v1/auth/login',
    register: '/api/v1/auth/register',
    sendCode: '/api/v1/auth/send-verify-code',
    refresh: '/api/v1/auth/refresh',
    forgotPassword: '/api/v1/auth/forgot-password',
    resetPassword: '/api/v1/auth/reset-password',
    logout: '/api/v1/auth/logout',
});

function trimTrailingSlash(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function trimLeadingSlash(value) {
    return String(value || '').trim().replace(/^\/+/, '');
}

function getEnvValue(key) {
    const viteEnv = import.meta.env || {};
    if (viteEnv[key] !== undefined) return viteEnv[key];
    if (typeof process !== 'undefined' && process.env) return process.env[key];
    return undefined;
}

export function normalizeBaseUrl(value, fallback = DEFAULT_FLOWGUIDE_API_BASE) {
    const raw = trimTrailingSlash(value) || trimTrailingSlash(fallback);
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function getFlowGuideApiBase() {
    return normalizeBaseUrl(getEnvValue('VITE_FLOWGUIDE_API_BASE'), DEFAULT_FLOWGUIDE_API_BASE);
}

export function getFlowGuideAuthBase() {
    return normalizeBaseUrl(
        getEnvValue('VITE_FLOWGUIDE_AUTH_BASE') || getEnvValue('VITE_AUTH_API_BASE'),
        getFlowGuideApiBase()
    );
}

export function getFlowGuideAiGatewayBase() {
    return normalizeBaseUrl(getEnvValue('VITE_FLOWGUIDE_AI_GATEWAY_BASE'), getFlowGuideApiBase());
}

export function getFlowGuideChatCompletionsUrl() {
    const explicit = String(getEnvValue('VITE_FLOWGUIDE_CHAT_COMPLETIONS_URL') || '').trim();
    if (explicit) return explicit;
    return `${getFlowGuideAiGatewayBase()}/v1/chat/completions`;
}

export function getFlowGuideAudioSpeechUrl() {
    const explicit = String(getEnvValue('VITE_FLOWGUIDE_AUDIO_SPEECH_URL') || '').trim();
    if (explicit) return explicit;
    return `${getFlowGuideAiGatewayBase()}/v1/audio/speech`;
}

export function getFlowGuideAuthPath(name) {
    const key = String(name || '').trim();
    const envKey = `VITE_FLOWGUIDE_AUTH_${key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}_PATH`;
    return String(getEnvValue(envKey) || DEFAULT_AUTH_PATHS[key] || '').trim();
}

export function buildFlowGuideUrl(path, { base = getFlowGuideApiBase(), query } = {}) {
    const normalizedBase = normalizeBaseUrl(base);
    let normalizedPath = trimLeadingSlash(path || '/');
    if (/\/api\/v1$/i.test(normalizedBase) && normalizedPath.startsWith('api/v1/')) {
        normalizedPath = normalizedPath.slice('api/v1/'.length);
    }
    const url = `${normalizedBase}/${normalizedPath}`;
    if (!query) return url;

    const params = new URLSearchParams(query);
    const suffix = params.toString();
    return suffix ? `${url}?${suffix}` : url;
}

export function buildFlowGuideAuthUrl(path, { query } = {}) {
    return buildFlowGuideUrl(path, { base: getFlowGuideAuthBase(), query });
}

export function isFlowGuideUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;

    try {
        const resolved = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const target = new URL(resolved);
        const apiBase = new URL(getFlowGuideApiBase());
        const gatewayBase = new URL(getFlowGuideAiGatewayBase());
        const authBase = new URL(getFlowGuideAuthBase());
        return (
            target.origin === apiBase.origin ||
            target.origin === gatewayBase.origin ||
            target.origin === authBase.origin
        );
    } catch {
        return false;
    }
}

export function parseFlowGuideErrorPayload(payload, fallback = 'Request failed') {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload || fallback;
    return (
        payload.message ||
        payload.error?.message ||
        payload.error ||
        payload.detail ||
        fallback
    );
}
