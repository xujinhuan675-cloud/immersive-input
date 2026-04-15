import { getErrorStatus, readJsonBody, sendJson, setCors } from '../../lib/http.js';
import { assertOrderAccess, getRequestAuthContext } from '../../lib/requestAuth.js';
import { queryUnifiedOrder } from '../../lib/payment/gateway.js';
import { findPaymentOrderById } from '../../lib/payment/store.js';

function getOrderIdFromUrl(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('orderId') || url.searchParams.get('order_id') || '').trim();
}

export default async function handler(req, res) {
    const cors = setCors(req, res, {
        methods: 'GET, POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-Admin-Token',
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
        const orderId =
            req.method === 'GET'
                ? getOrderIdFromUrl(req)
                : String((await readJsonBody(req)).orderId || '').trim();
        if (!orderId) return sendJson(res, 400, { message: 'Missing orderId' });

        const context = await getRequestAuthContext(req, { allowAdmin: true });
        const order = await findPaymentOrderById(orderId);
        assertOrderAccess(context, order);

        const result = await queryUnifiedOrder(orderId);
        return sendJson(res, 200, { ok: true, ...result });
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const status = getErrorStatus(e, msg.includes('not found') ? 404 : 500);
        return sendJson(res, status, { message: msg });
    }
}
