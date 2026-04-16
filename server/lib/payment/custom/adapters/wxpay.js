import crypto from 'node:crypto';

import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../../constants.js';
import { getPaymentRuntimeConfig } from '../../config.js';

function trim(value) {
    return String(value || '').trim();
}

function wrapBase64(b64) {
    return trim(b64).replace(/(.{64})/g, '$1\n').trim();
}

function normalizePemLikeValue(value) {
    return trim(value)
        .replace(/\r\n/g, '\n')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n');
}

function formatPrivateKey(key) {
    const normalized = normalizePemLikeValue(key);
    if (normalized.includes('-----BEGIN')) return normalized;
    return `-----BEGIN PRIVATE KEY-----\n${wrapBase64(normalized)}\n-----END PRIVATE KEY-----`;
}

function formatPublicKey(key) {
    const normalized = normalizePemLikeValue(key);
    if (normalized.includes('-----BEGIN')) return normalized;
    return `-----BEGIN PUBLIC KEY-----\n${wrapBase64(normalized)}\n-----END PUBLIC KEY-----`;
}

function buildUrl(base, path) {
    const root = trim(base).replace(/\/$/, '');
    return `${root}${String(path || '').startsWith('/') ? path : `/${path || ''}`}`;
}

function getHeader(headers, name) {
    const lower = String(name || '').trim().toLowerCase();
    const value = headers?.[lower] ?? headers?.[name];
    if (Array.isArray(value)) return trim(value[0]);
    return trim(value);
}

function getWxpayConfig() {
    return getPaymentRuntimeConfig().customOrchestrator.wxpay;
}

function getRuntimeStatus() {
    const cfg = getWxpayConfig();
    const missingFields = [];
    if (!cfg.appId) missingFields.push('WXPAY_APP_ID');
    if (!cfg.mchId) missingFields.push('WXPAY_MCH_ID');
    if (!cfg.privateKey) missingFields.push('WXPAY_PRIVATE_KEY');
    if (!cfg.certSerial) missingFields.push('WXPAY_CERT_SERIAL');
    if (!cfg.apiV3Key) missingFields.push('WXPAY_API_V3_KEY');
    if (!cfg.publicKey) missingFields.push('WXPAY_PUBLIC_KEY');
    if (!cfg.notifyUrl) missingFields.push('WXPAY_NOTIFY_URL or APP_BASE_URL');

    return {
        channel: 'wxpay',
        mode: 'official',
        ready: missingFields.length === 0,
        missingFields,
        defaultCurrency: String(cfg.defaultCurrency || 'CNY').toUpperCase(),
        supportsMobileH5: true,
        supportsDesktopQr: true,
    };
}

function assertReady() {
    const status = getRuntimeStatus();
    if (!status.ready) {
        throw new Error(`Wxpay config incomplete: missing ${status.missingFields.join(', ')}`);
    }
}

function isMobileRequest(requestContext, order) {
    if (order?.metadata?.isMobile || requestContext?.isMobile) return true;
    return /AlipayClient|MicroMessenger|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
        trim(requestContext?.userAgent)
    );
}

function getClientIp(requestContext, order) {
    return (
        trim(requestContext?.clientIp) ||
        trim(order?.metadata?.clientIp) ||
        trim(order?.metadata?.payerClientIp)
    );
}

function buildReturnUrl(order) {
    const cfg = getWxpayConfig();
    const base = trim(cfg.returnUrl);
    if (!base) return '';

    let url;
    try {
        url = new URL(base);
    } catch {
        return '';
    }

    if (!url.searchParams.has('orderId') && trim(order?.id)) {
        url.searchParams.set('orderId', trim(order.id));
    }
    if (!url.searchParams.has('provider')) {
        url.searchParams.set('provider', 'wxpay');
    }
    return url.toString();
}

function appendRedirectUrl(h5Url, returnUrl) {
    const checkoutUrl = trim(h5Url);
    const redirectUrl = trim(returnUrl);
    if (!checkoutUrl || !redirectUrl) return checkoutUrl;

    let url;
    try {
        url = new URL(checkoutUrl);
    } catch {
        return checkoutUrl;
    }
    url.searchParams.set('redirect_url', redirectUrl);
    return url.toString();
}

function buildAuthorization(method, path, bodyText) {
    const cfg = getWxpayConfig();
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyText}\n`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(message);
    const signature = signer.sign(formatPrivateKey(cfg.privateKey), 'base64');
    return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${cfg.certSerial}",signature="${signature}"`;
}

