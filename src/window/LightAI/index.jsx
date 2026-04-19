import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { lightAiStream, STYLE_KEYS, STYLE_NAMES } from '../../services/light_ai/openai';
import { saveHistory } from '../../utils/aiHistory';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { getActiveAiApiConfig } from '../../utils/aiConfig';

const VERSION_COUNT = 3;
const LIGHT_AI_TITLE = 'AI 润色';
const GENERATE_LABEL = '生成';
const REGENERATE_LABEL = '重新生成';
const STOP_LABEL = '停止';

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
        color: '#dc2626',
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
        gap: '8px',
        padding: '10px 12px',
        borderTop: '1px solid rgba(226, 232, 240, 0.78)',
        background: 'rgba(248, 250, 252, 0.76)',
    },
    promptInput: {
        flex: 1,
        height: '40px',
        borderRadius: '10px',
        border: '1px solid rgba(203, 213, 225, 0.9)',
        background: 'rgba(255, 255, 255, 0.88)',
        padding: '0 12px',
        outline: 'none',
        fontSize: '13px',
        color: '#0f172a',
        fontFamily: APP_FONT_FAMILY_VAR,
    },
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

export default function LightAI() {
    const apiConfig = useApiConfig();
    const [sourceText, setSourceText] = useState('');
    const [extraPrompt, setExtraPrompt] = useState('');
    const [versions, setVersions] = useState(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));
    const [errors, setErrors] = useState(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));
    const [loading, setLoading] = useState(false);
    const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);
    const [refining, setRefining] = useState(Array(VERSION_COUNT).fill(false));
    const abortRefs = useRef(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => null));
    const inputRef = useRef(null);

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

    const stopAll = useCallback(() => {
        abortRefs.current.forEach((controller) => {
            try {
                controller?.abort();
            } catch {}
        });
        setLoading(false);
        setRefining(Array(VERSION_COUNT).fill(false));
    }, []);

    const generate = useCallback(async () => {
        if (!sourceText.trim() || !apiConfig) return;

        abortRefs.current.forEach((controller) => {
            try {
                controller?.abort();
            } catch {}
        });

        const controllers = STYLE_KEYS.slice(0, VERSION_COUNT).map(() => new AbortController());
        abortRefs.current = controllers;
        setLoading(true);
        setHasGeneratedOnce(true);
        setVersions(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));
        setErrors(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));
        setRefining(Array(VERSION_COUNT).fill(false));

        let finishedCount = 0;
        const onFinish = () => {
            finishedCount += 1;
            if (finishedCount >= VERSION_COUNT) {
                setLoading(false);
            }
        };

        STYLE_KEYS.slice(0, VERSION_COUNT).forEach((styleKey, index) => {
            lightAiStream(
                sourceText,
                styleKey,
                extraPrompt,
                apiConfig,
                (chunk) => {
                    setVersions((prev) => {
                        const next = [...prev];
                        next[index] = `${next[index] || ''}${chunk}`;
                        return next;
                    });
                },
                () => onFinish(),
                (error) => {
                    setErrors((prev) => {
                        const next = [...prev];
                        next[index] = error;
                        return next;
                    });
                    onFinish();
                },
                controllers[index].signal
            );
        });
    }, [apiConfig, extraPrompt, sourceText]);

    useEffect(() => {
        if (sourceText && apiConfig) {
            void generate();
        }
    }, [apiConfig, generate, sourceText]);

    useEffect(() => {
        if (!sourceText.trim()) {
            setHasGeneratedOnce(false);
        }
    }, [sourceText]);

    const refineVersion = useCallback(
        async (index) => {
            const base = versions[index];
            if (!base || !extraPrompt.trim() || !apiConfig) return;

            try {
                abortRefs.current[index]?.abort();
            } catch {}

            const controller = new AbortController();
            abortRefs.current[index] = controller;
            setRefining((prev) => {
                const next = [...prev];
                next[index] = true;
                return next;
            });
            setVersions((prev) => {
                const next = [...prev];
                next[index] = '';
                return next;
            });

            const styleKey = STYLE_KEYS[index];
            const prompt = `请根据以下要求调整文本：\n${extraPrompt}\n\n原文：\n${base}`;

            await lightAiStream(
                prompt,
                styleKey,
                '',
                apiConfig,
                (chunk) => {
                    setVersions((prev) => {
                        const next = [...prev];
                        next[index] = `${next[index] || ''}${chunk}`;
                        return next;
                    });
                },
                () => {
                    setRefining((prev) => {
                        const next = [...prev];
                        next[index] = false;
                        return next;
                    });
                },
                (error) => {
                    setErrors((prev) => {
                        const next = [...prev];
                        next[index] = error;
                        return next;
                    });
                    setRefining((prev) => {
                        const next = [...prev];
                        next[index] = false;
                        return next;
                    });
                },
                controller.signal
            );
        },
        [apiConfig, extraPrompt, versions]
    );

    const applyVersion = async (index) => {
        const text = versions[index];
        if (!text) return;

        try {
            await saveHistory('lightai', sourceText, text, {
                style: STYLE_KEYS[index],
                extra: extraPrompt,
            });
        } catch {}

        try {
            await invoke('paste_result', { text });
            await appWindow.close();
        } catch (error) {
            console.error('paste_result error:', error);
        }
    };

    const copyVersion = async (index) => {
        const text = versions[index];
        if (!text) return;

        try {
            await invoke('write_clipboard', { text });
        } catch (error) {
            console.error('write_clipboard error:', error);
        }
    };

    const canGenerate = Boolean(sourceText.trim());
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
                            {sourceText || <span style={{ color: '#94a3b8' }}>等待选中文本…</span>}
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
                        {STYLE_KEYS.slice(0, VERSION_COUNT).map((styleKey, index) => (
                            <div
                                key={styleKey}
                                style={styles.versionCard}
                            >
                                <div style={styles.versionHeader}>
                                    <div style={styles.versionTitle}>
                                        <span>{index + 1}.</span>
                                        <span>{STYLE_NAMES[styleKey]}</span>
                                        {loading && !versions[index] ? (
                                            <span style={{ color: '#94a3b8', fontWeight: 400 }}>生成中...</span>
                                        ) : null}
                                    </div>

                                    <div style={styles.actionRow}>
                                        {extraPrompt.trim() ? (
                                            <button
                                                type='button'
                                                style={styles.cardButton(false)}
                                                onClick={() => {
                                                    void refineVersion(index);
                                                }}
                                                disabled={!versions[index] || refining[index]}
                                            >
                                                {refining[index] ? '精修中' : '精修'}
                                            </button>
                                        ) : null}
                                        <button
                                            type='button'
                                            style={styles.cardButton(false)}
                                            onClick={() => {
                                                void copyVersion(index);
                                            }}
                                            disabled={!versions[index]}
                                        >
                                            复制
                                        </button>
                                        <button
                                            type='button'
                                            style={styles.cardButton(true)}
                                            onClick={() => {
                                                void applyVersion(index);
                                            }}
                                            disabled={!versions[index]}
                                        >
                                            应用
                                        </button>
                                    </div>
                                </div>

                                {errors[index] ? (
                                    <div style={styles.versionError}>{errors[index]}</div>
                                ) : (
                                    <div style={styles.versionBody}>
                                        {versions[index] || (loading || refining[index] ? '正在生成...' : '')}
                                    </div>
                                )}
                            </div>
                        ))}
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
                        <button
                            type='button'
                            style={TRAY_WINDOW_PRIMARY_BUTTON_STYLE}
                            className='h-10 rounded-[10px] px-4 text-[13px] font-semibold'
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
