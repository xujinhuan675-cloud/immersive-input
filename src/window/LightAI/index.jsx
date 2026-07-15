import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast, { Toaster } from 'react-hot-toast';
import { HiOutlineVolumeUp, HiSparkles } from 'react-icons/hi';
import { MdContentCopy, MdFolderOpen, MdPlaylistAddCheck } from 'react-icons/md';

import WindowHeader, {
    WindowHeaderCloseButton,
    WindowHeaderPinButton,
    WindowHeaderTitle,
} from '../../components/WindowHeader';
import {
    TRAY_WINDOW_HEADER_STYLE,
    TRAY_WINDOW_PRIMARY_BUTTON_STYLE,
    TRAY_WINDOW_TITLE_STYLE,
    TRAY_WINDOW_TITLE_TEXT_STYLE,
    TrayWindow,
    TrayWindowBody,
    TrayWindowSurface,
} from '../../components/TrayWindow';
import { useReadAloud, useStopVoiceOnUnmount, useToastStyle, useWindowPin } from '../../hooks';
import { useConfig } from '../../hooks/useConfig';
import {
    STYLE_KEYS,
    STYLE_NAMES,
    lightAiStream,
    streamOpenAiMessages,
    translateTextStream,
} from '../../services/light_ai/openai';
import { getActiveAiApiConfig, getAiHistoryServiceMeta } from '../../utils/aiConfig';
import { saveHistory } from '../../utils/aiHistory';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { FORMATTER_CONFIG_KEY, formatText } from '../../utils/formatter';
import detect from '../../utils/lang_detect';
import { languageList, normalizeLanguageKey } from '../../utils/language';
import { streamTextToInput } from '../../utils/streamInput';
import { appendTodoItems, openTodoNotebook } from '../../utils/todoNotebook';

const FIX_SYSTEM_PROMPT = [
    'You are a conservative proofreading and correction assistant.',
    'Correct grammar, typos, missing or duplicated words, punctuation, whitespace, blank lines, and obvious formatting issues.',
    'Preserve the original meaning, factual content, terminology, tone, person, language, and paragraph structure as much as possible.',
    'Do not rewrite for style, do not summarize, do not expand, and do not add explanations.',
    'Only return the corrected text.',
].join('\n');

const TAB_OPTIONS = [
    { key: 'translate' },
    { key: 'style' },
    { key: 'fix' },
];

const NON_DRAG_SELECTOR =
    'button, input, textarea, select, option, a, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [data-no-window-drag="true"], [data-clickable="true"]';

function handlePanelDragStart(event) {
    if (event.button !== 0) {
        return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest(NON_DRAG_SELECTOR)) {
        return;
    }

    void appWindow.startDragging().catch(() => {});
}

function getSourceModeLabel(targetMode, sourceText, t) {
    if (targetMode === 'focused_input') return t('light_ai.source_modes.focused_input');
    if (targetMode === 'clipboard') return t('light_ai.source_modes.clipboard');
    if (targetMode === 'http') return t('light_ai.source_modes.http');
    if (!String(sourceText || '').trim()) return t('light_ai.source_modes.manual');
    return t('light_ai.source_modes.selection');
}

const cardBodyBase = {
    minHeight: '118px',
    padding: '14px',
    color: '#0f172a',
    lineHeight: 1.75,
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: APP_FONT_FAMILY_VAR,
};