async function requestWxpay({ method, path, body }) {
    assertReady();
    const cfg = getWxpayConfig();
    const bodyText = body ? JSON.stringify(body) : '';
    const authorization = buildAuthorization(method, path, bodyText);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
        const res = await fetch(buildUrl(cfg.apiBase, path), {
            method,
            headers: {
                Authorization: authorization,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': 'Immersive-Input/1.0',
            },
            body: bodyText || undefined,
            signal: controller.signal,
        });
        if (res.status === 204) return {};

        const text = await res.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { raw: text };
        }

        if (!res.ok) {
            throw new Error(
                data?.message || data?.code || data?.raw || `Wxpay request failed: ${res.status}`
            );
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function mapTradeState(rawState) {
    const state = trim(rawState).toUpperCase();
    if (state === 'SUCCESS') return PAYMENT_ORDER_STATUS.PAID;
    if (state === 'REFUND') return PAYMENT_ORDER_STATUS.REFUNDED;
    if (state === 'CLOSED') return PAYMENT_ORDER_STATUS.CANCELED;
    if (state === 'PAYERROR') return PAYMENT_ORDER_STATUS.FAILED;
    if (state === 'USERPAYING' || state === 'NOTPAY') return PAYMENT_ORDER_STATUS.REQUIRES_ACTION;
    return normalizePaymentStatus(state);
}

function decryptNotifyResource(resource) {
    const cfg = getWxpayConfig();
    const ciphertext = Buffer.from(trim(resource?.ciphertext), 'base64');
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(cfg.apiV3Key, 'utf8'),
        Buffer.from(trim(resource?.nonce), 'utf8')
    );
    decipher.setAuthTag(authTag);
    const associatedData = trim(resource?.associated_data);
    if (associatedData) {
        decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    }
    const decoded = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decoded.toString('utf8'));
}

function parseNotifyPayload(payload, rawBody) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload;
    }
    return JSON.parse(String(rawBody || '{}'));
}

function mapRefundState(rawStatus) {
    const status = trim(rawStatus).toUpperCase();
    if (status === 'SUCCESS') return PAYMENT_ORDER_STATUS.REFUNDED;
    if (status === 'ABNORMAL' || status === 'CLOSED') return PAYMENT_ORDER_STATUS.FAILED;
    if (status === 'PROCESSING') return PAYMENT_ORDER_STATUS.PENDING;
    return normalizePaymentStatus(status);
}

