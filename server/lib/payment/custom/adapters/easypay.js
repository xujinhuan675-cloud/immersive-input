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

function parseMaybeJsonOrForm(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        const parsed = {};
        const params = new URLSearchParams(text);
        for (const [key, value] of params.entries()) {
            parsed[key] = value;
        }
        return Object.keys(parsed).length > 0 ? parsed : { raw: text };
    }
}

function ensureObjectPayload(payload, rawBody) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload;
    }
    return parseMaybeJsonOrForm(rawBody);
}

function buildUrl(base, path) {
    const root = String(base || '').replace(/\/$/, '');
    const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
    return `${root}${suffix}`;
}

function buildSignedString(params, key) {
    const sortedKeys = Object.keys(params || {})
        .filter((k) => {
            const lower = k.toLowerCase();
            if (lower === 'sign' || lower === 'sign_type') return false;
            const value = params[k];
            return value !== undefined && value !== null && String(value) !== '';
        })
        .sort();
    const base = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
    return `${base}&key=${key}`;
}

function createMd5Signature(params, key) {
    const signed = buildSignedString(params, key);
    return crypto.createHash('md5').update(signed, 'utf8').digest('hex');
}

function isSuccessfulCreateResponse(data) {
    const code = String(data?.code ?? data?.status ?? '').trim().toLowerCase();
    if (!code) return !!pickFirst(data?.payurl, data?.qrcode, data?.url, data?.code_url);
    return code === '1' || code === '200' || code === 'success' || code === 'ok' || code === 'true';
}

function normalizeEasyPayStatus(rawStatus) {
    const status = String(rawStatus || '')
        .trim()
        .toUpperCase();
    if (!status) return PAYMENT_ORDER_STATUS.PENDING;
    if (status.includes('REFUND')) return PAYMENT_ORDER_STATUS.REFUNDED;
    if (status.includes('CLOSE') || status.includes('CANCEL')) return PAYMENT_ORDER_STATUS.CANCELED;
    if (status.includes('FAIL') || status.includes('EXPIRE') || status.includes('ERROR')) {
        return PAYMENT_ORDER_STATUS.FAILED;
    }
    if (
        status.includes('SUCCESS') ||
        status.includes('FINISH') ||
        status.includes('PAID') ||
        status.includes('COMPLETE')
    ) {
        return PAYMENT_ORDER_STATUS.PAID;
    }
    if (status.includes('WAIT') || status.includes('PENDING') || status.includes('PROCESS')) {
        return PAYMENT_ORDER_STATUS.REQUIRES_ACTION;
    }
    return normalizePaymentStatus(status);
}

function getEasyPayConfig() {
    return getPaymentRuntimeConfig().customOrchestrator.easypay;
}

function getRuntimeStatus() {
    const cfg = getEasyPayConfig();
    const missingFields = [];
    if (!cfg.pid) missingFields.push('EASYPAY_PID');
    if (!cfg.key) missingFields.push('EASYPAY_KEY');
    if (!cfg.apiBase) missingFields.push('EASYPAY_API_BASE');
    if (!cfg.notifyUrl) missingFields.push('EASYPAY_NOTIFY_URL');

    return {
        channel: 'easypay',
        mode: 'real_channel',
        ready: missingFields.length === 0,
        missingFields,
        defaultType: cfg.defaultType,
        signType: cfg.signType,
        apiBaseConfigured: !!cfg.apiBase,
    };
}

function assertReady() {
    const status = getRuntimeStatus();
    if (!status.ready) {
        throw new Error(`EasyPay config incomplete: missing ${status.missingFields.join(', ')}`);
    }
}

