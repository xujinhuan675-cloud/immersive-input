import {
    getFlowGuideChatCompletionsUrl,
    isFlowGuideUrl,
} from './flowguide';
import { DEFAULT_CHAT_MODEL } from './aiModels';
import { clearSub2ApiGatewayKeyCache, getSub2ApiGatewayKey } from './sub2apiAiKey';
import { getConfiguredBalanceGroupId } from './inputSubscriptionPolicy';

const DEFAULT_AI_MODEL = DEFAULT_CHAT_MODEL;
const SUB2API_USER_KEY_AUTH_SOURCE = 'sub2api_user_key';
const SUBSCRIPTION_EXHAUSTION_CODES = new Set([
    'SUBSCRIPTION_NOT_FOUND',
    'SUBSCRIPTION_EXPIRED',
    'SUBSCRIPTION_INVALID',
    'SUBSCRIPTION_SUSPENDED',
]);

export async function resolveAiGatewayConfig(apiConfig = {}) {
    let apiUrl = String(apiConfig.apiUrl || '').trim();
    if (apiUrl && !/^https?:\/\//i.test(apiUrl)) {
        apiUrl = `https://${apiUrl}`;
    }

    let apiKey = String(apiConfig.apiKey || '').trim();
    let model = String(apiConfig.model || '').trim();
    return {
        ...apiConfig,
        apiUrl,
        apiKey,
        model: model || DEFAULT_AI_MODEL,
        temperature: Number(apiConfig.temperature ?? 0.7),
    };
}

export async function requireAiGatewayConfig(apiConfig = {}) {
    const resolved = await resolveAiGatewayConfig(apiConfig);
    if (!resolved.apiUrl || !resolved.model) {
        throw new Error('Please configure AI API URL, API Key, and model first.');
    }
    if (isFlowGuideUrl(resolved.apiUrl)) {
        const gatewayKey = await getSub2ApiGatewayKey();
        return {
            ...resolved,
            apiKey: gatewayKey,
            authSource: SUB2API_USER_KEY_AUTH_SOURCE,
        };
    }
    if (!resolved.apiKey) {
        throw new Error('Please configure AI API URL, API Key, and model first.');
    }
    return resolved;
}

export function buildAiGatewayHeaders(apiKey, headers = {}) {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...headers,
    };
}

function getFetch() {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        return window.fetch.bind(window);
    }

    return fetch;
}

function isSameAiGatewayConfig(first = {}, second = {}) {
    return (
        String(first.apiUrl || '') === String(second.apiUrl || '') &&
        String(first.apiKey || '') === String(second.apiKey || '') &&
        String(first.model || '') === String(second.model || '') &&
        Number(first.temperature ?? 0.7) === Number(second.temperature ?? 0.7)
    );
}

async function closeResponseBody(response) {
    try {
        await response?.body?.cancel?.();
    } catch {}
}

function isAuthFailureStatus(status) {
    return status === 401 || status === 403;
}

async function readGatewayErrorCode(response) {
    if (!response) return '';
    try {
        const payload = await response.clone().json();
        const candidates = [payload?.code, payload?.error?.code, payload?.error?.type, payload?.data?.code];
        return (
            candidates
                .map((value) =>
                    String(value || '')
                        .trim()
                        .toUpperCase()
                )
                .find(Boolean) || ''
        );
    } catch {
        return '';
    }
}

function isSubscriptionExhaustionCode(status, code) {
    if (status === 429) return code === 'USAGE_LIMIT_EXCEEDED';
    if (status !== 403) return false;
    return SUBSCRIPTION_EXHAUSTION_CODES.has(code);
}

