import { store } from '../../../utils/store';

export const DEFAULT_STYLE_PROMPTS = {
    strict: {
        name: 'Formal',
        system:
            'You rewrite text with a formal, precise, and restrained tone. Keep the original meaning accurate. Only return the rewritten text.',
    },
    structured: {
        name: 'Structured',
        system:
            'You rewrite text with clearer structure and stronger organization. Improve readability without changing the meaning. Only return the rewritten text.',
    },
    natural: {
        name: 'Natural',
        system:
            'You rewrite text so it sounds natural, fluent, and easy to read while preserving the original meaning. Only return the rewritten text.',
    },
};

export const STYLE_KEYS = Object.keys(DEFAULT_STYLE_PROMPTS);
export const STYLE_NAMES = Object.fromEntries(
    Object.entries(DEFAULT_STYLE_PROMPTS).map(([key, value]) => [key, value.name])
);

async function getSystemPrompt(styleKey) {
    try {
        await store.load();
        const custom = await store.get(`ai_prompt_${styleKey}`);
        if (custom && custom.trim()) {
            return custom.trim();
        }
    } catch {}

    return DEFAULT_STYLE_PROMPTS[styleKey]?.system ?? DEFAULT_STYLE_PROMPTS.strict.system;
}

async function getUserPreference() {
    try {
        await store.load();
        const pref = await store.get('ai_user_preference');
        return pref && pref.trim() ? pref.trim() : '';
    } catch {}

    return '';
}

async function streamOpenAiMessages(messages, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig ?? {};

    if (!apiUrl || !apiKey) {
        onError('API URL or API Key is missing.');
        return;
    }

    let url = apiUrl;
    if (!/https?:\/\/.+/.test(url)) {
        url = `https://${url}`;
    }

    try {
        const res = await window.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: Number(temperature),
                stream: true,
            }),
            signal,
        });

        if (!res.ok) {
            onError(`HTTP ${res.status}: ${await res.text()}`);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;

                    const payload = trimmed.slice(5).trim();
                    if (!payload || payload === '[DONE]') continue;

                    try {
                        const json = JSON.parse(payload);
                        const delta = json?.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullText += delta;
                            onChunk(delta);
                        }
                    } catch {}
                }
            }
        } finally {
            reader.releaseLock();
        }

        onComplete(fullText);
    } catch (error) {
        if (error?.name === 'AbortError') {
            onError(null);
        } else {
            onError(error?.message ?? String(error));
        }
    }
}

export async function lightAiStream(text, styleKey, extraPrompt, apiConfig, onChunk, onComplete, onError, signal) {
    const systemPrompt = await getSystemPrompt(styleKey);
    const preference = await getUserPreference();

    const messages = [
        {
            role: 'system',
            content: preference ? `${systemPrompt}\n\nUser preference:\n${preference}` : systemPrompt,
        },
        {
            role: 'user',
            content: extraPrompt ? `${text}\n\nExtra instruction:\n${extraPrompt}` : text,
        },
    ];

    return streamOpenAiMessages(messages, apiConfig, onChunk, onComplete, onError, signal);
}

export async function translateTextStream(
    text,
    sourceLanguageLabel,
    targetLanguageLabel,
    extraPrompt,
    apiConfig,
    onChunk,
    onComplete,
    onError,
    signal
) {
    const instruction = [
        `Translate the user's text from ${sourceLanguageLabel || 'Auto'} to ${targetLanguageLabel}.`,
        'Keep the meaning accurate and natural.',
        'Only return the translated text.',
        extraPrompt ? `Extra instruction: ${extraPrompt}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    const messages = [
        {
            role: 'system',
            content: 'You are a professional translation assistant.',
        },
        {
            role: 'user',
            content: `${instruction}\n\nText:\n${text}`,
        },
    ];

    return streamOpenAiMessages(messages, apiConfig, onChunk, onComplete, onError, signal);
}
