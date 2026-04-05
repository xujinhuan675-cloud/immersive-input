-- 创建邮箱验证码表
create table if not exists public.email_otps (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  cooldown_until timestamptz not null,
  send_count int not null default 0,
  last_sent_at timestamptz not null default now()
);

-- 启用行级安全
alter table public.email_otps enable row level security;

-- 创建索引
create index if not exists idx_email_otps_expires_at on public.email_otps(expires_at);
create index if not exists idx_email_otps_cooldown_until on public.email_otps(cooldown_until);

-- 注释
comment on table public.email_otps is '邮箱验证码存储表';
comment on column public.email_otps.email is '邮箱地址';
comment on column public.email_otps.code_hash is '验证码哈希值';
comment on column public.email_otps.expires_at is '过期时间';
comment on column public.email_otps.cooldown_until is '冷却时间';
comment on column public.email_otps.send_count is '发送次数';
comment on column public.email_otps.last_sent_at is '最后发送时间';
