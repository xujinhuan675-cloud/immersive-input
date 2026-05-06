import { sendJson, setCors } from '../server/lib/http.js';
import { handleLegacyRouteRetired, shouldPassthroughLegacyRoute } from '../server/lib/legacyRoute.js';

function getRoute(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('route') || '')
        .trim()
        .toLowerCase();
}

const ROUTE_HANDLERS = {
    'cancel-order': () => import('../server/routes/payment/cancel-order.js'),
    config: () => import('../server/routes/payment/config.js'),
    'create-order': () => import('../server/routes/payment/create-order.js'),
    'order-status': () => import('../server/routes/payment/order-status.js'),
    webhook: () => import('../server/routes/payment/webhook.js'),
};

export default async function handler(req, res) {
    const route = getRoute(req);
    if (!shouldPassthroughLegacyRoute('payment')) {
        return handleLegacyRouteRetired(req, res, {
            scope: 'payment',
            route,
            methods: 'GET, POST, OPTIONS',
            headers:
                'Content-Type, Authorization, X-Admin-Token, X-Idempotency-Key, X-User-Id, X-Signature, X-Webhook-Signature, X-Custom-Orchestrator-Signature, X-Custom-Orchestrator-Timestamp, Stripe-Signature',
            message:
                route === 'webhook'
                    ? 'Legacy payment webhook route has been retired. Point payment provider callbacks to FlowGuideAI.'
                    : 'Legacy payment routes have been retired. Create and query payment orders through FlowGuideAI.',
        });
    }

    const load = ROUTE_HANDLERS[route];
    if (load) {
        const next = (await load()).default;
        return next(req, res);
    }

    const cors = setCors(req, res, {
        methods: 'GET, POST, OPTIONS',
        headers:
            'Content-Type, Authorization, X-Admin-Token, X-Idempotency-Key, X-User-Id, X-Signature, X-Webhook-Signature, X-Custom-Orchestrator-Signature, X-Custom-Orchestrator-Timestamp, Stripe-Signature',
    });
    if (!cors.originAllowed) {
        return sendJson(res, 403, { message: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    return sendJson(res, 404, { message: 'Unknown payment route' });
}
