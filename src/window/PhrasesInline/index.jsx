import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    getAllPhrases, matchPhrase, incrementUseCount,
    getTags, addTag, updateTag, deleteTag,
    addPhrase, updatePhrase, deletePhrase,
} from '../Phrases/phrasesDb';

// ── 样式 ────────────────────────────────────────────────────────────────────────────────
const S = {
    root: {
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: '#fff', fontFamily: '-apple-system,"Microsoft YaHei",sans-serif',
        fontSize: '13px', color: '#222', overflow: 'hidden',
        borderRadius: '10px', boxShadow: '0 8px 40px rgba(0,0,0,0.28)',
    },
    header: {
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '8px 10px', borderBottom: '1px solid #eee',
        background: '#fafafa', flexShrink: 0, position: 'relative',
    },
    dragOverlay: { position: 'absolute', inset: 0, cursor: 'move', zIndex: 0 },
    searchInput: {
        flex: 1, padding: '5px 9px', border: '1.5px solid #4a7cfa',
        borderRadius: '7px', fontSize: '13px', outline: 'none',
        background: '#fff', zIndex: 1, position: 'relative',
    },
    closeBtn: {
        padding: '2px 6px', border: 'none', background: 'transparent',
        cursor: 'pointer', color: '#bbb', fontSize: '14px', zIndex: 1, lineHeight: 1,
    },
    list: { flex: 1, overflowY: 'auto' },
    item: (active) => ({
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '7px 12px', cursor: 'pointer',
        background: active ? '#eef2ff' : '#fff',
        borderBottom: '1px solid #f5f5f5', transition: 'background 0.08s',
        borderLeft: active ? '3px solid #4a7cfa' : '3px solid transparent',
    }),
    itemLeft: { flex: 1, minWidth: 0 },
    itemTitle: { fontSize: '10px', color: '#aaa', marginBottom: '1px', lineHeight: 1.2 },
    itemContent: {
        fontSize: '12px', color: '#333', lineHeight: 1.4,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    },
    itemTag: {
        display: 'inline-flex', alignItems: 'center', gap: '2px',
        fontSize: '10px', color: '#bbb', marginTop: '2px',
    },
    itemActions: { display: 'flex', gap: '4px', flexShrink: 0 },
    actionBtn: (danger) => ({
        padding: '1px 7px', fontSize: '10px', border: '1px solid',
        borderRadius: '4px', cursor: 'pointer', lineHeight: 1.6, background: '#fff',
        color: danger ? '#e53935' : '#4a7cfa',
        borderColor: danger ? '#fcc' : '#c5d5fb',
    }),
    empty: { textAlign: 'center', color: '#ccc', padding: '32px 16px', fontSize: '12px', lineHeight: 2 },
    footer: {
        display: 'flex', alignItems: 'center', padding: '5px 10px',
        borderTop: '1px solid #eee', background: '#fafafa', flexShrink: 0, gap: '8px',
    },
    addBtn: {
        padding: '3px 12px', fontSize: '12px', border: '1px solid #4a7cfa',
        borderRadius: '6px', cursor: 'pointer', color: '#4a7cfa',
        background: '#fff', fontWeight: 600,
    },
    hint: { fontSize: '10px', color: '#ccc', flex: 1, textAlign: 'right', letterSpacing: '0.02em' },
    tagsBtn: {
        padding: '3px 10px', fontSize: '12px', border: '1px solid #ddd',
        borderRadius: '6px', cursor: 'pointer', color: '#888', background: '#fff',
    },
    tagRow: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 14px', borderBottom: '1px solid #f5f5f5',
    },
    tagIcon: { fontSize: '16px', flexShrink: 0 },
    tagName: { flex: 1, fontWeight: 500, fontSize: '13px' },
    // 编辑表单
    editHeader: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 12px', borderBottom: '1px solid #eee',
        background: '#fafafa', flexShrink: 0, position: 'relative',
    },
    backBtn: {
        padding: '3px 10px', fontSize: '12px', border: '1px solid #ddd',
        borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#666', zIndex: 1,
    },
    editTitle: { fontWeight: 700, fontSize: '13px', zIndex: 1 },
    editBody: {
        flex: 1, overflowY: 'auto', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: '10px',
    },
    formRow: { display: 'flex', flexDirection: 'column', gap: '4px' },
    label: { fontSize: '11px', color: '#888', fontWeight: 500 },
    input: {
        padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px',
        fontSize: '13px', outline: 'none', background: '#fff',
    },
    select: {
        padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px',
        fontSize: '13px', outline: 'none', background: '#fff',
    },
    textarea: {
        padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px',
        fontSize: '13px', outline: 'none', background: '#fff',
        resize: 'vertical', minHeight: '100px', lineHeight: 1.6, flex: 1,
    },
    editFooter: {
        display: 'flex', gap: '8px', justifyContent: 'flex-end',
        padding: '8px 14px', borderTop: '1px solid #eee', background: '#fafafa', flexShrink: 0,
    },
    cancelBtn: {
        padding: '5px 14px', fontSize: '12px', border: '1px solid #ddd',
        borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#555',
    },
    saveBtn: (disabled) => ({
        padding: '5px 16px', fontSize: '12px', border: 'none',
        borderRadius: '6px', cursor: disabled ? 'default' : 'pointer',
        background: disabled ? '#c8d8fc' : '#4a7cfa', color: '#fff', fontWeight: 600,
    }),
};

