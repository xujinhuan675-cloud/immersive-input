import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { hashCode } from '../_lib/otp.js';
import { setEmailOtp } from '../_lib/otpStore.js';
import { sendPasswordResetEmail } from '../_lib/resend.js';

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

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const secret = process.env.OTP_SECRET;
        if (!secret) throw new Error('Missing OTP_SECRET');

        const codeHash = hashCode(code, secret);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await setEmailOtp(email, codeHash, expiresAt);
        await sendPasswordResetEmail({ to: email, code });

        return sendJson(res, 200, { ok: true, cooldown_seconds: 60 });
    } catch (e) {
        console.error('Send reset code error:', e);
        return sendJson(res, 500, { message: e?.message || 'Internal Server Error' });
    }
}
