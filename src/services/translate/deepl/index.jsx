import { fetch, Body } from '@tauri-apps/api/http';

export async function translate(text, from, to, options = {}) {
    const { config } = options;

    const serviceType = config['type'] === 'deeplx' ? 'deeplx' : 'api';
    if (serviceType === 'deeplx') {
        return translate_by_deeplx(text, from, to, config.customUrl);
    }

    return translate_by_key(text, from, to, config.authKey);
}

async function translate_by_deeplx(text, from, to, url) {
    if (!url?.trim()) {
        throw 'DeepLX URL is required. Configure your own DeepLX endpoint before using this service.';
    }

    let requestUrl = url.trim();
    if (!/^https?:\/\//.test(requestUrl)) {
        requestUrl = `https://${requestUrl}`;
    }

    let res = await fetch(requestUrl, {
        method: 'POST',
        body: Body.json({
            source_lang: from,
            target_lang: to,
            text: text,
        }),
    });

    if (res.ok) {
        const result = res.data;
        if (result['data']) {
            return result['data'];
        } else {
            throw JSON.stringify(result);
        }
    } else {
        throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
    }
}

async function translate_by_key(text, from, to, key) {
    if (!key?.trim()) {
        throw 'DeepL Auth Key is required. Built-in free mode has been removed; configure an Auth Key or a DeepLX URL.';
    }

    const authKey = key.trim();
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `DeepL-Auth-Key ${authKey}`,
    };
    let body = {
        text: [text],
        target_lang: to,
    };
    if (from !== 'auto') {
        body['source_lang'] = from;
    }
    let url;
    if (authKey.endsWith(':fx')) {
        url = 'https://api-free.deepl.com/v2/translate';
    } else if (authKey.endsWith(':dp')) {
        url = 'https://api.deepl-pro.com/v2/translate';
    } else {
        url = 'https://api.deepl.com/v2/translate';
    }
    let res = await fetch(url, {
        method: 'POST',
        body: Body.json(body),
        headers: headers,
    });

    if (res.ok) {
        const result = res.data;
        if ((result.translations, result.translations[0])) {
            return result.translations[0].text.trim();
        } else {
            throw JSON.stringify(result);
        }
    } else {
        if (res.data.error) {
            throw `Status Code: ${res.status}\n${res.data.error.message}`;
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    }
}

export * from './Config';
export * from './info';
