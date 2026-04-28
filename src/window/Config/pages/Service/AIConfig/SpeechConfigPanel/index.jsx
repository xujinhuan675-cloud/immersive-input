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
    SYSTEM_TTS_DEFAULT_PITCH,
    SYSTEM_TTS_DEFAULT_RATE,
    SYSTEM_TTS_DEFAULT_VOLUME,
    VOLCENGINE_TTS_DEFAULT_CLUSTER,
    VOLCENGINE_TTS_DEFAULT_ENCODING,
    VOLCENGINE_TTS_DEFAULT_VOICE,
    VOLCENGINE_TTS_ENCODING_OPTIONS,
    createDefaultBuiltInTtsConfig,
    ensureBuiltInTtsConfigMigration,
    getActiveReadAloudProviderId,
    getMergedBuiltInTtsConfig,
} from '../../../../../../utils/aiConfig';

const SPEECH_CONFIG_KEYS = [
    'speechUseForReadAloud',
    'speechProvider',
    'speechProviderOrder',
    'speechSystemVoiceURI',
    'speechSystemRate',
    'speechSystemPitch',
    'speechSystemVolume',
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

function getLocalizedDefaultValue(isChineseUI, zhText, enText) {
    return isChineseUI ? zhText : enText;
}

function buildVoiceOptionLabel(voice) {
    return [voice.name, voice.lang].filter(Boolean).join(' · ');
}

function SpeechConfigForm(props) {
    const {
        showTitle = true,
        onSaved,
        initialProvider = null,
        showGeneralSection = true,
    } = props;
    const { t, i18n } = useTranslation();
    const isChineseUI = i18n.language?.startsWith('zh');
    const toastStyle = useToastStyle();
    const [isSaving, setIsSaving] = useState(false);
    const [systemVoiceOptions, setSystemVoiceOptions] = useState([]);
    const [speechConfig, setSpeechConfig] = useConfig(
        BUILTIN_TTS_CONFIG_KEY,
        createDefaultBuiltInTtsConfig(),
        { sync: false }
    );

    const systemSpeechSupported =
        typeof window !== 'undefined' &&
        typeof window.speechSynthesis !== 'undefined' &&
        typeof window.SpeechSynthesisUtterance !== 'undefined';

    useEffect(() => {
        if (!systemSpeechSupported) {
            setSystemVoiceOptions([]);
            return undefined;
        }

        const speechSynthesis = window.speechSynthesis;
        const loadVoices = () => {
            const voiceList = speechSynthesis.getVoices();
            const localVoices = voiceList.filter((voice) => voice.localService !== false);
            const candidates = localVoices.length > 0 ? localVoices : voiceList;
            const nextOptions = [...candidates]
                .sort((left, right) => buildVoiceOptionLabel(left).localeCompare(buildVoiceOptionLabel(right)))
                .map((voice) => ({
                    value: voice.voiceURI,
                    label: buildVoiceOptionLabel(voice),
                }));

            setSystemVoiceOptions(nextOptions);
        };

        loadVoices();

        if (typeof speechSynthesis.addEventListener === 'function') {
            speechSynthesis.addEventListener('voiceschanged', loadVoices);
            return () => {
                speechSynthesis.removeEventListener('voiceschanged', loadVoices);
            };
        }

        const previousHandler = speechSynthesis.onvoiceschanged;
        speechSynthesis.onvoiceschanged = loadVoices;
        return () => {
            if (speechSynthesis.onvoiceschanged === loadVoices) {
                speechSynthesis.onvoiceschanged = previousHandler;
            }
        };
    }, [systemSpeechSupported]);

    if (speechConfig) {
        const mergedConfig = getMergedBuiltInTtsConfig(speechConfig);
        const needsRepair = SPEECH_CONFIG_KEYS.some((key) => speechConfig[key] === undefined);

        if (needsRepair) {
            setSpeechConfig(mergedConfig);
        }
    }

    if (speechConfig === null) {
        return null;
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

    const speechProviderOptions = BUILTIN_TTS_PROVIDER_OPTIONS.map((option) => ({
        value: option.key,
        label: t(`ai_config.speech.providers.${option.key}`, {
            defaultValue:
                option.key === BUILTIN_TTS_PROVIDER_IDS.SYSTEM
                    ? getLocalizedDefaultValue(isChineseUI, '系统语音', 'System Voice')
                    : option.label,
        }),
    }));
    const selectedSpeechProvider = speechConfig.speechProvider ?? BUILTIN_TTS_PROVIDER_IDS.SYSTEM;
    const activeSpeechProvider = getActiveReadAloudProviderId(speechConfig);
    const visibleSpeechProvider = initialProvider ?? (showGeneralSection ? selectedSpeechProvider : activeSpeechProvider);
    const systemVoiceSelectOptions = [
        {
            value: '',
            label: getLocalizedDefaultValue(isChineseUI, '跟随系统默认音色', 'Use System Default Voice'),
        },
        ...systemVoiceOptions,
    ];

    return (
        <div className='flex h-full min-h-0 flex-col'>
            {showTitle ? (
                <div className='mb-4'>
                    <h2 className='text-base font-semibold text-foreground'>
                        {getLocalizedDefaultValue(isChineseUI, '语音配置', 'Speech Configuration')}
                    </h2>
                    <p className='mt-1 text-sm text-default-500'>
                        {getLocalizedDefaultValue(
                            isChineseUI,
                            '内置朗读默认优先使用系统语音，打开就能播放；如果你希望声音更自然，也可以切换到 OpenAI 或火山语音。',
                            'Read aloud uses your system voice by default, so it works right away. Switch to OpenAI or Volcengine when you want a more natural voice.'
                        )}
                    </p>
                </div>
            ) : null}

            <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
                {showGeneralSection ? (
                    <SectionBlock
                        title={t('ai_config.speech_general_title', { defaultValue: 'Read Aloud Behavior' })}
                        description={getLocalizedDefaultValue(
                            isChineseUI,
                            '关闭下方开关时，朗读会优先使用本机系统语音；打开后，则改为使用你在下方选中的语音提供方。',
                            'When the switch below is off, read aloud uses your local system voice first. Turn it on to use the provider selected below instead.'
                        )}
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
                                {getLocalizedDefaultValue(
                                    isChineseUI,
                                    '朗读时使用下方选中的语音提供方',
                                    'Use the selected provider below for read aloud'
                                )}
                            </Switch>
                        </div>

                        <SelectField
                            label={t('ai_config.speech_provider', { defaultValue: 'Speech Provider' })}
                            value={selectedSpeechProvider}
                            onChange={(value) => updateConfig({ speechProvider: value })}
                            options={speechProviderOptions}
                        />

                        <div className='mt-3 rounded-2xl border border-default-200/70 bg-default-50/70 px-3 py-2 text-xs text-default-500'>
                            {activeSpeechProvider === BUILTIN_TTS_PROVIDER_IDS.SYSTEM
                                ? getLocalizedDefaultValue(
                                      isChineseUI,
                                      '当前朗读会优先使用本机系统语音，本地播放、零调用成本。',
                                      'Read aloud currently uses your local system voice first, with no API usage.'
                                  )
                                : getLocalizedDefaultValue(
                                      isChineseUI,
                                      '当前朗读会使用你选中的语音服务；如果它暂时不可用，程序仍会自动回退到本地系统语音。',
                                      'Read aloud currently uses the selected voice service. If it is unavailable, the app will still fall back to your local system voice.'
                                  )}
                        </div>
                    </SectionBlock>
                ) : null}

                {visibleSpeechProvider === BUILTIN_TTS_PROVIDER_IDS.SYSTEM ? (
                    <SectionBlock
                        title={getLocalizedDefaultValue(isChineseUI, '系统语音', 'System Voice')}
                        description={getLocalizedDefaultValue(
                            isChineseUI,
                            '直接使用当前设备上的系统语音。不同平台和语音包的效果允许不同，目标是本地可播、零额外成本。',
                            'Use the voices already installed on this device. Quality can vary across platforms, but the goal is simple local playback with zero extra cost.'
                        )}
                    >
                        {systemSpeechSupported ? (
                            <>
                                <SelectField
                                    label={getLocalizedDefaultValue(isChineseUI, '系统音色', 'System Voice')}
                                    value={speechConfig.speechSystemVoiceURI ?? ''}
                                    onChange={(value) => updateConfig({ speechSystemVoiceURI: value })}
                                    options={systemVoiceSelectOptions}
                                />

                                <div className='mt-2 text-xs text-default-500'>
                                    {getLocalizedDefaultValue(
                                        isChineseUI,
                                        '留空时自动跟随系统默认音色；如果本机安装了多种语言语音，也可以在这里手动指定。',
                                        'Leave empty to follow the default system voice, or choose a specific installed voice here when available.'
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className='rounded-2xl border border-warning/30 bg-warning-50 px-3 py-2 text-xs text-warning-700'>
                                {getLocalizedDefaultValue(
                                    isChineseUI,
                                    '当前运行环境暂不支持系统语音合成，程序会自动回退到你配置好的外部 TTS。',
                                    'System speech synthesis is not available in the current runtime. The app will fall back to your configured external TTS providers.'
                                )}
                            </div>
                        )}

                        <div className='config-item items-start'>
                            <div className='my-auto'>
                                {t('ai_config.speech_speed', {
                                    defaultValue: 'Speech Speed: {{n}}',
                                    n: Number(speechConfig.speechSystemRate ?? SYSTEM_TTS_DEFAULT_RATE).toFixed(2),
                                })}
                            </div>
                            <div className='w-full max-w-[55%] pt-[6px]'>
                                <Slider
                                    size='sm'
                                    step={0.05}
                                    minValue={0.5}
                                    maxValue={2}
                                    value={Number(speechConfig.speechSystemRate ?? SYSTEM_TTS_DEFAULT_RATE)}
                                    onChange={(value) => {
                                        updateConfig({
                                            speechSystemRate: Array.isArray(value) ? value[0] : value,
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div className='config-item items-start'>
                            <div className='my-auto'>
                                {getLocalizedDefaultValue(
                                    isChineseUI,
                                    `语调：${Number(speechConfig.speechSystemPitch ?? SYSTEM_TTS_DEFAULT_PITCH).toFixed(2)}`,
                                    `Pitch: ${Number(speechConfig.speechSystemPitch ?? SYSTEM_TTS_DEFAULT_PITCH).toFixed(2)}`
                                )}
                            </div>
                            <div className='w-full max-w-[55%] pt-[6px]'>
                                <Slider
                                    size='sm'
                                    step={0.05}
                                    minValue={0}
                                    maxValue={2}
                                    value={Number(speechConfig.speechSystemPitch ?? SYSTEM_TTS_DEFAULT_PITCH)}
                                    onChange={(value) => {
                                        updateConfig({
                                            speechSystemPitch: Array.isArray(value) ? value[0] : value,
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div className='config-item items-start'>
                            <div className='my-auto'>
                                {getLocalizedDefaultValue(
                                    isChineseUI,
                                    `音量：${Number(speechConfig.speechSystemVolume ?? SYSTEM_TTS_DEFAULT_VOLUME).toFixed(2)}`,
                                    `Volume: ${Number(speechConfig.speechSystemVolume ?? SYSTEM_TTS_DEFAULT_VOLUME).toFixed(2)}`
                                )}
                            </div>
                            <div className='w-full max-w-[55%] pt-[6px]'>
                                <Slider
                                    size='sm'
                                    step={0.05}
                                    minValue={0}
                                    maxValue={1}
                                    value={Number(speechConfig.speechSystemVolume ?? SYSTEM_TTS_DEFAULT_VOLUME)}
                                    onChange={(value) => {
                                        updateConfig({
                                            speechSystemVolume: Array.isArray(value) ? value[0] : value,
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    </SectionBlock>
                ) : null}

                {visibleSpeechProvider === BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE ? (
                    <SectionBlock
                        title={t('ai_config.speech_volcengine_title', { defaultValue: 'Volcengine Speech' })}
                        description={getLocalizedDefaultValue(
                            isChineseUI,
                            '如果你想使用火山语音朗读，可以在这里填写相关信息。切换到它后，朗读会优先使用这项服务。',
                            'Set up Volcengine speech here. Once you switch to it, read aloud will use this service first.'
                        )}
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
                ) : null}

                {visibleSpeechProvider === BUILTIN_TTS_PROVIDER_IDS.OPENAI ? (
                    <SectionBlock
                        title={t('ai_config.speech_openai_title', { defaultValue: 'OpenAI Speech' })}
                        description={getLocalizedDefaultValue(
                            isChineseUI,
                            '如果你想使用 OpenAI 语音朗读，可以在这里填写相关信息。留空 URL 或 Key 时，会尽量复用上方 AI 服务里的兼容实例。',
                            'Set up OpenAI speech here. Leave URL or key empty to reuse a compatible AI service instance above whenever possible.'
                        )}
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
                ) : null}
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
