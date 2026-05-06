import { getAccessToken } from './auth';
import { isFlowGuideUrl } from './flowguide';

export async function resolveAiGatewayConfig(apiConfig = {}) {
    let apiUrl = String(apiConfig.apiUrl || '').trim();
    if (apiUrl && !/^https?:\/\//i.test(apiUrl)) {
        apiUrl = `https://${apiUrl}`;
    }

    let apiKey = String(apiConfig.apiKey || '').trim();
    if (!apiKey && isFlowGuideUrl(apiUrl)) {
        apiKey = (await getAccessToken()) || '';
    }

    return {
        ...apiConfig,
        apiUrl,
        apiKey,
        model: apiConfig.model,
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
