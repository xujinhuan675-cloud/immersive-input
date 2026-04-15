import { sendJson, setCors } from './_lib/http.js';

function getRoute(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('route') || '')
        .trim()
        .toLowerCase();
}

const ROUTE_HANDLERS = {
    billing: () => import('../server/routes/admin/billing.js'),
    'init-db': () => import('../server/routes/admin/init-db.js'),
};

export default async function handler(req, res) {
    const route = getRoute(req);
    const load = ROUTE_HANDLERS[route];
    if (load) {
        const next = (await load()).default;
        return next(req, res);
    }

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
    return sendJson(res, 404, { message: 'Unknown admin route' });
}
