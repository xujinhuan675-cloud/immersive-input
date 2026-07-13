import assert from 'node:assert/strict';
import test from 'node:test';

import { createServer } from 'vite';

class MemoryStorage {
    constructor(initial = {}) {
        this.items = new Map(Object.entries(initial));
    }

    getItem(key) {
        return this.items.has(key) ? this.items.get(key) : null;
    }

    setItem(key, value) {
        this.items.set(key, String(value));
    }

    removeItem(key) {
        this.items.delete(key);
    }

    clear() {
        this.items.clear();
    }
}

const FLOWGUIDE_CHAT_URL = 'https://ai.flowguide.cc/v1/chat/completions';
const USER = { id: 'user-1', email: 'user@example.com' };
const FREE_GROUP_NAME = 'Input-\u514d\u8d39\u8ba2\u9605';
const FREE_GROUP_ID = 7;
const FREE_PLAN_ID = 4;

async function loadAiGateway(context) {
    const server = await createServer({
        appType: 'custom',
        configFile: false,
        root: process.cwd(),
        server: {
            middlewareMode: true,
        },
    });
    context.after(() => server.close());
    return server.ssrLoadModule('/src/utils/aiGateway.js');
}

function setSignedInStorage() {
    globalThis.localStorage = new MemoryStorage({
        auth_token: 'session-token',
        auth_user: JSON.stringify(USER),
    });
}

function setEnv(context, key, value) {
    const previousValue = process.env[key];
    if (value === undefined || value === null) {
        delete process.env[key];
    } else {
        process.env[key] = String(value);
    }
    context.after(() => {
        if (previousValue === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = previousValue;
        }
    });
}

function json(data, init) {
    return Response.json(data, init);
}

function sub2Envelope(data) {
    return json({ code: 0, message: 'success', data });
}

function createFetchMock({
    keys = [{ id: 1, key: 'sk-user', name: 'Immersive Input Gateway', group_id: 2, status: 'active' }],
    subscriptions = [{ id: 10, group_id: 2, status: 'active' }],
    groups = [{ id: 2, name: 'Basic', platform: 'openai', status: 'active', subscription_type: 'standard' }],
    createdKey = { id: 2, key: 'sk-created', name: 'Immersive Input Gateway', group_id: 2, status: 'active' },
    checkoutInfo = { plans: [] },
    gatewayStatuses = [],
} = {}) {
    const state = {
        createdBodies: [],
        gatewayAuthorizations: [],
        keyListCalls: 0,
    };

    const fetchMock = async (url, options = {}) => {
        const target = String(url);
        const method = String(options.method || 'GET').toUpperCase();

        if (target.includes('/api/v1/keys')) {
            if (method === 'POST') {
                state.createdBodies.push(JSON.parse(String(options.body || '{}')));
                return sub2Envelope(createdKey);
            }
            state.keyListCalls += 1;
            const nextKeys = typeof keys === 'function' ? keys(state.keyListCalls) : keys;
            return sub2Envelope({ items: nextKeys, total: nextKeys.length, page: 1, page_size: 100, pages: 1 });
        }

        if (target.includes('/api/v1/subscriptions/active')) {
            return sub2Envelope(subscriptions);
        }

        if (target.includes('/api/v1/groups/available')) {
            return sub2Envelope(groups);
        }

        if (target.includes('/api/v1/user/profile')) {
            return sub2Envelope({
                id: USER.id,
                email: USER.email,
                status: 'active',
                balance: 10,
            });
        }

        if (target.includes('/api/v1/payment/checkout-info')) {
            return sub2Envelope({
                methods: {},
                balance_currency: 'USD',
                ...checkoutInfo,
            });
        }

        if (
            target.includes('/api/v1/user/aff') ||
            target.includes('/api/v1/subscriptions/progress') ||
            target.includes('/api/v1/subscriptions/summary')
        ) {
            return sub2Envelope([]);
        }

        if (target === FLOWGUIDE_CHAT_URL) {
            state.gatewayAuthorizations.push(options.headers?.Authorization);
            const status = gatewayStatuses.shift() || 200;
            return status === 200 ? json({ ok: true }) : new Response('', { status });
        }

        return sub2Envelope({});
    };

    return { fetchMock, state };
}

test('FlowGuide gateway uses the current user Sub2API key when API key is empty', async (context) => {
    const { requireAiGatewayConfig } = await loadAiGateway(context);
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const { fetchMock } = createFetchMock();
    globalThis.fetch = fetchMock;
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const config = await requireAiGatewayConfig({
        apiUrl: FLOWGUIDE_CHAT_URL,
        apiKey: '',
        model: 'gpt-5.4',
        purpose: 'test',
    });

    assert.equal(config.apiKey, 'sk-user');
    assert.equal(config.authSource, 'sub2api_user_key');
});

test('FlowGuide gateway creates a user key bound to the active subscription group when none exists', async (context) => {
    const { requireAiGatewayConfig } = await loadAiGateway(context);
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const { fetchMock, state } = createFetchMock({ keys: [] });
    globalThis.fetch = fetchMock;
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const config = await requireAiGatewayConfig({
        apiUrl: FLOWGUIDE_CHAT_URL,
        apiKey: '',
        model: 'gpt-5.4',
        purpose: 'test',
    });

    assert.equal(config.apiKey, 'sk-created');
    assert.deepEqual(state.createdBodies, [{ name: 'Immersive Input Gateway', group_id: 2 }]);
});

