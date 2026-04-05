import { supabaseAdmin } from './supabaseAdmin.js';
import { getDbClient } from './db.js';

let _ensuredInit = false;

/**
 * 确保数据库表已初始化（兜底方案）
 */
async function ensureTablesExist() {
    if (_ensuredInit) return;
    
    try {
        // 尝试查询表，如果失败则触发自动初始化
        await supabaseAdmin.from('email_otps').select('email').limit(1);
        _ensuredInit = true;
    } catch (error) {
        // 表可能不存在，触发自动初始化
        console.log('[OTP] Triggering auto-initialization...');
        const client = await getDbClient();
        client.release();
        _ensuredInit = true;
    }
}

export async function upsertEmailOtp({ email, codeHash, expiresAt, cooldownUntil, sendCount, lastSentAt }) {
    await ensureTablesExist();
    
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
    await ensureTablesExist();
    
    const { data, error } = await supabaseAdmin
        .from('email_otps')
        .select('email, code_hash, expires_at, cooldown_until, send_count, last_sent_at')
        .eq('email', email)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
}

export async function clearEmailOtp(email) {
    await ensureTablesExist();
    
    const { error } = await supabaseAdmin.from('email_otps').delete().eq('email', email);
    if (error) throw new Error(error.message);
}
