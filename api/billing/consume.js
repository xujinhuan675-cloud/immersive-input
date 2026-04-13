import { getErrorStatus, readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { resolveActingUserId } from '../_lib/requestAuth.js';
import { consumeBillingUnits } from '../_lib/billing/service.js';

export default async function handler(req, res) {
    const cors = setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-Idempotency-Key, X-User-Id, X-Admin-Token',
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const body = await readJsonBody(req);
        const { userId } = await resolveActingUserId(req, body, { allowAdmin: true });

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
        const status = getErrorStatus(e, msg.includes('Missing userId') ? 400 : 500);
        return sendJson(res, status, { message: msg });
    }
}
