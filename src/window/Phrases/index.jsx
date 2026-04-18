import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCollection, HiOutlinePencilAlt, HiOutlineTag, HiOutlineTrash } from 'react-icons/hi';

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
import {
    addPhrase,
    addTag,
    deletePhrase,
    deleteTag,
    getAllPhrases,
    getTagCounts,
    getTags,
    incrementUseCount,
    matchPhrase,
    updatePhrase,
    updateTag,
} from './phrasesDb';

const styles = {
    view: {
        display: 'flex',
        minHeight: 0,
        flex: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: APP_FONT_FAMILY_VAR,
        color: '#0f172a',
    },
    searchInput: {
        height: '34px',
        width: '100%',
        borderRadius: '10px',
        border: '1px solid rgba(203, 213, 225, 0.9)',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '0 12px',
        outline: 'none',
        fontSize: '13px',
        color: '#0f172a',
    },
    filterBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '46px',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.76)',
        background: 'rgba(248, 250, 252, 0.76)',
    },
    filterScroll: {
        display: 'flex',
        minWidth: 0,
        flex: 1,
        gap: '6px',
        overflowX: 'auto',
        paddingBottom: '2px',
    },
    filterActions: {
        display: 'flex',
        flexShrink: 0,
        gap: '6px',
    },
    pill: (active) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 10px',
        borderRadius: '999px',
        border: `1px solid ${active ? 'rgba(15, 23, 42, 0.84)' : 'rgba(226, 232, 240, 0.9)'}`,
        background: active ? '#0f172a' : 'rgba(255, 255, 255, 0.88)',
        color: active ? '#ffffff' : '#475569',
        fontSize: '12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    }),
    secondaryButton: {
        height: '30px',
        padding: '0 11px',
        borderRadius: '9px',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: 'rgba(255, 255, 255, 0.88)',
        color: '#475569',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    listWrap: {
        flex: 1,
        overflow: 'auto',
        padding: '10px 12px 12px',
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    item: (active, sent) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '13px',
        border: `1px solid ${active ? 'rgba(15, 23, 42, 0.18)' : sent ? 'rgba(187, 247, 208, 0.95)' : 'rgba(226, 232, 240, 0.9)'}`,
        background: active
            ? 'rgba(241, 245, 249, 0.94)'
            : sent
              ? 'rgba(240, 253, 244, 0.88)'
              : 'rgba(255, 255, 255, 0.92)',
        boxShadow: '0 12px 28px -26px rgba(15, 23, 42, 0.28)',
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease',
    }),
    itemMain: {
        minWidth: 0,
        flex: 1,
    },
    itemTitle: {
        marginBottom: '3px',
        fontSize: '11px',
        color: '#94a3b8',
        lineHeight: 1.3,
    },
    itemContent: {
        color: '#0f172a',
        fontSize: '13px',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        display: '-webkit-box',
        overflow: 'hidden',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
    },
    itemMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginTop: '5px',
        fontSize: '10px',
        color: '#94a3b8',
    },
    itemActions: {
        display: 'flex',
        flexShrink: 0,
        gap: '6px',
        alignItems: 'center',
    },
    itemActionButton: (danger = false) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '28px',
        padding: '0 9px',
        borderRadius: '8px',
        border: `1px solid ${danger ? 'rgba(254, 205, 211, 0.95)' : 'rgba(226, 232, 240, 0.9)'}`,
        background: danger ? 'rgba(255, 241, 242, 0.92)' : 'rgba(255, 255, 255, 0.9)',
        color: danger ? '#dc2626' : '#475569',
        fontSize: '11px',
        cursor: 'pointer',
    }),
    empty: {
        padding: '56px 16px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '13px',
        lineHeight: 1.8,
    },
    statusBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 12px',
        borderTop: '1px solid rgba(226, 232, 240, 0.72)',
        background: 'rgba(248, 250, 252, 0.78)',
        color: '#64748b',
        fontSize: '11px',
    },
    statusHint: {
        flex: 1,
        textAlign: 'right',
        color: '#94a3b8',
    },
    formScroll: {
        flex: 1,
        overflow: 'auto',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'rgba(248, 250, 252, 0.58)',
    },
    section: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    label: {
        fontSize: '11px',
        color: '#64748b',
        fontWeight: 600,
    },
    field: {
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid rgba(203, 213, 225, 0.9)',
        borderRadius: '10px',
        background: 'rgba(255, 255, 255, 0.92)',
        padding: '9px 10px',
        outline: 'none',
        fontSize: '13px',
        color: '#0f172a',
    },
    textarea: {
        minHeight: '260px',
        resize: 'vertical',
        lineHeight: 1.6,
    },
    footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        padding: '10px 12px',
        borderTop: '1px solid rgba(226, 232, 240, 0.72)',
        background: 'rgba(248, 250, 252, 0.76)',
    },
    footerButton: (primary = false) => ({
        height: '40px',
        minWidth: primary ? '88px' : '80px',
        padding: '0 16px',
        borderRadius: '10px',
        border: primary ? '1px solid rgba(15, 23, 42, 0.84)' : '1px solid rgba(226, 232, 240, 0.9)',
        background: primary ? '#0f172a' : 'rgba(255, 255, 255, 0.92)',
        color: primary ? '#ffffff' : '#475569',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
    }),
    managerList: {
        flex: 1,
        overflow: 'auto',
        padding: '10px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        background: 'rgba(248, 250, 252, 0.58)',
    },
    tagRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '12px',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: 'rgba(255, 255, 255, 0.92)',
        boxShadow: '0 12px 28px -26px rgba(15, 23, 42, 0.28)',
    },
    tagDot: (color) => ({
        width: '10px',
        height: '10px',
        borderRadius: '999px',
        background: color,
        flexShrink: 0,
    }),
    tagName: {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: '13px',
        color: '#0f172a',
        fontWeight: 500,
    },
    tagEditInput: {
        flex: 1,
        minWidth: 0,
        border: '1px solid rgba(203, 213, 225, 0.9)',
        borderRadius: '9px',
        background: 'rgba(255, 255, 255, 0.92)',
        padding: '6px 9px',
        fontSize: '13px',
        outline: 'none',
    },
    subHeaderButton: {
        height: '30px',
        padding: '0 11px',
        borderRadius: '9px',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: 'rgba(255, 255, 255, 0.88)',
        color: '#475569',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
    },
};

