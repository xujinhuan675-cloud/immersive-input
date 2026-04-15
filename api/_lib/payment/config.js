import fs from 'node:fs';

import { PAYMENT_BACKEND } from './constants.js';

function toBool(v, defaultValue = false) {
    if (v === undefined || v === null || v === '') return defaultValue;
    const text = String(v).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function toPositiveInt(v, defaultValue) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return defaultValue;
    return Math.round(n);
}

function trimOrEmpty(v) {
    return String(v || '').trim();
}

function parseCsv(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function ensureUnique(values) {
    return Array.from(new Set(values.filter(Boolean)));
}

function resolveFileValue(value) {
    const raw = trimOrEmpty(value);
    if (!raw) return '';
    if ((raw.startsWith('/') || /^[A-Za-z]:[/\\]/.test(raw)) && fs.existsSync(raw)) {
        return fs.readFileSync(raw, 'utf8').trim();
    }
    return raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

function normalizeBaseUrl(value) {
    return trimOrEmpty(value).replace(/\/$/, '');
}

function buildUrl(base, path) {
    const root = normalizeBaseUrl(base);
    if (!root) return '';
    const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
    return `${root}${suffix}`;
}

function defaultWebhookUrl(baseUrl, provider) {
    const root = normalizeBaseUrl(baseUrl);
    if (!root) return '';
    return `${root}/api/payment/webhook`;
}

export function getPaymentRuntimeConfig() {
    const timeoutMs = toPositiveInt(process.env.CUSTOM_ORCHESTRATOR_TIMEOUT_MS, 10000);
    const appBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
    const enabledAdapters = ensureUnique(
        parseCsv(process.env.CUSTOM_ORCHESTRATOR_ENABLED_ADAPTERS || process.env.PAYMENT_PROVIDERS)
    );
    const requestedDefaultAdapter =
        trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_DEFAULT_ADAPTER) ||
        trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_ADAPTER) ||
        '';
    const defaultAdapter = requestedDefaultAdapter || enabledAdapters[0] || 'stripe';
    const providerList = ensureUnique(
        enabledAdapters.length > 0 ? [...enabledAdapters, defaultAdapter] : [defaultAdapter]
    );

    return {
        activeBackend: PAYMENT_BACKEND,
        requestedBackend: PAYMENT_BACKEND,
        customOrchestratorEnabled: true,
        paymentAllowedOrigins: parseCsv(
            process.env.PAYMENT_ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS
        ),
        adminTokenConfigured: !!trimOrEmpty(process.env.PAYMENT_ADMIN_TOKEN || process.env.INIT_DB_TOKEN),
        customOrchestrator: {
            adapter: defaultAdapter,
            defaultAdapter,
            enabledAdapters: providerList,
            timeoutMs,
            webhookSecret: trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_SECRET),
            webhookSignatureHeader:
                trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_SIGNATURE_HEADER) ||
                'x-custom-orchestrator-signature',
            webhookTimestampHeader:
                trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_TIMESTAMP_HEADER) ||
                'x-custom-orchestrator-timestamp',
            webhookToleranceSeconds: toPositiveInt(
                process.env.CUSTOM_ORCHESTRATOR_WEBHOOK_TOLERANCE_SECONDS,
                300
            ),
            enforceWebhookTimestamp: toBool(
                process.env.CUSTOM_ORCHESTRATOR_ENFORCE_WEBHOOK_TIMESTAMP,
                true
            ),
            placeholderCheckoutUrl:
                trimOrEmpty(process.env.CUSTOM_ORCHESTRATOR_PLACEHOLDER_CHECKOUT_URL) ||
                'https://example.com/payment-placeholder',
            appBaseUrl,
            easypay: {
                pid: trimOrEmpty(process.env.EASYPAY_PID),
                key: trimOrEmpty(process.env.EASYPAY_KEY || process.env.EASY_PAY_PKEY),
                apiBase: normalizeBaseUrl(process.env.EASYPAY_API_BASE),
                createOrderPath:
                    trimOrEmpty(process.env.EASYPAY_CREATE_ORDER_PATH) || '/api/pay/create',
                queryOrderPath:
                    trimOrEmpty(process.env.EASYPAY_QUERY_ORDER_PATH) || '/api/pay/query',
                refundOrderPath: trimOrEmpty(process.env.EASYPAY_REFUND_ORDER_PATH),
                notifyUrl:
                    trimOrEmpty(process.env.EASYPAY_NOTIFY_URL) ||
                    defaultWebhookUrl(appBaseUrl, 'easypay'),
                returnUrl: trimOrEmpty(process.env.EASYPAY_RETURN_URL),
                defaultType: trimOrEmpty(process.env.EASYPAY_DEFAULT_TYPE) || 'alipay',
                signType: trimOrEmpty(process.env.EASYPAY_SIGN_TYPE) || 'MD5',
                timeoutMs: toPositiveInt(process.env.EASYPAY_TIMEOUT_MS, timeoutMs),
            },
            stripe: {
                secretKey: trimOrEmpty(process.env.STRIPE_SECRET_KEY),
                webhookSecret: trimOrEmpty(process.env.STRIPE_WEBHOOK_SECRET),
                apiBase: normalizeBaseUrl(process.env.STRIPE_API_BASE) || 'https://api.stripe.com',
                createCheckoutPath:
                    trimOrEmpty(process.env.STRIPE_CREATE_CHECKOUT_PATH) || '/v1/checkout/sessions',
                retrieveCheckoutPath:
                    trimOrEmpty(process.env.STRIPE_RETRIEVE_CHECKOUT_PATH) ||
                    '/v1/checkout/sessions',
                refundPath: trimOrEmpty(process.env.STRIPE_REFUND_PATH) || '/v1/refunds',
                successUrl: trimOrEmpty(process.env.STRIPE_SUCCESS_URL),
                cancelUrl: trimOrEmpty(process.env.STRIPE_CANCEL_URL),
                mode: trimOrEmpty(process.env.STRIPE_MODE) || 'payment',
                paymentMethodTypes: trimOrEmpty(process.env.STRIPE_PAYMENT_METHOD_TYPES) || 'card',
                defaultCurrency: trimOrEmpty(process.env.STRIPE_DEFAULT_CURRENCY) || 'USD',
                webhookToleranceSeconds: toPositiveInt(
                    process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS,
                    300
                ),
                timeoutMs: toPositiveInt(process.env.STRIPE_TIMEOUT_MS, timeoutMs),
            },
            alipay: {
                appId: trimOrEmpty(process.env.ALIPAY_APP_ID),
                privateKey: resolveFileValue(process.env.ALIPAY_PRIVATE_KEY),
                publicKey: resolveFileValue(process.env.ALIPAY_PUBLIC_KEY),
                gatewayBase:
                    normalizeBaseUrl(process.env.ALIPAY_API_BASE) ||
                    'https://openapi.alipay.com/gateway.do',
                notifyUrl:
                    trimOrEmpty(process.env.ALIPAY_NOTIFY_URL) ||
                    defaultWebhookUrl(appBaseUrl, 'alipay'),
                returnUrl: trimOrEmpty(process.env.ALIPAY_RETURN_URL),
                defaultCurrency: trimOrEmpty(process.env.ALIPAY_DEFAULT_CURRENCY) || 'CNY',
                timeoutMs: toPositiveInt(process.env.ALIPAY_TIMEOUT_MS, timeoutMs),
            },
            wxpay: {
                appId: trimOrEmpty(process.env.WXPAY_APP_ID),
                mchId: trimOrEmpty(process.env.WXPAY_MCH_ID),
                privateKey: resolveFileValue(process.env.WXPAY_PRIVATE_KEY),
                certSerial: trimOrEmpty(process.env.WXPAY_CERT_SERIAL),
                apiV3Key: trimOrEmpty(process.env.WXPAY_API_V3_KEY),
                notifyUrl:
                    trimOrEmpty(process.env.WXPAY_NOTIFY_URL) ||
                    defaultWebhookUrl(appBaseUrl, 'wxpay'),
                returnUrl: trimOrEmpty(process.env.WXPAY_RETURN_URL),
                publicKey: resolveFileValue(process.env.WXPAY_PUBLIC_KEY),
                publicKeyId: trimOrEmpty(process.env.WXPAY_PUBLIC_KEY_ID),
                apiBase:
                    normalizeBaseUrl(process.env.WXPAY_API_BASE) ||
                    'https://api.mch.weixin.qq.com',
                defaultCurrency: trimOrEmpty(process.env.WXPAY_DEFAULT_CURRENCY) || 'CNY',
                timeoutMs: toPositiveInt(process.env.WXPAY_TIMEOUT_MS, timeoutMs),
            },
        },
    };
}
