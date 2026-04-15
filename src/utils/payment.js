import { getCurrentUser, requireAccessToken } from './auth';
import { requestBackend } from './backendApi';

function buildAdminHeaders(adminToken) {
    const token = String(adminToken || '').trim();
    return token ? { 'X-Admin-Token': token } : {};
}

function resolveAdminToken(options = {}) {
    return typeof options === 'string' ? options : String(options?.adminToken || '').trim();
}

export async function getPaymentGatewayConfig(options = {}) {
    return requestBackend('/api/payment/config', {
        method: 'GET',
        headers: buildAdminHeaders(resolveAdminToken(options)),
    });
}

export async function createPaymentOrder({
    amount,
    currency = 'CNY',
    orderType = 'topup',
    productCode = 'membership_topup',
    description = '',
    metadata = {},
    idempotencyKey,
    paymentProvider = '',
    paymentMethod = '',
}) {
    const { user } = getCurrentUser();
    if (!user?.id) throw new Error('Not logged in');
    await requireAccessToken();
    return requestBackend('/api/payment/create-order', {
        method: 'POST',
        body: {
            amount,
            currency,
            orderType,
            productCode,
            description,
            metadata,
            idempotencyKey,
            paymentProvider,
            paymentMethod,
        },
    });
}

export async function getPaymentOrderStatus(orderId, options = {}) {
    if (!resolveAdminToken(options)) {
        await requireAccessToken();
    }
    return requestBackend('/api/payment/order-status', {
        method: 'POST',
        headers: buildAdminHeaders(resolveAdminToken(options)),
        body: {
            orderId,
        },
    });
}

export async function cancelPaymentOrder({ orderId, reason = '', adminToken } = {}) {
    const targetOrderId = String(orderId || '').trim();
    if (!targetOrderId) throw new Error('Missing orderId');
    if (!String(adminToken || '').trim()) {
        await requireAccessToken();
    }
    return requestBackend('/api/payment/cancel-order', {
        method: 'POST',
        headers: buildAdminHeaders(String(adminToken || '').trim()),
        body: {
            orderId: targetOrderId,
            reason,
        },
    });
}

export async function refundPaymentOrder({ orderId, reason = '', adminToken } = {}) {
    const token = String(adminToken || '').trim();
    if (!token) throw new Error('Missing admin token');
    const targetOrderId = String(orderId || '').trim();
    if (!targetOrderId) throw new Error('Missing orderId');

    return requestBackend('/api/admin/billing?action=refund', {
        method: 'POST',
        headers: buildAdminHeaders(token),
        body: {
            orderId: targetOrderId,
            reason,
        },
    });
}
