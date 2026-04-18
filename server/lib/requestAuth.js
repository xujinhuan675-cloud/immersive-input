import crypto from 'node:crypto';

import { createHttpError, getHeader } from './http.js';
import { supabaseAdmin } from './supabaseAdmin.js';

function trim(value) {
    return String(value || '').trim();
}

function isEmailLike(value) {
    const normalized = trim(value);
    return normalized.includes('@') && !normalized.includes(' ');
}

function safeEqual(left, right) {
    const a = Buffer.from(trim(left), 'utf8');
    const b = Buffer.from(trim(right), 'utf8');
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function getAdminTokens() {
    return [process.env.PAYMENT_ADMIN_TOKEN, process.env.INIT_DB_TOKEN]
        .map((value) => trim(value))
        .filter(Boolean);
}

function getBearerToken(req) {
    const authorization = getHeader(req?.headers, 'authorization');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return trim(match?.[1]);
}

function getAdminToken(req) {
    return (
        getHeader(req?.headers, 'x-admin-token') ||
        getHeader(req?.headers, 'x-internal-token') ||
        getHeader(req?.headers, 'x-payment-admin-token')
    );
}

export function getRequestClientIp(req) {
    const forwardedFor = getHeader(req?.headers, 'x-forwarded-for');
    if (forwardedFor) {
        return trim(forwardedFor.split(',')[0]);
    }
    return (
        getHeader(req?.headers, 'cf-connecting-ip') ||
        getHeader(req?.headers, 'x-real-ip') ||
        ''
    );
}

export function getRequestUserAgent(req) {
    return getHeader(req?.headers, 'user-agent');
}

export function isMobileUserAgent(userAgent) {
    return /AlipayClient|MicroMessenger|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
        trim(userAgent)
    );
}

export async function getRequestAuthContext(req, { allowAdmin = false } = {}) {
    if (allowAdmin) {
        const adminToken = getAdminToken(req);
        const matched = getAdminTokens().find((expected) => safeEqual(expected, adminToken));
        if (matched) {
            return {
                role: 'admin',
                user: null,
                token: '',
            };
        }
    }

    const accessToken = getBearerToken(req);
    if (!accessToken) {
        throw createHttpError(401, 'Missing Authorization bearer token');
    }

    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
        throw createHttpError(401, 'Invalid or expired session');
    }

    return {
        role: 'user',
        token: accessToken,
        user: {
            id: trim(data.user.id),
            email: trim(data.user.email),
            raw: data.user,
        },
    };
}

export async function requireAdminRequest(req) {
    const context = await getRequestAuthContext(req, { allowAdmin: true });
    if (context.role !== 'admin') {
        throw createHttpError(403, 'Admin token required');
    }
    return context;
}

async function findUserIdByEmail(email) {
    const normalizedEmail = trim(email).toLowerCase();
    if (!normalizedEmail) return '';

    let page = 1;
    const perPage = 200;
    while (page <= 50) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) {
            throw createHttpError(500, error.message || 'Failed to lookup user by email');
        }
        const users = Array.isArray(data?.users) ? data.users : [];
        const matchedUser = users.find((user) => trim(user?.email).toLowerCase() === normalizedEmail);
        if (matchedUser?.id) {
            return trim(matchedUser.id);
        }
        if (users.length < perPage) {
            break;
        }
        page += 1;
    }

    return '';
}

export async function resolveAdminTargetUserId(req, body = null) {
    const url = new URL(req.url, 'http://localhost');
    const requestedUserId = trim(
        body?.userId || url.searchParams.get('userId') || getHeader(req?.headers, 'x-user-id')
    );
    const requestedEmail = trim(
        body?.userEmail || body?.email || url.searchParams.get('email') || getHeader(req?.headers, 'x-user-email')
    );
    const candidateEmail = requestedEmail || (isEmailLike(requestedUserId) ? requestedUserId : '');

    if (candidateEmail) {
        const resolvedUserId = await findUserIdByEmail(candidateEmail);
        if (!resolvedUserId) {
            throw createHttpError(404, 'User not found');
        }
        return resolvedUserId;
    }

    if (!requestedUserId) {
        throw createHttpError(400, 'Missing userId or email');
    }

    return requestedUserId;
}

export async function resolveActingUserId(req, body = null, { allowAdmin = false } = {}) {
    const context = await getRequestAuthContext(req, { allowAdmin });
    if (context.role === 'admin') {
        const requestedUserId = await resolveAdminTargetUserId(req, body);
        return {
            context,
            userId: requestedUserId,
        };
    }

    return {
        context,
        userId: context.user.id,
    };
}

export function assertOrderAccess(context, order) {
    if (!order?.id) {
        throw createHttpError(404, 'Order not found');
    }
    if (context?.role === 'admin') return;
    if (!context?.user?.id || trim(order.userId) !== trim(context.user.id)) {
        throw createHttpError(403, 'Forbidden');
    }
}
