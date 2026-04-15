import { getDbClient } from '../db.js';

let _initialized = false;

function toJson(value) {
    if (value === undefined || value === null) return {};
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

function mapOrder(row) {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        backend: row.backend,
        orderType: row.order_type,
        amountCents: Number(row.amount_cents || 0),
        currency: row.currency,
        status: row.status,
        productCode: row.product_code,
        description: row.description,
        externalOrderId: row.external_order_id,
        checkoutUrl: row.checkout_url,
        idempotencyKey: row.idempotency_key,
        metadata: toJson(row.metadata),
        failedReason: row.failed_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paidAt: row.paid_at,
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

async function ensurePaymentTables() {
    if (_initialized) return;
    await withClient(async (client) => {
        await client.query(`
            create table if not exists public.payment_orders (
                id text primary key,
                user_id text not null,
                provider text not null,
                backend text not null,
                order_type text not null,
                amount_cents bigint not null,
                currency text not null,
                status text not null,
                product_code text,
                description text,
                external_order_id text,
                checkout_url text,
                idempotency_key text,
                metadata jsonb not null default '{}'::jsonb,
                failed_reason text,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                paid_at timestamptz
            );
            create unique index if not exists idx_payment_orders_user_idempotency
                on public.payment_orders(user_id, idempotency_key)
                where idempotency_key is not null;
            create index if not exists idx_payment_orders_external_order_id
                on public.payment_orders(external_order_id);

            create table if not exists public.payment_attempts (
                id text primary key,
                order_id text not null,
                backend text not null,
                provider text not null,
                action text not null,
                status text not null,
                request_payload jsonb not null default '{}'::jsonb,
                response_payload jsonb not null default '{}'::jsonb,
                created_at timestamptz not null default now()
            );
            create index if not exists idx_payment_attempts_order_id
                on public.payment_attempts(order_id);

            create table if not exists public.payment_webhook_events (
                event_id text primary key,
                provider text not null,
                backend text not null,
                order_id text,
                external_order_id text,
                signature text,
                payload jsonb not null default '{}'::jsonb,
                processed boolean not null default false,
                created_at timestamptz not null default now(),
                processed_at timestamptz
            );
            create index if not exists idx_payment_webhook_events_order_id
                on public.payment_webhook_events(order_id);
        `);
    });
    _initialized = true;
}

export async function createPaymentOrderRecord(input) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                insert into public.payment_orders
                    (id, user_id, provider, backend, order_type, amount_cents, currency, status, product_code, description, external_order_id, checkout_url, idempotency_key, metadata, failed_reason)
                values
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
                returning *
            `,
            [
                input.id,
                input.userId,
                input.provider,
                input.backend,
                input.orderType,
                input.amountCents,
                input.currency,
                input.status,
                input.productCode || null,
                input.description || null,
                input.externalOrderId || null,
                input.checkoutUrl || null,
                input.idempotencyKey || null,
                JSON.stringify(input.metadata || {}),
                input.failedReason || null,
            ]
        );
        return mapOrder(rows[0]);
    });
}

export async function findPaymentOrderById(orderId) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            'select * from public.payment_orders where id = $1 limit 1',
            [orderId]
        );
        return mapOrder(rows[0]);
    });
}

export async function findPaymentOrderByExternalOrderId(externalOrderId) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            'select * from public.payment_orders where external_order_id = $1 limit 1',
            [externalOrderId]
        );
        return mapOrder(rows[0]);
    });
}

export async function findLaterSuccessfulSubscriptionOrders({
    userId,
    excludeOrderId = '',
    afterTimestamp = null,
} = {}) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        const timestamp = afterTimestamp || '1970-01-01T00:00:00.000Z';
        const { rows } = await client.query(
            `
                select *
                from public.payment_orders
                where user_id = $1
                  and order_type = 'subscription'
                  and id <> $2
                  and status in ('PAID', 'COMPLETED')
                  and coalesce(paid_at, created_at) > $3::timestamptz
                order by coalesce(paid_at, created_at) asc
            `,
            [userId, excludeOrderId || '', timestamp]
        );
        return rows.map((row) => mapOrder(row));
    });
}

export async function findPaymentOrderByUserIdempotency(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    await ensurePaymentTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                select * from public.payment_orders
                where user_id = $1 and idempotency_key = $2
                limit 1
            `,
            [userId, idempotencyKey]
        );
        return mapOrder(rows[0]);
    });
}

export async function updatePaymentOrderAfterGatewayCreate(orderId, input) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                update public.payment_orders
                set
                    status = $2,
                    external_order_id = $3,
                    checkout_url = $4,
                    metadata = $5::jsonb,
                    failed_reason = $6,
                    updated_at = now()
                where id = $1
                returning *
            `,
            [
                orderId,
                input.status,
                input.externalOrderId || null,
                input.checkoutUrl || null,
                JSON.stringify(input.metadata || {}),
                input.failedReason || null,
            ]
        );
        return mapOrder(rows[0]);
    });
}

export async function updatePaymentOrderStatus(orderId, input) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                update public.payment_orders
                set
                    status = $2,
                    failed_reason = $3,
                    metadata = $4::jsonb,
                    paid_at = coalesce($5, paid_at),
                    external_order_id = coalesce($6, external_order_id),
                    updated_at = now()
                where id = $1
                returning *
            `,
            [
                orderId,
                input.status,
                input.failedReason || null,
                JSON.stringify(input.metadata || {}),
                input.paidAt || null,
                input.externalOrderId || null,
            ]
        );
        return mapOrder(rows[0]);
    });
}

export async function createPaymentAttemptRecord(input) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        await client.query(
            `
                insert into public.payment_attempts
                    (id, order_id, backend, provider, action, status, request_payload, response_payload)
                values
                    ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
            `,
            [
                input.id,
                input.orderId,
                input.backend,
                input.provider,
                input.action,
                input.status,
                JSON.stringify(input.requestPayload || {}),
                JSON.stringify(input.responsePayload || {}),
            ]
        );
    });
}

export async function insertPaymentWebhookEvent(input) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        const { rows } = await client.query(
            `
                insert into public.payment_webhook_events
                    (event_id, provider, backend, order_id, external_order_id, signature, payload, processed)
                values
                    ($1, $2, $3, $4, $5, $6, $7::jsonb, false)
                on conflict (event_id) do nothing
                returning event_id
            `,
            [
                input.eventId,
                input.provider,
                input.backend,
                input.orderId || null,
                input.externalOrderId || null,
                input.signature || null,
                JSON.stringify(input.payload || {}),
            ]
        );
        return rows.length > 0;
    });
}

export async function markPaymentWebhookEventProcessed(eventId) {
    await ensurePaymentTables();
    return withClient(async (client) => {
        await client.query(
            `
                update public.payment_webhook_events
                set processed = true, processed_at = now()
                where event_id = $1
            `,
            [eventId]
        );
    });
}
