import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getPaymentRuntimeConfig } from '../server/lib/payment/config.js';
import { isOriginAllowed } from '../server/lib/http.js';
import { canTransition } from '../server/lib/payment/stateMachine.js';
import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../server/lib/payment/constants.js';
import { createAlipayAdapter } from '../server/lib/payment/custom/adapters/alipay.js';
import { createEasyPayAdapter } from '../server/lib/payment/custom/adapters/easypay.js';
import { createStripeAdapter } from '../server/lib/payment/custom/adapters/stripe.js';
import { createWxpayAdapter } from '../server/lib/payment/custom/adapters/wxpay.js';
import { generatePaymentOrderId } from '../server/lib/payment/gateway.js';
import paymentApiHandler from '../api/payment.js';
import {
    buildDeterministicWebhookEventId,
    verifyWebhookSignature,
} from '../server/lib/payment/custom/webhookSecurity.js';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) {
            delete process.env[key];
        }
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
        process.env[key] = value;
    }
}

test.afterEach(() => {
    restoreEnv();
});

test('payment config always runs custom orchestrator as active backend', () => {
    restoreEnv();
    const cfg = getPaymentRuntimeConfig();
    assert.equal(cfg.requestedBackend, 'custom_orchestrator');
    assert.equal(cfg.activeBackend, 'custom_orchestrator');
    assert.equal(cfg.customOrchestratorEnabled, true);
    assert.equal(cfg.customOrchestrator.adapter, 'stripe');
    assert.deepEqual(cfg.customOrchestrator.enabledAdapters, ['stripe']);
});

test('payment cors allows tauri dev localhost origin by default', () => {
    restoreEnv();
    assert.equal(isOriginAllowed('http://localhost:1420'), true);
    assert.equal(isOriginAllowed('http://127.0.0.1:1420'), true);
});

test('payment cors allows null origin for desktop webviews', () => {
    restoreEnv();
    assert.equal(isOriginAllowed('null'), true);
});

test('generated payment order id is gateway-safe for wxpay and alipay', () => {
    const orderId = generatePaymentOrderId();
    assert.match(orderId, /^[0-9a-z_*|-]{6,32}$/);
    assert.ok(orderId.length <= 32);
});

test('payment config loads webhook hardening settings', () => {
    restoreEnv();
    process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_SIGNATURE_HEADER = 'x-signature';
    process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_TIMESTAMP_HEADER = 'x-timestamp';
    process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_TOLERANCE_SECONDS = '180';
    process.env.CUSTOM_ORCHESTRATOR_ENFORCE_WEBHOOK_TIMESTAMP = 'true';
    const cfg = getPaymentRuntimeConfig();
    assert.equal(cfg.customOrchestrator.webhookSignatureHeader, 'x-signature');
    assert.equal(cfg.customOrchestrator.webhookTimestampHeader, 'x-timestamp');
    assert.equal(cfg.customOrchestrator.webhookToleranceSeconds, 180);
    assert.equal(cfg.customOrchestrator.enforceWebhookTimestamp, true);
});

test('normalizePaymentStatus maps common aliases', () => {
    assert.equal(normalizePaymentStatus('success'), PAYMENT_ORDER_STATUS.PAID);
    assert.equal(normalizePaymentStatus('succeeded'), PAYMENT_ORDER_STATUS.PAID);
    assert.equal(normalizePaymentStatus('completed'), PAYMENT_ORDER_STATUS.COMPLETED);
    assert.equal(normalizePaymentStatus('cancelled'), PAYMENT_ORDER_STATUS.CANCELED);
    assert.equal(normalizePaymentStatus('error'), PAYMENT_ORDER_STATUS.FAILED);
    assert.equal(normalizePaymentStatus('unknown_status'), PAYMENT_ORDER_STATUS.PENDING);
});

