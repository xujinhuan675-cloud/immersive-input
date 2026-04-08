import crypto from 'node:crypto';

import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../../constants.js';
import { getPaymentRuntimeConfig } from '../../config.js';

function getHeader(headers, name) {
    const value = headers?.[name] ?? headers?.[name.toLowerCase()];
    if (!value) return '';
    if (Array.isArray(value)) return String(value[0]);
    return String(value);
}

function safeEqual(a, b) {
    const aa = Buffer.from(String(a || ''), 'utf8');
    const bb = Buffer.from(String(b || ''), 'utf8');
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
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
                    note: 'Custom orchestrator placeholder adapter.',
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
                    note: 'No real upstream queried.',
                },
            };
        },
        async verifyWebhook({ headers, rawBody }) {
            const secret = getPaymentRuntimeConfig().customOrchestrator.webhookSecret;
            if (!secret) {
                return { ok: true, skipped: true };
            }
            const signature = getHeader(headers, 'x-custom-orchestrator-signature');
            if (!signature) return { ok: false, reason: 'Missing signature' };
            const expected = crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
            return {
                ok: safeEqual(signature, expected),
                signature,
                expected,
            };
        },
        parseWebhookEvent({ payload }) {
            const data = payload || {};
            return {
                eventId: String(data.event_id || data.id || crypto.randomUUID()),
                orderId: data.order_id || data.out_trade_no || data.metadata?.order_id || null,
                externalOrderId: data.provider_order_id || data.trade_no || null,
                status: normalizePaymentStatus(data.status || data.type || 'pending'),
                rawPayload: data,
            };
        },
    };
}
