import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import React, { useEffect, useRef, useCallback } from 'react';
import { formatText } from '../../utils/formatter';

// Auto-hide after 6 seconds of no interaction
const AUTO_HIDE_MS = 6000;

const BUTTONS = [
    { id: 'translate', label: '翻译', emoji: '🌐' },
    { id: 'explain',   label: '解析', emoji: '❓' },
    { id: 'format',    label: '格式化', emoji: '✨' },
    { id: 'lightai',   label: '轻AI',  emoji: '⚡' },
];

export default function FloatToolbar() {
    const timerRef = useRef(null);

    const hide = useCallback(() => {
        appWindow.hide().catch(() => {});
    }, []);

    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(hide, AUTO_HIDE_MS);
    }, [hide]);

    useEffect(() => {
        resetTimer();

        // Close on Escape
        const onKey = (e) => {
            if (e.key === 'Escape') hide();
        };
        window.addEventListener('keydown', onKey);

        // Hide when window loses focus (with small delay to allow button click)
        let blurTimer = null;
        const unlistenBlur = listen('tauri://blur', () => {
            blurTimer = setTimeout(hide, 150);
        });
        const unlistenFocus = listen('tauri://focus', () => {
            if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
        });

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (blurTimer) clearTimeout(blurTimer);
            window.removeEventListener('keydown', onKey);
            unlistenBlur.then((f) => f());
            unlistenFocus.then((f) => f());
        };
    }, [hide, resetTimer]);

    const handleClick = async (id) => {
        hide(); // close toolbar first
        // Small delay to let toolbar close before new window opens
        await new Promise((r) => setTimeout(r, 80));

        if (id === 'translate') {
            invoke('open_translate_from_toolbar').catch(() => {});
        } else if (id === 'explain') {
            invoke('open_explain_window').catch(() => {});
        } else if (id === 'lightai') {
            invoke('open_light_ai_window').catch(() => {});
        } else if (id === 'format') {
            try {
                const text = await invoke('get_text');
                if (text) {
                    const formatted = formatText(text);
                    await invoke('paste_result', { text: formatted });
                }
            } catch (e) {
                console.error('Format error:', e);
            }
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.95)',
                borderRadius: '10px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                backdropFilter: 'blur(8px)',
                userSelect: 'none',
                height: '100vh',
                boxSizing: 'border-box',
            }}
            onMouseEnter={resetTimer}
            onMouseMove={resetTimer}
        >
            {BUTTONS.map((btn) => (
                <button
                    key={btn.id}
                    title={btn.label}
                    onClick={() => handleClick(btn.id)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '56px',
                        height: '40px',
                        border: 'none',
                        borderRadius: '7px',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: '11px',
                        color: '#333',
                        gap: '1px',
                        transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>{btn.emoji}</span>
                    <span style={{ fontSize: '10px', lineHeight: 1, color: '#555' }}>{btn.label}</span>
                </button>
            ))}
        </div>
    );
}
