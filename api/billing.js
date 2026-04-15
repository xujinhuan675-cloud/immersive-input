import { sendJson, setCors } from '../server/lib/http.js';

function getRoute(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('route') || '')
        .trim()
        .toLowerCase();
}

const ROUTE_HANDLERS = {
    catalog: () => import('../server/routes/billing/catalog.js'),
    consume: () => import('../server/routes/billing/consume.js'),
    profile: () => import('../server/routes/billing/profile.js'),
};

export default async function handler(req, res) {
    const route = getRoute(req);
    const load = ROUTE_HANDLERS[route];
    if (load) {
        const next = (await load()).default;
        return next(req, res);
    }

    const cors = setCors(req, res, {
        methods: 'GET, POST, OPTIONS',
        headers: 'Content-Type, Authorization, X-Idempotency-Key, X-User-Id, X-Admin-Token',
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    return sendJson(res, 404, { message: 'Unknown billing route' });
}
