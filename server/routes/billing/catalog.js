import { getErrorStatus, sendJson, setCors } from '../../lib/http.js';
import { getBillingCatalog } from '../../lib/billing/config.js';
import { getRequestAuthContext } from '../../lib/requestAuth.js';

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
        await getRequestAuthContext(req, { allowAdmin: true });
        return sendJson(res, 200, {
            ok: true,
            catalog: getBillingCatalog(),
        });
    } catch (error) {
        return sendJson(res, getErrorStatus(error, 500), {
            message: error?.message || 'Internal Server Error',
        });
    }
}
