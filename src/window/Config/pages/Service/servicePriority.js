import { isAiTranslateServiceKey } from '../../../../utils/aiTranslate';
import { ServiceSourceType, getServiceName, getServiceSouceType } from '../../../../utils/service_instance';

// Built-in translate services must require user-owned credentials, a local
// runtime, or a user-provided endpoint before they can translate.
export const TRANSLATE_SELF_CONFIGURED_SERVICES = [
    'deepl',
    'azure',
    'baidu',
    'libretranslate',
    'volcengine',
    'tencent',
    'caiyun',
    'youdao',
    'alibaba',
    'transmart',
    'ollama',
    'geminipro',
    'chatglm',
    'niutrans',
];

export const TRANSLATE_SERVICE_PRIORITY = [...TRANSLATE_SELF_CONFIGURED_SERVICES];

// Retired anonymous or zero-config web endpoints. Keep these names for
// migration only; do not expose them as built-in translate services.
export const TRANSLATE_RETIRED_ANONYMOUS_SERVICES = ['google', 'bing', 'yandex', 'deepl_free'];

export const TRANSLATE_DEFAULT_VISIBLE = ['deepl', 'azure'];
export const TRANSLATE_DEFAULT_DISABLED_SERVICES = ['azure'];

export function isTranslateServiceEnabledByDefault(serviceInstanceKey) {
    return !TRANSLATE_DEFAULT_DISABLED_SERVICES.includes(getServiceName(serviceInstanceKey));
}

export const TRANSLATE_SERVICE_CATALOG_VERSION = 6;
// Historical defaults are retained only so old configs can be migrated away
// from retired anonymous services.
export const TRANSLATE_PREVIOUS_DEFAULT_VISIBLE_LISTS = [
    ['google', 'deepl', 'bing', 'openai'],
    ['deepl', 'google', 'bing', 'openai', 'libretranslate', 'azure'],
    ['google', 'deepl', 'bing', 'openai', 'baidu'],
    ['deepl', 'bing', 'yandex', 'google'],
    ['google', 'deepl', 'bing'],
    ['deepl', 'azure', 'yandex'],
];

export const RECOGNIZE_SERVICE_PRIORITY = [
    'system',
    'rapid_ocr',
    'qwen_ocr',
    'baimiao_ocr',
    'doc2x',
    'microsoft_ocr',
    'tesseract',
    'volcengine_multi_lang_ocr',
    'volcengine_ocr',
    'baidu_accurate_ocr',
    'tencent_accurate_ocr',
    'baidu_ocr',
    'tencent_ocr',
    'iflytek_ocr',
];

export const RECOGNIZE_DEFAULT_VISIBLE = ['system', 'rapid_ocr', 'qwen_ocr', 'baimiao_ocr'];

export const RECOGNIZE_LEGACY_DEFAULT = ['system', 'tesseract'];
export const RECOGNIZE_SERVICE_CATALOG_VERSION = 4;
export const RECOGNIZE_PREVIOUS_DEFAULT_VISIBLE_LISTS = [
    ['system', 'rapid_ocr', 'doc2x', 'qwen_ocr', 'baimiao_ocr'],
    ['system', 'rapid_ocr', 'qwen_ocr', 'baimiao_ocr', 'doc2x', 'microsoft_ocr'],
];

