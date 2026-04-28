import { createServiceInstanceKey, getDisplayInstanceName, INSTANCE_NAME_CONFIG_KEY } from './service_instance';
import { store } from './store';

export const AI_API_SERVICE_LIST_KEY = 'ai_api_service_list';
export const AI_API_SERVICE_NAME = 'ai_api';
export const AI_API_DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
export const AI_API_DEFAULT_MODEL = 'gpt-4o-mini';
export const AI_API_PROVIDER_TITLE = 'OpenAI Compatible API';

export const BUILTIN_TTS_CONFIG_KEY = 'builtin_tts_config';
export const BUILTIN_TTS_PROVIDER_IDS = {
    SYSTEM: 'system_tts',
    VOLCENGINE: 'volcengine_tts',
    OPENAI: 'openai_tts',
};
export const BUILTIN_TTS_PROVIDER_OPTIONS = [
    { key: BUILTIN_TTS_PROVIDER_IDS.SYSTEM, label: 'System Voice' },
    { key: BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE, label: 'Volcengine TTS' },
    { key: BUILTIN_TTS_PROVIDER_IDS.OPENAI, label: 'OpenAI TTS' },
];
export const SYSTEM_TTS_DEFAULT_RATE = 1;
export const SYSTEM_TTS_DEFAULT_PITCH = 1;
export const SYSTEM_TTS_DEFAULT_VOLUME = 1;
export const OPENAI_TTS_DEFAULT_URL = 'https://api.openai.com/v1/audio/speech';
export const OPENAI_TTS_DEFAULT_MODEL = 'gpt-4o-mini-tts';
export const OPENAI_TTS_DEFAULT_VOICE = 'alloy';
export const OPENAI_TTS_VOICE_OPTIONS = [
    'alloy',
    'ash',
    'ballad',
    'coral',
    'echo',
    'fable',
    'nova',
    'onyx',
    'sage',
    'shimmer',
    'verse',
];
export const VOLCENGINE_TTS_DEFAULT_CLUSTER = 'volcano_tts';
export const VOLCENGINE_TTS_DEFAULT_VOICE = 'BV700_streaming';
export const VOLCENGINE_TTS_DEFAULT_ENCODING = 'mp3';
export const VOLCENGINE_TTS_ENCODING_OPTIONS = ['mp3', 'wav', 'pcm', 'ogg_opus'];

export const AI_PROVIDER_IDS = {
    COMPATIBLE: 'compatible',
    OPENAI: 'openai',
    CLAUDE: 'claude',
    GEMINI: 'gemini',
};
export const AI_PROVIDER_PRIORITY = [
    AI_PROVIDER_IDS.OPENAI,
    AI_PROVIDER_IDS.CLAUDE,
    AI_PROVIDER_IDS.GEMINI,
    AI_PROVIDER_IDS.COMPATIBLE,
];
export const AI_PROVIDER_OPTIONS = [
    { key: AI_PROVIDER_IDS.COMPATIBLE, label: AI_API_PROVIDER_TITLE },
    { key: AI_PROVIDER_IDS.OPENAI, label: 'OpenAI' },
    { key: AI_PROVIDER_IDS.CLAUDE, label: 'Claude' },
    { key: AI_PROVIDER_IDS.GEMINI, label: 'Gemini' },
];
export const AI_PROVIDER_PRESETS = {
    [AI_PROVIDER_IDS.COMPATIBLE]: {
        key: AI_PROVIDER_IDS.COMPATIBLE,
        label: AI_API_PROVIDER_TITLE,
        apiUrl: AI_API_DEFAULT_URL,
        model: AI_API_DEFAULT_MODEL,
    },
    [AI_PROVIDER_IDS.OPENAI]: {
        key: AI_PROVIDER_IDS.OPENAI,
        label: 'OpenAI',
        apiUrl: AI_API_DEFAULT_URL,
        model: AI_API_DEFAULT_MODEL,
    },
    [AI_PROVIDER_IDS.CLAUDE]: {
        key: AI_PROVIDER_IDS.CLAUDE,
        label: 'Claude',
        apiUrl: 'https://api.anthropic.com/v1/chat/completions',
        model: 'claude-sonnet-4-6',
    },
    [AI_PROVIDER_IDS.GEMINI]: {
        key: AI_PROVIDER_IDS.GEMINI,
        label: 'Gemini',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: 'gemini-2.5-flash',
    },
};

const AI_API_CONFIG_KEYS = [INSTANCE_NAME_CONFIG_KEY, 'provider', 'apiUrl', 'apiKey', 'model', 'temperature', 'enable'];
const BUILTIN_TTS_CONFIG_KEYS = [
    'speechUseForReadAloud',
    'speechProvider',
    'speechProviderOrder',
    'speechSystemVoiceURI',
    'speechSystemRate',
    'speechSystemPitch',
    'speechSystemVolume',
    'speechOpenaiApiUrl',
    'speechOpenaiApiKey',
    'speechOpenaiModel',
    'speechOpenaiVoice',
    'speechOpenaiSpeed',
    'speechOpenaiInstructions',
    'speechVolcengineAppId',
    'speechVolcengineAccessToken',
    'speechVolcengineCluster',
    'speechVolcengineVoice',
    'speechVolcengineSpeed',
    'speechVolcengineEncoding',
];

