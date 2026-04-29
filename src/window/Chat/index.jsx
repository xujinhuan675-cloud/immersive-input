import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { HiOutlineDocumentSearch, HiOutlineVolumeUp } from 'react-icons/hi';
import { MdDeleteOutline, MdOutlineNoteAdd } from 'react-icons/md';
import remarkGfm from 'remark-gfm';

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
import { useConfig, useReadAloud, useStopVoiceOnUnmount, useToastStyle } from '../../hooks';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { getActiveAiApiConfig, getAiHistoryServiceMeta } from '../../utils/aiConfig';
import { saveHistory } from '../../utils/aiHistory';

const DEFAULT_TEXTAREA_HEIGHT = 40;
const MAX_TEXTAREA_HEIGHT = 132;
const SYSTEM_PROMPT =
    '\u4F60\u662F\u4E00\u4F4D\u77E5\u8BC6\u6E0A\u535A\u3001\u8868\u8FBE\u6E05\u6670\u7684\u89E3\u6790\u52A9\u624B\u3002\u8BF7\u56F4\u7ED5\u7528\u6237\u63D0\u4F9B\u7684\u6587\u672C\u6216\u95EE\u9898\uFF0C\u89E3\u91CA\u6838\u5FC3\u542B\u4E49\u3001\u5173\u952E\u6982\u5FF5\u3001\u4E0A\u4E0B\u6587\u548C\u5B9E\u9645\u7528\u6CD5\u3002\u56DE\u7B54\u8981\u51C6\u786E\u3001\u7B80\u6D01\u3001\u6613\u61C2\u3002';

async function streamChat(messages, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;
    if (!apiUrl || !apiKey) {
        onError('\u8BF7\u5148\u5728 AI \u8BBE\u7F6E\u4E2D\u914D\u7F6E API URL \u548C API Key\u3002');
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
            onError(`[\u9519\u8BEF] HTTP ${response.status}: ${await response.text()}`);
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
        onError(error.name === 'AbortError' ? null : `[\u9519\u8BEF] ${error.message}`);
    }
}

function getMessageSpeechText(content = '') {
    return String(content || '')
        .replace(/```([\s\S]*?)```/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[*_~>#]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function resizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = `${DEFAULT_TEXTAREA_HEIGHT}px`;
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

function appendExplainDraft(previousText, incomingText) {
    const nextText = String(incomingText || '').trim();
    if (!nextText) {
        return String(previousText || '');
    }

    const currentText = String(previousText || '').trimEnd();
    return currentText ? `${currentText}\n\n${nextText}` : nextText;
}

function normalizeMarkdownForDisplay(content = '') {
    const normalized = String(content || '').replace(/\r\n?/g, '\n');
    const segments = normalized.split(/(```[\s\S]*?```)/g);

    return segments
        .map((segment) => {
            if (segment.startsWith('```')) {
                return segment;
            }

            return segment
                .replace(/\n{3,}/g, '\n\n')
                .replace(/\n{2,}((?:[-*+]|\d+\.)\s)/g, '\n$1')
                .replace(/(^|\n)(#{1,6}[^\n]+)\n{2,}/g, '$1$2\n')
                .trim();
        })
        .join('\n\n')
        .trim();
}

function compactMarkdownChildren(children, paragraphStyle = { margin: 0 }) {
    return React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) {
            return child;
        }

        if (child.type === 'p') {
            return React.cloneElement(child, {
                style: {
                    ...(child.props.style || {}),
                    ...paragraphStyle,
                },
            });
        }

        return child;
    });
}

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
        border: isUser
            ? '1px solid rgba(191, 219, 254, 0.95)'
            : '1px solid rgba(226, 232, 240, 0.9)',
        background: isUser ? 'rgba(239, 246, 255, 0.96)' : 'rgba(248, 250, 252, 0.96)',
        color: '#0f172a',
        lineHeight: 1.65,
        whiteSpace: isUser ? 'pre-wrap' : 'normal',
        wordBreak: 'break-word',
        boxShadow: '0 10px 24px -22px rgba(15, 23, 42, 0.2)',
    }),
    bubbleRow: (isUser) => ({
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: '6px',
    }),
    bubbleActionButton: (disabled) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '8px',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: 'rgba(255, 255, 255, 0.9)',
        color: '#64748b',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.42 : 1,
        flexShrink: 0,
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
        minHeight: `${DEFAULT_TEXTAREA_HEIGHT}px`,
        maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
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
    footerTools: {
        display: 'flex',
        gap: '8px',
        alignSelf: 'flex-end',
        flexShrink: 0,
    },
    footerMenuWrap: {
        position: 'relative',
        alignSelf: 'flex-end',
        flexShrink: 0,
    },
    footerIconButton: (active = false) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        border: active
            ? '1px solid rgba(96, 165, 250, 0.45)'
            : '1px solid rgba(226, 232, 240, 0.9)',
        background: active ? 'rgba(219, 234, 254, 0.92)' : 'rgba(255, 255, 255, 0.84)',
        color: active ? '#2563eb' : '#475569',
        cursor: 'pointer',
    }),
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
        opacity: primary ? 1 : 1,
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
    markdownParagraph: {
        margin: '0 0 4px 0',
    },
    markdownHeading: {
        margin: '8px 0 4px 0',
        fontSize: '14px',
        fontWeight: 700,
        lineHeight: 1.45,
        color: '#0f172a',
    },
    markdownList: (ordered = false) => ({
        margin: '0 0 6px 0',
        paddingLeft: '18px',
        listStyleType: ordered ? 'decimal' : 'disc',
    }),
    markdownListItem: {
        margin: '0 0 2px 0',
    },
    markdownBlockquote: {
        margin: '4px 0 8px 0',
        padding: '4px 0 4px 12px',
        borderLeft: '3px solid rgba(191, 219, 254, 1)',
        color: '#1e293b',
        background: 'rgba(248, 250, 252, 0.72)',
        borderRadius: '0 10px 10px 0',
    },
    markdownHr: {
        margin: '8px 0',
        border: 'none',
        borderTop: '1px solid rgba(226, 232, 240, 0.9)',
    },
    markdownStrong: {
        fontWeight: 700,
        color: '#0f172a',
    },
};

