import crypto from 'node:crypto';

import { getDbClient } from '../db.js';
import { getBillingRuntimeConfig } from '../billing/config.js';
import { todayDateString } from '../billing/engine.js';
import {
    createBillingProfile,
    ensureBillingTables,
    getBillingProfile,
} from '../billing/store.js';
import { BILLING_TIERS } from '../billing/plans.js';
import { getInviteRuntimeConfig, normalizeInviteCode } from './config.js';
import {
    createInviteProfile,
    createInviteRelation,
    ensureInviteTables,
    findInviteProfileByCode,
    getInviteProfile,
    getInviteRelationByInviteeUserId,
    getInviteStatsByInviterUserId,
} from './store.js';

function defaultBillingProfileForUser(userId) {
    const cfg = getBillingRuntimeConfig();
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

async function ensureBillingProfileForUser(userId) {
    const current = await getBillingProfile(userId);
    if (current) return current;
    return createBillingProfile(defaultBillingProfileForUser(userId));
}

function buildInviteCodeCandidate(userId, attempt, codeLength) {
    if (attempt === 0) {
        const direct = normalizeInviteCode(userId, codeLength);
        if (direct.length >= codeLength) {
            return direct.slice(0, codeLength);
        }
    }
    return crypto
        .createHash('sha256')
        .update(`${userId}:${attempt}`)
        .digest('hex')
        .toUpperCase()
        .slice(0, codeLength);
}

async function findFirstSuccessfulOrderForUser(client, userId, excludeOrderId = '') {
    const { rows } = await client.query(
        `
            select id, user_id, status, order_type, amount_cents, currency, product_code, paid_at, created_at
            from public.payment_orders
            where user_id = $1
              and status in ('PAID', 'COMPLETED')
              and ($2 = '' or id <> $2)
            order by coalesce(paid_at, created_at) asc, id asc
            limit 1
        `,
        [userId, excludeOrderId || '']
    );
    return rows[0] || null;
}

async function getInviteRelationForUpdate(client, inviteeUserId) {
    const { rows } = await client.query(
        `
            select *
            from public.invite_relations
            where invitee_user_id = $1
            limit 1
            for update
        `,
        [inviteeUserId]
    );
    return rows[0] || null;
}

async function getLedgerEntryByGrantKey(client, grantKey) {
    const { rows } = await client.query(
        `
            select id
            from public.billing_ledger_entries
            where grant_key = $1
            limit 1
        `,
        [grantKey]
    );
    return rows[0] || null;
}

export async function getOrCreateInviteProfile(userId) {
    const uid = String(userId || '').trim();
    if (!uid) throw new Error('Missing userId');

    const current = await getInviteProfile(uid);
    if (current?.inviteCode) return current;

    const { codeLength } = getInviteRuntimeConfig();
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const inviteCode = buildInviteCodeCandidate(uid, attempt, codeLength);
        try {
            const created = await createInviteProfile({
                userId: uid,
                inviteCode,
            });
            if (created?.inviteCode) return created;
        } catch (error) {
            if (error?.code !== '23505') {
                throw error;
            }
        }
    }

    const fallbackCode = normalizeInviteCode(crypto.randomBytes(8).toString('hex'), codeLength);
    return createInviteProfile({
        userId: uid,
        inviteCode: fallbackCode,
    });
}

export async function resolveInviteBinding(inviteCode) {
    const normalizedCode = normalizeInviteCode(inviteCode, getInviteRuntimeConfig().codeLength);
    if (!normalizedCode) {
        return {
            inviteCode: '',
            inviterUserId: '',
            profile: null,
        };
    }
    const profile = await findInviteProfileByCode(normalizedCode);
    if (!profile) {
        throw new Error('Invalid invite code');
    }
    return {
        inviteCode: normalizedCode,
        inviterUserId: profile.userId,
        profile,
    };
}

export async function bindInviteCodeToNewUser({ inviteeUserId, inviteCode, inviterUserId = '' }) {
    const uid = String(inviteeUserId || '').trim();
    if (!uid) throw new Error('Missing inviteeUserId');

    const resolvedCode = normalizeInviteCode(inviteCode, getInviteRuntimeConfig().codeLength);
    if (!resolvedCode) {
        return {
            bound: false,
            reason: 'EMPTY_INVITE_CODE',
        };
    }

    await getOrCreateInviteProfile(uid);

    const existingRelation = await getInviteRelationByInviteeUserId(uid);
    if (existingRelation) {
        return {
            bound: false,
            reason: 'ALREADY_BOUND',
            relation: existingRelation,
        };
    }

    const resolvedInviterUserId = String(inviterUserId || '').trim();
    const inviterProfile = resolvedInviterUserId
        ? { userId: resolvedInviterUserId, inviteCode: resolvedCode }
        : await findInviteProfileByCode(resolvedCode);
    if (!inviterProfile?.userId) {
        throw new Error('Invalid invite code');
    }
    if (inviterProfile.userId === uid) {
        throw new Error('Cannot use your own invite code');
    }

    const relation = await createInviteRelation({
        id: crypto.randomUUID(),
        inviteCode: resolvedCode,
        inviterUserId: inviterProfile.userId,
        inviteeUserId: uid,
        status: 'pending',
        rewardedCredits: 0,
        rewardedAt: null,
    });

    if (!relation) {
        return {
            bound: false,
            reason: 'ALREADY_BOUND',
            relation: await getInviteRelationByInviteeUserId(uid),
        };
    }

    return {
        bound: true,
        reason: '',
        relation,
    };
}

