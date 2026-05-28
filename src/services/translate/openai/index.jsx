import { fetch, Body } from '@tauri-apps/api/http';
import { Language } from './info';
import { defaultRequestArguments } from './Config';
import {
    fetchAiChatCompletions,
    normalizeAiChatCompletionsUrl,
    readAiChatCompletionsMessage,
    readAiChatCompletionsStream,
} from '../../../utils/aiGateway';

function trimTranslationResult(value = '') {
    let target = String(value || '').trim();
    if (target.startsWith('"')) {
        target = target.slice(1);
    }
    if (target.endsWith('"')) {
        target = target.slice(0, -1);
    }
    return target.trim();
}

export async function translate(text, from, to, options) {
    const { config, setResult, detect } = options;

    let { service, requestPath, model, apiKey, stream, promptList, requestArguments } = config;

    if (service === 'openai') {
        requestPath = normalizeAiChatCompletionsUrl(requestPath);
    } else if (!/https?:\/\/.+/.test(requestPath)) {
        requestPath = `https://${requestPath}`;
    }
    const apiUrl = new URL(requestPath);

    // 兼容旧版
    if (promptList === undefined) {
        promptList = [
            {
                role: 'system',
                content:
                    'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.',
            },
            { role: 'user', content: `Translate into $to:\n"""\n$text\n"""` },
        ];
    }

    promptList = promptList.map((item) => {
        return {
            ...item,
            content: item.content
                .replaceAll('$text', text)
                .replaceAll('$from', from)
                .replaceAll('$to', to)
                .replaceAll('$detect', Language[detect]),
        };
    });

    if (service === 'openai') {
        const { response: res } = await fetchAiChatCompletions(
            promptList,
            { apiUrl: apiUrl.href, apiKey, model },
            { stream, requestArguments }
        );

        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            throw `Http Request Error\nHttp Status: ${res.status}\n${errorText}`;
        }

        if (stream) {
            let target = '';
            target = await readAiChatCompletionsStream(res, (delta) => {
                target += delta;
                if (setResult) {
                    setResult(target + '_');
                }
            });
            const trimmedTarget = trimTranslationResult(target);
            setResult?.(trimmedTarget);
            return trimmedTarget;
        }

        const result = await res.json().catch(() => null);
        const target = trimTranslationResult(readAiChatCompletionsMessage(result));
        if (target) {
            return target;
        }
        throw JSON.stringify(result);
    }

    const headers = {
        'Content-Type': 'application/json',
        'api-key': apiKey,
    };
    const body = {
        ...JSON.parse(requestArguments ?? defaultRequestArguments),
        stream: stream,
        messages: promptList,
    };
    if (stream) {
        const res = await window.fetch(apiUrl.href, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });
        if (res.ok) {
            let target = '';
            const reader = res.body.getReader();
            try {
                let temp = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        setResult(target.trim());
                        return target.trim();
                    }
                    const str = new TextDecoder().decode(value);
                    let datas = str.split('data:');
                    for (let data of datas) {
                        if (data.trim() !== '' && data.trim() !== '[DONE]') {
                            try {
                                if (temp !== '') {
                                    data = temp + data.trim();
                                    let result = JSON.parse(data.trim());
                                    if (result.choices[0].delta.content) {
                                        target += result.choices[0].delta.content;
                                        if (setResult) {
                                            setResult(target + '_');
                                        } else {
                                            return '[STREAM]';
                                        }
                                    }
                                    temp = '';
                                } else {
                                    let result = JSON.parse(data.trim());
                                    if (result.choices[0].delta.content) {
                                        target += result.choices[0].delta.content;
                                        if (setResult) {
                                            setResult(target + '_');
                                        } else {
                                            return '[STREAM]';
                                        }
                                    }
                                }
                            } catch {
                                temp = data.trim();
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    } else {
        let res = await fetch(apiUrl.href, {
            method: 'POST',
            headers: headers,
            body: Body.json(body),
        });
        if (res.ok) {
            let result = res.data;
            const { choices } = result;
            if (choices) {
                let target = trimTranslationResult(choices[0].message.content);
                if (target) {
                    return target;
                } else {
                    throw JSON.stringify(choices);
                }
            } else {
                throw JSON.stringify(result);
            }
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    }
}

export * from './Config';
export * from './info';
