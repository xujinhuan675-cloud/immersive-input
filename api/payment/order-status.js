import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { queryUnifiedOrder } from '../_lib/payment/gateway.js';

function getOrderIdFromUrl(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('orderId') || url.searchParams.get('order_id') || '').trim();
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET, POST, OPTIONS',
    });
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

        const result = await queryUnifiedOrder(orderId);
        return sendJson(res, 200, { ok: true, ...result });
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const status = msg.includes('not found') ? 404 : 500;
        return sendJson(res, status, { message: msg });
    }
}
