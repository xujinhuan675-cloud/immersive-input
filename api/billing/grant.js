import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { applyPaymentGrantForOrder } from '../_lib/billing/service.js';
import { findPaymentOrderById } from '../_lib/payment/store.js';

function parseOrderId(req, body) {
    const url = new URL(req.url, 'http://localhost');
    return String(body?.orderId || url.searchParams.get('orderId') || '').trim();
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
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
        const orderId = parseOrderId(req, body);
        if (!orderId) return sendJson(res, 400, { message: 'Missing orderId' });

        const order = await findPaymentOrderById(orderId);
        if (!order) return sendJson(res, 404, { message: 'Order not found' });

        const result = await applyPaymentGrantForOrder(order);
        return sendJson(res, 200, { ok: true, order, grant: result });
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const lower = msg.toLowerCase();
        const status = lower.includes('missing order') || lower.includes('missing userid') ? 400 : 500;
        return sendJson(res, status, { message: msg });
    }
}
