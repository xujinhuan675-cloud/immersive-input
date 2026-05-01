import { BaseDirectory, exists, readTextFile } from '@tauri-apps/api/fs';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/api/shell';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow, LogicalSize } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuClipboardCopy } from 'react-icons/lu';

import { useConfig } from '../../hooks/useConfig';
import * as builtinTranslateServices from '../../services/translate';
import { STYLE_KEYS, lightAiStream, streamOpenAiMessages } from '../../services/light_ai/openai';
import {
    AI_API_SERVICE_LIST_KEY,
    getActiveAiApiConfig,
    getAiHistoryServiceMeta,
} from '../../utils/aiConfig';
import { saveHistory } from '../../utils/aiHistory';
import {
    ensureAiTranslateBindings,
    getAiTranslateLanguageEnum,
    getLinkedAiServiceInstanceKey,
    getMergedAiTranslateConfig,
    isAiTranslateServiceKey,
    translateWithAiBinding,
} from '../../utils/aiTranslate';
import { formatText } from '../../utils/formatter';
import { invoke_plugin } from '../../utils/invoke_plugin';
import detect from '../../utils/lang_detect';
import { getServiceName, whetherPluginService } from '../../utils/service_instance';
import { store } from '../../utils/store';
import {
    createCumulativeStreamInputAdapter,
    createPartialAppliedError,
    createStreamInputWriter,
} from '../../utils/streamInput';
import {
    BASE_TOOLBAR_BUTTONS,
    getToolbarButtonLabel,
    SMART_TOOLBAR_BUTTON_MAP,
    TOOLBAR_BUTTON_ACTION_BEHAVIORS,
} from '../../utils/textSelectionToolbar';
import { calculateExpr, detectType } from '../../utils/textAnalyzer';
import { TRANSLATE_DEFAULT_VISIBLE } from '../Config/pages/Service/servicePriority';

const DEFAULT_HIDE_MS = 5000;
const BUTTON_SIZE = 34;
const BUTTON_GAP = 4;
const CARD_PADDING_X = 8;
const CARD_PADDING_Y = 8;
const ROW_HEIGHT = BUTTON_SIZE + CARD_PADDING_Y * 2;
const EXTRA_PANEL_HEIGHT = 44;
const MIN_WIDTH = 92;
const RESULT_MIN_WIDTH = 260;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RESULT_PANEL_STYLE = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderTop: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(248, 250, 252, 0.72)',
};
const EXPLAIN_SYSTEM_PROMPT =
    '你是一位知识渊博、表达清晰的解析助手。请围绕用户提供的文本或问题，解释核心含义、关键概念、上下文和实际用法。回答要准确、简洁、易懂。';
const translatePluginInfoCache = new Map();

function getFormulaResultText(text, calcResult) {
    const expression = (text || '').trim().replace(/=+\s*$/, '').trim();
    if (!expression) {
        return calcResult ?? '';
    }

    return `${expression} = ${calcResult}`;
}

function getButtonPalette(isAccent = false) {
    if (isAccent) {
        return {
            restBg: 'rgba(37, 99, 235, 0.10)',
            hoverBg: 'rgba(37, 99, 235, 0.16)',
            activeBg: 'rgba(37, 99, 235, 0.22)',
            color: '#2563eb',
        };
    }

    return {
        restBg: 'transparent',
        hoverBg: 'rgba(15, 23, 42, 0.06)',
        activeBg: 'rgba(15, 23, 42, 0.10)',
        color: '#475569',
    };
}

function applyButtonVisualState(element, palette, state) {
    if (!element) return;

    const background =
        state === 'active'
            ? palette.activeBg
            : state === 'hover'
              ? palette.hoverBg
              : palette.restBg;

    element.style.background = background;
    element.style.color = palette.color;
}

function normalizeQuickTextResult(value, fallbackErrorMessage) {
    if (typeof value === 'string') {
        const text = value.trim();
        if (text) {
            return text;
        }
    }

    throw new Error(fallbackErrorMessage);
}

