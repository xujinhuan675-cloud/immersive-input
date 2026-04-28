import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Tooltip } from '@nextui-org/react';
import { BiCollapseVertical, BiExpandVertical } from 'react-icons/bi';
import { sendNotification } from '@tauri-apps/api/notification';
import React, { useEffect, useRef, useState } from 'react';
import { writeText } from '@tauri-apps/api/clipboard';
import { TbTransformFilled } from 'react-icons/tb';
import { HiOutlineVolumeUp } from 'react-icons/hi';
import toast, { Toaster } from 'react-hot-toast';
import { MdContentCopy } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import Database from 'tauri-plugin-sql-api';
import { GiCycle } from 'react-icons/gi';
import { useAtomValue } from 'jotai';
import { nanoid } from 'nanoid';

import { sourceLanguageAtom, targetLanguageAtom } from '../LanguageArea';
import { useConfig, useToastStyle, useVoice } from '../../../../hooks';
import { sourceTextAtom, detectLanguageAtom } from '../SourceArea';
import { invoke_plugin } from '../../../../utils/invoke_plugin';
import { DEFAULT_APP_FONT_SIZE } from '../../../../utils/appFont';
import AiProviderIcon from '../../../../components/AiProviderIcon';
import * as builtinServices from '../../../../services/translate';
import { synthesizeBuiltInTts } from '../../../../services/tts/runtime';

import { info, error as logError } from 'tauri-plugin-log-api';
import { getAiProviderId, getMergedAiApiConfig } from '../../../../utils/aiConfig';
import {
    getAiTranslateDisplayName,
    getAiTranslateLanguageEnum,
    getLinkedAiServiceInstanceKey,
    getMergedAiTranslateConfig,
    isAiTranslateServiceKey,
    translateWithAiBinding,
} from '../../../../utils/aiTranslate';
import {
    INSTANCE_NAME_CONFIG_KEY,
    getDisplayInstanceName,
    getServiceName,
    whetherPluginService,
} from '../../../../utils/service_instance';

let translateID = [];

const HEADER_ACTION_BUTTON_CLASS =
    'h-7 w-7 min-w-0 rounded-[8px] text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 data-[hover=true]:bg-default-100';
const FOOTER_ACTION_BUTTON_CLASS =
    'h-7 w-7 min-w-0 rounded-[8px] text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 data-[hover=true]:bg-default-100';
const SERVICE_TRIGGER_BUTTON_CLASS =
    'h-auto min-h-[38px] w-full justify-start rounded-[10px] border border-default-200/70 bg-default-50/70 px-2.5 py-1.5 text-default-700 transition-colors hover:bg-default-100 data-[hover=true]:bg-default-100';
const RESULT_UPDATE_THROTTLE_MS = 120;

