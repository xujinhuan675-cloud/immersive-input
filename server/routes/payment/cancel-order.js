import { getErrorStatus, readJsonBody, sendJson, setCors } from '../../lib/http.js';
import { cancelUnifiedOrder } from '../../lib/payment/gateway.js';
import { findPaymentOrderById } from '../../lib/payment/store.js';
import { assertOrderAccess, getRequestAuthContext } from '../../lib/requestAuth.js';

function buildActor(context) {
    if (context.role === 'admin') {
        return {
            role: 'admin',
        };
    }
    return {
        role: context.role || 'user',
        userId: context.user?.id || '',
        email: context.user?.email || '',
    };
}

export default async function handler(req, res) {
    const cors = setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-Admin-Token',
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
        const orderId = String(body.orderId || '').trim();
        if (!orderId) {
            return sendJson(res, 400, { message: 'Missing orderId' });
        }

        const context = await getRequestAuthContext(req, { allowAdmin: true });
        const order = await findPaymentOrderById(orderId);
        assertOrderAccess(context, order);

        const result = await cancelUnifiedOrder(orderId, {
            reason: body.reason || '',
            actor: buildActor(context),
        });
        return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
        const message = String(error?.message || 'Internal Server Error');
        const lower = message.toLowerCase();
        const fallback = lower.includes('missing order')
            ? 400
            : lower.includes('not found')
              ? 404
              : lower.includes('forbidden') || lower.includes('authorization')
                ? 403
                : lower.includes('not cancelable')
                  ? 400
                  : 500;
        return sendJson(res, getErrorStatus(error, fallback), { message });
    }
}