// ── 标签行 ────────────────────────────────────────────────────────────────────────
function TagRow({ tag, onEdit, onDelete }) {
    const { t } = useTranslation();
    const [hover, setHover] = useState(false);
    return (
        <div style={S.tagRow} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <span style={S.tagIcon}>{tag.icon}</span>
            <span style={S.tagName}>{tag.name}</span>
            {hover && (
                <div style={S.itemActions} onClick={(e) => e.stopPropagation()}>
                    <button style={S.actionBtn(false)} onClick={() => onEdit(tag)}>{t('phrases.edit')}</button>
                    <button style={S.actionBtn(true)} onClick={() => onDelete(tag)}>{t('phrases.delete')}</button>
                </div>
            )}
        </div>
    );
}

// ── 标签管理视图 ─────────────────────────────────────────────────────────────────────
function TagsView({ onBack, onChanged }) {
    const { t } = useTranslation();
    const [tags, setTags] = useState([]);
    const [editId, setEditId] = useState(null);
    const [editName, setEditName] = useState('');

    const load = useCallback(async () => { setTags(await getTags()); }, []);
    useEffect(() => { load(); }, [load]);

    const startEdit = (tag) => { setEditId(tag.id); setEditName(tag.name); };

    const saveEdit = async (tag) => {
        if (!editName.trim()) return;
        await updateTag(tag.id, { name: editName.trim(), color: tag.color, icon: tag.icon, sort_order: tag.sort_order });
        setEditId(null);
        await load();
        onChanged?.();
    };

    const handleDelete = async (tag) => {
        if (!window.confirm(t('phrases.confirm_delete_tag', { name: tag.name }))) return;
        await deleteTag(tag.id);
        await load();
        onChanged?.();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={S.editHeader}>
                <div style={S.dragOverlay} data-tauri-drag-region="true" />
                <button style={S.backBtn} onClick={onBack}>{t('phrases.back')}</button>
                <span style={S.editTitle}>{t('phrases.manage_tags')}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {tags.length === 0 ? (
                    <div style={S.empty}>{t('phrases.no_tags')}</div>
                ) : (
                    tags.map((tag) =>
                        editId === tag.id ? (
                            <div key={tag.id} style={{ ...S.tagRow, gap: '6px' }}>
                                <span style={S.tagIcon}>{tag.icon}</span>
                                <input
                                    style={{ ...S.input, flex: 1 }}
                                    value={editName}
                                    autoFocus
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit(tag);
                                        if (e.key === 'Escape') setEditId(null);
                                    }}
                                />
                                <button style={S.actionBtn(false)} onClick={() => saveEdit(tag)}>{t('phrases.tags_save')}</button>
                                <button style={{ ...S.cancelBtn, padding: '2px 8px', fontSize: '11px' }} onClick={() => setEditId(null)}>{t('common.cancel')}</button>
                            </div>
                        ) : (
                            <TagRow key={tag.id} tag={tag} onEdit={startEdit} onDelete={handleDelete} />
                        )
                    )
                )}
            </div>
        </div>
    );
}

