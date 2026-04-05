#!/usr/bin/env node
/**
 * 本地数据库初始化脚本
 * 直接连接 Supabase 数据库创建表
 * 
 * 使用方法:
 *   node scripts/init-database-local.js
 */

import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env 文件
config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

async function initDatabase() {
    const dbUrl = process.env.SUPABASE_DB_URL;
    
    if (!dbUrl) {
        console.error('❌ 错误: 未找到 SUPABASE_DB_URL');
        console.error('请在 .env 文件中设置 SUPABASE_DB_URL');
        process.exit(1);
    }

    console.log('🔧 正在连接数据库...');
    
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('✅ 数据库连接成功');

        console.log('📊 正在创建 email_otps 表...');
        
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

        console.log('🔒 正在启用行级安全...');
        await client.query('alter table public.email_otps enable row level security;');

        console.log('📇 正在创建索引...');
        await client.query('create index if not exists idx_email_otps_expires_at on public.email_otps(expires_at);');
        await client.query('create index if not exists idx_email_otps_cooldown_until on public.email_otps(cooldown_until);');

        console.log('💬 正在添加注释...');
        await client.query("comment on table public.email_otps is '邮箱验证码存储表';");
        await client.query("comment on column public.email_otps.email is '邮箱地址';");
        await client.query("comment on column public.email_otps.code_hash is '验证码哈希值';");
        await client.query("comment on column public.email_otps.expires_at is '过期时间';");
        await client.query("comment on column public.email_otps.cooldown_until is '冷却时间';");
        await client.query("comment on column public.email_otps.send_count is '发送次数';");
        await client.query("comment on column public.email_otps.last_sent_at is '最后发送时间';");

        client.release();
        
        console.log('\n✅ 数据库初始化完成！');
        console.log('\n📋 已创建的表:');
        console.log('  - public.email_otps');
        console.log('\n📇 已创建的索引:');
        console.log('  - idx_email_otps_expires_at');
        console.log('  - idx_email_otps_cooldown_until');
        
    } catch (error) {
        console.error('\n❌ 初始化失败:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

initDatabase();
