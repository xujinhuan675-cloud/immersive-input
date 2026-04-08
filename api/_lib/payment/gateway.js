import crypto from 'node:crypto';

import {
    normalizePaymentStatus,
    PAYMENT_BACKENDS,
    PAYMENT_ORDER_STATUS,
    PAYMENT_ORDER_TERMINAL_STATUSES,
} from './constants.js';
import { getPaymentRuntimeConfig } from './config.js';
import { canTransition } from './stateMachine.js';
import {
    createPaymentAttemptRecord,
    createPaymentOrderRecord,
    findPaymentOrderByExternalOrderId,
    findPaymentOrderById,
    findPaymentOrderByUserIdempotency,
    insertPaymentWebhookEvent,
    markPaymentWebhookEventProcessed,
    updatePaymentOrderAfterGatewayCreate,
    updatePaymentOrderStatus,
} from './store.js';
import { sub2ApiPayProvider } from './providers/sub2apipay.js';
import { customOrchestratorProvider } from './providers/customOrchestrator.js';
import { applyPaymentGrantForOrder } from '../billing/service.js';

const PROVIDERS = {
    [PAYMENT_BACKENDS.SUB2APIPAY]: sub2ApiPayProvider,
    [PAYMENT_BACKENDS.CUSTOM_ORCHESTRATOR]: customOrchestratorProvider,
};

function ensureProvider(backend) {
    const provider = PROVIDERS[backend];
    if (!provider) {
        throw new Error(`Unsupported payment backend: ${backend}`);
    }
    return provider;
}

function toAmountCents(amount, amountCents) {
    if (Number.isInteger(amountCents) && amountCents > 0) return amountCents;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error('Invalid amount');
    }
    return Math.round(numeric * 100);
}

function sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    return metadata;
}

function resolveBackend(providerHint, fallbackBackend) {
    const hint = String(providerHint || '').trim();
    if (hint === PAYMENT_BACKENDS.SUB2APIPAY) return hint;
    if (hint === PAYMENT_BACKENDS.CUSTOM_ORCHESTRATOR) return hint;
    return fallbackBackend;
}

async function reconcilePaidOrder(order, source = '') {
    if (!order) {
        return { order, grant: null };
    }
    const status = normalizePaymentStatus(order.status);
    if (status !== PAYMENT_ORDER_STATUS.PAID && status !== PAYMENT_ORDER_STATUS.COMPLETED) {
        return { order, grant: null };
    }

    const grant = await applyPaymentGrantForOrder(order);
    const shouldFinalize =
        status === PAYMENT_ORDER_STATUS.PAID &&
        (grant?.applied || grant?.reason === 'DUPLICATE_GRANT');
    if (!shouldFinalize || !canTransition(order.status, PAYMENT_ORDER_STATUS.COMPLETED)) {
        return { order, grant };
    }

    const updated = await updatePaymentOrderStatus(order.id, {
        status: PAYMENT_ORDER_STATUS.COMPLETED,
        failedReason: null,
        paidAt: order.paidAt || new Date().toISOString(),
        metadata: {
            ...(order.metadata || {}),
            billingGrant: {
                status: grant.applied ? 'applied' : 'duplicate',
                grantType: grant.grantType || null,
                reason: grant.reason || '',
                source,
                reconciledAt: new Date().toISOString(),
            },
        },
    });
    return { order: updated, grant };
}

export function getPaymentGatewayStatus() {
    const cfg = getPaymentRuntimeConfig();
    return {
        requestedBackend: cfg.requestedBackend,
        activeBackend: cfg.activeBackend,
        customOrchestratorEnabled: cfg.customOrchestratorEnabled,
        providers: {
            sub2apipay: {
                configured: !!cfg.sub2apipay.baseUrl,
            },
            customOrchestrator: {
                configured: true,
                adapter: cfg.customOrchestrator.adapter,
            },
        },
    };
}

export async function createUnifiedOrder(input) {
    const cfg = getPaymentRuntimeConfig();
    const backend = cfg.activeBackend;
    const provider = ensureProvider(backend);

    const userId = String(input.userId || '').trim();
    if (!userId) throw new Error('Missing userId');

    const idempotencyKey = String(input.idempotencyKey || '').trim() || null;
    if (idempotencyKey) {
        const existed = await findPaymentOrderByUserIdempotency(userId, idempotencyKey);
        if (existed) {
            const reconciled = await reconcilePaidOrder(existed, 'create-idempotency-reuse');
            return {
                order: reconciled.order,
                reused: true,
                grant: reconciled.grant,
            };
        }
    }

    const amountCents = toAmountCents(input.amount, input.amountCents);
    const order = await createPaymentOrderRecord({
        id: crypto.randomUUID(),
        userId,
        provider: provider.id,
        backend,
        orderType: String(input.orderType || 'topup'),
        amountCents,
        currency: String(input.currency || 'CNY').toUpperCase(),
        status: PAYMENT_ORDER_STATUS.PENDING,
        productCode: input.productCode || null,
        description: input.description || null,
        externalOrderId: null,
        checkoutUrl: null,
        idempotencyKey,
        metadata: sanitizeMetadata(input.metadata),
        failedReason: null,
    });

    try {
        const result = await provider.createPayment({ order });
        await createPaymentAttemptRecord({
            id: crypto.randomUUID(),
            orderId: order.id,
            backend,
            provider: provider.id,
            action: 'create',
            status: 'success',
            requestPayload: { order },
            responsePayload: result.raw || {},
        });

        const nextStatus = normalizePaymentStatus(result.status || PAYMENT_ORDER_STATUS.PENDING);
        const updated = await updatePaymentOrderAfterGatewayCreate(order.id, {
            status: canTransition(order.status, nextStatus) ? nextStatus : order.status,
            externalOrderId: result.providerOrderId || null,
            checkoutUrl: result.checkoutUrl || null,
            metadata: {
                ...(order.metadata || {}),
                gatewayCreateResponse: result.raw || {},
            },
            failedReason: null,
        });
        const reconciled = await reconcilePaidOrder(updated, 'create-gateway-sync');

        return {
            order: reconciled.order,
            reused: false,
            grant: reconciled.grant,
        };
    } catch (error) {
        await createPaymentAttemptRecord({
            id: crypto.randomUUID(),
            orderId: order.id,
            backend,
            provider: provider.id,
            action: 'create',
            status: 'failed',
            requestPayload: { order },
            responsePayload: { message: error?.message || 'Unknown error' },
        });

        await updatePaymentOrderStatus(order.id, {
            status: PAYMENT_ORDER_STATUS.FAILED,
            failedReason: error?.message || 'Create order failed',
            metadata: order.metadata || {},
        });
        throw error;
    }
}

