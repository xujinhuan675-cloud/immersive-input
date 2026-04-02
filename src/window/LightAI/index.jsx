import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { lightAiStream, STYLE_KEYS, STYLE_NAMES } from '../../services/light_ai/openai';
import { saveHistory } from '../../utils/aiHistory';
import { store } from '../../utils/store';

const VERSION_COUNT = 3;

// 快捷指令模板
const QUICK_TEMPLATES = [
    { label: '缩写', prompt: '请在保留核心信息的前提下尽量精简压缩，字数缩减到原来的60%左右。' },
    { label: '扩写', prompt: '请适当扩充内容，补充细节、背景或逻辑，字数扩展到原来的150%左右。' },
    { label: '纠错', prompt: '请纠正语法、用词、标点错误，并改善不流畅的表达，保持原意。' },
    { label: '改正式', prompt: '请改写为正式、专业的书面语风格，适合商务或学术场景。' },
    { label: '改口语', prompt: '请改写为轻松、口语化的表达，适合日常沟通。' },
    { label: '翻译英文', prompt: '请将以上内容翻译为地道的英文，保持原意。' },
];

function useApiConfig() {
    const [config, setConfig] = useState(null);
    useEffect(() => {
        async function load() {
            await store.load();
            const apiUrl = (await store.get('ai_api_url')) || '';
            const apiKey = (await store.get('ai_api_key')) || '';
            const model = (await store.get('ai_model')) || 'gpt-4o-mini';
            const temperature = (await store.get('ai_temperature')) ?? 0.7;
            setConfig({ apiUrl, apiKey, model, temperature });
        }
        load();
    }, []);
    return config;
}

