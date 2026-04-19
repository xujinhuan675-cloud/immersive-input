import { Modal, ModalContent, ModalHeader, ModalBody, Button, Input, Slider, Spacer } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { LuBrainCircuit } from 'react-icons/lu';

import { useConfig } from '../../../../../../hooks/useConfig';
import { useToastStyle } from '../../../../../../hooks';
import {
    AI_API_DEFAULT_MODEL,
    AI_API_DEFAULT_URL,
    AI_PROVIDER_OPTIONS,
    createDefaultAiApiConfig,
    inferAiProviderId,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../../../../utils/service_instance';

async function testAiConnection(config) {
    let url = config.apiUrl;
    if (!/https?:\/\/.+/.test(url)) {
        url = `https://${url}`;
    }

    const response = await window.fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: 'Reply with "OK"' }],
            temperature: 0.1,
            stream: false,
        }),
    });

    const data = await response.json();
    if (response.ok && data?.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
    }

    throw new Error(JSON.stringify(data).slice(0, 120));
}

function AIApiConfigForm(props) {
    const { instanceKey, updateServiceInstanceList, onClose } = props;
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [isLoading, setIsLoading] = useState(false);
    const [aiConfig, setAiConfig] = useConfig(instanceKey, createDefaultAiApiConfig(), { sync: false });

    if (aiConfig) {
        const mergedConfig = getMergedAiApiConfig(aiConfig);
        const needsRepair =
            aiConfig[INSTANCE_NAME_CONFIG_KEY] === undefined ||
            aiConfig.provider === undefined ||
            aiConfig.apiUrl === undefined ||
            aiConfig.apiKey === undefined ||
            aiConfig.model === undefined ||
            aiConfig.temperature === undefined ||
            aiConfig.enable === undefined;

        if (needsRepair) {
            setAiConfig(mergedConfig);
        }
    }

    return (
        aiConfig !== null && (
            <form
                onSubmit={async (event) => {
                    event.preventDefault();

                    const nextConfig = getMergedAiApiConfig(aiConfig);
                    if (!nextConfig.apiUrl || !nextConfig.apiKey || !nextConfig.model) {
                        toast.error(t('ai_config.test_error_fields'), { style: toastStyle });
                        return;
                    }

                    setIsLoading(true);
                    try {
                        const message = await testAiConnection(nextConfig);
                        setAiConfig(nextConfig, true);
                        updateServiceInstanceList(instanceKey);
                        toast.success(
                            t('ai_config.test_success', { msg: String(message).slice(0, 30) }),
                            { style: toastStyle }
                        );
                        onClose();
                    } catch (error) {
                        toast.error(
                            t('ai_config.test_failed', { msg: error?.message ?? String(error) }),
                            { style: toastStyle }
                        );
                    } finally {
                        setIsLoading(false);
                    }
                }}
            >
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={aiConfig[INSTANCE_NAME_CONFIG_KEY] ?? ''}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[55%]',
                        }}
                        onValueChange={(value) => {
                            setAiConfig({
                                ...aiConfig,
                                [INSTANCE_NAME_CONFIG_KEY]: value,
                            });
                        }}
                    />
                </div>

                <div className='config-item'>
                    <div className='my-auto text-[length:--nextui-font-size-medium]'>
                        {t('ai_config.provider', { defaultValue: 'Provider' })}
                    </div>
                    <div className='w-full max-w-[55%]'>
                        <select
                            value={aiConfig.provider || inferAiProviderId(aiConfig)}
                            className='w-full rounded-[14px] border border-default-200 bg-default-50 px-3 py-2 text-sm outline-none transition-colors hover:border-default-300 focus:border-primary'
                            onChange={(event) => {
                                setAiConfig({
                                    ...aiConfig,
                                    provider: event.target.value,
                                });
                            }}
                        >
                            {AI_PROVIDER_OPTIONS.map((option) => (
                                <option
                                    key={option.key}
                                    value={option.key}
                                >
                                    {t(`ai_config.providers.${option.key}`, {
                                        defaultValue: option.label,
                                    })}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className='config-item'>
                    <Input
                        label='API URL'
                        labelPlacement='outside-left'
                        placeholder={AI_API_DEFAULT_URL}
                        value={aiConfig.apiUrl ?? ''}
                        variant='bordered'
                        description={t('ai_config.url_desc')}
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[55%]',
                        }}
                        onValueChange={(value) => {
                            setAiConfig({
                                ...aiConfig,
                                apiUrl: value,
                            });
                        }}
                    />
                </div>

                <div className='config-item'>
                    <Input
                        label='API Key'
                        labelPlacement='outside-left'
                        type='password'
                        placeholder='sk-...'
                        value={aiConfig.apiKey ?? ''}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[55%]',
                        }}
                        onValueChange={(value) => {
                            setAiConfig({
                                ...aiConfig,
                                apiKey: value,
                            });
                        }}
                    />
                </div>

                <div className='config-item'>
                    <Input
                        label={t('ai_config.model_label')}
                        labelPlacement='outside-left'
                        placeholder={AI_API_DEFAULT_MODEL}
                        value={aiConfig.model ?? ''}
                        variant='bordered'
                        description={t('ai_config.model_desc')}
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[55%]',
                        }}
                        onValueChange={(value) => {
                            setAiConfig({
                                ...aiConfig,
                                model: value,
                            });
                        }}
                    />
                </div>

                <div className='config-item items-start'>
                    <div className='my-auto'>
                        {t('ai_config.temperature', { n: Number(aiConfig.temperature ?? 0.7).toFixed(1) })}
                    </div>
                    <div className='w-full max-w-[55%] pt-[6px]'>
                        <Slider
                            size='sm'
                            step={0.1}
                            minValue={0}
                            maxValue={2}
                            value={Number(aiConfig.temperature ?? 0.7)}
                            onChange={(value) => {
                                setAiConfig({
                                    ...aiConfig,
                                    temperature: Array.isArray(value) ? value[0] : value,
                                });
                            }}
                        />
                    </div>
                </div>

                <div className='mt-[20px] flex justify-end gap-[8px]'>
                    <Button
                        type='button'
                        color='danger'
                        variant='light'
                        onPress={onClose}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type='submit'
                        isLoading={isLoading}
                        color='primary'
                    >
                        {isLoading ? t('ai_config.test_loading') : t('common.save')}
                    </Button>
                </div>
            </form>
        )
    );
}

export default function ConfigModal(props) {
    const { serviceInstanceKey, isOpen, onOpenChange, updateServiceInstanceList } = props;
    const { t } = useTranslation();

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior='inside'
        >
            <ModalContent className='max-h-[75vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            <div className='flex items-center'>
                                <div className='flex h-[28px] w-[28px] items-center justify-center rounded-[10px] bg-primary-100 text-primary'>
                                    <LuBrainCircuit className='text-[16px]' />
                                </div>
                                <Spacer x={2} />
                                {t('ai_config.provider_title', { defaultValue: 'OpenAI' })}
                            </div>
                        </ModalHeader>
                        <ModalBody>
                            <AIApiConfigForm
                                instanceKey={serviceInstanceKey}
                                updateServiceInstanceList={updateServiceInstanceList}
                                onClose={onClose}
                            />
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
