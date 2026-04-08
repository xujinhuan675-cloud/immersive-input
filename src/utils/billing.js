import { getCurrentUser } from './auth';
import { requestBackend } from './backendApi';

function resolveUserId(userId) {
    const uid = String(userId || '').trim();
    if (uid) return uid;
    const { user } = getCurrentUser();
    if (!user?.id) throw new Error('未登录');
    return String(user.id).trim();
}

export async function getBillingProfile(userId) {
    const uid = resolveUserId(userId);
    return requestBackend('/api/billing/profile', {
        method: 'POST',
        body: {
            userId: uid,
        },
    });
}

export async function consumeBillingUnits({ userId, units = 1, source = 'ai', metadata = {}, idempotencyKey } = {}) {
    const uid = resolveUserId(userId);
    const key = String(idempotencyKey || '').trim();
    return requestBackend('/api/billing/consume', {
        method: 'POST',
        headers: key ? { 'X-Idempotency-Key': key } : {},
        body: {
            userId: uid,
            units,
            source,
            metadata,
            idempotencyKey: key || undefined,
        },
    });
}