function resolveTranslateSourceLanguageKey(configuredLanguage, detectedLanguage, languageEnum) {
    const preferredLanguage = configuredLanguage || 'auto';

    if (preferredLanguage in languageEnum) {
        return preferredLanguage;
    }
    if (preferredLanguage === 'auto' && detectedLanguage && detectedLanguage in languageEnum) {
        return detectedLanguage;
    }
    if ('auto' in languageEnum) {
        return 'auto';
    }
    if (detectedLanguage && detectedLanguage in languageEnum) {
        return detectedLanguage;
    }

    return preferredLanguage;
}

async function getTranslatePluginInfo(serviceName) {
    if (translatePluginInfoCache.has(serviceName)) {
        return translatePluginInfoCache.get(serviceName);
    }

    const infoPath = `plugins/translate/${serviceName}/info.json`;
    const hasInfo = await exists(infoPath, { dir: BaseDirectory.AppConfig }).catch(
        () => false
    );

    if (!hasInfo) {
        translatePluginInfoCache.set(serviceName, null);
        return null;
    }

    const info = await readTextFile(infoPath, {
        dir: BaseDirectory.AppConfig,
    })
        .then((value) => JSON.parse(value))
        .catch(() => null);

    translatePluginInfoCache.set(serviceName, info);
    return info;
}

async function resolveLightAiQuickResult(text, styleKey) {
    const sourceText = String(text || '').trim();
    if (!sourceText) {
        return '';
    }

    const apiConfig = await getActiveAiApiConfig();
    if (!apiConfig) {
        throw new Error('No active AI API configuration');
    }

    const resolvedStyle = STYLE_KEYS.includes(styleKey) ? styleKey : STYLE_KEYS[0];
    let streamedText = '';
    let finalText = '';
    let requestError = null;

    await lightAiStream(
        sourceText,
        resolvedStyle,
        '',
        apiConfig,
        (chunk) => {
            streamedText += chunk;
        },
        (result) => {
            finalText = result || streamedText;
        },
        (error) => {
            if (error) {
                requestError = error;
            }
        }
    );

    if (requestError) {
        throw new Error(requestError);
    }

    const resultText = normalizeQuickTextResult(
        finalText || streamedText,
        'Empty AI polish result'
    );

    await saveHistory('lightai', sourceText, resultText, {
        mode: 'style',
        style: resolvedStyle,
        applyTarget: 'selection',
        launchSource: 'toolbar_quick_apply',
        ...getAiHistoryServiceMeta(apiConfig),
    });
    return resultText;
}

async function streamLightAiQuickResult(text, styleKey) {
    const sourceText = String(text || '').trim();
    if (!sourceText) {
        return '';
    }

    const apiConfig = await getActiveAiApiConfig();
    if (!apiConfig) {
        throw new Error('No active AI API configuration');
    }

    const resolvedStyle = STYLE_KEYS.includes(styleKey) ? styleKey : STYLE_KEYS[0];
    const writer = createStreamInputWriter();
    let streamedText = '';
    let finalText = '';
    let requestError = null;

    await lightAiStream(
        sourceText,
        resolvedStyle,
        '',
        apiConfig,
        (chunk) => {
            streamedText += chunk;
            writer.enqueue(chunk);
        },
        (result) => {
            finalText = result || streamedText;
        },
        (error) => {
            if (error) {
                requestError = error;
            }
        }
    );

    try {
        await writer.finish();
    } catch (error) {
        throw createPartialAppliedError(error, writer);
    }

    if (requestError) {
        throw createPartialAppliedError(new Error(requestError), writer);
    }

    const resultText = normalizeQuickTextResult(
        finalText || streamedText,
        'Empty AI polish result'
    );

    await saveHistory('lightai', sourceText, resultText, {
        mode: 'style',
        style: resolvedStyle,
        applyTarget: 'selection_stream',
        launchSource: 'toolbar_stream_apply',
        ...getAiHistoryServiceMeta(apiConfig),
    });
    return resultText;
}

