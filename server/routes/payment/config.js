import { getErrorStatus, sendJson, setCors } from '../../../api/_lib/http.js';
import { getPaymentGatewayStatus } from '../../../api/_lib/payment/gateway.js';

export default async function handler(req, res) {
    const cors = setCors(req, res, {
        methods: 'GET, OPTIONS',
        headers: 'Content-Type, Authorization, X-Admin-Token',
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    if (req.method !== 'GET') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const status = getPaymentGatewayStatus();
        return sendJson(res, 200, { ok: true, ...status });
    } catch (e) {
        return sendJson(res, getErrorStatus(e, 500), { message: e?.message || 'Internal Server Error' });
    }
}