test('payment state machine allows and rejects expected transitions', () => {
    assert.equal(canTransition('PENDING', 'REQUIRES_ACTION'), true);
    assert.equal(canTransition('PENDING', 'PAID'), true);
    assert.equal(canTransition('PAID', 'COMPLETED'), true);
    assert.equal(canTransition('COMPLETED', 'REFUNDED'), true);
    assert.equal(canTransition('PENDING', 'COMPLETED'), false);
    assert.equal(canTransition('FAILED', 'PAID'), false);
    assert.equal(canTransition('CANCELED', 'PAID'), false);
});

test('verifyWebhookSignature accepts valid signature with timestamp binding', () => {
    const secret = 'test_secret';
    const rawBody = '{"order_id":"o_1","status":"paid"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    const result = verifyWebhookSignature({
        headers: {
            'x-custom-orchestrator-signature': signature,
            'x-custom-orchestrator-timestamp': String(timestamp),
        },
        rawBody,
        secret,
        enforceTimestamp: true,
        toleranceSeconds: 300,
    });

    assert.equal(result.ok, true);
    assert.equal(result.signature, signature);
});

test('verifyWebhookSignature rejects stale timestamp to prevent replay', () => {
    const secret = 'test_secret';
    const rawBody = '{"order_id":"o_1","status":"paid"}';
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${staleTimestamp}.${rawBody}`)
        .digest('hex');

    const result = verifyWebhookSignature({
        headers: {
            'x-custom-orchestrator-signature': signature,
            'x-custom-orchestrator-timestamp': String(staleTimestamp),
        },
        rawBody,
        secret,
        enforceTimestamp: true,
        toleranceSeconds: 120,
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /outside tolerance/i);
});


test('payment config supports overriding adapter to noop for fallback', () => {
    restoreEnv();
    process.env.CUSTOM_ORCHESTRATOR_ADAPTER = 'noop';
    const cfg = getPaymentRuntimeConfig();
    assert.equal(cfg.customOrchestrator.adapter, 'noop');
    assert.deepEqual(cfg.customOrchestrator.enabledAdapters, ['noop']);
});

test('payment config supports multiple enabled adapters', () => {
    restoreEnv();
    process.env.CUSTOM_ORCHESTRATOR_ADAPTER = 'stripe';
    process.env.CUSTOM_ORCHESTRATOR_ENABLED_ADAPTERS = 'stripe,alipay,wxpay';
    const cfg = getPaymentRuntimeConfig();
    assert.equal(cfg.customOrchestrator.defaultAdapter, 'stripe');
    assert.deepEqual(cfg.customOrchestrator.enabledAdapters, ['stripe', 'alipay', 'wxpay']);
});

test('payment config exposes wxpay return url when configured', () => {
    restoreEnv();
    process.env.WXPAY_RETURN_URL = 'https://pay.example.com/';
    const cfg = getPaymentRuntimeConfig();
    assert.equal(cfg.customOrchestrator.wxpay.returnUrl, 'https://pay.example.com/');
});

test('buildDeterministicWebhookEventId is stable for same payload and signature', () => {
    const first = buildDeterministicWebhookEventId({
        provider: 'custom_orchestrator',
        rawBody: '{"order_id":"o_1"}',
        signature: 'abc',
    });
    const second = buildDeterministicWebhookEventId({
        provider: 'custom_orchestrator',
        rawBody: '{"order_id":"o_1"}',
        signature: 'abc',
    });
    assert.equal(first, second);
});

test('easypay adapter runtime status reports required env keys when missing', () => {
    restoreEnv();
    delete process.env.EASYPAY_PID;
    delete process.env.EASYPAY_KEY;
    delete process.env.EASYPAY_API_BASE;
    delete process.env.EASYPAY_NOTIFY_URL;
    const adapter = createEasyPayAdapter();
    const status = adapter.getRuntimeStatus();
    assert.equal(status.ready, false);
    assert.deepEqual(
        status.missingFields,
        ['EASYPAY_PID', 'EASYPAY_KEY', 'EASYPAY_API_BASE', 'EASYPAY_NOTIFY_URL']
    );
});

test('easypay adapter verifies callback signature with md5 protocol', async () => {
    restoreEnv();
    process.env.EASYPAY_PID = '10001';
    process.env.EASYPAY_KEY = 'abc123456';
    process.env.EASYPAY_API_BASE = 'https://pay.example.com';
    process.env.EASYPAY_NOTIFY_URL = 'https://app.example.com/api/payment/webhook';

    const payload = {
        pid: '10001',
        out_trade_no: 'order_1',
        trade_no: 'trade_1',
        trade_status: 'TRADE_SUCCESS',
        money: '29.90',
    };
    const signBase = Object.keys(payload)
        .sort()
        .map((k) => `${k}=${payload[k]}`)
        .join('&');
    const sign = crypto.createHash('md5').update(`${signBase}&key=abc123456`, 'utf8').digest('hex');

    const adapter = createEasyPayAdapter();
    const verified = await adapter.verifyWebhook({
        payload: {
            ...payload,
            sign,
            sign_type: 'MD5',
        },
        rawBody: '',
    });
    assert.equal(verified.ok, true);
});

test('alipay adapter runtime status reports required env keys when missing', () => {
    restoreEnv();
    delete process.env.ALIPAY_APP_ID;
    delete process.env.ALIPAY_PRIVATE_KEY;
    delete process.env.ALIPAY_PUBLIC_KEY;
    const adapter = createAlipayAdapter();
    const status = adapter.getRuntimeStatus();
    assert.equal(status.ready, false);
    assert.deepEqual(status.missingFields, [
        'ALIPAY_APP_ID',
        'ALIPAY_PRIVATE_KEY',
        'ALIPAY_PUBLIC_KEY',
        'ALIPAY_NOTIFY_URL or APP_BASE_URL',
    ]);
});

test('alipay adapter does not require response signature verification by default', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        async arrayBuffer() {
            return Buffer.from(
                JSON.stringify({
                    alipay_trade_query_response: {
                        code: '10000',
                        msg: 'Success',
                        trade_status: 'WAIT_BUYER_PAY',
                        trade_no: '202604150001',
                        out_trade_no: 'order_query',
                    },
                    sign: 'invalid-signature',
                })
            );
        },
        headers: {
            get(name) {
                return String(name || '').toLowerCase() === 'content-type'
                    ? 'application/json; charset=utf-8'
                    : '';
            },
        },
    });

    try {
        const adapter = createAlipayAdapter();
        const result = await adapter.queryPayment({
            order: {
                id: 'order_query',
                checkoutUrl: 'https://openapi.alipay.com/gateway.do?...',
            },
        });

        assert.equal(result.providerOrderId, '202604150001');
        assert.equal(result.status, PAYMENT_ORDER_STATUS.REQUIRES_ACTION);
    } finally {
        global.fetch = originalFetch;
    }
});

test('alipay adapter can enforce response signature verification when enabled', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';
    process.env.ALIPAY_VERIFY_RESPONSE_SIGNATURE = 'true';

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        async arrayBuffer() {
            return Buffer.from(
                JSON.stringify({
                    alipay_trade_query_response: {
                        code: '10000',
                        msg: 'Success',
                        trade_status: 'WAIT_BUYER_PAY',
                        trade_no: '202604150001',
                        out_trade_no: 'order_query',
                    },
                    sign: 'invalid-signature',
                })
            );
        },
        headers: {
            get(name) {
                return String(name || '').toLowerCase() === 'content-type'
                    ? 'application/json; charset=utf-8'
                    : '';
            },
        },
    });

    try {
        const adapter = createAlipayAdapter();
        await assert.rejects(
            () =>
                adapter.queryPayment({
                    order: {
                        id: 'order_query',
                        checkoutUrl: 'https://openapi.alipay.com/gateway.do?...',
                    },
                }),
            /response signature verification failed/
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test('alipay adapter uses browser cashier redirect on desktop by default', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';

    process.env.ALIPAY_RETURN_URL = 'https://pay.example.com/pay/result';
    process.env.ALIPAY_API_BASE = 'https://openapi.alipay.com/gateway.do';

    const adapter = createAlipayAdapter();
    const result = await adapter.createPayment({
        order: {
            id: 'order_desktop',
            amountCents: 2990,
            description: 'membership topup',
            productCode: 'membership_topup',
            metadata: {},
        },
        requestContext: {
            isMobile: false,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
    });

    assert.match(result.checkoutUrl, /^https:\/\/openapi\.alipay\.com\/gateway\.do\?/);
    assert.equal(result.raw.method, 'alipay.trade.page.pay');
    assert.equal(result.raw.isMobile, false);
    assert.equal(result.raw.checkoutPresentation.type, 'redirect');
});

test('alipay adapter can still create desktop QR payment when explicitly enabled', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';
    process.env.ALIPAY_DESKTOP_MODE = 'qr';

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        async arrayBuffer() {
            return Buffer.from(
                JSON.stringify({
                    alipay_trade_precreate_response: {
                        code: '10000',
                        msg: 'Success',
                        out_trade_no: 'order_desktop',
                        qr_code: 'https://qr.alipay.example/order_desktop',
                    },
                })
            );
        },
        headers: {
            get(name) {
                return String(name || '').toLowerCase() === 'content-type'
                    ? 'application/json; charset=utf-8'
                    : '';
            },
        },
    });

    try {
        const adapter = createAlipayAdapter();
        const result = await adapter.createPayment({
            order: {
                id: 'order_desktop',
                amountCents: 2990,
                description: 'membership topup',
                productCode: 'membership_topup',
                metadata: {},
            },
            requestContext: {
                isMobile: false,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
        });

        assert.equal(result.checkoutUrl, 'https://qr.alipay.example/order_desktop');
        assert.equal(result.raw.method, 'alipay.trade.precreate');
        assert.equal(result.raw.checkoutPresentation.type, 'qr');
        assert.equal(result.raw.checkoutPresentation.qrContent, 'https://qr.alipay.example/order_desktop');
    } finally {
        global.fetch = originalFetch;
    }
});

test('alipay adapter keeps mobile checkout as redirect page', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';
    process.env.ALIPAY_RETURN_URL = 'https://pay.example.com/pay/result';
    process.env.ALIPAY_API_BASE = 'https://openapi.alipay.com/gateway.do';

    const adapter = createAlipayAdapter();
    const result = await adapter.createPayment({
        order: {
            id: 'order_mobile',
            amountCents: 990,
            description: 'membership topup',
            productCode: 'membership_topup',
            metadata: {},
        },
        requestContext: {
            isMobile: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
        },
    });

    assert.match(result.checkoutUrl, /^https:\/\/openapi\.alipay\.com\/gateway\.do\?/);
    assert.equal(result.raw.method, 'alipay.trade.wap.pay');
    assert.equal(result.raw.isMobile, true);
});

test('alipay adapter cancels order via trade.close', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        async arrayBuffer() {
            return Buffer.from(
                JSON.stringify({
                    alipay_trade_close_response: {
                        code: '10000',
                        msg: 'Success',
                        trade_no: '2026041500001',
                        out_trade_no: 'order_cancel',
                    },
                })
            );
        },
        headers: {
            get(name) {
                return String(name || '').toLowerCase() === 'content-type'
                    ? 'application/json; charset=utf-8'
                    : '';
            },
        },
    });

    try {
        const adapter = createAlipayAdapter();
        const result = await adapter.cancelPayment({
            order: {
                id: 'order_cancel',
                externalOrderId: '2026041500001',
            },
        });

        assert.equal(result.providerOrderId, '2026041500001');
        assert.equal(result.status, PAYMENT_ORDER_STATUS.CANCELED);
        assert.equal(result.accepted, true);
    } finally {
        global.fetch = originalFetch;
    }
});

test('alipay adapter closes with trade_no from latest query metadata when external id is missing', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';

    const originalFetch = global.fetch;
    let requestBody = '';
    global.fetch = async (_, init = {}) => {
        requestBody = String(init.body || '');
        return {
            ok: true,
            async arrayBuffer() {
                return Buffer.from(
                    JSON.stringify({
                        alipay_trade_close_response: {
                            code: '10000',
                            msg: 'Success',
                            trade_no: '2026041500002',
                            out_trade_no: 'order_cancel_meta',
                        },
                    })
                );
            },
            headers: {
                get(name) {
                    return String(name || '').toLowerCase() === 'content-type'
                        ? 'application/json; charset=utf-8'
                        : '';
                },
            },
        };
    };

    try {
        const adapter = createAlipayAdapter();
        const result = await adapter.cancelPayment({
            order: {
                id: 'order_cancel_meta',
                metadata: {
                    gatewayQueryResponse: {
                        trade_no: '2026041500002',
                    },
                },
            },
        });

        const params = new URLSearchParams(requestBody);
        const bizContent = JSON.parse(params.get('biz_content') || '{}');

        assert.equal(bizContent.trade_no, '2026041500002');
        assert.equal(bizContent.out_trade_no, 'order_cancel_meta');
        assert.equal(result.providerOrderId, '2026041500002');
        assert.equal(result.status, PAYMENT_ORDER_STATUS.CANCELED);
    } finally {
        global.fetch = originalFetch;
    }
});

test('alipay adapter treats trade.close ACQ.TRADE_NOT_EXIST as idempotent cancel', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ALIPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        async arrayBuffer() {
            return Buffer.from(
                JSON.stringify({
                    alipay_trade_close_response: {
                        code: '40004',
                        msg: 'Business Failed',
                        sub_code: 'ACQ.TRADE_NOT_EXIST',
                        sub_msg: 'trade not exist',
                    },
                })
            );
        },
        headers: {
            get(name) {
                return String(name || '').toLowerCase() === 'content-type'
                    ? 'application/json; charset=utf-8'
                    : '';
            },
        },
    });

    try {
        const adapter = createAlipayAdapter();
        const result = await adapter.cancelPayment({
            order: {
                id: 'order_cancel_missing',
            },
        });

        assert.equal(result.providerOrderId, 'order_cancel_missing');
        assert.equal(result.status, PAYMENT_ORDER_STATUS.CANCELED);
        assert.equal(result.accepted, true);
        assert.equal(result.raw.trade_status, 'TRADE_NOT_EXIST');
    } finally {
        global.fetch = originalFetch;
    }
});

test('stripe adapter runtime status reports required env keys when missing', () => {
    restoreEnv();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SUCCESS_URL;
    delete process.env.STRIPE_CANCEL_URL;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const adapter = createStripeAdapter();
    const status = adapter.getRuntimeStatus();
    assert.equal(status.ready, false);
    assert.deepEqual(
        status.missingFields,
        ['STRIPE_SECRET_KEY', 'STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL', 'STRIPE_WEBHOOK_SECRET']
    );
});

test('stripe adapter verifies webhook signature using stripe-signature header', async () => {
    restoreEnv();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_SUCCESS_URL = 'https://example.com/success';
    process.env.STRIPE_CANCEL_URL = 'https://example.com/cancel';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
    process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS = '300';

    const rawBody =
        '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{"id":"cs_1","metadata":{"order_id":"order_1"}}}}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${rawBody}`;
    const signature = crypto
        .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
        .update(signedPayload, 'utf8')
        .digest('hex');
    const signatureHeader = `t=${timestamp},v1=${signature}`;

    const adapter = createStripeAdapter();
    const verified = await adapter.verifyWebhook({
        headers: {
            'stripe-signature': signatureHeader,
        },
        rawBody,
    });
    assert.equal(verified.ok, true);
});

