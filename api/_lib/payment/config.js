import { PAYMENT_BACKENDS } from './constants.js';

function toBool(v, defaultValue = false) {
    if (v === undefined || v === null || v === '') return defaultValue;
    const text = String(v).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function trimOrEmpty(v) {
    return String(v || '').trim();
}

export function getPaymentRuntimeConfig() {
    const requestedBackend =
        trimOrEmpty(process.env.PAYMENT_ACTIVE_BACKEND) || PAYMENT_BACKENDS.SUB2APIPAY;
    const customOrchestratorEnabled = toBool(
        process.env.PAYMENT_ENABLE_CUSTOM_ORCHESTRATOR,
        false
    );

    const activeBackend =
        requestedBackend === PAYMENT_BACKENDS.CUSTOM_ORCHESTRATOR && !customOrchestratorEnabled
            ? PAYMENT_BACKENDS.SUB2APIPAY
            : requestedBackend;

    return {
        requestedBackend,
        activeBackend,
        customOrchestratorEnabled,
        sub2apipay: {
            baseUrl: trimOrEmpty(process.env.SUB2APIPAY_BASE_URL),
            apiToken: trimOrEmpty(process.env.SUB2APIPAY_API_TOKEN),
            createOrderPath:
                trimOrEmpty(process.env.SUB2APIPAY_CREATE_ORDER_PATH) || '/api/orders',
            queryOrderPath:
                trimOrEmpty(process.env.SUB2APIPAY_QUERY_ORDER_PATH) || '/api/orders/{orderId}',
            timeoutMs: Number(process.env.SUB2APIPAY_TIMEOUT_MS || 10000),
            notifyUrl: trimOrEmpty(process.env.SUB2APIPAY_NOTIFY_URL),
            returnUrl: trimOrEmpty(process.env.SUB2APIPAY_RETURN_URL),
            webhookSecret: trimOrEmpty(process.env.SUB2APIPAY_WEBHOOK_SECRET),
        },
        customOrchestrator: {
            adapter: trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_ADAPTER) || 'noop',
            webhookSecret: trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_SECRET),
            placeholderCheckoutUrl:
                trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_PLACEHOLDER_CHECKOUT_URL) ||
                'https://example.com/payment-placeholder',
        },
    };
}
