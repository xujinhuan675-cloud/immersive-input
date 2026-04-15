import crypto from 'node:crypto';

import {
    normalizePaymentStatus,
    PAYMENT_BACKEND,
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
import { customOrchestratorProvider } from './providers/customOrchestrator.js';
import { buildDeterministicWebhookEventId } from './custom/webhookSecurity.js';
import { applyPaymentGrantForOrder, reversePaymentGrantForOrder } from '../billing/service.js';

function ensureProvider() {
    return customOrchestratorProvider;
}

export function generatePaymentOrderId(prefix = 'po') {
    const safePrefix = String(prefix || 'po')
        .toLowerCase()
        .replace(/[^a-z0-9_*|-]/g, '')
        .slice(0, 4) || 'po';
    const timePart = Date.now().toString(36);
    const randomPart = crypto.randomBytes(10).toString('hex');
    return `${safePrefix}${timePart}${randomPart}`.slice(0, 32);
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
                beforeProfile: grant.beforeProfile || null,
                afterProfile: grant.afterProfile || null,
                creditedUnits: grant.creditedUnits || 0,
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
    const runtimeStatus =
        typeof customOrchestratorProvider.getRuntimeStatus === 'function'
            ? customOrchestratorProvider.getRuntimeStatus()
            : { ready: true };
    return {
        requestedBackend: cfg.requestedBackend,
        activeBackend: cfg.activeBackend,
        customOrchestratorEnabled: cfg.customOrchestratorEnabled,
        providers: {
            customOrchestrator: {
                configured: true,
                adapter: runtimeStatus.defaultAdapter || cfg.customOrchestrator.adapter,
                webhookSignatureRequired: !!cfg.customOrchestrator.webhookSecret,
                webhookTimestampValidation: !!cfg.customOrchestrator.enforceWebhookTimestamp,
                webhookToleranceSeconds: cfg.customOrchestrator.webhookToleranceSeconds,
                ready: runtimeStatus.ready !== false,
                channel:
                    runtimeStatus.channel ||
                    runtimeStatus.defaultAdapter ||
                    cfg.customOrchestrator.adapter,
                mode: runtimeStatus.mode || 'custom',
                missingFields: runtimeStatus.missingFields || [],
                availableAdapters: runtimeStatus.availableAdapters || [],
                enabledAdapters: runtimeStatus.enabledAdapters || [],
                defaultAdapter: runtimeStatus.defaultAdapter || cfg.customOrchestrator.adapter,
                adapters: runtimeStatus.adapters || [],
            },
        },
    };
}

export async function createUnifiedOrder(input) {
    const backend = PAYMENT_BACKEND;
    const provider = ensureProvider();
    const requestedProvider = String(input.paymentProvider || input.provider || '').trim();

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
    const sanitizedMetadata = sanitizeMetadata(input.metadata);
    const providerName = provider.resolveAdapterName({
        requestedAdapter: requestedProvider,
        order: {
            metadata: {
                ...sanitizedMetadata,
                paymentProvider: requestedProvider || sanitizedMetadata.paymentProvider || '',
            },
        },
    });
    const order = await createPaymentOrderRecord({
        id: generatePaymentOrderId(),
        userId,
        provider: providerName,
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
        metadata: {
            ...sanitizedMetadata,
            paymentProvider: providerName,
            paymentMethod: input.paymentMethod || sanitizedMetadata.paymentMethod || null,
        },
        failedReason: null,
    });

    try {
        const result = await provider.createPayment({
            order,
            requestedAdapter: providerName,
            requestContext: input.requestContext || {},
        });
        await createPaymentAttemptRecord({
            id: crypto.randomUUID(),
            orderId: order.id,
            backend,
            provider: result.providerName || providerName,
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
                paymentProvider: result.providerName || providerName,
                checkoutPresentation: result.raw?.checkoutPresentation || null,
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
            provider: providerName,
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
    if (
        PAYMENT_ORDER_TERMINAL_STATUSES.has(order.status) &&
        order.status !== PAYMENT_ORDER_STATUS.COMPLETED
    ) {
        return { order, synced: false, grant: initialReconciled.grant };
    }

    const provider = ensureProvider();
    try {
        const result = await provider.queryPayment({ order });
        await createPaymentAttemptRecord({
            id: crypto.randomUUID(),
            orderId: order.id,
            backend: order.backend,
            provider: result.providerName || order.provider,
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
                paymentProvider: result.providerName || order.provider,
                checkoutPresentation:
                    result.raw?.checkoutPresentation || order.metadata?.checkoutPresentation || null,
                gatewayQueryResponse: result.raw || {},
            },
        });
        if (nextStatus === PAYMENT_ORDER_STATUS.REFUNDED) {
            await reversePaymentGrantForOrder(order, {
                reason: result.raw?.refund_reason || result.raw?.reason || '',
                actor: {
                    role: 'provider_sync',
                    provider: result.providerName || order.provider,
                },
            });
        }
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
    const backend = PAYMENT_BACKEND;
    const provider = ensureProvider();

    const verify = await provider.verifyWebhook({
        headers: input.headers || {},
        rawBody: input.rawBody || '',
        payload: input.payload || {},
        providerHint: input.providerHint || '',
    });
    if (!verify?.ok) {
        throw new Error(verify?.reason || 'Webhook signature invalid');
    }

    const event = provider.normalizeWebhookEvent({
        payload: input.payload || {},
        headers: input.headers || {},
        rawBody: input.rawBody || '',
        providerHint: input.providerHint || '',
        adapterName: verify.adapterName || '',
    });
    const providerName = String(event.providerName || verify.adapterName || '').trim();

    const eventId =
        String(event.eventId || '').trim() ||
        buildDeterministicWebhookEventId({
            provider: providerName,
            rawBody: input.rawBody || '',
            signature: verify.signature || '',
        });

    const inserted = await insertPaymentWebhookEvent({
        eventId,
        provider: providerName,
        backend,
        orderId: event.orderId || null,
        externalOrderId: event.externalOrderId || null,
        signature: verify.signature || null,
        payload: event.rawPayload || input.payload || {},
    });
    if (!inserted) {
        return {
            ok: true,
            duplicated: true,
            eventId,
            response: provider.buildWebhookResponse(providerName, true),
        };
    }

    let order = null;
    if (event.orderId) {
        order = await findPaymentOrderById(String(event.orderId));
    }
    if (!order && event.externalOrderId) {
        order = await findPaymentOrderByExternalOrderId(String(event.externalOrderId));
    }
    const effectiveProviderName = providerName || order?.provider || 'custom_orchestrator';

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
                    paymentProvider: effectiveProviderName,
                    webhookEventId: eventId,
                    webhookPayload: event.rawPayload || {},
                    webhookVerifiedAt: new Date().toISOString(),
                    webhookSignatureChecked: !verify.skipped,
                },
            });
            if (nextStatus === PAYMENT_ORDER_STATUS.REFUNDED) {
                await reversePaymentGrantForOrder(order, {
                    reason:
                        event.rawPayload?.refund_reason ||
                        event.rawPayload?.reason ||
                        event.rawPayload?.message ||
                        '',
                    actor: {
                        role: 'provider_webhook',
                        provider: effectiveProviderName,
                    },
                });
            }
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
        response: provider.buildWebhookResponse(effectiveProviderName, true),
    };
}

