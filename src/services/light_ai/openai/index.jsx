import { store } from '../../../utils/store';
import { streamAiChatCompletions } from '../../../utils/aiGateway';

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

async function getExtraPromptRules() {
    try {
        await store.load();
        const rules = await store.get('ai_extra_prompt_rules');

        if (!Array.isArray(rules)) {
            return [];
        }

        return rules
            .map((rule) => (typeof rule === 'string' ? rule.trim() : ''))
            .filter(Boolean);
    } catch {}

    return [];
}

export async function streamOpenAiMessages(
    messages,
    apiConfig,
    onChunk,
    onComplete,
    onError,
    signal,
    retryOptions
) {
    return streamAiChatCompletions(
        messages,
        apiConfig,
        onChunk,
        onComplete,
        onError,
        signal,
        retryOptions
    );
}

export async function lightAiStream(
    text,
    styleKey,
    extraPrompt,
    apiConfig,
    onChunk,
    onComplete,
    onError,
    signal,
    retryOptions
) {
    const systemPrompt = await getSystemPrompt(styleKey);
    const preference = await getUserPreference();
    const extraPromptRules = await getExtraPromptRules();
    const systemContent = [
        systemPrompt,
        preference ? `User preference:\n${preference}` : '',
        extraPromptRules.length ? `Additional prompt rules:\n${extraPromptRules.join('\n')}` : '',
    ]
        .filter(Boolean)
        .join('\n\n');

    const messages = [
        {
            role: 'system',
            content: systemContent,
        },
        {
            role: 'user',
            content: extraPrompt ? `${text}\n\nExtra instruction:\n${extraPrompt}` : text,
        },
    ];

    return streamOpenAiMessages(messages, apiConfig, onChunk, onComplete, onError, signal, retryOptions);
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
    signal,
    retryOptions
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

    return streamOpenAiMessages(messages, apiConfig, onChunk, onComplete, onError, signal, retryOptions);
}
