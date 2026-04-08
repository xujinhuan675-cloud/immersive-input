import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { createUnifiedOrder } from '../_lib/payment/gateway.js';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-Idempotency-Key',
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
        const idempotencyKey = String(
            body.idempotencyKey || req.headers['x-idempotency-key'] || ''
        ).trim();

        const result = await createUnifiedOrder({
            userId: body.userId,
            orderType: body.orderType || 'topup',
            amount: body.amount,
            amountCents: body.amountCents,
            currency: body.currency || 'CNY',
            productCode: body.productCode || null,
            description: body.description || null,
            metadata: body.metadata || {},
            idempotencyKey: idempotencyKey || null,
        });
        return sendJson(res, 200, { ok: true, ...result });
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const status = msg.includes('Missing userId') || msg.includes('Invalid amount') ? 400 : 500;
        return sendJson(res, status, { message: msg });
    }
}