// ── 编辑表单 ────────────────────────────────────────────────────────────────────────
function EditView({ phrase, allTags, onSave, onCancel }) {
    const { t } = useTranslation();
    const isNew = !phrase;
    const [title, setTitle] = useState(phrase?.title ?? '');
    const [content, setContent] = useState(phrase?.content ?? '');
    const [tagId, setTagId] = useState(phrase?.tag_id ?? null);
    const [newTagMode, setNewTagMode] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [saving, setSaving] = useState(false);
    const contentRef = useRef(null);

    useEffect(() => { setTimeout(() => contentRef.current?.focus(), 60); }, []);

    const handleTagChange = (e) => {
        if (e.target.value === '__new__') { setNewTagMode(true); setTagId(null); }
        else { setTagId(e.target.value ? Number(e.target.value) : null); setNewTagMode(false); }
    };

    const handleSave = async () => {
        if (!content.trim()) return;
        setSaving(true);
        try {
            let finalTagId = tagId;
            if (newTagMode && newTagName.trim()) {
                finalTagId = await addTag({ name: newTagName.trim() });
            }
            const data = { title: title.trim(), content: content.trim(), tag_id: finalTagId };
            if (isNew) { await addPhrase(data); }
            else { await updatePhrase(phrase.id, data); }
            onSave();
        } finally { setSaving(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={S.editHeader}>
                <div style={S.dragOverlay} data-tauri-drag-region="true" />
                <button style={S.backBtn} onClick={onCancel}>{t('phrases.back')}</button>
                <span style={S.editTitle}>{isNew ? t('phrases.add_phrase') : t('phrases.edit_phrase')}</span>
            </div>

            <div style={S.editBody}>
                <div style={S.formRow}>
                    <label style={S.label}>{t('phrases.category')}</label>
                    {newTagMode ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <input style={{ ...S.input, flex: 1 }} value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder={t('phrases.new_tag_placeholder')} autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            />
                            <button style={{ ...S.cancelBtn, padding: '4px 10px', fontSize: '11px' }}
                                onClick={() => { setNewTagMode(false); setNewTagName(''); }}>{t('phrases.cancel_tag')}</button>
                        </div>
                    ) : (
                        <select style={S.select} value={tagId ?? ''} onChange={handleTagChange}>
                            <option value="">{t('phrases.uncategorized')}</option>
                            {allTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.icon} {tag.name}</option>)}
                            <option value="__new__">{t('phrases.new_tag_option')}</option>
                        </select>
                    )}
                </div>

                <div style={S.formRow}>
                    <label style={S.label}>{t('phrases.title_field')}</label>
                    <input style={S.input} value={title}
                        onChange={(e) => setTitle(e.target.value)} placeholder={t('phrases.title_placeholder')} />
                </div>

                <div style={{ ...S.formRow, flex: 1 }}>
                    <label style={S.label}>{t('phrases.content_field')}</label>
                    <textarea ref={contentRef} style={S.textarea}
                        value={content} onChange={(e) => setContent(e.target.value)}
                        placeholder={t('phrases.content_placeholder')} />
                </div>
            </div>

            <div style={S.editFooter}>
                <button style={S.cancelBtn} onClick={onCancel}>{t('common.cancel')}</button>
                <button style={S.saveBtn(!content.trim() || saving)}
                    onClick={handleSave} disabled={!content.trim() || saving}>
                    {saving ? t('phrases.saving') : t('phrases.save')}
                </button>
            </div>
        </div>
    );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────────
const MAX_RESULTS = 10;

