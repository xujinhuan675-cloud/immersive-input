import test from 'node:test';
import assert from 'node:assert/strict';

import { getBillingCatalog } from '../api/_lib/billing/config.js';

function withEnv(overrides, run) {
    const previous = new Map();
    Object.keys(overrides).forEach((key) => {
        previous.set(key, process.env[key]);
        const value = overrides[key];
        if (value === undefined || value === null || value === '') {
            delete process.env[key];
        } else {
            process.env[key] = String(value);
        }
    });

    try {
        return run();
    } finally {
        previous.forEach((value, key) => {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        });
    }
}

test('getBillingCatalog returns default plans and topup presets', () => {
    withEnv(
        {
            BILLING_TOPUP_PRESET_AMOUNTS: '',
            BILLING_PLAN_PRICES_JSON: '',
            BILLING_PLAN_PRICE_MEMBERSHIP_BASIC_MONTH: '',
        },
        () => {
            const catalog = getBillingCatalog();
            assert.equal(catalog.currency, 'CNY');
            assert.deepEqual(
                catalog.topupPresets.map((item) => item.amount),
                [29, 59, 99, 199]
            );
            assert.equal(catalog.subscriptionPlans.length, 6);
            assert.equal(
                catalog.subscriptionPlans.find((item) => item.productCode === 'membership_pro_year')?.amount,
                599
            );
        }
    );
});

test('getBillingCatalog honors plan-price and topup overrides', () => {
    withEnv(
        {
            BILLING_CURRENCY: 'usd',
            BILLING_TOPUP_CREDITS_PER_CNY: '120',
            BILLING_TOPUP_PRESET_AMOUNTS: '9.9,19.9',
            BILLING_PLAN_PRICE_MEMBERSHIP_BASIC_MONTH: '15',
            BILLING_PLAN_PRICES_JSON: JSON.stringify({
                membership_enterprise_year: 1200,
            }),
        },
        () => {
            const catalog = getBillingCatalog();
            assert.equal(catalog.currency, 'USD');
            assert.deepEqual(
                catalog.topupPresets.map((item) => item.amount),
                [9.9, 19.9]
            );
            assert.equal(catalog.topupPresets[0].credits, 1188);
            assert.equal(
                catalog.subscriptionPlans.find((item) => item.productCode === 'membership_basic_month')?.amount,
                15
            );
            assert.equal(
                catalog.subscriptionPlans.find((item) => item.productCode === 'membership_enterprise_year')?.amount,
                1200
            );
        }
    );
});
