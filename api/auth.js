import { sendJson, setCors } from './_lib/http.js';

function getRoute(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('route') || '')
        .trim()
        .toLowerCase();
}

const ROUTE_HANDLERS = {
    'send-code': () => import('../server/routes/auth/send-code.js'),
    register: () => import('../server/routes/auth/register.js'),
    'reset-password': () => import('../server/routes/auth/reset-password.js'),
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
        headers: 'Content-Type',
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    return sendJson(res, 404, { message: 'Unknown auth route' });
}