test('wxpay adapter runtime status reports required env keys when missing', () => {
    restoreEnv();
    delete process.env.WXPAY_APP_ID;
    delete process.env.WXPAY_MCH_ID;
    delete process.env.WXPAY_PRIVATE_KEY;
    delete process.env.WXPAY_CERT_SERIAL;
    delete process.env.WXPAY_API_V3_KEY;
    delete process.env.WXPAY_PUBLIC_KEY;
    const adapter = createWxpayAdapter();
    const status = adapter.getRuntimeStatus();
    assert.equal(status.ready, false);
    assert.deepEqual(status.missingFields, [
        'WXPAY_APP_ID',
        'WXPAY_MCH_ID',
        'WXPAY_PRIVATE_KEY',
        'WXPAY_CERT_SERIAL',
        'WXPAY_API_V3_KEY',
        'WXPAY_PUBLIC_KEY',
        'WXPAY_NOTIFY_URL or APP_BASE_URL',
    ]);
});

test('payment config endpoint is publicly readable without bearer token', async () => {
    restoreEnv();
    const headers = new Map();
    let body = '';
    const res = {
        statusCode: 0,
        setHeader(name, value) {
            headers.set(name, value);
        },
        end(value) {
            body = String(value || '');
        },
    };

    await paymentApiHandler(
        {
            method: 'GET',
            headers: {},
            url: '/api/payment?route=config',
        },
        res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(headers.get('Content-Type'), 'application/json; charset=utf-8');
    assert.equal(JSON.parse(body).ok, true);
});

test('wxpay adapter appends H5 redirect_url when return url is configured', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.WXPAY_APP_ID = 'wx123';
    process.env.WXPAY_MCH_ID = 'mch123';
    process.env.WXPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.WXPAY_CERT_SERIAL = 'serial123';
    process.env.WXPAY_API_V3_KEY = '12345678901234567890123456789012';
    process.env.WXPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.WXPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';
    process.env.WXPAY_RETURN_URL = 'https://pay.example.com/';

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
            return JSON.stringify({
                h5_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx123',
            });
        },
    });

    try {
        const adapter = createWxpayAdapter();
        const result = await adapter.createPayment({
            order: {
                id: 'order_123',
                amountCents: 2990,
                description: 'membership topup',
                productCode: 'membership_topup',
                metadata: {},
            },
            requestContext: {
                isMobile: true,
                clientIp: '127.0.0.1',
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
            },
        });

        const checkoutUrl = new URL(result.checkoutUrl);
        assert.equal(checkoutUrl.origin, 'https://wx.tenpay.com');
        assert.equal(checkoutUrl.searchParams.get('prepay_id'), 'wx123');
        assert.equal(
            checkoutUrl.searchParams.get('redirect_url'),
            'https://pay.example.com/?orderId=order_123&provider=wxpay'
        );
        assert.equal(result.raw.checkoutPresentation.returnUrl, 'https://pay.example.com/?orderId=order_123&provider=wxpay');
    } finally {
        global.fetch = originalFetch;
    }
});

