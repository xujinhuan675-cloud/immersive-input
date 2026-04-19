import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiDownload, FiEdit3, FiGlobe, FiKey, FiLock, FiPlus, FiSearch, FiZap } from 'react-icons/fi';
import WindowHeader, {
    WindowHeaderButton,
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
import { exportTableCsv } from '../../utils/exportTable';
import { getRecords, addRecord, updateRecord, deleteRecord, getAllTags } from './vaultDb';

// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 鐎靛棛鐖滈悽鐔稿灇閸ｃ劌浼愰崗宄板毐閺佸府绱欑粔缁橆槻閼?CS PasswordGenerator閿?
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

function generatePassword(length = 12, lower = true, upper = true, numbers = true, symbols = false, exclude = '') {
    let charset = '';
    if (lower) charset += LOWER;
    if (upper) charset += UPPER;
    if (numbers) charset += NUMBERS;
    if (symbols) charset += SYMBOLS;
    if (!charset) charset = LOWER + NUMBERS;
    if (exclude)
        charset = charset
            .split('')
            .filter((c) => !exclude.includes(c))
            .join('');
    if (!charset) return '';
    return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
}

function getPasswordStrength(password) {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    const unique = new Set(password).size;
    if (password.length > 0 && unique > password.length * 0.7) score++;
    return Math.min(score, 5);
}

// Strength text resolved via i18n at render time
const STRENGTH_KEYS = [
    '',
    'vault.strength_very_weak',
    'vault.strength_weak',
    'vault.strength_medium',
    'vault.strength_strong',
    'vault.strength_very_strong',
];
const STRENGTH_COLOR = ['#ccc', '#e53935', '#fb8c00', '#fdd835', '#7cb342', '#43a047'];

// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 閺嶅嘲绱＄敮鎼佸櫤
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
const S = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        fontFamily: APP_FONT_FAMILY_VAR,
        fontSize: '13px',
        background: 'transparent',
        color: '#334155',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        flexShrink: 0,
        position: 'relative',
    },
    dragOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        cursor: 'move',
    },
    toolbar: {
        display: 'flex',
        gap: '8px',
        padding: '10px 12px',
        flexWrap: 'wrap',
        background: 'rgba(248,250,252,0.78)',
        borderBottom: '1px solid rgba(226,232,240,0.8)',
        flexShrink: 0,
    },
    filterBar: {
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.72)',
        borderBottom: '1px solid rgba(226,232,240,0.72)',
        flexShrink: 0,
    },
    searchWrap: {
        position: 'relative',
        flex: '1 1 100%',
        width: '100%',
        minWidth: 0,
    },
    searchInput: {
        width: '100%',
        height: '32px',
        padding: '0 10px 0 32px',
        border: '1px solid rgba(203,213,225,0.9)',
        borderRadius: '9px',
        fontSize: '12px',
        outline: 'none',
        background: 'rgba(255,255,255,0.9)',
        color: '#0f172a',
        boxSizing: 'border-box',
    },
    searchIcon: {
        position: 'absolute',
        left: '10px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#94a3b8',
        pointerEvents: 'none',
    },
    tagBtn: (active) => ({
        padding: '4px 10px',
        borderRadius: '999px',
        border: '1px solid rgba(226,232,240,0.9)',
        background: active ? '#0f172a' : 'rgba(248,250,252,0.9)',
        color: active ? '#fff' : '#475569',
        fontSize: '11px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    }),
    list: {
        flex: 1,
        overflow: 'auto',
        padding: '10px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    listShell: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        overflow: 'hidden',
    },
    tagColumn: {
        width: '96px',
        flexShrink: 0,
        borderRight: '1px solid rgba(226,232,240,0.88)',
        background: 'rgba(248,250,252,0.62)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 8px',
        overflow: 'auto',
    },
    tagColumnBtn: (active) => ({
        width: '100%',
        minHeight: '32px',
        padding: '0 10px',
        borderRadius: '10px',
        border: active ? '1px solid rgba(15,23,42,0.84)' : '1px solid rgba(226,232,240,0.9)',
        background: active ? '#0f172a' : 'rgba(255,255,255,0.88)',
        color: active ? '#fff' : '#475569',
        fontSize: '12px',
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    }),
    listArea: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    card: (selected) => ({
        background: selected ? 'rgba(241,245,249,0.94)' : 'rgba(255,255,255,0.9)',
        border: `1px solid ${selected ? 'rgba(15,23,42,0.18)' : 'rgba(226,232,240,0.9)'}`,
        borderRadius: '12px',
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 12px 28px -26px rgba(15,23,42,0.28)',
        transition: 'border-color 0.15s, background 0.15s',
    }),
    cardLeft: { flex: 1, minWidth: 0 },
    cardAccount: {
        fontWeight: 600,
        fontSize: '13px',
        color: '#222',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    cardMeta: {
        fontSize: '11px',
        color: '#64748b',
        marginTop: '3px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    cardActions: { display: 'flex', gap: '4px', flexShrink: 0 },
    emptyTip: { textAlign: 'center', color: '#bbb', marginTop: '40px', fontSize: '13px' },
    statusBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 12px',
        background: 'rgba(248,250,252,0.78)',
        borderTop: '1px solid rgba(226,232,240,0.72)',
        fontSize: '11px',
        color: '#64748b',
        flexShrink: 0,
    },
    // 缂傛牞绶棃銏℃緲
    panel: {
        flex: 1,
        overflow: 'auto',
        padding: '14px',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    formRow: { display: 'flex', flexDirection: 'column', gap: '4px' },
    label: { fontSize: '12px', color: '#666', fontWeight: 500 },
    input: {
        padding: '8px 10px',
        border: '1px solid rgba(203,213,225,0.9)',
        borderRadius: '10px',
        fontSize: '13px',
        outline: 'none',
        background: 'rgba(255,255,255,0.9)',
        width: '100%',
        boxSizing: 'border-box',
    },
    textarea: {
        padding: '8px 10px',
        border: '1px solid rgba(203,213,225,0.9)',
        borderRadius: '10px',
        fontSize: '13px',
        outline: 'none',
        background: 'rgba(255,255,255,0.9)',
        width: '100%',
        boxSizing: 'border-box',
        resize: 'vertical',
        minHeight: '56px',
    },
    tagPill: (checked) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '4px 10px',
        borderRadius: '999px',
        border: '1px solid rgba(226,232,240,0.9)',
        background: checked ? '#0f172a' : 'rgba(248,250,252,0.92)',
        color: checked ? '#fff' : '#475569',
        fontSize: '11px',
        cursor: 'pointer',
        margin: '2px',
    }),
    strengthBar: (strength) => ({
        height: '4px',
        borderRadius: '2px',
        marginTop: '4px',
        width: `${(strength / 5) * 100}%`,
        background: STRENGTH_COLOR[strength],
        transition: 'width 0.3s, background 0.3s',
    }),
    strengthText: (strength) => ({ fontSize: '11px', color: STRENGTH_COLOR[strength], marginTop: '2px' }),
    // 鐎靛棛鐖滈悽鐔稿灇閸?
    genPanel: {
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid rgba(226,232,240,0.9)',
        borderRadius: '14px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    genTitle: { fontWeight: 600, fontSize: '12px', color: '#555' },
    genRow: { display: 'flex', alignItems: 'center', gap: '8px' },
    slider: { flex: 1 },
    checkbox: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' },
    // 闁氨鏁ら幐澶愭尦
    btn: (variant = 'default', small = false) => {
        const base = {
            padding: small ? '3px 9px' : '6px 14px',
            borderRadius: '9px',
            fontSize: small ? '11px' : '12px',
            cursor: 'pointer',
            border: '1px solid transparent',
            fontWeight: variant === 'primary' ? 600 : 400,
        };
        if (variant === 'primary')
            return { ...base, background: '#0f172a', color: '#fff', borderColor: 'rgba(15,23,42,0.84)' };
        if (variant === 'danger')
            return {
                ...base,
                background: 'rgba(255,241,242,0.92)',
                color: '#dc2626',
                borderColor: 'rgba(254,205,211,0.95)',
            };
        if (variant === 'ghost')
            return {
                ...base,
                background: 'rgba(248,250,252,0.92)',
                color: '#475569',
                borderColor: 'rgba(226,232,240,0.9)',
            };
        return { ...base, background: 'rgba(255,255,255,0.9)', color: '#475569', borderColor: 'rgba(226,232,240,0.9)' };
    },
    // 韫囶偊鈧喐鏌婃晶鐐额洬閻╂牕鐪?
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15,23,42,0.24)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    modal: {
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(226,232,240,0.9)',
        borderRadius: '16px',
        padding: '18px 20px',
        width: '340px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 24px 60px -36px rgba(15,23,42,0.35)',
    },
    bottomBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '8px',
        padding: '10px 12px',
        background: 'rgba(248,250,252,0.78)',
        borderTop: '1px solid rgba(226,232,240,0.72)',
        flexShrink: 0,
    },
    buttonContent: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
    },
};

// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 鐎靛棛鐖滈悽鐔稿灇閸ｃ劑娼伴弶璺ㄧ矋娴?
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
function PasswordGenPanel({ onUse, onCopySuccess }) {
    const { t } = useTranslation();
    const [len, setLen] = useState(14);
    const [lower, setLower] = useState(true);
    const [upper, setUpper] = useState(true);
    const [nums, setNums] = useState(true);
    const [syms, setSyms] = useState(false);
    const [exclude, setExclude] = useState('');
    const [pwd, setPwd] = useState('');

    const gen = useCallback(() => {
        setPwd(generatePassword(len, lower, upper, nums, syms, exclude));
    }, [len, lower, upper, nums, syms, exclude]);

    useEffect(() => {
        gen();
    }, [gen]);

    const strength = getPasswordStrength(pwd);
    const strengthText = strength > 0 ? t(STRENGTH_KEYS[strength]) : '';

    return (
        <div style={S.genPanel}>
            <div style={{ ...S.genTitle, ...S.buttonContent }}>
                <FiKey size={14} />
                <span>{t('vault.gen_title')}</span>
            </div>
            <div style={S.genRow}>
                <span style={{ fontSize: '11px', color: '#666', width: 38 }}>{t('vault.gen_length', { n: len })}</span>
                <input
                    type='range'
                    min={6}
                    max={64}
                    value={len}
                    style={S.slider}
                    onChange={(e) => setLen(Number(e.target.value))}
                />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                    [t('vault.gen_lower'), lower, setLower],
                    [t('vault.gen_upper'), upper, setUpper],
                    [t('vault.gen_numbers'), nums, setNums],
                    [t('vault.gen_symbols'), syms, setSyms],
                ].map(([label, val, set]) => (
                    <label
                        key={label}
                        style={S.checkbox}
                    >
                        <input
                            type='checkbox'
                            checked={val}
                            onChange={(e) => set(e.target.checked)}
                        />
                        {label}
                    </label>
                ))}
            </div>
            <div style={S.genRow}>
                <span style={{ fontSize: '11px', color: '#666', flexShrink: 0 }}>{t('vault.gen_exclude')}</span>
                <input
                    style={{ ...S.input, flex: 1 }}
                    value={exclude}
                    placeholder={t('vault.gen_exclude_placeholder')}
                    onChange={(e) => setExclude(e.target.value)}
                />
            </div>
            <div
                style={{
                    background: '#f5f7ff',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontFamily: 'Consolas, monospace',
                    fontSize: '13px',
                    wordBreak: 'break-all',
                }}
            >
                {pwd || <span style={{ color: '#bbb' }}>-</span>}
            </div>
            <div style={S.strengthBar(strength)} />
            <div style={S.strengthText(strength)}>
                {strengthText && `${t('vault.strength_label')}${strengthText} (${strength}/5)`}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
                <button
                    style={S.btn()}
                    onClick={gen}
                >
                    {t('vault.gen_regenerate')}
                </button>
                <button
                    style={S.btn('primary')}
                    onClick={() => onUse(pwd)}
                    disabled={!pwd}
                >
                    {t('vault.gen_use')}
                </button>
                <button
                    style={S.btn()}
                    onClick={async () => {
                        if (pwd) {
                            await invoke('write_clipboard', { text: pwd });
                            onCopySuccess?.();
                        }
                    }}
                >
                    {t('vault.gen_copy')}
                </button>
            </div>
        </div>
    );
}

// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 缂傛牞绶憴鍡楁禈
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
function EditView({ record, allTags, onSave, onCancel }) {
    const { t } = useTranslation();
    const isNew = !record;
    const [account, setAccount] = useState(record?.account ?? '');
    const [password, setPassword] = useState(record?.password ?? '');
    const [website, setWebsite] = useState(record?.website ?? '');
    const [notes, setNotes] = useState(record?.notes ?? '');
    const [tags, setTags] = useState(record?.tags ?? []);
    const [showPwd, setShowPwd] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [showGen, setShowGen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const strength = getPasswordStrength(password);

    const toggleTag = (t) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    const addTag = () => {
        const t = newTag.trim();
        if (!t) return;
        if (!tags.includes(t)) setTags((prev) => [...prev, t]);
        setNewTag('');
    };

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const payload = { account: account.trim(), password, website: website.trim(), notes: notes.trim(), tags };
            if (isNew) {
                await addRecord(payload);
            } else {
                await updateRecord(record.id, payload);
            }
            onSave();
        } catch (e) {
            setError(t('vault.save_failed') + e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 閺嶅洭顣介弽?*/}
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                center={
                    <WindowHeaderTitle
                        icon={<FiLock size={15} style={{ color: '#64748b', flexShrink: 0 }} />}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {isNew ? t('vault.new_record') : t('vault.edit_record')}
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton />}
            />
            {false && (
                <div style={S.header}>
                    <div
                        style={S.dragOverlay}
                        data-tauri-drag-region='true'
                    />
                    <span style={{ fontWeight: 700, fontSize: '14px', position: 'relative', zIndex: 1 }}>
                        {isNew ? `閴?${t('vault.new_record')}` : `閴佸骏绗?${t('vault.edit_record')}`}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', position: 'relative', zIndex: 1 }}>
                        <button
                            style={S.btn()}
                            onClick={onCancel}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            style={S.btn('primary')}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? t('vault.saving') : t('vault.save')}
                        </button>
                    </div>
                </div>
            )}

            <div style={S.panel}>
                {error && <div style={{ color: '#e53935', fontSize: '12px' }}>{error}</div>}

                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.account_label')}</label>
                    <input
                        style={S.input}
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                        placeholder={t('vault.account_placeholder')}
                        autoFocus
                    />
                </div>

                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.password_label')}</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                            style={{ ...S.input, flex: 1, fontFamily: showPwd ? 'inherit' : 'Consolas, monospace' }}
                            type={showPwd ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('vault.password_label')}
                        />
                        <button
                            style={S.btn('ghost')}
                            onClick={() => setShowPwd((v) => !v)}
                        >
                            {showPwd ? t('vault.hide') : t('vault.show')}
                        </button>
                        <button
                            style={S.btn()}
                            onClick={() => setShowGen((v) => !v)}
                        >
                            {showGen ? t('vault.gen_collapse') : t('vault.gen_btn')}
                        </button>
                    </div>
                    {password && (
                        <>
                            <div style={S.strengthBar(strength)} />
                            <div style={S.strengthText(strength)}>
                                {t('vault.strength_label')}
                                {t(STRENGTH_KEYS[strength])} ({strength}/5)
                            </div>
                        </>
                    )}
                </div>

                {showGen && (
                    <PasswordGenPanel
                        onUse={(pwd) => {
                            setPassword(pwd);
                            setShowGen(false);
                        }}
                    />
                )}

                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.website_label')}</label>
                    <input
                        style={S.input}
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder={t('vault.website_placeholder')}
                    />
                </div>

                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.notes_label')}</label>
                    <textarea
                        style={S.textarea}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('vault.notes_placeholder')}
                    />
                </div>

                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.tags_label')}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {allTags.map((tag) => (
                            <span
                                key={tag}
                                style={S.tagPill(tags.includes(tag))}
                                onClick={() => toggleTag(tag)}
                            >
                                
                                {tag}
                            </span>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <input
                            style={{ ...S.input, flex: 1 }}
                            value={newTag}
                            placeholder={t('vault.new_tag_placeholder')}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addTag();
                                }
                            }}
                        />
                        <button
                            style={S.btn()}
                            onClick={addTag}
                        >
                            {t('vault.add_tag')}
                        </button>
                    </div>
                    {/* 瀹告煡鈧鐖ｇ粵楣冾暕鐟?*/}
                    {tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '4px' }}>
                            {tags.map((t) => (
                                <span
                                    key={t}
                                    style={S.tagPill(true)}
                                >
                                    {t}
                                    <span
                                        style={{ marginLeft: 4, cursor: 'pointer' }}
                                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                                    >
                                        ?
                                    </span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div style={S.bottomBar}>
                <button
                    style={S.btn()}
                    onClick={onCancel}
                >
                    {t('common.cancel')}
                </button>
                <button
                    style={S.btn('primary')}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? t('vault.saving') : t('vault.save')}
                </button>
            </div>
        </div>
    );
}

// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 韫囶偊鈧喐鏌婃晶鐐茨侀幀浣诡攱
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
function QuickAddModal({ onSave, onClose, initialAccount = '', initialPassword = '' }) {
    const { t } = useTranslation();
    const [account, setAccount] = useState(initialAccount);
    const [password, setPassword] = useState(initialPassword);
    const [website, setWebsite] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!account.trim() && !password.trim()) return;
        setSaving(true);
        try {
            await addRecord({ account: account.trim(), password, website: website.trim(), notes: '', tags: [] });
            onSave();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            style={S.overlay}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div style={S.modal}>
                <div style={{ ...S.buttonContent, fontWeight: 700, fontSize: '14px' }}>
                    <FiEdit3 size={15} />
                    <span>{t('vault.quick_add_title')}</span>
                </div>
                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.account_short')}</label>
                    <input
                        style={S.input}
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                        placeholder={t('vault.quick_add_account_placeholder')}
                        autoFocus
                    />
                </div>
                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.password_short')}</label>
                    <input
                        style={S.input}
                        type='text'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('vault.password_label')}
                    />
                </div>
                <div style={S.formRow}>
                    <label style={S.label}>{t('vault.quick_add_website')}</label>
                    <input
                        style={S.input}
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder={t('vault.quick_add_website_placeholder')}
                    />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                        style={S.btn()}
                        onClick={onClose}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        style={S.btn('primary')}
                        onClick={handleSave}
                        disabled={saving || (!account.trim() && !password.trim())}
                    >
                        {saving ? t('vault.saving') : t('vault.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 閸掓銆冪憴鍡楁禈閿涘牅瀵岀憴鍡楁禈閿?
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
function ListView({ onEdit, pendingMode = 'idle', onModeConsumed }) {
    const { t } = useTranslation();
    const [records, setRecords] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [search, setSearch] = useState('');
    const [tagFilter, setTagFilter] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [prefillData, setPrefillData] = useState(null); // {account,password} for hotkey flow
    const [fillMode, setFillMode] = useState(false); // true when opened via quick_fill hotkey
    const [showGenStandalone, setShowGenStandalone] = useState(false);
    const [toast, setToast] = useState('');
    const toastTimer = useRef(null);
    const searchRef = useRef(null);

    // 閺嶈宓佸Ο鈥崇础閼奉亜濮╅幙宥勭稊
    useEffect(() => {
        if (pendingMode === 'quick_fill') {
            // 韫囶偅宓庨柨顔硷綖閸愭瑦膩瀵骏绱伴懕姘卞妽閹兼粎鍌ㄥ?+ 瀵偓閸?fillMode閿涘湕nter 鐟欙箑褰傛稉鈧柨顔硷綖閸愭瑱绱?
            setTimeout(() => searchRef.current?.focus(), 100);
            setFillMode(true);
            onModeConsumed?.();
        }
    }, [pendingMode, onModeConsumed]);

    const load = useCallback(async () => {
        const rows = await getRecords();
        setRecords(rows);
        const tagSet = new Set();
        rows.forEach((r) => r.tags.forEach((t) => tagSet.add(t)));
        setAllTags([...tagSet].sort());
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Listen for vault_quick_add_prefilled event (hotkey two-selection flow)
    useEffect(() => {
        const u = listen('vault_quick_add_prefilled', (e) => {
            setPrefillData(e.payload);
        });
        return () => u.then((f) => f());
    }, []);

    const showToast = (msg) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 2000);
    };

    const filtered = records.filter((r) => {
        const q = search.toLowerCase();
        const matchSearch =
            !q ||
            r.account.toLowerCase().includes(q) ||
            r.website.toLowerCase().includes(q) ||
            r.notes.toLowerCase().includes(q) ||
            r.tags.some((t) => t.toLowerCase().includes(q));
        const matchTag = !tagFilter || r.tags.includes(tagFilter);
        return matchSearch && matchTag;
    });

    const selectedRecord = records.find((r) => r.id === selectedId) ?? null;

    const handleExport = async () => {
        if (filtered.length === 0) {
            showToast(t('vault.export_empty'));
            return;
        }

        try {
            const date = new Date().toISOString().slice(0, 10);
            const exported = await exportTableCsv({
                defaultFileName: `${t('vault.export_filename')}-${date}.csv`,
                columns: [
                    { header: t('vault.account_label'), value: (row) => row.account },
                    { header: t('vault.password_label'), value: (row) => row.password },
                    { header: t('vault.website_label'), value: (row) => row.website },
                    { header: t('vault.notes_label'), value: (row) => row.notes },
                    { header: t('vault.tags_label'), value: (row) => row.tags.join(' / ') },
                    { header: t('vault.export_created_at'), value: (row) => row.created_at },
                    { header: t('vault.export_modified_at'), value: (row) => row.modified_at },
                ],
                rows: filtered,
            });

            if (exported) {
                showToast(t('vault.export_success'));
            }
        } catch (error) {
            showToast(t('vault.export_failed') + (error?.message ?? error));
        }
    };

    const copyText = async (text, label) => {
        if (!text) return;
        await invoke('write_clipboard', { text });
        showToast(t('vault.copied', { label }));
    };

    const handleFill = async (text) => {
        if (!text) return;
        try {
            await appWindow.hide();
            await new Promise((r) => setTimeout(r, 150));
            await invoke('paste_result', { text });
        } catch (e) {
            console.error('fill error:', e);
        }
    };

    // 娑撯偓闁款喖锝為崘娆欑窗鐠愶箑褰?閳?Tab 閳?鐎靛棛鐖?
    const handleAutoFill = async (record) => {
        if (!record?.account && !record?.password) return;
        try {
            await appWindow.hide();
            await new Promise((r) => setTimeout(r, 150));
            await invoke('fill_autotab', { account: record.account, password: record.password });
        } catch (e) {
            console.error('auto fill error:', e);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('vault.confirm_delete'))) return;
        await deleteRecord(id);
        if (selectedId === id) setSelectedId(null);
        load();
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 妞ゅ爼鍎撮弽鍥暯閺?*/}
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                center={
                    <WindowHeaderTitle
                        icon={<FiLock size={15} style={{ color: '#64748b', flexShrink: 0 }} />}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {t('vault.title')}
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton />}
            />
            {false && (
                <div style={S.header}>
                    <div
                        style={S.dragOverlay}
                        data-tauri-drag-region='true'
                    />
                    <span style={{ fontWeight: 700, fontSize: '14px', position: 'relative', zIndex: 1 }}>
                        棣冩敿 {t('vault.title')}
                    </span>
                    <button
                        style={{ ...S.btn(), position: 'relative', zIndex: 1 }}
                        onClick={() => appWindow.close()}
                    >
                        閴?{t('vault.close')}
                    </button>
                </div>
            )}

            {/* 瀹搞儱鍙块弽?*/}
            <div style={S.toolbar}>
                <button
                    style={S.btn('primary')}
                    onClick={() => onEdit(null)}
                >
                    <span style={S.buttonContent}>
                        <FiPlus size={14} />
                        <span>{t('vault.add')}</span>
                    </span>
                </button>
                <button
                    style={S.btn()}
                    onClick={async () => {
                        await appWindow.hide();
                        try {
                            await invoke('open_vault_quick_add');
                        } catch (e) {
                            console.error(e);
                        }
                    }}
                >
                    <span style={S.buttonContent}>
                        <FiEdit3 size={14} />
                        <span>{t('vault.quick_add')}</span>
                    </span>
                </button>
                <button
                    style={S.btn()}
                    onClick={() => setShowGenStandalone((v) => !v)}
                >
                    <span style={S.buttonContent}>
                        <FiKey size={14} />
                        <span>{showGenStandalone ? t('vault.collapse_gen') : t('vault.password_gen')}</span>
                    </span>
                </button>
                <button
                    style={S.btn()}
                    onClick={() => {
                        void handleExport();
                    }}
                >
                    <span style={S.buttonContent}>
                        <FiDownload size={14} />
                        <span>{t('vault.export')}</span>
                    </span>
                </button>
                {selectedRecord && (
                    <>
                        <div style={{ width: '1px', background: '#e0e0e0', margin: '0 2px' }} />
                        <button
                            style={S.btn('primary', true)}
                            onClick={() => handleAutoFill(selectedRecord)}
                            title={t('vault.fill_one_tip')}
                        >
                            <span style={S.buttonContent}>
                                <FiZap size={13} />
                                <span>{t('vault.fill_one')}</span>
                            </span>
                        </button>
                        <button
                            style={S.btn('', true)}
                            onClick={() => handleFill(selectedRecord.account)}
                            title={t('vault.fill_account_tip')}
                        >
                            {t('vault.fill_account')}
                        </button>
                        <button
                            style={S.btn('', true)}
                            onClick={() => handleFill(selectedRecord.password)}
                            title={t('vault.fill_password_tip')}
                        >
                            {t('vault.fill_password')}
                        </button>
                    </>
                )}
            </div>
            {showGenStandalone && (
                <div
                    style={{
                        padding: '10px 12px',
                        background: 'rgba(248,250,252,0.72)',
                        borderBottom: '1px solid rgba(226,232,240,0.72)',
                    }}
                >
                    <PasswordGenPanel
                        onUse={async (pwd) => {
                            await invoke('write_clipboard', { text: pwd });
                            showToast(t('vault.gen_copy_success'));
                            setShowGenStandalone(false);
                        }}
                        onCopySuccess={() => showToast(t('vault.gen_copy_success'))}
                    />
                </div>
            )}

            {/* 閹兼粎鍌?+ 閺嶅洨顒风粵娑⑩偓?*/}
            <div style={S.filterBar}>
                <div style={S.searchWrap}>
                    <span style={S.searchIcon}>
                        <FiSearch size={14} />
                    </span>
                    <input
                        ref={searchRef}
                        style={{
                            ...S.searchInput,
                            ...(fillMode && {
                                borderColor: 'rgba(15,23,42,0.34)',
                                boxShadow: '0 0 0 2px rgba(15,23,42,0.08)',
                            }),
                        }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && fillMode && filtered.length > 0) {
                                e.preventDefault();
                                handleAutoFill(filtered[0]);
                            }
                        }}
                        placeholder={fillMode ? t('vault.search') + ' (Enter auto-fill)' : t('vault.search')}
                    />
                </div>
            </div>
            <div style={S.listShell}>
                <div style={S.tagColumn}>
                    <button
                        style={S.tagColumnBtn(!tagFilter)}
                        onClick={() => setTagFilter(null)}
                    >
                        {t('vault.all_tags')}
                    </button>
                    {allTags.map((tag) => (
                        <button
                            key={tag}
                            style={S.tagColumnBtn(tagFilter === tag)}
                            onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
                <div style={S.listArea}>
                    <div style={S.list}>
                        {filtered.length === 0 && (
                            <div style={S.emptyTip}>
                                {records.length === 0 ? t('vault.empty_new') : t('vault.empty_search')}
                            </div>
                        )}
                        {filtered.map((r) => (
                            <div
                                key={r.id}
                                style={S.card(selectedId === r.id)}
                                onClick={() => setSelectedId(r.id)}
                            >
                                <div style={S.cardLeft}>
                                    <div style={S.cardAccount}>
                                        {r.account || <span style={{ color: '#aaa' }}>-</span>}
                                    </div>
                                    <div style={S.cardMeta}>
                                        {r.website && (
                                            <span style={{ marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <FiGlobe size={12} />
                                                <span>{r.website}</span>
                                            </span>
                                        )}
                                        {r.tags.length > 0 && <span>{r.tags.map((tag) => '[' + tag + ']').join(' ')}</span>}
                                        {r.notes && <span style={{ marginLeft: 6, color: '#aaa' }}>- {r.notes.slice(0, 30)}</span>}
                                    </div>
                                </div>
                                <div
                                    style={S.cardActions}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        style={S.btn('', true)}
                                        onClick={() => copyText(r.account, t('vault.account_short'))}
                                    >
                                        {t('vault.account_short')}
                                    </button>
                                    <button
                                        style={S.btn('ghost', true)}
                                        onClick={() => copyText(r.password, t('vault.password_short'))}
                                    >
                                        {t('vault.password_short')}
                                    </button>
                                    <button
                                        style={S.btn('', true)}
                                        onClick={() => onEdit(r)}
                                    >
                                        {t('vault.edit')}
                                    </button>
                                    <button
                                        style={S.btn('danger', true)}
                                        onClick={() => handleDelete(r.id)}
                                    >
                                        {t('vault.delete')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div style={S.statusBar}>
                {t('vault.records_total', { n: records.length })}
                {search || tagFilter ? t('vault.records_filtered', { n: filtered.length }) : ''}
                {selectedRecord ? t('vault.records_selected', { name: selectedRecord.account || '-' }) : ''}
            </div>

            {/* 韫囶偊鈧喐鏌婃晶鐐茨侀幀浣诡攱閿涘牆鍨濈拠宥嗗礋閼鹃攱绁︾粙瀣暚閹存劕鎮楁０鍕綖閿?*/}
            {prefillData != null && (
                <QuickAddModal
                    initialAccount={prefillData.account}
                    initialPassword={prefillData.password}
                    onSave={() => {
                        setPrefillData(null);
                        appWindow.close(); // 娣囨繂鐡ㄩ崥搴″彠闂傤厼鐦戦惍浣规拱缁愭褰?
                    }}
                    onClose={() => {
                        setPrefillData(null);
                    }}
                />
            )}

            {/* Toast 閹绘劗銇?*/}
            {toast && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 32,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(40,40,40,0.88)',
                        color: '#fff',
                        borderRadius: '20px',
                        padding: '6px 18px',
                        fontSize: '12px',
                        zIndex: 200,
                        pointerEvents: 'none',
                    }}
                >
                    {toast}
                </div>
            )}
        </div>
    );
}

// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// 娑撹崵绮嶆禒?閳?鐟欏棗娴樼捄顖滄暠
// 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
export default function Vault() {
    const [view, setView] = useState('list');
    const [editRecord, setEditRecord] = useState(null);
    const [allTags, setAllTags] = useState([]);
    const [listKey, setListKey] = useState(0);
    // 'idle' | 'quick_add' | 'quick_fill'
    const [pendingMode, setPendingMode] = useState('idle');

    // 鐠囪褰?Rust 娓氀冪摠閸屻劎娈戝鍛靶曢崣鎴災佸蹇ョ礄閺傛壆鐛ラ崣锝夘浕濞嗏剝瀵曟潪鑺ユ閿?
    useEffect(() => {
        invoke('get_vault_mode')
            .then((mode) => {
                if (mode && mode !== 'idle') setPendingMode(mode);
            })
            .catch(() => {});

        // 瀹稿弶澧﹀鈧惃鍕崶閸欙綁鈧俺绻?event 閹恒儲鏁归弬鐗埬佸?
        const unlisten = listen('vault_mode', (e) => {
            if (e.payload) setPendingMode(e.payload);
        });
        return () => {
            unlisten.then((f) => f());
        };
    }, []);

    useEffect(() => {
        getAllTags().then(setAllTags);
    }, [listKey]);

    const handleEdit = (record) => {
        setEditRecord(record);
        setView('edit');
    };

    const handleSaved = () => {
        setListKey((k) => k + 1);
        getAllTags().then(setAllTags);
        setView('list');
    };

    const handleCancel = () => setView('list');

    // 閸ュ搫鐣鹃弽鐟邦啇閸ｃ劎鈥樻穱婵囨殻娑擃亣顫嬮崣锝嗘箒娑撳秹鈧繑妲戦懗灞炬珯閿涘湵auri 缁愭褰涢弰?transparent=true閿?
    return (
        <TrayWindow>
            <TrayWindowBody>
                <TrayWindowSurface>
                    {view === 'edit' ? (
                        <EditView
                            record={editRecord}
                            allTags={allTags}
                            onSave={handleSaved}
                            onCancel={handleCancel}
                        />
                    ) : (
                        <ListView
                            key={listKey}
                            onEdit={handleEdit}
                            pendingMode={pendingMode}
                            onModeConsumed={() => setPendingMode('idle')}
                        />
                    )}
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
