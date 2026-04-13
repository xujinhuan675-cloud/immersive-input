import { readRawBody, sendJson, setCors } from '../_lib/http.js';
import { handleUnifiedWebhook } from '../_lib/payment/gateway.js';
import { customOrchestratorProvider } from '../_lib/payment/providers/customOrchestrator.js';

function parseFormBody(raw) {
    const text = String(raw || '').trim();
    if (!text) return {};
    const params = new URLSearchParams(text);
    const obj = {};
    for (const [key, value] of params.entries()) {
        obj[key] = value;
    }
    return obj;
}

function parseRawPayload(req, raw) {
    if (!raw) return {};
    const contentType = String(req?.headers?.['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
    try {
        return JSON.parse(raw);
    } catch {
        if (contentType === 'application/x-www-form-urlencoded' || raw.includes('=')) {
            return parseFormBody(raw);
        }
        return {};
    }
}

function sendWebhookAdapterResponse(res, response) {
    const kind = String(response?.type || 'json').toLowerCase();
    const status = Number(response?.status || 200);
    if (kind === 'text') {
        res.statusCode = status;
        res.setHeader('Content-Type', response?.contentType || 'text/plain; charset=utf-8');
        return res.end(String(response?.body || ''));
    }
    if (kind === 'json') {
        return sendJson(res, status, response?.body || { ok: status < 400 });
    }
    return sendJson(res, status, { ok: status < 400 });
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers:
            'Content-Type, Authorization, X-Signature, X-Webhook-Signature, X-Custom-Orchestrator-Signature, X-Custom-Orchestrator-Timestamp, Stripe-Signature',
    });
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    let rawBody = '';
    let payload = {};
    const providerHint = String(new URL(req.url, 'http://localhost').searchParams.get('provider') || '').trim();

    try {
        rawBody = await readRawBody(req);
        payload = parseRawPayload(req, rawBody);
        const result = await handleUnifiedWebhook({
            headers: req.headers,
            rawBody,
            payload,
            providerHint,
        });
        return sendWebhookAdapterResponse(res, result.response || { type: 'json', status: 200, body: result });
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const adapterName = customOrchestratorProvider.detectAdapterName({
            headers: req.headers,
            rawBody,
            payload,
            providerHint,
        });
        const failureResponse = customOrchestratorProvider.buildWebhookResponse(adapterName, false);
        if (failureResponse) {
            return sendWebhookAdapterResponse(res, failureResponse);
        }
        const status = msg.toLowerCase().includes('signature') ? 401 : 500;
        return sendJson(res, status, { message: msg });
    }
}
