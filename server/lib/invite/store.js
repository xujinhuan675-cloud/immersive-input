import { getDbClient } from '../db.js';

let _initialized = false;

function toJson(value) {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return {};
        }
    }
    if (typeof value === 'object') return value;
    return {};
}

function mapInviteProfile(row) {
    if (!row) return null;
    return {
        userId: row.user_id,
        inviteCode: row.invite_code,
        metadata: toJson(row.metadata),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapInviteRelation(row) {
    if (!row) return null;
    return {
        id: row.id,
        inviteCode: row.invite_code,
        inviterUserId: row.inviter_user_id,
        inviteeUserId: row.invitee_user_id,
        status: row.status,
        rewardedOrderId: row.rewarded_order_id,
        rewardedCredits: Number(row.rewarded_credits || 0),
        rewardedAt: row.rewarded_at,
        metadata: toJson(row.metadata),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function withClient(cb) {
    const client = await getDbClient();
    try {
        return await cb(client);
    } finally {
        client.release();
    }
}

export async function ensureInviteTables() {
    if (_initialized) return;
    await withClient(async (client) => {
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
    });
    _initialized = true;
}

export async function getInviteProfile(userId) {
    await ensureInviteTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            'select * from public.invite_profiles where user_id = $1 limit 1',
            [userId]
        );
        return mapInviteProfile(rows[0]);
    });
}

export async function findInviteProfileByCode(inviteCode) {
    await ensureInviteTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            'select * from public.invite_profiles where invite_code = $1 limit 1',
            [inviteCode]
        );
        return mapInviteProfile(rows[0]);
    });
}

export async function createInviteProfile(input) {
    await ensureInviteTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                insert into public.invite_profiles (user_id, invite_code, metadata)
                values ($1, $2, $3::jsonb)
                on conflict (user_id) do update
                set updated_at = now()
                returning *
            `,
            [input.userId, input.inviteCode, JSON.stringify(input.metadata || {})]
        );
        return mapInviteProfile(rows[0]);
    });
}

export async function getInviteRelationByInviteeUserId(inviteeUserId) {
    await ensureInviteTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            'select * from public.invite_relations where invitee_user_id = $1 limit 1',
            [inviteeUserId]
        );
        return mapInviteRelation(rows[0]);
    });
}

export async function createInviteRelation(input) {
    await ensureInviteTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                insert into public.invite_relations
                    (id, invite_code, inviter_user_id, invitee_user_id, status, rewarded_order_id, rewarded_credits, rewarded_at, metadata)
                values
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
                on conflict (invitee_user_id) do nothing
                returning *
            `,
            [
                input.id,
                input.inviteCode,
                input.inviterUserId,
                input.inviteeUserId,
                input.status || 'pending',
                input.rewardedOrderId || null,
                input.rewardedCredits || 0,
                input.rewardedAt || null,
                JSON.stringify(input.metadata || {}),
            ]
        );
        return mapInviteRelation(rows[0]);
    });
}

export async function getInviteStatsByInviterUserId(inviterUserId) {
    await ensureInviteTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                select
                    count(*)::bigint as invited_count,
                    count(*) filter (where status = 'pending')::bigint as pending_count,
                    coalesce(sum(case when status = 'rewarded' then rewarded_credits else 0 end), 0)::bigint as rewarded_credits
                from public.invite_relations
                where inviter_user_id = $1
            `,
            [inviterUserId]
        );
        const row = rows[0] || {};
        return {
            invitedCount: Number(row.invited_count || 0),
            pendingCount: Number(row.pending_count || 0),
            rewardedCredits: Number(row.rewarded_credits || 0),
        };
    });
}