export default function LightAI() {
    const apiConfig = useApiConfig();
    const [sourceText, setSourceText] = useState('');
    const [extraPrompt, setExtraPrompt] = useState('');
    const [versions, setVersions] = useState(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));
    const [refining, setRefining] = useState(Array(VERSION_COUNT).fill(false));
    const abortRefs = useRef(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => null));
    const inputRef = useRef(null);

    // Load source text on mount and on new_text event
    const loadText = useCallback(async () => {
        try {
            const text = await invoke('get_text');
            if (text) setSourceText(text);
        } catch (e) {
            console.error('get_text error:', e);
        }
    }, []);

    useEffect(() => {
        loadText();
        const unlisten = listen('new_text', (event) => {
            if (event.payload) setSourceText(event.payload);
        });
        return () => { unlisten.then((f) => f()); };
    }, [loadText]);

    // Start generation
    const generate = useCallback(async () => {
        if (!sourceText.trim() || !apiConfig) return;
        // Cancel any ongoing requests
        abortRefs.current.forEach((c) => { try { c?.abort(); } catch {} });

        const controllers = STYLE_KEYS.slice(0, VERSION_COUNT).map(() => new AbortController());
        abortRefs.current = controllers;
        setLoading(true);
        setVersions(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));
        setErrors(STYLE_KEYS.slice(0, VERSION_COUNT).map(() => ''));

        let finishedCount = 0;
        const onFinish = () => {
            finishedCount++;
            if (finishedCount >= VERSION_COUNT) setLoading(false);
        };

        STYLE_KEYS.slice(0, VERSION_COUNT).forEach((styleKey, idx) => {
            lightAiStream(
                sourceText,
                styleKey,
                extraPrompt,
                apiConfig,
                (chunk) => {
                    setVersions((prev) => {
                        const next = [...prev];
                        next[idx] = (next[idx] || '') + chunk;
                        return next;
                    });
                },
                (_full) => onFinish(),
                (err) => {
                    setErrors((prev) => { const e = [...prev]; e[idx] = err; return e; });
                    onFinish();
                },
                controllers[idx].signal
            );
        });
    }, [sourceText, extraPrompt, apiConfig]);

    // Auto-start generation when source text + config are ready
    useEffect(() => {
        if (sourceText && apiConfig) {
            generate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceText, apiConfig]);

    const stopAll = () => {
        abortRefs.current.forEach((c) => { try { c?.abort(); } catch {} });
        setLoading(false);
    };

    // Refine a single version with the extra prompt instruction
    const refineVersion = useCallback(async (idx) => {
        const base = versions[idx];
        if (!base || !extraPrompt.trim() || !apiConfig) return;
        try { abortRefs.current[idx]?.abort(); } catch {}
        const ctrl = new AbortController();
        abortRefs.current[idx] = ctrl;
        setRefining((p) => { const r = [...p]; r[idx] = true; return r; });
        setVersions((p) => { const n = [...p]; n[idx] = ''; return n; });
        const styleKey = STYLE_KEYS[idx];
        const refineMsg = `请根据以下要求对文本进行调整：\n要求：${extraPrompt}\n\n原文：\n${base}`;
        await lightAiStream(refineMsg, styleKey, '', apiConfig,
            (chunk) => setVersions((p) => { const n = [...p]; n[idx] = (n[idx] || '') + chunk; return n; }),
            () => setRefining((p) => { const r = [...p]; r[idx] = false; return r; }),
            (err) => { setErrors((p) => { const e = [...p]; e[idx] = err; return e; }); setRefining((p) => { const r = [...p]; r[idx] = false; return r; }); },
            ctrl.signal
        );
    }, [versions, extraPrompt, apiConfig]);

    const applyVersion = async (idx) => {
        const text = versions[idx];
        if (!text) return;
        // Save to history
        try { await saveHistory('lightai', sourceText, text, { style: STYLE_KEYS[idx], extra: extraPrompt }); } catch {}
        try {
            await invoke('paste_result', { text });
            appWindow.close();
        } catch (e) {
            console.error('paste_result error:', e);
        }
    };

    const copyVersion = async (idx) => {
        const text = versions[idx];
        if (!text) return;
        try {
            await invoke('write_clipboard', { text });
        } catch (e) {
            console.error('write_clipboard error:', e);
        }
    };

    const styles = {
        root: {
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            fontFamily: '-apple-system, "Microsoft YaHei", sans-serif',
            fontSize: '13px',
            background: '#fafafa',
            color: '#333',
            overflow: 'hidden',
        },
        header: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: '#fff',
            borderBottom: '1px solid #e5e5e5',
            flexShrink: 0,
            position: 'relative',  // needed for drag overlay
        },
        dragOverlay: {
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            cursor: 'move',
        },
        sourceBox: {
            padding: '8px 12px',
            background: '#f0f4ff',
            borderBottom: '1px solid #dde3f0',
            fontSize: '12px',
            color: '#555',
            maxHeight: '72px',
            overflow: 'auto',
            flexShrink: 0,
            lineHeight: 1.5,
        },
        versionsArea: {
            flex: 1,
            overflow: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
        },
        versionCard: {
            background: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            overflow: 'hidden',
            flexShrink: 0,
        },
        versionHeader: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 10px',
            background: '#f5f5f5',
            borderBottom: '1px solid #e5e5e5',
        },
        versionLabel: { fontWeight: 600, fontSize: '12px', color: '#444' },
        versionBody: {
            padding: '8px 10px',
            minHeight: '60px',
            fontSize: '13px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#222',
        },
        versionError: { color: '#cc3333', fontSize: '12px', padding: '8px 10px' },
        btn: (primary) => ({
            padding: '3px 10px',
            borderRadius: '5px',
            border: primary ? 'none' : '1px solid #ccc',
            background: primary ? '#4a7cfa' : '#fff',
            color: primary ? '#fff' : '#444',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: primary ? 600 : 400,
        }),
        footer: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            background: '#fff',
            borderTop: '1px solid #e5e5e5',
            flexShrink: 0,
        },
        extraInput: {
            flex: 1,
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '5px',
            fontSize: '12px',
            outline: 'none',
        },
    };

    return (
        <div style={styles.root}>
            {/* Header with drag region */}
            <div style={styles.header}>
                {/* Transparent drag area behind buttons */}
                <div style={styles.dragOverlay} data-tauri-drag-region='true' />
                <span style={{ fontWeight: 700, fontSize: '14px', position: 'relative', zIndex: 1 }}>⚡ 轻AI润色</span>
                <div style={{ display: 'flex', gap: '6px', position: 'relative', zIndex: 1 }}>
                    {loading ? (
                        <button style={styles.btn(false)} onClick={stopAll}>⏹ 停止</button>
                    ) : (
                        <button style={styles.btn(true)} onClick={generate}>▶ 重新生成</button>
                    )}
                    <button style={styles.btn(false)} onClick={() => appWindow.close()}>✕ 关闭</button>
                </div>
            </div>

            {/* Source text */}
            <div style={styles.sourceBox}>
                <span style={{ fontWeight: 600, color: '#888', marginRight: 6 }}>原文：</span>
                {sourceText || <span style={{ color: '#aaa' }}>（等待选中文本…）</span>}
            </div>

            {/* Quick templates */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', padding: '5px 10px', background: '#fff', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', color: '#aaa', lineHeight: '22px', marginRight: 2 }}>快捷：</span>
                {QUICK_TEMPLATES.map((t) => (
                    <button key={t.label}
                        style={{ padding: '2px 9px', borderRadius: '12px', border: '1px solid #dde', background: '#f5f5f5', fontSize: '11px', color: '#555', cursor: 'pointer' }}
                        onClick={() => { setExtraPrompt(t.prompt); if (inputRef.current) inputRef.current.focus(); }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Version results */}
            <div style={styles.versionsArea}>
                {STYLE_KEYS.slice(0, VERSION_COUNT).map((styleKey, idx) => (
                    <div key={styleKey} style={styles.versionCard}>
                        <div style={styles.versionHeader}>
                            <span style={styles.versionLabel}>
                                {idx + 1}. {STYLE_NAMES[styleKey]}
                                {loading && !versions[idx] && (
                                    <span style={{ color: '#aaa', fontWeight: 400, marginLeft: 6 }}>生成中…</span>
                                )}
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {extraPrompt.trim() && (
                                    <button style={styles.btn(false)} onClick={() => refineVersion(idx)}
                                        disabled={!versions[idx] || refining[idx]} title="根据附加要求精炼此版本">
                                        {refining[idx] ? '…' : '✉ 精炼'}
                                    </button>
                                )}
                                <button
                                    style={styles.btn(false)}
                                    onClick={() => copyVersion(idx)}
                                    disabled={!versions[idx]}
                                    title="复制到剪贴板"
                                >
                                    复制
                                </button>
                                <button
                                    style={styles.btn(true)}
                                    onClick={() => applyVersion(idx)}
                                    disabled={!versions[idx]}
                                    title="粘贴到原输入框"
                                >
                                    应用
                                </button>
                            </div>
                        </div>
                        {errors[idx] ? (
                            <div style={styles.versionError}>{errors[idx]}</div>
                        ) : (
                            <div style={styles.versionBody}>
                                {versions[idx] || ((loading || refining[idx]) ? <span style={{ color: '#bbb' }}>▷</span> : '')}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer: extra prompt + re-generate */}
            <div style={styles.footer}>
                <input
                    ref={inputRef}
                    style={styles.extraInput}
                    placeholder="附加要求——点快捷模板或手动输入，回车重新生成，可对单个版本点「精炼」"
                    value={extraPrompt}
                    onChange={(e) => setExtraPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!loading) generate();
                        }
                    }}
                />
                <button
                    style={styles.btn(true)}
                    onClick={generate}
                    disabled={loading || !sourceText.trim()}
                >
                    {loading ? '…' : '发送'}
                </button>
            </div>
        </div>
    );
}
