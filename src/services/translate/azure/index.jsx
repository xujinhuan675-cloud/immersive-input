import { fetch, Body } from '@tauri-apps/api/http';

export async function translate(text, from, to, options = {}) {
    const { config } = options;
    const { region, apiKey } = config;

    if (!region?.trim() || !apiKey?.trim()) {
        throw 'Azure Translator region and API key are required. Configure your own Azure Translator resource before using this service.';
    }

    const query = new URLSearchParams({
        'api-version': '3.0',
        to,
    });
    if (from) {
        query.set('from', from);
    }

    const plainText = text.replaceAll('/', '@@');
    const res = await fetch(`https://api.cognitive.microsofttranslator.com/translate?${query.toString()}`, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': apiKey.trim(),
            'Ocp-Apim-Subscription-Region': region.trim(),
            'Content-Type': 'application/json',
            'X-ClientTraceId': crypto.randomUUID(),
        },
        body: Body.json([{ text: plainText }]),
    });

    if (res.ok) {
        const translations = res.data?.[0]?.translations;
        if (translations?.[0]?.text) {
            return translations[0].text.replaceAll('@@', '/').trim();
        }
        throw JSON.stringify(res.data);
    }

    throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
}

export * from './Config';
export * from './info';
