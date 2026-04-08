import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { getBillingProfileSummary } from '../_lib/billing/service.js';

function getUserIdFromReq(req, body = null) {
    const url = new URL(req.url, 'http://localhost');
    return String(
        body?.userId || url.searchParams.get('userId') || req.headers['x-user-id'] || ''
    ).trim();
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET, POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-User-Id',
    });
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const body = req.method === 'POST' ? await readJsonBody(req) : null;
        const userId = getUserIdFromReq(req, body);
        if (!userId) return sendJson(res, 400, { message: 'Missing userId' });

        const profile = await getBillingProfileSummary(userId);
        return sendJson(res, 200, { ok: true, profile });
    } catch (e) {
        return sendJson(res, 500, { message: e?.message || 'Internal Server Error' });
    }
}