export async function fetchAiGateway(apiConfig = {}, optionsOrFactory = {}, retryOptions = {}) {
    const resolvedConfig = await requireAiGatewayConfig(apiConfig);
    const doFetch = getFetch();

    const createRequestOptions = (config) => {
        const options = typeof optionsOrFactory === 'function' ? optionsOrFactory(config) : optionsOrFactory;
        const { headers = {}, ...fetchOptions } = options ?? {};

        return {
            ...fetchOptions,
            headers: buildAiGatewayHeaders(config.apiKey, headers),
        };
    };

    const request = (config) => doFetch(config.apiUrl, createRequestOptions(config));
    let currentConfig = resolvedConfig;

    const tryBalanceFallback = async (response) => {
        const gatewayErrorCode = await readGatewayErrorCode(response);
        const balanceGroupId = getConfiguredBalanceGroupId();
        if (
            !isFlowGuideUrl(currentConfig.apiUrl) ||
            currentConfig.authSource !== SUB2API_USER_KEY_AUTH_SOURCE ||
            !balanceGroupId ||
            !isSubscriptionExhaustionCode(response.status, gatewayErrorCode)
        ) {
            return null;
        }

        const balanceGatewayKey = await getSub2ApiGatewayKey({
            forceRefresh: true,
            groupId: balanceGroupId,
            cacheAsPreferred: true,
        }).catch(() => null);
        if (!balanceGatewayKey || balanceGatewayKey === currentConfig.apiKey) {
            return null;
        }

        await closeResponseBody(response);
        currentConfig = {
            ...currentConfig,
            apiKey: balanceGatewayKey,
            billingSource: 'balance',
        };
        return request(currentConfig);
    };

    let response = await request(currentConfig);
    const balanceResponse = await tryBalanceFallback(response);
    if (balanceResponse) {
        return { response: balanceResponse, config: currentConfig };
    }

    if (!isAuthFailureStatus(response.status)) {
        return { response, config: currentConfig };
    }

    if (
        currentConfig.authSource === SUB2API_USER_KEY_AUTH_SOURCE &&
        isAuthFailureStatus(response.status)
    ) {
        clearSub2ApiGatewayKeyCache();
        const refreshedGatewayKey = await getSub2ApiGatewayKey({ forceRefresh: true }).catch(() => null);
        if (refreshedGatewayKey && refreshedGatewayKey !== currentConfig.apiKey) {
            await closeResponseBody(response);
            currentConfig = {
                ...currentConfig,
                apiKey: refreshedGatewayKey,
            };
            response = await request(currentConfig);
            if (!isAuthFailureStatus(response.status)) {
                return { response, config: currentConfig };
            }
        }
    }

    if (
        isFlowGuideUrl(currentConfig.apiUrl) &&
        currentConfig.authSource !== SUB2API_USER_KEY_AUTH_SOURCE &&
        isAuthFailureStatus(response.status)
    ) {
        clearSub2ApiGatewayKeyCache();
        const gatewayKey = await getSub2ApiGatewayKey({ forceRefresh: true }).catch(() => null);
        if (gatewayKey && gatewayKey !== currentConfig.apiKey) {
            await closeResponseBody(response);
            currentConfig = {
                ...currentConfig,
                apiKey: gatewayKey,
                authSource: SUB2API_USER_KEY_AUTH_SOURCE,
            };
            response = await request(currentConfig);
            if (!isAuthFailureStatus(response.status)) {
                return { response, config: currentConfig };
            }
        }
    }

    const refreshedBalanceResponse = await tryBalanceFallback(response);
    if (refreshedBalanceResponse) {
        return { response: refreshedBalanceResponse, config: currentConfig };
    }

    if (typeof retryOptions.refreshConfig === 'function') {
        const nextConfigInput = await retryOptions.refreshConfig().catch(() => null);
        if (nextConfigInput) {
            const nextConfig = await requireAiGatewayConfig(nextConfigInput);
            if (!isSameAiGatewayConfig(currentConfig, nextConfig)) {
                await closeResponseBody(response);
                currentConfig = nextConfig;
                response = await request(currentConfig);
            }
        }
    }

    return { response, config: currentConfig };
}

export function buildAiChatCompletionsBody(config = {}, messages = [], options = {}) {
    const requestBody = options.body ?? {};

    return {
        ...requestBody,
        model: options.model || config.model || requestBody.model,
        messages,
        temperature: Number(options.temperature ?? requestBody.temperature ?? config.temperature ?? 0.7),
        stream: Boolean(options.stream),
    };
}

function readAiTextContent(content) {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') {
                    return part;
                }
                return (
                    readAiTextContent(part?.text) ||
                    readAiTextContent(part?.content) ||
                    readAiTextContent(part?.output_text) ||
                    ''
                );
            })
            .filter(Boolean)
            .join('');
    }

    if (content && typeof content === 'object') {
        return (
            readAiTextContent(content.text) ||
            readAiTextContent(content.content) ||
            readAiTextContent(content.output_text) ||
            ''
        );
    }

    return '';
}

function readAiChatDeltaPayload(payload) {
    const choice = payload?.choices?.[0] ?? {};
    const delta = choice.delta ?? {};
    const incrementalText =
        readAiTextContent(delta.content) ||
        readAiTextContent(delta.text) ||
        readAiTextContent(delta.output_text) ||
        readAiTextContent(choice.text);

    if (incrementalText) {
        return { text: incrementalText, cumulative: false };
    }

    return {
        text:
            readAiTextContent(choice.message?.content) ||
            readAiTextContent(payload?.message?.content) ||
            readAiTextContent(payload?.content) ||
            readAiTextContent(payload?.output_text) ||
            readAiTextContent(payload?.text) ||
            readAiTextContent(payload?.output) ||
            '',
        cumulative: true,
    };
}

function readAiChatDelta(payload) {
    return readAiChatDeltaPayload(payload).text;
}

