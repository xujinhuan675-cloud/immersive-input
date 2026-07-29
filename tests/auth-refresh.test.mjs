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

const USER = { id: 'user-1', email: 'user@example.com' };

async function loadModule(context, path) {
    const server = await createServer({
        appType: 'custom',
        configFile: false,
        root: process.cwd(),
        server: {
            middlewareMode: true,
            hmr: false,
        },
    });
    context.after(() => server.close());
    return server.ssrLoadModule(path);
}

function setSignedInStorage(overrides = {}) {
    globalThis.localStorage = new MemoryStorage({
        auth_token: 'old-token',
        auth_refresh_token: 'refresh-token',
        auth_token_expires_at: String(Date.now() - 1000),
        auth_user: JSON.stringify(USER),
        ...overrides,
    });
}

function json(data, init) {
    return Response.json(data, init);
}

function refreshPayload(token = 'fresh-token') {
    return {
        code: 0,
        message: 'success',
        data: {
            access_token: token,
            refresh_token: 'refresh-token-2',
            expires_in: 3600,
            user: USER,
        },
    };
}

test('requireAccessToken refreshes an expired stored token before returning', async (context) => {
    const { requireAccessToken } = await loadModule(context, '/src/utils/auth.js');
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const refreshBodies = [];
    globalThis.fetch = async (url, options = {}) => {
        assert.match(String(url), /\/api\/v1\/auth\/refresh$/);
        refreshBodies.push(JSON.parse(String(options.body || '{}')));
        return json(refreshPayload('fresh-token'));
    };
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const token = await requireAccessToken();

    assert.equal(token, 'fresh-token');
    assert.equal(globalThis.localStorage.getItem('auth_token'), 'fresh-token');
    assert.equal(globalThis.localStorage.getItem('auth_refresh_token'), 'refresh-token-2');
    assert.equal(refreshBodies.length, 1);
    assert.equal(refreshBodies[0].refresh_token, 'refresh-token');
});

test('requestSub2Api refreshes and replays wrapped token expiration responses', async (context) => {
    const { requestSub2Api } = await loadModule(context, '/src/utils/sub2api.js');
    setSignedInStorage();

    const originalFetch = globalThis.fetch;
    const profileAuthorizations = [];
    globalThis.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.includes('/api/v1/auth/refresh')) {
            return json(refreshPayload('fresh-sub2-token'));
        }
        if (target.includes('/api/v1/user/profile')) {
            profileAuthorizations.push(options.headers?.Authorization);
            if (profileAuthorizations.length === 1) {
                return json({ code: 401, message: 'Token has expired', data: null });
            }
            return json({ code: 0, message: 'success', data: { id: USER.id, email: USER.email } });
        }
        return json({ message: 'not found' }, { status: 404 });
    };
    context.after(() => {
        globalThis.fetch = originalFetch;
    });

    const profile = await requestSub2Api('/user/profile', { token: 'old-token' });

    assert.deepEqual(profile, { id: USER.id, email: USER.email });
    assert.deepEqual(profileAuthorizations, ['Bearer old-token', 'Bearer fresh-sub2-token']);
});