test('wxpay adapter closes order via close endpoint', async () => {
    restoreEnv();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    process.env.WXPAY_APP_ID = 'wx123';
    process.env.WXPAY_MCH_ID = 'mch123';
    process.env.WXPAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.WXPAY_CERT_SERIAL = 'serial123';
    process.env.WXPAY_API_V3_KEY = '12345678901234567890123456789012';
    process.env.WXPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.WXPAY_NOTIFY_URL = 'https://pay.example.com/api/payment/webhook';

    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = async (url, options = {}) => {
        requests.push({
            url: String(url),
            method: options.method || 'GET',
            body: String(options.body || ''),
        });
        return {
            status: 204,
        };
    };

    try {
        const adapter = createWxpayAdapter();
        const result = await adapter.cancelPayment({
            order: {
                id: 'order_close',
                externalOrderId: 'wx_tx_1',
            },
        });

        assert.equal(requests.length, 1);
        assert.match(requests[0].url, /\/v3\/pay\/transactions\/out-trade-no\/order_close\/close$/);
        assert.equal(requests[0].method, 'POST');
        assert.equal(requests[0].body, JSON.stringify({ mchid: 'mch123' }));
        assert.equal(result.providerOrderId, 'wx_tx_1');
        assert.equal(result.status, PAYMENT_ORDER_STATUS.CANCELED);
        assert.equal(result.accepted, true);
    } finally {
        global.fetch = originalFetch;
    }
});
