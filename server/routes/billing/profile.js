import { getErrorStatus, readJsonBody, sendJson, setCors } from '../../lib/http.js';
import { resolveActingUserId } from '../../lib/requestAuth.js';
import { getBillingProfileSummary } from '../../lib/billing/service.js';

export default async function handler(req, res) {
    const cors = setCors(req, res, {
        methods: 'GET, POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-User-Id, X-Admin-Token',
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const body = req.method === 'POST' ? await readJsonBody(req) : null;
        const { userId } = await resolveActingUserId(req, body, { allowAdmin: true });

        const profile = await getBillingProfileSummary(userId);
        return sendJson(res, 200, { ok: true, profile });
    } catch (e) {
        return sendJson(res, getErrorStatus(e, 500), {
            message: e?.message || 'Internal Server Error',
        });
    }
}
