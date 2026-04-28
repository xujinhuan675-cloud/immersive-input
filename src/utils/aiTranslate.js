import { fetch, Body } from '@tauri-apps/api/http';
import { getAiApiDisplayName, getMergedAiApiConfig } from './aiConfig';
import {
    getDisplayInstanceName,
    getServiceName,
    getServiceSouceType,
    INSTANCE_NAME_CONFIG_KEY,
    ServiceSourceType,
} from './service_instance';
import { store } from './store';

export const AI_TRANSLATE_SERVICE_PREFIX = 'ai_translate:';
export const AI_TRANSLATE_LINKED_KEY = 'linkedAiInstanceKey';
export const LEGACY_OPENAI_TRANSLATE_SERVICE_NAME = 'openai';

export const AI_TRANSLATE_DEFAULT_PROMPT_LIST = [
    {
        role: 'system',
        content:
            'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.',
    },
    { role: 'user', content: 'Translate into $to:\n"""\n$text\n"""' },
];

export const AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS = JSON.stringify({
    temperature: 0.1,
    top_p: 0.99,
    frequency_penalty: 0,
    presence_penalty: 0,
});

export const AI_TRANSLATE_LANGUAGE = {
    auto: 'Auto',
    zh_cn: 'Simplified Chinese',
    zh_tw: 'Traditional Chinese',
    yue: 'Cantonese',
    ja: 'Japanese',
    en: 'English',
    ko: 'Korean',
    fr: 'French',
    es: 'Spanish',
    ru: 'Russian',
    de: 'German',
    it: 'Italian',
    tr: 'Turkish',
    pt_pt: 'Portuguese',
    pt_br: 'Brazilian Portuguese',
    vi: 'Vietnamese',
    id: 'Indonesian',
    th: 'Thai',
    ms: 'Malay',
    ar: 'Arabic',
    hi: 'Hindi',
    mn_mo: 'Mongolian',
    mn_cy: 'Mongolian(Cyrillic)',
    km: 'Khmer',
    nb_no: 'Norwegian Bokmal',
    nn_no: 'Norwegian Nynorsk',
    fa: 'Persian',
    sv: 'Swedish',
    pl: 'Polish',
    nl: 'Dutch',
    uk: 'Ukrainian',
    he: 'Hebrew',
};

const AI_TRANSLATE_CONFIG_KEYS = [
    INSTANCE_NAME_CONFIG_KEY,
    AI_TRANSLATE_LINKED_KEY,
    'enable',
    'hidden',
    'stream',
    'promptList',
    'requestArguments',
];

function encodeAiTranslateInstanceKey(aiServiceInstanceKey) {
    return String(aiServiceInstanceKey ?? '').replaceAll('@', ':');
}

function decodeAiTranslateInstanceKey(encodedKey) {
    return String(encodedKey ?? '').replaceAll(':', '@');
}

function pickAiTranslateConfigKeys(config = {}) {
    return AI_TRANSLATE_CONFIG_KEYS.reduce((result, key) => {
        if (config?.[key] !== undefined) {
            result[key] = config[key];
        }
        return result;
    }, {});
}

export function isAiTranslateServiceKey(serviceInstanceKey) {
    return (
        typeof serviceInstanceKey === 'string' &&
        serviceInstanceKey.startsWith(AI_TRANSLATE_SERVICE_PREFIX)
    );
}

export function createAiTranslateServiceKey(aiServiceInstanceKey) {
    return `${AI_TRANSLATE_SERVICE_PREFIX}${encodeAiTranslateInstanceKey(aiServiceInstanceKey)}`;
}

export function isLegacyOpenAiTranslateServiceKey(serviceInstanceKey) {
    return (
        typeof serviceInstanceKey === 'string' &&
        !isAiTranslateServiceKey(serviceInstanceKey) &&
        getServiceSouceType(serviceInstanceKey) === ServiceSourceType.BUILDIN &&
        getServiceName(serviceInstanceKey) === LEGACY_OPENAI_TRANSLATE_SERVICE_NAME
    );
}

export function getLinkedAiServiceInstanceKey(serviceInstanceKey, config = null) {
    if (config?.[AI_TRANSLATE_LINKED_KEY]) {
        return config[AI_TRANSLATE_LINKED_KEY];
    }

    if (!isAiTranslateServiceKey(serviceInstanceKey)) {
        return '';
    }

    return decodeAiTranslateInstanceKey(
        String(serviceInstanceKey).slice(AI_TRANSLATE_SERVICE_PREFIX.length)
    );
}

