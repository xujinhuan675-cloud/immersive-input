import toast, { Toaster } from 'react-hot-toast';
import { CardBody, Input, Slider, Button } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React from 'react';

import { useConfig } from '../../../../../hooks/useConfig';
import { useToastStyle } from '../../../../../hooks';

export default function AIConfig() {
    const toastStyle = useToastStyle();
    const [apiUrl, setApiUrl] = useConfig('ai_api_url', 'https://api.openai.com/v1/chat/completions');
    const [apiKey, setApiKey] = useConfig('ai_api_key', '');
    const [model, setModel] = useConfig('ai_model', 'gpt-4o-mini');
    const [temperature, setTemperature] = useConfig('ai_temperature', 0.7);

    const testConnection = async () => {
        if (!apiUrl || !apiKey || !model) {
            toast.error('请先填写 API URL、API Key 和模型名称', { style: toastStyle });
            return;
        }
        const id = toast.loading('测试中...', { style: toastStyle });
        try {
            let url = apiUrl;
            if (!/https?:\/\/.+/.test(url)) url = `https://${url}`;
            const res = await window.fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: '请回复"OK"' }],
                    temperature: 0.1,
                    stream: false,
                }),
            });
            const data = await res.json();
            if (res.ok && data?.choices?.[0]?.message?.content) {
                toast.success(`连接成功：${data.choices[0].message.content.slice(0, 30)}`, { id, style: toastStyle });
            } else {
                toast.error(`失败：${JSON.stringify(data).slice(0, 80)}`, { id, style: toastStyle });
            }
        } catch (e) {
            toast.error(`连接异常：${e.message}`, { id, style: toastStyle });
        }
    };

    return (
        <div className='p-[10px] max-w-[600px]'>
            <Toaster />
            <Card>
                <CardBody>
                    <h3 className='text-[15px] font-bold mb-[14px]'>AI API 配置</h3>
                    <div className='space-y-[12px]'>
                        <Input
                            label='API URL'
                            placeholder='https://api.openai.com/v1/chat/completions'
                            value={apiUrl ?? ''}
                            onValueChange={(v) => setApiUrl(v)}
                            size='sm'
                            variant='bordered'
                            description='兼容 OpenAI 接口格式（硅基流动、DeepSeek 等均可）'
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
                            label='模型'
                            placeholder='gpt-4o-mini'
                            value={model ?? ''}
                            onValueChange={(v) => setModel(v)}
                            size='sm'
                            variant='bordered'
                            description='例：gpt-4o-mini、Qwen/Qwen2.5-7B-Instruct、deepseek-chat'
                        />
                        <div>
                            <div className='text-[13px] text-default-500 mb-1'>
                                温度（Temperature）：{Number(temperature ?? 0.7).toFixed(1)}
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
                            测试连接
                        </Button>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