function pickConfigKeys(config = {}, keys = []) {
    return keys.reduce((result, key) => {
        if (config?.[key] !== undefined) {
            result[key] = config[key];
        }
        return result;
    }, {});
}

function hasLegacySpeechConfig(config = {}) {
    return BUILTIN_TTS_CONFIG_KEYS.some((key) => config?.[key] !== undefined);
}

function getLegacySpeechConfig(config = {}) {
    return pickConfigKeys(config ?? {}, BUILTIN_TTS_CONFIG_KEYS);
}

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
        ...pickConfigKeys(overrides, AI_API_CONFIG_KEYS),
    };
}

export function getAiProviderPreset(providerId) {
    const normalizedProviderId = normalizeAiProviderId(providerId) ?? AI_PROVIDER_IDS.COMPATIBLE;
    return AI_PROVIDER_PRESETS[normalizedProviderId] ?? AI_PROVIDER_PRESETS[AI_PROVIDER_IDS.COMPATIBLE];
}

export function createAiApiConfigForProvider(providerId, overrides = {}) {
    const providerPreset = getAiProviderPreset(providerId);
    return createDefaultAiApiConfig({
        provider: providerPreset.key,
        apiUrl: providerPreset.apiUrl,
        model: providerPreset.model,
        ...pickConfigKeys(overrides, AI_API_CONFIG_KEYS),
    });
}

export function createDefaultBuiltInTtsConfig(overrides = {}) {
    return {
        speechUseForReadAloud: false,
        speechProvider: BUILTIN_TTS_PROVIDER_IDS.SYSTEM,
        speechProviderOrder: [
            BUILTIN_TTS_PROVIDER_IDS.SYSTEM,
            BUILTIN_TTS_PROVIDER_IDS.OPENAI,
            BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE,
        ],
        speechSystemVoiceURI: '',
        speechSystemRate: SYSTEM_TTS_DEFAULT_RATE,
        speechSystemPitch: SYSTEM_TTS_DEFAULT_PITCH,
        speechSystemVolume: SYSTEM_TTS_DEFAULT_VOLUME,
        speechOpenaiApiUrl: '',
        speechOpenaiApiKey: '',
        speechOpenaiModel: OPENAI_TTS_DEFAULT_MODEL,
        speechOpenaiVoice: OPENAI_TTS_DEFAULT_VOICE,
        speechOpenaiSpeed: 1,
        speechOpenaiInstructions: '',
        speechVolcengineAppId: '',
        speechVolcengineAccessToken: '',
        speechVolcengineCluster: VOLCENGINE_TTS_DEFAULT_CLUSTER,
        speechVolcengineVoice: VOLCENGINE_TTS_DEFAULT_VOICE,
        speechVolcengineSpeed: 1,
        speechVolcengineEncoding: VOLCENGINE_TTS_DEFAULT_ENCODING,
        ...pickConfigKeys(overrides, BUILTIN_TTS_CONFIG_KEYS),
    };
}

export function getMergedAiApiConfig(config = {}) {
    return createDefaultAiApiConfig(config ?? {});
}

export function getMergedBuiltInTtsConfig(config = {}) {
    return createDefaultBuiltInTtsConfig(config ?? {});
}

export function normalizeBuiltInTtsProviderId(providerId) {
    const normalized = String(providerId ?? '').trim().toLowerCase();
    if (normalized === BUILTIN_TTS_PROVIDER_IDS.SYSTEM) {
        return BUILTIN_TTS_PROVIDER_IDS.SYSTEM;
    }
    if (normalized === BUILTIN_TTS_PROVIDER_IDS.OPENAI) {
        return BUILTIN_TTS_PROVIDER_IDS.OPENAI;
    }
    return BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE;
}

export function getSelectedSpeechProviderId(config = {}) {
    return normalizeBuiltInTtsProviderId(getMergedBuiltInTtsConfig(config).speechProvider);
}

export function getActiveReadAloudProviderId(config = {}) {
    const mergedConfig = getMergedBuiltInTtsConfig(config);
    if (mergedConfig.speechUseForReadAloud) {
        return normalizeBuiltInTtsProviderId(mergedConfig.speechProvider);
    }
    return BUILTIN_TTS_PROVIDER_IDS.SYSTEM;
}

export function getResolvedSystemSpeechConfig(config = {}) {
    const mergedConfig = getMergedBuiltInTtsConfig(config);
    const hasSpeechSynthesis =
        typeof window !== 'undefined' &&
        typeof window.speechSynthesis !== 'undefined' &&
        typeof window.SpeechSynthesisUtterance !== 'undefined';

    return {
        supported: hasSpeechSynthesis,
        voiceURI: mergedConfig.speechSystemVoiceURI || '',
        rate: Number(mergedConfig.speechSystemRate ?? SYSTEM_TTS_DEFAULT_RATE),
        pitch: Number(mergedConfig.speechSystemPitch ?? SYSTEM_TTS_DEFAULT_PITCH),
        volume: Number(mergedConfig.speechSystemVolume ?? SYSTEM_TTS_DEFAULT_VOLUME),
    };
}

