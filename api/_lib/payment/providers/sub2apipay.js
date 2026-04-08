import crypto from 'node:crypto';

import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../constants.js';
import { getPaymentRuntimeConfig } from '../config.js';

function getHeader(headers, candidates) {
    for (const name of candidates) {
        const value = headers?.[name] ?? headers?.[name.toLowerCase()];
        if (value) {
            if (Array.isArray(value)) return String(value[0]);
            return String(value);
        }
    }
    return '';
}

function safeEqual(a, b) {
    const aa = Buffer.from(String(a || ''), 'utf8');
    const bb = Buffer.from(String(b || ''), 'utf8');
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
}

function replaceOrderId(path, orderId) {
    return String(path || '').replace('{orderId}', encodeURIComponent(orderId));
}

function pickFirst(...vals) {
    for (const val of vals) {
        if (val !== undefined && val !== null && val !== '') return val;
    }
    return null;
}

function buildUrl(baseUrl, path) {
    const base = String(baseUrl || '').replace(/\/$/, '');
    const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
    return `${base}${suffix}`;
}

async function requestSub2ApiPay({ path, method = 'POST', payload }) {
    const cfg = getPaymentRuntimeConfig().sub2apipay;
    if (!cfg.baseUrl) throw new Error('Missing SUB2APIPAY_BASE_URL');

    const headers = {
        'Content-Type': 'application/json',
    };
    if (cfg.apiToken) {
        headers.Authorization = `Bearer ${cfg.apiToken}`;
        headers['X-API-KEY'] = cfg.apiToken;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
        const res = await fetch(buildUrl(cfg.baseUrl, path), {
            method,
            headers,
            body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
            signal: controller.signal,
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = { raw: text };
        }

        if (!res.ok) {
            throw new Error(data?.message || `sub2apipay request failed: ${res.status}`);
        }

        return data || {};
    } finally {
        clearTimeout(timer);
    }
}

function mapCreateResponse(data) {
    const checkoutUrl = pickFirst(
        data.checkout_url,
        data.pay_url,
        data.url,
        data.payment_url,
        data.data?.checkout_url,
        data.data?.pay_url
    );

    const providerOrderId = pickFirst(
        data.order_id,
        data.id,
        data.trade_no,
        data.data?.order_id,
        data.data?.id
    );

    const status = normalizePaymentStatus(
        pickFirst(data.status, data.trade_status, data.data?.status, 'PENDING')
    );

    return {
        checkoutUrl: checkoutUrl || '',
        providerOrderId: providerOrderId ? String(providerOrderId) : '',
        status: checkoutUrl ? PAYMENT_ORDER_STATUS.REQUIRES_ACTION : status,
        raw: data,
    };
}

function mapQueryResponse(data, fallbackStatus) {
    return {
        providerOrderId: pickFirst(data.order_id, data.id, data.trade_no, data.data?.order_id),
        checkoutUrl: pickFirst(
            data.checkout_url,
            data.pay_url,
            data.url,
            data.payment_url,
            data.data?.checkout_url
        ),
        status: normalizePaymentStatus(
            pickFirst(data.status, data.trade_status, data.data?.status, fallbackStatus)
        ),
        raw: data,
    };
}

export const sub2ApiPayProvider = {
    id: 'sub2apipay',
    async createPayment({ order }) {
        const cfg = getPaymentRuntimeConfig().sub2apipay;
        const payload = {
            order_id: order.id,
            out_trade_no: order.id,
            amount: Number(order.amountCents) / 100,
            amount_cents: Number(order.amountCents),
            currency: order.currency,
            user_id: order.userId,
            order_type: order.orderType,
            product_code: order.productCode || null,
            description: order.description || '',
            notify_url: cfg.notifyUrl || null,
            return_url: cfg.returnUrl || null,
            metadata: order.metadata || {},
        };

        const data = await requestSub2ApiPay({
            path: cfg.createOrderPath,
            method: 'POST',
            payload,
        });
        return mapCreateResponse(data);
    },
    async queryPayment({ order }) {
        const cfg = getPaymentRuntimeConfig().sub2apipay;
        const targetOrderId = order.externalOrderId || order.id;
        const path = replaceOrderId(cfg.queryOrderPath, targetOrderId);
        const data = await requestSub2ApiPay({
            path,
            method: 'GET',
        });
        return mapQueryResponse(data, order.status);
    },
    async verifyWebhook({ headers, rawBody }) {
        const secret = getPaymentRuntimeConfig().sub2apipay.webhookSecret;
        if (!secret) {
            return { ok: true, skipped: true };
        }

        const signature = getHeader(headers, [
            'x-sub2apipay-signature',
            'x-signature',
            'x-webhook-signature',
        ]);
        if (!signature) return { ok: false, reason: 'Missing signature' };

        const expected = crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
        const ok = safeEqual(signature, expected);
        return {
            ok,
            signature,
            expected,
            reason: ok ? '' : 'Invalid signature',
        };
    },
    normalizeWebhookEvent({ payload }) {
        const data = payload || {};
        const status = normalizePaymentStatus(
            pickFirst(data.status, data.trade_status, data.event_type, data.type, 'PENDING')
        );
        return {
            eventId: String(pickFirst(data.event_id, data.id, data.notify_id, crypto.randomUUID())),
            orderId: pickFirst(data.order_id, data.out_trade_no, data.metadata?.order_id, null),
            externalOrderId: pickFirst(data.provider_order_id, data.trade_no, data.order_no, null),
            status,
            rawPayload: data,
        };
    },
};
