import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HiDotsHorizontal, HiOutlineChatAlt2 } from 'react-icons/hi';

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
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { saveHistory } from '../../utils/aiHistory';
import { getActiveAiApiConfig } from '../../utils/aiConfig';

async function streamChat(messages, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;
    if (!apiUrl || !apiKey) {
        onError('请先在 AI 设置中配置 API URL 和 API Key。');
        return;
    }

    let url = apiUrl;
    if (!/https?:\/\/.+/.test(url)) {
        url = `https://${url}`;
    }

    try {
        const response = await window.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: Number(temperature),
                stream: true,
            }),
            signal,
        });

        if (!response.ok) {
            onError(`[错误] HTTP ${response.status}: ${await response.text()}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let full = '';
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const text = line.trim();
                    if (!text || !text.startsWith('data:')) continue;

                    const payload = text.slice(5).trim();
                    if (payload === '[DONE]') continue;

                    try {
                        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
                        if (delta) {
                            full += delta;
                            onChunk(delta);
                        }
                    } catch {}
                }
            }
        } finally {
            reader.releaseLock();
        }

        onComplete(full);
    } catch (error) {
        onError(error.name === 'AbortError' ? null : `[错误] ${error.message}`);
    }
}

const SYSTEM_PROMPT = '你是一个有帮助的 AI 助手。请根据用户的问题提供准确、有用的回答。';

const styles = {
    messageList: {
        flex: 1,
        overflow: 'auto',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontFamily: APP_FONT_FAMILY_VAR,
    },
    bubble: (isUser) => ({
        maxWidth: '78%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        padding: '10px 13px',
        borderRadius: isUser ? '14px 14px 6px 14px' : '14px 14px 14px 6px',
        border: isUser ? '1px solid rgba(15, 23, 42, 0.84)' : '1px solid rgba(226, 232, 240, 0.9)',
        background: isUser ? '#0f172a' : 'rgba(248, 250, 252, 0.94)',
        color: isUser ? '#ffffff' : '#0f172a',
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: '0 10px 24px -22px rgba(15, 23, 42, 0.35)',
    }),
    roleTag: (isUser) => ({
        fontSize: '11px',
        color: '#94a3b8',
        marginBottom: '4px',
        textAlign: isUser ? 'right' : 'left',
    }),
    empty: {
        marginTop: '72px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '13px',
        lineHeight: 1.8,
    },
    footer: {
        display: 'flex',
        gap: '8px',
        padding: '10px 12px',
        borderTop: '1px solid rgba(226, 232, 240, 0.8)',
        background: 'rgba(248, 250, 252, 0.72)',
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        minHeight: '40px',
        maxHeight: '132px',
        resize: 'none',
        outline: 'none',
        border: '1px solid rgba(203, 213, 225, 0.9)',
        borderRadius: '10px',
        background: 'rgba(255, 255, 255, 0.88)',
        padding: '9px 12px',
        fontFamily: APP_FONT_FAMILY_VAR,
        fontSize: '14px',
        lineHeight: 1.5,
        color: '#0f172a',
    },
    footerMenuWrap: {
        position: 'relative',
        alignSelf: 'flex-end',
        flexShrink: 0,
    },
    footerIconButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: 'rgba(255, 255, 255, 0.84)',
        color: '#475569',
        cursor: 'pointer',
    },
    footerMenu: {
        position: 'absolute',
        right: 0,
        bottom: 'calc(100% + 8px)',
        minWidth: '116px',
        padding: '6px',
        borderRadius: '12px',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: 'rgba(255, 255, 255, 0.98)',
        boxShadow: '0 16px 36px -24px rgba(15, 23, 42, 0.35)',
        zIndex: 5,
    },
    footerMenuItem: (danger = false, disabled = false) => ({
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '34px',
        padding: '0 10px',
        border: 'none',
        borderRadius: '8px',
        background: 'transparent',
        color: danger ? '#dc2626' : '#334155',
        fontSize: '12px',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
    }),
    footerButton: (primary) => ({
        alignSelf: 'flex-end',
        height: '40px',
        minWidth: primary ? '84px' : '72px',
        padding: '0 16px',
        border: primary ? '1px solid rgba(15, 23, 42, 0.84)' : '1px solid rgba(226, 232, 240, 0.9)',
        borderRadius: '10px',
        background: primary ? '#0f172a' : 'rgba(255, 255, 255, 0.84)',
        color: primary ? '#ffffff' : '#475569',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
    }),
    codeInline: {
        background: 'rgba(226, 232, 240, 0.7)',
        padding: '1px 5px',
        borderRadius: '4px',
        fontSize: '12px',
    },
    codeBlock: {
        background: 'rgba(241, 245, 249, 0.92)',
        padding: '8px 10px',
        borderRadius: '8px',
        overflow: 'auto',
        fontSize: '12px',
    },
};

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [apiConfig, setApiConfig] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const abortRef = useRef(null);
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);
    const messageIdRef = useRef(0);
    const menuRef = useRef(null);
    const menuButtonRef = useRef(null);

    useEffect(() => {
        let mounted = true;

        async function loadConfig() {
            const nextConfig = await getActiveAiApiConfig();
            if (mounted) {
                setApiConfig(nextConfig);
            }
        }

        void loadConfig();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

    const stop = useCallback(() => {
        try {
            abortRef.current?.abort();
        } catch {}
        setLoading(false);
    }, []);

    const clearMessages = useCallback(() => {
        if (loading) return;
        setMessages([]);
        setMenuOpen(false);
    }, [loading]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || loading || !apiConfig) return;

        setMenuOpen(false);
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = '40px';
        }

        const userMessage = {
            role: 'user',
            content: text,
            id: messageIdRef.current++,
        };
        const assistantId = messageIdRef.current++;

        setMessages((prev) => [
            ...prev,
            userMessage,
            { role: 'assistant', content: '', id: assistantId, pending: true },
        ]);
        setLoading(true);

        const history = [...messages, userMessage].map(({ role, content }) => ({ role, content }));
        const apiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
        const controller = new AbortController();
        abortRef.current = controller;

        await streamChat(
            apiMessages,
            apiConfig,
            (chunk) => {
                setMessages((prev) =>
                    prev.map((item) =>
                        item.id === assistantId ? { ...item, content: item.content + chunk, pending: true } : item
                    )
                );
            },
            (full) => {
                setMessages((prev) =>
                    prev.map((item) => (item.id === assistantId ? { ...item, pending: false } : item))
                );
                setLoading(false);
                try {
                    saveHistory('chat', text, full);
                } catch {}
            },
            (error) => {
                if (error) {
                    setMessages((prev) =>
                        prev.map((item) =>
                            item.id === assistantId ? { ...item, content: error, pending: false, error: true } : item
                        )
                    );
                }
                setLoading(false);
            },
            controller.signal
        );
    }, [apiConfig, input, loading, messages]);

    return (
        <TrayWindow>
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                center={
                    <WindowHeaderTitle
                        icon={<HiOutlineChatAlt2 className='text-[15px] text-default-500' />}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        AI 对话
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton />}
            />

            <TrayWindowBody>
                <TrayWindowSurface>
                    <div style={styles.messageList}>
                        {messages.length === 0 ? (
                            <div style={styles.empty}>
                                开始和 AI 对话吧
                                <br />
                                <span style={{ fontSize: '11px' }}>
                                    {!apiConfig?.apiKey ? '请先在 AI 设置中配置 API Key' : ''}
                                </span>
                            </div>
                        ) : null}

                        {messages.map((message) => (
                            <div
                                key={message.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                                }}
                            >
                                <div style={styles.roleTag(message.role === 'user')}>
                                    {message.role === 'user' ? '你' : 'AI'}
                                </div>
                                <div
                                    style={{
                                        ...styles.bubble(message.role === 'user'),
                                        color: message.error ? '#dc2626' : undefined,
                                    }}
                                >
                                    {message.role === 'user' ? (
                                        message.content || ''
                                    ) : message.content ? (
                                        <div style={{ lineHeight: 1.65 }}>
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: ({ children }) => (
                                                        <p style={{ margin: '0 0 6px 0' }}>{children}</p>
                                                    ),
                                                    code: ({ inline, children }) =>
                                                        inline ? (
                                                            <code style={styles.codeInline}>{children}</code>
                                                        ) : (
                                                            <pre style={styles.codeBlock}>
                                                                <code>{children}</code>
                                                            </pre>
                                                        ),
                                                }}
                                            >
                                                {message.content}
                                            </ReactMarkdown>
                                        </div>
                                    ) : message.pending ? (
                                        <span style={{ color: '#94a3b8' }}>正在生成...</span>
                                    ) : (
                                        ''
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>

                    <div style={styles.footer}>
                        <textarea
                            ref={textareaRef}
                            style={styles.input}
                            placeholder='输入消息，Enter 发送，Shift+Enter 换行'
                            value={input}
                            rows={1}
                            onChange={(event) => {
                                setInput(event.target.value);
                                event.target.style.height = '40px';
                                event.target.style.height = `${Math.min(event.target.scrollHeight, 132)}px`;
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void send();
                                }
                            }}
                        />
                        <div style={styles.footerMenuWrap}>
                            {menuOpen ? (
                                <div ref={menuRef} style={styles.footerMenu}>
                                    <button
                                        type='button'
                                        style={styles.footerMenuItem(true, loading || messages.length === 0)}
                                        onClick={clearMessages}
                                        disabled={loading || messages.length === 0}
                                    >
                                        清空对话
                                    </button>
                                </div>
                            ) : null}
                            <button
                                ref={menuButtonRef}
                                type='button'
                                title='更多'
                                style={styles.footerIconButton}
                                onClick={() => setMenuOpen((prev) => !prev)}
                            >
                                <HiDotsHorizontal className='text-[18px]' />
                            </button>
                        </div>
                        {loading ? (
                            <button
                                type='button'
                                style={styles.footerButton(false)}
                                onClick={stop}
                            >
                                停止
                            </button>
                        ) : (
                            <button
                                type='button'
                                style={{
                                    ...styles.footerButton(true),
                                    ...TRAY_WINDOW_PRIMARY_BUTTON_STYLE,
                                }}
                                onClick={() => {
                                    void send();
                                }}
                                disabled={!input.trim() || !apiConfig}
                            >
                                发送
                            </button>
                        )}
                    </div>
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