test('FlowGuide gateway creates ordinary user keys in the configured free subscription plan id', async (context) => {
    setEnv(context, 'VITE_SUB2API_DEFAULT_AI_PLAN_ID', FREE_PLAN_ID);
    const { requireAiGatewayConfig } = await loadAiGateway(context);
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const { fetchMock, state } = createFetchMock({
        keys: [],
        subscriptions: [{ id: 10, plan_id: FREE_PLAN_ID, group_id: FREE_GROUP_ID, group_name: 'Renamed Free Group', status: 'active' }],
        groups: [{ id: FREE_GROUP_ID, name: 'Renamed Free Group', platform: 'openai', status: 'active' }],
        checkoutInfo: {
            plans: [{ id: FREE_PLAN_ID, group_id: FREE_GROUP_ID, name: 'Input 免费版' }],
        },
        createdKey: {
            id: FREE_GROUP_ID,
            key: 'sk-free',
            name: 'Immersive Input Gateway',
            group_id: FREE_GROUP_ID,
            status: 'active',
        },
    });
    globalThis.fetch = fetchMock;
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const config = await requireAiGatewayConfig({
        apiUrl: FLOWGUIDE_CHAT_URL,
        apiKey: '',
        model: 'gpt-5.4',
        purpose: 'test',
    });

    assert.equal(config.apiKey, 'sk-free');
    assert.deepEqual(state.createdBodies, [{ name: 'Immersive Input Gateway', group_id: FREE_GROUP_ID }]);
});

test('FlowGuide gateway does not treat a configured free plan as paid subscription priority', async (context) => {
    setEnv(context, 'VITE_SUB2API_DEFAULT_AI_PLAN_ID', FREE_PLAN_ID);
    const { requireAiGatewayConfig } = await loadAiGateway(context);
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const { fetchMock, state } = createFetchMock({
        keys: [],
        subscriptions: [{ id: 10, plan_id: FREE_PLAN_ID, group_id: FREE_GROUP_ID, status: 'active' }],
        groups: [
            { id: 2, name: 'Basic', platform: 'openai', status: 'active' },
            { id: FREE_GROUP_ID, name: FREE_GROUP_NAME, platform: 'openai', status: 'active' },
        ],
        checkoutInfo: {
            plans: [{ id: FREE_PLAN_ID, group_id: FREE_GROUP_ID, name: 'Input 免费版' }],
        },
        createdKey: {
            id: FREE_GROUP_ID,
            key: 'sk-created',
            name: 'Immersive Input Gateway',
            group_id: FREE_GROUP_ID,
            status: 'active',
        },
    });
    globalThis.fetch = fetchMock;
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const config = await requireAiGatewayConfig({
        apiUrl: FLOWGUIDE_CHAT_URL,
        apiKey: '',
        model: 'gpt-5.4',
        purpose: 'test',
    });

    assert.equal(config.apiKey, 'sk-created');
    assert.deepEqual(state.createdBodies, [{ name: 'Immersive Input Gateway', group_id: FREE_GROUP_ID }]);
});

test('FlowGuide gateway ignores stale local API keys when custom services are unavailable', async (context) => {
    const { requireAiGatewayConfig } = await loadAiGateway(context);
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const { fetchMock } = createFetchMock();
    globalThis.fetch = fetchMock;
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const config = await requireAiGatewayConfig({
        apiUrl: FLOWGUIDE_CHAT_URL,
        apiKey: 'stale-local-key',
        model: 'gpt-5.4',
    });

    assert.equal(config.apiKey, 'sk-user');
    assert.equal(config.authSource, 'sub2api_user_key');
    assert.equal(config.model, 'gpt-5.4');
});

test('FlowGuide gateway forces its own chat URL and default model when custom services are unavailable', async (context) => {
    const { requireAiGatewayConfig } = await loadAiGateway(context);
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const { fetchMock } = createFetchMock();
    globalThis.fetch = fetchMock;
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const config = await requireAiGatewayConfig({
        apiUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'custom-key',
        model: 'gpt-5.4',
        purpose: 'chat',
    });

    assert.equal(config.apiUrl, FLOWGUIDE_CHAT_URL);
    assert.equal(config.apiKey, 'sk-user');
    assert.equal(config.model, 'gpt-5.4');
    assert.equal(config.authSource, 'sub2api_user_key');
});

test('custom gateway still requires an API key', async (context) => {
    const { requireAiGatewayConfig } = await loadAiGateway(context);
    setSignedInStorage();

    await assert.rejects(
        () =>
            requireAiGatewayConfig({
                apiUrl: 'https://example.com/v1/chat/completions',
                apiKey: '',
                model: 'gpt-5.4',
                purpose: 'test',
            }),
        /Please configure AI API URL, API Key, and model first\./
    );
});

test('FlowGuide user key refreshes once after a 401 response', async (context) => {
    const { fetchAiGateway } = await loadAiGateway(context);
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const { fetchMock, state } = createFetchMock({
        keys: (call) => [
            {
                id: call,
                key: call === 1 ? 'sk-old' : 'sk-new',
                name: 'Immersive Input Gateway',
                group_id: 2,
                status: 'active',
            },
        ],
        gatewayStatuses: [401, 200],
    });
    globalThis.fetch = fetchMock;
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const { response, config } = await fetchAiGateway(
        {
            apiUrl: FLOWGUIDE_CHAT_URL,
            apiKey: '',
            model: 'gpt-5.4',
            purpose: 'test',
        },
        { method: 'POST', body: '{}' }
    );

    assert.equal(response.status, 200);
    assert.equal(config.apiKey, 'sk-new');
    assert.deepEqual(state.gatewayAuthorizations, ['Bearer sk-old', 'Bearer sk-new']);
});