export function createDefaultAiTranslateConfig(aiServiceInstanceKey = '', overrides = {}) {
    const resolvedLinkedKey =
        overrides?.[AI_TRANSLATE_LINKED_KEY] ??
        getLinkedAiServiceInstanceKey(aiServiceInstanceKey) ??
        '';

    return {
        [INSTANCE_NAME_CONFIG_KEY]: '',
        [AI_TRANSLATE_LINKED_KEY]: resolvedLinkedKey,
        enable: true,
        hidden: false,
        stream: false,
        promptList: AI_TRANSLATE_DEFAULT_PROMPT_LIST,
        requestArguments: AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS,
        ...pickAiTranslateConfigKeys(overrides),
    };
}

export function getMergedAiTranslateConfig(config = {}, aiServiceInstanceKey = '') {
    return createDefaultAiTranslateConfig(aiServiceInstanceKey, config ?? {});
}

export function getAiTranslateDisplayName(bindingConfig = {}, aiConfig = {}, fallbackName = 'AI Translate') {
    return getDisplayInstanceName(bindingConfig?.[INSTANCE_NAME_CONFIG_KEY], () =>
        getAiApiDisplayName(aiConfig, fallbackName)
    );
}

export function getAiTranslateRuntimeConfig(bindingConfig = {}, aiConfig = {}) {
    const mergedBindingConfig = getMergedAiTranslateConfig(
        bindingConfig,
        getLinkedAiServiceInstanceKey('', bindingConfig)
    );
    const mergedAiConfig = getMergedAiApiConfig(aiConfig);

    return {
        service: 'openai',
        requestPath: mergedAiConfig.apiUrl,
        model: mergedAiConfig.model,
        apiKey: mergedAiConfig.apiKey,
        stream: mergedBindingConfig.stream,
        promptList: mergedBindingConfig.promptList,
        requestArguments: mergedBindingConfig.requestArguments,
    };
}

