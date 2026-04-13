import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { appWindow } from '@tauri-apps/api/window';
import WindowHeader, {
    WindowHeaderButton,
    WindowHeaderCloseButton,
    WindowHeaderTitle,
} from '../../components/WindowHeader';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { store } from '../../utils/store';
import { saveHistory } from '../../utils/aiHistory';

// ─── 流式聊天请求 ────────────────────────────────────────────
async function streamChat(messages, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;
    if (!apiUrl || !apiKey) {
        onError('API URL 或 API Key 未配置，请前往「偏好设置 → AI 功能」填写。');
        return;
    }
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
                    try {
                        const delta = JSON.parse(d)?.choices?.[0]?.delta?.content;
                        if (delta) { full += delta; onChunk(delta); }
                    } catch {}
                }
            }
        } finally { reader.releaseLock(); }
        onComplete(full);
    } catch (e) {
        onError(e.name === 'AbortError' ? null : `[错误] ${e.message}`);
    }
}

// ─── 主组件 ─────────────────────────────────────────────────
const SYSTEM_PROMPT = '你是一个有帮助的 AI 助手。请根据用户的问题提供准确、有用的回答。';

export default function Chat() {
    const [messages, setMessages] = useState([]); // [{role, content, id}]
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [apiConfig, setApiConfig] = useState(null);
    const abortRef = useRef(null);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    let msgId = useRef(0);

    // 加载 API 配置
    useEffect(() => {
        async function load() {
            await store.load();
            const apiUrl = (await store.get('ai_api_url')) || '';
            const apiKey = (await store.get('ai_api_key')) || '';
            const model = (await store.get('ai_model')) || 'gpt-4o-mini';
            const temperature = (await store.get('ai_temperature')) ?? 0.7;
            setApiConfig({ apiUrl, apiKey, model, temperature });
        }
        load();
    }, []);

    // 滚动到底部
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const stop = useCallback(() => {
        try { abortRef.current?.abort(); } catch {}
        setLoading(false);
    }, []);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || loading || !apiConfig) return;
        setInput('');

        const userMsg = { role: 'user', content: text, id: msgId.current++ };
        const assistantId = msgId.current++;
        setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', id: assistantId, pending: true }]);
        setLoading(true);

        const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
        const apiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        await streamChat(
            apiMessages,
            apiConfig,
            (chunk) => {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId ? { ...m, content: m.content + chunk, pending: true } : m
                    )
                );
            },
            (full) => {
                setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m))
                );
                setLoading(false);
                // Save to history
                try { saveHistory('chat', text, full); } catch {}
            },
            (err) => {
                if (err) {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId ? { ...m, content: err, pending: false, error: true } : m
                        )
                    );
                }
                setLoading(false);
            },
            ctrl.signal
        );
    }, [input, loading, apiConfig, messages]);

    const s = {
        root: {
            display: 'flex', flexDirection: 'column', height: '100vh',
            fontFamily: APP_FONT_FAMILY_VAR, fontSize: '14px',
            background: '#f8f8fa', color: '#222',
        },
        header: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e5e5e5', flexShrink: 0,
            position: 'relative',
        },
        dragRegion: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '100%',
            cursor: 'move',
        },
        msgList: { flex: 1, overflow: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '12px' },
        bubble: (isUser) => ({
            maxWidth: '75%', padding: '10px 14px', borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            background: isUser ? '#4a7cfa' : '#fff', color: isUser ? '#fff' : '#222',
            alignSelf: isUser ? 'flex-end' : 'flex-start', lineHeight: 1.65,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '14px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }),
        roleTag: (isUser) => ({
            fontSize: '11px', color: '#aaa', marginBottom: '3px',
            textAlign: isUser ? 'right' : 'left',
        }),
        footer: {
            display: 'flex', gap: '8px', padding: '10px 12px',
            background: '#fff', borderTop: '1px solid #e5e5e5', flexShrink: 0,
        },
        input: {
            flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '14px', outline: 'none', resize: 'none', maxHeight: '120px',
            fontFamily: APP_FONT_FAMILY_VAR, lineHeight: 1.5,
        },
        btn: (primary) => ({
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            background: primary ? '#4a7cfa' : '#f0f0f0', color: primary ? '#fff' : '#555',
            cursor: 'pointer', fontSize: '13px', fontWeight: primary ? 600 : 400,
            alignSelf: 'flex-end',
        }),
    };

    const isEmpty = messages.length === 0;

    return (
        <div style={s.root}>
            <WindowHeader
                center={<WindowHeaderTitle icon='💬'>AI {'\u5bf9\u8bdd'}</WindowHeaderTitle>}
                right={
                    <>
                        <WindowHeaderButton onClick={() => setMessages([])} disabled={loading}>
                            {'\u6e05\u7a7a\u5bf9\u8bdd'}
                        </WindowHeaderButton>
                        <WindowHeaderCloseButton />
                    </>
                }
            />

            <div style={s.msgList}>
                {isEmpty && (
                    <div style={{ textAlign: 'center', color: '#bbb', marginTop: '80px', fontSize: '13px' }}>
                        开始和 AI 对话吧~<br />
                        <span style={{ fontSize: '11px' }}>
                            {!apiConfig?.apiKey ? '⚠️ 请先在「偏好设置 → AI 功能」中配置 API Key' : ''}
                        </span>
                    </div>
                )}
                {messages.map((m) => (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={s.roleTag(m.role === 'user')}>{m.role === 'user' ? '你' : 'AI'}</div>
                        <div style={{ ...s.bubble(m.role === 'user'), color: m.error ? '#cc3333' : undefined }}>
                            {m.role === 'user' ? (
                                m.content || ''
                            ) : m.content ? (
                                <div style={{ lineHeight: 1.65 }}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}
                                        components={{
                                            p: ({children}) => <p style={{ margin: '0 0 6px 0' }}>{children}</p>,
                                            code: ({inline, children}) => inline
                                                ? <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontSize: '12px' }}>{children}</code>
                                                : <pre style={{ background: '#f3f4f6', padding: '8px', borderRadius: 5, overflow: 'auto', fontSize: '12px' }}><code>{children}</code></pre>,
                                        }}>
                                        {m.content}
                                    </ReactMarkdown>
                                </div>
                            ) : m.pending ? <span style={{ color: '#aaa' }}>▷</span> : ''}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            <div style={s.footer}>
                <textarea
                    ref={inputRef}
                    style={s.input}
                    placeholder='输入消息，Enter 发送，Shift+Enter 换行'
                    value={input}
                    rows={1}
                    onChange={(e) => {
                        setInput(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                />
                {loading ? (
                    <button style={s.btn(false)} onClick={stop}>⏹ 停止</button>
                ) : (
                    <button style={s.btn(true)} onClick={send} disabled={!input.trim() || !apiConfig}>发送</button>
                )}
            </div>
        </div>
    );
}
