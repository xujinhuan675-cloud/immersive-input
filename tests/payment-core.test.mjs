import test from 'node:test';
import assert from 'node:assert/strict';

import { getPaymentRuntimeConfig } from '../api/_lib/payment/config.js';
import { canTransition } from '../api/_lib/payment/stateMachine.js';
import { normalizePaymentStatus, PAYMENT_ORDER_STATUS } from '../api/_lib/payment/constants.js';

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

test('payment config falls back to sub2apipay when custom orchestrator is disabled', () => {
    restoreEnv();
    process.env.PAYMENT_ACTIVE_BACKEND = 'custom_orchestrator';
    process.env.PAYMENT_ENABLE_CUSTOM_ORCHESTRATOR = 'false';
    const cfg = getPaymentRuntimeConfig();
    assert.equal(cfg.requestedBackend, 'custom_orchestrator');
    assert.equal(cfg.activeBackend, 'sub2apipay');
    assert.equal(cfg.customOrchestratorEnabled, false);
});

test('payment config activates custom orchestrator when switch is enabled', () => {
    restoreEnv();
    process.env.PAYMENT_ACTIVE_BACKEND = 'custom_orchestrator';
    process.env.PAYMENT_ENABLE_CUSTOM_ORCHESTRATOR = 'true';
    process.env.CUSTOM_ORCHESTRATOR_ADAPTER = 'mock';
    const cfg = getPaymentRuntimeConfig();
    assert.equal(cfg.activeBackend, 'custom_orchestrator');
    assert.equal(cfg.customOrchestrator.adapter, 'mock');
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
