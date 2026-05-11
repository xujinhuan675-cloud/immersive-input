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