export async function refundUnifiedOrder(orderId, input = {}) {
    const provider = ensureProvider();
    const synced = await queryUnifiedOrder(orderId);
    const order = synced?.order || null;
    if (!order?.id) {
        throw new Error('Order not found');
    }

    const currentStatus = normalizePaymentStatus(order.status);
    if (currentStatus === PAYMENT_ORDER_STATUS.REFUNDED) {
        return {
            order,
            duplicated: true,
            refund: {
                accepted: true,
                reason: 'ORDER_ALREADY_REFUNDED',
                reverseResult: await reversePaymentGrantForOrder(order, {
                    reason: input.reason || '',
                    actor: input.actor || null,
                }),
            },
        };
    }
    if (
        currentStatus !== PAYMENT_ORDER_STATUS.PAID &&
        currentStatus !== PAYMENT_ORDER_STATUS.COMPLETED
    ) {
        throw new Error(`Order is not refundable in status ${order.status}`);
    }

    const refundResult = await provider.refundPayment({
        order,
        reason: input.reason || '',
        actor: input.actor || null,
    });

    await createPaymentAttemptRecord({
        id: crypto.randomUUID(),
        orderId: order.id,
        backend: order.backend,
        provider: refundResult.providerName || order.provider,
        action: 'refund',
        status: refundResult.accepted ? 'success' : 'failed',
        requestPayload: {
            orderId: order.id,
            provider: order.provider,
            reason: input.reason || '',
        },
        responsePayload: refundResult.raw || {},
    });

    let nextOrder = order;
    let reverseResult = null;
    if (normalizePaymentStatus(refundResult.status) === PAYMENT_ORDER_STATUS.REFUNDED) {
        reverseResult = await reversePaymentGrantForOrder(order, {
            reason: input.reason || '',
            actor: input.actor || null,
        });
        nextOrder = await updatePaymentOrderStatus(order.id, {
            status: PAYMENT_ORDER_STATUS.REFUNDED,
            failedReason: null,
            metadata: {
                ...(order.metadata || {}),
                paymentProvider: refundResult.providerName || order.provider,
                refund: {
                    status: 'refunded',
                    accepted: true,
                    providerRefundId: refundResult.providerRefundId || null,
                    refundReason: String(input.reason || '').trim(),
                    reversedGrant: reverseResult?.reversed || false,
                    reverseReason: reverseResult?.reason || '',
                    updatedAt: new Date().toISOString(),
                    response: refundResult.raw || {},
                },
            },
        });
    } else {
        nextOrder = await updatePaymentOrderStatus(order.id, {
            status: order.status,
            failedReason: null,
            metadata: {
                ...(order.metadata || {}),
                paymentProvider: refundResult.providerName || order.provider,
                refund: {
                    status: normalizePaymentStatus(refundResult.status) || 'PENDING',
                    accepted: refundResult.accepted !== false,
                    providerRefundId: refundResult.providerRefundId || null,
                    refundReason: String(input.reason || '').trim(),
                    updatedAt: new Date().toISOString(),
                    response: refundResult.raw || {},
                },
            },
        });
    }

    return {
        order: nextOrder,
        duplicated: false,
        refund: {
            accepted: refundResult.accepted !== false,
            providerRefundId: refundResult.providerRefundId || null,
            status: normalizePaymentStatus(refundResult.status),
            reverseResult,
            raw: refundResult.raw || {},
        },
    };
}

