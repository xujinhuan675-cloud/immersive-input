import { sendJson, setCors } from '../server/lib/http.js';
import { handleLegacyRouteRetired, shouldPassthroughLegacyRoute } from '../server/lib/legacyRoute.js';

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
    if (!shouldPassthroughLegacyRoute('admin')) {
        return handleLegacyRouteRetired(req, res, {
            scope: 'admin',
            route,
            methods: 'POST, OPTIONS',
            headers: 'Content-Type, Authorization, X-Admin-Token',
            message: 'Legacy admin routes have been retired on this product shell.',
        });
    }

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
