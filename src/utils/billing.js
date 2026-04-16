import { getCurrentUser } from './auth';
import { requestBackend } from './backendApi';

function resolveUserId(userId) {
    const uid = String(userId || '').trim();
    if (uid) return uid;
    const { user } = getCurrentUser();
    if (!user?.id) throw new Error('Not logged in');
    return String(user.id).trim();
}

function buildAdminHeaders(adminToken) {
    const token = String(adminToken || '').trim();
    return token ? { 'X-Admin-Token': token } : {};
}

function resolveAdminToken(options = {}) {
    return typeof options === 'string' ? options : String(options?.adminToken || '').trim();
}

export async function getBillingProfile(userId, options = {}) {
    return requestBackend('/api/billing/profile', {
        method: 'POST',
        headers: buildAdminHeaders(resolveAdminToken(options)),
        body: userId ? { userId: resolveUserId(userId) } : {},
    });
}

export async function getBillingCatalog(options = {}) {
    const paymentProvider = String(options?.paymentProvider || options?.provider || '').trim();
    const query = paymentProvider ? `?paymentProvider=${encodeURIComponent(paymentProvider)}` : '';
    return requestBackend(`/api/billing/catalog${query}`, {
        method: 'GET',
        headers: buildAdminHeaders(resolveAdminToken(options)),
    });
}

export async function consumeBillingUnits({ userId, units = 1, source = 'ai', metadata = {}, idempotencyKey } = {}) {
    const key = String(idempotencyKey || '').trim();
    return requestBackend('/api/billing/consume', {
        method: 'POST',
        headers: key ? { 'X-Idempotency-Key': key } : {},
        body: {
            ...(userId ? { userId: resolveUserId(userId) } : {}),
            units,
            source,
            metadata,
            idempotencyKey: key || undefined,
        },
    });
}

export async function updateAdminMembership({ userId, action, reason = '', adminToken } = {}) {
    const token = String(adminToken || '').trim();
    if (!token) throw new Error('Missing admin token');
    const targetUserId = String(userId || '').trim();
    if (!targetUserId) throw new Error('Missing userId');

    return requestBackend('/api/admin/billing?action=membership', {
        method: 'POST',
        headers: buildAdminHeaders(token),
        body: {
            userId: resolveUserId(targetUserId),
            action,
            reason,
        },
    });
}
