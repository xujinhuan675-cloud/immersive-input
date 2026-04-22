import { fetch, Body } from '@tauri-apps/api/http';

export async function translate(text, from, to, options = {}) {
    const { config } = options;
    let { url, apiKey } = config;

    if (!url || url.trim() === '') {
        url = 'https://translate.atomjump.com/';
    }

    if (!/^https?:\/\//.test(url)) {
        url = `https://${url}`;
    }

    if (!url.endsWith('/')) {
        url += '/';
    }

    const body = {
        q: text,
        source: from,
        target: to,
        format: 'text',
    };

    if (apiKey?.trim()) {
        body.api_key = apiKey.trim();
    }

    const res = await fetch(`${url}translate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: Body.json(body),
    });

    if (res.ok) {
        if (res.data?.translatedText) {
            return res.data.translatedText.trim();
        }
        throw JSON.stringify(res.data);
    }

    throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
}

export * from './Config';
export * from './info';
