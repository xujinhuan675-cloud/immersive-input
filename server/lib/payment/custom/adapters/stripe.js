import crypto from 'node:crypto';

import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../../constants.js';
import { getPaymentRuntimeConfig } from '../../config.js';

function trim(v) {
    return String(v || '').trim();
}

function pickFirst(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
}

function safeEqual(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function buildUrl(base, path) {
    const root = String(base || '').replace(/\/$/, '');
    const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
    return `${root}${suffix}`;
}

function getStripeConfig() {
    return getPaymentRuntimeConfig().customOrchestrator.stripe;
}

function listPaymentMethodTypes(raw) {
    const values = String(raw || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return values.length > 0 ? values : ['card'];
}

function mapStripeCheckoutStatus({ status, paymentStatus }) {
    const checkoutStatus = String(status || '')
        .trim()
        .toLowerCase();
    const payStatus = String(paymentStatus || '')
        .trim()
        .toLowerCase();

    if (payStatus === 'paid' || payStatus === 'no_payment_required') {
        return PAYMENT_ORDER_STATUS.PAID;
    }
    if (checkoutStatus === 'expired') {
        return PAYMENT_ORDER_STATUS.CANCELED;
    }
    if (checkoutStatus === 'open') {
        return PAYMENT_ORDER_STATUS.REQUIRES_ACTION;
    }
    if (payStatus === 'unpaid') {
        return PAYMENT_ORDER_STATUS.REQUIRES_ACTION;
    }
    return PAYMENT_ORDER_STATUS.PENDING;
}

function mapStripeWebhookStatus(eventType, object) {
    const type = String(eventType || '')
        .trim()
        .toLowerCase();
    const objectType = String(object?.object || '')
        .trim()
        .toLowerCase();

    if (
        type === 'checkout.session.completed' ||
        type === 'checkout.session.async_payment_succeeded' ||
        type === 'payment_intent.succeeded' ||
        type === 'charge.succeeded' ||
        type === 'invoice.paid'
    ) {
        return PAYMENT_ORDER_STATUS.PAID;
    }

    if (
        type === 'checkout.session.async_payment_failed' ||
        type === 'payment_intent.payment_failed' ||
        type === 'charge.failed'
    ) {
        return PAYMENT_ORDER_STATUS.FAILED;
    }

    if (type === 'checkout.session.expired' || type.endsWith('.canceled')) {
        return PAYMENT_ORDER_STATUS.CANCELED;
    }

    if (
        type === 'charge.refunded' ||
        type.startsWith('refund.') ||
        type.startsWith('charge.refund.')
    ) {
        return PAYMENT_ORDER_STATUS.REFUNDED;
    }

    if (objectType === 'checkout.session') {
        return mapStripeCheckoutStatus({
            status: object.status,
            paymentStatus: object.payment_status,
        });
    }

    if (objectType === 'payment_intent') {
        const paymentIntentStatus = String(object.status || '')
            .trim()
            .toLowerCase();
        if (paymentIntentStatus === 'succeeded') return PAYMENT_ORDER_STATUS.PAID;
        if (paymentIntentStatus === 'canceled') return PAYMENT_ORDER_STATUS.CANCELED;
        if (paymentIntentStatus === 'requires_payment_method') return PAYMENT_ORDER_STATUS.FAILED;
        if (paymentIntentStatus === 'requires_action' || paymentIntentStatus === 'processing') {
            return PAYMENT_ORDER_STATUS.REQUIRES_ACTION;
        }
    }

    return PAYMENT_ORDER_STATUS.PENDING;
}

function mapStripeRefundStatus(rawStatus) {
    const status = String(rawStatus || '')
        .trim()
        .toLowerCase();
    if (!status) return PAYMENT_ORDER_STATUS.PENDING;
    if (status === 'succeeded') return PAYMENT_ORDER_STATUS.REFUNDED;
    if (status === 'failed' || status === 'canceled') return PAYMENT_ORDER_STATUS.FAILED;
    if (status === 'pending' || status === 'requires_action') return PAYMENT_ORDER_STATUS.PENDING;
    return normalizePaymentStatus(status);
}

function getRuntimeStatus() {
    const cfg = getStripeConfig();
    const createMissingFields = [];
    if (!cfg.secretKey) createMissingFields.push('STRIPE_SECRET_KEY');
    if (!cfg.successUrl) createMissingFields.push('STRIPE_SUCCESS_URL');
    if (!cfg.cancelUrl) createMissingFields.push('STRIPE_CANCEL_URL');

    const missingFields = [...createMissingFields];
    if (!cfg.webhookSecret) missingFields.push('STRIPE_WEBHOOK_SECRET');

    return {
        channel: 'stripe',
        mode: 'real_channel',
        ready: missingFields.length === 0,
        createReady: createMissingFields.length === 0,
        missingFields,
        createMissingFields,
        webhookConfigured: !!cfg.webhookSecret,
        defaultCurrency: String(cfg.defaultCurrency || 'USD').toUpperCase(),
        paymentMethodTypes: listPaymentMethodTypes(cfg.paymentMethodTypes),
        apiBaseConfigured: !!cfg.apiBase,
    };
}

function assertCreateReady() {
    const cfg = getStripeConfig();
    const missingFields = [];
    if (!cfg.secretKey) missingFields.push('STRIPE_SECRET_KEY');
    if (!cfg.successUrl) missingFields.push('STRIPE_SUCCESS_URL');
    if (!cfg.cancelUrl) missingFields.push('STRIPE_CANCEL_URL');
    if (missingFields.length > 0) {
        throw new Error(`Stripe config incomplete: missing ${missingFields.join(', ')}`);
    }
}

function assertQueryReady() {
    const cfg = getStripeConfig();
    if (!cfg.secretKey) {
        throw new Error('Stripe config incomplete: missing STRIPE_SECRET_KEY');
    }
}

async function requestStripe({
    method = 'POST',
    path,
    form = {},
    query = {},
    idempotencyKey = '',
} = {}) {
    const cfg = getStripeConfig();
    const url = new URL(buildUrl(cfg.apiBase, path));
    for (const [key, value] of Object.entries(query || {})) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) {
            for (const item of value) {
                url.searchParams.append(key, String(item));
            }
        } else {
            url.searchParams.append(key, String(value));
        }
    }

    const headers = {
        Authorization: `Bearer ${cfg.secretKey}`,
    };
    let body = null;
    if (String(method).toUpperCase() !== 'GET') {
        const encoded = new URLSearchParams();
        for (const [key, value] of Object.entries(form || {})) {
            if (value === undefined || value === null || value === '') continue;
            encoded.append(key, String(value));
        }
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = encoded.toString();
    }
    if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
        const res = await fetch(url.toString(), {
            method,
            headers,
            body,
            signal: controller.signal,
        });
        const text = await res.text();
        let data = {};
        try {
            data = JSON.parse(text || '{}');
        } catch {
            data = { raw: text };
        }

        if (!res.ok) {
            throw new Error(
                data?.error?.message ||
                    data?.message ||
                    `Stripe request failed: ${res.status}`
            );
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function parseStripeSignature(rawSignatureHeader) {
    const chunks = String(rawSignatureHeader || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    let timestamp = '';
    const v1Signatures = [];
    for (const chunk of chunks) {
        const idx = chunk.indexOf('=');
        if (idx <= 0) continue;
        const key = chunk.slice(0, idx).trim();
        const value = chunk.slice(idx + 1).trim();
        if (!value) continue;
        if (key === 't') timestamp = value;
        if (key === 'v1') v1Signatures.push(value);
    }
    return { timestamp, v1Signatures };
}

export function createStripeAdapter() {
    return {
        name: 'stripe',
        getRuntimeStatus,
        async createPayment({ order }) {
            assertCreateReady();
            const cfg = getStripeConfig();
            const paymentMethodTypes = listPaymentMethodTypes(cfg.paymentMethodTypes);
            const title = trim(order.description) || trim(order.productCode) || `order_${order.id}`;
            const form = {
                mode: cfg.mode || 'payment',
                success_url: cfg.successUrl,
                cancel_url: cfg.cancelUrl,
                client_reference_id: order.id,
                'line_items[0][price_data][currency]': String(
                    order.currency || cfg.defaultCurrency || 'USD'
                ).toLowerCase(),
                'line_items[0][price_data][unit_amount]': String(order.amountCents || 0),
                'line_items[0][price_data][product_data][name]': title,
                'line_items[0][quantity]': '1',
                'metadata[order_id]': order.id,
                'metadata[user_id]': order.userId || '',
                'metadata[order_type]': order.orderType || '',
                'payment_intent_data[metadata][order_id]': order.id,
                'payment_intent_data[metadata][user_id]': order.userId || '',
                'payment_intent_data[metadata][order_type]': order.orderType || '',
            };
            const customerEmail = trim(order.metadata?.customerEmail);
            if (customerEmail) {
                form.customer_email = customerEmail;
            }
            paymentMethodTypes.forEach((method, index) => {
                form[`payment_method_types[${index}]`] = method;
            });

            const data = await requestStripe({
                method: 'POST',
                path: cfg.createCheckoutPath,
                form,
                idempotencyKey: `order_${order.id}`,
            });

            return {
                providerOrderId: String(data.id || ''),
                checkoutUrl: String(data.url || ''),
                status: mapStripeCheckoutStatus({
                    status: data.status,
                    paymentStatus: data.payment_status,
                }),
                raw: data,
            };
        },
        async queryPayment({ order }) {
            assertQueryReady();
            const cfg = getStripeConfig();
            const sessionId = trim(order.externalOrderId);
            if (!sessionId) {
                throw new Error(`Stripe query requires external order id for order ${order.id}`);
            }
            const data = await requestStripe({
                method: 'GET',
                path: `${cfg.retrieveCheckoutPath}/${encodeURIComponent(sessionId)}`,
                query: {
                    'expand[]': ['payment_intent'],
                },
            });
            return {
                providerOrderId: String(data.id || sessionId),
                checkoutUrl: String(data.url || order.checkoutUrl || ''),
                status: mapStripeCheckoutStatus({
                    status: data.status,
                    paymentStatus: data.payment_status,
                }),
                raw: data,
            };
        },
        async refundPayment({ order, reason = '' }) {
            assertQueryReady();
            const cfg = getStripeConfig();
            const sessionId = trim(order.externalOrderId);
            if (!sessionId) {
                throw new Error(`Stripe refund requires external order id for order ${order.id}`);
            }

            const session = await requestStripe({
                method: 'GET',
                path: `${cfg.retrieveCheckoutPath}/${encodeURIComponent(sessionId)}`,
                query: {
                    'expand[]': ['payment_intent'],
                },
            });
            const paymentIntent =
                typeof session.payment_intent === 'string'
                    ? session.payment_intent
                    : session.payment_intent?.id || '';
            if (!paymentIntent) {
                throw new Error(`Stripe refund requires payment_intent for order ${order.id}`);
            }

            const refund = await requestStripe({
                method: 'POST',
                path: cfg.refundPath,
                form: {
                    payment_intent: paymentIntent,
                    reason: 'requested_by_customer',
                    'metadata[order_id]': order.id,
                    'metadata[refund_reason]': reason || '',
                },
                idempotencyKey: `refund_${order.id}`,
            });

            return {
                providerRefundId: String(refund.id || ''),
                status: mapStripeRefundStatus(refund.status),
                accepted: true,
                raw: refund,
            };
        },
        async verifyWebhook({ headers, rawBody }) {
            const cfg = getStripeConfig();
            if (!cfg.webhookSecret) {
                return { ok: false, reason: 'Missing STRIPE_WEBHOOK_SECRET' };
            }

            const rawSignature = String(
                headers?.['stripe-signature'] || headers?.['Stripe-Signature'] || ''
            ).trim();
            if (!rawSignature) {
                return { ok: false, reason: 'Missing Stripe-Signature header' };
            }

            const { timestamp, v1Signatures } = parseStripeSignature(rawSignature);
            if (!timestamp || v1Signatures.length === 0) {
                return { ok: false, reason: 'Invalid Stripe-Signature format', signature: rawSignature };
            }

            const parsedTimestamp = Number(timestamp);
            if (!Number.isFinite(parsedTimestamp)) {
                return {
                    ok: false,
                    reason: 'Invalid Stripe-Signature timestamp',
                    signature: rawSignature,
                };
            }

            const now = Math.floor(Date.now() / 1000);
            const tolerance = Number.isFinite(Number(cfg.webhookToleranceSeconds))
                ? Math.max(1, Math.round(Number(cfg.webhookToleranceSeconds)))
                : 300;
            if (Math.abs(now - parsedTimestamp) > tolerance) {
                return {
                    ok: false,
                    reason: `Stripe signature timestamp outside tolerance (${tolerance}s)`,
                    signature: rawSignature,
                    timestamp: parsedTimestamp,
                };
            }

            const signedPayload = `${timestamp}.${String(rawBody || '')}`;
            const expected = crypto
                .createHmac('sha256', cfg.webhookSecret)
                .update(signedPayload, 'utf8')
                .digest('hex');
            const ok = v1Signatures.some((candidate) =>
                safeEqual(String(candidate).toLowerCase(), expected.toLowerCase())
            );
            return {
                ok,
                signature: rawSignature,
                expected,
                timestamp: parsedTimestamp,
                reason: ok ? '' : 'Stripe signature verification failed',
            };
        },
        parseWebhookEvent({ payload }) {
            const event = payload && typeof payload === 'object' ? payload : {};
            const object = event?.data?.object || {};
            const paymentIntentObject = object?.payment_intent;
            const paymentIntentMetadata =
                paymentIntentObject && typeof paymentIntentObject === 'object'
                    ? paymentIntentObject.metadata || {}
                    : {};
            const orderId =
                pickFirst(
                    object?.metadata?.order_id,
                    paymentIntentMetadata?.order_id,
                    object?.client_reference_id,
                    null
                ) || null;
            const externalOrderId = pickFirst(
                object?.id,
                object?.checkout_session,
                object?.payment_intent,
                null
            );
            const status = mapStripeWebhookStatus(event.type, object);

            return {
                eventId: pickFirst(event.id, object.id, null),
                orderId,
                externalOrderId: externalOrderId ? String(externalOrderId) : null,
                status: normalizePaymentStatus(status),
                rawPayload: event,
            };
        },
    };
}
