import { getFlowGuideAudioSpeechUrl, getFlowGuideChatCompletionsUrl, isFlowGuideUrl } from './flowguide';
import { getAiServiceEntitlement } from './aiEntitlements';

const DEFAULT_AI_MODEL = 'gpt-4o-mini';

export async function resolveAiGatewayConfig(apiConfig = {}) {
    let apiUrl = String(apiConfig.apiUrl || '').trim();
    if (apiUrl && !/^https?:\/\//i.test(apiUrl)) {
        apiUrl = `https://${apiUrl}`;
    }

    let apiKey = String(apiConfig.apiKey || '').trim();
    const purpose = String(apiConfig.purpose || 'chat').trim().toLowerCase();
    if (purpose === 'chat' || purpose === 'speech') {
        const entitlement = await getAiServiceEntitlement().catch(() => ({
            canUseCustomAiServices: false,
        }));
        if (!entitlement.canUseCustomAiServices && (!apiUrl || !isFlowGuideUrl(apiUrl))) {
            apiUrl = purpose === 'speech' ? getFlowGuideAudioSpeechUrl() : getFlowGuideChatCompletionsUrl();
            apiKey = '';
        }
    }

    return {
        ...apiConfig,
        apiUrl,
        apiKey,
        model: apiConfig.model || DEFAULT_AI_MODEL,
        temperature: Number(apiConfig.temperature ?? 0.7),
    };
}

export async function requireAiGatewayConfig(apiConfig = {}) {
    const resolved = await resolveAiGatewayConfig(apiConfig);
    if (!resolved.apiUrl || !resolved.apiKey || !resolved.model) {
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

export async function fetchAiGateway(apiConfig = {}, optionsOrFactory = {}, retryOptions = {}) {
    const resolvedConfig = await requireAiGatewayConfig(apiConfig);
    const doFetch = getFetch();

    const createRequestOptions = (config) => {
        const options =
            typeof optionsOrFactory === 'function'
                ? optionsOrFactory(config)
                : optionsOrFactory;
        const { headers = {}, ...fetchOptions } = options ?? {};

        return {
            ...fetchOptions,
            headers: buildAiGatewayHeaders(config.apiKey, headers),
        };
    };

    const request = (config) => doFetch(config.apiUrl, createRequestOptions(config));
    let currentConfig = resolvedConfig;
    let response = await request(currentConfig);

    if (response.status !== 401) {
        return { response, config: currentConfig };
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

function readAiChatDelta(payload) {
    return payload?.choices?.[0]?.delta?.content ?? '';
}

export function readAiChatCompletionsMessage(payload) {
    return payload?.choices?.[0]?.message?.content ?? '';
}

async function readAiErrorText(response) {
    return response.text().catch(() => '');
}

export async function readAiChatCompletionsStream(response, onChunk = () => {}) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    const readLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) return;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') return;

        try {
            const delta = readAiChatDelta(JSON.parse(payload));
            if (delta) {
                fullText += delta;
                onChunk(delta);
            }
        } catch {}
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
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
    } catch (error) {
        onError(error?.name === 'AbortError' ? null : error?.message ?? String(error));
    }
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
