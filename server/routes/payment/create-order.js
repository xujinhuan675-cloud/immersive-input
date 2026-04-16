import { getErrorStatus, readJsonBody, sendJson, setCors } from '../../lib/http.js';
import {
    getRequestClientIp,
    getRequestUserAgent,
    isMobileUserAgent,
    resolveActingUserId,
} from '../../lib/requestAuth.js';
import { createUnifiedOrder } from '../../lib/payment/gateway.js';

export default async function handler(req, res) {
    const cors = setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-Idempotency-Key, X-Admin-Token',
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
        const idempotencyKey = String(
            body.idempotencyKey || req.headers['x-idempotency-key'] || ''
        ).trim();
        const userAgent = getRequestUserAgent(req);

        const result = await createUnifiedOrder({
            userId,
            orderType: body.orderType || 'topup',
            amount: body.amount,
            amountCents: body.amountCents,
            currency: body.currency || '',
            productCode: body.productCode || null,
            description: body.description || null,
            metadata: body.metadata || {},
            paymentProvider: body.paymentProvider || body.provider || '',
            paymentMethod: body.paymentMethod || '',
            requestContext: {
                userAgent,
                clientIp: getRequestClientIp(req),
                isMobile: isMobileUserAgent(userAgent),
            },
            idempotencyKey: idempotencyKey || null,
        });
        return sendJson(res, 200, { ok: true, ...result });
    } catch (e) {
        const msg = String(e?.message || 'Internal Server Error');
        const status = getErrorStatus(
            e,
            msg.includes('Missing userId') || msg.includes('Invalid amount') ? 400 : 500
        );
        return sendJson(res, status, { message: msg });
    }
}
