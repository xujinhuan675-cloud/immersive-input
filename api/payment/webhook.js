import { readRawBody, sendJson, setCors } from '../_lib/http.js';
import { handleUnifiedWebhook } from '../_lib/payment/gateway.js';

function parseProviderHint(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('provider') || '').trim();
}

function parseRawJson(raw) {
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers:
            'Content-Type, Authorization, X-Signature, X-Webhook-Signature, X-Sub2apipay-Signature, X-Custom-Orchestrator-Signature',
    });
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const rawBody = await readRawBody(req);
        const result = await handleUnifiedWebhook({
            providerHint: parseProviderHint(req),
            headers: req.headers,
            rawBody,
            payload: parseRawJson(rawBody),
        });
        return sendJson(res, 200, result);
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const status = msg.toLowerCase().includes('signature') ? 401 : 500;
        return sendJson(res, status, { message: msg });
    }
}
