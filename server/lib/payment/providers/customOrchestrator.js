import { getPaymentRuntimeConfig } from '../config.js';
import { normalizePaymentStatus } from '../constants.js';
import { PaymentAdapterRegistry } from '../custom/adapterRegistry.js';
import { createAlipayAdapter } from '../custom/adapters/alipay.js';
import { createEasyPayAdapter } from '../custom/adapters/easypay.js';
import { createNoopAdapter } from '../custom/adapters/noop.js';
import { createStripeAdapter } from '../custom/adapters/stripe.js';
import { createWxpayAdapter } from '../custom/adapters/wxpay.js';

const registry = new PaymentAdapterRegistry();
registry.register('noop', createNoopAdapter());
registry.register('easypay', createEasyPayAdapter());
registry.register('stripe', createStripeAdapter());
registry.register('alipay', createAlipayAdapter());
registry.register('wxpay', createWxpayAdapter());

function trim(value) {
    return String(value || '').trim().toLowerCase();
}

function parsePayload(rawBody) {
    const text = String(rawBody || '').trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        const params = new URLSearchParams(text);
        const parsed = {};
        for (const [key, value] of params.entries()) {
            parsed[key] = value;
        }
        return parsed;
    }
}

function getRuntimeConfig() {
    return getPaymentRuntimeConfig().customOrchestrator;
}

function getEnabledAdapters() {
    const cfg = getRuntimeConfig();
    return Array.isArray(cfg.enabledAdapters) && cfg.enabledAdapters.length > 0
        ? cfg.enabledAdapters
        : [cfg.defaultAdapter || cfg.adapter || 'stripe'];
}

function isAdapterEnabled(name) {
    return getEnabledAdapters().includes(trim(name));
}

function resolveDefaultAdapterName() {
    const cfg = getRuntimeConfig();
    const fallback = trim(cfg.defaultAdapter || cfg.adapter || 'stripe');
    if (!fallback) return 'stripe';
    return registry.get(fallback) ? fallback : 'stripe';
}

function resolveOrderAdapterName(order, requestedAdapter = '', { allowDisabled = false } = {}) {
    const candidates = [
        requestedAdapter,
        order?.metadata?.paymentProvider,
        order?.metadata?.paymentAdapter,
        order?.provider,
        resolveDefaultAdapterName(),
    ]
        .map(trim)
        .filter(Boolean);

    for (const candidate of candidates) {
        if (!registry.get(candidate)) continue;
        if (allowDisabled || isAdapterEnabled(candidate)) {
            return candidate;
        }
    }
    throw new Error(
        `Payment adapter "${requestedAdapter || order?.provider || resolveDefaultAdapterName()}" is not enabled`
    );
}

function getAdapterStatus(name, { allowDisabled = false } = {}) {
    const adapter = registry.get(name);
    if (!adapter) {
        return {
            name,
            ready: false,
            missingFields: ['adapter_not_registered'],
            enabled: false,
            channel: name,
            mode: 'unknown',
        };
    }
    const detail =
        typeof adapter.getRuntimeStatus === 'function' ? adapter.getRuntimeStatus() || {} : {};
    return {
        name,
        ready: detail.ready !== false,
        missingFields: detail.missingFields || [],
        enabled: allowDisabled ? true : isAdapterEnabled(name),
        channel: detail.channel || name,
        mode: detail.mode || 'custom',
        ...detail,
    };
}

function detectAdapterName({ headers = {}, rawBody = '', payload = {}, providerHint = '' } = {}) {
    const hinted = trim(providerHint);
    if (hinted && registry.get(hinted)) {
        return hinted;
    }

    if (trim(headers['stripe-signature'] || headers['Stripe-Signature'])) {
        return 'stripe';
    }
    if (
        trim(headers['wechatpay-signature']) ||
        trim(headers['Wechatpay-Signature']) ||
        trim(headers['wechatpay-serial'])
    ) {
        return 'wxpay';
    }

    const data =
        payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length > 0
            ? payload
            : parsePayload(rawBody);
    if (trim(data.app_id) || trim(data.seller_id)) {
        return 'alipay';
    }
    if (trim(data.pid)) {
        return 'easypay';
    }

    return resolveDefaultAdapterName();
}

function buildWebhookResponse(adapterName, success) {
    const adapter = registry.get(adapterName);
    if (adapter && typeof adapter.buildWebhookResponse === 'function') {
        return adapter.buildWebhookResponse({ success });
    }
    return {
        type: 'json',
        status: success ? 200 : 500,
        body: {
            ok: success,
        },
    };
}