export async function translateWithAiBinding(text, from, to, bindingConfig = {}, aiConfig = {}, options = {}) {
    const { config, setResult, detect } = {
        ...options,
        config: getAiTranslateRuntimeConfig(bindingConfig, aiConfig),
    };

    let { service, requestPath, model, apiKey, stream, promptList, requestArguments } = config;

    if (!/https?:\/\/.+/.test(requestPath)) {
        requestPath = `https://${requestPath}`;
    }
    const apiUrl = new URL(requestPath);

    if (service === 'openai' && !apiUrl.pathname.endsWith('/chat/completions')) {
        apiUrl.pathname += apiUrl.pathname.endsWith('/') ? '' : '/';
        apiUrl.pathname += 'v1/chat/completions';
    }

    promptList = (promptList ?? AI_TRANSLATE_DEFAULT_PROMPT_LIST).map((item) => ({
        ...item,
        content: item.content
            .replaceAll('$text', text)
            .replaceAll('$from', from)
            .replaceAll('$to', to)
            .replaceAll('$detect', AI_TRANSLATE_LANGUAGE[detect]),
    }));

    const headers =
        service === 'openai'
            ? {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
              }
            : {
                  'Content-Type': 'application/json',
                  'api-key': apiKey,
              };
    const body = {
        ...JSON.parse(requestArguments ?? AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS),
        stream,
        messages: promptList,
    };

    if (service === 'openai') {
        body.model = model;
    }

    if (stream) {
        const res = await window.fetch(apiUrl.href, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw `Http Request Error\nHttp Status: ${res.status}`;
        }

        let target = '';
        const reader = res.body.getReader();
        try {
            let temp = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    setResult?.(target.trim());
                    return target.trim();
                }
                const str = new TextDecoder().decode(value);
                const datas = str.split('data:');
                for (let data of datas) {
                    if (data.trim() === '' || data.trim() === '[DONE]') {
                        continue;
                    }
                    try {
                        if (temp !== '') {
                            data = temp + data.trim();
                            const result = JSON.parse(data.trim());
                            if (result.choices[0].delta.content) {
                                target += result.choices[0].delta.content;
                                if (setResult) {
                                    setResult(target + '_');
                                } else {
                                    return '[STREAM]';
                                }
                            }
                            temp = '';
                        } else {
                            const result = JSON.parse(data.trim());
                            if (result.choices[0].delta.content) {
                                target += result.choices[0].delta.content;
                                if (setResult) {
                                    setResult(target + '_');
                                } else {
                                    return '[STREAM]';
                                }
                            }
                        }
                    } catch {
                        temp = data.trim();
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    const res = await fetch(apiUrl.href, {
        method: 'POST',
        headers,
        body: Body.json(body),
    });
    if (!res.ok) {
        throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
    }

    const { choices } = res.data ?? {};
    if (!choices) {
        throw JSON.stringify(res.data);
    }

    let target = choices[0]?.message?.content?.trim();
    if (!target) {
        throw JSON.stringify(choices);
    }
    if (target.startsWith('"')) {
        target = target.slice(1);
    }
    if (target.endsWith('"')) {
        target = target.slice(0, -1);
    }
    return target.trim();
}

export function getAiTranslateLanguageEnum() {
    return AI_TRANSLATE_LANGUAGE;
}

function pickLegacyOpenAiTranslateOverrides(config = {}) {
    return {
        [INSTANCE_NAME_CONFIG_KEY]: config?.[INSTANCE_NAME_CONFIG_KEY] ?? '',
        enable: config?.enable ?? true,
        stream: config?.stream ?? false,
        promptList: config?.promptList ?? AI_TRANSLATE_DEFAULT_PROMPT_LIST,
        requestArguments: config?.requestArguments ?? AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS,
    };
}

export async function ensureAiTranslateBindings(
    translateServiceInstanceList = [],
    aiApiServiceInstanceList = [],
    options = {}
) {
    await store.load();

    const currentList = Array.isArray(translateServiceInstanceList)
        ? [...translateServiceInstanceList]
        : [];
    const legacySourceList = Array.isArray(options?.legacySourceList)
        ? options.legacySourceList
        : currentList;
    const aiInstanceList = Array.isArray(aiApiServiceInstanceList)
        ? aiApiServiceInstanceList.filter(Boolean)
        : [];
    const aiInstanceKeySet = new Set(aiInstanceList);
    const legacyOpenAiInstanceKeys = legacySourceList.filter(isLegacyOpenAiTranslateServiceKey);
    const legacyOpenAiConfigQueue = [];
    const nextList = [];
    let changed = false;
    let storeChanged = false;

    for (const legacyInstanceKey of legacyOpenAiInstanceKeys) {
        const legacyConfig = (await store.get(legacyInstanceKey)) ?? {};
        legacyOpenAiConfigQueue.push({
            key: legacyInstanceKey,
            overrides: pickLegacyOpenAiTranslateOverrides(legacyConfig),
        });
    }

    for (const serviceInstanceKey of currentList) {
        if (isLegacyOpenAiTranslateServiceKey(serviceInstanceKey)) {
            changed = true;
            continue;
        }

        if (!isAiTranslateServiceKey(serviceInstanceKey)) {
            nextList.push(serviceInstanceKey);
            continue;
        }

        const storedConfig = await store.get(serviceInstanceKey);
        const mergedConfig = getMergedAiTranslateConfig(storedConfig, serviceInstanceKey);
        const linkedAiInstanceKey = getLinkedAiServiceInstanceKey(serviceInstanceKey, mergedConfig);
        const needsRepair =
            storedConfig === null ||
            AI_TRANSLATE_CONFIG_KEYS.some((key) => storedConfig?.[key] === undefined) ||
            storedConfig?.[AI_TRANSLATE_LINKED_KEY] !== linkedAiInstanceKey;

        if (needsRepair) {
            await store.set(serviceInstanceKey, mergedConfig);
            storeChanged = true;
        }

        if (!linkedAiInstanceKey || !aiInstanceKeySet.has(linkedAiInstanceKey) || mergedConfig.hidden) {
            changed = true;
            continue;
        }

        nextList.push(serviceInstanceKey);
    }

    for (const aiServiceInstanceKey of aiInstanceList) {
        const bindingKey = createAiTranslateServiceKey(aiServiceInstanceKey);
        const storedConfig = await store.get(bindingKey);
        const legacyOverrides =
            storedConfig === null ? legacyOpenAiConfigQueue.shift()?.overrides ?? {} : {};
        const mergedConfig = getMergedAiTranslateConfig(
            storedConfig ?? legacyOverrides,
            aiServiceInstanceKey
        );
        const needsRepair =
            storedConfig === null ||
            AI_TRANSLATE_CONFIG_KEYS.some((key) => storedConfig?.[key] === undefined) ||
            storedConfig?.[AI_TRANSLATE_LINKED_KEY] !== aiServiceInstanceKey;

        if (needsRepair) {
            await store.set(bindingKey, mergedConfig);
            storeChanged = true;
        }

        if (!mergedConfig.hidden && !nextList.includes(bindingKey)) {
            nextList.push(bindingKey);
            changed = true;
        }
    }

    if (storeChanged) {
        await store.save();
    }

    if (aiInstanceList.length > 0) {
        for (const legacyInstanceKey of legacyOpenAiInstanceKeys) {
            if (store.has(legacyInstanceKey)) {
                store.delete(legacyInstanceKey);
                storeChanged = true;
            }
        }
        if (storeChanged) {
            await store.save();
        }
    }

    return {
        nextList,
        changed,
    };
}