function stripHtml(value = '') {
    return value
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getStructuredPreview(result) {
    if (!result || typeof result !== 'object') {
        return '';
    }

    const pronunciation = result.pronunciations?.find((item) => item?.symbol || item?.region);
    if (pronunciation) {
        return [pronunciation.region, pronunciation.symbol].filter(Boolean).join(' ');
    }

    const explanation = result.explanations
        ?.flatMap((item) => item?.explains ?? [])
        ?.find((item) => typeof item === 'string' && item.trim() !== '');
    if (explanation) {
        return explanation;
    }

    const association = result.associations?.find((item) => typeof item === 'string' && item.trim() !== '');
    if (association) {
        return association;
    }

    const sentence = result.sentence?.find((item) => item?.target || item?.source);
    if (sentence) {
        return stripHtml(sentence.target || sentence.source || '');
    }

    return '';
}

export default function TargetArea(props) {
    const { index, name, translateServiceInstanceList, pluginList, serviceInstanceConfigMap, ...drag } = props;

    const [currentTranslateServiceInstanceKey, setCurrentTranslateServiceInstanceKey] = useState(name);
    const [autoCopy] = useConfig('translate_auto_copy', 'disable');
    const [copyActionMode] = useConfig('clipboard_action_mode', 'off');
    const [historyDisable] = useConfig('history_disable', false);
    const [hideWindow] = useConfig('translate_hide_window', false);

    const [isLoading, setIsLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(index !== 0);
    const [result, setResult] = useState('');
    const [error, setError] = useState('');

    const sourceText = useAtomValue(sourceTextAtom);
    const sourceLanguage = useAtomValue(sourceLanguageAtom);
    const targetLanguage = useAtomValue(targetLanguageAtom);
    const detectLanguage = useAtomValue(detectLanguageAtom);

    const { t } = useTranslation();
    const textAreaRef = useRef(null);
    const pendingResultRef = useRef(undefined);
    const resultUpdateTimerRef = useRef(null);
    const toastStyle = useToastStyle();
    const speak = useVoice();
    const copyActionModeReady = copyActionMode !== null;
    const isCopyActionEnabled = copyActionModeReady && copyActionMode !== 'off';

    function getAiTranslateMeta(instanceKey) {
        const bindingConfig = getMergedAiTranslateConfig(serviceInstanceConfigMap[instanceKey] ?? {}, instanceKey);
        const linkedAiInstanceKey = getLinkedAiServiceInstanceKey(instanceKey, bindingConfig);
        const aiConfig = linkedAiInstanceKey ? serviceInstanceConfigMap[linkedAiInstanceKey] ?? {} : {};

        return {
            bindingConfig,
            linkedAiInstanceKey,
            aiConfig,
        };
    }

    const isAvailableServiceInstance = (instanceKey) => {
        if (isAiTranslateServiceKey(instanceKey)) {
            return Boolean(getAiTranslateMeta(instanceKey).linkedAiInstanceKey);
        }

        const serviceName = getServiceName(instanceKey);
        return whetherPluginService(instanceKey)
            ? Boolean(pluginList['translate']?.[serviceName])
            : Boolean(builtinServices[serviceName]);
    };
    const availableTranslateServiceInstanceList = translateServiceInstanceList.filter(isAvailableServiceInstance);
    const initialServiceAvailable = isAvailableServiceInstance(name);

    function clearPendingResultUpdate() {
        if (resultUpdateTimerRef.current) {
            clearTimeout(resultUpdateTimerRef.current);
            resultUpdateTimerRef.current = null;
        }
        pendingResultRef.current = undefined;
    }

    function applyResultUpdate(value, immediate = false) {
        pendingResultRef.current = value;

        if (immediate) {
            clearPendingResultUpdate();
            setResult(value);
            return;
        }

        if (resultUpdateTimerRef.current) {
            return;
        }

        resultUpdateTimerRef.current = setTimeout(() => {
            const nextValue = pendingResultRef.current;
            resultUpdateTimerRef.current = null;
            pendingResultRef.current = undefined;
            setResult(nextValue);
        }, RESULT_UPDATE_THROTTLE_MS);
    }

    function getInstanceName(instanceKey, serviceNameSupplier) {
        const instanceConfig = serviceInstanceConfigMap[instanceKey] ?? {};
        return getDisplayInstanceName(instanceConfig[INSTANCE_NAME_CONFIG_KEY], serviceNameSupplier);
    }

    function getServiceDisplayLabel(instanceKey) {
        if (isAiTranslateServiceKey(instanceKey)) {
            const { bindingConfig, aiConfig } = getAiTranslateMeta(instanceKey);
            return getAiTranslateDisplayName(
                bindingConfig,
                aiConfig,
                t('ai_config.translate_service_title', { defaultValue: 'AI Translate' })
            );
        }

        return whetherPluginService(instanceKey)
            ? getInstanceName(instanceKey, () => pluginList['translate'][getServiceName(instanceKey)].display)
            : getInstanceName(instanceKey, () => t(`services.translate.${getServiceName(instanceKey)}.title`));
    }

    function renderServiceIcon(instanceKey, className) {
        if (isAiTranslateServiceKey(instanceKey)) {
            const { aiConfig } = getAiTranslateMeta(instanceKey);
            const providerId = getAiProviderId(getMergedAiApiConfig(aiConfig));

            return (
                <span className={`flex items-center justify-center ${className}`}>
                    <AiProviderIcon
                        providerId={providerId}
                        className='text-[16px]'
                    />
                </span>
            );
        }

        return (
            <img
                src={
                    whetherPluginService(instanceKey)
                        ? pluginList['translate'][getServiceName(instanceKey)].icon
                        : builtinServices[getServiceName(instanceKey)].info.icon
                }
                alt=''
                className={className}
            />
        );
    }

    useEffect(() => {
        if (error) {
            logError(`[${currentTranslateServiceInstanceKey}]happened error: ` + error);
        }
    }, [currentTranslateServiceInstanceKey, error]);

    useEffect(() => {
        clearPendingResultUpdate();
        setResult('');
        setError('');

        if (
            sourceText.trim() !== '' &&
            sourceLanguage &&
            targetLanguage &&
            autoCopy !== null &&
            hideWindow !== null &&
            copyActionModeReady
        ) {
            if (autoCopy === 'source' && !isCopyActionEnabled) {
                writeText(sourceText).then(() => {
                    if (hideWindow) {
                        sendNotification({ title: t('common.write_clipboard'), body: sourceText });
                    }
                });
            }

            translate();
        } else {
            setIsLoading(false);
        }
    }, [
        autoCopy,
        copyActionModeReady,
        currentTranslateServiceInstanceKey,
        hideWindow,
        isCopyActionEnabled,
        sourceLanguage,
        sourceText,
        targetLanguage,
    ]);

    useEffect(() => {
        return () => {
            clearPendingResultUpdate();
        };
    }, []);

    useEffect(() => {
        if (
            !availableTranslateServiceInstanceList.includes(currentTranslateServiceInstanceKey) &&
            availableTranslateServiceInstanceList.length > 0
        ) {
            setCurrentTranslateServiceInstanceKey(availableTranslateServiceInstanceList[0]);
        }
    }, [availableTranslateServiceInstanceList, currentTranslateServiceInstanceKey]);

    const addToHistory = async (text, source, target, serviceInstanceKey, nextResult) => {
        const db = await Database.load('sqlite:history.db');

        await db
            .execute(
                'INSERT into history (text, source, target, service, result, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
                [text, source, target, serviceInstanceKey, nextResult, Date.now()]
            )
            .then(
                () => {
                    db.close();
                },
                () => {
                    db.execute(
                        'CREATE TABLE history(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL,source TEXT NOT NULL,target TEXT NOT NULL,service TEXT NOT NULL, result TEXT NOT NULL,timestamp INTEGER NOT NULL)'
                    ).then(() => {
                        db.close();
                        addToHistory(text, source, target, serviceInstanceKey, nextResult);
                    });
                }
            );
    };

    const translate = async () => {
        let id = nanoid();
        translateID[index] = id;
        if (index === 0) {
            setCollapsed(false);
        }
        setIsLoading(true);

        const translateServiceName = getServiceName(currentTranslateServiceInstanceKey);

        if (isAiTranslateServiceKey(currentTranslateServiceInstanceKey)) {
            const { bindingConfig, aiConfig } = getAiTranslateMeta(currentTranslateServiceInstanceKey);
            const LanguageEnum = getAiTranslateLanguageEnum();

            if (sourceLanguage in LanguageEnum && targetLanguage in LanguageEnum) {
                translateWithAiBinding(
                    sourceText.trim(),
                    LanguageEnum[sourceLanguage],
                    LanguageEnum[targetLanguage],
                    bindingConfig,
                    aiConfig,
                    {
                        detect: detectLanguage,
                        setResult: (value) => {
                            if (translateID[index] !== id) return;
                            applyResultUpdate(value);
                        },
                    }
                ).then(
                    (value) => {
                        info(`[${currentTranslateServiceInstanceKey}]resolve:` + value);
                        if (translateID[index] !== id) return;

                        const nextResult = typeof value === 'string' ? value.trim() : value;
                        applyResultUpdate(nextResult, true);
                        setIsLoading(false);

                        if (!historyDisable && typeof nextResult === 'string' && nextResult !== '') {
                            addToHistory(
                                sourceText.trim(),
                                detectLanguage,
                                targetLanguage,
                                currentTranslateServiceInstanceKey,
                                nextResult
                            );
                        }

                        if (index === 0 && !isCopyActionEnabled && typeof value === 'string') {
                            switch (autoCopy) {
                                case 'target':
                                    writeText(value).then(() => {
                                        if (hideWindow) {
                                            sendNotification({ title: t('common.write_clipboard'), body: value });
                                        }
                                    });
                                    break;
                                case 'source_target':
                                    writeText(sourceText.trim() + '\n\n' + value).then(() => {
                                        if (hideWindow) {
                                            sendNotification({
                                                title: t('common.write_clipboard'),
                                                body: sourceText.trim() + '\n\n' + value,
                                            });
                                        }
                                    });
                                    break;
                                default:
                                    break;
                            }
                        }
                    },
                    (e) => {
                        info(`[${currentTranslateServiceInstanceKey}]reject:` + e);
                        if (translateID[index] !== id) return;
                        clearPendingResultUpdate();
                        setError(e.toString());
                        setIsLoading(false);
                    }
                );
            } else {
                clearPendingResultUpdate();
                setError('Language not supported');
                setIsLoading(false);
            }
        } else if (whetherPluginService(currentTranslateServiceInstanceKey)) {
            const pluginInfo = pluginList['translate'][translateServiceName];
            if (sourceLanguage in pluginInfo.language && targetLanguage in pluginInfo.language) {
                const instanceConfig = serviceInstanceConfigMap[currentTranslateServiceInstanceKey];
                instanceConfig['enable'] = 'true';
                let [func, utils] = await invoke_plugin('translate', translateServiceName);
                func(sourceText.trim(), pluginInfo.language[sourceLanguage], pluginInfo.language[targetLanguage], {
                    config: instanceConfig,
                    detect: detectLanguage,
                    setResult: (value) => {
                        if (translateID[index] !== id) return;
                        applyResultUpdate(value);
                    },
                    utils,
                }).then(
                    (value) => {
                        info(`[${currentTranslateServiceInstanceKey}]resolve:` + value);
                        if (translateID[index] !== id) return;

                        const nextResult = typeof value === 'string' ? value.trim() : value;
                        applyResultUpdate(nextResult, true);
                        setIsLoading(false);

                        if (!historyDisable && typeof nextResult === 'string' && nextResult !== '') {
                            addToHistory(
                                sourceText.trim(),
                                detectLanguage,
                                targetLanguage,
                                translateServiceName,
                                nextResult
                            );
                        }

                        if (index === 0 && !isCopyActionEnabled && typeof value === 'string') {
                            switch (autoCopy) {
                                case 'target':
                                    writeText(value).then(() => {
                                        if (hideWindow) {
                                            sendNotification({ title: t('common.write_clipboard'), body: value });
                                        }
                                    });
                                    break;
                                case 'source_target':
                                    writeText(sourceText.trim() + '\n\n' + value).then(() => {
                                        if (hideWindow) {
                                            sendNotification({
                                                title: t('common.write_clipboard'),
                                                body: sourceText.trim() + '\n\n' + value,
                                            });
                                        }
                                    });
                                    break;
                                default:
                                    break;
                            }
                        }
                    },
                    (e) => {
                        info(`[${currentTranslateServiceInstanceKey}]reject:` + e);
                        if (translateID[index] !== id) return;
                        clearPendingResultUpdate();
                        setError(e.toString());
                        setIsLoading(false);
                    }
                );
            } else {
                clearPendingResultUpdate();
                setError('Language not supported');
                setIsLoading(false);
            }
        } else {
            const builtinService = builtinServices[translateServiceName];
            if (!builtinService) {
                clearPendingResultUpdate();
                setError('Service not available');
                setIsLoading(false);
                return;
            }

            const LanguageEnum = builtinService.Language;
            if (sourceLanguage in LanguageEnum && targetLanguage in LanguageEnum) {
                const instanceConfig = serviceInstanceConfigMap[currentTranslateServiceInstanceKey];
                builtinService
                    .translate(sourceText.trim(), LanguageEnum[sourceLanguage], LanguageEnum[targetLanguage], {
                        config: instanceConfig,
                        detect: detectLanguage,
                        setResult: (value) => {
                            if (translateID[index] !== id) return;
                            applyResultUpdate(value);
                        },
                    })
                    .then(
                        (value) => {
                            info(`[${currentTranslateServiceInstanceKey}]resolve:` + value);
                            if (translateID[index] !== id) return;

                            const nextResult = typeof value === 'string' ? value.trim() : value;
                            applyResultUpdate(nextResult, true);
                            setIsLoading(false);

                            if (!historyDisable && typeof nextResult === 'string' && nextResult !== '') {
                                addToHistory(
                                    sourceText.trim(),
                                    detectLanguage,
                                    targetLanguage,
                                    translateServiceName,
                                    nextResult
                                );
                            }

                            if (index === 0 && !isCopyActionEnabled && typeof value === 'string') {
                                switch (autoCopy) {
                                    case 'target':
                                        writeText(value).then(() => {
                                            if (hideWindow) {
                                                sendNotification({ title: t('common.write_clipboard'), body: value });
                                            }
                                        });
                                        break;
                                    case 'source_target':
                                        writeText(sourceText.trim() + '\n\n' + value).then(() => {
                                            if (hideWindow) {
                                                sendNotification({
                                                    title: t('common.write_clipboard'),
                                                    body: sourceText.trim() + '\n\n' + value,
                                                });
                                            }
                                        });
                                        break;
                                    default:
                                        break;
                                }
                            }
                        },
                        (e) => {
                            info(`[${currentTranslateServiceInstanceKey}]reject:` + e);
                            if (translateID[index] !== id) return;
                            clearPendingResultUpdate();
                            setError(e.toString());
                            setIsLoading(false);
                        }
                    );
            } else {
                clearPendingResultUpdate();
                setError('Language not supported');
                setIsLoading(false);
            }
        }
    };

    useEffect(() => {
        if (!textAreaRef.current) {
            return;
        }

        textAreaRef.current.style.height = '0px';
        if (typeof result === 'string' && result !== '') {
            textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
        }
    }, [result]);

    const hasStringResult = typeof result === 'string' && result.trim() !== '';
    const hasStructuredResult =
        !!result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length > 0;
    const previewText =
        error !== ''
            ? error.split('\n')[0]
            : hasStringResult
              ? result.replace(/\s+/g, ' ').trim()
              : getStructuredPreview(result);
    const headerPreview = previewText || (isLoading ? '...' : '');
    const showBody = !collapsed && (isLoading || hasStringResult || hasStructuredResult || error !== '');
    const showFooter = !collapsed && (hasStringResult || error !== '');

    if (!initialServiceAvailable || availableTranslateServiceInstanceList.length === 0) {
        return null;
    }

    const handleSpeak = async () => {
        const data = await synthesizeBuiltInTts(result, targetLanguage);
        speak(data);
    };

    const handleTranslateBack = async () => {
        if (!hasStringResult) {
            return;
        }

        setError('');
        setIsLoading(true);
        if (index === 0) {
            setCollapsed(false);
        }

        let newTargetLanguage = sourceLanguage;
        if (sourceLanguage === 'auto') {
            newTargetLanguage = detectLanguage;
        }
        let newSourceLanguage = targetLanguage;
        if (sourceLanguage === 'auto') {
            newSourceLanguage = 'auto';
        }

        if (isAiTranslateServiceKey(currentTranslateServiceInstanceKey)) {
            const { bindingConfig, aiConfig } = getAiTranslateMeta(currentTranslateServiceInstanceKey);
            const LanguageEnum = getAiTranslateLanguageEnum();

            if (newSourceLanguage in LanguageEnum && newTargetLanguage in LanguageEnum) {
                translateWithAiBinding(
                    result.trim(),
                    LanguageEnum[newSourceLanguage],
                    LanguageEnum[newTargetLanguage],
                    bindingConfig,
                    aiConfig,
                    {
                        detect: newSourceLanguage,
                        setResult: (value) => {
                            applyResultUpdate(value);
                        },
                    }
                ).then(
                    (value) => {
                        applyResultUpdate(typeof value === 'string' ? value.trim() : value, true);
                        setIsLoading(false);
                    },
                    (e) => {
                        clearPendingResultUpdate();
                        setError(e.toString());
                        setIsLoading(false);
                    }
                );
            } else {
                clearPendingResultUpdate();
                setError('Language not supported');
                setIsLoading(false);
            }
        } else if (whetherPluginService(currentTranslateServiceInstanceKey)) {
            const pluginInfo = pluginList['translate'][getServiceName(currentTranslateServiceInstanceKey)];
            if (newSourceLanguage in pluginInfo.language && newTargetLanguage in pluginInfo.language) {
                const instanceConfig = serviceInstanceConfigMap[currentTranslateServiceInstanceKey];
                instanceConfig['enable'] = 'true';
                let [func, utils] = await invoke_plugin(
                    'translate',
                    getServiceName(currentTranslateServiceInstanceKey)
                );
                func(result.trim(), pluginInfo.language[newSourceLanguage], pluginInfo.language[newTargetLanguage], {
                    config: instanceConfig,
                    detect: detectLanguage,
                    setResult: (value) => {
                        applyResultUpdate(value);
                    },
                    utils,
                }).then(
                    (value) => {
                        applyResultUpdate(typeof value === 'string' ? value.trim() : value, true);
                        setIsLoading(false);
                    },
                    (e) => {
                        clearPendingResultUpdate();
                        setError(e.toString());
                        setIsLoading(false);
                    }
                );
            } else {
                clearPendingResultUpdate();
                setError('Language not supported');
                setIsLoading(false);
            }
        } else {
            const builtinService = builtinServices[getServiceName(currentTranslateServiceInstanceKey)];
            if (!builtinService) {
                clearPendingResultUpdate();
                setError('Service not available');
                setIsLoading(false);
                return;
            }

            const LanguageEnum = builtinService.Language;
            if (newSourceLanguage in LanguageEnum && newTargetLanguage in LanguageEnum) {
                const instanceConfig = serviceInstanceConfigMap[currentTranslateServiceInstanceKey];
                builtinService
                    .translate(result.trim(), LanguageEnum[newSourceLanguage], LanguageEnum[newTargetLanguage], {
                        config: instanceConfig,
                        detect: newSourceLanguage,
                        setResult: (value) => {
                            applyResultUpdate(value);
                        },
                    })
                    .then(
                        (value) => {
                            applyResultUpdate(typeof value === 'string' ? value.trim() : value, true);
                            setIsLoading(false);
                        },
                        (e) => {
                            clearPendingResultUpdate();
                            setError(e.toString());
                            setIsLoading(false);
                        }
                    );
            } else {
                clearPendingResultUpdate();
                setError('Language not supported');
                setIsLoading(false);
            }
        }
    };

    return (
        <div className='overflow-hidden rounded-[14px] border border-default-200/80 bg-content1'>
            <Toaster />
            <div
                className='flex items-center justify-between gap-2 px-3 py-2'
                {...drag}
            >
                <div className='min-w-0 flex-1'>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                size='sm'
                                variant='light'
                                className={SERVICE_TRIGGER_BUTTON_CLASS}
                            >
                                <div className='flex min-w-0 items-center gap-2'>
                                    {renderServiceIcon(
                                        currentTranslateServiceInstanceKey,
                                        'h-4 w-4 shrink-0 rounded-[4px]'
                                    )}
                                    <div className='min-w-0 text-left'>
                                        <div className='truncate text-[13px] font-medium text-foreground'>
                                            {getServiceDisplayLabel(currentTranslateServiceInstanceKey)}
                                        </div>
                                        {headerPreview ? (
                                            <div
                                                className={`truncate text-[11px] ${
                                                    error !== '' ? 'text-danger-500' : 'text-default-400'
                                                }`}
                                            >
                                                {headerPreview}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label='Translate Service'
                            className='max-h-[40vh] overflow-y-auto'
                            onAction={(key) => {
                                setCurrentTranslateServiceInstanceKey(String(key));
                            }}
                        >
                            {availableTranslateServiceInstanceList.map((instanceKey) => {
                                return (
                                    <DropdownItem
                                        key={instanceKey}
                                        startContent={renderServiceIcon(instanceKey, 'h-4 w-4 rounded-[4px]')}
                                    >
                                        {getServiceDisplayLabel(instanceKey)}
                                    </DropdownItem>
                                );
                            })}
                        </DropdownMenu>
                    </Dropdown>
                </div>
                <div className='flex items-center gap-1'>
                    {isLoading ? (
                        <span className='px-1 text-[11px] text-default-400'>{t('translate.translate')}...</span>
                    ) : null}
                    <Button
                        size='sm'
                        isIconOnly
                        variant='light'
                        className={HEADER_ACTION_BUTTON_CLASS}
                        onPress={() => setCollapsed((prev) => !prev)}
                    >
                        {collapsed ? (
                            <BiExpandVertical className='text-[15px]' />
                        ) : (
                            <BiCollapseVertical className='text-[15px]' />
                        )}
                    </Button>
                </div>
            </div>

            {showBody ? (
                <div className='overflow-hidden'>
                    <div className='border-t border-default-200/60 px-3 py-2.5 text-default-700'>
                        {isLoading && !hasStringResult && !hasStructuredResult && error === '' ? (
                            <div className='py-1 text-[12px] text-default-400'>{t('translate.translate')}...</div>
                        ) : null}

                        {hasStringResult ? (
                            <textarea
                                ref={textAreaRef}
                                className='h-0 w-full resize-none bg-transparent text-foreground outline-none'
                                style={{
                                    fontSize: DEFAULT_APP_FONT_SIZE,
                                    lineHeight: 1.6,
                                }}
                                readOnly
                                value={result}
                            />
                        ) : null}
                        {hasStructuredResult ? (
                            <div className='space-y-1.5 text-[14px] leading-[1.6] text-default-700'>
                                {result.pronunciations?.map((pronunciation, pronunciationIndex) => {
                                    return (
                                        <div
                                            key={`${pronunciation.region ?? ''}-${pronunciation.symbol ?? ''}-${pronunciationIndex}`}
                                            className='flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] bg-default-50/65 px-2.5 py-2'
                                        >
                                            {pronunciation.region ? (
                                                <span
                                                    className='text-default-500'
                                                    style={{ fontSize: DEFAULT_APP_FONT_SIZE }}
                                                >
                                                    {pronunciation.region}
                                                </span>
                                            ) : null}
                                            {pronunciation.symbol ? (
                                                <span
                                                    className='text-default-500'
                                                    style={{ fontSize: DEFAULT_APP_FONT_SIZE }}
                                                >
                                                    {pronunciation.symbol}
                                                </span>
                                            ) : null}
                                            {pronunciation.voice ? (
                                                <HiOutlineVolumeUp
                                                    className='cursor-pointer text-default-500'
                                                    style={{ fontSize: DEFAULT_APP_FONT_SIZE }}
                                                    onClick={() => {
                                                        speak(pronunciation.voice);
                                                    }}
                                                />
                                            ) : null}
                                        </div>
                                    );
                                })}

                                {result.explanations?.map((explanations, explanationGroupIndex) => {
                                    return (
                                        <div
                                            key={`${explanations.trait ?? 'trait'}-${explanationGroupIndex}`}
                                            className='rounded-[10px] bg-default-50/65 px-2.5 py-2'
                                        >
                                            {explanations.explains?.map((explain, explainIndex) => {
                                                return (
                                                    <span key={`${explanationGroupIndex}-${explainIndex}`}>
                                                        {explainIndex === 0 ? (
                                                            <>
                                                                <span
                                                                    className='mr-2 text-default-500'
                                                                    style={{ fontSize: DEFAULT_APP_FONT_SIZE - 2 }}
                                                                >
                                                                    {explanations.trait}
                                                                </span>
                                                                <span
                                                                    className='font-semibold text-foreground select-text'
                                                                    style={{ fontSize: DEFAULT_APP_FONT_SIZE }}
                                                                >
                                                                    {explain}
                                                                </span>
                                                                <br />
                                                            </>
                                                        ) : (
                                                            <span
                                                                className='mr-1 text-default-500 select-text'
                                                                style={{ fontSize: DEFAULT_APP_FONT_SIZE - 2 }}
                                                            >
                                                                {explain}
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    );
                                })}

                                {result.associations?.map((association, associationIndex) => {
                                    return (
                                        <div
                                            key={`${association}-${associationIndex}`}
                                            className='rounded-[10px] bg-default-50/60 px-2.5 py-2'
                                        >
                                            <span
                                                className='text-default-500'
                                                style={{ fontSize: DEFAULT_APP_FONT_SIZE }}
                                            >
                                                {association}
                                            </span>
                                        </div>
                                    );
                                })}

                                {result.sentence?.map((sentence, sentenceIndex) => {
                                    return (
                                        <div
                                            key={`${sentence.source ?? sentence.target ?? 'sentence'}-${sentenceIndex}`}
                                            className='rounded-[10px] bg-default-50/65 px-2.5 py-2'
                                        >
                                            <span
                                                className='mr-2 text-default-500'
                                                style={{ fontSize: DEFAULT_APP_FONT_SIZE - 2 }}
                                            >
                                                {sentenceIndex + 1}.
                                            </span>
                                            {sentence.source ? (
                                                <span
                                                    className='select-text'
                                                    style={{ fontSize: DEFAULT_APP_FONT_SIZE }}
                                                    dangerouslySetInnerHTML={{
                                                        __html: sentence.source,
                                                    }}
                                                />
                                            ) : null}
                                            {sentence.target ? (
                                                <div
                                                    className='mt-1 text-default-500 select-text'
                                                    style={{ fontSize: DEFAULT_APP_FONT_SIZE }}
                                                    dangerouslySetInnerHTML={{
                                                        __html: sentence.target,
                                                    }}
                                                />
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}

                        {error !== '' ? (
                            <div className='mt-2 space-y-1.5'>
                                {error.split('\n').map((value) => {
                                    return (
                                        <p
                                            key={value}
                                            className='rounded-[10px] bg-danger-50/80 px-2.5 py-2 text-[12px] text-danger-600'
                                        >
                                            {value}
                                        </p>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    {showFooter ? (
                        <div className='flex items-center justify-between gap-2 border-t border-default-200/60 bg-default-50/35 px-3 py-1.5'>
                            <div className='flex items-center gap-1'>
                                <Tooltip content={t('translate.speak')}>
                                    <Button
                                        isIconOnly
                                        variant='light'
                                        size='sm'
                                        className={FOOTER_ACTION_BUTTON_CLASS}
                                        isDisabled={!hasStringResult}
                                        onPress={() => {
                                            handleSpeak().catch((e) => {
                                                toast.error(e.toString(), { style: toastStyle });
                                            });
                                        }}
                                    >
                                        <HiOutlineVolumeUp className='text-[15px]' />
                                    </Button>
                                </Tooltip>
                                <Tooltip content={t('translate.copy')}>
                                    <Button
                                        isIconOnly
                                        variant='light'
                                        size='sm'
                                        className={FOOTER_ACTION_BUTTON_CLASS}
                                        isDisabled={!hasStringResult}
                                        onPress={() => {
                                            writeText(result);
                                        }}
                                    >
                                        <MdContentCopy className='text-[15px]' />
                                    </Button>
                                </Tooltip>
                                <Tooltip content={t('translate.translate_back')}>
                                    <Button
                                        isIconOnly
                                        variant='light'
                                        size='sm'
                                        className={FOOTER_ACTION_BUTTON_CLASS}
                                        isDisabled={!hasStringResult}
                                        onPress={handleTranslateBack}
                                    >
                                        <TbTransformFilled className='text-[15px]' />
                                    </Button>
                                </Tooltip>
                                {error !== '' ? (
                                    <Tooltip content={t('translate.retry')}>
                                        <Button
                                            isIconOnly
                                            variant='light'
                                            size='sm'
                                            className={FOOTER_ACTION_BUTTON_CLASS}
                                            onPress={() => {
                                                setError('');
                                                setResult('');
                                                translate();
                                            }}
                                        >
                                            <GiCycle className='text-[15px]' />
                                        </Button>
                                    </Tooltip>
                                ) : null}
                            </div>

                            <div className='flex items-center gap-1'></div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