export async function queryUnifiedOrder(orderId) {
    let order = await findPaymentOrderById(orderId);
    if (!order) {
        throw new Error('Order not found');
    }
    const initialReconciled = await reconcilePaidOrder(order, 'query-initial');
    order = initialReconciled.order;
    if (PAYMENT_ORDER_TERMINAL_STATUSES.has(order.status)) {
        return { order, synced: false, grant: initialReconciled.grant };
    }

    const provider = ensureProvider(order.backend);
    try {
        const result = await provider.queryPayment({ order });
        await createPaymentAttemptRecord({
            id: crypto.randomUUID(),
            orderId: order.id,
            backend: order.backend,
            provider: order.provider,
            action: 'query',
            status: 'success',
            requestPayload: { orderId: order.id, externalOrderId: order.externalOrderId },
            responsePayload: result.raw || {},
        });

        const nextStatus = normalizePaymentStatus(result.status || order.status);
        if (!canTransition(order.status, nextStatus)) {
            return { order, synced: true, grant: initialReconciled.grant };
        }

        order = await updatePaymentOrderStatus(order.id, {
            status: nextStatus,
            failedReason:
                nextStatus === PAYMENT_ORDER_STATUS.FAILED
                    ? (result.raw?.message || order.failedReason || 'Payment failed')
                    : null,
            paidAt: nextStatus === PAYMENT_ORDER_STATUS.PAID ? new Date().toISOString() : null,
            metadata: {
                ...(order.metadata || {}),
                gatewayQueryResponse: result.raw || {},
            },
        });
        const reconciled = await reconcilePaidOrder(order, 'query-gateway-sync');
        return { order: reconciled.order, synced: true, grant: reconciled.grant };
    } catch (error) {
        await createPaymentAttemptRecord({
            id: crypto.randomUUID(),
            orderId: order.id,
            backend: order.backend,
            provider: order.provider,
            action: 'query',
            status: 'failed',
            requestPayload: { orderId: order.id, externalOrderId: order.externalOrderId },
            responsePayload: { message: error?.message || 'Unknown error' },
        });
        throw error;
    }
}

export async function handleUnifiedWebhook(input) {
    const cfg = getPaymentRuntimeConfig();
    const backend = resolveBackend(input.providerHint, cfg.activeBackend);
    const provider = ensureProvider(backend);

    const verify = await provider.verifyWebhook({
        headers: input.headers || {},
        rawBody: input.rawBody || '',
        payload: input.payload || {},
    });
    if (!verify?.ok) {
        throw new Error(verify?.reason || 'Webhook signature invalid');
    }

    const event = provider.normalizeWebhookEvent({
        payload: input.payload || {},
        headers: input.headers || {},
        rawBody: input.rawBody || '',
    });

    const eventId = String(event.eventId || crypto.randomUUID());
    const inserted = await insertPaymentWebhookEvent({
        eventId,
        provider: provider.id,
        backend,
        orderId: event.orderId || null,
        externalOrderId: event.externalOrderId || null,
        signature: verify.signature || null,
        payload: event.rawPayload || input.payload || {},
    });
    if (!inserted) {
        return { ok: true, duplicated: true, eventId };
    }

    let order = null;
    if (event.orderId) {
        order = await findPaymentOrderById(String(event.orderId));
    }
    if (!order && event.externalOrderId) {
        order = await findPaymentOrderByExternalOrderId(String(event.externalOrderId));
    }

    if (order) {
        const nextStatus = normalizePaymentStatus(event.status || order.status);
        if (canTransition(order.status, nextStatus)) {
            order = await updatePaymentOrderStatus(order.id, {
                status: nextStatus,
                paidAt: nextStatus === PAYMENT_ORDER_STATUS.PAID ? new Date().toISOString() : null,
                failedReason:
                    nextStatus === PAYMENT_ORDER_STATUS.FAILED
                        ? (event.rawPayload?.message || order.failedReason || 'Payment failed')
                        : null,
                metadata: {
                    ...(order.metadata || {}),
                    webhookEventId: eventId,
                    webhookPayload: event.rawPayload || {},
                },
            });
        }
        const reconciled = await reconcilePaidOrder(order, 'webhook');
        order = reconciled.order;
    }

    await markPaymentWebhookEventProcessed(eventId);
    return {
        ok: true,
        duplicated: false,
        eventId,
        order,
    };
}