export default function Chat() {
    useStopVoiceOnUnmount();
    const toastStyle = useToastStyle();
    const readAloud = useReadAloud();
    const [excerptExplainDefault] = useConfig('incremental_explain', false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [apiConfig, setApiConfig] = useState(null);
    const [pined, setPined] = useState(false);
    const [excerptMode, setExcerptMode] = useState(false);
    const abortRef = useRef(null);
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);
    const messageIdRef = useRef(0);
    const messagesRef = useRef([]);
    const hasHydratedExcerptMode = useRef(false);
    const hasContentToClear = messages.length > 0 || input.trim().length > 0;

    useEffect(() => {
        messagesRef.current = messages;
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        resizeTextarea(textareaRef.current);
    }, [input]);

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
        if (excerptExplainDefault === null || hasHydratedExcerptMode.current) {
            return;
        }

        setExcerptMode(Boolean(excerptExplainDefault));
        hasHydratedExcerptMode.current = true;
    }, [excerptExplainDefault]);

    useEffect(() => {
        invoke('set_explain_excerpt_mode', { enabled: excerptMode }).catch(() => {});
    }, [excerptMode]);

    useEffect(() => {
        return () => {
            invoke('set_explain_excerpt_mode', { enabled: false }).catch(() => {});
        };
    }, []);

    const stop = useCallback(() => {
        try {
            abortRef.current?.abort();
        } catch {}
        abortRef.current = null;
        setLoading(false);
    }, []);

    const clearMessages = useCallback(() => {
        if (loading) return;
        setMessages([]);
        messagesRef.current = [];
        setInput('');
        resizeTextarea(textareaRef.current);
    }, [loading]);

    const handleSpeakMessage = useCallback(
        async (message) => {
            const text = getMessageSpeechText(message?.content);
            if (!text) return;

            await readAloud(text);
        },
        [readAloud]
    );

    const appendDraftText = useCallback((rawText) => {
        const text = String(rawText || '').trim();
        if (!text) return;

        setInput((previousText) => appendExplainDraft(previousText, text));

        window.requestAnimationFrame(() => {
            resizeTextarea(textareaRef.current);
            textareaRef.current?.focus();
        });
    }, []);

    const sendText = useCallback(
        async (rawText) => {
            const text = String(rawText || '').trim();
            if (!text || loading || !apiConfig) return;

            setInput('');
            resizeTextarea(textareaRef.current);

            const userMessage = {
                role: 'user',
                content: text,
                id: messageIdRef.current++,
            };
            const assistantId = messageIdRef.current++;
            const pendingAssistantMessage = {
                role: 'assistant',
                content: '',
                id: assistantId,
                pending: true,
            };

            const history = [...messagesRef.current, userMessage].map(({ role, content }) => ({
                role,
                content,
            }));
            const apiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
            const controller = new AbortController();
            abortRef.current = controller;

            setMessages((previousMessages) => {
                const nextMessages = [...previousMessages, userMessage, pendingAssistantMessage];
                messagesRef.current = nextMessages;
                return nextMessages;
            });
            setLoading(true);

            await streamChat(
                apiMessages,
                apiConfig,
                (chunk) => {
                    setMessages((previousMessages) => {
                        const nextMessages = previousMessages.map((item) =>
                            item.id === assistantId
                                ? { ...item, content: item.content + chunk, pending: true }
                                : item
                        );
                        messagesRef.current = nextMessages;
                        return nextMessages;
                    });
                },
                (full) => {
                    setMessages((previousMessages) => {
                        const nextMessages = previousMessages.map((item) =>
                            item.id === assistantId ? { ...item, pending: false } : item
                        );
                        messagesRef.current = nextMessages;
                        return nextMessages;
                    });
                    abortRef.current = null;
                    setLoading(false);
                    try {
                        saveHistory('explain', text, full, getAiHistoryServiceMeta(apiConfig));
                    } catch {}
                },
                (error) => {
                    setMessages((previousMessages) => {
                        const nextMessages = error
                            ? previousMessages.map((item) =>
                                  item.id === assistantId
                                      ? {
                                            ...item,
                                            content: error,
                                            pending: false,
                                            error: true,
                                        }
                                      : item
                              )
                            : previousMessages
                                  .map((item) =>
                                      item.id === assistantId ? { ...item, pending: false } : item
                                  )
                                  .filter((item) => !(item.id === assistantId && !item.content));
                        messagesRef.current = nextMessages;
                        return nextMessages;
                    });
                    abortRef.current = null;
                    setLoading(false);
                },
                controller.signal
            );
        },
        [apiConfig, loading]
    );

    const send = useCallback(async () => {
        await sendText(input);
    }, [input, sendText]);

    const togglePin = useCallback(async () => {
        const nextPinned = !pined;
        await appWindow.setAlwaysOnTop(nextPinned).catch(() => {});
        setPined(nextPinned);
    }, [pined]);

    useEffect(() => {
        if (!apiConfig) {
            return undefined;
        }

        let disposed = false;

        async function hydratePendingContent() {
            const pendingDraftText = await invoke('take_pending_chat_draft_text').catch(() => '');
            if (!disposed && pendingDraftText.trim()) {
                appendDraftText(pendingDraftText);
            }

            const pendingText = await invoke('take_pending_chat_http_text').catch(() => '');
            if (disposed || !pendingText.trim()) {
                return;
            }

            await sendText(pendingText);
        }

        void hydratePendingContent();

        const draftUnlisten = listen('chat_draft_text', (event) => {
            appendDraftText(String(event.payload || ''));
        });

        const sendUnlisten = listen('http_chat_text', (event) => {
            const payload = String(event.payload || '');
            if (!payload.trim()) {
                return;
            }

            setInput(payload);
            void sendText(payload);
        });

        return () => {
            disposed = true;
            void draftUnlisten.then((off) => off());
            void sendUnlisten.then((off) => off());
        };
    }, [apiConfig, appendDraftText, sendText]);

    return (
        <TrayWindow>
            <Toaster />
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                center={
                    <WindowHeaderTitle
                        icon={<HiOutlineDocumentSearch className='text-[15px] text-default-500' />}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {'\u89E3\u6790'}
                    </WindowHeaderTitle>
                }
                right={
                    <div className='flex items-center gap-1.5'>
                        <WindowHeaderPinButton active={pined} onClick={() => void togglePin()} />
                        <WindowHeaderCloseButton />
                    </div>
                }
            />

            <TrayWindowBody>
                <TrayWindowSurface>
                    <div style={styles.messageList}>
                        {messages.length === 0 ? (
                            <div style={styles.empty}>
                                {'\u53D1\u9001\u6587\u672C\u5F00\u59CB\u89E3\u6790'}
                                <br />
                                <span style={{ fontSize: '11px' }}>
                                    {!apiConfig?.apiKey
                                        ? '\u8BF7\u5148\u5728 AI \u8BBE\u7F6E\u4E2D\u914D\u7F6E API Key'
                                        : ''}
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
                                    {message.role === 'user' ? '\u4F60' : 'AI'}
                                </div>
                                <div style={styles.bubbleRow(message.role === 'user')}>
                                    <button
                                        type='button'
                                        title={'\u6717\u8BFB'}
                                        style={styles.bubbleActionButton(!getMessageSpeechText(message.content))}
                                        disabled={!getMessageSpeechText(message.content)}
                                        onClick={() => {
                                            handleSpeakMessage(message).catch((error) => {
                                                toast.error(error?.message || String(error), {
                                                    style: toastStyle,
                                                });
                                            });
                                        }}
                                    >
                                        <HiOutlineVolumeUp className='text-[14px]' />
                                    </button>
                                    <div
                                        style={{
                                            ...styles.bubble(message.role === 'user'),
                                            ...(message.error ? { color: '#dc2626' } : {}),
                                        }}
                                    >
                                        {message.role === 'user' ? (
                                            message.content || ''
                                        ) : message.content ? (
                                            <div style={{ lineHeight: 1.65, whiteSpace: 'normal' }}>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({ children }) => (
                                                            <p style={styles.markdownParagraph}>{children}</p>
                                                        ),
                                                        h1: ({ children }) => (
                                                            <h1 style={styles.markdownHeading}>{children}</h1>
                                                        ),
                                                        h2: ({ children }) => (
                                                            <h2 style={styles.markdownHeading}>{children}</h2>
                                                        ),
                                                        h3: ({ children }) => (
                                                            <h3 style={styles.markdownHeading}>{children}</h3>
                                                        ),
                                                        h4: ({ children }) => (
                                                            <h4 style={styles.markdownHeading}>{children}</h4>
                                                        ),
                                                        h5: ({ children }) => (
                                                            <h5 style={styles.markdownHeading}>{children}</h5>
                                                        ),
                                                        h6: ({ children }) => (
                                                            <h6 style={styles.markdownHeading}>{children}</h6>
                                                        ),
                                                        ul: ({ children }) => (
                                                            <ul style={styles.markdownList(false)}>{children}</ul>
                                                        ),
                                                        ol: ({ children }) => (
                                                            <ol style={styles.markdownList(true)}>{children}</ol>
                                                        ),
                                                        li: ({ children }) => (
                                                            <li style={styles.markdownListItem}>
                                                                {compactMarkdownChildren(children)}
                                                            </li>
                                                        ),
                                                        blockquote: ({ children }) => (
                                                            <blockquote style={styles.markdownBlockquote}>
                                                                {compactMarkdownChildren(children, {
                                                                    margin: '0 0 2px 0',
                                                                })}
                                                            </blockquote>
                                                        ),
                                                        hr: () => <hr style={styles.markdownHr} />,
                                                        strong: ({ children }) => (
                                                            <strong style={styles.markdownStrong}>
                                                                {children}
                                                            </strong>
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
                                                    {normalizeMarkdownForDisplay(message.content)}
                                                </ReactMarkdown>
                                            </div>
                                        ) : message.pending ? (
                                            <span style={{ color: '#94a3b8' }}>
                                                {'\u6B63\u5728\u751F\u6210...'}
                                            </span>
                                        ) : (
                                            ''
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>

                    <div style={styles.footer}>
                        <textarea
                            ref={textareaRef}
                            style={styles.input}
                            placeholder={
                                '\u8F93\u5165\u8981\u89E3\u6790\u7684\u6587\u672C\uFF0CEnter \u53D1\u9001\uFF0CShift+Enter \u6362\u884C'
                            }
                            value={input}
                            rows={1}
                            onChange={(event) => {
                                setInput(event.target.value);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void send();
                                }
                            }}
                        />
                        <div style={styles.footerTools}>
                            <button
                                type='button'
                                title={'\u6458\u5F55\u89E3\u6790'}
                                style={styles.footerIconButton(excerptMode)}
                                onClick={() => {
                                    setExcerptMode((previous) => !previous);
                                }}
                            >
                                <MdOutlineNoteAdd className='text-[18px]' />
                            </button>
                            <button
                                type='button'
                                title={'\u6E05\u7A7A\u89E3\u6790'}
                                style={{
                                    ...styles.footerIconButton(false),
                                    border: '1px solid rgba(254, 202, 202, 0.95)',
                                    background: 'rgba(254, 242, 242, 0.92)',
                                    color: '#dc2626',
                                    opacity: loading || !hasContentToClear ? 0.45 : 1,
                                    cursor: loading || !hasContentToClear ? 'default' : 'pointer',
                                }}
                                onClick={clearMessages}
                                disabled={loading || !hasContentToClear}
                            >
                                <MdDeleteOutline className='text-[18px]' />
                            </button>
                        </div>
                        {loading ? (
                            <button type='button' style={styles.footerButton(false)} onClick={stop}>
                                {'\u505C\u6B62'}
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
                                {'\u53D1\u9001'}
                            </button>
                        )}
                    </div>
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
