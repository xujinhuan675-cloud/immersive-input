import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    getTags, addTag, updateTag, deleteTag,
    getAllPhrases, addPhrase, updatePhrase, deletePhrase,
    incrementUseCount, getTagCounts, matchPhrase,
} from './phrasesDb';

// ─────────────────────────────────────────────
// 常量 & 工具
// ─────────────────────────────────────────────
const PRESET_COLORS = [
    '#4a7cfa','#f44336','#e91e63','#9c27b0','#673ab7',
    '#2196f3','#00bcd4','#4caf50','#8bc34a','#ffc107',
    '#ff9800','#607d8b',
];
const PRESET_ICONS = ['📝','💬','📞','📢','🎯','🔧','💡','📋','🌟','❤️','🏷️','📁','✅','⚡','🎁','🔑'];

// ─────────────────────────────────────────────
// 样式
// ─────────────────────────────────────────────
const S = {
    root: {
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: '#fff', fontFamily: '-apple-system,"Microsoft YaHei",sans-serif',
        fontSize: '13px', color: '#222', overflow: 'hidden',
        borderRadius: '10px', boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
    },
    // 搜索头部
    header: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px', borderBottom: '1px solid #eee',
        background: '#fafafa', flexShrink: 0, position: 'relative',
    },
    dragOverlay: { position: 'absolute', inset: 0, cursor: 'move', zIndex: 0 },
    searchInput: {
        flex: 1, padding: '7px 12px', fontSize: '14px',
        border: '1.5px solid #dde', borderRadius: '8px',
        outline: 'none', background: '#fff', zIndex: 1, position: 'relative',
    },
    // 主体
    body: { flex: 1, display: 'flex', overflow: 'hidden' },
    // 标签侧栏
    sidebar: {
        width: '148px', flexShrink: 0, borderRight: '1px solid #eee',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: '#fafafa',
    },
    sidebarScroll: { flex: 1, overflowY: 'auto', padding: '4px 0' },
    tagItem: (active) => ({
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 12px', cursor: 'pointer', fontSize: '12px',
        background: active ? '#eef2ff' : 'transparent',
        borderLeft: `3px solid ${active ? '#4a7cfa' : 'transparent'}`,
        transition: 'background 0.1s',
        userSelect: 'none',
    }),
    tagIcon: { fontSize: '14px', flexShrink: 0 },
    tagName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
    tagCount: { fontSize: '10px', color: '#aaa', flexShrink: 0 },
    sidebarFooter: { padding: '6px 8px', borderTop: '1px solid #eee', flexShrink: 0 },
    // 结果区
    results: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    resultList: { flex: 1, overflowY: 'auto', padding: '4px 0' },
    phraseItem: (active, sent) => ({
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '8px 14px', cursor: 'pointer',
        background: active ? '#f0f4ff' : (sent ? '#f8fff8' : '#fff'),
        borderBottom: '1px solid #f5f5f5',
        transition: 'background 0.1s',
    }),
    phraseLeft: { flex: 1, minWidth: 0 },
    phraseTitle: { fontWeight: 600, fontSize: '12px', color: '#444', marginBottom: '2px' },
    phraseContent: {
        fontSize: '13px', color: '#222', lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    },
    phraseMeta: { fontSize: '10px', color: '#bbb', marginTop: '3px' },
    // 状态栏
    statusBar: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 14px', borderTop: '1px solid #eee',
        background: '#fafafa', flexShrink: 0, fontSize: '11px', color: '#888',
    },
    // 通用按钮
    btn: (variant = 'default', size = 'sm') => {
        const pad = size === 'xs' ? '2px 7px' : size === 'sm' ? '4px 12px' : '6px 16px';
        const fs = size === 'xs' ? '10px' : '12px';
        const base = { padding: pad, borderRadius: '6px', cursor: 'pointer', fontSize: fs, border: '1px solid transparent', fontWeight: variant === 'primary' ? 600 : 400, lineHeight: 1.4 };
        if (variant === 'primary') return { ...base, background: '#4a7cfa', color: '#fff', border: 'none' };
        if (variant === 'danger')  return { ...base, background: '#fff', color: '#e53935', borderColor: '#fcc' };
        if (variant === 'ghost')   return { ...base, background: 'transparent', color: '#4a7cfa', borderColor: '#4a7cfa' };
        if (variant === 'sent')    return { ...base, background: '#e8f5e9', color: '#2e7d32', border: 'none' };
        return { ...base, background: '#fff', color: '#555', borderColor: '#ddd' };
    },
    // 编辑面板
    editPanel: {
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fafafa',
    },
    editHeader: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 14px', borderBottom: '1px solid #eee', flexShrink: 0, background: '#fff',
    },
    formRow: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' },
    label: { fontSize: '11px', color: '#777', fontWeight: 500 },
    input: { padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#fff' },
    textarea: { padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#fff', resize: 'vertical', minHeight: '80px', lineHeight: 1.6 },
    // 颜色/图标选择器
    colorPicker: { display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px 0' },
    colorDot: (c, active) => ({
        width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
        border: active ? `3px solid #222` : '3px solid transparent',
        boxSizing: 'border-box', transition: 'border 0.1s',
    }),
    iconPicker: { display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '4px 0' },
    iconBtn: (active) => ({
        width: 30, height: 30, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '6px', cursor: 'pointer', border: active ? '2px solid #4a7cfa' : '2px solid transparent',
        background: active ? '#eef2ff' : '#fff', transition: 'border 0.1s',
    }),
    // 模态覆盖
    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    },
    modal: {
        background: '#fff', borderRadius: '10px', padding: '20px 24px',
        width: '360px', display: 'flex', flexDirection: 'column', gap: '12px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.22)', maxHeight: '80vh', overflowY: 'auto',
    },
    emptyTip: { textAlign: 'center', color: '#ccc', marginTop: '48px', fontSize: '13px', lineHeight: 2 },
};

// ─────────────────────────────────────────────
// 高亮匹配文字（简单版）
// ─────────────────────────────────────────────
function Highlight({ text, query }) {
    if (!query || !text) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark style={{ background: '#fff3cd', borderRadius: '2px', padding: '0 1px' }}>
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </>
    );
}

