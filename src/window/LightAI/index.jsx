import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiSparkles } from 'react-icons/hi';

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

const styles = {
    topSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 12px 8px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.74)',
        background: 'rgba(255, 255, 255, 0.96)',
    },
    tabRow: {
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignSelf: 'flex-start',
        gap: '4px',
        padding: '4px',
        borderRadius: '14px',
        border: '1px solid rgba(226, 232, 240, 0.92)',
        background: '#f8fafc',
    },
    tabButton: (active) => ({
        minWidth: '72px',
        height: '34px',
        padding: '0 14px',
        border: 'none',
        borderRadius: '10px',
        background: active ? '#ffffff' : 'transparent',
        color: active ? '#0f172a' : '#64748b',
        boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
        cursor: 'pointer',
        fontSize: '13px',
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
        cursor: 'pointer',
        fontFamily: APP_FONT_FAMILY_VAR,
        minWidth: '72px',
    },
    styleRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
    },
    styleChip: (active) => ({
        height: '32px',
        padding: '0 12px',
        borderRadius: '999px',
        border: active
            ? '1px solid rgba(147, 197, 253, 0.95)'
            : '1px solid rgba(226, 232, 240, 0.92)',
        background: active ? 'rgba(239, 246, 255, 0.96)' : '#ffffff',
        color: active ? '#1d4ed8' : '#475569',
        cursor: 'pointer',
        fontSize: '12px',
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
    },
    card: {
        borderRadius: '14px',
        border: '1px solid rgba(226, 232, 240, 0.92)',
        background: '#ffffff',
        boxShadow: '0 10px 28px -26px rgba(15, 23, 42, 0.22)',
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
    emptyText: {
        color: '#94a3b8',
    },
    footer: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '10px 12px 12px',
        borderTop: '1px solid rgba(241, 245, 249, 0.96)',
        background: 'rgba(248, 250, 252, 0.76)',
        alignItems: 'center',
    },
    promptInput: {
        flex: '1 1 220px',
        minWidth: 0,
        height: '40px',
        borderRadius: '10px',
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
        flexWrap: 'wrap',
        gap: '8px',
        marginLeft: 'auto',
        justifyContent: 'flex-end',
    },
    secondaryButton: (disabled) => ({
        height: '40px',
        minWidth: '70px',
        padding: '0 14px',
        borderRadius: '10px',
        border: '1px solid rgba(226, 232, 240, 0.96)',
        background: '#ffffff',
        color: '#475569',
        fontSize: '12px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.46 : 1,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        textAlign: 'center',
        boxShadow: 'none',
    }),
    primaryButton: (disabled) => ({
        ...TRAY_WINDOW_PRIMARY_BUTTON_STYLE,
        height: '40px',
        minWidth: '92px',
        padding: '0 18px',
        borderRadius: '10px',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.46 : 1,
        boxShadow: '0 8px 18px -16px rgba(15, 23, 42, 0.35)',
    }),
};

const headerStyle = {
    ...TRAY_WINDOW_HEADER_STYLE,
    minHeight: '42px',
    padding: '4px 10px',
    background: 'rgba(255, 255, 255, 0.96)',
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
    borderRadius: '14px',
    border: '1px solid rgba(226, 232, 240, 0.9)',
    background: '#ffffff',
    boxShadow: '0 16px 36px -32px rgba(15, 23, 42, 0.24)',
};

function useApiConfig() {
    const [config, setConfig] = useState(null);

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
    const apiConfig = useApiConfig();
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

    const loadInitialContext = useCallback(async () => {
        try {
            const [text, nextTargetMode] = await Promise.all([
                invoke('get_text'),
                invoke('get_light_ai_target'),
            ]);
            setSourceText(text || '');
            setTargetMode(nextTargetMode || 'selection');
        } catch (nextError) {
            console.error('loadInitialContext error:', nextError);
        }
    }, []);

    useEffect(() => {
        void loadInitialContext();
        const unlisten = listen('new_text', (event) => {
            setSourceText(event.payload || '');
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

    const runCurrentTab = useCallback(
        async (overridePrompt = extraPrompt) => {
            const text = sourceText.trim();
            if (!text) {
                setStyleResult('');
                setTranslateResult('');
                setFixResult('');
                setError('');
                return;
            }

            stop();
            setError('');

            if (activeTab === 'fix') {
                setFixResult(formatText(sourceText));
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
            currentLanguageLabel,
            extraPrompt,
            resolvedSelectedStyle,
            sourceText,
            stop,
            targetLanguageLabel,
        ]
    );

    useEffect(() => {
        if (!sourceText.trim()) return;
        void runCurrentTab('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        activeTab,
        resolvedSelectedStyle,
        sourceLanguage,
        sourceText,
        resolvedTargetLanguage,
    ]);

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
        await invoke('write_clipboard', { text: currentResult }).catch(() => {});
    };

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
                await invoke('replace_input_text', { text: currentResult });
            } else {
                await invoke('paste_result', { text: currentResult });
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
        <TrayWindow style={{ background: '#f6f8fb' }}>
            <WindowHeader
                style={headerStyle}
                center={
                    <WindowHeaderTitle
                        icon={<HiSparkles className='text-[13px] text-default-500' />}
                        style={headerTitleStyle}
                        textStyle={headerTitleTextStyle}
                    >
                        AI 编辑器
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton onClick={() => void handleDismiss()} />}
            />

            <TrayWindowBody style={{ padding: '10px 12px 12px' }}>
                <TrayWindowSurface style={surfaceStyle}>
                    <div style={styles.topSection}>
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
                                <span style={styles.cardMeta}>
                                    {targetMode === 'focused_input'
                                        ? '整个输入框'
                                        : '选中文本'}
                                </span>
                            </div>
                            <div style={styles.cardBody}>
                                {sourceText || (
                                    <span style={styles.emptyText}>等待文本内容...</span>
                                )}
                            </div>
                        </div>

                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span>{panelTitle}</span>
                                {activeTab === 'style' ? (
                                    <span style={styles.cardMeta}>
                                        {STYLE_LABELS_ZH[resolvedSelectedStyle] ??
                                            STYLE_NAMES[resolvedSelectedStyle] ??
                                            resolvedSelectedStyle}
                                    </span>
                                ) : null}
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

                        <div style={styles.actionGroup}>
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
                                style={styles.secondaryButton(!canCopy)}
                                onClick={() => {
                                    void handleCopy();
                                }}
                                disabled={!canCopy}
                            >
                                复制
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
