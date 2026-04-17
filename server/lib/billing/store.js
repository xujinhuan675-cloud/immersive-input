import { getDbClient } from '../db.js';

let _initialized = false;

function toJson(v) {
    if (!v) return {};
    if (typeof v === 'string') {
        try {
            return JSON.parse(v);
        } catch {
            return {};
        }
    }
    if (typeof v === 'object') return v;
    return {};
}

function mapProfile(row) {
    if (!row) return null;
    return {
        userId: row.user_id,
        tier: row.tier,
        status: row.status,
        subscriptionExpiresAt: row.subscription_expires_at,
        dailyQuota: Number(row.daily_quota || 0),
        dailyQuotaUsed: Number(row.daily_quota_used || 0),
        quotaResetAt: row.quota_reset_at,
        bonusCredits: Number(row.bonus_credits || 0),
        aiRequestsTotal: Number(row.ai_requests_total || 0),
        lastConsumedAt: row.last_consumed_at,
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

export async function ensureBillingTables() {
    if (_initialized) return;
    await withClient(async (client) => {
        await client.query(`
            create table if not exists public.billing_profiles (
                user_id text primary key,
                tier text not null default 'free',
                status text not null default 'active',
                subscription_expires_at timestamptz,
                daily_quota int not null default 20,
                daily_quota_used int not null default 0,
                quota_reset_at date not null default current_date,
                bonus_credits bigint not null default 0,
                ai_requests_total bigint not null default 0,
                last_consumed_at timestamptz,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
            );

            create table if not exists public.billing_usage_events (
                id text primary key,
                user_id text not null,
                source text not null,
                units int not null,
                charge_type text not null,
                idempotency_key text,
                metadata jsonb not null default '{}'::jsonb,
                created_at timestamptz not null default now()
            );
            create unique index if not exists idx_billing_usage_user_idempotency
                on public.billing_usage_events(user_id, idempotency_key)
                where idempotency_key is not null;

            create table if not exists public.billing_ledger_entries (
                id text primary key,
                user_id text not null,
                entry_type text not null,
                amount_units bigint not null,
                order_id text,
                grant_key text,
                metadata jsonb not null default '{}'::jsonb,
                created_at timestamptz not null default now()
            );
            create unique index if not exists idx_billing_ledger_grant_key
                on public.billing_ledger_entries(grant_key);
        `);
    });
    _initialized = true;
}

export async function getBillingProfile(userId) {
    await ensureBillingTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            'select * from public.billing_profiles where user_id = $1 limit 1',
            [userId]
        );
        return mapProfile(rows[0]);
    });
}

export async function createBillingProfile(input) {
    await ensureBillingTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                insert into public.billing_profiles
                    (user_id, tier, status, subscription_expires_at, daily_quota, daily_quota_used, quota_reset_at, bonus_credits, ai_requests_total, last_consumed_at)
                values
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                on conflict (user_id) do update
                set updated_at = now()
                returning *
            `,
            [
                input.userId,
                input.tier,
                input.status,
                input.subscriptionExpiresAt || null,
                input.dailyQuota,
                input.dailyQuotaUsed || 0,
                input.quotaResetAt,
                input.bonusCredits || 0,
                input.aiRequestsTotal || 0,
                input.lastConsumedAt || null,
            ]
        );
        return mapProfile(rows[0]);
    });
}

export async function updateBillingProfile(input) {
    await ensureBillingTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                update public.billing_profiles
                set
                    tier = $2,
                    status = $3,
                    subscription_expires_at = $4,
                    daily_quota = $5,
                    daily_quota_used = $6,
                    quota_reset_at = $7,
                    bonus_credits = $8,
                    ai_requests_total = $9,
                    last_consumed_at = $10,
                    updated_at = now()
                where user_id = $1
                returning *
            `,
            [
                input.userId,
                input.tier,
                input.status,
                input.subscriptionExpiresAt || null,
                input.dailyQuota,
                input.dailyQuotaUsed,
                input.quotaResetAt,
                input.bonusCredits,
                input.aiRequestsTotal,
                input.lastConsumedAt || null,
            ]
        );
        return mapProfile(rows[0]);
    });
}

export async function findUsageEventByIdempotency(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    await ensureBillingTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                select * from public.billing_usage_events
                where user_id = $1 and idempotency_key = $2
                limit 1
            `,
            [userId, idempotencyKey]
        );
        return rows[0] || null;
    });
}

export async function insertUsageEvent(input) {
    await ensureBillingTables();
    return withClient(async (client) => {
        const params = [
            input.id,
            input.userId,
            input.source,
            input.units,
            input.chargeType,
            input.idempotencyKey || null,
            JSON.stringify(input.metadata || {}),
        ];
        const sql = input.idempotencyKey
            ? `
                insert into public.billing_usage_events
                    (id, user_id, source, units, charge_type, idempotency_key, metadata)
                values
                    ($1, $2, $3, $4, $5, $6, $7::jsonb)
                on conflict (user_id, idempotency_key) do nothing
                returning id
            `
            : `
                insert into public.billing_usage_events
                    (id, user_id, source, units, charge_type, idempotency_key, metadata)
                values
                    ($1, $2, $3, $4, $5, $6, $7::jsonb)
                on conflict (id) do nothing
                returning id
            `;
        const { rows } = await client.query(sql, params);
        return rows.length > 0;
    });
}

export async function insertLedgerEntry(input) {
    await ensureBillingTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                insert into public.billing_ledger_entries
                    (id, user_id, entry_type, amount_units, order_id, grant_key, metadata)
                values
                    ($1, $2, $3, $4, $5, $6, $7::jsonb)
                on conflict (grant_key) do nothing
                returning id
            `,
            [
                input.id,
                input.userId,
                input.entryType,
                input.amountUnits,
                input.orderId || null,
                input.grantKey || null,
                JSON.stringify(input.metadata || {}),
            ]
        );
        return rows.length > 0;
    });
}

export async function getBillingLedgerByOrder(orderId) {
    await ensureBillingTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                select id, user_id, entry_type, amount_units, order_id, grant_key, metadata, created_at
                from public.billing_ledger_entries
                where order_id = $1
                order by created_at asc
            `,
            [orderId]
        );
        return rows.map((row) => ({
            id: row.id,
            userId: row.user_id,
            entryType: row.entry_type,
            amountUnits: Number(row.amount_units || 0),
            orderId: row.order_id,
            grantKey: row.grant_key,
            metadata: toJson(row.metadata),
            createdAt: row.created_at,
        }));
    });
}
