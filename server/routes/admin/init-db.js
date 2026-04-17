import { readJsonBody, sendJson, setCors } from '../../lib/http.js';
import { getDbPool } from '../../lib/db.js';

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
            // 创建表
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

            // 启用 RLS（幂等操作）
            await client.query('alter table public.email_otps enable row level security;');

            // 创建索引（幂等操作）
            await client.query('create index if not exists idx_email_otps_expires_at on public.email_otps(expires_at);');
            await client.query('create index if not exists idx_email_otps_cooldown_until on public.email_otps(cooldown_until);');

            await client.query(`
                create table if not exists public.invite_profiles (
                  user_id text primary key,
                  invite_code text not null unique,
                  metadata jsonb not null default '{}'::jsonb,
                  created_at timestamptz not null default now(),
                  updated_at timestamptz not null default now()
                );
                create unique index if not exists idx_invite_profiles_invite_code
                  on public.invite_profiles(invite_code);

                create table if not exists public.invite_relations (
                  id text primary key,
                  invite_code text not null,
                  inviter_user_id text not null,
                  invitee_user_id text not null unique,
                  status text not null default 'pending',
                  rewarded_order_id text,
                  rewarded_credits bigint not null default 0,
                  rewarded_at timestamptz,
                  metadata jsonb not null default '{}'::jsonb,
                  created_at timestamptz not null default now(),
                  updated_at timestamptz not null default now()
                );
                create index if not exists idx_invite_relations_inviter_user_id
                  on public.invite_relations(inviter_user_id);
                create index if not exists idx_invite_relations_invitee_user_id
                  on public.invite_relations(invitee_user_id);
                create index if not exists idx_invite_relations_rewarded_order_id
                  on public.invite_relations(rewarded_order_id);
            `);
        } finally {
            client.release();
            await pool.end();
        }

        return sendJson(res, 200, { ok: true });
    } catch (e) {
        return sendJson(res, 500, { message: e?.message || 'Internal Server Error' });
    }
}
