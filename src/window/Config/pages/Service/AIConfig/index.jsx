import toast, { Toaster } from 'react-hot-toast';
import { CardBody, Input, Slider, Button } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React from 'react';

import { useConfig } from '../../../../../hooks/useConfig';
import { useToastStyle } from '../../../../../hooks';
import { useTranslation } from 'react-i18next';

export default function AIConfig() {
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [apiUrl, setApiUrl] = useConfig('ai_api_url', 'https://api.openai.com/v1/chat/completions');
    const [apiKey, setApiKey] = useConfig('ai_api_key', '');
    const [model, setModel] = useConfig('ai_model', 'gpt-4o-mini');
    const [temperature, setTemperature] = useConfig('ai_temperature', 0.7);

    const testConnection = async () => {
        if (!apiUrl || !apiKey || !model) {
            toast.error(t('ai_config.test_error_fields'), { style: toastStyle });
            return;
        }
        const id = toast.loading(t('ai_config.test_loading'), { style: toastStyle });
        try {
            let url = apiUrl;
            if (!/https?:\/\/.+/.test(url)) url = `https://${url}`;
            const res = await window.fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: 'Reply with "OK"' }],
                    temperature: 0.1,
                    stream: false,
                }),
            });
            const data = await res.json();
            if (res.ok && data?.choices?.[0]?.message?.content) {
                toast.success(t('ai_config.test_success', { msg: data.choices[0].message.content.slice(0, 30) }), { id, style: toastStyle });
            } else {
                toast.error(t('ai_config.test_failed', { msg: JSON.stringify(data).slice(0, 80) }), { id, style: toastStyle });
            }
        } catch (e) {
            toast.error(t('ai_config.test_error', { msg: e.message }), { id, style: toastStyle });
        }
    };

    return (
        <div className='p-[10px] max-w-[600px]'>
            <Toaster />
            <Card>
                <CardBody>
                    <h3 className='text-[15px] font-bold mb-[14px]'>{t('ai_config.title')}</h3>
                    <div className='space-y-[12px]'>
                        <Input
                            label='API URL'
                            placeholder='https://api.openai.com/v1/chat/completions'
                            value={apiUrl ?? ''}
                            onValueChange={(v) => setApiUrl(v)}
                            size='sm'
                            variant='bordered'
                            description={t('ai_config.url_desc')}
                        />
                        <Input
                            label='API Key'
                            placeholder='sk-...'
                            value={apiKey ?? ''}
                            onValueChange={(v) => setApiKey(v)}
                            size='sm'
                            variant='bordered'
                            type='password'
                        />
                        <Input
                            label={t('ai_config.model_label')}
                            placeholder='gpt-4o-mini'
                            value={model ?? ''}
                            onValueChange={(v) => setModel(v)}
                            size='sm'
                            variant='bordered'
                            description={t('ai_config.model_desc')}
                        />
                        <div>
                            <div className='text-[13px] text-default-500 mb-1'>
                                {t('ai_config.temperature', { n: Number(temperature ?? 0.7).toFixed(1) })}
                            </div>
                            <Slider
                                size='sm'
                                step={0.1}
                                minValue={0}
                                maxValue={2}
                                value={Number(temperature ?? 0.7)}
                                onChange={(v) => setTemperature(v)}
                                className='max-w-md'
                            />
                        </div>
                        <Button size='sm' variant='bordered' onPress={testConnection}>
                            {t('ai_config.test_btn')}
                        </Button>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
