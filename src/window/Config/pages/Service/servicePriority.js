import { getServiceName } from '../../../../utils/service_instance';

export const TRANSLATE_SERVICE_PRIORITY = [
    'deepl',
    'google',
    'bing',
    'openai',
    'libretranslate',
    'azure',
    'volcengine',
    'tencent',
    'baidu',
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
    'bing_dict',
    'cambridge_dict',
    'baidu_field',
];

export const TRANSLATE_DEFAULT_VISIBLE = ['deepl', 'google', 'bing', 'openai', 'libretranslate', 'azure'];

export const TRANSLATE_LEGACY_DEFAULT = ['deepl', 'bing', 'lingva', 'yandex', 'google', 'ecdict'];

export const RECOGNIZE_SERVICE_PRIORITY = [
    'system',
    'rapid_ocr',
    'doc2x',
    'qwen_ocr',
    'baimiao_ocr',
    'microsoft_ocr',
    'tesseract',
    'volcengine_multi_lang_ocr',
    'volcengine_ocr',
    'baidu_accurate_ocr',
    'tencent_accurate_ocr',
    'simple_latex_ocr',
    'iflytek_latex_ocr',
    'baidu_ocr',
    'tencent_ocr',
    'iflytek_ocr',
    'qrcode',
    'baidu_img_ocr',
    'tencent_img_ocr',
    'iflytek_intsig_ocr',
];

export const RECOGNIZE_DEFAULT_VISIBLE = ['system', 'rapid_ocr', 'doc2x', 'qwen_ocr', 'baimiao_ocr'];

export const RECOGNIZE_LEGACY_DEFAULT = ['system', 'tesseract'];

function getPriorityIndex(serviceName, priorityList) {
    const index = priorityList.indexOf(serviceName);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
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