const styles = {
    window: {
        background: '#fff',
    },
    body: {
        padding: 0,
        background: '#fff',
    },
    topSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px 12px 7px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.74)',
        background: '#fff',
    },
    tabRow: {
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignSelf: 'flex-start',
        gap: '2px',
        padding: '2px',
        borderRadius: '9px',
        border: '1px solid rgba(226, 232, 240, 0.78)',
        background: '#fff',
    },
    tabButton: (active) => ({
        minWidth: '58px',
        height: '28px',
        padding: '0 10px',
        border: 'none',
        borderRadius: '7px',
        background: active ? 'rgba(248, 250, 252, 0.98)' : 'transparent',
        color: active ? '#0f172a' : '#64748b',
        boxShadow: 'none',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1,
        transition: 'background 140ms ease, color 140ms ease, box-shadow 140ms ease',
        whiteSpace: 'nowrap',
    }),
    topMetaRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'center',
    },
    selectWrap: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '0 10px',
        height: '32px',
        borderRadius: '10px',
        border: '1px solid rgba(226, 232, 240, 0.92)',
        background: '#ffffff',
        color: '#475569',
        fontSize: '12px',
        boxSizing: 'border-box',
        maxWidth: '100%',
    },
    selectLabel: {
        color: '#64748b',
        fontSize: '12px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
    },
    nativeSelect: {
        border: 'none',
        outline: 'none',
        background: 'transparent',
        color: '#0f172a',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: APP_FONT_FAMILY_VAR,
        minWidth: '72px',
    },
    styleRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
    },
    styleChip: (active) => ({
        height: '26px',
        padding: '0 9px',
        borderRadius: '999px',
        border: active ? '1px solid rgba(59, 130, 246, 0.38)' : '1px solid rgba(226, 232, 240, 0.78)',
        background: active ? 'rgba(239, 246, 255, 0.72)' : '#ffffff',
        color: active ? '#1d4ed8' : '#475569',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1,
        transition: 'border-color 140ms ease, background 140ms ease, color 140ms ease',
        whiteSpace: 'nowrap',
    }),
    pane: {
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        padding: '10px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: '#fff',
    },
    card: {
        borderRadius: '14px',
        border: '1px solid rgba(226, 232, 240, 0.92)',
        background: '#ffffff',
        boxShadow: 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
    },
    sourceCard: {
        flex: '0 0 auto',
    },
    resultCard: {
        flex: '1 1 220px',
        minHeight: '210px',
    },
    cardHeader: {
        padding: '12px 14px 9px',
        borderBottom: '1px solid rgba(241, 245, 249, 0.96)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#111827',
    },
    cardMeta: {
        fontSize: '12px',
        fontWeight: 600,
        color: '#2563eb',
    },
    cardHeaderActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginLeft: 'auto',
    },
    cardIconButton: (disabled) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        padding: 0,
        borderRadius: '8px',
        border: 'none',
        opacity: disabled ? 0.42 : 1,
        transition: 'background 140ms ease, color 140ms ease, opacity 140ms ease',
        flexShrink: 0,
    }),
    cardTextButton: (disabled) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        padding: 0,
        borderRadius: '8px',
        border: 'none',
        background: 'transparent',
        color: '#475569',
        fontSize: 0,
        fontWeight: 600,
        opacity: disabled ? 0.42 : 1,
        transition: 'background 140ms ease, color 140ms ease, opacity 140ms ease',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    }),
    cardBody: cardBodyBase,
    resultBody: {
        ...cardBodyBase,
        flex: '1 1 auto',
        minHeight: '168px',
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        scrollbarGutter: 'stable',
    },
    sourceInput: {
        display: 'block',
        width: '100%',
        minHeight: '90px',
        padding: 0,
        border: 'none',
        outline: 'none',
        resize: 'none',
        background: 'transparent',
        color: '#0f172a',
        fontSize: '13px',
        lineHeight: 1.75,
        fontFamily: APP_FONT_FAMILY_VAR,
        boxSizing: 'border-box',
    },
    emptyText: {
        color: '#94a3b8',
    },
    footer: {
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '8px',
        padding: '8px 12px 10px',
        borderTop: '1px solid rgba(241, 245, 249, 0.96)',
        background: '#fff',
        alignItems: 'center',
    },
    promptInput: {
        flex: '1 1 auto',
        minWidth: 0,
        height: '36px',
        borderRadius: '9px',
        border: '1px solid rgba(226, 232, 240, 0.96)',
        background: '#ffffff',
        padding: '0 12px',
        outline: 'none',
        fontSize: '12px',
        color: '#0f172a',
        fontFamily: APP_FONT_FAMILY_VAR,
        boxSizing: 'border-box',
    },
    actionGroup: {
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '8px',
        marginLeft: 'auto',
        justifyContent: 'flex-end',
        flexShrink: 0,
    },
    secondaryButton: (disabled) => ({
        height: '36px',
        minWidth: '64px',
        padding: '0 12px',
        borderRadius: '9px',
        border: '1px solid rgba(226, 232, 240, 0.96)',
        background: '#ffffff',
        color: '#475569',
        fontSize: '12px',
        fontWeight: 600,
        opacity: disabled ? 0.46 : 1,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        textAlign: 'center',
        boxShadow: 'none',
    }),
    primaryButton: (disabled) => ({
        ...TRAY_WINDOW_PRIMARY_BUTTON_STYLE,
        height: '36px',
        minWidth: '82px',
        padding: '0 16px',
        borderRadius: '9px',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1,
        opacity: disabled ? 0.46 : 1,
        boxShadow: '0 8px 18px -16px rgba(15, 23, 42, 0.35)',
    }),
};

