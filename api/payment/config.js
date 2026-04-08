import { sendJson, setCors } from '../_lib/http.js';
import { getPaymentGatewayStatus } from '../_lib/payment/gateway.js';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET, OPTIONS',
    });
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
        return sendJson(res, 500, { message: e?.message || 'Internal Server Error' });
    }
}
