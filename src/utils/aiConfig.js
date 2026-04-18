import { createServiceInstanceKey, getDisplayInstanceName, INSTANCE_NAME_CONFIG_KEY } from './service_instance';
import { store } from './store';

export const AI_API_SERVICE_LIST_KEY = 'ai_api_service_list';
export const AI_API_SERVICE_NAME = 'ai_api';
export const AI_API_DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
export const AI_API_DEFAULT_MODEL = 'gpt-4o-mini';
export const AI_API_PROVIDER_TITLE = 'OpenAI Compatible API';

export function createAiApiInstanceKey() {
    return createServiceInstanceKey(AI_API_SERVICE_NAME);
}

export function createDefaultAiApiConfig(overrides = {}) {
    return {
        [INSTANCE_NAME_CONFIG_KEY]: '',
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

export function getAiApiDisplayName(instanceConfig, fallbackName = AI_API_PROVIDER_TITLE) {
    return getDisplayInstanceName(instanceConfig?.[INSTANCE_NAME_CONFIG_KEY], () => fallbackName);
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
