export class PaymentAdapterRegistry {
    constructor() {
        this._adapters = new Map();
    }

    register(name, adapter) {
        const key = String(name || '').trim();
        if (!key) throw new Error('Adapter name is required');
        if (!adapter || typeof adapter.createPayment !== 'function') {
            throw new Error(`Adapter "${key}" must implement createPayment`);
        }
        if (typeof adapter.queryPayment !== 'function') {
            throw new Error(`Adapter "${key}" must implement queryPayment`);
        }
        if (typeof adapter.verifyWebhook !== 'function') {
            throw new Error(`Adapter "${key}" must implement verifyWebhook`);
        }
        if (typeof adapter.parseWebhookEvent !== 'function') {
            throw new Error(`Adapter "${key}" must implement parseWebhookEvent`);
        }
        this._adapters.set(key, adapter);
    }

    get(name) {
        const key = String(name || '').trim();
        return this._adapters.get(key) || null;
    }

    list() {
        return Array.from(this._adapters.keys());
    }
}
