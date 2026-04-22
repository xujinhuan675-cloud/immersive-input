import { fetch, Body } from '@tauri-apps/api/http';

const ENDPOINTS = {
    cn: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    us: 'https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    intl: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
};

const MULTI_LANGUAGE_TASK_LANGUAGES = new Set([
    'ar',
    'fr',
    'de',
    'it',
    'ja',
    'ko',
    'pt_pt',
    'pt_br',
    'ru',
    'es',
    'vi',
]);

function getEndpoint(region = 'cn') {
    return ENDPOINTS[region] ?? ENDPOINTS.cn;
}

function getTask(taskMode = 'auto', language = 'auto') {
    if (taskMode !== 'auto') {
        return taskMode;
    }

    if (MULTI_LANGUAGE_TASK_LANGUAGES.has(language)) {
        return 'multi_lan';
    }

    return 'text_recognition';
}

function extractText(data) {
    const content = data?.output?.choices?.[0]?.message?.content;

    if (Array.isArray(content)) {
        const texts = content
            .map((item) => item?.text ?? '')
            .filter(Boolean)
            .join('\n')
            .trim();

        if (texts) {
            return texts;
        }
    }

    if (typeof content === 'string' && content.trim()) {
        return content.trim();
    }

    if (typeof data?.output?.text === 'string' && data.output.text.trim()) {
        return data.output.text.trim();
    }

    throw new Error('Qwen OCR response is empty');
}

export async function recognize(base64, language, options = {}) {
    const { config } = options;
    let { apiKey, model, region = 'cn', taskMode = 'auto' } = config;

    if (!apiKey?.trim()) {
        throw new Error('Qwen DashScope API Key is required');
    }

    if (!model?.trim()) {
        model = 'qwen-vl-ocr-latest';
    }

    const res = await fetch(getEndpoint(region), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            'X-DashScope-SSE': 'disable',
        },
        body: Body.json({
            model: model.trim(),
            input: {
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                image: `data:image/png;base64,${base64}`,
                                min_pixels: 3072,
                                max_pixels: 8388608,
                                enable_rotate: false,
                            },
                        ],
                    },
                ],
            },
            parameters: {
                ocr_options: {
                    task: getTask(taskMode, language),
                },
            },
        }),
    });

    if (res.ok) {
        return extractText(res.data);
    }

    const message = res.data?.message || res.data?.code || JSON.stringify(res.data);
    throw new Error(`Qwen OCR request failed (HTTP ${res.status}): ${message}`);
}

export * from './Config';
export * from './info';
