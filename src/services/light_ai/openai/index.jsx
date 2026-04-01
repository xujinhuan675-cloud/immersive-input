/**
 * LightAI service — OpenAI-compatible streaming rewrite/polish
 * Supports 3 style variants: strict / structured / natural
 */

const STYLE_PROMPTS = {
    strict: {
        name: '严谨审慎',
        system: '你是一名专业文字润色专家。请对用户提供的文本进行润色改写，风格要求：避免夸张与绝对化措辞；必要时补充前提/边界；逻辑严密；用词克制精准。仅输出润色后的文本，不要任何解释或前缀。',
    },
    structured: {
        name: '结构清晰',
        system: '你是一名专业文字润色专家。请对用户提供的文本进行润色改写，风格要求：更强调条理与结构，可适当分段或分点；信息层级清晰；便于快速阅读和理解。仅输出润色后的文本，不要任何解释或前缀。',
    },
    natural: {
        name: '口语自然',
        system: '你是一名专业文字润色专家。请对用户提供的文本进行润色改写，风格要求：更自然顺口、易懂，句子流畅；保持内容准确，不要夸张；贴近日常表达习惯。仅输出润色后的文本，不要任何解释或前缀。',
    },
};

export const STYLE_KEYS = Object.keys(STYLE_PROMPTS);
export const STYLE_NAMES = Object.fromEntries(
    Object.entries(STYLE_PROMPTS).map(([k, v]) => [k, v.name])
);

/**
 * Stream-based LightAI rewrite
 * @param {string} text - source text
 * @param {'strict'|'structured'|'natural'} style - rewrite style variant
 * @param {string} extraPrompt - optional extra instruction appended to the user message
 * @param {object} apiConfig - { apiUrl, apiKey, model, temperature }
 * @param {(chunk: string) => void} onChunk - called with each streamed delta
 * @param {(full: string) => void} onComplete - called with full result on finish
 * @param {(err: string) => void} onError - called on error
 * @param {AbortSignal} [signal] - optional abort signal
 */
export async function lightAiStream(text, style, extraPrompt, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;

    if (!apiUrl || !apiKey) {
        onError('API URL 或 API Key 未配置，请前往设置页填写。');
        return;
    }

    const styleInfo = STYLE_PROMPTS[style] || STYLE_PROMPTS.strict;
    const userMessage = extraPrompt
        ? `${text}\n\n附加要求：${extraPrompt}`
        : text;

    const body = JSON.stringify({
        model,
        messages: [
            { role: 'system', content: styleInfo.system },
            { role: 'user', content: userMessage },
        ],
        temperature: Number(temperature),
        stream: true,
    });

    let url = apiUrl;
    if (!/https?:\/\/.+/.test(url)) url = `https://${url}`;

    try {
        const res = await window.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body,
            signal,
        });

        if (!res.ok) {
            const errText = await res.text();
            onError(`[错误] HTTP ${res.status}: ${errText}`);
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
                buffer = lines.pop(); // keep incomplete line
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const json = JSON.parse(data);
                        const delta = json?.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullText += delta;
                            onChunk(delta);
                        }
                    } catch {
                        // incomplete JSON chunk, skip
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        onComplete(fullText);
    } catch (err) {
        if (err.name === 'AbortError') {
            onError('[已取消]');
        } else {
            onError(`[错误] ${err.message}`);
        }
    }
}
