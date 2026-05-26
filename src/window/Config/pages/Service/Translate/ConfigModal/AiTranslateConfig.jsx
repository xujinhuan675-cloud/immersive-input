import { Button, Textarea } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfig } from '../../../../../../hooks/useConfig';
import { useToastStyle } from '../../../../../../hooks';
import { getMergedAiApiConfig } from '../../../../../../utils/aiConfig';
import {
    AI_TRANSLATE_DEFAULT_PROMPT_LIST,
    AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS,
    getAiTranslateLanguageEnum,
    getLinkedAiServiceInstanceKey,
    getMergedAiTranslateConfig,
    translateWithAiBinding,
} from '../../../../../../utils/aiTranslate';
import { store } from '../../../../../../utils/store';

const AI_TRANSLATE_CONFIG_KEYS = [
    'linkedAiInstanceKey',
    'enable',
    'hidden',
    'stream',
    'promptList',
    'requestArguments',
];

function SectionBlock({ title, description, children, compact = false }) {
    return (
        <div className='mt-4 border-t border-default-200/70 pt-4 first:mt-0 first:border-t-0 first:pt-0'>
            <div className={compact ? 'mb-2' : 'mb-3'}>
                <div className='text-sm font-semibold text-foreground'>{title}</div>
                {description ? <div className='mt-1 text-xs text-default-500'>{description}</div> : null}
            </div>
            {children}
        </div>
    );
}

function buildTranslatePromptList(systemPrompt) {
    const defaultSystemPrompt = AI_TRANSLATE_DEFAULT_PROMPT_LIST[0] ?? {
        role: 'system',
        content: '',
    };
    const fixedPromptTail = AI_TRANSLATE_DEFAULT_PROMPT_LIST.slice(1);

    return [
        {
            ...defaultSystemPrompt,
            role: 'system',
            content: systemPrompt,
        },
        ...fixedPromptTail,
    ];
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
    const translateSystemPrompt =
        mergedAiTranslateConfig.promptList?.[0]?.content ?? AI_TRANSLATE_DEFAULT_PROMPT_LIST[0]?.content ?? '';
    const getNormalizedTranslateConfig = () => {
        const nextConfig = getMergedAiTranslateConfig(aiTranslateConfig, instanceKey);
        const systemPrompt = nextConfig.promptList?.[0]?.content ?? AI_TRANSLATE_DEFAULT_PROMPT_LIST[0]?.content ?? '';

        return {
            ...nextConfig,
            stream: true,
            requestArguments: AI_TRANSLATE_DEFAULT_REQUEST_ARGUMENTS,
            promptList: buildTranslatePromptList(systemPrompt),
        };
    };

    const updateConfig = (patch) => {
        setAiTranslateConfig({
            ...aiTranslateConfig,
            ...patch,
        });
    };

    const saveConfig = async () => {
        setIsSaving(true);
        try {
            const nextConfig = getNormalizedTranslateConfig();
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
        const nextConfig = getNormalizedTranslateConfig();
        const languageEnum = getAiTranslateLanguageEnum();

        if (!mergedAiConfig.apiUrl || !mergedAiConfig.model) {
            toast.error(
                t('ai_config.test_error_fields', {
                    defaultValue: 'Please fill in API URL and model first, or sign in to use FlowGuideAI.',
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
                title={t('ai_config.translate_prompt_title', { defaultValue: 'Translation Prompt' })}
                description={t('ai_config.translate_prompt_desc', {
                    defaultValue: '$text, $from, $to and $detect will be replaced automatically.',
                })}
                compact
            >
                <div className='rounded-lg bg-default-50/70 p-3'>
                    <Textarea
                        variant='faded'
                        value={translateSystemPrompt}
                        placeholder={AI_TRANSLATE_DEFAULT_PROMPT_LIST[0]?.content ?? ''}
                        minRows={5}
                        maxRows={8}
                        classNames={{
                            inputWrapper: 'rounded-lg shadow-none',
                        }}
                        onValueChange={(value) => {
                            updateConfig({
                                promptList: buildTranslatePromptList(value),
                            });
                        }}
                    />
                </div>
            </SectionBlock>

            <div className='mt-5 flex justify-end gap-2 border-t border-default-100 pt-3'>
                <Button
                    type='button'
                    size='sm'
                    variant='flat'
                    className='h-8 rounded-md px-3 text-[13px] font-medium'
                    onPress={handleTestTranslation}
                    isLoading={isTesting}
                >
                    {isTesting
                        ? t('ai_config.test_loading')
                        : t('ai_config.translate_test_btn', { defaultValue: 'Test Translation' })}
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='light'
                    className='h-8 px-3 text-[13px] font-medium text-default-600'
                    onPress={onClose}
                >
                    {t('common.cancel')}
                </Button>
                <Button
                    type='submit'
                    size='sm'
                    isLoading={isSaving}
                    color='primary'
                    className='h-8 min-w-[72px] rounded-md px-3 text-[13px] font-medium'
                >
                    {t('common.save')}
                </Button>
            </div>
        </form>
    );
}
