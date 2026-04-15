import { readJsonBody, sendJson, setCors } from '../../lib/http.js';
import { addMinutes, generateCode, hashCode, nowIso } from '../../lib/otp.js';
import { getEmailOtp, upsertEmailOtp } from '../../lib/otpStore.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../../lib/resend.js';

function isValidEmail(email) {
    return typeof email === 'string' && email.includes('@') && email.length <= 254;
}

function getScene(req) {
    const url = new URL(req.url, 'http://localhost');
    return String(url.searchParams.get('scene') || '')
        .trim()
        .toLowerCase();
}

async function sendRegisterCode(email) {
    const otp = await getEmailOtp(email);
    const now = new Date();

    if (otp?.cooldown_until) {
        const cooldownUntil = new Date(otp.cooldown_until);
        if (cooldownUntil > now) {
            const seconds = Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000);
            return { status: 429, payload: { message: 'Too Many Requests', cooldown_seconds: seconds } };
        }
    }

    const sendCount = (otp?.send_count ?? 0) + 1;
    if (sendCount > 10) {
        return { status: 429, payload: { message: 'Too Many Requests' } };
    }

    const code = generateCode();
    const secret = process.env.OTP_SECRET;
    if (!secret) throw new Error('Missing OTP_SECRET');

    await upsertEmailOtp({
        email,
        codeHash: hashCode(code, secret),
        expiresAt: addMinutes(now, 10).toISOString(),
        cooldownUntil: addMinutes(now, 1).toISOString(),
        sendCount,
        lastSentAt: nowIso(),
    });

    await sendVerificationEmail({ to: email, code });

    return { status: 200, payload: { ok: true, cooldown_seconds: 60 } };
}

async function sendResetCode(email) {
    const code = generateCode();
    const secret = process.env.OTP_SECRET;
    if (!secret) throw new Error('Missing OTP_SECRET');

    const now = new Date();
    await upsertEmailOtp({
        email,
        codeHash: hashCode(code, secret),
        expiresAt: addMinutes(now, 10).toISOString(),
        cooldownUntil: addMinutes(now, 1).toISOString(),
        sendCount: 1,
        lastSentAt: nowIso(),
    });

    await sendPasswordResetEmail({ to: email, code });

    return { status: 200, payload: { ok: true, cooldown_seconds: 60 } };
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type',
    });
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const scene = getScene(req);
        if (scene !== 'register' && scene !== 'reset') {
            return sendJson(res, 400, { message: 'Unsupported scene' });
        }

        const body = await readJsonBody(req);
        const email = String(body.email || '')
            .trim()
            .toLowerCase();
        if (!isValidEmail(email)) {
            return sendJson(res, 400, { message: 'Invalid email' });
        }

        const result = scene === 'register' ? await sendRegisterCode(email) : await sendResetCode(email);
        return sendJson(res, result.status, result.payload);
    } catch (error) {
        return sendJson(res, 500, { message: error?.message || 'Internal Server Error' });
    }
}
