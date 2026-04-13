import { getErrorStatus, readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { setMembershipStatus } from '../_lib/billing/service.js';
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
        const userId = String(body.userId || '').trim();
        const action = String(body.action || '').trim().toLowerCase();
        if (!userId || !action) {
            return sendJson(res, 400, { message: 'Missing userId or action' });
        }
        if (action !== 'suspend' && action !== 'resume') {
            return sendJson(res, 400, { message: 'Unsupported action' });
        }

        const result = await setMembershipStatus({
            userId,
            action,
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
        return sendJson(res, getErrorStatus(error, 500), {
            message: error?.message || 'Internal Server Error',
        });
    }
}
