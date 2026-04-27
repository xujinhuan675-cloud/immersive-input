import { getServiceName } from '../../../../utils/service_instance';

export const TRANSLATE_SERVICE_PRIORITY = [
    'google',
    'deepl',
    'bing',
    'openai',
    'baidu',
    'libretranslate',
    'azure',
    'volcengine',
    'tencent',
    'caiyun',
    'youdao',
    'alibaba',
    'transmart',
    'ollama',
    'geminipro',
    'chatglm',
    'lingva',
    'yandex',
    'niutrans',
    'ecdict',
];

export const TRANSLATE_DEFAULT_VISIBLE = ['google', 'deepl', 'bing', 'openai'];

export const TRANSLATE_LEGACY_DEFAULT = ['deepl', 'bing', 'lingva', 'yandex', 'google', 'ecdict'];

export const TRANSLATE_SERVICE_CATALOG_VERSION = 3;
export const TRANSLATE_PREVIOUS_DEFAULT_VISIBLE_LISTS = [
    ['deepl', 'google', 'bing', 'openai', 'libretranslate', 'azure'],
    ['google', 'deepl', 'bing', 'openai', 'baidu'],
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
    if (!Array.isArray(instanceKeys) || instanceKeys.length === 0) {
        return [...recommendedList];
    }

    const serviceNames = instanceKeys.map((instanceKey) => getServiceName(instanceKey));
    if (serviceNames.every((serviceName) => legacyDefaultList.includes(serviceName))) {
        return [...recommendedList];
    }

    return sortServiceInstanceKeys(instanceKeys, priorityList);
}

export function migrateTranslateRecommendedServices(instanceKeys) {
    if (!Array.isArray(instanceKeys) || instanceKeys.length === 0) {
        return [...TRANSLATE_DEFAULT_VISIBLE];
    }

    const serviceNames = instanceKeys.map((instanceKey) => getServiceName(instanceKey));
    const matchesPreviousDefault = TRANSLATE_PREVIOUS_DEFAULT_VISIBLE_LISTS.some((visibleList) =>
        matchesServiceNameList(serviceNames, visibleList)
    );
    if (matchesPreviousDefault) {
        return [...TRANSLATE_DEFAULT_VISIBLE];
    }

    return instanceKeys;
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
