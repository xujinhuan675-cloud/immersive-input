import { appWindow, currentMonitor, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { AiOutlineClose } from 'react-icons/ai';
import { HiOutlineCollection, HiOutlinePencilAlt, HiOutlineTag, HiOutlineTrash } from 'react-icons/hi';
import { FiDownload } from 'react-icons/fi';

import WindowHeader, { WindowHeaderCloseButton, WindowHeaderTitle } from '../../components/WindowHeader';
import {
    TRAY_WINDOW_HEADER_STYLE,
    TRAY_WINDOW_PRIMARY_BUTTON_STYLE,
    TRAY_WINDOW_TITLE_STYLE,
    TRAY_WINDOW_TITLE_TEXT_STYLE,
    TrayWindow,
    TrayWindowBody,
    TrayWindowSurface,
} from '../../components/TrayWindow';
import { useToastStyle } from '../../hooks';
import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { exportTableCsv } from '../../utils/exportTable';
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
} from '../Phrases/phrasesDb';

const QUICK_COLLAPSED_HEIGHT = 96;
const QUICK_MAX_HEIGHT = 408;
const QUICK_ROW_ESTIMATED_HEIGHT = 50;
const QUICK_EMPTY_HEIGHT = 72;
const QUICK_WINDOW_WIDTH = 372;
const PANEL_WINDOW_WIDTH = 408;
const PANEL_WINDOW_HEIGHT = 480;
const QUICK_MANAGE_LABEL = '\u7ba1\u7406';
const QUICK_CLOSE_LABEL = '\u5173\u95ed';
const QUICK_VISIBLE_TAGS = 5;

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
        border: '1px solid rgba(203, 213, 225, 0.92)',
        background: 'rgba(255, 255, 255, 0.94)',
        padding: '0 12px',
        outline: 'none',
        fontSize: '13px',
        color: '#0f172a',
    },
    quickHeaderRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 8px 5px',
        flexShrink: 0,
        cursor: 'grab',
    },
    quickListWrap: {
        overflowY: 'auto',
        padding: '0 8px 6px',
    },
    quickListPanel: {
        border: '1px solid rgba(226, 232, 240, 0.92)',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.96)',
        overflow: 'hidden',
        boxShadow: '0 10px 28px -28px rgba(15, 23, 42, 0.22)',
    },
    quickList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
    },
    quickItem: (active, last = false) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px 10px',
        borderBottom: last ? 'none' : '1px solid rgba(241, 245, 249, 0.96)',
        background: active ? 'rgba(241, 245, 249, 0.98)' : 'transparent',
        boxShadow: active ? 'inset 2px 0 0 rgba(15, 23, 42, 0.88)' : 'none',
        cursor: 'pointer',
        transition: 'background 120ms ease, box-shadow 120ms ease',
    }),
    quickItemMain: {
        minWidth: 0,
        flex: 1,
    },
    quickItemPrimary: {
        color: '#0f172a',
        fontSize: '13px',
        fontWeight: 500,
        lineHeight: 1.35,
        display: '-webkit-box',
        overflow: 'hidden',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 1,
    },
    quickItemSecondary: {
        marginTop: '2px',
        color: '#475569',
        fontSize: '12px',
        lineHeight: 1.35,
        display: '-webkit-box',
        overflow: 'hidden',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 1,
    },
    item: (active) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '9px 11px',
        borderRadius: '12px',
        border: `1px solid ${active ? 'rgba(15, 23, 42, 0.16)' : 'rgba(226, 232, 240, 0.88)'}`,
        background: active ? 'rgba(241, 245, 249, 0.96)' : 'rgba(255, 255, 255, 0.92)',
        boxShadow: active ? '0 14px 30px -28px rgba(15, 23, 42, 0.3)' : 'none',
        cursor: 'pointer',
    }),
    itemMain: {
        minWidth: 0,
        flex: 1,
    },
    itemTitle: {
        marginBottom: '2px',
        fontSize: '11px',
        color: '#94a3b8',
        lineHeight: 1.3,
    },
    itemContent: {
        color: '#0f172a',
        fontSize: '13px',
        lineHeight: 1.45,
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
        border: `1px solid ${danger ? 'rgba(254, 205, 211, 0.92)' : 'rgba(226, 232, 240, 0.92)'}`,
        background: danger ? 'rgba(255, 241, 242, 0.92)' : 'rgba(255, 255, 255, 0.92)',
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
    quickEmpty: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '48px',
        padding: '12px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '12px',
        lineHeight: 1.6,
    },
    quickTagBar: {
        minWidth: 0,
        flex: 1,
    },
    quickTagScroll: {
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        minWidth: 0,
    },
    quickPill: (active) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '28px',
        padding: '0 8px',
        borderRadius: '999px',
        border: `1px solid ${active ? 'rgba(15, 23, 42, 0.84)' : 'rgba(226, 232, 240, 0.92)'}`,
        background: active ? '#0f172a' : 'rgba(255, 255, 255, 0.94)',
        color: active ? '#ffffff' : '#475569',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
    }),
    quickCloseButton: (hovered) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        borderRadius: '8px',
        border: 'none',
        background: hovered ? 'rgba(15, 23, 42, 0.06)' : 'transparent',
        color: hovered ? '#334155' : '#64748b',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 120ms ease, color 120ms ease',
    }),
    quickDock: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 8px 0',
        borderTop: '1px solid rgba(226, 232, 240, 0.72)',
        background: 'rgba(248, 250, 252, 0.82)',
        cursor: 'grab',
    },
    quickSearchWrap: {
        flex: 1,
        minWidth: 0,
    },
    quickSearchInput: {
        height: '36px',
        width: '100%',
        borderRadius: '10px',
        border: '1px solid rgba(203, 213, 225, 0.92)',
        background: 'rgba(255, 255, 255, 0.96)',
        padding: '0 12px',
        outline: 'none',
        fontSize: '13px',
        color: '#0f172a',
    },
    quickManageButton: (expanded) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: expanded ? '6px' : '0',
        height: '36px',
        minWidth: expanded ? '70px' : '36px',
        padding: expanded ? '0 11px' : '0',
        borderRadius: '10px',
        border: '1px solid rgba(226, 232, 240, 0.92)',
        background: 'rgba(255, 255, 255, 0.94)',
        color: '#475569',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        flexShrink: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        transition: 'min-width 120ms ease, padding 120ms ease, gap 120ms ease',
    }),
    quickManageLabel: (expanded) => ({
        maxWidth: expanded ? '32px' : '0',
        overflow: 'hidden',
        opacity: expanded ? 1 : 0,
        whiteSpace: 'nowrap',
        fontSize: '12px',
        transition: 'max-width 120ms ease, opacity 120ms ease',
    }),
    subtleButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '38px',
        padding: '0 12px',
        borderRadius: '11px',
        border: '1px solid rgba(226, 232, 240, 0.92)',
        background: 'rgba(255, 255, 255, 0.92)',
        color: '#475569',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        flexShrink: 0,
    },
    filterBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '42px',
        padding: '7px 12px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.72)',
        background: 'rgba(248, 250, 252, 0.72)',
    },
    filterScroll: {
        display: 'flex',
        minWidth: 0,
        flex: 1,
        gap: '6px',
        overflowX: 'auto',
        paddingBottom: '1px',
    },
    pill: (active) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        height: '28px',
        padding: '0 10px',
        borderRadius: '999px',
        border: `1px solid ${active ? 'rgba(15, 23, 42, 0.8)' : 'rgba(226, 232, 240, 0.92)'}`,
        background: active ? '#0f172a' : 'rgba(255, 255, 255, 0.9)',
        color: active ? '#ffffff' : '#475569',
        fontSize: '12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    }),
    listWrap: {
        flex: 1,
        overflow: 'auto',
        padding: '8px 12px 10px',
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    statusBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '9px 12px',
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
    statusActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
    },
    primaryButton: {
        height: '38px',
        minWidth: '84px',
        padding: '0 14px',
        borderRadius: '11px',
        border: '1px solid rgba(15, 23, 42, 0.84)',
        background: '#0f172a',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
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
        border: '1px solid rgba(203, 213, 225, 0.92)',
        borderRadius: '10px',
        background: 'rgba(255, 255, 255, 0.92)',
        padding: '9px 10px',
        outline: 'none',
        fontSize: '13px',
        color: '#0f172a',
    },
    textarea: {
        minHeight: '250px',
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
        border: primary ? '1px solid rgba(15, 23, 42, 0.84)' : '1px solid rgba(226, 232, 240, 0.92)',
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
        padding: '9px 11px',
        borderRadius: '12px',
        border: '1px solid rgba(226, 232, 240, 0.88)',
        background: 'rgba(255, 255, 255, 0.92)',
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
        border: '1px solid rgba(203, 213, 225, 0.92)',
        borderRadius: '9px',
        background: 'rgba(255, 255, 255, 0.92)',
        padding: '6px 9px',
        fontSize: '13px',
        outline: 'none',
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

function QuickPhraseRow({ phrase, tag, query, active, last, onHover, onSend, t }) {
    const primaryText = phrase.title || phrase.content;
    const secondaryText = phrase.title ? phrase.content : null;

    return (
        <div
            data-quick-interactive='true'
            style={styles.quickItem(active, last)}
            onMouseEnter={onHover}
            onClick={() => {
                void onSend(phrase);
            }}
        >
            <div style={styles.quickItemMain}>
                <div style={styles.quickItemPrimary}>
                    <HighlightText
                        text={primaryText}
                        query={query}
                    />
                </div>
                {secondaryText ? (
                    <div style={styles.quickItemSecondary}>
                        <HighlightText
                            text={secondaryText}
                            query={query}
                        />
                    </div>
                ) : null}
                {false ? (
                    <div style={styles.quickItemMeta}>
                        <span>{tag ? tag.name : t('phrases.uncategorized')}</span>
                        <span>{`已用 ${phrase.use_count || 0}`}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function PhraseRow({ phrase, tag, query, active, hovered, onHover, onPrimary, onEdit, onDelete, t }) {
    return (
        <div
            style={styles.item(active)}
            onMouseEnter={onHover}
            onClick={() => onPrimary(phrase)}
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
                    <span>{tag ? tag.name : t('phrases.uncategorized')}</span>
                    <span>{`已用 ${phrase.use_count || 0}`}</span>
                </div>
            </div>

            {hovered || active ? (
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
                        {t('phrases.edit')}
                    </button>
                    <button
                        type='button'
                        style={styles.itemActionButton(true)}
                        onClick={() => onDelete(phrase)}
                    >
                        <HiOutlineTrash />
                        {t('phrases.delete')}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function TagsView({ onBack, onChanged, onClose }) {
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
                center={
                    <WindowHeaderTitle
                        icon={<HiOutlineTag className='text-[15px] text-default-500' />}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {t('phrases.manage_tags')}
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderCloseButton onClick={onClose} />}
            />

            <div
                className='phrases-inline-scroll'
                style={styles.managerList}
            >
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
                                style={styles.itemActionButton(false)}
                                onClick={() => void saveEdit(tag)}
                            >
                                {t('phrases.tags_save')}
                            </button>
                            <button
                                type='button'
                                style={styles.itemActionButton(false)}
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
                                    onClick={() => {
                                        setEditingId(tag.id);
                                        setEditingName(tag.name);
                                    }}
                                >
                                    {t('phrases.edit')}
                                </button>
                                <button
                                    type='button'
                                    style={styles.itemActionButton(true)}
                                    onClick={() => void removeTag(tag)}
                                >
                                    {t('phrases.delete')}
                                </button>
                            </div>
                        </div>
                    )
                )}
            </div>

            <div style={styles.footer}>
                <button
                    type='button'
                    style={styles.footerButton(false)}
                    onClick={() => {
                        setCreating(false);
                        setNewTagName('');
                        onBack();
                    }}
                >
                    {t('common.cancel')}
                </button>
                <button
                    type='button'
                    style={{ ...styles.footerButton(true), ...TRAY_WINDOW_PRIMARY_BUTTON_STYLE }}
                    onClick={() => {
                        if (creating) {
                            void createTag();
                            return;
                        }

                        setCreating(true);
                    }}
                    disabled={creating && !newTagName.trim()}
                >
                    {creating ? t('phrases.tags_save') : t('phrases.add')}
                </button>
            </div>
        </div>
    );
}

function EditView({ phrase, allTags, onSaved, onCancel, onClose }) {
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

    const handleSave = async () => {
        if (!content.trim()) return;

        setSaving(true);
        try {
            let nextTagId = tagId;
            if (newTagMode && newTagName.trim()) {
                nextTagId = await addTag({ name: newTagName.trim() });
            }

            const payload = { title: title.trim(), content: content.trim(), tag_id: nextTagId };

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
                right={<WindowHeaderCloseButton onClick={onClose} />}
            />

            <div
                className='phrases-inline-scroll'
                style={styles.formScroll}
            >
                <div style={styles.section}>
                    <label style={styles.label}>{t('phrases.category')}</label>
                    {newTagMode ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                style={{ ...styles.field, flex: 1 }}
                                value={newTagName}
                                onChange={(event) => setNewTagName(event.target.value)}
                                placeholder={t('phrases.new_tag_placeholder')}
                            />
                            <button
                                type='button'
                                style={styles.subtleButton}
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
                            onChange={(event) => {
                                if (event.target.value === '__new__') {
                                    setNewTagMode(true);
                                    setTagId(null);
                                } else {
                                    setNewTagMode(false);
                                    setTagId(event.target.value ? Number(event.target.value) : null);
                                }
                            }}
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
                    onClick={() => void handleSave()}
                    disabled={!content.trim() || saving}
                >
                    {saving ? t('phrases.saving') : t('phrases.save')}
                </button>
            </div>
        </div>
    );
}

export default function PhrasesInline() {
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [view, setView] = useState('quick');
    const [editPhrase, setEditPhrase] = useState(null);
    const [tags, setTags] = useState([]);
    const [allPhrases, setAllPhrases] = useState([]);
    const [tagCounts, setTagCounts] = useState({});
    const [selectedTagId, setSelectedTagId] = useState(null);
    const [search, setSearch] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const [hoverId, setHoverId] = useState(null);
    const [manageHovered, setManageHovered] = useState(false);
    const [quickCloseHovered, setQuickCloseHovered] = useState(false);
    const searchRef = useRef(null);
    const quickResultsRef = useRef(null);
    const quickTagBarRef = useRef(null);
    const quickTagMeasureRef = useRef(null);
    const [quickResultsMeasuredHeight, setQuickResultsMeasuredHeight] = useState(0);
    const [quickTagBarWidth, setQuickTagBarWidth] = useState(0);

    const resetQuickState = useCallback(() => {
        setView('quick');
        setSearch('');
        setSelectedTagId(null);
        setActiveIdx(0);
        setHoverId(null);
        setManageHovered(false);
        setQuickCloseHovered(false);
    }, []);

    const handleQuickDragStart = useCallback((event) => {
        if (event.button !== 0) {
            return;
        }

        const target = event.target;

        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (target.closest('button, input, textarea, select, option, a, [data-quick-interactive="true"]')) {
            return;
        }

        void appWindow.startDragging().catch(() => {});
    }, []);

    const dismiss = useCallback(async () => {
        resetQuickState();
        try {
            await invoke('phrase_inline_dismiss');
        } catch (_) {}
        await appWindow.hide();
    }, [resetQuickState]);

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
        if (view !== 'quick' && view !== 'manage') return undefined;
        const timer = setTimeout(() => searchRef.current?.focus(), 80);
        return () => clearTimeout(timer);
    }, [view]);

    useEffect(() => {
        const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
            if (focused && view === 'quick') {
                setSearch('');
                setSelectedTagId(null);
                setActiveIdx(0);
                setHoverId(null);
                setManageHovered(false);
                setQuickCloseHovered(false);
                setTimeout(() => searchRef.current?.focus(), 60);
            }
        });

        return () => {
            void unlisten.then((fn) => fn());
        };
    }, [view]);

    useEffect(() => {
        if (view !== 'quick' || !quickTagBarRef.current || typeof ResizeObserver === 'undefined') {
            return undefined;
        }

        const node = quickTagBarRef.current;
        const updateWidth = () => {
            setQuickTagBarWidth(node.clientWidth);
        };

        updateWidth();

        const observer = new ResizeObserver(() => {
            updateWidth();
        });

        observer.observe(node);

        return () => observer.disconnect();
    }, [view]);

    const tagMap = useMemo(() => {
        const map = {};
        tags.forEach((tag) => {
            map[tag.id] = tag;
        });
        return map;
    }, [tags]);

    const managePhrases = useMemo(() => {
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

    const quickCandidates = useMemo(() => {
        let list = allPhrases;

        if (selectedTagId === '__uncat__') {
            list = list.filter((phrase) => phrase.tag_id === null || phrase.tag_id === undefined);
        } else if (selectedTagId !== null) {
            list = list.filter((phrase) => phrase.tag_id === selectedTagId);
        }

        if (!search.trim() && selectedTagId === null) {
            return [];
        }

        if (search.trim()) {
            list = list.filter((phrase) => matchPhrase(phrase, search.trim()));
        }

        return list;
    }, [allPhrases, search, selectedTagId]);

    useEffect(() => {
        setActiveIdx(0);
    }, [quickCandidates]);

    const tagPills = useMemo(
        () => [
            { id: null, name: '全部', count: allPhrases.length },
            ...tags.map((tag) => ({
                id: tag.id,
                name: tag.name,
                count: tagCounts[tag.id] ?? 0,
            })),
            { id: '__uncat__', name: t('phrases.uncategorized'), count: tagCounts.__uncat__ ?? 0 },
        ],
        [allPhrases.length, tagCounts, t, tags]
    );

    const activeTag = tags.find((tag) => tag.id === selectedTagId) ?? null;
    const handleExport = useCallback(async () => {
        if (managePhrases.length === 0) {
            toast.error(t('phrases.export_empty'), { style: toastStyle });
            return;
        }

        try {
            const date = new Date().toISOString().slice(0, 10);
            const exported = await exportTableCsv({
                defaultFileName: `${t('phrases.export_filename')}-${date}.csv`,
                columns: [
                    { header: t('phrases.category'), value: (row) => tagMap[row.tag_id]?.name ?? t('phrases.uncategorized') },
                    { header: t('phrases.title_field'), value: (row) => row.title },
                    { header: t('phrases.content_field'), value: (row) => row.content },
                    { header: t('phrases.export_use_count'), value: (row) => row.use_count ?? 0 },
                    { header: t('phrases.export_created_at'), value: (row) => row.created_at },
                    { header: t('phrases.export_modified_at'), value: (row) => row.modified_at },
                ],
                rows: managePhrases,
            });

            if (exported) {
                toast.success(t('phrases.export_success'), { style: toastStyle });
            }
        } catch (error) {
            toast.error(t('phrases.export_failed') + (error?.message ?? error), { style: toastStyle });
        }
    }, [managePhrases, t, tagMap, toastStyle]);

    const quickTagCandidates = useMemo(() => {
        const tagUsage = new Map();

        allPhrases.forEach((phrase) => {
            if (phrase.tag_id === null || phrase.tag_id === undefined) {
                return;
            }

            const previous = tagUsage.get(phrase.tag_id) ?? { useCount: 0, phraseCount: 0 };
            tagUsage.set(phrase.tag_id, {
                useCount: previous.useCount + (phrase.use_count ?? 0),
                phraseCount: previous.phraseCount + 1,
            });
        });

        const sorted = [...tags].sort((left, right) => {
            const leftUsage = tagUsage.get(left.id) ?? { useCount: 0, phraseCount: 0 };
            const rightUsage = tagUsage.get(right.id) ?? { useCount: 0, phraseCount: 0 };

            if (rightUsage.useCount !== leftUsage.useCount) {
                return rightUsage.useCount - leftUsage.useCount;
            }

            if (rightUsage.phraseCount !== leftUsage.phraseCount) {
                return rightUsage.phraseCount - leftUsage.phraseCount;
            }

            return (left.sort_order ?? 0) - (right.sort_order ?? 0);
        });

        return sorted;
    }, [allPhrases, tags]);

    const measureQuickTagWidth = useCallback((label) => {
        if (typeof document === 'undefined') {
            return Math.max(label.length * 12 + 18, 54);
        }

        if (!quickTagMeasureRef.current) {
            quickTagMeasureRef.current = document.createElement('canvas');
        }

        const context = quickTagMeasureRef.current.getContext('2d');

        if (!context) {
            return Math.max(label.length * 12 + 18, 54);
        }

        context.font = '500 12px "Microsoft YaHei UI", "Segoe UI", sans-serif';
        return Math.ceil(context.measureText(label).width) + 20;
    }, []);

    const quickTagPills = useMemo(() => {
        if (quickTagCandidates.length === 0) {
            return [];
        }

        const visible = [];
        let usedWidth = 0;

        quickTagCandidates.forEach((tag) => {
            if (visible.length >= QUICK_VISIBLE_TAGS) {
                return;
            }

            const nextWidth = measureQuickTagWidth(tag.name);
            const gap = visible.length > 0 ? 6 : 0;

            if (visible.length > 0 && usedWidth + gap + nextWidth > quickTagBarWidth) {
                return;
            }

            visible.push(tag);
            usedWidth += gap + nextWidth;
        });

        if (visible.length === 0) {
            visible.push(...quickTagCandidates.slice(0, 1));
        }

        if (
            selectedTagId !== null &&
            selectedTagId !== '__uncat__' &&
            !visible.some((tag) => tag.id === selectedTagId)
        ) {
            const selectedTag = tags.find((tag) => tag.id === selectedTagId);

            if (selectedTag) {
                if (visible.length >= QUICK_VISIBLE_TAGS) {
                    visible[visible.length - 1] = selectedTag;
                } else {
                    visible.push(selectedTag);
                }
            }
        }

        return visible.filter(Boolean);
    }, [measureQuickTagWidth, quickTagBarWidth, quickTagCandidates, selectedTagId, tags]);
    const showQuickResults = search.trim().length > 0 || selectedTagId !== null;

    useEffect(() => {
        if (!showQuickResults) {
            setQuickResultsMeasuredHeight(0);
            return undefined;
        }

        const frame = window.requestAnimationFrame(() => {
            const measuredHeight = quickResultsRef.current?.scrollHeight ?? 0;
            setQuickResultsMeasuredHeight(
                Math.min(measuredHeight || QUICK_EMPTY_HEIGHT, QUICK_MAX_HEIGHT - QUICK_COLLAPSED_HEIGHT)
            );
        });

        return () => window.cancelAnimationFrame(frame);
    }, [quickCandidates.length, search, selectedTagId, showQuickResults]);

    const quickResultsHeight = useMemo(() => {
        if (!showQuickResults) {
            return 0;
        }

        if (quickResultsMeasuredHeight > 0) {
            return quickResultsMeasuredHeight;
        }

        if (quickCandidates.length === 0) {
            return QUICK_EMPTY_HEIGHT;
        }

        const visibleRowsHeight =
            quickCandidates.length * QUICK_ROW_ESTIMATED_HEIGHT + Math.max(quickCandidates.length - 1, 0) * 5;
        return Math.min(visibleRowsHeight + 8, QUICK_MAX_HEIGHT - QUICK_COLLAPSED_HEIGHT);
    }, [quickCandidates.length, quickResultsMeasuredHeight, showQuickResults]);

    const targetWindowFrame = useMemo(() => {
        if (view === 'quick') {
            return {
                height: Math.min(QUICK_COLLAPSED_HEIGHT + quickResultsHeight, QUICK_MAX_HEIGHT),
            };
        }

        return {
            width: PANEL_WINDOW_WIDTH,
            height: PANEL_WINDOW_HEIGHT,
        };
    }, [quickResultsHeight, view]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const [position, size, monitor] = await Promise.all([
                        appWindow.outerPosition(),
                        appWindow.outerSize(),
                        currentMonitor(),
                    ]);
                    const scaleFactor = monitor?.scaleFactor ?? 1;
                    const currentX = position.x / scaleFactor;
                    const currentY = position.y / scaleFactor;
                    const currentWidth = size.width / scaleFactor;
                    const currentHeight = size.height / scaleFactor;
                    const nextWidth =
                        view === 'quick'
                            ? Math.max(QUICK_WINDOW_WIDTH, currentWidth)
                            : Math.max(targetWindowFrame.width, currentWidth);
                    const anchorX = currentX + currentWidth / 2;
                    const anchorBottom = currentY + currentHeight;
                    let nextX = anchorX - nextWidth / 2;
                    let nextY = anchorBottom - targetWindowFrame.height;

                    if (monitor) {
                        const monitorX = monitor.position.x / scaleFactor;
                        const monitorY = monitor.position.y / scaleFactor;
                        const monitorWidth = monitor.size.width / scaleFactor;
                        const monitorHeight = monitor.size.height / scaleFactor;
                        nextX = Math.min(Math.max(nextX, monitorX), monitorX + monitorWidth - nextWidth);
                        nextY = Math.min(
                            Math.max(nextY, monitorY),
                            monitorY + monitorHeight - targetWindowFrame.height
                        );
                    }

                    await appWindow.setSize(new LogicalSize(nextWidth, targetWindowFrame.height));
                    await appWindow.setPosition(new LogicalPosition(nextX, nextY));
                } catch (_) {}
            })();
        }, 0);

        return () => clearTimeout(timer);
    }, [targetWindowFrame.height, targetWindowFrame.width, view]);

    const fillPhrase = useCallback(
        async (phrase) => {
            if (!phrase) return;

            try {
                await incrementUseCount(phrase.id);
                await invoke('phrase_inline_fill', { content: phrase.content });
                resetQuickState();
            } catch (error) {
                console.error('fill error:', error);
            }
        },
        [resetQuickState]
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

    const handleQuickKeyDown = (event) => {
        if (event.defaultPrevented) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            void dismiss();
            return;
        }

        if (event.key === 'ArrowDown' && quickCandidates.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            setActiveIdx((index) => Math.min(index + 1, quickCandidates.length - 1));
            return;
        }

        if (event.key === 'ArrowUp' && quickCandidates.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            setActiveIdx((index) => Math.max(index - 1, 0));
            return;
        }

        if (event.key === 'Enter' && quickCandidates[activeIdx]) {
            event.preventDefault();
            event.stopPropagation();
            void fillPhrase(quickCandidates[activeIdx]);
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
                    setView('manage');
                    setEditPhrase(null);
                }}
                onCancel={() => {
                    setView('manage');
                    setEditPhrase(null);
                }}
                onClose={dismiss}
            />
        );
    } else if (view === 'tags') {
        content = (
            <TagsView
                onBack={() => setView('manage')}
                onChanged={reload}
                onClose={dismiss}
            />
        );
    } else if (view === 'manage') {
        content = (
            <div style={styles.view}>
                <WindowHeader
                    style={TRAY_WINDOW_HEADER_STYLE}
                    left={
                        <WindowHeaderTitle
                            icon={<HiOutlineCollection className='text-[15px] text-default-500' />}
                            style={TRAY_WINDOW_TITLE_STYLE}
                            textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                        >
                            管理常用语
                        </WindowHeaderTitle>
                    }
                    center={
                        <input
                            ref={searchRef}
                            style={styles.searchInput}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('phrases.search_placeholder')}
                        />
                    }
                    right={<WindowHeaderCloseButton onClick={dismiss} />}
                />

                <div style={styles.filterBar}>
                    <div
                        className='phrases-inline-scroll-hidden'
                        style={styles.filterScroll}
                    >
                        {tagPills.map((tag) => (
                            <button
                                key={String(tag.id)}
                                type='button'
                                style={styles.pill(selectedTagId === tag.id)}
                                onClick={() => setSelectedTagId(tag.id)}
                            >
                                <span>{tag.name}</span>
                                <span style={{ opacity: 0.7 }}>{tag.count}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        type='button'
                        style={styles.subtleButton}
                        onClick={() => setView('tags')}
                    >
                        <HiOutlineTag style={{ marginRight: 4 }} />
                        {t('phrases.tags')}
                    </button>
                </div>

                <div
                    className='phrases-inline-scroll'
                    style={styles.listWrap}
                >
                    {managePhrases.length === 0 ? (
                        <div style={styles.empty}>
                            {allPhrases.length === 0 ? t('phrases.empty_new') : t('phrases.empty_search')}
                        </div>
                    ) : (
                        <div style={styles.list}>
                            {managePhrases.map((phrase) => (
                                <PhraseRow
                                    key={phrase.id}
                                    phrase={phrase}
                                    tag={tagMap[phrase.tag_id]}
                                    query={search.trim()}
                                    active={hoverId === phrase.id}
                                    hovered={hoverId === phrase.id}
                                    onHover={() => setHoverId(phrase.id)}
                                    onPrimary={(item) => {
                                        setEditPhrase(item);
                                        setView('edit');
                                    }}
                                    onEdit={(item) => {
                                        setEditPhrase(item);
                                        setView('edit');
                                    }}
                                    onDelete={(item) => void deleteCurrentPhrase(item)}
                                    t={t}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div style={styles.statusBar}>
                    <span>
                        {activeTag ? `${activeTag.name} · ` : ''}
                        {search ? `找到 ${managePhrases.length} 条` : `共 ${managePhrases.length} 条`}
                    </span>
                    <div style={styles.statusActions}>
                        <button
                            type='button'
                            style={styles.subtleButton}
                            onClick={() => {
                                void handleExport();
                            }}
                        >
                            <FiDownload style={{ marginRight: 4 }} />
                            {t('phrases.export')}
                        </button>
                        <button
                            type='button'
                            style={styles.subtleButton}
                            onClick={resetQuickState}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type='button'
                            style={{ ...styles.primaryButton, ...TRAY_WINDOW_PRIMARY_BUTTON_STYLE }}
                            onClick={() => {
                                setEditPhrase(null);
                                setView('edit');
                            }}
                        >
                            {t('phrases.add')}
                        </button>
                    </div>
                </div>
            </div>
        );
    } else {
        content = (
            <div
                style={styles.view}
                onMouseDown={handleQuickDragStart}
            >
                {showQuickResults ? (
                    <div
                        className='phrases-inline-scroll'
                        style={{
                            ...styles.quickListWrap,
                            maxHeight: `${quickResultsHeight}px`,
                        }}
                    >
                        <div ref={quickResultsRef}>
                            <div style={styles.quickListPanel}>
                                {quickCandidates.length === 0 ? (
                                    <div style={styles.quickEmpty}>
                                        {allPhrases.length === 0 ? t('phrases.empty_new') : t('phrases.empty_search')}
                                    </div>
                                ) : (
                                    <div style={styles.quickList}>
                                        {quickCandidates.map((phrase, index) => (
                                            <QuickPhraseRow
                                                key={phrase.id}
                                                phrase={phrase}
                                                tag={tagMap[phrase.tag_id]}
                                                query={search.trim()}
                                                active={index === activeIdx}
                                                last={index === quickCandidates.length - 1}
                                                onHover={() => setActiveIdx(index)}
                                                onSend={fillPhrase}
                                                t={t}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}

                <div style={styles.quickHeaderRow}>
                    <div
                        ref={quickTagBarRef}
                        style={styles.quickTagBar}
                    >
                        <div style={styles.quickTagScroll}>
                            {quickTagPills.map((tag) => (
                                <button
                                    key={String(tag.id)}
                                    type='button'
                                    style={styles.quickPill(selectedTagId === tag.id)}
                                    onClick={() => {
                                        setSelectedTagId((currentTagId) => (currentTagId === tag.id ? null : tag.id));
                                        setActiveIdx(0);
                                    }}
                                >
                                    {tag.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        type='button'
                        title={QUICK_CLOSE_LABEL}
                        style={styles.quickCloseButton(quickCloseHovered)}
                        onMouseEnter={() => setQuickCloseHovered(true)}
                        onMouseLeave={() => setQuickCloseHovered(false)}
                        onFocus={() => setQuickCloseHovered(true)}
                        onBlur={() => setQuickCloseHovered(false)}
                        onClick={dismiss}
                    >
                        <AiOutlineClose className='text-[15px]' />
                    </button>
                </div>

                <div style={styles.quickDock}>
                    <div style={styles.quickSearchWrap}>
                        <input
                            ref={searchRef}
                            style={styles.quickSearchInput}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={handleQuickKeyDown}
                            placeholder={t('phrases.search_placeholder')}
                        />
                    </div>
                    <button
                        type='button'
                        title={QUICK_MANAGE_LABEL}
                        style={styles.quickManageButton(manageHovered)}
                        onMouseEnter={() => setManageHovered(true)}
                        onMouseLeave={() => setManageHovered(false)}
                        onFocus={() => setManageHovered(true)}
                        onBlur={() => setManageHovered(false)}
                        onClick={() => {
                            setView('manage');
                            setHoverId(null);
                            setManageHovered(false);
                            setQuickCloseHovered(false);
                        }}
                    >
                        <HiOutlineCollection className='text-[15px]' />
                        <span style={styles.quickManageLabel(manageHovered)}>{QUICK_MANAGE_LABEL}</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <TrayWindow>
            <TrayWindowBody style={view === 'quick' ? { padding: '6px 8px 0' } : undefined}>
                <TrayWindowSurface
                    style={
                        view === 'quick'
                            ? {
                                  borderRadius: '12px',
                                  boxShadow:
                                      '0 14px 28px -26px rgba(15, 23, 42, 0.32), 0 1px 5px rgba(255, 255, 255, 0.4) inset',
                              }
                            : undefined
                    }
                >
                    {content}
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
