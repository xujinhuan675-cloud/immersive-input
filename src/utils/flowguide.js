const DEFAULT_FLOWGUIDE_API_BASE = 'https://ai.flowguide.cc';

const DEFAULT_AUTH_PATHS = Object.freeze({
    login: '/api/auth/login',
    register: '/api/auth/register',
    sendCode: '/api/auth/send-code',
    resetPassword: '/api/auth/reset-password',
    logout: '/api/auth/logout',
});

function trimTrailingSlash(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function trimLeadingSlash(value) {
    return String(value || '').trim().replace(/^\/+/, '');
}

export function normalizeBaseUrl(value, fallback = DEFAULT_FLOWGUIDE_API_BASE) {
    const raw = trimTrailingSlash(value) || trimTrailingSlash(fallback);
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function getFlowGuideApiBase() {
    return normalizeBaseUrl(import.meta.env.VITE_FLOWGUIDE_API_BASE, DEFAULT_FLOWGUIDE_API_BASE);
}

export function getFlowGuideAiGatewayBase() {
    return normalizeBaseUrl(import.meta.env.VITE_FLOWGUIDE_AI_GATEWAY_BASE, getFlowGuideApiBase());
}

export function getFlowGuideChatCompletionsUrl() {
    const explicit = String(import.meta.env.VITE_FLOWGUIDE_CHAT_COMPLETIONS_URL || '').trim();
    if (explicit) return explicit;
    return `${getFlowGuideAiGatewayBase()}/v1/chat/completions`;
}

export function getFlowGuideAudioSpeechUrl() {
    const explicit = String(import.meta.env.VITE_FLOWGUIDE_AUDIO_SPEECH_URL || '').trim();
    if (explicit) return explicit;
    return `${getFlowGuideAiGatewayBase()}/v1/audio/speech`;
}

export function getFlowGuideAuthPath(name) {
    const key = String(name || '').trim();
    const envKey = `VITE_FLOWGUIDE_AUTH_${key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}_PATH`;
    return String(import.meta.env[envKey] || DEFAULT_AUTH_PATHS[key] || '').trim();
}

export function buildFlowGuideUrl(path, { base = getFlowGuideApiBase(), query } = {}) {
    const normalizedBase = normalizeBaseUrl(base);
    const normalizedPath = trimLeadingSlash(path || '/');
    const url = `${normalizedBase}/${normalizedPath}`;
    if (!query) return url;

    const params = new URLSearchParams(query);
    const suffix = params.toString();
    return suffix ? `${url}?${suffix}` : url;
}

export function isFlowGuideUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;

    try {
        const resolved = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const target = new URL(resolved);
        const apiBase = new URL(getFlowGuideApiBase());
        const gatewayBase = new URL(getFlowGuideAiGatewayBase());
        return target.origin === apiBase.origin || target.origin === gatewayBase.origin;
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
