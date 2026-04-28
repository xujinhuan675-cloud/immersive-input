import { Button, Input, Switch, Textarea } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDeleteOutline } from 'react-icons/md';

import AiProviderIcon from '../../../../../../components/AiProviderIcon';
import { useConfig } from '../../../../../../hooks/useConfig';
import { useToastStyle } from '../../../../../../hooks';
import {
    getAiProviderId,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';
import {
    AI_TRANSLATE_DEFAULT_PROMPT_LIST,
    AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS,
    getAiTranslateDisplayName,
    getAiTranslateLanguageEnum,
    getLinkedAiServiceInstanceKey,
    getMergedAiTranslateConfig,
    translateWithAiBinding,
} from '../../../../../../utils/aiTranslate';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../../../../utils/service_instance';
import { store } from '../../../../../../utils/store';

const AI_TRANSLATE_CONFIG_KEYS = [
    INSTANCE_NAME_CONFIG_KEY,
    'linkedAiInstanceKey',
    'enable',
    'hidden',
    'stream',
    'promptList',
    'requestArguments',
];

function SectionBlock({ title, description, children }) {
    return (
        <div className='mt-5 border-t border-default-200/70 pt-5 first:mt-0 first:border-t-0 first:pt-0'>
            <div className='mb-4'>
                <div className='text-sm font-semibold text-foreground'>{title}</div>
                {description ? <div className='mt-1 text-xs text-default-500'>{description}</div> : null}
            </div>
            {children}
        </div>
    );
}

export default function AiTranslateConfig(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [linkedAiConfig, setLinkedAiConfig] = useState({});
    const [aiTranslateConfig, setAiTranslateConfig] = useConfig(
        instanceKey,
        getMergedAiTranslateConfig({}, instanceKey),
        { sync: false }
    );

    useEffect(() => {
        const mergedConfig = getMergedAiTranslateConfig(aiTranslateConfig, instanceKey);
        const linkedAiInstanceKey = getLinkedAiServiceInstanceKey(instanceKey, mergedConfig);
        let cancelled = false;

        const loadLinkedAiConfig = async () => {
            await store.load();
            const nextConfig = linkedAiInstanceKey ? (await store.get(linkedAiInstanceKey)) ?? {} : {};
            if (!cancelled) {
                setLinkedAiConfig(nextConfig);
            }
        };

        void loadLinkedAiConfig();
        return () => {
            cancelled = true;
        };
    }, [aiTranslateConfig, instanceKey]);

    if (aiTranslateConfig) {
        const mergedConfig = getMergedAiTranslateConfig(aiTranslateConfig, instanceKey);
        const needsRepair = AI_TRANSLATE_CONFIG_KEYS.some((key) => aiTranslateConfig[key] === undefined);

        if (needsRepair) {
            setAiTranslateConfig(mergedConfig);
        }
    }

    if (aiTranslateConfig === null) {
        return null;
    }

    const mergedAiTranslateConfig = getMergedAiTranslateConfig(aiTranslateConfig, instanceKey);
    const mergedAiConfig = getMergedAiApiConfig(linkedAiConfig ?? {});
    const providerId = getAiProviderId(mergedAiConfig);
    const providerTitle = t(`ai_config.providers.${providerId}`, {
        defaultValue: getAiProviderTitle(providerId),
    });
    const displayName = getAiTranslateDisplayName(
        mergedAiTranslateConfig,
        mergedAiConfig,
        t('ai_config.translate_service_title', { defaultValue: 'AI Translate' })
    );

    const updateConfig = (patch) => {
        setAiTranslateConfig({
            ...aiTranslateConfig,
            ...patch,
        });
    };

    const saveConfig = async () => {
        setIsSaving(true);
        try {
            const nextConfig = getMergedAiTranslateConfig(aiTranslateConfig, instanceKey);
            setAiTranslateConfig(
                {
                    ...nextConfig,
                    hidden: false,
                },
                true
            );
            updateServiceList(instanceKey);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestTranslation = async () => {
        const nextConfig = getMergedAiTranslateConfig(aiTranslateConfig, instanceKey);
        const languageEnum = getAiTranslateLanguageEnum();

        if (!mergedAiConfig.apiUrl || !mergedAiConfig.apiKey || !mergedAiConfig.model) {
            toast.error(
                t('ai_config.test_error_fields', {
                    defaultValue: 'Please fill in API URL, API Key, and model first.',
                }),
                { style: toastStyle }
            );
            return;
        }

        setIsTesting(true);
        try {
            const result = await translateWithAiBinding(
                'hello',
                languageEnum.auto,
                languageEnum.zh_cn,
                nextConfig,
                mergedAiConfig
            );
            toast.success(
                t('ai_config.test_success', {
                    msg: String(result).slice(0, 30),
                    defaultValue: `Connected: ${result}`,
                }),
                { style: toastStyle }
            );
        } catch (error) {
            toast.error(
                t('ai_config.test_failed', {
                    msg: error?.message ?? String(error),
                    defaultValue: `Failed: ${error?.message ?? String(error)}`,
                }),
                { style: toastStyle }
            );
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void saveConfig();
            }}
        >
            <Toaster />

            <SectionBlock
                title={t('ai_config.translate_binding_title', {
                    defaultValue: 'Linked AI Service',
                })}
                description={t('ai_config.translate_binding_desc', {
                    defaultValue:
                        'Base URL, API key, and model come from AI Services. Translation-specific behavior stays here.',
                })}
            >
                <div className='rounded-[16px] border border-default-200/70 bg-default-50/60 p-4'>
                    <div className='flex items-center gap-3'>
                        <div className='flex h-10 w-10 items-center justify-center rounded-[14px] bg-content1 text-default-600 shadow-sm'>
                            <AiProviderIcon providerId={providerId} className='text-[20px]' />
                        </div>
                        <div className='min-w-0 flex-1'>
                            <div className='truncate text-sm font-semibold text-foreground'>{displayName}</div>
                            <div className='mt-1 text-xs text-default-500'>{providerTitle}</div>
                        </div>
                    </div>
                </div>

                <div className='config-item mt-4'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={aiTranslateConfig[INSTANCE_NAME_CONFIG_KEY] ?? ''}
                        variant='bordered'
                        description={t('ai_config.translate_display_name_desc', {
                            defaultValue: 'Leave empty to reuse the AI service name above.',
                        })}
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[55%]',
                        }}
                        onValueChange={(value) => {
                            updateConfig({
                                [INSTANCE_NAME_CONFIG_KEY]: value,
                            });
                        }}
                    />
                </div>
            </SectionBlock>

            <SectionBlock
                title={t('ai_config.translate_runtime_title', {
                    defaultValue: 'Runtime Options',
                })}
                description={t('ai_config.translate_runtime_desc', {
                    defaultValue:
                        'These options only affect translation for this AI item and do not change the shared AI service.',
                })}
            >
                <div className='config-item'>
                    <Switch
                        isSelected={Boolean(mergedAiTranslateConfig.stream)}
                        onValueChange={(value) => {
                            updateConfig({
                                stream: value,
                            });
                        }}
                        classNames={{
                            base: 'flex w-full max-w-full flex-row-reverse justify-between',
                        }}
                    >
                        {t('ai_config.translate_stream', {
                            defaultValue: 'Use streaming response',
                        })}
                    </Switch>
                </div>
            </SectionBlock>

            <SectionBlock
                title='Prompt List'
                description={t('ai_config.translate_prompt_desc', {
                    defaultValue:
                        'Customize the translation prompt. $text $from $to $detect will be replaced with the source text, source language, target language, and detected language.',
                })}
            >
                <div className='rounded-[14px] bg-content2 p-3'>
                    {mergedAiTranslateConfig.promptList.map((prompt, index) => (
                        <div className='config-item' key={`${prompt.role}-${index}`}>
                            <Textarea
                                label={prompt.role}
                                labelPlacement='outside'
                                variant='faded'
                                value={prompt.content}
                                placeholder={`Input some ${prompt.role} prompt`}
                                onValueChange={(value) => {
                                    updateConfig({
                                        promptList: mergedAiTranslateConfig.promptList.map((item, itemIndex) => {
                                            if (itemIndex !== index) {
                                                return item;
                                            }

                                            if (itemIndex === 0) {
                                                return {
                                                    role: 'system',
                                                    content: value,
                                                };
                                            }

                                            return {
                                                role: itemIndex % 2 !== 0 ? 'user' : 'assistant',
                                                content: value,
                                            };
                                        }),
                                    });
                                }}
                            />
                            <Button
                                isIconOnly
                                color='danger'
                                className='my-auto mx-1'
                                variant='flat'
                                onPress={() => {
                                    updateConfig({
                                        promptList: mergedAiTranslateConfig.promptList.filter(
                                            (_, itemIndex) => itemIndex !== index
                                        ),
                                    });
                                }}
                            >
                                <MdDeleteOutline className='text-[18px]' />
                            </Button>
                        </div>
                    ))}
                    <div className='mt-3 flex gap-2'>
                        <Button
                            onPress={() => {
                                updateConfig({
                                    promptList: [
                                        ...mergedAiTranslateConfig.promptList,
                                        {
                                            role:
                                                mergedAiTranslateConfig.promptList.length === 0
                                                    ? 'system'
                                                    : mergedAiTranslateConfig.promptList.length % 2 === 0
                                                      ? 'assistant'
                                                      : 'user',
                                            content: '',
                                        },
                                    ],
                                });
                            }}
                        >
                            {t('ai_config.translate_add_prompt', {
                                defaultValue: 'Add Prompt',
                            })}
                        </Button>
                        <Button
                            variant='flat'
                            onPress={() => {
                                updateConfig({
                                    promptList: AI_TRANSLATE_DEFAULT_PROMPT_LIST,
                                });
                            }}
                        >
                            {t('common.reset', { defaultValue: 'Reset' })}
                        </Button>
                    </div>
                </div>
            </SectionBlock>

            <SectionBlock
                title='Request Arguments'
                description={t('ai_config.translate_request_args_desc', {
                    defaultValue:
                        'Optional JSON body fields merged into the translation request, such as temperature or top_p.',
                })}
            >
                <Textarea
                    value={
                        mergedAiTranslateConfig.requestArguments ??
                        AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS
                    }
                    variant='faded'
                    minRows={5}
                    placeholder='{"temperature":0.1}'
                    onValueChange={(value) => {
                        updateConfig({
                            requestArguments: value,
                        });
                    }}
                />
            </SectionBlock>

            <div className='mt-[20px] flex justify-end gap-[8px]'>
                <Button type='button' variant='light' onPress={handleTestTranslation} isLoading={isTesting}>
                    {isTesting
                        ? t('ai_config.test_loading')
                        : t('ai_config.test_btn', { defaultValue: 'Test Translation' })}
                </Button>
                <Button type='button' color='danger' variant='light' onPress={onClose}>
                    {t('common.cancel')}
                </Button>
                <Button type='submit' isLoading={isSaving} color='primary'>
                    {t('common.save')}
                </Button>
            </div>
        </form>
    );
}
