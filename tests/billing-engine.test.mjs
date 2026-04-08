import test from 'node:test';
import assert from 'node:assert/strict';

import {
    computeSubscriptionGrant,
    computeTopupCredits,
    computeUsageDecision,
    normalizeBillingProfile,
    todayDateString,
} from '../api/_lib/billing/engine.js';

test('normalizeBillingProfile fills defaults for minimal input', () => {
    const profile = normalizeBillingProfile({ userId: 'u_1' });
    assert.equal(profile.userId, 'u_1');
    assert.equal(profile.tier, 'free');
    assert.equal(profile.status, 'active');
    assert.equal(profile.dailyQuotaUsed, 0);
    assert.equal(profile.bonusCredits, 0);
    assert.equal(profile.quotaResetAt, todayDateString());
});

test('computeUsageDecision consumes from quota when enough quota remains', () => {
    const profile = normalizeBillingProfile({
        userId: 'u_1',
        tier: 'free',
        status: 'active',
        dailyQuota: 20,
        dailyQuotaUsed: 3,
        quotaResetAt: '2026-04-08',
        bonusCredits: 100,
        aiRequestsTotal: 3,
    });
    const decision = computeUsageDecision(profile, {
        units: 5,
        now: new Date('2026-04-08T12:00:00.000Z'),
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.chargeType, 'quota');
    assert.equal(decision.nextProfile.dailyQuotaUsed, 8);
    assert.equal(decision.nextProfile.bonusCredits, 100);
});

test('computeUsageDecision falls back to credits when quota exhausted', () => {
    const profile = normalizeBillingProfile({
        userId: 'u_2',
        tier: 'free',
        status: 'active',
        dailyQuota: 20,
        dailyQuotaUsed: 20,
        quotaResetAt: '2026-04-08',
        bonusCredits: 30,
        aiRequestsTotal: 20,
    });
    const decision = computeUsageDecision(profile, {
        units: 6,
        now: new Date('2026-04-08T12:00:00.000Z'),
        allowCreditFallback: true,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.chargeType, 'credits');
    assert.equal(decision.nextProfile.bonusCredits, 24);
    assert.equal(decision.nextProfile.dailyQuotaUsed, 20);
});

test('computeUsageDecision rejects when both quota and credits are insufficient', () => {
    const profile = normalizeBillingProfile({
        userId: 'u_3',
        tier: 'free',
        status: 'active',
        dailyQuota: 20,
        dailyQuotaUsed: 20,
        quotaResetAt: '2026-04-08',
        bonusCredits: 0,
        aiRequestsTotal: 20,
    });
    const decision = computeUsageDecision(profile, {
        units: 1,
        now: new Date('2026-04-08T12:00:00.000Z'),
        allowCreditFallback: true,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'INSUFFICIENT_QUOTA');
    assert.equal(decision.chargeType, 'none');
});

test('computeUsageDecision resets daily quota counters when date changed', () => {
    const profile = normalizeBillingProfile({
        userId: 'u_4',
        tier: 'free',
        status: 'active',
        dailyQuota: 20,
        dailyQuotaUsed: 20,
        quotaResetAt: '2026-04-07',
        bonusCredits: 0,
        aiRequestsTotal: 20,
    });
    const decision = computeUsageDecision(profile, {
        units: 2,
        now: new Date('2026-04-08T00:00:05.000Z'),
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.chargeType, 'quota');
    assert.equal(decision.nextProfile.quotaResetAt, '2026-04-08');
    assert.equal(decision.nextProfile.dailyQuotaUsed, 2);
});

test('computeSubscriptionGrant extends from current expiry for active subscription', () => {
    const profile = normalizeBillingProfile({
        userId: 'u_5',
        tier: 'basic',
        status: 'active',
        subscriptionExpiresAt: '2026-05-01T00:00:00.000Z',
        dailyQuota: 300,
        dailyQuotaUsed: 0,
        quotaResetAt: '2026-04-08',
        bonusCredits: 0,
    });
    const next = computeSubscriptionGrant(
        profile,
        'membership_basic_month',
        new Date('2026-04-08T12:00:00.000Z')
    );
    assert.equal(next.tier, 'basic');
    assert.equal(next.dailyQuota, 300);
    assert.equal(next.subscriptionExpiresAt, '2026-05-31T00:00:00.000Z');
});

test('computeTopupCredits converts cents to credits by ratio', () => {
    assert.equal(computeTopupCredits(2999, 100), 2999);
    assert.equal(computeTopupCredits(5000, 80), 4000);
    assert.equal(computeTopupCredits(0, 100), 0);
});
