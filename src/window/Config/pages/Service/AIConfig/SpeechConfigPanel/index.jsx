import { Button, Input, Slider, Switch, Textarea } from '@nextui-org/react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';

import { useConfig } from '../../../../../../hooks/useConfig';
import { useToastStyle } from '../../../../../../hooks';
import {
    BUILTIN_TTS_CONFIG_KEY,
    BUILTIN_TTS_PROVIDER_IDS,
    BUILTIN_TTS_PROVIDER_OPTIONS,
    OPENAI_TTS_DEFAULT_MODEL,
    OPENAI_TTS_DEFAULT_URL,
    OPENAI_TTS_VOICE_OPTIONS,
    VOLCENGINE_TTS_DEFAULT_CLUSTER,
    VOLCENGINE_TTS_DEFAULT_ENCODING,
    VOLCENGINE_TTS_DEFAULT_VOICE,
    VOLCENGINE_TTS_ENCODING_OPTIONS,
    createDefaultBuiltInTtsConfig,
    ensureBuiltInTtsConfigMigration,
    getMergedBuiltInTtsConfig,
} from '../../../../../../utils/aiConfig';

const SPEECH_CONFIG_KEYS = [
    'speechUseForReadAloud',
    'speechProvider',
    'speechOpenaiApiUrl',
    'speechOpenaiApiKey',
    'speechOpenaiModel',
    'speechOpenaiVoice',
    'speechOpenaiSpeed',
    'speechOpenaiInstructions',
    'speechVolcengineAppId',
    'speechVolcengineAccessToken',
    'speechVolcengineCluster',
    'speechVolcengineVoice',
    'speechVolcengineSpeed',
    'speechVolcengineEncoding',
];

function SectionBlock({ title, description, children }) {
    return (
        <div className='mt-5 rounded-2xl border border-divider/70 bg-content1 p-4 first:mt-0'>
            <div className='mb-4'>
                <div className='text-sm font-semibold text-foreground'>{title}</div>
                {description ? <div className='mt-1 text-xs text-default-500'>{description}</div> : null}
            </div>
            {children}
        </div>
    );
}