export function createWxpayAdapter() {
    return {
        name: 'wxpay',
        getRuntimeStatus,
        async createPayment({ order, requestContext = {} }) {
            assertReady();
            const cfg = getWxpayConfig();
            const description = trim(order.description) || trim(order.productCode) || `order_${order.id}`;
            const isMobile = isMobileRequest(requestContext, order);
            const clientIp = getClientIp(requestContext, order);
            const returnUrl = buildReturnUrl(order);

            if (isMobile && clientIp) {
                try {
                    const data = await requestWxpay({
                        method: 'POST',
                        path: '/v3/pay/transactions/h5',
                        body: {
                            appid: cfg.appId,
                            mchid: cfg.mchId,
                            description,
                            out_trade_no: order.id,
                            notify_url: cfg.notifyUrl,
                            amount: {
                                total: Number(order.amountCents || 0),
                                currency: cfg.defaultCurrency || 'CNY',
                            },
                            scene_info: {
                                payer_client_ip: clientIp,
                                h5_info: {
                                    type: 'Wap',
                                },
                            },
                        },
                    });
                    const checkoutUrl = appendRedirectUrl(data.h5_url, returnUrl);
                    return {
                        providerOrderId: '',
                        checkoutUrl,
                        status: PAYMENT_ORDER_STATUS.REQUIRES_ACTION,
                        raw: {
                            ...data,
                            checkoutPresentation: {
                                type: 'redirect',
                                url: checkoutUrl,
                                returnUrl,
                            },
                        },
                    };
                } catch (error) {
                    if (!(error instanceof Error) || !error.message.includes('NO_AUTH')) {
                        throw error;
                    }
                }
            }

            const data = await requestWxpay({
                method: 'POST',
                path: '/v3/pay/transactions/native',
                body: {
                    appid: cfg.appId,
                    mchid: cfg.mchId,
                    description,
                    out_trade_no: order.id,
                    notify_url: cfg.notifyUrl,
                    amount: {
                        total: Number(order.amountCents || 0),
                        currency: cfg.defaultCurrency || 'CNY',
                    },
                },
            });

            const codeUrl = trim(data.code_url);
            return {
                providerOrderId: '',
                checkoutUrl: codeUrl,
                status: PAYMENT_ORDER_STATUS.REQUIRES_ACTION,
                raw: {
                    ...data,
                    checkoutPresentation: {
                        type: 'qr',
                        qrContent: codeUrl,
                    },
                },
            };
        },
        async queryPayment({ order }) {
            assertReady();
            const cfg = getWxpayConfig();
            const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.id)}?mchid=${encodeURIComponent(cfg.mchId)}`;
            const data = await requestWxpay({
                method: 'GET',
                path,
            });
            return {
                providerOrderId: trim(data.transaction_id),
                checkoutUrl: trim(order.checkoutUrl),
                status: mapTradeState(data.trade_state),
                raw: data,
            };
        },
        async cancelPayment({ order }) {
            assertReady();
            const cfg = getWxpayConfig();
            const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.id)}/close`;
            const data = await requestWxpay({
                method: 'POST',
                path,
                body: {
                    mchid: cfg.mchId,
                },
            });
            return {
                providerOrderId: trim(order.externalOrderId) || trim(order.id),
                status: PAYMENT_ORDER_STATUS.CANCELED,
                accepted: true,
                raw: data,
            };
        },
        async refundPayment({ order, reason = '' }) {
            assertReady();
            const cfg = getWxpayConfig();
            const data = await requestWxpay({
                method: 'POST',
                path: '/v3/refund/domestic/refunds',
                body: {
                    out_trade_no: order.id,
                    transaction_id: trim(order.externalOrderId) || undefined,
                    out_refund_no: `refund_${order.id}`,
                    reason: trim(reason) || undefined,
                    notify_url: cfg.notifyUrl,
                    amount: {
                        refund: Number(order.amountCents || 0),
                        total: Number(order.amountCents || 0),
                        currency: order.currency || cfg.defaultCurrency || 'CNY',
                    },
                },
            });
            return {
                providerRefundId: trim(data.refund_id) || `wxpay_refund_${order.id}`,
                status: mapRefundState(data.status),
                accepted: true,
                raw: data,
            };
        },
        async verifyWebhook({ headers, rawBody }) {
            assertReady();
            const cfg = getWxpayConfig();
            const timestamp = getHeader(headers, 'wechatpay-timestamp');
            const nonce = getHeader(headers, 'wechatpay-nonce');
            const signature = getHeader(headers, 'wechatpay-signature');
            const serial = getHeader(headers, 'wechatpay-serial');

            if (!timestamp || !nonce || !signature || !serial) {
                return { ok: false, reason: 'Missing required Wechatpay signature headers' };
            }
            if (cfg.publicKeyId && serial !== cfg.publicKeyId) {
                return { ok: false, signature, reason: 'Wechatpay public key id mismatch' };
            }

            const parsedTimestamp = Number(timestamp);
            if (!Number.isFinite(parsedTimestamp)) {
                return { ok: false, signature, reason: 'Wechatpay timestamp invalid' };
            }
            if (Math.abs(Math.floor(Date.now() / 1000) - parsedTimestamp) > 300) {
                return { ok: false, signature, reason: 'Wechatpay timestamp expired' };
            }

            const message = `${timestamp}\n${nonce}\n${String(rawBody || '')}\n`;
            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(message);
            const ok = verifier.verify(formatPublicKey(cfg.publicKey), signature, 'base64');
            return {
                ok,
                signature,
                reason: ok ? '' : 'Wechatpay signature verification failed',
            };
        },
        parseWebhookEvent({ payload, rawBody }) {
            const data = parseNotifyPayload(payload, rawBody);
            const resource = data?.resource ? decryptNotifyResource(data.resource) : {};
            return {
                eventId: trim(data.id || resource.transaction_id || resource.out_trade_no),
                orderId: trim(resource.out_trade_no),
                externalOrderId: trim(resource.transaction_id),
                status: mapTradeState(resource.trade_state || data.event_type),
                rawPayload: {
                    ...data,
                    resource,
                },
            };
        },
        buildWebhookResponse({ success }) {
            return {
                type: 'json',
                status: success ? 200 : 500,
                body: success
                    ? { code: 'SUCCESS', message: 'success' }
                    : { code: 'FAIL', message: 'process failed' },
            };
        },
    };
}
