import { appWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/shell';
import { listen } from '@tauri-apps/api/event';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { formatText } from '../../utils/formatter';
import { detectType, calculateExpr } from '../../utils/textAnalyzer';
import { store } from '../../utils/store';

const DEFAULT_HIDE_MS = 6000;

// 基础按鈕（用户可配置开关）
const BASE_BUTTONS = [
    { id: 'translate', cfgKey: 'toolbar_btn_translate', label: '翻译', emoji: '🌐' },
    { id: 'explain',   cfgKey: 'toolbar_btn_explain',   label: '解析', emoji: '❓' },
    { id: 'format',    cfgKey: 'toolbar_btn_format',    label: '格式化', emoji: '✨' },
    { id: 'lightai',   cfgKey: 'toolbar_btn_lightai',   label: '轻AI', emoji: '⚡' },
];

// 智能按鈕映射表（根据文字类型自动添加）
const SMART_BUTTON_MAP = {
    url:      { id: 'open_url',   label: '打开链接', emoji: '🔗' },
    email:    { id: 'send_email', label: '发邀件', emoji: '📧' },
    filepath: { id: 'open_path',  label: '打开路径', emoji: '📂' },
    number:   { id: 'calculate',  label: '计算', emoji: '🔢' },
    color:    { id: 'show_color', label: '颜色', emoji: '🎨' },
};

export default function FloatToolbar() {
    const timerRef = useRef(null);
    const [autoHideMs, setAutoHideMs] = useState(DEFAULT_HIDE_MS);
    const [baseVisible, setBaseVisible] = useState(BASE_BUTTONS);
    const [smartBtns, setSmartBtns] = useState([]);
    const [calcResult, setCalcResult] = useState(null);
    const [colorVal, setColorVal] = useState(null);
    const selectedText = useRef('');

    // ─── 自适应窗口尺寸 ───────────────────────────────────────────
    const BTN_W = 58;   // each button width (px logical)
    const PAD   = 18;   // left+right padding
    const ROW_H = 50;   // buttons row height
    const EXTRA_H = 30; // extra panel (calc/color) height

    const resizeWindow = useCallback((btns, hasExtra) => {
        const w = Math.max(120, PAD + btns.length * BTN_W);
        const h = ROW_H + (hasExtra ? EXTRA_H : 0);
        appWindow.setSize(new LogicalSize(w, h)).catch(() => {});
    }, []);

    // 加载配置 + 分析选中文字
    const loadConfig = useCallback(async () => {
        try {
            await store.load();
            const ms = await store.get('text_select_auto_hide_ms');
            if (ms != null) setAutoHideMs(Number(ms));

            const visible = [];
            for (const btn of BASE_BUTTONS) {
                const v = await store.get(btn.cfgKey);
                if (v !== false) visible.push(btn);
            }
            setBaseVisible(visible.length > 0 ? visible : BASE_BUTTONS);
        } catch {}

        // 读取选中文字并检测类型
        try {
            const text = await invoke('get_text');
            selectedText.current = text || '';
            const type = detectType(text);
            const smart = SMART_BUTTON_MAP[type];
            setSmartBtns(smart ? [smart] : []);
        } catch {}
    }, []);

    // Resize whenever buttons or extra panels change
    useEffect(() => {
        resizeWindow([...smartBtns, ...baseVisible], calcResult != null || colorVal != null);
    }, [smartBtns, baseVisible, calcResult, colorVal, resizeWindow]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const hide = useCallback(() => {
        setCalcResult(null);
        setColorVal(null);
        appWindow.hide().catch(() => {});
    }, []);

    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(hide, autoHideMs);
    }, [hide, autoHideMs]);

    useEffect(() => {
        resetTimer();
        const onKey = (e) => { if (e.key === 'Escape') hide(); };
        window.addEventListener('keydown', onKey);
        let blurTimer = null;
        const unlistenBlur = listen('tauri://blur', () => { blurTimer = setTimeout(hide, 150); });
        const unlistenFocus = listen('tauri://focus', () => { if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; } });
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (blurTimer) clearTimeout(blurTimer);
            window.removeEventListener('keydown', onKey);
            unlistenBlur.then((f) => f());
            unlistenFocus.then((f) => f());
        };
    }, [hide, resetTimer]);

    const handleClick = async (id) => {
        const text = selectedText.current || '';
        resetTimer(); // keep toolbar open for smart actions that show inline result

        // 智能动作 - 不关闭工具栏
        if (id === 'open_url') {
            const url = text.startsWith('http') ? text : 'https://' + text;
            open(url).catch(() => {});
            hide();
            return;
        }
        if (id === 'send_email') {
            open('mailto:' + text.trim()).catch(() => {});
            hide();
            return;
        }
        if (id === 'open_path') {
            // Try to open with explorer
            open(text.trim()).catch(() =>
                open('explorer /select,"' + text.trim() + '"').catch(() => {})
            );
            hide();
            return;
        }
        if (id === 'calculate') {
            const result = calculateExpr(text);
            setCalcResult(result ?? '无法计算');
            if (result != null) invoke('write_clipboard', { text: result }).catch(() => {});
            return;
        }
        if (id === 'show_color') {
            setColorVal(text.trim());
            return;
        }
        if (id === 'copy_calc') {
            invoke('write_clipboard', { text: calcResult }).catch(() => {});
            hide();
            return;
        }

        // 基础动作 - 关闭工具栏
        hide();
        await new Promise((r) => setTimeout(r, 80));

        if (id === 'translate') {
            invoke('open_translate_from_toolbar').catch(() => {});
        } else if (id === 'explain') {
            invoke('open_explain_window').catch(() => {});
        } else if (id === 'lightai') {
            invoke('open_light_ai_window').catch(() => {});
        } else if (id === 'format') {
            try {
                const formatted = formatText(text);
                if (formatted) await invoke('paste_result', { text: formatted });
            } catch (e) { console.error('Format error:', e); }
        }
    };

    const allButtons = [...smartBtns, ...baseVisible];

    const btnStyle = {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minWidth: '52px', height: '40px',
        border: 'none', borderRadius: '7px', background: 'transparent',
        cursor: 'pointer', fontSize: '11px', color: '#333',
        gap: '1px', transition: 'background 0.12s', padding: '0 4px',
    };

    return (
        <div
            style={{
                display: 'flex', flexDirection: 'column',
                background: 'rgba(255,255,255,0.97)',
                borderRadius: '10px',
                boxShadow: '0 2px 14px rgba(0,0,0,0.20)',
                backdropFilter: 'blur(8px)',
                userSelect: 'none',
                overflow: 'hidden',
            }}
            onMouseEnter={resetTimer}
            onMouseMove={resetTimer}
        >
            {/* 按鈕行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 8px' }}>
                {allButtons.map((btn) => (
                    <button key={btn.id} title={btn.label}
                        onClick={() => handleClick(btn.id)}
                        style={btnStyle}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>{btn.emoji}</span>
                        <span style={{ fontSize: '10px', lineHeight: 1, color: '#555' }}>{btn.label}</span>
                    </button>
                ))}
            </div>

            {/* 计算结果内联显示 */}
            {calcResult != null && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 12px', borderTop: '1px solid #eee',
                    background: '#f7f7f7',
                }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#333', fontFamily: 'monospace' }}>
                        = {calcResult}
                    </span>
                    <button onClick={() => handleClick('copy_calc')}
                        style={{ ...btnStyle, minWidth: 'auto', height: '24px', fontSize: '11px',
                            padding: '2px 8px', background: '#4a7cfa', color: '#fff', borderRadius: '4px' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#3a6ae0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#4a7cfa')}
                    >
                        复制
                    </button>
                </div>
            )}

            {/* 颜色预览内联显示 */}
            {colorVal != null && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '4px 12px', borderTop: '1px solid #eee',
                    background: '#f7f7f7',
                }}>
                    <div style={{
                        width: '20px', height: '20px', borderRadius: '4px',
                        background: colorVal, border: '1px solid rgba(0,0,0,0.15)',
                        flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#333' }}>{colorVal}</span>
                    <button onClick={() => { invoke('write_clipboard', { text: colorVal }); hide(); }}
                        style={{ ...btnStyle, minWidth: 'auto', height: '24px', fontSize: '11px',
                            padding: '2px 8px', background: '#4a7cfa', color: '#fff', borderRadius: '4px' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#3a6ae0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#4a7cfa')}
                    >
                        复制
                    </button>
                </div>
            )}
        </div>
    );
}
