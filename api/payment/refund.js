import { getErrorStatus, readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { refundUnifiedOrder } from '../_lib/payment/gateway.js';
import { requireAdminRequest } from '../_lib/requestAuth.js';

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
        const context = await requireAdminRequest(req);

        const body = await readJsonBody(req);
        const orderId = String(body.orderId || '').trim();
        if (!orderId) {
            return sendJson(res, 400, { message: 'Missing orderId' });
        }

        const result = await refundUnifiedOrder(orderId, {
            reason: body.reason || '',
            actor:
                context.role === 'admin'
                    ? {
                          role: 'admin',
                      }
                    : {
                          role: context.role,
                          userId: context.user?.id || '',
                          email: context.user?.email || '',
                      },
        });
        return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
        const message = String(error?.message || 'Internal Server Error');
        const lower = message.toLowerCase();
        const status = getErrorStatus(
            error,
            lower.includes('missing orderid') || lower.includes('not refundable') ? 400 : 500
        );
        return sendJson(res, status, { message });
    }
}