function getPriorityIndex(serviceName, priorityList) {
    const index = priorityList.indexOf(serviceName);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function matchesServiceNameList(serviceNames, visibleList) {
    return (
        serviceNames.length === visibleList.length &&
        serviceNames.every((serviceName) => visibleList.includes(serviceName))
    );
}

function filterKnownServiceInstanceKeys(instanceKeys, priorityList) {
    if (!Array.isArray(instanceKeys)) {
        return [];
    }

    return instanceKeys.filter((instanceKey) => {
        if (isAiTranslateServiceKey(instanceKey)) {
            return true;
        }

        if (getServiceSouceType(instanceKey) === ServiceSourceType.PLUGIN) {
            return true;
        }

        return priorityList.includes(getServiceName(instanceKey));
    });
}

export function sortBuiltinServiceItems(items, priorityList) {
    return [...items].sort((left, right) => {
        const priorityDelta = getPriorityIndex(left.key, priorityList) - getPriorityIndex(right.key, priorityList);
        if (priorityDelta !== 0) {
            return priorityDelta;
        }

        return left.label.localeCompare(right.label);
    });
}

export function sortServiceInstanceKeys(instanceKeys, priorityList) {
    return [...instanceKeys]
        .map((instanceKey, index) => ({
            instanceKey,
            index,
            serviceName: getServiceName(instanceKey),
        }))
        .sort((left, right) => {
            const priorityDelta =
                getPriorityIndex(left.serviceName, priorityList) - getPriorityIndex(right.serviceName, priorityList);
            if (priorityDelta !== 0) {
                return priorityDelta;
            }

            return left.index - right.index;
        })
        .map((item) => item.instanceKey);
}

export function migrateServiceInstanceList(instanceKeys, { priorityList, recommendedList, legacyDefaultList }) {
    const filteredInstanceKeys = filterKnownServiceInstanceKeys(instanceKeys, priorityList);
    if (filteredInstanceKeys.length === 0) {
        return [...recommendedList];
    }

    if (
        Array.isArray(legacyDefaultList) &&
        legacyDefaultList.length > 0 &&
        filteredInstanceKeys
            .map((instanceKey) => getServiceName(instanceKey))
            .every((serviceName) => legacyDefaultList.includes(serviceName))
    ) {
        return [...recommendedList];
    }

    return sortServiceInstanceKeys(filteredInstanceKeys, priorityList);
}

export function migrateTranslateRecommendedServices(instanceKeys) {
    if (Array.isArray(instanceKeys)) {
        const originalServiceNames = instanceKeys.map((instanceKey) => getServiceName(instanceKey));
        const matchesPreviousDefault = TRANSLATE_PREVIOUS_DEFAULT_VISIBLE_LISTS.some((visibleList) =>
            matchesServiceNameList(originalServiceNames, visibleList)
        );
        if (matchesPreviousDefault) {
            return [...TRANSLATE_DEFAULT_VISIBLE];
        }
    }

    const filteredInstanceKeys = filterKnownServiceInstanceKeys(instanceKeys, TRANSLATE_SERVICE_PRIORITY);
    if (filteredInstanceKeys.length === 0) {
        return [...TRANSLATE_DEFAULT_VISIBLE];
    }

    const serviceNames = filteredInstanceKeys.map((instanceKey) => getServiceName(instanceKey));
    const matchesFilteredPreviousDefault = TRANSLATE_PREVIOUS_DEFAULT_VISIBLE_LISTS.some((visibleList) =>
        matchesServiceNameList(serviceNames, visibleList)
    );
    if (matchesFilteredPreviousDefault) {
        return [...TRANSLATE_DEFAULT_VISIBLE];
    }

    return filteredInstanceKeys;
}

export function migrateRecognizeRecommendedServices(instanceKeys) {
    if (!Array.isArray(instanceKeys) || instanceKeys.length === 0) {
        return [...RECOGNIZE_DEFAULT_VISIBLE];
    }

    const serviceNames = instanceKeys.map((instanceKey) => getServiceName(instanceKey));
    const matchesPreviousDefault = RECOGNIZE_PREVIOUS_DEFAULT_VISIBLE_LISTS.some((visibleList) =>
        matchesServiceNameList(serviceNames, visibleList)
    );
    if (matchesPreviousDefault) {
        return [...RECOGNIZE_DEFAULT_VISIBLE];
    }

    // Repair the known bad state introduced by an earlier narrowing pass.
    if (serviceNames.length === 1 && serviceNames[0] === 'system') {
        return [...RECOGNIZE_DEFAULT_VISIBLE];
    }

    return instanceKeys;
}
