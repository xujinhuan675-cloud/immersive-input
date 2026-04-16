import crypto from 'node:crypto';

import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../../constants.js';
import { getPaymentRuntimeConfig } from '../../config.js';

const HEADER_CHARSET_RE = /charset=([^;]+)/i;
const BODY_CHARSET_RE = /(?:^|&)charset=([^&]+)/i;

function trim(value) {
    return String(value || '').trim();
}

function pickFirst(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
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

function normalizeCharset(charset) {
    const normalized = trim(charset).replace(/^['"]|['"]$/g, '').toLowerCase();
    if (!normalized) return '';
    if (normalized === 'utf8') return 'utf-8';
    if (normalized === 'gb2312' || normalized === 'gb_2312-80') return 'gbk';
    return normalized;
}

function detectCharsetFromHeaders(headers) {
    const contentType = trim(headers?.['content-type'] || headers?.['Content-Type']);
    return normalizeCharset(contentType.match(HEADER_CHARSET_RE)?.[1]);
}

function detectCharsetFromBuffer(buffer) {
    const latin1Body = buffer.toString('latin1');
    const match = latin1Body.match(BODY_CHARSET_RE);
    if (!match) return '';
    try {
        return normalizeCharset(decodeURIComponent(match[1].replace(/\+/g, ' ')));
    } catch {
        return normalizeCharset(match[1]);
    }
}

function decodeBuffer(buffer, charset) {
    return new TextDecoder(charset).decode(buffer);
}

function decodeAlipayPayload(rawBody, headers = {}) {
    if (typeof rawBody === 'string') return rawBody;
    const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '');
    const primaryCharset = detectCharsetFromHeaders(headers) || detectCharsetFromBuffer(buffer) || 'utf-8';
    const candidates = Array.from(new Set([primaryCharset, 'utf-8', 'gbk', 'gb18030']));
    let fallbackDecoded = '';
    let lastError = null;

    for (const charset of candidates) {
        try {
            const decoded = decodeBuffer(buffer, charset);
            if (!decoded.includes('\uFFFD')) {
                return decoded;
            }
            fallbackDecoded ||= decoded;
        } catch (error) {
            lastError = error;
        }
    }

    if (fallbackDecoded) return fallbackDecoded;
    throw new Error(
        `Failed to decode Alipay payload${lastError instanceof Error ? `: ${lastError.message}` : ''}`
    );
}

function buildSignedContent(params, { excludeSignType = false } = {}) {
    return Object.entries(params || {})
        .filter(([key, value]) => {
            if (key === 'sign') return false;
            if (excludeSignType && key === 'sign_type') return false;
            return value !== '' && value !== undefined && value !== null;
        })
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
}

function generateSign(params, privateKey) {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(buildSignedContent(params));
    return signer.sign(formatPrivateKey(privateKey), 'base64');
}

function verifySign(params, publicKey, sign) {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(buildSignedContent(params, { excludeSignType: true }));
    return verifier.verify(formatPublicKey(publicKey), trim(sign), 'base64');
}

function verifyResponseSign(rawText, responseKey, publicKey, sign) {
    const keyPattern = `"${responseKey}"`;
    const keyIndex = rawText.indexOf(keyPattern);
    if (keyIndex < 0) return false;

    const colonIndex = rawText.indexOf(':', keyIndex + keyPattern.length);
    if (colonIndex < 0) return false;

    let start = colonIndex + 1;
    while (start < rawText.length && rawText[start] === ' ') {
        start += 1;
    }

    let depth = 0;
    let end = start;
    let inString = false;
    let escaped = false;
    for (let index = start; index < rawText.length; index += 1) {
        const char = rawText[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                end = index + 1;
                break;
            }
        }
    }

    const content = rawText.slice(start, end);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(content);
    return verifier.verify(formatPublicKey(publicKey), trim(sign), 'base64');
}

function parseNotificationParams(rawBody, headers = {}) {
    const body = decodeAlipayPayload(rawBody, headers);
    const searchParams = new URLSearchParams(body);
    const params = {};
    for (const [key, value] of searchParams.entries()) {
        params[key] = key === 'sign' ? value.replace(/ /g, '+').trim() : value;
    }
    return params;
}

function getTimestampString() {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    return formatter.format(new Date()).replace('T', ' ');
}

function getAlipayConfig() {
    return getPaymentRuntimeConfig().customOrchestrator.alipay;
}

function getRuntimeStatus() {
    const cfg = getAlipayConfig();
    const missingFields = [];
    if (!cfg.appId) missingFields.push('ALIPAY_APP_ID');
    if (!cfg.privateKey) missingFields.push('ALIPAY_PRIVATE_KEY');
    if (!cfg.publicKey) missingFields.push('ALIPAY_PUBLIC_KEY');
    if (!cfg.notifyUrl) missingFields.push('ALIPAY_NOTIFY_URL or APP_BASE_URL');

    return {
        channel: 'alipay',
        mode: 'official',
        ready: missingFields.length === 0,
        missingFields,
        defaultCurrency: String(cfg.defaultCurrency || 'CNY').toUpperCase(),
        supportsMobileH5: true,
        supportsDesktopQr: trim(cfg.desktopMode).toLowerCase() === 'qr',
        supportsDesktopRedirect: trim(cfg.desktopMode).toLowerCase() !== 'qr',
        verifyResponseSign: !!cfg.verifyResponseSign,
    };
}

function assertReady() {
    const status = getRuntimeStatus();
    if (!status.ready) {
        throw new Error(`Alipay config incomplete: missing ${status.missingFields.join(', ')}`);
    }
}

function resolvePaymentMethod(requestContext, order) {
    const cfg = getAlipayConfig();
    const isMobile =
        !!order?.metadata?.isMobile ||
        !!requestContext?.isMobile ||
        /mobile/i.test(trim(requestContext?.userAgent));
    const desktopMode = trim(cfg.desktopMode).toLowerCase() === 'qr' ? 'qr' : 'redirect';
    return {
        isMobile,
        desktopMode,
        method: isMobile
            ? 'alipay.trade.wap.pay'
            : desktopMode === 'qr'
              ? 'alipay.trade.precreate'
              : 'alipay.trade.page.pay',
        productCode: isMobile ? 'QUICK_WAP_WAY' : 'FAST_INSTANT_TRADE_PAY',
    };
}

function buildPageUrl({ order, requestContext }) {
    const cfg = getAlipayConfig();
    const { isMobile, method, productCode } = resolvePaymentMethod(requestContext, order);
    const params = {
        app_id: cfg.appId,
        format: 'JSON',
        charset: 'utf-8',
        sign_type: 'RSA2',
        timestamp: getTimestampString(),
        version: '1.0',
        method,
        notify_url: cfg.notifyUrl,
        biz_content: JSON.stringify({
            out_trade_no: order.id,
            product_code: productCode,
            total_amount: (Number(order.amountCents || 0) / 100).toFixed(2),
            subject: trim(order.description) || trim(order.productCode) || `order_${order.id}`,
        }),
    };
    if (cfg.returnUrl) {
        params.return_url = cfg.returnUrl;
    }
    params.sign = generateSign(params, cfg.privateKey);
    return {
        isMobile,
        method,
        url: `${cfg.gatewayBase}?${new URLSearchParams(params).toString()}`,
    };
}

async function executeAlipay(method, bizContent) {
    assertReady();
    const cfg = getAlipayConfig();
    const params = {
        app_id: cfg.appId,
        format: 'JSON',
        charset: 'utf-8',
        sign_type: 'RSA2',
        timestamp: getTimestampString(),
        version: '1.0',
        method,
        biz_content: JSON.stringify(bizContent),
    };
    params.sign = generateSign(params, cfg.privateKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
        const res = await fetch(cfg.gatewayBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(params).toString(),
            signal: controller.signal,
        });
        const rawBody = Buffer.from(await res.arrayBuffer());
        const rawText = decodeAlipayPayload(rawBody, {
            'content-type': res.headers.get('content-type') || '',
        });
        const data = JSON.parse(rawText || '{}');
        const responseKey = `${method.replace(/\./g, '_')}_response`;
        const responseSign = trim(data.sign);
        if (
            cfg.verifyResponseSign &&
            responseSign &&
            !verifyResponseSign(rawText, responseKey, cfg.publicKey, responseSign)
        ) {
            throw new Error(
                `Alipay API response signature verification failed for ${method}. Check ALIPAY_PUBLIC_KEY is the Alipay platform public key for the same app/environment, not your app public key.`
            );
        }

        const result = data?.[responseKey];
        if (!result) {
            throw new Error(`Alipay API error: unexpected response format for ${method}`);
        }
        if (trim(result.code) !== '10000') {
            if (trim(result.sub_code) === 'ACQ.ACCESS_FORBIDDEN') {
                throw new Error(
                    'Alipay QR payment is not enabled for this app yet. Open the Face-to-Face / precreate capability, complete app go-live, or switch desktop Alipay back to browser checkout.'
                );
            }
            throw new Error(
                `Alipay API error: [${result.sub_code || result.code}] ${result.sub_msg || result.msg}`
            );
        }
        return result;
    } finally {
        clearTimeout(timer);
    }
}

