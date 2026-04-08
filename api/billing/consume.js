import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { consumeBillingUnits } from '../_lib/billing/service.js';

function resolveUserId(req, body) {
    const url = new URL(req.url, 'http://localhost');
    return String(
        body?.userId || req.headers['x-user-id'] || url.searchParams.get('userId') || ''
    ).trim();
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-Idempotency-Key, X-User-Id',
    });
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const body = await readJsonBody(req);
        const userId = resolveUserId(req, body);
        if (!userId) return sendJson(res, 400, { message: 'Missing userId' });

        const result = await consumeBillingUnits({
            userId,
            units: body.units,
            source: body.source || 'api',
            metadata: body.metadata || {},
            idempotencyKey: String(
                body.idempotencyKey || req.headers['x-idempotency-key'] || ''
            ).trim(),
        });
        const status = result.allowed ? 200 : 402;
        return sendJson(res, status, result);
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const status = msg.includes('Missing userId') ? 400 : 500;
        return sendJson(res, status, { message: msg });
    }
}
