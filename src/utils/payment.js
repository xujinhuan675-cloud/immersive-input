import { getCurrentUser } from './auth';
import { requestBackend } from './backendApi';

export async function getPaymentGatewayConfig() {
    return requestBackend('/api/payment/config', { method: 'GET' });
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
    return requestBackend('/api/payment/create-order', {
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
    return requestBackend('/api/payment/order-status', {
        method: 'POST',
        body: {
            orderId,
        },
    });
}