export const customOrchestratorProvider = {
    id: 'custom_orchestrator',
    resolveAdapterName({ order = null, requestedAdapter = '', allowDisabled = false } = {}) {
        return resolveOrderAdapterName(order, requestedAdapter, { allowDisabled });
    },
    detectAdapterName,
    buildWebhookResponse,
    getRuntimeStatus() {
        const defaultAdapter = resolveDefaultAdapterName();
        const adapters = getEnabledAdapters().map((name) => getAdapterStatus(name));
        const defaultStatus = getAdapterStatus(defaultAdapter, { allowDisabled: true });
        return {
            adapter: defaultAdapter,
            defaultAdapter,
            enabledAdapters: getEnabledAdapters(),
            availableAdapters: registry.list(),
            adapters,
            ready: defaultStatus.ready !== false,
            channel: defaultStatus.channel || defaultAdapter,
            mode: defaultStatus.mode || 'custom',
            missingFields: defaultStatus.missingFields || [],
        };
    },
    async createPayment({ order, requestedAdapter = '', requestContext = {} }) {
        const adapterName = resolveOrderAdapterName(order, requestedAdapter);
        const adapter = registry.get(adapterName);
        const result = await adapter.createPayment({ order, requestContext });
        return {
            providerName: adapterName,
            providerOrderId: result.providerOrderId || '',
            checkoutUrl: result.checkoutUrl || '',
            status: normalizePaymentStatus(result.status || 'pending'),
            raw: {
                adapter: adapterName,
                ...(result.raw || {}),
            },
        };
    },
    async queryPayment({ order }) {
        const adapterName = resolveOrderAdapterName(order, '', { allowDisabled: true });
        const adapter = registry.get(adapterName);
        const result = await adapter.queryPayment({ order });
        return {
            providerName: adapterName,
            providerOrderId: result.providerOrderId || order.externalOrderId || '',
            checkoutUrl: result.checkoutUrl || order.checkoutUrl || '',
            status: normalizePaymentStatus(result.status || order.status || 'pending'),
            raw: {
                adapter: adapterName,
                ...(result.raw || {}),
            },
        };
    },
    async refundPayment({ order, reason = '', actor = null }) {
        const adapterName = resolveOrderAdapterName(order, '', { allowDisabled: true });
        const adapter = registry.get(adapterName);
        if (!adapter || typeof adapter.refundPayment !== 'function') {
            throw new Error(`Payment adapter "${adapterName}" does not support refunds`);
        }
        const result = await adapter.refundPayment({ order, reason, actor });
        return {
            providerName: adapterName,
            providerRefundId: result.providerRefundId || '',
            status: normalizePaymentStatus(result.status || order.status || 'pending'),
            accepted: result.accepted !== false,
            raw: {
                adapter: adapterName,
                ...(result.raw || {}),
            },
        };
    },
    async cancelPayment({ order, reason = '', actor = null }) {
        const adapterName = resolveOrderAdapterName(order, '', { allowDisabled: true });
        const adapter = registry.get(adapterName);
        if (!adapter || typeof adapter.cancelPayment !== 'function') {
            throw new Error(`Payment adapter "${adapterName}" does not support order cancellation`);
        }
        const result = await adapter.cancelPayment({ order, reason, actor });
        return {
            providerName: adapterName,
            providerOrderId: result.providerOrderId || order.externalOrderId || '',
            status: normalizePaymentStatus(result.status || order.status || 'pending'),
            accepted: result.accepted !== false,
            raw: {
                adapter: adapterName,
                ...(result.raw || {}),
            },
        };
    },
    async verifyWebhook({ headers, rawBody, payload, providerHint }) {
        const adapterName = detectAdapterName({ headers, rawBody, payload, providerHint });
        const adapter = registry.get(adapterName);
        if (!adapter) {
            return {
                ok: false,
                adapterName,
                reason: `Unknown payment adapter: ${adapterName}`,
            };
        }
        const result = await adapter.verifyWebhook({ headers, rawBody, payload });
        return {
            ...result,
            adapterName,
        };
    },
    normalizeWebhookEvent({ payload, headers, rawBody, providerHint, adapterName = '' }) {
        const selectedAdapterName = trim(adapterName) || detectAdapterName({ headers, rawBody, payload, providerHint });
        const adapter = registry.get(selectedAdapterName);
        const event = adapter.parseWebhookEvent({ payload, headers, rawBody });
        return {
            ...event,
            providerName: selectedAdapterName,
            status: normalizePaymentStatus(event.status || 'pending'),
        };
    },
};
