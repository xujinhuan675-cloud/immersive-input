import pg from 'pg';

const { Pool } = pg;
let _pool = null;
let _initialized = false;

export function getDbPool() {
    if (_pool) return _pool;
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) {
        throw new Error('Missing SUPABASE_DB_URL');
    }
    _pool = new Pool({ connectionString });
    return _pool;
}

/**
 * 自动初始化数据库表（兜底方案）
 * 如果表不存在，自动创建
 */
async function autoInitDatabase() {
    if (_initialized) return;
    
    try {
        const pool = getDbPool();
        const client = await pool.connect();
        
        try {
            // 创建 email_otps 表
            await client.query(`
                create table if not exists public.email_otps (
                  email text primary key,
                  code_hash text not null,
                  expires_at timestamptz not null,
                  cooldown_until timestamptz not null,
                  send_count int not null default 0,
                  last_sent_at timestamptz not null default now()
                );
            `);
            
            // 启用 RLS
            await client.query('alter table public.email_otps enable row level security;');
            
            // 创建索引
            await client.query('create index if not exists idx_email_otps_expires_at on public.email_otps(expires_at);');
            await client.query('create index if not exists idx_email_otps_cooldown_until on public.email_otps(cooldown_until);');
            
            _initialized = true;
            console.log('[DB] Auto-initialization completed');
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('[DB] Auto-initialization failed:', e.message);
        // 不抛出错误，让业务逻辑继续执行
    }
}

/**
 * 获取数据库客户端（带自动初始化）
 * 推荐使用此方法代替直接使用 getDbPool()
 */
export async function getDbClient() {
    await autoInitDatabase();
    const pool = getDbPool();
    return await pool.connect();
}
