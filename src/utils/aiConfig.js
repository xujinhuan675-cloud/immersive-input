import { createServiceInstanceKey, getDisplayInstanceName, INSTANCE_NAME_CONFIG_KEY } from './service_instance';
import { store } from './store';

export const AI_API_SERVICE_LIST_KEY = 'ai_api_service_list';
export const AI_API_SERVICE_NAME = 'ai_api';
export const AI_API_DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
export const AI_API_DEFAULT_MODEL = 'gpt-4o-mini';
export const AI_API_PROVIDER_TITLE = 'OpenAI Compatible API';
export const AI_PROVIDER_IDS = {
    COMPATIBLE: 'compatible',
    OPENAI: 'openai',
    CLAUDE: 'claude',
    GEMINI: 'gemini',
};
export const AI_PROVIDER_OPTIONS = [
    { key: AI_PROVIDER_IDS.COMPATIBLE, label: AI_API_PROVIDER_TITLE },
    { key: AI_PROVIDER_IDS.OPENAI, label: 'OpenAI' },
    { key: AI_PROVIDER_IDS.CLAUDE, label: 'Claude' },
    { key: AI_PROVIDER_IDS.GEMINI, label: 'Gemini' },
];

export function createAiApiInstanceKey() {
    return createServiceInstanceKey(AI_API_SERVICE_NAME);
}

export function createDefaultAiApiConfig(overrides = {}) {
    return {
        [INSTANCE_NAME_CONFIG_KEY]: '',
        provider: '',
        apiUrl: AI_API_DEFAULT_URL,
        apiKey: '',
        model: AI_API_DEFAULT_MODEL,
        temperature: 0.7,
        enable: true,
        ...overrides,
    };
}

export function getMergedAiApiConfig(config = {}) {
    return createDefaultAiApiConfig(config ?? {});
}

export function normalizeAiProviderId(providerId) {
    const normalized = String(providerId ?? '').trim().toLowerCase();
    if (!normalized) return null;

    if (normalized === AI_PROVIDER_IDS.OPENAI) return AI_PROVIDER_IDS.OPENAI;
    if (normalized === AI_PROVIDER_IDS.CLAUDE || normalized === 'anthropic') return AI_PROVIDER_IDS.CLAUDE;
    if (normalized === AI_PROVIDER_IDS.GEMINI || normalized === 'google') return AI_PROVIDER_IDS.GEMINI;
    if (
        normalized === AI_PROVIDER_IDS.COMPATIBLE ||
        normalized === 'openai-compatible' ||
        normalized === 'openai_compatible'
    ) {
        return AI_PROVIDER_IDS.COMPATIBLE;
    }

    return null;
}

export function inferAiProviderId(config = {}) {
    const searchText = [
        config?.provider,
        config?.apiUrl,
        config?.model,
        config?.[INSTANCE_NAME_CONFIG_KEY],
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (!searchText) return AI_PROVIDER_IDS.COMPATIBLE;
    if (searchText.includes('anthropic') || searchText.includes('claude')) return AI_PROVIDER_IDS.CLAUDE;
    if (
        searchText.includes('gemini') ||
        searchText.includes('generativelanguage') ||
        searchText.includes('google')
    ) {
        return AI_PROVIDER_IDS.GEMINI;
    }
    if (searchText.includes('openai') || searchText.includes('gpt') || searchText.includes('/o1') || searchText.includes('/o3') || searchText.includes('/o4')) {
        return AI_PROVIDER_IDS.OPENAI;
    }
    return AI_PROVIDER_IDS.COMPATIBLE;
}

export function getAiProviderId(config = {}) {
    return normalizeAiProviderId(config?.provider) ?? inferAiProviderId(config);
}

export function getAiProviderTitle(providerId) {
    const normalized = normalizeAiProviderId(providerId) ?? AI_PROVIDER_IDS.COMPATIBLE;
    return AI_PROVIDER_OPTIONS.find((item) => item.key === normalized)?.label ?? AI_API_PROVIDER_TITLE;
}

export function getAiApiDisplayName(instanceConfig, fallbackName = AI_API_PROVIDER_TITLE) {
    return getDisplayInstanceName(instanceConfig?.[INSTANCE_NAME_CONFIG_KEY], () => fallbackName);
}

export function getAiHistoryServiceMeta(config = {}) {
    const providerId = getAiProviderId(config);
    const providerTitle = getAiProviderTitle(providerId);

    return {
        serviceInstanceKey: config?.instanceKey ?? null,
        providerId,
        serviceDisplayName: getAiApiDisplayName(config, providerTitle),
    };
}

export async function ensureAiApiConfigMigration() {
    await store.load();

    const instanceList = await store.get(AI_API_SERVICE_LIST_KEY);
    if (Array.isArray(instanceList) && instanceList.length > 0) {
        return instanceList;
    }

    const [legacyUrl, legacyKey, legacyModel, legacyTemperature] = await Promise.all([
        store.get('ai_api_url'),
        store.get('ai_api_key'),
        store.get('ai_model'),
        store.get('ai_temperature'),
    ]);

    const instanceKey = createAiApiInstanceKey();
    await store.set(
        instanceKey,
        createDefaultAiApiConfig({
            apiUrl: legacyUrl ?? AI_API_DEFAULT_URL,
            apiKey: legacyKey ?? '',
            model: legacyModel ?? AI_API_DEFAULT_MODEL,
            temperature: legacyTemperature ?? 0.7,
        })
    );
    await store.set(AI_API_SERVICE_LIST_KEY, [instanceKey]);
    await store.save();

    return [instanceKey];
}

export async function getActiveAiApiConfig() {
    const instanceList = await ensureAiApiConfigMigration();

    for (const instanceKey of instanceList) {
        const config = await store.get(instanceKey);
        if (!config) continue;
        const mergedConfig = getMergedAiApiConfig(config);
        if (mergedConfig.enable ?? true) {
            return {
                ...mergedConfig,
                instanceKey,
            };
        }
    }

    return null;
}
