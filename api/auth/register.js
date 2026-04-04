import { readJsonBody, sendJson, setCors } from '../_lib/http.js';
import { hashCode } from '../_lib/otp.js';
import { clearEmailOtp, getEmailOtp } from '../_lib/otpStore.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

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
        const password = String(body.password || '');
        const username = String(body.username || '').trim();
        const code = String(body.code || '').trim();

        if (!username) return sendJson(res, 400, { message: 'Missing username' });
        if (!isValidEmail(email)) return sendJson(res, 400, { message: 'Invalid email' });
        if (!password || password.length < 8) return sendJson(res, 400, { message: 'Invalid password' });
        if (!code || code.length < 4) return sendJson(res, 400, { message: 'Invalid code' });

        const otp = await getEmailOtp(email);
        if (!otp) return sendJson(res, 400, { message: 'Code not found' });

        const now = new Date();
        if (otp.expires_at && new Date(otp.expires_at) <= now) {
            return sendJson(res, 400, { message: 'Code expired' });
        }

        const secret = process.env.OTP_SECRET;
        if (!secret) throw new Error('Missing OTP_SECRET');

        const expected = otp.code_hash;
        const actual = hashCode(code, secret);
        if (!expected || expected !== actual) {
            return sendJson(res, 400, { message: 'Invalid code' });
        }

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                display_name: username,
            },
        });

        if (error) {
            return sendJson(res, 400, { message: error.message });
        }

        await clearEmailOtp(email);

        return sendJson(res, 200, { ok: true, user_id: data.user?.id });
    } catch (e) {
        return sendJson(res, 500, { message: e?.message || 'Internal Server Error' });
    }
}
