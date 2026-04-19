import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiDotsHorizontal, HiSparkles } from 'react-icons/hi';
import { LuCheck } from 'react-icons/lu';

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
import { lightAiStream, STYLE_KEYS, STYLE_NAMES } from '../../services/light_ai/openai';
import { saveHistory } from '../../utils/aiHistory';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { getActiveAiApiConfig, getAiHistoryServiceMeta } from '../../utils/aiConfig';

const LIGHT_AI_TITLE = 'AI 润色';
const GENERATE_LABEL = '生成';
const REGENERATE_LABEL = '重新生成';
const STOP_LABEL = '停止';
const WAITING_PLACEHOLDER = '请提供需要润色改写的原文内容（可直接粘贴在此处）。';
const EMPTY_STYLE_PLACEHOLDER = '请先选择至少一种润色风格。';

const QUICK_TEMPLATES = [
    { label: '缩写', prompt: '请在保留核心信息的前提下尽量精简压缩。' },
    { label: '扩写', prompt: '请适度扩写原文，补充细节和语气，让表达更完整。' },
    { label: '纠错', prompt: '请纠正语法、措辞和标点问题，保持原意。' },
    { label: '正式', prompt: '请改写成更正式、专业的表达。' },
    { label: '口语', prompt: '请改写成更轻松自然的口语表达。' },
    { label: '英文', prompt: '请将以上内容翻译成自然的英文表达。' },
];

const styles = {
    sectionLabel: {
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: '#94a3b8',
        textTransform: 'uppercase',
    },
    sourceBox: {
        padding: '10px 12px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.78)',
        background: 'rgba(248, 250, 252, 0.82)',
        lineHeight: 1.6,
        fontSize: '13px',
        color: '#334155',
    },
    templateBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '10px 12px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.78)',
        background: 'rgba(255, 255, 255, 0.74)',
    },
    chip: {
        padding: '4px 10px',
        borderRadius: '999px',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: 'rgba(248, 250, 252, 0.9)',
        color: '#475569',
        fontSize: '12px',
        cursor: 'pointer',
    },
    versionsArea: {
        flex: 1,
        overflow: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    versionCard: {
        border: '1px solid rgba(226, 232, 240, 0.9)',
        borderRadius: '14px',
        background: 'rgba(255, 255, 255, 0.9)',
        overflow: 'hidden',
        boxShadow: '0 12px 28px -26px rgba(15, 23, 42, 0.35)',
    },
    versionHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '9px 12px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.78)',
        background: 'rgba(248, 250, 252, 0.84)',
    },
    versionTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0,
        fontSize: '12px',
        fontWeight: 600,
        color: '#334155',
    },
    versionBody: {
        padding: '12px',
        minHeight: '88px',
        fontSize: '13px',
        lineHeight: 1.7,
        color: '#0f172a',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: APP_FONT_FAMILY_VAR,
    },
    versionError: {
        padding: '12px',
        fontSize: '13px',
        lineHeight: 1.7,
        color: '#dc2626',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: APP_FONT_FAMILY_VAR,
    },
    emptyState: {
        padding: '18px 16px',
        border: '1px dashed rgba(203, 213, 225, 0.95)',
        borderRadius: '14px',
        background: 'rgba(248, 250, 252, 0.7)',
        color: '#64748b',
        fontSize: '13px',
        lineHeight: 1.7,
    },
    actionRow: {
        display: 'flex',
        gap: '6px',
        flexShrink: 0,
    },
    cardButton: (primary = false) => ({
        height: '28px',
        padding: '0 10px',
        borderRadius: '8px',
        border: primary ? '1px solid rgba(15, 23, 42, 0.84)' : '1px solid rgba(226, 232, 240, 0.9)',
        background: primary ? '#0f172a' : 'rgba(255, 255, 255, 0.88)',
        color: primary ? '#ffffff' : '#475569',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
    }),
    footer: {
        display: 'flex',
        gap: '10px',
        padding: '12px',
        borderTop: '1px solid rgba(226, 232, 240, 0.78)',
        background: 'rgba(248, 250, 252, 0.76)',
        alignItems: 'center',
    },
    promptInput: {
        flex: 1,
        height: '56px',
        borderRadius: '14px',
        border: '1px solid rgba(203, 213, 225, 0.9)',
        background: 'rgba(255, 255, 255, 0.92)',
        padding: '0 16px',
        outline: 'none',
        fontSize: '13px',
        color: '#0f172a',
        fontFamily: APP_FONT_FAMILY_VAR,
        boxSizing: 'border-box',
    },
    footerMenuWrap: {
        position: 'relative',
        flexShrink: 0,
    },
    footerIconButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '56px',
        height: '56px',
        borderRadius: '14px',
        border: '1px solid rgba(203, 213, 225, 0.9)',
        background: 'rgba(255, 255, 255, 0.92)',
        color: '#475569',
        cursor: 'pointer',
    },
    footerMenu: {
        position: 'absolute',
        right: 0,
        bottom: 'calc(100% + 8px)',
        minWidth: '186px',
        padding: '6px',
        borderRadius: '14px',
        border: '1px solid rgba(226, 232, 240, 0.92)',
        background: 'rgba(255, 255, 255, 0.98)',
        boxShadow: '0 16px 36px -24px rgba(15, 23, 42, 0.35)',
        zIndex: 10,
    },
    footerMenuTitle: {
        padding: '6px 10px 8px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#94a3b8',
    },
    footerMenuItem: (selected) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: '36px',
        padding: '0 10px',
        border: 'none',
        borderRadius: '10px',
        background: selected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
        color: selected ? '#1d4ed8' : '#334155',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'left',
    }),
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

