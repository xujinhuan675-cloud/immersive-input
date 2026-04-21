import { Button, Card, CardBody, CardFooter, Tooltip } from '@nextui-org/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { writeText } from '@tauri-apps/api/clipboard';
import { HiOutlineVolumeUp, HiTranslate } from 'react-icons/hi';
import { appWindow } from '@tauri-apps/api/window';
import toast, { Toaster } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import { MdContentCopy, MdSmartButton } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { LuDelete } from 'react-icons/lu';
import { invoke } from '@tauri-apps/api';
import { atom, useAtom } from 'jotai';

import { getServiceName, getServiceSouceType, ServiceSourceType } from '../../../../utils/service_instance';
import { useConfig, useSyncAtom, useToastStyle, useVoice } from '../../../../hooks';
import { invoke_plugin } from '../../../../utils/invoke_plugin';
import { DEFAULT_APP_FONT_SIZE } from '../../../../utils/appFont';
import * as recognizeServices from '../../../../services/recognize';
import { synthesizeBuiltInTts } from '../../../../services/tts/runtime';
import detect from '../../../../utils/lang_detect';

export const sourceTextAtom = atom('');
export const detectLanguageAtom = atom('');

const TOOL_ICON_BUTTON_CLASS =
    'h-7 w-7 min-w-0 rounded-[8px] text-default-400 transition-colors hover:bg-default-100 hover:text-default-600 data-[hover=true]:bg-default-100';
const PRIMARY_TRANSLATE_BUTTON_CLASS =
    'h-8 rounded-[9px] bg-default-900 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90';

