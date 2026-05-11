import { getCurrentUser, requireAccessToken } from './auth';
import { getSub2WebBase, requestSub2Api } from './sub2api';

function resolveAdminToken(options = {}) {
    return typeof options === 'string' ? options : String(options?.adminToken || '').trim();
}

function buildAdminAuthHeaders(adminToken) {
    const token = String(adminToken || '').trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function getReturnUrl() {
    try {
        const url = new URL(getSub2WebBase());
        url.pathname = '/payment/result';
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return 'https://ai.flowguide.cc/payment/result';
    }
}

function normalizeStatus(status) {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'CANCELLED') return 'CANCELED';
    return normalized || 'PENDING';
}

function normalizeOrderType(orderType) {
    const normalized = String(orderType || '').trim().toLowerCase();
    if (normalized === 'topup') return 'balance';
    return normalized || 'balance';
}

function centsFromAmount(amount) {
    return Math.round(toNumber(amount, 0) * 100);
}

function normalizePaymentOrder(order, fallback = {}) {
    if (!order) return null;
    const id = order.id ?? order.order_id ?? fallback.order_id ?? fallback.id;
    const amount = toNumber(order.amount ?? fallback.amount, 0);
    const payAmount = toNumber(order.pay_amount ?? fallback.pay_amount ?? amount, amount);
    const qrCode = order.qr_code ?? fallback.qr_code ?? '';
    const payUrl = order.pay_url ?? fallback.pay_url ?? fallback.oauth?.authorize_url ?? '';
    const orderType = normalizeOrderType(order.order_type ?? fallback.order_type);

    return {
        ...order,
        id,
        userId: order.user_id ?? order.userId,
        amountCents: centsFromAmount(payAmount || amount),
        amount,
        payAmount,
        currency: fallback.currency || 'CNY',
        provider: order.payment_type ?? fallback.payment_type ?? fallback.paymentProvider ?? '',
        paymentType: order.payment_type ?? fallback.payment_type ?? '',
        orderType,
        productCode:
            fallback.productCode ||
            (orderType === 'subscription' && (order.plan_id ?? fallback.plan_id)
                ? `sub2api_plan_${order.plan_id ?? fallback.plan_id}`
                : 'balance_topup'),
        status: normalizeStatus(order.status ?? fallback.status),
        checkoutUrl: payUrl,
        outTradeNo: order.out_trade_no ?? fallback.out_trade_no ?? '',
        metadata: {
            ...(order.metadata || {}),
            gatewayCreateResponse: fallback,
            planId: order.plan_id ?? fallback.plan_id ?? fallback.planId,
            checkoutPresentation: qrCode
                ? {
                      qrContent: qrCode,
                  }
                : undefined,
        },
    };
}

function providerAdaptersFromMethods(methods = {}) {
    return Object.entries(methods).map(([name, limits]) => ({
        name,
        ready: limits?.available !== false,
        createReady: limits?.available !== false,
        missingFields: [],
        createMissingFields: [],
        limits,
    }));
}

export async function getPaymentGatewayConfig(options = {}) {
    const adminToken = resolveAdminToken(options);
    const token = adminToken || (await requireAccessToken());
    const checkoutInfo = await requestSub2Api('/payment/checkout-info', {
        token: adminToken ? undefined : token,
        headers: buildAdminAuthHeaders(adminToken),
    });
    const adapters = providerAdaptersFromMethods(checkoutInfo?.methods);

    return {
        activeBackend: 'sub2api',
        customOrchestratorEnabled: adapters.length > 0,
        providers: {
            customOrchestrator: {
                ready: adapters.some((item) => item.ready),
                channel: adapters[0]?.name || '',
                adapter: adapters[0]?.name || '',
                adapters,
                missingFields: [],
            },
        },
        raw: checkoutInfo,
    };
}

