/**
 * Vault DB — SQLite persistence via tauri-plugin-sql
 * Table: vault_records (id, account, password, website, notes, tags, created_at, modified_at)
 */
import Database from 'tauri-plugin-sql-api';

let _db = null;

async function getDb() {
    if (_db) return _db;
    _db = await Database.load('sqlite:vault.db');
    await _db.execute(`
        CREATE TABLE IF NOT EXISTS vault_records (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            account     TEXT    NOT NULL DEFAULT '',
            password    TEXT    NOT NULL DEFAULT '',
            website     TEXT    NOT NULL DEFAULT '',
            notes       TEXT    NOT NULL DEFAULT '',
            tags        TEXT    NOT NULL DEFAULT '[]',
            created_at  TEXT    NOT NULL,
            modified_at TEXT    NOT NULL
        )
    `);
    return _db;
}

function now() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 获取所有记录，按修改时间降序
 */
export async function getRecords() {
    try {
        const db = await getDb();
        const rows = await db.select(
            'SELECT * FROM vault_records ORDER BY modified_at DESC'
        );
        // tags 字段存为 JSON 字符串，反序列化
        return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
    } catch (e) {
        console.error('[vaultDb] getRecords failed:', e);
        return [];
    }
}

/**
 * 新增记录
 * @param {{ account, password, website, notes, tags }} record
 * @returns {Promise<number>} 新记录 id
 */
export async function addRecord({ account = '', password = '', website = '', notes = '', tags = [] }) {
    const ts = now();
    try {
        const db = await getDb();
        const result = await db.execute(
            'INSERT INTO vault_records (account, password, website, notes, tags, created_at, modified_at) VALUES (?,?,?,?,?,?,?)',
            [account, password, website, notes, JSON.stringify(tags), ts, ts]
        );
        return result.lastInsertId;
    } catch (e) {
        console.error('[vaultDb] addRecord failed:', e);
        throw e;
    }
}

/**
 * 更新记录
 * @param {number} id
 * @param {{ account, password, website, notes, tags }} fields
 */
export async function updateRecord(id, { account, password, website, notes, tags }) {
    const ts = now();
    try {
        const db = await getDb();
        await db.execute(
            'UPDATE vault_records SET account=?, password=?, website=?, notes=?, tags=?, modified_at=? WHERE id=?',
            [account, password, website, notes, JSON.stringify(tags), ts, id]
        );
    } catch (e) {
        console.error('[vaultDb] updateRecord failed:', e);
        throw e;
    }
}

/**
 * 删除记录
 * @param {number} id
 */
export async function deleteRecord(id) {
    try {
        const db = await getDb();
        await db.execute('DELETE FROM vault_records WHERE id=?', [id]);
    } catch (e) {
        console.error('[vaultDb] deleteRecord failed:', e);
        throw e;
    }
}

/**
 * 获取所有已用过的标签（去重排序）
 */
export async function getAllTags() {
    try {
        const records = await getRecords();
        const tagSet = new Set();
        records.forEach((r) => r.tags.forEach((t) => tagSet.add(t)));
        return [...tagSet].sort();
    } catch {
        return [];
    }
}