function mapAlipayStatus(rawStatus) {
    const status = trim(rawStatus).toUpperCase();
    if (status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED') {
        return PAYMENT_ORDER_STATUS.PAID;
    }
    if (status === 'TRADE_CLOSED') {
        return PAYMENT_ORDER_STATUS.CANCELED;
    }
    if (status === 'WAIT_BUYER_PAY') {
        return PAYMENT_ORDER_STATUS.REQUIRES_ACTION;
    }
    return normalizePaymentStatus(status);
}

function mapAlipayRefundStatus(result) {
    if (trim(result?.fund_change).toUpperCase() === 'Y') {
        return PAYMENT_ORDER_STATUS.REFUNDED;
    }
    return PAYMENT_ORDER_STATUS.PENDING;
}

function isTradeNotExistError(error) {
    return error instanceof Error && error.message.includes('[ACQ.TRADE_NOT_EXIST]');
}

function resolveTradeNo(order) {
    return trim(
        pickFirst(
            order?.externalOrderId,
            order?.metadata?.gatewayQueryResponse?.trade_no,
            order?.metadata?.webhookPayload?.trade_no,
            order?.metadata?.gatewayCreateResponse?.trade_no
        )
    );
}

export function createAlipayAdapter() {
    return {
        name: 'alipay',
        getRuntimeStatus,
        async createPayment({ order, requestContext = {} }) {
            assertReady();
            const payment = resolvePaymentMethod(requestContext, order);
            if (!payment.isMobile && payment.desktopMode === 'qr') {
                const result = await executeAlipay('alipay.trade.precreate', {
                    out_trade_no: order.id,
                    total_amount: (Number(order.amountCents || 0) / 100).toFixed(2),
                    subject: trim(order.description) || trim(order.productCode) || `order_${order.id}`,
                });
                const qrCode = trim(result.qr_code);
                if (!qrCode) {
                    throw new Error('Alipay API error: missing qr_code in precreate response');
                }
                return {
                    providerOrderId: trim(result.out_trade_no),
                    checkoutUrl: qrCode,
                    status: PAYMENT_ORDER_STATUS.REQUIRES_ACTION,
                    raw: {
                        qrCode,
                        method: 'alipay.trade.precreate',
                        isMobile: false,
                        checkoutPresentation: {
                            type: 'qr',
                            qrContent: qrCode,
                        },
                        response: result,
                    },
                };
            }
            const page = buildPageUrl({ order, requestContext });
            return {
                providerOrderId: '',
                checkoutUrl: page.url,
                status: PAYMENT_ORDER_STATUS.REQUIRES_ACTION,
                raw: {
                    payUrl: page.url,
                    method: page.method,
                    isMobile: page.isMobile,
                    checkoutPresentation: {
                        type: 'redirect',
                        url: page.url,
                    },
                },
            };
        },
        async queryPayment({ order }) {
            assertReady();
            try {
                const result = await executeAlipay('alipay.trade.query', {
                    out_trade_no: order.id,
                });
                return {
                    providerOrderId: trim(result.trade_no),
                    checkoutUrl: trim(order.checkoutUrl),
                    status: mapAlipayStatus(result.trade_status),
                    raw: result,
                };
            } catch (error) {
                if (isTradeNotExistError(error)) {
                    return {
                        providerOrderId: trim(order.externalOrderId),
                        checkoutUrl: trim(order.checkoutUrl),
                        status: PAYMENT_ORDER_STATUS.PENDING,
                        raw: {
                            message: error.message,
                        },
                    };
                }
                throw error;
            }
        },
        async cancelPayment({ order }) {
            assertReady();
            const bizContent = {
                out_trade_no: order.id,
            };
            const tradeNo = resolveTradeNo(order);
            if (tradeNo) {
                bizContent.trade_no = tradeNo;
            }
            let result;
            try {
                result = await executeAlipay('alipay.trade.close', bizContent);
            } catch (error) {
                if (!isTradeNotExistError(error)) {
                    throw error;
                }
                result = {
                    code: '10000',
                    msg: 'Success',
                    out_trade_no: order.id,
                    trade_no: tradeNo,
                    trade_status: 'TRADE_NOT_EXIST',
                };
            }
            return {
                providerOrderId: trim(result.trade_no) || tradeNo || trim(order.id),
                status: PAYMENT_ORDER_STATUS.CANCELED,
                accepted: true,
                raw: result,
            };
        },
        async refundPayment({ order, reason = '' }) {
            assertReady();
            const bizContent = {
                out_trade_no: order.id,
                refund_amount: (Number(order.amountCents || 0) / 100).toFixed(2),
                out_request_no: `refund_${order.id}`,
            };
            const tradeNo = resolveTradeNo(order);
            if (tradeNo) {
                bizContent.trade_no = tradeNo;
            }
            if (trim(reason)) {
                bizContent.refund_reason = trim(reason);
            }
            const result = await executeAlipay('alipay.trade.refund', bizContent);
            return {
                providerRefundId: trim(result.trade_no) || tradeNo || `alipay_refund_${order.id}`,
                status: mapAlipayRefundStatus(result),
                accepted: true,
                raw: result,
            };
        },
        async verifyWebhook({ headers, rawBody }) {
            assertReady();
            const cfg = getAlipayConfig();
            const data = parseNotificationParams(rawBody, headers);
            const sign = trim(data.sign);

            if (!sign) {
                return { ok: false, reason: 'Missing Alipay sign' };
            }
            if (trim(data.sign_type) && trim(data.sign_type).toUpperCase() !== 'RSA2') {
                return { ok: false, signature: sign, reason: 'Unsupported Alipay sign_type' };
            }
            if (trim(data.app_id) && trim(data.app_id) !== cfg.appId) {
                return { ok: false, signature: sign, reason: 'Alipay app_id mismatch' };
            }

            const ok = verifySign(data, cfg.publicKey, sign);
            return {
                ok,
                signature: sign,
                reason: ok ? '' : 'Alipay signature verification failed',
            };
        },
        parseWebhookEvent({ payload, rawBody, headers }) {
            const data =
                payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length > 0
                    ? payload
                    : parseNotificationParams(rawBody, headers);
            return {
                eventId: pickFirst(data.notify_id, data.trade_no, data.out_trade_no, null),
                orderId: trim(data.out_trade_no),
                externalOrderId: trim(data.trade_no),
                status: mapAlipayStatus(data.trade_status),
                rawPayload: data,
            };
        },
        buildWebhookResponse({ success }) {
            return {
                type: 'text',
                status: success ? 200 : 500,
                contentType: 'text/plain; charset=utf-8',
                body: success ? 'success' : 'fail',
            };
        },
    };
}
