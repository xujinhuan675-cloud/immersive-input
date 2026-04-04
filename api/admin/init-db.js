import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { getDbPool } from '../_lib/db.js';

function timingSafeEqualStr(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i += 1) {
        out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return out === 0;
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const body = await readJsonBody(req);
        const token = String(body.token || '');
        const expected = process.env.INIT_DB_TOKEN;
        if (!expected || !timingSafeEqualStr(token, expected)) {
            return sendJson(res, 401, { message: 'Unauthorized' });
        }

        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await client.query(`
                create table if not exists public.email_otps (
                  email text primary key,
                  code_hash text not null,
                  expires_at timestamptz not null,
                  cooldown_until timestamptz not null,
                  send_count int not null default 0,
                  last_sent_at timestamptz not null default now()
                );
            `);

            await client.query('alter table public.email_otps enable row level security;');
        } finally {
            client.release();
            await pool.end();
        }

        return sendJson(res, 200, { ok: true });
    } catch (e) {
        return sendJson(res, 500, { message: e?.message || 'Internal Server Error' });
    }
}
