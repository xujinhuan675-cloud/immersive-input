import { getAccessToken } from './auth';
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

    if (!apiKey && isFlowGuideUrl(apiUrl)) {
        apiKey = (await getAccessToken()) || '';
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
        throw new Error('Please sign in to FlowGuideAI or configure a FlowGuideAI API Key first.');
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
