import { getErrorStatus, readJsonBody, sendJson, setCors } from '../../lib/http.js';
import { applyPaymentGrantForOrder, changeMembershipTier, setMembershipStatus } from '../../lib/billing/service.js';
import { refundUnifiedOrder } from '../../lib/payment/gateway.js';
import { findPaymentOrderById } from '../../lib/payment/store.js';
import { requireAdminRequest, resolveAdminTargetUserId } from '../../lib/requestAuth.js';

function getAction(req) {
    const url = new URL(req.url, 'http://localhost');
    const action = String(url.searchParams.get('action') || '')
        .trim()
        .toLowerCase();
    if (action === 'admin-membership') return 'membership';
    if (action === 'membership-tier' || action === 'admin-membership-tier') return 'tier';
    return action;
}

function parseOrderId(req, body) {
    const url = new URL(req.url, 'http://localhost');
    return String(body?.orderId || url.searchParams.get('orderId') || '').trim();
}

function buildActor(context) {
    if (context.role === 'admin') {
        return {
            role: 'admin',
        };
    }
    return {
        role: context.role,
        userId: context.user?.id || '',
        email: context.user?.email || '',
    };
}

async function handleMembershipUpdate(req, context, body) {
    const userId = await resolveAdminTargetUserId(req, body);
    const membershipAction = String(body.action || '')
        .trim()
        .toLowerCase();
    if (!membershipAction) {
        return { status: 400, payload: { message: 'Missing action' } };
    }
    if (membershipAction !== 'suspend' && membershipAction !== 'resume') {
        return { status: 400, payload: { message: 'Unsupported action' } };
    }

    const result = await setMembershipStatus({
        userId,
        action: membershipAction,
        reason: body.reason || '',
        actor: buildActor(context),
    });
    return { status: 200, payload: { ok: true, ...result } };
}

async function handleMembershipTierChange(req, context, body) {
    const userId = await resolveAdminTargetUserId(req, body);
    const targetTier = String(body.targetTier || body.tier || '')
        .trim()
        .toLowerCase();
    if (!targetTier) {
        return { status: 400, payload: { message: 'Missing targetTier' } };
    }

    const rawDurationDays = body.durationDays;
    const hasDurationDays =
        rawDurationDays !== undefined &&
        rawDurationDays !== null &&
        String(rawDurationDays).trim() !== '';
    const durationDays = hasDurationDays ? Number(rawDurationDays) : null;
    if (hasDurationDays && (!Number.isFinite(durationDays) || durationDays < 0)) {
        return { status: 400, payload: { message: 'Invalid durationDays' } };
    }

    const result = await changeMembershipTier({
        userId,
        targetTier,
        durationDays: hasDurationDays ? Math.trunc(durationDays) : undefined,
        reason: body.reason || '',
        actor: buildActor(context),
    });
    return { status: 200, payload: { ok: true, ...result } };
}

async function handleGrant(req, body) {
    const orderId = parseOrderId(req, body);
    if (!orderId) {
        return { status: 400, payload: { message: 'Missing orderId' } };
    }

    const order = await findPaymentOrderById(orderId);
    if (!order) {
        return { status: 404, payload: { message: 'Order not found' } };
    }

    const result = await applyPaymentGrantForOrder(order);
    return { status: 200, payload: { ok: true, order, grant: result } };
}

async function handleRefund(context, body) {
    const orderId = String(body.orderId || '').trim();
    if (!orderId) {
        return { status: 400, payload: { message: 'Missing orderId' } };
    }

    const result = await refundUnifiedOrder(orderId, {
        reason: body.reason || '',
        actor: buildActor(context),
    });
    return { status: 200, payload: { ok: true, ...result } };
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
        const action = getAction(req);
        if (action !== 'membership' && action !== 'tier' && action !== 'grant' && action !== 'refund') {
            return sendJson(res, 400, { message: 'Unsupported action' });
        }

        const context = await requireAdminRequest(req);
        const body = await readJsonBody(req);
        const result =
            action === 'membership'
                ? await handleMembershipUpdate(req, context, body)
                : action === 'tier'
                  ? await handleMembershipTierChange(req, context, body)
                : action === 'grant'
                  ? await handleGrant(req, body)
                  : await handleRefund(context, body);

        return sendJson(res, result.status, result.payload);
    } catch (error) {
        const message = String(error?.message || 'Internal Server Error');
        const lower = message.toLowerCase();
        const fallback = lower.includes('missing order')
            ? 400
            : lower.includes('not found')
              ? 404
              : lower.includes('missing userid or email')
                ? 400
              : lower.includes('unsupported tier') ||
                  lower.includes('targettier') ||
                  lower.includes('durationdays')
                ? 400
              : lower.includes('not refundable')
                ? 400
                : 500;
        return sendJson(res, getErrorStatus(error, fallback), { message });
    }
}
