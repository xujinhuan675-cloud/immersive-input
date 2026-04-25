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

const PORTABLE_VAULT_HEADERS = ['account', 'password', 'website', 'notes', 'tags', 'created_at', 'modified_at'];
const PORTABLE_VAULT_HEADER_ALIASES = {
    account: ['account', 'username', 'account / username', '账号', '账号 / 用户名', '账户', '账户 / 用户名'],
    password: ['password', '密码'],
    website: ['website', 'site', 'website / app', '网站', '网站 / 应用'],
    notes: ['notes', 'note', '备注'],
    tags: ['tags', 'labels', '标签'],
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
    const aliases = PORTABLE_VAULT_HEADER_ALIASES[key] ?? [key];
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

function normalizeVaultTagName(value) {
    return String(value ?? '').trim();
}

function parsePortableTags(value) {
    const text = String(value ?? '').trim();
    if (!text) {
        return [];
    }

    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return [...new Set(parsed.map(normalizeVaultTagName).filter(Boolean))];
            }
        } catch {
            // Fall back to delimiter-based parsing below.
        }
    }

    return [
        ...new Set(
            text
                .split(/\s*\/\s*|\s*\|\s*|[\n;,]+/)
                .map(normalizeVaultTagName)
                .filter(Boolean)
        ),
    ];
}

function buildPortableVaultKey({ account = '', password = '', website = '', notes = '', tags = [] }) {
    return JSON.stringify([
        String(account),
        String(password),
        String(website),
        String(notes),
        [...tags].map(normalizeVaultTagName).filter(Boolean).sort(),
    ]);
}

function hasVaultContent(record) {
    return [record.account, record.password, record.website, record.notes].some((value) => String(value ?? '').trim());
}

export async function exportVaultPortableCsv() {
    const records = await getRecords();

    const headerLine = PORTABLE_VAULT_HEADERS.map(escapePortableCsvCell).join(',');
    const bodyLines = records.map((record) =>
        [
            record.account ?? '',
            record.password ?? '',
            record.website ?? '',
            record.notes ?? '',
            Array.isArray(record.tags) ? record.tags.join(' / ') : '',
            record.created_at ?? '',
            record.modified_at ?? '',
        ]
            .map(escapePortableCsvCell)
            .join(',')
    );

    return `\uFEFF${[headerLine, ...bodyLines].join('\r\n')}`;
}

export async function importVaultPortableCsv(text) {
    const rows = parsePortableCsv(text);
    if (rows.length === 0) {
        return { imported: 0, skipped: 0 };
    }

    const headerMap = new Map(rows[0].map((value, index) => [normalizePortableHeader(value), index]));
    if (findPortableHeaderIndex(headerMap, 'account') < 0 && findPortableHeaderIndex(headerMap, 'password') < 0) {
        throw new Error('Missing vault columns');
    }

    const db = await getDb();
    const records = await getRecords();
    const existingKeys = new Set(
        records.map((record) =>
            buildPortableVaultKey({
                account: record.account ?? '',
                password: record.password ?? '',
                website: record.website ?? '',
                notes: record.notes ?? '',
                tags: Array.isArray(record.tags) ? record.tags : [],
            })
        )
    );

    let imported = 0;
    let skipped = 0;

    for (const row of rows.slice(1)) {
        const account = readPortableCell(row, headerMap, 'account');
        const password = readPortableCell(row, headerMap, 'password');
        const website = readPortableCell(row, headerMap, 'website');
        const notes = readPortableCell(row, headerMap, 'notes');
        const tags = parsePortableTags(readPortableCell(row, headerMap, 'tags'));

        if (!hasVaultContent({ account, password, website, notes })) {
            skipped += 1;
            continue;
        }

        const duplicateKey = buildPortableVaultKey({ account, password, website, notes, tags });
        if (existingKeys.has(duplicateKey)) {
            skipped += 1;
            continue;
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

        await db.execute(
            'INSERT INTO vault_records (account, password, website, notes, tags, created_at, modified_at) VALUES (?,?,?,?,?,?,?)',
            [account, password, website, notes, JSON.stringify(tags), createdAt, modifiedAt]
        );

        existingKeys.add(duplicateKey);
        imported += 1;
    }

    return { imported, skipped };
}
