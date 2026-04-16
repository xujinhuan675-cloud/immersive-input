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
import { findLaterSuccessfulSubscriptionOrders } from '../payment/store.js';

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
    findLaterSuccessfulSubscriptionOrders,
    uuid: () => crypto.randomUUID(),
    now: () => new Date(),
};

function clonePlainObject(value) {
    return JSON.parse(JSON.stringify(value));
}

function pickSnapshotFromGrantMetadata(order, ledgerEntry) {
    return (
        ledgerEntry?.metadata?.beforeProfile ||
        order?.metadata?.billingGrant?.beforeProfile ||
        null
    );
}

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
        const beforeProfile = clonePlainObject(toPublicProfile(current));
        const grantKey = `payment_grant:${order.id}`;
        const currentNow = deps.now();
        const subscriptionNext =
            order.orderType === 'subscription'
                ? deps.computeSubscriptionGrant(current, order.productCode, currentNow)
                : null;
        const cfg = deps.getBillingRuntimeConfig({ currency: order.currency });
        const topupCredits = deps.computeTopupCredits(order.amountCents, cfg.topupCreditsPerUnit);
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
                beforeProfile,
            },
        });

        if (!inserted) {
            const latest = await getOrCreateBillingProfile(userId);
            return {
                applied: false,
                reason: 'DUPLICATE_GRANT',
                profile: toPublicProfile(latest),
                grantType,
                beforeProfile: null,
                afterProfile: null,
                creditedUnits: grantType === 'topup' ? topupCredits : 0,
            };
        }

        const updated = await deps.updateBillingProfile({
            ...next,
            userId,
        });
        const afterProfile = toPublicProfile(updated);
        return {
            applied: true,
            reason: '',
            profile: afterProfile,
            grantType,
            beforeProfile,
            afterProfile,
            creditedUnits: grantType === 'topup' ? topupCredits : 0,
        };
    }

    async function getBillingGrantLedger(orderId) {
        const rows = await deps.getBillingLedgerByOrder(orderId);
        return rows;
    }

    async function reversePaymentGrantForOrder(order, input = {}) {
        if (!order?.id) throw new Error('Missing order');
        const userId = String(order.userId || '').trim();
        if (!userId) throw new Error('Order missing userId');

        const refundKey = `payment_refund:${order.id}`;
        const ledgerRows = await deps.getBillingLedgerByOrder(order.id);
        const alreadyRefunded = ledgerRows.find((row) => row.grantKey === refundKey);
        if (alreadyRefunded) {
            const latest = await getOrCreateBillingProfile(userId);
            return {
                reversed: false,
                duplicated: true,
                reason: 'DUPLICATE_REFUND_REVERSAL',
                reverseType: alreadyRefunded.metadata?.grantType || null,
                profile: toPublicProfile(latest),
            };
        }

        const current = await getOrCreateBillingProfile(userId);
        const grantRow =
            ledgerRows.find((row) => row.grantKey === `payment_grant:${order.id}`) ||
            ledgerRows.find((row) =>
                row.entryType === 'subscription_grant' || row.entryType === 'topup_credit'
            ) ||
            null;
        const grantType =
            grantRow?.metadata?.grantType ||
            order?.metadata?.billingGrant?.grantType ||
            (order.orderType === 'subscription' ? 'subscription' : 'topup');
        const now = deps.now();

        if (grantType === 'subscription') {
            const laterOrders = await deps.findLaterSuccessfulSubscriptionOrders({
                userId,
                excludeOrderId: order.id,
                afterTimestamp: order.paidAt || order.createdAt || now.toISOString(),
            });
            if (laterOrders.length > 0) {
                return {
                    reversed: false,
                    duplicated: false,
                    reason: 'LATER_SUBSCRIPTION_EXISTS',
                    reverseType: 'subscription',
                    profile: toPublicProfile(current),
                };
            }

            const snapshot = pickSnapshotFromGrantMetadata(order, grantRow);
            if (!snapshot) {
                return {
                    reversed: false,
                    duplicated: false,
                    reason: 'MISSING_PREVIOUS_PROFILE_SNAPSHOT',
                    reverseType: 'subscription',
                    profile: toPublicProfile(current),
                };
            }

            const nextProfile = {
                ...current,
                tier: snapshot.tier || current.tier || BILLING_TIERS.FREE,
                status: snapshot.status || current.status || 'active',
                subscriptionExpiresAt: snapshot.subscriptionExpiresAt || null,
                dailyQuota:
                    Number.isFinite(Number(snapshot.dailyQuota)) && Number(snapshot.dailyQuota) !== 0
                        ? Number(snapshot.dailyQuota)
                        : current.dailyQuota,
            };
            const inserted = await deps.insertLedgerEntry({
                id: deps.uuid(),
                userId,
                entryType: 'subscription_refund_reversal',
                amountUnits: 0,
                orderId: order.id,
                grantKey: refundKey,
                metadata: {
                    grantType: 'subscription',
                    reason: String(input.reason || '').trim(),
                    actor: input.actor || null,
                    beforeProfile: toPublicProfile(current),
                    restoredProfile: snapshot,
                },
            });
            if (!inserted) {
                const latest = await getOrCreateBillingProfile(userId);
                return {
                    reversed: false,
                    duplicated: true,
                    reason: 'DUPLICATE_REFUND_REVERSAL',
                    reverseType: 'subscription',
                    profile: toPublicProfile(latest),
                };
            }
            const updated = await deps.updateBillingProfile(nextProfile);
            return {
                reversed: true,
                duplicated: false,
                reason: '',
                reverseType: 'subscription',
                profile: toPublicProfile(updated),
            };
        }

        const cfg = deps.getBillingRuntimeConfig({ currency: order.currency });
        const creditedUnits =
            Number(grantRow?.amountUnits) ||
            Number(order?.metadata?.billingGrant?.creditedUnits) ||
            deps.computeTopupCredits(order.amountCents, cfg.topupCreditsPerUnit);
        const nextProfile = {
            ...current,
            bonusCredits: current.bonusCredits - creditedUnits,
        };
        const inserted = await deps.insertLedgerEntry({
            id: deps.uuid(),
            userId,
            entryType: 'topup_refund_reversal',
            amountUnits: -creditedUnits,
            orderId: order.id,
            grantKey: refundKey,
            metadata: {
                grantType: 'topup',
                reason: String(input.reason || '').trim(),
                actor: input.actor || null,
                beforeProfile: toPublicProfile(current),
                deductedCredits: creditedUnits,
            },
        });
        if (!inserted) {
            const latest = await getOrCreateBillingProfile(userId);
            return {
                reversed: false,
                duplicated: true,
                reason: 'DUPLICATE_REFUND_REVERSAL',
                reverseType: 'topup',
                profile: toPublicProfile(latest),
            };
        }
        const updated = await deps.updateBillingProfile(nextProfile);
        return {
            reversed: true,
            duplicated: false,
            reason: '',
            reverseType: 'topup',
            profile: toPublicProfile(updated),
            deltaCredits: -creditedUnits,
        };
    }

    async function setMembershipStatus(input = {}) {
        const userId = String(input.userId || '').trim();
        if (!userId) throw new Error('Missing userId');
        const action = String(input.action || '').trim().toLowerCase();
        if (!action) throw new Error('Missing action');

        const current = await getOrCreateBillingProfile(userId);
        const now = deps.now();
        let nextStatus = current.status;

        if (action === 'suspend') {
            nextStatus = 'suspended';
        } else if (action === 'resume') {
            const expiryTime = current.subscriptionExpiresAt
                ? new Date(current.subscriptionExpiresAt).getTime()
                : 0;
            const hasActiveWindow =
                current.tier !== BILLING_TIERS.FREE &&
                Number.isFinite(expiryTime) &&
                expiryTime > new Date(now).getTime();
            nextStatus = hasActiveWindow || current.tier === BILLING_TIERS.FREE ? 'active' : 'inactive';
        } else {
            throw new Error(`Unsupported action: ${action}`);
        }

        const updated = await deps.updateBillingProfile({
            ...current,
            status: nextStatus,
        });
        await deps.insertLedgerEntry({
            id: deps.uuid(),
            userId,
            entryType: action === 'suspend' ? 'subscription_suspended' : 'subscription_resumed',
            amountUnits: 0,
            orderId: null,
            grantKey: null,
            metadata: {
                action,
                reason: String(input.reason || '').trim(),
                actor: input.actor || null,
                beforeStatus: current.status,
                afterStatus: nextStatus,
            },
        });
        return {
            ok: true,
            action,
            profile: toPublicProfile(updated),
        };
    }

    return {
        getOrCreateBillingProfile,
        getBillingProfileSummary,
        consumeBillingUnits,
        applyPaymentGrantForOrder,
        getBillingGrantLedger,
        reversePaymentGrantForOrder,
        setMembershipStatus,
    };
}

const defaultService = createBillingService();

export const getOrCreateBillingProfile = defaultService.getOrCreateBillingProfile;
export const getBillingProfileSummary = defaultService.getBillingProfileSummary;
export const consumeBillingUnits = defaultService.consumeBillingUnits;
export const applyPaymentGrantForOrder = defaultService.applyPaymentGrantForOrder;
export const getBillingGrantLedger = defaultService.getBillingGrantLedger;
export const reversePaymentGrantForOrder = defaultService.reversePaymentGrantForOrder;
export const setMembershipStatus = defaultService.setMembershipStatus;
