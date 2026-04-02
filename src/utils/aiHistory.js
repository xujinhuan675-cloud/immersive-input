/**
 * AI History — SQLite persistence via tauri-plugin-sql
 * Table: ai_history (id, type, source, result, extra, ts)
 */
import Database from 'tauri-plugin-sql-api';

let _db = null;

async function getDb() {
    if (_db) return _db;
    _db = await Database.load('sqlite:ai_history.db');
    await _db.execute(`
        CREATE TABLE IF NOT EXISTS ai_history (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            type    TEXT    NOT NULL,
            source  TEXT,
            result  TEXT,
            extra   TEXT,
            ts      TEXT    NOT NULL
        )
    `);
    return _db;
}

function now() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Save one AI interaction record.
 * @param {'lightai'|'explain'|'chat'} type
 * @param {string} source  - original text / user message
 * @param {string} result  - AI output
 * @param {object} [extra] - any additional JSON data
 */
export async function saveHistory(type, source, result, extra = null) {
    try {
        const db = await getDb();
        await db.execute(
            'INSERT INTO ai_history (type, source, result, extra, ts) VALUES (?,?,?,?,?)',
            [type, source ?? '', result ?? '', extra ? JSON.stringify(extra) : null, now()]
        );
    } catch (e) {
        console.error('[aiHistory] saveHistory failed:', e);
    }
}

/**
 * Get recent records for a given type.
 * @param {'lightai'|'explain'|'chat'|'all'} type
 * @param {number} limit
 */
export async function getHistory(type, limit = 50) {
    try {
        const db = await getDb();
        if (type === 'all') {
            return await db.select('SELECT * FROM ai_history ORDER BY id DESC LIMIT ?', [limit]);
        }
        return await db.select(
            'SELECT * FROM ai_history WHERE type = ? ORDER BY id DESC LIMIT ?',
            [type, limit]
        );
    } catch (e) {
        console.error('[aiHistory] getHistory failed:', e);
        return [];
    }
}

/**
 * Count records for a type.
 */
export async function countHistory(type) {
    try {
        const db = await getDb();
        const rows =
            type === 'all'
                ? await db.select('SELECT COUNT(*) as cnt FROM ai_history')
                : await db.select('SELECT COUNT(*) as cnt FROM ai_history WHERE type = ?', [type]);
        return rows[0]?.cnt ?? 0;
    } catch {
        return 0;
    }
}

/**
 * Clear records — by type or all.
 */
export async function clearHistory(type) {
    try {
        const db = await getDb();
        if (type === 'all') {
            await db.execute('DELETE FROM ai_history');
        } else {
            await db.execute('DELETE FROM ai_history WHERE type = ?', [type]);
        }
    } catch (e) {
        console.error('[aiHistory] clearHistory failed:', e);
    }
}

/**
 * Export records as formatted Markdown text.
 */
export async function exportHistoryMd(type) {
    const records = await getHistory(type, 500);
    if (!records.length) return '暂无历史记录。';
    const lines = [`# AI 历史记录（${type}）\n导出时间：${now()}\n\n---\n`];
    records.forEach((r, i) => {
        lines.push(`## ${i + 1}. ${r.ts}`);
        lines.push(`**原文：**\n${r.source ?? ''}`);
        lines.push(`**结果：**\n${r.result ?? ''}`);
        lines.push('\n---\n');
    });
    return lines.join('\n');
}
