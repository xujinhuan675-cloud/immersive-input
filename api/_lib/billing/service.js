import crypto from 'node:crypto';

import { getBillingRuntimeConfig } from './config.js';
import {
    computeSubscriptionGrant,
    computeTopupCredits,
    computeUsageDecision,
    normalizeBillingProfile,
    todayDateString,
} from './engine.js';
import { BILLING_TIERS } from './plans.js';
import {
    createBillingProfile,
    findUsageEventByIdempotency,
    getBillingLedgerByOrder,
    getBillingProfile,
    insertLedgerEntry,
    insertUsageEvent,
    updateBillingProfile,
} from './store.js';

function defaultProfileForUser(userId, cfg) {
    return {
        userId,
        tier: BILLING_TIERS.FREE,
        status: 'active',
        subscriptionExpiresAt: null,
        dailyQuota: cfg.freeDailyQuota,
        dailyQuotaUsed: 0,
        quotaResetAt: todayDateString(),
        bonusCredits: 0,
        aiRequestsTotal: 0,
        lastConsumedAt: null,
    };
}

function toPublicProfile(profile) {
    const p = normalizeBillingProfile(profile);
    return {
        userId: p.userId,
        tier: p.tier,
        status: p.status,
        subscriptionExpiresAt: p.subscriptionExpiresAt,
        dailyQuota: p.dailyQuota,
        dailyQuotaUsed: p.dailyQuotaUsed,
        dailyQuotaRemaining: p.dailyQuota < 0 ? -1 : Math.max(0, p.dailyQuota - p.dailyQuotaUsed),
        quotaResetAt: p.quotaResetAt,
        bonusCredits: p.bonusCredits,
        aiRequestsTotal: p.aiRequestsTotal,
        lastConsumedAt: p.lastConsumedAt,
    };
}

const baseDeps = {
    getBillingRuntimeConfig,
    computeSubscriptionGrant,
    computeTopupCredits,
    computeUsageDecision,
    normalizeBillingProfile,
    createBillingProfile,
    findUsageEventByIdempotency,
    getBillingLedgerByOrder,
    getBillingProfile,
    insertLedgerEntry,
    insertUsageEvent,
    updateBillingProfile,
    uuid: () => crypto.randomUUID(),
    now: () => new Date(),
};