export async function getInviteSummary(userId) {
    const uid = String(userId || '').trim();
    if (!uid) throw new Error('Missing userId');
    const [profile, stats] = await Promise.all([
        getOrCreateInviteProfile(uid),
        getInviteStatsByInviterUserId(uid),
    ]);
    return {
        inviteCode: profile?.inviteCode || '',
        inviteStats: stats,
    };
}

export async function applyInviteRewardForPaidOrder(order) {
    const status = String(order?.status || '')
        .trim()
        .toUpperCase();
    if (status !== 'PAID' && status !== 'COMPLETED') {
        return {
            applied: false,
            reason: 'ORDER_NOT_PAID',
        };
    }

    const inviteeUserId = String(order?.userId || '').trim();
    if (!inviteeUserId) {
        return {
            applied: false,
            reason: 'MISSING_USER',
        };
    }

    await ensureInviteTables();
    await ensureBillingTables();

    const existingRelation = await getInviteRelationByInviteeUserId(inviteeUserId);
    if (!existingRelation) {
        return {
            applied: false,
            reason: 'INVITE_NOT_BOUND',
        };
    }

    await ensureBillingProfileForUser(existingRelation.inviterUserId);

    const rewardCredits = getInviteRuntimeConfig().inviterRewardCredits;
    const client = await getDbClient();
    try {
        await client.query('begin');

        const relation = await getInviteRelationForUpdate(client, inviteeUserId);
        if (!relation) {
            await client.query('commit');
            return {
                applied: false,
                reason: 'INVITE_NOT_BOUND',
            };
        }

        const qualifyingOrder = await findFirstSuccessfulOrderForUser(client, inviteeUserId);
        if (!qualifyingOrder?.id) {
            await client.query('commit');
            return {
                applied: false,
                reason: 'NO_SUCCESSFUL_ORDER',
            };
        }

        if (
            relation.status === 'rewarded' &&
            String(relation.rewarded_order_id || '').trim() === String(qualifyingOrder.id).trim()
        ) {
            await client.query('commit');
            return {
                applied: false,
                reason: 'ALREADY_REWARDED',
                rewardedOrderId: relation.rewarded_order_id,
            };
        }

        const grantKey = `invite_reward:${relation.id}:${qualifyingOrder.id}`;
        const duplicated = await getLedgerEntryByGrantKey(client, grantKey);
        if (duplicated) {
            await client.query(
                `
                    update public.invite_relations
                    set
                        status = 'rewarded',
                        rewarded_order_id = $2,
                        rewarded_credits = $3,
                        rewarded_at = coalesce(rewarded_at, now()),
                        updated_at = now()
                    where id = $1
                `,
                [relation.id, qualifyingOrder.id, relation.rewarded_credits || rewardCredits]
            );
            await client.query('commit');
            return {
                applied: false,
                reason: 'DUPLICATE_GRANT',
                rewardedOrderId: qualifyingOrder.id,
            };
        }

        const rewardAmount = relation.rewarded_credits > 0 ? relation.rewarded_credits : rewardCredits;
        await client.query(
            `
                update public.billing_profiles
                set
                    bonus_credits = bonus_credits + $2,
                    updated_at = now()
                where user_id = $1
            `,
            [relation.inviter_user_id, rewardAmount]
        );
        await client.query(
            `
                insert into public.billing_ledger_entries
                    (id, user_id, entry_type, amount_units, order_id, grant_key, metadata)
                values
                    ($1, $2, 'invite_reward', $3, $4, $5, $6::jsonb)
            `,
            [
                crypto.randomUUID(),
                relation.inviter_user_id,
                rewardAmount,
                qualifyingOrder.id,
                grantKey,
                JSON.stringify({
                    inviteRelationId: relation.id,
                    inviterUserId: relation.inviter_user_id,
                    inviteeUserId,
                    inviteCode: relation.invite_code,
                    triggerOrderId: order.id,
                    rewardedOrderId: qualifyingOrder.id,
                }),
            ]
        );
        await client.query(
            `
                update public.invite_relations
                set
                    status = 'rewarded',
                    rewarded_order_id = $2,
                    rewarded_credits = $3,
                    rewarded_at = now(),
                    updated_at = now()
                where id = $1
            `,
            [relation.id, qualifyingOrder.id, rewardAmount]
        );

        await client.query('commit');
        return {
            applied: true,
            reason: '',
            inviterUserId: relation.inviter_user_id,
            inviteeUserId,
            rewardedOrderId: qualifyingOrder.id,
            rewardedCredits: rewardAmount,
        };
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}

export async function reverseInviteRewardForRefundedOrder(order) {
    const status = String(order?.status || '')
        .trim()
        .toUpperCase();
    if (status !== 'REFUNDED') {
        return {
            reversed: false,
            reason: 'ORDER_NOT_REFUNDED',
        };
    }

    const inviteeUserId = String(order?.userId || '').trim();
    if (!inviteeUserId) {
        return {
            reversed: false,
            reason: 'MISSING_USER',
        };
    }

    await ensureInviteTables();
    await ensureBillingTables();

    const existingRelation = await getInviteRelationByInviteeUserId(inviteeUserId);
    if (!existingRelation?.rewardedOrderId) {
        return {
            reversed: false,
            reason: 'NO_ACTIVE_INVITE_REWARD',
        };
    }

    await ensureBillingProfileForUser(existingRelation.inviterUserId);

    const client = await getDbClient();
    try {
        await client.query('begin');

        const relation = await getInviteRelationForUpdate(client, inviteeUserId);
        if (!relation?.rewarded_order_id) {
            await client.query('commit');
            return {
                reversed: false,
                reason: 'NO_ACTIVE_INVITE_REWARD',
            };
        }

        if (String(relation.rewarded_order_id || '').trim() !== String(order.id).trim()) {
            await client.query('commit');
            return {
                reversed: false,
                reason: 'REWARD_LINKED_TO_OTHER_ORDER',
                rewardedOrderId: relation.rewarded_order_id,
            };
        }

        const fallbackOrder = await findFirstSuccessfulOrderForUser(client, inviteeUserId, order.id);
        if (fallbackOrder?.id) {
            await client.query(
                `
                    update public.invite_relations
                    set rewarded_order_id = $2, updated_at = now()
                    where id = $1
                `,
                [relation.id, fallbackOrder.id]
            );
            await client.query('commit');
            return {
                reversed: false,
                reason: 'REWARDED_ORDER_MOVED',
                rewardedOrderId: fallbackOrder.id,
                preserved: true,
            };
        }

        const rewardAmount =
            Number(relation.rewarded_credits || 0) || getInviteRuntimeConfig().inviterRewardCredits;
        const refundKey = `invite_reward_reversal:${relation.id}:${order.id}`;
        const duplicated = await getLedgerEntryByGrantKey(client, refundKey);
        if (duplicated) {
            await client.query(
                `
                    update public.invite_relations
                    set
                        status = 'pending',
                        rewarded_order_id = null,
                        rewarded_credits = 0,
                        rewarded_at = null,
                        updated_at = now()
                    where id = $1
                `,
                [relation.id]
            );
            await client.query('commit');
            return {
                reversed: false,
                reason: 'DUPLICATE_REFUND_REVERSAL',
            };
        }

        await client.query(
            `
                update public.billing_profiles
                set
                    bonus_credits = bonus_credits - $2,
                    updated_at = now()
                where user_id = $1
            `,
            [relation.inviter_user_id, rewardAmount]
        );
        await client.query(
            `
                insert into public.billing_ledger_entries
                    (id, user_id, entry_type, amount_units, order_id, grant_key, metadata)
                values
                    ($1, $2, 'invite_reward_reversal', $3, $4, $5, $6::jsonb)
            `,
            [
                crypto.randomUUID(),
                relation.inviter_user_id,
                -rewardAmount,
                order.id,
                refundKey,
                JSON.stringify({
                    inviteRelationId: relation.id,
                    inviterUserId: relation.inviter_user_id,
                    inviteeUserId,
                    inviteCode: relation.invite_code,
                    refundedOrderId: order.id,
                }),
            ]
        );
        await client.query(
            `
                update public.invite_relations
                set
                    status = 'pending',
                    rewarded_order_id = null,
                    rewarded_credits = 0,
                    rewarded_at = null,
                    updated_at = now()
                where id = $1
            `,
            [relation.id]
        );

        await client.query('commit');
        return {
            reversed: true,
            reason: '',
            inviterUserId: relation.inviter_user_id,
            inviteeUserId,
            reversedCredits: rewardAmount,
        };
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}
