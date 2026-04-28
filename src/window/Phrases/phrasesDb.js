/**
 * Phrases DB — SQLite persistence via tauri-plugin-sql
 * Tables: phrase_tags, phrases
 */
import Database from 'tauri-plugin-sql-api';
import { pinyin } from 'pinyin-pro';

let _db = null;

async function getDb() {
    if (_db) return _db;
    _db = await Database.load('sqlite:phrases.db');
    await _db.execute(`
        CREATE TABLE IF NOT EXISTS phrase_tags (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL DEFAULT '',
            color      TEXT    NOT NULL DEFAULT '#4a7cfa',
            icon       TEXT    NOT NULL DEFAULT '📝',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT    NOT NULL
        )
    `);
    // 清理全部损坏的邮笿种子标签（icon=📧 均为种子注入，非用户手动创建）
    // 同时把用户原有的“邮筱”标签图标更新为📧
    {
        const EMAIL_ICON = String.fromCodePoint(0x1F4E7); // 📧
        const YOU_CHAR = '\u90AE';                        // 邮
        const _tags = await _db.select('SELECT * FROM phrase_tags');
        for (const t of _tags) {
            if (t.icon === EMAIL_ICON) {
                // 种子注入的损坏标签：先解绑常用语再删除
                await _db.execute('UPDATE phrases SET tag_id=NULL WHERE tag_id=?', [t.id]);
                await _db.execute('DELETE FROM phrase_tags WHERE id=?', [t.id]);
            }
        }
        // 把以“邮”开头的标签（用户原有邮筱）图标更新为📧
        const _remaining = await _db.select('SELECT * FROM phrase_tags');
        for (const t of _remaining) {
            if (t.name.startsWith(YOU_CHAR) && t.icon !== EMAIL_ICON) {
                await _db.execute('UPDATE phrase_tags SET icon=? WHERE id=?', [EMAIL_ICON, t.id]);
            }
        }
    }
    // 将地址标签的图标统一更新为 🏠
    await _db.execute(`UPDATE phrase_tags SET icon = '🏠' WHERE name = '地址'`);
    // 删除同名重复标签（保留每个名称最小 id 的行）
    await _db.execute(`
        DELETE FROM phrase_tags WHERE id NOT IN (
            SELECT MIN(id) FROM phrase_tags GROUP BY name
        )
    `);
    // 建立唯一索引，防止未来再重复
    await _db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_phrase_tags_name ON phrase_tags(name)
    `);

    await _db.execute(`
        CREATE TABLE IF NOT EXISTS phrases (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id      INTEGER,
            title       TEXT    NOT NULL DEFAULT '',
            content     TEXT    NOT NULL DEFAULT '',
            pinyin_idx  TEXT    NOT NULL DEFAULT '',
            use_count   INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL,
            modified_at TEXT    NOT NULL
        )
    `);

    // 内置默认标签——按名称查重，不覆盖用户已有标签
    const DEFAULT_TAGS = [
        { name: '地址',     icon: '🏠', color: '#4caf50' },
        { name: '问候',     icon: '👋', color: '#e91e63' },
        { name: '工作',     icon: '💼', color: '#9c27b0' },
        { name: '回复',     icon: '💬', color: '#ff9800' },
        { name: '签名',     icon: '✍️', color: '#607d8b' },
        { name: '联系方式', icon: '📞', color: '#00bcd4' },
        { name: '个人信息', icon: '👤', color: '#4a7cfa' },
    ];
    for (const t of DEFAULT_TAGS) {
        const exists = await _db.select('SELECT id FROM phrase_tags WHERE name=?', [t.name]);
        if (exists.length === 0) {
            const maxRow = await _db.select('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM phrase_tags');
            const sortOrder = maxRow[0]?.next ?? 1;
            await _db.execute(
                'INSERT OR IGNORE INTO phrase_tags (name, color, icon, sort_order, created_at) VALUES (?,?,?,?,?)',
                [t.name, t.color, t.icon, sortOrder, now()]
            );
        }
    }

    return _db;
}

function now() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/** 生成拼音索引：原文 + 全拼 + 首字母，支持中英文混合 */
export function buildPinyinIndex(text) {
    if (!text) return '';
    try {
        // 全拼（无声调，连续）
        const full = pinyin(text, { toneType: 'none', separator: '', nonZh: 'consecutive' });
        // 首字母
        const initials = pinyin(text, { pattern: 'first', separator: '', nonZh: 'consecutive' });
        return `${text.toLowerCase()} ${full.toLowerCase()} ${initials.toLowerCase()}`;
    } catch {
        return text.toLowerCase();
    }
}

/** 判断一个 phrase 是否匹配查询词（原文 + 标题 + 拼音） */
function normalizePhraseQuery(query) {
    const normalizedQuery = String(query ?? '').toLowerCase().trim();
    return {
        query: normalizedQuery,
        noSpaceQuery: normalizedQuery.replace(/\s+/g, ''),
    };
}

function matchPhraseByScope(phrase, query, options = {}) {
    const { primaryOnly = false } = options;
    const { query: normalizedQuery, noSpaceQuery } = normalizePhraseQuery(query);

    if (!normalizedQuery) return true;

    const primaryText = String(phrase?.title || phrase?.content || '');
    const titleText = String(phrase?.title || '');
    const contentText = String(phrase?.content || '');
    const searchableTexts = primaryOnly ? [primaryText] : [contentText, titleText];

    if (searchableTexts.some((text) => String(text).toLowerCase().includes(normalizedQuery))) {
        return true;
    }

    const pinyinIndex = primaryOnly ? buildPinyinIndex(primaryText) : String(phrase?.pinyin_idx || '');
    if (pinyinIndex.includes(normalizedQuery)) return true;
    if (noSpaceQuery && pinyinIndex.includes(noSpaceQuery)) return true;

    return false;
}

export function matchPhrase(phrase, query) {
    return matchPhraseByScope(phrase, query);
}

export function matchPhrasePrimary(phrase, query) {
    return matchPhraseByScope(phrase, query, { primaryOnly: true });
}

// ─── Tags CRUD ───

export async function getTags() {
    const db = await getDb();
    return db.select('SELECT * FROM phrase_tags ORDER BY sort_order, id');
}

export async function addTag({ name, color = '#4a7cfa', icon = '📝' }) {
    const db = await getDb();
    const maxRow = await db.select('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM phrase_tags');
    const sortOrder = maxRow[0]?.next ?? 1;
    const r = await db.execute(
        'INSERT INTO phrase_tags (name, color, icon, sort_order, created_at) VALUES (?,?,?,?,?)',
        [name, color, icon, sortOrder, now()]
    );
    return r.lastInsertId;
}

export async function updateTag(id, { name, color, icon, sort_order }) {
    const db = await getDb();
    await db.execute(
        'UPDATE phrase_tags SET name=?, color=?, icon=?, sort_order=? WHERE id=?',
        [name, color, icon, sort_order, id]
    );
}

export async function deleteTag(id) {
    const db = await getDb();
    // 将该标签下的词条归为未分类
    await db.execute('UPDATE phrases SET tag_id=NULL WHERE tag_id=?', [id]);
    await db.execute('DELETE FROM phrase_tags WHERE id=?', [id]);
}

// ─── Phrases CRUD ───

export async function getPhrases(tagId = null) {
    const db = await getDb();
    if (tagId === null) {
        return db.select('SELECT * FROM phrases ORDER BY use_count DESC, modified_at DESC');
    }
    if (tagId === '__uncat__') {
        return db.select('SELECT * FROM phrases WHERE tag_id IS NULL ORDER BY use_count DESC, modified_at DESC');
    }
    return db.select(
        'SELECT * FROM phrases WHERE tag_id=? ORDER BY use_count DESC, modified_at DESC',
        [tagId]
    );
}

export async function addPhrase({ tag_id = null, title = '', content = '' }) {
    const db = await getDb();
    const idx = buildPinyinIndex((title + ' ' + content).trim());
    const ts = now();
    const r = await db.execute(
        'INSERT INTO phrases (tag_id, title, content, pinyin_idx, use_count, created_at, modified_at) VALUES (?,?,?,?,0,?,?)',
        [tag_id, title, content, idx, ts, ts]
    );
    return r.lastInsertId;
}

export async function updatePhrase(id, { tag_id, title, content }) {
    const db = await getDb();
    const idx = buildPinyinIndex((title + ' ' + content).trim());
    await db.execute(
        'UPDATE phrases SET tag_id=?, title=?, content=?, pinyin_idx=?, modified_at=? WHERE id=?',
        [tag_id, title, content, idx, now(), id]
    );
}

export async function deletePhrase(id) {
    const db = await getDb();
    await db.execute('DELETE FROM phrases WHERE id=?', [id]);
}

export async function incrementUseCount(id) {
    const db = await getDb();
    await db.execute('UPDATE phrases SET use_count=use_count+1, modified_at=? WHERE id=?', [now(), id]);
}

/** 获取标签下的词条数量 map */
export async function getTagCounts() {
    const db = await getDb();
    const rows = await db.select(`
        SELECT tag_id, COUNT(*) AS cnt FROM phrases GROUP BY tag_id
    `);
    const map = {};
    for (const r of rows) {
        map[r.tag_id ?? '__uncat__'] = r.cnt;
    }
    return map;
}

/** 全量加载供前端过滤（数据量不大时最高效） */
export async function getAllPhrases() {
    const db = await getDb();
    return db.select('SELECT * FROM phrases ORDER BY use_count DESC, modified_at DESC');
}

const PORTABLE_PHRASE_HEADERS = ['tag', 'title', 'content', 'use_count', 'created_at', 'modified_at'];
const PORTABLE_PHRASE_HEADER_ALIASES = {
    tag: ['tag', 'category', '分类', '标签'],
    title: ['title', '标题'],
    content: ['content', 'text', '内容'],
    use_count: ['use_count', 'use count', 'usage_count', '使用次数'],
    created_at: ['created_at', 'created at', '创建时间'],
    modified_at: ['modified_at', 'modified at', '更新时间', '修改时间'],
};

function escapePortableCsvCell(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const normalized = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}

function parsePortableCsv(text) {
    const source = String(text ?? '')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    if (!source) {
        return [];
    }

    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < source.length; i += 1) {
        const char = source[i];

        if (inQuotes) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
            continue;
        }

        if (char === ',') {
            row.push(cell);
            cell = '';
            continue;
        }

        if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }

        cell += char;
    }

    row.push(cell);
    if (row.length > 1 || row[0] !== '') {
        rows.push(row);
    }

    return rows.filter((nextRow) => nextRow.some((value) => value !== ''));
}

function normalizePortableHeader(value) {
    return String(value ?? '').trim().toLowerCase();
}

function findPortableHeaderIndex(headerMap, key) {
    const aliases = PORTABLE_PHRASE_HEADER_ALIASES[key] ?? [key];
    for (const alias of aliases) {
        const index = headerMap.get(normalizePortableHeader(alias));
        if (index !== undefined) {
            return index;
        }
    }
    return -1;
}

function readPortableCell(row, headerMap, key) {
    const index = findPortableHeaderIndex(headerMap, key);
    if (index < 0) {
        return '';
    }
    return String(row[index] ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizePortableTagName(value) {
    return String(value ?? '').trim();
}

function buildPortablePhraseKey({ tagName = '', title = '', content = '' }) {
    return JSON.stringify([normalizePortableTagName(tagName), String(title), String(content)]);
}

function normalizePortableTimestamp(value, fallback) {
    const text = String(value ?? '').trim();
    if (!text) {
        return fallback;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
        return text;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return parsed.toISOString().replace('T', ' ').substring(0, 19);
}

function parsePortableUseCount(value) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function exportPhrasesPortableCsv() {
    const [tags, phrases] = await Promise.all([getTags(), getAllPhrases()]);
    const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name ?? '']));

    const headerLine = PORTABLE_PHRASE_HEADERS.map(escapePortableCsvCell).join(',');
    const bodyLines = phrases.map((phrase) =>
        [
            phrase.tag_id === null || phrase.tag_id === undefined ? '' : tagNameById.get(phrase.tag_id) ?? '',
            phrase.title ?? '',
            phrase.content ?? '',
            phrase.use_count ?? 0,
            phrase.created_at ?? '',
            phrase.modified_at ?? '',
        ]
            .map(escapePortableCsvCell)
            .join(',')
    );

    return `\uFEFF${[headerLine, ...bodyLines].join('\r\n')}`;
}

export async function importPhrasesPortableCsv(text) {
    const rows = parsePortableCsv(text);
    if (rows.length === 0) {
        return { imported: 0, skipped: 0 };
    }

    const headerMap = new Map(rows[0].map((value, index) => [normalizePortableHeader(value), index]));
    if (findPortableHeaderIndex(headerMap, 'content') < 0) {
        throw new Error('Missing content column');
    }

    const db = await getDb();
    const [tags, phrases] = await Promise.all([getTags(), getAllPhrases()]);
    const tagNameById = new Map(tags.map((tag) => [tag.id, normalizePortableTagName(tag.name)]));
    const tagIdByName = new Map(tags.map((tag) => [normalizePortableTagName(tag.name), tag.id]));
    const existingKeys = new Set(
        phrases.map((phrase) =>
            buildPortablePhraseKey({
                tagName: tagNameById.get(phrase.tag_id) ?? '',
                title: phrase.title ?? '',
                content: phrase.content ?? '',
            })
        )
    );

    let imported = 0;
    let skipped = 0;

    for (const row of rows.slice(1)) {
        const title = readPortableCell(row, headerMap, 'title');
        const content = readPortableCell(row, headerMap, 'content');
        const tagName = normalizePortableTagName(readPortableCell(row, headerMap, 'tag'));

        if (!content.trim()) {
            skipped += 1;
            continue;
        }

        const duplicateKey = buildPortablePhraseKey({ tagName, title, content });
        if (existingKeys.has(duplicateKey)) {
            skipped += 1;
            continue;
        }

        let tagId = null;
        if (tagName) {
            tagId = tagIdByName.get(tagName) ?? null;
            if (tagId === null) {
                tagId = await addTag({
                    name: tagName,
                    icon: String.fromCodePoint(0x1F4DD),
                });
                tagIdByName.set(tagName, tagId);
                tagNameById.set(tagId, tagName);
            }
        }

        const createdAtFallback = now();
        const createdAt = normalizePortableTimestamp(
            readPortableCell(row, headerMap, 'created_at'),
            createdAtFallback
        );
        const modifiedAt = normalizePortableTimestamp(
            readPortableCell(row, headerMap, 'modified_at'),
            createdAt
        );
        const useCount = parsePortableUseCount(readPortableCell(row, headerMap, 'use_count'));
        const pinyinIndex = buildPinyinIndex((title + ' ' + content).trim());

        await db.execute(
            'INSERT INTO phrases (tag_id, title, content, pinyin_idx, use_count, created_at, modified_at) VALUES (?,?,?,?,?,?,?)',
            [tagId, title, content, pinyinIndex, useCount, createdAt, modifiedAt]
        );

        existingKeys.add(duplicateKey);
        imported += 1;
    }

    return { imported, skipped };
}
