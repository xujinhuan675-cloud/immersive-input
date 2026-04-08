import { getPaymentRuntimeConfig } from '../config.js';
import { normalizePaymentStatus } from '../constants.js';
import { PaymentAdapterRegistry } from '../custom/adapterRegistry.js';
import { createNoopAdapter } from '../custom/adapters/noop.js';

const registry = new PaymentAdapterRegistry();
registry.register('noop', createNoopAdapter());

function getActiveAdapterName() {
    return getPaymentRuntimeConfig().customOrchestrator.adapter;
}

function getActiveAdapter() {
    const name = getActiveAdapterName();
    const adapter = registry.get(name);
    if (!adapter) {
        throw new Error(
            `Custom orchestrator adapter "${name}" is not registered. Available: ${registry
                .list()
                .join(', ')}`
        );
    }
    return adapter;
}

export const customOrchestratorProvider = {
    id: 'custom_orchestrator',
    async createPayment({ order }) {
        const adapter = getActiveAdapter();
        const result = await adapter.createPayment({ order });
        return {
            providerOrderId: result.providerOrderId || '',
            checkoutUrl: result.checkoutUrl || '',
            status: normalizePaymentStatus(result.status || 'pending'),
            raw: {
                adapter: adapter.name || getActiveAdapterName(),
                ...(result.raw || {}),
            },
        };
    },
    async queryPayment({ order }) {
        const adapter = getActiveAdapter();
        const result = await adapter.queryPayment({ order });
        return {
            providerOrderId: result.providerOrderId || order.externalOrderId || '',
            checkoutUrl: result.checkoutUrl || order.checkoutUrl || '',
            status: normalizePaymentStatus(result.status || order.status || 'pending'),
            raw: {
                adapter: adapter.name || getActiveAdapterName(),
                ...(result.raw || {}),
            },
        };
    },
    async verifyWebhook({ headers, rawBody, payload }) {
        const adapter = getActiveAdapter();
        return adapter.verifyWebhook({ headers, rawBody, payload });
    },
    normalizeWebhookEvent({ payload, headers, rawBody }) {
        const adapter = getActiveAdapter();
        const event = adapter.parseWebhookEvent({ payload, headers, rawBody });
        return {
            ...event,
            status: normalizePaymentStatus(event.status || 'pending'),
        };
    },
};