function normalizeSelectedStyles(value, preferredStyle = STYLE_KEYS[0]) {
    const fallbackStyle = STYLE_KEYS.includes(preferredStyle) ? preferredStyle : STYLE_KEYS[0];

    if (Array.isArray(value)) {
        const normalized = STYLE_KEYS.filter((styleKey) => value.includes(styleKey));
        return normalized.length > 0 ? normalized : [fallbackStyle];
    }

    if (typeof value === 'string' && STYLE_KEYS.includes(value)) {
        return [value];
    }

    return [fallbackStyle];
}

export default function LightAI() {
    const apiConfig = useApiConfig();
    const [selectedStyles, setSelectedStyles] = useConfig('light_ai_selected_styles', []);
    const [legacySelectedStyle, setLegacySelectedStyle] = useConfig('light_ai_selected_style', STYLE_KEYS[0]);
    const [sourceText, setSourceText] = useState('');
    const [extraPrompt, setExtraPrompt] = useState('');
    const [versions, setVersions] = useState({});
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const abortRefs = useRef({});
    const inputRef = useRef(null);
    const menuRef = useRef(null);
    const menuButtonRef = useRef(null);

    const stylesReady = selectedStyles !== null && legacySelectedStyle !== null;
    const activeStyleKeys = useMemo(
        () => normalizeSelectedStyles(selectedStyles, legacySelectedStyle),
        [legacySelectedStyle, selectedStyles]
    );
    const activeStyleKeySignature = activeStyleKeys.join('|');

    const loadText = useCallback(async () => {
        try {
            const text = await invoke('get_text');
            if (text) {
                setSourceText(text);
            }
        } catch (error) {
            console.error('get_text error:', error);
        }
    }, []);

    useEffect(() => {
        void loadText();
        const unlisten = listen('new_text', (event) => {
            if (event.payload) {
                setSourceText(event.payload);
            }
        });

        return () => {
            void unlisten.then((fn) => fn());
        };
    }, [loadText]);

    useEffect(() => {
        if (!menuOpen) return undefined;

        const handlePointerDown = (event) => {
            const target = event.target;
            if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) {
                return;
            }
            setMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [menuOpen]);

    useEffect(() => {
        if (!stylesReady) return;

        const normalizedSelection = normalizeSelectedStyles(selectedStyles, legacySelectedStyle);
        const selectionChanged =
            !Array.isArray(selectedStyles) ||
            normalizedSelection.length !== selectedStyles.length ||
            normalizedSelection.some((styleKey, index) => styleKey !== selectedStyles[index]);

        if (selectionChanged) {
            setSelectedStyles(normalizedSelection);
            return;
        }

        const nextPrimaryStyle = normalizedSelection[0];
        if (nextPrimaryStyle && nextPrimaryStyle !== legacySelectedStyle) {
            setLegacySelectedStyle(nextPrimaryStyle);
        }
    }, [
        legacySelectedStyle,
        selectedStyles,
        setLegacySelectedStyle,
        setSelectedStyles,
        stylesReady,
    ]);

    const stopAll = useCallback(() => {
        Object.values(abortRefs.current).forEach((controller) => {
            try {
                controller?.abort();
            } catch {}
        });
        abortRefs.current = {};
        setLoading(false);
    }, []);

    const generate = useCallback(async () => {
        if (!sourceText.trim() || !apiConfig || !stylesReady || activeStyleKeys.length === 0) return;

        Object.values(abortRefs.current).forEach((controller) => {
            try {
                controller?.abort();
            } catch {}
        });
        abortRefs.current = {};

        setLoading(true);
        setHasGeneratedOnce(true);
        setVersions(Object.fromEntries(activeStyleKeys.map((styleKey) => [styleKey, ''])));
        setErrors(Object.fromEntries(activeStyleKeys.map((styleKey) => [styleKey, ''])));

        let finishedCount = 0;
        const onFinish = () => {
            finishedCount += 1;
            if (finishedCount >= activeStyleKeys.length) {
                abortRefs.current = {};
                setLoading(false);
            }
        };

        activeStyleKeys.forEach((styleKey) => {
            const controller = new AbortController();
            abortRefs.current[styleKey] = controller;

            lightAiStream(
                sourceText,
                styleKey,
                extraPrompt,
                apiConfig,
                (chunk) => {
                    setVersions((prev) => ({
                        ...prev,
                        [styleKey]: `${prev[styleKey] || ''}${chunk}`,
                    }));
                },
                () => {
                    onFinish();
                },
                (nextError) => {
                    if (!controller.signal.aborted && nextError) {
                        setErrors((prev) => ({
                            ...prev,
                            [styleKey]: nextError,
                        }));
                    }
                    onFinish();
                },
                controller.signal
            );
        });
    }, [activeStyleKeys, apiConfig, extraPrompt, sourceText, stylesReady]);

    useEffect(() => {
        if (sourceText && apiConfig && stylesReady && activeStyleKeys.length > 0) {
            void generate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceText, apiConfig, stylesReady, activeStyleKeySignature]);

    useEffect(() => {
        if (!sourceText.trim()) {
            setHasGeneratedOnce(false);
        }
    }, [sourceText]);

    const applyVersion = async (styleKey) => {
        const text = versions[styleKey];
        if (!text) return;

        try {
            await saveHistory('lightai', sourceText, text, {
                style: styleKey,
                extra: extraPrompt,
                ...getAiHistoryServiceMeta(apiConfig),
            });
        } catch {}

        try {
            await invoke('paste_result', { text });
            await appWindow.close();
        } catch (error) {
            console.error('paste_result error:', error);
        }
    };

    const copyVersion = async (styleKey) => {
        const text = versions[styleKey];
        if (!text) return;

        try {
            await invoke('write_clipboard', { text });
        } catch (error) {
            console.error('write_clipboard error:', error);
        }
    };

    const toggleStyle = (styleKey) => {
        let nextSelection;

        if (activeStyleKeys.includes(styleKey)) {
            if (activeStyleKeys.length === 1) {
                return;
            }
            nextSelection = activeStyleKeys.filter((value) => value !== styleKey);
        } else {
            nextSelection = STYLE_KEYS.filter(
                (value) => activeStyleKeys.includes(value) || value === styleKey
            );
        }

        setSelectedStyles(nextSelection);
        setLegacySelectedStyle(nextSelection[0] ?? styleKey);
    };

    const canGenerate = Boolean(sourceText.trim()) && stylesReady && activeStyleKeys.length > 0;
    const mainButtonLabel = loading ? STOP_LABEL : hasGeneratedOnce ? REGENERATE_LABEL : GENERATE_LABEL;

    return (
        <TrayWindow>
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                center={
                    <WindowHeaderTitle
                        icon={<HiSparkles className='text-[15px] text-default-500' />}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {LIGHT_AI_TITLE}
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton />}
            />

            <TrayWindowBody>
                <TrayWindowSurface>
                    <div style={styles.sourceBox}>
                        <div style={styles.sectionLabel}>源文本</div>
                        <div style={{ marginTop: '4px' }}>
                            {sourceText || <span style={{ color: '#94a3b8' }}>等待选中文本...</span>}
                        </div>
                    </div>

                    <div style={styles.templateBar}>
                        {QUICK_TEMPLATES.map((template) => (
                            <button
                                key={template.label}
                                type='button'
                                style={styles.chip}
                                onClick={() => {
                                    setExtraPrompt(template.prompt);
                                    inputRef.current?.focus();
                                }}
                            >
                                {template.label}
                            </button>
                        ))}
                    </div>

                    <div style={styles.versionsArea}>
                        {activeStyleKeys.length === 0 ? (
                            <div style={styles.emptyState}>{EMPTY_STYLE_PLACEHOLDER}</div>
                        ) : (
                            activeStyleKeys.map((styleKey, index) => {
                                const value = versions[styleKey] || '';
                                const nextError = errors[styleKey] || '';

                                return (
                                    <div key={styleKey} style={styles.versionCard}>
                                        <div style={styles.versionHeader}>
                                            <div style={styles.versionTitle}>
                                                <span>{index + 1}.</span>
                                                <span>{STYLE_NAMES[styleKey] ?? styleKey}</span>
                                                {loading && !value ? (
                                                    <span style={{ color: '#94a3b8', fontWeight: 400 }}>正在生成...</span>
                                                ) : null}
                                            </div>

                                            <div style={styles.actionRow}>
                                                <button
                                                    type='button'
                                                    style={styles.cardButton(false)}
                                                    onClick={() => {
                                                        void copyVersion(styleKey);
                                                    }}
                                                    disabled={!value}
                                                >
                                                    复制
                                                </button>
                                                <button
                                                    type='button'
                                                    style={styles.cardButton(true)}
                                                    onClick={() => {
                                                        void applyVersion(styleKey);
                                                    }}
                                                    disabled={!value}
                                                >
                                                    应用
                                                </button>
                                            </div>
                                        </div>

                                        {nextError ? (
                                            <div style={styles.versionError}>{nextError}</div>
                                        ) : (
                                            <div style={styles.versionBody}>
                                                {value || (loading ? '正在生成...' : WAITING_PLACEHOLDER)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div style={styles.footer}>
                        <input
                            ref={inputRef}
                            style={styles.promptInput}
                            placeholder='补充要求，回车重新生成'
                            value={extraPrompt}
                            onChange={(event) => setExtraPrompt(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    if (!loading) {
                                        void generate();
                                    }
                                }
                            }}
                        />

                        <div style={styles.footerMenuWrap}>
                            {menuOpen ? (
                                <div ref={menuRef} style={styles.footerMenu}>
                                    <div style={styles.footerMenuTitle}>选择润色风格</div>
                                    {STYLE_KEYS.map((styleKey) => {
                                        const selected = activeStyleKeys.includes(styleKey);

                                        return (
                                            <button
                                                key={styleKey}
                                                type='button'
                                                style={styles.footerMenuItem(selected)}
                                                onClick={() => {
                                                    toggleStyle(styleKey);
                                                }}
                                            >
                                                <span>{STYLE_NAMES[styleKey] ?? styleKey}</span>
                                                {selected ? <LuCheck className='text-[16px]' /> : <span />}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : null}

                            <button
                                ref={menuButtonRef}
                                type='button'
                                title='更多风格'
                                style={styles.footerIconButton}
                                onClick={() => setMenuOpen((prev) => !prev)}
                            >
                                <HiDotsHorizontal className='text-[20px]' />
                            </button>
                        </div>

                        <button
                            type='button'
                            style={TRAY_WINDOW_PRIMARY_BUTTON_STYLE}
                            className='h-14 rounded-[14px] px-6 text-[13px] font-semibold'
                            onClick={() => {
                                if (loading) {
                                    stopAll();
                                } else {
                                    void generate();
                                }
                            }}
                            disabled={!loading && !canGenerate}
                        >
                            {mainButtonLabel}
                        </button>
                    </div>
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