export function getResolvedOpenAiSpeechConfig(config = {}, aiApiConfig = null) {
    const mergedConfig = getMergedBuiltInTtsConfig(config);
    const hasAiApiFallback = aiApiConfig && Object.keys(aiApiConfig).length > 0;
    const mergedAiApiConfig = hasAiApiFallback ? getMergedAiApiConfig(aiApiConfig) : null;
    const providerId = mergedAiApiConfig ? getAiProviderId(mergedAiApiConfig) : null;
    const shouldReuseTextApiUrl =
        providerId === AI_PROVIDER_IDS.OPENAI || providerId === AI_PROVIDER_IDS.COMPATIBLE;

    return {
        apiUrl:
            mergedConfig.speechOpenaiApiUrl ||
            (shouldReuseTextApiUrl ? mergedAiApiConfig?.apiUrl : '') ||
            OPENAI_TTS_DEFAULT_URL,
        apiKey: mergedConfig.speechOpenaiApiKey || mergedAiApiConfig?.apiKey || '',
        model: mergedConfig.speechOpenaiModel || OPENAI_TTS_DEFAULT_MODEL,
        voice: mergedConfig.speechOpenaiVoice || OPENAI_TTS_DEFAULT_VOICE,
        speed: Number(mergedConfig.speechOpenaiSpeed ?? 1),
        instructions: mergedConfig.speechOpenaiInstructions || '',
    };
}

export function getResolvedVolcengineSpeechConfig(config = {}) {
    const mergedConfig = getMergedBuiltInTtsConfig(config);
    return {
        appid: mergedConfig.speechVolcengineAppId || '',
        accessToken: mergedConfig.speechVolcengineAccessToken || '',
        cluster: mergedConfig.speechVolcengineCluster || VOLCENGINE_TTS_DEFAULT_CLUSTER,
        voice: mergedConfig.speechVolcengineVoice || VOLCENGINE_TTS_DEFAULT_VOICE,
        speed: Number(mergedConfig.speechVolcengineSpeed ?? 1),
        encoding: mergedConfig.speechVolcengineEncoding || VOLCENGINE_TTS_DEFAULT_ENCODING,
    };
}

export function getResolvedBuiltInTtsConfig(config = {}, providerId, aiApiConfig = null) {
    const normalizedProviderId = normalizeBuiltInTtsProviderId(providerId);
    if (normalizedProviderId === BUILTIN_TTS_PROVIDER_IDS.SYSTEM) {
        return getResolvedSystemSpeechConfig(config);
    }
    if (normalizedProviderId === BUILTIN_TTS_PROVIDER_IDS.OPENAI) {
        return getResolvedOpenAiSpeechConfig(config, aiApiConfig);
    }
    return getResolvedVolcengineSpeechConfig(config);
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
    if (
        searchText.includes('openai') ||
        searchText.includes('gpt') ||
        searchText.includes('/o1') ||
        searchText.includes('/o3') ||
        searchText.includes('/o4')
    ) {
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

export async function ensureBuiltInTtsConfigMigration() {
    await store.load();

    const storedConfig = await store.get(BUILTIN_TTS_CONFIG_KEY);
    if (storedConfig !== null) {
        return getMergedBuiltInTtsConfig(storedConfig);
    }

    const instanceList = await ensureAiApiConfigMigration();
    let migratedConfig = null;

    for (const instanceKey of instanceList) {
        const config = await store.get(instanceKey);
        if (!config || !hasLegacySpeechConfig(config)) {
            continue;
        }
        migratedConfig = getLegacySpeechConfig(config);
        break;
    }

    const nextConfig = getMergedBuiltInTtsConfig(migratedConfig ?? {});
    await store.set(BUILTIN_TTS_CONFIG_KEY, nextConfig);
    await store.save();

    return nextConfig;
}

export async function getBuiltInTtsConfig() {
    return ensureBuiltInTtsConfigMigration();
}

export async function getPreferredAiApiConfig({ includeDisabled = false } = {}) {
    const instanceList = await ensureAiApiConfigMigration();
    let firstConfig = null;

    for (const instanceKey of instanceList) {
        const config = await store.get(instanceKey);
        if (!config) continue;
        const mergedConfig = getMergedAiApiConfig(config);
        const instanceConfig = {
            ...mergedConfig,
            instanceKey,
        };
        if (!firstConfig) {
            firstConfig = instanceConfig;
        }
        if ((mergedConfig.enable ?? true) || includeDisabled) {
            return instanceConfig;
        }
    }

    if (firstConfig) {
        return firstConfig;
    }

    return null;
}

export async function getActiveAiApiConfig() {
    return getPreferredAiApiConfig();
}
