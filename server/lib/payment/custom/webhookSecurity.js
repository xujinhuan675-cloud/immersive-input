import crypto from 'node:crypto';

function getHeader(headers, name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return '';
    const value = headers?.[key] ?? headers?.[name];
    if (!value) return '';
    if (Array.isArray(value)) return String(value[0]);
    return String(value);
}

function safeEqual(a, b) {
    const aa = Buffer.from(String(a || ''), 'utf8');
    const bb = Buffer.from(String(b || ''), 'utf8');
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
}

function normalizeSignature(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';

    const chunks = raw.split(',').map((part) => part.trim());
    for (const chunk of chunks) {
        if (!chunk) continue;
        const eq = chunk.indexOf('=');
        if (eq <= 0) continue;
        const key = chunk.slice(0, eq).trim().toLowerCase();
        const value = chunk.slice(eq + 1).trim();
        if (!value) continue;
        if (key === 'v1' || key === 'sha256' || key === 'signature' || key === 'sig') {
            return value;
        }
    }

    const eq = raw.indexOf('=');
    if (eq > 0 && eq < raw.length - 1) {
        return raw.slice(eq + 1).trim();
    }
    return raw;
}

export function verifyWebhookSignature({
    headers = {},
    rawBody = '',
    secret = '',
    signatureHeader = 'x-custom-orchestrator-signature',
    timestampHeader = 'x-custom-orchestrator-timestamp',
    toleranceSeconds = 300,
    enforceTimestamp = true,
} = {}) {
    if (!secret) {
        return { ok: true, skipped: true, reason: 'Webhook secret not configured' };
    }

    const signatureHeaderName = String(signatureHeader || '').trim().toLowerCase();
    const timestampHeaderName = String(timestampHeader || '').trim().toLowerCase();

    const signature = normalizeSignature(getHeader(headers, signatureHeaderName));
    if (!signature) {
        return {
            ok: false,
            reason: `Missing signature header: ${signatureHeaderName}`,
        };
    }

    const timestampRaw = getHeader(headers, timestampHeaderName);
    let timestamp = null;
    const tolerance = Number.isFinite(Number(toleranceSeconds))
        ? Math.max(1, Math.round(Number(toleranceSeconds)))
        : 300;

    if (enforceTimestamp || timestampRaw) {
        if (!timestampRaw) {
            return {
                ok: false,
                signature,
                reason: `Missing timestamp header: ${timestampHeaderName}`,
            };
        }
        const parsed = Number(timestampRaw);
        if (!Number.isFinite(parsed)) {
            return {
                ok: false,
                signature,
                reason: `Invalid timestamp header: ${timestampHeaderName}`,
            };
        }

        timestamp = Math.trunc(parsed);
        const now = Math.floor(Date.now() / 1000);
        const skewSeconds = Math.abs(now - timestamp);
        if (skewSeconds > tolerance) {
            return {
                ok: false,
                signature,
                timestamp,
                reason: `Webhook timestamp outside tolerance (${tolerance}s)`,
            };
        }
    }

    const body = String(rawBody || '');
    const signPayload = timestamp === null ? body : `${timestamp}.${body}`;
    const expected = crypto.createHmac('sha256', String(secret)).update(signPayload).digest('hex');
    const ok = safeEqual(signature.toLowerCase(), expected.toLowerCase());

    return {
        ok,
        signature,
        expected,
        timestamp,
        reason: ok ? '' : 'Invalid signature',
    };
}

export function buildDeterministicWebhookEventId({
    provider = 'custom_orchestrator',
    rawBody = '',
    signature = '',
} = {}) {
    const stableProvider = String(provider || 'custom_orchestrator').trim().toLowerCase();
    const base = `${stableProvider}|${String(signature || '').trim()}|${String(rawBody || '')}`;
    const digest = crypto.createHash('sha256').update(base).digest('hex');
    return `${stableProvider}_evt_${digest.slice(0, 40)}`;
}
