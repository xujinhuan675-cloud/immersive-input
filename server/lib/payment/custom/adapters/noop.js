import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../../constants.js';
import { getPaymentRuntimeConfig } from '../../config.js';
import { verifyWebhookSignature } from '../webhookSecurity.js';
function inferWebhookStatus(data) {
    const directStatus = normalizePaymentStatus(data.status || data.trade_status || data.type || '');
    if (directStatus !== PAYMENT_ORDER_STATUS.PENDING || data.status || data.trade_status || data.type) {
        return directStatus;
    }

    const eventType = String(data.event_type || data.event || '').trim().toLowerCase();
    if (!eventType) return PAYMENT_ORDER_STATUS.PENDING;
    if (eventType.includes('refund')) return PAYMENT_ORDER_STATUS.REFUNDED;
    if (eventType.includes('cancel') || eventType.includes('close')) return PAYMENT_ORDER_STATUS.CANCELED;
    if (eventType.includes('fail') || eventType.includes('expire')) return PAYMENT_ORDER_STATUS.FAILED;
    if (
        eventType.includes('paid') ||
        eventType.includes('success') ||
        eventType.includes('succeed') ||
        eventType.includes('complete')
    ) {
        return PAYMENT_ORDER_STATUS.PAID;
    }
    return PAYMENT_ORDER_STATUS.PENDING;
}

export function createNoopAdapter() {
    return {
        name: 'noop',
        async createPayment({ order }) {
            const cfg = getPaymentRuntimeConfig().customOrchestrator;
            const checkoutUrl = `${cfg.placeholderCheckoutUrl}?order_id=${encodeURIComponent(order.id)}`;
            return {
                providerOrderId: `noop_${order.id}`,
                checkoutUrl,
                status: PAYMENT_ORDER_STATUS.REQUIRES_ACTION,
                raw: {
                    adapter: 'noop',
                    orchestrationMode: 'self_hosted',
                    note: 'Placeholder adapter used for integration testing and custom orchestration bootstrap.',
                },
            };
        },
        async queryPayment({ order }) {
            return {
                providerOrderId: order.externalOrderId || `noop_${order.id}`,
                checkoutUrl: order.checkoutUrl || '',
                status: normalizePaymentStatus(order.status || PAYMENT_ORDER_STATUS.PENDING),
                raw: {
                    adapter: 'noop',
                    orchestrationMode: 'self_hosted',
                    note: 'No upstream provider is queried in noop mode.',
                },
            };
        },
        async refundPayment({ order, reason = '' }) {
            return {
                providerRefundId: `noop_refund_${order.id}`,
                status: PAYMENT_ORDER_STATUS.REFUNDED,
                accepted: true,
                raw: {
                    adapter: 'noop',
                    orchestrationMode: 'self_hosted',
                    refundReason: reason,
                },
            };
        },
        async verifyWebhook({ headers, rawBody }) {
            const cfg = getPaymentRuntimeConfig().customOrchestrator;
            return verifyWebhookSignature({
                headers,
                rawBody,
                secret: cfg.webhookSecret,
                signatureHeader: cfg.webhookSignatureHeader,
                timestampHeader: cfg.webhookTimestampHeader,
                toleranceSeconds: cfg.webhookToleranceSeconds,
                enforceTimestamp: cfg.enforceWebhookTimestamp,
            });
        },
        parseWebhookEvent({ payload }) {
            const data = payload || {};
            const fallbackOrderId = data.order_id || data.out_trade_no || data.metadata?.order_id || null;
            const fallbackStatus = inferWebhookStatus(data);
            return {
                eventId: data.event_id || data.id || data.notify_id || null,
                orderId: fallbackOrderId,
                externalOrderId: data.provider_order_id || data.trade_no || data.order_no || null,
                status: fallbackStatus,
                rawPayload: data,
            };
        },
    };
}
