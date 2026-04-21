import { Body, fetch } from '@tauri-apps/api/http';

import {
    OPENAI_TTS_DEFAULT_MODEL,
    OPENAI_TTS_DEFAULT_URL,
    OPENAI_TTS_DEFAULT_VOICE,
} from '../../../utils/aiConfig';

function normalizeRequestPath(requestPath = OPENAI_TTS_DEFAULT_URL) {
    let nextRequestPath = String(requestPath || OPENAI_TTS_DEFAULT_URL).trim();
    if (!nextRequestPath) {
        nextRequestPath = OPENAI_TTS_DEFAULT_URL;
    }
    if (!/^https?:\/\//.test(nextRequestPath)) {
        nextRequestPath = `https://${nextRequestPath}`;
    }

    const url = new URL(nextRequestPath);
    if (url.pathname.endsWith('/audio/speech')) {
        return url.toString();
    }

    if (url.pathname.endsWith('/chat/completions')) {
        url.pathname = url.pathname.replace(/\/chat\/completions$/, '/audio/speech');
        return url.toString();
    }

    if (url.pathname.endsWith('/v1')) {
        url.pathname = `${url.pathname}/audio/speech`;
        return url.toString();
    }

    url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/audio/speech`;
    return url.toString();
}

export async function tts(text, _lang, options = {}) {
    const { config = {} } = options;
    const apiKey = String(config.apiKey || '').trim();
    if (!apiKey) {
        throw new Error('OpenAI TTS API key is missing');
    }

    const body = {
        model: config.model || OPENAI_TTS_DEFAULT_MODEL,
        input: text,
        voice: config.voice || OPENAI_TTS_DEFAULT_VOICE,
        response_format: 'mp3',
        speed: Number(config.speed ?? 1),
    };

    const instructions = String(config.instructions || '').trim();
    if (instructions) {
        body.instructions = instructions;
    }

    const res = await fetch(normalizeRequestPath(config.apiUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: Body.json(body),
        responseType: 3,
    });

    if (!res.ok) {
        throw new Error(`OpenAI TTS failed: HTTP ${res.status}`);
    }

    return res.data;
}

export * from './info';