const headerStyle = {
    ...TRAY_WINDOW_HEADER_STYLE,
    minHeight: '42px',
    padding: '4px 10px',
    background: '#fff',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
};

const headerTitleStyle = {
    ...TRAY_WINDOW_TITLE_STYLE,
    gap: '5px',
};

const headerTitleTextStyle = {
    ...TRAY_WINDOW_TITLE_TEXT_STYLE,
    fontSize: '13px',
    fontWeight: 700,
};

const surfaceStyle = {
    borderRadius: 0,
    border: 'none',
    background: '#ffffff',
    boxShadow: 'none',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
};

function useApiConfig() {
    const [config, setConfig] = useState(undefined);
    const mountedRef = useRef(false);

    const refreshConfig = useCallback(async () => {
        const nextConfig = await getActiveAiApiConfig();
        if (mountedRef.current) {
            setConfig(nextConfig);
        }
        return nextConfig;
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void refreshConfig();
        return () => {
            mountedRef.current = false;
        };
    }, [refreshConfig]);

    return [config, refreshConfig];
}

function getLanguageLabel(key, t) {
    const normalizedKey = normalizeLanguageKey(key || 'auto') || 'auto';
    return t(`languages.${normalizedKey}`, { defaultValue: normalizedKey });
}

export default function LightAI() {
    const { t } = useTranslation();
    useStopVoiceOnUnmount();
    const [apiConfig, refreshApiConfig] = useApiConfig();
    const toastStyle = useToastStyle();
    const readAloud = useReadAloud();
    const [pined, togglePin] = useWindowPin();
    const [activeTab, setActiveTab] = useState('style');
    const [sourceText, setSourceText] = useState('');
    const [targetMode, setTargetMode] = useState('selection');
    const [selectedStyle, setSelectedStyle] = useConfig('light_ai_selected_style', STYLE_KEYS[0]);
    const [, setSelectedStyles] = useConfig('light_ai_selected_styles', [STYLE_KEYS[0]]);
    const [targetLanguage, setTargetLanguage] = useConfig('translate_target_language', 'en');
    const [formatterConfig] = useConfig(FORMATTER_CONFIG_KEY, undefined);
    const [sourceLanguage, setSourceLanguage] = useState('auto');
    const [extraPrompt, setExtraPrompt] = useState('');
    const [styleResult, setStyleResult] = useState('');
    const [translateResult, setTranslateResult] = useState('');
    const [fixResult, setFixResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const abortRef = useRef(null);
    const autoRunRef = useRef(false);
    const resultBodyRef = useRef(null);
    const resolvedSelectedStyle = STYLE_KEYS.includes(selectedStyle) ? selectedStyle : STYLE_KEYS[0];
    const resolvedTargetLanguage = targetLanguage || 'en';

    const currentResult = useMemo(() => {
        if (activeTab === 'translate') return translateResult;
        if (activeTab === 'fix') return fixResult;
        return styleResult;
    }, [activeTab, fixResult, styleResult, translateResult]);

    const currentLanguageLabel = useMemo(() => getLanguageLabel(sourceLanguage, t), [sourceLanguage, t]);
    const targetLanguageLabel = useMemo(() => getLanguageLabel(resolvedTargetLanguage, t), [resolvedTargetLanguage, t]);
    const currentResultLanguage = useMemo(() => {
        if (activeTab === 'translate') {
            return normalizeLanguageKey(resolvedTargetLanguage) || 'auto';
        }

        return normalizeLanguageKey(sourceLanguage) || 'auto';
    }, [activeTab, resolvedTargetLanguage, sourceLanguage]);

    const loadInitialContext = useCallback(async () => {
        try {
            const [text, nextTargetMode] = await Promise.all([invoke('get_text'), invoke('get_light_ai_target')]);
            autoRunRef.current = Boolean(String(text || '').trim());
            setSourceText(text || '');
            setTargetMode(nextTargetMode || 'selection');
        } catch (nextError) {
            console.error('loadInitialContext error:', nextError);
        }
    }, []);

    useEffect(() => {
        void loadInitialContext();
        const unlisten = listen('new_text', (event) => {
            const nextText = event.payload || '';
            autoRunRef.current = Boolean(String(nextText).trim());
            setSourceText(nextText);
            invoke('get_light_ai_target')
                .then((nextTargetMode) => {
                    setTargetMode(nextTargetMode || 'selection');
                })
                .catch((nextError) => {
                    console.error('refreshTargetMode error:', nextError);
                });
        });

        return () => {
            void unlisten.then((fn) => fn());
        };
    }, [loadInitialContext]);

    useEffect(() => {
        let cancelled = false;

        async function detectLanguage() {
            if (!sourceText.trim()) {
                setSourceLanguage('auto');
                return;
            }

            try {
                const nextLanguage = await detect(sourceText);
                if (!cancelled) {
                    setSourceLanguage(nextLanguage || 'auto');
                }
            } catch {
                if (!cancelled) {
                    setSourceLanguage('auto');
                }
            }
        }

        void detectLanguage();
        return () => {
            cancelled = true;
        };
    }, [sourceText]);

    const stop = useCallback(() => {
        try {
            abortRef.current?.abort();
        } catch {}
        abortRef.current = null;
        setLoading(false);
    }, []);

    const clearResults = useCallback(() => {
        setStyleResult('');
        setTranslateResult('');
        setFixResult('');
    }, []);

    const runCurrentTab = useCallback(
        async (overridePrompt = extraPrompt) => {
            const text = sourceText.trim();
            if (!text) {
                clearResults();
                setError('');
                return;
            }

            stop();
            setError('');

            if (apiConfig === undefined) {
                return;
            }

            const requestApiConfig = apiConfig || (await refreshApiConfig());

            if (activeTab === 'fix') {
                const formattedText = formatText(sourceText, {
                    ...formatterConfig,
                    repairLineBreaks: true,
                });
                setFixResult(formattedText);

                if (!requestApiConfig) {
                    return;
                }

                const controller = new AbortController();
                abortRef.current = controller;
                setLoading(true);
                let hasAiFixChunk = false;

                await streamOpenAiMessages(
                    [
                        { role: 'system', content: FIX_SYSTEM_PROMPT },
                        { role: 'user', content: formattedText },
                    ],
                    requestApiConfig,
                    (chunk) => {
                        if (!hasAiFixChunk) {
                            hasAiFixChunk = true;
                            setFixResult(chunk);
                            return;
                        }
                        setFixResult((prev) => `${prev}${chunk}`);
                    },
                    (result) => {
                        abortRef.current = null;
                        setLoading(false);
                        setFixResult(result || formattedText);
                    },
                    (nextError) => {
                        abortRef.current = null;
                        setLoading(false);
                        if (nextError) {
                            setError(nextError);
                        }
                    },
                    controller.signal,
                    { refreshConfig: refreshApiConfig }
                );
                return;
            }

            if (!requestApiConfig) {
                setError(t('light_ai.api_missing'));
                return;
            }

            const controller = new AbortController();
            abortRef.current = controller;
            setLoading(true);

            const onComplete = () => {
                abortRef.current = null;
                setLoading(false);
            };

            const onError = (nextError) => {
                abortRef.current = null;
                setLoading(false);
                if (nextError) {
                    setError(nextError);
                }
            };

            if (activeTab === 'translate') {
                setTranslateResult('');
                await translateTextStream(
                    sourceText,
                    currentLanguageLabel,
                    targetLanguageLabel,
                    overridePrompt,
                    requestApiConfig,
                    (chunk) => {
                        setTranslateResult((prev) => `${prev}${chunk}`);
                    },
                    onComplete,
                    onError,
                    controller.signal,
                    { refreshConfig: refreshApiConfig }
                );
                return;
            }

            setStyleResult('');
            await lightAiStream(
                sourceText,
                resolvedSelectedStyle,
                overridePrompt,
                requestApiConfig,
                (chunk) => {
                    setStyleResult((prev) => `${prev}${chunk}`);
                },
                onComplete,
                onError,
                controller.signal,
                { refreshConfig: refreshApiConfig }
            );
        },
        [
            activeTab,
            apiConfig,
            clearResults,
            currentLanguageLabel,
            extraPrompt,
            formatterConfig,
            refreshApiConfig,
            resolvedSelectedStyle,
            sourceText,
            stop,
            targetLanguageLabel,
            t,
        ]
    );

    useEffect(() => {
        if (!sourceText.trim() || !autoRunRef.current) return;
        if (apiConfig === undefined) return;
        autoRunRef.current = false;
        void runCurrentTab('');
    }, [activeTab, apiConfig, runCurrentTab, sourceText]);

    useEffect(() => {
        if (sourceText.trim()) return;
        autoRunRef.current = false;
        stop();
        clearResults();
        setError('');
    }, [clearResults, sourceText, stop]);

    useEffect(() => {
        if (!sourceText.trim()) return;
        void runCurrentTab('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, resolvedSelectedStyle, resolvedTargetLanguage]);

    useEffect(() => {
        const resultBody = resultBodyRef.current;
        if (!resultBody) return;
        resultBody.scrollTop = resultBody.scrollHeight;
    }, [currentResult, error, loading]);

    useEffect(() => {
        setSelectedStyles([resolvedSelectedStyle]);
    }, [resolvedSelectedStyle, setSelectedStyles]);

    useEffect(() => {
        return () => {
            try {
                abortRef.current?.abort();
            } catch {}
        };
    }, []);

    const handleCopyText = async (text, successMessage = t('light_ai.copied')) => {
        if (!text) return;
        try {
            await invoke('write_clipboard', { text });
            toast.success(successMessage, { style: toastStyle });
        } catch {
            toast.error(t('light_ai.copy_failed'), { style: toastStyle });
        }
    };

    const handleAppendCurrentResultToTodo = async () => {
        const text = String(currentResult || '').trim();
        if (!text) return;

        try {
            const { count } = await appendTodoItems(text);
            if (count > 0) {
                toast.success(t('light_ai.todo_append_success', { count }), { style: toastStyle });
            }
        } catch (nextError) {
            toast.error(t('light_ai.todo_append_failed', { error: nextError?.message || nextError }), { style: toastStyle });
        }
    };

    const handleOpenTodoNotebook = async () => {
        try {
            await openTodoNotebook();
        } catch (nextError) {
            toast.error(t('light_ai.todo_open_failed', { error: nextError?.message || nextError }), { style: toastStyle });
        }
    };

    const handleSourceTextChange = useCallback(
        (nextValue) => {
            autoRunRef.current = false;
            stop();
            clearResults();
            setError('');
            setSourceText(nextValue);
        },
        [clearResults, stop]
    );

    const speakText = useCallback(
        async (text, languageKey = 'auto') => {
            const nextText = String(text || '').trim();
            if (!nextText) return;

            await readAloud(nextText, languageKey);
        },
        [readAloud]
    );

    const handleSpeakSource = useCallback(async () => {
        await speakText(sourceText, sourceLanguage);
    }, [sourceLanguage, sourceText, speakText]);

    const handleSpeakResult = useCallback(async () => {
        await speakText(currentResult, currentResultLanguage);
    }, [currentResult, currentResultLanguage, speakText]);

    const handleDismiss = useCallback(async () => {
        if (targetMode === 'focused_input') {
            await invoke('collapse_light_ai_from_input_handle').catch((error) => {
                console.error('collapse_light_ai_from_input_handle error:', error);
            });
            return;
        }

        await appWindow.close();
    }, [targetMode]);

    const handleApply = async () => {
        if (!currentResult) return;

        try {
            await saveHistory('lightai', sourceText, currentResult, {
                mode: activeTab,
                style: resolvedSelectedStyle,
                targetLanguage: resolvedTargetLanguage,
                extra: extraPrompt,
                applyTarget: targetMode,
                ...getAiHistoryServiceMeta(apiConfig ?? {}),
            });
        } catch {}

        try {
            if (targetMode === 'focused_input') {
                await streamTextToInput(currentResult, {
                    selectAllOnFirstWrite: true,
                });
            } else {
                await streamTextToInput(currentResult);
            }
            await handleDismiss();
        } catch (nextError) {
            console.error('handleApply error:', nextError);
        }
    };

    const panelTitle = t(`light_ai.result_titles.${activeTab}`);

    const canRun = Boolean(sourceText.trim());
    const canCopy = Boolean(currentResult);
    const promptVisible = activeTab !== 'fix';

    return (
        <TrayWindow style={styles.window}>
            <Toaster />
            <WindowHeader
                style={headerStyle}
                center={
                    <WindowHeaderTitle
                        icon={<HiSparkles className='text-[13px] text-default-500' />}
                        style={headerTitleStyle}
                        textStyle={headerTitleTextStyle}
                    >
                        {t('light_ai.title')}
                    </WindowHeaderTitle>
                }
                right={
                    <div className='flex items-center gap-1.5'>
                        <WindowHeaderPinButton
                            active={pined}
                            onClick={() => void togglePin()}
                        />
                        <WindowHeaderCloseButton onClick={() => void handleDismiss()} />
                    </div>
                }
            />

            <TrayWindowBody style={styles.body}>
                <TrayWindowSurface style={surfaceStyle}>
                    <div
                        style={styles.topSection}
                        onMouseDown={handlePanelDragStart}
                    >
                        <div style={styles.tabRow}>
                            {TAB_OPTIONS.map((tab) => (
                                <button
                                    key={tab.key}
                                    type='button'
                                    style={styles.tabButton(activeTab === tab.key)}
                                    onClick={() => {
                                        setActiveTab(tab.key);
                                        setError('');
                                    }}
                                >
                                    {t(`light_ai.tabs.${tab.key}`)}
                                </button>
                            ))}
                        </div>

                        {activeTab === 'translate' ? (
                            <div style={styles.topMetaRow}>
                                <div style={styles.selectWrap}>
                                    <span style={styles.selectLabel}>{t('light_ai.source_language')}</span>
                                    <span
                                        style={{
                                            color: '#0f172a',
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {currentLanguageLabel}
                                    </span>
                                </div>
                                <div style={styles.selectWrap}>
                                    <span style={styles.selectLabel}>{t('light_ai.target_language')}</span>
                                    <select
                                        style={styles.nativeSelect}
                                        value={resolvedTargetLanguage}
                                        onChange={(event) => {
                                            setTargetLanguage(event.target.value);
                                        }}
                                    >
                                        {languageList.map((languageKey) => (
                                            <option
                                                key={languageKey}
                                                value={languageKey}
                                            >
                                                {getLanguageLabel(languageKey, t)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ) : null}

                        {activeTab === 'style' ? (
                            <div style={styles.styleRow}>
                                {STYLE_KEYS.map((styleKey) => (
                                    <button
                                        key={styleKey}
                                        type='button'
                                        style={styles.styleChip(resolvedSelectedStyle === styleKey)}
                                        onClick={() => {
                                            setSelectedStyle(styleKey);
                                        }}
                                    >
                                        {t(`light_ai.styles.${styleKey}`, {
                                            defaultValue: STYLE_NAMES[styleKey] ?? styleKey,
                                        })}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div style={styles.pane}>
                        <div style={{ ...styles.card, ...styles.sourceCard }}>
                            <div style={styles.cardHeader}>
                                <span>{t('light_ai.source')}</span>
                                <div style={styles.cardHeaderActions}>
                                    <button
                                        type='button'
                                        title={t('light_ai.copy_source')}
                                        aria-label={t('light_ai.copy_source')}
                                        className='bg-transparent text-default-400 hover:bg-default-100 hover:text-default-700 disabled:hover:bg-transparent'
                                        style={styles.cardIconButton(!sourceText.trim())}
                                        disabled={!sourceText.trim()}
                                        onClick={() => {
                                            void handleCopyText(sourceText, t('light_ai.copied_source'));
                                        }}
                                    >
                                        <MdContentCopy className='text-[15px]' />
                                    </button>
                                    <button
                                        type='button'
                                        title={t('light_ai.read_aloud')}
                                        className='bg-transparent text-default-400 hover:bg-default-100 hover:text-default-700 disabled:hover:bg-transparent'
                                        style={styles.cardIconButton(!sourceText.trim())}
                                        disabled={!sourceText.trim()}
                                        onClick={() => {
                                            handleSpeakSource().catch((error) => {
                                                toast.error(error?.message || String(error), {
                                                    style: toastStyle,
                                                });
                                            });
                                        }}
                                    >
                                        <HiOutlineVolumeUp className='text-[15px]' />
                                    </button>
                                </div>
                            </div>
                            <div style={styles.cardBody}>
                                <textarea
                                    autoFocus
                                    spellCheck={false}
                                    style={styles.sourceInput}
                                    placeholder={t('light_ai.source_placeholder')}
                                    value={sourceText}
                                    onChange={(event) => {
                                        handleSourceTextChange(event.target.value);
                                    }}
                                    onKeyDown={(event) => {
                                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                            event.preventDefault();
                                            if (loading) {
                                                stop();
                                            } else {
                                                void runCurrentTab();
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ ...styles.card, ...styles.resultCard }}>
                            <div style={styles.cardHeader}>
                                <span>{panelTitle}</span>
                                <div style={styles.cardHeaderActions}>
                                    <button
                                        type='button'
                                        title={t('light_ai.append_todo')}
                                        aria-label={t('light_ai.append_todo')}
                                        className='bg-transparent text-default-500 hover:bg-default-100 hover:text-default-700 disabled:hover:bg-transparent'
                                        style={styles.cardTextButton(!currentResult)}
                                        disabled={!currentResult}
                                        onClick={() => {
                                            void handleAppendCurrentResultToTodo();
                                        }}
                                    >
                                        <MdPlaylistAddCheck className='text-[16px]' />
                                        {t('light_ai.append_todo')}
                                    </button>
                                    <button
                                        type='button'
                                        title={t('light_ai.open_todo')}
                                        aria-label={t('light_ai.open_todo')}
                                        className='bg-transparent text-default-500 hover:bg-default-100 hover:text-default-700'
                                        style={styles.cardTextButton(false)}
                                        onClick={() => {
                                            void handleOpenTodoNotebook();
                                        }}
                                    >
                                        <MdFolderOpen className='text-[15px]' />
                                        {t('light_ai.open_todo')}
                                    </button>
                                    <button
                                        type='button'
                                        title={t('light_ai.copy_result')}
                                        aria-label={t('light_ai.copy_result')}
                                        className='bg-transparent text-default-400 hover:bg-default-100 hover:text-default-700 disabled:hover:bg-transparent'
                                        style={styles.cardIconButton(!currentResult)}
                                        disabled={!currentResult}
                                        onClick={() => {
                                            void handleCopyText(currentResult, t('light_ai.copied_result'));
                                        }}
                                    >
                                        <MdContentCopy className='text-[15px]' />
                                    </button>
                                    <button
                                        type='button'
                                        title={t('light_ai.read_aloud')}
                                        className='bg-transparent text-default-400 hover:bg-default-100 hover:text-default-700 disabled:hover:bg-transparent'
                                        style={styles.cardIconButton(!currentResult)}
                                        disabled={!currentResult}
                                        onClick={() => {
                                            handleSpeakResult().catch((error) => {
                                                toast.error(error?.message || String(error), {
                                                    style: toastStyle,
                                                });
                                            });
                                        }}
                                    >
                                        <HiOutlineVolumeUp className='text-[15px]' />
                                    </button>
                                </div>
                            </div>
                            <div
                                ref={resultBodyRef}
                                style={styles.resultBody}
                            >
                                {error ? (
                                    <span style={{ color: '#dc2626' }}>{error}</span>
                                ) : currentResult ? (
                                    currentResult
                                ) : loading ? (
                                    <span style={styles.emptyText}>{t('light_ai.loading')}</span>
                                ) : (
                                    <span style={styles.emptyText}>{t('light_ai.empty_result')}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={styles.footer}>
                        {promptVisible ? (
                            <input
                                style={styles.promptInput}
                                placeholder={t('light_ai.extra_placeholder')}
                                value={extraPrompt}
                                onChange={(event) => setExtraPrompt(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        if (loading) {
                                            stop();
                                        } else {
                                            void runCurrentTab();
                                        }
                                    }
                                }}
                            />
                        ) : null}

                        <div
                            style={styles.actionGroup}
                            data-no-window-drag='true'
                        >
                            <button
                                type='button'
                                style={styles.secondaryButton(!canRun)}
                                onClick={() => {
                                    if (loading) {
                                        stop();
                                    } else {
                                        void runCurrentTab();
                                    }
                                }}
                                disabled={!canRun}
                            >
                                {loading ? t('light_ai.stop') : t('light_ai.generate')}
                            </button>

                            <button
                                type='button'
                                style={styles.primaryButton(!canCopy)}
                                onClick={() => {
                                    void handleApply();
                                }}
                                disabled={!canCopy}
                            >
                                {t('light_ai.apply')}
                            </button>
                        </div>
                    </div>
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
