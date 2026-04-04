import { supabaseAdmin } from './supabaseAdmin.js';

export async function upsertEmailOtp({ email, codeHash, expiresAt, cooldownUntil, sendCount, lastSentAt }) {
    const { error } = await supabaseAdmin
        .from('email_otps')
        .upsert(
            {
                email,
                code_hash: codeHash,
                expires_at: expiresAt,
                cooldown_until: cooldownUntil,
                send_count: sendCount,
                last_sent_at: lastSentAt,
            },
            { onConflict: 'email' }
        );

    if (error) throw new Error(error.message);
}

export async function getEmailOtp(email) {
    const { data, error } = await supabaseAdmin
        .from('email_otps')
        .select('email, code_hash, expires_at, cooldown_until, send_count, last_sent_at')
        .eq('email', email)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
}

export async function clearEmailOtp(email) {
    const { error } = await supabaseAdmin.from('email_otps').delete().eq('email', email);
    if (error) throw new Error(error.message);
}
