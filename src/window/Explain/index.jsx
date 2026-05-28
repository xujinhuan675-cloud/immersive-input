import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import WindowHeader, {
    WindowHeaderButton,
    WindowHeaderCloseButton,
    WindowHeaderTitle,
} from '../../components/WindowHeader';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { saveHistory } from '../../utils/aiHistory';
import { getActiveAiApiConfig, getAiHistoryServiceMeta } from '../../utils/aiConfig';
import { streamAiChatCompletions } from '../../utils/aiGateway';

const SYSTEM_PROMPT =
    '你是一位知识渊博的助手。请详细解释用户提供的内容，包括：核心含义、背景知识、关键概念、实际用法和延伸拓展。' +
    '用清晰、准确、易懂的语言回答，可使用小标题组织内容。';

function useApiConfig() {
    const [config, setConfig] = useState(null);
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

async function streamChat(messages, apiConfig, onChunk, onComplete, onError, signal, retryOptions) {
    return streamAiChatCompletions(
        messages,
        apiConfig,
        onChunk,
        onComplete,
        (error) => onError(error ? `[错误] ${error}` : null),
        signal,
        retryOptions
    );
}

export default function Explain() {
    const { t } = useTranslation();
    const [apiConfig, refreshApiConfig] = useApiConfig();
    const [sourceText, setSourceText] = useState('');
    const [output, setOutput] = useState('');
    const [loading, setLoading] = useState(false);
    const [input, setInput] = useState('');
    const [history, setHistory] = useState([]); // [{role, content}]
    const abortRef = useRef(null);
    const outputRef = useRef(null);

    const loadText = useCallback(async () => {
        const text = await invoke('get_text').catch(() => '');
        if (text) setSourceText(text);
    }, []);

    useEffect(() => {
        loadText();
        const u = listen('new_text', (e) => { if (e.payload) setSourceText(e.payload); });
        return () => u.then((f) => f());
    }, [loadText]);

    const startExplain = useCallback(async (text, extraHistory = []) => {
        if (!text || !apiConfig) return;
        try { abortRef.current?.abort(); } catch {}
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);

        const msgs = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text },
            ...extraHistory,
        ];

        let chunk = '';
        setOutput((prev) => prev + (prev ? '\n\n────────\n\n' : ''));

        await streamChat(
            msgs,
            apiConfig,
            (delta) => { chunk += delta; setOutput((prev) => prev + delta); },
            (full) => {
                setHistory((h) => [...h, { role: 'user', content: text }, { role: 'assistant', content: full }]);
                setLoading(false);
                // Save to history (only initial source text + full AI response)
                if (extraHistory.length === 0) {
                    try { saveHistory('explain', text, full, getAiHistoryServiceMeta(apiConfig)); } catch {}
                }
            },
            (err) => { setOutput((prev) => prev + '\n' + err); setLoading(false); },
            ctrl.signal,
            { refreshConfig: refreshApiConfig }
        );
    }, [apiConfig, refreshApiConfig]);

    // Auto-start on first load
    useEffect(() => {
        if (sourceText && apiConfig && history.length === 0 && !loading) {
            setOutput('');
            startExplain(sourceText);
        }
        // eslint-disable-next-line
    }, [sourceText, apiConfig]);

    const sendFollowUp = () => {
        const q = input.trim();
        if (!q || loading) return;
        setInput('');
        setOutput((prev) => prev + `\n\n[你] ${q}\n\n`);

        try { abortRef.current?.abort(); } catch {}
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);

        // Correct message order: system → full prior history → new user question
        const msgs = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history,
            { role: 'user', content: q },
        ];

        streamChat(
            msgs,
            apiConfig,
            (delta) => { setOutput((prev) => prev + delta); },
            (full) => {
                setHistory((h) => [...h, { role: 'user', content: q }, { role: 'assistant', content: full }]);
                setLoading(false);
            },
            (err) => { setOutput((prev) => prev + '\n' + err); setLoading(false); },
            ctrl.signal,
            { refreshConfig: refreshApiConfig }
        );
    };

    // Auto-scroll
    useEffect(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }, [output]);

    const s = {
        root: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: APP_FONT_FAMILY_VAR, fontSize: '13px', background: '#fff', color: '#0f172a' },
        sourceBox: { padding: '8px 14px', background: '#fff', borderBottom: '1px solid rgba(226, 232, 240, 0.72)', fontSize: '12px', color: '#64748b', maxHeight: '58px', overflow: 'hidden', flexShrink: 0, lineHeight: 1.5 },
        outputArea: { flex: 1, overflow: 'auto', padding: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', background: '#fff' },
        footer: { display: 'flex', gap: '8px', padding: '10px 12px', background: '#fff', borderTop: '1px solid rgba(226, 232, 240, 0.72)', flexShrink: 0 },
        input: { flex: 1, padding: '0 12px', height: '38px', border: '1px solid rgba(203, 213, 225, 0.92)', borderRadius: '10px', fontSize: '12px', outline: 'none', color: '#0f172a', background: '#fff' },
        btn: (p) => ({ minWidth: '68px', height: '38px', padding: '0 14px', borderRadius: '10px', border: p ? '1px solid rgba(15, 23, 42, 0.84)' : '1px solid rgba(226, 232, 240, 0.92)', background: p ? '#0f172a' : '#fff', color: p ? '#fff' : '#475569', fontSize: '12px', fontWeight: 600 }),
    };

    return (
        <div style={s.root}>
            <>
            <WindowHeader
                center={<WindowHeaderTitle>{t('history.ai_explain')}</WindowHeaderTitle>}
                right={
                    <>
                        {loading ? (
                            <WindowHeaderButton
                                onClick={() => {
                                    abortRef.current?.abort();
                                    setLoading(false);
                                }}
                            >
                                {t('history.stop')}
                            </WindowHeaderButton>
                        ) : (
                            <WindowHeaderButton
                                variant='primary'
                                onClick={() => {
                                    setOutput('');
                                    setHistory([]);
                                    void startExplain(sourceText);
                                }}
                            >
                                {'\u91cd\u65b0\u89e3\u6790'}
                            </WindowHeaderButton>
                        )}
                        <WindowHeaderCloseButton />
                    </>
                }
            />
            {false && <div style={s.header}>
                {/* 拖动区域 */}
                <div style={s.dragRegion} data-tauri-drag-region='true' />
                
                <span style={{ fontWeight: 700, fontSize: '14px', position: 'relative', zIndex: 1 }}>❓ 解释</span>
                <div style={{ display: 'flex', gap: '6px', position: 'relative', zIndex: 1 }}>
                    {loading
                        ? <button style={s.btn(false)} onClick={() => { abortRef.current?.abort(); setLoading(false); }}>⏹ 停止</button>
                        : <button style={s.btn(true)} onClick={() => { setOutput(''); setHistory([]); startExplain(sourceText); }}>▶ 重新解释</button>
                    }
                    <button style={s.btn(false)} onClick={() => appWindow.close()}>✕</button>
                </div>
            </div>}
            </>
            <div style={s.sourceBox}>
                <span style={{ fontWeight: 600, color: '#999', marginRight: 6 }}>解释对象：</span>
                {sourceText || <span style={{ color: '#bbb' }}>（等待选中文本…）</span>}
            </div>
            <div ref={outputRef} style={s.outputArea}>
                {output || (loading ? <span style={{ color: '#aaa' }}>▋ 解释中…</span> : <span style={{ color: '#ccc' }}>解释结果将显示在这里</span>)}
            </div>
            <div style={s.footer}>
                <input
                    style={s.input}
                    placeholder="追问（Enter 发送）"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp(); } }}
                />
                <button style={s.btn(true)} onClick={sendFollowUp} disabled={loading || !input.trim()}>发送</button>
                <button style={s.btn(false)} onClick={() => invoke('write_clipboard', { text: output }).catch(() => {})} disabled={!output}>复制</button>
            </div>
        </div>
    );
}