function HighlightText({ text, query }) {
    if (!query || !text) {
        return <>{text}</>;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index < 0) {
        return <>{text}</>;
    }

    return (
        <>
            {text.slice(0, index)}
            <mark style={{ background: 'rgba(254, 240, 138, 0.65)', borderRadius: '3px', padding: '0 1px' }}>
                {text.slice(index, index + query.length)}
            </mark>
            {text.slice(index + query.length)}
        </>
    );
}

function PhraseRow(props) {
    const { phrase, tag, query, active, hovered, sent, batchMode, onHover, onSend, onEdit, onDelete } = props;

    return (
        <div
            style={styles.item(active, sent)}
            onMouseEnter={onHover}
            onClick={() => onSend(phrase)}
        >
            <div style={styles.itemMain}>
                {phrase.title ? (
                    <div style={styles.itemTitle}>
                        <HighlightText
                            text={phrase.title}
                            query={query}
                        />
                    </div>
                ) : null}
                <div style={styles.itemContent}>
                    <HighlightText
                        text={phrase.content}
                        query={query}
                    />
                </div>
                <div style={styles.itemMeta}>
                    <span>{tag ? tag.name : '未分类'}</span>
                    <span>已用 {phrase.use_count || 0} 次</span>
                </div>
            </div>

            {batchMode ? (
                <div
                    style={styles.itemActions}
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        type='button'
                        style={styles.itemActionButton(sent)}
                        onClick={() => onSend(phrase)}
                    >
                        {sent ? '已发' : '发送'}
                    </button>
                </div>
            ) : hovered || active ? (
                <div
                    style={styles.itemActions}
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        type='button'
                        style={styles.itemActionButton(false)}
                        onClick={() => onEdit(phrase)}
                    >
                        <HiOutlinePencilAlt />
                        编辑
                    </button>
                    <button
                        type='button'
                        style={styles.itemActionButton(true)}
                        onClick={() => onDelete(phrase)}
                    >
                        <HiOutlineTrash />
                        删除
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function TagsView({ onBack, onChanged }) {
    const { t } = useTranslation();
    const [tags, setTags] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [creating, setCreating] = useState(false);
    const [newTagName, setNewTagName] = useState('');

    const loadTags = useCallback(async () => {
        setTags(await getTags());
    }, []);

    useEffect(() => {
        void loadTags();
    }, [loadTags]);

    const startEdit = (tag) => {
        setEditingId(tag.id);
        setEditingName(tag.name);
    };

    const saveEdit = async (tag) => {
        if (!editingName.trim()) return;
        await updateTag(tag.id, {
            name: editingName.trim(),
            color: tag.color,
            icon: tag.icon,
            sort_order: tag.sort_order,
        });
        setEditingId(null);
        setEditingName('');
        await loadTags();
        await onChanged();
    };

    const createTag = async () => {
        if (!newTagName.trim()) return;
        await addTag({ name: newTagName.trim() });
        setCreating(false);
        setNewTagName('');
        await loadTags();
        await onChanged();
    };

    const removeTag = async (tag) => {
        if (!window.confirm(t('phrases.confirm_delete_tag', { name: tag.name }))) return;
        await deleteTag(tag.id);
        await loadTags();
        await onChanged();
    };

    return (
        <div style={styles.view}>
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                left={<WindowHeaderButton onClick={onBack}>{t('phrases.back')}</WindowHeaderButton>}
                center={
                    <WindowHeaderTitle
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {t('phrases.manage_tags')}
                    </WindowHeaderTitle>
                }
                right={
                    creating ? null : (
                        <WindowHeaderButton onClick={() => setCreating(true)}>{t('phrases.add')}</WindowHeaderButton>
                    )
                }
            />

            <div style={styles.managerList}>
                {creating ? (
                    <div style={styles.tagRow}>
                        <span style={styles.tagDot('#4a7cfa')} />
                        <input
                            style={styles.tagEditInput}
                            value={newTagName}
                            autoFocus
                            onChange={(event) => setNewTagName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void createTag();
                                }
                                if (event.key === 'Escape') {
                                    setCreating(false);
                                    setNewTagName('');
                                }
                            }}
                        />
                        <button
                            type='button'
                            style={styles.subHeaderButton}
                            onClick={() => {
                                void createTag();
                            }}
                        >
                            保存
                        </button>
                        <button
                            type='button'
                            style={styles.subHeaderButton}
                            onClick={() => {
                                setCreating(false);
                                setNewTagName('');
                            }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                ) : null}

                {tags.length === 0 && !creating ? <div style={styles.empty}>{t('phrases.no_tags')}</div> : null}

                {tags.map((tag) =>
                    editingId === tag.id ? (
                        <div
                            key={tag.id}
                            style={styles.tagRow}
                        >
                            <span style={styles.tagDot(tag.color)} />
                            <input
                                style={styles.tagEditInput}
                                value={editingName}
                                autoFocus
                                onChange={(event) => setEditingName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void saveEdit(tag);
                                    }
                                    if (event.key === 'Escape') {
                                        setEditingId(null);
                                        setEditingName('');
                                    }
                                }}
                            />
                            <button
                                type='button'
                                style={styles.subHeaderButton}
                                onClick={() => {
                                    void saveEdit(tag);
                                }}
                            >
                                {t('phrases.tags_save')}
                            </button>
                            <button
                                type='button'
                                style={styles.subHeaderButton}
                                onClick={() => {
                                    setEditingId(null);
                                    setEditingName('');
                                }}
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    ) : (
                        <div
                            key={tag.id}
                            style={styles.tagRow}
                        >
                            <span style={styles.tagDot(tag.color)} />
                            <span style={styles.tagName}>{tag.name}</span>
                            <div style={styles.itemActions}>
                                <button
                                    type='button'
                                    style={styles.itemActionButton(false)}
                                    onClick={() => startEdit(tag)}
                                >
                                    编辑
                                </button>
                                <button
                                    type='button'
                                    style={styles.itemActionButton(true)}
                                    onClick={() => {
                                        void removeTag(tag);
                                    }}
                                >
                                    删除
                                </button>
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

function EditView({ phrase, allTags, onSaved, onCancel }) {
    const { t } = useTranslation();
    const isNew = !phrase;
    const [title, setTitle] = useState(phrase?.title ?? '');
    const [content, setContent] = useState(phrase?.content ?? '');
    const [tagId, setTagId] = useState(phrase?.tag_id ?? null);
    const [newTagMode, setNewTagMode] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [saving, setSaving] = useState(false);
    const contentRef = useRef(null);

    useEffect(() => {
        const timer = setTimeout(() => contentRef.current?.focus(), 60);
        return () => clearTimeout(timer);
    }, []);

    const handleTagChange = (event) => {
        if (event.target.value === '__new__') {
            setNewTagMode(true);
            setTagId(null);
            return;
        }

        setNewTagMode(false);
        setTagId(event.target.value ? Number(event.target.value) : null);
    };

    const handleSave = async () => {
        if (!content.trim()) return;

        setSaving(true);
        try {
            let nextTagId = tagId;
            if (newTagMode && newTagName.trim()) {
                nextTagId = await addTag({ name: newTagName.trim() });
            }

            const payload = {
                title: title.trim(),
                content: content.trim(),
                tag_id: nextTagId,
            };

            if (isNew) {
                await addPhrase(payload);
            } else {
                await updatePhrase(phrase.id, payload);
            }

            await onSaved();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={styles.view}>
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                center={
                    <WindowHeaderTitle
                        icon={<HiOutlineCollection className='text-[15px] text-default-500' />}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {isNew ? t('phrases.add_phrase') : t('phrases.edit_phrase')}
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton />}
            />

            <div style={styles.formScroll}>
                <div style={styles.section}>
                    <label style={styles.label}>{t('phrases.category')}</label>
                    {newTagMode ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                style={{ ...styles.field, flex: 1 }}
                                value={newTagName}
                                autoFocus
                                onChange={(event) => setNewTagName(event.target.value)}
                                placeholder={t('phrases.new_tag_placeholder')}
                            />
                            <button
                                type='button'
                                style={styles.secondaryButton}
                                onClick={() => {
                                    setNewTagMode(false);
                                    setNewTagName('');
                                }}
                            >
                                {t('phrases.cancel_tag')}
                            </button>
                        </div>
                    ) : (
                        <select
                            style={styles.field}
                            value={tagId ?? ''}
                            onChange={handleTagChange}
                        >
                            <option value=''>{t('phrases.uncategorized')}</option>
                            {allTags.map((tag) => (
                                <option
                                    key={tag.id}
                                    value={tag.id}
                                >
                                    {tag.name}
                                </option>
                            ))}
                            <option value='__new__'>{t('phrases.new_tag_option')}</option>
                        </select>
                    )}
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>{t('phrases.title_field')}</label>
                    <input
                        style={styles.field}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={t('phrases.title_placeholder')}
                    />
                </div>

                <div style={{ ...styles.section, flex: 1 }}>
                    <label style={styles.label}>{t('phrases.content_field')}</label>
                    <textarea
                        ref={contentRef}
                        style={{ ...styles.field, ...styles.textarea }}
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder={t('phrases.content_placeholder')}
                    />
                </div>
            </div>

            <div style={styles.footer}>
                <button
                    type='button'
                    style={styles.footerButton(false)}
                    onClick={onCancel}
                >
                    {t('common.cancel')}
                </button>
                <button
                    type='button'
                    style={{ ...styles.footerButton(true), ...TRAY_WINDOW_PRIMARY_BUTTON_STYLE }}
                    onClick={() => {
                        void handleSave();
                    }}
                    disabled={!content.trim() || saving}
                >
                    {saving ? t('phrases.saving') : t('phrases.save')}
                </button>
            </div>
        </div>
    );
}

export default function Phrases() {
    const { t } = useTranslation();
    const [view, setView] = useState('list');
    const [editPhrase, setEditPhrase] = useState(null);
    const [tags, setTags] = useState([]);
    const [allPhrases, setAllPhrases] = useState([]);
    const [tagCounts, setTagCounts] = useState({});
    const [selectedTagId, setSelectedTagId] = useState(null);
    const [search, setSearch] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const [hoverId, setHoverId] = useState(null);
    const [batchMode, setBatchMode] = useState(false);
    const [sentIds, setSentIds] = useState(new Set());
    const searchRef = useRef(null);

    const reload = useCallback(async () => {
        const [nextTags, nextPhrases, nextTagCounts] = await Promise.all([getTags(), getAllPhrases(), getTagCounts()]);

        setTags(nextTags);
        setAllPhrases(nextPhrases);
        setTagCounts(nextTagCounts);

        if (
            selectedTagId !== null &&
            selectedTagId !== '__uncat__' &&
            !nextTags.some((tag) => tag.id === selectedTagId)
        ) {
            setSelectedTagId(null);
        }
    }, [selectedTagId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (view !== 'list') return undefined;

        const timer = setTimeout(() => searchRef.current?.focus(), 80);
        return () => clearTimeout(timer);
    }, [view]);

    const tagMap = useMemo(() => {
        const map = {};
        tags.forEach((tag) => {
            map[tag.id] = tag;
        });
        return map;
    }, [tags]);

    const filtered = useMemo(() => {
        let list = allPhrases;

        if (selectedTagId === '__uncat__') {
            list = list.filter((phrase) => phrase.tag_id === null || phrase.tag_id === undefined);
        } else if (selectedTagId !== null) {
            list = list.filter((phrase) => phrase.tag_id === selectedTagId);
        }

        if (search.trim()) {
            list = list.filter((phrase) => matchPhrase(phrase, search.trim()));
        }

        return list;
    }, [allPhrases, search, selectedTagId]);

    useEffect(() => {
        setActiveIdx(0);
    }, [filtered]);

    const activeTag = tags.find((tag) => tag.id === selectedTagId) ?? null;

    const tagPills = useMemo(
        () => [
            { id: null, name: '全部', count: allPhrases.length },
            ...tags.map((tag) => ({
                id: tag.id,
                name: tag.name,
                count: tagCounts[tag.id] ?? 0,
            })),
            { id: '__uncat__', name: '未分类', count: tagCounts.__uncat__ ?? 0 },
        ],
        [allPhrases.length, tagCounts, tags]
    );

    const sendPhrase = useCallback(
        async (phrase) => {
            if (!phrase) return;

            await incrementUseCount(phrase.id);

            if (batchMode) {
                setSentIds((prev) => new Set([...prev, phrase.id]));
                await reload();
                return;
            }

            try {
                await appWindow.hide();
                await new Promise((resolve) => setTimeout(resolve, 150));
                await invoke('paste_result', { text: phrase.content });
            } catch (error) {
                console.error('send error:', error);
            }

            await reload();
        },
        [batchMode, reload]
    );

    const deleteCurrentPhrase = useCallback(
        async (phrase) => {
            const label = phrase.title || phrase.content.slice(0, 20);
            if (!window.confirm(t('phrases.confirm_delete', { name: label }))) return;
            await deletePhrase(phrase.id);
            await reload();
        },
        [reload, t]
    );

    const handleListKeyDown = (event) => {
        if (view !== 'list') return;

        if (event.key === 'Escape') {
            event.preventDefault();
            void appWindow.close();
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIdx((index) => Math.min(index + 1, filtered.length - 1));
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIdx((index) => Math.max(index - 1, 0));
            return;
        }

        if (event.key === 'Enter' && filtered[activeIdx]) {
            event.preventDefault();
            void sendPhrase(filtered[activeIdx]);
        }
    };

    let content = null;

    if (view === 'edit') {
        content = (
            <EditView
                phrase={editPhrase}
                allTags={tags}
                onSaved={async () => {
                    await reload();
                    setView('list');
                    setEditPhrase(null);
                }}
                onCancel={() => {
                    setView('list');
                    setEditPhrase(null);
                }}
            />
        );
    } else if (view === 'tags') {
        content = (
            <TagsView
                onBack={() => setView('list')}
                onChanged={reload}
            />
        );
    } else {
        content = (
            <div
                style={styles.view}
                onKeyDown={handleListKeyDown}
                tabIndex={-1}
            >
                <WindowHeader
                    style={TRAY_WINDOW_HEADER_STYLE}
                    left={
                        <WindowHeaderTitle
                            icon={<HiOutlineCollection className='text-[15px] text-default-500' />}
                            style={TRAY_WINDOW_TITLE_STYLE}
                            textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                        >
                            常用语
                        </WindowHeaderTitle>
                    }
                    center={
                        <input
                            ref={searchRef}
                            style={styles.searchInput}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={handleListKeyDown}
                            placeholder={
                                filtered.length > 0 && search
                                    ? t('phrases.search_found', {
                                          n: filtered.length,
                                          preview: (filtered[0].title || filtered[0].content).slice(0, 10),
                                      })
                                    : t('phrases.search_placeholder')
                            }
                        />
                    }
                    right={
                        <>
                            <WindowHeaderButton
                                variant='primary'
                                style={TRAY_WINDOW_PRIMARY_BUTTON_STYLE}
                                onClick={() => {
                                    setEditPhrase(null);
                                    setView('edit');
                                }}
                            >
                                {t('phrases.add')}
                            </WindowHeaderButton>
                            <WindowHeaderCloseButton />
                        </>
                    }
                />

                <div style={styles.filterBar}>
                    <div style={styles.filterScroll}>
                        {tagPills.map((tag) => (
                            <button
                                key={String(tag.id)}
                                type='button'
                                style={styles.pill(selectedTagId === tag.id)}
                                onClick={() => {
                                    setSelectedTagId(tag.id);
                                    setBatchMode(false);
                                    setSentIds(new Set());
                                }}
                            >
                                <span>{tag.name}</span>
                                <span style={{ opacity: 0.7 }}>{tag.count}</span>
                            </button>
                        ))}
                    </div>

                    <div style={styles.filterActions}>
                        <button
                            type='button'
                            style={styles.secondaryButton}
                            onClick={() => setView('tags')}
                        >
                            <HiOutlineTag style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                            {t('phrases.tags')}
                        </button>
                        <button
                            type='button'
                            style={styles.secondaryButton}
                            onClick={() => {
                                setBatchMode((value) => !value);
                                setSentIds(new Set());
                            }}
                        >
                            {batchMode ? '结束连续发送' : '连续发送'}
                        </button>
                    </div>
                </div>

                <div style={styles.listWrap}>
                    {filtered.length === 0 ? (
                        <div style={styles.empty}>
                            {allPhrases.length === 0 ? t('phrases.empty_new') : t('phrases.empty_search')}
                        </div>
                    ) : (
                        <div style={styles.list}>
                            {filtered.map((phrase, index) => (
                                <PhraseRow
                                    key={phrase.id}
                                    phrase={phrase}
                                    tag={tagMap[phrase.tag_id]}
                                    query={search.trim()}
                                    active={index === activeIdx}
                                    hovered={hoverId === phrase.id}
                                    sent={sentIds.has(phrase.id)}
                                    batchMode={batchMode}
                                    onHover={() => {
                                        setHoverId(phrase.id);
                                        setActiveIdx(index);
                                    }}
                                    onSend={(item) => {
                                        void sendPhrase(item);
                                    }}
                                    onEdit={(item) => {
                                        setEditPhrase(item);
                                        setView('edit');
                                    }}
                                    onDelete={(item) => {
                                        void deleteCurrentPhrase(item);
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div style={styles.statusBar}>
                    <span>
                        {activeTag ? `${activeTag.name} · ` : ''}
                        {search ? `找到 ${filtered.length} 条` : `共 ${filtered.length} 条`}
                    </span>
                    {batchMode ? <span>连续发送中 · 已发 {sentIds.size} 条</span> : null}
                    <span style={styles.statusHint}>↑↓ 选择 · Enter {batchMode ? '发送' : '填入'} · Esc 关闭</span>
                </div>
            </div>
        );
    }

    return (
        <TrayWindow>
            <TrayWindowBody>
                <TrayWindowSurface>{content}</TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