export function createBillingService(overrides = {}) {
    const deps = {
        ...baseDeps,
        ...(overrides || {}),
    };

    async function getOrCreateBillingProfile(userId) {
        const uid = String(userId || '').trim();
        if (!uid) throw new Error('Missing userId');
        let profile = await deps.getBillingProfile(uid);
        if (!profile) {
            const cfg = deps.getBillingRuntimeConfig();
            profile = await deps.createBillingProfile(defaultProfileForUser(uid, cfg));
        }
        return deps.normalizeBillingProfile(profile);
    }

    async function getBillingProfileSummary(userId) {
        const profile = await getOrCreateBillingProfile(userId);
        return toPublicProfile(profile);
    }

    async function consumeBillingUnits(input) {
        const userId = String(input.userId || '').trim();
        if (!userId) throw new Error('Missing userId');
        const units = Math.max(1, Number(input.units || 1));
        const idempotencyKey = String(input.idempotencyKey || '').trim() || null;
        const source = String(input.source || 'ai').trim() || 'ai';
        const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};

        const profile = await getOrCreateBillingProfile(userId);
        if (idempotencyKey) {
            const existed = await deps.findUsageEventByIdempotency(userId, idempotencyKey);
            if (existed) {
                const latest = await getOrCreateBillingProfile(userId);
                return {
                    ok: true,
                    duplicated: true,
                    allowed: true,
                    chargeType: existed.charge_type || 'quota',
                    profile: toPublicProfile(latest),
                };
            }
        }

        const cfg = deps.getBillingRuntimeConfig();
        const decision = deps.computeUsageDecision(profile, {
            units,
            allowCreditFallback: cfg.allowCreditFallback,
            now: deps.now(),
        });
        if (!decision.allowed) {
            return {
                ok: true,
                duplicated: false,
                allowed: false,
                chargeType: 'none',
                reason: decision.reason,
                profile: toPublicProfile(decision.nextProfile),
            };
        }

        const insertedUsage = await deps.insertUsageEvent({
            id: deps.uuid(),
            userId,
            source,
            units,
            chargeType: decision.chargeType,
            idempotencyKey,
            metadata,
        });
        if (!insertedUsage) {
            const existed = idempotencyKey
                ? await deps.findUsageEventByIdempotency(userId, idempotencyKey)
                : null;
            const latest = await getOrCreateBillingProfile(userId);
            return {
                ok: true,
                duplicated: !!idempotencyKey,
                allowed: true,
                chargeType: existed?.charge_type || decision.chargeType,
                profile: toPublicProfile(latest),
            };
        }

        const updated = await deps.updateBillingProfile(decision.nextProfile);
        await deps.insertLedgerEntry({
            id: deps.uuid(),
            userId,
            entryType: decision.chargeType === 'credits' ? 'usage_credit' : 'usage_quota',
            amountUnits: decision.chargeType === 'credits' ? -units : 0,
            orderId: null,
            grantKey: null,
            metadata: {
                source,
                units,
                idempotencyKey,
                chargeType: decision.chargeType,
            },
        });

        return {
            ok: true,
            duplicated: false,
            allowed: true,
            chargeType: decision.chargeType,
            profile: toPublicProfile(updated),
        };
    }

    async function applyPaymentGrantForOrder(order) {
        if (!order?.id) throw new Error('Missing order');
        const status = String(order.status || '').toUpperCase();
        if (status !== 'PAID' && status !== 'COMPLETED') {
            return {
                applied: false,
                reason: 'ORDER_NOT_PAID',
                profile: order.userId ? await getOrCreateBillingProfile(order.userId) : null,
                grantType: null,
            };
        }

        const userId = String(order.userId || '').trim();
        if (!userId) throw new Error('Order missing userId');

        const current = await getOrCreateBillingProfile(userId);
        const grantKey = `payment_grant:${order.id}`;
        const currentNow = deps.now();
        const subscriptionNext =
            order.orderType === 'subscription'
                ? deps.computeSubscriptionGrant(current, order.productCode, currentNow)
                : null;
        const cfg = deps.getBillingRuntimeConfig();
        const topupCredits = deps.computeTopupCredits(order.amountCents, cfg.topupCreditsPerCny);
        const next = subscriptionNext
            ? subscriptionNext
            : {
                  ...current,
                  bonusCredits: current.bonusCredits + topupCredits,
              };
        const grantType = subscriptionNext ? 'subscription' : 'topup';

        const inserted = await deps.insertLedgerEntry({
            id: deps.uuid(),
            userId,
            entryType: grantType === 'subscription' ? 'subscription_grant' : 'topup_credit',
            amountUnits: grantType === 'subscription' ? 0 : topupCredits,
            orderId: order.id,
            grantKey,
            metadata: {
                orderType: order.orderType,
                productCode: order.productCode || null,
                amountCents: order.amountCents,
                grantType,
            },
        });

        if (!inserted) {
            const latest = await getOrCreateBillingProfile(userId);
            return {
                applied: false,
                reason: 'DUPLICATE_GRANT',
                profile: toPublicProfile(latest),
                grantType,
            };
        }

        const updated = await deps.updateBillingProfile({
            ...next,
            userId,
        });
        return {
            applied: true,
            reason: '',
            profile: toPublicProfile(updated),
            grantType,
        };
    }

    async function getBillingGrantLedger(orderId) {
        const rows = await deps.getBillingLedgerByOrder(orderId);
        return rows;
    }

    return {
        getOrCreateBillingProfile,
        getBillingProfileSummary,
        consumeBillingUnits,
        applyPaymentGrantForOrder,
        getBillingGrantLedger,
    };
}

const defaultService = createBillingService();

export const getOrCreateBillingProfile = defaultService.getOrCreateBillingProfile;
export const getBillingProfileSummary = defaultService.getBillingProfileSummary;
export const consumeBillingUnits = defaultService.consumeBillingUnits;
export const applyPaymentGrantForOrder = defaultService.applyPaymentGrantForOrder;
export const getBillingGrantLedger = defaultService.getBillingGrantLedger;