export default function PhrasesInline() {
    const [view, setView] = useState('list');
    const [editPhrase, setEditPhrase] = useState(null);
    const [allPhrases, setAllPhrases] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [search, setSearch] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const [hoverIdx, setHoverIdx] = useState(-1);
    const searchRef = useRef(null);

    const reload = useCallback(async () => {
        const [phrases, tags] = await Promise.all([getAllPhrases(), getTags()]);
        setAllPhrases(phrases);
        setAllTags(tags);
    }, []);

    useEffect(() => {
        reload();
        setTimeout(() => searchRef.current?.focus(), 60);
    }, [reload]);

    // 窗口获得焦点时：清空上次搜索词 + 重新聚焦搜索框
    useEffect(() => {
        const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
            if (focused && view === 'list') {
                setSearch('');
                setTimeout(() => searchRef.current?.focus(), 60);
            }
        });
        return () => { unlisten.then((f) => f()); };
    }, [view]);

    // id → tag 对象，用于在列表中展示分类信息
    const tagMap = useMemo(() => {
        const m = {};
        allTags.forEach((t) => { m[t.id] = t; });
        return m;
    }, [allTags]);

    const filtered = useMemo(() => {
        if (!search.trim()) return allPhrases.slice(0, MAX_RESULTS);
        return allPhrases.filter((p) => matchPhrase(p, search.trim())).slice(0, MAX_RESULTS);
    }, [allPhrases, search]);

    useEffect(() => { setActiveIdx(0); }, [filtered]);

    const fillPhrase = useCallback(async (phrase) => {
        if (!phrase) return;
        try {
            await incrementUseCount(phrase.id);
            await invoke('phrase_inline_fill', { content: phrase.content });
        } catch (e) { console.error('fill error:', e); }
    }, []);

    const { t } = useTranslation();

    const dismiss = useCallback(async () => {
        try { await invoke('phrase_inline_dismiss'); } catch (_) {}
        appWindow.hide();
    }, []);

    const handleDelete = async (phrase, e) => {
        e.stopPropagation();
        const label = phrase.title || phrase.content.slice(0, 20);
        if (!window.confirm(t('phrases.confirm_delete', { name: label }))) return;
        await deletePhrase(phrase.id);
        reload();
    };

    const handleKeyDown = (e) => {
        if (view !== 'list') return;
        if (e.key === 'Escape')     { e.preventDefault(); dismiss(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
        else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter')     { e.preventDefault(); if (filtered[activeIdx]) fillPhrase(filtered[activeIdx]); }
    };

    if (view === 'edit') {
        return (
            <div style={S.root}>
                <EditView
                    phrase={editPhrase}
                    allTags={allTags}
                    onSave={() => { reload(); setView('list'); setEditPhrase(null); }}
                    onCancel={() => { setView('list'); setEditPhrase(null); }}
                />
            </div>
        );
    }

    if (view === 'tags') {
        return (
            <div style={S.root}>
                <TagsView
                    onBack={() => setView('list')}
                    onChanged={() => reload()}
                />
            </div>
        );
    }

    return (
        <div style={S.root}>
            <div style={S.header}>
                <div style={S.dragOverlay} data-tauri-drag-region="true" />
                <span style={{ fontSize: '15px', zIndex: 1 }}>📝</span>
                <input
                    ref={searchRef}
                    style={S.searchInput}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        filtered.length > 0 && search
                            ? t('phrases.search_found', { n: filtered.length, preview: (filtered[0].title || filtered[0].content).slice(0, 8) })
                            : t('phrases.search_placeholder')
                    }
                />
                <button style={S.closeBtn} onClick={dismiss}>{t('phrases.close')}</button>
            </div>

            <div style={S.list}>
                {filtered.length === 0 ? (
                    <div style={S.empty}>
                        {allPhrases.length === 0
                            ? t('phrases.empty_new')
                            : t('phrases.empty_search')}
                    </div>
                ) : (
                    filtered.map((p, i) => (
                        <div
                            key={p.id}
                            style={S.item(i === activeIdx)}
                            onClick={() => fillPhrase(p)}
                            onMouseEnter={() => { setActiveIdx(i); setHoverIdx(i); }}
                            onMouseLeave={() => setHoverIdx(-1)}
                        >
                            <div style={S.itemLeft}>
                                {p.title && <div style={S.itemTitle}>{p.title}</div>}
                                <div style={S.itemContent}>{p.content}</div>
                                {p.tag_id && tagMap[p.tag_id] && (
                                    <div style={S.itemTag}>
                                        <span>{tagMap[p.tag_id].icon}</span>
                                        <span>{tagMap[p.tag_id].name}</span>
                                    </div>
                                )}
                            </div>
                            {hoverIdx === i && (
                                <div style={S.itemActions} onClick={(e) => e.stopPropagation()}>
                                    <button style={S.actionBtn(false)}
                                        onClick={() => { setEditPhrase(p); setView('edit'); }}>{t('phrases.edit')}</button>
                                    <button style={S.actionBtn(true)}
                                        onClick={(e) => handleDelete(p, e)}>{t('phrases.delete')}</button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div style={S.footer}>
                <button style={S.addBtn}
                    onClick={() => { setEditPhrase(null); setView('edit'); }}>{t('phrases.add')}</button>
                <button style={S.tagsBtn}
                    onClick={() => setView('tags')}>🏷 {t('phrases.tags')}</button>
                <span style={S.hint}>{t('phrases.hint')}</span>
            </div>
        </div>
    );
}
