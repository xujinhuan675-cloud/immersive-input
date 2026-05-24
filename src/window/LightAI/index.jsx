import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { HiOutlineVolumeUp, HiSparkles } from 'react-icons/hi';
import { MdContentCopy } from 'react-icons/md';

import WindowHeader, {
    WindowHeaderCloseButton,
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
import { useReadAloud, useStopVoiceOnUnmount, useToastStyle } from '../../hooks';
import { useConfig } from '../../hooks/useConfig';
import {
    STYLE_KEYS,
    STYLE_NAMES,
    lightAiStream,
    translateTextStream,
} from '../../services/light_ai/openai';
import { getActiveAiApiConfig, getAiHistoryServiceMeta } from '../../utils/aiConfig';
import { saveHistory } from '../../utils/aiHistory';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { formatText } from '../../utils/formatter';
import detect from '../../utils/lang_detect';
import { languageList, normalizeLanguageKey } from '../../utils/language';
import { streamTextToInput } from '../../utils/streamInput';

const TAB_OPTIONS = [
    { key: 'translate', label: '翻译' },
    { key: 'style', label: '润色' },
    { key: 'fix', label: '修正' },
];

const STYLE_LABELS_ZH = {
    strict: '正式',
    structured: '结构化',
    natural: '自然',
};

const LANGUAGE_LABELS_ZH = {
    auto: '自动检测',
    zh_cn: '简体中文',
    zh_tw: '繁体中文',
    mn_mo: '蒙古文',
    en: '英语',
    ja: '日语',
    ko: '韩语',
    fr: '法语',
    es: '西班牙语',
    ru: '俄语',
    de: '德语',
    it: '意大利语',
    tr: '土耳其语',
    pt_pt: '葡萄牙语',
    pt_br: '巴西葡萄牙语',
    vi: '越南语',
    id: '印尼语',
    th: '泰语',
    ms: '马来语',
    ar: '阿拉伯语',
    hi: '印地语',
    km: '高棉语',
    mn_cy: '西里尔蒙古语',
    nb_no: '挪威语',
    nn_no: '新挪威语',
    fa: '波斯语',
    sv: '瑞典语',
    pl: '波兰语',
    nl: '荷兰语',
    uk: '乌克兰语',
    he: '希伯来语',
};

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

function getSourceModeLabel(targetMode, sourceText) {
    if (targetMode === 'focused_input') return '整个输入框';
    if (targetMode === 'clipboard') return '剪贴板文本';
    if (targetMode === 'http') return '传入文本';
    if (!String(sourceText || '').trim()) return '手动输入';
    return '选中文本';
}

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
        border: active
            ? '1px solid rgba(59, 130, 246, 0.38)'
            : '1px solid rgba(226, 232, 240, 0.78)',
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
        overflow: 'auto',
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
    cardBody: {
        minHeight: '118px',
        padding: '14px',
        color: '#0f172a',
        lineHeight: 1.75,
        fontSize: '13px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: APP_FONT_FAMILY_VAR,
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

    useEffect(() => {
        let mounted = true;

        async function loadConfig() {
            const nextConfig = await getActiveAiApiConfig();
            if (mounted) {
                setConfig(nextConfig);
            }
        }

        void loadConfig();
        return () => {
            mounted = false;
        };
    }, []);

    return config;
}

function getLanguageLabelZh(key) {
    const normalizedKey = normalizeLanguageKey(key || 'auto') || 'auto';
    return LANGUAGE_LABELS_ZH[normalizedKey] ?? normalizedKey;
}

export default function LightAI() {
    useStopVoiceOnUnmount();
    const apiConfig = useApiConfig();
    const toastStyle = useToastStyle();
    const readAloud = useReadAloud();
    const [activeTab, setActiveTab] = useState('style');
    const [sourceText, setSourceText] = useState('');
    const [targetMode, setTargetMode] = useState('selection');
    const [selectedStyle, setSelectedStyle] = useConfig(
        'light_ai_selected_style',
        STYLE_KEYS[0]
    );
    const [, setSelectedStyles] = useConfig('light_ai_selected_styles', [
        STYLE_KEYS[0],
    ]);
    const [targetLanguage, setTargetLanguage] = useConfig(
        'translate_target_language',
        'en'
    );
    const [sourceLanguage, setSourceLanguage] = useState('auto');
    const [extraPrompt, setExtraPrompt] = useState('');
    const [styleResult, setStyleResult] = useState('');
    const [translateResult, setTranslateResult] = useState('');
    const [fixResult, setFixResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const abortRef = useRef(null);
    const autoRunRef = useRef(false);
    const resolvedSelectedStyle = STYLE_KEYS.includes(selectedStyle)
        ? selectedStyle
        : STYLE_KEYS[0];
    const resolvedTargetLanguage = targetLanguage || 'en';

    const currentResult = useMemo(() => {
        if (activeTab === 'translate') return translateResult;
        if (activeTab === 'fix') return fixResult;
        return styleResult;
    }, [activeTab, fixResult, styleResult, translateResult]);

    const currentLanguageLabel = useMemo(
        () => getLanguageLabelZh(sourceLanguage),
        [sourceLanguage]
    );
    const targetLanguageLabel = useMemo(
        () => getLanguageLabelZh(resolvedTargetLanguage),
        [resolvedTargetLanguage]
    );
    const currentResultLanguage = useMemo(() => {
        if (activeTab === 'translate') {
            return normalizeLanguageKey(resolvedTargetLanguage) || 'auto';
        }

        return normalizeLanguageKey(sourceLanguage) || 'auto';
    }, [activeTab, resolvedTargetLanguage, sourceLanguage]);

    const loadInitialContext = useCallback(async () => {
        try {
            const [text, nextTargetMode] = await Promise.all([
                invoke('get_text'),
                invoke('get_light_ai_target'),
            ]);
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

            if (activeTab === 'fix') {
                setFixResult(formatText(sourceText));
                return;
            }

            if (apiConfig === undefined) {
                return;
            }

            if (!apiConfig) {
                setError('请先在配置里填写可用的 AI 接口。');
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
                    apiConfig,
                    (chunk) => {
                        setTranslateResult((prev) => `${prev}${chunk}`);
                    },
                    onComplete,
                    onError,
                    controller.signal
                );
                return;
            }

            setStyleResult('');
            await lightAiStream(
                sourceText,
                resolvedSelectedStyle,
                overridePrompt,
                apiConfig,
                (chunk) => {
                    setStyleResult((prev) => `${prev}${chunk}`);
                },
                onComplete,
                onError,
                controller.signal
            );
        },
        [
            activeTab,
            apiConfig,
            clearResults,
            currentLanguageLabel,
            extraPrompt,
            resolvedSelectedStyle,
            sourceText,
            stop,
            targetLanguageLabel,
        ]
    );

    useEffect(() => {
        if (!sourceText.trim() || !autoRunRef.current) return;
        if (activeTab !== 'fix' && apiConfig === undefined) return;
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
        setSelectedStyles([resolvedSelectedStyle]);
    }, [resolvedSelectedStyle, setSelectedStyles]);

    useEffect(() => {
        return () => {
            try {
                abortRef.current?.abort();
            } catch {}
        };
    }, []);

    const handleCopy = async () => {
        if (!currentResult) return;
        try {
            await invoke('write_clipboard', { text: currentResult });
            toast.success('已复制结果', { style: toastStyle });
        } catch {
            toast.error('复制失败', { style: toastStyle });
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

    const panelTitle =
        activeTab === 'translate'
            ? '翻译结果'
            : activeTab === 'fix'
              ? '修正结果'
              : '润色结果';

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
                        文本助手
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton onClick={() => void handleDismiss()} />}
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
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {activeTab === 'translate' ? (
                            <div style={styles.topMetaRow}>
                                <div style={styles.selectWrap}>
                                    <span style={styles.selectLabel}>源语言</span>
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
                                    <span style={styles.selectLabel}>目标语言</span>
                                    <select
                                        style={styles.nativeSelect}
                                        value={resolvedTargetLanguage}
                                        onChange={(event) => {
                                            setTargetLanguage(event.target.value);
                                        }}
                                    >
                                        {languageList.map((languageKey) => (
                                            <option key={languageKey} value={languageKey}>
                                                {getLanguageLabelZh(languageKey)}
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
                                        style={styles.styleChip(
                                            resolvedSelectedStyle === styleKey
                                        )}
                                        onClick={() => {
                                            setSelectedStyle(styleKey);
                                        }}
                                    >
                                        {STYLE_LABELS_ZH[styleKey] ??
                                            STYLE_NAMES[styleKey] ??
                                            styleKey}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div style={styles.pane}>
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span>原文</span>
                                <div style={styles.cardHeaderActions}>
                                    <button
                                        type='button'
                                        title='朗读'
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
                                    placeholder='输入、粘贴或划词后,内容会显示在这里'
                                    value={sourceText}
                                    onChange={(event) => {
                                        handleSourceTextChange(event.target.value);
                                    }}
                                    onKeyDown={(event) => {
                                        if (
                                            (event.ctrlKey || event.metaKey) &&
                                            event.key === 'Enter'
                                        ) {
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

                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span>{panelTitle}</span>
                                <div style={styles.cardHeaderActions}>
                                    <button
                                        type='button'
                                        title='复制结果'
                                        aria-label='复制结果'
                                        className='bg-transparent text-default-400 hover:bg-default-100 hover:text-default-700 disabled:hover:bg-transparent'
                                        style={styles.cardIconButton(!currentResult)}
                                        disabled={!currentResult}
                                        onClick={() => {
                                            void handleCopy();
                                        }}
                                    >
                                        <MdContentCopy className='text-[15px]' />
                                    </button>
                                    <button
                                        type='button'
                                        title='朗读'
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
                            <div style={styles.cardBody}>
                                {error ? (
                                    <span style={{ color: '#dc2626' }}>{error}</span>
                                ) : currentResult ? (
                                    currentResult
                                ) : loading ? (
                                    <span style={styles.emptyText}>生成中...</span>
                                ) : (
                                    <span style={styles.emptyText}>暂无结果。</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={styles.footer}>
                        {promptVisible ? (
                            <input
                                style={styles.promptInput}
                                placeholder='可选补充要求'
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
                                {loading ? '停止' : '生成'}
                            </button>

                            <button
                                type='button'
                                style={styles.primaryButton(!canCopy)}
                                onClick={() => {
                                    void handleApply();
                                }}
                                disabled={!canCopy}
                            >
                                应用
                            </button>
                        </div>
                    </div>
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