export default function SourceArea(props) {
    const { pluginList, serviceInstanceConfigMap } = props;
    const [sourceText, setSourceText, syncSourceText] = useSyncAtom(sourceTextAtom);
    const [detectLanguage, setDetectLanguage] = useAtom(detectLanguageAtom);
    const [incrementalTranslate] = useConfig('incremental_translate', false);
    const [dynamicTranslate] = useConfig('dynamic_translate', false);
    const [deleteNewline] = useConfig('translate_delete_newline', false);
    const [hideWindow] = useConfig('translate_hide_window', false);
    const [hideSource] = useConfig('hide_source', false);
    const [recognizeLanguage] = useConfig('recognize_language', 'auto');
    const [recognizeServiceList] = useConfig('recognize_service_list', ['system', 'tesseract']);
    const [windowType, setWindowType] = useState('[SELECTION_TRANSLATE]');
    const toastStyle = useToastStyle();
    const { t } = useTranslation();
    const textAreaRef = useRef(null);
    const sourceTextChangeTimerRef = useRef(null);
    const handleNewTextRef = useRef(null);
    const hasHydratedInitialTextRef = useRef(false);
    const speak = useVoice();
    const hasSourceText = sourceText.trim() !== '';

    const appendIncrementalText = useCallback((previousText, incomingText) => {
        return previousText ? `${previousText} ${incomingText}` : incomingText;
    }, []);

    const detect_language = useCallback(
        async (text) => {
            const nextText = text.trim();
            if (!nextText) {
                setDetectLanguage('');
                return;
            }

            setDetectLanguage(await detect(nextText));
        },
        [setDetectLanguage]
    );

    const handleNewText = useCallback(
        async (text) => {
            text = text.trim();
            if (hideWindow) {
                await appWindow.hide().catch(() => {});
            }

            setDetectLanguage('');
            if (text === '[INPUT_TRANSLATE]') {
                setWindowType('[INPUT_TRANSLATE]');
                setSourceText('', true);
                return;
            }

            if (text === '[IMAGE_TRANSLATE]') {
                setWindowType('[IMAGE_TRANSLATE]');
                const base64 = await invoke('get_base64');
                const serviceInstanceKey = recognizeServiceList[0];
                if (getServiceSouceType(serviceInstanceKey) === ServiceSourceType.PLUGIN) {
                    if (recognizeLanguage in pluginList['recognize'][getServiceName(serviceInstanceKey)].language) {
                        const pluginConfig = serviceInstanceConfigMap[serviceInstanceKey];

                        let [func, utils] = await invoke_plugin('recognize', getServiceName(serviceInstanceKey));
                        func(
                            base64,
                            pluginList['recognize'][getServiceName(serviceInstanceKey)].language[recognizeLanguage],
                            {
                                config: pluginConfig,
                                utils,
                            }
                        ).then(
                            (v) => {
                                let newText = v.trim();
                                if (deleteNewline) {
                                    newText = v.replace(/\-\s+/g, '').replace(/\s+/g, ' ');
                                }
                                if (incrementalTranslate) {
                                    setSourceText((old) => {
                                        return appendIncrementalText(old, newText);
                                    });
                                } else {
                                    setSourceText(newText);
                                }
                                detect_language(newText).then(() => {
                                    syncSourceText();
                                });
                            },
                            (e) => {
                                setSourceText(e.toString());
                            }
                        );
                    } else {
                        setSourceText('Language not supported');
                    }
                } else {
                    if (recognizeLanguage in recognizeServices[getServiceName(serviceInstanceKey)].Language) {
                        const instanceConfig = serviceInstanceConfigMap[serviceInstanceKey];
                        recognizeServices[getServiceName(serviceInstanceKey)]
                            .recognize(
                                base64,
                                recognizeServices[getServiceName(serviceInstanceKey)].Language[recognizeLanguage],
                                {
                                    config: instanceConfig,
                                }
                            )
                            .then(
                                (v) => {
                                    let newText = v.trim();
                                    if (deleteNewline) {
                                        newText = v.replace(/\-\s+/g, '').replace(/\s+/g, ' ');
                                    }
                                    if (incrementalTranslate) {
                                        setSourceText((old) => {
                                            return appendIncrementalText(old, newText);
                                        });
                                    } else {
                                        setSourceText(newText);
                                    }
                                    detect_language(newText).then(() => {
                                        syncSourceText();
                                    });
                                },
                                (e) => {
                                    setSourceText(e.toString());
                                }
                            );
                    } else {
                        setSourceText('Language not supported');
                    }
                }
                return;
            }

            setWindowType('[SELECTION_TRANSLATE]');
            let newText = deleteNewline ? text.replace(/\-\s+/g, '').replace(/\s+/g, ' ') : text.trim();
            if (incrementalTranslate) {
                setSourceText((old) => {
                    return appendIncrementalText(old, newText);
                });
            } else {
                setSourceText(newText);
            }
            detect_language(newText).then(() => {
                syncSourceText();
            });
        },
        [
            appendIncrementalText,
            deleteNewline,
            detect_language,
            hideWindow,
            incrementalTranslate,
            pluginList,
            recognizeLanguage,
            recognizeServiceList,
            serviceInstanceConfigMap,
            setDetectLanguage,
            setSourceText,
            syncSourceText,
        ]
    );

    useEffect(() => {
        handleNewTextRef.current = handleNewText;
    }, [handleNewText]);

    const keyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            detect_language(sourceText).then(() => {
                syncSourceText();
            });
        }
        if (event.key === 'Escape') {
            appWindow.close();
        }
    };

    const changeSourceText = useCallback(
        async (text) => {
            setDetectLanguage('');
            await setSourceText(text);

            if (sourceTextChangeTimerRef.current) {
                clearTimeout(sourceTextChangeTimerRef.current);
                sourceTextChangeTimerRef.current = null;
            }

            if (dynamicTranslate && text.trim() !== '') {
                sourceTextChangeTimerRef.current = setTimeout(() => {
                    detect_language(text).then(() => {
                        syncSourceText();
                    });
                }, 650);
            }
        },
        [detect_language, dynamicTranslate, setDetectLanguage, setSourceText, syncSourceText]
    );

    const handleSpeak = async () => {
        let detected = detectLanguage;
        if (detected === '') {
            detected = await detect(sourceText);
            setDetectLanguage(detected);
        }
        const data = await synthesizeBuiltInTts(sourceText, detected);
        speak(data);
    };

    useEffect(() => {
        const unlistenPromise = listen('new_text', (event) => {
            handleNewTextRef.current?.(event.payload);
        });
        return () => {
            unlistenPromise.then((fn) => {
                fn();
            });
        };
    }, []);

    useEffect(() => {
        if (
            hasHydratedInitialTextRef.current ||
            deleteNewline === null ||
            incrementalTranslate === null ||
            recognizeLanguage === null ||
            recognizeServiceList === null
        ) {
            return;
        }

        hasHydratedInitialTextRef.current = true;
        invoke('get_text').then((v) => {
            if (v?.trim()) {
                handleNewTextRef.current?.(v);
            }
        });
    }, [deleteNewline, incrementalTranslate, recognizeLanguage, recognizeServiceList]);

    useEffect(() => {
        if (!textAreaRef.current) return;
        textAreaRef.current.style.height = '44px';
        textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
    }, [sourceText]);

    useEffect(() => {
        return () => {
            if (sourceTextChangeTimerRef.current) {
                clearTimeout(sourceTextChangeTimerRef.current);
            }
        };
    }, []);

    const transformVarName = function (str) {
        let str2 = str;

        if (/_[a-z]/.test(str2)) {
            str2 = str2
                .split('_')
                .map((it) => it.toLocaleUpperCase())
                .join('_');
        }
        if (str2 !== str) {
            return str2;
        }

        if (/^[A-Z]+(_[A-Z]+)*$/.test(str2)) {
            str2 = str2
                .split('_')
                .map((it) => it.toLocaleLowerCase())
                .join('-');
        }
        if (str2 !== str) {
            return str2;
        }

        if (/-/.test(str2)) {
            str2 = str2
                .split('-')
                .map((it) => it.toLocaleLowerCase())
                .join('.');
        }
        if (str2 !== str) {
            return str2;
        }

        if (/\.[a-z]/.test(str2)) {
            str2 = str2.replaceAll(/(\.)([a-z])/g, (_, _2, it) => ' ' + it);
        }
        if (str2 !== str) {
            return str2;
        }

        if (/\s[a-z]/.test(str2)) {
            str2 = str2.replaceAll(/\s([a-z])/g, (_, it) => ' ' + it.toLocaleUpperCase());
            str2 = str2.substring(0, 1).toLocaleUpperCase() + str2.substring(1);
        }
        if (str2 !== str) {
            return str2;
        }

        if (/\s[A-Z]/.test(str2)) {
            str2 = str2.replaceAll(/\s([A-Z])/g, (_, it) => it);
            str2 = str2.substring(0, 1).toLocaleLowerCase() + str2.substring(1);
        }
        if (str2 !== str) {
            return str2;
        }

        if (/^[a-z]+[A-Z]+/.test(str2)) {
            str2 = str2.substring(0, 1).toLocaleUpperCase() + str2.substring(1);
        }
        if (str2 !== str) {
            return str2;
        }

        if (/[^\s][A-Z]/.test(str2)) {
            str2 = str2.replaceAll(/[A-Z]/g, (it, offset) => {
                return (offset === 0 ? '' : '_') + it.toLocaleLowerCase();
            });
        }

        return str2;
    };

    useEffect(() => {
        if (!textAreaRef.current) {
            return undefined;
        }

        const handleTransformShortcut = async (event) => {
            if (event.altKey && event.shiftKey && event.code === 'KeyU') {
                const originText = textAreaRef.current.value;
                const selectionStart = textAreaRef.current.selectionStart;
                const selectionEnd = textAreaRef.current.selectionEnd;
                const selectionText = originText.substring(selectionStart, selectionEnd);

                const convertedText = transformVarName(selectionText);
                const targetText =
                    originText.substring(0, selectionStart) + convertedText + originText.substring(selectionEnd);

                await changeSourceText(targetText);
                textAreaRef.current.selectionStart = selectionStart;
                textAreaRef.current.selectionEnd = selectionStart + convertedText.length;
            }
        };

        textAreaRef.current.addEventListener('keydown', handleTransformShortcut);
        return () => {
            textAreaRef.current?.removeEventListener('keydown', handleTransformShortcut);
        };
    }, [changeSourceText]);

    return (
        <div className={hideSource && windowType !== '[INPUT_TRANSLATE]' ? 'hidden' : ''}>
            <Card
                shadow='none'
                className='mt-[1px] overflow-hidden rounded-[14px] border border-default-200/80 bg-content1/94 pb-0'
            >
                <Toaster />
                <CardBody className='max-h-[28vh] overflow-y-auto bg-content1 px-3 py-2.5 pb-1.5'>
                    <textarea
                        autoFocus
                        ref={textAreaRef}
                        placeholder={t('translate.source_placeholder')}
                        className='min-h-[76px] w-full resize-none bg-transparent text-foreground outline-none placeholder:text-default-300'
                        style={{
                            fontSize: DEFAULT_APP_FONT_SIZE,
                            lineHeight: 1.6,
                        }}
                        value={sourceText}
                        onKeyDown={keyDown}
                        onChange={(event) => {
                            changeSourceText(event.target.value);
                        }}
                    />
                </CardBody>

                <CardFooter className='flex items-center justify-between gap-2 border-t border-default-200/70 bg-default-50/40 px-3 py-1.5'>
                    <div className='flex items-center gap-1'>
                        <Tooltip content={t('translate.speak')}>
                            <Button
                                isIconOnly
                                variant='light'
                                size='sm'
                                className={TOOL_ICON_BUTTON_CLASS}
                                isDisabled={!hasSourceText}
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
                                className={TOOL_ICON_BUTTON_CLASS}
                                isDisabled={!hasSourceText}
                                onPress={() => {
                                    writeText(sourceText);
                                }}
                            >
                                <MdContentCopy className='text-[15px]' />
                            </Button>
                        </Tooltip>
                        <Tooltip content={t('translate.delete_newline')}>
                            <Button
                                isIconOnly
                                variant='light'
                                size='sm'
                                className={TOOL_ICON_BUTTON_CLASS}
                                isDisabled={!hasSourceText}
                                onPress={() => {
                                    const newText = sourceText.replace(/\-\s+/g, '').replace(/\s+/g, ' ');
                                    setSourceText(newText);
                                    detect_language(newText).then(() => {
                                        syncSourceText();
                                    });
                                }}
                            >
                                <MdSmartButton className='text-[15px]' />
                            </Button>
                        </Tooltip>
                        <Tooltip content={t('common.clear')}>
                            <Button
                                variant='light'
                                size='sm'
                                isIconOnly
                                className={TOOL_ICON_BUTTON_CLASS}
                                isDisabled={!hasSourceText}
                                onPress={() => {
                                    setDetectLanguage('');
                                    setSourceText('');
                                }}
                            >
                                <LuDelete className='text-[15px]' />
                            </Button>
                        </Tooltip>
                    </div>
                    <Button
                        size='sm'
                        className={PRIMARY_TRANSLATE_BUTTON_CLASS}
                        isDisabled={!hasSourceText}
                        startContent={<HiTranslate className='text-[14px]' />}
                        onPress={() => {
                            detect_language(sourceText).then(() => {
                                syncSourceText();
                            });
                        }}
                    >
                        {t('translate.translate')}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