async function requestEasyPay(path, params) {
    const cfg = getEasyPayConfig();
    const url = buildUrl(cfg.apiBase, path);

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined || value === null || value === '') continue;
        body.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: controller.signal,
        });
        const text = await res.text();
        const data = parseMaybeJsonOrForm(text);

        if (!res.ok) {
            throw new Error(data?.msg || data?.message || `EasyPay request failed: ${res.status}`);
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function resolveCheckoutUrl(data) {
    return pickFirst(
        data?.payurl,
        data?.pay_url,
        data?.qrcode,
        data?.code_url,
        data?.url,
        data?.checkout_url,
        data?.data?.payurl,
        data?.data?.url
    );
}

function resolveProviderOrderId(data) {
    return pickFirst(
        data?.trade_no,
        data?.order_no,
        data?.order_id,
        data?.id,
        data?.data?.trade_no,
        data?.data?.order_id
    );
}

export function createEasyPayAdapter() {
    return {
        name: 'easypay',
        getRuntimeStatus,
        async createPayment({ order }) {
            assertReady();
            const cfg = getEasyPayConfig();

            const createParams = {
                pid: cfg.pid,
                type: trim(order?.metadata?.paymentType) || cfg.defaultType,
                out_trade_no: order.id,
                notify_url: cfg.notifyUrl,
                return_url: cfg.returnUrl || null,
                name: trim(order.description) || trim(order.productCode) || `order_${order.id}`,
                money: (Number(order.amountCents || 0) / 100).toFixed(2),
            };
            createParams.sign_type = cfg.signType;
            createParams.sign = createMd5Signature(createParams, cfg.key);

            const data = await requestEasyPay(cfg.createOrderPath, createParams);
            if (!isSuccessfulCreateResponse(data)) {
                throw new Error(data?.msg || data?.message || 'EasyPay create order failed');
            }

            const checkoutUrl = resolveCheckoutUrl(data);
            const providerOrderId = resolveProviderOrderId(data);
            const status = normalizeEasyPayStatus(
                pickFirst(data?.trade_status, data?.status, data?.data?.trade_status, data?.data?.status)
            );

            return {
                providerOrderId: providerOrderId ? String(providerOrderId) : '',
                checkoutUrl: checkoutUrl ? String(checkoutUrl) : '',
                status: checkoutUrl ? PAYMENT_ORDER_STATUS.REQUIRES_ACTION : status,
                raw: data,
            };
        },
        async queryPayment({ order }) {
            assertReady();
            const cfg = getEasyPayConfig();

            const queryParams = {
                pid: cfg.pid,
                out_trade_no: order.id,
            };
            if (order.externalOrderId) {
                queryParams.trade_no = order.externalOrderId;
            }
            queryParams.sign_type = cfg.signType;
            queryParams.sign = createMd5Signature(queryParams, cfg.key);

            const data = await requestEasyPay(cfg.queryOrderPath, queryParams);
            const status = normalizeEasyPayStatus(
                pickFirst(data?.trade_status, data?.status, data?.data?.trade_status, data?.data?.status)
            );

            return {
                providerOrderId: String(resolveProviderOrderId(data) || order.externalOrderId || ''),
                checkoutUrl: String(resolveCheckoutUrl(data) || order.checkoutUrl || ''),
                status,
                raw: data,
            };
        },
        async refundPayment({ order, reason = '' }) {
            assertReady();
            const cfg = getEasyPayConfig();
            if (!cfg.refundOrderPath) {
                throw new Error(
                    'EasyPay refund is not configured. Set EASYPAY_REFUND_ORDER_PATH to enable it'
                );
            }

            const refundParams = {
                pid: cfg.pid,
                out_trade_no: order.id,
                trade_no: order.externalOrderId || null,
                money: (Number(order.amountCents || 0) / 100).toFixed(2),
                reason: trim(reason) || null,
                out_refund_no: `refund_${order.id}`,
            };
            refundParams.sign_type = cfg.signType;
            refundParams.sign = createMd5Signature(refundParams, cfg.key);

            const data = await requestEasyPay(cfg.refundOrderPath, refundParams);
            return {
                providerRefundId: String(resolveProviderOrderId(data) || `easypay_refund_${order.id}`),
                status: normalizeEasyPayStatus(
                    pickFirst(
                        data?.refund_status,
                        data?.trade_status,
                        data?.status,
                        data?.data?.refund_status,
                        data?.data?.trade_status,
                        data?.data?.status
                    )
                ),
                accepted: true,
                raw: data,
            };
        },
        async verifyWebhook({ payload, rawBody }) {
            assertReady();
            const cfg = getEasyPayConfig();
            const data = ensureObjectPayload(payload, rawBody);
            const incomingSign = trim(data.sign);

            if (!incomingSign) {
                return { ok: false, reason: 'Missing EasyPay sign' };
            }
            if (cfg.pid && data.pid && String(data.pid) !== String(cfg.pid)) {
                return { ok: false, reason: 'EasyPay pid mismatch', signature: incomingSign };
            }

            const expected = createMd5Signature(data, cfg.key);
            const ok = incomingSign.toLowerCase() === String(expected).toLowerCase();
            return {
                ok,
                signature: incomingSign,
                expected,
                reason: ok ? '' : 'EasyPay sign verify failed',
            };
        },
        parseWebhookEvent({ payload, rawBody }) {
            const data = ensureObjectPayload(payload, rawBody);
            return {
                eventId: pickFirst(data.notify_id, data.trade_no, data.event_id, data.id, null),
                orderId: pickFirst(data.out_trade_no, data.order_id, data.metadata?.order_id, null),
                externalOrderId: pickFirst(data.trade_no, data.provider_order_id, data.order_no, null),
                status: normalizeEasyPayStatus(
                    pickFirst(data.trade_status, data.status, data.event_type, data.type)
                ),
                rawPayload: data,
            };
        },
    };
}
