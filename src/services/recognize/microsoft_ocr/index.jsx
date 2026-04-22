import { fetch, Body } from '@tauri-apps/api/http';

import { base64ToBytes } from '../shared';

function mergeWords(words = []) {
    let lineText = '';
    let prevWordIsChinese = false;

    for (let i = 0; i < words.length; i += 1) {
        const currentWord = words[i]?.text ?? '';
        const isChineseWord = /^[\u4e00-\u9fa5]+$/.test(currentWord);

        if (i > 0) {
            lineText += isChineseWord && prevWordIsChinese ? currentWord : ` ${currentWord}`;
        } else {
            lineText += currentWord;
        }

        prevWordIsChinese = isChineseWord;
    }

    return lineText.trim();
}

export async function recognize(base64, language, options = {}) {
    const { config } = options;
    let { subscription_key: subscriptionKey, endpoint } = config;

    if (!subscriptionKey?.trim()) {
        throw new Error('Subscription Key is required');
    }
    if (!endpoint?.trim()) {
        throw new Error('Endpoint is required');
    }
    if (!/^https?:\/\//.test(endpoint)) {
        endpoint = `https://${endpoint}`;
    }

    const res = await fetch(`${endpoint.replace(/\/$/, '')}/vision/v3.2/ocr`, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': subscriptionKey.trim(),
            'Content-Type': 'application/octet-stream',
        },
        query: {
            language,
            detectOrientation: 'true',
            'model-version': 'latest',
        },
        body: Body.bytes(base64ToBytes(base64)),
    });

    if (res.ok) {
        const regions = res.data?.regions;
        if (!regions) {
            throw JSON.stringify(res.data);
        }

        return regions
            .flatMap((region) => region.lines ?? [])
            .map((line) => mergeWords(line.words))
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
}

export * from './Config';
export * from './info';
