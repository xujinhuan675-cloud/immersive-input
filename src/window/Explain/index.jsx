import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { store } from '../../utils/store';

const SYSTEM_PROMPT =
    '你是一位知识渊博的助手。请详细解释用户提供的内容，包括：核心含义、背景知识、关键概念、实际用法和延伸拓展。' +
    '用清晰、准确、易懂的语言回答，可使用小标题组织内容。';

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

async function streamChat(messages, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;
    if (!apiUrl || !apiKey) { onError('API URL 或 API Key 未配置，请前往设置页填写。'); return; }

    let url = apiUrl;
    if (!/https?:\/\/.+/.test(url)) url = `https://${url}`;

    try {
        const res = await window.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages, temperature: Number(temperature), stream: true }),
            signal,
        });
        if (!res.ok) { onError(`[错误] HTTP ${res.status}: ${await res.text()}`); return; }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let full = '', buf = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\n'); buf = lines.pop();
                for (const line of lines) {
                    const t = line.trim();
                    if (!t || !t.startsWith('data:')) continue;
                    const d = t.slice(5).trim();
                    if (d === '[DONE]') continue;
                    try { const delta = JSON.parse(d)?.choices?.[0]?.delta?.content; if (delta) { full += delta; onChunk(delta); } } catch {}
                }
            }
        } finally { reader.releaseLock(); }
        onComplete(full);
    } catch (e) {
        onError(e.name === 'AbortError' ? '[已取消]' : `[错误] ${e.message}`);
    }
}

export default function Explain() {
    const apiConfig = useApiConfig();
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
            },
            (err) => { setOutput((prev) => prev + '\n' + err); setLoading(false); },
            ctrl.signal
        );
    }, [apiConfig]);

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
        const prevHistory = [...history, { role: 'user', content: q }];
        startExplain(q, history);
    };

    // Auto-scroll
    useEffect(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }, [output]);

    const s = {
        root: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '-apple-system,"Microsoft YaHei",sans-serif', fontSize: '13px', background: '#fafafa', color: '#333' },
        header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e5e5e5', flexShrink: 0 },
        sourceBox: { padding: '6px 12px', background: '#fff8e1', borderBottom: '1px solid #ffe082', fontSize: '12px', color: '#666', maxHeight: '56px', overflow: 'hidden', flexShrink: 0, lineHeight: 1.5 },
        outputArea: { flex: 1, overflow: 'auto', padding: '12px', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px' },
        footer: { display: 'flex', gap: '6px', padding: '6px 10px', background: '#fff', borderTop: '1px solid #e5e5e5', flexShrink: 0 },
        input: { flex: 1, padding: '5px 9px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', outline: 'none' },
        btn: (p) => ({ padding: '4px 12px', borderRadius: '5px', border: p ? 'none' : '1px solid #ccc', background: p ? '#4a7cfa' : '#fff', color: p ? '#fff' : '#444', cursor: 'pointer', fontSize: '12px' }),
    };

    return (
        <div style={s.root}>
            <div style={s.header}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>❓ 解析</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {loading
                        ? <button style={s.btn(false)} onClick={() => { abortRef.current?.abort(); setLoading(false); }}>⏹ 停止</button>
                        : <button style={s.btn(true)} onClick={() => { setOutput(''); setHistory([]); startExplain(sourceText); }}>▶ 重新解析</button>
                    }
                    <button style={s.btn(false)} onClick={() => appWindow.close()}>✕</button>
                </div>
            </div>
            <div style={s.sourceBox}>
                <span style={{ fontWeight: 600, color: '#999', marginRight: 6 }}>解析对象：</span>
                {sourceText || <span style={{ color: '#bbb' }}>（等待选中文本…）</span>}
            </div>
            <div ref={outputRef} style={s.outputArea}>
                {output || (loading ? <span style={{ color: '#aaa' }}>▋ 解析中…</span> : <span style={{ color: '#ccc' }}>解析结果将显示在这里</span>)}
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