export async function createPaymentOrder({
    amount,
    currency = 'CNY',
    orderType = 'topup',
    productCode = 'balance_topup',
    description = '',
    metadata = {},
    paymentProvider = '',
    paymentMethod = '',
}) {
    const { user } = getCurrentUser();
    if (!user?.id) throw new Error('Not logged in');
    const token = await requireAccessToken();
    const normalizedOrderType = normalizeOrderType(orderType);
    const planId = metadata?.planId || metadata?.plan_id || metadata?.sub2apiPlanId;
    const paymentType = String(paymentProvider || paymentMethod || '').trim();
    if (!paymentType) throw new Error('Please choose a payment provider first');

    const body = {
        amount: toNumber(amount, 0),
        payment_type: paymentType,
        order_type: normalizedOrderType,
        payment_source: 'hosted_redirect',
        return_url: getReturnUrl(),
        is_mobile:
            typeof navigator !== 'undefined'
                ? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
                : false,
        ...(normalizedOrderType === 'subscription' && planId ? { plan_id: Number(planId) } : {}),
    };

    const result = await requestSub2Api('/payment/orders', {
        method: 'POST',
        token,
        body,
    });
    const order = normalizePaymentOrder(
        {
            id: result?.order_id,
            amount: result?.amount,
            pay_amount: result?.pay_amount,
            payment_type: result?.payment_type || paymentType,
            out_trade_no: result?.out_trade_no,
            status: 'PENDING',
            order_type: normalizedOrderType,
            plan_id: body.plan_id,
            pay_url: result?.pay_url || result?.oauth?.authorize_url,
            qr_code: result?.qr_code,
            expires_at: result?.expires_at,
        },
        {
            ...result,
            productCode,
            currency,
            description,
            paymentProvider: paymentType,
            order_type: normalizedOrderType,
        }
    );

    return { order, raw: result };
}

export async function getPaymentOrderStatus(orderId, options = {}) {
    const targetOrderId = String(orderId || '').trim();
    if (!targetOrderId) throw new Error('Missing orderId');

    const adminToken = resolveAdminToken(options);
    if (adminToken) {
        const result = await requestSub2Api(`/admin/payment/orders/${targetOrderId}`, {
            headers: buildAdminAuthHeaders(adminToken),
        });
        const order = normalizePaymentOrder(result?.order || result);
        return { order, raw: result };
    }

    const token = await requireAccessToken();
    let order = await requestSub2Api(`/payment/orders/${targetOrderId}`, { token });
    const outTradeNo = order?.out_trade_no;
    if (
        outTradeNo &&
        ![
            'COMPLETED',
            'FAILED',
            'CANCELLED',
            'CANCELED',
            'EXPIRED',
            'REFUNDED',
            'PARTIALLY_REFUNDED',
        ].includes(normalizeStatus(order?.status))
    ) {
        order = await requestSub2Api('/payment/orders/verify', {
            method: 'POST',
            token,
            body: { out_trade_no: outTradeNo },
        }).catch(() => order);
    }

    return { order: normalizePaymentOrder(order), raw: order };
}

export async function cancelPaymentOrder({ orderId, adminToken } = {}) {
    const targetOrderId = String(orderId || '').trim();
    if (!targetOrderId) throw new Error('Missing orderId');

    const token = String(adminToken || '').trim() || (await requireAccessToken());
    const isAdmin = Boolean(String(adminToken || '').trim());
    const path = isAdmin
        ? `/admin/payment/orders/${targetOrderId}/cancel`
        : `/payment/orders/${targetOrderId}/cancel`;
    await requestSub2Api(path, {
        method: 'POST',
        token: isAdmin ? undefined : token,
        headers: buildAdminAuthHeaders(isAdmin ? token : ''),
    });
    return getPaymentOrderStatus(targetOrderId, isAdmin ? { adminToken: token } : {});
}

export async function refundPaymentOrder({ orderId, reason = '', adminToken } = {}) {
    const token = String(adminToken || '').trim();
    if (!token) throw new Error('Missing admin token');
    const targetOrderId = String(orderId || '').trim();
    if (!targetOrderId) throw new Error('Missing orderId');

    const current = await requestSub2Api(`/admin/payment/orders/${targetOrderId}`, {
        headers: buildAdminAuthHeaders(token),
    });
    const currentOrder = current?.order || current;
    const amount = toNumber(currentOrder?.pay_amount ?? currentOrder?.amount, 0);
    const result = await requestSub2Api(`/admin/payment/orders/${targetOrderId}/refund`, {
        method: 'POST',
        headers: buildAdminAuthHeaders(token),
        body: {
            amount,
            reason,
            deduct_balance: true,
        },
    });
    const refreshed = await getPaymentOrderStatus(targetOrderId, { adminToken: token }).catch(() => null);
    return {
        order: refreshed?.order || normalizePaymentOrder(currentOrder),
        refund: {
            status: result?.success ? 'REFUNDED' : 'PENDING',
            raw: result,
        },
        raw: result,
    };
}
