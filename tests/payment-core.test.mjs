import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getPaymentRuntimeConfig } from '../api/_lib/payment/config.js';
import { canTransition } from '../api/_lib/payment/stateMachine.js';
import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../api/_lib/payment/constants.js';
import { createAlipayAdapter } from '../api/_lib/payment/custom/adapters/alipay.js';
import { createEasyPayAdapter } from '../api/_lib/payment/custom/adapters/easypay.js';
import { createStripeAdapter } from '../api/_lib/payment/custom/adapters/stripe.js';
import { createWxpayAdapter } from '../api/_lib/payment/custom/adapters/wxpay.js';
import {
    buildDeterministicWebhookEventId,
    verifyWebhookSignature,
} from '../api/_lib/payment/custom/webhookSecurity.js';

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
