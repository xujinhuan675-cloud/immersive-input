import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildFlowGuideUrl,
    buildFlowGuideAuthUrl,
    getFlowGuideApiBase,
    getFlowGuideAuthBase,
} from '../src/utils/flowguide.js';

const ENV_KEYS = [
    'VITE_AUTH_API_BASE',
    'VITE_FLOWGUIDE_API_BASE',
    'VITE_FLOWGUIDE_AUTH_BASE',
];

function withEnv(overrides, run) {
    const previous = new Map();
    ENV_KEYS.forEach((key) => {
        previous.set(key, process.env[key]);
        delete process.env[key];
    });

    Object.entries(overrides).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            process.env[key] = String(value);
        }
    });

    try {
        return run();
    } finally {
        previous.forEach((value, key) => {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        });
    }
}

test('auth base does not change FlowGuide API base', () => {
    withEnv(
        {
            VITE_AUTH_API_BASE: 'https://pay.openeducation.top',
        },
        () => {
            assert.equal(getFlowGuideAuthBase(), 'https://pay.openeducation.top');
            assert.equal(buildFlowGuideAuthUrl('/api/v1/auth/login'), 'https://pay.openeducation.top/api/v1/auth/login');
            assert.equal(getFlowGuideApiBase(), 'https://ai.flowguide.cc');
            assert.equal(buildFlowGuideUrl('/api/v1/user/profile'), 'https://ai.flowguide.cc/api/v1/user/profile');
        }
    );
});

test('explicit FlowGuide API base is separate from auth base', () => {
    withEnv(
        {
            VITE_FLOWGUIDE_API_BASE: 'https://flowguide.example',
            VITE_AUTH_API_BASE: 'https://pay.example',
        },
        () => {
            assert.equal(getFlowGuideApiBase(), 'https://flowguide.example');
            assert.equal(getFlowGuideAuthBase(), 'https://pay.example');
            assert.equal(buildFlowGuideUrl('/payment/checkout-info'), 'https://flowguide.example/payment/checkout-info');
            assert.equal(buildFlowGuideAuthUrl('/api/v1/auth/refresh'), 'https://pay.example/api/v1/auth/refresh');
        }
    );
});