function SelectField({ label, value, onChange, options }) {
    return (
        <div className='config-item'>
            <div className='my-auto text-[length:--nextui-font-size-medium]'>{label}</div>
            <div className='w-full max-w-[55%]'>
                <select
                    value={value}
                    className='w-full rounded-[14px] border border-default-200 bg-default-50 px-3 py-2 text-sm outline-none transition-colors hover:border-default-300 focus:border-primary'
                    onChange={(event) => onChange(event.target.value)}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

function SpeechConfigForm(props) {
    const { showTitle = true, onSaved } = props;
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [isSaving, setIsSaving] = useState(false);
    const [speechConfig, setSpeechConfig] = useConfig(
        BUILTIN_TTS_CONFIG_KEY,
        createDefaultBuiltInTtsConfig(),
        { sync: false }
    );

    if (speechConfig) {
        const mergedConfig = getMergedBuiltInTtsConfig(speechConfig);
        const needsRepair = SPEECH_CONFIG_KEYS.some((key) => speechConfig[key] === undefined);

        if (needsRepair) {
            setSpeechConfig(mergedConfig);
        }
    }

    const updateConfig = (patch) => {
        setSpeechConfig({
            ...speechConfig,
            ...patch,
        });
    };

    const saveConfig = async () => {
        const nextConfig = getMergedBuiltInTtsConfig(speechConfig);
        setIsSaving(true);
        try {
            setSpeechConfig(nextConfig, true);
            toast.success(t('ai_config.speech_save_success', { defaultValue: 'Speech configuration saved' }), {
                style: toastStyle,
            });
            onSaved?.(nextConfig);
        } finally {
            setIsSaving(false);
        }
    };

    if (speechConfig === null) {
        return null;
    }

    const speechProviderOptions = BUILTIN_TTS_PROVIDER_OPTIONS.map((option) => ({
        value: option.key,
        label: t(`ai_config.speech.providers.${option.key}`, { defaultValue: option.label }),
    }));
    const selectedSpeechProvider = speechConfig.speechProvider ?? BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE;

    return (
        <div className='flex h-full min-h-0 flex-col'>
            {showTitle ? (
                <div className='mb-4'>
                    <h2 className='text-base font-semibold text-foreground'>
                        {t('ai_config.speech_section_title', { defaultValue: 'Speech / Read Aloud' })}
                    </h2>
                    <p className='mt-1 text-sm text-default-500'>
                        {t('ai_config.speech_section_desc', {
                            defaultValue:
                                'Built-in speech lives here. Read aloud defaults to Volcengine, and can optionally follow the custom voice provider you select below.',
                        })}
                    </p>
                </div>
            ) : null}

            <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
                <SectionBlock
                    title={t('ai_config.speech_general_title', { defaultValue: 'Read Aloud Behavior' })}
                    description={t('ai_config.speech_general_desc', {
                        defaultValue:
                            'Choose whether read aloud should keep the default Volcengine voice or follow the custom provider configured here.',
                    })}
                >
                    <div className='config-item'>
                        <Switch
                            isSelected={Boolean(speechConfig.speechUseForReadAloud)}
                            onValueChange={(value) => {
                                updateConfig({ speechUseForReadAloud: value });
                            }}
                            classNames={{
                                base: 'flex w-full max-w-full flex-row-reverse justify-between',
                            }}
                        >
                            {t('ai_config.speech_use_for_read_aloud', {
                                defaultValue: 'Use this voice configuration for read aloud',
                            })}
                        </Switch>
                    </div>

                    <SelectField
                        label={t('ai_config.speech_provider', { defaultValue: 'Speech Provider' })}
                        value={selectedSpeechProvider}
                        onChange={(value) => updateConfig({ speechProvider: value })}
                        options={speechProviderOptions}
                    />
                </SectionBlock>

                {selectedSpeechProvider === BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE ? (
                    <SectionBlock
                        title={t('ai_config.speech_volcengine_title', { defaultValue: 'Volcengine Speech' })}
                        description={t('ai_config.speech_volcengine_desc', {
                            defaultValue: 'Configure the built-in Volcengine TTS service for default read aloud.',
                        })}
                    >
                        <div className='config-item'>
                            <Input
                                label={t('ai_config.speech_volcengine_appid', { defaultValue: 'Volcengine App ID' })}
                                labelPlacement='outside-left'
                                value={speechConfig.speechVolcengineAppId ?? ''}
                                variant='bordered'
                                classNames={{
                                    base: 'justify-between',
                                    label: 'text-[length:--nextui-font-size-medium]',
                                    mainWrapper: 'max-w-[55%]',
                                }}
                                onValueChange={(value) => {
                                    updateConfig({ speechVolcengineAppId: value });
                                }}
                            />
                        </div>

                        <div className='config-item'>
                            <Input
                                label={t('ai_config.speech_volcengine_token', { defaultValue: 'Volcengine Access Token' })}
                                labelPlacement='outside-left'
                                type='password'
                                value={speechConfig.speechVolcengineAccessToken ?? ''}
                                variant='bordered'
                                classNames={{
                                    base: 'justify-between',
                                    label: 'text-[length:--nextui-font-size-medium]',
                                    mainWrapper: 'max-w-[55%]',
                                }}
                                onValueChange={(value) => {
                                    updateConfig({ speechVolcengineAccessToken: value });
                                }}
                            />
                        </div>

                        <div className='config-item'>
                            <Input
                                label={t('ai_config.speech_volcengine_cluster', { defaultValue: 'Volcengine Cluster' })}
                                labelPlacement='outside-left'
                                placeholder={VOLCENGINE_TTS_DEFAULT_CLUSTER}
                                value={speechConfig.speechVolcengineCluster ?? ''}
                                variant='bordered'
                                classNames={{
                                    base: 'justify-between',
                                    label: 'text-[length:--nextui-font-size-medium]',
                                    mainWrapper: 'max-w-[55%]',
                                }}
                                onValueChange={(value) => {
                                    updateConfig({ speechVolcengineCluster: value });
                                }}
                            />
                        </div>

                        <div className='config-item'>
                            <Input
                                label={t('ai_config.speech_volcengine_voice', { defaultValue: 'Volcengine Voice Type' })}
                                labelPlacement='outside-left'
                                placeholder={VOLCENGINE_TTS_DEFAULT_VOICE}
                                value={speechConfig.speechVolcengineVoice ?? ''}
                                variant='bordered'
                                description={t('ai_config.speech_volcengine_voice_desc', {
                                    defaultValue: 'For example: BV700_streaming',
                                })}
                                classNames={{
                                    base: 'justify-between',
                                    label: 'text-[length:--nextui-font-size-medium]',
                                    mainWrapper: 'max-w-[55%]',
                                }}
                                onValueChange={(value) => {
                                    updateConfig({ speechVolcengineVoice: value });
                                }}
                            />
                        </div>

                        <SelectField
                            label={t('ai_config.speech_volcengine_encoding', { defaultValue: 'Audio Encoding' })}
                            value={speechConfig.speechVolcengineEncoding ?? VOLCENGINE_TTS_DEFAULT_ENCODING}
                            onChange={(value) => updateConfig({ speechVolcengineEncoding: value })}
                            options={VOLCENGINE_TTS_ENCODING_OPTIONS.map((encoding) => ({
                                value: encoding,
                                label: encoding,
                            }))}
                        />

                        <div className='config-item items-start'>
                            <div className='my-auto'>
                                {t('ai_config.speech_speed', {
                                    defaultValue: 'Speech Speed: {{n}}',
                                    n: Number(speechConfig.speechVolcengineSpeed ?? 1).toFixed(2),
                                })}
                            </div>
                            <div className='w-full max-w-[55%] pt-[6px]'>
                                <Slider
                                    size='sm'
                                    step={0.05}
                                    minValue={0.2}
                                    maxValue={3}
                                    value={Number(speechConfig.speechVolcengineSpeed ?? 1)}
                                    onChange={(value) => {
                                        updateConfig({
                                            speechVolcengineSpeed: Array.isArray(value) ? value[0] : value,
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    </SectionBlock>
                ) : (
                    <SectionBlock
                        title={t('ai_config.speech_openai_title', { defaultValue: 'OpenAI Speech' })}
                        description={t('ai_config.speech_openai_desc', {
                            defaultValue:
                                'Configure the built-in OpenAI TTS service. Leave URL or key empty to reuse the first enabled compatible AI service when appropriate.',
                        })}
                    >
                        <div className='config-item'>
                            <Input
                                label={t('ai_config.speech_openai_url', { defaultValue: 'OpenAI Speech URL' })}
                                labelPlacement='outside-left'
                                placeholder={OPENAI_TTS_DEFAULT_URL}
                                value={speechConfig.speechOpenaiApiUrl ?? ''}
                                variant='bordered'
                                description={t('ai_config.speech_openai_url_desc', {
                                    defaultValue:
                                        'Leave empty to reuse the first enabled AI API URL and auto-convert it to /audio/speech when possible.',
                                })}
                                classNames={{
                                    base: 'justify-between',
                                    label: 'text-[length:--nextui-font-size-medium]',
                                    mainWrapper: 'max-w-[55%]',
                                }}
                                onValueChange={(value) => {
                                    updateConfig({ speechOpenaiApiUrl: value });
                                }}
                            />
                        </div>

                        <div className='config-item'>
                            <Input
                                label={t('ai_config.speech_openai_key', { defaultValue: 'OpenAI Speech API Key' })}
                                labelPlacement='outside-left'
                                type='password'
                                placeholder='sk-...'
                                value={speechConfig.speechOpenaiApiKey ?? ''}
                                variant='bordered'
                                description={t('ai_config.speech_openai_key_desc', {
                                    defaultValue: 'Leave empty to reuse the first enabled AI API key above.',
                                })}
                                classNames={{
                                    base: 'justify-between',
                                    label: 'text-[length:--nextui-font-size-medium]',
                                    mainWrapper: 'max-w-[55%]',
                                }}
                                onValueChange={(value) => {
                                    updateConfig({ speechOpenaiApiKey: value });
                                }}
                            />
                        </div>

                        <div className='config-item'>
                            <Input
                                label={t('ai_config.speech_openai_model', { defaultValue: 'OpenAI TTS Model' })}
                                labelPlacement='outside-left'
                                placeholder={OPENAI_TTS_DEFAULT_MODEL}
                                value={speechConfig.speechOpenaiModel ?? ''}
                                variant='bordered'
                                classNames={{
                                    base: 'justify-between',
                                    label: 'text-[length:--nextui-font-size-medium]',
                                    mainWrapper: 'max-w-[55%]',
                                }}
                                onValueChange={(value) => {
                                    updateConfig({ speechOpenaiModel: value });
                                }}
                            />
                        </div>

                        <SelectField
                            label={t('ai_config.speech_openai_voice', { defaultValue: 'OpenAI Voice' })}
                            value={speechConfig.speechOpenaiVoice ?? OPENAI_TTS_VOICE_OPTIONS[0]}
                            onChange={(value) => updateConfig({ speechOpenaiVoice: value })}
                            options={OPENAI_TTS_VOICE_OPTIONS.map((voice) => ({
                                value: voice,
                                label: voice,
                            }))}
                        />

                        <div className='config-item items-start'>
                            <div className='my-auto'>
                                {t('ai_config.speech_speed', {
                                    defaultValue: 'Speech Speed: {{n}}',
                                    n: Number(speechConfig.speechOpenaiSpeed ?? 1).toFixed(2),
                                })}
                            </div>
                            <div className='w-full max-w-[55%] pt-[6px]'>
                                <Slider
                                    size='sm'
                                    step={0.05}
                                    minValue={0.25}
                                    maxValue={4}
                                    value={Number(speechConfig.speechOpenaiSpeed ?? 1)}
                                    onChange={(value) => {
                                        updateConfig({
                                            speechOpenaiSpeed: Array.isArray(value) ? value[0] : value,
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div className='config-item items-start'>
                            <div className='my-auto text-[length:--nextui-font-size-medium]'>
                                {t('ai_config.speech_openai_instructions', {
                                    defaultValue: 'Speech Instructions',
                                })}
                            </div>
                            <div className='w-full max-w-[55%]'>
                                <Textarea
                                    value={speechConfig.speechOpenaiInstructions ?? ''}
                                    variant='bordered'
                                    minRows={3}
                                    maxRows={6}
                                    placeholder={t('ai_config.speech_openai_instructions_placeholder', {
                                        defaultValue: 'Optional voice style guidance, such as calm, warm, or energetic.',
                                    })}
                                    onValueChange={(value) => {
                                        updateConfig({ speechOpenaiInstructions: value });
                                    }}
                                />
                            </div>
                        </div>
                    </SectionBlock>
                )}
            </div>

            <div className='mt-4 flex justify-end'>
                <Button color='primary' isLoading={isSaving} onPress={saveConfig}>
                    {t('common.save')}
                </Button>
            </div>
        </div>
    );
}

export default function SpeechConfigPanel(props) {
    return <SpeechConfigPanelInner {...props} />;
}

function SpeechConfigPanelInner(props) {
    const { t } = useTranslation();
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let mounted = true;

        ensureBuiltInTtsConfigMigration().then(() => {
            if (mounted) {
                setIsReady(true);
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    if (!isReady) {
        return (
            <div className='flex h-full min-h-0 items-center justify-center p-5'>
                <div className='text-sm text-default-500'>
                    {t('common.loading', { defaultValue: 'Loading...' })}
                </div>
            </div>
        );
    }

    return <SpeechConfigForm {...props} />;
}