export function readAiChatCompletionsMessage(payload) {
    const choice = payload?.choices?.[0] ?? {};
    return (
        readAiTextContent(choice.message?.content) ||
        readAiTextContent(choice.text) ||
        readAiTextContent(payload?.message?.content) ||
        readAiTextContent(payload?.content) ||
        readAiTextContent(payload?.output_text) ||
        readAiTextContent(payload?.text) ||
        readAiTextContent(payload?.output) ||
        ''
    );
}

async function readAiErrorText(response) {
    return response.text().catch(() => '');
}

export async function readAiChatCompletionsStream(response, onChunk = () => {}) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let lastCumulativeText = '';
    let buffer = '';
    let rawText = '';

    const emitStreamText = (text, cumulative = false) => {
        if (!text) return;

        let delta = text;
        if (cumulative) {
            if (text === fullText || text === lastCumulativeText) {
                return;
            }
            if (text.startsWith(fullText)) {
                delta = text.slice(fullText.length);
            } else if (text.startsWith(lastCumulativeText)) {
                delta = text.slice(lastCumulativeText.length);
            }
            lastCumulativeText = text;
        } else {
            lastCumulativeText += text;
        }

        if (!delta) return;
        fullText += delta;
        onChunk(delta);
    };

    const readLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) return;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') return;

        try {
            const deltaPayload = readAiChatDeltaPayload(JSON.parse(payload));
            emitStreamText(deltaPayload.text, deltaPayload.cumulative);
        } catch {}
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const decoded = decoder.decode(value, { stream: true });
            rawText += decoded;
            buffer += decoded;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach(readLine);
        }

        if (buffer) {
            readLine(buffer);
        }
    } finally {
        reader.releaseLock();
    }

    if (!fullText) {
        try {
            const payload = JSON.parse(rawText.trim());
            const message = readAiChatCompletionsMessage(payload) || readAiChatDelta(payload);
            if (message) {
                fullText = message;
                onChunk(message);
            }
        } catch {}
    }

    return fullText;
}

export async function streamAiChatCompletions(
    messages,
    apiConfig,
    onChunk,
    onComplete,
    onError,
    signal,
    retryOptions,
    options = {}
) {
    try {
        const { response } = await fetchAiGateway(
            apiConfig ?? {},
            (resolvedConfig) => ({
                method: 'POST',
                body: JSON.stringify(
                    buildAiChatCompletionsBody(resolvedConfig, messages, {
                        ...options,
                        stream: true,
                    })
                ),
                signal,
            }),
            retryOptions
        );

        if (!response.ok) {
            onError(`HTTP ${response.status}: ${await readAiErrorText(response)}`);
            return;
        }

        const fullText = await readAiChatCompletionsStream(response, onChunk);
        onComplete(fullText);
        return fullText;
    } catch (error) {
        onError(error?.name === 'AbortError' ? null : error?.message ?? String(error));
    }

    return '';
}

export async function requestAiChatCompletions(messages, apiConfig, retryOptions, options = {}) {
    const { response } = await fetchAiGateway(
        apiConfig ?? {},
        (resolvedConfig) => ({
            method: 'POST',
            body: JSON.stringify(
                buildAiChatCompletionsBody(resolvedConfig, messages, {
                    ...options,
                    stream: false,
                })
            ),
        }),
        retryOptions
    );

    const data = await response.json().catch(() => null);
    if (response.ok) {
        return {
            data,
            text: readAiChatCompletionsMessage(data),
        };
    }

    const errorPayload = data ? JSON.stringify(data).slice(0, 500) : '';
    throw new Error(errorPayload || `HTTP ${response.status}`);
}

export function normalizeAiChatCompletionsUrl(requestPath = '') {
    let nextRequestPath = String(requestPath || '').trim();
    if (!nextRequestPath) {
        return '';
    }
    if (!/^https?:\/\/.+/i.test(nextRequestPath)) {
        nextRequestPath = `https://${nextRequestPath}`;
    }

    const apiUrl = new URL(nextRequestPath);
    const normalizedPath = apiUrl.pathname.replace(/\/+$/, '');
    if (!/\/chat\/completions$/i.test(normalizedPath)) {
        apiUrl.pathname = /\/v1$/i.test(normalizedPath)
            ? `${normalizedPath}/chat/completions`
            : `${normalizedPath}/v1/chat/completions`;
    }
    return apiUrl.href;
}

export async function fetchAiChatCompletions(
    messages,
    apiConfig,
    { stream = false, requestArguments, signal, retryOptions } = {}
) {
    const requestBody =
        typeof requestArguments === 'string' && requestArguments.trim()
            ? JSON.parse(requestArguments)
            : requestArguments ?? {};

    return fetchAiGateway(
        apiConfig ?? {},
        (resolvedConfig) => ({
            method: 'POST',
            body: JSON.stringify(
                buildAiChatCompletionsBody(resolvedConfig, messages, {
                    stream,
                    body: requestBody,
                })
            ),
            signal,
        }),
        retryOptions
    );
}
