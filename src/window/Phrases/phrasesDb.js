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
export function matchPhrase(phrase, query) {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    // 直接文本匹配
    if (phrase.content.toLowerCase().includes(q)) return true;
    if (phrase.title.toLowerCase().includes(q)) return true;
    // 拼音索引匹配（去掉空格后匹配首字母连写）
    const noSpace = q.replace(/\s+/g, '');
    if (phrase.pinyin_idx.includes(q)) return true;
    if (noSpace && phrase.pinyin_idx.includes(noSpace)) return true;
    return false;
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
