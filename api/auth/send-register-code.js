import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { generateCode, hashCode, addMinutes, nowIso } from '../_lib/otp.js';
import { getEmailOtp, upsertEmailOtp } from '../_lib/otpStore.js';
import { sendVerificationEmail } from '../_lib/resend.js';

function isValidEmail(email) {
    return typeof email === 'string' && email.includes('@') && email.length <= 254;
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    if (req.method !== 'POST') {
        return sendJson(res, 405, { message: 'Method Not Allowed' });
    }

    try {
        const body = await readJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        if (!isValidEmail(email)) {
            return sendJson(res, 400, { message: 'Invalid email' });
        }

        const otp = await getEmailOtp(email);
        const now = new Date();

        if (otp?.cooldown_until) {
            const cooldownUntil = new Date(otp.cooldown_until);
            if (cooldownUntil > now) {
                const seconds = Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000);
                return sendJson(res, 429, { message: 'Too Many Requests', cooldown_seconds: seconds });
            }
        }

        const sendCount = (otp?.send_count ?? 0) + 1;
        if (sendCount > 10) {
            return sendJson(res, 429, { message: 'Too Many Requests' });
        }

        const code = generateCode();
        const secret = process.env.OTP_SECRET;
        if (!secret) throw new Error('Missing OTP_SECRET');

        const expiresAt = addMinutes(now, 10).toISOString();
        const cooldownUntil = addMinutes(now, 1).toISOString();
        const lastSentAt = nowIso();

        await upsertEmailOtp({
            email,
            codeHash: hashCode(code, secret),
            expiresAt,
            cooldownUntil,
            sendCount,
            lastSentAt,
        });

        await sendVerificationEmail({ to: email, code });

        return sendJson(res, 200, { ok: true, cooldown_seconds: 60 });
    } catch (e) {
        return sendJson(res, 500, { message: e?.message || 'Internal Server Error' });
    }
}
