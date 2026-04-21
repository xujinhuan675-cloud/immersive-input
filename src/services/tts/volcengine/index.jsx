import { Body, fetch } from '@tauri-apps/api/http';
import { nanoid } from 'nanoid';

import {
    VOLCENGINE_TTS_DEFAULT_CLUSTER,
    VOLCENGINE_TTS_DEFAULT_ENCODING,
    VOLCENGINE_TTS_DEFAULT_VOICE,
} from '../../../utils/aiConfig';

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

export async function tts(text, _lang, options = {}) {
    const { config = {} } = options;
    const appid = String(config.appid || '').trim();
    const accessToken = String(config.accessToken || '').trim();

    if (!appid || !accessToken) {
        throw new Error('Volcengine TTS credentials are missing');
    }

    const res = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer;${accessToken}`,
        },
        body: Body.json({
            app: {
                appid,
                token: accessToken,
                cluster: config.cluster || VOLCENGINE_TTS_DEFAULT_CLUSTER,
            },
            user: {
                uid: nanoid(),
            },
            audio: {
                voice_type: config.voice || VOLCENGINE_TTS_DEFAULT_VOICE,
                encoding: config.encoding || VOLCENGINE_TTS_DEFAULT_ENCODING,
                speed_ratio: Number(config.speed ?? 1),
            },
            request: {
                reqid: nanoid(),
                text,
                operation: 'query',
                text_type: 'plain',
            },
        }),
    });

    if (!res.ok) {
        throw new Error(`Volcengine TTS failed: HTTP ${res.status}`);
    }

    const audioBase64 = res.data?.data;
    if (!audioBase64) {
        throw new Error(res.data?.message || 'Volcengine TTS returned empty audio');
    }

    return base64ToBytes(audioBase64);
}

export * from './info';