// ─────────────────────────────────────────────
// 标签编辑 Modal
// ─────────────────────────────────────────────
function TagModal({ tag, onSave, onCancel }) {
    const isNew = !tag;
    const [name, setName] = useState(tag?.name ?? '');
    const [color, setColor] = useState(tag?.color ?? '#4a7cfa');
    const [icon, setIcon] = useState(tag?.icon ?? '📝');

    const handleSave = async () => {
        if (!name.trim()) return;
        await onSave({ name: name.trim(), color, icon });
    };

    return (
        <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onCancel()}>
            <div style={S.modal}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{isNew ? '新建标签' : '编辑标签'}</div>
                <div style={S.formRow}>
                    <label style={S.label}>标签名</label>
                    <input style={S.input} value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="标签名称" autoFocus />
                </div>
                <div style={S.formRow}>
                    <label style={S.label}>颜色</label>
                    <div style={S.colorPicker}>
                        {PRESET_COLORS.map((c) => (
                            <div key={c} style={S.colorDot(c, color === c)} onClick={() => setColor(c)} />
                        ))}
                    </div>
                </div>
                <div style={S.formRow}>
                    <label style={S.label}>图标</label>
                    <div style={S.iconPicker}>
                        {PRESET_ICONS.map((ic) => (
                            <div key={ic} style={S.iconBtn(icon === ic)} onClick={() => setIcon(ic)}>{ic}</div>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button style={S.btn()} onClick={onCancel}>取消</button>
                    <button style={S.btn('primary')} onClick={handleSave} disabled={!name.trim()}>保存</button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 短语编辑 Modal
// ─────────────────────────────────────────────
function PhraseModal({ phrase, tags, defaultTagId, onSave, onCancel }) {
    const isNew = !phrase;
    const [title, setTitle] = useState(phrase?.title ?? '');
    const [content, setContent] = useState(phrase?.content ?? '');
    const [tagId, setTagId] = useState(phrase?.tag_id ?? defaultTagId ?? null);
    const contentRef = useRef(null);

    useEffect(() => { if (!isNew) contentRef.current?.focus(); }, [isNew]);

    const handleSave = async () => {
        if (!content.trim()) return;
        await onSave({ title: title.trim(), content: content.trim(), tag_id: tagId });
    };

    return (
        <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onCancel()}>
            <div style={S.modal}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{isNew ? '新增常用语' : '编辑常用语'}</div>
                <div style={S.formRow}>
                    <label style={S.label}>标签</label>
                    <select style={{ ...S.input, background: '#fff' }} value={tagId ?? ''} onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">未分类</option>
                        {tags.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
                    </select>
                </div>
                <div style={S.formRow}>
                    <label style={S.label}>标题（可选）</label>
                    <input style={S.input} value={title} onChange={(e) => setTitle(e.target.value)}
                        placeholder="方便搜索的简短标题" autoFocus={isNew} />
                </div>
                <div style={S.formRow}>
                    <label style={S.label}>内容 *</label>
                    <textarea ref={contentRef} style={S.textarea} value={content}
                        onChange={(e) => setContent(e.target.value)} placeholder="常用语内容" />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button style={S.btn()} onClick={onCancel}>取消</button>
                    <button style={S.btn('primary')} onClick={handleSave} disabled={!content.trim()}>保存</button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 单条短语行
// ─────────────────────────────────────────────
function PhraseRow({ phrase, query, active, sentIds, isBatch, onSend, onEdit, onDelete, onSelect }) {
    const sent = sentIds?.has(phrase.id);
    return (
        <div
            style={S.phraseItem(active, sent)}
            onClick={() => !isBatch && onSend(phrase)}
            onMouseEnter={onSelect}
        >
            <div style={S.phraseLeft}>
                {phrase.title && (
                    <div style={S.phraseTitle}>
                        <Highlight text={phrase.title} query={query} />
                    </div>
                )}
                <div style={S.phraseContent}>
                    <Highlight text={phrase.content} query={query} />
                </div>
                <div style={S.phraseMeta}>
                    {phrase.use_count > 0 ? `已用 ${phrase.use_count} 次` : '未使用'}
                </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}
                onClick={(e) => e.stopPropagation()}>
                {isBatch ? (
                    <button
                        style={sent ? S.btn('sent', 'sm') : S.btn('primary', 'sm')}
                        onClick={() => onSend(phrase)}
                    >
                        {sent ? '✓ 已发' : '发送'}
                    </button>
                ) : (
                    <>
                        <button style={S.btn('ghost', 'xs')} onClick={() => onEdit(phrase)}>编辑</button>
                        <button style={S.btn('danger', 'xs')} onClick={() => onDelete(phrase)}>删除</button>
                    </>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────
export default function Phrases() {
    const [tags, setTags] = useState([]);
    const [allPhrases, setAllPhrases] = useState([]);
    const [tagCounts, setTagCounts] = useState({});
    const [selectedTagId, setSelectedTagId] = useState(null); // null=全部
    const [search, setSearch] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    // 'search' | 'batch'
    const [mode, setMode] = useState('search');
    // 批量发送时已发送的 id 集合
    const [sentIds, setSentIds] = useState(new Set());
    // Modal 状态
    const [tagModal, setTagModal] = useState(null); // null | 'new' | tag对象
    const [phraseModal, setPhraseModal] = useState(null); // null | 'new' | phrase对象
    // 编辑某标签下短语时展开的 tagId
    const [editingTagId, setEditingTagId] = useState(null);

    const searchRef = useRef(null);

    // ─── 数据加载 ───
    const reload = useCallback(async () => {
        const [t, p, c] = await Promise.all([getTags(), getAllPhrases(), getTagCounts()]);
        setTags(t);
        setAllPhrases(p);
        setTagCounts(c);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    // 窗口打开时聚焦搜索框
    useEffect(() => { setTimeout(() => searchRef.current?.focus(), 80); }, []);

    // ─── 过滤逻辑 ───
    const filtered = useMemo(() => {
        let list = allPhrases;
        // 标签过滤
        if (selectedTagId === '__uncat__') {
            list = list.filter((p) => p.tag_id === null || p.tag_id === undefined);
        } else if (selectedTagId !== null) {
            list = list.filter((p) => p.tag_id === selectedTagId);
        }
        // 搜索过滤
        if (search.trim()) {
            list = list.filter((p) => matchPhrase(p, search.trim()));
        }
        return list;
    }, [allPhrases, selectedTagId, search]);

    useEffect(() => { setActiveIdx(0); }, [filtered]);

    // ─── 发送逻辑 ───
    const sendPhrase = useCallback(async (phrase) => {
        await incrementUseCount(phrase.id);
        if (mode === 'batch') {
            setSentIds((prev) => new Set([...prev, phrase.id]));
            // 批量模式不关闭窗口
            reload();
            return;
        }
        // 普通模式：发送后关闭
        try {
            await appWindow.hide();
            await new Promise((r) => setTimeout(r, 150));
            await invoke('paste_result', { text: phrase.content });
        } catch (e) {
            console.error('send error:', e);
        }
        reload();
    }, [mode, reload]);

    // ─── 键盘导航 ───
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') { appWindow.close(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && filtered[activeIdx]) {
            e.preventDefault();
            sendPhrase(filtered[activeIdx]);
        }
    };

    // ─── 标签 CRUD ───
    const handleTagSave = async (data) => {
        if (tagModal === 'new') {
            await addTag(data);
        } else {
            await updateTag(tagModal.id, { ...data, sort_order: tagModal.sort_order });
        }
        setTagModal(null);
        reload();
    };

    const handleTagDelete = async (tag) => {
        if (!window.confirm(`删除标签「${tag.name}」？该标签下的常用语将变为未分类。`)) return;
        await deleteTag(tag.id);
        if (selectedTagId === tag.id) setSelectedTagId(null);
        reload();
    };

    // ─── 短语 CRUD ───
    const handlePhraseSave = async (data) => {
        if (phraseModal === 'new') {
            await addPhrase(data);
        } else {
            await updatePhrase(phraseModal.id, data);
        }
        setPhraseModal(null);
        reload();
    };

    const handlePhraseDelete = async (phrase) => {
        if (!window.confirm('确认删除这条常用语？')) return;
        await deletePhrase(phrase.id);
        reload();
    };

    // ─── 活动标签对象 ───
    const activeTag = tags.find((t) => t.id === selectedTagId) ?? null;
    const totalCount = selectedTagId === null ? allPhrases.length
        : selectedTagId === '__uncat__' ? (tagCounts['__uncat__'] ?? 0)
        : (tagCounts[selectedTagId] ?? 0);

    // ─── 侧栏标签列表 ───
    const sidebarTags = [
        { id: null, name: '全部', icon: '🗂️', color: '#888' },
        ...tags,
        { id: '__uncat__', name: '未分类', icon: '📌', color: '#bbb' },
    ];

    return (
        <div style={S.root} onKeyDown={handleKeyDown} tabIndex={-1}>
            {/* ─── 搜索头部 ─── */}
            <div style={S.header}>
                <div style={S.dragOverlay} data-tauri-drag-region="true" />
                <input
                    ref={searchRef}
                    style={S.searchInput}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setMode('search'); }}
                    placeholder="🔍 搜索常用语（支持拼音）…"
                />
                <button style={{ ...S.btn('ghost', 'sm'), position: 'relative', zIndex: 1 }}
                    onClick={() => setPhraseModal('new')}>+ 新增</button>
                <button style={{ ...S.btn('', 'sm'), position: 'relative', zIndex: 1 }}
                    onClick={() => appWindow.close()}>✕</button>
            </div>

            {/* ─── 主体 ─── */}
            <div style={S.body}>
                {/* 标签侧栏 */}
                <div style={S.sidebar}>
                    <div style={S.sidebarScroll}>
                        {sidebarTags.map((t) => {
                            const cnt = t.id === null ? allPhrases.length
                                : t.id === '__uncat__' ? (tagCounts['__uncat__'] ?? 0)
                                : (tagCounts[t.id] ?? 0);
                            return (
                                <div
                                    key={String(t.id)}
                                    style={S.tagItem(selectedTagId === t.id)}
                                    onClick={() => { setSelectedTagId(t.id); setSentIds(new Set()); setMode('search'); }}
                                >
                                    <span style={{ ...S.tagIcon, color: t.color }}>{t.icon}</span>
                                    <span style={S.tagName}>{t.name}</span>
                                    <span style={S.tagCount}>{cnt}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div style={S.sidebarFooter}>
                        <button style={{ ...S.btn('ghost', 'xs'), width: '100%' }}
                            onClick={() => setTagModal('new')}>＋ 新建标签</button>
                        {activeTag && (
                            <button style={{ ...S.btn('', 'xs'), width: '100%', marginTop: 4 }}
                                onClick={() => setTagModal(activeTag)}>✏️ 编辑标签</button>
                        )}
                        {activeTag && (
                            <button style={{ ...S.btn('danger', 'xs'), width: '100%', marginTop: 4 }}
                                onClick={() => handleTagDelete(activeTag)}>🗑 删除标签</button>
                        )}
                    </div>
                </div>

                {/* 结果列表 */}
                <div style={S.results}>
                    <div style={S.resultList}>
                        {filtered.length === 0 ? (
                            <div style={S.emptyTip}>
                                {allPhrases.length === 0
                                    ? '还没有常用语\n点击右上角「+ 新增」开始添加'
                                    : '没有匹配的常用语\n试试拼音搜索'}
                            </div>
                        ) : (
                            filtered.map((p, i) => (
                                <PhraseRow
                                    key={p.id}
                                    phrase={p}
                                    query={search}
                                    active={i === activeIdx}
                                    sentIds={sentIds}
                                    isBatch={mode === 'batch'}
                                    onSend={sendPhrase}
                                    onEdit={(ph) => setPhraseModal(ph)}
                                    onDelete={handlePhraseDelete}
                                    onSelect={() => setActiveIdx(i)}
                                />
                            ))
                        )}
                    </div>

                    {/* 状态栏 */}
                    <div style={S.statusBar}>
                        <span>{search ? `找到 ${filtered.length} 条` : `共 ${totalCount} 条`}</span>
                        <span style={{ flex: 1 }} />
                        {mode === 'batch' ? (
                            <>
                                <span style={{ color: '#4caf50', fontWeight: 600 }}>
                                    批量模式 · 已发 {sentIds.size}
                                </span>
                                <button style={S.btn('primary', 'xs')}
                                    onClick={() => { setMode('search'); setSentIds(new Set()); }}>
                                    结束批量
                                </button>
                            </>
                        ) : (
                            selectedTagId !== null && selectedTagId !== '__uncat__' && activeTag && (
                                <button style={S.btn('ghost', 'xs')}
                                    onClick={() => { setMode('batch'); setSentIds(new Set()); }}>
                                    连续发送
                                </button>
                            )
                        )}
                        <button style={S.btn('', 'xs')}
                            onClick={() => setPhraseModal({ ...(filtered[activeIdx] ?? {}), _isEditFromSearch: true })}>
                            编辑选中
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Modals ─── */}
            {tagModal && (
                <TagModal
                    tag={tagModal === 'new' ? null : tagModal}
                    onSave={handleTagSave}
                    onCancel={() => setTagModal(null)}
                />
            )}
            {phraseModal && (
                <PhraseModal
                    phrase={phraseModal === 'new' ? null : (phraseModal._isEditFromSearch ? phraseModal : phraseModal)}
                    tags={tags}
                    defaultTagId={selectedTagId !== '__uncat__' ? selectedTagId : null}
                    onSave={handlePhraseSave}
                    onCancel={() => setPhraseModal(null)}
                />
            )}
        </div>
    );
}
