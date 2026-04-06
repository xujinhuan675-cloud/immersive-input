import { appWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/shell';
import { listen } from '@tauri-apps/api/event';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { formatText } from '../../utils/formatter';
import { detectType, calculateExpr } from '../../utils/textAnalyzer';
import { store } from '../../utils/store';

const DEFAULT_HIDE_MS = 5000;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 按鈕显示配置 ─────────────────────────────────────────────────────────

/** 基础按鈕：用户可通过「划词设置」配置开关和排序 */
const BASE_BUTTONS = [
    { id: 'translate', cfgKey: 'toolbar_btn_translate', label: '翻译',  emoji: '🌐' },
    { id: 'explain',   cfgKey: 'toolbar_btn_explain',   label: '解析',  emoji: '❓' },
    { id: 'format',    cfgKey: 'toolbar_btn_format',    label: '格式化', emoji: '✨' },
    { id: 'lightai',   cfgKey: 'toolbar_btn_lightai',   label: '轻AI',  emoji: '⚡' },
];

/** 智能按鈕：根据选中文字类型自动插入 */
const SMART_BUTTON_MAP = {
    url:      { id: 'open_url',   label: '打开链接', emoji: '🔗' },
    email:    { id: 'send_email', label: '发邮件',   emoji: '📧' },
    filepath: { id: 'open_path',  label: '打开路径', emoji: '📂' },
    number:   { id: 'calculate',  label: '计算',     emoji: '🔢' },
    color:    { id: 'show_color', label: '颜色',     emoji: '🎨' },
};

// ─── 按鈕行为配置（与显示配置完全解耦）──────────────────────────────────
//
// 每个 action 签名： async (text: string, ctx: ActionContext) => void
// ActionContext = { hide, setCalcResult, setColorVal, calcResult, colorVal }
//
// 分类说明：
//   「先 invoke 后 hide」 —— 翻译：必须在工具栏持有前台权限时先发 Rust 命令，
//                        再 hide，否则 WebView2 IPC 与 build() 会死锁。
//   「先 hide 后 invoke」 —— 解析/轾AI/格式化：常规流程。
//   「inline」        —— 计算/颜色：保持工具栏打开，在面板内展示结果。
//   「smart-open」   —— 链接/邮件/路径：调用系统 Shell 后立即 hide。
// ───────────────────────────────────────────────────────────────────

const BUTTON_ACTIONS = {

    // ── 窗口类：先 invoke（非 await），再 delay(80)，再 hide ───────────────
    // 必须先 invoke 后 hide：工具栏仍持有前台权限时触发 Rust 命令，
    // Rust 的 set_focus() 才能成功将焦点转移给新窗口；
    // 同时 invoke 不能 await，否则 WebView2 IPC 与 build() 会产生循环等待。
    translate: async (_text, { hide }) => {
        invoke('open_translate_from_toolbar').catch(() => {});
        await delay(80);
        hide();
    },

    explain: async (_text, { hide }) => {
        invoke('open_explain_window').catch(() => {});
        await delay(80);
        hide();
    },

    lightai: async (_text, { hide }) => {
        invoke('open_light_ai_window').catch(() => {});
        await delay(80);
        hide();
    },

    format: async (text, { hide }) => {
        hide();
        await delay(80);
        try {
            const formatted = formatText(text);
            if (formatted) await invoke('paste_result', { text: formatted });
        } catch (e) { console.error('Format error:', e); }
    },

    // ── 智能动作：处理后 hide ──────────────────────────────────────
    open_url: (text, { hide }) => {
        const url = text.startsWith('http') ? text : 'https://' + text;
        open(url).catch(() => {});
        hide();
    },

    send_email: (text, { hide }) => {
        open('mailto:' + text.trim()).catch(() => {});
        hide();
    },

    open_path: (text, { hide }) => {
        open(text.trim()).catch(() =>
            open('explorer /select,"' + text.trim() + '"').catch(() => {})
        );
        hide();
    },

    // ── 内联结果：保持工具栏打开 ──────────────────────────────────────
    calculate: (text, { setCalcResult }) => {
        const result = calculateExpr(text);
        setCalcResult(result ?? '无法计算');
        if (result != null) invoke('write_clipboard', { text: result }).catch(() => {});
    },

    show_color: (text, { setColorVal }) => {
        setColorVal(text.trim());
    },

    // ── 面板内辅助动作 ────────────────────────────────────────────
    copy_calc: (_text, { calcResult, hide }) => {
        invoke('write_clipboard', { text: calcResult }).catch(() => {});
        hide();
    },

    copy_color: (_text, { colorVal, hide }) => {
        invoke('write_clipboard', { text: colorVal }).catch(() => {});
        hide();
    },
};

// ─── 组件 ─────────────────────────────────────────────────────────────────────

export default function FloatToolbar() {
    const timerRef    = useRef(null);
    const selectedText = useRef('');

    const [autoHideMs,  setAutoHideMs]  = useState(DEFAULT_HIDE_MS);
    const [baseVisible, setBaseVisible] = useState(BASE_BUTTONS);
    const [smartBtns,   setSmartBtns]   = useState([]);
    const [calcResult,  setCalcResult]  = useState(null);
    const [colorVal,    setColorVal]    = useState(null);

    // ── 自适应窗口尺寸 ────────────────────────────────────────────
    const BTN_W   = 58;
    const PAD     = 18;
    const ROW_H   = 50;
    const EXTRA_H = 30;

    const resizeWindow = useCallback((btns, hasExtra) => {
        const w = Math.max(120, PAD + btns.length * BTN_W);
        const h = ROW_H + (hasExtra ? EXTRA_H : 0);
        appWindow.setSize(new LogicalSize(w, h)).catch(() => {});
    }, []);

    // ── 加载配置 + 分析选中文字 ────────────────────────────────────────
    const loadConfig = useCallback(async () => {
        try {
            await store.load();
            const ms = await store.get('text_select_auto_hide_ms');
            if (ms != null) setAutoHideMs(Number(ms));

            const orderRaw = await store.get('toolbar_btn_order');
            const order = Array.isArray(orderRaw)
                ? orderRaw
                : BASE_BUTTONS.map((b) => b.id);
            const ordered = order
                .map((id) => BASE_BUTTONS.find((b) => b.id === id))
                .filter(Boolean);

            const visible = [];
            for (const btn of ordered) {
                const v = await store.get(btn.cfgKey);
                if (v !== false) visible.push(btn);
            }
            setBaseVisible(visible.length > 0 ? visible : BASE_BUTTONS);
        } catch {}

        try {
            const text = await invoke('get_text');
            selectedText.current = text || '';
            const type  = detectType(text);
            const smart = SMART_BUTTON_MAP[type];
            setSmartBtns(smart ? [smart] : []);
        } catch {}
    }, []);

    useEffect(() => {
        resizeWindow([...smartBtns, ...baseVisible], calcResult != null || colorVal != null);
    }, [smartBtns, baseVisible, calcResult, colorVal, resizeWindow]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    // ── 隐藏 & 计时器 ────────────────────────────────────────────
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
        const unlistenBlur  = listen('tauri://blur',  () => { blurTimer = setTimeout(hide, 150); });
        const unlistenFocus = listen('tauri://focus', () => { if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; } });
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (blurTimer) clearTimeout(blurTimer);
            window.removeEventListener('keydown', onKey);
            unlistenBlur.then((f) => f());
            unlistenFocus.then((f) => f());
        };
    }, [hide, resetTimer]);

    // ── 通用点击分发（工具栏本身不关心按鈕具体行为）─────────────
    const handleClick = useCallback(async (id) => {
        resetTimer();
        const action = BUTTON_ACTIONS[id];
        if (!action) return;
        const text = selectedText.current || '';
        const ctx  = { hide, setCalcResult, setColorVal, calcResult, colorVal };
        await action(text, ctx);
    }, [hide, resetTimer, calcResult, colorVal]);

    // ── 渲染 ─────────────────────────────────────────────────────────
    const allButtons = [...smartBtns, ...baseVisible];

    const btnStyle = {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minWidth: '52px', height: '40px',
        border: 'none', borderRadius: '7px', background: 'transparent',
        cursor: 'pointer', fontSize: '11px', color: '#333',
        gap: '1px', transition: 'background 0.12s', padding: '0 4px',
    };

    const copyBtnStyle = {
        ...btnStyle,
        minWidth: 'auto', height: '24px', fontSize: '11px',
        padding: '2px 8px', background: '#4a7cfa', color: '#fff', borderRadius: '4px',
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
                    <button
                        key={btn.id}
                        title={btn.label}
                        style={btnStyle}
                        onClick={() => handleClick(btn.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>{btn.emoji}</span>
                        <span style={{ fontSize: '10px', lineHeight: 1, color: '#555' }}>{btn.label}</span>
                    </button>
                ))}
            </div>

            {/* 计算结果面板 */}
            {calcResult != null && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 12px', borderTop: '1px solid #eee', background: '#f7f7f7',
                }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#333', fontFamily: 'monospace' }}>
                        = {calcResult}
                    </span>
                    <button
                        style={copyBtnStyle}
                        onClick={() => handleClick('copy_calc')}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#3a6ae0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#4a7cfa')}
                    >
                        复制
                    </button>
                </div>
            )}

            {/* 颜色预览面板 */}
            {colorVal != null && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '4px 12px', borderTop: '1px solid #eee', background: '#f7f7f7',
                }}>
                    <div style={{
                        width: '20px', height: '20px', borderRadius: '4px',
                        background: colorVal, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#333' }}>{colorVal}</span>
                    <button
                        style={copyBtnStyle}
                        onClick={() => handleClick('copy_color')}
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