export async function cancelUnifiedOrder(orderId, input = {}) {
    const provider = ensureProvider();
    const synced = await queryUnifiedOrder(orderId);
    const order = synced?.order || null;
    if (!order?.id) {
        throw new Error('Order not found');
    }

    const currentStatus = normalizePaymentStatus(order.status);
    if (currentStatus === PAYMENT_ORDER_STATUS.CANCELED) {
        return {
            order,
            duplicated: true,
            cancel: {
                accepted: true,
                reason: 'ORDER_ALREADY_CANCELED',
                status: PAYMENT_ORDER_STATUS.CANCELED,
            },
        };
    }
    if (
        currentStatus === PAYMENT_ORDER_STATUS.PAID ||
        currentStatus === PAYMENT_ORDER_STATUS.COMPLETED ||
        currentStatus === PAYMENT_ORDER_STATUS.REFUNDED ||
        currentStatus === PAYMENT_ORDER_STATUS.FAILED
    ) {
        throw new Error(`Order is not cancelable in status ${order.status}`);
    }

    let cancelResult;
    try {
        cancelResult = await provider.cancelPayment({
            order,
            reason: input.reason || '',
            actor: input.actor || null,
        });
    } catch (error) {
        await createPaymentAttemptRecord({
            id: crypto.randomUUID(),
            orderId: order.id,
            backend: order.backend,
            provider: order.provider,
            action: 'cancel',
            status: 'failed',
            requestPayload: {
                orderId: order.id,
                provider: order.provider,
                reason: input.reason || '',
            },
            responsePayload: { message: error?.message || 'Unknown error' },
        });
        throw error;
    }

    await createPaymentAttemptRecord({
        id: crypto.randomUUID(),
        orderId: order.id,
        backend: order.backend,
        provider: cancelResult.providerName || order.provider,
        action: 'cancel',
        status: cancelResult.accepted === false ? 'failed' : 'success',
        requestPayload: {
            orderId: order.id,
            provider: order.provider,
            reason: input.reason || '',
        },
        responsePayload: cancelResult.raw || {},
    });

    const nextStatus = normalizePaymentStatus(cancelResult.status || PAYMENT_ORDER_STATUS.CANCELED);
    const statusToPersist = canTransition(order.status, nextStatus) ? nextStatus : order.status;
    const nextOrder = await updatePaymentOrderStatus(order.id, {
        status: statusToPersist,
        failedReason: null,
        metadata: {
            ...(order.metadata || {}),
            paymentProvider: cancelResult.providerName || order.provider,
            cancel: {
                status: nextStatus,
                accepted: cancelResult.accepted !== false,
                providerOrderId: cancelResult.providerOrderId || order.externalOrderId || null,
                reason: String(input.reason || '').trim(),
                actor: input.actor || null,
                updatedAt: new Date().toISOString(),
                response: cancelResult.raw || {},
            },
        },
    });

    return {
        order: nextOrder,
        duplicated: false,
        cancel: {
            accepted: cancelResult.accepted !== false,
            providerOrderId: cancelResult.providerOrderId || order.externalOrderId || null,
            status: nextStatus,
            raw: cancelResult.raw || {},
        },
    };
}
