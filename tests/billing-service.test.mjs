import test from 'node:test';
import assert from 'node:assert/strict';

import {
    computeSubscriptionGrant,
    computeTopupCredits,
    computeUsageDecision,
    normalizeBillingProfile,
} from '../api/_lib/billing/engine.js';
import { createBillingService } from '../api/_lib/billing/service.js';

function createMemoryBillingService({
    freeDailyQuota = 20,
    topupCreditsPerCny = 100,
    allowCreditFallback = true,
    now = new Date('2026-04-08T10:00:00.000Z'),
} = {}) {
    const profiles = new Map();
    const usageByIdempotency = new Map();
    const ledgerGrantKeys = new Set();
    const ledgerEntries = [];
    let seq = 0;

    const clone = (v) => JSON.parse(JSON.stringify(v));
    const service = createBillingService({
        getBillingRuntimeConfig: () => ({
            freeDailyQuota,
            topupCreditsPerCny,
            allowCreditFallback,
        }),
        computeSubscriptionGrant,
        computeTopupCredits,
        computeUsageDecision,
        normalizeBillingProfile,
        getBillingProfile: async (userId) => clone(profiles.get(userId) || null),
        createBillingProfile: async (input) => {
            if (!profiles.has(input.userId)) {
                profiles.set(input.userId, clone(input));
            }
            return clone(profiles.get(input.userId));
        },
        updateBillingProfile: async (input) => {
            profiles.set(input.userId, clone(input));
            return clone(input);
        },
        findUsageEventByIdempotency: async (userId, idempotencyKey) =>
            clone(usageByIdempotency.get(`${userId}:${idempotencyKey}`) || null),
        insertUsageEvent: async (input) => {
            if (input.idempotencyKey) {
                const key = `${input.userId}:${input.idempotencyKey}`;
                if (usageByIdempotency.has(key)) return false;
                usageByIdempotency.set(
                    key,
                    clone({
                        ...input,
                        charge_type: input.chargeType,
                    })
                );
            }
            return true;
        },
        insertLedgerEntry: async (input) => {
            if (input.grantKey) {
                if (ledgerGrantKeys.has(input.grantKey)) return false;
                ledgerGrantKeys.add(input.grantKey);
            }
            ledgerEntries.push(clone(input));
            return true;
        },
        getBillingLedgerByOrder: async (orderId) =>
            clone(ledgerEntries.filter((entry) => entry.orderId === orderId)),
        uuid: () => `id_${++seq}`,
        now: () => new Date(now),
    });

    return {
        service,
        state: {
            profiles,
            usageByIdempotency,
            ledgerEntries,
            ledgerGrantKeys,
        },
    };
}

test('getOrCreateBillingProfile bootstraps free profile by default', async () => {
    const { service } = createMemoryBillingService({ freeDailyQuota: 22 });
    const profile = await service.getOrCreateBillingProfile('u_bootstrap');
    assert.equal(profile.userId, 'u_bootstrap');
    assert.equal(profile.tier, 'free');
    assert.equal(profile.dailyQuota, 22);
    assert.equal(profile.dailyQuotaUsed, 0);
    assert.equal(profile.bonusCredits, 0);
});

test('consumeBillingUnits applies idempotency and does not double charge', async () => {
    const { service } = createMemoryBillingService({ freeDailyQuota: 5 });
    const first = await service.consumeBillingUnits({
        userId: 'u_consume',
        units: 2,
        source: 'test',
        idempotencyKey: 'ik_1',
    });
    const second = await service.consumeBillingUnits({
        userId: 'u_consume',
        units: 2,
        source: 'test',
        idempotencyKey: 'ik_1',
    });
    assert.equal(first.allowed, true);
    assert.equal(first.duplicated, false);
    assert.equal(first.profile.dailyQuotaUsed, 2);
    assert.equal(second.allowed, true);
    assert.equal(second.duplicated, true);
    assert.equal(second.profile.dailyQuotaUsed, 2);
});

test('consumeBillingUnits falls back to credits when quota is exhausted', async () => {
    const { service } = createMemoryBillingService({ freeDailyQuota: 1 });
    await service.applyPaymentGrantForOrder({
        id: 'order_topup',
        userId: 'u_credit',
        status: 'PAID',
        orderType: 'topup',
        productCode: 'membership_topup',
        amountCents: 200,
    });

    const first = await service.consumeBillingUnits({
        userId: 'u_credit',
        units: 1,
        source: 'test',
        idempotencyKey: 'consume_quota',
    });
    const second = await service.consumeBillingUnits({
        userId: 'u_credit',
        units: 3,
        source: 'test',
        idempotencyKey: 'consume_credit',
    });
    assert.equal(first.chargeType, 'quota');
    assert.equal(second.chargeType, 'credits');
    assert.equal(second.profile.bonusCredits, 197);
});

test('applyPaymentGrantForOrder is idempotent for topup orders', async () => {
    const { service, state } = createMemoryBillingService({
        freeDailyQuota: 20,
        topupCreditsPerCny: 100,
    });
    const order = {
        id: 'order_001',
        userId: 'u_topup',
        status: 'PAID',
        orderType: 'topup',
        productCode: 'membership_topup',
        amountCents: 9900,
    };
    const first = await service.applyPaymentGrantForOrder(order);
    const second = await service.applyPaymentGrantForOrder(order);

    assert.equal(first.applied, true);
    assert.equal(first.grantType, 'topup');
    assert.equal(first.profile.bonusCredits, 9900);
    assert.equal(second.applied, false);
    assert.equal(second.reason, 'DUPLICATE_GRANT');
    assert.equal(state.ledgerGrantKeys.size, 1);
});

test('applyPaymentGrantForOrder upgrades subscription tier and expiry', async () => {
    const { service } = createMemoryBillingService({
        now: new Date('2026-04-08T00:00:00.000Z'),
    });
    const order = {
        id: 'order_sub_001',
        userId: 'u_sub',
        status: 'PAID',
        orderType: 'subscription',
        productCode: 'membership_pro_month',
        amountCents: 2999,
    };
    const granted = await service.applyPaymentGrantForOrder(order);
    assert.equal(granted.applied, true);
    assert.equal(granted.grantType, 'subscription');
    assert.equal(granted.profile.tier, 'pro');
    assert.equal(granted.profile.dailyQuota, 2000);
    assert.equal(granted.profile.subscriptionExpiresAt, '2026-05-08T00:00:00.000Z');
});

test('applyPaymentGrantForOrder refuses unpaid orders', async () => {
    const { service } = createMemoryBillingService();
    const result = await service.applyPaymentGrantForOrder({
        id: 'order_unpaid',
        userId: 'u_unpaid',
        status: 'PENDING',
        orderType: 'topup',
        amountCents: 1000,
    });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'ORDER_NOT_PAID');
});