async function resolveExplainQuickResult(text) {
    const sourceText = String(text || '').trim();
    if (!sourceText) {
        return '';
    }

    const apiConfig = await getActiveAiApiConfig();
    if (!apiConfig) {
        throw new Error('No active AI API configuration');
    }

    let streamedText = '';
    let finalText = '';
    let requestError = null;

    await streamOpenAiMessages(
        [
            { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
            { role: 'user', content: sourceText },
        ],
        apiConfig,
        (chunk) => {
            streamedText += chunk;
        },
        (result) => {
            finalText = result || streamedText;
        },
        (error) => {
            if (error) {
                requestError = error;
            }
        }
    );

    if (requestError) {
        throw new Error(requestError);
    }

    const resultText = normalizeQuickTextResult(
        finalText || streamedText,
        'Empty explain result'
    );

    await saveHistory('explain', sourceText, resultText, getAiHistoryServiceMeta(apiConfig));
    return resultText;
}

async function streamExplainQuickResult(text) {
    const sourceText = String(text || '').trim();
    if (!sourceText) {
        return '';
    }

    const apiConfig = await getActiveAiApiConfig();
    if (!apiConfig) {
        throw new Error('No active AI API configuration');
    }

    const writer = createStreamInputWriter();
    let streamedText = '';
    let finalText = '';
    let requestError = null;

    await streamOpenAiMessages(
        [
            { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
            { role: 'user', content: sourceText },
        ],
        apiConfig,
        (chunk) => {
            streamedText += chunk;
            writer.enqueue(chunk);
        },
        (result) => {
            finalText = result || streamedText;
        },
        (error) => {
            if (error) {
                requestError = error;
            }
        }
    );

    try {
        await writer.finish();
    } catch (error) {
        throw createPartialAppliedError(error, writer);
    }

    if (requestError) {
        throw createPartialAppliedError(new Error(requestError), writer);
    }

    const resultText = normalizeQuickTextResult(
        finalText || streamedText,
        'Empty explain result'
    );

    await saveHistory('explain', sourceText, resultText, {
        applyTarget: 'selection_stream',
        launchSource: 'toolbar_stream_apply',
        ...getAiHistoryServiceMeta(apiConfig),
    });
    return resultText;
}

async function resolveTranslateQuickResult(text, options = {}) {
    const sourceText = String(text || '').trim();
    if (!sourceText) {
        return '';
    }

    await store.load();
    const [
        storedTranslateServices,
        storedAiApiServices,
        configuredSourceLanguage,
        configuredTargetLanguage,
    ] = await Promise.all([
        store.get('translate_service_list'),
        store.get(AI_API_SERVICE_LIST_KEY),
        store.get('translate_source_language'),
        store.get('translate_target_language'),
    ]);

    const translateServiceInstanceList =
        Array.isArray(storedTranslateServices) && storedTranslateServices.length > 0
            ? storedTranslateServices
            : TRANSLATE_DEFAULT_VISIBLE;
    const aiApiServiceInstanceList = Array.isArray(storedAiApiServices)
        ? storedAiApiServices
        : [];
    const { nextList } = await ensureAiTranslateBindings(
        translateServiceInstanceList,
        aiApiServiceInstanceList,
        { legacySourceList: translateServiceInstanceList }
    );
    const detectedLanguage = await detect(sourceText).catch(() => '');
    const detectedOrAuto = detectedLanguage || 'auto';
    const targetLanguage = configuredTargetLanguage || 'zh_cn';
    const preferredSourceLanguage = configuredSourceLanguage || 'auto';
    const serviceInstanceConfigMap = {};
    const onCumulativeResult =
        typeof options.onCumulativeResult === 'function'
            ? options.onCumulativeResult
            : () => {};

    for (const serviceInstanceKey of nextList) {
        const serviceInstanceConfig = (await store.get(serviceInstanceKey)) ?? {};
        serviceInstanceConfigMap[serviceInstanceKey] = serviceInstanceConfig;

        if (isAiTranslateServiceKey(serviceInstanceKey)) {
            const linkedAiServiceInstanceKey = getLinkedAiServiceInstanceKey(
                serviceInstanceKey,
                serviceInstanceConfig
            );
            if (linkedAiServiceInstanceKey) {
                serviceInstanceConfigMap[linkedAiServiceInstanceKey] =
                    (await store.get(linkedAiServiceInstanceKey)) ?? {};
            }
        }
    }

    let lastError = null;
    for (const serviceInstanceKey of nextList) {
        const instanceConfig = serviceInstanceConfigMap[serviceInstanceKey] ?? {};
        if (instanceConfig.enable === false) {
            continue;
        }

        try {
            const serviceName = getServiceName(serviceInstanceKey);

            if (isAiTranslateServiceKey(serviceInstanceKey)) {
                const bindingConfig = getMergedAiTranslateConfig(
                    instanceConfig,
                    serviceInstanceKey
                );
                const linkedAiServiceInstanceKey = getLinkedAiServiceInstanceKey(
                    serviceInstanceKey,
                    bindingConfig
                );
                const aiConfig = linkedAiServiceInstanceKey
                    ? serviceInstanceConfigMap[linkedAiServiceInstanceKey] ?? {}
                    : null;
                if (!linkedAiServiceInstanceKey || !aiConfig) {
                    throw new Error('AI translate binding unavailable');
                }

                const languageEnum = getAiTranslateLanguageEnum();
                const sourceLanguage = resolveTranslateSourceLanguageKey(
                    preferredSourceLanguage,
                    detectedLanguage,
                    languageEnum
                );
                if (!(sourceLanguage in languageEnum) || !(targetLanguage in languageEnum)) {
                    throw new Error('Language not supported');
                }

                const value = await translateWithAiBinding(
                    sourceText,
                    languageEnum[sourceLanguage],
                    languageEnum[targetLanguage],
                    bindingConfig,
                    aiConfig,
                    { detect: detectedOrAuto, setResult: onCumulativeResult }
                );

                return normalizeQuickTextResult(value, 'Empty translate result');
            }

            if (whetherPluginService(serviceInstanceKey)) {
                const pluginInfo = await getTranslatePluginInfo(serviceName);
                if (!pluginInfo?.language) {
                    throw new Error('Translate plugin unavailable');
                }

                const sourceLanguage = resolveTranslateSourceLanguageKey(
                    preferredSourceLanguage,
                    detectedLanguage,
                    pluginInfo.language
                );
                if (
                    !(sourceLanguage in pluginInfo.language) ||
                    !(targetLanguage in pluginInfo.language)
                ) {
                    throw new Error('Language not supported');
                }

                const [translatePluginFunc, utils] = await invoke_plugin(
                    'translate',
                    serviceName
                );
                const value = await translatePluginFunc(
                    sourceText,
                    pluginInfo.language[sourceLanguage],
                    pluginInfo.language[targetLanguage],
                    {
                        config: { ...instanceConfig, enable: 'true' },
                        detect: detectedOrAuto,
                        setResult: onCumulativeResult,
                        utils,
                    }
                );

                return normalizeQuickTextResult(value, 'Empty translate result');
            }

            const builtinService = builtinTranslateServices[serviceName];
            if (!builtinService?.translate || !builtinService?.Language) {
                throw new Error('Translate service unavailable');
            }

            const sourceLanguage = resolveTranslateSourceLanguageKey(
                preferredSourceLanguage,
                detectedLanguage,
                builtinService.Language
            );
            if (
                !(sourceLanguage in builtinService.Language) ||
                !(targetLanguage in builtinService.Language)
            ) {
                throw new Error('Language not supported');
            }

            const value = await builtinService.translate(
                sourceText,
                builtinService.Language[sourceLanguage],
                builtinService.Language[targetLanguage],
                {
                    config: instanceConfig,
                    detect: detectedOrAuto,
                    setResult: onCumulativeResult,
                }
            );

            return normalizeQuickTextResult(value, 'Empty translate result');
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError ?? new Error('No available translate service');
}

async function streamTranslateQuickResult(text) {
    const writer = createStreamInputWriter();
    const onCumulativeResult = createCumulativeStreamInputAdapter(writer);
    let resultText = '';

    try {
        resultText = await resolveTranslateQuickResult(text, { onCumulativeResult });
        if (resultText && !writer.hasTyped()) {
            writer.enqueue(resultText);
        }
        await writer.finish();
    } catch (error) {
        throw createPartialAppliedError(error, writer);
    }

    return resultText;
}

const BUTTON_ACTIONS = {
    translate: async (text, { hide, translateActionBehavior }) => {
        if (translateActionBehavior === TOOLBAR_BUTTON_ACTION_BEHAVIORS.STREAM_APPLY) {
            hide();
            await delay(80);

            try {
                await streamTranslateQuickResult(text);
            } catch (error) {
                console.error('Stream translate failed:', error);
                if (!error?.partialApplied) {
                    invoke('open_translate_from_toolbar').catch(() => {});
                }
            }
            return;
        }

        if (translateActionBehavior === TOOLBAR_BUTTON_ACTION_BEHAVIORS.APPLY) {
            hide();
            await delay(80);

            try {
                const resultText = await resolveTranslateQuickResult(text);
                if (resultText) {
                    await invoke('paste_result', { text: resultText });
                }
            } catch (error) {
                console.error('Quick translate failed:', error);
                invoke('open_translate_from_toolbar').catch(() => {});
            }
            return;
        }

        invoke('open_translate_from_toolbar').catch(() => {});
        await delay(80);
        hide();
    },

    explain: async (text, { hide, explainActionBehavior }) => {
        if (explainActionBehavior === TOOLBAR_BUTTON_ACTION_BEHAVIORS.STREAM_APPLY) {
            hide();
            await delay(80);

            try {
                await streamExplainQuickResult(text);
            } catch (error) {
                console.error('Stream explain failed:', error);
                if (!error?.partialApplied) {
                    invoke('open_chat_explain_from_toolbar').catch(() => {});
                }
            }
            return;
        }

        if (explainActionBehavior === TOOLBAR_BUTTON_ACTION_BEHAVIORS.APPLY) {
            hide();
            await delay(80);

            try {
                const resultText = await resolveExplainQuickResult(text);
                if (resultText) {
                    await invoke('paste_result', { text: resultText });
                }
            } catch (error) {
                console.error('Quick explain failed:', error);
                invoke('open_chat_explain_from_toolbar').catch(() => {});
            }
            return;
        }

        invoke('open_chat_explain_from_toolbar').catch(() => {});
        await delay(80);
        hide();
    },

    lightai: async (text, { hide, lightAiActionBehavior, selectedStyle }) => {
        if (lightAiActionBehavior === TOOLBAR_BUTTON_ACTION_BEHAVIORS.STREAM_APPLY) {
            hide();
            await delay(80);

            try {
                await streamLightAiQuickResult(text, selectedStyle);
            } catch (error) {
                console.error('Stream AI polish failed:', error);
                if (!error?.partialApplied) {
                    invoke('open_light_ai_window').catch(() => {});
                }
            }
            return;
        }

        if (lightAiActionBehavior === TOOLBAR_BUTTON_ACTION_BEHAVIORS.APPLY) {
            hide();
            await delay(80);

            try {
                const resultText = await resolveLightAiQuickResult(text, selectedStyle);
                if (resultText) {
                    await invoke('paste_result', { text: resultText });
                }
            } catch (error) {
                console.error('Quick AI polish failed:', error);
                invoke('open_light_ai_window').catch(() => {});
            }
            return;
        }

        invoke('open_light_ai_window').catch(() => {});
        await delay(80);
        hide();
    },

    format: async (text, { hide }) => {
        hide();
        await delay(80);

        try {
            const formatted = formatText(text);
            if (formatted) {
                await invoke('paste_result', { text: formatted });
            }
        } catch (error) {
            console.error('Format error:', error);
        }
    },

    open_url: (text, { hide }) => {
        const trimmedText = text.trim();
        const url = /^https?:\/\//i.test(trimmedText)
            ? trimmedText
            : `https://${trimmedText.replace(/^\/\//, '')}`;
        open(url).catch(() => {});
        hide();
    },

    send_email: (text, { hide }) => {
        open(`mailto:${text.trim()}`).catch(() => {});
        hide();
    },

    open_path: (text, { hide }) => {
        open(text.trim()).catch(() =>
            open(`explorer /select,"${text.trim()}"`).catch(() => {})
        );
        hide();
    },

    calculate: (text, { setCalcResult, setColorVal, t }) => {
        const result = calculateExpr(text);
        setColorVal(null);
        setCalcResult(
            result ??
                t('float_toolbar.calc_error', {
                    defaultValue: 'Unable to calculate',
                })
        );

        if (result != null) {
            invoke('write_clipboard', { text: result }).catch(() => {});
        }
    },

    show_color: (text, { setColorVal, setCalcResult }) => {
        setCalcResult(null);
        setColorVal(text.trim());
    },

    apply_calc_result: async (_text, { calcResult, hide }) => {
        hide();
        await delay(80);
        invoke('paste_result', { text: calcResult }).catch(() => {});
    },

    apply_calc_formula: async (text, { calcResult, hide }) => {
        const formulaText = getFormulaResultText(text, calcResult);
        hide();
        await delay(80);
        invoke('paste_result', { text: formulaText }).catch(() => {});
    },

    copy_color: (_text, { colorVal, hide }) => {
        invoke('write_clipboard', { text: colorVal }).catch(() => {});
        hide();
    },
};

export default function FloatToolbar() {
    const { t } = useTranslation();
    const timerRef = useRef(null);
    const selectedText = useRef('');
    const [translateActionBehavior] = useConfig(
        'toolbar_btn_translate_behavior',
        TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW
    );
    const [explainActionBehavior] = useConfig(
        'toolbar_btn_explain_behavior',
        TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW
    );
    const [lightAiActionBehavior] = useConfig(
        'toolbar_btn_lightai_behavior',
        TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW
    );
    const [selectedStyle] = useConfig('light_ai_selected_style', STYLE_KEYS[0]);

    const [autoHideMs, setAutoHideMs] = useState(DEFAULT_HIDE_MS);
    const [baseVisible, setBaseVisible] = useState(BASE_TOOLBAR_BUTTONS);
    const [smartBtns, setSmartBtns] = useState([]);
    const [calcResult, setCalcResult] = useState(null);
    const [colorVal, setColorVal] = useState(null);
    const hasStickyExtraPanel = calcResult != null || colorVal != null;

    const resizeWindow = useCallback((buttons, hasExtra) => {
        const buttonCount = Math.max(buttons.length, 2);
        const toolbarWidth =
            CARD_PADDING_X * 2 +
            buttonCount * BUTTON_SIZE +
            Math.max(0, buttonCount - 1) * BUTTON_GAP;
        const width = Math.max(hasExtra ? RESULT_MIN_WIDTH : MIN_WIDTH, toolbarWidth);
        const height = ROW_HEIGHT + (hasExtra ? EXTRA_PANEL_HEIGHT : 0);

        appWindow.setSize(new LogicalSize(width, height)).catch(() => {});
    }, []);

    const refreshSelectionState = useCallback(async () => {
        try {
            const text = await invoke('get_text');
            selectedText.current = text || '';
            setCalcResult(null);
            setColorVal(null);

            const detectedType = detectType(text);
            const smartButton = SMART_TOOLBAR_BUTTON_MAP[detectedType];
            setSmartBtns(smartButton ? [smartButton] : []);
        } catch {
            selectedText.current = '';
            setCalcResult(null);
            setColorVal(null);
            setSmartBtns([]);
        }
    }, []);

    const loadConfig = useCallback(async () => {
        try {
            await store.load();
            const storedAutoHide = await store.get('text_select_auto_hide_ms');
            if (storedAutoHide != null) {
                setAutoHideMs(Number(storedAutoHide));
            }

            const storedOrder = await store.get('toolbar_btn_order');
            const order = Array.isArray(storedOrder)
                ? storedOrder
                : BASE_TOOLBAR_BUTTONS.map((button) => button.id);

            const orderedButtons = order
                .map((id) => BASE_TOOLBAR_BUTTONS.find((button) => button.id === id))
                .filter(Boolean);

            const visibleButtons = [];
            for (const button of orderedButtons) {
                const enabled = await store.get(button.cfgKey);
                if (enabled !== false) {
                    visibleButtons.push(button);
                }
            }

            setBaseVisible(
                visibleButtons.length > 0 ? visibleButtons : BASE_TOOLBAR_BUTTONS
            );
        } catch {}
    }, []);

    useEffect(() => {
        resizeWindow(
            [...smartBtns, ...baseVisible],
            calcResult != null || colorVal != null
        );
    }, [smartBtns, baseVisible, calcResult, colorVal, resizeWindow]);

    useEffect(() => {
        loadConfig();
        refreshSelectionState();
    }, [loadConfig, refreshSelectionState]);

    useEffect(() => {
        const forceTransparentBackground = (element) => {
            if (!element) return;
            element.style.setProperty('background', 'transparent', 'important');
            element.style.setProperty('background-color', 'transparent', 'important');
        };

        forceTransparentBackground(document.documentElement);
        forceTransparentBackground(document.body);
        forceTransparentBackground(document.getElementById('root'));
    }, []);

    const hide = useCallback(() => {
        setCalcResult(null);
        setColorVal(null);
        appWindow.hide().catch(() => {});
    }, []);

    const resetTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        if (hasStickyExtraPanel) {
            return;
        }

        timerRef.current = setTimeout(hide, autoHideMs);
    }, [hide, autoHideMs, hasStickyExtraPanel]);

    useEffect(() => {
        resetTimer();

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                hide();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        let blurTimer = null;
        const unlistenBlur = listen('tauri://blur', () => {
            if (hasStickyExtraPanel) {
                return;
            }
            blurTimer = setTimeout(hide, 150);
        });
        const unlistenFocus = listen('tauri://focus', () => {
            if (blurTimer) {
                clearTimeout(blurTimer);
                blurTimer = null;
            }
        });
        const unlistenSelectionUpdate = listen('selection_text_updated', () => {
            refreshSelectionState();
            resetTimer();
        });

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }

            if (blurTimer) {
                clearTimeout(blurTimer);
            }

            window.removeEventListener('keydown', onKeyDown);
            unlistenBlur.then((fn) => fn());
            unlistenFocus.then((fn) => fn());
            unlistenSelectionUpdate.then((fn) => fn());
        };
    }, [hasStickyExtraPanel, hide, refreshSelectionState, resetTimer]);

    const handleClick = useCallback(
        async (id) => {
            resetTimer();
            const action = BUTTON_ACTIONS[id];
            if (!action) return;

            const ctx = {
                hide,
                setCalcResult,
                setColorVal,
                calcResult,
                colorVal,
                translateActionBehavior,
                explainActionBehavior,
                lightAiActionBehavior,
                selectedStyle,
                t,
            };

            await action(selectedText.current || '', ctx);
        },
        [
            hide,
            resetTimer,
            calcResult,
            colorVal,
            translateActionBehavior,
            explainActionBehavior,
            lightAiActionBehavior,
            selectedStyle,
        ]
    );

    const renderToolbarButton = useCallback(
        (button) => {
            const Icon = button.Icon;
            const label = getToolbarButtonLabel(button, t);
            const palette = getButtonPalette(button.tone === 'accent');

            return (
                <button
                    key={button.id}
                    type='button'
                    title={label}
                    aria-label={label}
                    style={{
                        width: `${BUTTON_SIZE}px`,
                        height: `${BUTTON_SIZE}px`,
                        border: 'none',
                        borderRadius: '10px',
                        background: palette.restBg,
                        color: palette.color,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 120ms ease, color 120ms ease',
                        outline: 'none',
                        flexShrink: 0,
                    }}
                    onClick={() => handleClick(button.id)}
                    onMouseEnter={(event) =>
                        applyButtonVisualState(event.currentTarget, palette, 'hover')
                    }
                    onMouseLeave={(event) =>
                        applyButtonVisualState(event.currentTarget, palette, 'rest')
                    }
                    onMouseDown={(event) =>
                        applyButtonVisualState(event.currentTarget, palette, 'active')
                    }
                    onMouseUp={(event) =>
                        applyButtonVisualState(event.currentTarget, palette, 'hover')
                    }
                    onFocus={(event) =>
                        applyButtonVisualState(event.currentTarget, palette, 'hover')
                    }
                    onBlur={(event) =>
                        applyButtonVisualState(event.currentTarget, palette, 'rest')
                    }
                >
                    <Icon size={18} />
                </button>
            );
        },
        [handleClick, t]
    );

    const smartButtons = smartBtns.map(renderToolbarButton);
    const baseButtons = baseVisible.map(renderToolbarButton);
    const renderPanelActionButton = (label, title, actionId) => (
        <button
            type='button'
            title={title}
            aria-label={title}
            style={{
                minWidth: '40px',
                height: '28px',
                padding: '0 10px',
                border: 'none',
                borderRadius: '9px',
                background: 'rgba(15, 23, 42, 0.06)',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 120ms ease, color 120ms ease',
                flexShrink: 0,
                fontSize: '12px',
                fontWeight: 600,
            }}
            onClick={() => handleClick(actionId)}
            onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(15, 23, 42, 0.10)';
                event.currentTarget.style.color = '#1f2937';
            }}
            onMouseLeave={(event) => {
                event.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)';
                event.currentTarget.style.color = '#475569';
            }}
        >
            {label}
        </button>
    );

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(255, 255, 255, 0.82)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                overflow: 'hidden',
                userSelect: 'none',
            }}
            onMouseEnter={resetTimer}
            onMouseMove={resetTimer}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${BUTTON_GAP}px`,
                    padding: `${CARD_PADDING_Y}px ${CARD_PADDING_X}px`,
                }}
            >
                {smartButtons}
                {smartButtons.length > 0 && baseButtons.length > 0 && (
                    <div
                        style={{
                            width: '1px',
                            height: '14px',
                            background: 'rgba(148, 163, 184, 0.28)',
                            margin: '0 2px',
                            flexShrink: 0,
                        }}
                    />
                )}
                {baseButtons}
            </div>

            {calcResult != null && (
                <div style={RESULT_PANEL_STYLE}>
                    <span
                        style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#334155',
                            fontFamily: 'monospace',
                            flex: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        = {calcResult}
                    </span>
                    {renderPanelActionButton(
                        t('float_toolbar.apply_result', {
                            defaultValue: '结果',
                        }),
                        t('float_toolbar.apply_result_title', {
                            defaultValue: '应用结果',
                        }),
                        'apply_calc_result'
                    )}
                    {renderPanelActionButton(
                        t('float_toolbar.apply_formula', {
                            defaultValue: '公式',
                        }),
                        t('float_toolbar.apply_formula_title', {
                            defaultValue: '应用公式',
                        }),
                        'apply_calc_formula'
                    )}
                </div>
            )}

            {colorVal != null && (
                <div style={RESULT_PANEL_STYLE}>
                    <div
                        style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '999px',
                            background: colorVal,
                            border: '1px solid rgba(15, 23, 42, 0.12)',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.28)',
                            flexShrink: 0,
                        }}
                    />
                    <span
                        style={{
                            fontSize: '12px',
                            color: '#334155',
                            fontFamily: 'monospace',
                            flex: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {colorVal}
                    </span>
                    <button
                        type='button'
                        title={t('common.copy', { defaultValue: 'Copy' })}
                        aria-label={t('common.copy', { defaultValue: 'Copy' })}
                        style={{
                            width: '28px',
                            height: '28px',
                            border: 'none',
                            borderRadius: '9px',
                            background: 'rgba(15, 23, 42, 0.06)',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 120ms ease, color 120ms ease',
                            flexShrink: 0,
                        }}
                        onClick={() => handleClick('copy_color')}
                        onMouseEnter={(event) => {
                            event.currentTarget.style.background = 'rgba(15, 23, 42, 0.10)';
                            event.currentTarget.style.color = '#1f2937';
                        }}
                        onMouseLeave={(event) => {
                            event.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)';
                            event.currentTarget.style.color = '#475569';
                        }}
                    >
                        <LuClipboardCopy size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
