import { getCurrentUser } from './auth';

function getApiBase() {
    const base = import.meta.env.VITE_AUTH_API_BASE;
    if (!base) return '';
    return String(base).replace(/\/$/, '');
}

async function request(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${getApiBase()}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || '请求失败');
    }
    return data;
}

export async function getPaymentGatewayConfig() {
    return request('/api/payment/config', { method: 'GET' });
}

export async function createPaymentOrder({
    amount,
    currency = 'CNY',
    orderType = 'topup',
    productCode = 'membership_topup',
    description = '',
    metadata = {},
    idempotencyKey,
}) {
    const { user } = getCurrentUser();
    if (!user?.id) throw new Error('未登录');

    return request('/api/payment/create-order', {
        method: 'POST',
        body: {
            userId: user.id,
            amount,
            currency,
            orderType,
            productCode,
            description,
            metadata,
            idempotencyKey,
        },
    });
}

export async function getPaymentOrderStatus(orderId) {
    return request('/api/payment/order-status', {
        method: 'POST',
        body: {
            orderId,
        },
    });
}
